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

export { verifyChange, verificationEvidenceDigest, scopeViolations, parseRawGitChanges } from "./core/verification.js";
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

export { resolveDefaultStateRoot } from "./store/runtime-paths.js";

export {
  isValidTransition,
  advanceState,
  isTerminalState,
  StateMachineError,
} from "./core/state-machine.js";
export type { TaskState } from "./core/state-machine.js";

export {
  writeAtomicJson,
  resolveCycleStateDir,
  persistCycleMetadata,
  PersistenceError,
} from "./store/persistence.js";

export { buildMerkleTree, computeMerkleRoot, generateMerkleProof, verifyMerkleProof } from "./core/merkle.js";
export type { MerkleEntry, MerkleProofNode } from "./core/merkle.js";

export { calculateDiffRiskScore } from "./core/risk-scoring.js";
export type { RiskAssessment } from "./core/risk-scoring.js";

export { evaluateConsensusVerdict } from "./core/consensus.js";
export type { ConsensusVerdict, ConsensusResult } from "./core/consensus.js";

export { extractDependencies, checkDependencyLeaks } from "./core/ast-boundary.js";
export type { DependencyLeak } from "./core/ast-boundary.js";

export { generateRepoMap } from "./core/repo-map.js";
export type { RepoMapNode, RepoMapResult } from "./core/repo-map.js";
