import { describe, it, expect } from "vitest";
import { formatSlsaProvenance } from "../src/core/slsa.js";
import type { VerificationEvidenceV1 } from "../src/core/verification.js";

describe("SLSA Provenance Engine", () => {
  it("formats VerificationEvidenceV1 into SLSA V1 provenance", () => {
    const evidence: VerificationEvidenceV1 = {
      schemaVersion: 1,
      recordType: "verification-evidence",
      evidenceId: "verification:abc123456789012345678901",
      taskId: "task:abc123456789012345678901",
      contractDigest: "1234567890abcdef",
      subject: {
        objectFormat: "sha1",
        baseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        baseTreeSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        headRef: "refs/heads/main",
        headSha: "cccccccccccccccccccccccccccccccccccccccc",
        headTreeSha: "dddddddddddddddddddddddddddddddddddddddd",
        changeSetDigest: "1234",
        changes: [],
      },
      actors: {
        implementer: { provider: "test", runId: "123" },
        verifier: { provider: "test", runId: "456" },
        separation: "self-asserted-distinct-runs",
      },
      scope: {
        status: "passed",
        violations: [],
      },
      checks: [],
      acceptance: {
        assessmentDigest: null,
        criteria: [],
        constraints: [],
        findings: [],
      },
      startedAt: "2024-01-01T00:00:00.000Z",
      completedAt: "2024-01-01T00:01:00.000Z",
      verdict: "accepted",
      unresolvedRisks: [],
      limitations: [],
      evidenceDigest: "evidence-digest-value",
    };

    const provenance = formatSlsaProvenance(evidence);

    expect(provenance._type).toBe("https://in-toto.io/Statement/v1");
    expect(provenance.predicateType).toBe("https://slsa.dev/provenance/v1");
    
    expect(provenance.subject.length).toBe(1);
    expect(provenance.subject[0]?.name).toBe("git+commit://refs/heads/main");
    expect(provenance.subject[0]?.digest?.sha1).toBe("cccccccccccccccccccccccccccccccccccccccc");

    expect(provenance.predicate.buildDefinition.buildType).toBe("https://cw.dev/ai-verification/v1");
    expect(provenance.predicate.buildDefinition.externalParameters.taskId).toBe("task:abc123456789012345678901");
    expect(provenance.predicate.buildDefinition.resolvedDependencies?.[0]?.digest?.sha1).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

    expect(provenance.predicate.runDetails.builder.id).toBe("agent://test/456");
    expect(provenance.predicate.runDetails.metadata.invocationId).toBe("verification:abc123456789012345678901");
    expect(provenance.predicate.runDetails.byproducts?.[0]?.digest?.sha256).toBe("evidence-digest-value");
  });
});
