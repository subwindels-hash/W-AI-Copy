# Unfinished Modules — audit as of 2026-08-14

**Scope:** which modules are still unfinished *in substance*, using the same
defect signature the completion track (Sessions 155–160) used, not the
scanner's four gates.

## Why the inventory says zero

`audit/module-inventory.json` reports **125 modules / 125 COMPLETE / 0 PARTIAL**.
That number is a heuristic (routes ≥ 5 + client + shared types + tests) and it
already lied six times: `robotics` was COMPLETE in the inventory while it could
not ingest a reading (S155). `README.md` says as much — the count is
"a heuristic rather than a work order".

The completion track numbers its own specs `unfinished-module track, N/N` and
stops at **6/N** (`docs/SESSION_160_SPECIFICATION.md`). `N` was never
enumerated anywhere in the repo. This document enumerates it.

## Already completed on the track (do not redo)

| Session | Module | Fixed |
|---|---|---|
| 155 | `robotics` | telemetry ingest, null averages, `local_state_only` commands |
| 156 | `spatial` | seed gated, `devicesOnline` = 120s heartbeat window |
| 157 | `quantum` | connectors never `connected`, null qubits, jobs stay queued |
| 158 | `legal` | null pass-rate / risk on empty register |
| 159 | `education` | null mastery, real learner set, recorded hours |
| 160 | `scientific` | null KG/citations, no `1e6` divide, domains counted |
| 161 | `cyber` | fabricated cloud findings + held certs → registers; null stats |
| 162 | `voiceStudio` | **cross-tenant leak in a biometric store**; null latency; real 24h window |

## Update (S161): the committed inventory was also stale

Regenerating `audit/module-inventory.json` during Session 161 changed the
counts materially — the file in git was **out of date**, not just heuristic:

| | committed | regenerated |
|---|---|---|
| modules | 125 | **142** |
| COMPLETE | 125 | 133 |
| PARTIAL | 0 | **3** — `aiCommerce`, `conversationManage`, `developerGateway` |
| MISSING | 0 | **1** — `channels` |
| STUB | 0 | **5** — `cinematicAssets`, `videoAssets`, `videoEngine`, `videoTransformAssets`, `videoTransformerAssets` |

So "125/125 COMPLETE" was not merely a soft heuristic; 17 modules had been
added since the file was last generated and were not being scanned at all.
The nine non-COMPLETE modules above join the queue below.

## Unfinished modules

The defect signature, in the track's own words: **a read path must never be a
seeder**, **a seed must be gated behind `WINDELS_DEMO_DATA`**, and **an
unmeasured value is `null`, never `0`**.

### Tier 1 — ungated seed reachable from a read (the S156 defect, verbatim)

A GET on a fresh org invents records. This is the exact bug spatial had.

| # | Module | Defect |
|---|---|---|
| ~~1~~ | ~~`cyber`~~ | **DONE in S161.** |
| ~~2~~ | ~~`voiceStudio`~~ | **DONE in S162.** Inspection found far worse than the latency constant: no org segment in *any* key, `listPresets()`/`listJobs()` unscoped — every tenant could read every other tenant's cloned voices (biometric data), presets and TTS history. |
| ~~3~~ | ~~`constitution`~~ | **DONE in S163.** The seed was the least of it. `checkRequest` **failed open twice**: an org with no constitution got `allowed: true` / version `0` for every request (including self-harm and jailbreak prompts), and only a 12-keyword blocklist could ever trip — the policy *statements* (the $10,000 approval threshold, the $1,000/day spend cap) were never evaluated, leaving 8 of 11 domains unable to produce a violation. All seven routes also called the service with no org argument, so every tenant read and published `org-windels`' governance. |
| ~~4~~ | ~~`licensing`~~ | **DONE in S164.** The seed was the least of it — this module handles **money**. All six routes dropped the caller's org, so one tenant's metered usage credited **another tenant's revenue and pending-payout balance**. `revenueCents30d` was a counter that never decayed (a lifetime total labelled "30d", always exactly equal to `revenueCentsAllTime`). `pending` only ever grew — there was no payout path at all and `RoyaltyEntry.paid` was never set true. The royalty ledger was written on every usage event and **read by nothing**. A grant pointing at a missing asset fabricated `{revenueSharePct: 10}` and billed anyway. Grants never expired: `expiresAt` was stored and never compared, so an expired grant stayed active and remained billable. |
| ~~5~~ | ~~`deployment`~~ | **DONE in S165.** The seeded lie was real and worse than described: `coreIntegration`'s probe **called `ensureBootstrapped()` itself and then counted what the seeder had just written**, so the `missing` branch was unreachable on a first run and the checkpoint — which feeds `criticalPassed` and `canProceedToSession46` — reported `deployments: wired` on an installation where nobody had deployed. The existing test could not catch it (`expect(["wired","missing"]).toContain(status)` accepts both). Also: all six target routes dropped the caller's org, making `DELETE /targets/:id` cross-tenant destructive; `avgHealthScore` averaged four invented per-status constants, scoring a never-validated target **50**; `outdatedTargets` compared the version *assigned at creation* so it was always 0; `destroy()` claimed teardown it never performed; and `validate()` wrote `healthy` onto a remote target on the strength of probes against the **local** API host. |
| ~~6~~ | ~~`composer`~~ | **DONE in S166. This row was partly wrong** — `ensureBootstrapped` is called from exactly one place, `index.ts:546`, a boot timer; no read path calls it. The `needsSeed` branch was a worse defect than the one alleged: when *no* stored row parsed it ran `DEL` over every workflow key plus `cmp:wfs` and `cmp:m` and reseeded, so a Redis hiccup or schema change made the next **restart** delete every workflow the org owned. A bootstrap that deletes is data loss, not a seed. Also: ten of fourteen routes dropped the caller's org and `POST /workflows` accepts a body `id`, so one tenant could **overwrite another tenant's workflow definition**; `successRate` was `totalRuns ? succ/totalRuns : 1` (100% for zero runs) and the console compounded it with `(successRate||1)`, rendering a real 0% as 100%; `estimatedCostPerRun` was `capabilityCount * 0.002` shown as `est $N/run` with no pricing table; `getRuns` used `zrange(-limit,-1,"REV")` so "Recent Runs" showed the **oldest**; `validated` and `paused` were unassignable statuses; `cmp:m` was written by two paths and read by none; and `run()` accepted a workflow that was never deployed. |
| ~~7~~ | ~~`globalCurrency`~~ | **DONE in S167.** The audit was right and understated it — this module sets the rates `geoBilling` bills customers with. The `cache` label was load-bearing: `getRate` treated anything under an hour old as fresh, so constants compiled into the repo were served as recent quotes and the honest `offline-fallback` branch was **unreachable**; restarting reset `updatedAt`, so they never aged out. Stored inverses rounded to 4dp put `NGN:USD` **6.40%** out (0.0007 vs 0.00065789) — ₦1,000,000 converted to $700.00 instead of $657.89. Also: the enterprise override was **read by nothing** (`getRate` checked it only behind `opts.useOverride`, which no caller in the repository ever passed), so an admin's contractual rate was silently ignored; the fraud guard baselined against those same constants, **failing open** for every pair not in the table and flagging correct live rates as manipulation; `detect()` resolved every unknown country to **Nigeria**, and `regionalPrice`/`localizePrice` then priced and taxed it as Nigeria; `regionalPrice` claimed a PPP adjustment it never computed and `tax.included: true` while adding no tax; `rateProviders: 4` counted cache layers, not the 2 real providers; `offlineFallbackHealthy` was a compile-time constant; and an error message was a template literal in single quotes. |

### Tier 2 — read seeds a flag only, but the dashboard fabricates

The seed writes just a meta key (harmless), yet the read path still reports
structural zeros or round-robin values.

| # | Module | Defect |
|---|---|---|
| 8 | `industry` | `dashboard` (l.53) seeds a meta flag, then serves `INDUSTRY_SUITES` as if adopted. |
| 9 | `biomedical` | `dashboard` (l.69) seeds; empty-org turnaround/alert figures are zeros, not null. |
| 10 | `healthEcosystem` | `dashboard` (l.314) seeds per user. |
| 11 | `opex` | Two read paths (l.68, l.114) call `ensureBootstrapped`. |
| 12 | `cognitive` | `dashboard` (l.27) seeds. Self-evolution / DNA-completeness / federation / world-model fields are hardcoded `0` — the file's own comment admits those subsystems "do not exist yet". Per the S160 rule they must be `null`. |
| 13 | `command` | `dashboard` (l.44) seeds and cascades into `CommandOperationsService`. |
| 14 | `disasterRecovery` | Ungated seed writes a `na-east` active region and standby regions for every component — a failover topology nobody configured. Honest on health (`healthy: false`), dishonest on topology. |
| 15 | `benchmarks` | Ungated seed writes `optimizedModels: 0` / `pending: 0` as measured metrics on an org that has run nothing. |

### Tier 3 — inconsistent with the track's own fixes — ALL DONE (S168)

| # | Module | Defect |
|---|---|---|
| 16 | ~~`spatial`~~ | **Done (S168).** `listHoloDashboards` no longer bootstraps. Added `spatial.demoSeed.test.ts`: the existing `spatial.test.ts` mocks `demoDataEnabled()` to **false** in every case, which is exactly why this survived S156 — with the gate shut the read-path call returned early and looked harmless. All 9 routes now use `orgOf`. |
| 17 | ~~`sustainability`~~ | **Done (S168).** Both unconditional calls removed — note `record()` was one of them, so writing a first real measurement could inject seven synthetic baselines ahead of it. Also finished S121's half-fix: `energyRenewablePct`, `waterMl`, `wasteRecycledPct`, `offsetsPurchasedT`, `netZeroTargetYear` and the 12 monthly `renewablePct`/`costUsd` values returned **0** while the module's own provenance block called them structural zeros. `netZeroTargetYear: 0` asserted a target of the year 0. All now `null`. The old test asserted `toBe(0)` — it was pinning the defect in place. |
| 18 | ~~`dataMarketplace`~~ | **Done (S168).** The read-path seeds and the `_rng.reseed` were the *least* of it. **`review()` divided by the install count**, so an asset with 100 installs and three genuine 5-star reviews read **0.15 / 5**; reviews were never persisted at all and the `comment` was validated then discarded. Now a real `dmp:rv/rvs` ledger with a true mean and `reviewCount`. Also: `qualityScore` was a hard-coded `0.75`, and `revenue30dUsd` added every `one_time` price forever regardless of date. First tests in the module's history (11). |
| 19 | ~~`digitalHumans`~~ | **Done (S168).** The worst of the tier. **`endSession` — a live user action — overwrote the real transcript length with `randInt(20,180)`**, ungated, in production; the reseed made it *stably* fake, which is what let it pass review. `dashboard.totalSessions` **double-counted** every session (avatar counter + ledger). `avgSatisfactionPct` divided by `Math.max(1, humans.length)`, so an empty org reported `0.0%`. `create()` faked training with a `setTimeout(1500)`. `avgSessionSec` divided by sessions *started*. First tests (19) and first console page. |

### Tier 4 — no console surface

The track's definition of complete includes a dedicated `/app/<module>` page.
**74 of 125 modules have no page directory** under `apps/web/src/pages/`.
Most are correctly headless (`kernel`, `tenantIsolation`, `mfa`, `permissions`,
`platformServices`), but these have substantial user-facing services and no
console:

`businessIntelligence`, `enterpriseSearch`, `enterpriseFinOps`, `mediaGen`,
`mediaFactory`, `modelFactory`, `memoryEvolution`, `promptTemplates`,
`publicApi`, `marketplace`, `dataMarketplace`, `digitalHumans`, `expertsPlatform`,
`voiceFoundry`, `voiceOwnership`, `voiceStudio`, `musicGen`, `musicVideo`,
`training`, `mlOps`, `etl`, `governance`, `sustainability`, `tradingIntel`,
`cyber`, `industry`, `healthEcosystem`, `biomedical`, `licensing`, `composer`,
`constitution`, `deployment`, `globalCurrency`, `giftCards`, `fabric`,
`hybridExec`, `uxIntelligence`, `usage`, `updates`, `opex`, `benchmarks`,
`disasterRecovery`, `sdk`, `devportal`, `leadDiscovery`, `payments`,
`geoBilling`, `selfHosted`, `qa`, `release`, `program`, `projectContinuity`.

## Also worth noting

- **No session is 🟢 PRODUCTION COMPLETE.** All 77 rows in `PROGRESS.md` are
  🟡 VERIFIED (partial) — every runtime-validation checklist is open, because
  this sandbox reaches no Postgres/Redis. That is the single largest block of
  unfinished work in the repo, and it is infrastructure, not code.
- **The inventory scanner's `web.pages` field is broken** — it reports `[]`
  for all 125 modules, including ones that demonstrably have a page
  (`/app/robotics`, `/app/quantum`, `/app/legal`). Fix `audit/build-inventory.mjs`
  before trusting any future PARTIAL/COMPLETE verdict; right now the fourth
  gate is dead and the status field cannot regress-detect a missing console.

## Suggested order for sessions 161+

1. ~~`cyber`~~ — **done (S161).**
2. ~~`voiceStudio`~~ — **done (S162).**
3. ~~`constitution`~~ — **done (S163).** ~~`licensing`~~ — **done (S164).**
4. ~~`deployment` + `coreIntegration`~~ — **done (S165).**
5. ~~`composer`~~ — **done (S166).** ~~`globalCurrency`~~ — **done (S167).**
6. ~~`spatial` / `sustainability` / `dataMarketplace` / `digitalHumans`~~ —
   **done (S168).** Filed as "cheap: finish the partial fixes". That estimate
   was wrong, and the way it was wrong is worth recording: the grep that built
   this tier searched for `ensureBootstrapped` on read paths, so the tier
   describes only what that grep could see. Reading the four services in full
   found a live-path RNG fabrication, a double count, a rating average with the
   wrong denominator, five self-declared structural zeros still emitting `0`,
   and 34 routes resolving the tenant with no null guard against services that
   defaulted to `org-windels`. **A defect inventory built from one grep pattern
   describes the pattern, not the module.**
7. Fix `audit/build-inventory.mjs` `web.pages` detection.
