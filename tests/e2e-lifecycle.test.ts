import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, beforeAll } from "vitest";

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

// Assumes we run `npm run build` before tests or the built CLI is already present.
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
  const root = await mkdtemp(join(tmpdir(), `cw-e2e-${name}-`));
  temporaryRoots.push(root);
  await git(root, ["init"]);
  await git(root, ["config", "user.name", "CW E2E Test"]);
  await git(root, ["config", "user.email", "test@example.invalid"]);
  await writeFile(join(root, "README.md"), "# E2E Root\n", "utf8");
  await writeFile(join(root, ".gitignore"), ".cw/\nassessment.json\n", "utf8");
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "base"]);
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

describe("CLI E2E Lifecycle", () => {
  it("completes full lifecycle: init -> prepare -> verify -> show", async () => {
    const mockCwd = await createRepository("full");

    const resInit = await runCli(mockCwd, ["init", "--json"]);
    expect(resInit.code).toBe(0);
    const initOutput = JSON.parse(resInit.stdout);
    expect(initOutput.initialized).toBe(true);

    const draft = {
      schemaVersion: 1,
      taskId: "test-task",
      sourceRef: null,
      objective: "do something",
      contextPaths: [],
      acceptanceCriteria: [
        { id: "crit-1", description: "Feature complete" }
      ],
      allowedPaths: [
        { kind: "file", path: "src/new.ts" }
      ],
      forbiddenPaths: [],
      constraints: [],
      verificationCommands: [
        {
          id: "build-pass",
          executable: "node",
          arguments: ["-e", "process.exit(0)"],
          relativeWorkingDirectory: ".",
          timeoutMs: 1000,
          maxOutputBytes: 1024
        }
      ]
    };
    const draftPath = join(mockCwd, "draft.json");
    await writeFile(draftPath, JSON.stringify(draft), "utf8");

    // Add draft to git so the tree is clean for prepare
    await git(mockCwd, ["add", "draft.json"]);
    await git(mockCwd, ["commit", "-m", "add draft"]);

    const resPrepare = await runCli(mockCwd, ["prepare", "--spec", "draft.json", "--json"]);
    if (resPrepare.code !== 0) console.error(resPrepare.stderr);
    expect(resPrepare.code).toBe(0);
    
    const prepareOutput = JSON.parse(resPrepare.stdout);
    expect(prepareOutput.contract.taskId).toBe("test-task");
    
    const contractPath = join(mockCwd, ".cw/tasks/test-task/contract.json");
    const stat1 = await stat(contractPath);
    expect(stat1.isFile()).toBe(true);
    
    // Make changes to repository for verification
    await mkdir(join(mockCwd, "src"));
    await writeFile(join(mockCwd, "src/new.ts"), "console.log('hi');\n", "utf8");
    await git(mockCwd, ["add", "src/new.ts"]);
    await git(mockCwd, ["commit", "-m", "implement feature"]);

    // Parse contract directly to get its digest
    const contractRaw = await readFile(contractPath, "utf8");
    const contractObj = JSON.parse(contractRaw);

    const headSha = await git(mockCwd, ["rev-parse", "HEAD"]);
    const baseSha = contractObj.repository.baseSha;

    const assessment = {
      schemaVersion: 1,
      recordType: "acceptance-assessment",
      taskId: "test-task",
      contractDigest: contractObj.contractDigest,
      baseSha,
      headSha,
      reviewer: {
        provider: "mock-reviewer",
        runId: "run-1"
      },
      criteria: [
        {
          criterionId: "crit-1",
          status: "passed",
          summary: "Looks good",
          evidenceRefs: ["mock-ref"]
        }
      ],
      constraints: [],
      findings: [],
      completedAt: new Date().toISOString()
    };
    const assessmentPath = join(mockCwd, "assessment.json");
    await writeFile(assessmentPath, JSON.stringify(assessment), "utf8");

    const resVerify = await runCli(mockCwd, [
      "verify",
      "--contract", ".cw/tasks/test-task/contract.json",
      "--assessment", "assessment.json",
      "--trusted-repository",
      "--implementer-provider", "test-prov",
      "--implementer-run", "test-run",
      "--json"
    ]);

    if (resVerify.code !== 0) console.error("verify failed", resVerify.code, resVerify.stderr, resVerify.stdout);
    expect(resVerify.code).toBe(0);
    const verifyOutput = JSON.parse(resVerify.stdout);
    expect(verifyOutput.evidence.verdict).toBe("accepted");
    
    const evidencePath = verifyOutput.path;
    const stat2 = await stat(evidencePath);
    expect(stat2.isFile()).toBe(true);

    const resShow = await runCli(mockCwd, ["show", "--file", evidencePath, "--json"]);
    expect(resShow.code).toBe(0);
    
    const showOutput = JSON.parse(resShow.stdout);
    expect(showOutput.recordType).toBe("verification-evidence");
  });

  it("handles corrupted contracts properly", async () => {
    const mockCwd = await createRepository("corrupt");
    await runCli(mockCwd, ["init", "--json"]);
    
    const badContractPath = join(mockCwd, "bad-contract.json");
    await writeFile(badContractPath, "{ bad json", "utf8");

    const resVerify = await runCli(mockCwd, [
      "verify",
      "--contract", badContractPath,
      "--trusted-repository"
    ]);
    
    expect(resVerify.code).not.toBe(0);
    expect(resVerify.stderr).toMatch(/Error:/);
  });

  it("handles missing evidence on show", async () => {
    const mockCwd = await createRepository("missing");
    const resShow = await runCli(mockCwd, ["show", "--file", "does-not-exist.json", "--json"]);
    
    expect(resShow.code).not.toBe(0);
    expect(resShow.stderr).toMatch(/Error:/);
  });
});
