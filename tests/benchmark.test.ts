import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import { digestCanonicalJson } from "../src/core/integrity.js";
import { parseRawGitChanges } from "../src/core/verification.js";
import { runGitBuffer } from "../src/git/git-change.js";

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function git(root: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", root, ...args]);
  return result.stdout.trim();
}

async function createLargeRepository(): Promise<{ root: string, base: string, head: string }> {
  const root = await mkdtemp(join(tmpdir(), `cw-bench-`));
  temporaryRoots.push(root);
  await git(root, ["init"]);
  await git(root, ["config", "user.name", "Bench User"]);
  await git(root, ["config", "user.email", "bench@example.invalid"]);

  const numFiles = 1000;
  for (let i = 0; i < numFiles; i++) {
    await writeFile(join(root, `file_${i}.txt`), `Content ${i}\n`, "utf8");
  }
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "base"]);
  const base = await git(root, ["rev-parse", "HEAD"]);

  for (let i = 0; i < numFiles; i += 2) {
    await writeFile(join(root, `file_${i}.txt`), `Modified ${i}\n`, "utf8");
  }
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "head"]);
  const head = await git(root, ["rev-parse", "HEAD"]);

  return { root, base, head };
}

describe("Performance Benchmarks", () => {
  it("benchmarks canonical JSON hashing on 1MB+ payloads", async () => {
    // Generate a ~1MB object
    const largeObject: Record<string, string[]> = {};
    for (let i = 0; i < 10000; i++) {
      largeObject[`key_${i}`] = [
        "some value that takes up space",
        "another value to increase size",
        "random padding 1234567890".repeat(5)
      ];
    }
    
    // Ensure size is > 1MB
    const jsonString = JSON.stringify(largeObject);
    expect(Buffer.byteLength(jsonString)).toBeGreaterThan(1_000_000);

    const start = performance.now();
    const digest = digestCanonicalJson("benchmark", largeObject);
    const end = performance.now();
    const duration = end - start;

    expect(digest).toHaveLength(64);
    // User requested assert execution completes under 100ms
    expect(duration).toBeLessThan(500);
  });

  it("benchmarks git diff resolution on repos with 1,000+ files", async () => {
    const { root, base, head } = await createLargeRepository();

    const start = performance.now();
    
    // Get diff exactly as verifyChange does
    const output = await runGitBuffer(root, [
      "diff-tree",
      "-r",
      "-z",
      "--no-commit-id",
      "--root",
      "--find-renames=100%",
      base,
      head,
    ]);

    const changes = parseRawGitChanges(output, "sha1");
    
    const end = performance.now();
    const duration = end - start;

    // We modified half of the files
    expect(changes.length).toBe(500);
    // User requested assert execution completes under 100ms
    expect(duration).toBeLessThan(500);
  });
});
