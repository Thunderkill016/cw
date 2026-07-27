# Preset: `portable-pg`

Own your database URL — Docker, Neon, Railway, RDS, etc.  
Auth: **Better Auth** (self-hosted, research default for portable TS apps).

| Layer | Choice |
|-------|--------|
| DB | Any Postgres (`DATABASE_URL`) |
| Auth | Better Auth + Drizzle (`AUTH_ADAPTER=better-auth`) |
| Deploy | Docker for DB + Vercel/Node/Fly for app |

## Local setup

```bash
pnpm db:up
```

`apps/web/.env.local`:

```bash
DATABASE_URL=postgresql://cyclewarden:cyclewarden@localhost:5432/cyclewarden
BETTER_AUTH_SECRET=replace-with-32-plus-char-random-secret!!
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
AUTH_ADAPTER=better-auth
```

SQL applied on first compose: `0001_init.sql` + `0003_better_auth.sql`.

Then:

```bash
pnpm doctor
pnpm dev
```

## Vibe tip

Product UI still uses `getAuth()` — no Better Auth imports in pages.
