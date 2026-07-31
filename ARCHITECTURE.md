# WINDELS AI OS — Platform Architecture (V9.3 / v0.89.0)

WINDELS AI OS is a monorepo (pnpm + Turborepo) organized into four platform layers per Session 74.5. Every capability is governed by a single backbone: Governance Kernel, AI Constitution, Safety & Assurance Platform, and Human Oversight.

## Repository layout
```
windels-ai-os/
├── apps/
│   ├── api/          Node 20 + Express + Prisma + ioredis API (port 4000)
│   ├── web/          React 19 + Vite 5 + Tailwind v4 + Framer Motion + Zustand (port 5173 dev, static in prod)
│   └── desktop/      Electron 33 shell (loads web app)
├── packages/
│   └── shared/       Shared TypeScript types, enums, constants
├── infra/            Docker, docker-compose, reverse proxy, deployment manifests
├── tests/
│   ├── e2e/          Playwright specs
│   └── load/         k6 scripts
├── uploads/          Source specifications (read-only inputs)
├── PROGRESS.md       Session-by-session build log
├── CONVENTIONS.md    Engineering conventions and standing rules
└── ARCHITECTURE.md   This file
```

## Four Platform Layers (Session 74.5)

**Platform One — AI Core Platform**
AI Kernel (S39) · Superintelligence Layer · Synthetic Intelligence Layer · Memory Fabric (S47) · Global Memory Network (S69.8) · Knowledge Graph · Semantic Intelligence (S74.1) · World Model Engine (S69.11) · Universal Reasoning Engine (S69.6) · God-Node Orchestrator · Governance Kernel (S37/S39)

**Platform Two — Enterprise Business Platform**
CRM · Finance · Procurement · HR · Customer Support · Trading Intelligence (S35/S81) · Cybersecurity (S82) · Digital Operations (S74.4) · Automation · Industry Solutions (S74.2 — 25 suites). CRM/Finance/Procurement/HR are named in S74.5 as future scopes; no dedicated session shipped them, so they are flagged for backlog.

**Platform Three — AI Studio Platform**
Voice Studio (S40) · Voice Foundry (S41) · Image/Video/Animation/Music (S42 Universal Media Gen) · Digital Human Studio (S62) · Workflow Studio · Agent Builder · Model Factory (S46) · Prompt Studio · AI Training Studio (S60) · Personality Studio. Video/Music route through S42 media-gen.

**Platform Four — Developer & Marketplace Platform**
SDK (S59) · APIs · Connectors · Package Manager (S56.9) · Marketplace Network (S69.3, unified over S40.1/S4.9/S24) · Certification Center (S56.10) · Plugins/Extensions · DevOps · Deployment Center (S53) · Testing · Documentation.

## Module registry (current sessions shipped: 38–75 + 82)

| # | Module | Route prefix | Redis ns | Icon |
|---|---|---|---|---|
| 38 | Self-Hosted AI Infrastructure | `/self-hosted` | `sh:*` | Server |
| 39 | AI Kernel | `/kernel` | `kr:*` | Cpu |
| 40 | Voice Studio | `/voice-studio` | `vs:*` | Mic2 |
| 41 | Trading Intel | `/trading-intel` | `ti:*` | TrendingUp |
| 41 | Voice Foundry | `/voice-foundry` | `vf:*` | Wand2 |
| 42 | Media Gen | `/media-gen` | `mg:*` | ImageIcon |
| 43 | Hybrid Exec | `/hybrid-exec` | `hx:*` | ServerIcon |
| 44 | Voice Ownership | `/voice-ownership` | `vo:*` | UserCheck |
| 45 | Core Integration | `/core-integration` | `cei:*` | Link2 |
| 46 | Model Factory | `/model-factory` | `mf2:*` | FactoryIcon |
| 47 | Memory Evolution | `/memory-evolution` | `me:*` | DbIcon |
| 48 | Constitution | `/constitution` | `cst:*` | BookOpen |
| 49 | Composer | `/composer` | `cmp:*` | Workflow |
| 50 | Benchmarks | `/benchmarks` | `bm:*` | BarChart3 |
| 51 | Disaster Recovery | `/disaster-recovery` | `dr:*` | HeartPulse |
| 52 | Licensing | `/licensing` | `lic:*` | DollarSign |
| 53 | Deployment | `/deployment` | `dep:*` | Cloud |
| 54 | Updates | `/updates` | `upd:*` | RefreshCw |
| 55 | Usage Intel | `/usage-intel` | `usg:*` | PieChart |
| 56 | Intelligence Fabric / Trust Center / Mission Control / AIO Bus | `/fabric` | `fab:*` | CogIcon |
| 57 | Robotics | `/robotics` | `rob:*` | BotIcon |
| 58 | Spatial Computing | `/spatial` | `spa:*` | Box |
| 59 | SDK | `/sdk` | `sdk:*` | TerminalIcon |
| 60 | Training & Fine-Tuning | `/training` | `tr:*` | GradIcon |
| 61 | Data & Knowledge Marketplace | `/data-marketplace` | `dmp:*` | ShoppingBag |
| 62 | Digital Humans | `/digital-humans` | `dh:*` | UserCircle |
| 63 | Quantum Readiness | `/quantum` | `q:*` | Atom |
| 64 | Sustainability / ESG | `/sustainability` | `esg:*` | Leaf |
| 65 | Biomedical & Healthcare | `/biomedical` | `bm:*` (biomedical) | Stethoscope |
| 66 | Legal Intelligence | `/legal` | `leg:*` | Gavel |
| 67 | Education & Learning | `/education` | `edu:*` | School |
| 68 | Scientific Research | `/scientific` | `sci:*` | FlaskConical |
| 69 | Cognitive / World Intelligence (V9.0) | `/cognitive` | `cog:*` | Brain |
| 70 | Global Command Center | `/command` | `cmd:*` | Globe2Icon |
| 71 | AI Economy | `/ai-economy` | `eco:*` | Wallet |
| 72 | Autonomous Organization | `/autonomous` | `aut:*` | Crown |
| 73 | OpEx & Responsible AI (V9.2) | `/opex` | `opex:*` | ShieldCheck |
| 74 | Industry / Semantic / DOC (V9.3) | `/industry` | `ind:*` | Building2 |
| 75 | Health Ecosystem (V10.0) | `/health-ecosystem` | `hec:*` | HeartPulse |
| 82 | Cybersecurity Academy | `/cyber` | `csec:*` | ShieldLucide |

## Cross-cutting rules
1. **Singleton services** — every module exports a `{Service}` object with an `ensureBootstrapped(logger?, oid?, uid?)` method; call it on first dashboard access so new organizations auto-seed.
2. **Organization scoping** — every Redis key is prefixed `<ns>:<oid>:...`; never write global data.
3. **Logger** — pino logger uses object form `logger.info({ msg, ...meta })` (positional meta is rejected by strict TS).
4. **Validation** — zod schemas in routes; `validate()` middleware returns HTTP 422 on failure.
5. **Auth** — JWT Bearer token from `/auth/login`; CSRF double-submit; first registered user becomes `super_admin`.
6. **Bootstrap order** — new-module bootstraps run via `runNewBootstraps(oid, uid)` at 23.5s after API start (covers S54–S75 + S82).
7. **Health labeling (S75)** — every health output is tagged exactly one of `wellness_estimate | clinically_validated | medical_decision_support`; wellness estimates are never presented as diagnoses.
8. **Safety gate** — no production capability executes without S73.1 safety/assurance + Governance Kernel sign-off (sandboxed Innovation Lab is the exception).
9. **Single source of truth** — one Marketplace (S69.3), one Model Registry (S46), one Trust Center (S56.3 extended by S73.6), one Voice Library (S40+S41), one Consent/Privacy framework (S44 extended by S75.10).

## Runtime topology
- **API** (`apps/api`, port 4000, `/api/v1/*`): Express + Prisma (Postgres) + ioredis (dual client: subscriber `redis`, command `redisCmd`) + pino logger + AIO bus.
- **Web** (`apps/web`, Vite dev on 5173, static in production): React 19 SPA, React Router, Tailwind v4, Framer Motion, Zustand.
- **Desktop** (`apps/desktop`, Electron 33): wraps the web app with IPC bridges.
- **Postgres 17** — persistent data for users, orgs, sessions, tasks, audit log, model registry (via Prisma).
- **Redis 7** — volatile/cache data for module state, AIO bus pub/sub, rate limiting, feature flags; all module seed state lives under Redis hashes/sets with `_doc` sub-keys.

## Build & run
```bash
pnpm install
pnpm --filter @windels/shared build
pnpm --filter @windels/api build
pnpm --filter @windels/web exec vite build
# then start API + (optionally) Vite dev server — see DEPLOYMENT.md
```
