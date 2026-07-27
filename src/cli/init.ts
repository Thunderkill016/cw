import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { CliOutput } from "./index.js";
import { bold, green } from "./index.js";

const CW_STATE_DIR = ".cw";

export async function runInit(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
    },
    strict: true,
  });

  const jsonMode = options.json ?? false;
  const projectRoot = process.cwd();
  const stateDir = resolve(projectRoot, CW_STATE_DIR);

  await mkdir(resolve(stateDir, "tasks"), { recursive: true });
  await mkdir(resolve(stateDir, "evidence", "sha256"), { recursive: true });
  await mkdir(resolve(stateDir, "evidence", "occurrences"), { recursive: true });

  if (jsonMode) {
    io.stdout(JSON.stringify({ initialized: true, stateDir }, null, 2) + "\n");
  } else {
    io.stdout(`${green("✓")} Initialized CW in ${bold(stateDir)}\n`);
    io.stdout(`\n`);
    io.stdout(`Next steps:\n`);
    io.stdout(`  1. Create a task spec:  ${bold("cw prepare --spec task.json")}\n`);
    io.stdout(`  2. Let your AI agent implement the task\n`);
    io.stdout(`  3. Verify the result:   ${bold("cw verify --contract .cw/tasks/<id>/contract.json")}\n`);
    io.stdout(`\n`);
    io.stdout(`Add ${bold(".cw/")} to your .gitignore if you don't want to track state.\n`);
  }

  return 0;
}
