import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const CYCLEWARDEN_STATE_DIRECTORY = ".cyclewarden";
export const LEGACY_SHIPKIT_STATE_DIRECTORY = ".shipkit";

type StateDirectoryExists = (path: string) => boolean;

/**
 * Prefer the canonical CycleWarden store without abandoning an existing
 * Shipkit store. Explicit --root values bypass this resolver.
 */
export function resolveDefaultStateRoot(
  projectRoot = process.cwd(),
  directoryExists: StateDirectoryExists = existsSync
): string {
  const canonicalRoot = resolve(projectRoot, CYCLEWARDEN_STATE_DIRECTORY);
  const legacyRoot = resolve(projectRoot, LEGACY_SHIPKIT_STATE_DIRECTORY);
  if (directoryExists(canonicalRoot) || !directoryExists(legacyRoot)) {
    return canonicalRoot;
  }
  return legacyRoot;
}
