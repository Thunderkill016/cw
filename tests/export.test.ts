import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runExport } from "../src/cli/export.js";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CliOutput } from "../src/cli/index.js";
import { createHash } from "node:crypto";
import { computeMerkleRoot } from "../src/core/merkle.js";

describe("runExport", () => {
  const projectRoot = process.cwd();
  const cwDir = resolve(projectRoot, ".forge");
  const tasksDir = resolve(cwDir, "tasks");

  let outMessages: string[] = [];
  const io: CliOutput = {
    stdout: (msg) => outMessages.push(msg),
    stderr: (msg) => outMessages.push(msg),
  };

  beforeEach(async () => {
    outMessages = [];
    await rm(cwDir, { recursive: true, force: true });
    await mkdir(tasksDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(cwDir, { recursive: true, force: true });
    await rm(resolve(projectRoot, "test-bundle.json"), { force: true });
    await rm(resolve(projectRoot, "forge-evidence-bundle.json"), { force: true });
  });

  it("exports a bundle with empty tasks", async () => {
    const code = await runExport([], io);
    expect(code).toBe(0);

    const bundlePath = resolve(projectRoot, "forge-evidence-bundle.json");
    const bundleContent = await readFile(bundlePath, "utf8");
    const bundle = JSON.parse(bundleContent);

    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.recordType).toBe("evidence-bundle");
    expect(bundle.merkleRoot).toBeNull();
    expect(bundle.contracts).toEqual([]);
    expect(bundle.evidence).toEqual([]);
  });

  it("bundles contracts and verifications and computes correct merkle root", async () => {
    const taskPath = resolve(tasksDir, "my-task");
    await mkdir(taskPath, { recursive: true });

    const contract = { schemaVersion: 1, taskId: "my-task", recordType: "task-contract" };
    const contractContent = JSON.stringify(contract, null, 2);
    await writeFile(resolve(taskPath, "contract.json"), contractContent);

    const evidence = { schemaVersion: 1, taskId: "my-task", recordType: "verification" };
    const evidenceContent = JSON.stringify(evidence, null, 2);
    await writeFile(resolve(taskPath, "verification-123.json"), evidenceContent);

    // Some non-relevant file
    await writeFile(resolve(taskPath, "other.txt"), "hello");

    const code = await runExport(["--out", "test-bundle.json"], io);
    expect(code).toBe(0);

    const bundlePath = resolve(projectRoot, "test-bundle.json");
    const bundleContent = await readFile(bundlePath, "utf8");
    const bundle = JSON.parse(bundleContent);

    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.recordType).toBe("evidence-bundle");
    expect(bundle.contracts).toHaveLength(1);
    expect(bundle.contracts[0]).toEqual(contract);
    expect(bundle.evidence).toHaveLength(1);
    expect(bundle.evidence[0]).toEqual(evidence);

    const contractHash = createHash("sha256").update(contractContent).digest("hex");
    const evidenceHash = createHash("sha256").update(evidenceContent).digest("hex");

    const expectedRoot = computeMerkleRoot([
      { path: "tasks/my-task/contract.json", hash: contractHash },
      { path: "tasks/my-task/verification-123.json", hash: evidenceHash },
    ]);

    expect(bundle.merkleRoot).toBe(expectedRoot);
    expect(bundle.merkleRoot).toBeTruthy();
  });
});
