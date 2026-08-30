# Unfinished Work List — concrete, per-module

> Generated 2026-08-30 on branch `arena/01a05274-w-ai-copy` by direct inspection
> of the working tree. This is a **work order**, not a status badge. It exists
> because `docs/UNFINISHED_MODULES_LIST.md` correctly reports
> "155 COMPLETE / 0 PARTIAL / 0 STUB" *by the scanner's four gates* — and that
> verdict is true and also not the whole picture.
>
> **How to read this file:** every claim below was re-derived from the tree, not
> copied from a previous audit. Where a number came from a tool that could not
> run in this sandbox, it is labelled **UNVERIFIED** rather than repeated as
> fact.

## Method

| Check | Command | Result |
|---|---|---|
| Module inventory | `node audit/build-inventory.mjs` | 155 modules, 155 COMPLETE, 0 PARTIAL, 0 STUB |
| Dead-code graph | `node scripts/find-orphans.mjs` | 1377 source files, 1109 reachable, **268 orphans** |
| Marker sweep | `grep` for `TODO`/`FIXME`/`HACK` in comments | **5 hits** repo-wide (3 are prose, not debt) |
| Marker sweep (honest) | `grep` for `for now,` / `in a real implementation` / `mock data` | 429 hits, **all inside orphaned files** |

The first grep is the important one. The repo is *not* littered with TODOs — it
has five, and three of those are explanatory prose. The debt is not marked
`TODO`; it is marked `// For now, ...` and it lives almost entirely in one
directory.

---

## Finding 1 — the dominant item: 265 orphaned service scaffolds

`apps/api/src/services/` contains **304 `*.service.ts` files, 193,179 LOC**.
Of those, **265 files / 181,227 LOC (94% of the directory) are imported by
nothing** — not by `src/index.ts`, not by any route, not by any test.

This is already known to the repo and already contained: they are listed in
`apps/api/tsconfig.orphans.json`, whose own header says they are
*"bulk-generated scaffolds that do not typecheck, so they are kept out of the
build gate."* Its stated error count is ~377 type errors — **UNVERIFIED here**,
because `node_modules` is not installed in this sandbox and `tsc` cannot run.

Two of the 265 have a test file (`serviceToServiceAuth`, `webSearch`); the other
263 have none.

### Why this is the top item

The 429 `// For now,` markers are not scattered across the product — every one
of them is in this orphan set. Representative samples, all verified by reading
the file:

| File | Line | What it actually does |
|---|---|---|
| `aiModelSelection.service.ts` | 604 | `getAvailableModels()` — `// For now, return mock data`; returns a hardcoded GPT-4 entry with invented latency/cost/quality numbers |
| `aiModelLifecycleInsights.service.ts` | 276 | `// For now, generating sample insights`; pushes a fabricated "Validation Stage Bottleneck" with invented 5.2-day metrics |
| `automatedComplianceScanning.service.ts` | 472/488/612 | `checkPIIInLogs`, `checkEncryptionAtRest`, `checkDataExport` each `return violations` — an **empty array**, i.e. a compliance scan that always passes |
| `modelPackaging.service.ts` | 386/446 | "signing" is `sha256(checksum + privateKey)`; `calculateChecksum` hashes the **URL string**, not the file |
| `queryAnalysis.service.ts` | 370 | `p95 = max * 0.8`, `p99 = max * 0.95` — percentiles invented from the max |
| `aiTaskScheduling.service.ts` | 423 | `// For now, we'll simulate immediate execution` — `setTimeout(..., 100)` in place of a queue |
| `dataMasking.service.ts` | 319 | rules with a `condition` are silently `continue`d — conditional masking never applies |
| `tamperProofAudit.service.ts` | 134 | signing key in Redis, self-described "not ideal but better than nothing" |

Note the pattern: an always-passing compliance scanner and a fake package
signature are *worse than absent* if anything ever wires them up. Right now
nothing does, which is the only reason these are low-severity today.

### Themes (265 files)

| Theme | Count | Examples |
|---|---|---|
| MLOps / model lifecycle | 95 | `aiModel*` (79 files), `automlPipeline`, `hyperparameterOptimization`, `driftAnomalyDetection` |
| Infra / ops / reliability | 33 | `aiAutoScaling`, `apiCaching`, `loadBalancing`, `pointInTimeRecovery`, `alertManagement` |
| Governance / compliance / ethics | 32 | `automatedComplianceScanning`, `aiEthicalMonitoring`, `piiDetection`, `dataMasking`, `tamperProofAudit` |
| Data / feature / pipeline | 17 | `aiFeatureStore`, `aiDataQuality`, `syntheticDataGeneration`, `labelQualityAssurance` |
| Security | 13 | `adversarialDefense`, `ddosProtection`, `webApplicationFirewall`, `vulnerabilityScanning` |
| Robotics / IoT / twin / quantum | 14 | `twinSimulationEngine`, `iotDataPipeline`, `motionPlanningControl`, `quantumCircuitManagement` |
| NLP / vision / speech | 8 | `speechRecognition`, `imageRecognition`, `ocrDocumentIntelligence`, `textAnalysisUnderstanding` |
| Blockchain | 2 | `blockchainNetworkManagement`, `smartContractManagement` |
| Agent / planning / misc | 51 | `planning`, `worldState`, `consensus`, `goalManagement`, `executiveDashboard` |

Largest single files: `aiEthicalMonitoring` (1254), `aiCompressionBenchmarking`
(1171), `twinSimulationEngine` (1144), `aiModelShadowTesting` (1113),
`smartContractManagement` (1111).

### Recommended decision — pick one, per theme, not per file

This is a **product decision, not a coding task**, and it should be made before
any code is written. The options:

- **(A) Delete.** 181k LOC of unreachable scaffolding removed. Git history
  preserves it; `git revert` or a tag restores it. Cheapest, honest, and makes
  `find-orphans.mjs` report ~3 instead of 268.
- **(B) Quarantine.** Move to `apps/api/src/_scaffolds/` with a README stating
  they are unwired generated drafts. Keeps the code visible as a design sketch
  without it reading as shipped product.
- **(C) Revive selectively.** Choose the handful with genuine product intent,
  fix their types, wire routes + shared contract + client + tests, and let them
  become real inventory modules — the same treatment Sessions 155–208 gave the
  other modules.

**My recommendation: (B) for the bulk, (C) for a shortlist, never (A) blind.**
And if any file is revived, the always-passing checks
(`automatedComplianceScanning`) and the fake crypto (`modelPackaging`,
`tamperProofAudit`) must be fixed **in the same change** or replaced with an
explicit `throw new Error("not configured")` — a security control that silently
returns "no violations" is the single most dangerous artifact in this set.

---

## Finding 2 — genuine in-product debt (small, specific, actionable)

These are in **reachable** code. This is the whole list; it is short.

| # | Module | File:line | Defect | Fix |
|---|---|---|---|---|
| 1 | `architecture` | `esiAggregation.service.ts:77` | ESI trading section reports the **global** catalogue and hardcodes `positionsOpen: null`, `pnl24hUsd: null` with a "see S194" note. Per-org portfolio state is never surfaced. | Expose per-org positions/PnL from `tradingIntel` and fill the two null metrics. *Honest today* — it reports `null`, not a fake number — but it is a declared, unfinished handoff. |
| 2 | `videoTransform` | `transform.service.ts:555` | `default:` branch is a documented pass-through for "unimplemented-but-declared nodes". Declared node kinds silently do nothing. | Enumerate which node kinds land in `default`; either implement them or reject them at workflow-validation time so a user cannot build a graph with inert nodes. |
| 3 | `mediaGen` | `mediaGen.service.ts:186` | `videoOpsStubbed` — video capabilities `throw "stubbed pending downstream session"`. Surfaced in the UI as `PlatformPage.tsx:6312` "Video Stubs: S62 stub". | Honest and visible. Close by routing video ops to the real `videoEngine`/`videoTransform` modules, which now exist. |
| 4 | `sdk` / docs | `apps/web/src/lib/docs.ts:130` | ~~Docs advertise **"Coming soon — TypeScript and Python clients"** with a commented-out import sample.~~ | ✅ **DONE 2026-08-30.** Section retitled "API Clients" and rewritten against the real key-authenticated `/api/rest/v1` gateway: runnable TypeScript and Python samples using `X-Api-Key`, plus the 9 live endpoints. No unbuilt package is promised. |
| 5 | `commerce` | `commerce.service.ts:24` | ~~`PLACEHOLDER_UNIT_PRICE = 100` used when a product is absent from the catalog.~~ **Worse than first reported** — nothing in the repo ever wrote `commerce:product:*`, and `getProducts()` cached its own empty result for 300s, so `getProduct()` *always* returned null and **every cart and every order in the module was billed at the invented 100/unit**. | ✅ **DONE 2026-08-30.** Constant deleted; pricing is fail-closed via `priceOf()` (400 naming the product). Added the missing catalog write path (`upsertProduct` / `deleteProduct`, `PUT`/`DELETE /commerce/products/:id`, `commerceRoutesSchema.upsertProduct`) and made `getProducts()` read a real `commerce:product:idx:<org>` index with category/search/inStock filters and paging. 6 regression tests added (19 pass; 14 fail against the old service, and the fail-closed case resolves instead of rejecting — the defect is genuinely pinned). |
| 6 | `desktop/nfc` | `pcscBridge.ts:350` | Permanent locking `throw`s "not implemented for this identifier". | Correct behaviour (fails closed). Track only; no action needed. |
| 8 | `commerce` | `CommercePage.tsx:47,52` vs `commerce.service.ts` | ~~**Found while fixing #5.** The console renders `${p.price/100}` and `${dashboard.totalRevenue/100}` — treating price as **cents** — while the service stored a plain number and the schema accepted decimals (`9.99`), so a product created at 9.99 displayed as **`$0.0999`**.~~ | ✅ **DONE 2026-08-30.** Migrated commerce to the repo-wide `*Cents` integer convention already used by `erp`, `crm`, `licensing` and `revenueGuardian`: `priceCents`, `subtotalCents`, `unitPriceCents`/`totalPriceCents`, `taxCents`/`shippingCents`/`totalCents`, `totalRevenueCents`/`avgOrderValueCents`. Schema is `z.number().int().min(0)`, and `priceOf()` rejects any non-integer, so a fractional price fails closed instead of drifting. Added `apps/web/src/lib/money.ts` (`formatCents`, `formatCentsCompact`, `parseMajorUnitsToCents`) with 7 tests, replacing every inline `/100` on the page; unmeasured amounts render `—`, never `$0.00`. 3 new service regression tests (26 total pass). |
| 7 | build gate | `apps/api/tsconfig.json` | Extends `tsconfig.orphans.json`, so the **265 orphans are excluded from typecheck**. `strict: false`, `noImplicitAny: false`, `strictNullChecks: false` repo-wide. | After Finding 1 is resolved, drop the orphans extend so `tsc` covers `src/**`. Re-enabling `strict` is a separate, larger project. |

---

## Finding 3 — runtime certification (unchanged, still the largest block)

Every session row in `PROGRESS.md` is 🟡 **VERIFIED (partial)**. **Zero are
🟢 PRODUCTION COMPLETE.** Every `docs/SESSION_*_RUNTIME_VALIDATION_CHECKLIST.md`
is open for one reason: no sandbox in this project has reached live PostgreSQL 17
+ Redis, and `prisma generate` cannot download its engine from
`binaries.prisma.sh`.

This is **infrastructure, not code**, and no amount of work in this repo closes
it. It needs one run in the target deployment environment. Until then the honest
description of the platform is "155 modules implemented and unit-tested, none
runtime-certified".

Blocked gates, verbatim from `PROGRESS.md`:
- `prisma generate` (engine download network-blocked)
- Migration deploy / rollback / schema-drift verification (needs live Postgres)
- Live API boot, `/healthz`, end-to-end journeys, real-provider AI streaming
- Playwright e2e specs (run against a live API + Redis)
- Production / desktop / mobile builds requiring the generated Prisma client

---

## Finding 4 — 🔴 modules blocked on external providers

Implemented and honestly labelled, but cannot produce real output without
third-party credentials. Not defects; procurement items.

`robotics`, `spatial`, `quantum`, `biomedical`, `legal`, `education`,
`scientific`, market data (`tradingIntel` feeds), voice cloning
(`voiceFoundry` / `voiceOwnership`).

---

## Suggested order

1. **Decide Finding 1** (delete / quarantine / revive). Blocks nothing else but
   dominates every "how much is unfinished?" question — 181k LOC is 94% of the
   services directory and 100% of the `// For now,` markers.
2. ~~**Finding 2, items 4 and 5**~~ — ✅ **done 2026-08-30.** Both user-facing
   claims closed: the docs no longer promise an unbuilt SDK, and commerce no
   longer invents a price. Item 5 turned out to be a live mispricing bug
   affecting every order, not a dormant fallback.
3. ~~**Finding 2, item 8**~~ — ✅ **done 2026-08-30.** Commerce now uses integer
   minor units end to end, with a shared `formatCents` helper.
4. **Finding 2, items 1–3** — real feature handoffs, one session each, in the
   established Sessions 155–208 pattern.
   *Adjacent cleanup available:* `ErpPage`, `CrmPage` and `LicensingPage` each
   hand-roll their own `fmtCents`/`usd`. They can now import the shared helper;
   deferred here to keep this change scoped to commerce.
5. **Finding 3** — schedule one run in the target environment; it converts the
   entire 🟡 column to 🟢 or produces the first real defect list in months.
6. **Finding 2, item 7** — tighten the build gate once (1) has landed.

---

## What this file deliberately does not claim

- It does **not** say the 155-module COMPLETE verdict is wrong. It is accurate
  for what it measures: routes, a shared contract, a web client, tests, a
  console page.
- It does **not** treat the 265 orphans as "modules". They are not in the
  inventory, have no routes, and no user can reach them. They are unfinished
  *code*, not unfinished *modules* — which is precisely why the scanner is
  silent about them and why this file exists alongside it.
- The ~377 orphan type-error figure is quoted from
  `apps/api/tsconfig.orphans.json` and is **UNVERIFIED** in this sandbox.
