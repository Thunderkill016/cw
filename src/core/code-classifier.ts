export type RiskLevel = "critical" | "sensitive" | "standard" | "generated";

export interface FileClassification {
  path: string;
  riskLevel: RiskLevel;
  reasons: string[];
}

export interface ClassificationRules {
  /** Glob patterns for critical files (auth, crypto, payments, secrets) */
  critical: string[];
  /** Glob patterns for sensitive files (config, database, API) */
  sensitive: string[];
  /** Glob patterns for generated files (build output, lockfiles) */
  generated: string[];
}

export const DEFAULT_RULES: ClassificationRules = {
  critical: [
    "**/auth/**", "**/crypto/**", "**/payment/**", "**/security/**",
    "**/.env*", "**/secret*", "**/key*", "**/password*", "**/token*", "**/credential*"
  ],
  sensitive: [
    "**/config/**", "**/database/**", "**/api/**", "**/middleware/**",
    "**/migration*", "**/permission*", "**/role*", "**/*.sql"
  ],
  generated: [
    "**/dist/**", "**/build/**", "**/node_modules/**", "**/coverage/**",
    "**/*.lock", "**/*.min.js", "**/*.generated.*"
  ]
};

export function riskLevelValue(level: RiskLevel): number {
  switch (level) {
    case "critical": return 4;
    case "sensitive": return 3;
    case "standard": return 2;
    case "generated": return 1;
    default: return 0;
  }
}

export function aggregateRiskLevel(classifications: FileClassification[]): RiskLevel {
  if (classifications.length === 0) return "standard";
  
  let highest: RiskLevel = "generated";
  let maxVal = riskLevelValue("generated");

  for (const c of classifications) {
    const val = riskLevelValue(c.riskLevel);
    if (val > maxVal) {
      highest = c.riskLevel;
      maxVal = val;
    }
  }

  return highest;
}

function matchesGlob(path: string, pattern: string): boolean {
  if (pattern.startsWith("**/") && pattern.endsWith("/**")) {
    const term = pattern.slice(3, -3);
    return path.includes(`/${term}/`) || path.startsWith(`${term}/`) || path.endsWith(`/${term}`) || path === term;
  }
  
  if (pattern.startsWith("**/*") && pattern.indexOf(".", 4) > -1) {
    const ext = pattern.slice(pattern.indexOf(".", 4)); // like .sql
    if (pattern.endsWith(".*")) {
       const prefix = pattern.slice(4, -2);
       return path.includes(prefix);
    }
    return path.endsWith(ext);
  }

  if (pattern.startsWith("**/") && pattern.endsWith("*")) {
    const term = pattern.slice(3, -1);
    return path.includes(`/${term}`) || path.startsWith(`${term}`);
  }
  
  if (pattern.startsWith("**/")) {
    const term = pattern.slice(3);
    return path.endsWith(`/${term}`) || path === term;
  }
  
  return path === pattern || path.includes(pattern.replace(/\*/g, ""));
}

export function classifyFile(
  path: string,
  content?: string,
  customRules?: ClassificationRules
): FileClassification {
  const rules = customRules ?? DEFAULT_RULES;
  let riskLevel: RiskLevel = "standard";
  const reasons: string[] = [];

  // Check generated first so they can be overridden? No, if it's generated, usually it's low risk.
  // We'll check critical, then sensitive, then generated.
  
  let matchedPath = false;

  for (const pattern of rules.critical) {
    if (matchesGlob(path, pattern)) {
      riskLevel = "critical";
      reasons.push(`Path matches critical pattern: ${pattern}`);
      matchedPath = true;
      break;
    }
  }

  if (!matchedPath) {
    for (const pattern of rules.sensitive) {
      if (matchesGlob(path, pattern)) {
        riskLevel = "sensitive";
        reasons.push(`Path matches sensitive pattern: ${pattern}`);
        matchedPath = true;
        break;
      }
    }
  }

  if (!matchedPath) {
    for (const pattern of rules.generated) {
      if (matchesGlob(path, pattern)) {
        riskLevel = "generated";
        reasons.push(`Path matches generated pattern: ${pattern}`);
        matchedPath = true;
        break;
      }
    }
  }

  // Content heuristics
  if (content && riskLevel !== "generated") {
    // 1. Hardcoded secrets
    if (/(?:API_KEY|password|secret|token)\s*=\s*['"][^'"]+['"]/i.test(content)) {
      if (riskLevelValue(riskLevel) < riskLevelValue("critical")) {
        riskLevel = "critical";
      }
      reasons.push("Content contains potential hardcoded secrets");
    }

    // 2. Crypto operations
    if (/\b(createHash|createCipheriv|sign|verify)\b/.test(content)) {
      if (riskLevelValue(riskLevel) < riskLevelValue("critical")) {
        riskLevel = "critical";
      }
      reasons.push("Content contains cryptographic operations");
    }

    // 3. SQL queries
    if (/\b(SELECT|INSERT|UPDATE|DELETE|DROP)\s+.*?\b(?:FROM|INTO|TABLE)\b/i.test(content)) {
      if (riskLevelValue(riskLevel) < riskLevelValue("sensitive")) {
        riskLevel = "sensitive";
      }
      reasons.push("Content contains SQL queries");
    }
  }

  return {
    path,
    riskLevel,
    reasons
  };
}

export function classifyFiles(
  paths: string[],
  customRules?: ClassificationRules
): FileClassification[] {
  const results = paths.map(p => classifyFile(p, undefined, customRules));
  return results.sort((a, b) => riskLevelValue(b.riskLevel) - riskLevelValue(a.riskLevel));
}
