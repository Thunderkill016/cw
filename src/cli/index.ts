#!/usr/bin/env node

import { resolve } from "node:path";
import { runInit } from "./init.js";
import { runDoctor } from "./doctor.js";
import { runPrepare } from "./prepare.js";
import { runVerify } from "./verify.js";
import { runShow } from "./show.js";
import { runStatus } from "./status.js";
import { runList } from "./list.js";
import { runDiff } from "./diff.js";
import { runWatch } from "./watch.js";
import { runReport } from "./report.js";
import { runClean } from "./clean.js";
import { runExport } from "./export.js";
import { runMap } from "./map.js";
import { runProvenance } from "./provenance.js";
import { runAudit } from "./audit.js";

const VERSION = "0.3.0";

const HELP = `forge — Atoryn Forge: deterministic contracts, task lifecycle and independent
        verification for AI-assisted code changes

Usage:
  forge init                              Initialize Forge in the current project (use --auto to detect project type)
  forge doctor                            Check environment health and dependencies
  forge prepare --spec <draft.json>       Create a deterministic task contract
  forge verify  --contract <contract.json> Verify an AI implementation against contract
  forge show    --file <record.json>      Inspect a contract or evidence record
  forge diff    --contract <contract.json> Evaluate Git tree changes against baseSha
  forge map                               Generate a context map of repository symbols
  forge list                              List all task contracts, states and verifications
  forge report                            Generate a compliance report of all tasks
  forge export                            Export contracts and evidence to a bundle
  forge status                            Show a dashboard of tasks and their lifecycle state
  forge clean                             Clean temporary files and rejected runs
  forge provenance                        Manage AI provenance records
  forge audit                             Inspect and verify the task lifecycle journals
  forge help                              Show this help message
  forge version                           Show version

Options:
  --json          Machine-readable JSON output
  --project-root  Project root directory (default: cwd)
  --root          Forge state directory (default: .forge, or an existing .cw)

Examples:
  $ forge init
  $ forge prepare --spec task.json
  $ forge verify --contract .forge/tasks/my-task/contract.json \\
                 --implementer-provider cursor --implementer-run session-123 \\
                 --trusted-repository
  $ forge status
  $ forge audit verify

Exit codes for verify:
  0  accepted
  2  rejected
  3  inconclusive

The 'cw' command is kept as an alias of 'forge'.
`;

function bold(text: string): string {
  if (process.env["NO_COLOR"] || !process.stdout.isTTY) return text;
  return `\x1b[1m${text}\x1b[0m`;
}

function green(text: string): string {
  if (process.env["NO_COLOR"] || !process.stdout.isTTY) return text;
  return `\x1b[32m${text}\x1b[0m`;
}

function red(text: string): string {
  if (process.env["NO_COLOR"] || !process.stdout.isTTY) return text;
  return `\x1b[31m${text}\x1b[0m`;
}

function yellow(text: string): string {
  if (process.env["NO_COLOR"] || !process.stdout.isTTY) return text;
  return `\x1b[33m${text}\x1b[0m`;
}

export type CliOutput = {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

export { bold, green, red, yellow };

async function main(): Promise<number> {
  const rawArgs = process.argv.slice(2);
  const command = rawArgs[0];

  const io: CliOutput = {
    stdout: (msg) => process.stdout.write(msg),
    stderr: (msg) => process.stderr.write(msg),
  };

  if (!command || command === "help" || command === "--help" || command === "-h") {
    io.stdout(HELP);
    return 0;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    io.stdout(`atoryn-forge ${VERSION}\n`);
    return 0;
  }

  const commandArgs = rawArgs.slice(1);

  try {
    switch (command) {
      case "doctor":
        return await runDoctor(commandArgs, io);
      case "init":
        return await runInit(commandArgs, io);
      case "prepare":
        return await runPrepare(commandArgs, io);
      case "verify":
        return await runVerify(commandArgs, io);
      case "show":
        return await runShow(commandArgs, io);
      case "status":
        return await runStatus(commandArgs, io);
      case "list":
        return await runList(commandArgs, io);
      case "diff":
        return await runDiff(commandArgs, io);
      case "map":
        return await runMap(commandArgs, io);
      case "export":
        return await runExport(commandArgs, io);
      case "watch":
        return await runWatch(commandArgs, io);
      case "report":
        return await runReport(commandArgs, io);
      case "clean":
        return await runClean(commandArgs, io);
      case "provenance":
        return await runProvenance(commandArgs, io);
      case "audit":
        return await runAudit(commandArgs, io);
      default:
        io.stderr(`${red("Error:")} Unknown command: ${command}\n`);
        io.stderr(`Run ${bold("forge help")} for usage information.\n`);
        return 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`${red("Error:")} ${message}\n`);
    return 1;
  }
}

import { fileURLToPath } from "node:url";

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
}
