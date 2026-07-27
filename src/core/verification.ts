import {
  acceptanceAssessmentDigest,
  parseAcceptanceAssessment,
  parseAgentRunIdentity,
  type AcceptanceAssessmentV1,
  type AgentRunIdentity,
  type ConstraintAssessment,
  type CriterionAssessment,
} from "./assessment.js";
import {
  runBoundedCommand,
  type BoundedCommandResult,
  type BoundedOutputEvidence,
} from "./bounded-command.js";
import {
  canonicalGitRoot,
  checkoutStatus,
  gitObjectFormat,
  resolveCommit,
  resolveTree,
  runGitBuffer,
  type GitObjectFormat,
  GitChangeError,
} from "../git/git-change.js";
import { digestCanonicalJson, sha256Hex } from "./integrity.js";
import {
  parseTaskContract,
  taskPathRuleMatches,
  type TaskContractV1,
  type TaskPathRule,
} from "./contract.js";

const CHANGE_SET_DIGEST_DOMAIN = "cyclewarden.change-set.v1";
const COMMAND_DIGEST_DOMAIN = "cyclewarden.verification-command.v1";
const EVIDENCE_ID_DOMAIN = "cyclewarden.verification-evidence-id.v1";
const EVIDENCE_DIGEST_DOMAIN = "cyclewarden.verification-evidence.v1";

export class ChangeVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChangeVerificationError";
  }
}

export type ChangedFile = {
  path: string;
  kind: "added" | "modified" | "deleted" | "type-changed" | "unmerged" | "unknown";
  oldMode: string | null;
  newMode: string | null;
  oldObjectId: string | null;
  newObjectId: string | null;
};

export type ScopeViolation = {
  path: string;
  reason: "outside-allowed-scope" | "inside-forbidden-scope";
  rule: TaskPathRule | null;
};

export type VerificationCheckEvidence = {
  id: string;
  commandDigest: string;
  status: BoundedCommandResult["status"];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: BoundedOutputEvidence;
  stderr: BoundedOutputEvidence;
  workspaceUnchanged: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

export type VerificationEvidenceV1 = {
  schemaVersion: 1;
  recordType: "verification-evidence";
  evidenceId: string;
  taskId: string;
  contractDigest: string;
  subject: {
    objectFormat: GitObjectFormat;
    baseSha: string;
    baseTreeSha: string;
    headRef: string;
    headSha: string;
    headTreeSha: string;
    changeSetDigest: string;
    changes: ChangedFile[];
  };
  actors: {
    implementer: AgentRunIdentity;
    verifier: AgentRunIdentity | null;
    separation: "self-asserted-distinct-runs" | "not-established";
  };
  scope: {
    status: "passed" | "failed";
    violations: ScopeViolation[];
  };
  checks: VerificationCheckEvidence[];
  acceptance: {
    assessmentDigest: string | null;
    criteria: CriterionAssessment[];
    constraints: ConstraintAssessment[];
    findings: AcceptanceAssessmentV1["findings"];
  };
  startedAt: string;
  completedAt: string;
  verdict: "accepted" | "rejected" | "inconclusive";
  unresolvedRisks: string[];
  limitations: string[];
  evidenceDigest: string;
};

function splitNul(value: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== 0) continue;
    parts.push(value.subarray(start, index));
    start = index + 1;
  }
  if (start !== value.length) {
    throw new ChangeVerificationError("Git raw diff was not NUL terminated");
  }
  return parts;
}

function changedKind(status: string): ChangedFile["kind"] {
  if (status === "A") return "added";
  if (status === "D") return "deleted";
  if (status === "M") return "modified";
  if (status === "T") return "type-changed";
  if (status === "U") return "unmerged";
  return "unknown";
}

function nonZeroObjectId(value: string): string | null {
  return /^0+$/.test(value) ? null : value;
}

export function parseRawGitChanges(value: Buffer, objectFormat: GitObjectFormat): ChangedFile[] {
  const parts = splitNul(value);
  if (parts.length % 2 !== 0) throw new ChangeVerificationError("Git raw diff record is incomplete");
  const changes: ChangedFile[] = [];
  const objectLength = objectFormat === "sha1" ? 40 : 64;
  const headerPattern = new RegExp(
    `^:(\\d{6}) (\\d{6}) ([a-f0-9]{${objectLength}}) ([a-f0-9]{${objectLength}}) ([A-Z])(?:\\d+)?$`
  );
  for (let index = 0; index < parts.length; index += 2) {
    const header = parts[index]!.toString("ascii");
    const match = headerPattern.exec(header);
    if (!match) throw new ChangeVerificationError(`unsupported Git raw diff header: ${header}`);
    const pathBytes = parts[index + 1]!;
    const path = pathBytes.toString("utf8");
    if (!Buffer.from(path, "utf8").equals(pathBytes)) {
      throw new ChangeVerificationError("Git path is not valid UTF-8");
    }
    if (
      !path ||
      path.startsWith("/") ||
      path.includes("\0") ||
      path.split("/").some((part) => part === "." || part === "..")
    ) {
      throw new ChangeVerificationError(`invalid repository path in Git diff: ${JSON.stringify(path)}`);
    }
    changes.push({
      path,
      kind: changedKind(match[5]!),
      oldMode: match[1] === "000000" ? null : match[1]!,
      newMode: match[2] === "000000" ? null : match[2]!,
      oldObjectId: nonZeroObjectId(match[3]!),
      newObjectId: nonZeroObjectId(match[4]!),
    });
  }
  return changes.sort((left, right) => {
    const leftKey = `${left.path}\0${left.kind}`;
    const rightKey = `${right.path}\0${right.kind}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function matchingRule(path: string, rules: TaskPathRule[]): TaskPathRule | null {
  return rules.find((rule) => taskPathRuleMatches(path, rule)) ?? null;
}

export function scopeViolations(
  changes: ChangedFile[],
  contract: TaskContractV1
): ScopeViolation[] {
  const violations: ScopeViolation[] = [];
  for (const change of changes) {
    const allowed = matchingRule(change.path, contract.allowedPaths);
    const forbidden = matchingRule(change.path, contract.forbiddenPaths);
    if (!allowed) {
      violations.push({
        path: change.path,
        reason: "outside-allowed-scope",
        rule: null,
      });
    }
    if (forbidden) {
      violations.push({
        path: change.path,
        reason: "inside-forbidden-scope",
        rule: forbidden,
      });
    }
  }
  return violations;
}

async function baseIsAncestor(
  repositoryRoot: string,
  baseSha: string,
  headSha: string
): Promise<boolean> {
  try {
    await runGitBuffer(repositoryRoot, ["merge-base", "--is-ancestor", baseSha, headSha]);
    return true;
  } catch (error) {
    if (error instanceof GitChangeError && error.exitCode === 1) return false;
    throw error;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function evidencePayload(
  evidence: Omit<VerificationEvidenceV1, "evidenceDigest"> | VerificationEvidenceV1
) {
  const { evidenceDigest: _discarded, ...payload } = evidence as VerificationEvidenceV1;
  return payload;
}

export function verificationEvidenceDigest(
  evidence: Omit<VerificationEvidenceV1, "evidenceDigest"> | VerificationEvidenceV1
): string {
  return digestCanonicalJson(EVIDENCE_DIGEST_DOMAIN, evidencePayload(evidence));
}

export type VerifyChangeInput = {
  repositoryRoot: string;
  stateRoot?: string;
  contract: unknown;
  headRef?: string;
  implementer: AgentRunIdentity;
  acceptanceAssessment?: unknown;
};

function defaultAcceptance(contract: TaskContractV1): CriterionAssessment[] {
  return contract.acceptanceCriteria.map((criterion) => ({
    criterionId: criterion.id,
    status: "inconclusive",
    summary: "No independent acceptance assessment was supplied.",
    evidenceRefs: [],
  }));
}

function defaultConstraints(contract: TaskContractV1): ConstraintAssessment[] {
  return contract.constraints.map((constraint) => ({
    constraintId: constraint.id,
    status: "inconclusive",
    summary: "No independent constraint assessment was supplied.",
    evidenceRefs: [],
  }));
}

function checkMutationReason(
  beforeHead: string,
  afterHead: string,
  beforeStatus: string[],
  afterStatus: string[]
): string | null {
  if (beforeHead !== afterHead) return "a verification command changed Git HEAD";
  if (beforeStatus.join("\0") !== afterStatus.join("\0")) {
    return "a verification command changed tracked or non-ignored working-tree content";
  }
  return null;
}

export async function verifyChange(input: VerifyChangeInput): Promise<VerificationEvidenceV1> {
  const startedAt = nowIso();
  const repositoryRoot = await canonicalGitRoot(input.repositoryRoot);
  const contract = parseTaskContract(input.contract);
  const actualFormat = await gitObjectFormat(repositoryRoot);
  if (actualFormat !== contract.repository.objectFormat) {
    throw new ChangeVerificationError(
      `repository object format ${actualFormat} does not match contract ${contract.repository.objectFormat}`
    );
  }
  const resolvedBase = await resolveCommit(repositoryRoot, contract.repository.baseSha, actualFormat);
  if (resolvedBase !== contract.repository.baseSha) {
    throw new ChangeVerificationError("contract base commit did not resolve exactly");
  }
  const actualBaseTree = await resolveTree(repositoryRoot, resolvedBase, actualFormat);
  if (actualBaseTree !== contract.repository.baseTreeSha) {
    throw new ChangeVerificationError("contract base tree does not match the repository");
  }
  const headRef = input.headRef?.trim() || "HEAD";
  const headSha = await resolveCommit(repositoryRoot, headRef, actualFormat);
  const headTreeSha = await resolveTree(repositoryRoot, headSha, actualFormat);
  if (!(await baseIsAncestor(repositoryRoot, resolvedBase, headSha))) {
    throw new ChangeVerificationError("contract base commit is not an ancestor of the requested head");
  }

  // COUPLING NOTE: `--no-renames` is mandatory here.
  // `parseRawGitChanges` expects every NUL-delimited record to be a (header, path) pair.
  // Without `--no-renames`, Git emits a (header, old-path, new-path) triple for renames,
  // which would silently break the `parts.length % 2 !== 0` check and produce wrong paths.
  // If you ever remove `--no-renames`, you MUST update `parseRawGitChanges` to handle triples.
  const rawChanges = await runGitBuffer(repositoryRoot, [
    "diff-tree",
    "-r",
    "--raw",
    "-z",
    "--no-commit-id",
    "--no-renames",
    "--no-abbrev",
    resolvedBase,
    headSha,
    "--",
  ]);

  const changes = parseRawGitChanges(rawChanges, actualFormat);
  const changeSetDigest = digestCanonicalJson(CHANGE_SET_DIGEST_DOMAIN, {
    objectFormat: actualFormat,
    baseSha: resolvedBase,
    baseTreeSha: actualBaseTree,
    headSha,
    headTreeSha,
    changes,
  });
  const violations = scopeViolations(changes, contract);
  const unresolvedRisks: string[] = [];
  if (changes.length === 0) unresolvedRisks.push("base and head contain no changed files");
  for (const change of changes) {
    if (change.oldMode === "120000" || change.newMode === "120000") {
      unresolvedRisks.push(`changed symlink is unsupported in protocol v1: ${change.path}`);
    }
    if (change.oldMode === "160000" || change.newMode === "160000") {
      unresolvedRisks.push(`changed submodule is unsupported in protocol v1: ${change.path}`);
    }
    if (change.kind === "unmerged" || change.kind === "unknown") {
      unresolvedRisks.push(`unsupported Git change kind for ${change.path}: ${change.kind}`);
    }
  }

  const implementer = parseAgentRunIdentity(input.implementer, "implementer");
  let assessment: AcceptanceAssessmentV1 | null = null;
  let assessmentError: string | null = null;
  if (input.acceptanceAssessment === undefined) {
    unresolvedRisks.push("independent acceptance assessment is missing");
  } else {
    try {
      assessment = parseAcceptanceAssessment(input.acceptanceAssessment, contract, headSha);
    } catch (error) {
      assessmentError = error instanceof Error ? error.message : String(error);
      unresolvedRisks.push(`independent acceptance assessment is invalid: ${assessmentError}`);
    }
  }
  const verifier = assessment?.reviewer ?? null;
  const distinctRuns = verifier !== null && verifier.runId !== implementer.runId;
  if (verifier && !distinctRuns) {
    unresolvedRisks.push("implementer and verifier must use distinct run IDs");
  }

  const initialHead = await resolveCommit(repositoryRoot, "HEAD", actualFormat);
  const initialStatus = await checkoutStatus(repositoryRoot, input.stateRoot);
  const checkoutReady = initialHead === headSha && initialStatus.length === 0;
  if (initialHead !== headSha) {
    unresolvedRisks.push(`verification checkout HEAD ${initialHead} does not equal subject ${headSha}`);
  }
  if (initialStatus.length > 0) {
    unresolvedRisks.push(`verification checkout is dirty: ${initialStatus.slice(0, 5).join(", ")}`);
  }

  const checks: VerificationCheckEvidence[] = [];
  const unsupportedChange = unresolvedRisks.some(
    (risk) => risk.includes("unsupported in protocol v1") || risk.includes("unsupported Git change")
  );
  if (checkoutReady && violations.length === 0 && !unsupportedChange && changes.length > 0) {
    for (const command of contract.verificationCommands) {
      const checkStartedMs = Date.now();
      const checkStartedAt = nowIso();
      const beforeHead = await resolveCommit(repositoryRoot, "HEAD", actualFormat);
      const beforeStatus = await checkoutStatus(repositoryRoot, input.stateRoot);
      let result: BoundedCommandResult;
      try {
        result = await runBoundedCommand(repositoryRoot, command);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result = {
          status: "unavailable",
          exitCode: null,
          signal: null,
          stdout: {
            digest: sha256Hex(""),
            byteLength: 0,
            preview: "",
            previewTruncated: false,
          },
          stderr: {
            digest: sha256Hex(message),
            byteLength: Buffer.byteLength(message),
            preview: message,
            previewTruncated: false,
          },
        };
      }
      const afterHead = await resolveCommit(repositoryRoot, "HEAD", actualFormat);
      const afterStatus = await checkoutStatus(repositoryRoot, input.stateRoot);
      const mutation = checkMutationReason(beforeHead, afterHead, beforeStatus, afterStatus);
      if (mutation) unresolvedRisks.push(`${command.id}: ${mutation}`);
      checks.push({
        id: command.id,
        commandDigest: digestCanonicalJson(COMMAND_DIGEST_DOMAIN, command),
        status: result.status,
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        workspaceUnchanged: mutation === null,
        startedAt: checkStartedAt,
        completedAt: nowIso(),
        durationMs: Math.max(0, Date.now() - checkStartedMs),
      });
      if (mutation) break;
    }
  }
  if (checks.length === 0) unresolvedRisks.push("no verification command was executed");

  let finalHead: string | null = null;
  try {
    finalHead = await resolveCommit(repositoryRoot, headRef, actualFormat);
    if (finalHead !== headSha) unresolvedRisks.push("requested head ref moved during verification");
  } catch (error) {
    unresolvedRisks.push(
      `requested head ref could not be resolved after verification: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const acceptance = assessment?.criteria ?? defaultAcceptance(contract);
  const constraintAssessments = assessment?.constraints ?? defaultConstraints(contract);
  const findings = assessment?.findings ?? [];
  for (const criterion of acceptance) {
    if (criterion.status === "inconclusive") {
      unresolvedRisks.push(
        `acceptance criterion ${criterion.criterionId} is inconclusive: ${criterion.summary}`
      );
    }
  }
  for (const constraint of constraintAssessments) {
    if (constraint.status === "inconclusive") {
      unresolvedRisks.push(
        `constraint ${constraint.constraintId} is inconclusive: ${constraint.summary}`
      );
    }
  }
  const definiteFailure =
    violations.length > 0 ||
    checks.some((check) => check.status === "failed" || !check.workspaceUnchanged) ||
    acceptance.some((criterion) => criterion.status === "failed") ||
    constraintAssessments.some((constraint) => constraint.status === "failed") ||
    findings.some((finding) => finding.severity === "critical" || finding.severity === "major");
  const completeSuccess =
    changes.length > 0 &&
    violations.length === 0 &&
    !unsupportedChange &&
    distinctRuns &&
    checks.length === contract.verificationCommands.length &&
    checks.every((check) => check.status === "passed" && check.workspaceUnchanged) &&
    acceptance.length === contract.acceptanceCriteria.length &&
    acceptance.every((criterion) => criterion.status === "passed") &&
    constraintAssessments.length === contract.constraints.length &&
    constraintAssessments.every((constraint) => constraint.status === "passed") &&
    finalHead === headSha &&
    unresolvedRisks.length === 0;
  const verdict: VerificationEvidenceV1["verdict"] = definiteFailure
    ? "rejected"
    : completeSuccess
      ? "accepted"
      : "inconclusive";
  const completedAt = nowIso();
  const evidenceId = `verification:${digestCanonicalJson(EVIDENCE_ID_DOMAIN, {
    taskId: contract.taskId,
    contractDigest: contract.contractDigest,
    headSha,
    implementerRunId: implementer.runId,
    verifierRunId: verifier?.runId ?? null,
    startedAt,
  }).slice(0, 24)}`;
  const payload: Omit<VerificationEvidenceV1, "evidenceDigest"> = {
    schemaVersion: 1,
    recordType: "verification-evidence",
    evidenceId,
    taskId: contract.taskId,
    contractDigest: contract.contractDigest,
    subject: {
      objectFormat: actualFormat,
      baseSha: resolvedBase,
      baseTreeSha: actualBaseTree,
      headRef,
      headSha,
      headTreeSha,
      changeSetDigest,
      changes,
    },
    actors: {
      implementer,
      verifier,
      separation: distinctRuns ? "self-asserted-distinct-runs" : "not-established",
    },
    scope: {
      status: violations.length === 0 ? "passed" : "failed",
      violations,
    },
    checks,
    acceptance: {
      assessmentDigest: assessment ? acceptanceAssessmentDigest(assessment) : null,
      criteria: acceptance,
      constraints: constraintAssessments,
      findings,
    },
    startedAt,
    completedAt,
    verdict,
    unresolvedRisks: [...new Set(unresolvedRisks)],
    limitations: [
      "agent provider and run IDs are self-asserted provenance, not cryptographic identity",
      "verification commands run trusted-local with the current operating-system user's privileges",
      "configured verification commands may access the host, user files, or network unless separately isolated",
      "ignored files and side effects outside the repository are not part of the Git subject",
      "acceptance criteria are independent model or human judgments, not deterministic proof",
      "evidence applies only to the exact contract and head commit; the merge head must be checked again",
    ],
  };
  return { ...payload, evidenceDigest: verificationEvidenceDigest(payload) };
}
