import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import type { CliOutput } from "./index.js";
import { bold, green, yellow, red } from "./index.js";
import { runGitBuffer, canonicalGitRoot } from "../git/git-change.js";
import { parseRawGitChanges, scopeViolations } from "../core/verification.js";
import type { TaskContractV1 } from "../core/contract.js";

export async function runDiff(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
      contract: { type: "string" },
    },
    strict: true,
  });

  const jsonMode = options.json ?? false;
  const contractPath = options.contract;
  if (!contractPath) {
    throw new Error("--contract <contract.json> is required");
  }

  const contractContent = await readFile(resolve(contractPath), "utf8");
  let contract: TaskContractV1;
  try {
    contract = JSON.parse(contractContent) as TaskContractV1;
  } catch {
    throw new Error(`Failed to parse contract file: ${contractPath} (invalid JSON)`);
  }


  const projectRoot = process.cwd();
  const repositoryRoot = await canonicalGitRoot(projectRoot);
  const baseSha = contract.repository.baseSha;
  
  // Get changes between baseSha and current working tree + index (HEAD)
  // git diff-index does this
  const rawChanges = await runGitBuffer(repositoryRoot, [
    "diff-index",
    "-z",
    "--raw",
    "-M",
    "--no-abbrev",
    baseSha
  ]);

  const changes = parseRawGitChanges(rawChanges, contract.repository.objectFormat);
  const violations = scopeViolations(changes, contract);

  const report = {
    taskId: contract.taskId,
    baseSha,
    changesCount: changes.length,
    violationsCount: violations.length,
    changes: changes.map(c => c.path),
    violations
  };

  if (jsonMode) {
    io.stdout(JSON.stringify(report, null, 2) + "\n");
    return violations.length > 0 ? 1 : 0;
  }

  io.stdout(`${bold("Diff against contract base")}: ${yellow(baseSha.slice(0, 7))}\n`);
  io.stdout(`Changed paths: ${changes.length}\n`);

  if (changes.length > 0) {
    for (const change of changes) {
      const isViolation = violations.some(v => v.path === change.path);
      if (isViolation) {
        const v = violations.find(v => v.path === change.path)!;
        io.stdout(`  ${red("✗")} ${change.path} (${v.reason})\n`);
      } else {
        io.stdout(`  ${green("✓")} ${change.path}\n`);
      }
    }
  }

  if (violations.length > 0) {
    io.stdout(`\n${red(bold("Scope Violations Found:"))} ${violations.length}\n`);
    return 1;
  }

  io.stdout(`\n${green("All changes are within contract scope.")}\n`);
  return 0;
}
