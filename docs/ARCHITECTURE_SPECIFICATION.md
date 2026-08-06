# Forge (Atoryn Forge) — World-Class AI Governance Protocol Specification

## 1. Vision & Executive Summary

**Forge (Atoryn Forge)** is the world's premier zero-dependency, local-first deterministic governance layer and verification engine for AI coding agents.

As AI agents (Cursor, Claude Code, Aider, Windsurf, autonomous subagents) write an increasing portion of software, traditional CI/CD pipelines are no longer sufficient. Agents need **cryptographically enforced boundaries**, **deterministic task contracts**, and **independent verification chains** to guarantee safety, zero regressions, and strict adherence to architectural constraints.

Forge achieves this with **zero runtime dependencies**, running natively on Node.js 20+ and Git.

---

## 2. Cryptographic Protocol Specification

### 2.1 Task Contract V1 (`TaskContractV1`)
A Task Contract locks the baseline repository state and permissible scope before an AI agent begins implementation.

- **`contractDigest`**: Domain-separated SHA-256 hash using Canonical JSON (`atoryn.forge.task-contract.v2`). Contracts digested under the pre-rename `cyclewarden.task-contract.v1` domain are still accepted on the read path.
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
- **`evidenceDigest`**: SHA-256 domain digest (`atoryn.forge.verification-evidence.v2`). The pre-rename `cyclewarden.verification-evidence.v1` domain is still accepted on the read path.

---

## 3. Core Engine Architecture

```
                       +-------------------------+
                       |      Task Spec JSON     |
                       +-------------------------+
                                    |
                                    v
                         +--------------------+
                         |     forge prepare     |
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
                         |      forge verify     |
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

### 3.3 Task Lifecycle & Atomic Persistence

Task state is a **recorded fact**, not an inference from a directory listing. Every task carries a
hash-chained journal at `<state-root>/tasks/<taskId>/journal.json`, written by `forge prepare` and
`forge verify` and read by `forge status`, `forge list` and `forge audit`.

**States** (`src/core/state-machine.ts`), enforced on every append:

```text
draft ──► prepared ──► verifying ──► accepted   (terminal)
             │             │
             │             ├──► rejected ──┐
             │             │               │
             └─────────────┴──► implementing
                                     │
                                     └──► verifying
```

- Forge never observes an agent writing code, so `implementing` is where a task *returns* after a
  non-accepting verdict, not a state Forge watches it enter.
- An `inconclusive` verdict decides nothing, so the task returns to `implementing`.
- `rejected` judges one attempt, not the task; it can be fixed and verified again.
- `accepted` is the only terminal state. Re-verifying an accepted task fails closed.

**Event record** (`TaskJournalEvent`): `eventId`, `sequenceNumber`, `recordedAt`, `eventType`,
`actor`, `source`, `correlationId` (the agent run), `fromState`, `toState`, `payloadDigest`,
`previousDigest`, `entryDigest`. The journal also carries a merkle root over all entry digests.

**Guarantees**:
- *Idempotent append* — `eventId` is derived from the record the event attests to, so a retried
  `prepare` or `verify` is a no-op rather than a duplicate entry.
- *Fail closed* — an illegal transition throws; a journal that fails its integrity check is rejected
  on read rather than treated as absent.
- *Ordered writes* — a lifecycle event is only written after the record it attests to is durably on
  disk, so a journal can never point at evidence that was never written.
- *Resumable* — a journal left in `verifying` by a killed process is resumed by the next `verify`
  instead of bricking the task.
- *Atomic persistence* — journal writes go through fsync + atomic rename; contracts and evidence
  remain immutable records written with `link(2)` so an overwrite fails.

`verifyTaskJournal` returns a structured verdict (`broken-hash-chain`, `tampered-event`,
`illegal-transition`, `state-mismatch`, `merkle-root-mismatch`) with the failing sequence number,
not a bare boolean.

### 3.4 State Root Resolution
`src/store/runtime-paths.ts` is the single source of truth for where state lives: `.forge` is
canonical, an existing `.cw` is still honoured, and `--root` overrides both. No command may
hard-code a state directory literal.

---

## 4. Integration Guidelines for AI Agents

Any AI coding agent can integrate with Forge using simple CLI invocations:

1. **Before coding**: `forge prepare --spec task.json`
2. **During coding**: Check boundary status via `forge diff`
3. **After coding**: `forge verify --contract .forge/tasks/<id>/contract.json --trusted-repository`
4. **Dashboard**: `forge status` & `forge list`

---

## 5. Ecosystem & Roadmap

1. **v0.3 (Current)**: Zero-dependency CLI & SDK, local state management, deterministic contracts, durable hash-chained task lifecycle.
2. **v1.5**: Multi-agent consensus verification (requiring N independent reviews).
3. **v2.0**: Cloud evidence registry & web dashboard.
