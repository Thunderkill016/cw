import { isAbsolute } from "node:path";
import { parseBoundedCommand, type BoundedCommandSpec } from "./bounded-command.js";
import {
  canonicalGitRoot,
  checkoutStatus,
  gitObjectFormat,
  isFullObjectId,
  resolveCommit,
  resolveTree,
  type GitObjectFormat,
} from "../git/git-change.js";
import { digestCanonicalJson } from "./integrity.js";

const CONTRACT_DIGEST_DOMAIN = "cyclewarden.task-contract.v1";

export class TaskContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskContractError";
  }
}

export type TaskPathRule = {
  kind: "file" | "directory";
  path: string;
};

export type AcceptanceCriterion = {
  id: string;
  description: string;
};

export type TaskConstraint = {
  id: string;
  description: string;
};

export type TaskContractDraftV1 = {
  schemaVersion: 1;
  taskId: string;
  sourceRef: string | null;
  objective: string;
  contextPaths: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  allowedPaths: TaskPathRule[];
  forbiddenPaths: TaskPathRule[];
  constraints: TaskConstraint[];
  verificationCommands: BoundedCommandSpec[];
};

export type TaskContractV1 = TaskContractDraftV1 & {
  recordType: "task-contract";
  repository: {
    objectFormat: GitObjectFormat;
    baseRef: string;
    baseSha: string;
    baseTreeSha: string;
  };
  preparedBy: string;
  preparedAt: string;
  contractDigest: string;
};

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TaskContractError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) throw new TaskContractError(`${label} has unknown field ${unknown[0]}`);
}

function requiredString(
  value: unknown,
  label: string,
  maximum = 4_000,
  pattern?: RegExp
): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new TaskContractError(`${label} is required`);
  if (result.length > maximum) throw new TaskContractError(`${label} exceeds ${maximum} characters`);
  if (result.includes("\0")) throw new TaskContractError(`${label} may not contain NUL`);
  if (pattern && !pattern.test(result)) throw new TaskContractError(`${label} has an invalid format`);
  return result;
}

function optionalStrings(value: unknown, label: string, maximumItems = 64): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new TaskContractError(`${label} must be an array with at most ${maximumItems} items`);
  }
  const results = value.map((item, index) => requiredString(item, `${label}[${index}]`));
  return [...new Set(results)];
}

function portableRepositoryPath(value: unknown, label: string): string {
  const path = requiredString(value, label, 1_024);
  if (
    isAbsolute(path) ||
    /^[A-Za-z]:[\\/]/.test(path) ||
    path.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(path) ||
    path.startsWith("./") ||
    path.endsWith("/") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new TaskContractError(`${label} must be a normalized repository-relative POSIX path`);
  }
  if (/[*?[\]{}]/.test(path)) {
    throw new TaskContractError(`${label} may not contain glob syntax; use a directory rule instead`);
  }
  return path;
}

function pathRules(value: unknown, label: string, required: boolean): TaskPathRule[] {
  if (!Array.isArray(value) || value.length > 64 || (required && value.length === 0)) {
    throw new TaskContractError(
      `${label} must be ${required ? "a non-empty " : "an "}array with at most 64 rules`
    );
  }
  const results = value.map((item, index) => {
    const record = requireObject(item, `${label}[${index}]`);
    requireOnlyKeys(record, ["kind", "path"], `${label}[${index}]`);
    if (record.kind !== "file" && record.kind !== "directory") {
      throw new TaskContractError(`${label}[${index}].kind must be file or directory`);
    }
    return {
      kind: record.kind,
      path: portableRepositoryPath(record.path, `${label}[${index}].path`),
    } satisfies TaskPathRule;
  });
  const seen = new Set<string>();
  for (const rule of results) {
    const key = `${rule.kind}:${rule.path}`;
    if (seen.has(key)) throw new TaskContractError(`${label} contains duplicate rule ${rule.path}`);
    seen.add(key);
  }
  return results.sort((left, right) => {
    const leftKey = `${left.kind}:${left.path}`;
    const rightKey = `${right.kind}:${right.path}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function acceptanceCriteria(value: unknown): AcceptanceCriterion[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) {
    throw new TaskContractError("acceptanceCriteria must contain between 1 and 32 criteria");
  }
  const results = value.map((item, index) => {
    const record = requireObject(item, `acceptanceCriteria[${index}]`);
    requireOnlyKeys(record, ["id", "description"], `acceptanceCriteria[${index}]`);
    return {
      id: requiredString(
        record.id,
        `acceptanceCriteria[${index}].id`,
        64,
        /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/
      ),
      description: requiredString(
        record.description,
        `acceptanceCriteria[${index}].description`
      ),
    };
  });
  const ids = new Set(results.map((criterion) => criterion.id));
  if (ids.size !== results.length) throw new TaskContractError("acceptance criterion IDs must be unique");
  return results;
}

function taskConstraints(value: unknown): TaskConstraint[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) {
    throw new TaskContractError("constraints must be an array with at most 32 constraints");
  }
  const results = value.map((item, index) => {
    const record = requireObject(item, `constraints[${index}]`);
    requireOnlyKeys(record, ["id", "description"], `constraints[${index}]`);
    return {
      id: requiredString(
        record.id,
        `constraints[${index}].id`,
        64,
        /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/
      ),
      description: requiredString(record.description, `constraints[${index}].description`),
    };
  });
  const ids = new Set(results.map((constraint) => constraint.id));
  if (ids.size !== results.length) throw new TaskContractError("constraint IDs must be unique");
  return results;
}

function verificationCommands(value: unknown): BoundedCommandSpec[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
    throw new TaskContractError("verificationCommands must contain between 1 and 8 commands");
  }
  let commands: BoundedCommandSpec[];
  try {
    commands = value.map((item, index) =>
      parseBoundedCommand(item, `verificationCommands[${index}]`)
    );
  } catch (error) {
    throw new TaskContractError(error instanceof Error ? error.message : String(error));
  }
  const ids = new Set(commands.map((command) => command.id));
  if (ids.size !== commands.length) throw new TaskContractError("verification command IDs must be unique");
  return commands;
}

export function parseTaskContractDraft(value: unknown): TaskContractDraftV1 {
  const record = requireObject(value, "task contract draft");
  requireOnlyKeys(
    record,
    [
      "schemaVersion",
      "taskId",
      "sourceRef",
      "objective",
      "contextPaths",
      "acceptanceCriteria",
      "allowedPaths",
      "forbiddenPaths",
      "constraints",
      "verificationCommands",
    ],
    "task contract draft"
  );
  if (record.schemaVersion !== 1) {
    throw new TaskContractError("task contract draft schemaVersion must equal 1");
  }
  const rawContextPaths = optionalStrings(record.contextPaths, "contextPaths");
  const parsedAcceptanceCriteria = acceptanceCriteria(record.acceptanceCriteria);
  const parsedConstraints = taskConstraints(record.constraints);
  const requirementIds = [
    ...parsedAcceptanceCriteria.map((criterion) => criterion.id),
    ...parsedConstraints.map((constraint) => constraint.id),
  ];
  if (new Set(requirementIds).size !== requirementIds.length) {
    throw new TaskContractError("acceptance criterion and constraint IDs must be globally unique");
  }
  return {
    schemaVersion: 1,
    taskId: requiredString(
      record.taskId,
      "taskId",
      64,
      /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/
    ),
    sourceRef:
      record.sourceRef === undefined || record.sourceRef === null
        ? null
        : requiredString(record.sourceRef, "sourceRef", 2_048),
    objective: requiredString(record.objective, "objective"),
    contextPaths: rawContextPaths.map((path, index) =>
      portableRepositoryPath(path, `contextPaths[${index}]`)
    ),
    acceptanceCriteria: parsedAcceptanceCriteria,
    allowedPaths: pathRules(record.allowedPaths, "allowedPaths", true),
    forbiddenPaths: pathRules(record.forbiddenPaths ?? [], "forbiddenPaths", false),
    constraints: parsedConstraints,
    verificationCommands: verificationCommands(record.verificationCommands),
  };
}

function validIsoTimestamp(value: unknown, label: string): string {
  const timestamp = requiredString(value, label, 64);
  if (Number.isNaN(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
    throw new TaskContractError(`${label} must be an ISO-8601 UTC timestamp`);
  }
  return timestamp;
}

function contractPayload(contract: Omit<TaskContractV1, "contractDigest"> | TaskContractV1) {
  const { contractDigest: _discarded, ...payload } = contract as TaskContractV1;
  return payload;
}

export function taskContractDigest(
  contract: Omit<TaskContractV1, "contractDigest"> | TaskContractV1
): string {
  return digestCanonicalJson(CONTRACT_DIGEST_DOMAIN, contractPayload(contract));
}

export function parseTaskContract(value: unknown): TaskContractV1 {
  const record = requireObject(value, "task contract");
  requireOnlyKeys(
    record,
    [
      "schemaVersion",
      "recordType",
      "taskId",
      "sourceRef",
      "objective",
      "contextPaths",
      "acceptanceCriteria",
      "allowedPaths",
      "forbiddenPaths",
      "constraints",
      "verificationCommands",
      "repository",
      "preparedBy",
      "preparedAt",
      "contractDigest",
    ],
    "task contract"
  );
  if (record.recordType !== "task-contract") {
    throw new TaskContractError("task contract recordType must equal task-contract");
  }
  const draft = parseTaskContractDraft({
    schemaVersion: record.schemaVersion,
    taskId: record.taskId,
    sourceRef: record.sourceRef,
    objective: record.objective,
    contextPaths: record.contextPaths,
    acceptanceCriteria: record.acceptanceCriteria,
    allowedPaths: record.allowedPaths,
    forbiddenPaths: record.forbiddenPaths,
    constraints: record.constraints,
    verificationCommands: record.verificationCommands,
  });
  const repository = requireObject(record.repository, "task contract repository");
  requireOnlyKeys(
    repository,
    ["objectFormat", "baseRef", "baseSha", "baseTreeSha"],
    "task contract repository"
  );
  if (repository.objectFormat !== "sha1" && repository.objectFormat !== "sha256") {
    throw new TaskContractError("task contract repository objectFormat must be sha1 or sha256");
  }
  const format = repository.objectFormat;
  const baseSha = requiredString(repository.baseSha, "task contract repository baseSha", 64);
  const baseTreeSha = requiredString(
    repository.baseTreeSha,
    "task contract repository baseTreeSha",
    64
  );
  if (!isFullObjectId(baseSha, format) || !isFullObjectId(baseTreeSha, format)) {
    throw new TaskContractError("task contract repository object IDs do not match objectFormat");
  }
  const contract: TaskContractV1 = {
    ...draft,
    recordType: "task-contract",
    repository: {
      objectFormat: format,
      baseRef: requiredString(repository.baseRef, "task contract repository baseRef", 256),
      baseSha,
      baseTreeSha,
    },
    preparedBy: requiredString(record.preparedBy, "preparedBy", 256),
    preparedAt: validIsoTimestamp(record.preparedAt, "preparedAt"),
    contractDigest: requiredString(
      record.contractDigest,
      "contractDigest",
      64,
      /^[a-f0-9]{64}$/
    ),
  };
  if (taskContractDigest(contract) !== contract.contractDigest) {
    throw new TaskContractError("task contract digest mismatch");
  }
  return contract;
}

export type PrepareTaskContractInput = {
  repositoryRoot: string;
  stateRoot?: string;
  draft: unknown;
  baseRef?: string;
  preparedBy: string;
  preparedAt?: string;
};

export async function prepareTaskContract(
  input: PrepareTaskContractInput
): Promise<TaskContractV1> {
  const repositoryRoot = await canonicalGitRoot(input.repositoryRoot);
  const dirty = await checkoutStatus(repositoryRoot, input.stateRoot);
  if (dirty.length > 0) {
    throw new TaskContractError(
      `prepare requires a clean Git base; found ${dirty.slice(0, 5).join(", ")}`
    );
  }
  const draft = parseTaskContractDraft(input.draft);
  const objectFormat = await gitObjectFormat(repositoryRoot);
  const baseRef = input.baseRef?.trim() || "HEAD";
  const baseSha = await resolveCommit(repositoryRoot, baseRef, objectFormat);
  const baseTreeSha = await resolveTree(repositoryRoot, baseSha, objectFormat);
  const preparedAt = input.preparedAt ?? new Date().toISOString();
  const payload: Omit<TaskContractV1, "contractDigest"> = {
    ...draft,
    recordType: "task-contract",
    repository: { objectFormat, baseRef, baseSha, baseTreeSha },
    preparedBy: requiredString(input.preparedBy, "preparedBy", 256),
    preparedAt: validIsoTimestamp(preparedAt, "preparedAt"),
  };
  return { ...payload, contractDigest: taskContractDigest(payload) };
}

export function taskPathRuleMatches(path: string, rule: TaskPathRule): boolean {
  return rule.kind === "file" ? path === rule.path : path === rule.path || path.startsWith(`${rule.path}/`);
}
