import type { AcceptanceAssessmentV1 } from "./assessment.js";
import type { TaskContractV1 } from "./contract.js";

export type ConsensusVerdict = "accepted" | "rejected" | "inconclusive";

export interface ConsensusResult {
  verdict: ConsensusVerdict;
  metrics: {
    totalAssessments: number;
    acceptedCount: number;
    rejectedCount: number;
    inconclusiveCount: number;
    agreementRatio: number;
  };
}

export function evaluateConsensusVerdict(
  assessments: AcceptanceAssessmentV1[],
  _contract: TaskContractV1
): ConsensusResult {
  if (!assessments || assessments.length === 0) {
    return {
      verdict: "inconclusive",
      metrics: {
        totalAssessments: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        inconclusiveCount: 0,
        agreementRatio: 0,
      }
    };
  }

  let acceptedCount = 0;
  let rejectedCount = 0;
  let inconclusiveCount = 0;

  for (const assessment of assessments) {
    let hasFailed = false;
    let hasInconclusive = false;

    for (const criterion of assessment.criteria) {
      if (criterion.status === "failed") hasFailed = true;
      if (criterion.status === "inconclusive") hasInconclusive = true;
    }

    for (const constraint of assessment.constraints) {
      if (constraint.status === "failed") hasFailed = true;
      if (constraint.status === "inconclusive") hasInconclusive = true;
    }

    if (hasFailed) {
      rejectedCount++;
    } else if (hasInconclusive) {
      inconclusiveCount++;
    } else {
      acceptedCount++;
    }
  }

  const total = assessments.length;
  // BFT 2/3 majority requirement
  const threshold = Math.ceil((total * 2) / 3);

  let verdict: ConsensusVerdict = "inconclusive";
  let agreementRatio = 0;

  if (acceptedCount >= threshold) {
    verdict = "accepted";
    agreementRatio = acceptedCount / total;
  } else if (rejectedCount >= threshold) {
    verdict = "rejected";
    agreementRatio = rejectedCount / total;
  } else {
    verdict = "inconclusive";
    // For inconclusive, we might not have a clear agreement, but we can measure the highest vote
    agreementRatio = Math.max(acceptedCount, rejectedCount, inconclusiveCount) / total;
  }

  return {
    verdict,
    metrics: {
      totalAssessments: total,
      acceptedCount,
      rejectedCount,
      inconclusiveCount,
      agreementRatio: Number(agreementRatio.toFixed(4)),
    }
  };
}
