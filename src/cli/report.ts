import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { CliOutput } from "./index.js";
import { canonicalGitRoot, runGitText } from "../git/git-change.js";
import { calculateDiffRiskScore } from "../core/risk-scoring.js";
import type { TaskContractV1 } from "../core/contract.js";
import type { VerificationEvidenceV1 } from "../core/verification.js";

const CW_STATE_DIR = ".cw";

export async function runReport(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
      out: { type: "string" },
      "project-root": { type: "string" },
    },
    strict: true,
  });

  const jsonMode = options.json ?? false;
  const projectRoot = options["project-root"] ? resolve(options["project-root"]) : process.cwd();
  
  let repositoryRoot = projectRoot;
  try {
    repositoryRoot = await canonicalGitRoot(projectRoot);
  } catch {
    // Ignore error, might not be a git repo or running in tests
  }
  
  const tasksDir = resolve(projectRoot, CW_STATE_DIR, "tasks");

  let taskIds: string[] = [];
  try {
    const entries = await readdir(tasksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        taskIds.push(entry.name);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  let totalTasks = 0;
  let accepted = 0;
  let rejected = 0;
  let inconclusive = 0;

  const taskReports: any[] = [];

  for (const taskId of taskIds) {
    const taskPath = resolve(tasksDir, taskId);
    let contract: TaskContractV1 | null = null;
    let latestVerification: VerificationEvidenceV1 | null = null;
    let latestTime = 0;

    try {
      const taskEntries = await readdir(taskPath, { withFileTypes: true });
      for (const entry of taskEntries) {
        if (entry.isFile()) {
          if (entry.name === "contract.json") {
             const content = await readFile(resolve(taskPath, entry.name), "utf8");
             try {
               contract = JSON.parse(content) as TaskContractV1;
             } catch {
               // Skip corrupt contract files
             }
          } else if (entry.name.startsWith("verification-") && entry.name.endsWith(".json")) {
             const content = await readFile(resolve(taskPath, entry.name), "utf8");
             try {
               const parsed = JSON.parse(content) as VerificationEvidenceV1;
               const time = new Date(parsed.completedAt || parsed.startedAt || 0).getTime();
               if (time >= latestTime) {
                 latestTime = time;
                 latestVerification = parsed;
               }
             } catch {
               // Skip corrupt evidence files
             }
          }
        }
      }
    } catch {
      // ignore
    }

    if (!contract || !latestVerification) {
      continue;
    }

    totalTasks++;

    if (latestVerification.verdict === "accepted") accepted++;
    else if (latestVerification.verdict === "rejected") rejected++;
    else if (latestVerification.verdict === "inconclusive") inconclusive++;

    const baseSha = latestVerification.subject.baseSha;
    const headSha = latestVerification.subject.headSha;

    let riskScore = 0;
    try {
      // Attempt to get diff text
      const diffText = await runGitText(repositoryRoot, ["diff", baseSha, headSha]);
      const modifiedPaths = latestVerification.subject.changes.map(c => c.path);
      const forbiddenPaths = contract.forbiddenPaths.map(r => r.path);
      
      const risk = calculateDiffRiskScore(diffText, modifiedPaths, forbiddenPaths);
      riskScore = risk.riskScore;
    } catch {
      // If we can't run git diff (e.g. in a test without valid shas), fallback to 0
    }

    taskReports.push({
      taskId,
      verdict: latestVerification.verdict,
      riskScore,
      evidenceDigest: latestVerification.evidenceDigest,
    });
  }

  const reportData = {
    summary: {
      totalTasks,
      accepted,
      rejected,
      inconclusive
    },
    tasks: taskReports
  };

  let outputContent = "";

  if (jsonMode) {
    outputContent = JSON.stringify(reportData, null, 2) + "\n";
  } else {
    outputContent += `# CW Compliance Report\n\n`;
    outputContent += `## Summary\n\n`;
    outputContent += `- **Total Tasks**: ${totalTasks}\n`;
    outputContent += `- **Accepted**: ${accepted}\n`;
    outputContent += `- **Rejected**: ${rejected}\n`;
    outputContent += `- **Inconclusive**: ${inconclusive}\n\n`;
    
    outputContent += `## Tasks\n\n`;
    
    if (taskReports.length === 0) {
      outputContent += `*No verifications found.*\n`;
    } else {
      outputContent += `| Task ID | Verdict | Risk Score | Evidence Digest |\n`;
      outputContent += `|---------|---------|------------|-----------------|\n`;
      for (const t of taskReports) {
        outputContent += `| ${t.taskId} | ${t.verdict} | ${t.riskScore} | \`${t.evidenceDigest}\` |\n`;
      }
    }
  }

  if (options.out) {
    const outPath = resolve(projectRoot, options.out);
    await writeFile(outPath, outputContent, "utf8");
    if (!jsonMode) {
      io.stdout(`Report written to ${outPath}\n`);
    }
  } else {
    io.stdout(outputContent);
  }

  return 0;
}
