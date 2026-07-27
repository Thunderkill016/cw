---
name: add-entity
description: Add a domain database entity with user isolation, SQL migration, and optional UI list/create slice.
---

# Skill: add-entity

## When to use

User needs a new table/model (e.g. projects, posts, tasks).

## Steps

1. Name the entity and fields from `IDEA.md` or user request.  
2. Add SQL under `packages/db/sql/` (increment number).  
3. Add Drizzle table next to `profiles` if using TS schema.  
4. Document isolation: owner-only unless specified.  
5. For Supabase preset, add RLS policy sample.  
6. Optional: minimal `/app/<entity>` list + create form with Zod.  
7. Never expose service-role keys.

## Isolation template

```sql
-- owner only
using ((select auth.uid()) = user_id)
```

Or app-level: always filter `where userId = session.user.id`.
