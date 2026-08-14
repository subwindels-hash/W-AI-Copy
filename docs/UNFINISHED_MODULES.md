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
| 6 | `composer` | Ungated seed, and worse: it **re-seeds on read** if the workflow set is empty or its rows fail to parse (`needsSeed` recovery path), so deleting the example workflow brings it back. |
| 7 | `globalCurrency` | Ungated seed writes `OFFLINE_RATES` as exchange rates. Labelled `source: "cache"`, but the inverse rates are computed and stored as if quoted; no age/staleness bound on a financial figure. |

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

### Tier 3 — inconsistent with the track's own fixes

| # | Module | Defect |
|---|---|---|
| 16 | `spatial` | **Regression / incomplete S156.** `listHoloDashboards` (l.253) *still* calls `ensureBootstrapped` on read. The seed is now gated so nothing is fabricated, but the session's stated rule — "never invoke it from a read" — is not actually met. |
| 17 | `sustainability` | Seed correctly gated (l.146), but two reads (l.176, l.212) still call it. Same partial fix as spatial. |
| 18 | `dataMarketplace` | Gated, but seeds from **three** read paths (l.77, 115, 125), and `ensureBootstrapped` opens with `_rng.reseed(...)` — an RNG in a bootstrap the track banned. |
| 19 | `digitalHumans` | Same shape: gated, but seeds from three reads (l.77, 101, 154), same `_rng.reseed` call. |

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
5. `composer` + `globalCurrency` — re-seeding read, unbounded stale FX.
6. `spatial` / `sustainability` / `dataMarketplace` / `digitalHumans` — finish
   the partial fixes; cheap, and they close the track's own rule.
7. Fix `audit/build-inventory.mjs` `web.pages` detection.
