import { describe, expect, it } from "vitest";
import {
  appendTaskEvent,
  createTaskJournal,
  parseTaskJournal,
  taskEventId,
  TaskJournalError,
  verifyTaskJournal,
  type TaskJournalV1,
} from "../src/core/task-journal.js";
import { StateMachineError } from "../src/core/state-machine.js";

const CONTRACT_DIGEST = "a".repeat(64);
const EVIDENCE_DIGEST = "b".repeat(64);
const OTHER_EVIDENCE_DIGEST = "c".repeat(64);

function prepared(taskId = "demo-task"): TaskJournalV1 {
  return appendTaskEvent(
    createTaskJournal(taskId),
    taskEventId(taskId, "contract-prepared", CONTRACT_DIGEST),
    {
      eventType: "contract-prepared",
      toState: "prepared",
      payloadDigest: CONTRACT_DIGEST,
      actor: "tester",
      source: "forge prepare",
      recordedAt: "2026-01-01T00:00:00.000Z",
    }
  );
}

function verifying(journal: TaskJournalV1): TaskJournalV1 {
  return appendTaskEvent(
    journal,
    taskEventId(journal.taskId, "verification-started", EVIDENCE_DIGEST),
    {
      eventType: "verification-started",
      toState: "verifying",
      payloadDigest: EVIDENCE_DIGEST,
      actor: "tester",
      source: "forge verify",
      correlationId: "run-1",
      recordedAt: "2026-01-01T00:01:00.000Z",
    }
  );
}

describe("createTaskJournal", () => {
  it("starts in draft with no events and an empty merkle root", () => {
    const journal = createTaskJournal("demo-task");
    expect(journal.state).toBe("draft");
    expect(journal.events).toHaveLength(0);
    expect(journal.merkleRoot).toBe("");
    expect(verifyTaskJournal(journal).valid).toBe(true);
  });

  it("rejects an unusable task id", () => {
    expect(() => createTaskJournal("../escape")).toThrow(TaskJournalError);
    expect(() => createTaskJournal("")).toThrow(TaskJournalError);
  });
});

describe("appendTaskEvent", () => {
  it("records the first event as a transition out of draft", () => {
    const journal = prepared();
    expect(journal.state).toBe("prepared");
    expect(journal.events).toHaveLength(1);

    const event = journal.events[0]!;
    expect(event.sequenceNumber).toBe(0);
    expect(event.fromState).toBeNull();
    expect(event.toState).toBe("prepared");
    expect(event.eventType).toBe("contract-prepared");
    expect(event.actor).toBe("tester");
    expect(event.source).toBe("forge prepare");
    expect(event.payloadDigest).toBe(CONTRACT_DIGEST);
    expect(journal.merkleRoot).not.toBe("");
  });

  it("chains each event to its predecessor", () => {
    const journal = verifying(prepared());
    expect(journal.events).toHaveLength(2);
    expect(journal.events[1]!.previousDigest).toBe(journal.events[0]!.entryDigest);
    expect(journal.events[1]!.fromState).toBe("prepared");
    expect(journal.state).toBe("verifying");
  });

  it("carries the correlation id so a run can be traced", () => {
    const journal = verifying(prepared());
    expect(journal.events[1]!.correlationId).toBe("run-1");
    // A blank correlation id normalizes to null rather than an empty string.
    expect(journal.events[0]!.correlationId).toBeNull();
  });

  it("is idempotent: re-appending the same event id is a no-op", () => {
    const once = prepared();
    const twice = appendTaskEvent(
      once,
      taskEventId("demo-task", "contract-prepared", CONTRACT_DIGEST),
      {
        eventType: "contract-prepared",
        toState: "prepared",
        payloadDigest: CONTRACT_DIGEST,
        actor: "tester",
        source: "forge prepare",
      }
    );
    expect(twice).toBe(once);
    expect(twice.events).toHaveLength(1);
  });

  it("fails closed on an illegal transition", () => {
    const journal = prepared();
    expect(() =>
      appendTaskEvent(journal, taskEventId("demo-task", "verification-completed", EVIDENCE_DIGEST), {
        eventType: "verification-completed",
        // prepared -> accepted skips verification entirely.
        toState: "accepted",
        payloadDigest: EVIDENCE_DIGEST,
        actor: "tester",
        source: "forge verify",
      })
    ).toThrow(StateMachineError);
  });

  it("refuses malformed input", () => {
    const journal = prepared();
    expect(() =>
      appendTaskEvent(journal, "not-a-digest", {
        eventType: "verification-started",
        toState: "verifying",
        payloadDigest: EVIDENCE_DIGEST,
        actor: "tester",
        source: "forge verify",
      })
    ).toThrow(TaskJournalError);

    expect(() =>
      appendTaskEvent(journal, taskEventId("demo-task", "verification-started", EVIDENCE_DIGEST), {
        eventType: "verification-started",
        toState: "verifying",
        payloadDigest: "short",
        actor: "tester",
        source: "forge verify",
      })
    ).toThrow(TaskJournalError);

    expect(() =>
      appendTaskEvent(journal, taskEventId("demo-task", "verification-started", EVIDENCE_DIGEST), {
        eventType: "verification-started",
        toState: "verifying",
        payloadDigest: EVIDENCE_DIGEST,
        actor: "   ",
        source: "forge verify",
      })
    ).toThrow(TaskJournalError);
  });

  it("allows a rejected attempt to be verified again", () => {
    let journal = verifying(prepared());
    journal = appendTaskEvent(
      journal,
      taskEventId("demo-task", "verification-completed", EVIDENCE_DIGEST),
      {
        eventType: "verification-completed",
        toState: "rejected",
        payloadDigest: EVIDENCE_DIGEST,
        actor: "tester",
        source: "forge verify",
      }
    );
    expect(journal.state).toBe("rejected");

    journal = appendTaskEvent(
      journal,
      taskEventId("demo-task", "verification-started", OTHER_EVIDENCE_DIGEST),
      {
        eventType: "verification-started",
        toState: "verifying",
        payloadDigest: OTHER_EVIDENCE_DIGEST,
        actor: "tester",
        source: "forge verify",
      }
    );
    expect(journal.state).toBe("verifying");
    expect(verifyTaskJournal(journal).valid).toBe(true);
  });
});

describe("verifyTaskJournal", () => {
  it("accepts an untampered journal", () => {
    expect(verifyTaskJournal(verifying(prepared()))).toEqual({
      valid: true,
      reason: null,
      failedSequenceNumber: null,
    });
  });

  it("detects a mutated event payload", () => {
    const journal = verifying(prepared());
    const tampered: TaskJournalV1 = {
      ...journal,
      events: journal.events.map((event, index) =>
        index === 0 ? { ...event, actor: "someone-else" } : event
      ),
    };
    expect(verifyTaskJournal(tampered)).toMatchObject({
      valid: false,
      reason: "tampered-event",
      failedSequenceNumber: 0,
    });
  });

  it("detects a removed event", () => {
    const journal = verifying(prepared());
    const truncated: TaskJournalV1 = { ...journal, events: [journal.events[1]!] };
    expect(verifyTaskJournal(truncated)).toMatchObject({
      valid: false,
      reason: "broken-hash-chain",
    });
  });

  it("detects a head state that does not match the replayed events", () => {
    const journal = verifying(prepared());
    expect(verifyTaskJournal({ ...journal, state: "accepted" })).toMatchObject({
      valid: false,
      reason: "state-mismatch",
    });
  });

  it("detects a forged merkle root", () => {
    const journal = verifying(prepared());
    expect(verifyTaskJournal({ ...journal, merkleRoot: "f".repeat(64) })).toMatchObject({
      valid: false,
      reason: "merkle-root-mismatch",
    });
  });

  it("rejects an empty journal claiming a non-genesis state", () => {
    const empty = createTaskJournal("demo-task");
    expect(verifyTaskJournal({ ...empty, state: "accepted" })).toMatchObject({
      valid: false,
      reason: "state-mismatch",
    });
  });
});

describe("parseTaskJournal", () => {
  it("round-trips a journal through JSON", () => {
    const journal = verifying(prepared());
    const parsed = parseTaskJournal(JSON.parse(JSON.stringify(journal)) as unknown);
    expect(parsed).toEqual(journal);
  });

  it("refuses a journal that fails its integrity check", () => {
    const journal = verifying(prepared());
    const tampered = {
      ...journal,
      events: journal.events.map((event, index) =>
        index === 1 ? { ...event, payloadDigest: OTHER_EVIDENCE_DIGEST } : event
      ),
    };
    expect(() => parseTaskJournal(JSON.parse(JSON.stringify(tampered)) as unknown)).toThrow(
      /integrity check failed/
    );
  });

  it("refuses records that are not task journals", () => {
    expect(() => parseTaskJournal(null)).toThrow(TaskJournalError);
    expect(() => parseTaskJournal({ schemaVersion: 2 })).toThrow(TaskJournalError);
    expect(() => parseTaskJournal({ schemaVersion: 1, recordType: "task-contract" })).toThrow(
      TaskJournalError
    );
  });

  it("refuses an unknown event type", () => {
    const journal = prepared();
    const mutated = {
      ...journal,
      events: [{ ...journal.events[0]!, eventType: "made-up" }],
    };
    expect(() => parseTaskJournal(mutated as unknown)).toThrow(TaskJournalError);
  });
});
