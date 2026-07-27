import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runReport } from "../src/cli/report.js";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliOutput } from "../src/cli/index.js";

describe("cw report subcommand", () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "cw-report-test-"));
    const tasksDir = join(projectRoot, ".cw", "tasks", "task-1");
    await mkdir(tasksDir, { recursive: true });

    // Mock contract
    await writeFile(
      join(tasksDir, "contract.json"),
      JSON.stringify({
        schemaVersion: 1,
        recordType: "task-contract",
        taskId: "task-1",
        forbiddenPaths: [{ kind: "file", path: "secret.txt" }],
        repository: { baseSha: "base123", headSha: "head123" }
      })
    );

    // Mock evidence
    await writeFile(
      join(tasksDir, "verification-123.json"),
      JSON.stringify({
        schemaVersion: 1,
        recordType: "verification-evidence",
        evidenceId: "ev-1",
        taskId: "task-1",
        subject: { baseSha: "base123", headSha: "head123", changes: [] },
        verdict: "accepted",
        evidenceDigest: "digest-abc",
        completedAt: new Date().toISOString()
      })
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it("generates markdown report by default", async () => {
    let output = "";
    const io: CliOutput = {
      stdout: (msg: string) => { output += msg; },
      stderr: (msg: string) => { output += msg; },
    };

    const code = await runReport(["--project-root", projectRoot], io);
    expect(code).toBe(0);
    expect(output).toContain("# CW Compliance Report");
    expect(output).toContain("- **Total Tasks**: 1");
    expect(output).toContain("- **Accepted**: 1");
    expect(output).toContain("task-1");
    expect(output).toContain("accepted");
    expect(output).toContain("digest-abc");
  });

  it("generates json report when --json is passed", async () => {
    let output = "";
    const io: CliOutput = {
      stdout: (msg: string) => { output += msg; },
      stderr: (msg: string) => { output += msg; },
    };

    const code = await runReport(["--project-root", projectRoot, "--json"], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(output);
    expect(parsed.summary.totalTasks).toBe(1);
    expect(parsed.summary.accepted).toBe(1);
    expect(parsed.tasks[0].taskId).toBe("task-1");
    expect(parsed.tasks[0].verdict).toBe("accepted");
  });

  it("writes report to file when --out is passed", async () => {
    let output = "";
    const io: CliOutput = {
      stdout: (msg: string) => { output += msg; },
      stderr: (msg: string) => { output += msg; },
    };

    const outPath = join(projectRoot, "report.md");
    const code = await runReport(["--project-root", projectRoot, "--out", outPath], io);
    expect(code).toBe(0);
    expect(output).toContain("Report written to");
    
    const fileContent = await readFile(outPath, "utf8");
    expect(fileContent).toContain("# CW Compliance Report");
    expect(fileContent).toContain("- **Total Tasks**: 1");
  });
});
