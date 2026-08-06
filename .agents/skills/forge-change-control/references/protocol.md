# Change-control protocol v1

Atoryn Forge coordinates agents; it does not replace their semantic reasoning.
All JSON fields are strict. Unknown fields, missing criteria, digest mismatch,
dirty checkout state, unsupported symlink/submodule changes, or ambiguous
provenance fail closed.

## Task draft

Store this as `.cyclewarden/tasks/<task-id>/draft.json`:

```json
{
  "schemaVersion": 1,
  "taskId": "issue-57-change-control",
  "sourceRef": "issue:57",
  "objective": "Implement one independently verified change",
  "contextPaths": ["AGENTS.md", "README.md"],
  "acceptanceCriteria": [
    {
      "id": "AC-01",
      "description": "The documented behavior is implemented and tested."
    }
  ],
  "allowedPaths": [
    { "kind": "directory", "path": "packages/evolution-core/src" }
  ],
  "forbiddenPaths": [
    { "kind": "file", "path": "packages/evolution-core/src/secrets.ts" }
  ],
  "constraints": [
    {
      "id": "C-01",
      "description": "Do not deploy or contact external systems."
    }
  ],
  "verificationCommands": [
    {
      "id": "core-test",
      "executable": "pnpm",
      "arguments": ["--filter", "@cyclewarden/evolution-core", "test"],
      "relativeWorkingDirectory": ".",
      "timeoutMs": 600000,
      "maxOutputBytes": 1048576
    }
  ]
}
```

Path rules are normalized repository-relative POSIX paths. A `file` rule matches
only that file. A `directory` rule matches the directory and descendants.
Commands execute directly without a shell; never use `sh -c`, `bash -c`, command
substitution, redirection, or chained shell operators.

`--trusted-repository` acknowledges that configured commands are arbitrary
trusted-local programs, not a sandbox. Keep them offline unless the user
explicitly authorized a specific external action.

`prepare` adds the exact Git object format, full base commit/tree IDs, timestamp,
preparer, and a domain-separated canonical JSON digest. It refuses a dirty base.

## Acceptance assessment

A fresh reviewer stores:

```json
{
  "schemaVersion": 1,
  "recordType": "acceptance-assessment",
  "taskId": "issue-57-change-control",
  "contractDigest": "<64-lowercase-hex>",
  "baseSha": "<full-base-object-id>",
  "headSha": "<full-head-object-id>",
  "reviewer": {
    "provider": "codex",
    "runId": "<fresh-review-run-id>"
  },
  "criteria": [
    {
      "criterionId": "AC-01",
      "status": "passed",
      "summary": "The exact committed diff implements the behavior.",
      "evidenceRefs": [
        "git:packages/evolution-core/src/example.ts",
        "check:core-test"
      ]
    }
  ],
  "constraints": [
    {
      "constraintId": "C-01",
      "status": "passed",
      "summary": "No deployment or external-system action appears in the exact change or review run.",
      "evidenceRefs": [
        "git:<full-head-object-id>",
        "review:local-actions"
      ]
    }
  ],
  "findings": [
    {
      "severity": "minor",
      "path": "packages/evolution-core/src/example.ts",
      "summary": "Concrete residual issue, if any."
    }
  ],
  "completedAt": "2026-07-26T00:00:00.000Z"
}
```

Use `critical`, `major`, `minor`, or `note` finding severity. Critical or major
findings reject the change. A failed criterion rejects it. Missing,
inconclusive, or invalid assessment data makes the result inconclusive.

## Deterministic evidence

`verify` binds:

- full base/head commit and tree IDs;
- NUL-delimited Git changes, object IDs, and modes;
- allowed/forbidden scope results;
- command specifications, exit status, duration, and full raw stdout/stderr
  SHA-256 digests with bounded redacted previews;
- before/after checkout state;
- implementer and verifier run IDs;
- criterion judgments and findings;
- verdict, unresolved risks, limitations, and evidence digest.

The evidence proves only what it records. Agent IDs are self-asserted, ignored
files and effects outside the repository are not covered, commands run with the
local user's privileges, and semantic judgments remain fallible.

## Iteration and measurement

Keep the contract when the objective and scope remain valid; a repaired head may
be verified again as a descendant of the same base. Prepare a new contract when
scope, criteria, checks, or base changes.

For product evaluation, compare similar tasks and record:

- acceptance rate on first verification;
- defects caught before merge and defects escaped afterward;
- false-positive findings;
- rework loops;
- preparation, implementation, review, and verification time;
- deterministic check pass rate and evidence completeness.

These measurements test whether Atoryn Forge amplifies useful agent performance;
the number of model calls alone is not evidence of improvement.
