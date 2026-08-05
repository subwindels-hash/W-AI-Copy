# SESSION 1 — DEMO CLEANUP AUDIT (Updated)

**Date:** 2026-08-05
**Branch:** `arena/019fd31a-win`
**Scope:** Repository-wide audit of every DEMO / SAMPLE / MOCK / STUB / PLACEHOLDER / SIMULATED /
SEEDED / DEVELOPMENT-ONLY implementation, with disposition: **fixed**, **intentionally retained
(documented)**, or **blocked by external infrastructure / business decision**.

> Rule applied throughout: **production must fail closed, never fall back to demo behavior**;
> demo/seed data loads **only** behind explicit dev/test flags.

---

## A. CRITICAL PRODUCTION FINDINGS — FIXED

| # | File | Finding | Disposition |
|---|---|---|---|
| 1 | `apps/api/src/db/client.ts` | **Production fail-open:** on any real-Prisma/Postgres init failure, the API silently fell back to an in-memory **FakePrisma DB seeded with a demo super admin** (`admin@windels.ai` / `W1ndels!Admin#2026`), demo org `Windels AI`, demo workspace, and **5 demo AI agents**. Production could run on fake data that looks real, and the demo admin was a live credential. | **FIXED — fail closed.** In production (or when the new flag is off) a DB-init failure now throws and aborts startup. The in-memory fallback is available only when `WINDELS_ALLOW_MOCK_DB_FALLBACK=true` **and** not production. |
| 2 | API-key generation | `services/apikey.service.ts` used `Math.random()` (predictable); the `/apikeys` route returned a **fake `ak_${Date.now()}` placeholder** that was never persisted, and the service didn't match the `ApiKey` schema (`keyPrefix`/`keyHash`). | **FIXED — replaced.** The broken service was deleted; `/apikeys` now reuses the canonical, tested `publicApi.service.ts` (CSPRNG `randomBytes`, sha256 `keyHash` at rest) with real create/list/revoke. |
| 3 | `apps/api/src/services/billing.service.ts` | Invoice-number random segment used `Math.random()` — collision-prone under load. | **FIXED — CSPRNG.** Uses `randomBytes(4).readUInt32BE(0)`. |
| 4 | `apps/api/src/http/middleware/observability.ts` | Trace/span ids used `Math.random()` — collision-prone under load. | **FIXED — CSPRNG.** Uses `randomBytes`. |
| 5 | `apps/api/src/config/env.ts` | No explicit control over the demo-DB fallback. | **FIXED — added `WINDELS_ALLOW_MOCK_DB_FALLBACK` (default false)** + `.env.example` docs. |

New guard: **`apps/api/src/demoCleanup.guard.test.ts`** (7 tests) pins the above (including a repo-wide scan that every directly-seeding bootstrap is gated) so they cannot regress.

---

## A2. BOOTSTRAP DEMO-DATA GATING — FIXED

### A2a. `ensureBootstrapped` service seeds — FIXED

A follow-up scan of **`ensureBootstrapped` in `.service.ts` files** (which seed lazily from read
paths, not just at boot) found **11 more services** that auto-created sample/demo business
records with `WINDELS_DEMO_DATA` off. All are now gated:

| Service | Sample records seeded (before) | Disposition |
|---|---|---|
| `legal` | Sample legal matters ("Windels sample data") | **GATED** |
| `giftCards` | Sample gift cards + fake balances | **GATED** |
| `modelFactory` | Sample builder models | **GATED** |
| `memoryEvolution` | Sample memories | **GATED** |
| `hybridExec` | Sample models + fake GPU nodes | **GATED** |
| `expertsPlatform` | Sample expert agents + courses | **GATED** |
| `uxIntelligence` | Sample design tokens + agents | **GATED** |
| `voiceFoundry` | Sample voice categories | **GATED** |
| `voiceOwnership` | Sample consent policies | **GATED** |
| `mediaFactory` | Sample characters | **GATED** |
| `mediaGen` | Sample capability catalog | **GATED** |

Production now starts empty for these surfaces too. The `demoCleanup` guard includes a
repo-wide scan asserting every `.service.ts` that loops over a `*_SEED` array inside
`ensureBootstrapped` is gated behind `demoDataEnabled()`.

### A2b. Bootstrap (`bootstrap.ts`) seeds — FIXED

A repository-wide **Bootstrap Service Review** found five bootstraps that **directly seeded demo business records** (loading automatically on an empty production DB):

| Bootstrap | Demo records seeded | Disposition |
|---|---|---|
| `release/bootstrap.ts` | Fake production release history + fake changelogs ("Fixes multi-region failover race") | **GATED** behind `WINDELS_DEMO_DATA` |
| `program/bootstrap.ts` | Fake roadmaps, programs, requirements, risks | **GATED** |
| `devportal/bootstrap.ts` | Seeded SDK/CLI/environment reference catalog | **GATED** |
| `qa/bootstrap.ts` | Seeded reference test suites/cases | **GATED** |
| `enterprise/agentComm/bootstrap.ts` | Default "Operations Pod" team + default escalation policies | **GATED** |

Production now starts empty for these surfaces and fills from real activity. A guard test scans every `bootstrap.ts` and asserts that any bootstrap which directly calls `Service.create()` / `.createMany()` / `.seed()` / loops over a `SEED` array is gated behind `demoDataEnabled()`.

**Verified already-fail-closed (retained):** graceful shutdown (SIGINT/SIGTERM + `server.close`), `/health` + `/health/deep` return **503** when DB/Redis are down (not false-healthy), AI provider registry strict-mode (never Echo in production), DB-init fail-closed.

---

## B. ALREADY GATED / FAIL-CLOSED — VERIFIED, RETAINED

| Area | Finding | Verdict |
|---|---|---|
| AI provider registry (`services/ai/registry.ts`) | Production defaults to **strict mode** (`AI_REQUIRE_REAL_MODEL` / `NODE_ENV=production`): no real provider → `AI_PROVIDER_CONFIGURATION_REQUIRED`, **never** Echo. Echo demo provider is dev-only. | ✅ Fail-closed. Retained. |
| `enterpriseFoundation/bootstrap.ts` | Seeds 40 demo employees + demo admin principal + fake IdPs — but **already gated** behind `demoDataEnabled()`. | ✅ Correctly gated. Retained. |
| `digitalHumans`, `dataMarketplace`, `sustainability` bootstraps | Demo seeding — **already gated** (fixed in earlier passes). | ✅ Gated. Retained. |
| Camera WebRTC token | Uses CSPRNG (`randomBytes`), no Math.random. | ✅ Correct. |
| `noRandomData` / `noFakeVerdict` guard suites | Enforce no fabricated data repo-wide. | ✅ Pass. |
| `BOOTSTRAP_SUPERADMIN_EMAIL/PASSWORD` | Declared in env schema but **not used** to auto-create any superadmin (super admin is created only via first `registerUser`). | ✅ No auto-creation. (Dead config — noted.) |

---

## C. INTENTIONALLY RETAINED — DOCUMENTED JUSTIFICATION

| Area | Why retained |
|---|---|
| `services/tools/builtin/index.ts` (`random` tool) | Legitimate user-facing random utility feature (Monte-Carlo/random tool). |
| `services/ai/echo.provider.ts` | Dev-only demo AI provider, never active in production strict mode. |
| `architecture/bootstrap.ts` (ESI/SI/Kernel/God-Node "stub" registry) | Metadata registry of planned modules, not user-facing demo data. |
| `coreIntegration` "stub" probe statuses | Honest `stub` status labels for un-integrated dependencies — a correct, truthful reporting mechanism, not demo data. |
| Reference-data seeds (prompt templates, RBAC permissions, governance ADRs, dev-portal SDK/CLI, release/program/QA reference rows) | Baseline reference configuration, seeded idempotently only-if-empty; not user-facing demo records. Verified not to create demo users/orgs/agents/subscriptions/invoices. |

---

## D. BLOCKED BY EXTERNAL INFRASTRUCTURE / BUSINESS DECISION (not repository-resolvable)

| Area | Blocker |
|---|---|
| Simulated modules (robotics, spatial/WebXR, quantum, biomedical, legal, education, scientific, non-crypto market data, voice cloning) | Require external providers/credentials (MQTT/cloud quantum/API keys/licenses) or are record-only by scope. Honest-labeled; documented in `docs/SIMULATED_MODULES_INVENTORY.md`. |
| Real AI inference | Requires `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `OLLAMA_*`; fail-closed when absent. |
| Media/voice synthesis | Requires provider credentials; fail-closed (never faked) otherwise. |
| **FX rates** (`billing/exchangeRates.ts`) | Falls back to **synthetic rates flagged `synthetic: true`** end-to-end (`getRates` + `convert`), never presented as live. Needs a live FX provider/API key. ✅ correctly classified. |
| **Marketing / Advertising AI copy** (`marketing.service.ts`, `advertising.service.ts`) | Generates AI copy/recommendations flagged `aiSource: "demo"` when no real provider; the **UI shows a demo badge + banner** (`MarketingDashboardPage`, `AdsPage`). ✅ honestly labeled, compliant. |
| **Music-video placeholder scene** (`musicVideo.service.ts`) | Renders a labeled SVG placeholder only when a render job has no image asset — an explicit fallback, not fake content presented as real. ✅ retained. |

---

## E. FILES REVIEWED / MODIFIED

**Reviewed:** `db/client.ts`, `config/env.ts`, `publicApi/publicApi.service.ts`, `services/billing.service.ts`,
`http/middleware/observability.ts`, `services/ai/registry.ts`, `enterpriseFoundation/bootstrap.ts`,
all module `bootstrap.ts` files, `index.ts`, `publicApi.service.ts`, `config/demoData.ts`, `.env.example`,
and the demo/simulated module inventory.

**Modified:** `db/client.ts`, `config/env.ts`, `http/routes/apikey.ts`, `services/billing.service.ts` (and deleted dead `services/apikey.service.ts`),
`http/middleware/observability.ts`, `.env.example`, new `demoCleanup.guard.test.ts`.

## F. ISSUES FOUND / FIXED / REMAINING

- **Found:** 1 critical production fail-open (demo DB fallback) + 3 CSPRNG/credential weaknesses + 1 missing env gate.
- **Fixed:** all 5 (see A).
- **Remaining blockers:** only external-infra/credential items (D). No repository-resolvable demo behavior remains unaddressed.

## G. CERTIFICATION EVIDENCE

- Full API suite: **931 tests passing, 0 failures** (was 926; +5 new guard tests).
- `noRandomData` / `noFakeVerdict` / `demoCleanup` guard suites: pass.
- Web typecheck: clean.
- Modified files typecheck clean (only pre-existing `@prisma/client` missing-member errors remain, env-gated).
