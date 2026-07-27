// cw — Public API
// Re-export core types and functions for use as a library.

export {
  parseTaskContract,
  parseTaskContractDraft,
  prepareTaskContract,
  taskContractDigest,
  taskPathRuleMatches,
} from "./core/contract.js";
export type {
  TaskContractV1,
  TaskContractDraftV1,
  TaskPathRule,
  AcceptanceCriterion,
  TaskConstraint,
  PrepareTaskContractInput,
} from "./core/contract.js";

export { verifyChange, verificationEvidenceDigest, scopeViolations, parseRawGitChanges } from "./core/verification.js";
export type {
  VerifyChangeInput,
  VerificationEvidenceV1,
  ChangedFile,
  ScopeViolation,
  VerificationCheckEvidence,
} from "./core/verification.js";

export {
  parseAcceptanceAssessment,
  parseAgentRunIdentity,
  acceptanceAssessmentDigest,
} from "./core/assessment.js";
export type {
  AcceptanceAssessmentV1,
  AgentRunIdentity,
  CriterionAssessment,
  ConstraintAssessment,
  ReviewFinding,
} from "./core/assessment.js";

export { EvidenceRegistry, EvidenceRegistryError } from "./core/evidence.js";
export type { EvidenceReference } from "./core/evidence.js";

export {
  canonicalJson,
  canonicalJsonDocument,
  sha256Hex,
  domainSeparatedDigest,
  digestCanonicalJson,
} from "./core/integrity.js";

export { parseBoundedCommand, runBoundedCommand, BoundedCommandError } from "./core/bounded-command.js";
export type {
  BoundedCommandSpec,
  BoundedCommandResult,
  BoundedOutputEvidence,
} from "./core/bounded-command.js";

export {
  runGitBuffer,
  runGitText,
  canonicalGitRoot,
  gitObjectFormat,
  isFullObjectId,
  resolveCommit,
  resolveTree,
  checkoutStatus,
  GitChangeError,
} from "./git/git-change.js";
export type { GitObjectFormat } from "./git/git-change.js";

export { resolveDefaultStateRoot } from "./store/runtime-paths.js";
