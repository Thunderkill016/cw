import { describe, it, expect } from "vitest";
import { createProvenanceRecord, verifyProvenanceRecord } from "../src/core/provenance.js";
import { sha256Hex } from "../src/core/integrity.js";

describe("Provenance", () => {
  it("creates and verifies a provenance record", () => {
    const record = createProvenanceRecord({
      taskId: "task-123",
      contractDigest: sha256Hex("some contract content"),
      aiProvenance: {
        model: "test-model",
        provider: "test-provider",
        sessionId: "session-abc",
        promptDigest: sha256Hex("some prompt"),
      },
    });

    expect(record.taskId).toBe("task-123");
    expect(record.aiProvenance.model).toBe("test-model");
    expect(record.provenanceDigest).toBeDefined();

    expect(verifyProvenanceRecord(record)).toBe(true);

    // Tamper with the record
    const tampered = {
      ...record,
      aiProvenance: {
        ...record.aiProvenance,
        model: "tampered-model",
      },
    };

    expect(verifyProvenanceRecord(tampered)).toBe(false);
  });
});
