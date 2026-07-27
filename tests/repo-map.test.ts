import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateRepoMap } from "../src/core/repo-map.js";
import { runMap } from "../src/cli/map.js";

describe("Repo Map", () => {
  const testDir = path.join(process.cwd(), "test-repo-map");

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    
    // Create some files
    fs.writeFileSync(path.join(testDir, "a.ts"), `
export function hello() {}
export const test = () => {};
`);
    fs.writeFileSync(path.join(testDir, "b.py"), `
def python_func():
    pass
class PyClass:
    pass
`);
    fs.mkdirSync(path.join(testDir, "node_modules"));
    fs.writeFileSync(path.join(testDir, "node_modules", "ignore.ts"), `export function ignored() {}`);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("generates repo map correctly", () => {
    const result = generateRepoMap(testDir);
    expect(result.nodes).toHaveLength(2);
    
    const aNode = result.nodes.find(n => n.file === "a.ts");
    expect(aNode?.symbols).toContain("hello");
    expect(aNode?.symbols).toContain("test");

    const bNode = result.nodes.find(n => n.file === "b.py");
    expect(bNode?.symbols).toContain("python_func");
    expect(bNode?.symbols).toContain("PyClass");
    
    expect(result.summary).toContain("a.ts:");
    expect(result.summary).toContain("hello");
  });

  it("cli map json output", async () => {
    let out = "";
    const io = {
      stdout: (msg: string) => { out += msg; },
      stderr: (msg: string) => {}
    };

    const code = await runMap(["--project-root", testDir, "--json"], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].file).toBe("a.ts");
  });
});
