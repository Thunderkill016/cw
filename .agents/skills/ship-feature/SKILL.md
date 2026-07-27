---
name: ship-feature
description: Implement the next MVP product feature from IDEA.md under /app using CycleWarden ports and conventions.
---

# Skill: ship-feature

## When to use

User wants a new product feature, screen, or MVP checklist item implemented.

## Steps

1. Read `IDEA.md` — pick the next unchecked MVP item (or the one the user named).  
2. Read `AGENTS.md` — respect stack lock and adapter boundaries.  
3. Design the smallest vertical slice:
   - UI under `apps/web/src/app/app/...`
   - Server action with Zod validation if writes
   - SQL/schema only if new data is required  
4. Do **not** add auth providers or new frameworks.  
5. Wire navigation from `/app` if users need to reach it.  
6. Update `IDEA.md` checklist when done.  
7. Run `pnpm --filter @cyclewarden/web build` if types/routes changed.

## Done

- Feature reachable in UI  
- No vendor SDK outside `lib/adapters`  
- Build passes  
