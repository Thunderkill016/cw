import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseTaskContract } from "../core/contract.js";
import { verificationEvidenceDigest } from "../core/verification.js";
import { canonicalJsonDocument } from "../core/integrity.js";
import type { VerificationEvidenceV1 } from "../core/verification.js";
import type { CliOutput } from "./index.js";
import { bold, green, red, yellow } from "./index.js";

const MAX_INPUT_BYTES = 10 * 1024 * 1024;

async function readJson(path: string): Promise<unknown> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`not a regular file: ${path}`);
  if (info.size > MAX_INPUT_BYTES) throw new Error(`file exceeds ${MAX_INPUT_BYTES} bytes: ${path}`);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}


function validateEvidenceForShow(value: unknown): VerificationEvidenceV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("verification evidence must be an object");
  }
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    record.recordType !== "verification-evidence" ||
    typeof record.evidenceDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.evidenceDigest)
  ) {
    throw new Error("unsupported verification evidence record");
  }
  if (verificationEvidenceDigest(record as VerificationEvidenceV1) !== record.evidenceDigest) {
    throw new Error("verification evidence digest mismatch");
  }
  return record as VerificationEvidenceV1;
}

export async function runShow(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
      file: { type: "string" },
    },
    strict: true,
  });

  const jsonMode = options.json ?? false;

  const filePath = options.file;
  if (!filePath) throw new Error("--file <contract-or-evidence.json> is required");

  const value = await readJson(resolve(filePath));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("record must be an object");
  }

  const recordType = (value as Record<string, unknown>).recordType;

  if (recordType === "task-contract") {
    const contract = parseTaskContract(value);
    if (jsonMode) {
      io.stdout(canonicalJsonDocument(contract));
    } else {
      io.stdout(`${bold("Task Contract")}\n`);
      io.stdout(`  ID: ${contract.taskId}\n`);
      io.stdout(`  Objective: ${contract.objective}\n`);
      io.stdout(`  Base: ${contract.repository.baseRef} (${contract.repository.baseSha.slice(0, 12)})\n`);
      io.stdout(`  Allowed paths: ${contract.allowedPaths.map((r) => r.path).join(", ")}\n`);
      if (contract.forbiddenPaths.length > 0) {
        io.stdout(`  Forbidden paths: ${contract.forbiddenPaths.map((r) => r.path).join(", ")}\n`);
      }
      io.stdout(`  Acceptance criteria: ${contract.acceptanceCriteria.length}\n`);
      for (const c of contract.acceptanceCriteria) {
        io.stdout(`    - [${c.id}] ${c.description}\n`);
      }
      io.stdout(`  Verification commands: ${contract.verificationCommands.length}\n`);
      for (const cmd of contract.verificationCommands) {
        io.stdout(`    - [${cmd.id}] ${cmd.executable} ${cmd.arguments.join(" ")}\n`);
      }
      io.stdout(`  Digest: ${contract.contractDigest}\n`);
      io.stdout(`  Prepared by: ${contract.preparedBy} at ${contract.preparedAt}\n`);
    }
    return 0;
  }

  if (recordType === "verification-evidence") {
    const evidence = validateEvidenceForShow(value);
    if (jsonMode) {
      io.stdout(canonicalJsonDocument(evidence));
    } else {
      const verdictColor =
        evidence.verdict === "accepted" ? green
          : evidence.verdict === "rejected" ? red
            : yellow;
      io.stdout(`${bold("Verification Evidence")}\n`);
      io.stdout(`  Verdict: ${verdictColor(evidence.verdict.toUpperCase())}\n`);
      io.stdout(`  Task: ${evidence.taskId}\n`);
      io.stdout(`  Head: ${evidence.subject.headSha.slice(0, 12)}\n`);
      io.stdout(`  Changes: ${evidence.subject.changes.length} files\n`);
      io.stdout(`  Scope: ${evidence.scope.status}\n`);
      if (evidence.scope.violations.length > 0) {
        io.stdout(`  Violations:\n`);
        for (const v of evidence.scope.violations) {
          io.stdout(`    - ${v.path}: ${v.reason}\n`);
        }
      }
      io.stdout(`  Checks: ${evidence.checks.length}\n`);
      for (const check of evidence.checks) {
        const status = check.status === "passed" ? green("✓") : red("✗");
        io.stdout(`    ${status} [${check.id}] exit=${check.exitCode} (${check.durationMs}ms)\n`);
      }
      if (evidence.unresolvedRisks.length > 0) {
        io.stdout(`  Unresolved risks:\n`);
        for (const risk of evidence.unresolvedRisks) {
          io.stdout(`    - ${risk}\n`);
        }
      }
      io.stdout(`  Evidence digest: ${evidence.evidenceDigest}\n`);
    }
    return 0;
  }

  throw new Error(`unsupported recordType: ${String(recordType)}`);
}
