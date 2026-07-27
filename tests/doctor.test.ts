import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, beforeAll } from "vitest";

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

const cliPath = join(process.cwd(), "dist/cli/index.js");

beforeAll(async () => {
  try {
    await stat(cliPath);
  } catch {
    await execFileAsync("npm", ["run", "build"], { cwd: process.cwd() });
  }
});

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function git(root: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", root, ...args]);
  return result.stdout.trim();
}

async function createRepository(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `cw-doctor-${name}-`));
  temporaryRoots.push(root);
  await git(root, ["init"]);
  await git(root, ["config", "user.name", "CW Doctor Test"]);
  await git(root, ["config", "user.email", "test@example.invalid"]);
  return root;
}

async function runCli(cwd: string, args: string[]): Promise<{ code: number, stdout: string, stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("node", [cliPath, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (error: any) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? (error.message || "")
    };
  }
}

describe("CLI Doctor", () => {
  it("doctor reports git version correctly and missing cw state", async () => {
    const root = await createRepository("basic");
    const res = await runCli(root, ["doctor", "--json"]);
    expect(res.code).toBe(1); // missing .cw/
    const data = JSON.parse(res.stdout);
    
    const gitCheck = data.checks.find((c: any) => c.name === "Git installed");
    expect(gitCheck.passed).toBe(true);
    expect(gitCheck.message).toContain("Git");

    const repoCheck = data.checks.find((c: any) => c.name === "Git repository");
    expect(repoCheck.passed).toBe(true);
  });

  it("doctor reports missing git repo", async () => {
    const root = await mkdtemp(join(tmpdir(), `cw-doctor-nogit-`));
    temporaryRoots.push(root);
    
    const res = await runCli(root, ["doctor", "--json"]);
    expect(res.code).toBe(1);
    const data = JSON.parse(res.stdout);
    
    const repoCheck = data.checks.find((c: any) => c.name === "Git repository");
    expect(repoCheck.passed).toBe(false);
    expect(repoCheck.message).toContain("not found");
  });

  it("doctor succeeds when all checks pass", async () => {
    const root = await createRepository("success");
    await runCli(root, ["init", "--json"]); // creates .cw
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "echo test" } }), "utf8");
    await writeFile(join(root, "package-lock.json"), "{}", "utf8");
    
    const res = await runCli(root, ["doctor", "--json"]);
    expect(res.code).toBe(0);
    const data = JSON.parse(res.stdout);
    expect(data.passed).toBe(true);
    
    const pmCheck = data.checks.find((c: any) => c.name === "Package manager");
    expect(pmCheck.passed).toBe(true);
    expect(pmCheck.message).toContain("npm");
  });
});
