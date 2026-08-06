import {
  TASK_JOURNAL_EVENT_DOMAIN,
  TASK_JOURNAL_EVENT_ID_DOMAIN,
} from "./digest-domains.js";
import { digestCanonicalJson, sha256Hex } from "./integrity.js";
import { computeMerkleRoot, type MerkleEntry } from "./merkle.js";
import { advanceState, type TaskState } from "./state-machine.js";

export class TaskJournalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskJournalError";
  }
}

/**
 * The lifecycle events Forge can actually observe. Forge never watches an agent
 * write code, so there is deliberately no "implementation started" event — the
 * task re-enters `implementing` as a consequence of a non-accepting verdict.
 */
export type TaskEventType =
  | "contract-prepared"
  | "verification-started"
  | "verification-completed";

export const TASK_EVENT_TYPES: readonly TaskEventType[] = [
  "contract-prepared",
  "verification-started",
  "verification-completed",
];

export type TaskJournalEvent = {
  /**
   * Stable identity of the event, derived by the caller from the record the
   * event is about. Appending the same eventId twice is a no-op, which is what
   * makes a retried `forge prepare` or `forge verify` safe.
   */
  eventId: string;
  sequenceNumber: number;
  recordedAt: string;
  eventType: TaskEventType;
  /** Who or what caused the event (e.g. a user, a CI job). */
  actor: string;
  /** Which command emitted it (e.g. "forge verify"). */
  source: string;
  /** Ties the event to an agent run so a task can be traced across systems. */
  correlationId: string | null;
  fromState: TaskState | null;
  toState: TaskState;
  /** Digest of the record this event attests to (a contract or evidence file). */
  payloadDigest: string;
  previousDigest: string;
  entryDigest: string;
};

export type TaskJournalV1 = {
  schemaVersion: 1;
  recordType: "task-journal";
  taskId: string;
  /** Materialized head state; always equals the last event's toState. */
  state: TaskState;
  events: TaskJournalEvent[];
  merkleRoot: string;
};

export type AppendTaskEventInput = {
  eventType: TaskEventType;
  toState: TaskState;
  payloadDigest: string;
  actor: string;
  source: string;
  correlationId?: string | null;
  /** Injectable for deterministic tests; defaults to now. */
  recordedAt?: string;
};

const GENESIS_STATE: TaskState = "draft";
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

export function createTaskJournal(taskId: string): TaskJournalV1 {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(taskId)) {
    throw new TaskJournalError(`invalid taskId: ${taskId}`);
  }
  return {
    schemaVersion: 1,
    recordType: "task-journal",
    taskId,
    state: GENESIS_STATE,
    events: [],
    merkleRoot: "",
  };
}

/**
 * Derives a stable event id from the task, event type and the digest of the
 * record it attests to. Re-running a command over the same record therefore
 * produces the same id, which `appendTaskEvent` deduplicates.
 */
export function taskEventId(
  taskId: string,
  eventType: TaskEventType,
  payloadDigest: string
): string {
  return digestCanonicalJson(TASK_JOURNAL_EVENT_ID_DOMAIN, {
    taskId,
    eventType,
    payloadDigest,
  });
}

function computeEntryDigest(
  event: Omit<TaskJournalEvent, "entryDigest">
): string {
  return digestCanonicalJson(TASK_JOURNAL_EVENT_DOMAIN, event);
}

function emptyChainDigest(): string {
  return sha256Hex("");
}

function merkleEntriesFor(events: readonly TaskJournalEvent[]): MerkleEntry[] {
  return events.map((event) => ({
    path: `event-${event.sequenceNumber}`,
    hash: event.entryDigest,
  }));
}

/**
 * Appends a lifecycle event, enforcing the task state machine.
 *
 * Returns the journal unchanged when `eventId` is already present so that a
 * retried command cannot double-append. Throws when the transition is illegal —
 * the journal fails closed rather than recording an impossible history.
 */
export function appendTaskEvent(
  journal: TaskJournalV1,
  eventId: string,
  input: AppendTaskEventInput
): TaskJournalV1 {
  if (!DIGEST_PATTERN.test(eventId)) {
    throw new TaskJournalError(`event id must be a sha256 hex digest: ${eventId}`);
  }
  if (!DIGEST_PATTERN.test(input.payloadDigest)) {
    throw new TaskJournalError("payloadDigest must be a sha256 hex digest");
  }
  if (!input.actor.trim()) throw new TaskJournalError("actor is required");
  if (!input.source.trim()) throw new TaskJournalError("source is required");

  if (journal.events.some((event) => event.eventId === eventId)) {
    return journal;
  }

  const sequenceNumber = journal.events.length;
  const fromState = sequenceNumber === 0 ? null : journal.state;
  // advanceState throws on an illegal transition; the genesis event is the only
  // one allowed to establish a state without a predecessor.
  const toState =
    fromState === null
      ? advanceState(GENESIS_STATE, input.toState)
      : advanceState(fromState, input.toState);

  const previousDigest =
    sequenceNumber === 0
      ? emptyChainDigest()
      : journal.events[sequenceNumber - 1]!.entryDigest;

  const withoutDigest: Omit<TaskJournalEvent, "entryDigest"> = {
    eventId,
    sequenceNumber,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    eventType: input.eventType,
    actor: input.actor.trim(),
    source: input.source.trim(),
    correlationId: input.correlationId?.trim() || null,
    fromState,
    toState,
    payloadDigest: input.payloadDigest,
    previousDigest,
  };

  const event: TaskJournalEvent = {
    ...withoutDigest,
    entryDigest: computeEntryDigest(withoutDigest),
  };

  const events = [...journal.events, event];
  return {
    ...journal,
    state: toState,
    events,
    merkleRoot: computeMerkleRoot(merkleEntriesFor(events)) ?? "",
  };
}

export type TaskJournalIntegrity = {
  valid: boolean;
  /** Machine-readable reason, present only when `valid` is false. */
  reason:
    | null
    | "broken-hash-chain"
    | "tampered-event"
    | "illegal-transition"
    | "state-mismatch"
    | "merkle-root-mismatch";
  failedSequenceNumber: number | null;
};

/**
 * Recomputes the hash chain, replays every transition and checks the merkle
 * root. Returns a structured result rather than a bare boolean so a caller can
 * report *what* failed and *where*.
 */
export function verifyTaskJournal(journal: TaskJournalV1): TaskJournalIntegrity {
  const ok: TaskJournalIntegrity = { valid: true, reason: null, failedSequenceNumber: null };

  if (journal.events.length === 0) {
    if (journal.merkleRoot !== "") {
      return { valid: false, reason: "merkle-root-mismatch", failedSequenceNumber: null };
    }
    if (journal.state !== GENESIS_STATE) {
      return { valid: false, reason: "state-mismatch", failedSequenceNumber: null };
    }
    return ok;
  }

  let expectedPrevious = emptyChainDigest();
  let replayedState: TaskState = GENESIS_STATE;

  for (const [index, event] of journal.events.entries()) {
    if (event.sequenceNumber !== index || event.previousDigest !== expectedPrevious) {
      return { valid: false, reason: "broken-hash-chain", failedSequenceNumber: index };
    }

    const { entryDigest, ...withoutDigest } = event;
    if (computeEntryDigest(withoutDigest) !== entryDigest) {
      return { valid: false, reason: "tampered-event", failedSequenceNumber: index };
    }

    const expectedFrom = index === 0 ? null : replayedState;
    if (event.fromState !== expectedFrom) {
      return { valid: false, reason: "illegal-transition", failedSequenceNumber: index };
    }
    try {
      replayedState = advanceState(expectedFrom ?? GENESIS_STATE, event.toState);
    } catch {
      return { valid: false, reason: "illegal-transition", failedSequenceNumber: index };
    }

    expectedPrevious = entryDigest;
  }

  if (replayedState !== journal.state) {
    return { valid: false, reason: "state-mismatch", failedSequenceNumber: null };
  }
  if ((computeMerkleRoot(merkleEntriesFor(journal.events)) ?? "") !== journal.merkleRoot) {
    return { valid: false, reason: "merkle-root-mismatch", failedSequenceNumber: null };
  }
  return ok;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TaskJournalError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new TaskJournalError(`${label} must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

const TASK_STATES: readonly TaskState[] = [
  "draft",
  "prepared",
  "implementing",
  "verifying",
  "accepted",
  "rejected",
];

/**
 * Strictly parses a stored journal and verifies its integrity. A journal that
 * does not verify is rejected rather than returned, so no caller can act on a
 * tampered history.
 */
export function parseTaskJournal(value: unknown): TaskJournalV1 {
  const record = requireObject(value, "task journal");
  if (record.schemaVersion !== 1) {
    throw new TaskJournalError("task journal schemaVersion must equal 1");
  }
  if (record.recordType !== "task-journal") {
    throw new TaskJournalError("task journal recordType must equal task-journal");
  }
  if (typeof record.taskId !== "string") {
    throw new TaskJournalError("task journal taskId must be a string");
  }
  if (typeof record.merkleRoot !== "string") {
    throw new TaskJournalError("task journal merkleRoot must be a string");
  }
  if (!Array.isArray(record.events)) {
    throw new TaskJournalError("task journal events must be an array");
  }

  const events: TaskJournalEvent[] = record.events.map((item, index) => {
    const event = requireObject(item, `events[${index}]`);
    const fromState =
      event.fromState === null
        ? null
        : requiredEnum(event.fromState, TASK_STATES, `events[${index}].fromState`);
    return {
      eventId: String(event.eventId ?? ""),
      sequenceNumber: Number(event.sequenceNumber),
      recordedAt: String(event.recordedAt ?? ""),
      eventType: requiredEnum(event.eventType, TASK_EVENT_TYPES, `events[${index}].eventType`),
      actor: String(event.actor ?? ""),
      source: String(event.source ?? ""),
      correlationId: event.correlationId === null ? null : String(event.correlationId ?? ""),
      fromState,
      toState: requiredEnum(event.toState, TASK_STATES, `events[${index}].toState`),
      payloadDigest: String(event.payloadDigest ?? ""),
      previousDigest: String(event.previousDigest ?? ""),
      entryDigest: String(event.entryDigest ?? ""),
    };
  });

  const journal: TaskJournalV1 = {
    schemaVersion: 1,
    recordType: "task-journal",
    taskId: record.taskId,
    state: requiredEnum(record.state, TASK_STATES, "task journal state"),
    events,
    merkleRoot: record.merkleRoot,
  };

  const integrity = verifyTaskJournal(journal);
  if (!integrity.valid) {
    throw new TaskJournalError(
      `task journal integrity check failed: ${integrity.reason}` +
        (integrity.failedSequenceNumber === null
          ? ""
          : ` at event ${integrity.failedSequenceNumber}`)
    );
  }
  return journal;
}
