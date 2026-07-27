import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { CliOutput } from "./index.js";
import { bold, green, yellow, red } from "./index.js";

const CW_STATE_DIR = ".cw";

export async function runStatus(argv: string[], io: CliOutput): Promise<number> {
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

  const dashboard: any = {
    totalTasks: taskIds.length,
    tasks: []
  };

  for (const taskId of taskIds) {
    const taskPath = resolve(tasksDir, taskId);
    let contractFound = false;
    let latestVerification: any = null;
    let verificationsCount = 0;

    try {
      const taskEntries = await readdir(taskPath, { withFileTypes: true });
      let latestTime = 0;
      for (const entry of taskEntries) {
        if (entry.isFile()) {
          if (entry.name === "contract.json") {
             contractFound = true;
          } else if (entry.name.startsWith("verification-") && entry.name.endsWith(".json")) {
             verificationsCount++;
             const content = await readFile(resolve(taskPath, entry.name), "utf8");
             try {
               const parsed = JSON.parse(content);
               const time = new Date(parsed.verifiedAt || 0).getTime();
               if (time > latestTime) {
                 latestTime = time;
                 latestVerification = parsed;
               }
             } catch {
               // Skip corrupt evidence files
             }
          }
        }
      }
    } catch {
      // ignore
    }
    
    dashboard.tasks.push({
      taskId,
      contract: contractFound,
      verificationsCount,
      latestVerdict: latestVerification?.verdict ?? null,
      latestVerifiedAt: latestVerification?.verifiedAt ?? null
    });
  }

  if (jsonMode) {
    io.stdout(JSON.stringify(dashboard, null, 2) + "\n");
  } else {
    io.stdout(`${bold("CW Dashboard")}\n`);
    io.stdout(`======================\n`);
    io.stdout(`Total Tasks: ${dashboard.totalTasks}\n\n`);

    for (const task of dashboard.tasks) {
      io.stdout(`Task: ${yellow(task.taskId)}\n`);
      io.stdout(`  Contract: ${task.contract ? green("Active") : red("Missing")}\n`);
      io.stdout(`  Verifications: ${task.verificationsCount}\n`);
      if (task.latestVerdict) {
        const color = task.latestVerdict === "accepted" ? green : (task.latestVerdict === "rejected" ? red : yellow);
        io.stdout(`  Latest Verdict: ${color(task.latestVerdict)} at ${task.latestVerifiedAt}\n`);
      }
      io.stdout(`\n`);
    }
  }

  return 0;
}
