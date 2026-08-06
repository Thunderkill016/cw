import { isAbsolute } from "node:path";
import { PROJECT_DIGEST_DOMAIN } from "./digest-domains.js";
import { digestCanonicalJson } from "./integrity.js";

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

/**
 * How Forge reaches a project's code.
 *
 * `local` is a working copy on the same machine as the process running Forge.
 * `remote` names a repository Forge does not have on disk — the control plane
 * can still track it, but any command needing a working tree must say so rather
 * than silently operating on the wrong directory.
 */
export type RepositoryConnection =
  | { kind: "local"; path: string; defaultBranch: string }
  | { kind: "remote"; url: string; defaultBranch: string };

export type ProjectV1 = {
  schemaVersion: 1;
  recordType: "project";
  projectId: string;
  name: string;
  description: string | null;
  repository: RepositoryConnection;
  /**
   * Where this project's task state is written. `in-repository` keeps contracts
   * and evidence next to the code (reviewable in a PR); `control-plane` keeps
   * them in Forge's home, for repositories Forge must not write into.
   */
  stateLocation: "in-repository" | "control-plane";
  createdAt: string;
  projectDigest: string;
};

/** Project ids double as directory names, so they are restricted like task ids. */
const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const REMOTE_URL_PATTERN = /^(https:\/\/|git@|ssh:\/\/)[^\s]+$/;

function requiredString(value: unknown, label: string, maximum = 4_000): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new ProjectError(`${label} is required`);
  if (result.length > maximum) throw new ProjectError(`${label} exceeds ${maximum} characters`);
  if (result.includes("\0")) throw new ProjectError(`${label} may not contain NUL`);
  return result;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

/**
 * Derives a project id from a human name.
 *
 * Kept deterministic and lossy-but-legible rather than random, so a project
 * registered twice by the same name collides loudly instead of silently
 * creating a duplicate the user cannot tell apart.
 */
export function projectIdFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  if (!PROJECT_ID_PATTERN.test(slug)) {
    throw new ProjectError(
      `cannot derive a project id from name '${name}'; pass --id explicitly`
    );
  }
  return slug;
}

function parseRepository(value: unknown): RepositoryConnection {
  const record = requireObject(value, "repository");
  const defaultBranch = requiredString(record.defaultBranch, "repository.defaultBranch", 256);

  if (record.kind === "local") {
    const path = requiredString(record.path, "repository.path", 4_000);
    if (!isAbsolute(path)) {
      throw new ProjectError("repository.path must be absolute so it resolves from any cwd");
    }
    return { kind: "local", path, defaultBranch };
  }
  if (record.kind === "remote") {
    const url = requiredString(record.url, "repository.url", 2_000);
    if (!REMOTE_URL_PATTERN.test(url)) {
      throw new ProjectError("repository.url must be an https, ssh or git@ URL");
    }
    return { kind: "remote", url, defaultBranch };
  }
  throw new ProjectError("repository.kind must be local or remote");
}

function projectPayload(project: Omit<ProjectV1, "projectDigest"> | ProjectV1) {
  const { projectDigest: _discarded, ...payload } = project as ProjectV1;
  return payload;
}

export function projectDigest(
  project: Omit<ProjectV1, "projectDigest"> | ProjectV1
): string {
  return digestCanonicalJson(PROJECT_DIGEST_DOMAIN, projectPayload(project));
}

export type CreateProjectInput = {
  name: string;
  projectId?: string;
  description?: string | null;
  repository: RepositoryConnection;
  stateLocation?: ProjectV1["stateLocation"];
  createdAt?: string;
};

export function createProject(input: CreateProjectInput): ProjectV1 {
  const name = requiredString(input.name, "name", 256);
  const projectId = input.projectId?.trim() || projectIdFromName(name);
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new ProjectError(
      `projectId must be 2-64 chars of lowercase letters, digits and hyphens: ${projectId}`
    );
  }

  const payload: Omit<ProjectV1, "projectDigest"> = {
    schemaVersion: 1,
    recordType: "project",
    projectId,
    name,
    description: input.description?.trim() || null,
    repository: parseRepository(input.repository),
    stateLocation: input.stateLocation ?? "in-repository",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  return { ...payload, projectDigest: projectDigest(payload) };
}

export function parseProject(value: unknown): ProjectV1 {
  const record = requireObject(value, "project");
  if (record.schemaVersion !== 1) {
    throw new ProjectError("project schemaVersion must equal 1");
  }
  if (record.recordType !== "project") {
    throw new ProjectError("project recordType must equal project");
  }
  const stateLocation = record.stateLocation;
  if (stateLocation !== "in-repository" && stateLocation !== "control-plane") {
    throw new ProjectError("project stateLocation must be in-repository or control-plane");
  }

  const projectId = requiredString(record.projectId, "projectId", 64);
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new ProjectError(`project projectId has an invalid format: ${projectId}`);
  }

  const project: ProjectV1 = {
    schemaVersion: 1,
    recordType: "project",
    projectId,
    name: requiredString(record.name, "name", 256),
    description: record.description === null ? null : requiredString(record.description, "description"),
    repository: parseRepository(record.repository),
    stateLocation,
    createdAt: requiredString(record.createdAt, "createdAt", 64),
    projectDigest: requiredString(record.projectDigest, "projectDigest", 64),
  };

  if (!/^[a-f0-9]{64}$/.test(project.projectDigest)) {
    throw new ProjectError("projectDigest must be a sha256 hex digest");
  }
  if (projectDigest(project) !== project.projectDigest) {
    throw new ProjectError("project digest mismatch");
  }
  return project;
}

/**
 * Returns the repository working-tree path for a project, or throws when the
 * project has no local checkout.
 *
 * Callers that need a working tree must go through this rather than guessing,
 * so a remote-only project fails with an explanation instead of silently
 * operating on the current directory.
 */
export function requireLocalRepositoryPath(project: ProjectV1): string {
  if (project.repository.kind !== "local") {
    throw new ProjectError(
      `project ${project.projectId} has no local checkout; ` +
        `this command needs a working tree (repository is ${project.repository.url})`
    );
  }
  return project.repository.path;
}
