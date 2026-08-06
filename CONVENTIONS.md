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
