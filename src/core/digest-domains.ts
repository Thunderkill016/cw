import { digestCanonicalJson } from "./integrity.js";

/**
 * Domain separators for every digest Forge issues.
 *
 * These strings are wire format: they are mixed into the hash, so changing one
 * changes every digest computed under it. Forge issues `atoryn.forge.*.v2`
 * digests; the `cyclewarden.*.v1` domains are the CycleWarden-era names and are
 * kept purely so records issued before the rename still verify. Nothing may
 * *issue* a legacy digest — they exist on the read path only.
 */
export const CONTRACT_DIGEST_DOMAIN = "atoryn.forge.task-contract.v2";
export const ASSESSMENT_DIGEST_DOMAIN = "atoryn.forge.acceptance-assessment.v2";
export const CHANGE_SET_DIGEST_DOMAIN = "atoryn.forge.change-set.v2";
export const COMMAND_DIGEST_DOMAIN = "atoryn.forge.verification-command.v2";
export const EVIDENCE_ID_DOMAIN = "atoryn.forge.verification-evidence-id.v2";
export const EVIDENCE_DIGEST_DOMAIN = "atoryn.forge.verification-evidence.v2";
export const TASK_JOURNAL_EVENT_DOMAIN = "atoryn.forge.task-journal-event.v1";
export const TASK_JOURNAL_EVENT_ID_DOMAIN = "atoryn.forge.task-journal-event-id.v1";
export const VERIFICATION_ATTEMPT_DOMAIN = "atoryn.forge.verification-attempt.v1";
export const PROJECT_DIGEST_DOMAIN = "atoryn.forge.project.v1";
export const CONSTITUTION_DIGEST_DOMAIN = "atoryn.forge.constitution.v1";
export const SPECIFICATION_DIGEST_DOMAIN = "atoryn.forge.specification.v1";
export const PLAN_DIGEST_DOMAIN = "atoryn.forge.plan.v1";
export const TASK_LIST_DIGEST_DOMAIN = "atoryn.forge.task-list.v1";

export const LEGACY_CONTRACT_DIGEST_DOMAINS: readonly string[] = [
  "cyclewarden.task-contract.v1",
];
export const LEGACY_EVIDENCE_DIGEST_DOMAINS: readonly string[] = [
  "cyclewarden.verification-evidence.v1",
];

/**
 * True when `expected` equals the digest of `payload` under the canonical
 * domain or under any accepted legacy domain.
 *
 * Comparison is over the full set rather than short-circuiting on the first
 * match so that accepting a legacy record stays an explicit, auditable decision
 * rather than an accident of ordering.
 */
export function digestMatchesAnyDomain(
  canonicalDomain: string,
  legacyDomains: readonly string[],
  payload: unknown,
  expected: string
): boolean {
  if (digestCanonicalJson(canonicalDomain, payload) === expected) return true;
  return legacyDomains.some((domain) => digestCanonicalJson(domain, payload) === expected);
}
