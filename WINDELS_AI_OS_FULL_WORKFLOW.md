# WINDELS AI OS — FULL WORKFLOW · SESSIONS 1–88+

> **THE complete operational map.** Every session (1–88+), its spec source, what was
> built, where it lives, its API surface, status, tests, and the decision log reference —
> consolidated 2026-07-31 from the repo at commit `1461def` (branch `arena/019fb809-win`).
> Use this file as the single continuation reference; `SESSION_CONTINUITY.md` holds the
> daily-start summary; `CONVENTIONS.md` holds the authoritative per-session decisions.

---

## 0. THE MASTER LOOP (how every session gets built)

```
[1] READ SPEC          uploads/CLAUDE.md §Session N (master) + additive spec file if any
[2] SCAFFOLD MODULE    1) packages/shared/src/<module>.ts (Zod types)
                       2) apps/api/src/<module>/<module>.service.ts + bootstrap.ts
                       3) apps/api/src/http/routes/<module>.ts  → mounted in server.ts
                       4) apps/web/src/lib/<module>.ts (typed API client)
                       5) UI: PlatformPage tab (admin) or dedicated page (apps)
                       6) Sidebar entry + version bump
[3] BUILD GATE         tsc clean: shared → api → web (web: vite build, check chunk size)
[4] TEST GATE          vitest units (per-module) + Playwright e2e (tests/e2e/) + k6 load (tests/load/)
[5] VERIFY GATE        live curl smoke as SUPER_ADMIN org; bootstrap counts logged at boot
[6] LOG DECISIONS      append "## Session N — Decisions Logged" to CONVENTIONS.md
[7] PROGRESS           append session report to PROGRESS.md + bump sidebar version
[8] COMMIT/PUSH        branch arena/019fb809-win only
```

**Module delivery gate (Session 84.11, enforced everywhere):**
`IMPLEMENTED → BUILT → TESTED → VERIFIED → INTEGRATED` — nothing is "complete" before all five.

**Three standing rules:** ① Additive-only (never break earlier sessions). ② No fake
completion (no placeholder marked done). ③ Demo/synthetic data explicitly labeled.

**Cross-module laws (from Sessions 37–76):**
- All events route through the **S39 AI Kernel** (never module-to-module).
- Self-hosted (S38) is the default execution path; external providers optional (S43).
- No fork/duplicate systems: one Marketplace (S69.3), one Model Registry (S46), one
  Trust Center (S56.3), one Voice Library (S40.1), one Consent framework (S44).
- Voice cloning requires the S44 consent/ownership gate; foundry voices are exempt but audited.
- Health outputs (S75) carry exactly one label: `wellness_estimate | clinically_validated | medical_decision_support`.
- Trading (S35/S81) is decision-support only: every proposal returns
  `requiresApproval: true, governanceReview: true`. **No auto-execution.**

---

## 1. SESSION MAP (1–88+) — ONE ROW PER SESSION

Legend — **Real** = real logic/persistence · **Demo** = seeded/Math.random fixtures ·
**⚠️** = incomplete. Prefixes shown are under `/api/v1` unless noted.

| S | Session / Phase | Spec source | Module dir (api) · shared types · web | Route prefix | Status |
|---|---|---|---|---|---|
| 1 | Full-Stack Foundation (Slices 0–4.1) | `uploads/CLAUDE.md` S1 | core (auth, users, orgs, workspaces, tasks, activity, messages) | `/auth /workspace /tasks /agents /messages /me /profile /conversations /attachments /prompt-templates` | ✅ Real — 51 Prisma models, JWT, bcrypt, RBAC |
| 2 | Universal Workspace | CLAUDE S2 | `services/workspace*` | `/workspace/dashboard` | ✅ Real |
| 3 | AI Chat | CLAUDE S3 | `services/ai/*` (ProviderRegistry, SSE) | `/chat*` | ✅ Real + Echo/OpenAI |
| 4 | AI Employees | CLAUDE S4 | `services/agent*.service.ts` (runtime, memory, knowledge, skills) | `/agents` | ✅ Real |
| 5 | Windels Workspace / Canvas | CLAUDE S5 | `canvases` | `/canvas` | ✅ Real |
| 6 | Windels Talk | CLAUDE S6 | `talk` | `/talk` | ✅ Real |
| 7 | Windels Flow (Workflow Automation) | CLAUDE S7 | `workflows` (BFS engine, nodes, runs, approvals, retry) | `/workflows` (+`/runs/*`, `/analytics/overview`) | ✅ Real |
| 8 | Design System polish | CLAUDE S8 | `components/ui/*`, `lib/toast.tsx`, hooks | (FE-only) | ✅ Real |
| 9 | Enterprise Platform | CLAUDE S9 | `billing`, `publicApi` (REST v1), `devportal` | `/billing /api/rest/v1 /developers/webhooks /api/v1` | ✅ Real |
| 10 | Enterprise Engineering | CLAUDE S10 | `enterprise`, `services/eventBus` | `/enterprise/*` (models, ai-monitoring, plugins, integrations, sso, white-label) | ✅ Real |
| 11 | Governance | CLAUDE S11 | `governance` | `/governance/*` (permissions, audit, health, alerts, retention, compliance, exports) | ✅ Real |
| 12 | Global Platform | CLAUDE S12 | `platform` (regions, cdn, failover), `observability/*` | `/platform/*` | ✅ Real |
| 13 | Security | CLAUDE S13 | `security/*` (encryption, selfTest, reliability, piiRedact) | `/security/*` | ✅ Real |
| 14 | Website | CLAUDE S14 | `pages/marketing/*` (home, pricing, enterprise, developers, docs, blog, support, legal) | public routes `/home /pricing /enterprise /developers /docs /blog /support /legal` | ✅ Real |
| 15 | Mobile App (PWA) | CLAUDE S15 | `services/mobileAuth*`, `pages/mobile/*` (12 pages) | `/mobile/*` | ✅ MVP |
| 16 | Desktop App (Electron) | CLAUDE S16 | `apps/desktop/electron/*`, `pages/desktop` | (shell) | ✅ MVP |
| 17 | DevOps & Production | CLAUDE S17 | `Dockerfile*`, `docker-compose*`, `infra/k8s`, `infra/terraform`, Makefile, CI | — | ✅ MVP |
| 18 | Enterprise Engineering Framework | CLAUDE S18 | `enterpriseFoundation`? → `engineering`? (service registry, `SyncService`) | `/engineering` | ✅ MVP |
| 19 | Enterprise Data Platform | CLAUDE S19 | `dataPlatform` | `/data-platform` | ✅ MVP |
| 20 | AI Workforce Communication | CLAUDE S20 | `enterprise/agentComm` | `/agentComm` | ✅ MVP |
| 21 | Enterprise Infrastructure | CLAUDE S21 | `infrastructure` | `/infrastructure` | ✅ MVP |
| 22 | Enterprise QA Platform | CLAUDE S22 | `qa` | `/qa` | ✅ MVP |
| 23 | Engineering Governance | CLAUDE S23 | `governance` (eng) | `/governance` | ✅ MVP |
| 24 | Release Management | CLAUDE S24 | `release/*` (pipeline, approvals, aiValidation, staging, production, improvement) | `/releases` (17 endpoints, Redis `rel:*`) | ✅ Real-ish (simulated deploys) |
| 25 | AI Program Management | CLAUDE S25 | `program` | `/program` | ✅ MVP |
| 26 | Engineering Observability | CLAUDE S26 | `engineering` | `/engineering` | ✅ MVP |
| 27 | Enterprise Developer Platform | CLAUDE S27 | `devportal` | `/dev-portal` | ⚠️ Partial |
| 28 | Extension Platform | CLAUDE S28 | `extensions/*` (registry, business, industry, skills, agents, workflowExt, dashboardExt, uiComponents) | `/extensions` | ✅ Demo |
| 29 | Enterprise Platform Services | CLAUDE S29 | `platformServices/*` (config, flags, policies, tenants, licensing, billing, capabilities, ontology, blueprints) | `/platform-services` | ✅ Demo |
| 30 | AI Infrastructure / MLOps | CLAUDE S30 | `mlOps/*` (models, deployments, monitors, policies, prompts, rag, vectors, embeddings, knowledge) | `/ml-ops` | ✅ Demo |
| 31 | Enterprise Foundation | CLAUDE S31 | `enterpriseFoundation/*` (dataFabric, identity, finops, resilience, quality, opsCenter) | `/enterprise-foundation` | ✅ Demo |
| 32 | Collaboration & Perception Intelligence | CLAUDE S32 | `collaboration` | `/collaboration` | ✅ Demo |
| 33 | Vendor-Agnostic AI Ecosystem | CLAUDE S33 | `aiEcosystem` | `/ai-ecosystem` | ✅ Demo |
| 34 | Marketplace, Digital Twin & Simulation | CLAUDE S34 | `marketplace` | `/marketplace` | ✅ Demo |
| 35 | Crypto Intelligence & Trading Workforce | CLAUDE S35 | `cryptoIntelligence` | `/crypto-intel` | ✅ Demo |
| 36 | Wake Intelligence & Multimodal Activation | CLAUDE S36 | `wakeIntel` | `/wake-intel` | ✅ Demo |
| 37 | Architecture Stubs / ESI | CLAUDE S37 | `architecture` | `/architecture` | ✅ Demo |
| 38 | Self-Hosted AI Infrastructure | CLAUDE S38 | `selfHosted` (GPU nodes, models, inference, vector stores) | `/self-hosted` | ✅ Demo |
| 39 | Enterprise AI Kernel | CLAUDE S39 | `kernel` (20 components, policy engine, event bus) | `/kernel` | ✅ Real (in-process event bus) |
| 40 | Enterprise Voice Studio | CLAUDE S40 | `voiceStudio` (49 voices, consent gate, TTS) | `/voice-studio` | ✅ Demo (real consent gate) |
| 41 | AI Voice Foundry | CLAUDE S41 | `voiceFoundry` | `/voice-foundry` | ✅ Demo |
| 42 | Universal Media Generation | CLAUDE S42 | `mediaGen` | `/media-gen` | ✅ Demo |
| 43 | Hybrid AI Execution | CLAUDE S43 | `hybridExec` | `/hybrid-exec` | ✅ Demo |
| 44 | Voice Ownership, Security & Governance | CLAUDE S44 | `voiceOwnership` (immutable audit chain, consent) | `/voice-ownership` | ✅ Real gates |
| 45 | Core Enterprise Integration Checkpoint | CLAUDE S45 | `coreIntegration` | `/core-integration` | ✅ (PROCEED) |
| 46 | AI Model Factory | CLAUDE S46 | `modelFactory` | `/model-factory` | ✅ Demo |
| 47 | Memory Evolution Engine | CLAUDE S47 | `memoryEvolution` | `/memory-evolution` | ✅ Demo |
| 48 | AI Constitution Studio | CLAUDE S48 | `constitution` | `/constitution` | ✅ Demo |
| 49 | AI Capability Composer | CLAUDE S49 | `composer` | `/composer` | ✅ Demo |
| 50 | AI Benchmark Center | CLAUDE S50 | `benchmarks` | `/benchmarks` | ✅ Demo |
| 51 | Disaster Recovery & AI Continuity | CLAUDE S51 | `disasterRecovery` | `/disaster-recovery` | ✅ Demo |
| 52 | AI Licensing & Monetization | CLAUDE S52 | `licensing` | `/licensing` | ✅ Demo |
| 53 | Enterprise Deployment Platform | CLAUDE S53 | `deployment` | `/deployment` | ✅ Demo |
| 54 | Update & Lifecycle Management | CLAUDE S54 | `updates` | `/updates` | ✅ Demo |
| 55 | Enterprise Usage Intelligence | CLAUDE S55 | `usage` | `/usage-intel` | ✅ Demo |
| 56 | Intelligence Fabric, Trust Center & Mission Control | CLAUDE S56 | `fabric` (incl. AIO bus, digital twins) | `/fabric` | ✅ Demo (real Redis pub/sub) |
| 57 | Robotics & Physical Automation | CLAUDE S57 | `robotics` | `/robotics` | ✅ Demo |
| 58 | Spatial Computing | CLAUDE S58 | `spatial` | `/spatial` | ✅ Demo |
| 59 | AI OS SDK | CLAUDE S59 | `sdk` | `/sdk` | ✅ Demo |
| 60 | AI Training & Fine-Tuning | CLAUDE S60 | `training` | `/training` | ✅ Demo |
| 61 | Data & Knowledge Marketplace | CLAUDE S61 | `dataMarketplace` | `/data-marketplace` | ✅ Demo |
| 62 | Digital Human Platform | CLAUDE S62 | `digitalHumans` | `/digital-humans` | ✅ Demo |
| 63 | Quantum Readiness | CLAUDE S63 | `quantum` | `/quantum` | ✅ Demo |
| 64 | Sustainability & ESG | CLAUDE S64 | `sustainability` | `/sustainability` | ✅ Demo |
| 65 | Biomedical & Healthcare Intelligence | CLAUDE S65 | `biomedical` | `/biomedical` | ✅ Demo |
| 66 | Legal Intelligence Suite | CLAUDE S66 | `legal` | `/legal` | ✅ Demo |
| 67 | Education & Learning | CLAUDE S67 | `education` | `/education` | ✅ Demo |
| 68 | Scientific Research | CLAUDE S68 | `scientific` | `/scientific` | ✅ Demo |
| 69 | Cognitive Evolution & World Intelligence (V9.0) | CLAUDE S69 | `cognitive` | `/cognitive` | ✅ Demo |
| 70 | Global Command Center | CLAUDE S70 | `command` | `/command` | ✅ Demo |
| 71 | AI Economy Platform | CLAUDE S71 | `aiEconomy` | `/ai-economy` | ✅ Demo |
| 72 | Autonomous Organization | CLAUDE S72 | `autonomous` | `/autonomous` | ✅ Demo |
| 73 | OpEx & Responsible AI (V9.2) | CLAUDE S73 | `opex` | `/opex` | ✅ Demo |
| 74 | Industry / Semantic / DOC (V9.3) | CLAUDE S74 | `industry` | `/industry` | ✅ Demo |
| 75 | Health & Healthcare Ecosystem (V10.0) | CLAUDE S75 | `healthEcosystem` | `/health-ecosystem` | ✅ Demo (real labeling) |
| 76 | Final Enterprise Integration & Validation | CLAUDE S76 | `v76validation` | `/validation` | ✅ (22-item checklist) |
| 77A | Professional Intelligence Platform | `uploads/Sessions 77 and 78.md` | `expertsPlatform` | `/experts` | ✅ Demo |
| 77B | Media/Content Factory + **Social Publishing Pipeline** | `uploads/Sessions 77 and 78.md` | `mediaFactory/publishing/*` (platforms, tokens, publishJobs) | `/media-factory/publishing/*` | ✅ **Real OAuth + upload protocols** |
| 78 | UX Intelligence & Design System | `uploads/Sessions 77 and 78.md` | `uxIntelligence` | `/ux-intelligence` | ✅ Demo |
| 79 | WMPC Gift Card Payment Platform | `uploads/79 and 80.md` | `giftCards` | `/gift-cards` | ✅ Real lifecycle |
| 80 | Global Multi-Currency & Localization | `uploads/79 and 80.md` | `globalCurrency` | `/global-currency` | ✅ Demo |
| 81 | Unified Trading Intelligence | `uploads/session-81-trading-intelligence-platform.md` | `tradingIntel` (18 agents, 20 indicators, 13 markets, risk, sim) | `/trading-intel` | ✅ Demo (real CoinGecko + indicators tested) |
| 82 | AI Cybersecurity Academy | `uploads/CLAUDE-session-82.md` | `cyber` | `/cyber` | ✅ Demo |
| 83 | ETL & Data Pipeline Platform | `docs/SESSION_83_SPECIFICATION.md` | `etl` | `/etl` | ✅ (pipeline builder, DLQ) |
| 84 | Project Continuity Engine | `docs/SESSIONS_84_86_ADDENDUM.md` | `projectContinuity` (inspection, quarantine, clamav, sandbox, snapshots) | `/projects` (+quarantine, health, architecture, snapshots, diff, rollback) | ✅ **Gate closed 2026-07-31** — full dashboard `/app/projects` |
| 85 | AI Lead Discovery | `docs/SESSIONS_84_86_ADDENDUM.md` | `leadDiscovery` (backend) + `/app/leads` (UI) | `/lead-discovery/*` | ✅ Frontend shipped 2026-07-31 |
| 86 | Global Branding | `docs/SESSIONS_84_86_ADDENDUM.md` | `GlobalBrandingFooter.tsx` | (FE) | ✅ |
| 87 | Enterprise Camera Intelligence | `docs/SESSION_87_SPECIFICATION.md` | `camera` (feeds, webrtc, CV models, alerts) | `/camera` | ✅ Demo |
| 88 | — (no spec shipped in repo; docs reference "Sessions 1–88") | — | — | — | ⏳ **NEXT SLOT** |
| 89+ | Future roadmap | TBD — drop spec into `uploads/` | follow §0 loop | — | ⏳ |

---

## 2. BOOT SEQUENCE (apps/api/src/index.ts — timed bootstraps)

| ms | Session | Bootstrap | Seeded counts (verified) |
|---|---|---|---|
| 1500 | 18 | `SyncService` / service registry | — |
| ~2k | 20 | agentComm | — |
| ~2k | 21 | infrastructure | — |
| ~2k | 22 | QA | — |
| 4500 | 23 | governance | — |
| 5000 | 24 | releases | 6 releases, successRate 67% |
| ~5k | 25 | program | — |
| ~5k | 26 | engineering | — |
| ~5k | 27 | devportal | — |
| 7000 | 28 | extensions | 39 extensions, 3 installed |
| 7500 | 29 | platformServices | 22 configs, 20 flags, 10 policies, 3 tenants, 3 licenses, 3 billing, 23 capabilities, 21 ontology, 6 blueprints |
| 8000 | 30 | mlOps | 12 models, 9 deployments, 8 monitors, 8 policies, 10 prompts, 7 indexes, 295k vectors, 6 embeddings, 8 knowledge |
| 8500 | 31 | enterpriseFoundation | 12 connectors, 6 products, 64 principals, 6 IDPs, 6 accounts, 3 anomalies, 8 recs, 2 incidents, 6 playbooks, 6 BCP, 7 scorecards, 6 eval runs, 12 KPIs |
| ~9k | 32 | collaboration | — |
| ~9k | 33 | aiEcosystem | — |
| ~9k | 34 | marketplace | — |
| ~10k | 35 | cryptoIntelligence | — |
| ~10k | 36 | wakeIntel | — |
| 11500 | 37 | architecture | 13 modules, 8 deploy targets |
| 12000 | 38 | selfHosted | 4 GPU nodes, 5 models, 3 vector stores |
| 12500 | 39 | kernel | 20 components (15 online) |
| 13000 | 40 | voiceStudio | 49 builtin voices, 1 custom, 2 presets |
| 13500 | 81 | tradingIntel | 18 agents, 20 indicators, 13 markets, 29 instruments |
| 14000 | 41 | voiceFoundry | 13 categories, 3 packs, 4 deployments |
| 14500 | 77A | expertsPlatform | 6 experts, 4 courses, 3 packages |
| 15000 | 77B | mediaFactory | 4 characters, 3 courses, childGate active |
| 15500 | 78 | uxIntelligence | 12 components, 16 tokens, 3 agents |
| 16000 | 79 | giftCards | 5 cards, 1 loyalty, payment-method registered |
| 16500 | 80 | globalCurrency | 10 currencies, 12 languages, 10 countries, 2 guards |
| 17000 | 76 | v76validation | 22/22 checklist, 28+ systems, 0 duplicates |
| boot | 77B | publish worker | unref'ed due-job processor, `PUBLISH_WORKER_INTERVAL_MS` default 5s |

Later modules (S83 ETL, S84 projects, S85 leads, S87 camera) are lazy/`ensureBootstrapped`
on first access — every dashboard method auto-seeds for new orgs.

---

## 3. PERSISTENCE MAP

**PostgreSQL / Prisma — 51 models (real, S1–13 core):** User, UserProfile, Organization,
Workspace, Membership, Invitation, UserSession, AuditLog, Agent, Task, Activity,
Conversation, Message, ConversationParticipant, MessageAttachment, PromptTemplate,
AgentSkill, AgentMemory, AgentKnowledge, AgentEvent, Canvas, CanvasBlock,
CanvasConnection, TalkChannel, TalkMember, TalkMessage, Meeting, MeetingParticipant,
ActionItem, Workflow, WorkflowRun, ApiKey, WebhookEndpoint, WebhookDelivery,
BillingSubscription, Invoice, ModelRegistry, AiRequest, Plugin, Integration, SsoConfig,
RolePermission, UserPermission, AlertRule, Alert, HealthCheck, DataExport,
MobileDevice, PushSubscription (+ enums: Role, TaskStatus, AgentStatus, CanvasAccess,
TalkChannelType, WorkflowStatus, Permission, AlertSeverity, …).

**Redis (most S24–S82 modules):** `rel:*` (releases), `ext:*` (extensions),
`psvc:*` (platform services), `mlops:*`, `ef:*` (foundation), `arch:*`, `sh:*`,
`ke-*` (kernel events), `vs:*`, `ti:*`, `vf:*`, `ep:*`, `mf:*`, `ux:*`, `gc:*`,
`gcu:*`, `cmp:*` (composer), `fabric` twins, `pub:<oid>:*` (publishing jobs),
`q:*`, `gov:*`, `prog:*`, `eng:*`, `dp:*`, `inf:*`, `qa:*`, `trn:*`, etc.

**Local files:** `uploads/` (multipart intake + media), `apps/web` static build.

---

## 4. FRONTEND INVENTORY

**App pages (`apps/web/src/pages/`):** admin (PlatformPage), agents, analytics, auth,
canvas, chat, dashboard, desktop, developers, errors, learn, marketing, media, mobile,
settings, talk, trading, voice, workflow.

**PlatformPage admin tabs (in order):** Overview, Metrics, Logs, Traces, Ai, Regions,
Cdn, Dr (S12) · Qa (S22) · Gov (S23) · Release (S24) · Program (S25) · Engineering (S26)
· DevPortal (S27) · Infra (S21) · Extensions (S28) · PlatformSvcs (S29) · MLOps (S30) ·
Foundation (S31) · Collaboration (S32) · AiEcosystem (S33) · Marketplace (S34) ·
CryptoIntel (S35) · WakeIntel (S36) · Architecture (S37) · SelfHosted (S38) · Kernel (S39)
· VoiceStudio (S40) · TradingIntel (S81) · VoiceFoundry (S41) · Experts (S77A) ·
MediaFactory (S77B) · UxIntel (S78) · GiftCards (S79) · GlobalCurrency (S80) ·
Validation (S76) · MediaGen (S42) · HybridExec (S43) · VoiceOwnership (S44) ·
CoreIntegration (S45) · ModelFactory (S46) · MemoryEvolution (S47) · Constitution (S48)
· Composer (S49) · Benchmarks (S50) · DisasterRecovery (S51) · Licensing (S52) ·
Deployment (S53) · Updates (S54) · Usage (S55) · Fabric (S56) · Robotics (S57) ·
Spatial (S58) · Sdk (S59) · Training (S60) · DataMarketplace (S61) · DigitalHumans (S62)
· Quantum (S63) · Sustainability (S64) · Biomedical (S65) · Legal (S66) · Education (S67)
· Scientific (S68) · Cognitive (S69) · CommandCenter (S70) · AiEconomy (S71) ·
Autonomous (S72) · Opex (S73) · Industry (S74) · HealthEcosystem (S75) · Cyber (S82).

**Dedicated user pages:** `/app/dashboard`, `/app/chat`, `/app/agents`, `/app/canvas`,
`/app/talk`, `/app/workflow`, `/app/analytics`, `/app/settings`, `/app/developers`,
`/app/security`, `/app/governance`, `/app/enterprise`, `/app/trading`, `/app/voice`,
`/app/media`, `/app/learn` · **Mobile PWA:** `/m/*` (12 pages) · **Marketing:** `/home
/pricing /enterprise /developers /docs /blog /support /legal`.

**Version history (Sidebar):** v0.24 (S24) → v0.28 → v0.29 → v0.30 → v0.31 →
v0.36→v0.40 (S40) → v0.81 (S81) → v0.82 (S41/76–80) → v0.83 (S42–47) → v0.85 (S48–60)
→ v0.88 (S48–72+82) → **v0.89 "Sessions 38–75" (current)**. 77B completion pass did not
bump the sidebar.

---

## 5. TEST SUITE MAP

| Suite | File(s) | Coverage | Status |
|---|---|---|---|
| Publishing units (vitest) | `apps/api/src/mediaFactory/publishing/{publishJobs,tokens,platforms,webhooks,uploads}.test.ts` | 54 tests: state machine, backoff, dedupe, encrypted tokens, per-platform protocols, webhook sync, org tokens, uploads | ✅ 54/54 |
| Regression (vitest) | mediaFactory + tradingIntel + security suites | 103 tests | ✅ 103/103 |
| Trading units (vitest) | `tradingIntel/{indicators,marketData,risk}.test.ts` | 42 tests incl. live CoinGecko candles | ✅ |
| Education / Media / Security units | `education/lecturer.test.ts`, `mediaFactory/pipeline.test.ts`, `security/serviceToken.test.ts` | real ffmpeg MP4 render, JWT, gift-card dedupe | ✅ |
| E2E (Playwright, 26 specs) | `tests/e2e/*.spec.ts` | smoke, S37–40 (9), S42–47 (7), S54–60 (8), S61–72+82 (15), S73–75 (4), release (4), extensions (4), platformServices (4), mlOps (4), enterpriseFoundation, mediaPublishing, others | ✅ 57/57 baseline (needs live server+DB) |
| Load (k6) | `tests/load/*.js` | health-get, chat-streams, per-session suites (all p95 < 800ms) | ✅ |
| Known pre-existing | full API `tsc` | ~402 errors in bulk-generated `src/services/*` (never typechecked end-to-end) | ⚠️ debt |

---

## 6. OPEN WORK & NEXT MOVES (88+)

1. ~~**Close Session 84 gate**~~ — **DONE 2026-07-31** (31/31 unit tests; see PROGRESS.md).
   Typecheck-debt fix is environment-blocked (needs `prisma generate` on a networked machine).
2. ~~**Missing frontends**~~ — **DONE 2026-07-31**: S84 `/app/projects` dashboard, S85 `/app/leads`
   page (MFA TOTP + Google OAuth UI were already present — stale audit entries).
3. **Typecheck debt** — sweep ~402 errors in `apps/api/src/services/*` so the whole
   monorepo builds clean.
4. **Real provider integrations** — market data (Polygon/TwelveData), voice TTS,
   media generation, CV inference (YOLO), ETL connectors (SFTP/S3 live), OCR.
5. **Publishing production config** — register OAuth apps, set `*_CLIENT_ID/*_CLIENT_SECRET`,
   `PUBLISH_REDIRECT_URI` + `PUBLISH_WEBHOOK_BASE_URL`, app reviews (TikTok/X). The code-level
   milestones (webhook status sync, browser-side direct upload, org-shared connections) shipped
   2026-07-31 (54/54 unit tests); optional outbound org notification webhooks remain a future pass.
6. **Session 88+** — no in-repo spec; user supplies next session spec via `uploads/`.

---

*End of FULL WORKFLOW map. Update this file (and SESSION_CONTINUITY.md) at the end of
every session before committing.*
