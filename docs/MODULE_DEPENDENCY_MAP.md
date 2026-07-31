# WINDELS AI OS — MODULE DEPENDENCY MAP & INTERACTION MATRIX

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
Supersedes: None (Initial Release)
Next Scheduled Review: 2027-01-30
```

---

## 1. PLATFORM DEPENDENCY GRAPH

WINDELS AI OS maps dependencies across five core modular tiers. Circular dependencies are strictly prohibited at the build level.

```
       +───────────────────────────────────────────────────────+
       │             PRESENTATION LAYER (React/Web)            │
       +───────────────────────────┬───────────────────────────+
                                   │ (GraphQL / REST / WebRTC)
                                   ▼
       +───────────────────────────────────────────────────────+
       │               APPLICATION LAYER (Express)             │
       +───────────────────────────┬───────────────────────────+
                                   │ (Type-Safe Schema Bounds)
                                   ▼
       +───────────────────────────────────────────────────────+
       │              AI KERNEL & AGENT RUNTIME                │
       +───────────────────────────┬───────────────────────────+
                                   │ (Redis Command/PubSub)
                                   ▼
       +───────────────────────────────────────────────────────+
       │           EVENT BUS & CACHE LAYER (Redis 8)           │
       +───────────────────────────┬───────────────────────────+
                                   │ (Relational Transactions)
                                   ▼
       +───────────────────────────────────────────────────────+
       │         PERSISTENCE & DATABASE (PostgreSQL 17)        │
       +───────────────────────────────────────────────────────+
```

---

## 2. CORE MODULE STARTUP ORDER

To ensure clean platform initializations, systems must resolve and start up sequentially:

1.  **Level 0 (Hardware & Basic DB Connections)**:
    *   Verify PostgreSQL and pgvector availability.
    *   Initialize Redis Command client (`redisCmd`) and Subscriber client (`redisSub`).
2.  **Level 1 (Event Bus & Isolation Middleware)**:
    *   Boot the Redis Pub/Sub listener queues.
    *   Register organizational scoping filters and RBAC validation caches.
3.  **Level 2 (The AI Kernel Registry)**:
    *   Load AI provider accounts, validating credentials and prompting templates.
    *   Verify offline sandbox failover fallbacks.
4.  **Level 3 (Specialized Background Services)**:
    *   Start background scheduler loops.
    *   Launch Session 83 ETL pipeline listeners.
    *   Launch Session 87 Camera OpenCV and FfMpeg capture workers.
    *   Start **AI Software Factory / Application Builder** task polling queues.
5.  **Level 4 (Presentation Gateways)**:
    *   Expose port 4000 (Express Web Server).
    *   Establish persistent WebSockets / Server-Sent Events (SSE) interfaces.

---

## 3. EVENTBUS INTEGRATION RULES

Services propagate system states across the Redis Event Bus using standard envelopes:

*   **ETL Pipeline Runs**: Emits `etl.run_started` and `etl.run_failed/succeeded`.
*   **Surveillance Alarms**: CCTV feeds emit `camera.alert_triggered` (severity Info, Warning, or Critical).
*   **User Sessions**: Emits `auth.mfa_login_succeeded/failed`.
*   **Software Builder Runs**: Emits `builder.build_queued`, `builder.build_completed`, and `builder.build_failed`.

---

## 4. AI KERNEL RELATIONSHIPS

The AI Kernel intercepts, tracks, and routes tasks:
*   **Prompt Guarding**: Standard prompt entries are automatically passed to `scanPrompt` to evaluate threat ratings before submitting completions.
*   **Context Ingestion**: Retrieves historical dialogue and semantic vectors from pgvector tables.

---

## 5. DATABASE & DATABASE TABLE OWNERSHIP

The PostgreSQL 17 relational schemas are strictly managed by individual domain services:

| Schema Container / Table | Owner Service | Data Model Classes |
| :--- | :--- | :--- |
| **`User`, `UserProfile`** | Auth & Identity Service | User parameters and MFA secrets |
| **`Organization`** | Scoping & Tenant Isolation | Organizational UUID keys |
| **`EtlPipeline`, `EtlRun`** | Ingest & ETL Service | Connection parameters and logs |
| **`CameraFeed`, `CameraAlert`** | Surveillance Service | RTSP URLs and violation logs |
| **`Agent`, `AgentMemory`** | AI Engine & Vector Caches | Persona system templates and memory |
| **`AppBuilderProject`, `AppBuilderTask`, `AppBuilderRun`**| AI Software Factory Service| Project frameworks and compilation runs |

---

## 6. API INTERFACE OWNERSHIP (PUBLIC vs INTERNAL)

### 6.1 Internal System APIs (Gated, Tenant Isolated)
*   Routes: `/api/v1/etl/*`, `/api/v1/camera/*`, `/api/v1/projects/*`, `/api/v1/builder/*`.
*   Access Conditions: Requires verified JWT keys and matching `X-Organization-Id` authorization scopes.

### 6.2 Public APIs (Throttled, Token Signed)
*   Routes: `/api/v1/public/etl/webhook`, `/api/v1/public/notifications`.
*   Access Conditions: Validated using SHA256 signatures with rate limits (100 RPM limit).

---

## 7. CROSS-MODULE COVENANTS

No database transaction may run cross-module joins without using designated API boundaries:
*   *Verification Example*: The Live Camera platform cannot query user login profiles directly. It must request context boundaries using the core Auth API.

---

## 8. INDEPENDENTLY FREEZABLE MODULES

Certain modules feature decoupled operations and can be frozen independently inside staging:
- [x] **Global Currency Platform**: Decoupled from the AI Kernel, relying entirely on Frankfurter.app caching.
- [x] **Billing & Gift Cards**: Relational database operations.
- [x] **MFA TOTP Auth**: Authenticates user logins completely on PostgreSQL boundaries.
