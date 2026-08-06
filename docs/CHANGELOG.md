# DEPLOYMENT CHANGELOG — WINDELS AI OS

All notable changes, bug fixes, and feature integrations are documented here.

---
---

## [Session 93 — Website Builder] — 2026-08-05

### New module: Website Builder (next named Phase-3 Enterprise Application)
*   `packages/shared/src/websiteBuilder.ts` — Zod contracts + types for
    sites, pages and typed blocks (prefixed `Wb`); block props are a
    discriminated union (hero/text/image/button/features/cta/divider/html);
    loose `WbBlockPatchSchema` for block edits.
*   `apps/api/src/websiteBuilder/renderer.ts` — pure, deterministic
    block→HTML renderer with output escaping (text fields + hrefs; the `html`
    block is an explicit raw-content escape hatch). Preview and publish both
    use it, so `renderedHtml` snapshots are real renderer output.
*   `apps/api/src/websiteBuilder/websiteBuilder.service.ts` — org-scoped
    Redis-backed sites/pages/blocks with slug & path uniqueness, ordered
    blocks (add/update/remove/reorder), honest publish pipeline (status +
    `publishedAt` stamped only on transition; idempotent re-publish; archived
    or empty sites fail honestly), AI copy with `modelSource` labeling and a
    deterministic fallback.
*   Routes: `apps/api/src/http/routes/websiteBuilder.ts` mounted at
    `/api/v1/website-builder` (21 endpoints). Session 89 catalog gains the
    `wb:site` / `wb:page` namespaces as `org_scoped`.
*   Web: `apps/web/src/lib/websiteBuilder.ts` client + `pages/websiteBuilder/
    WebsiteBuilderPage.tsx` (sites list, page editor with block add/reorder/
    remove, preview iframe of real renderer output, publish, AI copy with
    demo banner), `/app/website-builder` route + sidebar entry.
*   Tests: `apps/api/src/websiteBuilder/websiteBuilder.test.ts` (17) — CRUD,
    renderer escaping + determinism, publish snapshots equal renderer output,
    block ordering, AI copy labeling, rollup determinism, cross-tenant
    isolation, demo-seed idempotency, schema contracts.
*   Demo seed (`apps/api/src/websiteBuilder/bootstrap.ts`) gated behind
    `WINDELS_DEMO_DATA`; production starts with no sites.
*   Spec: `docs/SESSION_93_SPECIFICATION.md`.

## [Session 92 — Enterprise ERP] — 2026-08-05

### New module: Enterprise ERP (last major named Phase-3 Enterprise Application)
*   `packages/shared/src/erp.ts` — Zod contracts + types for products,
    warehouses, movements, suppliers, purchase/sales orders and rollup
    (prefixed `Erp`).
*   `apps/api/src/erp/erp.service.ts` — real, org-scoped CRUD backed by Redis
    (`erp:<entity>:i:<org>:<id>`).
*   **Stock is computed, never stored:** the movements ledger is the single
    source of truth; `currentStock()` sums movement quantities per read.
*   **Order lifecycles:** PO draft → submitted → received | cancelled; SO
    draft → confirmed → fulfilled | cancelled. `receive`/`fulfill` create real
    ledger rows; `receivedAt`/`fulfilledAt` stamped only on the transition;
    closed orders reject edits; totals recomputed on read.
*   **CRM hook:** `POST /api/v1/erp/sales-orders/from-deal/:dealId` converts a
    Session 90 won deal into a sales order linked to the deal's company.
    Honest behavior: no fabricated line item — a deal with no product match
    yields an empty order with the deal amount in `note`.
*   SKU uniqueness enforced per org; suppliers + warehouses registries.
*   Deterministic operations rollup (`GET /api/v1/erp/dashboard/rollup`):
    inventory value (Σ stock × cost), low-stock alerts (< reorder level),
    order totals by status, recent movements — no `Math.random`, honest zeros.
*   Routes: `apps/api/src/http/routes/erp.ts` mounted at `/api/v1/erp`
    (32 endpoints). Session 89 catalog gains the six `erp:*` namespaces as
    `org_scoped`.
*   Web: `apps/web/src/lib/erp.ts` client + `pages/erp/ErpPage.tsx` (stats,
    low stock, inventory table, PO/SO panels with Receive/Fulfill, product/
    supplier/warehouse lists, quick-create forms, CRM deal conversion),
    `/app/erp` route + sidebar entry.
*   Tests: `apps/api/src/erp/erp.test.ts` (17) — CRUD, ledger stock math,
    PO/SO lifecycles, CRM hook, rollup determinism, cross-tenant isolation,
    demo-seed idempotency, schema contracts.
*   Demo seed (`apps/api/src/erp/bootstrap.ts`) gated behind
    `WINDELS_DEMO_DATA`; production starts with an empty catalog.
*   Spec: `docs/SESSION_92_SPECIFICATION.md`.

## [Session 91 — Enterprise Email Intelligence] — 2026-08-05

### New module: Enterprise Email Intelligence (first email surface on the platform)
*   `packages/shared/src/emailIntel.ts` — Zod contracts + types for mailboxes,
    threaded messages, threads, rollup and intelligence outputs (prefixed `Ei`).
*   `apps/api/src/emailIntel/emailIntel.service.ts` — real, org-scoped CRUD
    backed by Redis (`ei:<entity>:i:<org>:<id>`); replies thread by
    `inReplyTo` chain then normalized subject; outbox lifecycle
    (queued → sending → sent | failed) with honest `SMTP_NOT_CONFIGURED`.
*   `apps/api/src/emailIntel/smtp.client.ts` — dependency-free SMTP client over
    `node:net`/`node:tls` (greeting → EHLO → AUTH PLAIN → MAIL → RCPT* →
    DATA → QUIT). Verified by a real protocol round-trip against an
    in-process SMTP server (deliver, multi-recipient, AUTH, recipient
    rejection, connection refused, timeout).
*   AI intelligence via the existing ProviderRegistry: draft/summarize/triage
    carry `modelSource: real|echo-demo`, `summaryKind: ai|deterministic`,
    `triageKind: ai|heuristic`; deterministic heuristics are explicit.
*   Credential hygiene: mailbox passwords stored only through `encrypt()`;
    reads return `hasCredentials`; `POST /mailboxes/:id/test` does a real TCP
    reachability probe (never a fabricated pass).
*   Deterministic inbox-analytics rollup (`GET /api/v1/email-intel/dashboard/
    rollup`): counts, unread, top senders, threads, avg response time measured
    from real sent/received pairs — no `Math.random`, honest zeros.
*   CRM integration: linking a message to a contact/deal/company writes a real
    `email` activity into the Session 90 CRM ledger.
*   Routes: `apps/api/src/http/routes/emailIntel.ts` mounted at
    `/api/v1/email-intel` (17 endpoints). Session 89 catalog gains the
    `ei:*` namespaces as `org_scoped`.
*   Web: `apps/web/src/lib/emailIntel.ts` client + `pages/emailIntel/
    EmailIntelPage.tsx` (stats, threads, thread detail + triage/summary,
    outbox with Send, compose, mailbox registry, AI draft with demo banner),
    `/app/email-intel` route + sidebar entry.
*   Tests: `emailIntel.test.ts` (16) + `smtp.client.test.ts` (6) — CRUD,
    threading, outbox lifecycle, rollup determinism, labeled intelligence,
    cross-tenant isolation, demo-seed idempotency, schema contracts, real SMTP
    wire protocol.
*   Demo seed (`apps/api/src/emailIntel/bootstrap.ts`) gated behind
    `WINDELS_DEMO_DATA`; production starts with an empty inbox.
*   Spec: `docs/SESSION_91_SPECIFICATION.md`.

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
