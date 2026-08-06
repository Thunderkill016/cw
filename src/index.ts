// cw — Public API
// Re-export core types and functions for use as a library.

export { getSystemHealth } from "./core/healthcheck.js";
export type { HealthStatus } from "./core/healthcheck.js";

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

export {
  verifyChange,
  verificationEvidenceDigest,
  verificationEvidenceDigestMatches,
  scopeViolations,
  parseRawGitChanges,
} from "./core/verification.js";
export { formatSlsaProvenance } from "./core/slsa.js";
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

export {
  resolveDefaultStateRoot,
  resolveStateRoot,
  resolveTasksDir,
  FORGE_STATE_DIRECTORY,
  LEGACY_CW_STATE_DIRECTORY,
} from "./store/runtime-paths.js";

export {
  isValidTransition,
  advanceState,
  isTerminalState,
  StateMachineError,
} from "./core/state-machine.js";
export type { TaskState } from "./core/state-machine.js";

export {
  writeAtomicJson,
  resolveTaskStateDir,
  resolveTaskJournalPath,
  readTaskJournal,
  writeTaskJournal,
  ensureTaskJournal,
  PersistenceError,
} from "./store/persistence.js";

export {
  createTaskJournal,
  appendTaskEvent,
  verifyTaskJournal,
  parseTaskJournal,
  taskEventId,
  TaskJournalError,
  TASK_EVENT_TYPES,
} from "./core/task-journal.js";
export type {
  TaskJournalV1,
  TaskJournalEvent,
  TaskJournalIntegrity,
  TaskEventType,
  AppendTaskEventInput,
} from "./core/task-journal.js";

export {
  CONTRACT_DIGEST_DOMAIN,
  ASSESSMENT_DIGEST_DOMAIN,
  EVIDENCE_DIGEST_DOMAIN,
  LEGACY_CONTRACT_DIGEST_DOMAINS,
  LEGACY_EVIDENCE_DIGEST_DOMAINS,
  digestMatchesAnyDomain,
} from "./core/digest-domains.js";

export { buildMerkleTree, computeMerkleRoot, generateMerkleProof, verifyMerkleProof } from "./core/merkle.js";
export type { MerkleEntry, MerkleProofNode } from "./core/merkle.js";

export { calculateDiffRiskScore } from "./core/risk-scoring.js";
export type { RiskAssessment } from "./core/risk-scoring.js";

export { evaluateConsensusVerdict, evaluateWeightedConsensus } from "./core/consensus.js";
export type { 
  ConsensusVerdict, 
  ConsensusResult, 
  ReviewerWeight, 
  ConsensusConfig, 
  ConsensusVerdictDetails 
} from "./core/consensus.js";

export { extractDependencies, checkDependencyLeaks } from "./core/ast-boundary.js";
export type { DependencyLeak } from "./core/ast-boundary.js";

export { generateRepoMap } from "./core/repo-map.js";
export type { RepoMapNode, RepoMapResult } from "./core/repo-map.js";

export {
  classifyFile,
  classifyFiles,
  riskLevelValue,
  aggregateRiskLevel,
  DEFAULT_RULES
} from "./core/code-classifier.js";
export type {
  RiskLevel,
  FileClassification,
  ClassificationRules
} from "./core/code-classifier.js";

export { createProvenanceRecord, verifyProvenanceRecord, formatProvenanceForSlsa } from "./core/provenance.js";
export type { AiProvenance, ProvenanceRecord, CreateProvenanceRecordInput } from "./core/provenance.js";

export { createAuditLog, appendEntry, verifyLogIntegrity, getInclusionProof } from "./core/audit-log.js";
export type { AuditEntry, AuditLog } from "./core/audit-log.js";
