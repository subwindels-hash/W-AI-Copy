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
| Dead-code graph | `node scripts/find-orphans.mjs` | 1380 source files, 1105 reachable, **275 orphans** — 262 quarantined in `_scaffolds/`, **13 outside it awaiting a decision** (S212) |
| Marker sweep | `grep` for `TODO`/`FIXME`/`HACK` in comments | **5 hits** repo-wide (3 are prose, not debt) |
| Marker sweep (honest) | `grep` for `for now,` / `in a real implementation` / `mock data` | **25 hits** repo-wide, 21 of them in 10 quarantined files. The previously-reported 429 could not be reproduced (S212) |

The first grep is the important one. The repo is *not* littered with TODOs — it
has five, and three of those are explanatory prose. The debt is not marked
`TODO`; it is marked `// For now, ...` and it lives almost entirely in one
directory — now `apps/api/src/_scaffolds/`.

> **Correction (S212).** An earlier revision of this file reported **429**
> `// For now,` markers. The real count is **25** across the whole repo. The
> inflated figure appears to have counted substring matches such as the
> `for (const name of ...)` loop in `projectIntake.service.ts`. The *specific*
> examples listed under Finding 1 were each re-read and are accurate; only the
> aggregate was wrong.

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

### Decision — ✅ **RESOLVED S212: (B) quarantine the bulk, guard the dangerous**

The user chose to act rather than defer. What was done:

**263 files moved** from `apps/api/src/services/` to
`apps/api/src/_scaffolds/services/` via `git mv` (history preserved). The
services directory went from **304 files (94% unreachable)** to **41 reachable
services** — it is now readable. Relative imports in the moved files were
re-pointed one level deeper so the code still resolves and remains useful as a
design reference; **0 unresolved imports remain**.

**3 files stayed behind** because reachable code depends on them — this is the
part a blind move would have broken:

| File | Depended on by |
|---|---|
| `automatedBackup.service.ts` | `src/qa/drTest.service.ts` (real `pg_dump`/prisma code, a genuine (C) revive candidate) |
| `rowLevelSecurity.service.ts` | `src/index.ts`, `http/middleware/tenantContext.ts` |
| `serviceToServiceAuth.service.ts` | `src/services/serviceToServiceAuth.test.ts` |

**Security scaffolds neutralized in place.** Per the standing rule that an
always-passing control is worse than an absent one, four compliance checks and
three crypto functions now `throw`/return an explicit failure instead of
silently certifying. The original code is left directly beneath each guard.
See `apps/api/src/_scaffolds/README.md` for the table.

Deliberately **not** guarded: `tamperProofAudit.service.ts` uses genuine
asymmetric crypto and already fails safe (no key ⇒ empty signature ⇒
verification rejects). Its weakness is key *storage*, a deployment concern, not
a fabricated guarantee.

**Build gate collapsed.** `tsconfig.orphans.json` went from **267 per-file
exclusions to 17**: one `src/_scaffolds/**` glob plus the 13 genuine orphans
that are *not* quarantined. The exclude list now reads as a decision queue
rather than noise — which is most of the work for Finding 2 item 7.

**5 enforcement tests** (`_scaffolds/quarantine.test.ts`) fail if reachable code
ever imports a scaffold, if any security guard is removed, or if one of the
three kept files is moved.

### Still open — the 13 orphans outside `_scaffolds/`

These are *not* generated scaffolds and each wants its own decision:

```
src/architecture/notes.service.ts        src/services/activity.service.ts
src/canvasCollab/canvasCollab.service.ts src/services/publicApi.service.ts
src/enterprise/services/microservice.helper.ts  src/services/user.service.ts
src/http/middleware/tenantContext.ts     src/utils/notes.ts
src/http/routes/audit.ts                 src/http/routes/notifications.ts
src/http/routes/permissions.ts           src/http/routes/voiceFoundry.ts
src/http/routes/voiceStudio.ts
```

⚠️ **Five were route files never mounted in `server.ts`** — ✅ **fixed 2026-08-30,
see item 10.** They are now mounted and no longer orphans. Checking them
mechanically turned up **two more** (`infrastructure`, `cloudAndroidPublic`)
that the orphan scan could not see, because both are imported from somewhere and
so never registered as unreachable. The remaining entries in the list above are
genuine dead code awaiting a delete/revive decision.

> **Note on the stale baseline.** The `tsconfig.orphans.json` committed at
> `1a066ad` did not match what `find-orphans.mjs` actually produced — those 13
> were already orphans but were absent from the file. Regenerate it rather than
> trusting it.

---

## Finding 2 — genuine in-product debt (small, specific, actionable)

These are in **reachable** code. This is the whole list; it is short.

| # | Module | File:line | Defect | Fix |
|---|---|---|---|---|
| 1 | `architecture` | `esiAggregation.service.ts:77` | ~~ESI trading section reports the **global** catalogue and hardcodes `positionsOpen: null`, `pnl24hUsd: null` with a "see S194" note.~~ | ✅ **DONE 2026-08-30.** The per-org column is real. `tradingIntel` keeps positions under one global `ti:positions` key belonging to no tenant (and seeded with a demo book), so rather than org-scope that, the section now reads `BrokerIntegrationService.dashboard(oid)` — already org-scoped — for `connectedBrokerAccounts`, `positionsOpen` and `pnlTodayUsd`. Catalogue rows are labelled "(global)", portfolio rows "(this org)". An org with no broker reports a **measured 0**; an unreachable broker module leaves the rows **null** rather than claiming a flat book. 4 regression tests (7 total pass; all 4 fail against the previous commit). |
| 2 | `videoTransform` | `transform.service.ts:555` | ~~`default:` branch is a documented pass-through for "unimplemented-but-declared nodes".~~ **The reported premise was wrong and the real defect was worse.** Enumerating all 35 `VtNodeKind`s against the executor switch showed **zero** reach `default:` — it is unreachable dead code. The inertness had moved into *named* cases: `video_trim`/`crop`/`resize`/`fps`/`transform` shared one branch that spread the input port onto the output, so all five were **indistinguishable from each other and from a no-op** — a Trim with `startSec:0,endSec:5` returned the untouched source; `video_merge` **silently dropped input B**; `image_upscaler` returned the original at the original size; and `condition` emitted on **both** the true and false ports regardless of its expression, running every downstream branch. | ✅ **DONE 2026-08-30.** Split into three outcomes by what is actually buildable. **Implemented for real:** trim/crop/resize/fps/scale are now ffmpeg filters (`applyFilterOp`, seek args for trim, aspect-preserving pad for resize, even-dimension rounding for yuv420p), plus `concatVideos` for merge and `compositeOver` for composite; each re-encodes, stores via `storeDerived`, meters bytes and re-registers as a source so downstream nodes can consume it. `delay` now honours its `ms`. **Rejected honestly:** `image_editor`, `image_upscaler` and `condition` have no implementation, so they are listed in `UNIMPLEMENTED_NODE_KINDS`, throw 501 in the executor, are refused by validation, and are rendered `disabled` in the palette — a user can no longer build the inert graph at all. **Made impossible to reintroduce:** the dead `default:` branch is now `const unhandled: never = node.kind`, so adding a kind without an executor is a compile error rather than a silent pass-through. New `validateWorkflow()` also catches unset filter settings (a Trim left at its `endSec` default of 0 was the silent case), unconnected inputs, and merge/composite missing a second input; it gates `runWorkflowJob`, gates `POST /run` **synchronously** (a 202 followed by an async failure reads as "it ran"), and is exposed via `GET /workflows/:id/validate` so the editor lists every problem before Run. 17 regression tests. |
| 3 | `mediaGen` | `mediaGen.service.ts:186` | ~~`videoOpsStubbed` — video capabilities `throw "stubbed pending downstream session"`, surfaced as "Video Stubs: S62 stub". Honest and visible.~~ **The reported premise was inverted; this was the most misleading module on the list.** All 24 seeded capabilities were `status: "online"` and **zero** were `"stub"`, so the `status === "stub"` guard was **dead code**, `videoOpsStubbed` was permanently **false**, and the console actually read **"Video Stubs: none"**. Nothing threw. `runJob()` slept for `avgMs`, set `status: "completed"`, and wrote `url: /api/v1/media-generation/asset/<modality>/<hash>.<ext>` — **a route that does not exist** (`mediaGen.ts` has six routes, none serve assets). This applied to **all three modalities**, not just video: every image, audio and video request returned a completed job with a 404 URL, and a caller polling for `completed` had no way to learn nothing was generated. | ✅ **DONE 2026-08-30** (user chose fail-closed across all modalities). No inference provider is wired for any modality, so `PROVIDER_STATUS` seeds every capability `offline` and `submit()` refuses with **503 `PROVIDER_NOT_CONFIGURED`** naming the modality/op — the guard now tests `!== "online"` rather than a status nothing wrote. `runJob()` has a second gate: without a provider a job becomes `failed` with a configuration message, never `completed`. The simulator is **opt-in** via `MG_SIMULATE=1`, stamps `provider: "sim"`, and **no longer emits an asset URL** (`url` is `undefined` + an explicit `SIMULATED` note), so nothing advertises a 404. `MgDashboard` gains `providersConfigured` / `simulated`; the console stat became "Generation: not configured / simulated / live" with a banner, and ESI reports `capabilitiesOnline: 0` instead of a healthy-looking queue. Safety screening and the tenant guard are unchanged and still tested. 9 regression tests; **7 fail against the pre-fix service**, including `expected '/api/v1/media-generation/asset/video/…' to be undefined`. |
| 4 | `sdk` / docs | `apps/web/src/lib/docs.ts:130` | ~~Docs advertise **"Coming soon — TypeScript and Python clients"** with a commented-out import sample.~~ | ✅ **DONE 2026-08-30.** Section retitled "API Clients" and rewritten against the real key-authenticated `/api/rest/v1` gateway: runnable TypeScript and Python samples using `X-Api-Key`, plus the 9 live endpoints. No unbuilt package is promised. |
| 5 | `commerce` | `commerce.service.ts:24` | ~~`PLACEHOLDER_UNIT_PRICE = 100` used when a product is absent from the catalog.~~ **Worse than first reported** — nothing in the repo ever wrote `commerce:product:*`, and `getProducts()` cached its own empty result for 300s, so `getProduct()` *always* returned null and **every cart and every order in the module was billed at the invented 100/unit**. | ✅ **DONE 2026-08-30.** Constant deleted; pricing is fail-closed via `priceOf()` (400 naming the product). Added the missing catalog write path (`upsertProduct` / `deleteProduct`, `PUT`/`DELETE /commerce/products/:id`, `commerceRoutesSchema.upsertProduct`) and made `getProducts()` read a real `commerce:product:idx:<org>` index with category/search/inStock filters and paging. 6 regression tests added (19 pass; 14 fail against the old service, and the fail-closed case resolves instead of rejecting — the defect is genuinely pinned). |
| 6 | `desktop/nfc` | `pcscBridge.ts:350` | Permanent locking `throw`s "not implemented for this identifier". | Correct behaviour (fails closed). Track only; no action needed. |
| 8 | `commerce` | `CommercePage.tsx:47,52` vs `commerce.service.ts` | ~~**Found while fixing #5.** The console renders `${p.price/100}` and `${dashboard.totalRevenue/100}` — treating price as **cents** — while the service stored a plain number and the schema accepted decimals (`9.99`), so a product created at 9.99 displayed as **`$0.0999`**.~~ | ✅ **DONE 2026-08-30.** Migrated commerce to the repo-wide `*Cents` integer convention already used by `erp`, `crm`, `licensing` and `revenueGuardian`: `priceCents`, `subtotalCents`, `unitPriceCents`/`totalPriceCents`, `taxCents`/`shippingCents`/`totalCents`, `totalRevenueCents`/`avgOrderValueCents`. Schema is `z.number().int().min(0)`, and `priceOf()` rejects any non-integer, so a fractional price fails closed instead of drifting. Added `apps/web/src/lib/money.ts` (`formatCents`, `formatCentsCompact`, `parseMajorUnitsToCents`) with 7 tests, replacing every inline `/100` on the page; unmeasured amounts render `—`, never `$0.00`. 3 new service regression tests (26 total pass). |
| 9 | `mediaGen` | `mediaGen.service.ts` / `http/routes/mediaGen.ts` | **Found while fixing #3, deferred by decision.** There is no asset-serving route: `/api/v1/media-generation/asset/:modality/:hash.:ext` was referenced by completed jobs but never registered. S211 stopped *advertising* the dangling URL, so nothing 404s today, but the module still has **no way to deliver output** once a real provider is wired. | Add the asset route (and a storage path) as part of provider integration — `videoTransform`'s `publicAssetUrl` + `writeAsset` in `storage.ts` is the working precedent. |
| 10 | routing (`notifications`, `audit`, `permissions`, `voiceFoundry`, `voiceStudio`, `infrastructure`, `cloudAndroidPublic`) | `http/server.ts` | ~~Five route files exist but are never mounted.~~ **Seven, not five** — a mechanical check of `register*Routes` exports against `server.ts` found two more the orphan scan missed (`infrastructure`, `cloudAndroidPublic`), because those two *are* imported somewhere and so never looked orphaned. Every endpoint 404'd: `apps/web/src/lib/notifications.ts` called four dead paths and `apps/web/src/lib/infrastructure.ts` called seven (`/platform/infra/overview`, `cluster`, `nodes`, `pods`, `workloads`, `alerts`, `metrics/series`). | ✅ **DONE 2026-08-30.** All seven mounted, each on the router that supplies its auth context rather than uniformly on `v1`: `notifications`/`audit`/`permissions` on dedicated sub-routers (they define `/` and `/:id`, which would collide at the v1 root); `infrastructure` on `platformRouter`, whose own header says it expects a parent that already applied `authenticate`; `cloudAndroidPublic` on the **API-key gateway** `publicRouter` (`/api/rest/v1`) — it uses `requireScope` and reads `req.apiOrganization`, so mounting it on the JWT `v1` router would have shadowed the live `routes/cloudAndroid.ts` with handlers whose auth context is never populated there. `voiceFoundry` and `voiceStudio` import `authenticate` but never apply it while dereferencing `req.user!.id` (`voiceStudio.ts:88`), so `authenticate` is attached at their mount points — mounting them as-written would have exposed unauthenticated endpoints that then crash. 6 regression tests in `http/routeMounting.test.ts`, including a generic check that **every** exported `register*Routes` is called, so the next unmounted router fails CI instead of shipping. |
| 7 | build gate | `apps/api/tsconfig.json` | Extends `tsconfig.orphans.json`. **Partly addressed S212:** the exclude list collapsed from 267 per-file entries to 17 (one `src/_scaffolds/**` glob + 13 real orphans), so the gate now excludes a clearly-labelled quarantine rather than an opaque blob. Still open: `strict: false`, `noImplicitAny: false`, `strictNullChecks: false` repo-wide. | Resolve the 13 remaining orphans (item 10 covers 5 of them), then the only exclude left is `_scaffolds/**` — which is correct and should stay. Re-enabling `strict` remains a separate, larger project. **UNVERIFIED:** the claimed ~377 type errors could not be checked; `tsc` cannot run without `node_modules` (`npx tsc` prints "This is not the tsc command you are looking for" and exits 0 — never read that as success). |

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
4. ~~**Finding 2, item 1**~~ — ✅ **done 2026-08-30.** ESI's trading section now
   reports real per-org broker positions and P&L.
5. ~~**Finding 2, items 2–3**~~ — ✅ **both done 2026-08-30.**

   **Read this before trusting any remaining row.** Both items' reported
   premises turned out to be wrong, and in the same direction — the write-up
   was *more* flattering than the code. Item 2's `default:` branch was
   unreachable dead code while the inert nodes hid in *named* cases; item 3 was
   described as "honest and visible" when the honesty signal was permanently
   off and the module was fabricating completed jobs on all three modalities.
   In both cases a marker comment had been read as a description of behaviour.
   Verify the remaining rows against the code — grep for the claimed string and
   check it is actually reachable — before scheduling them.

   *Adjacent cleanup still available:* `ErpPage`, `CrmPage` and `LicensingPage`
   each hand-roll their own `fmtCents`/`usd` and can now import the shared
   helper; deferred to keep the commerce change scoped.
   *Adjacent cleanup available:* `ErpPage`, `CrmPage` and `LicensingPage` each
   hand-roll their own `fmtCents`/`usd`. They can now import the shared helper;
   deferred to keep the commerce change scoped.
   *Also surfaced (now fixed):* see item 5b.
5b. ~~**`tradingIntel` cross-tenant portfolio leak**~~ — ✅ **done 2026-08-30.**
   `/positions`, `/risk` and `/dashboard/rollup` took `_req` and read three
   global keys (`ti:positions`, `ti:pos:*`, `ti:risk`) written by exactly one
   thing: the `WINDELS_DEMO_DATA` seed. Every authenticated org admin was
   therefore served the *same* book, and with the seed on that book was
   fabricated — three winning positions and a $2.48M / 1.82-Sharpe risk
   profile — presented as the tenant's own. Same defect shape as S165/S179.

   Fixed by deriving portfolio state per-org rather than org-scoping the demo
   keys: a global portfolio key has no legitimate reader, so the seed block and
   the three `K` entries were **deleted** (grep confirms zero remaining
   references). `riskProfile(oid)` / `listPositions(oid)` now read the already
   org-scoped `BrokerIntegrationService`, mapping `BrokerPosition` →
   `TiPosition`; `dashboard(oid?)` passes it through and yields an **empty**
   book without an org, never the global one. Both fail closed with 403
   `FORBIDDEN` when the session carries no org (a missing org is a broken
   session, not an anonymous caller — the router already requires
   `authenticate` + `ORG_ADMIN`).

   `TiRiskProfile`'s metric fields were widened to `number | null`: the old
   all-required shape is *why* the seed could assert a 1.82 Sharpe — there was
   no way to encode "not computed". `totalExposureUsd` is summed from live
   notionals; every metric needing a risk model or return series is `null`, and
   `PlatformPage` renders those as "not modelled" instead of a blank. 6
   regression tests in `portfolioIsolation.test.ts`; **all 5 logic tests fail
   against the pre-fix service** (`expected [ 'NVDA' ] to deeply equal
   [ 'BTCUSD', 'EURUSD' ]`, `promise resolved instead of rejecting`, …).

6. **Finding 3** — schedule one run in the target environment; it converts the
   entire 🟡 column to 🟢 or produces the first real defect list in months.
7. **Finding 2, item 7** — tighten the build gate once (1) has landed.

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
