# Session 168 — Tier 3: the four "gated but reads still bootstrap" partials

**Modules:** `spatial`, `sustainability`, `dataMarketplace`, `digitalHumans`
**Track:** unfinished-module completion (14–17 of N)
**Rule under test:** *gating a seed is only safe if the empty state is safe* (S163) — and its
corollary, discovered here: **gating a seed is only safe if nothing else on the read path fabricates.**

These four were filed as one tier because they share a single symptom: `ensureBootstrapped`
is correctly gated behind `demoDataEnabled()`, but a **read** method calls it anyway. The
audit assumed that was the whole defect and that the tier was therefore cheap. Reading the
four services in full disproves that for three of them. The read-path call is the *cheapest*
thing wrong here. What the grep could not see:

- `digitalHumans.endSession` — a **live user action** — overwrites the real transcript length
  with `randInt(20,180)`.
- `digitalHumans.dashboard` — **double-counts** every session.
- `dataMarketplace.review` — the rolling average is divided by the **install** count, so real
  reviews cannot move the rating off ~0.
- Three of the four route files resolve the org as `(req.user as any).organizationId` with **no
  null guard**, and every service signature defaults `oid = "org-windels"`. A token with a null
  organization silently reads and writes the **house org**.

Only `spatial` matches the audit's description.

---

## 1. Defect inventory

### 1.1 `spatial` — one stray read-path seed (the tier's original shape)

| # | Defect | Location | Consequence |
|---|--------|----------|-------------|
| S1 | `listHoloDashboards` calls `ensureBootstrapped` behind an `exists(K.hds(oid))` guard | `spatial.service.ts:253` | With demo data **on**, listing holo-dashboards for an org that has none seeds *the whole module* — sessions, maps, waypoints, remote-expert sessions — as a side effect of a GET. |
| S2 | 9 routes read `(req.user as any).organizationId` with no null guard | `routes/spatial.ts:16–41` | Null-org token → `oid = undefined` → service default → **`org-windels`**. |

Everything else in `spatial` is sound: S156 replaced the fake device counts with a real
heartbeat ledger (`spa:devhb`), `dashboard()` derives every figure from stored documents, and
it already ships a `provenance` block naming what `devicesOnline` / `devicesSeen` /
`twinsVisualized` actually mean. **Do not rewrite this module.** Fix S1 and S2, leave the rest.
(S165's rule: check for existing remediation before rewriting.)

### 1.2 `sustainability` — unguarded read-path bootstrap + five self-declared lies

| # | Defect | Location | Consequence |
|---|--------|----------|-------------|
| U1 | `record()` calls `await this.ensureBootstrapped(undefined, oid)` **unconditionally** | `:176` | Not `exists`-guarded like the others. Cheap (the method returns early on `K.meta`), but it means *writing one real record* can first inject seven synthetic baseline records when demo data is on — the user's first real measurement arrives pre-contaminated. |
| U2 | `dashboard()` same unconditional call | `:212` | Same, on a pure read. |
| U3 | `energyRenewablePct`, `waterMl`, `wasteRecycledPct`, `offsetsPurchasedT`, `netZeroTargetYear` return `0` | `:end of dashboard()` | **The module's own `provenance` block labels all five `structural_zero`** and the code comment says they "report 0 rather than a plausible default". But `netZeroTargetYear: 0` is not a plausible-default-avoided, it is a **claim that the org's net-zero target is the year 0**, and `wasteRecycledPct: 0` is a claim of 0% recycling — a *worse* lie than a plausible default, because a dashboard renders it as a real number. The governing rule is explicit: **unmeasured values are `null`, never `0`**. S121 wrote the provenance block but did not finish the job on the values. |
| U4 | `EnergyMetric.renewablePct` / `costUsd` are `0` per month | `:energySeries` | Same defect, 12× per dashboard. The interface comments already say "Structural zero". |

`sustainability` is otherwise the healthiest of the four: S121 already nulled the ESG scores,
fixed the YTD windowing, fixed the compute-kWh double-count, and added provenance. U3/U4 are
the unfinished half of that same session.

### 1.3 `dataMarketplace` — a broken rating, an unreachable revenue figure, no tests

| # | Defect | Location | Consequence |
|---|--------|----------|-------------|
| D1 | **`review()` divides by installs, not reviews** | `:186` | `rating = (rating*installs + new) / (installs+1)`. A published asset starts `rating: 0, installs: 0`; after 100 installs and three 5-star reviews the rating reads **0.15 / 5**. Verified numerically. The rolling average is only correct if every install left exactly one review and no review is ever revised. There is no review ledger at all — `comment` is accepted by the route, validated by zod, and **discarded**. |
| D2 | `_rng.reseed(\`ensureBootstrapped:${logger}\`)` on line 47 | `:47` | Reseeds from the **string interpolation of a logger object** → the literal key `ensureBootstrapped:[object Object]`, or `ensureBootstrapped:undefined` from the three read paths. Two different call sites, two different RNG streams, same "deterministic" claim. It also runs **before** the `exists` check and before the demo gate, so a disabled-demo deployment still perturbs RNG state on every read. |
| D3 | 3 read-path bootstrap calls | `:77, :115, :125` | `dashboard`, `list`, `get` all seed. |
| D4 | 13 routes, no `orgOf`; `oid` defaults to `"org-windels"` | `routes/dataMarketplace.ts` | Null-org token reads/writes the house org. (The `/notes` sub-router *does* guard — 8 hits — so the module already knows the pattern and simply does not apply it to the 13 real routes.) |
| D5 | `qualityScore: 0.75` hard-coded on publish | `:170` | An unearned quality score presented as measurement. Nothing computes it. |
| D6 | `revenue30dUsd` counts one-time revenue forever | `:105` | The 30-day window is applied to subscriptions only; `licenseModel === "one_time"` revenue is added regardless of install date, so a "30d" figure includes a purchase from two years ago. |
| D7 | `rating`/`installs`/`qualityScore` seeded with `randInt(12,2400)` / `rand(3.2,4.9)` | `SEED` | Fine — demo-gated. Retained. |
| D8 | **No test file** | — | The module has none. |

### 1.4 `digitalHumans` — fabrication on a live path (the worst of the four)

| # | Defect | Location | Consequence |
|---|--------|----------|-------------|
| H1 | **`endSession` sets `s.transcriptLength = randInt(20,180)`** | `:138–142` | A **real user ending a real session** has the real transcript length (tracked from `startSession`, initialised `0`) **overwritten with an invented number**. The reseed on `:138` makes it *stably* invented — the same session id always yields the same fake length, which is exactly what makes it survive review. This is not a demo seed and no gate touches it. It is the single clearest violation of "no fabricated data" in the tier. |
| H2 | **`dashboard.totalSessions` double-counts** | `:92` | `humans.reduce(h.totalSessions) + sessions.length`. `startSession` **both** increments `h.totalSessions` **and** adds to the session set. One real session reports as **2**. With demo data on it is worse: seeded `totalSessions: randInt(20,400)` per avatar plus the seeded session rows. |
| H3 | `avgSatisfactionPct` divides by `Math.max(1, humans.length)` | `:93` | An org with **no** avatars reports `0.0%` satisfaction — a real-looking score for a product nobody has used. `Math.max(1, …)` converts "undefined" into "zero". |
| H4 | `create()` uses `setTimeout(…, 1500)` to flip `status: "training" → "ready"` | `:126` | **Fake training.** No model is trained, no job is queued, nothing is rendered. The avatar is "ready" 1.5 s later because a timer said so. The timer also dies with the process, so a create during shutdown leaves an avatar stuck in `training` forever, and the write is unawaited and unlogged. |
| H5 | `create()` sets `totalSessions: 0, avgSessionSec: 0, satisfactionPct: 0` | `:120` | `satisfactionPct: 0` on a brand-new avatar is a 0% satisfaction rating, not "unmeasured". Same class as U3. |
| H6 | `endSession` `avgSessionSec` recurrence divides by `totalSessions` | `:145` | `totalSessions` counts *started* sessions; the average is over *completed* ones. Start three, end one → the one duration is divided by 3. |
| H7 | Seeded avatars carry `satisfactionPct: rand(78,96)`, `avgSessionSec: randInt(90,600)` | `SEED` | Demo-gated. Retained. |
| H8 | `_rng.reseed(\`ensureBootstrapped:${logger}\`)` before the exists check and the gate | `:42` | Same as D2. |
| H9 | 3 read-path bootstrap calls | `:77, :101, :154` | `dashboard`, `list`, `get`. |
| H10 | 12 routes, no `orgOf` | `routes/digitalHumans.ts` | Same as D4 (its `/notes` sub-router guards; the 12 real routes do not). |
| H11 | **No test file, no web page** | — | Neither exists. |

---

## 2. What gets built

### 2.1 Shared contracts (`packages/shared/src/`)

**`sustainability.ts`** — widen five dashboard fields and two `EnergyMetric` fields to
`number | null`, matching the provenance block that already calls them structural zeros:

```ts
energyRenewablePct: number | null;   // null — no utility/renewables feed
waterMl: number | null;              // null — no water metering
wasteRecycledPct: number | null;     // null — no waste tracking
offsetsPurchasedT: number | null;    // null — no offset purchases recorded
netZeroTargetYear: number | null;    // null — no commitment declared
// EnergyMetric
renewablePct: number | null;
costUsd: number | null;
```

**`digitalHumans.ts`** — three changes:

```ts
// DigitalHuman
avgSessionSec: number | null;        // null until a session completes
satisfactionPct: number | null;      // null until a session is rated
totalSessions: number;               // retained: sessions STARTED (documented)
completedSessions: number;           // new: sessions ENDED — the avg denominator
ratedSessions: number;               // new: sessions with a rating — the satisfaction denominator

// DigitalHumanSession
transcriptLength: number;            // retained, but now only ever set by real turns
durationSec?: number;                // recorded at endSession from real timestamps

// DigitalHumanDashboard
totalSessions: number;               // now = sessions.length, counted once
avgSatisfactionPct: number | null;   // null when no avatar has a rating
avgSessionSec: number | null;
provenance: DhProvenance;            // new, S118/S121 pattern
```

**`dataMarketplace.ts`**:

```ts
// MarketplaceAsset
rating: number | null;               // null until the first review
reviewCount: number;                 // new — the correct denominator
qualityScore: number | null;         // null unless attested (was hard-coded 0.75)

// DmDashboard
revenue30dUsd: number;               // now genuinely 30d
provenance: DmProvenance;            // new
```

New `MarketplaceReview` interface + `dmp:rv:*` keys so `comment` stops being discarded.

`spatial.ts` — **unchanged**.

### 2.2 Services

**`spatial.service.ts`** — delete the `ensureBootstrapped` call at `:253`. One line. Nothing else.

**`sustainability.service.ts`** — replace the two unconditional `ensureBootstrapped` calls with
nothing (bootstrap belongs to `bootstrap.ts`, which already runs at startup); return `null` for
U3/U4 fields; update the provenance detail strings from "report 0" to "report null".

**`dataMarketplace.service.ts`**
- Delete the `_rng.reseed` on `:47`; move `_rng` usage inside the demo-gated block only.
- Delete the three read-path `ensureBootstrapped` calls.
- **Rewrite `review()`**: persist a `MarketplaceReview` row (`dmp:rv:{oid}:{id}`, set
  `dmp:rvs:{oid}:{assetId}`), recompute `rating` as the true mean over reviews, maintain
  `reviewCount`. One review per user per asset (re-review replaces).
- `publish()`: `rating: null`, `reviewCount: 0`, `qualityScore: null`.
- Fix `revenue30dUsd` to window one-time revenue by `installedAt` like subscriptions.
- Add a `provenance` block.

**`digitalHumans.service.ts`**
- **Delete the `endSession` reseed and the `transcriptLength = randInt(20,180)` line (H1).**
  `transcriptLength` stays whatever real turns recorded. Add a `recordTurn(sessionId, chars)`
  method so there is an honest way to increment it.
- `dashboard.totalSessions = sessions.length` (H2). Drop the `h.totalSessions` sum.
- `avgSatisfactionPct`: mean over avatars that have `satisfactionPct !== null`; `null` when none (H3).
- **Remove the `setTimeout` (H4).** A created avatar is `status: "draft"`, not `training`, and
  not `ready`. Add an explicit `markReady(id, oid)` for when something real completes. A status
  must be earned (S161).
- `create()`: `avgSessionSec: null`, `satisfactionPct: null`, `completedSessions: 0`, `ratedSessions: 0` (H5).
- `endSession`: record `durationSec` from real timestamps; increment `completedSessions`;
  divide `avgSessionSec` by `completedSessions` (H6); divide satisfaction by `ratedSessions`.
- Delete the bootstrap reseed (H8) and the three read-path calls (H9).
- Add a `provenance` block.

### 2.3 Routes — `orgOf` on all 34 unguarded routes

Add the `orgOf(req, res)` helper (the `voiceStudio.ts:56–63` pattern) to `spatial.ts` (9),
`dataMarketplace.ts` (13) and `digitalHumans.ts` (12). **And remove the `oid = "org-windels"`
default from every service signature in all four modules** — the default is what turns a
missing org into a silent cross-tenant read. `organizationId` becomes a required first parameter.

Two new routes: `POST /digital-humans/:id/ready` (markReady), `POST /digital-humans/sessions/:id/turn`
(recordTurn). One new: `GET /data-marketplace/assets/:id/reviews`.

### 2.4 Tenant isolation

Register the 17 currently-uncatalogued prefixes. Note `sp:*` (rows 91–93) is the **social**
module, not spatial — spatial uses `spa:*`, and none of its keys are registered:

```
spa:s spa:ss spa:hd spa:hds spa:mp spa:mps spa:wp spa:wps spa:rx spa:rxs
spa:dev spa:devhb spa:twin      → org_scoped
dmp:a dmp:as dmp:i dmp:is dmp:rev dmp:rv dmp:rvs → org_scoped
dh:h dh:hs dh:s dh:ss           → org_scoped
esg:* (verify existing)         → org_scoped
```

### 2.5 Tests

- `dataMarketplace.service.test.ts` — **new**. Must include a test that fails on the D1
  arithmetic: publish → 100 installs → three 5-star reviews → assert `rating === 5`, not `0.15`.
- `digitalHumans.service.test.ts` — **new**. Must include: `endSession` preserves a
  `transcriptLength` set by `recordTurn` (fails on H1); one started session ⇒
  `dashboard.totalSessions === 1` (fails on H2); empty org ⇒ `avgSatisfactionPct === null`
  (fails on H3); created avatar is not `ready` after 2 s (fails on H4).
- `spatial.test.ts` — extend: `listHoloDashboards` on an empty org with demo data **on** returns
  `[]` and leaves `spa:ss` unpopulated.
- `sustainability.completion.test.ts` — **update lines 274–278**, which currently *assert the
  bug* (`expect(d.energyRenewablePct).toBe(0)`). They become `toBeNull()`. This is the one place
  a test must change rather than be added; the old assertions encoded the S121 half-fix.
- Mutation check on each new discriminating test (the S167 technique).

### 2.6 Web

- `apps/web/src/pages/digitalHumans/DigitalHumansPage.tsx` — **new** (module has no page);
  `router.tsx` + `Sidebar.tsx` registration. Grep for name collisions first.
- `PlatformPage.tsx` — the four tabs must stop coercing nulls: `(data.energyRenewablePct||0).toFixed(0)`
  at `:7719–7722`, `(data.revenue30dUsd||0)` at `:7551`, `(a.ratingAvg||0)` at `:7578`,
  `(data.avgSatisfactionPct||0)` at `:7605` all render a fabricated `0`. Replace with an
  em-dash / "not measured" affordance. **`||0` on a nullable metric is the UI re-telling the
  lie the service just stopped telling.**
- `apps/web/src/lib/{digitalHumans,dataMarketplace}.ts` — retype.

### 2.7 e2e

`tests/e2e/digitalHumans.spec.ts` and `tests/e2e/dataMarketplace.spec.ts`, both with the
`secondOrgToken()` cross-tenant assertion (these are the two modules where the missing
`orgOf` made that assertion meaningful).

---

## 3. Order of work

1. Shared contracts (3 files) → `apps/web` tsc to surface every consumer.
2. `spatial` (2 line-level fixes) — smallest, proves the harness.
3. `sustainability` (nulls + 2 call sites + test update).
4. `dataMarketplace` (service rewrite of `review`, new tests).
5. `digitalHumans` (largest: H1–H11, new tests, new page).
6. Routes + `orgOf` + drop `oid` defaults across all four.
7. Tenant isolation rows.
8. Web pages / lib / PlatformPage null affordances.
9. e2e specs.
10. `PROGRESS.md` 🟡 · `CONVENTIONS.md` · `docs/UNFINISHED_MODULES.md` strike rows 8–11 · commit/push/PR.

## 4. Acceptance

- No read path calls `ensureBootstrapped` in any of the four modules.
- No `Math.random`/`_rng` call outside a `demoDataEnabled()`-gated block in any of the four.
- No service method defaults `organizationId` to `"org-windels"`.
- Every unmeasured value is `null`; no `0` stands in for "unknown"; no `||0` in the four tabs.
- `dataMarketplace` and `digitalHumans` each have a test file whose discriminating cases have
  been mutation-verified.
- `apps/web` tsc 0 errors; `apps/api` vitest ≥ 3064 passing (29 known Prisma failures).
- `PROGRESS.md` row is 🟡 — runtime validation is not possible in this sandbox.
