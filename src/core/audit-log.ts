import { sha256Hex, digestCanonicalJson } from "./integrity.js";
import { computeMerkleRoot, generateMerkleProof, MerkleEntry, MerkleProofNode } from "./merkle.js";

export interface AuditEntry {
  sequenceNumber: number;
  timestamp: string;
  eventType: "contract-created" | "verification-started" | "verification-completed" | "provenance-recorded" | "evidence-exported";
  payloadDigest: string;
  previousDigest: string;
  entryDigest: string;
}

export interface AuditLog {
  schemaVersion: 1;
  logId: string;
  entries: AuditEntry[];
  merkleRoot: string;
}

export function createAuditLog(logId: string): AuditLog {
  return {
    schemaVersion: 1,
    logId,
    entries: [],
    merkleRoot: "",
  };
}

function computeEntryDigest(
  sequenceNumber: number,
  timestamp: string,
  eventType: string,
  payloadDigest: string,
  previousDigest: string
): string {
  const payload = {
    sequenceNumber,
    timestamp,
    eventType,
    payloadDigest,
    previousDigest,
  };
  return digestCanonicalJson("cw-audit-entry", payload);
}

export function appendEntry(
  log: AuditLog,
  eventType: AuditEntry["eventType"],
  payloadDigest: string
): AuditLog {
  const sequenceNumber = log.entries.length;
  const previousDigest =
    sequenceNumber > 0 ? log.entries[sequenceNumber - 1]!.entryDigest : sha256Hex("");
  const timestamp = new Date().toISOString();

  const entryDigest = computeEntryDigest(
    sequenceNumber,
    timestamp,
    eventType,
    payloadDigest,
    previousDigest
  );

  const newEntry: AuditEntry = {
    sequenceNumber,
    timestamp,
    eventType,
    payloadDigest,
    previousDigest,
    entryDigest,
  };

  const newEntries = [...log.entries, newEntry];

  const merkleEntries: MerkleEntry[] = newEntries.map((e) => ({
    path: `entry-${e.sequenceNumber}`,
    hash: e.entryDigest,
  }));

  const merkleRoot = computeMerkleRoot(merkleEntries) ?? "";

  return {
    ...log,
    entries: newEntries,
    merkleRoot,
  };
}

export function verifyLogIntegrity(log: AuditLog): boolean {
  if (log.entries.length === 0) {
    return log.merkleRoot === "";
  }

  let expectedPrevious = sha256Hex("");
  const merkleEntries: MerkleEntry[] = [];

  for (const entry of log.entries) {
    if (entry.previousDigest !== expectedPrevious) return false;

    const computedDigest = computeEntryDigest(
      entry.sequenceNumber,
      entry.timestamp,
      entry.eventType,
      entry.payloadDigest,
      entry.previousDigest
    );
    if (computedDigest !== entry.entryDigest) return false;

    merkleEntries.push({
      path: `entry-${entry.sequenceNumber}`,
      hash: entry.entryDigest,
    });
    expectedPrevious = entry.entryDigest;
  }

  const computedRoot = computeMerkleRoot(merkleEntries) ?? "";
  return computedRoot === log.merkleRoot;
}

export function getInclusionProof(
  log: AuditLog,
  sequenceNumber: number
): MerkleProofNode[] | null {
  if (sequenceNumber < 0 || sequenceNumber >= log.entries.length) return null;

  const merkleEntries: MerkleEntry[] = log.entries.map((e) => ({
    path: `entry-${e.sequenceNumber}`,
    hash: e.entryDigest,
  }));

  return generateMerkleProof(merkleEntries, `entry-${sequenceNumber}`);
}
