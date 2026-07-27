import { describe, it, expect } from "vitest";
import { calculateDiffRiskScore } from "../src/core/risk-scoring.js";

describe("calculateDiffRiskScore", () => {
  it("should calculate zero risk for empty inputs", () => {
    const result = calculateDiffRiskScore("", [], []);
    expect(result.riskScore).toBe(0);
    expect(result.riskFactors.length).toBe(0);
  });

  it("should detect cyclomatic complexity additions", () => {
    const diffText = `
+++ b/src/foo.ts
+ if (a && b) {
+   for (let i=0; i<10; i++) {
+     while(true) {}
+   }
+ }
`;
    const result = calculateDiffRiskScore(diffText, ["src/foo.ts"], []);
    expect(result.riskScore).toBeGreaterThan(0);
  });

  it("should flag large diff size", () => {
    // Generate large string
    const diffText = "+++ b/src/foo.ts\n" + "+ hello world\n".repeat(1000);
    const result = calculateDiffRiskScore(diffText, ["src/foo.ts"], []);
    expect(result.riskScore).toBeGreaterThan(0);
    expect(result.riskFactors).toContain(
      result.riskFactors.find(f => f.includes("Large diff size"))
    );
  });

  it("should detect boundary proximity", () => {
    const result = calculateDiffRiskScore(
      "+++ b/src/core/allowed.ts\n+ code",
      ["src/core/allowed.ts"],
      ["src/core/forbidden.ts"]
    );
    expect(result.riskScore).toBeGreaterThan(0);
    expect(result.riskFactors.some(f => f.includes("boundary overlaps"))).toBe(true);
  });
});
