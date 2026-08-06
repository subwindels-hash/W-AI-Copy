# DEPLOYMENT CHANGELOG — WINDELS AI OS

All notable changes, bug fixes, and feature integrations are documented here.

---
---

## [Session 90 — Enterprise CRM] — 2026-08-05

### New module: Enterprise CRM (first CRM surface on the platform)
*   `packages/shared/src/crm.ts` — Zod contracts + types for contacts, companies,
    deals/pipeline and activities (prefixed `Crm`), single source shared by API,
    routes and web client.
*   `apps/api/src/crm/crm.service.ts` — real, org-scoped CRUD backed by Redis
    (`crm:<entity>:i:<org>:<id>` + org-scoped indexes). Reads re-check the org
    segment (fail-closed, per the Session 89 tenant-isolation guarantee).
*   Deal pipeline: 6 default stages with default probabilities; every stage
    transition is recorded as an audited activity and stamps `wonAt`/`lostAt`
    only on a real change (no-op writes create nothing).
*   Deterministic dashboard rollup (`GET /api/v1/crm/dashboard/rollup`):
    weighted forecast (Σ amount × probability), conversion rate, per-stage
    breakdown, top deals and recent activities — computed per read, no
    `Math.random`, no fabricated numbers. Fresh orgs show honest zeros.
*   Routes: `apps/api/src/http/routes/crm.ts` mounted at `/api/v1/crm`
    (contacts/companies/deals/activities CRUD + pipeline stages + rollup).
*   Session 89 integration: the `crm:contact|company|deal|activity` namespaces
    are registered in the tenant-isolation audit catalog as `org_scoped`.
*   Web: `apps/web/src/lib/crm.ts` client, `apps/web/src/pages/crm/CrmPage.tsx`
    dashboard (stats, pipeline bars, deals, contacts, companies, activity
    ledger, quick-create forms), `/app/crm` route + sidebar entry.
*   Tests: `apps/api/src/crm/crm.test.ts` (12 tests) — CRUD, cross-tenant
    isolation, stage-transition auditing, rollup determinism, demo-seed
    idempotency, shared schema contracts.
*   Demo seed (`apps/api/src/crm/bootstrap.ts`) is gated behind
    `WINDELS_DEMO_DATA`; production starts empty.
*   Spec: `docs/SESSION_90_SPECIFICATION.md`.

### Small gap closures (web clients)
*   `apps/web/src/lib/admin.ts` — typed client for `/api/v1/admin` (stats,
    users, suspension, role).
*   `apps/web/src/lib/promptTemplates.ts` — typed client for
    `/api/v1/prompt-templates` (Session 23 module previously had no web client).
*   `apps/web/src/lib/events.ts` — EventSource subscription helper for the
    org-scoped SSE channel (`/api/v1/events/stream`) + health probe.
*   Documented: Google OAuth (server redirect flow, LoginPage handles it) and
    public API (external-consumer surface; developer portal covers keys/webhooks).

## [Session 1 Certification — DEMO Cleanup & Bootstrap Gating] — 2026-08-05

### Security / Fail-Closed (Repository-wide)
*   **DB fallback now fails closed**: `apps/api/src/db/client.ts` no longer silently falls back to an in-memory demo DB (seeded with a demo super admin `admin@windels.ai`, demo org, and 5 demo AI agents) when real-Prisma/Postgres init fails. Production DB failure now aborts startup. The in-memory fallback is available only when `WINDELS_ALLOW_MOCK_DB_FALLBACK=true` **and** `NODE_ENV !== production` (new env flag, default false).
*   **CSPRNG hardening**: API-key generation (`publicApi.service.ts`), invoice-number randomness (`services/billing.service.ts`), and observability trace/span ids (`http/middleware/observability.ts`) replaced `Math.random()` with `node:crypto` `randomBytes`.

### Demo Data Gating (Production starts empty)
*   Bootstraps that directly seeded business/reference records are now gated behind `WINDELS_DEMO_DATA` (off by default): `release`, `program`, `devportal`, `qa`, and `enterprise/agentComm`. Production deployments will not auto-create fake release history, programs, SDK catalogs, reference suites, or default teams/policies.

### Tests / Guards
*   New `apps/api/src/demoCleanup.guard.test.ts` (7 tests)
*   **API-key endpoint fixed**: `/api/v1/apikeys` returned a fake `ak_${Date.now()}`
    placeholder that was never persisted; the backing `services/apikey.service.ts` did not
    match the `ApiKey` schema (raw `key` field, no hash) and was dead code. The route now
    reuses the canonical `publicApi.service.ts` (CSPRNG token, sha256 `keyHash` at rest,
    real create/list/revoke), and the broken service was deleted.
 pins the fail-closed and demo-gating behavior; includes a repo-wide scan asserting every directly-seeding bootstrap is gated.
*   Full API suite: **934 tests passing, 0 failures**.
*   **Refresh-token TTL now configurable**: `auth.service.ts` previously hardcoded the
    refresh-token TTL to 7 days and ignored the `JWT_REFRESH_TTL` env var (which was defined
    in the schema). It now parses `JWT_REFRESH_TTL` (e.g. `7d`, `12h`) with a 7-day fallback.

*   **Service-level demo seeding gated**: `ensureBootstrapped` in 11 more services
    (`legal`, `giftCards`, `modelFactory`, `memoryEvolution`, `hybridExec`, `expertsPlatform`,
    `uxIntelligence`, `voiceFoundry`, `voiceOwnership`, `mediaFactory`, `mediaGen`) no longer
    auto-creates sample/demo records when `WINDELS_DEMO_DATA=false`. Production starts empty
    for these surfaces too. The `demoCleanup` guard now scans `.service.ts` `*_SEED` loops.


---


## [v2.0.0-staging] — 2026-07-30

### Added
*   **Version 2 Enterprise Documentation Suite**: Comprehensive documentation covering system design, AI architectures, multi-tenant databases, scaling, disaster recovery, and API standards.
*   **Session 83 ETL & Ingestion**: Pipeline builder UI layouts, SFTP/S3 connectors, custom Zod validators, and a Dead Letter Queue (DLQ).
*   **Session 87 Camera Intelligence**: RTSP feed registry, WebRTC sessions, real-time computer vision models (PPE, License Plate, and Intrusion), and secure incident timelines.
*   **Cross-Platform Integrations**: Standard React views for Desktop and Mobile PWA environments.

### Fixed
*   **Logger Call Mismatch**: Standardized Pino logger parameters.
*   **Vector Storage Imports**: Resolved broken relative path definitions.
*   **Benchmarks Properties**: Corrected scoring reference variables.

### Changed
*   **Active Unit Tests**: Achieved a 100% pass rate under local mock controllers (49/49 active specs).
