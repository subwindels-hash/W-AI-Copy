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
