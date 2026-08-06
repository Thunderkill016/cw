import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runClean } from "../src/cli/clean.js";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CliOutput } from "../src/cli/index.js";

describe("cw clean", () => {
  const testRoot = resolve(process.cwd(), ".forge-test-clean-" + randomUUID());
  
  let stdout = "";
  let stderr = "";
  const io: CliOutput = {
    stdout: (msg) => { stdout += msg; },
    stderr: (msg) => { stderr += msg; }
  };

  beforeEach(async () => {
    stdout = "";
    stderr = "";
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it("should remove temporary files and non-accepted verifications", async () => {
    const tasksDir = join(testRoot, "tasks", "task-1");
    await mkdir(tasksDir, { recursive: true });
    
    // Create a temporary file
    await writeFile(join(testRoot, ".123.tmp"), "temp");
    await writeFile(join(tasksDir, ".456.tmp"), "temp2");
    
    // Create an accepted verification
    await writeFile(join(tasksDir, "verification-abc-def.json"), JSON.stringify({ verdict: "accepted" }));
    
    // Create a rejected verification
    await writeFile(join(tasksDir, "verification-abc-rej.json"), JSON.stringify({ verdict: "rejected" }));
    
    // Create a contract
    await writeFile(join(tasksDir, "contract.json"), "{}");

    const code = await runClean(["--root", testRoot, "--json"], io);
    expect(code).toBe(0);
    
    const output = JSON.parse(stdout);
    expect(output.deletedFiles).toHaveLength(3);
    
    expect(output.deletedFiles.some((f: string) => f.includes(".123.tmp"))).toBe(true);
    expect(output.deletedFiles.some((f: string) => f.includes(".456.tmp"))).toBe(true);
    expect(output.deletedFiles.some((f: string) => f.includes("verification-abc-rej.json"))).toBe(true);
    
    expect(output.deletedFiles.some((f: string) => f.includes("verification-abc-def.json"))).toBe(false);
    expect(output.deletedFiles.some((f: string) => f.includes("contract.json"))).toBe(false);
  });

  it("should do dry run correctly", async () => {
    const tasksDir = join(testRoot, "tasks", "task-2");
    await mkdir(tasksDir, { recursive: true });
    
    await writeFile(join(tasksDir, ".456.tmp"), "temp2");
    await writeFile(join(tasksDir, "verification-abc-rej.json"), JSON.stringify({ verdict: "rejected" }));
    
    const code = await runClean(["--root", testRoot, "--json", "--dry-run"], io);
    expect(code).toBe(0);
    
    const output = JSON.parse(stdout);
    expect(output.dryRun).toBe(true);
    expect(output.deletedFiles).toHaveLength(2);
    
    // Ensure files are still there
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(tasksDir);
    expect(files).toContain(".456.tmp");
    expect(files).toContain("verification-abc-rej.json");
  });

  it("should remove all state data with --all flag", async () => {
    await mkdir(join(testRoot, "tasks", "task-3"), { recursive: true });
    await writeFile(join(testRoot, "tasks", "task-3", "contract.json"), "{}");
    
    const code = await runClean(["--root", testRoot, "--json", "--all"], io);
    expect(code).toBe(0);
    
    const output = JSON.parse(stdout);
    expect(output.all).toBe(true);
    expect(output.deletedDirs).toContain(testRoot);
    
    // Directory should be gone
    let exists = true;
    try {
      const { stat } = await import("node:fs/promises");
      await stat(testRoot);
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});
