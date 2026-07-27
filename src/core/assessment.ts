import { digestCanonicalJson } from "./integrity.js";
import type { TaskContractV1 } from "./contract.js";

const ASSESSMENT_DIGEST_DOMAIN = "cyclewarden.acceptance-assessment.v1";

export class AcceptanceAssessmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AcceptanceAssessmentError";
  }
}

export type AgentRunIdentity = {
  provider: string;
  runId: string;
};

export type CriterionAssessment = {
  criterionId: string;
  status: "passed" | "failed" | "inconclusive";
  summary: string;
  evidenceRefs: string[];
};

export type ConstraintAssessment = {
  constraintId: string;
  status: "passed" | "failed" | "inconclusive";
  summary: string;
  evidenceRefs: string[];
};

export type ReviewFinding = {
  severity: "critical" | "major" | "minor" | "note";
  path: string | null;
  summary: string;
};

export type AcceptanceAssessmentV1 = {
  schemaVersion: 1;
  recordType: "acceptance-assessment";
  taskId: string;
  contractDigest: string;
  baseSha: string;
  headSha: string;
  reviewer: AgentRunIdentity;
  criteria: CriterionAssessment[];
  constraints: ConstraintAssessment[];
  findings: ReviewFinding[];
  completedAt: string;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AcceptanceAssessmentError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new AcceptanceAssessmentError(`${label} has unknown field ${unknown}`);
}

function string(value: unknown, label: string, maximum = 4_000): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new AcceptanceAssessmentError(`${label} is required`);
  if (result.length > maximum) {
    throw new AcceptanceAssessmentError(`${label} exceeds ${maximum} characters`);
  }
  if (result.includes("\0")) throw new AcceptanceAssessmentError(`${label} may not contain NUL`);
  return result;
}

export function parseAgentRunIdentity(value: unknown, label: string): AgentRunIdentity {
  const record = object(value, label);
  onlyKeys(record, ["provider", "runId"], label);
  return {
    provider: string(record.provider, `${label}.provider`, 128),
    runId: string(record.runId, `${label}.runId`, 256),
  };
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 32) {
    throw new AcceptanceAssessmentError(`${label} must be an array with at most 32 items`);
  }
  return value.map((item, index) => string(item, `${label}[${index}]`, 1_024));
}

function isoTimestamp(value: unknown, label: string): string {
  const result = string(value, label, 64);
  if (Number.isNaN(Date.parse(result)) || new Date(result).toISOString() !== result) {
    throw new AcceptanceAssessmentError(`${label} must be an ISO-8601 UTC timestamp`);
  }
  return result;
}

export function parseAcceptanceAssessment(
  value: unknown,
  contract: TaskContractV1,
  headSha: string
): AcceptanceAssessmentV1 {
  const record = object(value, "acceptance assessment");
  onlyKeys(
    record,
    [
      "schemaVersion",
      "recordType",
      "taskId",
      "contractDigest",
      "baseSha",
      "headSha",
      "reviewer",
      "criteria",
      "constraints",
      "findings",
      "completedAt",
    ],
    "acceptance assessment"
  );
  if (record.schemaVersion !== 1 || record.recordType !== "acceptance-assessment") {
    throw new AcceptanceAssessmentError(
      "acceptance assessment must have schemaVersion 1 and recordType acceptance-assessment"
    );
  }
  if (record.taskId !== contract.taskId) {
    throw new AcceptanceAssessmentError("acceptance assessment taskId does not match contract");
  }
  if (record.contractDigest !== contract.contractDigest) {
    throw new AcceptanceAssessmentError(
      "acceptance assessment contractDigest does not match contract"
    );
  }
  if (record.baseSha !== contract.repository.baseSha || record.headSha !== headSha) {
    throw new AcceptanceAssessmentError(
      "acceptance assessment is not bound to the requested base and head commits"
    );
  }
  if (!Array.isArray(record.criteria) || record.criteria.length !== contract.acceptanceCriteria.length) {
    throw new AcceptanceAssessmentError(
      "acceptance assessment must cover every contract criterion exactly once"
    );
  }
  const criteria = record.criteria.map((item, index) => {
    const criterion = object(item, `acceptance assessment criteria[${index}]`);
    onlyKeys(
      criterion,
      ["criterionId", "status", "summary", "evidenceRefs"],
      `acceptance assessment criteria[${index}]`
    );
    if (
      criterion.status !== "passed" &&
      criterion.status !== "failed" &&
      criterion.status !== "inconclusive"
    ) {
      throw new AcceptanceAssessmentError(
        `acceptance assessment criteria[${index}].status is invalid`
      );
    }
    const evidenceRefs = stringArray(
      criterion.evidenceRefs ?? [],
      `acceptance assessment criteria[${index}].evidenceRefs`
    );
    if (criterion.status !== "inconclusive" && evidenceRefs.length === 0) {
      throw new AcceptanceAssessmentError(
        `acceptance assessment criteria[${index}] requires at least one evidence reference`
      );
    }
    return {
      criterionId: string(
        criterion.criterionId,
        `acceptance assessment criteria[${index}].criterionId`,
        64
      ),
      status: criterion.status,
      summary: string(
        criterion.summary,
        `acceptance assessment criteria[${index}].summary`
      ),
      evidenceRefs,
    } satisfies CriterionAssessment;
  });
  const expectedIds = new Set(contract.acceptanceCriteria.map((criterion) => criterion.id));
  const actualIds = new Set(criteria.map((criterion) => criterion.criterionId));
  if (
    actualIds.size !== criteria.length ||
    actualIds.size !== expectedIds.size ||
    [...expectedIds].some((id) => !actualIds.has(id))
  ) {
    throw new AcceptanceAssessmentError(
      "acceptance assessment criterion IDs do not match the contract"
    );
  }

  if (
    !Array.isArray(record.constraints) ||
    record.constraints.length !== contract.constraints.length
  ) {
    throw new AcceptanceAssessmentError(
      "acceptance assessment must cover every contract constraint exactly once"
    );
  }
  const constraints = record.constraints.map((item, index) => {
    const constraint = object(item, `acceptance assessment constraints[${index}]`);
    onlyKeys(
      constraint,
      ["constraintId", "status", "summary", "evidenceRefs"],
      `acceptance assessment constraints[${index}]`
    );
    if (
      constraint.status !== "passed" &&
      constraint.status !== "failed" &&
      constraint.status !== "inconclusive"
    ) {
      throw new AcceptanceAssessmentError(
        `acceptance assessment constraints[${index}].status is invalid`
      );
    }
    const evidenceRefs = stringArray(
      constraint.evidenceRefs ?? [],
      `acceptance assessment constraints[${index}].evidenceRefs`
    );
    if (constraint.status !== "inconclusive" && evidenceRefs.length === 0) {
      throw new AcceptanceAssessmentError(
        `acceptance assessment constraints[${index}] requires at least one evidence reference`
      );
    }
    return {
      constraintId: string(
        constraint.constraintId,
        `acceptance assessment constraints[${index}].constraintId`,
        64
      ),
      status: constraint.status,
      summary: string(
        constraint.summary,
        `acceptance assessment constraints[${index}].summary`
      ),
      evidenceRefs,
    } satisfies ConstraintAssessment;
  });
  const expectedConstraintIds = new Set(
    contract.constraints.map((constraint) => constraint.id)
  );
  const actualConstraintIds = new Set(
    constraints.map((constraint) => constraint.constraintId)
  );
  if (
    actualConstraintIds.size !== constraints.length ||
    actualConstraintIds.size !== expectedConstraintIds.size ||
    [...expectedConstraintIds].some((id) => !actualConstraintIds.has(id))
  ) {
    throw new AcceptanceAssessmentError(
      "acceptance assessment constraint IDs do not match the contract"
    );
  }

  if (!Array.isArray(record.findings) || record.findings.length > 64) {
    throw new AcceptanceAssessmentError(
      "acceptance assessment findings must be an array with at most 64 items"
    );
  }
  const findings = record.findings.map((item, index) => {
    const finding = object(item, `acceptance assessment findings[${index}]`);
    onlyKeys(
      finding,
      ["severity", "path", "summary"],
      `acceptance assessment findings[${index}]`
    );
    if (
      finding.severity !== "critical" &&
      finding.severity !== "major" &&
      finding.severity !== "minor" &&
      finding.severity !== "note"
    ) {
      throw new AcceptanceAssessmentError(
        `acceptance assessment findings[${index}].severity is invalid`
      );
    }
    return {
      severity: finding.severity,
      path:
        finding.path === null || finding.path === undefined
          ? null
          : string(finding.path, `acceptance assessment findings[${index}].path`, 1_024),
      summary: string(finding.summary, `acceptance assessment findings[${index}].summary`),
    } satisfies ReviewFinding;
  });

  return {
    schemaVersion: 1,
    recordType: "acceptance-assessment",
    taskId: contract.taskId,
    contractDigest: contract.contractDigest,
    baseSha: contract.repository.baseSha,
    headSha,
    reviewer: parseAgentRunIdentity(record.reviewer, "acceptance assessment reviewer"),
    criteria,
    constraints,
    findings,
    completedAt: isoTimestamp(record.completedAt, "acceptance assessment completedAt"),
  };
}

export function acceptanceAssessmentDigest(value: AcceptanceAssessmentV1): string {
  return digestCanonicalJson(ASSESSMENT_DIGEST_DOMAIN, value);
}
