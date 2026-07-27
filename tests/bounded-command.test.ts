import { describe, it, expect } from "vitest";
import { parseBoundedCommand, BoundedCommandError } from "../src/core/bounded-command.js";

describe("parseBoundedCommand", () => {
  it("parses a valid command spec", () => {
    const spec = parseBoundedCommand({
      id: "typecheck",
      executable: "npm",
      arguments: ["run", "typecheck"],
      relativeWorkingDirectory: ".",
      timeoutMs: 5000,
      maxOutputBytes: 1024,
    });
    expect(spec.id).toBe("typecheck");
    expect(spec.executable).toBe("npm");
    expect(spec.arguments).toEqual(["run", "typecheck"]);
  });

  it("rejects shell executables", () => {
    for (const shell of ["sh", "bash", "zsh", "cmd", "cmd.exe", "powershell", "pwsh"]) {
      expect(() =>
        parseBoundedCommand({
          id: "test",
          executable: shell,
          arguments: ["-c", "echo hi"],
          relativeWorkingDirectory: ".",
        })
      ).toThrow(BoundedCommandError);
    }
  });

  it("rejects interpreter eval-mode flags (sandbox bypass prevention)", () => {
    // Critical: node -e, python -c, perl -e must all be blocked
    const evalCases: [string, string][] = [
      ["node", "-e"],
      ["node", "--eval"],
      ["python", "-c"],
      ["python3", "-c"],
      ["perl", "-e"],
      ["ruby", "-e"],
      ["deno", "--eval"],
      ["bun", "-e"],
    ];
    for (const [exe, flag] of evalCases) {
      expect(() =>
        parseBoundedCommand({
          id: "hack",
          executable: exe,
          arguments: [flag, "process.exit(0)"],
          relativeWorkingDirectory: ".",
        }),
        `${exe} ${flag} should be blocked`
      ).toThrow(BoundedCommandError);
    }
  });

  it("allows interpreters when running a script file (no eval flags)", () => {
    // node run-tests.js is fine; only -e/-c are blocked
    const spec = parseBoundedCommand({
      id: "run",
      executable: "node",
      arguments: ["dist/cli/index.js", "verify"],
      relativeWorkingDirectory: ".",
    });
    expect(spec.executable).toBe("node");
  });

  it("rejects path traversal in relativeWorkingDirectory", () => {
    expect(() =>
      parseBoundedCommand({
        id: "test",
        executable: "npm",
        arguments: ["test"],
        relativeWorkingDirectory: "../etc",
      })
    ).toThrow(BoundedCommandError);

    expect(() =>
      parseBoundedCommand({
        id: "test",
        executable: "npm",
        arguments: ["test"],
        relativeWorkingDirectory: "/absolute/path",
      })
    ).toThrow(BoundedCommandError);
  });

  it("rejects unknown fields in the command spec", () => {
    expect(() =>
      parseBoundedCommand({
        id: "test",
        executable: "npm",
        arguments: [],
        relativeWorkingDirectory: ".",
        surpriseField: "oops",
      })
    ).toThrow(BoundedCommandError);
  });

  it("rejects id with invalid characters", () => {
    expect(() =>
      parseBoundedCommand({
        id: "bad id!",
        executable: "npm",
        arguments: [],
        relativeWorkingDirectory: ".",
      })
    ).toThrow(BoundedCommandError);
  });

  it("rejects arguments exceeding limits", () => {
    expect(() =>
      parseBoundedCommand({
        id: "test",
        executable: "npm",
        arguments: new Array(129).fill("a"),
        relativeWorkingDirectory: ".",
      })
    ).toThrow(BoundedCommandError);
  });

  it("applies default timeoutMs and maxOutputBytes when unspecified", () => {
    const spec = parseBoundedCommand({
      id: "test",
      executable: "npm",
      arguments: [],
      relativeWorkingDirectory: ".",
    });
    expect(spec.timeoutMs).toBe(10 * 60 * 1000); // DEFAULT_TIMEOUT_MS
    expect(spec.maxOutputBytes).toBe(1024 * 1024); // DEFAULT_MAX_OUTPUT_BYTES
  });

  it("rejects NUL byte in executable or arguments", () => {
    expect(() =>
      parseBoundedCommand({
        id: "test",
        executable: "npm\0bad",
        arguments: [],
        relativeWorkingDirectory: ".",
      })
    ).toThrow(BoundedCommandError);

    expect(() =>
      parseBoundedCommand({
        id: "test",
        executable: "npm",
        arguments: ["arg\0bad"],
        relativeWorkingDirectory: ".",
      })
    ).toThrow(BoundedCommandError);
  });
});
