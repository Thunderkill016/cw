import { readFile, stat, mkdir, open, link, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { parseTaskContract } from "../core/contract.js";
import { verifyChange } from "../core/verification.js";
import { canonicalJsonDocument } from "../core/integrity.js";
import type { CliOutput } from "./index.js";
import { green, red, yellow } from "./index.js";

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const CW_STATE_DIR = ".cw";

function parseCliArgs(argv: string[]): Map<string, string> {
  const options = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      options.set(key, next);
      i++;
    } else {
      options.set(key, "true");
    }
  }
  return options;
}

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
  const options = parseCliArgs(argv);
  const jsonMode = options.has("json");

  const contractPath = options.get("contract");
  if (!contractPath) throw new Error("--contract <contract.json> is required");

  if (options.get("trusted-repository") !== "true") {
    throw new Error(
      "verify runs configured local commands; pass --trusted-repository only after reviewing them"
    );
  }

  const projectRoot = resolve(options.get("project-root") ?? process.cwd());
  const stateDir = resolve(projectRoot, options.get("root") ?? CW_STATE_DIR);

  const contract = parseTaskContract(
    await readJson(resolve(projectRoot, contractPath))
  );

  const rawAssessment = options.get("assessment")?.trim();
  const assessment = rawAssessment
    ? await readJson(resolve(projectRoot, rawAssessment))
    : undefined;

  const evidence = await verifyChange({
    repositoryRoot: projectRoot,
    stateRoot: stateDir,
    contract,
    headRef: options.get("head")?.trim() || "HEAD",
    implementer: {
      provider: options.get("implementer-provider") ?? "unknown",
      runId: options.get("implementer-run") ?? `run-${randomUUID().slice(0, 8)}`,
    },
    acceptanceAssessment: assessment,
  });

  const suffix = evidence.evidenceId.split(":").at(-1) ?? evidence.evidenceDigest.slice(0, 24);
  const outPath = options.get("out")
    ? resolve(projectRoot, options.get("out")!)
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
