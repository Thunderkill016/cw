import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { AcceptanceAssessmentV1 } from "../src/core/assessment.js";
import {
  verificationEvidenceDigest,
  verifyChange,
  type VerificationEvidenceV1,
} from "../src/core/verification.js";
import { sha256Hex } from "../src/core/integrity.js";
import { prepareTaskContract, type TaskContractV1 } from "../src/core/contract.js";

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

async function createRepository(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `cyclewarden-change-${name}-`));
  temporaryRoots.push(root);
  await git(root, ["init"]);
  await git(root, ["config", "user.name", "CycleWarden Test"]);
  await git(root, ["config", "user.email", "cyclewarden@example.invalid"]);
  await writeFile(join(root, "README.md"), "# Fixture\n", "utf8");
  await git(root, ["add", "README.md"]);
  await git(root, ["commit", "-m", "base"]);
  return root;
}

function contractDraft(
  verificationSource = "process.exit(0)",
  maxOutputBytes = 16_384
) {
  return {
    schemaVersion: 1,
    taskId: "task-verify",
    sourceRef: "issue:57",
    objective: "Create a bounded verified result",
    contextPaths: ["README.md"],
    acceptanceCriteria: [{ id: "AC-01", description: "The result is correct." }],
    allowedPaths: [{ kind: "directory", path: "docs" }],
    forbiddenPaths: [{ kind: "file", path: "docs/private.md" }],
    constraints: [],
    verificationCommands: [
      {
        id: "fixture-check",
        executable: process.execPath,
        arguments: ["-e", verificationSource],
        relativeWorkingDirectory: ".",
        timeoutMs: 10_000,
        maxOutputBytes,
      },
    ],
  };
}

async function prepare(
  root: string,
  verificationSource?: string,
  maxOutputBytes?: number
): Promise<TaskContractV1> {
  return await prepareTaskContract({
    repositoryRoot: root,
    stateRoot: join(root, ".cyclewarden"),
    draft: contractDraft(verificationSource, maxOutputBytes),
    preparedBy: "owner+codex",
    preparedAt: "2026-07-26T00:00:00.000Z",
  });
}

function assessment(
  contract: TaskContractV1,
  headSha: string,
  runId = "review-run-1",
  status: "passed" | "failed" | "inconclusive" = "passed"
): AcceptanceAssessmentV1 {
  return {
    schemaVersion: 1,
    recordType: "acceptance-assessment",
    taskId: contract.taskId,
    contractDigest: contract.contractDigest,
    baseSha: contract.repository.baseSha,
    headSha,
    reviewer: { provider: "codex", runId },
    criteria: [
      {
        criterionId: "AC-01",
        status,
        summary: status === "passed" ? "Reviewed the exact committed diff." : "Could not establish.",
        evidenceRefs: ["git:docs/result.md"],
      },
    ],
    constraints: [],
    findings: [],
    completedAt: "2026-07-26T00:01:00.000Z",
  };
}

async function commitFile(root: string, path: string, content: string): Promise<string> {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), content, "utf8");
  await git(root, ["add", "--all"]);
  await git(root, ["commit", "-m", `change ${JSON.stringify(path)}`]);
  return await git(root, ["rev-parse", "HEAD"]);
}

async function verify(
  root: string,
  contract: TaskContractV1,
  headSha: string,
  options: {
    implementerRunId?: string;
    reviewerRunId?: string;
    acceptanceStatus?: "passed" | "failed" | "inconclusive";
  } = {}
): Promise<VerificationEvidenceV1> {
  return await verifyChange({
    repositoryRoot: root,
    stateRoot: join(root, ".cyclewarden"),
    contract,
    headRef: "HEAD",
    implementer: {
      provider: "codex",
      runId: options.implementerRunId ?? "implementation-run-1",
    },
    acceptanceAssessment: assessment(
      contract,
      headSha,
      options.reviewerRunId,
      options.acceptanceStatus
    ),
  });
}

describe("change verification", () => {
  it("accepts an in-scope committed change and binds full output evidence", async () => {
    const root = await createRepository("accepted");
    const output = "x".repeat(100);
    const contract = await prepare(root, `process.stdout.write(${JSON.stringify(output)})`, 16);
    const headSha = await commitFile(root, "docs/result.md", "ok\n");

    const evidence = await verify(root, contract, headSha);

    expect(evidence.verdict).toBe("accepted");
    expect(evidence.subject.baseSha).toBe(contract.repository.baseSha);
    expect(evidence.subject.headSha).toBe(headSha);
    expect(evidence.subject.changes).toMatchObject([
      { path: "docs/result.md", kind: "added", oldMode: null, newMode: "100644" },
    ]);
    expect(evidence.checks[0]).toMatchObject({
      status: "passed",
      workspaceUnchanged: true,
      stdout: {
        digest: sha256Hex(output),
        byteLength: 100,
        previewTruncated: true,
      },
    });
    expect(verificationEvidenceDigest(evidence)).toBe(evidence.evidenceDigest);
  });

  it("rejects forbidden and outside-scope changes without running checks", async () => {
    const root = await createRepository("scope");
    const contract = await prepare(root);
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "docs-private-placeholder"), "outside\n", "utf8");
    await writeFile(join(root, "src", "escape.ts"), "export {};\n", "utf8");
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs", "private.md"), "forbidden\n", "utf8");
    await git(root, ["add", "--all"]);
    await git(root, ["commit", "-m", "escape scope"]);
    const headSha = await git(root, ["rev-parse", "HEAD"]);

    const evidence = await verify(root, contract, headSha);

    expect(evidence.verdict).toBe("rejected");
    expect(evidence.scope.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "src/escape.ts", reason: "outside-allowed-scope" }),
        expect.objectContaining({ path: "docs/private.md", reason: "inside-forbidden-scope" }),
      ])
    );
    expect(evidence.checks).toHaveLength(0);
  });

  it("requires distinct implementer and verifier runs and complete acceptance", async () => {
    const root = await createRepository("roles");
    const contract = await prepare(root);
    const headSha = await commitFile(root, "docs/result.md", "ok\n");

    const sameRun = await verify(root, contract, headSha, {
      implementerRunId: "shared-run",
      reviewerRunId: "shared-run",
    });
    expect(sameRun.verdict).toBe("inconclusive");
    expect(sameRun.actors.separation).toBe("not-established");

    const inconclusiveAcceptance = await verify(root, contract, headSha, {
      acceptanceStatus: "inconclusive",
    });
    expect(inconclusiveAcceptance.verdict).toBe("inconclusive");
  });

  it("rejects a verification command that mutates the committed checkout", async () => {
    const root = await createRepository("mutation");
    const contract = await prepare(
      root,
      "require('node:fs').writeFileSync('docs/result.md','mutated\\n')"
    );
    const headSha = await commitFile(root, "docs/result.md", "ok\n");

    const evidence = await verify(root, contract, headSha);

    expect(evidence.verdict).toBe("rejected");
    expect(evidence.checks[0]?.workspaceUnchanged).toBe(false);
    expect(evidence.unresolvedRisks.join("\n")).toMatch(/changed tracked/);
  });

  it("parses NUL-delimited filenames and fails closed on changed symlinks", async () => {
    const newlineRoot = await createRepository("newline");
    const newlineContract = await prepare(newlineRoot);
    const newlinePath = "docs/line\nbreak.md";
    const newlineHead = await commitFile(newlineRoot, newlinePath, "ok\n");
    const newlineEvidence = await verify(newlineRoot, newlineContract, newlineHead);
    expect(newlineEvidence.verdict).toBe("accepted");
    expect(newlineEvidence.subject.changes[0]?.path).toBe(newlinePath);

    const symlinkRoot = await createRepository("symlink");
    const symlinkContract = await prepare(symlinkRoot);
    await mkdir(join(symlinkRoot, "docs"), { recursive: true });
    await symlink("../../outside", join(symlinkRoot, "docs", "escape"));
    await git(symlinkRoot, ["add", "--all"]);
    await git(symlinkRoot, ["commit", "-m", "add symlink"]);
    const symlinkHead = await git(symlinkRoot, ["rev-parse", "HEAD"]);
    const symlinkEvidence = await verify(symlinkRoot, symlinkContract, symlinkHead);
    expect(symlinkEvidence.verdict).toBe("inconclusive");
    expect(symlinkEvidence.unresolvedRisks.join("\n")).toMatch(/symlink is unsupported/);
  });

  it("records renames as delete/add plus deletes, mode changes, spaces, and leading dashes", async () => {
    const root = await createRepository("path-kinds");
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs", "old.txt"), "rename me\n", "utf8");
    await writeFile(join(root, "docs", "delete.txt"), "delete me\n", "utf8");
    await writeFile(join(root, "docs", "mode.sh"), "#!/bin/sh\n", "utf8");
    await git(root, ["add", "--all"]);
    await git(root, ["commit", "-m", "add path fixtures"]);
    const contract = await prepare(root);

    await git(root, ["mv", "docs/old.txt", "docs/new name.txt"]);
    await rm(join(root, "docs", "delete.txt"));
    await chmod(join(root, "docs", "mode.sh"), 0o755);
    await writeFile(join(root, "docs", "-leading.txt"), "safe path\n", "utf8");
    await git(root, ["add", "--all"]);
    await git(root, ["commit", "-m", "exercise path kinds"]);
    const headSha = await git(root, ["rev-parse", "HEAD"]);

    const evidence = await verify(root, contract, headSha);

    expect(evidence.verdict).toBe("accepted");
    expect(evidence.subject.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "docs/old.txt", kind: "deleted" }),
        expect.objectContaining({ path: "docs/new name.txt", kind: "added" }),
        expect.objectContaining({ path: "docs/delete.txt", kind: "deleted" }),
        expect.objectContaining({
          path: "docs/mode.sh",
          kind: "modified",
          oldMode: "100644",
          newMode: "100755",
        }),
        expect.objectContaining({ path: "docs/-leading.txt", kind: "added" }),
      ])
    );
  });
});
