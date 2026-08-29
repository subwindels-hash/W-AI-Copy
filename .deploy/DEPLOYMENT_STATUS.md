# WINDELS AI OS — Live Sandbox Deployment

Status: **RUNNING** (2026-08-17)

## Services

| Service | Tech | Listen | Status |
|---|---|---|---|
| Web UI (Vite dev) | React 19 + Vite | `0.0.0.0:5173` | ✅ running |
| API | Node + Express | `0.0.0.0:4000` | ✅ healthy |
| PostgreSQL | PostgreSQL 18.4 (real, persistent) | `127.0.0.1:5432` | ✅ running |
| Redis | Redis 7.4.2 (real, AOF) | `127.0.0.1:6379` | ✅ running |

## Verified endpoints

- `GET /healthz` → `ok`
- `GET /api/v1/health` → `{"status":"ok","checks":{"db":"ok","cache":"ok"}}`
- `GET /api/v1/health/deep` → uptime, PID, memory, db/cache latency
- `POST /api/v1/auth/login` → JWT (super_admin)
- `GET /api/v1/auth/me` → authenticated user
- `GET /api/v1/agents` → seeded agents
- `POST /api/v1/auth/register` → creates user

## Login (seeded super admin — in REAL Postgres)

- Email: `admin@windels.ai`
- Password: `W1ndels!Admin`

## How it was deployed (native server path)

No Docker was available, so the repository's native path was used:

1. `pnpm install` + `@windels/shared` build + `@windels/api` build (`tsc`).
2. Real **PostgreSQL 18** booted via `embedded-postgres` (`.deploy/start-postgres.mjs`,
   persistent data in `.deploy/pgdata`).
3. Real **Redis 7.4** compiled from source (`.deploy/redis-server`).
4. API runs `dist/index.js` with `NODE_ENV=development`, wired to Postgres/Redis
   (initial run used `WINDELS_ALLOW_MOCK_DB_FALLBACK=true`; once real Postgres was
   connected this is set to `false` — the app fails closed if the DB is unreachable).
5. Vite dev server proxies `/api` → API (already configured in the repo for previews).

## ✅ Real Postgres is now wired up (2026-08-17)

The app's data layer runs on the **real PostgreSQL** database (all 24 Prisma migrations
applied → 109 tables) and the seeded super admin is stored there. Verified: login returns
a real cuid from Postgres, `/auth/me` resolves the admin, and health reports `db: ok`
against the live database. Mock fallback is OFF (`WINDELS_ALLOW_MOCK_DB_FALLBACK=false`).

### How the Prisma engine workaround was done

`binaries.prisma.sh` (the Prisma native engine host) is network-blocked in this sandbox,
so the native `libquery_engine.so.node` can't be downloaded. The app is built to use the
**WASM query engine** client (`@prisma/client/wasm`) — the PostgreSQL WASM engine is
already bundled inside `@prisma/client`. The only gap was the generated client's WASM
module loader, which used `import('./query_engine_bg.wasm')` (not supported in this Node
runtime), returning `null`. I patched the generated
`node_modules/.prisma/client/wasm.js` `getQueryEngineWasmModule` to load
`query_engine_bg.wasm` via `fs.readFileSync` + `WebAssembly.compile`, which works in any
Node. The API now connects to Postgres over the pg driver adapter through the bundled
WASM engine — no network download needed.

Note: this patch lives in `node_modules` (generated client). Re-running `prisma generate`
overwrites it; it's applied to the live deployment here.

### Redis
Real Redis 7.4 (compiled from source) is used for broker executions, ledger, and cache.
