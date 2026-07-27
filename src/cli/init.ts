import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { CliOutput } from "./index.js";
import { bold, green } from "./index.js";

const CW_STATE_DIR = ".cw";

function getTemplate(type: string): string {
  const taskId = `${type}-task-01`;
  const base = {
    schemaVersion: 1,
    taskId,
    sourceRef: null,
    objective: `Implement a feature in ${type}`,
    contextPaths: ["README.md"],
    acceptanceCriteria: [{ id: "ac1", description: "Feature works as expected" }],
    allowedPaths: [{ kind: "directory", path: "src" }],
    forbiddenPaths: [{ kind: "directory", path: ".github" }],
    constraints: [{ id: "c1", description: "No external dependencies" }],
    verificationCommands: [] as any[]
  };

  if (type === "node") {
    base.allowedPaths.push({ kind: "file", path: "package.json" });
    base.verificationCommands = [{
      command: ["npm", "run", "test"],
      timeoutSeconds: 30,
      env: {},
      network: "host"
    }];
  } else if (type === "python") {
    base.verificationCommands = [{
      command: ["pytest"],
      timeoutSeconds: 30,
      env: {},
      network: "host"
    }];
  } else if (type === "rust") {
    base.allowedPaths.push({ kind: "file", path: "Cargo.toml" });
    base.verificationCommands = [{
      command: ["cargo", "test"],
      timeoutSeconds: 300,
      env: {},
      network: "host"
    }];
  } else if (type === "go") {
    base.allowedPaths.push({ kind: "file", path: "go.mod" });
    base.verificationCommands = [{
      command: ["go", "test", "./..."],
      timeoutSeconds: 30,
      env: {},
      network: "host"
    }];
  } else {
    throw new Error(`Unknown template type: ${type}`);
  }

  return JSON.stringify(base, null, 2) + "\n";
}

export async function runInit(argv: string[], io: CliOutput): Promise<number> {
  const { values: options } = parseArgs({
    args: argv,
    options: {
      json: { type: "boolean" },
      template: { type: "string" },
    },
    strict: true,
  });

  const jsonMode = options.json ?? false;
  const projectRoot = process.cwd();
  const stateDir = resolve(projectRoot, CW_STATE_DIR);

  await mkdir(resolve(stateDir, "tasks"), { recursive: true });
  await mkdir(resolve(stateDir, "evidence", "sha256"), { recursive: true });
  await mkdir(resolve(stateDir, "evidence", "occurrences"), { recursive: true });

  let templatePath = "";
  if (options.template) {
    const content = getTemplate(options.template);
    templatePath = resolve(projectRoot, "task.json");
    await writeFile(templatePath, content, "utf8");
  }

  if (jsonMode) {
    io.stdout(JSON.stringify({ initialized: true, stateDir, template: options.template ? templatePath : null }, null, 2) + "\n");
  } else {
    io.stdout(`${green("✓")} Initialized CW in ${bold(stateDir)}\n`);
    if (options.template) {
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
