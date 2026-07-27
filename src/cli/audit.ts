import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { AuditLog, createAuditLog, verifyLogIntegrity } from "../core/audit-log.js";
import { resolveDefaultStateRoot } from "../store/runtime-paths.js";
import type { CliOutput } from "./index.js";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";

function bold(text: string): string {
  if (process.env["NO_COLOR"] || !process.stdout.isTTY) return text;
  return `\x1b[1m${text}\x1b[0m`;
}
function green(text: string): string {
  if (process.env["NO_COLOR"] || !process.stdout.isTTY) return text;
  return `\x1b[32m${text}\x1b[0m`;
}
function red(text: string): string {
  if (process.env["NO_COLOR"] || !process.stdout.isTTY) return text;
  return `\x1b[31m${text}\x1b[0m`;
}

async function getLogPath(): Promise<string> {
  const storeRoot = resolveDefaultStateRoot();
  return join(storeRoot, "audit", "log.json");
}

async function loadLog(): Promise<AuditLog> {
  const path = await getLogPath();
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content) as AuditLog;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return createAuditLog(randomUUID());
    }
    throw err;
  }
}

export async function runAudit(args: string[], io: CliOutput): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      out: { type: "string" },
      json: { type: "boolean" },
    },
    allowPositionals: true,
  });

  const subCommand = positionals[0];

  if (subCommand === "show") {
    const log = await loadLog();
    if (values.json) {
      io.stdout(JSON.stringify(log, null, 2) + "\n");
    } else {
      io.stdout(`${bold("Audit Log:")} ${log.logId}\n`);
      io.stdout(`Merkle Root: ${log.merkleRoot}\n`);
      io.stdout(`Entries: ${log.entries.length}\n`);
      for (const entry of log.entries) {
        io.stdout(`  [${entry.sequenceNumber}] ${entry.timestamp} | ${entry.eventType} | ${entry.entryDigest}\n`);
      }
    }
    return 0;
  }

  if (subCommand === "verify") {
    const log = await loadLog();
    const isValid = verifyLogIntegrity(log);
    
    if (values.json) {
      io.stdout(JSON.stringify({ isValid, entriesCount: log.entries.length }, null, 2) + "\n");
    } else {
      if (isValid) {
        io.stdout(`${green("Success:")} Audit log verified. Merkle Root: ${log.merkleRoot}\n`);
      } else {
        io.stderr(`${red("Error:")} Audit log integrity verification failed!\n`);
      }
    }
    return isValid ? 0 : 1;
  }

  if (subCommand === "export") {
    if (!values.out) {
      io.stderr(`${red("Error:")} Missing --out argument.\n`);
      return 1;
    }
    const log = await loadLog();
    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, JSON.stringify(log, null, 2), "utf8");
    if (values.json) {
      io.stdout(JSON.stringify({ exportedPath: values.out }, null, 2) + "\n");
    } else {
      io.stdout(`${green("Success:")} Audit log exported to ${values.out}\n`);
    }
    return 0;
  }

  io.stderr(`${red("Error:")} Unknown audit subcommand: ${subCommand || "none"}\n`);
  return 1;
}
