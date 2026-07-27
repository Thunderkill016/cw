import { describe, it, expect } from "vitest";
import {
  buildMerkleTree,
  computeMerkleRoot,
  generateMerkleProof,
  verifyMerkleProof,
  MerkleEntry,
} from "../src/core/merkle.js";
import { createHash } from "crypto";

function hashString(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

describe("Merkle Tree Verification Engine", () => {
  it("should handle an empty tree", () => {
    const entries: MerkleEntry[] = [];
    expect(buildMerkleTree(entries)).toEqual([]);
    expect(computeMerkleRoot(entries)).toBeNull();
    expect(generateMerkleProof(entries, "any")).toBeNull();
  });

  it("should handle a single node tree", () => {
    const entries: MerkleEntry[] = [
      { path: "file1.txt", hash: hashString("content1") },
    ];
    const tree = buildMerkleTree(entries);
    expect(tree.length).toBe(1);
    expect(tree[0].length).toBe(1);
    expect(computeMerkleRoot(entries)).toBe(entries[0].hash);

    const proof = generateMerkleProof(entries, "file1.txt");
    expect(proof).toEqual([]);
    
    expect(verifyMerkleProof(entries[0].hash, "file1.txt", entries[0].hash, proof!)).toBe(true);
  });

  it("should build a balanced tree and verify proofs", () => {
    const entries: MerkleEntry[] = [
      { path: "a.txt", hash: hashString("a") },
      { path: "b.txt", hash: hashString("b") },
      { path: "c.txt", hash: hashString("c") },
      { path: "d.txt", hash: hashString("d") },
    ];

    const root = computeMerkleRoot(entries);
    expect(root).toBeTypeOf("string");

    // Verify proof for each entry
    for (const entry of entries) {
      const proof = generateMerkleProof(entries, entry.path);
      expect(proof).not.toBeNull();
      expect(verifyMerkleProof(root!, entry.path, entry.hash, proof!)).toBe(true);
    }
  });

  it("should build an unbalanced tree and verify proofs", () => {
    const entries: MerkleEntry[] = [
      { path: "a.txt", hash: hashString("a") },
      { path: "b.txt", hash: hashString("b") },
      { path: "c.txt", hash: hashString("c") },
    ];

    const root = computeMerkleRoot(entries);
    expect(root).toBeTypeOf("string");

    for (const entry of entries) {
      const proof = generateMerkleProof(entries, entry.path);
      expect(proof).not.toBeNull();
      expect(verifyMerkleProof(root!, entry.path, entry.hash, proof!)).toBe(true);
    }
  });

  it("should fail validation for tamper detection", () => {
    const entries: MerkleEntry[] = [
      { path: "a.txt", hash: hashString("a") },
      { path: "b.txt", hash: hashString("b") },
    ];

    const root = computeMerkleRoot(entries);
    const proof = generateMerkleProof(entries, "a.txt");
    
    // Tamper with the hash
    const tamperedHash = hashString("tampered");
    expect(verifyMerkleProof(root!, "a.txt", tamperedHash, proof!)).toBe(false);

    // Tamper with the proof
    const tamperedProof = [...proof!];
    if (tamperedProof.length > 0) {
      tamperedProof[0] = { ...tamperedProof[0], hash: hashString("tampered") };
    }
    expect(verifyMerkleProof(root!, "a.txt", entries[0].hash, tamperedProof)).toBe(false);
  });

  it("should sort entries by path deterministically", () => {
    const entries1: MerkleEntry[] = [
      { path: "b.txt", hash: hashString("b") },
      { path: "a.txt", hash: hashString("a") },
    ];
    const entries2: MerkleEntry[] = [
      { path: "a.txt", hash: hashString("a") },
      { path: "b.txt", hash: hashString("b") },
    ];

    const root1 = computeMerkleRoot(entries1);
    const root2 = computeMerkleRoot(entries2);
    expect(root1).toBe(root2);
  });
});
