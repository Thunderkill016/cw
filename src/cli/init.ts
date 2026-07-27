import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import type { CliOutput } from "./index.js";
import { bold, green, red } from "./index.js";
import { existsSync } from "node:fs";

const CW_STATE_DIR = ".cw";

async function detectProjectType(projectRoot: string): Promise<string | null> {
  if (existsSync(join(projectRoot, "package.json"))) return "node";
  if (existsSync(join(projectRoot, "Cargo.toml"))) return "rust";
  if (existsSync(join(projectRoot, "go.mod"))) return "go";
  if (existsSync(join(projectRoot, "pyproject.toml")) || existsSync(join(projectRoot, "requirements.txt")) || existsSync(join(projectRoot, "setup.py"))) return "python";
  if (existsSync(join(projectRoot, "deno.json")) || existsSync(join(projectRoot, "deno.jsonc"))) return "deno";
  return null;
}

async function detectTestRunner(projectType: string, projectRoot: string): Promise<{ executable: string, arguments: string[] }> {
  if (projectType === "node") {
    try {
      const pkgJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
      if (pkgJson.scripts?.test) {
        return { executable: "npm", arguments: ["test"] };
      }
      const deps = { ...(pkgJson.devDependencies || {}), ...(pkgJson.dependencies || {}) };
      if (deps.vitest) return { executable: "npx", arguments: ["vitest", "run"] };
      if (deps.jest) return { executable: "npx", arguments: ["jest"] };
      if (deps.mocha) return { executable: "npx", arguments: ["mocha"] };
      if (deps.ava) return { executable: "npx", arguments: ["ava"] };
    } catch {
      // ignore parsing errors
    }
    return { executable: "npm", arguments: ["test"] };
  }
  if (projectType === "python") {
    try {
      if (existsSync(join(projectRoot, "pyproject.toml"))) {
        const content = await readFile(join(projectRoot, "pyproject.toml"), "utf8");
        if (content.includes("pytest")) return { executable: "pytest", arguments: [] };
      }
      if (existsSync(join(projectRoot, "requirements.txt"))) {
        const content = await readFile(join(projectRoot, "requirements.txt"), "utf8");
        if (content.includes("pytest")) return { executable: "pytest", arguments: [] };
      }
    } catch {
      // ignore
    }
    return { executable: "python", arguments: ["-m", "unittest"] };
  }
  if (projectType === "rust") {
    return { executable: "cargo", arguments: ["test"] };
  }
  if (projectType === "go") {
    return { executable: "go", arguments: ["test", "./..."] };
  }
  if (projectType === "deno") {
    return { executable: "deno", arguments: ["test"] };
  }
  return { executable: "echo", arguments: ["no test runner detected"] };
}

async function detectSourceDirectories(projectType: string, projectRoot: string): Promise<string[]> {
  const dirs = [];
  if (projectType === "node") {
    for (const d of ["src", "lib", "app"]) {
      if (existsSync(join(projectRoot, d))) {
        const stats = await stat(join(projectRoot, d));
        if (stats.isDirectory()) dirs.push(d);
      }
    }
  } else if (projectType === "python") {
    // Simplification: just returning src or .
    if (existsSync(join(projectRoot, "src"))) {
      dirs.push("src");
    } else {
      dirs.push(".");
    }
  } else {
    if (existsSync(join(projectRoot, "src"))) dirs.push("src");
    else dirs.push(".");
  }
  return dirs.length > 0 ? dirs : ["."];
}

type TaskPathRule = { kind: "file" | "directory"; path: string };

function getTemplate(type: string, cmd: { executable: string, arguments: string[] } | null, sourceDirs: string[]): string {
  const taskId = `${type}-task-01`;
  const base = {
    schemaVersion: 1,
    taskId,
    sourceRef: null,
    objective: `Implement a feature in ${type}`,
    contextPaths: ["README.md"],
    acceptanceCriteria: [{ id: "ac1", description: "Feature works as expected" }],
    allowedPaths: sourceDirs.map(d => ({ kind: "directory" as const, path: d })) as TaskPathRule[],
    forbiddenPaths: [{ kind: "directory" as const, path: ".github" }] as TaskPathRule[],
    constraints: [{ id: "c1", description: "No external dependencies" }],
    verificationCommands: [] as any[]
  };

  if (type === "node") {
    if (!base.allowedPaths.some(p => p.path === "package.json")) {
       base.allowedPaths.push({ kind: "file", path: "package.json" });
    }
  } else if (type === "rust") {
    base.allowedPaths.push({ kind: "file", path: "Cargo.toml" });
  } else if (type === "go") {
    base.allowedPaths.push({ kind: "file", path: "go.mod" });
  }

  const defaultCmd = cmd || { executable: "npm", arguments: ["test"] };

  base.verificationCommands = [{
    id: "test",
    executable: defaultCmd.executable,
    arguments: defaultCmd.arguments,
    relativeWorkingDirectory: ".",
    timeoutMs: 30000,
    maxOutputBytes: 65536
  }];

  return JSON.stringify(base, null, 2) + "\n";
}

export async function runInit(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
      template: { type: "string" },
      auto: { type: "boolean" },
    },
    strict: true,
  });

  const jsonMode = options.json ?? false;
  const projectRoot = process.cwd();
  const stateDir = resolve(projectRoot, CW_STATE_DIR);

  let templatePath = "";
  let detectedType = "";
  let detectedRunner = "";
  let detectedSources: string[] = [];

  if (options.auto) {
    const pType = await detectProjectType(projectRoot);
    if (!pType) {
      if (jsonMode) {
        io.stdout(JSON.stringify({ error: "Could not auto-detect project type. Please use --template." }) + "\n");
      } else {
        io.stderr(`${red("Error:")} Could not auto-detect project type.\nSuggestion: use ${bold("--template <type>")} instead.\n`);
      }
      return 1;
    }
    detectedType = pType;
    const testCmd = await detectTestRunner(pType, projectRoot);
    detectedRunner = `${testCmd.executable} ${testCmd.arguments.join(" ")}`;
    detectedSources = await detectSourceDirectories(pType, projectRoot);
    
    const content = getTemplate(pType, testCmd, detectedSources);
    templatePath = resolve(projectRoot, "task.json");
    await writeFile(templatePath, content, "utf8");
  } else if (options.template) {
    let testCmd = { executable: "npm", arguments: ["test"] };
    if (options.template === "python") testCmd = { executable: "pytest", arguments: [] };
    else if (options.template === "rust") testCmd = { executable: "cargo", arguments: ["test"] };
    else if (options.template === "go") testCmd = { executable: "go", arguments: ["test", "./..."] };
    else if (options.template === "node") testCmd = { executable: "npm", arguments: ["run", "test"] };
    
    const content = getTemplate(options.template, testCmd, ["src"]);
    templatePath = resolve(projectRoot, "task.json");
    await writeFile(templatePath, content, "utf8");
  }

  await mkdir(resolve(stateDir, "tasks"), { recursive: true });
  await mkdir(resolve(stateDir, "evidence", "sha256"), { recursive: true });
  await mkdir(resolve(stateDir, "evidence", "occurrences"), { recursive: true });

  if (jsonMode) {
    io.stdout(JSON.stringify({ initialized: true, stateDir, template: (options.template || options.auto) ? templatePath : null }, null, 2) + "\n");
  } else {
    io.stdout(`${green("✓")} Initialized CW in ${bold(stateDir)}\n`);
    if (options.auto) {
      io.stdout(`${green("✓")} Auto-detected project type: ${bold(detectedType)}\n`);
      io.stdout(`${green("✓")} Auto-detected test runner: ${bold(detectedRunner)}\n`);
      io.stdout(`${green("✓")} Auto-detected source directories: ${bold(detectedSources.join(", "))}\n`);
    }
    if (options.template || options.auto) {
      io.stdout(`${green("✓")} Created template ${bold("task.json")}\n`);
    }
    io.stdout(`\n`);
    io.stdout(`Next steps:\n`);
    io.stdout(`  1. Create a task spec:  ${bold("cw prepare --spec task.json")}\n`);
    io.stdout(`  2. Let your AI agent implement the task\n`);
    io.stdout(`  3. Verify the result:   ${bold("cw verify --contract .cw/tasks/<id>/contract.json")}\n`);
    io.stdout(`\n`);
    io.stdout(`Add ${bold(".cw/")} to your .gitignore if you don't want to track state.\n`);
  }

  return 0;
}
