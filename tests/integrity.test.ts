import { describe, expect, it } from "vitest";
import { canonicalJson, digestCanonicalJson, IntegrityError } from "../src/core/integrity.js";

describe("canonical integrity", () => {
  it("produces the same digest for equivalent objects with different insertion order", () => {
    const left = { z: 1, nested: { b: true, a: ["x", 2] } };
    const right = { nested: { a: ["x", 2], b: true }, z: 1 };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(digestCanonicalJson("fixture.v1", left)).toBe(
      digestCanonicalJson("fixture.v1", right)
    );
  });

  it("uses domain separation and rejects non-JSON values", () => {
    expect(digestCanonicalJson("left.v1", { value: 1 })).not.toBe(
      digestCanonicalJson("right.v1", { value: 1 })
    );
    expect(() => canonicalJson({ value: undefined })).toThrow(IntegrityError);
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(IntegrityError);
  });

  it("preserves prototype-looking JSON keys without digest collisions", () => {
    const adversarial = JSON.parse('{"__proto__":{"pwned":true}}') as unknown;
    expect(canonicalJson(adversarial)).toBe('{"__proto__":{"pwned":true}}');
    expect(digestCanonicalJson("fixture.v1", adversarial)).not.toBe(
      digestCanonicalJson("fixture.v1", {})
    );
  });
});
