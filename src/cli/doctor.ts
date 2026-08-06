import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { CliOutput } from "./index.js";
import { green, red } from "./index.js";
import { resolveDefaultStateRoot } from "../store/runtime-paths.js";
import { readFile } from "node:fs/promises";

const execFileAsync = promisify(execFile);

type CheckResult = {
  name: string;
  passed: boolean;
  message: string;
  value?: string;
};

export async function runDoctor(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
    },
    strict: true,
  });

  const jsonMode = options.json ?? false;
  const projectRoot = process.cwd();
  const checks: CheckResult[] = [];
  let allPassed = true;

  // 1. Git installed
  try {
    const { stdout } = await execFileAsync("git", ["--version"]);
    const version = stdout.trim().replace(/^git version\s+/, "");
    checks.push({ name: "Git installed", passed: true, message: `Git ${version}`, value: version });
  } catch {
    checks.push({ name: "Git installed", passed: false, message: "Git not found in PATH" });
    allPassed = false;
  }

  // 2. Git repo
  try {
    await execFileAsync("git", ["rev-parse", "--git-dir"]);
    checks.push({ name: "Git repository", passed: true, message: "Git repository found" });
  } catch {
    checks.push({ name: "Git repository", passed: false, message: "Git repository not found (run 'git init')" });
    allPassed = false;
  }

  // 3. Node.js version >= 20
  const nodeVersion = process.version;
  const majorStr = nodeVersion.replace(/^v/, "").split(".")[0] || "0";
  const major = parseInt(majorStr, 10);
  if (major >= 20) {
    checks.push({ name: "Node.js version", passed: true, message: `Node.js ${nodeVersion} (>= 20 required)`, value: nodeVersion });
  } else {
    checks.push({ name: "Node.js version", passed: false, message: `Node.js ${nodeVersion} (>= 20 required)`, value: nodeVersion });
    allPassed = false;
  }

  // 4. State directory exists (either the canonical .forge or a legacy .cw store)
  const stateRoot = resolveDefaultStateRoot(projectRoot);
  const stateDirName = basename(stateRoot);
  if (existsSync(stateRoot)) {
    checks.push({
      name: "Forge initialized",
      passed: true,
      message: `Forge initialized (${stateDirName}/ found)`,
      value: stateRoot,
    });
  } else {
    checks.push({
      name: "Forge initialized",
      passed: false,
      message: `Forge not initialized (${stateDirName}/ not found, run 'forge init')`,
    });
    allPassed = false;
  }

  // 5. Package manager
  let pkgManager = "unknown";
  if (existsSync(resolve(projectRoot, "package-lock.json"))) pkgManager = "npm";
  else if (existsSync(resolve(projectRoot, "pnpm-lock.yaml"))) pkgManager = "pnpm";
  else if (existsSync(resolve(projectRoot, "yarn.lock"))) pkgManager = "yarn";
  else if (existsSync(resolve(projectRoot, "bun.lockb"))) pkgManager = "bun";

  if (pkgManager !== "unknown") {
    checks.push({ name: "Package manager", passed: true, message: `Package manager: ${pkgManager}`, value: pkgManager });
  } else {
    checks.push({ name: "Package manager", passed: false, message: "Package manager not detected" });
  }

  // 6. Test runner
  let testRunner = "unknown";
  if (existsSync(resolve(projectRoot, "package.json"))) {
    try {
      const pkg = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));
      const deps = { ...(pkg.devDependencies || {}), ...(pkg.dependencies || {}) };
      if (deps.vitest) testRunner = "vitest";
      else if (deps.jest) testRunner = "jest";
      else if (deps.mocha) testRunner = "mocha";
      else if (deps.ava) testRunner = "ava";
      else if (pkg.scripts?.test) testRunner = "npm test";
    } catch {}
  } else if (existsSync(resolve(projectRoot, "Cargo.toml"))) {
    testRunner = "cargo";
  } else if (existsSync(resolve(projectRoot, "go.mod"))) {
    testRunner = "go test";
  } else if (existsSync(resolve(projectRoot, "pyproject.toml")) || existsSync(resolve(projectRoot, "requirements.txt"))) {
    testRunner = "pytest (guessed)"; // simple fallback
  }

  if (testRunner !== "unknown") {
    checks.push({ name: "Test runner", passed: true, message: `Test runner: ${testRunner}`, value: testRunner });
  } else {
    checks.push({ name: "Test runner", passed: false, message: "Test runner not detected" });
  }

  if (jsonMode) {
    io.stdout(JSON.stringify({ passed: allPassed, checks }, null, 2) + "\n");
  } else {
    for (const check of checks) {
      if (check.passed) {
        io.stdout(`${green("✓")} ${check.message}\n`);
      } else {
        io.stdout(`${red("✗")} ${check.message}\n`);
      }
    }
    io.stdout("\n");
    if (allPassed) {
      io.stdout(`${green("All checks passed!")}\n`);
    } else {
      io.stdout(`${red("Some checks failed.")}\n`);
    }
  }

  return allPassed ? 0 : 1;
}
