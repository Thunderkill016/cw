# Preset: `supabase-full`

Fastest path for most vibe projects: managed **Auth + Postgres**.

| Layer | Choice |
|-------|--------|
| Auth | Supabase Auth |
| DB | Supabase Postgres + RLS (`packages/db/sql/0002_supabase_rls.sql`) |
| App | `apps/web` (Next.js) |
| Deploy | Vercel (or any Node host) |

## Setup

1. Create a Supabase project  
2. `cp .env.example apps/web/.env.local` — set URL + anon key  
3. Run profiles SQL + RLS in the SQL editor  
4. Auth → URL config: add `http://localhost:3000/auth/callback`  
5. `pnpm doctor && pnpm dev`  

## Production

- Allowlist production redirect URLs  
- Prefer email confirmations when public  
- Service role key **server only**  
- Walk `PRODUCTION_CHECKLIST.md`  
