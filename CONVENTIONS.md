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
