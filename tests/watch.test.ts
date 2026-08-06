import { describe, it, expect } from "vitest";
import { runWatch } from "../src/cli/watch.js";

describe("forge watch subcommand", () => {
  it("executes watch command cleanly with default options", async () => {
    let output = "";
    const io = {
      stdout: (msg: string) => { output += msg; },
      stderr: (msg: string) => { output += msg; },
    };

    const code = await runWatch([], io);
    expect(code).toBe(0);
    expect(output).toContain("Watching Forge state directory");
  });

  it("supports --json flag", async () => {
    let output = "";
    const io = {
      stdout: (msg: string) => { output += msg; },
      stderr: (msg: string) => { output += msg; },
    };

    const code = await runWatch(["--json"], io);
    expect(code).toBe(0);
    const parsed = JSON.parse(output);
    expect(parsed.watching).toBe(true);
  });
});
