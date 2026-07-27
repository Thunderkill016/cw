---
name: vibe-setup
description: Help a new user configure CycleWarden env, pick a preset, and verify doctor + dev server.
---

# Skill: vibe-setup

## Steps

1. Run / explain `pnpm install` and `pnpm doctor`.  
2. Ask goal: fastest managed (**supabase-full**) vs own DB (**portable-pg**).  
3. Guide `.env.local` from `.env.example`.  
4. For portable: `pnpm db:up` + `DATABASE_URL` + `AUTH_ADAPTER=better-auth` + `BETTER_AUTH_SECRET`.  
5. For supabase: URL + anon key + `AUTH_ADAPTER=supabase`.  
6. `pnpm dev` — verify `/`, `/login`, `/app`.  
7. Point user to edit `IDEA.md` next.

## Do not

- Invent fake API keys  
- Skip doctor failures silently  
