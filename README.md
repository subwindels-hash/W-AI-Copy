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
> **[.local/SESSIONS_1_88_FINAL_AUDIT.md](./.local/SESSIONS_1_88_FINAL_AUDIT.md)**
> and **[docs/PRODUCTION_READINESS_AUDIT.md](./docs/PRODUCTION_READINESS_AUDIT.md)**
> for the repair, plus the two environment caveats (Prisma engine download, local
> Postgres/Redis).

> **Status as of 2026-07-21:** All sessions S1–S82 are scaffolded with routes, services,
> UI tabs, and plausible synthetic/demo data. Core infrastructure (auth, Postgres, Redis,
> JWT, Kernel event bus, AI provider registry, consent ledger, gift-card ledger, memory
> service) is **real and tested**. Most session modules return seeded demo data through
> Math.random()-based fixtures. See **[docs/PRODUCTION_READINESS_AUDIT.md](./docs/PRODUCTION_READINESS_AUDIT.md)**
> for the honest per-module inventory and **[audit/module-inventory.json](./audit/module-inventory.json)**
> for machine-readable status. Do not assume session dashboards reflect real data.

## Quick start

```bash
# 1. Install pnpm 10
npm i -g pnpm@10.34.5

# 2. Install dependencies
pnpm install

# 3. Start Postgres 17 + Redis (local install or Docker)
#    See docs/DEPLOYMENT_ARCHITECTURE.md §Prerequisites for distro packages.
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
- Full deployment guide (systemd + nginx + backups): **[docs/DEPLOYMENT_ARCHITECTURE.md](./docs/DEPLOYMENT_ARCHITECTURE.md)**

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
| [docs/SYSTEM_ARCHITECTURE.md](./docs/SYSTEM_ARCHITECTURE.md) | Four-layer architecture overview |
| [docs/DEPLOYMENT_ARCHITECTURE.md](./docs/DEPLOYMENT_ARCHITECTURE.md) | Install, build, systemd/nginx deploy, backup, troubleshooting |
| [docs/PRODUCTION_READINESS_AUDIT.md](./docs/PRODUCTION_READINESS_AUDIT.md) | Honest status of every module, gaps, and what is actually working |
| [docs/SIMULATED_MODULES_INVENTORY.md](./docs/SIMULATED_MODULES_INVENTORY.md) | Code-level inventory of demo/simulated modules and remediation |
| [docs/SESSION_89_SPECIFICATION.md](./docs/SESSION_89_SPECIFICATION.md) | Session 89 — Tenant Isolation & Cross-Tenant Data Governance (per-org isolation policies, namespace audit, cross-tenant self-tests, export gate) |
| [docs/SESSION_90_SPECIFICATION.md](./docs/SESSION_90_SPECIFICATION.md) | Session 90 — Enterprise CRM (org-scoped contacts/companies/deal pipeline/activity ledger + deterministic rollup) |
| [docs/SESSION_91_SPECIFICATION.md](./docs/SESSION_91_SPECIFICATION.md) | Session 91 — Enterprise Email Intelligence (mailboxes, threaded messages, outbox + real SMTP connector, AI draft/summarize/triage) |
| [docs/SESSION_92_SPECIFICATION.md](./docs/SESSION_92_SPECIFICATION.md) | Session 92 — Enterprise ERP (products, inventory ledger, suppliers, purchase/sales orders, CRM won-deal hook) |
| [docs/SESSION_93_SPECIFICATION.md](./docs/SESSION_93_SPECIFICATION.md) | Session 93 — Website Builder (sites, typed block pages, deterministic renderer, publish snapshots, AI copy) |
| [docs/SESSION_94_SPECIFICATION.md](./docs/SESSION_94_SPECIFICATION.md) | Session 94 — Social Platform (feed, posts, comments, reactions ledger → computed engagement) |
| [docs/SESSION_95_SPECIFICATION.md](./docs/SESSION_95_SPECIFICATION.md) | Session 95 — Enterprise Helpdesk (tickets, honest lifecycle, deterministic SLA, comment timeline, CRM integration) |
| [docs/SESSION_96_SPECIFICATION.md](./docs/SESSION_96_SPECIFICATION.md) | Session 96 — AI Software Factory (implements the V3.0 Application Builder spec core) |
| [docs/SESSION_97_SPECIFICATION.md](./docs/SESSION_97_SPECIFICATION.md) | Session 97 — Business Intelligence (live KPI values, report builder, CSV export) |
| [docs/SESSION_98_SPECIFICATION.md](./docs/SESSION_98_SPECIFICATION.md) | Session 98 — Enterprise Search (unified search over module records, facets, history) |
| [docs/SESSION_99_SPECIFICATION.md](./docs/SESSION_99_SPECIFICATION.md) | Session 99 — Factory Studios & Build Farm (completes the V3.0 spec §3–§4) |
| [docs/SESSION_100_SPECIFICATION.md](./docs/SESSION_100_SPECIFICATION.md) | Session 100 — Enterprise FinOps depth (org-scoped budgets, cost allocation and computed chargebacks) |
| [docs/SESSION_100_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_100_RUNTIME_VALIDATION_CHECKLIST.md) | Session 100 runtime validation (PostgreSQL/Redis, ledger conservation, chargeback and tenant-isolation gates) |
| [docs/SESSION_101_SPECIFICATION.md](./docs/SESSION_101_SPECIFICATION.md) | Session 101 — Admin Console completion (scoped directory, audited actions, filters and pagination) |
| [docs/SESSION_101_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_101_RUNTIME_VALIDATION_CHECKLIST.md) | Session 101 runtime validation (RBAC, organization isolation and audited admin actions) |
| [docs/SESSION_102_SPECIFICATION.md](./docs/SESSION_102_SPECIFICATION.md) | Session 102 — AI Workforce / Agent Framework completion (shared contracts, scoped lifecycle, tests and mobile parity) |
| [docs/SESSION_102_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_102_RUNTIME_VALIDATION_CHECKLIST.md) | Session 102 runtime validation (agent isolation, lifecycle Redis keys, model validation and UI parity) |
| [docs/SESSION_103_SPECIFICATION.md](./docs/SESSION_103_SPECIFICATION.md) | Session 103 — AI Economy & GPU capacity ledger completion (usage, allocations, offers and honest projections) |
| [docs/SESSION_103_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_103_RUNTIME_VALIDATION_CHECKLIST.md) | Session 103 runtime validation (RBAC, org-scoped ledgers, migration, capacity and honest economics) |
| [docs/SESSION_104_SPECIFICATION.md](./docs/SESSION_104_SPECIFICATION.md) | Session 104 — API Key Management completion (secure one-time secrets, scoped lifecycle, audit logs and dedicated UI) |
| [docs/SESSION_104_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_104_RUNTIME_VALIDATION_CHECKLIST.md) | Session 104 runtime validation (hash-at-rest, bearer verification, expiry/revocation and tenant isolation) |
| [docs/SESSION_105_SPECIFICATION.md](./docs/SESSION_105_SPECIFICATION.md) | Session 105 — Message Attachments completion (normalized metadata, checksum storage, scoped bytes and mobile uploads) |
| [docs/SESSION_105_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_105_RUNTIME_VALIDATION_CHECKLIST.md) | Session 105 runtime validation (MIME/size, checksum, byte/meta isolation, deletion and mobile multipart uploads) |
| [docs/SESSION_106_SPECIFICATION.md](./docs/SESSION_106_SPECIFICATION.md) | Session 106 — Autonomous Organization approval-register completion (human decisions, scoped records, honest governance metrics and UI) |
| [docs/SESSION_106_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_106_RUNTIME_VALIDATION_CHECKLIST.md) | Session 106 runtime validation (RBAC, approval isolation, legacy migration and no-autonomous-execution gate) |
| [docs/SESSION_107_SPECIFICATION.md](./docs/SESSION_107_SPECIFICATION.md) | Session 107 — Billing & Subscriptions completion (shared contracts, audited invoice lifecycle, idempotent webhooks and dedicated UI) |
| [docs/SESSION_107_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_107_RUNTIME_VALIDATION_CHECKLIST.md) | Session 107 runtime validation (subscription scope, invoice transitions, webhook idempotency and dunning) |
| [docs/DEVELOPER_CONTRIBUTING.md](./docs/DEVELOPER_CONTRIBUTING.md) | Code conventions used across monorepo |
| [docs/FINAL_COMPLETION_REPORT.md](./docs/FINAL_COMPLETION_REPORT.md) | Session-by-session shipping log (see audit for reality) |
| [.local/SESSIONS_1_88_FINAL_AUDIT.md](./.local/SESSIONS_1_88_FINAL_AUDIT.md) | S1–S88 integration/validation status |
| [docs/SESSION_1_CERTIFICATION_REPORT_2026-08-05.md](./docs/SESSION_1_CERTIFICATION_REPORT_2026-08-05.md) | Session 1 re-certification pass (auth foundation) — audit, fixes, validation |
| [docs/DEMO_CLEANUP_AUDIT.md](./docs/DEMO_CLEANUP_AUDIT.md) | Session 1 repo-wide demo/sample/mock/seed cleanup audit — findings, fixes, classifications |
| [PROGRESS.md](./PROGRESS.md) | Session-by-session certification state (single source of truth) |
| [docs/SESSION_1_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_1_RUNTIME_VALIDATION_CHECKLIST.md) | Session 1 runtime validation checklist (pending target-env execution) |
| [docs/PRE_EXISTING_TEST_FAILURES.md](./docs/PRE_EXISTING_TEST_FAILURES.md) | Inventory & resolution of the 10 pre-existing failing test files (9 env-only, 1 fixed) |
| [docs/SESSION_2_CERTIFICATION_REPORT_2026-08-05.md](./docs/SESSION_2_CERTIFICATION_REPORT_2026-08-05.md) | Session 2 re-certification pass (Universal Workspace) — audit, fixes, validation |
| [docs/SESSION_2_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_2_RUNTIME_VALIDATION_CHECKLIST.md) | Session 2 runtime validation checklist (pending target-env execution) |
| [docs/SESSION_3_CERTIFICATION_REPORT_2026-08-05.md](./docs/SESSION_3_CERTIFICATION_REPORT_2026-08-05.md) | Session 3 re-certification pass (AI Chat) — audit, fixes, validation |
| [docs/SESSION_3_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_3_RUNTIME_VALIDATION_CHECKLIST.md) | Session 3 runtime validation checklist (pending target-env execution) |
| [docs/SESSION_4_CERTIFICATION_REPORT_2026-08-05.md](./docs/SESSION_4_CERTIFICATION_REPORT_2026-08-05.md) | Session 4 re-certification pass (AI Workforce) — audit, fixes, validation |
| [docs/SESSION_4_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_4_RUNTIME_VALIDATION_CHECKLIST.md) | Session 4 runtime validation checklist (pending target-env execution) |
| [docs/SESSION_5_CERTIFICATION_REPORT_2026-08-05.md](./docs/SESSION_5_CERTIFICATION_REPORT_2026-08-05.md) | Session 5 re-certification pass (Canvas) — audit, fixes, validation |
| [docs/SESSION_5_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_5_RUNTIME_VALIDATION_CHECKLIST.md) | Session 5 runtime validation checklist (pending target-env execution) |
| [docs/SESSION_6_CERTIFICATION_REPORT_2026-08-05.md](./docs/SESSION_6_CERTIFICATION_REPORT_2026-08-05.md) | Session 6 re-certification pass (Talk) — audit, fixes, validation |
| [docs/SESSION_6_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_6_RUNTIME_VALIDATION_CHECKLIST.md) | Session 6 runtime validation checklist (pending target-env execution) |
| [audit/module-inventory.json](./audit/module-inventory.json) | Machine-readable per-module audit (generated) |

> The Advertising Platform (Standard / AI Smart / Performance / Autonomous
> campaign modes) is a single unified module at `apps/api/src/advertising/`,
> `apps/web/src/pages/advertising/`, and `packages/shared/src/advertising.ts`,
> exposed at `/app/ads`. See `project-understanding.md` for the S1–S88+ map.

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
**[docs/PRODUCTION_READINESS_AUDIT.md](./docs/PRODUCTION_READINESS_AUDIT.md) §2.4**
and **[docs/SIMULATED_MODULES_INVENTORY.md](./docs/SIMULATED_MODULES_INVENTORY.md)**
for the full per-module record.

Do not deploy into production environments handling real patient data, real money,
or real user content until the remaining gaps in the production-readiness audit §2.4
are closed.

## Tests

```bash
# Playwright (Chromium) — 57/57 pass on the smoke + session 37-82 suites
cd /home/user/WIN
PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright npx playwright test tests/e2e/ --project=chromium
```
