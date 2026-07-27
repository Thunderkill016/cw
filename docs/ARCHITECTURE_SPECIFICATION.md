# CW (CycleWarden) — World-Class AI Governance Protocol Specification

## 1. Vision & Executive Summary

**CW (CycleWarden)** is the world's premier zero-dependency, local-first deterministic governance layer and verification engine for AI coding agents.

As AI agents (Cursor, Claude Code, Aider, Windsurf, autonomous subagents) write an increasing portion of software, traditional CI/CD pipelines are no longer sufficient. Agents need **cryptographically enforced boundaries**, **deterministic task contracts**, and **independent verification chains** to guarantee safety, zero regressions, and strict adherence to architectural constraints.

CW achieves this with **zero runtime dependencies**, running natively on Node.js 20+ and Git.

---

## 2. Cryptographic Protocol Specification

### 2.1 Task Contract V1 (`TaskContractV1`)
A Task Contract locks the baseline repository state and permissible scope before an AI agent begins implementation.

- **`contractDigest`**: Domain-separated SHA-256 hash using Canonical JSON (`cyclewarden.task-contract.v1`).
- **`repository.baseSha`**: The exact Git commit hash of the base tree.
- **`repository.baseTreeSha`**: The exact Git tree hash of the base tree.
- **`allowedPaths`**: Set of POSIX normalized repository-relative path rules (`file` or `directory`).
- **`forbiddenPaths`**: Set of POSIX normalized path rules explicitly off-limits.
- **`verificationCommands`**: Bounded CLI verification specifications with strict timeout and output limits.

### 2.2 Acceptance Assessment V1 (`AcceptanceAssessmentV1`)
Independent evaluation produced by a reviewer agent (or human reviewer) distinct from the implementer agent.

- **`contractDigest`**: Cryptographically bound to the target contract.
- **`reviewer`**: Identity of the reviewing provider and run ID.
- **`criteria`**: Status (`passed` | `failed` | `inconclusive`) for every acceptance criterion in the contract, referencing verification evidence IDs.

### 2.3 Verification Evidence V1 (`VerificationEvidenceV1`)
Signed, immutable proof of verification results produced after tree diffing and sandbox execution.

- **`verdict`**: `accepted` | `rejected` | `inconclusive`.
- **`scope.status`**: `passed` | `violated`.
- **`evidenceDigest`**: SHA-256 domain digest (`cyclewarden.verification-evidence.v1`).

---

## 3. Core Engine Architecture

```
                       +-------------------------+
                       |      Task Spec JSON     |
                       +-------------------------+
                                    |
                                    v
                         +--------------------+
                         |     cw prepare     |
                         +--------------------+
                                    |
                         (TaskContractV1 Signed)
                                    |
                                    v
     +-------------------------------------------------------------+
     |                    AI Implementation Phase                  |
     |            (Agent modifies code within allowedPaths)        |
     +-------------------------------------------------------------+
                                    |
                                    v
                         +--------------------+
                         |      cw verify     |
                         +--------------------+
                                    |
        +---------------------------+---------------------------+
        |                           |                           |
        v                           v                           v
  [ Scope Check ]          [ Command Sandbox ]        [ Assessment Check ]
  Git Tree Diffing         Bounded Timeout & Output    Criterion Matching
        |                           |                           |
        +---------------------------+---------------------------+
                                    |
                                    v
                     +----------------------------+
                     |  Verification Evidence V1  |
                     |  (ACCEPTED / REJECTED)     |
                     +----------------------------+
```

### 3.1 Zero-Dependency Native Core
- Built 100% on Node.js built-ins (`node:util`, `node:crypto`, `node:fs/promises`, `node:path`).
- Uses `node:util.parseArgs` for strict POSIX CLI flag parsing.

### 3.2 Git Tree Diff & Path Boundary Engine
- Parses raw `git diff-index` with NUL-delimiters (`-z`) to safely handle spaces, renames, mode changes, and symlinks.
- Evaluates modified files against `allowedPaths` and `forbiddenPaths` rules.

### 3.3 State Machine & Atomic Persistence
- 5-stage lifecycle state machine (`draft` ➔ `prepared` ➔ `implementing` ➔ `verifying` ➔ `accepted` / `rejected`).
- File locking and atomic rename writes to prevent race conditions in multi-agent environments.

---

## 4. Integration Guidelines for AI Agents

Any AI coding agent can integrate with CW using simple CLI invocations:

1. **Before coding**: `cw prepare --spec task.json`
2. **During coding**: Check boundary status via `cw diff`
3. **After coding**: `cw verify --contract .cw/tasks/<id>/contract.json --trusted-repository`
4. **Dashboard**: `cw status` & `cw list`

---

## 5. Ecosystem & Roadmap

1. **v1.0 (Current)**: Zero-dependency CLI & SDK, local state management, deterministic contracts, 100% test coverage.
2. **v1.5**: Multi-agent consensus verification (requiring N independent reviews).
3. **v2.0**: Cloud evidence registry & web dashboard.
