import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { chmod, writeFile, rm, access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import type { CliOutput } from "./index.js";
import { bold, green, red, yellow } from "./index.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Marker comment embedded in cw-managed hook scripts. */
const CW_HOOK_MARKER = "# cw-hook";

/**
 * Returns true if the file at `path` was created by cw (contains our marker),
 * or does not exist yet. Returns false if it is an existing hook from another
 * tool (Husky, lint-staged, lefthook, etc.) that should not be overwritten
 * without explicit consent.
 */
async function isCwOwnedOrAbsent(path: string): Promise<boolean> {
  if (!(await exists(path))) return true;
  try {
    const content = await readFile(path, "utf8");
    return content.includes(CW_HOOK_MARKER);
  } catch {
    return false;
  }
}

export async function runHook(argv: string[], io: CliOutput): Promise<number> {
  const { positionals, values: options } = parseArgs({
    args: argv,
    options: {
      force: { type: "boolean" },
    },
    strict: false,
  });

  const command = positionals[0];
  if (command !== "install" && command !== "remove") {
    io.stderr(`${red("Error:")} Hook command must be 'install' or 'remove'\n`);
    return 1;
  }

  const force = options.force ?? false;
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
    // Guard: refuse to overwrite hooks owned by other tools unless --force is passed.
    // This prevents silent destruction of Husky, lint-staged, or lefthook setups.
    const hookPaths = [
      { name: "pre-commit", path: preCommitPath },
      { name: "pre-push", path: prePushPath },
    ];
    for (const hook of hookPaths) {
      if (!force && !(await isCwOwnedOrAbsent(hook.path))) {
        io.stderr(
          `${red("Error:")} Existing ${bold(hook.name)} hook was not created by cw.\n` +
          `  Use ${bold("cw hook install --force")} to overwrite it.\n`
        );
        return 1;
      }
    }

    const preCommitScript = `#!/bin/sh\n${CW_HOOK_MARKER}\nnode "${cliPath}" diff\n`;
    const prePushScript = `#!/bin/sh\n${CW_HOOK_MARKER}\nnode "${cliPath}" report --fail-on-rejected\n`;

    // Log overwrite warnings when --force replaces foreign hooks.
    for (const hook of hookPaths) {
      if (force && (await exists(hook.path)) && !(await isCwOwnedOrAbsent(hook.path))) {
        io.stderr(`${yellow("Warning:")} Overwriting existing ${bold(hook.name)} hook (--force)\n`);
      }
    }

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
