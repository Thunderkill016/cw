import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { resolveDefaultStateRoot } from "../store/runtime-paths.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export class EvidenceRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceRegistryError";
  }
}

export type EvidenceReference = {
  schemaVersion: 1;
  id: string;
  occurrenceId: string;
  digest: string;
  algorithm: "sha256";
  kind: string;
  mediaType: string;
  byteLength: number;
  storedPath: string;
  occurrencePath: string;
  sourcePath: string | null;
  createdAt: string;
};

type BlobMetadata = {
  schemaVersion: 1;
  id: string;
  digest: string;
  algorithm: "sha256";
  mediaType: string;
  byteLength: number;
  storedPath: string;
};

function portablePath(path: string): string {
  return path.split(sep).join("/");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonicalize(object[key])])
    );
  }
  return value;
}

function serializeJson(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(canonicalize(value), null, 2)}\n`, "utf8");
}

function digest(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

async function atomicWrite(path: string, content: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function isBlockedSecretPath(path: string): boolean {
  const normalized = portablePath(path).toLowerCase();
  if (normalized.endsWith("/.env.example") || normalized === ".env.example") return false;
  return (
    /(^|\/)\.env($|\.)/.test(normalized) ||
    /(^|\/)(id_rsa|id_ed25519|credentials?|secrets?)(\.|$|\/)/.test(normalized) ||
    /\.(pem|key|p12|pfx|jks|keystore)$/.test(normalized)
  );
}

function mediaTypeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".json":
      return "application/json";
    case ".md":
    case ".mdx":
      return "text/markdown";
    case ".txt":
    case ".log":
      return "text/plain";
    case ".yaml":
    case ".yml":
      return "application/yaml";
    default:
      return "application/octet-stream";
  }
}

function evidenceExtension(mediaType: string): string {
  if (mediaType === "application/json") return ".json";
  if (mediaType.startsWith("text/") || mediaType === "application/yaml") return ".txt";
  return ".bin";
}

export class EvidenceRegistry {
  readonly storeRoot: string;
  readonly projectRoot: string;
  readonly evidenceRoot: string;
  readonly occurrenceRoot: string;

  constructor(storeRoot = resolveDefaultStateRoot(), projectRoot = process.cwd()) {
    this.storeRoot = resolve(storeRoot);
    this.projectRoot = resolve(projectRoot);
    this.evidenceRoot = join(this.storeRoot, "evidence", "sha256");
    this.occurrenceRoot = join(this.storeRoot, "evidence", "occurrences");
  }

  private async persist(
    kind: string,
    content: Buffer,
    mediaType: string,
    sourcePath: string | null
  ): Promise<EvidenceReference> {
    if (!kind.trim()) throw new EvidenceRegistryError("evidence kind is required");
    if (!mediaType.trim()) throw new EvidenceRegistryError("evidence mediaType is required");
    const hash = digest(content);
    const artifactPath = join(this.evidenceRoot, `${hash}${evidenceExtension(mediaType)}`);
    const blobMetadataPath = join(this.evidenceRoot, `${hash}.blob.json`);
    const occurrenceId = `occurrence:${randomUUID()}`;
    const occurrencePath = join(this.occurrenceRoot, `${occurrenceId.slice("occurrence:".length)}.json`);
    const blob: BlobMetadata = {
      schemaVersion: 1,
      id: `sha256:${hash}`,
      digest: hash,
      algorithm: "sha256",
      mediaType,
      byteLength: content.byteLength,
      storedPath: portablePath(relative(this.storeRoot, artifactPath)),
    };
    const reference: EvidenceReference = {
      ...blob,
      occurrenceId,
      kind: kind.trim(),
      occurrencePath: portablePath(relative(this.storeRoot, occurrencePath)),
      sourcePath,
      createdAt: new Date().toISOString(),
    };

    try {
      await stat(artifactPath);
      const existing = await readFile(artifactPath);
      if (digest(existing) !== hash) {
        throw new EvidenceRegistryError(`existing evidence blob failed digest verification: ${hash}`);
      }
    } catch (error) {
      if (error instanceof EvidenceRegistryError) throw error;
      await atomicWrite(artifactPath, content);
    }

    try {
      await stat(blobMetadataPath);
    } catch {
      await atomicWrite(blobMetadataPath, serializeJson(blob));
    }
    await atomicWrite(occurrencePath, serializeJson(reference));
    return reference;
  }

  async verify(reference: EvidenceReference): Promise<boolean> {
    const path = resolve(this.storeRoot, reference.storedPath);
    const relativePath = relative(this.storeRoot, path);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new EvidenceRegistryError("stored evidence path escapes the store root");
    }
    const content = await readFile(path);
    return digest(content) === reference.digest && content.byteLength === reference.byteLength;
  }

  async registerJson(kind: string, value: unknown): Promise<EvidenceReference> {
    return this.persist(kind, serializeJson(value), "application/json", null);
  }

  async registerText(
    kind: string,
    value: string,
    mediaType = "text/plain",
    sourcePath: string | null = null
  ): Promise<EvidenceReference> {
    if (typeof value !== "string") throw new EvidenceRegistryError("text evidence must be a string");
    const content = Buffer.from(value, "utf8");
    if (content.byteLength > MAX_FILE_BYTES) {
      throw new EvidenceRegistryError(`text evidence exceeds ${MAX_FILE_BYTES} bytes`);
    }
    return this.persist(kind, content, mediaType, sourcePath);
  }

  async registerFile(kind: string, path: string): Promise<EvidenceReference> {
    const requested = isAbsolute(path) ? resolve(path) : resolve(this.projectRoot, path);
    let actual: string;
    try {
      actual = await realpath(requested);
    } catch (error) {
      throw new EvidenceRegistryError(
        `cannot resolve evidence file: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const relativePath = relative(this.projectRoot, actual);
    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new EvidenceRegistryError("evidence file must stay inside the project root");
    }
    if (isBlockedSecretPath(relativePath)) {
      throw new EvidenceRegistryError(`refusing to capture secret-bearing path: ${relativePath}`);
    }

    const details = await stat(actual);
    if (!details.isFile()) throw new EvidenceRegistryError("evidence path must be a regular file");
    if (details.size > MAX_FILE_BYTES) {
      throw new EvidenceRegistryError(
        `evidence file exceeds ${MAX_FILE_BYTES} bytes: ${basename(relativePath)}`
      );
    }

    const content = await readFile(actual);
    return this.persist(kind, content, mediaTypeFor(actual), portablePath(relativePath));
  }
}
