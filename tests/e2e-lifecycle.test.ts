import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, beforeAll } from "vitest";
import { appendTaskEvent, taskEventId } from "../src/core/task-journal.js";
import { readTaskJournal, writeTaskJournal } from "../src/store/persistence.js";

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
  await writeFile(join(root, ".gitignore"), ".forge/\nassessment.json\n", "utf8");
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
          arguments: ["--version"],
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
    
    const contractPath = join(mockCwd, ".forge/tasks/test-task/contract.json");
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
      "--contract", ".forge/tasks/test-task/contract.json",
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

    // The lifecycle must be durable on disk, not re-derived from a directory listing.
    const journalRaw = await readFile(join(mockCwd, ".forge/tasks/test-task/journal.json"), "utf8");
    const journal = JSON.parse(journalRaw);
    expect(journal.recordType).toBe("task-journal");
    expect(journal.state).toBe("accepted");
    expect(journal.events.map((e: { eventType: string }) => e.eventType)).toEqual([
      "contract-prepared",
      "verification-started",
      "verification-completed",
    ]);
    expect(journal.events[1].correlationId).toBe("test-run");
    expect(journal.events[2].payloadDigest).toBe(verifyOutput.evidence.evidenceDigest);
    expect(journal.merkleRoot).toMatch(/^[a-f0-9]{64}$/);

    // status must read that journal rather than guessing.
    const resStatus = await runCli(mockCwd, ["status", "--json"]);
    expect(resStatus.code).toBe(0);
    const statusOutput = JSON.parse(resStatus.stdout);
    expect(statusOutput.tasks[0]).toMatchObject({
      taskId: "test-task",
      state: "accepted",
      events: 3,
      journalVerified: true,
    });

    // audit must verify the real chain, and report the tasks it checked.
    const resAudit = await runCli(mockCwd, ["audit", "verify", "--json"]);
    expect(resAudit.code).toBe(0);
    const auditOutput = JSON.parse(resAudit.stdout);
    expect(auditOutput.verified).toBe(true);
    expect(auditOutput.tasksChecked).toBe(1);

    // An accepted task is closed: verifying it again must fail closed.
    const resReverify = await runCli(mockCwd, [
      "verify",
      "--contract", ".forge/tasks/test-task/contract.json",
      "--trusted-repository",
    ]);
    expect(resReverify.code).not.toBe(0);
    expect(resReverify.stderr).toMatch(/cannot be verified again/);
  });

  it("status honours --project-root and --root instead of assuming the cwd", async () => {
    const mockCwd = await createRepository("flags");
    await runCli(mockCwd, ["init", "--json"]);

    // Run from a directory that is not the project, addressing it by flag only.
    const elsewhere = await mkdtemp(join(tmpdir(), "forge-e2e-elsewhere-"));
    temporaryRoots.push(elsewhere);

    const res = await runCli(elsewhere, ["status", "--project-root", mockCwd, "--json"]);
    expect(res.code).toBe(0);
    const output = JSON.parse(res.stdout);
    expect(output.stateRoot).toBe(join(mockCwd, ".forge"));
    expect(output.totalTasks).toBe(0);
  });

  it("resumes a verification that died before recording a verdict", async () => {
    const mockCwd = await createRepository("resume");
    await runCli(mockCwd, ["init", "--json"]);

    const draft = {
      schemaVersion: 1,
      taskId: "resume-task",
      sourceRef: null,
      objective: "resume after a crashed verification",
      contextPaths: [],
      acceptanceCriteria: [{ id: "crit-1", description: "done" }],
      allowedPaths: [{ kind: "directory", path: "src" }],
      forbiddenPaths: [],
      constraints: [],
      verificationCommands: [
        {
          id: "noop",
          executable: "node",
          arguments: ["--version"],
          relativeWorkingDirectory: ".",
          timeoutMs: 5000,
          maxOutputBytes: 1024,
        },
      ],
    };
    await writeFile(join(mockCwd, "draft.json"), JSON.stringify(draft), "utf8");
    await git(mockCwd, ["add", "draft.json"]);
    await git(mockCwd, ["commit", "-m", "add draft"]);
    expect((await runCli(mockCwd, ["prepare", "--spec", "draft.json", "--json"])).code).toBe(0);

    // Simulate a verify process killed after it recorded verification-started:
    // the journal is left in `verifying` with no verdict.
    const stateRoot = join(mockCwd, ".forge");
    const crashed = appendTaskEvent(
      (await readTaskJournal(stateRoot, "resume-task"))!,
      taskEventId("resume-task", "verification-started", "1".repeat(64)),
      {
        eventType: "verification-started",
        toState: "verifying",
        payloadDigest: "1".repeat(64),
        actor: "crashed-run",
        source: "forge verify",
        correlationId: "dead-run",
      }
    );
    await writeTaskJournal(stateRoot, crashed);
    expect(crashed.state).toBe("verifying");

    // The next verify must resume rather than fail on an illegal
    // verifying -> verifying transition.
    const res = await runCli(mockCwd, [
      "verify",
      "--contract", ".forge/tasks/resume-task/contract.json",
      "--trusted-repository",
      "--implementer-run", "after-crash",
    ]);
    expect(res.stderr).toMatch(/Resuming: a previous verification did not record a verdict/);
    expect(res.code).toBe(3); // inconclusive: no independent assessment supplied

    const resumed = await readTaskJournal(stateRoot, "resume-task");
    expect(resumed?.state).toBe("implementing");
    expect(resumed!.events.length).toBe(crashed.events.length + 1);

    expect((await runCli(mockCwd, ["audit", "verify", "--json"])).code).toBe(0);
  });

  it("audit verify fails closed when there is no journal to verify", async () => {
    const mockCwd = await createRepository("empty-audit");
    await runCli(mockCwd, ["init", "--json"]);

    const res = await runCli(mockCwd, ["audit", "verify"]);
    // Reporting success over an empty log would be a false assurance.
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/nothing to verify/);
  });

  it("records a rejected verdict and allows the task to be verified again", async () => {
    const mockCwd = await createRepository("rejected");
    await runCli(mockCwd, ["init", "--json"]);

    const draft = {
      schemaVersion: 1,
      taskId: "scoped-task",
      sourceRef: null,
      objective: "only touch src",
      contextPaths: [],
      acceptanceCriteria: [{ id: "crit-1", description: "Feature complete" }],
      allowedPaths: [{ kind: "directory", path: "src" }],
      forbiddenPaths: [],
      constraints: [],
      verificationCommands: [
        {
          id: "noop",
          executable: "node",
          arguments: ["--version"],
          relativeWorkingDirectory: ".",
          timeoutMs: 5000,
          maxOutputBytes: 1024,
        },
      ],
    };
    await writeFile(join(mockCwd, "draft.json"), JSON.stringify(draft), "utf8");
    await git(mockCwd, ["add", "draft.json"]);
    await git(mockCwd, ["commit", "-m", "add draft"]);

    const resPrepare = await runCli(mockCwd, ["prepare", "--spec", "draft.json", "--json"]);
    expect(resPrepare.code).toBe(0);
    expect(JSON.parse(resPrepare.stdout).state).toBe("prepared");

    // Change a file outside the allowed scope so verification rejects it.
    await writeFile(join(mockCwd, "README.md"), "# touched out of scope\n", "utf8");
    await git(mockCwd, ["add", "README.md"]);
    await git(mockCwd, ["commit", "-m", "out of scope change"]);

    const resVerify = await runCli(mockCwd, [
      "verify",
      "--contract", ".forge/tasks/scoped-task/contract.json",
      "--trusted-repository",
      "--implementer-run", "attempt-1",
    ]);
    expect(resVerify.code).toBe(2); // rejected

    const journal = JSON.parse(
      await readFile(join(mockCwd, ".forge/tasks/scoped-task/journal.json"), "utf8")
    );
    expect(journal.state).toBe("rejected");

    // A rejected task must be able to re-enter the loop, not be bricked.
    const resSecond = await runCli(mockCwd, [
      "verify",
      "--contract", ".forge/tasks/scoped-task/contract.json",
      "--trusted-repository",
      "--implementer-run", "attempt-2",
    ]);
    expect(resSecond.code).toBe(2);

    const journal2 = JSON.parse(
      await readFile(join(mockCwd, ".forge/tasks/scoped-task/journal.json"), "utf8")
    );
    expect(journal2.events.length).toBeGreaterThan(journal.events.length);
    expect(journal2.state).toBe("rejected");

    const resAudit = await runCli(mockCwd, ["audit", "verify", "--json"]);
    expect(resAudit.code).toBe(0);
    expect(JSON.parse(resAudit.stdout).verified).toBe(true);
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
