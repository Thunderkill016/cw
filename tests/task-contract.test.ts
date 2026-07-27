import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseTaskContract,
  prepareTaskContract,
  taskContractDigest,
  TaskContractError,
} from "../src/core/contract.js";

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

async function repository(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `cyclewarden-contract-${name}-`));
  temporaryRoots.push(root);
  await git(root, ["init"]);
  await git(root, ["config", "user.name", "CycleWarden Test"]);
  await git(root, ["config", "user.email", "cyclewarden@example.invalid"]);
  await writeFile(join(root, "README.md"), "# Fixture\n", "utf8");
  await git(root, ["add", "README.md"]);
  await git(root, ["commit", "-m", "base"]);
  return root;
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    taskId: "task-001",
    sourceRef: "issue:57",
    objective: "Add one bounded documentation result",
    contextPaths: ["README.md"],
    acceptanceCriteria: [{ id: "AC-01", description: "docs/result.md contains ok" }],
    allowedPaths: [{ kind: "directory", path: "docs" }],
    forbiddenPaths: [{ kind: "file", path: "docs/private.md" }],
    constraints: [{ id: "C-01", description: "Do not change runtime code." }],
    verificationCommands: [
      {
        id: "result",
        executable: process.execPath,
        arguments: ["--version"],
        relativeWorkingDirectory: ".",
        timeoutMs: 10_000,
        maxOutputBytes: 16_384,
      },
    ],
    ...overrides,
  };
}

describe("task contract", () => {
  it("pins a clean base commit and detects contract tampering", async () => {
    const root = await repository("prepare");
    const contract = await prepareTaskContract({
      repositoryRoot: root,
      stateRoot: join(root, ".cyclewarden"),
      draft: draft(),
      preparedBy: "owner+codex",
      preparedAt: "2026-07-26T00:00:00.000Z",
    });

    expect(contract.repository.baseSha).toBe(await git(root, ["rev-parse", "HEAD"]));
    expect(contract.repository.baseTreeSha).toBe(await git(root, ["rev-parse", "HEAD^{tree}"]));
    expect(contract.contractDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(parseTaskContract(contract)).toEqual(contract);
    expect(taskContractDigest(contract)).toBe(contract.contractDigest);

    expect(() =>
      parseTaskContract({ ...contract, objective: "silently changed objective" })
    ).toThrow(/digest mismatch/);
  });

  it("rejects dirty bases, traversal, duplicate IDs and command shells", async () => {
    const root = await repository("invalid");
    await writeFile(join(root, "dirty.txt"), "dirty\n", "utf8");
    await expect(
      prepareTaskContract({
        repositoryRoot: root,
        draft: draft(),
        preparedBy: "owner",
      })
    ).rejects.toThrow(/clean Git base/);
    await rm(join(root, "dirty.txt"));

    await expect(
      prepareTaskContract({
        repositoryRoot: root,
        draft: draft({ allowedPaths: [{ kind: "directory", path: "../outside" }] }),
        preparedBy: "owner",
      })
    ).rejects.toThrow(TaskContractError);
    await expect(
      prepareTaskContract({
        repositoryRoot: root,
        draft: draft({
          acceptanceCriteria: [
            { id: "AC-01", description: "one" },
            { id: "AC-01", description: "two" },
          ],
        }),
        preparedBy: "owner",
      })
    ).rejects.toThrow(/IDs must be unique/);
    await expect(
      prepareTaskContract({
        repositoryRoot: root,
        draft: draft({
          verificationCommands: [
            {
              id: "unsafe",
              executable: "bash",
              arguments: ["-lc", "exit 0"],
            },
          ],
        }),
        preparedBy: "owner",
      })
    ).rejects.toThrow(/may not invoke a command shell/);
  });

  it("allows a forbidden path to carve out a broader allowed directory", async () => {
    const root = await repository("carve-out");
    await mkdir(join(root, ".cyclewarden", "tasks"), { recursive: true });
    await writeFile(join(root, ".cyclewarden", "tasks", "draft.json"), "{}\n", "utf8");
    const contract = await prepareTaskContract({
      repositoryRoot: root,
      stateRoot: join(root, ".cyclewarden"),
      draft: draft(),
      preparedBy: "owner",
      preparedAt: "2026-07-26T00:00:00.000Z",
    });
    expect(contract.allowedPaths).toContainEqual({ kind: "directory", path: "docs" });
    expect(contract.forbiddenPaths).toContainEqual({ kind: "file", path: "docs/private.md" });
  });
});
