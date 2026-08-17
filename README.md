# WINDELS AI OS

The AI-Native Enterprise Operating System. Built session-by-session per the master
specification (`uploads/CLAUDE.md`).

> **Build status as of 2026-08-06:** the monorepo builds, typechecks, and tests
> green end-to-end **on a fresh clone** — `pnpm build`, `pnpm typecheck`, and
> `pnpm test` (**1 775 tests passing** across 120 files, 51 integration tests
> auto-skipped without a live server, 0 failures). No `.env`, Postgres, or
> Redis required:
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
#    `docker compose up -d` starts both on host-loopback ports.
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
- Single-server production deployment (Docker, HTTPS, migrations, backups): **[docs/WINDELS-AI-OS-Deployment-Guide.md](./docs/WINDELS-AI-OS-Deployment-Guide.md)**

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
| [docs/NFC_CARD_MANAGER.md](./docs/NFC_CARD_MANAGER.md) | NFC architecture, security/API model, capability truth table, PC/SC prerequisites, and mandatory real-hardware qualification protocol |
| [docs/MODULE_PLUGIN_CENTER.md](./docs/MODULE_PLUGIN_CENTER.md) | Signed `.wmod` format, fail-closed verification, isolated Module Runner contract, Super Admin lifecycle, runtime registration, rollback, and production validation |
| [docs/NATIVE_AI_API.md](./docs/NATIVE_AI_API.md) | Native `/v1` AI provider API, WND keys, truthful model routing, SSE, external tool/agent loops, multimodal adapters, metering, billing, OpenAPI and production acceptance |
| [docs/CLOUD_ANDROID.md](./docs/CLOUD_ANDROID.md) | Vendor-neutral Human + AI Cloud Android control plane, signed provider contract, agent permissions, collaboration locks, approvals, verification, fleet API and production checklist |
| [docs/WINDELS-AI-OS-Deployment-Guide.md](./docs/WINDELS-AI-OS-Deployment-Guide.md) | Single-server Docker/HTTPS deployment, verification, upgrades, backups |
| [docs/EXTERNAL_API_INTEGRATION_CATALOG.md](./docs/EXTERNAL_API_INTEGRATION_CATALOG.md) | External API/provider inventory, why each is needed, configuration, implementation status, blockers and rollout order |
| [docs/BLOCKONOMICS_STAGE1_ARCHITECTURE_AUDIT.md](./docs/BLOCKONOMICS_STAGE1_ARCHITECTURE_AUDIT.md) | Official-provider contract audit, current billing/ledger gaps, additive target design, and 15-stage acceptance gates |
| [docs/BLOCKONOMICS_STAGE2_PAYMENT_FOUNDATION.md](./docs/BLOCKONOMICS_STAGE2_PAYMENT_FOUNDATION.md) | Additive durable payment/provider/webhook/allocation models, generalized ledger migration, and Stage 2 verification |
| [docs/BLOCKONOMICS_STAGE3_PROVIDER_ADAPTER.md](./docs/BLOCKONOMICS_STAGE3_PROVIDER_ADAPTER.md) | Encrypted provider configuration and official fail-closed Blockonomics HTTP client |
| [docs/BLOCKONOMICS_STAGE4_PAYMENT_CREATION.md](./docs/BLOCKONOMICS_STAGE4_PAYMENT_CREATION.md) | Durable pre-provider payment creation, live quote/address allocation, exact crypto units, and safe instructions |
| [docs/BLOCKONOMICS_STAGE5_WEBHOOK_MONITORING.md](./docs/BLOCKONOMICS_STAGE5_WEBHOOK_MONITORING.md) | Durable GET callback inbox, exact status/amount matching, provider reconciliation, and USDT monitoring |
| [docs/BLOCKONOMICS_STAGE6_BILLING_SETTLEMENT.md](./docs/BLOCKONOMICS_STAGE6_BILLING_SETTLEMENT.md) | Atomic allocation, existing-ledger journal, invoice/subscription settlement, receipt, audit, and idempotency |
| [docs/PRODUCTION_FIX_PLAN.md](./docs/PRODUCTION_FIX_PLAN.md) | Ordered remediation checklist and completion gates for production blockers |
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
| [docs/SESSION_108_SPECIFICATION.md](./docs/SESSION_108_SPECIFICATION.md) | Session 108 — Camera Feed Registry & Alert Console completion (scoped feeds/alerts, corrected routes and honest stream handoff) |
| [docs/SESSION_108_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_108_RUNTIME_VALIDATION_CHECKLIST.md) | Session 108 runtime validation (feed/alert isolation, gateway availability, RBAC and legacy migration) |
| [docs/SESSION_109_SPECIFICATION.md](./docs/SESSION_109_SPECIFICATION.md) | Session 109 — Canvas Collaboration completion (org-scoped presence/cursors, route access checks and Canvas UI heartbeat) |
| [docs/SESSION_109_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_109_RUNTIME_VALIDATION_CHECKLIST.md) | Session 109 runtime validation (canvas access isolation, TTL presence, cursor channels and multi-browser sync) |
| [docs/SESSION_114_SPECIFICATION.md](./docs/SESSION_114_SPECIFICATION.md) | Session 114 — Google Identity completion (org-scoped Google sign-in policy, linked-identity register with fingerprinted subjects, event ledger, environment-only configuration report, policy gate wired into the real OAuth callback, and the previously missing `/auth/callback` page) |
| [docs/SESSION_114_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_114_RUNTIME_VALIDATION_CHECKLIST.md) | Session 114 runtime validation (OAuth endpoint backwards compatibility, `gid:*` isolation, live policy refusals per mode, ledger trimming, raw-subject absence, configuration checks offline) |
| [docs/SESSION_115_SPECIFICATION.md](./docs/SESSION_115_SPECIFICATION.md) | Session 115 — Lead Discovery completion (pipeline status/owner/notes, provider-id deduplication that marks rather than deletes, field coverage that explains why the contact columns are empty, search ledger, collection maintenance, and a CSV export with formula-injection guarding) |
| [docs/SESSION_115_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_115_RUNTIME_VALIDATION_CHECKLIST.md) | Session 115 runtime validation (Session 85 route compatibility, `lead:*` isolation, duplicate keeper ordering over real Redis, 10k-lead scan latency, spreadsheet formula guard verified in Excel and Sheets) |
| [docs/SESSION_118_SPECIFICATION.md](./docs/SESSION_118_SPECIFICATION.md) | Session 118 — Operational Excellence / Responsible AI completion (a durable per-finding safety register replacing one JSON blob in one Redis string, real acknowledgement and resolution timestamps so "mitigations in the last 24 hours" counts closures instead of filings, floored rates, `null` instead of `0` for every unmeasured dimension including the `hallucination_risk` that read as "no risk", operator assessments that require their method, a reopen path with append-only history, an advisory policy, and a provenance block naming the seven declared-but-unimplemented rollup sections) |
| [docs/SESSION_118_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_118_RUNTIME_VALIDATION_CHECKLIST.md) | Session 118 runtime validation (Session 73 endpoint compatibility, the filing-vs-resolution-time fix proved in both directions, concurrent files across two API instances, legacy blob adoption over real Redis, floored reliability against real `AiRequest` rows, `null`-not-zero on an organization with no traffic, `opex`/`opx:*` isolation, and the `trust.trust > 0` assertion in the existing Session 73 E2E) |
| [docs/SESSION_119_SPECIFICATION.md](./docs/SESSION_119_SPECIFICATION.md) | Session 119 — Prompt Templates completion (the module's first shared contract, a renderer that resolves `{{var \| default}}` and reports `unresolved` holes instead of hiding them, P2025 → 404 instead of a 500 on the check-then-act race, code-point icon validation, single-fetch + built-in duplicate correction paths, an org-scoped best-effort usage ledger (`pt:*`) and `GET /prompt-templates/stats` whose window numbers come only from the ledger and lifetime totals only from the database, with `null`/absence instead of invented zeros) |
| [docs/SESSION_119_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_119_RUNTIME_VALIDATION_CHECKLIST.md) | Session 119 runtime validation (Session 23 endpoint compatibility, the whitespace-pipe render fix, unresolved reporting, the P2025 race over real Postgres, `pt:*` keyspace shape + 500-event cap + TTL over real Redis, Session 89 sweep conformance, statistics honesty on fresh/active organizations, and the `/app/prompt-templates` console) |
| [docs/SESSION_120_SPECIFICATION.md](./docs/SESSION_120_SPECIFICATION.md) | Session 120 — Public API Gateway completion (the cross-tenant workflow-trigger hole closed by pinning runs to the API key's organization, `DELETE /apikeys/:id` corrected from a silent revoke to a real audited delete, the missing renewal path via `expiresInDays`, and an org-scoped best-effort `pub:*` call ledger with `GET /api/rest/v1/usage` + internal `GET /apikeys/usage` whose counts come only from the ledger and identifiers only from the database) |
| [docs/SESSION_120_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_120_RUNTIME_VALIDATION_CHECKLIST.md) | Session 120 runtime validation (gateway endpoint compatibility, the cross-tenant run refused in both directions over real Postgres, DELETE semantics + token death over real Redis/Postgres, renewal, `pub:*` keyspace shape + 200-event cap + TTL, Session 89 sweep conformance, usage-report honesty, and the `/app/public-api` console) |
| [docs/SESSION_121_SPECIFICATION.md](./docs/SESSION_121_SPECIFICATION.md) | Session 121 — Sustainability/ESG completion (the single-JSON-blob ledger that lost concurrent writes replaced by per-record keys behind an append-only index with one-shot legacy adoption, same-period YTD-vs-YTD changes that are `null` without a baseline and truncated toward zero, the invented `92 − ytd×2.5` ESG score formula removed in favour of `null` + an attestation note, compute-only greenAi kWh with small-record visibility, `GET`/`DELETE /records/:id` correction paths, a `provenance` block naming structural zeros, and `esg` catalogued in the Session 89 sweep) |
| [docs/SESSION_121_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_121_RUNTIME_VALIDATION_CHECKLIST.md) | Session 121 runtime validation (Session 64 endpoint compatibility, twenty concurrent activity POSTs preserved over real Redis, same-period windows proved in both directions, null baselines, no invented scores, greenAi scoping, legacy-blob adoption once-only, `esg` sweep conformance, and the `/app/sustainability` console) |
| [docs/SESSION_122_SPECIFICATION.md](./docs/SESSION_122_SPECIFICATION.md) | Session 122 — Talk completion (the hardcoded-`unreadCount: 0` replaced with real counts that are `null` for non-members, same-organization member/DM validation so cross-org references are refused before anything is persisted, a validated meeting status lifecycle where ENDED/CANCELLED are terminal and a refused transition answers 409 naming the allowed ones, `aiGenerated` surfaced on notetaker action items with an "AI-extracted" badge, and the module's first shared contract at 340 LOC) |
| [docs/SESSION_122_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_122_RUNTIME_VALIDATION_CHECKLIST.md) | Session 122 runtime validation (the 23 Session 5–6 endpoints unchanged, real unread counts over live Postgres, null-not-0 for non-members, cross-org member/DM refusals, the meeting lifecycle in both directions, aiGenerated surfacing, and the `/app/talk` console) |
| [docs/SESSION_123_SPECIFICATION.md](./docs/SESSION_123_SPECIFICATION.md) | Session 123 — Usage Intelligence completion (hardcoded 0 deltas replaced with measured prior-window deltas that are `null` without a baseline, empty denominators nulled — no requests is not 0 ms latency or 0 % error — per-module p95/error/users measured from real rows, a 30-day series with real tokens and null empty days, `GET`/`DELETE /events/:id` correction paths, a `provenance` block naming structural zeros, `usg:evt` catalogued in the S89 sweep — **the last PARTIAL module; the inventory is now 103 COMPLETE / 0 PARTIAL**) |
| [docs/SESSION_123_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_123_RUNTIME_VALIDATION_CHECKLIST.md) | Session 123 runtime validation (the three Session 55 endpoints unchanged, real prior-window deltas over live Postgres, null empty denominators, measured per-module metrics, the series invariants, the event correction path, `usg:evt` sweep conformance, and the `/app/usage` console) |
| [docs/SESSION_124_SPECIFICATION.md](./docs/SESSION_124_SPECIFICATION.md) | Session 124 — AI Software Engineering Workforce (an autonomous engineering department: 18 specialized AI engineers + an orchestrator, a multi-repo workspace with per-repo AI teams, the orchestrator pipeline with advisory-vs-executed steps, a full GitHub engineering module with verified connections and masked tokens, repository-intelligence knowledge graphs with observed-vs-heuristic nodes, source-labelled engineering memory, and the AI Engineering Command Center) |
| [docs/SESSION_124_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_124_RUNTIME_VALIDATION_CHECKLIST.md) | Session 124 runtime validation (the 42 `/ai-engineering` routes, the pipeline over live Postgres, the GitHub module against the real API including token masking and failure states, checkout scanning, memory, command-center counts with connected accounts, and `aew` sweep conformance) |
| [docs/SESSION_125_SPECIFICATION.md](./docs/SESSION_125_SPECIFICATION.md) | Session 125 — Super Admin Biography, Identity Memory & AI Knowledge System (Super-Admin-only biography/identity knowledge management with 37 record kinds across private/organization/public + verified, approval workflows, version history, grants, knowledge-graph relations, document uploads, an AI response engine that answers only from approved permission-visible knowledge with labelled sections and full `sources[]` traceability, continuous Memory-Fabric + Kernel synchronization, 8 knowledge agents, Enterprise Search integration, and the `/app/identity-knowledge` console) |
| [docs/SESSION_125_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_125_RUNTIME_VALIDATION_CHECKLIST.md) | Session 125 runtime validation (super-admin authority over HTTP, classification access, the lifecycle + verification rules, AuditLog rows, memory-fabric dedupe, ask-engine honesty + restriction, agents, graph, document uploads, `knowledge` search type, and `ik` sweep conformance) |
| [docs/SESSION_126_SPECIFICATION.md](./docs/SESSION_126_SPECIFICATION.md) | Session 126 — Real-Time SSE Channel (Events) & Inbound Webhook Receiver Completion (both STUB-by-design modules completed additively: org-scoped SSE stream ring buffer `evt:hist` with automatic `Last-Event-ID` / `?since=` replay, stream client inspection/revocation, custom event publishing, constant-time HMAC webhook verification without `JWT_SECRET` fallback, org-scoped inbound inbox `whk:inbox`, EventBus dispatch, replay, delete correction paths, and dedicated `/app/events` and `/app/webhook` console pages) |
| [docs/SESSION_126_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_126_RUNTIME_VALIDATION_CHECKLIST.md) | Session 126 runtime validation (SSE stream org scoping, `Last-Event-ID` replay, client disconnect, custom event broadcast, timing-safe HMAC verification, multi-source inbound inbox logging, replay EventBus dispatch, and `evt:hist`/`whk:inbox` sweep conformance) |
| [docs/SESSION_127_SPECIFICATION.md](./docs/SESSION_127_SPECIFICATION.md) | Session 127 — Quantum Computing (S63) & 100% Module Completion (de-faked and gated `quantum` behind `demoDataEnabled()`, removing all ungated synthetic RNG from read paths and promoting `quantum` from DEMO DATA to COMPLETE; **all 108 modules in WINDELS AI OS are now COMPLETE (100% COMPLETE)**; documented standing runtime-validation track status across all 127 sessions) |
| [docs/SESSION_127_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_127_RUNTIME_VALIDATION_CHECKLIST.md) | Session 127 runtime validation (quantum readiness and connector demo gating, 100% complete module inventory audit over production builds, and full target-environment runtime validation sequence for Sessions 1–127) |
| [docs/SESSION_197_SPECIFICATION.md](./docs/SESSION_197_SPECIFICATION.md) | Session 197 — Native AI Studio completion (the final `nativeAi` inventory STUB is now a session-authenticated Studio with health-gated real-only chat/embeddings, organization-scoped quota and usage, an explicit no-demo availability state, dedicated shared contract/client/console, and no leakage of internal provider identities; **144 COMPLETE / 0 PARTIAL / 0 STUB**) |
| [docs/SESSION_197_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_197_RUNTIME_VALIDATION_CHECKLIST.md) | Session 197 runtime validation (disabled/provider-accepted paths, real-only chat/embeddings, tenant/billing/quota boundaries, durable ledger entries, Studio vs API-key `/v1` separation, and inventory verification) |
| [docs/SESSION_128_SPECIFICATION.md](./docs/SESSION_128_SPECIFICATION.md) | Historical Session 128 payment specification. Fiat adapters remain available; generic crypto is fail-closed. Blockonomics implementation status and provider-supported network truth are governed by the Stage 1 audit above, not the historical completion claim. |
| [docs/SESSION_128_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_128_RUNTIME_VALIDATION_CHECKLIST.md) | Session 128 runtime validation (provider initialization, HMAC signature verifications, crypto confirmation thresholds across BTC/TRC-20/ERC-20/BNB Chain, and billing invoice settlement) |
| [docs/SESSION_117_SPECIFICATION.md](./docs/SESSION_117_SPECIFICATION.md) | Session 117 — Mobile App / PWA completion (a durable offline queue that stores and never executes, per-action receipts with `retainLocally`, replay ordered by server receipt time, expiry reported as expiry, device-ownership assertion with secret-free views, a per-device PIN throttle and PIN removal, push health by endpoint host with retirement recorded, an advisory organization policy, an eighteen-kind ledger, and the client-side fix that stops IndexedDB deleting work the server never took) |
| [docs/SESSION_117_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_117_RUNTIME_VALIDATION_CHECKLIST.md) | Session 117 runtime validation (Session 21 endpoint compatibility and the still-public `/mobile/config`, a real handset losing and regaining signal, queue semantics and cross-instance durability, replay ordering against a deliberately wrong device clock, `mob:*` isolation, PIN lockout over real Redis TTLs, push retirement against a real push service, the committed VAPID pair as a production blocker) |
| [docs/SESSION_116_SPECIFICATION.md](./docs/SESSION_116_SPECIFICATION.md) | Session 116 — Multi-Factor Authentication completion (per-principal attempt throttle, RFC 6238 §5.2 replay guard, confirmed-enrolment lifecycle with an abandon path, organization policy with a self-lockout guard, member coverage, documented exemptions, a fifteen-kind audit ledger, an environment-only configuration report, and the 401-not-500 authentication fix on the original six endpoints) |
| [docs/SESSION_116_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_116_RUNTIME_VALIDATION_CHECKLIST.md) | Session 116 runtime validation (original endpoint compatibility, `mfa:*` isolation, throttle and replay behaviour over real Redis TTLs, coverage latency at the member cap, policy enforcement on a live login, no plaintext token or secret in the keyspace) |
| [docs/SESSION_113_SPECIFICATION.md](./docs/SESSION_113_SPECIFICATION.md) | Session 113 — Derivatives & Fixed-Income Desk completion (org-scoped option/bond book, portfolio exposure with delta notional, full-reprice scenario grids, payoff curve with unbounded flags, static delta hedge, put-call parity check, bond ladder with full-reprice yield shifts) |
| [docs/SESSION_113_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_113_RUNTIME_VALIDATION_CHECKLIST.md) | Session 113 runtime validation (Session 81 backwards compatibility, `deriv:*` isolation, mark provenance and staleness, `null`-vs-zero exposure, scenario/ladder repricing correctness) |
| [docs/SESSION_112_SPECIFICATION.md](./docs/SESSION_112_SPECIFICATION.md) | Session 112 — Conversations / Messaging completion (shared contract, participants and read state, measured statistics, labelled message search, edit/redact audit trail, extractive digest, soft-delete recovery) |
| [docs/SESSION_112_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_112_RUNTIME_VALIDATION_CHECKLIST.md) | Session 112 runtime validation (participant-gated isolation, `lastReadAt` persistence, `null`-vs-zero usage, verbatim search excerpts, redaction durability, restore round trip) |
| [docs/SESSION_111_SPECIFICATION.md](./docs/SESSION_111_SPECIFICATION.md) | Session 111 — Global Command Center completion (incident command with measured MTTR, operator-reported regions, briefings, initiatives, directives) |
| [docs/SESSION_111_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_111_RUNTIME_VALIDATION_CHECKLIST.md) | Session 111 runtime validation (register isolation, idempotent directive migration, measured MTTR and unreported-region honesty) |
| [docs/SESSION_110_SPECIFICATION.md](./docs/SESSION_110_SPECIFICATION.md) | Session 110 — Cognitive / World Model completion (evidence register of entities/observations/hypotheses, deterministic coverage rollup, human-only resolution) |
| [docs/SESSION_110_RUNTIME_VALIDATION_CHECKLIST.md](./docs/SESSION_110_RUNTIME_VALIDATION_CHECKLIST.md) | Session 110 runtime validation (register isolation, idempotent migration, honest empty states and AI-assisted labelling) |
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
