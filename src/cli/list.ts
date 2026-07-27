import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { CliOutput } from "./index.js";
import { bold, green, yellow } from "./index.js";

const CW_STATE_DIR = ".cw";

export async function runList(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
    },
    strict: true,
  });

  const jsonMode = options.json ?? false;
  const projectRoot = process.cwd();
  const tasksDir = resolve(projectRoot, CW_STATE_DIR, "tasks");

  let taskIds: string[] = [];
  try {
    const entries = await readdir(tasksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        taskIds.push(entry.name);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const results: any[] = [];
  for (const taskId of taskIds) {
    const taskPath = resolve(tasksDir, taskId);
    let contractFound = false;
    const verifications: string[] = [];

    try {
      const taskEntries = await readdir(taskPath, { withFileTypes: true });
      for (const entry of taskEntries) {
        if (entry.isFile()) {
          if (entry.name === "contract.json") contractFound = true;
          else if (entry.name.startsWith("verification-") && entry.name.endsWith(".json")) {
            verifications.push(entry.name);
          }
        }
      }
    } catch {
      // ignore
    }
    
    results.push({
      taskId,
      contract: contractFound,
      verifications
    });
  }

  if (jsonMode) {
    io.stdout(JSON.stringify(results, null, 2) + "\n");
  } else {
    if (results.length === 0) {
      io.stdout("No CW tasks found.\n");
      return 0;
    }

    io.stdout(`${bold("CW Tasks")}:\n`);
    for (const res of results) {
      io.stdout(`  ${yellow(res.taskId)}\n`);
      io.stdout(`    Contract: ${res.contract ? green("Yes") : "No"}\n`);
      io.stdout(`    Verifications: ${res.verifications.length}\n`);
      for (const v of res.verifications) {
        io.stdout(`      - ${v}\n`);
      }
    }
  }

  return 0;
}
