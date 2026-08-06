import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalJsonDocument } from "../core/integrity.js";
import {
  appendTaskEvent,
  createTaskJournal,
  parseTaskJournal,
  taskEventId,
  type TaskJournalV1,
} from "../core/task-journal.js";
import { resolveTasksDir } from "./runtime-paths.js";

export class PersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceError";
  }
}

const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const JOURNAL_FILE = "journal.json";

/**
 * Atomically writes canonical JSON by writing to a temporary file first and
 * then renaming it over the destination.
 *
 * Unlike contracts and evidence — which are immutable records written with
 * link(2) so an overwrite fails — the journal is an append-only file that is
 * rewritten on every append, so replacing the destination is intended here.
 */
export async function writeAtomicJson(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });

    const handle = await fs.open(tmpPath, "wx", 0o600);
    try {
      await handle.writeFile(canonicalJsonDocument(data), "utf8");
      // fsync before rename so a crash cannot leave a renamed but empty file.
      await handle.sync();
    } finally {
      await handle.close();
    }

    await fs.rename(tmpPath, filePath);
  } catch (error) {
    try {
      await fs.unlink(tmpPath);
    } catch {
      // The temp file may never have been created; nothing to clean up.
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new PersistenceError(`Failed to atomically write ${filePath}: ${msg}`);
  }
}

/**
 * Resolves the directory holding one task's state.
 */
export function resolveTaskStateDir(stateRoot: string, taskId: string): string {
  if (!TASK_ID_PATTERN.test(taskId)) {
    throw new PersistenceError(`Invalid task ID: ${taskId}`);
  }
  return path.join(resolveTasksDir(stateRoot), taskId);
}

export function resolveTaskJournalPath(stateRoot: string, taskId: string): string {
  return path.join(resolveTaskStateDir(stateRoot, taskId), JOURNAL_FILE);
}

/**
 * Reads and validates a task journal.
 *
 * Returns null when the task has no journal yet — that is the normal state for
 * a task created before journalling existed, and callers fall back to reporting
 * what they can observe from the files on disk. A journal that exists but fails
 * its integrity check throws: a tampered history must never be treated as
 * merely absent.
 */
export async function readTaskJournal(
  stateRoot: string,
  taskId: string
): Promise<TaskJournalV1 | null> {
  const journalPath = resolveTaskJournalPath(stateRoot, taskId);
  let raw: string;
  try {
    raw = await fs.readFile(journalPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return parseTaskJournal(JSON.parse(raw) as unknown);
}

export async function writeTaskJournal(
  stateRoot: string,
  journal: TaskJournalV1
): Promise<string> {
  const journalPath = resolveTaskJournalPath(stateRoot, journal.taskId);
  await writeAtomicJson(journalPath, journal);
  return journalPath;
}

/**
 * Returns the task's journal, seeding it from an existing contract when the
 * task predates journalling.
 *
 * Seeding is not a fabrication: a contract file on disk is itself the evidence
 * that the task was prepared, and the seeded event carries that contract's own
 * digest. Without this, tasks created before this feature could never record a
 * verification, because the state machine has no path out of `draft`.
 */
export async function ensureTaskJournal(
  stateRoot: string,
  taskId: string,
  contractDigest: string,
  actor: string
): Promise<TaskJournalV1> {
  const existing = await readTaskJournal(stateRoot, taskId);
  if (existing) return existing;

  return appendTaskEvent(
    createTaskJournal(taskId),
    taskEventId(taskId, "contract-prepared", contractDigest),
    {
      eventType: "contract-prepared",
      toState: "prepared",
      payloadDigest: contractDigest,
      actor,
      source: "forge journal-backfill",
      correlationId: null,
    }
  );
}
