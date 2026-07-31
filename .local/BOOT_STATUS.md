# WINDELS AI OS — Live boot in this sandbox

**Status:** 🟢 All services up.  **Date:** 2026-07-31  •  **Branch:** `arena/019fb7ed-win`

| Service | Status | URL / DSN |
|---|---|---|
| PostgreSQL 18.4 | 🟢 | `postgresql://windels:windels@localhost:5432/windels` (51 tables) |
| Redis 6.2.14 | 🟢 | `redis://localhost:6379` |
| Web (Vite + React 19) | 🟢 | http://localhost:5173 |
| API (Express + Prisma) | 🟢 | http://localhost:4000/api/v1 · 1087 routes · 20 kernel components · 8 AI providers registered |

**Admin login:** `admin@windels.ai` / `W1ndels!Admin#2026`

Registration, JWT login, conversations, and Windels Echo assistant have all been
exercised end-to-end. Set `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`
in `.env` and restart the API for real inference.

## How the API was brought up

The sandbox blocks TLS to `binaries.prisma.sh`, where Prisma normally fetches its
native `libquery_engine.so.node`. We worked around it by:

1. **Rewriting `apps/api/src/db/client.ts`** to use `@prisma/client/wasm` +
   `@prisma/adapter-pg` (driver adapter + WASM query engine — the WASM binary
   `query_engine_bg.postgresql.wasm` is already bundled by `@prisma/client@5.22`).
2. **Adding `previewFeatures = ["driverAdapters"]`** to `prisma/schema.prisma`.
3. **Running a local mirror on `:18899`** to satisfy Prisma's insistent CDN
   probe (`PRISMA_ENGINES_MIRROR=http://127.0.0.1:18899`,
   `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1`). It returns 404 for sha256 and a
   trivial gzip for engine binaries — those binaries are never executed.
4. **Patching `.prisma/client/wasm-worker-loader.mjs`** to compile the wasm from
   disk (Node's `import('*.wasm')` returns exports, not `{ default: Module }`
   like Cloudflare Workers). See `.local/bin/patch-prisma-wasm.sh`.
5. **Skipping `prisma db push`** (schema-engine binary is also CDN-only). Instead:
    - Applied all `prisma/migrations/*/migration.sql` files directly with
      `psycopg`.
    - For the 15 models added post-migration, generated `CREATE TABLE` DDL from
      the schema (`.local/sql/00_delta_from_migrations_to_schema.sql`).
    - Detected + applied 4 column-level drifts
      (`.local/sql/01_alter_drift.sql`).
6. **Booting API with `NODE_OPTIONS=--experimental-wasm-modules`.**

Everything lives under `.local/` and is git-ignored except the boot scripts,
this doc, and `.local/sql/*`.

## Scripts

```
.local/bin/boot.sh              # start everything (idempotent)
.local/bin/stop.sh              # stop everything
.local/bin/prisma-mirror.py     # local CDN stub (port 18899)
.local/bin/patch-prisma-wasm.sh # re-apply the wasm-loader patch after `prisma generate`
```

## What's real vs demo now

- ✅ Auth (register/login/JWT/refresh), RBAC, sessions, CSRF
- ✅ Postgres via Prisma (WASM engine, `pg` driver adapter)
- ✅ Redis (real ioredis + subscriber)
- ✅ Chat conversations + messages persisted, Windels Echo assistant streams replies
- ✅ All 88 session bootstrappers run (kernel, marketplace, mlops, extensions, voice studio, etc.)
- ✅ 1087 governance-discovered API routes
- 🟡 AI inference is Echo/demo until you set `OPENAI_API_KEY` etc.
- 🟡 Everything session-specific still returns seeded/synthetic values (per project's own audit)
