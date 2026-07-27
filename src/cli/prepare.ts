import { readFile, stat, mkdir, open, link, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { prepareTaskContract } from "../core/contract.js";
import { canonicalJsonDocument } from "../core/integrity.js";
import type { CliOutput } from "./index.js";
import { bold, green } from "./index.js";

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

export async function runPrepare(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
      "project-root": { type: "string" },
      root: { type: "string" },
      spec: { type: "string" },
      base: { type: "string" },
      actor: { type: "string" },
      out: { type: "string" },
    },
    strict: true,
  });

  const jsonMode = options.json ?? false;

  const specPath = options.spec;
  if (!specPath) throw new Error("--spec <draft.json> is required");

  const projectRoot = resolve(options["project-root"] ?? process.cwd());
  const stateDir = resolve(projectRoot, options.root ?? CW_STATE_DIR);
  const baseRef = options.base?.trim() || "HEAD";
  const actor = options.actor?.trim() || "cw-preparer";

  const draft = await readJson(resolve(projectRoot, specPath));

  const contract = await prepareTaskContract({
    repositoryRoot: projectRoot,
    stateRoot: stateDir,
    draft,
    baseRef,
    preparedBy: actor,
  });

  const outPath = options.out
    ? resolve(projectRoot, options.out)
    : resolve(stateDir, "tasks", contract.taskId, "contract.json");

  await writeJsonExclusive(outPath, contract);

  if (jsonMode) {
    io.stdout(canonicalJsonDocument({ path: outPath, contract }));
  } else {
    io.stdout(`${green("✓")} Contract prepared: ${bold(contract.taskId)}\n`);
    io.stdout(`  Objective: ${contract.objective}\n`);
    io.stdout(`  Base: ${contract.repository.baseSha.slice(0, 12)}\n`);
    io.stdout(`  Digest: ${contract.contractDigest.slice(0, 16)}…\n`);
    io.stdout(`  Saved: ${outPath}\n`);
  }

  return 0;
}
