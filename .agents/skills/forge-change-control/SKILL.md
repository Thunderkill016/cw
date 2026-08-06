---
name: forge-change-control
description: Prepare, implement, independently review, and deterministically verify an AI-authored repository change with Atoryn Forge. Use for non-trivial coding or documentation changes where exact Git scope, explicit acceptance criteria, separate agent runs, and durable evidence matter.
---

# Atoryn Forge change control

Use Atoryn Forge as a coordination and evidence layer around capable agents. The
model still performs implementation and semantic review; Atoryn Forge binds those
judgments to a strict task contract, an exact Git change, and reproducible checks.

Read [references/protocol.md](references/protocol.md) before creating an artifact.

## Choose the phase

- If no task contract exists, run **Prepare**.
- If a valid contract exists and its base is the current clean `HEAD`, run
  **Implement**.
- If implementation is committed, use a fresh agent run for **Review and verify**.
- If evidence is rejected or inconclusive, do not merge. Resolve the recorded
  risks. Re-review the same head when only judgment/evidence was missing; use a
  new implementation run and head when code changes.

## Prepare

1. Read repository instructions, relevant code, tests, product sources of truth,
   and the user request.
2. Convert the request into atomic acceptance criteria. Define the smallest
   allowed paths, explicit forbidden paths, constraints, and shell-free
   verification commands.
3. Ensure Git is clean except for `.cyclewarden/` state. Do not prepare against
   an ambiguous or moving base.
4. Write the draft under
   `.cyclewarden/tasks/<task-id>/draft.json` using the reference schema.
5. Run:

   ```text
   pnpm forge -- prepare \
     --spec .cyclewarden/tasks/<task-id>/draft.json \
     --actor <provider>:<preparation-run-id>
   ```

6. Read back the persisted contract and report its full base SHA and
   `contractDigest`.

Do not weaken scope or checks merely to make a later verification pass.

## Implement

1. Read the persisted contract, all `contextPaths`, and repository instructions.
2. Record a stable, unique implementer run ID. Provider and run IDs are
   self-asserted provenance; never describe them as cryptographic identity.
3. Change only `allowedPaths`; a forbidden rule always wins.
4. Satisfy every acceptance criterion and constraint. Run useful local checks
   while iterating.
5. Commit the implementation. Leave the checkout clean except for
   `.cyclewarden/`.
6. Hand off the exact head SHA, provider, and implementer run ID. Do not produce
   the independent acceptance assessment from this same run.

## Review and verify

Use a fresh agent/subagent that did not implement the change. The same model
provider is acceptable only when the reviewer has a distinct run ID.

1. Do not edit tracked implementation. Against the exact contract base and
   committed head, inspect repository instructions, contract context, and the
   complete `base..head` diff. Only create assessment/evidence state under
   `.cyclewarden/`.
2. Look for concrete correctness, regression, security, authorization, data
   integrity, test, and maintainability failures. Do not invent findings.
3. Assess every criterion and every constraint as `passed`, `failed`, or
   `inconclusive`, cite exact evidence, and write
   `.cyclewarden/tasks/<task-id>/assessment-<head-prefix>.json`.
4. Review every configured command. Require local/offline checks unless the user
   explicitly authorized a specific external action; isolate untrusted
   repositories separately.
5. Run:

   ```text
   pnpm forge -- verify \
     --contract .cyclewarden/tasks/<task-id>/contract.json \
     --assessment .cyclewarden/tasks/<task-id>/assessment-<head-prefix>.json \
     --implementer-provider <provider> \
     --implementer-run <implementation-run-id> \
     --trusted-repository \
     --head <full-head-sha>
   ```

6. Treat exit `0` as accepted, `2` as rejected, and `3` as inconclusive. Read the
   persisted evidence rather than relying on terminal prose.
7. Before a human merges, confirm the candidate head still equals
   `evidence.subject.headSha`. Verification never authorizes automatic merge,
   deploy, production writes, or unapproved external contact.

## Completion report

Report the contract digest, base and head SHAs, implementer and verifier run IDs,
verdict, checks, findings, residual limitations, and evidence path. Also record
review defects caught, false positives, and time overhead when evaluating
whether Atoryn Forge improved results over direct AI use.
