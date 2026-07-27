import { createHash } from "node:crypto";

type JsonPrimitive = null | boolean | number | string;
type CanonicalJson = JsonPrimitive | CanonicalJson[] | { [key: string]: CanonicalJson };

export class IntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrityError";
  }
}

function canonicalize(value: unknown, path = "$"): CanonicalJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new IntegrityError(`${path} must contain a finite number`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  }
  if (typeof value !== "object") {
    throw new IntegrityError(`${path} contains a non-JSON value`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new IntegrityError(`${path} must contain only plain JSON objects`);
  }

  const result: Record<string, CanonicalJson> = Object.create(null) as Record<
    string,
    CanonicalJson
  >;
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child === undefined) throw new IntegrityError(`${path}.${key} may not be undefined`);
    result[key] = canonicalize(child, `${path}.${key}`);
  }
  return result;
}

export function canonicalJson(value: unknown, spacing?: number): string {
  return JSON.stringify(canonicalize(value), null, spacing);
}

export function canonicalJsonDocument(value: unknown): string {
  return `${canonicalJson(value, 2)}\n`;
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function domainSeparatedDigest(domain: string, value: string | Uint8Array): string {
  const normalizedDomain = domain.trim();
  if (!normalizedDomain || normalizedDomain.includes("\0")) {
    throw new IntegrityError("digest domain must be a non-empty NUL-free string");
  }
  return createHash("sha256")
    .update(normalizedDomain, "utf8")
    .update("\0")
    .update(value)
    .digest("hex");
}

export function digestCanonicalJson(domain: string, value: unknown): string {
  return domainSeparatedDigest(domain, canonicalJson(value));
}
