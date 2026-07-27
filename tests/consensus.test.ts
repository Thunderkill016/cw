import { describe, it, expect } from "vitest";
import { evaluateConsensusVerdict, evaluateWeightedConsensus } from "../src/core/consensus.js";
import type { AcceptanceAssessmentV1 } from "../src/core/assessment.js";
import type { TaskContractV1 } from "../src/core/contract.js";

const mockContract = {} as TaskContractV1;

function createMockAssessment(
  criteriaStatuses: Array<"passed" | "failed" | "inconclusive">,
  constraintStatuses: Array<"passed" | "failed" | "inconclusive"> = []
): AcceptanceAssessmentV1 {
  return {
    schemaVersion: 1,
    recordType: "acceptance-assessment",
    taskId: "task-1",
    contractDigest: "digest",
    baseSha: "sha1",
    headSha: "sha2",
    reviewer: { model: "test-model", provider: "test", vendor: "test" },
    criteria: criteriaStatuses.map(status => ({ criterionId: "c1", status, summary: "", evidenceRefs: [] })),
    constraints: constraintStatuses.map(status => ({ constraintId: "cs1", status, summary: "" })),
    findings: [],
    completedAt: "now"
  };
}

describe("evaluateConsensusVerdict", () => {
  it("should return inconclusive for empty assessments", () => {
    const result = evaluateConsensusVerdict([], mockContract);
    expect(result.verdict).toBe("inconclusive");
    expect(result.metrics.totalAssessments).toBe(0);
  });

  it("should accept when 2/3 majority passes", () => {
    const assessments = [
      createMockAssessment(["passed"]),
      createMockAssessment(["passed"]),
      createMockAssessment(["failed"]) // 2/3 passed
    ];
    const result = evaluateConsensusVerdict(assessments, mockContract);
    expect(result.verdict).toBe("accepted");
    expect(result.metrics.acceptedCount).toBe(2);
    expect(result.metrics.rejectedCount).toBe(1);
  });

  it("should reject when 2/3 majority fails", () => {
    const assessments = [
      createMockAssessment(["failed"]),
      createMockAssessment(["failed"]),
      createMockAssessment(["passed"]),
      createMockAssessment(["failed"]) // 3/4 failed (75%)
    ];
    const result = evaluateConsensusVerdict(assessments, mockContract);
    expect(result.verdict).toBe("rejected");
    expect(result.metrics.rejectedCount).toBe(3);
  });

  it("should return inconclusive when no 2/3 majority", () => {
    const assessments = [
      createMockAssessment(["passed"]),
      createMockAssessment(["failed"]),
      createMockAssessment(["inconclusive"]) // 1/3 each
    ];
    const result = evaluateConsensusVerdict(assessments, mockContract);
    expect(result.verdict).toBe("inconclusive");
  });
});

describe("evaluateWeightedConsensus", () => {
  const config = {
    minReviewers: 3,
    requiredHuman: 1,
    bftThreshold: 0.66,
    weights: [
      { type: "human", weight: 1.0 },
      { type: "ai-security", weight: 0.8 },
      { type: "ai-general", weight: 0.5 }
    ]
  };

  it("should return inconclusive if minReviewers not met", () => {
    const assessments = [
      { ...createMockAssessment(["passed"]), reviewer: { provider: "human", runId: "1" } }
    ];
    const result = evaluateWeightedConsensus(assessments, config);
    expect(result.verdict).toBe("inconclusive");
    expect(result.totalReviewers).toBe(1);
  });

  it("should return inconclusive if requiredHuman not met", () => {
    const assessments = [
      { ...createMockAssessment(["passed"]), reviewer: { provider: "ai-security", runId: "1" } },
      { ...createMockAssessment(["passed"]), reviewer: { provider: "ai-security", runId: "2" } },
      { ...createMockAssessment(["passed"]), reviewer: { provider: "ai-general", runId: "3" } }
    ];
    const result = evaluateWeightedConsensus(assessments, config);
    expect(result.verdict).toBe("inconclusive");
    expect(result.humanReviewers).toBe(0);
  });

  it("should accept with weighted majority", () => {
    const assessments = [
      { ...createMockAssessment(["passed"]), reviewer: { provider: "human", runId: "1" } }, // weight 1.0
      { ...createMockAssessment(["passed"]), reviewer: { provider: "ai-security", runId: "2" } }, // weight 0.8
      { ...createMockAssessment(["failed"]), reviewer: { provider: "ai-general", runId: "3" } } // weight 0.5
    ];
    const result = evaluateWeightedConsensus(assessments, config);
    
    // total weight: 2.3
    // accepted weight: 1.8
    // rejected weight: 0.5
    // accepted ratio: 1.8 / 2.3 ≈ 0.7826 > 0.66
    expect(result.verdict).toBe("accepted");
    expect(result.weightedScore).toBe(1.8);
    expect(result.confidence).toBeGreaterThan(0.78);
  });

  it("should reject if human veto (weight changes balance)", () => {
    const configVeto = {
      ...config,
      weights: [
        { type: "human", weight: 2.0 },
        { type: "ai-security", weight: 0.5 },
        { type: "ai-general", weight: 0.5 }
      ]
    };
    const assessments = [
      { ...createMockAssessment(["failed"]), reviewer: { provider: "human", runId: "1" } }, // weight 2.0
      { ...createMockAssessment(["passed"]), reviewer: { provider: "ai-security", runId: "2" } }, // weight 0.5
      { ...createMockAssessment(["passed"]), reviewer: { provider: "ai-general", runId: "3" } } // weight 0.5
    ];
    const result = evaluateWeightedConsensus(assessments, configVeto);
    
    // total weight: 3.0
    // rejected weight: 2.0
    // accepted weight: 1.0
    // rejected ratio: 2.0 / 3.0 = 0.666 > 0.66
    expect(result.verdict).toBe("rejected");
    expect(result.weightedScore).toBe(2.0);
  });
});
