import type { AcceptanceAssessmentV1 } from "./assessment.js";
import type { TaskContractV1 } from "./contract.js";

export type ConsensusVerdict = "accepted" | "rejected" | "inconclusive";

export interface ReviewerWeight {
  type: string; // e.g. "ai-security", "ai-performance", "ai-general", "human"
  weight: number; // 0.0 to 1.0
}

export interface ConsensusConfig {
  minReviewers: number;
  requiredHuman: number;
  bftThreshold: number;
  weights?: ReviewerWeight[];
}

export interface ConsensusVerdictDetails {
  verdict: ConsensusVerdict;
  confidence: number;
  totalReviewers: number;
  humanReviewers: number;
  agreementRatio: number;
  weightedScore: number;
  details: Array<{
    reviewerType: string;
    vote: ConsensusVerdict;
    weight: number;
  }>;
}

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

export function evaluateWeightedConsensus(
  assessments: AcceptanceAssessmentV1[],
  config: ConsensusConfig
): ConsensusVerdictDetails {
  const details: ConsensusVerdictDetails["details"] = [];
  let acceptedCount = 0;
  let rejectedCount = 0;
  let inconclusiveCount = 0;
  
  let acceptedWeight = 0;
  let rejectedWeight = 0;
  let inconclusiveWeight = 0;
  
  let humanReviewers = 0;
  
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

    let vote: ConsensusVerdict = "accepted";
    if (hasFailed) vote = "rejected";
    else if (hasInconclusive) vote = "inconclusive";

    const reviewerType = assessment.reviewer.provider;
    if (reviewerType === "human") {
      humanReviewers++;
    }

    let weight = 1.0;
    if (config.weights) {
      const w = config.weights.find(w => w.type === reviewerType);
      if (w !== undefined) weight = w.weight;
    }

    details.push({ reviewerType, vote, weight });

    if (vote === "accepted") {
      acceptedCount++;
      acceptedWeight += weight;
    } else if (vote === "rejected") {
      rejectedCount++;
      rejectedWeight += weight;
    } else {
      inconclusiveCount++;
      inconclusiveWeight += weight;
    }
  }

  const totalReviewers = assessments.length;
  const totalWeight = acceptedWeight + rejectedWeight + inconclusiveWeight;
  
  // Check quorums
  if (totalReviewers < config.minReviewers || humanReviewers < config.requiredHuman || totalWeight === 0) {
    return {
      verdict: "inconclusive",
      confidence: 0,
      totalReviewers,
      humanReviewers,
      agreementRatio: 0,
      weightedScore: 0,
      details
    };
  }

  const acceptedRatio = acceptedWeight / totalWeight;
  const rejectedRatio = rejectedWeight / totalWeight;
  const maxRatio = Math.max(acceptedRatio, rejectedRatio, inconclusiveWeight / totalWeight);
  
  let verdict: ConsensusVerdict = "inconclusive";
  let confidence = maxRatio;
  let weightedScore = Math.max(acceptedWeight, rejectedWeight, inconclusiveWeight);
  let agreementRatio = Math.max(acceptedCount, rejectedCount, inconclusiveCount) / totalReviewers;

  if (acceptedRatio >= config.bftThreshold) {
    verdict = "accepted";
    confidence = acceptedRatio;
    weightedScore = acceptedWeight;
    agreementRatio = acceptedCount / totalReviewers;
  } else if (rejectedRatio >= config.bftThreshold) {
    verdict = "rejected";
    confidence = rejectedRatio;
    weightedScore = rejectedWeight;
    agreementRatio = rejectedCount / totalReviewers;
  }

  return {
    verdict,
    confidence: Number(confidence.toFixed(4)),
    totalReviewers,
    humanReviewers,
    agreementRatio: Number(agreementRatio.toFixed(4)),
    weightedScore: Number(weightedScore.toFixed(4)),
    details
  };
}
