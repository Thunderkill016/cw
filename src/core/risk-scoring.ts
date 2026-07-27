export interface RiskAssessment {
  riskScore: number;
  riskFactors: string[];
}

export function calculateDiffRiskScore(
  diffText: string,
  modifiedPaths: string[],
  forbiddenPaths: string[]
): RiskAssessment {
  const riskFactors: string[] = [];
  
  // 1. Cyclomatic complexity additions
  const addedLines = diffText
    .split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++'));
    
  let complexityCount = 0;
  // Naive regex to match complexity markers in code
  const complexityRegex = /\b(if|else|for|while|switch|case|catch)\b|\?|&&|\|\|/g;
  
  for (const line of addedLines) {
    const matches = line.match(complexityRegex);
    if (matches) {
      complexityCount += matches.length;
    }
  }
  
  const complexityScore = Math.min(complexityCount / 50, 1.0);
  if (complexityCount > 20) {
    riskFactors.push(`High cyclomatic complexity additions (${complexityCount} markers found)`);
  }

  // 2. Entropy (Diff size and density)
  const diffSize = diffText.length;
  const entropyScore = Math.min(diffSize / 10000, 1.0);
  if (diffSize > 8000) {
    riskFactors.push(`Large diff size (${diffSize} characters) indicates higher risk`);
  }

  // 3. Boundary proximity
  let boundaryHits = 0;
  for (const modPath of modifiedPaths) {
    const modParts = modPath.split('/');
    for (const forbidden of forbiddenPaths) {
      const forbParts = forbidden.split('/');
      // Check if they share the same parent directory
      if (modParts.length > 1 && forbParts.length > 1) {
        const modDir = modParts.slice(0, -1).join('/');
        const forbDir = forbParts.slice(0, -1).join('/');
        if (modDir === forbDir) {
          boundaryHits++;
        }
      }
    }
  }

  const boundaryScore = Math.min(boundaryHits / 3, 1.0);
  if (boundaryHits > 0) {
    riskFactors.push(`Modifications are physically close to forbidden paths (${boundaryHits} boundary overlaps)`);
  }

  // Calculate composite score (0.0 to 1.0)
  // Weights: Complexity 40%, Entropy 30%, Boundary 30%
  const compositeScore = (complexityScore * 0.4) + (entropyScore * 0.3) + (boundaryScore * 0.3);

  return {
    riskScore: Number(compositeScore.toFixed(4)),
    riskFactors
  };
}
