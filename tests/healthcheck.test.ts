import { describe, it, expect } from "vitest";
import { getSystemHealth } from "../src/core/healthcheck.js";

describe("healthcheck module", () => {
  it("returns status ok and valid uptime", () => {
    const health = getSystemHealth();
    expect(health.status).toBe("ok");
    expect(health.version).toBe("0.1.0");
    expect(typeof health.uptimeSeconds).toBe("number");
    expect(typeof health.timestamp).toBe("string");
  });
});
