# DEPLOYMENT CHANGELOG — WINDELS AI OS

All notable changes, bug fixes, and feature integrations are documented here.

---
---

## [Session 127 — Quantum Computing (`quantum`) Honest Gating & 100% Module Completion] — 2026-08-06

### All 108 modules in WINDELS AI OS are now COMPLETE (100% COMPLETE / 0 PARTIAL / 0 STUB / 0 DEMO DATA)
*   **`quantum` (Quantum Readiness Framework):** De-faked and gated demo data seeding (`ensureBootstrapped()`) and connector reading (`connectors()`) in `apps/api/src/quantum/quantum.service.ts` behind `demoDataEnabled()` (`WINDELS_DEMO_DATA=true`). When unset, `/quantum/dashboard/rollup`, `/quantum/inventory`, and `/quantum/connectors` report honest empty or unconfigured static state without auto-generating synthetic records.
*   **100% Module Completion Milestone:** With zero remaining ungated synthetic RNG in read paths, `node audit/build-inventory.mjs` promotes `quantum` from DEMO DATA to **COMPLETE**. Total inventory is now **108 COMPLETE / 0 PARTIAL / 0 STUB / 0 DEMO DATA (100% COMPLETE)** out of 108 total modules. Every single module in WINDELS AI OS is implemented, typed (`@windels/shared`), integrated (`@windels/web`), tested, and free of ungated demo randomness.
*   **Standing Gate Audit (Sessions 1–127):** Documented standing runtime-validation track status across all 127 sessions (`docs/SESSION_127_SPECIFICATION.md` and `docs/SESSION_127_RUNTIME_VALIDATION_CHECKLIST.md`). All sessions are recorded as 🟡 VERIFIED (partial) in-sandbox pending target deployment environment execution against live PostgreSQL 17 and Redis 8.

---
---

## [Session 126 — Real-Time SSE Channel (Events) & Inbound Webhook Receiver Completion] — 2026-08-06

### Both STUB-by-design modules (`events` and `webhook`) completed additively — 107 COMPLETE / 0 PARTIAL / 0 STUB-by-design / 1 DEMO DATA
*   **`events` (Real-Time SSE Channel):** Additive completion of the SSE real-time channel (`/api/v1/events/stream` and `/api/v1/events/health` untouched). Replaced fail-open org scope matching with strict fail-closed matching so clients without an org never receive cross-tenant events. Implemented an organization-scoped historical ring buffer (`evt:hist:idx:<org>` + `evt:hist:i:<org>:<id>`, capped at 200 events) with automatic `Last-Event-ID` / `?since=` replay upon connection. Added `GET /events/history`, `GET /events/clients`, `POST /events/publish`, and `DELETE /events/clients/:id` (routes 2 → 6). Added `packages/shared/src/events.ts` (185 LOC) and new `/app/events` console page.
*   **`webhook` (Inbound Webhook Receiver):** Additive completion of the inbound webhook receiver (`POST /api/v1/webhook/billing/webhook` untouched). Replaced string equality (`===`) in secret verification with constant-time `crypto.timingSafeEqual` and removed fallback to `JWT_SECRET`. Every inbound billing webhook is now recorded in an organization-scoped inbox (`whk:inbox:idx:<org>` + `whk:inbox:i:<org>:<id>`, capped at 500 records) and emitted via `EventBus` (`webhook.inbound_received`). Added general multi-source receiver (`POST /webhook/inbound/:source` supporting github, stripe, etl, custom), inbox query (`GET /webhook/inbound`), payload inspection (`GET /webhook/inbound/:id`), replay (`POST /webhook/inbound/:id/replay`), and delete correction path (`DELETE /webhook/inbound/:id`) (routes 1 → 6). Added `packages/shared/src/webhook.ts` (210 LOC) and new `/app/webhook` console page.
*   **Tenant isolation:** Catalogued `evt:hist` and `whk:inbox` as `org_scoped` in `TI_NAMESPACE_CATALOG`. Bare root entries (`evt`, `whk`) are deliberately omitted to preserve the org-segment index rule.
*   **Tests & verification:** Added `events.test.ts` (6 unit tests) + `webhookReceiver.test.ts` (7 unit tests) and `tests/e2e/events-webhook.spec.ts` (11 Playwright e2e cases).
*   **Inventory:** Both `events` and `webhook` advance from **STUB** to **COMPLETE** (`routeCount >= 5`, shared contracts, services, web clients, console pages, tests, no synthetic flags). Total inventory is now **107 COMPLETE / 0 PARTIAL / 0 STUB-by-design / 1 DEMO DATA** (`quantum`) across 108 modules. Runtime validation remains pending; Session 126 is recorded 🟡 VERIFIED (partial).

---
---

## [Session 125 — Super Admin Biography, Identity Memory & AI Knowledge System] — 2026-08-06

### WINDELS AI OS becomes an intelligent digital representative — governed, traceable, Super-Admin-owned
*   `packages/shared/src/identityKnowledge.ts` (new, 239 LOC) — the capability's contract: 37 record kinds (personal/professional/executive/founder/public/official biographies, founder & leadership profiles, brand story, mission/vision/values, career, education, awards, publications, interviews, press releases, announcements, contact/websites/social, FAQs, statements, company/organization profiles, products, services, projects, industries, documents), classifications (`private | organization | public`), the lifecycle (`draft → pending_approval → approved → published | archived`), versions, grants, the answer type with labelled sections + `sources[]` traceability, 8 knowledge agents, graph/dashboard/activity and Zod for every body.
*   **Only the Super Admin is the authority.** Every mutating route carries `requireSuperAdmin` AND the service re-checks `superAdminOnly` — create/edit/approve/publish/archive/delete/grant/import/export/sync all answer **403** for any other user, even an org admin. `verified` can only be set by a Super Admin publish; editing a published record returns it to `pending_approval` and clears verification until re-approved.
*   **AI response engine** (`POST /ask`) — answers only from records the caller may see with status `approved`/`published` (approval gates AI usage; publish = verified = highest confidence). Labelled sections: Verified Facts · Super Admin Approved · Organization Information · AI-Generated Summary (explicitly labelled) · Unknown. Every answer returns its `sources[]` (record, kind, classification, verified, usedIn) for full auditability, and says "I do not have sufficient approved knowledge" rather than fabricating. Private records are included only for Super Admin/granted viewers.
*   **Continuous Memory Synchronization** — every publish (and `POST /sync`) writes the record into the Enterprise Memory Fabric via `MemoryEvolutionService.add` (the fabric content-deduplicates, so re-syncs never duplicate) and dispatches `identity-knowledge.*` events through the Kernel (God-Node). Every mutation is audit-logged into the existing Prisma `AuditLog` table.
*   **Enterprise Search integration** — new `knowledge` entity type: the unified search indexes published records the caller may see (private records are never indexed); the search service threads the viewer through `scanType`/`search`.
*   **Knowledge agents** (AI Workforce) — 8 deterministic roles (biography, organization knowledge, company profile, verification, curator, synchronization [super-admin-gated], memory manager, public information), each run audit-logged and kernel-dispatched, labelled `aiGenerated: false`.
*   **Knowledge graph** — Super Admin-defined relations between records, exposed permission-aware via `GET /graph`.
*   **Documents** — `POST /documents` reuses the attachments infrastructure (multipart, 25 MB, sha256) and records document metadata as a governed record; bulk import/export included.
*   Storage: `ik:*` org-scoped keys (records, versions, grants, activity) catalogued in the Session 89 sweep; IAM via role + `hasPermission(ORG_ADMIN)` + per-record grants.
*   Web: `apps/web/src/lib/identityKnowledge.ts` + the `/app/identity-knowledge` console — Super Admin sees the Biography Manager (records + versions, Approval Center, Document Upload, Knowledge Graph, Activity) and everyone sees the Library and AI Knowledge Insights (ask with source traceability, agent runs, bulk import/export).
*   Tests: `identityKnowledge/identityKnowledge.test.ts` (22) + `tests/e2e/identityKnowledge.spec.ts` (5). Full suite **1775 passing, 51 skipped, 0 failures** (119 → 120 files).
*   **Inventory: new module `identityKnowledge` COMPLETE — 108 modules, 105 COMPLETE / 0 PARTIAL / 2 STUB-by-design / 1 DEMO DATA.** Runtime validation remains pending; Session 125 is recorded 🟡 VERIFIED (partial).

## [Session 124 — AI Software Engineering Workforce] — 2026-08-06

### An autonomous engineering department, not a coding agent
*   `packages/shared/src/aiEngineering.ts` (new, 342 LOC) — the department's contract: the 19-role catalog (18 specialists + orchestrator), GitHub connections (token-in-store / masked-on-read), the multi-repo workspace, tasks with the pipeline statuses, GitHub entities (PRs/issues/milestones/releases/workflow runs/checks), repository-intelligence nodes (21 kinds, `observed` vs `heuristic` basis + confidence), engineering memory entries (source-labelled) and the command-center rollup. Zod schemas for every write body.
*   **Workforce** (`workforce.service.ts`) — org-scoped repositories with per-repo AI teams (`role → engineer`), and the **orchestrator pipeline**: `queued → planning → implementing → testing → reviewing → fixing (bounded loop) → pr_ready → pr_open → done | failed`. Every step records `mode: advisory|executed` and whether an AI provider produced it; tests execute for real only when the repo has a `localPath` and `execute: true` is requested; a failed pipeline records a `lesson` into memory (`source: "task"`); a PR is only marked `pr_open` when the GitHub client actually opened one.
*   **GitHub engineering module** (`github.service.ts`) — the real REST API over injectable `fetch`: connections verified at connect time (`/user`, `/user/orgs`), multiple accounts per org, repos list/create/structure-read, branches, commits (blobs→tree→commit→refs), pull requests (open/list/merge/review/close), issues, milestones, releases + GitHub's own generate-notes, workflow_dispatch, runs and check-runs. Tokens are stored only in the org-scoped store and every read returns `tokenMasked`; a missing connection is an explicit "no GitHub connection" error, never a fabricated remote result.
*   **Repository intelligence** (`repoIntel.service.ts`) — a real scanner over a local checkout producing a persisted knowledge graph: observed nodes (structure, dependencies + framework detection, Prisma models, routes, services, models, components, auth, docs, CI, Dockerfiles, K8s, tests, TODOs) and labelled heuristic nodes (duplicate 6-line blocks, possibly-dead exports, secret literals, eval, oversized files, sync fs). Re-scans replace the graph; ignore lists respected; empty directories are reported honestly.
*   **Engineering memory** (`memory.service.ts`) — org/repo-scoped entries (decision/standard/pattern/instruction/lesson/bugfix), tagged, searchable, source-labelled; the orchestrator records lessons from tasks and never invents entries.
*   **Command center** (`commandCenter.service.ts` + the `/app/ai-engineering` console) — repositories, engineers by role, tasks by status, PRs/issues/builds/releases (GitHub-backed when connected), security/performance flags from intel, memory counts, recent activity — with unmeasured values shown as "not connected"/"unknown", never 0-as-success.
*   Routes: 42 on `/api/v1/ai-engineering`; Session 26's `/api/v1/engineering` observability untouched. `aew` catalogued org-scoped in the Session 89 sweep (org in the segment straight after the prefix).
*   Tests: 4 unit suites (28 tests) — workforce pipeline (incl. real executor injection and fix-loop), GitHub client against a mocked transport (every capability), repo-intel against a real fixture directory, memory. Plus `tests/e2e/aiEngineering.spec.ts` (5 Playwright cases).
*   **Inventory: new module `aiEngineering` COMPLETE — 107 modules, 104 COMPLETE / 0 PARTIAL / 2 STUB-by-design / 1 DEMO DATA.** Repository suite: **1753 passing, 51 skipped, 0 failures** (115 → 119 files).
*   Runtime validation against live PostgreSQL 17/Redis 8 and a reachable GitHub API remains pending; Session 124 is recorded 🟡 VERIFIED (partial).

## [Session 123 — Usage Intelligence Completion] — 2026-08-06

### Deltas were placeholder zeros, empty denominators were zero, and per-module metrics were blank
*   `packages/shared/src/usage.ts` (84 → 168 LOC, widened + appended) — `UsageMetric.value`/`deltaPct` are `number | null`, `trend` is nullable; `UsageByModule.p95LatencyMs`/`errorRate` are `number | null` and `users` is the measured count; `UsageTimeSeriesPoint.latencyMs`/`automationTasks` are `number | null`; `automationRate`/`adoptionPct` are `number | null`. New `UsageLedgerSummary` (with the 100-event `note`), `UsageProvenance` + note, and the event schemas moved from the route file (`UsageEventSchema`, `UsageEventsQuerySchema`).
*   **`deltaPct` returned `0` without a prior baseline** — 0 reads as "no change" — and **the AI metrics' deltas were hardcoded `0`/`"flat"`** because the prior 30-day AI window was never even queried. The prior window (requests, tokens, latency, error rate) is now queried and the deltas are measured; without a baseline they are `null`.
*   **Empty denominators reported 0.** No AI requests → `Avg AI latency: 0` (the *perfectly fast* reading) and `AI error rate: 0` (the *no failures* reading); no workflow runs → `automationRate: 0`; no members → `adoptionPct: 0`. All are now `null`.
*   **Per-module `p95LatencyMs`, `errorRate` and `users` were hardcoded `0`** even though `durationMs`/`status`/`userId` sat on every AiRequest row. A single window fetch now drives the daily series, the by-module breakdown (requests · distinct users · nearest-rank p95 · error rate · share) and the per-model rollup — all measured, `null` where a module has no requests.
*   **The 30-day series never carried tokens** (the field existed but the row fetch never selected token counts — it was always 0) and empty days reported `latencyMs: 0`. Tokens are now real per-day sums; empty days report `latencyMs: null`, `automationTasks: null`.
*   **Routes 3 → 5**: `GET /usage-intel/events/:id` (single event, org-scoped) and `DELETE /usage-intel/events/:id` (admin — the correction path for a mis-recorded event). All five handlers refuse a no-organization session with 403 instead of building a key containing `undefined`; `GET /events` clamps `?limit` to 1–1000; the rollup's `ledger` block gains a `note` stating its counts cover the most recent 100 events.
*   **`usg:evt` catalogued** in the Session 89 sweep as org-scoped (the tenantStore shape, same convention as the CRM/AppBuilder stores).
*   Web: `usageApi` gains `events`/`event`/`recordEvent`/`removeEvent`; new `/app/usage` console (sidebar "Usage") — measured stat cards with "no baseline"/"not recorded", a 30-day request chart, by-module p95/error/users, top models, automation/adoption, structural-zeros card, provenance card, ledger card. The PlatformPage S55 tab was made null-safe. **No `?? 0` in any value position.**
*   Tests: `usage/usage.completion.test.ts` (21) — null-baseline deltas, real prior-window AI deltas in both directions, null empty denominators (latency/error/adoption/automation) + measured values when data exists, per-module p95/error/users, series tokens + null empty days, provenance, org isolation, shared schemas. Plus `tests/e2e/usage.spec.ts` (6 Playwright cases) incl. the event correction path. The rollups empty-org assertions were updated to the honest null shape.
*   **Inventory: `usage` PARTIAL → COMPLETE — the last PARTIAL module. Repository totals: 103 COMPLETE / 0 PARTIAL / 2 STUB-by-design / 1 DEMO DATA across 106 modules.** Repository suite: **1725 passing, 51 skipped, 0 failures** (114 → 115 files).
*   Runtime validation against live PostgreSQL 17/Redis 8 remains pending; Session 123 is recorded 🟡 VERIFIED (partial).

## [Session 122 — Talk Completion] — 2026-08-06

### Unread counts were a lie, members could come from anywhere, and a meeting could be resurrected
*   `packages/shared/src/talk.ts` (new, 340 LOC) — the module's first shared contract: every wire type (`TalkChannel` with `unreadCount: number | null`, `TalkMember`, `TalkMessage`, `TalkReactions`, `TalkAttachment`, `TalkMeetingSummary`/`TalkMeetingDetail`, `TalkActionItem` with `aiGenerated: boolean`, paginated lists) and all ten Zod schemas moved verbatim from the service files (limits extracted as constants). The services re-export the schemas under their old names so every route keeps compiling; input types use `z.input` so defaulted fields stay optional for callers. `TALK_MEETING_TRANSITIONS` lives in the contract.
*   **`unreadCount` was hardcoded `0`** in every channel payload ("computed live when needed" — it never was), and the channel sidebar rendered the *total message count* as the badge. Every channel read as "all caught up" while the badge showed something else. `listChannels`/`getChannel` now compute messages after the caller's `lastReadAt`, excluding the caller's own messages and deleted ones; a caller with **no membership row** gets **`null`** (no read position — never a fabricated 0). The sidebar shows the real unread badge only when > 0.
*   **`createChannel` / DMs / `addChannelMembers` accepted users and agents from ANY organization.** A DM to a peer in another org was created and permanently unusable (every lookup is org-scoped → 404 forever); an org A channel could gain dead member rows from org B. New `assertUsersInOrg`/`assertAgentsInOrg` helpers refuse cross-org references with a 400 naming the ids, before anything is persisted.
*   **The meeting status was an anything-goes setter** — a CANCELLED meeting could be flipped LIVE and an ENDED meeting resurrected, with `startedAt`/`endedAt` stamped accordingly. `updateMeeting` now validates against `TALK_MEETING_TRANSITIONS` (SCHEDULED → LIVE/ENDED/CANCELLED; LIVE → ENDED; ENDED and CANCELLED terminal), re-sending the current status stays idempotent, an invalid transition answers **409** naming the allowed ones, and the check-then-act P2025 race maps to 404 instead of a 500.
*   **AI-extracted action items were indistinguishable from human-typed ones** — the notetaker stored `metadata.aiGenerated` but no serializer surfaced it. Both action-item serializers now emit `aiGenerated: boolean` (additive; absent = false) and the ActionItems sidebar shows an "AI-extracted" badge with a tooltip.
*   Web: `apps/web/src/lib/talk.ts` imports every type from the shared contract (method surface unchanged; old names preserved as aliases so all components compile).
*   Tests: `services/talk.completion.test.ts` (21) — unread arithmetic (own-message exclusion, deleted exclusion, null for non-members, getChannel parity), same-org validation with nothing persisted, lifecycle in both directions + idempotency + P2025→404, aiGenerated surfacing in list and detail, shared-schema parity. Plus `tests/e2e/talk.spec.ts` (5 Playwright cases). The two existing suites pass unchanged.
*   Inventory: `talk` PARTIAL → COMPLETE (routes 23, dedicated shared contract 340 LOC, 3 unit suites + 1 e2e spec, web client + page). Repository totals: **102 COMPLETE / 1 PARTIAL (`usage`) / 2 STUB-by-design / 1 DEMO DATA** across 106 modules. Repository suite: **1706 passing, 51 skipped, 0 failures** (113 → 114 files).
*   Runtime validation against live PostgreSQL 17/Redis 8 remains pending; Session 122 is recorded 🟡 VERIFIED (partial).

## [Session 121 — Sustainability/ESG Completion] — 2026-08-06

### The ledger lost writes, the changes were measured against the wrong windows, and the ESG scores were invented
*   `packages/shared/src/sustainability.ts` (69 → 170 LOC, widened + appended) — `EsgScore` fields and `trend` are `null`-able with a `note`; `EmissionsSource.changePct` and `SustainabilityDashboard.emissionsYtdChangePct` are `number | null`; `GreenAiMetric.gpuHours`/`optimizedPct` are `number | null`; the rollup gains an **optional** `provenance` block; new `EsgRecordRow`, `SustainabilityActivitySchema` (the POST body, moved from the route file), record-id and list schemas.
*   **The whole org ledger was one JSON string** (`esg:<org>:records`) and every record was a read-modify-write — two concurrent `POST /activity` calls **silently lost one of them**. Storage is now one key per record (`esg:<org>:rec:<id>`) behind an append-only newest-first index (`esg:<org>:idx`, LPUSH + LTRIM capped at 10 000); `record()` is a pure write. The Session 64 blob is **adopted once** (marker `esg:<org>:imported`), left in place, and a corrupt blob is tolerated.
*   **`emissionsYtdChangePct` compared year-to-date against the FULL previous calendar year** — on 2026-08-06 that was 8 months vs 12 months, systematically exaggerating reductions. It is now same-period (YTD vs YTD, cut off at the same instant one year ago). **Per-source `changePct` compared ALL-TIME totals against last year** — now same-period too, while the row's `tCO2e` stays all-time so `emissionsBySource` still sums to the rollup total.
*   **`changePct`/`emissionsYtdChangePct` were `0` without a baseline** — 0 reads as "no change". They are now `null` (and `scores.trend` is `null` without a baseline). A signed change is **truncated toward zero** — +12.46 % → 12.4, −12.46 % → −12.4 — so a magnitude is never exaggerated by rounding.
*   **ESG scores were invented.** `environmental = max(10, min(100, round(92 − ytd×2.5)))` with hard-coded `social: 85` / `governance: 88`, presented as "Data-derived ESG Scores" while the comment claimed "never invented ratings". An ESG score requires an attested assessment; none exists, so every score field is `null` with a `note` saying exactly that.
*   **`greenAi[].kwh` mixed scopes** — it summed *every* record's kWh (a 18 000 kWh grid reading inflated the compute row to 18 450 kWh). It now sums compute records only. **Small compute records vanished** — the tCO2e was rounded to 3 decimals *before* the truthiness check, so a sub-0.5 kg record rounded to 0.000 and produced no row; the presence check now uses the unrounded sum. `gpuHours`/`optimizedPct` are `null`, never 0.
*   **No correction path** — added `GET /sustainability/records/:id` (any member) and `DELETE /sustainability/records/:id` (`requireAdmin`). Routes 3 → 5. Every handler refuses a no-organization session with 403 instead of building a key containing `undefined`. The `?limit` clamp on `GET /records` is byte-for-byte the historical one.
*   **`esg` was absent from the Session 89 catalog** — now catalogued org-scoped; the org id sits in the segment straight after the prefix for the legacy blob, the marker, the index and the per-record keys alike.
*   Web: `esgApi` gains `records`/`record`/`recordActivity`/`removeRecord`; new `/app/sustainability` console (sidebar "Sustainability") — measured cards, an ESG-score card printing **"not attested"** with the API's note, by-source list, 12-month energy chart, raw records table with admin-only delete, an admin-only record form that discloses the factor arithmetic, and a provenance card naming every structural zero. **No `?? 0` in any value position.**
*   Tests: `sustainability/sustainability.completion.test.ts` (28) — concurrent writes preserved, once-only adoption (corrupt tolerated, malformed skipped, legacy string kept), same-period windows in both directions, null baselines, truncation-toward-zero, null scores, greenAi compute-only + small-record visibility, provenance, records CRUD, shared Zod. Plus `tests/e2e/sustainability.spec.ts` (7 Playwright cases). Two in-repo assertions that pinned the old behaviour were updated to pin the honest shape (the S64 rollup e2e `scores.overall > 0` and `usage/rollups.test.ts`).
*   Inventory: `sustainability` PARTIAL → COMPLETE (routes 3 → 5, shared contract 170 LOC, 1 unit suite + 2 e2e specs, web client + console). Repository totals: **101 COMPLETE / 2 PARTIAL (`talk`, `usage`) / 2 STUB-by-design / 1 DEMO DATA** across 106 modules. Repository suite: **1684 passing, 51 skipped, 0 failures** (112 → 113 files).
*   Runtime validation against live PostgreSQL 17/Redis 8 remains pending; Session 121 is recorded 🟡 VERIFIED (partial).

## [Session 120 — Public API Gateway Completion] — 2026-08-06

### A cross-tenant hole, a DELETE that lied, and a gateway with no memory
*   `packages/shared/src/publicApi.ts` (new, 178 LOC) — the module's first *dedicated* shared contract (it previously borrowed `apiKeys.ts`): typed views of the whole public surface, the usage-report types, constants and Zod schemas. `apiKeys.ts` gains one appended optional field (`expiresInDays` on update) and `AkApiKeyMutation.expiresAt`.
*   **The public workflow trigger resolved the workflow through the key creator's *membership*, not the key's organization.** `POST /api/rest/v1/workflows/:id/run` passed only the key creator's user id into `runWorkflow`, which looks the workflow up in the actor's membership org — so a key issued to org A whose creator also belonged to org B could **trigger org B's workflows** (read their node graphs, execute them, write `WorkflowRun` rows into org B's tables) while authenticating as org A. `runWorkflow` now accepts an optional explicit `organizationId` (omitted = historical behaviour for all internal callers) and the gateway pins the run to the **verified key's** organization. The lookup, node execution context and run-dispatch events all use the pinned org; the actor's membership is not consulted.
*   **`DELETE /api/v1/apikeys/:id` revoked instead of deleting.** The HTTP DELETE verb silently called `revokeApiKey` — the row stayed, the response was the mutation shape, and there was **no way to permanently remove an API key ever**. Revoked keys accumulated forever. DELETE now hard-deletes (audited `admin.apikey.deleted` with `wasRevoked`/`keyPrefix`); soft revocation remains via `PATCH { revoked: true }`, so no capability is lost.
*   **No renewal path.** `expiresAt` was set at creation and immutable — an expiring key was a countdown to a permanently dead credential. `PATCH` now accepts `expiresInDays` (1–365): the key's life extends from now, the new expiry is reported in the response and audited, and an *expired* (not revoked) key verifies again. Revoked keys stay immutable (409).
*   **No usage accounting.** The gateway recorded nothing about who calls what — the only signal was `lastUsedAt`, a database write on every request. New org-scoped, best-effort Redis ledger written from `apiKeyAuth` after verification: `pub:since:<org>` (NX marker), `pub:req:<org>` (lifetime counts), `pub:day:<org>:<date>` (TTL 92 d), `pub:evt:<org>` (recent calls, capped 200). A Redis outage never fails or slows a request.
*   **`GET /api/rest/v1/usage`** (READ) and the internal **`GET /api/v1/apikeys/usage`** serve the same report: database side = identifiers only (`name`, `keyPrefix`, `revoked`, `lastUsedAt`); ledger side = counts only (`totalCalls`, `callsInWindow`, `callsToday`, `distinctUseDays`, `ledgerCoveredDays`, floored `avgCallsPerDay` that is `null` on zero covered days, `recentCalls` ≤ 50). Days before `ledgerStart` are never zero-call days; a key deleted after its calls keeps its counts with `name: null`/`keyPrefix: null`; a failed ledger read sets `ledgerAvailable: false` — never fabricated zeros.
*   Routes: gateway 6 → 8 (`GET /workflows/:id` detail, `GET /usage`; optional `?limit=1..200` on the three list endpoints, absent = historical behaviour); the six Session 120 predecessor endpoints keep their paths, scopes, status codes and response shapes.
*   Session 89 now audits `pub:since`, `pub:req`, `pub:day` and `pub:evt` as org-scoped (org in the segment straight after the prefix; a bare `pub` entry is deliberately never added — the same prefix-length constraint as `opx:`/`pt:`).
*   Web: `apps/web/src/lib/publicApi.ts` (new client: shared types + internal usage call) and the `/app/public-api` console (sidebar entry "Public API") — null-aware stat cards ("not recorded", never `0`), a keys-and-usage table with deleted keys shown without names, recent calls, a `ledgerAvailable: false` banner, and an endpoint reference labelled as documentation. **No `?? 0` in any value position.**
*   Tests: `publicApi/publicApi.completion.test.ts` (38) — cross-tenant pin in both directions + the second-membership case + membership regression guard, DELETE semantics, renewal, ledger writes (NX/cap/TTL), report honesty (empty shape, window math, deleted-key nulls, isolation, `ledgerAvailable: false`), middleware (Bearer-only, revoked → 401, ledger failure never fails the request, `requireScope`), shared Zod. Plus `tests/e2e/publicApi.spec.ts` (9 Playwright cases). The Session 104/120 predecessor suite (10 tests) passes unchanged.
*   Inventory: `publicApi` PARTIAL → COMPLETE (routes 6 → 8, dedicated shared contract 178 LOC, web client + console, 3 suites). Repository totals: **100 COMPLETE / 3 PARTIAL (`sustainability`, `talk`, `usage`) / 2 STUB-by-design / 1 DEMO DATA** across 106 modules. Repository suite: **1656 passing, 51 skipped, 0 failures** (111 → 112 files).
*   Runtime validation against live PostgreSQL 17/Redis 8 remains pending; Session 120 is recorded 🟡 VERIFIED (partial).

## [Session 119 — Prompt Templates Completion] — 2026-08-06

### The renderer leaked placeholders, holes were silent, and usage had no time dimension
*   `packages/shared/src/promptTemplates.ts` (new, 319 LOC) — the module's **first shared contract** (Session 23 declared Zod inside the service file and the web client redeclared every shape by hand). Zod schemas (`Create`/`Update`/`IdParam`/`ListQuery`/`UseBody`/`Duplicate`/`StatsQuery`), types (`PromptTemplate`, `PromptTemplateUseResult` with the new `unresolved: string[]`, `PromptTemplateStats`), and pure helpers both sides share: `extractTemplateVars`, `extractTemplateDefaults`, `renderPromptTemplate`, `promptTemplateSharePercent` (floored, `null` on an empty denominator), `promptTemplateAvgPerDay`, `utcDayOf`/`utcDayBefore`.
*   **`{{var | default}}` leaked the raw placeholder.** The Session 23 pattern required the pipe immediately after the variable name, so the whitespace-around-the-pipe form — the one a human naturally types — rendered as literal text inside the prompt sent to the model. The renderer now lives in the shared pure function and resolves it.
*   **A missing variable was substituted silently.** `{{var}}` with no value and no default rendered empty with no indication. The substitution (Session 23's pinned behaviour) is unchanged, but `useTemplate` now returns `unresolved: string[]` naming the holes, and the console shows an amber warning instead of presenting a gapped prompt as complete.
*   **A check-then-act race answered 500 instead of 404.** Every mutation looked the row up org-scoped and then mutated with `where: { id }`; if the row vanished in between, Prisma's P2025 escaped as a 500. `update`/`delete`/`use` now map P2025 to `AppError.notFound`.
*   **Icon length was counted in UTF-16 units.** `z.string().max(8)` rejected the family emoji 👨‍👩‍👧‍👦 (11 units, 4 code points). Validation now counts Unicode code points.
*   **No way to fetch a single template** — added `GET /prompt-templates/:id`; **no correction path for read-only built-ins** — added `POST /prompt-templates/:id/duplicate` (201), which copies any template into an ordinary editable user template (`isBuiltIn: false`, auto-title `"<original> (copy)"` truncated to 200 chars or an explicit override).
*   **`usageCount` had no time dimension.** New org-scoped, best-effort Redis ledger (`apps/api/src/promptTemplates/promptTemplatesUsage.service.ts`): `pt:since:<org>` (NX first-event marker, immune to the event cap), `pt:use:<org>` (list capped at 500), `pt:recent:<org>` (zset, last-used), `pt:day:<org>:<YYYY-MM-DD>` (hash, TTL 92 d refreshed per write). A Redis outage never blocks a use; the durable `usageCount` increment is the write that matters.
*   **`GET /prompt-templates/stats?days=7|30`** never mixes sources and never invents a zero: database side (`totalTemplates`, `totalUses` from `usageCount`) and ledger side (`ledgerAvailable`, `ledgerStart`, `usesInWindow`, `distinctUseDays`, `ledgerCoveredDays`, `avgUsesPerDay` — `null` when the ledger covers no day, floored to 2 decimals — `daily` containing **only days with recorded events**, `topTemplates`/`recentTemplates` where a template deleted after its uses keeps id + count with `title: null`, and a static note stating the basis). Pre-ledger days are never reported as zero-use days.
*   Routes 5 → 8 on `/api/v1/prompt-templates`; the five Session 23 endpoints keep their exact paths, bodies, status codes and response shapes (the sub-router became literal path declarations — same absolute paths, and the inventory audit can now see the module's endpoints, which it previously reported as `endpoints: []`).
*   Session 89 now audits `pt:since`, `pt:use`, `pt:recent` and `pt:day` as org-scoped — each key carries the org id in the segment straight after the prefix, and a bare `pt` entry is deliberately never added (the sweep would read the literal `use` as an organization id), the same constraint that made Session 118 choose `opx:` over `opex:`.
*   Web: `apps/web/src/lib/promptTemplates.ts` now imports every shape from the shared contract (five original methods unchanged) and adds `get`/`stats`/`duplicate`; new `/app/prompt-templates` console (sidebar entry "Prompt Templates") with a library (substring search, category filter, create/edit modal with live variable extraction, use/render modal with defaults pre-filled, rendered preview and an amber **Unresolved** warning) and a usage tab with null-aware stat cards ("not recorded", never `0`), top/recent lists, a daily chart where absent days are absent, the ledger-start line and a `ledgerAvailable: false` banner. **No `?? 0` in any value position.**
*   Tests: `promptTemplates/promptTemplates.completion.test.ts` (76) — renderer fixes in both directions, defaults, missing/dedupe, malformed placeholders left raw, code-point icon validation, the P2025 race (spies on the exact mocked prisma instance), CRUD/isolation/built-in protection/duplicate truncation, ledger writes (NX marker, cap, TTL, best-effort failure), and statistics honesty (fresh-org shape, deterministic window math, pre-window exclusions, deleted-template titles, org isolation, `ledgerAvailable: false`). Plus `tests/e2e/promptTemplates.spec.ts` (9 Playwright cases). Session 23's original 5-test suite passes unchanged.
*   Inventory: `promptTemplates` PARTIAL → COMPLETE (routes 5 → 8, shared contract 319 LOC, 2 co-located suites + 1 e2e spec, web client 55 LOC, console page). Repository totals: **99 COMPLETE / 4 PARTIAL (`publicApi`, `sustainability`, `talk`, `usage`) / 2 STUB-by-design / 1 DEMO DATA** across 106 modules. Repository suite: **1618 passing, 51 skipped, 0 failures** (110 → 111 files).
*   Runtime validation against live PostgreSQL 17/Redis 8 remains pending; Session 119 is recorded 🟡 VERIFIED (partial).

## [Session 118 — Operational Excellence / Responsible AI Completion] — 2026-08-06

### The register lost writes, and five "scores" were the number zero
*   `packages/shared/src/opex.ts` (73 → 760 LOC, **appended**) — the Session 73 block is untouched and `OpexDashboard` gained exactly one **optional** field (`provenance?`) so every existing consumer still compiles. The new contract is built around **`OpexMeasure`**, whose `value` is `number | null` together with a `basis` (`observed` / `operator_assessed` / `not_assessed`), a `direction`, a `sampleSize` and an `asOf`. A measure nobody has taken is `null` — never `0`.
*   `apps/api/src/opex/opexAssurance.service.ts` (new, 1 272 LOC) — durable register, assessments, policy, breach and gap reporting, and a nine-kind ledger.
*   **The whole register was one JSON array in one Redis string.** `opex:<org>:safety-alerts` was read, mutated in memory and written back on every file. Two administrators filing a finding in the same instant silently lost one of them. There is now one key per finding (`opx:alert:<org>:<id>`) behind an append-only index.
*   **There was no resolution timestamp at all.** The record stored `at` — the filing time — and overwrote `acknowledgedBy` / `resolvedBy` in place. So `mitigations24h` filtered on the **filing** time: a finding filed three days ago and closed a minute ago **did not count**, while one filed two hours ago and closed ninety minutes ago **did**. The headline "mitigations in the last 24 hours" measured filings. It now uses the recorded resolution time, and the unit suite proves the fix in both directions.
*   **`reliability` used `Math.round`.** 999 successes out of 1 000 reported **100 %**. Every rate in this module is now floored: a metric that rounds a failure away cannot be used to notice one.
*   **`dataFreshnessHours` was `0` when nothing had ever run.** Zero hours old is the value for *perfectly fresh*, so a deployment that had never recorded a single AI request reported the freshest possible data. It is now `null`, and the payload says why.
*   **Five trust dimensions were the literal number `0`.** `alignment`, `compliance`, `transparency`, `explainability` and `hallucinationRisk` — none of which anything in this platform assesses. On a 0–100 scale zero is a score: `alignment: 0` reads as catastrophically misaligned, and `hallucinationRisk: 0`, a **risk** dimension where low is good, reads as *"this system does not hallucinate"*. `GET /opex/trust` now reports all seven assessable dimensions as `null` / `not_assessed` until an operator records a score **with the method that produced it** (≥ 10 characters, author and time stored, `stale` after the policy's validity window).
*   **One signal was published under three names.** `trust.trust`, `trust.reliability` and `trust.operationalStability` were the same variable, so a dashboard with three green gauges was showing one number three times. The rollup keeps all three fields (contract preserved); the assurance report publishes each signal once.
*   **There is no composite trust score, on purpose.** `OpexTrustReport.compositeScore` is typed as the literal `null` so it cannot be filled in by accident, and `compositeNote` says why: averaging observed traffic statistics against unassessed dimensions produces a number whose movement cannot be attributed to anything and whose stability depends on how many dimensions are missing.
*   **Closure is not safety.** `safety.passRate` was the share of filed findings marked closed, labelled as a safety pass rate — one trivial finding filed and closed reaches 100 %. The new summary calls it a closure rate, returns `null` when nothing has been filed, and ships the caveat in the payload.
*   **A resolved finding could never be reopened.** The Session 73 handler refused every change to a resolved record, so a mis-resolution was permanent with no correction path and no audit of one. `POST /opex/register/alerts/:id/reopen` moves it back to `open`, increments `reopenCount`, and **appends** the transition — the resolution it undoes stays in the history.
*   **`humanApprovalRate` mixed two windows** — tasks completed in the last 30 days over every `TODO`/`IN_PROGRESS` task ever created. Both sides now use the same window.
*   **Legacy records are adopted, not invented.** The Session 73 blob is imported **once** into durable records flagged `importedFromLegacyRegister` with `acknowledgedAt: null` and `resolvedAt: null`, because those times were never recorded. They are counted in `resolvedTimeUnknown` and excluded from every timing statistic and breach check rather than being given a fabricated timestamp. The legacy string is left in place, and a corrupt blob is tolerated rather than fatal.
*   **Structural zeros are named.** Seven sections the Session 73 contract declares — `regulations`, `playbooks`, `explanations`, `governance.gates`, `safety.benchmarks`, `continuous.maturityScore`, `collaborationSessionsActive` — have no implementation. Rather than delete fields existing consumers read, the rollup now carries a `provenance` block stating field by field which numbers are observed and which are structural zeros, and the gap report lists the same sections.
*   Routes: `/api/v1/opex` grew from 3 to 23 endpoints. The Session 118 router is mounted **ahead of** the Session 73 routes on the same prefix; none of the new paths collide with `/safety-alerts/...`, `authenticate` is already applied at the router level, and `requireAdmin` guards every state-changing handler. A session with no organization is refused rather than falling back to the bootstrap default `org-windels`.
*   Session 89 now audits `opex` (the legacy keys), `opx:alert`, `opx:idx`, `opx:assess`, `opx:policy`, `opx:event` and `opx:imported` as org-scoped. The new keys use **`opx:` rather than `opex:` on purpose**: the sweep derives the organization segment from the prefix's segment count, so an `opex:alert:<org>:<id>` key would make it read the literal string `alert` as an organization id and report a check it never made.
*   Web: `opexApi.dashboard()` is unchanged; a typed `opexAssuranceApi` (20 paths) and `formatOpexMeasure` (which renders `null` as "not assessed") were added, plus the `/app/opex` console — overview · safety register · response times · reliability · assessments · trust dimensions · policy · gaps & readiness · ledger. Reads are open to any member because the API allows them; reopen, assessment and policy controls are hidden from non-administrators because the API refuses them. There is **no `?? 0` in any value position** on the page.
*   Tests: `opex/opexAssurance.test.ts` (80) — fully in-memory (`FakeKv` + `FakePrisma`). Covers durability and concurrent files, the filing-vs-resolution-time bug in both directions, reopening and its history, legacy adoption (once only, `null` times, corrupt blob tolerated, legacy string preserved), floored and `null` closure rates, ageing buckets, timing exclusions, critical-only breaches, 999/1 000 → 99, `null`-not-zero freshness, latency percentiles, failure breakdown by provider/model/channel, assessments (`null` before assessment, the risk dimension, staleness, never-expires, an honest "nothing to clear"), the trust report's basis arithmetic and absent composite, policy validation and isolation, cross-organization isolation with a forged record skipped, configuration and gaps, and Session 73 compatibility (return shapes, no durable-only field leaking, the `409` message pointing at the reopen path, the `mitigations24h` fix, provenance attached, reliability floored). Plus `tests/e2e/opexAssurance.spec.ts` (21 Playwright cases) driving a finding file → acknowledge → close → reopen over HTTP.
*   Inventory: `opex` PARTIAL → COMPLETE (routes 3 → 23, shared contract 760 LOC, service total 3 935 LOC, client 159 LOC, 2 co-located suites); repository totals 98 COMPLETE / 5 PARTIAL / 2 STUB-by-design / 1 DEMO DATA across 106 modules. Repository suite: **1542 passing, 51 skipped, 0 failures**.
*   Runtime validation against live PostgreSQL 17/Redis 8 remains pending; Session 118 is recorded 🟡 VERIFIED (partial).

## [Session 117 — Mobile App / PWA Completion] — 2026-08-06

### The WebAuthn core was real; the offline queue destroyed work
*   `packages/shared/src/mobile.ts` (new, 826 LOC) — the module had **no shared contract**. Queued-action, receipt, replay-plan, device-view, PIN-lock, push-health, policy, configuration, gap, event and self-view types now sit in one place with their Zod schemas, the notes that ship inside the payloads, and the pure helpers both sides derive state from. `mobilePushEndpointHost` parses with a regular expression rather than `new URL()`: `packages/shared` compiles without the DOM lib.
*   `apps/api/src/mobile/mobileSync.service.ts` (new, 1 127 LOC) — a durable offline queue that **stores and never executes**. **Nothing in `services/mobileAuth.service.ts` was rewritten** — the real WebAuthn signature verification over `authenticatorData || SHA-256(clientDataJSON)`, the single-use time-bounded challenge, the sign-counter check and the bcrypt PIN column are untouched, and their 27 tests still pass unchanged.
*   **`POST /mobile/offline/sync` stored nothing.** It updated the device's `lastSeenAt`, answered `{ received: <n> }` and **dropped the actions array on the floor** — while its own comment claimed the actions were "persisted … for auditing". They were not persisted anywhere.
*   **…and the client deleted its copy anyway.** `apps/web/src/lib/mobile/offlineQueue.ts` `flush()` posted the queue and then **unconditionally cleared every action out of IndexedDB without reading the response**. A message composed in a tunnel was destroyed the moment the phone found signal, and the user was shown a successful sync. This pair of defects is why the session exists.
*   **The fix is both halves.** The server now writes each action — method, path, body, the device's own `queuedAt` **and the server's `receivedAt`** — and returns one receipt per action. The client deletes locally **only** the ids the server reports as `stored` or `duplicate`, replays what it stored through the ordinary authenticated `api()`, and reports each outcome back. `flush()` returns counts (`submitted / stored / duplicates / rejected / rejections / applied / failed`) rather than a bare acknowledgement, because "we sent 12 and 3 were refused" is exactly what the previous implementation hid.
*   **Stored is not applied, and the payload says so.** The server never dispatches a queued write internally: that would run a write with none of its normal authorization, validation or rate-limit context re-established. Replay happens on the device against the ordinary API.
*   **Rejection is explicit and the client is told to keep the work.** `queue_disabled`, `queue_full`, `body_too_large` (> 16 KiB, refused rather than truncated), `path_invalid`, `path_not_allowed`, `method_not_allowed`, `action_id_invalid` — each with `retainLocally: true`. Credential and queue-control prefixes (`/api/v1/auth`, `/api/v1/mfa`, `/api/v1/mobile/{offline,pin,biometric}`) are never replayable from a stored body.
*   **Ordering uses the server's clock.** The replay plan is ordered by `receivedAt`, not the device's `queuedAt`: a handset's clock is attacker-controlled and frequently just wrong. The device's own value is returned separately and labelled as such.
*   **Expiry is reported `expired`, never `applied`.** A record past the organization's retention window was dropped *without* being executed, and the transition is written to the ledger.
*   **Device registration was not scoped by owner.** `POST /mobile/devices/register` upserted on the client-supplied device id with an **update branch filtering on the id alone**, so one account could overwrite another account's device row — name, platform, last-seen IP and user agent — **and the response returned the whole row including `pinHash`**, the column whose schema comment says never to select it. Registration now asserts ownership, records a refusal, and returns a sanitised view. A test greps a full keyspace dump for any secret, after first asserting the dump is non-empty so the check cannot pass vacuously.
*   **`POST /mobile/pin/verify` counted nothing.** A four-digit PIN is 10 000 guesses and the only obstacle was bcrypt's cost factor. Five failures inside 900 s now engage a 900 s lock, **per device** — losing one handset must not lock the owner out of another — and a success clears the counter. `DELETE /mobile/devices/:deviceId/pin` removes a PIN; there was no way to do that, so a user who forgot theirs had a device permanently carrying a secret they could not use.
*   **Push died silently.** `push.service.ts` deletes a subscription after eight consecutive delivery failures and recorded nothing, so notifications simply stopped. Retirement and every delivery attempt are now recorded — best-effort and lazily imported, so bookkeeping can never turn a delivered notification into an error. `GET /mobile/push/health` reports the **endpoint host only**: the full endpoint is a bearer capability.
*   **Delivery counts do not claim the user saw anything.** Accepted by the push service is not seen by the person: the browser or operating system may still suppress, delay or drop a notification, and the note says so. Counts describe attempts recorded since this ledger existed.
*   **An organization can finally set mobile rules.** `minAppVersion`, `updateRequirement`, `offlineQueueEnabled`, `maxQueuedActions`, `actionRetentionDays`, `pinAllowed`, `pinMinLength`, `biometricRecommended`, `pushEnabled`. The defaults reproduce the platform's historical behaviour exactly and are reported as *defaults*. The policy is labelled **advisory** except for the queue limits this API actually enforces, and `updateRequirement: "required"` does **not** make the API refuse an old build — a version that cannot be parsed is reported `unknown` rather than assumed current.
*   **The configuration report names the key everyone forgets.** It reads this process's environment, makes no network call, reports *configured* rather than *working*, never echoes a key value, and flags the **development VAPID pair committed to `config/env.ts`** as a warning — which a test asserts is never rounded down to a failure nor up to a pass.
*   Routes: `/api/v1/mobile` grew from 21 to 39 endpoints. The Session 117 router is mounted **ahead of** the Session 21 routes and attaches `authenticate` per handler rather than with `router.use`, so an unmatched path falls through unchanged — in particular the deliberately public `GET /mobile/config`. `POST /mobile/offline/sync` keeps its original `received` field and gains `stored` / `duplicates` / `rejected` / `receipts` / `queueDepth`, so an unmodified older client gains durability without a line of change. `@ts-nocheck` was removed from `routes/mobile.ts` and the file type-checks for the first time.
*   Session 89 now audits `mob:policy` as org-scoped. The seven principal-scoped keys — `mob:action`, `mob:actidx`, `mob:actdev`, `mob:pinfail`, `mob:pinlock`, `mob:event`, `mob:pushlog` — are catalogued as `shared` **with the reason recorded**: a phone, the writes it queued offline, its PIN lock and its push history belong to the person who signed in on it, the same person may hold memberships in several organizations from one handset, and the queue is read before an organization has been resolved. Calling them `org_scoped` would let the sweep treat a user id as an organization id and report a check it never made.
*   Web: typed `mobileSyncApi` (18 paths) and `mobileApi` (the Session 21 endpoints, which had no typed client at all), plus an `/app/mobile-devices` console (overview · devices · queue · push · policy · ledger) that hides the policy tab from non-administrators because the API refuses them.
*   Tests: `mobile/mobileSync.test.ts` (62) — fully in-memory (`FakeKv` + `FakePrisma`). Covers the stored-not-dropped defect itself, body retention, `stored ≠ applied`, dedupe, `rejected → retainLocally`, every path rule, the four rejection classes, resolution (verbatim outcome, second outcome refused, retry after failure, discard, discard-of-applied refused, resolve-of-discarded refused, expiry and its ledger entry), replay ordering including a shared-millisecond tie, cross-user isolation and a forged record being skipped, device ownership in three configurations, the keyspace no-secret grep, staleness, update standing (never rounded up, `null` when unparsable), the PIN throttle's threshold/window/expiry/clear/per-device scoping, policy defaults and storage, push health, and the configuration report. Plus `tests/e2e/mobileSync.spec.ts` (17 Playwright cases) including the central fix proved over HTTP — submit, then read the action back from a separate request with its body intact.
*   Inventory: `mobile` PARTIAL → COMPLETE (routes 21 → 39, shared contract 826 LOC, service total 3 685 LOC, client 198 LOC, 3 co-located suites); repository totals 97 COMPLETE / 6 PARTIAL / 2 STUB-by-design / 1 DEMO DATA across 106 modules. Repository suite: **1462 passing, 51 skipped, 0 failures**.
*   Runtime validation against live PostgreSQL 17/Redis 8 remains pending; Session 117 is recorded 🟡 VERIFIED (partial).

## [Session 116 — Multi-Factor Authentication Completion] — 2026-08-06

### The TOTP core was real and good; nothing around it existed
*   `packages/shared/src/mfa.ts` (new, 655 LOC) — the module had **no shared contract**. Policy, enrolment, coverage, lock, exemption, event, gap, configuration, login-decision and self-view types now sit in one place with their Zod schemas, the notes that ship inside the payloads, and the pure helpers both sides derive state from. The organization policy type is named **`MfaOrgPolicy`**, not `MfaPolicy`: `wakeIntel.ts` already exports an `MfaPolicy` describing wake-word factors, and renaming a shipped module's export to take the shorter name is not additive.
*   `apps/api/src/mfa/mfaAssurance.service.ts` (new) — organization-scoped assurance over Redis: throttle, replay guard, confirmed-enrolment lifecycle, policy, coverage, exemptions, ledger and configuration report. **Nothing in `services/mfa.service.ts` was rewritten** — the RFC 6238 generator pinned against the spec's Appendix B vectors, the AES-256-GCM secret at rest, the SHA-256 recovery digests and the deliberate ±1 drift window are untouched, and their tests still pass unchanged.
*   **Failed second-factor attempts were counted nowhere.** A 6-digit code accepted across a ±1 window is three live codes in 1 000 000 per try, and the only limit on `POST /auth/mfa/complete` was `rateLimit("login")` — **per IP**, which a distributed caller walks past. Five failures inside a 900 s window now engage a 900 s lock; failures age out of the window, a success clears the counter, and an administrator can lift a lock — a lift that is itself recorded.
*   **An OTP could be replayed.** RFC 6238 §5.2 requires the verifier to refuse the second presentation of a code; nothing did, so a code read over a shoulder or captured at a proxy stayed usable for the rest of its ~90 s validity. A verified token is now marked for 90 s as `SHA-256(token)` truncated to 32 hex characters — **the token itself is never stored**, and a test greps the whole fake keyspace to prove no token, recovery code or secret survives in the clear.
*   **Confirming an enrolment was a no-op.** `POST /mfa/confirm` verified a token and then recorded nothing, while `POST /mfa/enable` wrote the secret *and* the enforcement flag immediately — so the next login could demand a code from a user who had never successfully scanned the QR, with no way out. Enrolment is now `none` → `pending` → `confirmed`, and a **pending** enrolment can be abandoned, discarding the secret and its recovery codes. A *confirmed* enrolment still requires a valid code through the original `POST /mfa/disable`; the escape hatch is not a bypass.
*   **A secret older than the ledger is `unrecorded`, never `confirmed`.** Whether that user ever completed a verification is unknown, and unknown is what the payload says.
*   **The MFA routes had no authentication.** The file's own comment said "handled by auth middleware globally", but no global `authenticate` is mounted on the v1 router, so every handler dereferenced an undefined `req.user` and an anonymous request produced a **500, not a 401**. `authenticate` is now attached per handler; the six original paths, request bodies and success payloads are unchanged for a valid user.
*   **An organization can finally require a second factor.** `mode` ∈ {`optional`, `required_admins`, `required_all`}, `enforcement` ∈ {`report_only`, `block_after_grace`}, plus `graceDays`, `recoveryCodeFloor` and `allowRecoveryCodes`. The defaults reproduce the platform's historical behaviour exactly, and `report_only` blocks nothing — both the enforcement note and the console's own selector label say so in those words.
*   **Blocking enforcement cannot be switched on from an account that would itself be blocked.** Without that guard, one request from an unenrolled owner locks every administrator out with nobody able to revert it.
*   **Login policy evaluation fails open.** Anything other than an explicit `block` lets the sign-in continue: an assurance bug must never take authentication down. The login challenge now carries `organizationId` so the second-factor step records against the right ledger, and `completeMfaLogin` runs the gate before verifying.
*   **Coverage answers the first question on every security questionnaire.** Members from Postgres, each with enrolment state, recovery-code count, lock state, exemption and a compliance standing. `not_required` is counted separately from `covered` so a permissive policy cannot present itself as a protected organization; `requiredCoverageRatio` is `null` — not 0 % and not 100 % — when the policy requires nobody; the 500-member cap is reported as `truncated`, never silently applied.
*   **An exemption is a documented decision, not a hole.** Reason (≥ 10 characters), author and expiry, reported as `exempt` and **never folded into `covered`**.
*   **There is now an audit trail.** Fifteen event kinds written to both the organization stream and the member's own stream, each trimmed to 500. Counts describe events recorded since the ledger existed — nothing is back-filled or estimated, and the note says so.
*   **The configuration report reads the environment and nothing else** — TOTP parameters, storage, throttle, replay guard and the paths each is wired into. It reports "configured", never "working", it never echoes a key, and a test greps the payload for any 64-hex-character run.
*   Routes: `/api/v1/mfa` grew from 6 to 24 endpoints. The Session 116 router is mounted **ahead of** the original six and attaches `authenticate` per handler rather than with `router.use`, so an unmatched path falls through unchanged.
*   Session 89 now audits `mfa:policy`, `mfa:exempt`, `mfa:exemptidx` and `mfa:event` as org-scoped. The nine principal-scoped keys — `mfa:secret`, `mfa:recovery`, `mfa:enforced`, `mfa:challenge` (all four predate this session and had never been catalogued at all), plus `mfa:enroll`, `mfa:fail`, `mfa:lock`, `mfa:used`, `mfa:uevent` — are catalogued as `shared` **with the reason recorded**: they key on a user id, not a tenant, and the login path that reads them has not resolved an organization yet. Calling them `org_scoped` would let the sweep treat a user id as an organization id and report conformance it has not checked.
*   Web: typed `mfaApi` (the original six had no typed client — the login page hand-rolled its one call) and `mfaAssuranceApi`, plus an `/app/mfa-assurance` console (overview · coverage · policy · lockouts · exemptions · ledger · my second factor) that hides administrative tabs from non-administrators because the API refuses them.
*   Tests: `mfa/mfaAssurance.test.ts` (64) — fully in-memory (`FakeKv` + `FakePrisma`), every enrolment seeded **through the real `MfaService`** so a drift in key layout breaks the suite rather than quietly reporting an empty organization, and TOTPs computed with the suite's **own** HMAC implementation so a shared bug cannot make a test pass. Covers the self-lockout guard in four configurations, all four enrolment states, the throttle threshold/window/expiry/clear, the replay guard's per-user scoping and expiry, the plaintext keyspace grep, coverage under each policy mode with grace boundaries and truncation, cross-organization isolation of every artefact, all five login decisions, exemption expiry, and a configuration report checked against the otpauth URL the real service issues. Plus `tests/e2e/mfaAssurance.spec.ts` (14 Playwright cases) including the 401-not-500 fix and anonymous refusal of all 13 read endpoints.
*   Inventory: `mfa` PARTIAL → COMPLETE (routes 6 → 24, shared contract 655 LOC, client 149 LOC, 4 co-located suites); repository totals 96 COMPLETE / 7 PARTIAL / 2 STUB-by-design / 1 DEMO DATA across 106 modules. Repository suite: **1400 passing, 51 skipped, 0 failures**.
*   Runtime validation against live PostgreSQL 17/Redis 8 remains pending; Session 116 is recorded 🟡 VERIFIED (partial).

## [Session 115 — Lead Discovery Completion] — 2026-08-06

### Discovery was honest; everything after it was missing
*   `packages/shared/src/leadDiscovery.ts` (new) — the module had **no shared contract**. The lead shape was declared twice, once in the API service and once in the web client, with nothing keeping them in step. Pipeline, duplicate, coverage, ledger, export and summary types now sit in one place with their Zod schemas, compiled against by both sides.
*   `apps/api/src/leadDiscovery/leadPipeline.service.ts` (new) — organization-scoped pipeline over Redis: status, owner and notes per lead, duplicate grouping, field coverage, a search ledger, collection maintenance and an export preview. **Nothing in Session 85's `leadDiscovery.service.ts` search path was rewritten** — the Places call, the 503-when-unconfigured refusal, the no-enrichment rule and the `source_returned` labelling are untouched, and its 15 tests still pass unchanged.
*   **The module finally deduplicates.** Running the same search twice stored the same business twice under two ids; the service's own comment referred to "dedupe" that had never been implemented anywhere. Groups are formed on the provider's place identifier — **only** on that, since two similarly named records are not evidence of one business — and the earliest record is named keeper.
*   **Resolution marks; it never deletes.** Deleting was the obvious implementation and would have taken a worked lead's notes with it. Marked records stay readable, and moving one to any other status returns it to the pipeline and clears the keeper pointer. A test asserts the record *and its notes* survive.
*   **A tie in `discoveredAt` is no longer broken by a coin flip.** Two searches inside the same millisecond produce identical timestamps. The first implementation compared UUIDs and then called the winner "the earliest"; the test suite caught it, and the keeper is now decided by position in the organization's own index — real insertion order the store already maintains.
*   **The permanently empty contact columns are explained.** Places *text search* does not return `phone` or `website` (that needs a separate Place Details call this deployment does not make), so every export read like "these businesses have no phone number". `GET /coverage` now reports `suppliedByProvider: false` with the reason in the payload, and `percentPresent` is `null` — not `0` — when there is nothing to measure.
*   **CSV formula injection is neutralised.** Business names come from a public directory; a listing called `=HYPERLINK("http://evil","Click")` was written verbatim and executes on open in Excel and Sheets. Cells beginning with `=`, `+`, `-`, `@`, tab or CR are prefixed with an apostrophe, and the preview reports how many cells were rewritten.
*   **An export preview names the empty columns before the file downloads** — plus ids that do not resolve and duplicate ids in the selection. A column is only called "always empty" when at least one row resolved, since every column is empty for an empty selection.
*   **Searches are recorded.** The module spends money on a third-party API and left no trace of what was asked. `search()` now writes a ledger entry — **best-effort by design**: a failed bookkeeping write must never turn a successful, already-paid-for search into an error. A test forces the write to reject and asserts the results still come back. `newListings`/`repeatListings` are counted exactly, from the leads themselves, with no second index that could drift.
*   **Collection maintenance exists.** Rename, delete and remove-a-lead were all missing, so a mistyped collection was permanent. Deleting a collection keeps every lead it grouped, and `GET /collections/:id` names member ids that no longer resolve instead of dropping them silently.
*   Routes: `/api/v1/lead-discovery` grew from 6 to 23 endpoints. The Session 115 router is mounted **ahead of** Session 85's and attaches `authenticate` per handler rather than with `router.use`, so all six original endpoints keep their paths and behaviour. Bulk or destructive operations (`POST /duplicates/resolve`, `DELETE /collections/:id`) require an administrator; working the pipeline does not.
*   `lrem` was added to both the in-memory `MockRedis` and the test `FakeKv`. Neither had it, so every existing caller (media generation's pending queue, the scheduler's dead letters) would have thrown rather than degraded.
*   Session 89 now audits `leads85` (Session 85's own namespace, org-scoped since it shipped but never catalogued) plus `lead:pipe`, `lead:note`, `lead:noteidx` and `lead:hist`.
*   Web: `leadPipelineApi` client and an `/app/lead-pipeline` console (overview · pipeline · duplicates · field coverage · search log) that shows records held **and** distinct listings as separate figures, renders the API's coverage explanation next to the zero, and hides bulk controls from non-administrators. Session 85's `/app/leads` is untouched; the two pages link to each other.
*   Tests: `leadDiscovery/leadPipeline.test.ts` (42) — leads seeded **through the real Session 85 service** so the two files' key layouts must genuinely agree; covers keeper ordering, chain branches that must *not* group, resolution idempotence, notes surviving resolution, the forged cross-tenant pipeline record, coverage nulls, ledger trimming and best-effort behaviour, the formula guard, and export preview honesty. Plus `tests/e2e/leadPipeline.spec.ts` (11 Playwright cases).
*   Inventory: `leadDiscovery` PARTIAL → COMPLETE (routes 6 → 23, shared contract 452 LOC, client 192 LOC, 2 co-located suites); repository totals 95 COMPLETE / 8 PARTIAL / 2 STUB-by-design / 1 DEMO DATA across 106 modules.

## [Session 114 — Google Identity Completion] — 2026-08-06

### The OAuth flow was real; nothing governed it, and its return leg was missing
*   `packages/shared/src/googleAuth.ts` (new) — the module had **no shared contract at all**. Policy, decision, linked-identity, ledger, configuration and summary types now sit in one place with their Zod input schemas, compiled against by both the API routes and the new web client.
*   `apps/api/src/googleAuth/googleIdentity.service.ts` (new) — organization-scoped governance over Redis: a sign-in policy, a register of linked Google identities, an event ledger and an environment-only configuration report. **Nothing in `services/googleAuth.service.ts`'s ID-token verification was rewritten** — the JWKS signature/`iss`/`aud`/`nonce`/`exp`/`email_verified` checks and their suite are untouched.
*   **An organization can finally say who may sign in with Google.** Four modes: `open` (the platform default, and exactly the historical behaviour), `domain_allowlist` (exact domain match — a subdomain is not a match for its parent, wildcards are rejected at validation), `linked_only` (an administrator must have linked the account first) and `disabled`. `blockRevokedIdentities` refuses a revoked identity regardless of mode, and can be turned off deliberately.
*   **The policy is enforced in the real callback, not only in tests.** `handleCallback` consults `authorizeSignIn` once the ID token is verified and the account resolves to a member of an organization; a refusal is written to that organization's ledger and raised as `GOOGLE_SIGNIN_BLOCKED`. With no stored policy the decision is `allowed`, so a deployment that never configures one behaves exactly as before.
*   **A brand-new Google account cannot be gated, and the payload says so.** It belongs to no organization at decision time; `GOOGLE_PROVISIONING_NOTE` states this rather than implying coverage the code does not have.
*   **A departed account can be cut off.** Revoke, restore and unlink, each with a ledger entry. Unlink removes the register entry only — the response states in prose that the platform user, its memberships and its existing sessions are untouched, and that a token already issued runs until it expires.
*   **Google's subject identifier is never stored in the clear.** Only a truncated SHA-256 fingerprint (`GOOGLE_IDENTITY_PRIVACY_NOTE`); a test greps the whole fake keyspace to prove the raw `sub` does not survive.
*   **The configuration report reads the environment and nothing else.** It reports which of `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` are present (never the secret's value, only a masked client id), whether the redirect URI is HTTPS, and whether its path is the one this API serves. `ready` is derived from the checks — a warning is never rounded up to a pass — and the note says a passing check means "configured", not "working". A test asserts no `fetch` occurs.
*   **Ledger counts describe recorded events only.** `GOOGLE_LEDGER_NOTE` ships with the payload, `stored`/`retentionLimit`/`oldestAt` make trimming visible, and the durable per-identity `recordedSignIns` counter is reported separately rather than being reconciled against a trimmed ledger. Nothing is back-filled or estimated.
*   **Dry runs are labelled as such.** `POST /auth/google/policy/evaluate` returns `applied: false` with a note stating that no sign-in was attempted and no ledger entry was written.
*   Routes: `/api/v1/auth/google` grew from 3 to 18 endpoints. The Session 114 sub-router is mounted **ahead of** the OAuth endpoints and attaches `authenticate` per handler rather than with `router.use`, so `/auth/google`, `/auth/google/status` and `/auth/google/callback` keep their paths *and* their unauthenticated behaviour.
*   Session 89 now audits `gid:policy`, `gid:link` and `gid:event` as org-scoped namespaces; the pre-existing `google:state` (pre-login CSRF state) is catalogued as `shared` **by design**, since it is issued before any organization is known.
*   Web: typed `googleAuthApi` client and an `/app/google-identity` console (overview · linked identities · policy · ledger · configuration) that renders the API's own notes rather than restating them, shows "none recorded"/"never" instead of a confident `0`, and hides every write control from non-administrators.
*   **`/auth/callback` now exists.** The API has always redirected there after a Google sign-in; the route was missing from the web app, so a successful sign-in landed on the not-found page and the token in the fragment was discarded. The new page adopts the session, clears the fragment from browser history immediately, renders a policy refusal with the organization's own reason, and states plainly that the callback issues no refresh token.
*   Tests: `googleAuth/googleIdentity.test.ts` (41) — allowlist normalisation and subdomain non-matching, every refusal outcome with its reason, cross-tenant invisibility including a hand-planted forged record, ledger ordering for same-millisecond writes, trimming at the retention limit while the durable counter keeps counting, the raw-subject grep, and six configuration cases. Plus 7 new cases appended to the existing OAuth suite that drive the gate and the ledger **through the real callback** (30 tests there now), and `tests/e2e/googleAuth.spec.ts` (10 Playwright cases).
*   Inventory: `googleAuth` PARTIAL → COMPLETE (routes 3 → 18, shared contract 404 LOC, web client present, 2 co-located suites); repository totals 94 COMPLETE / 9 PARTIAL / 2 STUB-by-design / 1 DEMO DATA across 106 modules.
*   Runtime validation against live PostgreSQL 17/Redis 8 remains pending; Session 114 is recorded 🟡 VERIFIED (partial).

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
