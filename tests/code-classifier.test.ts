import { describe, it, expect } from "vitest";
import { classifyFile, classifyFiles, riskLevelValue, aggregateRiskLevel } from "../src/core/code-classifier.js";

describe("code-classifier", () => {
  describe("classifyFile", () => {
    it("classifies critical paths correctly", () => {
      const result1 = classifyFile("src/auth/login.ts");
      expect(result1.riskLevel).toBe("critical");
      
      const result2 = classifyFile(".env.production");
      expect(result2.riskLevel).toBe("critical");
    });

    it("classifies sensitive paths correctly", () => {
      const result1 = classifyFile("src/config/database.ts");
      expect(result1.riskLevel).toBe("sensitive");

      const result2 = classifyFile("schema.sql");
      expect(result2.riskLevel).toBe("sensitive");
    });

    it("classifies generated paths correctly", () => {
      const result1 = classifyFile("dist/bundle.min.js");
      expect(result1.riskLevel).toBe("generated");

      const result2 = classifyFile("api.generated.ts");
      expect(result2.riskLevel).toBe("generated");
    });

    it("defaults to standard risk", () => {
      const result = classifyFile("src/utils/helpers.ts");
      expect(result.riskLevel).toBe("standard");
    });

    it("upgrades risk based on content heuristics", () => {
      const result1 = classifyFile("src/utils/test.ts", 'const API_KEY = "123";');
      expect(result1.riskLevel).toBe("critical");
      expect(result1.reasons).toContain("Content contains potential hardcoded secrets");

      const result2 = classifyFile("src/utils/crypto.ts", "createHash('sha256')");
      expect(result2.riskLevel).toBe("critical");

      const result3 = classifyFile("src/utils/db.ts", "SELECT * FROM users");
      expect(result3.riskLevel).toBe("sensitive");
    });

    it("does not upgrade generated files based on content", () => {
      const result = classifyFile("dist/bundle.js", 'const API_KEY = "123";');
      expect(result.riskLevel).toBe("generated");
    });
  });

  describe("classifyFiles", () => {
    it("sorts by risk level", () => {
      const results = classifyFiles(["src/utils/helpers.ts", "src/auth/login.ts", "dist/bundle.js"]);
      expect(results[0].riskLevel).toBe("critical");
      expect(results[1].riskLevel).toBe("standard");
      expect(results[2].riskLevel).toBe("generated");
    });
  });

  describe("aggregateRiskLevel", () => {
    it("returns highest risk level", () => {
      const results = classifyFiles(["src/utils/helpers.ts", "src/auth/login.ts", "dist/bundle.js"]);
      expect(aggregateRiskLevel(results)).toBe("critical");
    });
  });
});
