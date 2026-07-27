import { resolve } from "node:path";
import { generateRepoMap } from "../core/repo-map.js";
import { CliOutput, bold, green } from "./index.js";

export async function runMap(argv: string[], io: CliOutput): Promise<number> {
  const isJson = argv.includes("--json");
  let projectRoot = process.cwd();

  const rootIndex = argv.indexOf("--project-root");
  if (rootIndex !== -1 && rootIndex + 1 < argv.length) {
    projectRoot = resolve(argv[rootIndex + 1]!);
  }

  try {
    const result = generateRepoMap(projectRoot);

    if (isJson) {
      io.stdout(JSON.stringify(result.nodes, null, 2) + "\n");
    } else {
      io.stdout(`${bold(green("Repository Map:"))}\n\n`);
      io.stdout(result.summary + "\n");
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`Error generating repo map: ${message}\n`);
    return 1;
  }
}
