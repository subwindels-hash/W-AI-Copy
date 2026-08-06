# DEPLOYMENT CHANGELOG — WINDELS AI OS

All notable changes, bug fixes, and feature integrations are documented here.

---
---

## [Session 98 — Enterprise Search] — 2026-08-05

### New module: Unified Organization Search
*   `packages/shared/src/enterpriseSearch.ts` — Zod contracts + types for
    search queries, hits, facets, recent searches and rollup (prefixed `Es`);
    15 searchable entity types across the application suite.
*   `apps/api/src/enterpriseSearch/enterpriseSearch.service.ts` — the search
    index is **computed, never stored**: every query scans the real
    org-scoped module records through each module service and ranks matches
    with a deterministic relevance score (field weights, prefix bonus,
    7-day recency), returning grouped facets. No separate index to drift, no
    fabricated hits; cross-tenant isolation inherited from every module's
    fail-closed reads.
*   Stable ordering (score desc, id asc) — identical store + query ⇒
    identical results.
*   Org-scoped recent-search history (case-insensitive dedupe, newest-first,
    capped at 20, single-entry removal + clear).
*   Rollup computes live `indexedCounts` per entity type from the module
    stores.
*   Routes: `apps/api/src/http/routes/enterpriseSearch.ts` mounted at
    `/api/v1/search` (5 endpoints). Session 89 catalog gains the
    `es:history` namespace as `org_scoped`.
*   Web: `apps/web/src/lib/enterpriseSearch.ts` client + `pages/search/
    EnterpriseSearchPage.tsx` (search bar, live results with type badges +
    scores, facets, recent-search history), `/app/search` route + sidebar.
*   Tests: `apps/api/src/enterpriseSearch/enterpriseSearch.test.ts` (11) —
    live search across CRM/ERP/Email/Helpdesk records, deterministic ranking,
    type filters + limit, history dedupe/cap/remove/clear, rollup,
    cross-tenant isolation, demo-seed idempotency, schema contracts.
*   Demo seed (`apps/api/src/enterpriseSearch/bootstrap.ts`) gated behind
    `WINDELS_DEMO_DATA` — seeds history only; the index is always live.
*   **104 modules** in the inventory (77 COMPLETE).
*   Spec: `docs/SESSION_98_SPECIFICATION.md`.

## [Session 97 — Enterprise Business Intelligence] — 2026-08-05

### New module: Business Intelligence & Report Builder (Phase-4 Analytics)
*   `packages/shared/src/businessIntelligence.ts` — Zod contracts + types
    for sources, KPIs, reports and evaluated outputs (prefixed `Bi`);
    per-module metric catalogs; periods (`all | 7d | 30d`); formats.
*   `apps/api/src/businessIntelligence/businessIntelligence.service.ts` —
    org-scoped Redis-backed sources/KPIs/reports plus the **live metric
    engine**: `evaluateMetric()` reads the real module records through each
    module service (CRM/ERP/Email/Social/Helpdesk/Builder) and computes the
    value per read — never stored, never fabricated; identical store state ⇒
    identical values.
*   **Report builder** with deterministic live evaluation of every card and
    a **real CSV export** (escaped, deterministic rows).
*   Metric validation per module (unknown metrics rejected); period windows
    filter real record timestamps.
*   Routes: `apps/api/src/http/routes/businessIntelligence.ts` mounted at
    `/api/v1/bi` (19 endpoints). Session 89 catalog gains the `bi:source` /
    `bi:kpi` / `bi:report` namespaces as `org_scoped`.
*   Web: `apps/web/src/lib/businessIntelligence.ts` client + `pages/bi/
    BusinessIntelligencePage.tsx` (source registry, live KPI value cards,
    report evaluation + CSV export link), `/app/bi` route + sidebar entry.
*   Tests: `apps/api/src/businessIntelligence/businessIntelligence.test.ts`
    (14) — CRUD, live metric engine (values update as module records change),
    metric validation, deterministic evaluation, CSV export, rollup
    determinism, cross-tenant isolation, demo-seed idempotency, schemas.
*   Demo seed (`apps/api/src/businessIntelligence/bootstrap.ts`) gated behind
    `WINDELS_DEMO_DATA` — defines BI config only, never fabricates module
    data, so KPI values are honest.
*   **103 modules** in the inventory (76 COMPLETE).
*   Spec: `docs/SESSION_97_SPECIFICATION.md`.

## [Session 96 — AI Software Factory / Application Builder] — 2026-08-05

### New module: implements docs/AI_APPLICATION_BUILDER_SPECIFICATION.md V3.0 (core)
*   `packages/shared/src/appBuilder.ts` — Zod contracts + types for
    projects, tasks, build runs, artifacts, approvals and rollup (prefixed
    `Ab`); the 6 functional workforce clusters + 17 personas (spec §6);
    pinned SBOM dependency catalog.
*   `apps/api/src/appBuilder/appBuilder.service.ts` — org-scoped Redis-backed:
    projects (target type, tech stack, system prompt), AI-workforce tasks
    (assignedAgent + functional group, honest completion, AI code generation
    via the ProviderRegistry labeled `generationSource: manual|real|echo-demo`),
    and the **build farm state machine** (QUEUED → GENERATING_CODE → TESTING →
    COMPILING → SIGNING → SUCCEEDED | FAILED via explicit advance; real
    log entries; retry from FAILED; duplicate versions rejected).
*   **Immutable artifact registry:** every SUCCEEDED run finalizes an
    artifact with a **real SHA-256** (node:crypto), **real byte size**, and a
    **real SBOM** derived from the declared tech stack (pinned versions or
    labeled "declared (unpinned)"); no update endpoint, version-gated.
*   **Human Decision Inbox gate (spec §7):** artifacts start unpublished;
    `request-release` → `decide` (approve/deny, audited) → `release` only
    when approved — never automatic.
*   Routes: `apps/api/src/http/routes/appBuilder.ts` mounted at
    `/api/v1/builder` (24 endpoints, matching the spec's §10 paths). Session
    89 catalog gains the five `ab:*` namespaces as `org_scoped`.
*   Web: `apps/web/src/lib/appBuilder.ts` client + `pages/appBuilder/
    SoftwareFactoryPage.tsx` (agent registry, projects, task board with code
    generation, build farm with advance controls + live logs, artifact
    registry with SHA-256/SBOM, Human Decision Inbox with approve/deny),
    `/app/app-builder` route + sidebar entry.
*   Tests: `apps/api/src/appBuilder/appBuilder.test.ts` (15) — CRUD, SBOM
    determinism, state machine + real artifact SHA-256, release gate,
    generation labeling, rollup determinism, cross-tenant isolation,
    demo-seed idempotency, schema contracts.
*   Demo seed (`apps/api/src/appBuilder/bootstrap.ts`) gated behind
    `WINDELS_DEMO_DATA`; production starts empty.
*   **102 modules** in the inventory (75 COMPLETE).
*   Spec: `docs/SESSION_96_SPECIFICATION.md`.

## [Session 95 — Enterprise Helpdesk & Customer Support] — 2026-08-05

### New module: Enterprise Helpdesk (customer support desk)
*   `packages/shared/src/helpdesk.ts` — Zod contracts + types for tickets,
    comments and rollup (prefixed `Hd`); SLA target hours per priority;
    open-status set; validated lifecycle transitions.
*   `apps/api/src/helpdesk/helpdesk.service.ts` — org-scoped Redis-backed
    tickets with **monotonic human numbers** (`HD-1001` from `hd:seq:<org>`),
    an honest lifecycle (`new → open → pending → resolved → closed`; stamps
    `resolvedAt`/`closedAt` only on real transitions; validated + idempotent),
    **deterministic SLA tracking** (`slaDueAt` computed from priority target
    hours; compliance measured on resolved tickets against their stored due
    date), a comment timeline with internal staff notes, assignment, and a
    rollup computed per read (SLA compliance %, avg resolution hours from
    real timestamps, by-priority/by-assignee, overdue).
*   **CRM integration:** a ticket linking a contact/company writes a real
    Session 90 CRM `note` activity (best-effort).
*   Routes: `apps/api/src/http/routes/helpdesk.ts` mounted at
    `/api/v1/helpdesk` (11 endpoints). Session 89 catalog gains the
    `hd:ticket` / `hd:comment` namespaces as `org_scoped`.
*   Web: `apps/web/src/lib/helpdesk.ts` client + `pages/helpdesk/
    HelpdeskPage.tsx` (stats, filterable ticket queue with SLA/overdue
    badges, advance-transition buttons, comment timeline with internal
    flag, new-ticket form), `/app/helpdesk` route + sidebar entry.
*   Tests: `apps/api/src/helpdesk/helpdesk.test.ts` (13) — CRUD + monotonic
    numbers, SLA computation, lifecycle, comments/assignment, CRM activity,
    rollup determinism, cross-tenant isolation, demo-seed idempotency,
    schema contracts.
*   Demo seed (`apps/api/src/helpdesk/bootstrap.ts`) gated behind
    `WINDELS_DEMO_DATA`; production starts with an empty queue.
*   **101 modules** in the inventory (74 COMPLETE).
*   Spec: `docs/SESSION_95_SPECIFICATION.md`.

## [Session 94 — Social Platform] — 2026-08-05

### New module: Social Platform (final named Phase-3 Enterprise Application)
*   `packages/shared/src/socialPlatform.ts` — Zod contracts + types for
    posts, comments, reactions and rollup (prefixed `Sp`); reaction emoji
    allowlist.
*   `apps/api/src/socialPlatform/socialPlatform.service.ts` — org-scoped
    Redis-backed feed: posts with an honest lifecycle (draft → published |
    archived; `publishedAt` stamped only on transition; idempotent
    re-publish), comments, and a real **reactions ledger** from which
    engagement is computed per read (never stored as a counter). Reaction
    toggling is idempotent (same author + post + emoji removes).
*   Deterministic hashtag extraction (`extractHashtags` — pure regex,
    lowercase, deduped, order-preserving) stored at write time and aggregated
    for the top-hashtags rollup.
*   Deleting a post cascades its comments and reactions.
*   Routes: `apps/api/src/http/routes/socialPlatform.ts` mounted at
    `/api/v1/social-platform` (15 endpoints). Session 89 catalog gains the
    `sp:post` / `sp:comment` / `sp:reaction` namespaces as `org_scoped`.
*   Web: `apps/web/src/lib/socialPlatform.ts` client + `pages/socialPlatform/
    SocialPlatformPage.tsx` (compose, feed with hashtag filter, reaction
    buttons, comment thread, top hashtags/authors, post detail),
    `/app/social` route + sidebar entry.
*   Tests: `apps/api/src/socialPlatform/socialPlatform.test.ts` (15) — CRUD,
    hashtag extraction, idempotent reaction toggling, ledger-computed
    engagement, publish lifecycle, rollup determinism, cross-tenant
    isolation, demo-seed idempotency, schema contracts.
*   Demo seed (`apps/api/src/socialPlatform/bootstrap.ts`) gated behind
    `WINDELS_DEMO_DATA`; production starts with an empty feed.
*   **100 modules** in the inventory (73 COMPLETE).
*   Spec: `docs/SESSION_94_SPECIFICATION.md`.

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
