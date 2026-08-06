# CONVENTIONS — WINDELS AI OS (Decision Log)

> **Purpose:** the "working agreement" — every session appends a
> `## Session N — Decisions Logged` section capturing naming conventions,
> architectural choices, library picks and patterns so future sessions build
> on decisions instead of rediscovering them. (Restored 2026-08-05 — earlier
> sessions' decisions are documented in `docs/` and `SESSION_WORKFLOW.patch`.)

## Standing conventions (from the master spec + prior sessions)

1. **Delivery order per module (vertical slice):** `packages/shared/src/<m>.ts`
   (Zod + types) → `apps/api/src/<m>/<m>.service.ts` (+ `bootstrap.ts`) →
   `apps/api/src/http/routes/<m>.ts` → `apps/web/src/lib/<m>.ts` → UI page →
   router/sidebar → vitest + Playwright → decision log → progress log.
2. **Additive-only:** never remove/rewrite/break an existing session's module.
3. **No fake completion:** nothing marked done before the
   IMPLEMENTED → BUILT → TESTED → VERIFIED → INTEGRATED gate passes.
4. **Honest labeling:** demo/synthetic data is gated behind
   `WINDELS_DEMO_DATA` and flagged in the UI; no `Math.random()` in read paths
   (guard: `noRandomData.guard.test.ts`); no fabricated verdicts
   (`noFakeVerdict.guard.test.ts`); every directly-seeding bootstrap is gated
   (`demoCleanup.guard.test.ts`).
5. **Tenant isolation (Session 89):** org-scoped Redis keys
   (`<prefix>:<entity>:i:<org>:<id>`), fail-closed reads that re-check the
   `organizationId` value, and org-scoped namespaces registered in
   `tenantIsolation.service.ts` `TI_NAMESPACE_CATALOG` so the live audit
   covers them.
6. **API envelope:** `{ ok, data, meta: { requestId } }`; validation with Zod
   schemas in `@windels/shared` so API and web client share one definition.
7. **Amounts** are integer minor units (`amountCents`) + ISO 4217 currency.
8. **IDs** are `randomUUID()`-derived (CSPRNG), never `Math.random`.

## Session 106 — Decisions Logged (Autonomous Organization Approval Register Completion)

- **Shared contract prefix:** `Aut` contracts and Zod schemas remain in
  `packages/shared/src/autonomous.ts`.
- **Approval-first boundary:** proposals are real records but this module never
  executes an autonomous action. `awaiting_human` is the default state and only
  authenticated admin decisions produce `approved`/`rejected` outcomes.
- **Ledger storage:** decisions use `aut:decision:i:<org>:<id>` records and an
  organization index; old JSON blobs are migration inputs only.
- **Honest metrics:** review rate is labeled as human review, empty governance
  evidence is zero, and approved impact is labeled an estimate rather than
  realized savings. Plans, budgets and executive seats stay empty until real
  ledgers exist.
- **UI:** `/app/autonomous` is a dedicated approval console; non-admins see
  read-only data and no fake execution controls.

## Session 105 — Decisions Logged (Message Attachments Completion)

- **Shared contract prefix:** `Att` types and Zod contracts live in
  `packages/shared/src/attachments.ts`; `filesApi` exposes the normalized
  metadata shape used by web and mobile.
- **Metadata normalization:** API responses use `sha256` and `previewText`,
  matching the client. Prisma's `checksum`/`extractedText` names stay internal.
- **Storage integrity:** new object keys contain the full SHA-256 plus a safe
  filename. If a same-key object exists, its bytes are rehashed before reuse;
  a mismatch is a conflict, never silent overwrite.
- **Scope and deletion:** upload targets and reads are organization-scoped;
  only the uploader can delete an unclaimed attachment. Claimed message/talk
  attachments remain protected.
- **Mobile parity:** `/m/files` uses the real paginated client and multipart
  upload for camera/photo/document actions rather than no-op picker callbacks.

## Session 104 — Decisions Logged (API Key Management Completion)

- **Shared contract prefix:** `Ak` types and Zod schemas live in
  `packages/shared/src/apiKeys.ts`; the public API service preserves its
  `CreateApiKeySchema`/`UpdateApiKeySchema` aliases for existing consumers.
- **Secret handling:** `wnd_` bearer tokens are generated with CSPRNG bytes;
  only SHA-256 hashes and prefixes are persisted. Plaintext is returned once
  from create and never from list/detail.
- **Lifecycle:** API keys may be renamed or have scopes changed while active;
  revocation is irreversible and all create/update/revoke transitions write
  organization-scoped audit records.
- **Isolation:** API key reads and mutations resolve the caller's membership
  organization and fail closed for foreign key IDs. The dedicated client/page
  uses `/api/v1/apikeys`; the existing Developer Portal remains compatible.

## Session 103 — Decisions Logged (AI Economy & GPU Capacity Ledger Completion)

- **Shared contract prefix:** `AiEconomy*` types/schemas remain in
  `packages/shared/src/aiEconomy.ts`; `ecoApi` and the dedicated page consume
  those contracts.
- **Ledger storage:** usage, allocation and compute-offer observations are
  individual Redis hash records under `eco:<entity>:i:<org>:<id>` with
  organization indexes. The old per-org JSON blobs are migration inputs only;
  new writes never append to a blob.
- **Provider honesty:** capacity offers are administrator-recorded
  observations, not a static/generated provider catalog. Empty organizations
  show no offers. Revenue, earnings, margin and marketplace volume remain zero
  without their real ledgers.
- **Projection labeling:** the only forecast is a straight-line projection of
  observed 30-day spend and is labeled `forecastKind: observed_run_rate`;
  no forecast is emitted for an empty ledger.
- **RBAC:** dashboard reads are authenticated; usage, allocation and offer
  mutations require admin role. Cross-tenant operations fail closed.

## Session 102 — Decisions Logged (AI Workforce / Agent Framework Completion)

- **Shared contract prefix:** `Ag` types and Zod schemas in
  `packages/shared/src/agents.ts`; existing agent service schema exports remain
  aliases for compatibility. The typed client uses the same records and
  `AgPaginated<T>` envelope.
- **Organization scope:** agent, memory, knowledge, skill and event reads are
  constrained by the caller's `resolveUserContext` organization. Internal
  lifecycle state now writes `agent:lifecycle:<org>:<id>` and history writes
  `agent:lifecycle:history:<org>:<id>`; old slots migrate only after the agent
  organization is verified.
- **Model honesty:** agent creation/update accepts only a model recognized by
  the ProviderRegistry; the Workforce Hub does not silently send a default
  fabricated model when no model is selected.
- **Mobile parity:** `/m/agents` consumes the real paginated agent response,
  computes online/assigned-task counts from returned records, and navigates to
  the real Workforce Hub for creation instead of exposing no-op controls.
- **Tests:** the core agent suite now covers ten service/contract scenarios,
  including cross-organization mutation and event isolation.

## Session 101 — Decisions Logged (Admin Console Completion)

- **Shared contract prefix:** `Adm` types and Zod schemas in
  `packages/shared/src/admin.ts`; the existing `/api/v1/admin` route family is
  retained and the web client now consumes the shared output types.
- **Scope is enforced by the database relationship:** organization admins can
  read and mutate only users with a `Membership` in their active organization;
  super admins retain platform-wide scope. No new Redis namespace is needed
  because this surface operates on the core Prisma User/Membership/AuditLog
  models.
- **Admin actions are audited and guarded:** suspension/reactivation writes an
  audit row; role changes are super-admin-only; actors cannot suspend or change
  their own account; super-admin accounts cannot be suspended.
- **Directory contract:** user list responses use `{ users, pagination }` with
  optional search, role and status filters. The new detail endpoint and filters
  are additive; existing stats and mutation paths remain compatible.
- **UI:** `/admin` now renders the dedicated real-data Admin Console with
  search, filters, pagination and guarded actions. The historical
  `AdminDashboard` component remains in place for compatibility.

## Session 100 — Decisions Logged (Enterprise FinOps Depth)

- **Module prefix:** `Efo` types, `efo:center|budget|cost|allocation:*` Redis
  namespaces, `/api/v1/finops` routes, `apps/web/src/lib/enterpriseFinOps.ts`
  client, `/app/finops` route + sidebar label "Enterprise FinOps". This is
  additive and intentionally separate from the historical global Session 31
  `FinOpsService` under `/enterprise-foundation`.
- **Accounting precision:** budgets, actual costs and allocations persist
  integer `amountMinor` values plus an explicit three-letter currency. There
  is no implicit FX conversion and a cost center's currency is locked once it
  has budgets or allocations.
- **Ledger separation:** provider observations are stored once as costs;
  chargeback ownership is represented by separate allocation rows. Direct
  allocation is a convenience on cost creation, while shared/usage/proportional
  splits are explicit and conservation-checked (sum allocations cannot exceed
  source cost).
- **Computed statements:** budget utilization, variance, status, by-method
  totals, unallocated spend and the rollup are computed per read from live
  ledgers. Chargebacks are never stored as a duplicated fact.
- **Demo seed:** idempotent synthetic records are gated behind
  `WINDELS_DEMO_DATA` in `org-demo-efo` (3 centers, 3 budgets, 3 costs, 4
  allocations); fresh organizations remain empty.

## Session 99 — Decisions Logged (Software Factory: Five Studios & Build Farm)

- **Module prefix:** `Sf` types, `sf:plan:*` Redis keys (plans only —
  compile targets are a pure projection, never stored), `/api/v1/builder`
  extended routes (additive second router on the same prefix), web client
  `apps/web/src/lib/softwareFactory.ts`, `/app/software-factory` route +
  sidebar label "Factory Studios".
- **The five studios** (spec §3) are a real static catalog with their
  defined deliverables; studio plans validate deliverables against the
  catalog (unknown items rejected) and require a real S96 project.
- **Plan lifecycle honest:** `planned → in_progress → completed`;
  `completedAt` stamped only on entering completed, cleared when reopened.
- **Compile targets are a pure projection** (spec §4): targetType →
  declared targets (real mapping), deterministic file names + real
  node:crypto SHA-256 manifests, and status DERIVED from the run's real
  state (pending → compiling → built | failed). `binaryEmitted` is always
  honestly false with a `requiresToolchain` note — the platform never
  pretends a binary exists when none was compiled. Identical run state ⇒
  identical targets.
- **Studio coverage** (per project) and the factory rollup are computed per
  read — never invented.
- **Demo seed:** idempotent, seeds `org-demo-sf` (5 plans + runs).

## Session 98 — Decisions Logged (Enterprise Search)

- **Module prefix:** `Es` types, `es:history:<org>` Redis key (the only
  stored data — the index itself is computed), `/api/v1/search` route
  prefix, `apps/web/src/lib/enterpriseSearch.ts` client, `/app/search` route
  + sidebar label "Search".
- **The index is computed, never stored:** every query scans the real
  org-scoped module records through each module service and ranks matches
  with a deterministic relevance score (title/name/email/sku ×3, tags ×2,
  body ×1, prefix bonus +1, 7-day recency +0.5). No separate index to drift,
  no fabricated hits; cross-tenant isolation is inherited from every module's
  fail-closed reads.
- **Stable ordering:** score desc, then id asc — identical store + query ⇒
  identical ordering.
- **Recent-search history** is org-scoped, case-insensitively deduped,
  newest-first, capped at 20; stored with Redis list ops (`lpush` must be
  oldest-first so the list ends newest-first).
- **Rollup:** `indexedCounts` are live counts read from the module stores;
  nothing invented.
- **Demo seed:** idempotent, seeds `org-demo-es` history only.

## Session 97 — Decisions Logged (Enterprise Business Intelligence)

- **Module prefix:** `Bi` types, `bi:*` Redis keys, `/api/v1/bi` route
  prefix, `apps/web/src/lib/businessIntelligence.ts` client,
  `/app/bi` route + sidebar label "Business Intel".
- **KPI values are live, never stored:** `evaluateMetric()` reads the real
  module records through each module service (CRM/ERP/Email/Social/Helpdesk/
  Builder) and computes the value per read — identical store state ⇒
  identical values. No caching-as-fact, no fabrication.
- **Period windows** (`all | 7d | 30d`) filter record timestamps for
  countable metrics; currency metrics (forecast, stock_value) use the
  module's live rollup.
- **Reports** are card layouts; `evaluate` computes every card live; CSV
  export is real (escaped, deterministic rows). `sampledAt`/`evaluatedAt`
  are honest wall-clock readings — determinism tests compare values, not
  clocks.
- **Metric validation** is per module (`BI_METRICS`) — an unknown metric is
  rejected at create/update.
- **Rollup:** counts + source health (live sample counts) computed per read.
- **Demo seed:** idempotent, seeds `org-demo-bi` config only — it never
  fabricates module data, so KPI values reflect whatever the stores contain.

## Session 96 — Decisions Logged (AI Software Factory / Application Builder)

- **Module prefix:** `Ab` types, `ab:*` Redis keys, `/api/v1/builder` route
  prefix (matches the authoritative V3.0 spec exactly), `apps/web/src/lib/
  appBuilder.ts` client, `/app/app-builder` route + sidebar label
  "Software Factory".
- **Builds are an honest state machine:** runs follow the spec's
  `BuildStatus` chain (QUEUED → GENERATING_CODE → TESTING → COMPILING →
  SIGNING → SUCCEEDED | FAILED) via explicit `advance` calls; every log
  entry records a real transition (step + timestamp + actor). SUCCEEDED
  finalizes and creates the artifact. `retry` only from FAILED; duplicate
  versions rejected.
- **Artifacts are real, not simulated:** the manifest embeds the project
  snapshot + real build logs + a real SBOM (pinned dependency catalog, else
  labeled "declared (unpinned)"); `sha256` is a real node:crypto hash and
  `sizeBytes` a real byte count. No update endpoint → immutable.
- **Human Decision Inbox gate (spec §7):** artifacts start unpublished;
  `request-release` → `decide` (approve/deny, audited) → `release` only when
  approved. Never automatic.
- **AI workforce registry:** the 6 functional clusters + 17 personas are a
  static real catalog; tasks carry `assignedAgent` + `group`.
- **AI task generation** carries `generationSource: manual | real |
  echo-demo` via the ProviderRegistry (demo banner in the UI when echo).
- **Rollup:** computed per read (counts, runs-by-status, avg build time from
  real startedAt→finalizedAt); deterministic across reads.
- **Demo seed:** idempotent, seeds `org-demo-ab`, gated behind
  `WINDELS_DEMO_DATA`.

## Session 95 — Decisions Logged (Enterprise Helpdesk & Customer Support)

- **Module prefix:** `Hd` types, `hd:*` Redis keys, `/api/v1/helpdesk` route
  prefix, `apps/web/src/lib/helpdesk.ts` client, `/app/helpdesk` route +
  sidebar label "Helpdesk".
- **Ticket numbers are real:** `HD-<n>` from a Redis monotonic counter
  (`hd:seq:<org>`) — stable and unique per org, never random.
- **SLA is deterministic:** target hours per priority (`urgent` 2h → `low`
  72h) drive `slaDueAt` at create and priority-change; compliance is measured
  on resolved tickets against their stored due date; overdue = open tickets
  with `slaDueAt < now`. Nothing invented.
- **Lifecycle is honest:** `new → open → pending → resolved → closed` with
  validated forward transitions; `resolvedAt`/`closedAt` stamped only on the
  real transition; re-transitions are idempotent no-ops; closed is terminal.
- **Comments** are a timeline with an `internal` staff-notes flag.
- **CRM integration:** a ticket linking a contact/company writes a real
  Session 90 CRM `note` activity (best-effort — never fails the ticket).
- **Rollup:** computed per read (counts, by-priority, SLA compliance %,
  avg resolution hours from real `resolvedAt − createdAt`, by-assignee);
  deterministic across reads.
- **Demo seed:** idempotent, seeds `org-demo-hd`, gated behind
  `WINDELS_DEMO_DATA`.

## Session 94 — Decisions Logged (Social Platform)

- **Module prefix:** `Sp` types, `sp:*` Redis keys, `/api/v1/social-platform`
  route prefix, `apps/web/src/lib/socialPlatform.ts` client,
  `/app/social` route + sidebar label "Social Platform".
- **Engagement is computed, never stored:** reactions live in a ledger
  (`sp:reaction:*`); per-emoji counts and totals are grouped from the ledger
  on every read. Comment counts likewise come from the comment ledger.
- **Reaction toggling is idempotent:** same author + post + emoji adds when
  absent and removes when present — no duplicate rows, no counters.
- **Hashtags are deterministic:** a pure regex extractor
  (`extractHashtags`) lowercases, dedupes and preserves order; stored at
  write time, aggregated for the top-hashtags rollup.
- **Post lifecycle honest:** draft → published | archived; `publishedAt`
  stamped only on the transition; re-publishing a published post is a no-op;
  publishing an archived post fails.
- **Deleting a post cascades** its comments and reactions.
- **Rollup:** computed per read (counts, top authors, top hashtags, recent
  feed); deterministic across reads.
- **Demo seed:** idempotent, seeds `org-demo-sp`, gated behind
  `WINDELS_DEMO_DATA`.

## Session 93 — Decisions Logged (Website Builder)

- **Module prefix:** `Wb` types, `wb:*` Redis keys, `/api/v1/website-builder`
  route prefix, `apps/web/src/lib/websiteBuilder.ts` client,
  `/app/website-builder` route + sidebar label "Website Builder".
- **Blocks are typed:** a Zod discriminated union per block type (hero/text/
  image/button/features/cta/divider/html) is the single validation point;
  `z.input` types make defaulted fields (hero `align`) optional on create and
  the service normalizes to the output type.
- **Renderer is pure & deterministic:** `renderPageHtml()` escapes all text
  fields and hrefs (the `html` block is an explicit, labeled raw-content
  escape hatch). `preview` and `publish` both call it, so `renderedHtml`
  snapshots are exactly renderer output — never fabricated.
- **Publish honesty:** status flips + `publishedAt` stamped only on the
  transition; re-publishing is idempotent and re-snapshots current output;
  publishing an archived site and publishing a site with no pages fail.
- **Slug/path uniqueness** enforced per org (site slug, page path within a
  site); `isHome` derived from `path === "/"`.
- **Rollup:** computed per read (counts, published pages, total rendered
  bytes); deterministic across reads.
- **Demo seed:** idempotent, seeds `org-demo-wb`, gated behind
  `WINDELS_DEMO_DATA`.

## Session 92 — Decisions Logged (Enterprise ERP)

- **Module prefix:** `Erp` types, `erp:*` Redis keys, `/api/v1/erp` route
  prefix, `apps/web/src/lib/erp.ts` client, `/app/erp` route + sidebar label
  "ERP".
- **Stock is never stored:** the movements ledger (`erp:movement:*`) is the
  single source of truth; current stock is Σ of movement quantities computed
  per read (`currentStock`). Order `receive`/`fulfill` actions create real
  ledger rows — no simulated inventory.
- **Order totals** are computed from line items at write and re-verified on
  read (hydrate recomputes `totalCents`).
- **Lifecycle honesty:** PO `draft → submitted → received | cancelled`; SO
  `draft → confirmed → fulfilled | cancelled`; `receivedAt`/`fulfilledAt`
  stamped only on the actual transition; closed orders reject further edits.
- **CRM hook (won deal → SO):** never fabricates a line item — a deal with no
  matching product creates an empty SO with the company link and the deal
  amount recorded in `note`. Sales-order items are therefore allowed to be
  empty at the schema level.
- **SKU uniqueness** is enforced per org (create + update).
- **Rollup:** computed per read — inventory value (Σ stock × cost), low stock
  (< reorderLevel), order totals by status; deterministic across reads.
- **Demo seed:** idempotent, seeds `org-demo-erp`, gated behind
  `WINDELS_DEMO_DATA`.

## Session 91 — Decisions Logged (Enterprise Email Intelligence)

- **Module prefix:** `Ei` types, `ei:*` Redis keys, `/api/v1/email-intel`
  route prefix, `apps/web/src/lib/emailIntel.ts` client, `/app/email-intel`
  route + sidebar label "Email Intel".
- **Threading:** messages group by reply chain (`inReplyTo`/`references`
  matching an existing messageId) first, then by normalized subject within a
  mailbox, else a new thread. The thread index is a cached cache of facts
  recomputed from the real message records on every write — never a source of
  truth on its own.
- **SMTP outbox:** a dependency-free SMTP client (`emailIntel/smtp.client.ts`)
  over `node:net`/`node:tls` speaks the real wire protocol (EHLO/MAIL/RCPT/
  DATA/QUIT). Key lessons baked in: consume CRLF fully when framing lines,
  buffer out-of-order/early lines FIFO (multi-line responses arrive faster
  than callers re-queue readers), and only treat a `250-…` continuation as
  final when the 4th char is not `-`.
- **Sending is honest:** no SMTP host → `SMTP_NOT_CONFIGURED`, message stays
  `queued`; real failures store the SMTP error code + message; `ALREADY_SENT`
  is reported idempotently.
- **Credentials:** mailbox passwords stored only via `encrypt()` (AES-256-GCM
  envelope); read endpoints return `hasCredentials`, never the blob.
- **Intelligence honesty:** AI drafts/summaries/triage via the ProviderRegistry
  carry `modelSource: real|echo-demo`; deterministic fallbacks carry
  `summaryKind: deterministic` / `triageKind: heuristic` so the UI can never
  mistake heuristic output for AI output.
- **CRM integration:** linking a message to a contact/deal/company writes a
  real `email` activity into the Session 90 CRM ledger (best-effort).
- **Rollup:** computed per read; avg response time measured from real
  `sentAt − receivedAt` pairs in the same thread; `null` when unmeasurable.
- **Demo seed:** idempotent, seeds `org-demo-ei`, gated behind
  `WINDELS_DEMO_DATA`.

## Session 90 — Decisions Logged (Enterprise CRM)

- **Module prefix:** `Crm` types, `crm:*` Redis keys, `/api/v1/crm` route
  prefix, `apps/web/src/lib/crm.ts` client, `/app/crm` route + sidebar label
  "CRM".
- **Storage:** Redis-backed, org-scoped (`crm:<entity>:i:<org>:<id>` + ZSET
  indexes `crm:<entity>:idx:<org>`), following the `tenantStore` key shape so
  the Session 89 namespace audit heuristic treats them as org-scoped.
- **Pipeline:** six fixed default stages (lead → qualified → proposal →
  negotiation → closed_won / closed_lost) with default probabilities; stage
  transitions record an audited `note` activity and stamp `wonAt`/`lostAt`
  only on real changes; a stage change without an explicit probability adopts
  the new stage's default.
- **Rollup:** computed per read (weighted forecast = Σ amount × probability,
  conversion = won / (won + lost), `null` when no closed deals). Never stored,
  never cached-as-fact, deterministic across repeated reads.
- **Demo seed:** `ensureDemoSeed` seeds a dedicated `org-demo-crm` org,
  idempotent, called only from `bootstrap.ts` behind `WINDELS_DEMO_DATA`.
- **Web UI:** dedicated `CrmPage` under `pages/crm/` (stats, pipeline bars,
  deals/contacts/companies lists, activity ledger, quick-create forms) using
  the shared `@/components/ui/*` primitives and the repo's Tailwind tokens.
- **Deals require a company** (no orphan deals); contacts may be company-less.
- **Kernel events:** every write emits `crm.<entity>.<action>` via
  `KernelService.dispatch` (best effort — never fails the write).
