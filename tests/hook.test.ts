import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runHook } from "../src/cli/hook.js";
import { resolve, join } from "node:path";
import { mkdir, writeFile, rm, access } from "node:fs/promises";
import { constants } from "node:fs";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe("CLI - hook", () => {
  let io: any;
  let stdoutData: string;
  let stderrData: string;
  const originalCwd = process.cwd;
  const originalArgv1 = process.argv[1];
  let tempDir: string;

  beforeEach(async () => {
    stdoutData = "";
    stderrData = "";
    io = {
      stdout: (msg: string) => { stdoutData += msg; },
      stderr: (msg: string) => { stderrData += msg; },
    };

    // Create a temporary directory that looks like a git repo
    tempDir = resolve(__dirname, "mock-git-hook-" + Math.random().toString(36).substring(7));
    await mkdir(join(tempDir, ".git", "hooks"), { recursive: true });

    process.cwd = () => tempDir;
    process.argv[1] = resolve(tempDir, "node_modules", "cw", "dist", "cli", "index.js");
  });

  afterEach(async () => {
    process.cwd = originalCwd;
    process.argv[1] = originalArgv1;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("fails if .git/hooks does not exist", async () => {
    await rm(join(tempDir, ".git"), { recursive: true, force: true });
    
    const code = await runHook(["install"], io);
    expect(code).toBe(1);
    expect(stderrData).toContain(".git/hooks directory not found");
  });

  it("requires install or remove command", async () => {
    const code = await runHook(["unknown"], io);
    expect(code).toBe(1);
    expect(stderrData).toContain("Hook command must be 'install' or 'remove'");
  });

  it("installs hooks successfully", async () => {
    const code = await runHook(["install"], io);
    expect(code).toBe(0);
    
    const preCommitPath = join(tempDir, ".git", "hooks", "pre-commit");
    const prePushPath = join(tempDir, ".git", "hooks", "pre-push");
    
    expect(await exists(preCommitPath)).toBe(true);
    expect(await exists(prePushPath)).toBe(true);
    
    expect(stdoutData).toContain("Installed pre-commit and pre-push hooks");
  });

  it("removes hooks successfully", async () => {
    const preCommitPath = join(tempDir, ".git", "hooks", "pre-commit");
    const prePushPath = join(tempDir, ".git", "hooks", "pre-push");
    
    await writeFile(preCommitPath, "test");
    await writeFile(prePushPath, "test");
    
    const code = await runHook(["remove"], io);
    expect(code).toBe(0);
    
    expect(await exists(preCommitPath)).toBe(false);
    expect(await exists(prePushPath)).toBe(false);
    
    expect(stdoutData).toContain("Removed pre-commit and pre-push hooks");
  });

  it("refuses to overwrite foreign hooks without --force", async () => {
    const preCommitPath = join(tempDir, ".git", "hooks", "pre-commit");
    // Simulate an existing Husky hook (no cw-hook marker)
    await writeFile(preCommitPath, "#!/bin/sh\n# husky\nnpx lint-staged\n");

    const code = await runHook(["install"], io);
    expect(code).toBe(1);
    expect(stderrData).toContain("was not created by cw");
    expect(stderrData).toContain("--force");
  });

  it("overwrites foreign hooks when --force is passed", async () => {
    const preCommitPath = join(tempDir, ".git", "hooks", "pre-commit");
    await writeFile(preCommitPath, "#!/bin/sh\n# husky\nnpx lint-staged\n");

    const code = await runHook(["install", "--force"], io);
    expect(code).toBe(0);
    expect(stdoutData).toContain("Installed pre-commit and pre-push hooks");
    expect(stderrData).toContain("Overwriting");
  });

  it("allows re-install of cw-owned hooks without --force", async () => {
    // First install
    await runHook(["install"], io);
    stdoutData = "";
    stderrData = "";

    // Re-install (hooks contain # cw-hook marker, should succeed)
    const code = await runHook(["install"], io);
    expect(code).toBe(0);
    expect(stdoutData).toContain("Installed pre-commit and pre-push hooks");
  });
});
