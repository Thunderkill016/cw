# cw

**Deterministic contracts and independent verification for AI-assisted code changes.**

`cw` is a zero-dependency CLI and TypeScript library that makes AI coding agents auditable and governable. It provides a cryptographic contract-and-evidence protocol that answers a simple question: *"Did the AI agent do exactly what it was asked to do, and nothing more?"*

## Why?

AI coding agents (Cursor, Copilot, Claude Code, Codex, etc.) can now write entire features. But how do you know:

- The agent only changed the files it was supposed to?
- All acceptance criteria are actually met?
- Your verification commands (lint, test, typecheck) pass on the final result?
- No unauthorized side effects were introduced?

`cw` solves this with **deterministic task contracts** and **independent verification evidence**.

## Quick Start

```bash
# Install
npm install -g cw

# Initialize in your project
cw init

# Create a task contract
cw prepare --spec task.json

# Let your AI agent implement the task...

# Verify the implementation
cw verify --contract .cw/tasks/my-task/contract.json \
  --implementer-provider cursor \
  --implementer-run session-abc \
  --trusted-repository
```

## How It Works

### 1. Prepare a Contract

Define what the AI agent should do with a task spec:

```json
{
  "taskId": "add-login-page",
  "objective": "Add a login page with email/password authentication",
  "allowedPaths": [
    { "path": "src/pages/login/**" },
    { "path": "src/components/auth/**" }
  ],
  "forbiddenPaths": [
    { "path": ".env*" },
    { "path": "src/config/secrets/**" }
  ],
  "acceptanceCriteria": [
    { "id": "ac-1", "description": "Login form renders with email and password fields" },
    { "id": "ac-2", "description": "Form validation rejects empty fields" }
  ],
  "verificationCommands": [
    {
      "id": "typecheck",
      "executable": "npx",
      "arguments": ["tsc", "--noEmit"]
    },
    {
      "id": "test",
      "executable": "npx",
      "arguments": ["vitest", "run"]
    }
  ]
}
```

`cw prepare` locks this spec against the current Git state, producing a deterministic contract with cryptographic hashes.

### 2. Verify the Implementation

After the AI agent commits its changes, run `cw verify`. This:

1. **Diff analysis** — Computes exact changed files between the contract's base commit and HEAD
2. **Scope check** — Ensures all changes are within allowed paths and none in forbidden paths
3. **Verification commands** — Runs each command (lint, test, typecheck) in a sandboxed environment
4. **Mutation detection** — Checks that verification commands didn't modify the workspace
5. **Evidence chain** — Produces a cryptographically signed evidence record

### 3. Review the Evidence

The verification produces a JSON evidence record:

```
cw show --file .cw/tasks/add-login-page/verification-abc123.json
```

```
● ACCEPTED
  Task: add-login-page
  Changes: 4 files
  Scope: passed
  Checks: 2 passed
  Evidence: .cw/tasks/add-login-page/verification-abc123-abc.json
```

## CLI Commands

| Command    | Description                                      |
|------------|--------------------------------------------------|
| `cw init`    | Initialize CW in the current project             |
| `cw prepare` | Create a deterministic task contract              |
| `cw verify`  | Verify an AI implementation against a contract    |
| `cw show`    | Inspect a contract or evidence record             |
| `cw help`    | Show usage information                            |
| `cw version` | Show version                                      |

## Verify Exit Codes

| Code | Meaning     |
|------|-------------|
| `0`  | Accepted    |
| `2`  | Rejected    |
| `3`  | Inconclusive|

## As a Library

```typescript
import { prepareTaskContract, verifyChange, parseTaskContract } from 'cw';

// Prepare a contract programmatically
const contract = await prepareTaskContract({
  repositoryRoot: '/path/to/repo',
  draft: taskSpec,
  baseRef: 'main',
  preparedBy: 'my-automation',
});

// Verify programmatically
const evidence = await verifyChange({
  repositoryRoot: '/path/to/repo',
  contract,
  implementer: { provider: 'my-agent', runId: 'run-123' },
});

console.log(evidence.verdict); // 'accepted' | 'rejected' | 'inconclusive'
```

## Key Properties

- **Zero runtime dependencies** — Only uses Node.js built-ins
- **Deterministic** — Same input always produces the same contract digest
- **Git-native** — Works directly with Git objects, no file-system snapshots
- **Cryptographic integrity** — SHA-256 hashes chain contracts to evidence
- **Agent-agnostic** — Works with any AI coding agent or manual development

## Requirements

- Node.js ≥ 20
- Git ≥ 2.40

## License

MIT
