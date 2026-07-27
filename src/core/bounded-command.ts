import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const SHELL_EXECUTABLES = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
]);

export class BoundedCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoundedCommandError";
  }
}

export type BoundedCommandSpec = {
  id: string;
  executable: string;
  arguments: string[];
  relativeWorkingDirectory: string;
  timeoutMs: number;
  maxOutputBytes: number;
};

export type BoundedOutputEvidence = {
  digest: string;
  byteLength: number;
  preview: string;
  previewTruncated: boolean;
};

export type BoundedCommandResult = {
  status: "passed" | "failed" | "timed-out" | "unavailable";
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: BoundedOutputEvidence;
  stderr: BoundedOutputEvidence;
};

function requireOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) throw new BoundedCommandError(`${label} has unknown field ${unknown[0]}`);
}

function boundedInteger(
  value: unknown,
  fallback: number,
  maximum: number,
  label: string
): number {
  const resolved = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(resolved) || resolved <= 0 || resolved > maximum) {
    throw new BoundedCommandError(`${label} must be an integer between 1 and ${maximum}`);
  }
  return resolved;
}

function normalizeRelativeDirectory(value: unknown, label: string): string {
  const directory = typeof value === "string" ? value.trim() || "." : ".";
  if (
    isAbsolute(directory) ||
    directory.includes("\\") ||
    directory.includes("\0") ||
    directory.split("/").some((part) => part === "..")
  ) {
    throw new BoundedCommandError(`${label} must stay inside the repository`);
  }
  return directory.replace(/^\.\//, "").replace(/\/+$/, "") || ".";
}

export function parseBoundedCommand(value: unknown, label = "command"): BoundedCommandSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BoundedCommandError(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  requireOnlyKeys(
    record,
    [
      "id",
      "executable",
      "arguments",
      "relativeWorkingDirectory",
      "timeoutMs",
      "maxOutputBytes",
    ],
    label
  );
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(id)) {
    throw new BoundedCommandError(`${label}.id must be a portable 2-64 character identifier`);
  }
  const executable = typeof record.executable === "string" ? record.executable.trim() : "";
  if (!executable || executable.includes("\0")) {
    throw new BoundedCommandError(`${label}.executable is required`);
  }
  if (SHELL_EXECUTABLES.has(basename(executable).toLowerCase())) {
    throw new BoundedCommandError(`${label}.executable may not invoke a command shell`);
  }
  if (!Array.isArray(record.arguments) || record.arguments.some((item) => typeof item !== "string")) {
    throw new BoundedCommandError(`${label}.arguments must be an array of strings`);
  }
  if (
    record.arguments.length > 128 ||
    record.arguments.some((item) => item.length > 4_000 || item.includes("\0"))
  ) {
    throw new BoundedCommandError(`${label}.arguments exceeds the bounded command limit`);
  }
  return {
    id,
    executable,
    arguments: [...record.arguments] as string[],
    relativeWorkingDirectory: normalizeRelativeDirectory(
      record.relativeWorkingDirectory,
      `${label}.relativeWorkingDirectory`
    ),
    timeoutMs: boundedInteger(
      record.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
      `${label}.timeoutMs`
    ),
    maxOutputBytes: boundedInteger(
      record.maxOutputBytes,
      DEFAULT_MAX_OUTPUT_BYTES,
      MAX_OUTPUT_BYTES,
      `${label}.maxOutputBytes`
    ),
  };
}

function safeEnvironment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { CI: "true", NO_COLOR: "1" };
  for (const key of ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "TMPDIR", "TMP", "TEMP"]) {
    if (process.env[key] !== undefined) result[key] = process.env[key];
  }
  return result;
}

function redact(value: string): string {
  return value
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/\b(?:gh[pousr]_|sk-)[A-Za-z0-9_-]*/g, "[REDACTED]")
    .replace(
      /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY))\s*([=:])\s*([^\s]+)/g,
      "$1$2[REDACTED]"
    );
}

function outputCollector(previewLimit: number) {
  const hash = createHash("sha256");
  const previewChunks: Buffer[] = [];
  let byteLength = 0;
  let previewBytes = 0;
  let truncated = false;
  return {
    append(chunk: Buffer | string) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      hash.update(buffer);
      byteLength += buffer.byteLength;
      const remaining = Math.max(0, previewLimit - previewBytes);
      if (remaining > 0) {
        const next = buffer.subarray(0, remaining);
        previewChunks.push(next);
        previewBytes += next.byteLength;
      }
      if (buffer.byteLength > remaining) truncated = true;
    },
    finish(): BoundedOutputEvidence {
      return {
        digest: hash.digest("hex"),
        byteLength,
        preview: redact(Buffer.concat(previewChunks).toString("utf8")),
        previewTruncated: truncated,
      };
    },
  };
}

async function containedWorkingDirectory(
  repositoryRoot: string,
  relativeWorkingDirectory: string
): Promise<string> {
  const root = await realpath(resolve(repositoryRoot));
  const requested = resolve(root, relativeWorkingDirectory);
  let actual: string;
  try {
    actual = await realpath(requested);
  } catch (error) {
    throw new BoundedCommandError(
      `command working directory is unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  const offset = relative(root, actual);
  if (offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset)) {
    throw new BoundedCommandError("command working directory resolves outside the repository");
  }
  return actual;
}

function terminateProcess(child: ReturnType<typeof spawn>, detached: boolean): void {
  if (!child.pid) return;
  try {
    if (process.platform !== "win32" && detached) process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch {
    return;
  }
  const forceTimer = setTimeout(() => {
    try {
      if (process.platform !== "win32" && detached) process.kill(-child.pid!, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      // The process already exited.
    }
  }, 250);
  forceTimer.unref();
}

export async function runBoundedCommand(
  repositoryRoot: string,
  spec: BoundedCommandSpec
): Promise<BoundedCommandResult> {
  const cwd = await containedWorkingDirectory(repositoryRoot, spec.relativeWorkingDirectory);
  const stdout = outputCollector(spec.maxOutputBytes);
  const stderr = outputCollector(spec.maxOutputBytes);
  const detached = process.platform !== "win32";

  return await new Promise<BoundedCommandResult>((resolveResult) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(spec.executable, spec.arguments, {
        cwd,
        env: safeEnvironment(),
        shell: false,
        detached,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      stderr.append(error instanceof Error ? error.message : String(error));
      resolveResult({
        status: "unavailable",
        exitCode: null,
        signal: null,
        stdout: stdout.finish(),
        stderr: stderr.finish(),
      });
      return;
    }

    let settled = false;
    let timedOut = false;
    const finish = (
      status: BoundedCommandResult["status"],
      exitCode: number | null,
      signal: NodeJS.Signals | null
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({
        status,
        exitCode,
        signal,
        stdout: stdout.finish(),
        stderr: stderr.finish(),
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcess(child, detached);
    }, spec.timeoutMs);

    child.stdout?.on("data", (chunk) => stdout.append(chunk));
    child.stderr?.on("data", (chunk) => stderr.append(chunk));
    child.on("error", (error) => {
      stderr.append(error.message);
      finish("unavailable", null, null);
    });
    child.on("close", (exitCode, signal) => {
      finish(timedOut ? "timed-out" : exitCode === 0 ? "passed" : "failed", exitCode, signal);
    });
  });
}
