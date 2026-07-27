import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { chmod, writeFile, rm, access } from "node:fs/promises";
import { constants } from "node:fs";
import type { CliOutput } from "./index.js";
import { bold, green, red } from "./index.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function runHook(argv: string[], io: CliOutput): Promise<number> {
  const { positionals } = parseArgs({
    args: argv,
    strict: false,
  });

  const command = positionals[0];
  if (command !== "install" && command !== "remove") {
    io.stderr(`${red("Error:")} Hook command must be 'install' or 'remove'\n`);
    return 1;
  }

  const projectRoot = process.cwd();
  const gitHooksDir = resolve(projectRoot, ".git", "hooks");
  
  if (!(await exists(gitHooksDir))) {
    io.stderr(`${red("Error:")} .git/hooks directory not found. Are you in a git repository?\n`);
    return 1;
  }

  const preCommitPath = resolve(gitHooksDir, "pre-commit");
  const prePushPath = resolve(gitHooksDir, "pre-push");
  
  // Need to get the path to the current CLI executable
  const cliPath = process.argv[1] ? resolve(process.argv[1]) : 'npx cw';

  if (command === "install") {
    const preCommitScript = `#!/bin/sh\n# cw-hook\nnode "${cliPath}" diff\n`;
    const prePushScript = `#!/bin/sh\n# cw-hook\nnode "${cliPath}" report --fail-on-rejected\n`;

    await writeFile(preCommitPath, preCommitScript, "utf8");
    await chmod(preCommitPath, 0o755);
    
    await writeFile(prePushPath, prePushScript, "utf8");
    await chmod(prePushPath, 0o755);

    io.stdout(`${green("✓")} Installed pre-commit and pre-push hooks in ${bold(".git/hooks")}\n`);
  } else if (command === "remove") {
    let removed = false;
    
    if (await exists(preCommitPath)) {
      await rm(preCommitPath);
      removed = true;
    }
    
    if (await exists(prePushPath)) {
      await rm(prePushPath);
      removed = true;
    }
    
    if (removed) {
      io.stdout(`${green("✓")} Removed pre-commit and pre-push hooks from ${bold(".git/hooks")}\n`);
    } else {
      io.stdout(`Hooks not found, nothing to remove.\n`);
    }
  }

  return 0;
}
