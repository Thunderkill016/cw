import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createProvenanceRecord, ProvenanceRecord } from "../core/provenance.js";
import { resolveDefaultStateRoot } from "../store/runtime-paths.js";
import { sha256Hex } from "../core/integrity.js";
import type { CliOutput } from "./index.js";
import { parseArgs } from "node:util";

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

export async function runProvenance(args: string[], io: CliOutput): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      contract: { type: "string" },
      model: { type: "string" },
      provider: { type: "string" },
      session: { type: "string" },
      "prompt-summary": { type: "string" },
      task: { type: "string" },
      json: { type: "boolean" },
    },
    allowPositionals: true,
  });

  const subCommand = positionals[0];

  if (subCommand === "record") {
    if (!values.contract || !values.model || !values.provider || !values.session) {
      io.stderr(`${red("Error:")} Missing required arguments. Expected: --contract, --model, --provider, --session\n`);
      return 1;
    }
    
    let contractContent: string;
    let contractParsed: any;
    try {
      contractContent = await readFile(values.contract, "utf8");
      contractParsed = JSON.parse(contractContent);
    } catch (err: any) {
      io.stderr(`${red("Error:")} Failed to read contract: ${err.message}\n`);
      return 1;
    }
    
    if (!contractParsed.taskId) {
      io.stderr(`${red("Error:")} Contract is missing taskId.\n`);
      return 1;
    }
    
    const taskId = contractParsed.taskId;
    const contractDigest = sha256Hex(contractContent);
    const promptSummary = values["prompt-summary"] || "";
    const promptDigest = sha256Hex(promptSummary); // Placeholder if full prompt not given

    const record = createProvenanceRecord({
      taskId,
      contractDigest,
      aiProvenance: {
        model: values.model,
        provider: values.provider,
        sessionId: values.session,
        promptSummary,
        promptDigest,
      },
    });

    const storeRoot = resolveDefaultStateRoot();
    const destPath = join(storeRoot, "tasks", taskId, "provenance.json");
    
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, JSON.stringify(record, null, 2), "utf8");
    
    if (values.json) {
      io.stdout(JSON.stringify(record, null, 2) + "\n");
    } else {
      io.stdout(`${green("Success:")} Provenance record created for task ${taskId}\n`);
      io.stdout(`Saved to: ${destPath}\n`);
    }
    return 0;
  }

  if (subCommand === "show") {
    if (!values.task) {
      io.stderr(`${red("Error:")} Missing --task argument.\n`);
      return 1;
    }
    
    const storeRoot = resolveDefaultStateRoot();
    const destPath = join(storeRoot, "tasks", values.task, "provenance.json");
    
    try {
      const content = await readFile(destPath, "utf8");
      const record = JSON.parse(content) as ProvenanceRecord;
      
      if (values.json) {
        io.stdout(JSON.stringify(record, null, 2) + "\n");
      } else {
        io.stdout(`${bold("Provenance Record:")}\n`);
        io.stdout(`Task ID: ${record.taskId}\n`);
        io.stdout(`Contract Digest: ${record.contractDigest}\n`);
        io.stdout(`Provenance Digest: ${record.provenanceDigest}\n`);
        io.stdout(`Model: ${record.aiProvenance.model}\n`);
        io.stdout(`Provider: ${record.aiProvenance.provider}\n`);
        io.stdout(`Session ID: ${record.aiProvenance.sessionId}\n`);
        io.stdout(`Generated At: ${record.aiProvenance.generatedAt}\n`);
      }
      return 0;
    } catch (err: any) {
      io.stderr(`${red("Error:")} Failed to read provenance: ${err.message}\n`);
      return 1;
    }
  }

  io.stderr(`${red("Error:")} Unknown provenance subcommand: ${subCommand || "none"}\n`);
  return 1;
}
