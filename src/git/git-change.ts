import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const GIT_MAX_BUFFER = 64 * 1024 * 1024;

export class GitChangeError extends Error {
  readonly exitCode: number | null;

  constructor(message: string, exitCode: number | null = null) {
    super(message);
    this.name = "GitChangeError";
    this.exitCode = exitCode;
  }
}

function safeEnvironment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
    NO_COLOR: "1",
  };
  for (const key of ["PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "TMPDIR", "TMP", "TEMP"]) {
    if (process.env[key] !== undefined) result[key] = process.env[key];
  }
  return result;
}

export async function runGitBuffer(repositoryRoot: string, args: string[]): Promise<Buffer> {
  return await new Promise<Buffer>((resolveResult, rejectResult) => {
    execFile(
      "git",
      ["-C", repositoryRoot, "-c", "core.fsmonitor=false", ...args],
      {
        env: safeEnvironment(),
        encoding: "buffer",
        maxBuffer: GIT_MAX_BUFFER,
        timeout: 60_000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const message = Buffer.isBuffer(stderr)
            ? stderr.toString("utf8").trim()
            : String(stderr ?? "").trim();
          const code =
            typeof error === "object" && error !== null && "code" in error
              ? Number((error as NodeJS.ErrnoException).code)
              : null;
          rejectResult(new GitChangeError(message || error.message, Number.isFinite(code) ? code : null));
          return;
        }
        resolveResult(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
      }
    );
  });
}

export async function runGitText(repositoryRoot: string, args: string[]): Promise<string> {
  return (await runGitBuffer(repositoryRoot, args)).toString("utf8").trim();
}

export async function canonicalGitRoot(projectRoot: string): Promise<string> {
  const requested = await realpath(resolve(projectRoot));
  const reported = await runGitText(requested, ["rev-parse", "--show-toplevel"]);
  const actual = await realpath(reported);
  if (requested !== actual) {
    throw new GitChangeError(`project root must equal the Git worktree root: ${actual}`);
  }
  return actual;
}

export type GitObjectFormat = "sha1" | "sha256";

export async function gitObjectFormat(repositoryRoot: string): Promise<GitObjectFormat> {
  const format = await runGitText(repositoryRoot, ["rev-parse", "--show-object-format"]);
  if (format !== "sha1" && format !== "sha256") {
    throw new GitChangeError(`unsupported Git object format: ${format}`);
  }
  return format;
}

export function isFullObjectId(value: string, format: GitObjectFormat): boolean {
  return new RegExp(`^[a-f0-9]{${format === "sha1" ? 40 : 64}}$`).test(value);
}

export async function resolveCommit(
  repositoryRoot: string,
  ref: string,
  format?: GitObjectFormat
): Promise<string> {
  const actualFormat = format ?? (await gitObjectFormat(repositoryRoot));
  const normalized = ref.trim();
  if (!normalized || normalized.includes("\0")) throw new GitChangeError("Git ref is required");
  const commit = await runGitText(repositoryRoot, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${normalized}^{commit}`,
  ]);
  if (!isFullObjectId(commit, actualFormat)) {
    throw new GitChangeError(`Git did not resolve ${ref} to a full ${actualFormat} commit ID`);
  }
  return commit;
}

export async function resolveTree(
  repositoryRoot: string,
  commit: string,
  format?: GitObjectFormat
): Promise<string> {
  const actualFormat = format ?? (await gitObjectFormat(repositoryRoot));
  const tree = await runGitText(repositoryRoot, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${commit}^{tree}`,
  ]);
  if (!isFullObjectId(tree, actualFormat)) {
    throw new GitChangeError(`Git did not resolve ${commit} to a full ${actualFormat} tree ID`);
  }
  return tree;
}

function portablePath(value: string): string {
  return value.split(sep).join("/");
}

export async function checkoutStatus(
  repositoryRoot: string,
  ignoredUntrackedRoot?: string
): Promise<string[]> {
  const output = await runGitBuffer(repositoryRoot, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--no-renames",
  ]);
  const entries = output
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  if (!ignoredUntrackedRoot) return entries;

  const stateRoot = resolve(ignoredUntrackedRoot);
  const offset = relative(repositoryRoot, stateRoot);
  if (offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset)) return entries;
  const prefix = portablePath(offset).replace(/\/+$/, "");
  return entries.filter((entry) => {
    if (!entry.startsWith("?? ")) return true;
    const path = entry.slice(3);
    return path !== prefix && !path.startsWith(`${prefix}/`);
  });
}
