import * as path from "node:path";
import { type TaskPathRule, taskPathRuleMatches } from "./contract.js";

/**
 * Extracts all module paths imported or required in a JS/TS/Python source file.
 */
export function extractDependencies(sourcePath: string, codeContent: string): string[] {
  const deps: string[] = [];

  if (sourcePath.endsWith(".py")) {
    const importRegex = /^[\t ]*import[\t ]+([a-zA-Z0-9_., \t]+)/gm;
    let match;
    while ((match = importRegex.exec(codeContent)) !== null) {
      if (!match[1]) continue;
      const parts = match[1].split(",").map((s) => s.trim());
      for (const p of parts) {
        if (p) {
          const splitP = p.split(/[\s#]/)[0];
          if (splitP) {
            deps.push(splitP);
          }
        }
      }
    }

    const fromRegex = /^[\t ]*from[\t ]+([a-zA-Z0-9_.]+)/gm;
    while ((match = fromRegex.exec(codeContent)) !== null) {
      if (match[1]) deps.push(match[1]);
    }
  } else {
    // 1. import ... from '...'
    const importFromRegex = /import\s+(?:type\s+)?(?:[^'"]+)\s+from\s+['"]([^'"]+)['"]/g;
    // 2. export ... from '...'
    const exportFromRegex = /export\s+(?:type\s+)?(?:[^'"]+)\s+from\s+['"]([^'"]+)['"]/g;
    // 3. import '...'
    const importSideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
    // 4. require('...')
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    // 5. import('...')
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    let match;
    while ((match = importFromRegex.exec(codeContent)) !== null) { if (match[1]) deps.push(match[1]); }
    while ((match = exportFromRegex.exec(codeContent)) !== null) { if (match[1]) deps.push(match[1]); }
    while ((match = importSideEffectRegex.exec(codeContent)) !== null) { if (match[1]) deps.push(match[1]); }
    while ((match = requireRegex.exec(codeContent)) !== null) { if (match[1]) deps.push(match[1]); }
    while ((match = dynamicImportRegex.exec(codeContent)) !== null) { if (match[1]) deps.push(match[1]); }
  }

  return [...new Set(deps)];
}

export type DependencyLeak = {
  dependency: string;
  resolvedPath?: string;
  matchedRule: TaskPathRule;
};

export function checkDependencyLeaks(
  sourcePath: string,
  codeContent: string,
  forbiddenPaths: TaskPathRule[]
): DependencyLeak[] {
  const leaks: DependencyLeak[] = [];
  const dependencies = extractDependencies(sourcePath, codeContent);
  const sourceDir = path.dirname(sourcePath);

  for (const dep of dependencies) {
    let resolvedPath: string | undefined;

    if (sourcePath.endsWith(".py")) {
      resolvedPath = dep.replace(/\./g, "/") + ".py";
    } else {
      if (dep.startsWith(".") || dep.startsWith("/")) {
        // Resolve relative to sourcePath
        resolvedPath = path.posix.normalize(path.posix.join(sourceDir, dep));
      } else {
        resolvedPath = dep;
      }
    }

    for (const rule of forbiddenPaths) {
      let matches = false;

      // Check resolved path if it matches file exactly or with common extensions
      if (resolvedPath) {
        if (taskPathRuleMatches(resolvedPath, rule)) {
          matches = true;
        } else if (
          rule.kind === "file" &&
          (taskPathRuleMatches(resolvedPath + ".js", rule) ||
            taskPathRuleMatches(resolvedPath.replace(/\.js$/, ".ts"), rule) ||
            taskPathRuleMatches(resolvedPath + "/index.js", rule) ||
            taskPathRuleMatches(resolvedPath + "/index.ts", rule))
        ) {
          matches = true;
        } else if (
          rule.kind === "directory" &&
          (resolvedPath.startsWith(rule.path + "/") || resolvedPath === rule.path)
        ) {
          matches = true;
        }
      }

      // Check raw dependency string just in case
      if (!matches && taskPathRuleMatches(dep, rule)) {
        matches = true;
      }

      if (matches) {
        leaks.push({
          dependency: dep,
          resolvedPath,
          matchedRule: rule,
        });
        break; // Only report one leak per dependency
      }
    }
  }

  return leaks;
}
