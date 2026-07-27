import { readFile, stat, mkdir, open, link, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseTaskContract } from "../core/contract.js";
import { verifyChange } from "../core/verification.js";
import { canonicalJsonDocument } from "../core/integrity.js";
import type { CliOutput } from "./index.js";
import { green, red, yellow } from "./index.js";

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const CW_STATE_DIR = ".cw";



async function readJson(path: string): Promise<unknown> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`not a regular file: ${path}`);
  if (info.size > MAX_INPUT_BYTES) throw new Error(`file exceeds ${MAX_INPUT_BYTES} bytes: ${path}`);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function writeJsonExclusive(path: string, value: unknown): Promise<void> {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const temporary = resolve(parent, `.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(canonicalJsonDocument(value), "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await link(temporary, path);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "EEXIST"
    ) {
      throw new Error(`refusing to overwrite existing record: ${path}`);
    }
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true });
  }
}

export async function runVerify(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
      "project-root": { type: "string" },
      root: { type: "string" },
      contract: { type: "string" },
      assessment: { type: "string" },
      "trusted-repository": { type: "boolean" },
      head: { type: "string" },
      "implementer-provider": { type: "string" },
      "implementer-run": { type: "string" },
      out: { type: "string" },
    },
    strict: true,
  });

  const jsonMode = options.json ?? false;

  const contractPath = options.contract;
  if (!contractPath) throw new Error("--contract <contract.json> is required");

  if (!options["trusted-repository"]) {
    throw new Error(
      "verify runs configured local commands; pass --trusted-repository only after reviewing them"
    );
  }

  const projectRoot = resolve(options["project-root"] ?? process.cwd());
  const stateDir = resolve(projectRoot, options.root ?? CW_STATE_DIR);

  const contract = parseTaskContract(
    await readJson(resolve(projectRoot, contractPath))
  );

  const rawAssessment = options.assessment?.trim();
  const assessment = rawAssessment
    ? await readJson(resolve(projectRoot, rawAssessment))
    : undefined;

  // Emit progress so the user knows verification is running.
  // Bounded commands can take up to MAX_TIMEOUT_MS (30 min); without this message
  // the CLI would appear frozen during long build or test runs.
  if (!jsonMode) {
    io.stderr(`Running verification for task: ${contract.taskId} …\n`);
    io.stderr(`  Commands: ${contract.verificationCommands.map((c) => c.id).join(", ") || "(none)"}\n`);
  }

  const evidence = await verifyChange({
    repositoryRoot: projectRoot,
    stateRoot: stateDir,
    contract,
    headRef: options.head?.trim() || "HEAD",
    implementer: {
      provider: options["implementer-provider"] ?? "unknown",
      runId: options["implementer-run"] ?? `run-${randomUUID().slice(0, 8)}`,
    },
    acceptanceAssessment: assessment,
  });

  const suffix = evidence.evidenceId.split(":").at(-1) ?? evidence.evidenceDigest.slice(0, 24);
  const outPath = options.out
    ? resolve(projectRoot, options.out)
    : resolve(
        stateDir,
        "tasks",
        contract.taskId,
        `verification-${evidence.subject.headSha.slice(0, 12)}-${suffix}.json`
      );

  await writeJsonExclusive(outPath, evidence);

  if (jsonMode) {
    io.stdout(canonicalJsonDocument({ path: outPath, evidence }));
  } else {
    const verdictColor =
      evidence.verdict === "accepted" ? green
        : evidence.verdict === "rejected" ? red
          : yellow;
    io.stdout(`${verdictColor(`● ${evidence.verdict.toUpperCase()}`)}\n`);
    io.stdout(`  Task: ${contract.taskId}\n`);
    io.stdout(`  Changes: ${evidence.subject.changes.length} files\n`);
    io.stdout(`  Scope: ${evidence.scope.status}\n`);
    io.stdout(`  Checks: ${evidence.checks.length} passed\n`);
    if (evidence.unresolvedRisks.length > 0) {
      io.stdout(`  Risks:\n`);
      for (const risk of evidence.unresolvedRisks.slice(0, 5)) {
        io.stdout(`    - ${risk}\n`);
      }
    }
    io.stdout(`  Evidence: ${outPath}\n`);
  }

  return evidence.verdict === "accepted" ? 0 : evidence.verdict === "rejected" ? 2 : 3;
}
