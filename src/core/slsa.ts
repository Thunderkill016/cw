import type { VerificationEvidenceV1 } from "./verification.js";

export function formatSlsaProvenance(evidence: VerificationEvidenceV1) {
  const digestAlgo = evidence.subject.objectFormat === "sha1" ? "sha1" : "sha256";
  const subjectName = evidence.subject.headRef ? `git+commit://${evidence.subject.headRef}` : "git+commit://HEAD";

  return {
    _type: "https://in-toto.io/Statement/v0.1" as const,
    subject: [
      {
        name: subjectName,
        digest: {
          [digestAlgo]: evidence.subject.headSha,
        },
      },
    ],
    predicateType: "https://slsa.dev/provenance/v1" as const,
    predicate: {
      buildDefinition: {
        buildType: "https://cyclewarden.org/verification-evidence/v1",
        externalParameters: {
          taskId: evidence.taskId,
          contractDigest: evidence.contractDigest,
          baseSha: evidence.subject.baseSha,
          headRef: evidence.subject.headRef,
        },
        internalParameters: {
          schemaVersion: evidence.schemaVersion,
          actors: evidence.actors,
          scope: evidence.scope,
          acceptance: evidence.acceptance,
          unresolvedRisks: evidence.unresolvedRisks,
          limitations: evidence.limitations,
          checks: evidence.checks,
          verdict: evidence.verdict,
        },
        resolvedDependencies: [
          {
            uri: subjectName,
            digest: {
              [digestAlgo]: evidence.subject.baseSha,
            },
            name: "baseCommit",
          },
        ],
      },
      runDetails: {
        builder: {
          id: evidence.actors.verifier
            ? `agent://${evidence.actors.verifier.provider}/${evidence.actors.verifier.runId}`
            : "agent://unknown/unknown",
        },
        metadata: {
          invocationId: evidence.evidenceId,
          startedOn: evidence.startedAt,
          finishedOn: evidence.completedAt,
        },
        byproducts: [
          {
            name: "evidenceDigest",
            digest: {
              sha256: evidence.evidenceDigest,
            },
          },
        ],
      },
    },
  };
}
