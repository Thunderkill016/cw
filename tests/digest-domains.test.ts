import { describe, expect, it } from "vitest";
import {
  CONTRACT_DIGEST_DOMAIN,
  EVIDENCE_DIGEST_DOMAIN,
  LEGACY_CONTRACT_DIGEST_DOMAINS,
  LEGACY_EVIDENCE_DIGEST_DOMAINS,
  digestMatchesAnyDomain,
} from "../src/core/digest-domains.js";
import { digestCanonicalJson } from "../src/core/integrity.js";

const PAYLOAD = { taskId: "demo", objective: "do the thing" };

describe("digest domains", () => {
  it("issues digests under the Atoryn Forge v2 domains", () => {
    expect(CONTRACT_DIGEST_DOMAIN).toBe("atoryn.forge.task-contract.v2");
    expect(EVIDENCE_DIGEST_DOMAIN).toBe("atoryn.forge.verification-evidence.v2");
  });

  it("keeps the CycleWarden v1 domains only on the read path", () => {
    expect(LEGACY_CONTRACT_DIGEST_DOMAINS).toContain("cyclewarden.task-contract.v1");
    expect(LEGACY_EVIDENCE_DIGEST_DOMAINS).toContain("cyclewarden.verification-evidence.v1");
    // A legacy domain must never be the domain a new digest is issued under.
    expect(LEGACY_CONTRACT_DIGEST_DOMAINS).not.toContain(CONTRACT_DIGEST_DOMAIN);
    expect(LEGACY_EVIDENCE_DIGEST_DOMAINS).not.toContain(EVIDENCE_DIGEST_DOMAIN);
  });

  it("changing the domain changes the digest", () => {
    expect(digestCanonicalJson(CONTRACT_DIGEST_DOMAIN, PAYLOAD)).not.toBe(
      digestCanonicalJson("cyclewarden.task-contract.v1", PAYLOAD)
    );
  });
});

describe("digestMatchesAnyDomain", () => {
  it("accepts a digest issued under the canonical domain", () => {
    const digest = digestCanonicalJson(CONTRACT_DIGEST_DOMAIN, PAYLOAD);
    expect(
      digestMatchesAnyDomain(CONTRACT_DIGEST_DOMAIN, LEGACY_CONTRACT_DIGEST_DOMAINS, PAYLOAD, digest)
    ).toBe(true);
  });

  it("accepts a digest issued before the rename under a legacy domain", () => {
    const legacyDigest = digestCanonicalJson("cyclewarden.task-contract.v1", PAYLOAD);
    expect(
      digestMatchesAnyDomain(
        CONTRACT_DIGEST_DOMAIN,
        LEGACY_CONTRACT_DIGEST_DOMAINS,
        PAYLOAD,
        legacyDigest
      )
    ).toBe(true);
  });

  it("rejects a digest from an unrelated domain", () => {
    const foreignDigest = digestCanonicalJson("some.other.product.v1", PAYLOAD);
    expect(
      digestMatchesAnyDomain(
        CONTRACT_DIGEST_DOMAIN,
        LEGACY_CONTRACT_DIGEST_DOMAINS,
        PAYLOAD,
        foreignDigest
      )
    ).toBe(false);
  });

  it("rejects a digest over a different payload", () => {
    const digest = digestCanonicalJson(CONTRACT_DIGEST_DOMAIN, PAYLOAD);
    expect(
      digestMatchesAnyDomain(
        CONTRACT_DIGEST_DOMAIN,
        LEGACY_CONTRACT_DIGEST_DOMAINS,
        { ...PAYLOAD, objective: "something else" },
        digest
      )
    ).toBe(false);
  });

  it("rejects everything when no legacy domain is accepted", () => {
    const legacyDigest = digestCanonicalJson("cyclewarden.task-contract.v1", PAYLOAD);
    expect(digestMatchesAnyDomain(CONTRACT_DIGEST_DOMAIN, [], PAYLOAD, legacyDigest)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End-to-end proof of the compatibility claim: a contract whose digest was
// issued under the pre-rename CycleWarden domain must still parse, and a
// contract carrying a digest from an unrelated domain must still be rejected.
// ---------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach } from "vitest";
import {
  parseTaskContract,
  prepareTaskContract,
  TaskContractError,
} from "../src/core/contract.js";

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

async function legacyContractFixture() {
  const root = await mkdtemp(join(tmpdir(), "atoryn-forge-legacy-digest-"));
  temporaryRoots.push(root);
  const git = (args: string[]) => execFileAsync("git", ["-C", root, ...args]);
  await git(["init"]);
  await git(["config", "user.name", "Forge Test"]);
  await git(["config", "user.email", "forge@example.invalid"]);
  await writeFile(join(root, "README.md"), "# Fixture\n", "utf8");
  await git(["add", "README.md"]);
  await git(["commit", "-m", "base"]);

  const contract = await prepareTaskContract({
    repositoryRoot: root,
    stateRoot: join(root, ".forge"),
    draft: {
      schemaVersion: 1,
      taskId: "legacy-task",
      sourceRef: null,
      objective: "A task prepared before the Atoryn Forge rename",
      contextPaths: ["README.md"],
      acceptanceCriteria: [{ id: "AC-01", description: "still verifies" }],
      allowedPaths: [{ kind: "directory", path: "docs" }],
      forbiddenPaths: [],
      constraints: [],
      verificationCommands: [
        {
          id: "noop",
          executable: process.execPath,
          arguments: ["--version"],
          relativeWorkingDirectory: ".",
          timeoutMs: 10_000,
          maxOutputBytes: 16_384,
        },
      ],
    },
    preparedBy: "owner",
    preparedAt: "2026-07-26T00:00:00.000Z",
  });

  const { contractDigest: _issued, ...payload } = contract;
  return { contract, payload };
}

describe("contract digest compatibility across the rename", () => {
  it("issues new contracts under the v2 domain", async () => {
    const { contract, payload } = await legacyContractFixture();
    expect(contract.contractDigest).toBe(digestCanonicalJson(CONTRACT_DIGEST_DOMAIN, payload));
  });

  it("still accepts a contract digested under the pre-rename domain", async () => {
    const { contract, payload } = await legacyContractFixture();
    const legacyContract = {
      ...contract,
      contractDigest: digestCanonicalJson("cyclewarden.task-contract.v1", payload),
    };
    expect(legacyContract.contractDigest).not.toBe(contract.contractDigest);
    expect(parseTaskContract(legacyContract)).toEqual(legacyContract);
  });

  it("still rejects a tampered contract regardless of domain", async () => {
    const { contract } = await legacyContractFixture();
    const tampered = { ...contract, objective: "something the digest never covered" };
    expect(() => parseTaskContract(tampered)).toThrow(TaskContractError);
  });

  it("still rejects a digest issued under an unrelated domain", async () => {
    const { contract, payload } = await legacyContractFixture();
    const foreign = {
      ...contract,
      contractDigest: digestCanonicalJson("some.other.product.v1", payload),
    };
    expect(() => parseTaskContract(foreign)).toThrow(TaskContractError);
  });
});
