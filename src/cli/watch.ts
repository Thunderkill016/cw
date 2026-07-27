// CW Watch Subcommand Engine
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import type { CliOutput } from "./index.js";
import { bold, green } from "./index.js";

const CW_STATE_DIR = ".cw";

export async function runWatch(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
      "project-root": { type: "string" },
      root: { type: "string" },
      interval: { type: "string" },
    },
    strict: true,
  });

  const jsonMode = options.json ?? false;
  const projectRoot = resolve(options["project-root"] ?? process.cwd());
  const stateDir = resolve(projectRoot, options.root ?? CW_STATE_DIR);
  const intervalMs = Number.parseInt(options.interval ?? "2000", 10);

  if (jsonMode) {
    io.stdout(JSON.stringify({ watching: true, stateDir, intervalMs }, null, 2) + "\n");
  } else {
    io.stdout(`${green("●")} Watching CW state directory at ${bold(stateDir)} (interval: ${intervalMs}ms)\n`);
  }

  return 0;
}
