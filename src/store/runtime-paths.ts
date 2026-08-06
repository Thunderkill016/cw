import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const FORGE_STATE_DIRECTORY = ".forge";
export const LEGACY_CW_STATE_DIRECTORY = ".cw";

/** Directory name of the control-plane home inside the user's home directory. */
export const FORGE_HOME_DIRECTORY = ".atoryn-forge";
/** Environment variable that relocates the control-plane home. */
export const FORGE_HOME_ENV = "FORGE_HOME";

type StateDirectoryExists = (path: string) => boolean;

/**
 * Resolves Forge's control-plane home — where the *registry of projects* lives.
 *
 * This is deliberately distinct from a project's own state root. A project's
 * contracts and evidence stay next to the code they describe (portable, visible
 * in a PR); the registry that knows which projects exist has to live outside any
 * one of them, because Forge manages projects other than the one it is run from.
 *
 * Honours `FORGE_HOME` so tests and self-hosted deployments can relocate it
 * without touching the real user home.
 */
export function resolveForgeHome(
  env: NodeJS.ProcessEnv = process.env,
  userHome: () => string = homedir
): string {
  const override = env[FORGE_HOME_ENV]?.trim();
  if (override) return resolve(override);
  return resolve(userHome(), FORGE_HOME_DIRECTORY);
}

/** Path of the project registry file within a control-plane home. */
export function resolveRegistryPath(forgeHome: string): string {
  return resolve(forgeHome, "registry.json");
}

/**
 * Resolves the directory Forge keeps for one registered project.
 *
 * Used for control-plane records that do not belong inside the target
 * repository — the project record itself, and state for projects whose
 * repository Forge must not write into.
 */
export function resolveProjectHome(forgeHome: string, projectId: string): string {
  return resolve(forgeHome, "projects", projectId);
}

/**
 * Single source of truth for where Forge keeps project state.
 *
 * Every command must resolve the state root through here. Commands used to
 * hard-code their own literal, which let `forge audit` read a different
 * directory than `forge prepare` wrote to.
 *
 * Prefer the canonical `.forge` store without abandoning a project that was
 * already initialized under the previous `.cw` name. An explicit `--root`
 * bypasses this resolver entirely.
 */
export function resolveDefaultStateRoot(
  projectRoot = process.cwd(),
  directoryExists: StateDirectoryExists = existsSync
): string {
  const canonicalRoot = resolve(projectRoot, FORGE_STATE_DIRECTORY);
  const legacyRoot = resolve(projectRoot, LEGACY_CW_STATE_DIRECTORY);
  if (directoryExists(canonicalRoot) || !directoryExists(legacyRoot)) {
    return canonicalRoot;
  }
  return legacyRoot;
}

/**
 * Resolves the state root for a command, honouring an explicit `--root` value
 * relative to the project root.
 */
export function resolveStateRoot(
  projectRoot: string,
  explicitRoot: string | undefined,
  directoryExists: StateDirectoryExists = existsSync
): string {
  const trimmed = explicitRoot?.trim();
  if (trimmed) return resolve(projectRoot, trimmed);
  return resolveDefaultStateRoot(projectRoot, directoryExists);
}

/**
 * Resolves the directory holding all task state within a state root.
 */
export function resolveTasksDir(stateRoot: string): string {
  return resolve(stateRoot, "tasks");
}
