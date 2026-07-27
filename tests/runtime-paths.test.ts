import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CYCLEWARDEN_STATE_DIRECTORY,
  LEGACY_SHIPKIT_STATE_DIRECTORY,
  resolveDefaultStateRoot,
} from "../src/store/runtime-paths.js";

describe("CycleWarden runtime paths", () => {
  const projectRoot = resolve("/tmp", "cyclewarden-runtime-path-test");
  const canonicalRoot = resolve(projectRoot, CYCLEWARDEN_STATE_DIRECTORY);
  const legacyRoot = resolve(projectRoot, LEGACY_SHIPKIT_STATE_DIRECTORY);

  it("uses the canonical state directory for a new project", () => {
    expect(resolveDefaultStateRoot(projectRoot, () => false)).toBe(canonicalRoot);
  });

  it("continues using an existing legacy store when no canonical store exists", () => {
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
