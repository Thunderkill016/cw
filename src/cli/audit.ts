import { readdir, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { canonicalJsonDocument } from "../core/integrity.js";
import { verifyTaskJournal, type TaskJournalV1 } from "../core/task-journal.js";
import { readTaskJournal } from "../store/persistence.js";
import { resolveStateRoot, resolveTasksDir } from "../store/runtime-paths.js";
import type { CliOutput } from "./index.js";
import { bold, green, red, yellow } from "./index.js";

type JournalLoad =
  | { taskId: string; ok: true; journal: TaskJournalV1 }
  | { taskId: string; ok: false; error: string };

/**
 * Loads every task journal under the state root.
 *
 * A journal that fails to parse or verify is kept in the result as a failure
 * rather than dropped, so `forge audit verify` reports tampering instead of
 * silently auditing a smaller set of tasks.
 */
async function loadJournals(stateRoot: string): Promise<JournalLoad[]> {
  const tasksDir = resolveTasksDir(stateRoot);
  let taskIds: string[] = [];
  try {
    const entries = await readdir(tasksDir, { withFileTypes: true });
    taskIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const loaded: JournalLoad[] = [];
  for (const taskId of taskIds) {
    try {
      const journal = await readTaskJournal(stateRoot, taskId);
      if (journal) loaded.push({ taskId, ok: true, journal });
    } catch (error) {
      loaded.push({
        taskId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return loaded;
}

export async function runAudit(args: string[], io: CliOutput): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      out: { type: "string" },
      json: { type: "boolean" },
      "project-root": { type: "string" },
      root: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });

  const subCommand = positionals[0];
  const projectRoot = resolve(values["project-root"] ?? process.cwd());
  const stateRoot = resolveStateRoot(projectRoot, values.root);
  const jsonMode = values.json ?? false;

  if (subCommand === "show") {
    const loaded = await loadJournals(stateRoot);

    if (jsonMode) {
      io.stdout(canonicalJsonDocument({ stateRoot, tasks: loaded }));
      return 0;
    }

    io.stdout(`${bold("Forge Audit")}  ${stateRoot}\n`);
    if (loaded.length === 0) {
      io.stdout(`No task journals found.\n`);
      return 0;
    }
    for (const entry of loaded) {
      if (!entry.ok) {
        io.stdout(`\n${yellow(entry.taskId)}: ${red("unreadable")} — ${entry.error}\n`);
        continue;
      }
      const { journal } = entry;
      io.stdout(`\n${yellow(journal.taskId)}  state=${journal.state}\n`);
      io.stdout(`  Merkle Root: ${journal.merkleRoot}\n`);
      for (const event of journal.events) {
        const transition =
          event.fromState === null ? event.toState : `${event.fromState} → ${event.toState}`;
        io.stdout(
          `  [${event.sequenceNumber}] ${event.recordedAt} | ${event.eventType} | ${transition} | ${event.actor}\n`
        );
      }
    }
    return 0;
  }

  if (subCommand === "verify") {
    const loaded = await loadJournals(stateRoot);

    // Reporting "verified" when there is nothing to verify is a false
    // assurance. An audit over zero journals fails closed.
    if (loaded.length === 0) {
      if (jsonMode) {
        io.stdout(
          canonicalJsonDocument({
            stateRoot,
            verified: false,
            reason: "no-task-journals",
            tasksChecked: 0,
          })
        );
      } else {
        io.stderr(
          `${red("Error:")} No task journals found under ${stateRoot}; nothing to verify.\n`
        );
      }
      return 1;
    }

    const results = loaded.map((entry) => {
      if (!entry.ok) {
        return { taskId: entry.taskId, valid: false, reason: entry.error, events: 0, merkleRoot: "" };
      }
      const integrity = verifyTaskJournal(entry.journal);
      return {
        taskId: entry.taskId,
        valid: integrity.valid,
        reason: integrity.reason,
        events: entry.journal.events.length,
        merkleRoot: entry.journal.merkleRoot,
      };
    });
    const allValid = results.every((result) => result.valid);

    if (jsonMode) {
      io.stdout(
        canonicalJsonDocument({
          stateRoot,
          verified: allValid,
          tasksChecked: results.length,
          results,
        })
      );
    } else if (allValid) {
      io.stdout(
        `${green("Success:")} ${results.length} task journal(s) verified under ${stateRoot}.\n`
      );
      for (const result of results) {
        io.stdout(`  ${result.taskId}: ${result.events} events, root ${result.merkleRoot}\n`);
      }
    } else {
      io.stderr(`${red("Error:")} Task journal integrity verification failed.\n`);
      for (const result of results.filter((item) => !item.valid)) {
        io.stderr(`  ${result.taskId}: ${result.reason}\n`);
      }
    }
    return allValid ? 0 : 1;
  }

  if (subCommand === "export") {
    if (!values.out) {
      io.stderr(`${red("Error:")} Missing --out argument.\n`);
      return 1;
    }
    const loaded = await loadJournals(stateRoot);
    const outPath = resolve(projectRoot, values.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, canonicalJsonDocument({ stateRoot, tasks: loaded }), "utf8");
    if (jsonMode) {
      io.stdout(canonicalJsonDocument({ exportedPath: outPath, tasks: loaded.length }));
    } else {
      io.stdout(`${green("Success:")} ${loaded.length} task journal(s) exported to ${outPath}\n`);
    }
    return 0;
  }

  io.stderr(`${red("Error:")} Unknown audit subcommand: ${subCommand || "none"}\n`);
  io.stderr(`Expected one of: show, verify, export\n`);
  return 1;
}
