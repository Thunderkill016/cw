# AI Agent Instructions for Forge

This `AGENTS.md` file serves as the centralized instruction manual for any AI coding agent working within the `atoryn-forge` repository, following the standards governed by the Agentic AI Foundation.

## Project Intent
**Forge** is a zero-dependency, local-first CLI tool and SDK written in TypeScript. It provides a deterministic governance and verification layer for AI-assisted code changes.

## Setup & Environment
The project runs entirely on Node.js built-ins.
- **Node.js**: Minimum version `v20`.
- **Install**: Run `npm install` to install dev dependencies (TypeScript, Vitest).
- **Zero Runtime Dependencies**: Do not add runtime dependencies (`dependencies` in package.json) under any circumstances. Only `devDependencies` are permitted.

## Build & Test
- **Typecheck**: `npm run typecheck` (strict TypeScript compilation without emit).
- **Build**: `npm run build` (compiles ESM to `dist/`).
- **Tests**: `npm test` (runs Vitest suites in `tests/`).
- All three scripts must pass cleanly before any feature is considered complete.

## Coding Standards
1. **Deterministic Hashing**: Use the internal `digestCanonicalJson` (from `src/core/integrity.ts`) instead of ad-hoc JSON stringification to ensure cryptographic stability.
2. **Path Handling**: Use POSIX-normalized repository-relative paths internally. Path boundaries are strictly enforced.
3. **Error Handling**: Throw specific domain errors (e.g., `TaskContractError`, `GitChangeError`). Do not swallow errors with broad `try/catch` blocks unless you fully understand the failure mode and document it inline.
4. **Formatting**: Follow the existing Prettier/Biome standards if configured, or rely on `tsc` strict rules.

## Lifecycle & State Invariants

1. **Never hard-code a state directory.** Resolve it through `resolveStateRoot` /
   `resolveDefaultStateRoot` in `src/store/runtime-paths.ts`. A command that reads a different
   directory than another command writes to is a bug, not a preference.
2. **Never infer task state from the filesystem.** Read the task journal
   (`readTaskJournal`). `forge status` used to guess state from a directory listing; that is the
   pattern this repository exists to prevent.
3. **Never report a verified/passing result over an empty set.** `forge audit verify` fails closed
   when there is no journal, because "verified nothing" must not read as "verified".
4. **Digest domains live in one file.** Add new ones to `src/core/digest-domains.ts`. Legacy domains
   are read-path only and must never be used to issue a new digest.
5. **Order writes so evidence precedes the claim about it.** Append a lifecycle event only after the
   record it attests to is durably on disk.

## Project Workflows
- **Changes**: Prefer editing existing files over creating new ones unless introducing a fundamentally new abstraction.
- **Testing alongside code**: Non-trivial changes to core logic must be accompanied by updates to the respective `tests/*.test.ts` file.
- **Commit Format**: Run `npm run typecheck` before committing.

## Guardrails (CRITICAL)
- **Filesystem & Git**: Rely on `src/git/git-change.ts` to inspect the codebase via Git operations instead of reading the filesystem directly, ensuring `forge verify` correctly evaluates uncommitted vs committed trees.
- **Immutability**: Never mutate inputs to core domain functions (e.g. `prepareTaskContract`).
- **Destructive Actions**: Do not execute commands that drop tables, force-push, or run `rm -rf` outside of designated tmp directories without explicit user confirmation.
