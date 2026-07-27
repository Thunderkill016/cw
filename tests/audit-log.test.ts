import { describe, it, expect } from "vitest";
import { createAuditLog, appendEntry, verifyLogIntegrity, getInclusionProof } from "../src/core/audit-log.js";
import { sha256Hex } from "../src/core/integrity.js";
import { verifyMerkleProof, MerkleEntry, computeMerkleRoot } from "../src/core/merkle.js";

describe("Audit Log", () => {
  it("creates, appends, and verifies audit log", () => {
    let log = createAuditLog("log-123");
    expect(verifyLogIntegrity(log)).toBe(true);

    const payload1 = sha256Hex("payload 1");
    log = appendEntry(log, "contract-created", payload1);
    expect(verifyLogIntegrity(log)).toBe(true);
    expect(log.entries.length).toBe(1);
    expect(log.entries[0]!.sequenceNumber).toBe(0);

    const payload2 = sha256Hex("payload 2");
    log = appendEntry(log, "verification-started", payload2);
    expect(verifyLogIntegrity(log)).toBe(true);
    expect(log.entries.length).toBe(2);
    expect(log.entries[1]!.previousDigest).toBe(log.entries[0]!.entryDigest);

    // Test Merkle proof
    const proof = getInclusionProof(log, 0);
    expect(proof).not.toBeNull();
    if (proof) {
      const isValidProof = verifyMerkleProof(
        log.merkleRoot,
        "entry-0",
        log.entries[0]!.entryDigest,
        proof
      );
      expect(isValidProof).toBe(true);
    }

    // Tamper with log
    const tamperedLog = JSON.parse(JSON.stringify(log));
    tamperedLog.entries[0]!.payloadDigest = sha256Hex("tampered");
    expect(verifyLogIntegrity(tamperedLog)).toBe(false);
  });
});
