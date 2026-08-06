import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { TaskState } from "../core/state-machine.js";
import { readTaskJournal } from "../store/persistence.js";
import { resolveStateRoot, resolveTasksDir } from "../store/runtime-paths.js";
import type { CliOutput } from "./index.js";
import { bold, green, yellow, red } from "./index.js";

type TaskStatus = {
  taskId: string;
  contract: boolean;
  verificationsCount: number;
  latestVerdict: string | null;
  latestVerifiedAt: string | null;
  /** Null when the task predates journalling and its state is unknown. */
  state: TaskState | null;
  events: number;
  /** True when a journal exists and passed its integrity check. */
  journalVerified: boolean;
};

type Dashboard = {
  stateRoot: string;
  totalTasks: number;
  tasks: TaskStatus[];
};

async function listTaskIds(tasksDir: string): Promise<string[]> {
  try {
    const entries = await readdir(tasksDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readTaskFiles(
  taskPath: string
): Promise<{ contract: boolean; verificationsCount: number; latest: { verdict: string | null; verifiedAt: string | null } }> {
  let contract = false;
  let verificationsCount = 0;
  let latestTime = 0;
  let verdict: string | null = null;
  let verifiedAt: string | null = null;

  let entries;
  try {
    entries = await readdir(taskPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { contract, verificationsCount, latest: { verdict, verifiedAt } };
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === "contract.json") {
      contract = true;
      continue;
    }
    if (!entry.name.startsWith("verification-") || !entry.name.endsWith(".json")) continue;

    verificationsCount += 1;
    const content = await readFile(resolve(taskPath, entry.name), "utf8");
    let parsed: { verdict?: unknown; verifiedAt?: unknown; completedAt?: unknown };
    try {
      parsed = JSON.parse(content) as typeof parsed;
    } catch {
      // A corrupt evidence file still counts as an attempt, but cannot be read
      // for a verdict. Surfacing it as "no verdict" is honest; skipping the
      // count silently would hide the file's existence.
      continue;
    }
    const stamp = typeof parsed.completedAt === "string" ? parsed.completedAt : parsed.verifiedAt;
    const time = typeof stamp === "string" ? new Date(stamp).getTime() : 0;
    if (Number.isFinite(time) && time >= latestTime) {
      latestTime = time;
      verdict = typeof parsed.verdict === "string" ? parsed.verdict : null;
      verifiedAt = typeof stamp === "string" ? stamp : null;
    }
  }

  return { contract, verificationsCount, latest: { verdict, verifiedAt } };
}

export async function runStatus(argv: string[], io: CliOutput): Promise<number> {
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

  const taskIds = (await listTaskIds(tasksDir)).sort();
  const tasks: TaskStatus[] = [];

  for (const taskId of taskIds) {
    const files = await readTaskFiles(resolve(tasksDir, taskId));

    let state: TaskState | null = null;
    let events = 0;
    let journalVerified = false;
    try {
      const journal = await readTaskJournal(stateRoot, taskId);
      if (journal) {
        state = journal.state;
        events = journal.events.length;
        journalVerified = true;
      }
    } catch (error) {
      // readTaskJournal throws when a journal exists but fails its integrity
      // check. Report the task with journalVerified=false rather than aborting
      // the whole dashboard, and make the failure visible below.
      io.stderr(
        `Warning: task ${taskId} has an unreadable journal: ${
          error instanceof Error ? error.message : String(error)
        }\n`
      );
    }

    tasks.push({
      taskId,
      contract: files.contract,
      verificationsCount: files.verificationsCount,
      latestVerdict: files.latest.verdict,
      latestVerifiedAt: files.latest.verifiedAt,
      state,
      events,
      journalVerified,
    });
  }

  const dashboard: Dashboard = { stateRoot, totalTasks: tasks.length, tasks };

  if (jsonMode) {
    io.stdout(JSON.stringify(dashboard, null, 2) + "\n");
    return 0;
  }

  io.stdout(`${bold("Forge Dashboard")}\n`);
  io.stdout(`======================\n`);
  io.stdout(`State root:  ${stateRoot}\n`);
  io.stdout(`Total Tasks: ${dashboard.totalTasks}\n\n`);

  for (const task of dashboard.tasks) {
    io.stdout(`Task: ${yellow(task.taskId)}\n`);
    io.stdout(`  Contract: ${task.contract ? green("Active") : red("Missing")}\n`);
    if (task.state) {
      const stateColor = task.state === "accepted" ? green : task.state === "rejected" ? red : yellow;
      io.stdout(`  State: ${stateColor(task.state)} (${task.events} events, chain verified)\n`);
    } else {
      io.stdout(`  State: ${yellow("unknown")} (no journal; predates lifecycle tracking)\n`);
    }
    io.stdout(`  Verifications: ${task.verificationsCount}\n`);
    if (task.latestVerdict) {
      const color =
        task.latestVerdict === "accepted" ? green : task.latestVerdict === "rejected" ? red : yellow;
      io.stdout(`  Latest Verdict: ${color(task.latestVerdict)} at ${task.latestVerifiedAt}\n`);
    }
    io.stdout(`\n`);
  }

  return 0;
}
