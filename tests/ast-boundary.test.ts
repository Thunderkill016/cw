import { describe, it, expect } from "vitest";
import { extractDependencies, checkDependencyLeaks } from "../src/core/ast-boundary.js";
import type { TaskPathRule } from "../src/core/contract.js";

describe("AST Dependency Graph Boundary Engine", () => {
  describe("extractDependencies", () => {
    it("extracts from JS/TS imports and requires", () => {
      const code = `
        import { foo } from "./utils.js";
        import type { Bar } from "../types.js";
        export { baz } from "baz-pkg";
        import "side-effects";
        const fs = require("node:fs");
        const dyn = import("./dynamic.js");
      `;
      const deps = extractDependencies("src/index.ts", code);
      expect(deps).toEqual([
        "./utils.js",
        "../types.js",
        "baz-pkg",
        "side-effects",
        "node:fs",
        "./dynamic.js",
      ]);
    });

    it("extracts from Python imports", () => {
      const code = `
        import sys, os
        import json # comment
        from my_package import my_module
        from .local import stuff
      `;
      const deps = extractDependencies("src/main.py", code);
      expect(deps).toEqual(["sys", "os", "json", "my_package", ".local"]);
    });
  });

  describe("checkDependencyLeaks", () => {
    it("detects leaks when importing forbidden files", () => {
      const code = `import { secret } from "../../secrets/keys.js";`;
      const forbiddenPaths: TaskPathRule[] = [
        { kind: "file", path: "secrets/keys.ts" }, // Note: checking extension fuzzy match
      ];
      
      const leaks = checkDependencyLeaks("src/core/main.ts", code, forbiddenPaths);
      expect(leaks).toHaveLength(1);
      expect(leaks[0].dependency).toBe("../../secrets/keys.js");
      expect(leaks[0].matchedRule.path).toBe("secrets/keys.ts");
    });

    it("detects leaks when importing forbidden directories", () => {
      const code = `require("../../../backend/db/config.js");`;
      const forbiddenPaths: TaskPathRule[] = [
        { kind: "directory", path: "backend/db" },
      ];
      
      const leaks = checkDependencyLeaks("src/core/utils/index.js", code, forbiddenPaths);
      expect(leaks).toHaveLength(1);
      expect(leaks[0].dependency).toBe("../../../backend/db/config.js");
      expect(leaks[0].matchedRule.path).toBe("backend/db");
    });

    it("allows valid imports", () => {
      const code = `import { utils } from "./utils.js";`;
      const forbiddenPaths: TaskPathRule[] = [
        { kind: "directory", path: "backend/db" },
      ];
      
      const leaks = checkDependencyLeaks("src/core/main.ts", code, forbiddenPaths);
      expect(leaks).toHaveLength(0);
    });
  });
});
