import { readdir, rm, stat, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import type { CliOutput } from "./index.js";
import { bold, green, yellow } from "./index.js";
import { resolveStateRoot } from "../store/runtime-paths.js";

export async function runClean(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
      "project-root": { type: "string" },
      root: { type: "string" },
      "dry-run": { type: "boolean" },
      all: { type: "boolean" },
    },
    strict: true,
  });

  const jsonMode = options.json ?? false;
  const dryRun = options["dry-run"] ?? false;
  const all = options.all ?? false;
  const projectRoot = resolve(options["project-root"] ?? process.cwd());
  const stateDir = resolveStateRoot(projectRoot, options.root);

  const deletedFiles: string[] = [];
  const deletedDirs: string[] = [];

  async function walkAndClean(dir: string, depth = 0) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walkAndClean(fullPath, depth + 1);
        
        if (depth >= 1) {
          try {
            const children = await readdir(fullPath);
            if (children.length === 0) {
              if (!dryRun) await rm(fullPath, { recursive: true, force: true });
              deletedDirs.push(fullPath);
            }
          } catch {}
        }
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".tmp")) {
          if (!dryRun) await rm(fullPath, { force: true });
          deletedFiles.push(fullPath);
        } else if (entry.name.startsWith("verification-") && entry.name.endsWith(".json")) {
          try {
            const content = await readFile(fullPath, "utf8");
            const data = JSON.parse(content);
            if (data.verdict !== "accepted") {
              if (!dryRun) await rm(fullPath, { force: true });
              deletedFiles.push(fullPath);
            }
          } catch {
            if (!dryRun) await rm(fullPath, { force: true });
            deletedFiles.push(fullPath);
          }
        }
      }
    }
  }

  if (all) {
    try {
      const exists = await stat(stateDir).then(() => true).catch(() => false);
      if (exists) {
        if (!dryRun) {
          await rm(stateDir, { recursive: true, force: true });
        }
        deletedDirs.push(stateDir);
      }
    } catch (e) {
      io.stderr(`Error checking state directory: ${(e as Error).message}\n`);
      return 1;
    }
  } else {
    await walkAndClean(stateDir, 0);
  }

  const result = {
    dryRun,
    all,
    deletedFiles,
    deletedDirs,
  };

  if (jsonMode) {
    io.stdout(JSON.stringify(result, null, 2) + "\n");
  } else {
    if (deletedFiles.length === 0 && deletedDirs.length === 0) {
      io.stdout("No files or directories to clean.\n");
    } else {
      if (dryRun) {
        io.stdout(`${bold(yellow("Dry run"))}: The following would be deleted:\n`);
      } else {
        io.stdout(`${bold(green("Cleaned"))}:\n`);
      }
      for (const f of deletedFiles) {
        io.stdout(`  - [File] ${f}\n`);
      }
      for (const d of deletedDirs) {
        io.stdout(`  - [Dir]  ${d}\n`);
      }
    }
  }

  return 0;
}
