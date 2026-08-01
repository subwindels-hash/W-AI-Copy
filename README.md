# WINDELS AI OS

The AI-Native Enterprise Operating System. Built session-by-session per the master
specification (`uploads/CLAUDE.md`).

> **Build status as of 2026-08-01:** the monorepo builds, typechecks, and tests
> green end-to-end **on a fresh clone** — `pnpm build` (4/4), `pnpm typecheck`
> (5/5), `pnpm test` (7/7, **652 unit tests passing** across 57 files, 3
> integration suites auto-skipped without a live server). No `.env`, Postgres,
> or Redis required:
>
> ```bash
> pnpm install && make verify
> ```
>
> See `SESSION_CONTINUITY.md` §5.2–§5.6 for the Sessions 1–88 completion pass
> (every module now has test coverage, and every module that should have a UI
> has one), and for why the "unfinished modules" count in the audit is a
> heuristic rather than a work order.
>
> An earlier pass reported this as green at 84 tests, but that only held on a
> machine with a git-ignored local `.env`; on a clean checkout 21 of 44 test
> files aborted before running. That is fixed in tracked config now — see
> **[BUILD_STATUS.md](./BUILD_STATUS.md)** §7 for the repair, plus the two
> environment caveats (Prisma engine download, local Postgres/Redis).

> **Status as of 2026-07-21:** All sessions S1–S82 are scaffolded with routes, services,
> UI tabs, and plausible synthetic/demo data. Core infrastructure (auth, Postgres, Redis,
> JWT, Kernel event bus, AI provider registry, consent ledger, gift-card ledger, memory
> service) is **real and tested**. Most session modules return seeded demo data through
> Math.random()-based fixtures. See **[AUDIT-REPORT.md](./AUDIT-REPORT.md)** for the
> honest per-module inventory and **[audit/module-inventory.json](./audit/module-inventory.json)**
> for machine-readable status. Do not assume session dashboards reflect real data.

## Quick start

```bash
# 1. Install pnpm 10
npm i -g pnpm@10.34.5

# 2. Install dependencies
pnpm install

# 3. Start Postgres 17 + Redis (local install or Docker)
#    See DEPLOYMENT.md §Prerequisites for distro packages.
cp .env.example .env
# edit .env — set JWT_SECRET and WINDELS_ENCRYPTION_KEY

# 4. Set up the database
cd apps/api
DATABASE_URL=postgresql://windels:windels@localhost:5432/windels ./node_modules/.bin/prisma db push
cd ../..

# 5. Run dev servers (API on :4000, Web on :5173)
#    API:
DATABASE_URL=postgresql://windels:windels@localhost:5432/windels REDIS_URL=redis://127.0.0.1:6379 JWT_SECRET=... node apps/api/dist/index.js
#    Web (dev):
cd apps/web && npx vite --host
```

- API health: http://localhost:4000/healthz
- Web app:    http://localhost:5173
- Default admin after first registration: `admin@windels.ai` / first registered password (or `W1ndels!Admin#2026` per spec)
- Full deployment guide (systemd + nginx + backups): **[DEPLOYMENT.md](./DEPLOYMENT.md)**

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 · Vite · TypeScript · Tailwind v4 · Framer Motion · Zustand · React Router · lucide-react · Shadcn/ui |
| Backend | Node 20 · Express · TypeScript · Zod validation · Pino logging |
| Database | PostgreSQL 17 (Prisma) · Redis 8 (ioredis, dual client: cmd + subscriber) |
| Auth | JWT (HS256, 15m access / 7d refresh) · bcrypt · CSRF double-submit |
| AI | Vendor-agnostic ProviderRegistry — Echo fallback + optional OpenAI; Anthropic adapter slot available |
| Desktop | Electron 33 (loads web shell) |
| Build | Turborepo · pnpm workspaces |
| Tests | Playwright (Chromium primary) |

## Repository structure

```
apps/
  api/       # Express + Prisma backend (apps/api/src/<module>/* + http/routes/*)
  web/       # React 19 + Vite frontend (apps/web/src/lib/<module>.ts clients, pages/admin/PlatformPage.tsx)
  desktop/   # Electron shell (loads web app)
packages/
  shared/    # Cross-cutting types, Zod schemas (one file per module)
  config/    # Shared lint/build presets
audit/
  module-inventory.json   # Machine-readable module audit (generated)
tests/e2e/                # Playwright specs
```

## Documentation

| File | Purpose |
|---|---|
| [AUDIT-REPORT.md](./AUDIT-REPORT.md) | Honest status of every module, gaps, and what is actually working |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Install, build, systemd/nginx deploy, backup, troubleshooting |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Four-layer architecture overview |
| [CONVENTIONS.md](./CONVENTIONS.md) | Code conventions used across monorepo |
| [PROGRESS.md](./PROGRESS.md) | Session-by-session shipping log (see AUDIT for reality) |
| [S76-final-validation.md](./S76-final-validation.md) | S76 enterprise integration checklist report |

## Reality check

As of this audit, **no session dashboard outside of core infrastructure is connected
to a real external data provider unless you set `OPENAI_API_KEY`** (which enables real
AI responses instead of Echo). Market data, FX rates, voice synthesis, media generation,
biomedical imaging, cyber-lab provisioning, and 80% of dashboards return seeded demo
values. The architecture to plug in real providers is in place (ProviderRegistry pattern,
consent gates, governance pipeline, Kernel event routing) but the actual provider
integrations for those sessions are the next major milestone, not a finished state.

As of 2026-07-31 the clinical, payment and gating paths have been de-faked:
Session 75 (health) and Session 65 (biomedical) are record-only and invent
nothing; gift-card codes and camera session tokens use the CSPRNG; **every
self-grading gate is gone** — deployment validation now runs real probes, DR
drills and update preflight require a recorded outcome, and test/benchmark
runners take measured results instead of inventing them. Synthetic seeding
across the remaining bootstraps is opt-in via `WINDELS_DEMO_DATA` (default off).
The §2.4 sweep is now complete: every remaining `Math.random()` in live code is
either legitimate (Monte-Carlo simulation sampling, the `random` agent tool, id
generation, retry jitter) or inside an explicitly-named QA harness. See
**[AUDIT-REPORT.md](./AUDIT-REPORT.md) §2.4** for the full per-module record.

Do not deploy into production environments handling real patient data, real money,
or real user content until the remaining gaps in AUDIT-REPORT.md §2.4 are closed.

## Tests

```bash
# Playwright (Chromium) — 57/57 pass on the smoke + session 37-82 suites
cd /home/user/windels-ai-os
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright npx playwright test tests/e2e/ --project=chromium
```
