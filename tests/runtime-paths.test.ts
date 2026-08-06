import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FORGE_STATE_DIRECTORY,
  LEGACY_CW_STATE_DIRECTORY,
  resolveDefaultStateRoot,
  resolveStateRoot,
  resolveTasksDir,
} from "../src/store/runtime-paths.js";

describe("Forge runtime paths", () => {
  const projectRoot = resolve("/tmp", "atoryn-forge-runtime-path-test");
  const canonicalRoot = resolve(projectRoot, FORGE_STATE_DIRECTORY);
  const legacyRoot = resolve(projectRoot, LEGACY_CW_STATE_DIRECTORY);

  it("uses the canonical state directory for a new project", () => {
    expect(resolveDefaultStateRoot(projectRoot, () => false)).toBe(canonicalRoot);
  });

  it("continues using an existing legacy .cw store when no canonical store exists", () => {
    expect(resolveDefaultStateRoot(projectRoot, (path) => path === legacyRoot)).toBe(legacyRoot);
  });

  it("prefers the canonical store when both directories exist", () => {
    expect(
      resolveDefaultStateRoot(
        projectRoot,
        (path) => path === canonicalRoot || path === legacyRoot
      )
    ).toBe(canonicalRoot);
  });
});

describe("resolveStateRoot", () => {
  const projectRoot = resolve("/tmp", "atoryn-forge-explicit-root-test");

  it("resolves an explicit root relative to the project root", () => {
    expect(resolveStateRoot(projectRoot, "custom-state", () => false)).toBe(
      resolve(projectRoot, "custom-state")
    );
  });

  it("ignores a blank explicit root and falls back to the default", () => {
    expect(resolveStateRoot(projectRoot, "   ", () => false)).toBe(
      resolve(projectRoot, FORGE_STATE_DIRECTORY)
    );
  });

  it("falls back to the default when no root is given", () => {
    expect(resolveStateRoot(projectRoot, undefined, () => false)).toBe(
      resolve(projectRoot, FORGE_STATE_DIRECTORY)
    );
  });
});

describe("resolveTasksDir", () => {
  it("places tasks under the state root", () => {
    expect(resolveTasksDir("/tmp/x/.forge")).toBe(resolve("/tmp/x/.forge", "tasks"));
  });
});
