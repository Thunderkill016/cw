import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export class PersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceError";
  }
}

/**
 * Atomically writes data to a file by writing to a temporary file first
 * and then renaming it.
 */
export async function writeAtomicJson(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    const jsonStr = JSON.stringify(data, null, 2) + "\n";
    await fs.writeFile(tmpPath, jsonStr, { encoding: "utf8" });
    
    // Atomic rename replaces the destination file if it exists, without deleting the destination first
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    // Attempt to clean up temp file if something fails
    try {
      await fs.unlink(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new PersistenceError(`Failed to atomically write ${filePath}: ${msg}`);
  }
}

/**
 * Resolves the directory path for a specific cycle state.
 */
export function resolveCycleStateDir(baseDir: string, cycleId: string): string {
  if (!cycleId || !/^[a-zA-Z0-9_-]+$/.test(cycleId)) {
    throw new PersistenceError(`Invalid cycle ID: ${cycleId}`);
  }
  return path.join(baseDir, "cycles", cycleId);
}

/**
 * Persists cycle metadata atomically.
 */
export async function persistCycleMetadata(baseDir: string, cycleId: string, metadata: unknown): Promise<void> {
  const cycleDir = resolveCycleStateDir(baseDir, cycleId);
  const metadataPath = path.join(cycleDir, "metadata.json");
  await writeAtomicJson(metadataPath, metadata);
}
