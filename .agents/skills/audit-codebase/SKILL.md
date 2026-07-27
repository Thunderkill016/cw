---
name: audit-codebase
description: Map an unfamiliar or messy repository without editing it.
---

# Audit codebase

1. Read `AGENTS.md`, `IDEA.md`, architecture docs, package scripts, and tests.
2. Do not edit source code.
3. Map user journeys, boundaries, data/auth flow, commands, and tests.
4. Cite files and symbols for every material conclusion.
5. Separate confirmed dead code from suspected dead code.
6. Save the result using `docs/ai/templates/REPOSITORY_AUDIT.md`.
7. Recommend small, risk-ordered cleanup tasks. Do not recommend a rewrite by
   default.
