import { parseArgs } from "node:util";
import { resolve, relative, join } from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { CliOutput } from "./index.js";
import { green } from "./index.js";
import { computeMerkleRoot, type MerkleEntry } from "../core/merkle.js";

const CW_STATE_DIR = ".cw";

export async function runExport(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      out: { type: "string" },
    },
    strict: true,
  });

  const projectRoot = process.cwd();
  const tasksDir = resolve(projectRoot, CW_STATE_DIR, "tasks");
  const outFile = resolve(projectRoot, options.out ?? ".cw-evidence-bundle.json");

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

  const contracts: any[] = [];
  const evidence: any[] = [];
  const merkleEntries: MerkleEntry[] = [];

  for (const taskId of taskIds) {
    const taskPath = resolve(tasksDir, taskId);
    try {
      const taskEntries = await readdir(taskPath, { withFileTypes: true });
      for (const entry of taskEntries) {
        if (!entry.isFile()) continue;

        const filePath = join(taskPath, entry.name);
        const relPath = relative(resolve(projectRoot, CW_STATE_DIR), filePath).split("\\").join("/");
        const content = await readFile(filePath, "utf8");
        const hash = createHash("sha256").update(content).digest("hex");

        if (entry.name === "contract.json") {
          contracts.push(JSON.parse(content));
          merkleEntries.push({ path: relPath, hash });
        } else if (entry.name.startsWith("verification-") && entry.name.endsWith(".json")) {
          evidence.push(JSON.parse(content));
          merkleEntries.push({ path: relPath, hash });
        }
      }
    } catch {
      // ignore
    }
  }

  const merkleRoot = computeMerkleRoot(merkleEntries);

  const bundle = {
    schemaVersion: 1,
    recordType: "evidence-bundle",
    merkleRoot,
    generatedAt: new Date().toISOString(),
    contracts,
    evidence,
  };

  await writeFile(outFile, JSON.stringify(bundle, null, 2) + "\n", "utf8");
  
  io.stdout(`${green("Success:")} Exported bundle to ${outFile}\n`);
  io.stdout(`Included ${contracts.length} contracts and ${evidence.length} evidence records.\n`);
  if (merkleRoot) {
    io.stdout(`Merkle Root: ${merkleRoot}\n`);
  }

  return 0;
}
