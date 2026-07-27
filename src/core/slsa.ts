import type { VerificationEvidenceV1 } from "./verification.js";
import type { ProvenanceRecord } from "./provenance.js";

export function formatSlsaProvenance(
  evidence: VerificationEvidenceV1,
  aiProvenance?: ProvenanceRecord
) {
  const digestAlgo = evidence.subject.objectFormat === "sha1" ? "sha1" : "sha256";
  const subjectName = evidence.subject.headRef
    ? `git+commit://${evidence.subject.headRef}`
    : "git+commit://HEAD";

  const materials = [
    {
      uri: subjectName,
      digest: {
        [digestAlgo]: evidence.subject.baseSha,
      },
      name: "baseCommit",
    },
    {
      uri: `cw+task://${evidence.taskId}/contract`,
      digest: {
        sha256: evidence.contractDigest,
      },
      name: "taskContract",
    },
  ];

  if (aiProvenance) {
    materials.push({
      uri: `cw+task://${evidence.taskId}/provenance`,
      digest: {
        sha256: aiProvenance.provenanceDigest,
      },
      name: "aiProvenance",
    });
  }

  const byproducts = [
    {
      name: "evidenceDigest",
      digest: {
        sha256: evidence.evidenceDigest,
      },
    },
  ];

  if (aiProvenance) {
    byproducts.push({
      name: "promptDigest",
      digest: {
        sha256: aiProvenance.aiProvenance.promptDigest,
      },
    });
    if (aiProvenance.aiProvenance.reasoningTraceDigest) {
      byproducts.push({
        name: "reasoningTraceDigest",
        digest: {
          sha256: aiProvenance.aiProvenance.reasoningTraceDigest,
        },
      });
    }
  }

  const builderId = aiProvenance
    ? `agent://${aiProvenance.aiProvenance.provider}/${aiProvenance.aiProvenance.model}`
    : evidence.actors.verifier
    ? `agent://${evidence.actors.verifier.provider}/${evidence.actors.verifier.runId}`
    : "agent://unknown/unknown";

  const startedOn = aiProvenance
    ? aiProvenance.aiProvenance.generatedAt
    : evidence.startedAt;

  return {
    _type: "https://in-toto.io/Statement/v1" as const,
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
        buildType: "https://cw.dev/ai-verification/v1",
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
        resolvedDependencies: materials,
      },
      runDetails: {
        builder: {
          id: builderId,
        },
        metadata: {
          invocationId: evidence.evidenceId,
          startedOn,
          finishedOn: evidence.completedAt,
        },
        byproducts,
      },
    },
  };
}
