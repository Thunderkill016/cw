import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { TaskState } from "../core/state-machine.js";
import { readTaskJournal } from "../store/persistence.js";
import { resolveStateRoot, resolveTasksDir } from "../store/runtime-paths.js";
import type { CliOutput } from "./index.js";
import { bold, green, yellow } from "./index.js";

type TaskListing = {
  taskId: string;
  contract: boolean;
  state: TaskState | null;
  verifications: string[];
};

export async function runList(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
      "project-root": { type: "string" },
      root: { type: "string" },
    },
    strict: true,
  });

  const jsonMode = options.json ?? false;
  const projectRoot = resolve(options["project-root"] ?? process.cwd());
  const stateRoot = resolveStateRoot(projectRoot, options.root);
  const tasksDir = resolveTasksDir(stateRoot);

  let taskIds: string[] = [];
  try {
    const entries = await readdir(tasksDir, { withFileTypes: true });
    taskIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const results: TaskListing[] = [];
  for (const taskId of taskIds) {
    const taskPath = resolve(tasksDir, taskId);
    let contract = false;
    const verifications: string[] = [];

    try {
      const taskEntries = await readdir(taskPath, { withFileTypes: true });
      for (const entry of taskEntries) {
        if (!entry.isFile()) continue;
        if (entry.name === "contract.json") contract = true;
        else if (entry.name.startsWith("verification-") && entry.name.endsWith(".json")) {
          verifications.push(entry.name);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    let state: TaskState | null = null;
    try {
      state = (await readTaskJournal(stateRoot, taskId))?.state ?? null;
    } catch {
      // An unreadable journal leaves state unknown; `forge status` reports why.
    }

    results.push({ taskId, contract, state, verifications: verifications.sort() });
  }

  if (jsonMode) {
    io.stdout(JSON.stringify(results, null, 2) + "\n");
    return 0;
  }

  if (results.length === 0) {
    io.stdout("No Forge tasks found.\n");
    return 0;
  }

  io.stdout(`${bold("Forge Tasks")}:\n`);
  for (const res of results) {
    io.stdout(`  ${yellow(res.taskId)}\n`);
    io.stdout(`    Contract: ${res.contract ? green("Yes") : "No"}\n`);
    io.stdout(`    State: ${res.state ?? "unknown"}\n`);
    io.stdout(`    Verifications: ${res.verifications.length}\n`);
    for (const v of res.verifications) {
      io.stdout(`      - ${v}\n`);
    }
  }

  return 0;
}
