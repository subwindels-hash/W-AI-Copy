# AUDIT REPORT — WINDELS AI OS

**Date:** 2026-07-31
**Method:** static analysis of the code, not the prior reports.
**Supersedes:** the "critical blockers" in `DEPLOYMENT_BLOCKERS_REPORT.md` §1.1–1.2
and the module statuses in `UNFINISHED_MODULES.md` / `MISSING_FEATURES_REPORT.md`,
all of which had drifted from the code.

---

## 1. Corrections to previous reports

Three items previously listed as **CRITICAL / HIGH deployment blockers are already
implemented.** They were verified by reading the code, not the changelog.

| Previously reported | Reality |
|---|---|
| **Blocker 1 (CRITICAL)** — "MFA front-end token form missing; users with MFA are locked out" | **Already built.** `LoginPage.tsx` holds an `mfaChallenge` state, renders a 6-digit code form, and posts `{ mfaToken, totp }` to `/auth/mfa/complete`. The report claimed the API returns `mfaRequired`; it actually returns `mfa_required` (`auth.service.ts:207`), which is exactly what the page checks. No lockout. |
| **Blocker 2 (HIGH)** — "No front-end for S84 Project Continuity / S85 Lead Discovery" | **Already built.** `apps/web/src/lib/projectContinuity.ts` and `leadDiscovery.ts` exist and are consumed by `PlatformPage.tsx`. |
| **"Google OAuth button missing from login"** | **Already built.** `LoginPage.tsx` probes `/auth/google/status` and renders a "Sign in with Google" anchor to `/api/v1/auth/google`, with an explicit "not configured on this instance" state. |

Route registration was also re-checked programmatically: **every `register*Routes`
export in `apps/api/src/http/routes/` is invoked.** `infrastructure.ts` looked
unregistered under a naive grep of `server.ts`, but it is mounted by
`platform.ts:114` onto the `/platform` router, and the apparent `/regions`
collision is avoided by its `regions-mgmt` prefix.

**The genuine gap was never missing features — it was fabricated data.**

---

## 2. The real finding: synthetic data in live code

A reachability walk from `src/index.ts` plus every test file (following
side-effect, dynamic and `require` imports) found **280 `Math.random()` calls
across 79 files that the running server actually loads.**

This matches the ~70% "mocked dashboards" figure in the older reports, but the
severity was understated: the fabrication reached clinical and financial paths.

### 2.1 Resolved in this pass

| Area | What was wrong | Now |
|---|---|---|
| **S75 Health Ecosystem** | Generated vitals — BP 110–132/70–88, glucose, SpO2, temperature, an `afib_probability` — and tagged several `clinically_validated`, one insight `medical_decision_support`, citing fake devices (`cgm:freestyle-libre-3`) and a fake clinician (`clinician:dr-lee-q2-plan`). Auto-seeded a fake profile plus Metformin/Lisinopril on first load. | **Record-only.** Nothing seeded. Aggregates derived arithmetically from stored records; `0` when nothing is recorded. Label provenance enforced at the write boundary — a manual/phone entry cannot claim a clinical label. Derived insights are always `wellness_estimate`. |
| **S65 Biomedical** | `submitStudy` set a 1.5 s timer then attached a randomly drawn radiology finding ("Fracture suspected — correlate clinically", "Pleural effusion left side") with a fabricated 0.72–0.98 confidence. Seeded 18 such studies. HIPAA/HITECH/ISO-13485 hard-coded `compliant`. | **Registry-only.** Studies queue with no findings and stay that way until `recordFindings` is called by a configured provider or clinician (admin-gated). Unassessed compliance controls report `gap`. |
| **S79 Gift Cards** | Codes generated with `Math.random()`. A gift card code is a bearer instrument redeemable for money; the PRNG state is recoverable from a few observed outputs. | `crypto.randomInt()` (CSPRNG, unbiased). |
| **S87 Camera** | WebRTC session tokens gating live camera feeds were 8 chars of `Math.random()`. A hard-coded TURN credential (`change-me-in-production`) was shipped to every browser. | 24 CSPRNG bytes; ICE servers from `WEBRTC_TURN_*` config, STUN-only fallback instead of a placeholder secret. |
| **S50 Benchmarks** | Bootstrap seeded a "completed" run per area with random p95 latency, success rate, factuality, Pass@1, MOS and a random 70–98 score — feeding the dashboard, leaderboard and pass rate. | Synthetic seeding removed. `runBenchmark()` already required a real `evaluator` + `evidence`; an org with no recorded evaluations reports zero. |
| **Simulation confidence** | Scenario runs returned `confidence: 0.72 + random*0.2` — a different number on every identical re-run. | Derived from Monte-Carlo standard error (`1 - 1/√n`), widened when a scenario has no assumptions. The random *sampling* is kept: that is what a simulator is for. |

### 2.2 Gated behind an opt-in flag

**70 calls** across 10 bootstrap modules (`enterpriseFoundation`, `extensions`,
`collaboration`, `engineering`, `mlOps`, `cryptoIntelligence`,
`platformServices`, `aiEcosystem`, `marketplace`, `wakeIntel`) seed demo records
so dashboards look populated on a fresh install.

These are now **off by default** behind `WINDELS_DEMO_DATA` (see
`apps/api/src/config/demoData.ts`). The env schema accepts only `"true"` /
`"false"`, so a typo such as `=1` fails startup loudly rather than silently
enabling fake data.

### 2.3 Self-grading gates — all eliminated

The most dangerous class was code that **decided its own pass/fail verdict by
coin flip**, producing an audit trail of checks that never ran. All 17 sites are
resolved:

| Gate | Was | Now |
|---|---|---|
| `deployment.validate` (S53) | `passed = Math.random() > 0.05` | Real probes: Redis `PING`, Postgres `SELECT 1`, uploads-dir write+unlink, kernel dispatch, model-registry population. Unverifiable checks (remote endpoint, TLS) are `skipped`, **never** counted as passes; an all-skipped run cannot report `passed`. |
| `disasterRecovery.runDrill` (S53) | `passed = Math.random() > 0.1`, random 8–38 s RTO | Drill moves to `running` and stops. New `recordDrillResult()` takes the measured verdict/RTO/RPO and records *who* submitted it (`POST /drills/:id/result`). |
| `updates.validate` (S54) | `passed = Math.random() > 0.06` | Governance approvals and disk headroom (`statfs`) genuinely checked; signature/dependency/compatibility/backup/staging marked `skipped`. |
| `modelFactory.runBenchmark` (S46) | invented 50–95 score, `pass: true` hard-coded | Requires a measured score + verdict. |
| `toolkit.runTests` / `.deploy` (S27) | invented 20–80 cases, 10% failure chance, 65–95% coverage, and a fake log transcript | Results supplied by the real runner; unsupplied → `queued` with zeroed counters. |
| `quality.startRun` | completed in-line with 200–1000 invented samples at 78–98% pass | Queued; `completeRun()` records the real result. |
| `prompts.runTests` | passed every case bar a random 0–1, without executing any | Unsupplied → zero passes, not near-perfect. |
| `archReview.runAiReview` (S25) | 5 boilerplate findings + random 70–95 `aiScore`, no analysis | Findings and score come from the actual reviewer. |
| `providerAbstraction.runBenchmark` | invented score/latency/cost per provider | Measured results only. |
| Also | `engineering` deployment records, `fabric` source health, IaC drift, region status, `identity` risk score, `release` health gate | All derived or left explicitly unknown. |

Types now model "not measured" honestly rather than defaulting to a flattering
value: `DeploymentValidationCheck.skipped`, `DeploymentTarget.cpu/mem/gpuPct?`,
`DrStatus.replicationLagMs?`, `UpdateRollout.errorRate/p95LatencyMs?`,
`ArchReview.aiScore?`, and `DataSource.status` gains `"unknown"`.

### 2.4 Still synthetic — remaining work

Worked through the §2.4 order one file at a time. **Fabrication is down from 161
to 91 call sites**, and every remaining item is descriptive dashboard telemetry
— no verdicts, no clinical data, no money, no security tokens.

**Completed in this pass:**

| Module | What was invented | Now |
|---|---|---|
| `mlOps/models` (9) | Every model version got a random 120–920 MB size and a fake `sha256:` hash built from a UUID — a synthesised hash is worse than none, because it looks verifiable. Models were born with 8–47 stars, 240–2040 ms latency and a 0–0.8% error rate; deployments were stamped with up to 2050 qps, a 580 ms p95 and $9.20/h before serving a request, and marked `healthy` before any probe. | Registry metadata and serving telemetry are undefined until measured. Added the missing intake path: `POST /deployments/:id/metrics` and `POST /models/:id/versions/:versionId/artifact`. |
| `platform/infraMetrics` (4) | **The worst of the remainder** — it runs on a 15 s timer, so every fabricated value became a persistent 60-minute "history" of traffic that never happened (`rps = 500 + random*1200`), and those series drove the alert thresholds, so alerts fired on noise. | Real telemetry: CPU from `process.cpuUsage()` deltas per core, memory from RSS against `os.totalmem()`, request rate and error rate from deltas of the real HTTP counters. Tagged `source: "process"` so a single-process reading is never read as cluster-wide. |
| `engineering/pipeline` (4) | `POST /pipelines/record` accepted an empty body and minted a CI build: random pipeline, status rolled 78/14/8, duration apportioned across invented stages, 8% flaky chance — all feeding the CI analytics. | Requires `pipeline`/`status`/`durationMs`; stages recorded, not apportioned; route validated. |
| `engineering/deployments`, `techDebt`, `metrics`, `productivity` | Random DORA lead time (2–22 h), a 60-point SLO chart reconstructed from ±35% noise, invented debt effort/churn used to rank hotspots, fabricated per-developer PR stats. | Measured or absent. Rollups skip unmeasured items rather than counting them as 0, which would have dragged DORA toward "elite" as coverage worsened. |
| `collaboration/cameraIntel` (3) | A safety-camera detection with no model confidence got an invented 0.6–0.95, which then set the confidence band an operator uses to triage it. | Confidence comes from the model; absent → 0/`low`, so it cannot masquerade as a high-confidence hit. |
| `collaboration/meetings` (4) | Marked ~70% of CRM/project/calendar follow-ups `synced` with fabricated record IDs — nothing was ever synced, and the pending count under-reported the real backlog. | Tasks stay `queued` until a connector syncs them. |
| `collaboration/screenIntel` (3) | Frame counts back-filled randomly; guide elapsed time incremented by a random 15–105 s per step. | Real counters; elapsed measured from a new `startedAt`. |

**Batches 4–5 (platform, devportal, program, release):**

| Module | What was invented | Now |
|---|---|---|
| `platform/cluster` | An entire Kubernetes estate at boot — 3 named nodes, 8 workloads, a pod per replica with invented `10.42.x.x` IPs and a 20% restart chance. `probe()` walked it on every call applying ±6% jitter, turning a static seed into a convincing live feed. It cascaded: FinOps emitted "downsize windels-api" advice about workloads never deployed. | Topology comes from a real source or not at all. `KUBERNETES_SERVICE_HOST` is detected and reported `unknown` pending live hydration; the demo topology needs `WINDELS_DEMO_DATA`; otherwise zero nodes and `status: "unknown"`. |
| `platform/iac` | `run()` reported `succeeded` with an invented plan diff (add 0–2 / change 0–4 / destroy 0–1) without invoking terraform/pulumi/helm; each stack claimed 20–100 managed resources. | Runs queue for an external executor; `recordRun()` writes the real outcome (`POST /iac/runs/:runId/result`). |
| `platform/optimization` | A hardcoded **$14,820/month** cost breakdown with a $15,200 forecast, plus three recommendations naming resources that do not exist (PVC `windels-old-pvc-2026-01`, node `windels-worker-2`, a gp2→gp3 migration) each with a confident saving. `list()` generated them just by opening the dashboard. | Cost zeroed until a billing export reports; invented recommendations removed; `list()` no longer generates. |
| `release/production` | `promote()` ran a 60 ms-per-stage loop across 25/50/75/100%, inventing an error rate (5–15%) and p95 (40–70 ms) at each step, then hard-set `healthyAt100 = true` and marked the release **deployed** — a full "canary passed, promoted to production" record for a rollout that never touched an environment. | Ramp driven externally by `reportCanary()`; `finalize()` refuses unless the canary really reached 100% **and** health was confirmed. |
| `devportal/sdkRegistry` | Every SDK stamped with 100–9,100 weekly downloads and 10–910 stars, shown on the public developer portal as real adoption. | Supplied by the registry/VCS; the existing download counter increments from the real total. |
| `devportal/environment` | 5–40% CPU and 200–800 MB reported the instant an environment started. | Undefined until the environment reports. |
| `program/sprint` | Random 30–45 projected velocity, a random 3–11 story points assigned to unpointed stories (feeding capacity planning), and a burndown chart drawn as the ideal line plus noise. | Measured or absent; burndown shows only the computable ideal line. |
| `program/roadmap` | `aiConfidence` a random 60–95, presented as an AI assessment. | Supplied by whatever scores it. |
| `qa/aiValidation`, `qa/workflowTest` | Padded latency (+20–100 ms) and a random 50–450 ms duration on a synthetic QA responder, feeding the validation report's latency assertions. | Measured elapsed time. |

**Remaining (71 sites, 33 files)** — the two largest are legitimate:

| File | Calls | Note |
|---|---|---|
| `marketplace/simulation.service.ts` | 24 | **Legitimate** — Monte-Carlo sampling is the point of a simulator. |
| `services/tools/builtin/index.ts` | 4 | **Legitimate** — this *is* the `random` agent tool. |
| `mediaGen`, `robotics`, `scientific`, `industry`, `extensions`, `dataFabric`, `tradingIntel` | 2 each | Dashboard counters. |
| …24 further files | 1 each | |

A further **79 calls** sit behind `WINDELS_DEMO_DATA` (default off) and do not
run in a normal deployment.

Also deliberately left alone: retry jitter, id/nonce generation, list shuffling,
and `tradingIntel`'s `SyntheticProvider`, which flags `synthetic: true` on every
quote it returns. The `qa/*` harnesses that remain are named `synthetic` on
purpose and never present their output as production data.

**Suggested next order:** the remaining 1–2 call sites are isolated dashboard
counters (`mediaGen`, `robotics`, `scientific`, `industry`, `spatial`,
`quantum`, `selfHosted`, …) — each is a small, independent fix.

---

## 3. Verification

Every change is covered by hermetic tests (`FakeKv` in place of Redis, no live
infrastructure):

- `healthEcosystem.test.ts` (12) — empty fresh org, **identical consecutive
  dashboards** (proves no randomness), label downgrade on manual entries,
  risk flags only from recorded clinical readings, org isolation.
- `biomedical.test.ts` (10) — a study **provably never grows findings on its
  own** (waits out the old 1.5 s timer), findings only via explicit attributed
  read, compliance reported as `gap` until assessed.
- `demoData.test.ts` (6) — the seed gate defaults off and fails loudly on an
  ambiguous value.
- `verdicts.test.ts` (8) — a new target is not born healthy; unverifiable checks
  are `skipped` not passed; **two consecutive validations agree** (a coin flip
  would not); DR bootstrap seeds no drills and leaves components unverified;
  failover reports a measured duration with RPO omitted rather than zeroed.

Gates: **build 4/4 · typecheck 5/5 · tests 140 passing, 0 failing.**

---

## 4. Standing rule for this codebase

> Any value rendered as a measurement must be traceable to something recorded.
> If it was not measured, show an empty state — never a plausible number.

`hasData` on the health dashboard exists for exactly this reason: the UI states
plainly that nothing is recorded instead of drawing zeroed gauges that read like
real readings.
