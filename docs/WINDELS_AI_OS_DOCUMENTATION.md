# WINDELS AI OS — DEVELOPER & ARCHITECTURE MANUAL

**Release Version:** v0.88.0 (Staging Candidate)  
**Target Audience:** Core Developers, AI Engineers, Security Officers  
**Workspace Path:** `/home/user/windels`  

---

## 1. PROJECT OVERVIEW & GOALS

WINDELS AI OS is designed from first principles as an **AI-Native Enterprise Operating System** that orchestrates autonomous workspaces, multi-agent swarms, and cross-platform integrations under a single event-driven loop.

### 1.1 Core Business Value Slices
*   **AI Workforce Platform**: Seeded persona registries and custom event dispatch networks where agents can communicate, coordinate, and escalate tasks synchronously.
*   **Unified Financial Trading**: Non-custodial market decision support covering 20+ math-intensive technical indicators and live cryptographical quotes.
*   **Media Ingestion & Rendering**: Animated SVG video assembly compilers, SpeechSynthesis voice foundry integrations, and live security camera RTSP streams.
*   **Project Import Continuity**: Pre-extraction codebase intake, malware file scanning, and package configuration mapping.

---

## 2. THE 4-LAYER MONOREPO ARCHITECTURE

WINDELS AI OS runs as a layered Turborepo workspace, maintaining strict boundaries between frontend layout controls, backend REST APIs, and shared schemas:

```
                      MONOREPO DECK SCHEMATIC
                      
    [ apps/desktop ] ──► Electron 33 Native Shell (Window, FS, Notify)
           │
           ▼
    [ apps/web ]     ──► React 19 + Tailwind v4 + Zustand Frontend (PWA Mobile)
           │
           ▼
    [ apps/api ]     ──► Node.js 20 + Express + Zod + Prisma (Postgres & Redis)
           │
           ▼
    [ packages/shared ] ──► Cross-Cutting Zod Schemas & Shared Types
```

### 2.1 Shared Workspace Package (`packages/shared/`)
Acts as the single source of truth for types and validation boundaries. It defines the core data interfaces, API request/response structures, and status enums to guarantee type-safety on compile-time across the workspaces.

### 2.2 Frontend React Application (`apps/web/`)
*   **Vite production compilation**: Bundles React 19, Tailwind v4, and state stores into compressed, minified JS chunks located under `apps/web/dist/`.
*   **State Store (`apps/web/src/store/auth.ts`)**: Handles local state sessions, token expirations, and automatic token refresh calls proactively.
*   **Visual Layouts (`PlatformPage.tsx`)**: Multiplexes admin panels, charts, logs, and visual component tabs (including the newly developed `EtlTab` and `CameraTab`).

### 2.3 Backend API Express Server (`apps/api/`)
*   **Central Server (`src/http/server.ts`)**: Mounts REST API routers, applies CORS policies, injects request IDs, and starts the server on port 4000.
*   **Central Logger (`src/config/logger.ts`)**: Structured JSON output using Pino with an integrated recursive PII redactor.

---

## 3. DATABASE MODELS & SCHEMA SPECIFICATIONS

The relational database layer is managed by Prisma ORM against a PostgreSQL 17 cluster.

```
                      CORE RELATIONAL SCHEMA
                      
    [ User ] ──(1:1)──► [ UserProfile ] (Theme, timezone, display name)
       │
      (1:N)
       ▼
    [ Membership ] ────► [ Organization ] ───► [ Workspace ]
```

### 3.1 Primary Models in `schema.prisma`
*   **`User`**: Owns email authentication, hashed credentials, MFA flags, and role descriptors (`USER`, `ADMIN`, `SUPER_ADMIN`).
*   **`Organization` & `Workspace`**: Form the multi-tenant software boundaries. Downstream REST routes use `orgScope` middleware to prevent cross-tenant data access leaks.
*   **`Agent` & `AgentMemory`**: Tracks AI employee configurations, capabilities, and importance weights (used by vector semantic search).
*   **`Conversation` & `Message`**: Persists chronological team and assistant dialogues.

---

## 4. AI SYSTEMS & EVENT BUS ROUTING

### 4.1 Multi-Provider AI Registry (`aiRegistry`)
Located in `apps/api/src/services/ai/registry.ts`, the registry manages swappable LLM adapters:
*   **Ollama**: Streams self-hosted model chat integrations locally.
*   **OpenAI / Anthropic**: Connects premium cloud models when API keys are configured.
*   **Windels Echo**: Public demo fallback. Every steamed chunk is prefixed with warning indicators when active.
*   **scanPrompt Guard**: Blocks malicious queries scoring ≥ 80 to prevent LLM prompt injections.

### 4.2 Vector Search & RAG Fabric
*   **Cosine Similarity Solver (`vectorStorage.service.ts`)**: Calculates semantic similarity scores between memory vectors:
    ```typescript
    function cosineSimilarity(a: number[], b: number[]): number {
      let dotProduct = 0, normA = 0, normB = 0;
      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    ```

---

## 5. REPRODUCIBLE TESTING & BUILDS GATES

Every modification committed to the repository must clear these build checks:

```bash
# 1. Compile Shared Types
pnpm --filter @windels/shared build

# 2. Compile Desktop Shell
pnpm --filter @windels/desktop build

# 3. Build Web Platform Assets
pnpm --filter @windels/web build

# 4. Run Unit Test Engine
pnpm --filter @windels/api exec vitest run
```

---

## 6. DISASTER RECOVERY & ROLLBACK PLAN

1.  **Automated Daily Backups**: Cron scripts perform compressed `pg_dump` databases snapshots and write to secure offsite storage.
2.  **Version Rollbacks**: If a containerized update fails staging verification, run:
    ```bash
    git checkout tags/v0.87.0
    pnpm install --frozen-lockfile
    docker compose up -d --build
    ```
