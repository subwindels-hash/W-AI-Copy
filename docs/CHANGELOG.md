# DEPLOYMENT CHANGELOG — WINDELS AI OS

All notable changes, bug fixes, and feature integrations are documented here.

---
---

## [Session 113 — Derivatives & Fixed-Income Desk Completion] — 2026-08-05

### Session 81 completed additively — the maths was real, the product around it did not exist
*   `packages/shared/src/derivatives.ts` — extended in place with the `Deriv*` desk contract (positions, valuations, portfolio exposure, scenario grid, payoff curve, hedge suggestion, parity check, bond holdings and ladder) plus Zod input schemas. The Session 81 types and schemas are untouched and still exported.
*   `apps/api/src/derivatives/derivativesDesk.service.ts` (new) — an organization-scoped Redis book that **re-uses** `tradingIntel/derivatives.ts` for every number it reports, so the desk and the Session 81 calculators can never disagree. Nothing in the Session 81 pricer was rewritten.
*   **The module finally stores something.** Four stateless endpoints became a book: option positions and bond holdings under `deriv:pos:*` / `deriv:bond:*`, org-addressed keys with a fail-closed re-check of the decoded record's `organizationId`, and CSPRNG ids.
*   **No market data is fetched, and the payload says so.** Every spot, volatility and yield is `markSource: "operator_entered"` with the timestamp it was entered; a mark older than 24h is reported `stale` and is never refreshed behind the operator's back. `GET /derivatives/desk` declares `marketDataSource: "none_operator_entered_only"`.
*   **Un-priceable is not zero.** A position without a mark or without a volatility is excluded from every aggregate and listed in `unpriceable[]` with the reason in prose; a book with nothing priced reports `deltaNotional: null`, and the hedge endpoint answers "this is not a flat book — it is an unmeasured one" rather than `0`.
*   **Unknown P&L stays null.** A position with no recorded entry premium contributes nothing to unrealized P&L and is counted in `positionsMissingPremium` instead of being treated as a free option.
*   **Cross-underlying sums are labelled.** Raw delta and gamma are summed only within one underlying; the portfolio total is delta *notional*, which is currency-denominated and additive, and `DERIV_AGGREGATION_NOTE` ships with every response. Positions on one symbol carrying different marks set `markSpotConflict` instead of the desk picking one.
*   **Scenario grids are a full reprice**, not a delta/gamma Taylor expansion — `method: "full_reprice"` — and every cell reports `pricedPositions`, which drops where a shock pushes a volatility to zero rather than clamping it to a floor.
*   **Payoff extremes are labelled in-range.** `maxProfitInRange` / `maxLossInRange` are named for what they are, `unboundedAbove` / `unboundedBelow` flag strategies whose payoff keeps moving past the sampled boundary, and breakevens are declared linearly interpolated between samples.
*   **The bond ladder refuses to guess a yield.** A holding needs a yield or a price (`400` otherwise, including on an update that would clear both); weighted duration/convexity/yield are `null` — not `0` — when nothing can be valued; shifted-yield figures are a full reprice compared against the model's own base valuation.
*   Routes: `/api/v1/derivatives` grew from 4 to 21 endpoints. The Session 113 sub-router is mounted **ahead of** the Session 81 calculators and attaches `authenticate` per handler rather than with `router.use`, so `/derivatives/option-greeks`, `/derivatives/implied-vol`, `/derivatives/option-payoff` and `/fixed-income/bond-analytics` keep their paths *and* their unauthenticated behaviour. Mutations require an administrator.
*   Session 89 now audits `deriv:pos` and `deriv:bond` as org-scoped namespaces.
*   Web: typed `deskApi` client (re-exporting the Session 81 `derivativesApi`) and a dedicated `/app/derivatives` desk with five tabs — position book, exposure, scenarios, fixed income, tools. The provenance banner renders the API's own disclaimer rather than a hardcoded copy, `null` figures render "not measured", unpriceable positions render the API's reason, and stale marks are badged. The Session 81 calculator tab inside Trading Intelligence is untouched.
*   Tests: `derivativesDesk.test.ts` (27) — the desk's valuation is asserted to *equal* `blackScholes()` at the same inputs (short negated, contracts × multiplier scaled), long/short pairs net to zero, scenario cells match the pricer at the shocked inputs exactly, a long call breaks even at exactly 105 with a capped loss, a straddle reports two breakevens, a par bond prices at par, a −100bp shift gains more than a +100bp shift loses, empty ladders report `null`, repeated reads are byte-identical, and a kernel dispatch failure does not fail the write. Plus `tests/e2e/derivatives.spec.ts` (7 Playwright cases), including one that pins the Session 81 endpoints still answering.
*   Inventory: `derivatives` PARTIAL → COMPLETE (routes 4 → 21, service SLOC 226 → 2468, shared contract 136 → 645 LOC, web client present); repository totals 93 COMPLETE / 10 PARTIAL / 2 STUB-by-design / 1 DEMO DATA across 106 modules.
*   Runtime validation against live PostgreSQL 17/Redis 8 remains pending; Session 113 is recorded 🟡 VERIFIED (partial).

## [Session 112 — Conversations / Messaging Completion] — 2026-08-05

### Sessions 2–4 completed additively — the thread was done, everything around it was not
*   `packages/shared/src/conversations.ts` (new) — the module had **no shared contract at all**: `apps/web/src/lib/chat.ts` re-declared its own `Conversation`/`ChatMessage` interfaces, so client and API could drift silently. `Conv*` participant, read-state, message, statistics, search, transcript and digest types plus Zod input schemas now sit in one place.
*   `apps/api/src/conversations/conversationOps.service.ts` (new) — operations over the existing Prisma rows, with fail-closed org checks and participant-gated access on every path. Nothing in `conversations.service.ts` / `message.service.ts` was rewritten.
*   **`ConversationParticipant.lastReadAt` is finally written.** The column shipped in Session 2 and no code path ever set it, so an unread count was not computable. `POST /:id/read` writes it (refusing future timestamps) and `GET /:id/read-state` derives from it.
*   **Unread counts state their basis.** Every response carries `basis: "last_read_at" | "never_marked_read"` and `excludesOwnMessages: true` — the caller's own messages are never counted against them, and a never-read thread says so instead of implying a policy.
*   **The roster is no longer frozen at creation.** List/add/remove participants, with membership verification so a thread can never widen someone's tenant access, a `409` on duplicates, and the creator's seat protected from removal.
*   **Unknown usage stays `null`.** `GET /:id/stats` sums only counters that messages actually recorded and reports `messagesMissingUsage`; a thread predating token accounting reports `tokensIn: null`, not a confident `0`. `measuredFrom: "stored_messages"` on every response.
*   **Message bodies are searchable, and the matcher is named.** `GET /conversations/search` is scoped to the caller's accessible threads and labelled `matchKind: "substring_case_insensitive"` with verbatim excerpts at a reported `matchOffset` — not semantic, not ranked, and it does not pretend to be.
*   **Messages can be corrected and withdrawn without destroying history.** Author-only edits of user messages keep an append-only trail (lengths and reasons, never the replaced text); redaction blanks the body while preserving the row, its ordering and its usage counters, recording who/when/why/how-long. Editing model output is a `409`.
*   **Soft delete is finally reversible.** `GET /conversations/deleted` lists a creator's soft-deleted threads and `POST /:id/restore` brings one back; restoring twice is a `409`, restoring someone else's is a `403`.
*   **The digest calls no model.** `GET /:id/digest` quotes the first and last readable bodies and counts terms deterministically, labelled `kind: "extractive_deterministic"`, `aiGenerated: false`, with a verbatim disclaimer. Redacted bodies are skipped and counted.
*   Routes: `/api/v1/conversations` grew from 7 to 22 endpoints. The new router is registered **before** the Session 2 router so `/search`, `/unread` and `/deleted` are not swallowed by its cuid-validated `GET /:id`; each new handler attaches `authenticate` itself.
*   Web: typed `conversationsApi` client importing the shared contract, and a dedicated `/app/conversations` console (roster, read state, measured usage rendered "not recorded" rather than `0`, digest with its disclaimer, labelled search, transcript export where redactions read `[redacted]`, and recovery). `/app/chat` is untouched.
*   Tests: `conversationOps.test.ts` (23) — isolation across organizations and against same-org non-participants, read-state basis and own-message exclusion, truncation honesty, `null` vs summed usage, verbatim search excerpts and offsets, edit/redact permissions and trails, markdown transcript redaction, deterministic non-AI digest, and the soft-delete round trip. Plus `tests/e2e/conversations.spec.ts` (6 Playwright cases).
*   Inventory: `conversations` PARTIAL → COMPLETE (routes 7 → 22, service SLOC 621 → 2794, shared contract present); repository totals 92 COMPLETE / 11 PARTIAL / 2 STUB-by-design / 1 DEMO DATA across 106 modules.
*   Runtime validation against live PostgreSQL 17/Redis 8 remains pending; Session 112 is recorded 🟡 VERIFIED (partial).

## [Session 111 — Global Command Center Completion] — 2026-08-06

### Command-centre operations register completed
*   `packages/shared/src/command.ts` — `Cmd` incident, region, briefing, initiative, directive and operations-rollup contracts with Zod validation (Session 70 `GlobalCommandDashboard` types kept intact and additively widened).
*   `apps/api/src/command/operations.service.ts` — org-scoped incident/region/briefing/initiative/directive records with fail-closed reads, CSPRNG ids, an idempotent in-place migration of Session 70 `tenantStore` directive envelopes and a deterministic operations rollup (empty organizations report zeros and `null`, never plausible numbers).
*   **MTTR is now measured, not asserted.** Session 70 returned a hardcoded `mttrMinutes: 0`; incidents are declared `open`, acknowledged and resolved by named humans with a mandatory note, and `meanTimeToResolveMinutes` is the mean of the stored `openedAt`/`resolvedAt` deltas — `null` with `mttrKind: "none"` when nothing has been resolved.
*   **Unknown is a first-class state.** A region stays `unreported` with `servicesUp`/`latencyMs`/`activeUsers` `null` until an operator files a status report; the platform probes nothing, and every region carries the `healthBasis` sentence naming the rule that produced its health.
*   Honest labelling: initiative progress is stamped `progressKind: "self_reported"`, AI-assisted briefings are stored and counted separately as advisory (and prefixed `[AI-assisted — advisory]` in the legacy array), and `globalRevenueMtd`/`humanOverrides24h` stay `0` rather than being fabricated.
*   The Session 70 dashboard's four permanently-empty arrays (`regions`, `incidents`, `briefings`, `strategicInitiatives`) are now filled from the register.
*   Routes: `/api/v1/command` grew from 4 to 29 endpoints (operations rollup, incident command with a human timeline, region registry + status reports, briefings, initiatives, directives) with shared validation and admin-guarded mutations; `/dashboard/rollup` keeps its Session 70 shape and adds `directives` + `operations`.
*   Session 89 now audits `cmd:meta`, `cmd:incident`, `cmd:region`, `cmd:briefing`, `cmd:initiative` and `cmd:dir` as org-scoped namespaces.
*   Web: full typed client (`commandApi`, with `gccApi` kept as a Session 70 alias), dedicated `/app/command` console and sidebar entry. Three display bugs fixed in the existing PlatformPage tab: active users and AI requests were divided by 1000 and suffixed "K" (so every real count under a thousand read as `0K`), MTTR rendered a hardcoded `0m` as a measurement, and unreported regional latency/user counts were printed as numbers.
*   Tests: `operations.test.ts` (17) — incident lifecycle, human-only resolution, measured MTTR maths, region health derivation, impossible status reports, deletion guards, AI-briefing labelling, self-reported progress, directive transitions, idempotent legacy migration, cross-tenant isolation, planted-record invisibility, repeated-read determinism, the Session 70 dashboard projection and write-only kernel events.
*   Runtime validation against live PostgreSQL 17/Redis 8 remains pending; Session 111 is recorded 🟡 VERIFIED (partial).

## [Session 110 — Cognitive / World Model Completion] — 2026-08-06

### World-model evidence register completed
*   `packages/shared/src/cognitive.ts` — `Cog` entity, observation, hypothesis, domain-coverage and rollup contracts with Zod validation (Session 69 `CognitiveDashboard` types kept intact).
*   `apps/api/src/cognitive/worldModel.service.ts` — org-scoped entity/observation/hypothesis records with fail-closed reads, CSPRNG ids, an idempotent in-place migration of Session 69 `tenantStore` observation envelopes, evidence pruning on delete and a deterministic coverage/blind-spot rollup (empty organizations report zeros and `null`, never plausible numbers).
*   Honest labelling: recorded confidence is stamped `self_reported`, AI-assisted observations are stored and counted separately as advisory, and hypotheses can only be resolved by a named human with a written note.
*   Routes: `/api/v1/cognitive` grew from 4 to 16 endpoints (world-model rollup, entity/observation/hypothesis CRUD, human resolution) with shared validation and admin-guarded mutations; `/dashboard/rollup` keeps its Session 69 shape and adds `worldModel`.
*   Session 89 now audits `cog:meta`, `cog:entity`, `cog:obs` and `cog:hypothesis` as org-scoped namespaces.
*   Web: full typed client, dedicated `/app/cognitive` console (coverage grid, blind spots, advisory badges, human resolution) and sidebar entry. Two display bugs fixed in the existing PlatformPage tab: the AI success rate was multiplied by 100 twice, and memory entries were divided by 1e6 and suffixed "M".
*   Tests: `worldModel.test.ts` (15) — CRUD, rollup maths, repeated-read determinism, empty-organization honesty, cross-tenant isolation, planted-record invisibility, AI labelling, human-only resolution, evidence pruning, idempotent migration and Zod contracts.
*   Runtime validation against live PostgreSQL 17/Redis 8 remains pending; Session 110 is recorded 🟡 VERIFIED (partial).

## [Session 109 — Canvas Collaboration Completion] — 2026-08-05

### Canvas presence/cursors completed with tenant-safe state
*   `packages/shared/src/canvasCollab.ts` — `Cc` presence, cursor, canvas ID and validation contracts.
*   Canvas Collaboration now uses org-scoped presence/cursor records and channels, verifies Canvas access at the route boundary, and migrates legacy slots safely.
*   Added canonical `canvasCollab` service/client/page entrypoints; `/app/canvas` now sends real heartbeats, leave events and displays current collaborators.
*   Session 89 audits `canvas:presence` and `canvas:cursor` namespaces.
*   Existing collaboration suite expanded to 20 tests, including org-key isolation; runtime Redis/multi-browser validation remains pending.

## [Session 108 — Camera Feed Registry & Alert Console Completion] — 2026-08-05

### Camera registry and alert boundary completed
*   `packages/shared/src/camera.ts` — `Cam` feed, alert, stream-session and Zod contracts.
*   `apps/api/src/camera/camera.service.ts` — org-scoped feed/alert item/index records, legacy feed migration, feed update/delete, alert ownership checks, full stream handoff honesty and admin-compatible lifecycle.
*   Routes: corrected mounted `/api/v1/camera/feeds` paths; added feed PATCH/DELETE, alert POST and shared validation. Session 89 camera feed/alert namespaces are org-audited.
*   Web: typed feed/alert client, dedicated `/app/camera` console, status and alert controls, external-gateway availability labeling and non-admin read-only state.
*   Tests: `camera.test.ts` (9) — scoped feed CRUD, status, alert isolation, stream availability, deletion cascade, legacy migration and contracts.
*   Runtime validation against live Redis/camera gateway/CV infrastructure remains pending; Session 108 is recorded 🟡 VERIFIED (partial).

## [Session 107 — Billing & Subscriptions Completion] — 2026-08-05

### Billing lifecycle completed as a real audited subscription/invoice slice
*   `packages/shared/src/billing.ts` — shared plan, subscription, invoice, overview, insights and update/payment schemas with collision-safe barrel aliases.
*   Billing service/routes now consume shared contracts; dedicated overview includes invoice lines and receivables, admin mark-paid/void actions remain audited, and provider webhooks remain idempotent.
*   Web: typed billing client expanded with invoice actions and dedicated `/app/billing` subscription/invoice console; existing Settings/Analytics consumers remain compatible.
*   Tests: `billing.integration.test.ts` (11) covers subscription creation, paid-plan invoices, idempotent updates, tenant scope, payment/void transitions, webhook idempotency, unknown invoices, dunning and shared contracts; existing plan/schema tests remain green.
*   Runtime validation against live PostgreSQL/Redis/payment provider remains pending; Session 107 is recorded 🟡 VERIFIED (partial).

## [Session 106 — Autonomous Organization Approval Register Completion] — 2026-08-05

### Approval-first autonomous organization completed
*   `packages/shared/src/autonomous.ts` — `Aut` proposal, resolution, list/filter and dashboard honesty contracts.
*   `apps/api/src/autonomous/autonomous.service.ts` — individual org-scoped decision records, safe legacy migration, human resolution, pending deletion, deterministic department/guardrail rollups and honest empty/approved-estimate states.
*   Routes: `/api/v1/autonomous` now supports decision list/detail/propose/resolve/delete with admin-protected mutations; Session 89 audits `aut:meta` and `aut:decision` namespaces.
*   Web: typed approval client, dedicated `/app/autonomous` console, admin proposal/approve/reject controls and read-only non-admin state. Existing PlatformPage tab remains compatible.
*   Tests: `autonomous.test.ts` (10) plus existing rollup coverage — isolation, filters, human decisions, migration, blocked pending state, determinism and contracts.
*   Runtime validation against live Redis remains pending; Session 106 is recorded 🟡 VERIFIED (partial).

## [Session 105 — Message Attachments Completion] — 2026-08-05

### Attachment metadata and mobile parity completed
*   `packages/shared/src/attachments.ts` — `Att` normalized metadata, list/pagination, ID and upload-target contracts.
*   `apps/api/src/attachments/attachments.service.ts` — normalized `sha256`/`previewText` responses, full-checksum storage keys with collision verification, metadata detail endpoint support and existing org/uploader protections.
*   Routes: `/api/v1/attachments` now has normalized list/upload/meta/byte/delete paths with shared validation.
*   Web/mobile: added exact attachment compatibility client/page entrypoints, `/app/attachments` navigation, and fixed `/m/files` to perform real multipart uploads.
*   Tests: `attachments.test.ts` now has 10 passing cases covering limits, MIME/checksum, previews, pagination, bytes, target organization, cross-tenant access, deletion and claim ownership.
*   Runtime validation against live PostgreSQL and the file volume remains pending; Session 105 is recorded 🟡 VERIFIED (partial).

## [Session 104 — API Key Management Completion] — 2026-08-05

### API keys completed as a secure shared vertical slice
*   `packages/shared/src/apiKeys.ts` — `Ak` scope, list, one-time-create, mutation, query and ID contracts with Zod validation.
*   `apps/api/src/publicApi/publicApi.service.ts` — scoped API-key detail/update lifecycle, irreversible revocation, SHA-256/CSPRNG handling and real audit-log records for create/update/revoke.
*   Routes: `/api/v1/apikeys` now supports list/detail/create/update/revoke; existing `/developers/api-keys` compatibility paths remain intact.
*   Web: typed `apiKeysApi`, dedicated `/app/api-keys` page with scope/expiry creation, one-time secret copy, prefix-only listing, rename, revoke and revoked-key visibility.
*   Tests: `publicApi.test.ts` now has 10 passing cases covering plaintext/hash behavior, verification, expiry/revocation, detail, update/audit, cross-tenant isolation and contracts.
*   Runtime validation against live PostgreSQL remains pending; Session 104 is recorded 🟡 VERIFIED (partial).

## [Session 103 — AI Economy & GPU Capacity Ledger Completion] — 2026-08-05

### AI Economy completed as an honest org-scoped capacity ledger
*   `packages/shared/src/aiEconomy.ts` — expanded shared contracts and Zod schemas for usage observations, GPU allocations, compute offers and dashboard projection labeling.
*   `apps/api/src/aiEconomy/aiEconomy.service.ts` — individual CSPRNG-keyed org-scoped Redis records for usage, allocations and offers; deterministic spend/department/capacity rollups; safe migration from legacy organization blobs; revenue/marketplace zeros remain honest until real ledgers exist.
*   Routes: `/api/v1/ai-economy` now supports usage, allocation and compute-offer list/create/update/delete paths with admin-protected writes. Session 89 catalogs `eco:meta`, `eco:usage`, `eco:allocation` and `eco:offer` as org-scoped.
*   Web: typed `ecoApi`, dedicated `/app/ai-economy` page, sidebar entry, administrator forms and read-only non-admin view. Existing PlatformPage AI Economy tab remains compatible.
*   Tests: `apps/api/src/aiEconomy/aiEconomy.test.ts` (12) plus the existing usage rollup suite — ledger isolation, offer/allocation CRUD, migration, dashboard math, deterministic values, honesty guards and contracts.
*   Runtime validation against live PostgreSQL 17 + Redis remains pending; Session 103 is recorded 🟡 VERIFIED (partial).

## [Session 102 — AI Workforce / Agent Framework Completion] — 2026-08-05

### Agent Framework completed as a shared, scoped vertical slice
*   `packages/shared/src/agents.ts` — `Ag` agent, event, memory, knowledge, skill, model, pagination, lifecycle and Zod request contracts.
*   Agent CRUD, event, skill, memory and knowledge paths now consume shared contracts through backwards-compatible schema aliases; the typed client consumes the same shared records.
*   Lifecycle Redis state/history now use organization-scoped keys (`agent:lifecycle:<org>:<id>` and `agent:lifecycle:history:<org>:<id>`), with safe legacy migration and Session 89 catalog registration.
*   `/m/agents` now consumes the real paginated API, derives online/assigned-task counts from real records and routes creation to the Workforce Hub instead of showing placeholder counts/no-op controls. Workforce Hub CRUD remains intact.
*   Tests: `apps/api/src/agents/agents.test.ts` now has 10 tests covering CRUD, org isolation, status/query/pagination filtering, model validation, built-in protection, event access and contracts.
*   Runtime validation against live PostgreSQL 17 + Redis remains pending; Session 102 is recorded 🟡 VERIFIED (partial).

## [Session 101 — Admin Console Completion] — 2026-08-05

### Admin Utilities completed as a real vertical slice
*   `packages/shared/src/admin.ts` — `Adm` stats, user-directory, pagination, role/status filter and mutation contracts with shared Zod validation.
*   `apps/api/src/services/admin.service.ts` — organization-scoped directory/detail reads, super-admin platform scope, search/filter/pagination support, audited suspension/reactivation and role changes with self/super-admin protection.
*   Routes: existing `/api/v1/admin` endpoints remain compatible; added `GET /users/:id` and optional role/status filters. All authorization remains server-side through RBAC and Membership checks.
*   Web: typed `adminApi`, dedicated `/admin` Admin Console with live stats, search, filters, pagination, suspend/reactivate controls, super-admin role controls, loading/error/empty states and honest audit messaging. Added Admin Console sidebar entry.
*   Tests: `apps/api/src/services/admin.test.ts` (8) — scoped/platform stats, directory pagination/filtering, cross-tenant isolation, user detail, mutation guards, audit rows and Zod contracts.
*   FakePrisma now mirrors Prisma's reverse one-to-one `User.profile` shape for reliable service tests.
*   Runtime validation against live PostgreSQL 17 + Redis remains pending; Session 101 is recorded 🟡 VERIFIED (partial).

## [Session 100 — Enterprise FinOps Depth] — 2026-08-06

### Org-scoped budgets, cost allocation and chargebacks
*   `packages/shared/src/enterpriseFinOps.ts` — `Efo` records and Zod contracts for cost centers, period budgets, integer minor-unit actual costs, allocation ledger rows, computed chargebacks and rollups.
*   `apps/api/src/enterpriseFinOps/enterpriseFinOps.service.ts` — fail-closed Redis-backed `efo:*` CRUD; CSPRNG identifiers; currency/period/conservation validation; direct, shared, usage and proportional allocations; live budget utilization, variance, method totals and unallocated spend computed per read. The historical global Session 31 FinOps service is unchanged.
*   Routes: `apps/api/src/http/routes/enterpriseFinOps.ts` mounted at `/api/v1/finops` with cost-center, budget, cost, allocation and computed chargeback endpoints. Session 89 catalog now audits `efo:center`, `efo:budget`, `efo:cost` and `efo:allocation` as `org_scoped`.
*   Web: typed `enterpriseFinOpsApi`, `/app/finops` page and unique Wallet Cards sidebar entry. The UI labels minor units honestly and distinguishes actual costs, allocation rows and computed chargeback statements.
*   Tests: `enterpriseFinOps.test.ts` (13) — CRUD, duplicate/currency/period validation, direct and shared allocation conservation, chargeback math and date filtering, deterministic rollup, cross-tenant isolation, cascade deletion, gated seed idempotency and Zod contracts.
*   Demo seed (`org-demo-efo`) is opt-in only via `WINDELS_DEMO_DATA=true`; fresh organizations remain empty.
*   Runtime validation against live PostgreSQL 17 + Redis remains pending in this sandbox; Session 100 is recorded 🟡 VERIFIED (partial).

## [Session 99 — Software Factory: Five Studios & Build Farm] — 2026-08-05

### Completes AI_APPLICATION_BUILDER_SPECIFICATION.md V3.0 §3–§4
*   `packages/shared/src/softwareFactory.ts` — `Sf` types + Zod contracts;
    the **five enterprise studios** (spec §3) as a real static catalog with
    their defined deliverables; the **build farm target map** (spec §4) —
    targetType → declared compilation targets (WEB bundle; DESKTOP .exe/
    .msix/.app/.dmg/.deb/.rpm/.AppImage; MOBILE .apk/.aab/.ipa; API/
    MICROSERVICE docker image; BROWSER_EXTENSION .crx; CLI binaries).
*   `apps/api/src/softwareFactory/softwareFactory.service.ts` — org-scoped
    **studio plans** (project-linked, deliverables validated against the
    studio catalog, honest lifecycle `planned → in_progress → completed`
    with `completedAt` stamped only on the transition); **project studio
    coverage** computed per read; and **per-run compile targets** as a pure
    projection of the run's real state — deterministic file names, real
    node:crypto SHA-256 manifests, status derived (pending → compiling →
    built | failed), and `binaryEmitted` always honestly `false` with a
    `requiresToolchain` note (real binaries require the external build farm).
*   Routes: `apps/api/src/http/routes/softwareFactory.ts` mounted on the
    existing `/api/v1/builder` prefix (8 new endpoints: `/studios`,
    `/studios/plans*`, `/projects/:id/studios`, `/builds/:id/targets`).
    Session 89 catalog gains the `sf:plan` namespace as `org_scoped`.
*   Web: `apps/web/src/lib/softwareFactory.ts` client + `pages/softwareFactory/
    StudiosPage.tsx` (five-studio grid, project selection, studio coverage
    board, plans with Start/Complete/Reopen, build-run targets with real
    SHA-256 + honest "binary not emitted" notes), `/app/software-factory`
    route + sidebar entry.
*   Tests: `apps/api/src/softwareFactory/softwareFactory.test.ts` (13) —
    catalog, plan lifecycle + deliverable validation, coverage math,
    compile-target derivation (pending/compiling/built/failed from real run
    state + SHA-256 verification), rollup determinism, cross-tenant
    isolation, demo-seed idempotency, schema contracts.
*   Demo seed (`apps/api/src/softwareFactory/bootstrap.ts`) gated behind
    `WINDELS_DEMO_DATA`.
*   **105 modules** in the inventory (78 COMPLETE).
*   Spec: `docs/SESSION_99_SPECIFICATION.md`.

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
