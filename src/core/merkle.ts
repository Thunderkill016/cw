import { createHash } from "crypto";

export interface MerkleEntry {
  path: string;
  hash: string;
}

export interface MerkleProofNode {
  hash: string;
  direction: "left" | "right";
}

/**
 * Helper to hash two child nodes.
 */
function hashNodes(left: string, right: string): string {
  const concatenated = left + right;
  return createHash("sha256").update(concatenated).digest("hex");
}

/**
 * Builds a binary Merkle tree with SHA-256 parent node hashing.
 * Sorts entries by path to ensure deterministic tree structure.
 * @param entries Array of file path and hash entries
 * @returns A 2D array where index 0 is the leaves, and the last index is the root array.
 */
export function buildMerkleTree(entries: MerkleEntry[]): string[][] {
  if (entries.length === 0) return [];

  // Sort entries by path to ensure deterministic tree
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const leaves = sorted.map((e) => e.hash);

  const tree: string[][] = [leaves];
  let currentLevel = leaves;

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        nextLevel.push(hashNodes(currentLevel[i] as string, currentLevel[i + 1] as string));
      } else {
        // If odd number of nodes, duplicate the last node
        nextLevel.push(hashNodes(currentLevel[i] as string, currentLevel[i] as string));
      }
    }
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }

  return tree;
}

/**
 * Returns the root digest of the Merkle tree.
 */
export function computeMerkleRoot(entries: MerkleEntry[]): string | null {
  const tree = buildMerkleTree(entries);
  if (tree.length === 0) return null;
  const rootLevel = tree[tree.length - 1];
  return rootLevel ? (rootLevel[0] ?? null) : null;
}

/**
 * Generates an inclusion proof for a specific path.
 */
export function generateMerkleProof(
  entries: MerkleEntry[],
  path: string
): MerkleProofNode[] | null {
  const tree = buildMerkleTree(entries);
  if (tree.length === 0) return null;

  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  let index = sorted.findIndex((e) => e.path === path);
  if (index === -1) return null;

  const proof: MerkleProofNode[] = [];

  for (let i = 0; i < tree.length - 1; i++) {
    const level = tree[i];
    if (!level) continue;
    
    const isRightChild = index % 2 === 1;
    const pairIndex = isRightChild ? index - 1 : index + 1;

    if (pairIndex < level.length) {
      proof.push({
        hash: level[pairIndex] as string,
        direction: isRightChild ? "left" : "right",
      });
    } else {
      // Last odd node, paired with itself
      proof.push({
        hash: level[index] as string,
        direction: "right",
      });
    }
    index = Math.floor(index / 2);
  }

  return proof;
}

/**
 * Validates an inclusion proof.
 */
export function verifyMerkleProof(
  root: string,
  _path: string,
  hash: string,
  proof: MerkleProofNode[]
): boolean {
  if (!root) return false;

  let currentHash = hash;
  for (const node of proof) {
    if (node.direction === "left") {
      currentHash = hashNodes(node.hash, currentHash);
    } else {
      currentHash = hashNodes(currentHash, node.hash);
    }
  }

  return currentHash === root;
}
