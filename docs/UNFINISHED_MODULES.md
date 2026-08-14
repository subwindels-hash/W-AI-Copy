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

## Unfinished modules

The defect signature, in the track's own words: **a read path must never be a
seeder**, **a seed must be gated behind `WINDELS_DEMO_DATA`**, and **an
unmeasured value is `null`, never `0`**.

### Tier 1 — ungated seed reachable from a read (the S156 defect, verbatim)

A GET on a fresh org invents records. This is the exact bug spatial had.

| # | Module | Defect |
|---|---|---|
| 1 | `cyber` | `dashboard` (l.84) calls `ensureBootstrapped`; ungated. Serves 7 `COURSE_SEEDS` / `CERT_SEEDS` / `FINDING_SEEDS` as catalogue rows with `enrolled: 0`, `rating: 0`, `solvedBy: 0` — structural zeros presented as measurements. Challenge points/difficulty assigned by `i % n` round-robin (the S160 "fabricated coverage" defect). |
| 2 | `voiceStudio` | `listBuiltIn` (l.125) and `dashboard` (l.209) both seed `BUILTIN` voices; ungated. `avgSynthLatencyMs` falls back to a hardcoded **`180`** when no latency samples exist (l.217) — a fabricated metric, must be `null`. |
| 3 | `constitution` | Ungated seed writes `SEED_POLICIES` + a "Default Enterprise Constitution" already `status: "approved"`, `approvedBy: "system"` — a fresh org is handed pre-approved governance it never ratified. |
| 4 | `licensing` | Ungated seed registers `SEED_ASSETS` as owned IP assets. |
| 5 | `deployment` | Ungated seed creates `SEED_TARGETS` as registered deployment targets across regions. `coreIntegration` then reads them back as evidence that deployment is `wired` — a seeded lie propagating into a health report. |
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

1. `cyber` — the largest ungated read-seeder with fabricated catalogue stats.
2. `voiceStudio` — hardcoded `180 ms` is the clearest fabricated metric left.
3. `constitution` + `licensing` — pre-approved governance / owned assets.
4. `deployment` + `coreIntegration` — a seeded lie feeding a health report.
5. `composer` + `globalCurrency` — re-seeding read, unbounded stale FX.
6. `spatial` / `sustainability` / `dataMarketplace` / `digitalHumans` — finish
   the partial fixes; cheap, and they close the track's own rule.
7. Fix `audit/build-inventory.mjs` `web.pages` detection.
