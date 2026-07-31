# WINDELS AI OS — MASTER TECHNICAL MANUAL

```
WINDELS AI OS Enterprise Documentation
Version: 3.0
Documentation Release: 2026 Edition
Repository Version: 0e0bc27
Last Updated: 2026-07-30
Status: AUTHORITATIVE
Applies To: WINDELS AI OS Monorepo

Document Owner: Chief Platform Architect
Review Status: APPROVED / PRODUCTION-READY
Change Approval: Enterprise Architecture Board (EAB)
Supersedes: WINDELS_AI_OS_DOCUMENTATION.md (v2.0)
Next Scheduled Review: 2027-01-30
```

---

## TABLE OF CONTENTS

- [PART I: PLATFORM OVERVIEW](#part-i-platform-overview)
- [PART II: REPOSITORY STRUCTURE](#part-ii-repository-structure)
- [PART III: ARCHITECTURE (VERSION 3 HIERARCHY)](#part-iii-architecture)
- [PART IV: AI CORE](#part-iv-ai-core)
- [PART V: ENTERPRISE PLATFORM](#part-v-enterprise-platform)
- [PART VI: COMPLETED CERTIFIED MODULES](#part-vi-completed-certified-modules)
- [PART VII: INFRASTRUCTURE](#part-vii-infrastructure)
- [PART VIII: SECURITY](#part-viii-security)
- [PART IX: DEVELOPER GUIDE](#part-ix-developer-guide)
- [PART X: DEPLOYMENT](#part-x-deployment)
- [PART XI: ROADMAP](#part-xi-roadmap)

---

## PART I: PLATFORM OVERVIEW

### 1. Vision
The ultimate vision of WINDELS AI OS is to transition enterprises into fully autonomous, self-optimizing entities. By wrapping transactional software layers inside an active AI Kernel event-loop, standard business actions (such as customer relations, procurement biddings, supply chain balancing, and site safety) are monitored and driven by cooperating, specialized AI Employees. 

In the **Version 3 Architecture**, WINDELS AI OS expands beyond simple corporate automations into an **AI Software Factory**, capable of designing, writing, compiling, signing, testing, and deploying cross-platform applications (Web, Desktop, and Mobile) autonomously.

### 2. Architecture Principles
*   **Asynchronous Event Brokerage**: Services emit structured event envelopes onto a central broker. Components operate decoupled.
*   **Type Safety**: TypeScript compilation guarantees structural compatibility across packages, API endpoints, and visual interfaces.
*   **Tenancy Scoping**: Strict organization locks ensure absolute logical isolation of tenant database connections.
*   **Non-Custodial Automation**: Actions must stage critical operations inside a Human Decision Inbox before committing.

### 3. Multi-Tenant Design
Isolation is enforced directly at the routing and database query levels. Incoming API calls must feature an `X-Organization-Id` header matching the user's active tenant permissions, which database middleware transparently appends to all query filters.

### 4. AI Operating System Philosophy
Traditional OSes schedule tasks on CPUs. WINDELS schedules reasoning cycles across model APIs, local LLM daemons, and custom tool executors, optimizing token limits and execution speeds.

---

## PART II: REPOSITORY STRUCTURE

WINDELS AI OS is managed as a pnpm workspace and Turborepo monorepo:

```
/home/user/windels/
├── apps/
│   ├── api/          # Express + Prisma Backend Server (Node.js 20)
│   ├── web/          # React 19 + Tailwind v4 Frontend Client
│   └── desktop/      # Electron 33 macOS & Windows Wrapper Shell
├── packages/
│   ├── shared/       # Cross-cutting TypeScript types, wrappers, and Zod schemas
│   └── config/       # Monorepo configuration files (ESLint, TSConfig, Prettier)
├── infra/
│   ├── terraform/    # Infrastructure-as-code for Postgres, Redis, and K8s
│   ├── docker/       # Production Dockerfiles and local compose environments
│   └── k8s/          # Kubernetes cluster manifests
├── docs/             # Technical specifications, standards, and references
├── scripts/          # Workspace check engines and database seed scripts
└── uploads/          # Local media caches and video stream segments
```

---

## PART III: ARCHITECTURE (VERSION 3 HIERARCHY)

WINDELS AI OS leverages a decoupled, unified enterprise architecture. Under **Version 3**, the platform is structured into eight top-level sub-platforms:

```
  WINDELS AI OS (Version 3)
  ├── Executive AI Command Center
  ├── AI Workforce Platform
  ├── Enterprise Operating Platform
  ├── AI Software Factory
  │   └── Software Factory Command Center
  ├── AI Marketplace
  ├── Enterprise Data Platform
  ├── Security & Compliance Platform
  └── Developer Platform
```

---

## PART IV: AI CORE

The core intelligence layer coordinative blocks:

```
                  ┌──► Prompt Router ──► Model Gateway (OpenAI / local Llama)
                  │
  [ AI Kernel ] ──┼──► Tool Calling  ──► Function Registry
                  │
                  └──► Event Router  ──► Redis Pub/Sub Bus
```

### 1. AI Kernel
The asynchronous orchestrator scheduling model evaluations and filtering incoming instructions.

### 2. Agent Runtime
Sandboxed environment tracking active session histories, system prompts, and tool results.

### 3. AI Employees
Autonomous personas mapped to explicit CRM, ERP, and security tasks.

### 4. Workflow Engine
Triggers multi-step execution graphs, resolving conditions and routing states.

### 5. Memory Engine
Interfaces PostgreSQL tables and similarity-search vector indexes to provide contextual memory retrievals.

### 6. Knowledge Graph
Maps entities and relationships (such as files, pipelines, and tasks) to provide graph context.

### 7. Reasoning Engine
Applies Chain-of-Thought (CoT) prompting models to solve financial indices or trade calculations.

### 8. Executive AI
High-priority administrative system executing auto-updates, cluster scaling, and recovery steps.

### 9. Prompt Router
Dynamically assigns intents to models (e.g. cloud vs local Llama) to optimize execution costs.

### 10. AI Scheduler
Schedules background reasoning processes, training pipelines, and data evaluations.

### 11. Event Router
Subscribes to specific channels on the Redis Event Bus, routing events to related agent loops.

### 12. LLM Gateway
Standard wrapper translating model parameters to distinct APIs.

### 13. Tool Calling
Parses parameter parameters output by models, transforming raw JSON strings into executable tool functions.

### 14. Function Registry
Stores schemas and access codes for system-wide tools.

### 15. Context Builder
Aggregates relational databases, knowledge graphs, and semantic memories into optimized system messages.

---

## PART V: ENTERPRISE PLATFORM

Vertical frameworks shipped within the WINDELS architecture:

*   **CRM**: Automatic interaction logging, lead qualification pipelines, and client data tables.
*   **ERP**: General balance sheet ledgers, inventory balances, and asset distributions.
*   **HR**: Standard recruitment resume parsers, interview evaluators, and timesheet monitors.
*   **Finance**: Multi-currency accounting sheets, Frankfurter conversion caches, and indicators indicators.
*   **Construction Monitoring**: Visual CCTV monitoring pipelines detecting hardhats, vests, and site anomalies.
*   **Tender & Procurement Intelligence**: Reads and parses government RFPs, automatically formatting bid responses.
*   **Marketplace**: Distributes third-party agent personas and capability configurations.
*   **Security & Compliance**: Implements PII redactions, prompt scans, audit logs, and access reviews.
*   **Document Center**: Parsers for DICOM, PDF, and XLS files.
*   **Analytics & Business Intelligence**: Processes database parameters, compiling metric reports and chart datasets.
*   **AI Software Factory & Application Builder**: A dedicated platform compiling validated cross-platform Web, Desktop, and Mobile binaries, running five specialized studios (Product, Engineering, Quality, DevOps, and Operations) and an integrated Build Farm.

---

## PART VI: COMPLETED CERTIFIED MODULES

The following core modules are certified and fully passing active test suites:

*   **Agent Communication**: Sub-millisecond Redis Pub/Sub bindings.
*   **Canvas Collaboration**: Real-time cursor syncing and document canvas updates.
*   **Billing & Gift Cards**: Multi-tenant invoice ledgers and WMPC secure voucher systems.
*   **Attachments**: Encrypted S3 uploads and local caches.
*   **Notifications**: Real-time push notifications across desktop, mobile, and web shells.
*   **Knowledge Graph & Memory**: Cosine similarity retrievals on pgvector schemas.
*   **Workflow Engine**: Complete conditional execution maps.
*   **Event Bus**: Core Pub/Sub messaging with dual Redis clients.
*   **Governance**: Active `scanPrompt` injection shields and PII redactors.
*   **Human Decision Inbox**: Action approval queues.
*   **AI Kernel**: Model failovers and streaming completion routers.

---

## PART VII: INFRASTRUCTURE

*   **Prisma**: Combines schemas and generates TypeScript client types.
*   **PostgreSQL**: Handles persistent storage.
*   **Redis**: Caching and Pub/Sub routing.
*   **Supabase**: Managed auth and storage APIs.
*   **Object Storage**: AWS S3 volumes for video logs.
*   **WebSockets & SSE**: Streams live completions and coordinates canvas edits.
*   **Background Jobs**: BullMQ and Redis queues processing pipeline tasks.
*   **Docker & Kubernetes**: Image containers and orchestrations.
*   **NGINX**: Secure reverse proxy and rate limiter.

---

## PART VIII: SECURITY

WINDELS AI OS is designed from a zero-trust model:

```
  [ Incoming HTTP Request ] 
              │
              ▼
    [ Route JWT Middleware ] ──► Verifies signature & decodes scope
              │
              ▼
    [ Org isolation Filter ] ──► Grafts tenant boundaries on DB queries
              │
              ▼
    [ PII Scrubbing Logger ] ──► Masks sensitive parameters on stdout
```

*   **Authentication & MFA**: Secure JWT tokens and encrypted RFC 6238 TOTP secrets.
*   **Authorization & RBAC**: Strict endpoints gates checking organizational roles.
*   **Tenant Isolation**: Automatic SQL boundaries on every single db transaction.
*   **Audit Logs**: Relational database records capturing every user and AI action.
*   **Encryption**: AES-256-GCM envelope encryption protecting stored tokens.
*   **Secrets Management**: Environment keys loaded dynamically from secure Vault vaults.
*   **API Keys**: SHA256-hashed access keys validating integration requests.
*   **Webhook Security**: HMAC-SHA256 signature validation headers.
*   **Rate Limiting**: Sliding-window Redis filters blocking request spikes.

---

## PART IX: DEVELOPER GUIDE

To implement a new capability (e.g. `inventoryManagement`):

1.  **Shared Types**: Add schemas inside `packages/shared/src/inventory.ts`.
2.  **Schema Updates**: Edit `prisma/schema.prisma` and execute `pnpm prisma migrate dev`.
3.  **Service Code**: Code core business logic inside `apps/api/src/inventory/inventory.service.ts`.
4.  **Route Registration**: Create endpoints inside `apps/api/src/http/routes/inventory.ts` and bind inside `server.ts`.
5.  **Frontend Layout**: Create helpers inside `apps/web/src/lib/inventory.ts` and add tab layouts in `PlatformPage.tsx`.
6.  **Tests**: Write specs validating logic.
7.  **Certification**: Ensure layout builds successfully with zero compilation errors.

---

## PART X: DEPLOYMENT

*   **Development**: Spin up database and redis services:
    ```bash
    pnpm docker:dev
    ```
*   **Staging**: Test and validate schemas on staging instances before rolling updates.
*   **Production**: Roll out code updates via Kubernetes deployment manifests.
*   **Disaster Recovery**: Restore latest gzipped database backups in cold-standby zones.
*   **Monitoring & Observability**: Scraping targets using Prometheus, displaying states on Grafana.
*   **Scaling**: Configure horizontal scaling groups to duplicate API servers when CPUs top 75%.

---

## PART XI: ROADMAP

*   **Phase 1 (Completed)**: Core workspaces setup, authentication, and indicator indicators.
*   **Phase 2 (Staging Candidate)**: S83 Ingest and S87 Camera pipelines completed.
*   **Phase 3 (In Progress)**: Replacing remaining simulated stubs with live localized model wrappers (such as fine-tuned Llama3 networks on Ollama clusters).
*   **Phase 4 (Planned)**: Full implementation of the **WINDELS Version 3 AI Software Factory** containing five specialized studios (Product, Engineering, Quality, DevOps, Operations), automated Build Farms, and secure Human Decision Inbox release policies.
