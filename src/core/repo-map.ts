import * as fs from "node:fs";
import * as path from "node:path";

export interface RepoMapNode {
  file: string;
  symbols: string[];
}

export interface RepoMapResult {
  nodes: RepoMapNode[];
  summary: string;
}

const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".forge",
  ".cw",
  "dist",
  "build",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  ".venv",
  "venv"
]);

const JS_TS_REGEX = /export\s+(?:async\s+)?(?:function|class|interface|type)\s+([A-Za-z0-9_]+)|export\s+(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=/g;
const PY_REGEX = /^(?:async\s+)?(?:def|class)\s+([A-Za-z0-9_]+)\s*(?:\(|:)/gm;

export function generateRepoMap(projectRoot: string): RepoMapResult {
  const nodes: RepoMapNode[] = [];
  
  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx" || ext === ".py") {
          const filePath = path.join(dir, entry.name);
          const relPath = path.relative(projectRoot, filePath);
          const symbols = extractSymbols(filePath, ext);
          if (symbols.length > 0) {
            nodes.push({ file: relPath, symbols });
          }
        }
      }
    }
  }

  walk(projectRoot);
  
  // Sort for determinism
  nodes.sort((a, b) => a.file.localeCompare(b.file));
  for (const node of nodes) {
    node.symbols.sort();
  }

  const summary = nodes.map(n => `${n.file}:\n${n.symbols.map(s => `  - ${s}`).join("\n")}`).join("\n\n");
  
  return {
    nodes,
    summary: summary || "No exported symbols found."
  };
}

function extractSymbols(filePath: string, ext: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const symbols = new Set<string>();

  if (ext === ".py") {
    let match;
    while ((match = PY_REGEX.exec(content)) !== null) {
      if (match[1]) symbols.add(match[1]);
    }
  } else {
    let match;
    while ((match = JS_TS_REGEX.exec(content)) !== null) {
      const sym = match[1] || match[2];
      if (sym) symbols.add(sym);
    }
  }

  return Array.from(symbols);
}
