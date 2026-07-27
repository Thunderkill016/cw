import { describe, it, expect } from "vitest";
import { evaluateConsensusVerdict } from "../src/core/consensus.js";
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
