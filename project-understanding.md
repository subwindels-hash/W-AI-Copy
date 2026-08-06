# WINDELS AI OS — Project Understanding & Continuation Brief (Sessions 1 → 111)

> Compiled from the master spec (`uploads/CLAUDE.md` ~15k lines), the per-session
> addendum specs and `audit/module-inventory.json` (106 modules as of 2026-08-06),
> the current `docs/` session specifications, and the workflow brief preserved in
> `SESSION_WORKFLOW.patch`. Use this as the "what is really going on" map before
> adding anything new.

---

## 1. One-line identity

**WINDELS AI OS** is an "AI-native operating system for work" — a pnpm/Turborepo
monorepo (Express + Prisma backend, React 19 + Vite web, Electron desktop,
PostgreSQL 17, Redis 8) built *session-by-session* against a master specification,
where 106 audited enterprise modules (including CRM, ERP, BI, Enterprise Search,
Factory Studios and Enterprise FinOps) ship as additive vertical slices.

## 2. Three governing rules (from the master spec — must not be violated)

1. **Additive-only** — never remove/rewrite/break an existing session's module.
2. **No fake completion** — no placeholders marked done, no fabricated percentages,
   nothing marked complete before the `IMPLEMENTED → BUILT → TESTED → VERIFIED →
   INTEGRATED` gate passes.
3. **Honest labeling** — demo/synthetic data must be explicitly flagged (banners,
   `synthetic: true` tags, "VOICE MODEL NOT CONFIGURED" notices).

## 3. The per-module delivery pattern (how every session is built)

For each module, in strict order:
`packages/shared/src/<module>.ts` (Zod schemas+types) →
`apps/api/src/<module>/<module>.service.ts` + `bootstrap.ts` →
`apps/api/src/http/routes/<module>.ts` →
`apps/web/src/lib/<module>.ts` (API client) → UI tab/page in `apps/web/src/pages/`
→ sidebar/nav entry → unit tests (vitest) + e2e (Playwright) → decision log
(`CONVENTIONS.md`) → progress log.

Current counts that confirm the pattern is uniform (2026-08-06):
- **118** route files (`apps/api/src/http/routes/*.ts`)
- **111** web API clients/helpers (`apps/web/src/lib/*.ts`)
- **97** API test files; **26** Playwright specs in `tests/e2e/`

## 4. The session-by-session arc (S1 → S111)

### Foundation & core infrastructure — real & tested
| Session | Module | What it is |
|---|---|---|
| **1** | `auth` | Vertical-slice foundation: repo, DB, migrations, JWT auth, RBAC, orgs, profiles, role dashboards |
| **2–4** | `conversations`, `attachments` | Universal workspace, chat/conversation model, file attachments |
| **5–6** | `talk` | Real-time messaging / Talk module |
| **7–8** | `agents` | AI Workforce — persistent agents with memory/skills/roles |
| **13–14** | `auth` (deep) | MFA/TOTP, Google OAuth, full RBAC |
| **20** | `billing` | Billing module |
| **21** | `mobile` | PWA / mobile shell |
| **22** | `collaboration` | Collaboration/canvas |
| **23** | `promptTemplates` | Reusable prompt templates |

### Enterprise platform layer (S9–36) — MVP
`engineering` (26), `program` (25), `devportal` (27), plus cross-cutting platform
modules not tied to one session: `platform`, `platformServices`, `infrastructure`,
`marketplace`, `mlOps`, `qa`, `release`, `publicApi`, `extensions`,
`enterprise`, `enterpriseFoundation`, `security`, `googleAuth`, `mfa`,
`events`, `developers`, `admin`, `agentComm`, `aiEcosystem`, `wakeIntel`.

### V8 enterprise expansion (S37–76) — mostly *seeded demo data*
| Session | Module | Notes |
|---|---|---|
| 37 | `architecture` | Project setup/conventions (no re-init) |
| 38 | `selfHosted` | Self-hosted AI infra |
| 39 | `kernel` | AI Kernel + central event bus (Redis pub/sub) |
| 40 | `voiceStudio` | Browser SpeechSynthesis + 17-voice registry + server TTS adapters |
| 41 | `voiceFoundry` | Autonomous voice synthesis |
| 42 | `mediaGen` | Universal media generation |
| 43 | `hybridExec` | Hybrid AI execution / model-compute management |
| 44 | `voiceOwnership` | Voice cloning + consent/audit |
| 45 | `coreIntegration` | Core enterprise integration layer |
| 46 | `modelFactory` | AI model factory |
| 47 | `memoryEvolution` | Memory Fabric |
| 48 | `constitution`, `governance` | AI Constitution + Governance Kernel |
| 49 | `composer` | AI capability composer |
| 50 | `benchmarks` | AI benchmark center |
| 51 | `licensing` | AI licensing/monetization |
| 52 | `deployment` | Deployment platform |
| 53 | `disasterRecovery` | DR + AI continuity |
| 54 | `updates` | Update/lifecycle mgmt |
| 55 | `usage` | Usage intelligence |
| 56 | `fabric` | Intelligence Fabric, Trust Center, Mission Control |
| 57 | `robotics` | **Simulated** telemetry |
| 58 | `spatial` | **Simulated** VR/WebXR |
| 59 | `sdk` | AI OS SDK |
| 60 | `training` | AI training/fine-tuning |
| 61 | `dataMarketplace` | Data & knowledge marketplace |
| 62 | `digitalHumans` | Digital human platform |
| 63 | `quantum` | **Simulated** qubit/fidelity |
| 64 | `sustainability` | ESG intelligence |
| 65 | `biomedical` | **Record-only** (de-faked 2026-07-31) |
| 66 | `legal` | **Simulated** case-law |
| 67 | `education` | Lecturer AI + LMS, **simulated** content |
| 68 | `scientific` | **Simulated** labs |
| 69 | `cognitive` | Cognitive evolution / world intelligence |
| 70 | `command` | Global command center |
| 71 | `aiEconomy` | AI economy platform |
| 72 | `autonomous` | Autonomous org framework |
| 73 | `opex`, `governance` | Operational excellence + Responsible AI |
| 74 | `industry` | Industry solutions / digital operations |
| 75 | `healthEcosystem` | **Record-only** health (de-faked) |
| 76 | `v76validation` | Final integration & validation |

### Recent additive sessions (S77–111) — shipped as 🟡 VERIFIED (partial) pending runtime closure
| Session | Module(s) | What it is |
|---|---|---|
| 77A | `expertsPlatform` | Experts platform |
| 77B | `mediaFactory` | Media factory + **social publishing** (real ffmpeg MP4 render, real OAuth upload protocols) |
| 78 | `uxIntelligence` | UI/UX intelligence + design system |
| 79 | `giftCards` | WMPC gift-card ledger (CSPRNG codes, consent) |
| 80 | `globalCurrency` | Multi-currency & localization (depends on S79) |
| 81 | `tradingIntel` | Unified financial-markets & trading platform (25 indicator tests) |
| 82 | `cyber` | AI Cybersecurity Academy / ethical hacking |
| 83 | `etl` | ETL & data pipeline (SFTP/S3/webhooks, DLQ, pipeline builder) |
| 84 | `projectContinuity` | Project import, codebase intelligence, verification, sandbox build gate, snapshots/rollback — **acceptance gate CLOSED 2026-07-31** (31 tests) |
| 85 | `leadDiscovery` | AI lead discovery (backend done; search screen shipped) |
| 86 | (branding) | Global Branding footer app-wide |
| 87 | `camera` | Camera Intelligence (RTSP registry, WebRTC, CV models: PPE/plate/intrusion) |
| **89** | `tenantIsolation` | **Multi-tenancy enforcement** — per-org isolation policies, live Redis namespace audit, real cross-tenant self-tests, export gate (`docs/SESSION_89_SPECIFICATION.md`) |
| **90** | `crm` | **Enterprise CRM** — org-scoped contacts/companies/deal pipeline/activity ledger + deterministic rollup; first CRM surface on the platform; `crm:*` namespaces audited by S89 (`docs/SESSION_90_SPECIFICATION.md`) |
| **91** | `emailIntel` | **Enterprise Email Intelligence** — mailboxes, threaded messages, outbox + real dependency-free SMTP connector, AI draft/summarize/triage with honest provider labeling; `ei:*` namespaces audited by S89 (`docs/SESSION_91_SPECIFICATION.md`) |
| **92** | `erp` | **Enterprise ERP** — products, warehouses, movements ledger → computed stock, suppliers, PO/SO lifecycles, CRM won-deal hook (`docs/SESSION_92_SPECIFICATION.md`) |
| **93** | `websiteBuilder` | **Website Builder** — sites, typed block pages, pure deterministic block→HTML renderer, publish snapshots, AI copy (`docs/SESSION_93_SPECIFICATION.md`) |
| **94** | `socialPlatform` | **Social Platform** — org-scoped feed, posts/comments, reactions ledger → computed engagement, deterministic hashtags (`docs/SESSION_94_SPECIFICATION.md`) |
| **95** | `helpdesk` | **Enterprise Helpdesk** — tickets + monotonic numbers, honest lifecycle, deterministic SLA, comment timeline, CRM activity integration (`docs/SESSION_95_SPECIFICATION.md`) |
| **96** | `appBuilder` | **AI Software Factory** — implements `docs/AI_APPLICATION_BUILDER_SPECIFICATION.md` V3.0 core: projects, AI-workforce tasks, honest build state machine, immutable artifacts (real SHA-256/SBOM), Human Decision Inbox gate (`docs/SESSION_96_SPECIFICATION.md`) |
| **97** | `businessIntelligence` | **Business Intelligence** — data sources, live KPI values from real module stores, report builder + deterministic evaluation + CSV export (`docs/SESSION_97_SPECIFICATION.md`) |
| **98** | `enterpriseSearch` | **Enterprise Search** — unified org-scoped search over real module records, deterministic relevance ranking, facets, recent-search history (`docs/SESSION_98_SPECIFICATION.md`) |
| **99** | `softwareFactory` | **Factory Studios & Build Farm** — completes `AI_APPLICATION_BUILDER_SPECIFICATION.md` V3.0 §3–§4: five studios + plans, project coverage, per-run compile targets (`docs/SESSION_99_SPECIFICATION.md`) |
| **100** | `enterpriseFinOps` | **Enterprise FinOps depth** — org-scoped cost centers, integer minor-unit budgets, actual cost ledger, conservation-checked allocation ledger and computed chargebacks (`docs/SESSION_100_SPECIFICATION.md`) |
| **101** | `admin` | **Admin Console completion** — shared contracts, scoped user directory/detail reads, role/status filters, audited suspension/reactivation, super-admin role changes and dedicated UI (`docs/SESSION_101_SPECIFICATION.md`) |
| **102** | `agents` | **AI Workforce / Agent Framework completion** — shared agent contracts, scoped CRUD/events/memory/knowledge/skills, lifecycle Redis namespace hardening, model validation and mobile parity (`docs/SESSION_102_SPECIFICATION.md`) |
| **103** | `aiEconomy` | **AI Economy & GPU capacity ledger completion** — org-scoped usage, allocation and compute-offer records, honest observed run-rate dashboard, legacy migration and dedicated UI (`docs/SESSION_103_SPECIFICATION.md`) |
| **104** | `apikey` | **API Key Management completion** — shared contracts, CSPRNG one-time secrets, hash-at-rest verification, scoped detail/update/revoke lifecycle, audit logs and dedicated UI (`docs/SESSION_104_SPECIFICATION.md`) |
| **105** | `attachments` | **Message Attachments completion** — normalized metadata, full-checksum storage keys, scoped byte/meta access, uploader deletion, target validation and mobile multipart parity (`docs/SESSION_105_SPECIFICATION.md`) |
| **106** | `autonomous` | **Autonomous Organization approval-register completion** — org-scoped proposals, human resolution, honest review/impact metrics, legacy migration and dedicated approval console (`docs/SESSION_106_SPECIFICATION.md`) |
| **107** | `billing` | **Billing & Subscriptions completion** — shared contracts, real subscription/invoice lifecycle, audited payment actions, idempotent webhooks/dunning and dedicated billing console (`docs/SESSION_107_SPECIFICATION.md`) |
| **108** | `camera` | **Camera Feed Registry & Alert Console completion** — shared feed/alert contracts, org-scoped records, corrected mounted routes, honest stream handoff and dedicated camera console (`docs/SESSION_108_SPECIFICATION.md`) |
| **109** | `canvasCollab` | **Canvas Collaboration completion** — shared presence/cursor contracts, org-verified routes, org-scoped Redis state/channel migration and Canvas collaborator heartbeat UI (`docs/SESSION_109_SPECIFICATION.md`) |
| **110** | `cognitive` | **Cognitive / World Model completion** — org-scoped entity/observation/hypothesis evidence register, idempotent Session 69 observation migration, deterministic coverage/blind-spot rollup, self-reported confidence and advisory AI labelling, human-only hypothesis resolution and dedicated `/app/cognitive` console (`docs/SESSION_110_SPECIFICATION.md`) |
| **111** | `command` | **Global Command Center completion** — org-scoped incident/region/briefing/initiative/directive operations register, human-only acknowledge+resolve so MTTR is measured from stored timestamps, `unreported` regions until an operator files a status report, self-reported initiative progress, advisory AI-briefing labelling, idempotent Session 70 directive migration and dedicated `/app/command` console (`docs/SESSION_111_SPECIFICATION.md`) |

## 5. What's actually real vs simulated vs missing (honest state)

**Real & tested core:** auth/JWT/RBAC, MFA/TOTP, Google OAuth, Postgres+Prisma,
Redis, Kernel event bus, AI ProviderRegistry (Echo fallback + OpenAI + Ollama),
consent ledger, gift-card ledger, Memory Fabric, trading indicators, ffmpeg media
renderer, Playwright/browser voice, ETL, project-continuity pipeline, camera CV.

**Simulated / seeded demo data (~10 modules, per `docs/SIMULATED_MODULES_INVENTORY.md`):**
robotics (S57), non-crypto market tickers (S81), spatial (S58), quantum (S63),
biomedical (S65), patient vitals (S75), legal (S66), education (S67), scientific
(S68), voice cloning (S44). These are the primary "replace simulation with real
provider" candidates.

**Deliberately not implemented:** live broker/exchange order execution (decision-support
only by explicit scope). Untrusted project code never executes in the API process.

**Key honesty guardrails added 2026-07-31:** every `Math.random()` in live code is
now either legitimate (Monte-Carlo sampling, id gen, retry jitter) or inside an
explicitly-named QA harness; `WINDELS_DEMO_DATA` gates synthetic seeding (default off).

## 6. Documentation inventory & the gap

**Present:** `docs/` (41 files) — architecture, API/OPENAPI reference, DB schema,
security, deployment, DR, observability, multi-tenancy, SDK, webhooks, VOICE_AI,
session 83/84/87 specs, `WINDELS_AI_OS_DOCUMENTATION.md`, plus the master
`uploads/CLAUDE.md` and addendum specs for S77–87.

**MISSING (deleted, but README still links them):** `ARCHITECTURE.md`,
`AUDIT-REPORT.md`, `DEPLOYMENT.md`, `CONVENTIONS.md`, `PROGRESS.md`,
`SESSION_CONTINUITY.md`, `BUILD_STATUS.md`. The old workflow also referenced
`UNFINISHED_MODULES.md` / `MISSING_FEATURES_REPORT.md`. Their content survives
partially in `docs/` and in `SESSION_WORKFLOW.patch` (which contains the full
deleted `SESSION_CONTINUITY.md`). The README's dead links are a concrete cleanup task.

## 7. Repo/environment facts

- Branch: `arena/019fd574-win` (Arena session branch; push only here, never main).
- Git history is session-tracked through the current Arena branch and the
  authoritative `PROGRESS.md` / `docs/SESSION_*_SPECIFICATION.md` records.
- Environment here: Node v22.22.3 and Corepack pnpm 10.34.5 are available;
  dependencies can be restored with `corepack pnpm install --frozen-lockfile`.
  Prisma engine download and live Postgres/Redis remain target-environment gates.
- `corepack pnpm install --frozen-lockfile && make verify` is the fresh-clone
  verification path; this sandbox records runtime-dependent sessions as 🟡.

## 8. Recommended next steps — "add more and update"

**Priority A — close documentation debt (cheap, unblocks newcomers):**
1. Restore the missing root docs (`ARCHITECTURE.md`, `DEPLOYMENT.md`, `CONVENTIONS.md`,
   `PROGRESS.md`, `AUDIT-REPORT.md`, `SESSION_CONTINUITY.md`, `BUILD_STATUS.md`),
   regenerating from `docs/` + `SESSION_WORKFLOW.patch`, or repoint README links to
   the existing `docs/` files. Fix every dead link in README.

**Priority B — de-fake the remaining simulated modules (the stated "big remaining
milestone"):**
2. Wire real providers: non-crypto market data (Polygon/TwelveData/OANDA) for S81;
   robotics telemetry (MQTT/AMQP) S57; spatial/WebXR S58; quantum cloud (Braket/IBM)
   S63; DICOM/PACS S65; FHIR/BLE vitals S75; legal case-law API S66; LMS S67;
   ELN/LIMS S68; voice cloning (ElevenLabs/XTTS) S44.

**Priority C — verification & hardening:**
3. Run `corepack pnpm install --frozen-lockfile && make verify`; record the
   repository-wide test/module counts in `PROGRESS.md`. Current audit
   (`node audit/build-inventory.mjs`, 2026-08-06): 106 modules — 91 COMPLETE,
   12 PARTIAL, 2 STUB-by-design (`events`, `webhook`), 1 DEMO DATA (`quantum`).
   Remaining PARTIAL modules, in the one-by-one completion order:
   `conversations`, `derivatives`, `googleAuth`, `leadDiscovery`, `mfa`,
   `mobile`, `opex`, `promptTemplates`, `publicApi`, `sustainability`, `talk`,
   `usage`. **Next module to complete: `conversations`.**
4. Run the S1–S6 and S89–S111 runtime-validation tracks in a target
   environment with live PostgreSQL 17, Redis 8 and a reachable Prisma engine before changing
   any session from 🟡 VERIFIED (partial) to 🟢 PRODUCTION COMPLETE.

**Priority D — next roadmap work:**
5. Continue the runtime-validation track, deepen Enterprise Resilience/DR
   drill automation, or de-fake the provider-blocked modules. Any new session
   must add an authoritative spec and follow the IMPLEMENTED → BUILT → TESTED →
   VERIFIED → INTEGRATED gate; do not rebuild the completed S90–S100 slices.

---

### Quick reference — "what session do I touch?"
S1–36 foundation/platform · S37–76 V8 enterprise · S77 experts/media · S78 UX ·
S79 gift cards · S80 currency · S81 trading · S82 cyber · S83 ETL · S84 project
continuity · S85 lead discovery · S86 branding · S87 camera · **S89 tenant isolation · S90 enterprise CRM · S91 email intelligence · S92 enterprise ERP · S93 website builder · S94 social platform · S95 helpdesk · S96 AI software factory · S97 business intelligence · S98 enterprise search · S99 factory studios & build farm · S100 enterprise FinOps depth · S101 Admin Console · S102 Agent Framework · S103 AI Economy · S104 API Key Management · S105 Attachments · S106 Autonomous Organization · S107 Billing · S108 Camera Console · S109 Canvas Collaboration**.
