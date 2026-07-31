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

**Batch 7–8 (per-request dashboard generators + the long tail):**

| Module | What was invented | Now |
|---|---|---|
| `scientific` | 148,000,000 indexed papers and a 2.4M-node knowledge graph, re-rolled per request. | Counted from held records; untracked figures report 0. |
| `cyber` (S82) | Regenerated the whole academy per read with fresh ids, and invented a career: 800–12,000 learners, a leaderboard rank, and **$500–$120,000 of bug-bounty earnings**. | Static catalogue with stable ids; progress counted from a real progress hash + activity log. Also fixed a genuine bug: `startLab()` never persisted, so provisioned labs vanished immediately. |
| `industry` | Up to **50,000,000 ontology entities**, a staffed 9-region ops centre, and install counts for all 25 suites. | Catalogue reports zeros until installs are tracked; maturity prompts for a real assessment. |
| `fabric` | Business KPIs including **"Revenue / day" of $40,000–$280,000**, SLA on-time %, and trust signals scored 0.55–0.99 producing an overall "trusted" verdict on every page load. | Unevaluated trust is **`blocked`** — an unassessed platform must not present itself as verified. Trend/maturity curves empty until recorded. |
| `tradingIntel` | A random ±3% price move *derived* the sentiment and the buy/sell/hold **signal**, with a 0.55–0.92 confidence — a complete trading recommendation manufactured from one random number. Sentiment feeds and scenario returns were likewise drawn. | `signal`/`confidence` are optional and absent until a real analysis produces them. |
| `training` (S60) | Walked every job to `deployed` on a ~450 ms-per-stage timer, and **generated its own safety checks** from `rand(0, threshold * 0.9)` — always below threshold, so `safetyPassed` was true by construction. | Stages advance only when reported; `recordSafetyCheck()` requires every category to be evaluated and pass. `promoteToCanary` now demands `safetyPassed === true` (it previously only blocked an explicit `false`, so unevaluated jobs were promotable). |
| `robotics` | Fired a predictive-maintenance alert for a random ~15% of the fleet each scan, naming a component and a 55–95% failure risk. | Derived from real thresholds on reported temperature, battery and CPU; each alert cites the reading that triggered it. |
| `composer` | Failed a workflow run outright with 1% probability, and that verdict fed the stored `successRate`. | No synthetic failures. |
| `quantum`, `sdk`, `mediaGen`, `mlOps/rag`, `mlOps/prompts`, `extensions`, `dataFabric`, `selfHosted` | Invented objective values, profiler output, GPU utilisation, index latency, popularity and connector telemetry. | Measured or zeroed. |

**Remaining (54 sites)** — over half are legitimate:

| File | Calls | Note |
|---|---|---|
| `marketplace/simulation.service.ts` | 24 | **Legitimate** — Monte-Carlo sampling is the point of a simulator. |
| `services/tools/builtin/index.ts` | 4 | **Legitimate** — this *is* the `random` agent tool. |
| `qa/drTest`, `qa/digitalTwin` | 5 | QA harnesses, named `synthetic`; never presented as production data. |
| `http/middleware/observability.ts` | 1 | Trace-ID generation. |
| `services/ai/echo.provider.ts` | 1 | Simulated typing delay in the demo assistant. |
| `projectContinuity` | 1 | The code scanner's own `Math.random` detector regex. |
| `legal` (seed) | 1 | Inside a seed path. |

A further **79 calls** sit behind `WINDELS_DEMO_DATA` (default off).

**Status:** the sweep is complete. Every remaining `Math.random()` in live code
is either legitimate (simulation sampling, the `random` tool, id generation,
timing jitter) or inside an explicitly-named QA harness. No dashboard,
verdict, clinical value, financial figure or security token is fabricated.

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

Gates: **build 4/4 · typecheck 5/5 · tests 279 passing, 0 failing.**

---

## 4. Standing rule for this codebase

> Any value rendered as a measurement must be traceable to something recorded.
> If it was not measured, show an empty state — never a plausible number.

`hasData` on the health dashboard exists for exactly this reason: the UI states
plainly that nothing is recorded instead of drawing zeroed gauges that read like
real readings.

---

## 5. Reconciliation with `main` (2026-07-31)

While this branch was in flight, parallel sessions merged their own fix for the
same problem. Both approaches were kept, split by **what the number means**:

| Approach | Where it applies |
|---|---|
| **Deterministic per-tenant RNG** (`utils/detRng.ts`, from `main`) — a stable, reproducible placeholder | Descriptive dashboard counters where a plausible demo value is harmless |
| **Record-only / "not measured"** (this branch) — remove the value, model absence honestly | Anything **clinical, financial, security-related, or a pass/fail verdict** |

A deterministic RNG still fabricates a blood-pressure reading or a cloud bill —
it just does so *consistently*. That is fine for a demo tile and unacceptable
for a vital sign, so the 49 conflicting files were split 34 / 15 on that line.

Kept from **this branch** (safety-critical): S75 health, S65 biomedical, S60
training safety gate, gift-card CSPRNG codes, deployment/DR/update verdicts,
release canary promotion, robotics maintenance alerts, camera detection
confidence, trading signals, FinOps cost, fabric trust scores.

Kept from **`main`** (descriptive counters + genuinely better infrastructure):
the `driverAdapters` + WASM Prisma setup — which solves the offline-engine
problem more cleanly than this branch's `--no-engine` workaround — plus S83
ETL, S84/S85 frontends, canvas collab, and the `noRandomData.guard.test.ts`
source-level guard.

**Two pre-existing bugs on `main` were fixed during the merge:** 29 duplicate
`import` statements (`makeRng`, `validate`) that made the API fail to compile,
and a `registerMediaFactoryWebhookRoutes` import with no matching export.

The guard test is now satisfied repo-wide: every remaining `Math.random()` is
in its allowlist (the `random` agent tool, echo-provider jitter, request-id
generation, WebRTC tokens, flagged-synthetic market candles).

---

## 6. "Critical 5 (No Service Files)" — root cause fixed (2026-07-31)

Reported as five core modules missing their service layer: **agents,
conversations, attachments, promptTemplates, publicApi**.

**All five are implemented.** They are Prisma-backed, wired to registered
routes, and already enforce organization scoping, Zod validation,
participant-based access control, SHA-256 API-key hashing and Bearer-only key
transport.

| Module | Service (resolved via route imports) | SLOC | Routes |
|---|---|---|---|
| agents | `services/agent.service.ts` + skills/lifecycle/registry | 1636 | 14 |
| conversations | `services/conversation.service.ts` + `message.service.ts` | 400 | 7 |
| attachments | `services/attachment.service.ts` | 130 | 4 |
| promptTemplates | `services/promptTemplate.service.ts` | 95 | 5 |
| publicApi | `services/workflow.service.ts` + `webhook.service.ts` + apikey | 863 | 6 |

### Why the audit kept saying otherwise

`audit/build-inventory.mjs` — the generator behind every stale status in this
repo — **could not run at all.** Four defects, all pre-existing:

1. `const ROOT = "/home/user/windels"` — hardcoded to a path that does not
   exist in this checkout, so it crashed before writing anything.
2. `moduleKey` referenced but never defined (`modKey` is the loop variable) —
   threw on the first module.
3. `classifyStatus()` read `mod.service` / `mod.webClient` / `mod.sharedType`,
   none of which exist on the emitted object (they are nested under `backend`
   and `web`) — so every module looked service-less and client-less.
4. `countRoutes()` matched only `router.get(`, missing the `r.get(` alias used
   by several route files — those modules counted **zero** endpoints and fell
   straight to MISSING.

On top of that it only looked for services at `apps/api/src/<modKey>/`, never
following what the route actually imports — which is why services living in the
shared `src/services/` folder under a singular name were invisible.

All five are fixed. The generator now resolves services by **following route
imports** (reporting what the server loads, not what the folder tree suggests),
tolerates any router alias, reads the real emitted shape, and derives its root
from its own location. `testUtils` and the phantom `canvas` key are excluded —
the former is test infrastructure, the latter has its routes mapped to
`collaboration`.

**Regenerated inventory: MISSING 5 → 0.** The distribution shifts from an
over-optimistic `48 COMPLETE / 5 MISSING` to a realistic
`4 COMPLETE / 56 DEMO DATA / 22 PARTIAL / 3 STUB / 0 MISSING` — the DEMO DATA
count reflects modules that still return seeded values, which §2.4 tracks.

### Restructured to the repo convention (2026-07-31)

Reading the report a third time as *"these do not follow the module
convention"* rather than *"the code is absent"* — that reading is correct, and
it was the one thing I had not acted on.

**51 of 56 backend modules** live at `apps/api/src/<module>/<module>.service.ts`
with a sibling `bootstrap.ts`. These five were the outliers, sitting in the
shared `src/services/` folder under singular filenames. That is precisely why
every directory-shaped scan — the inventory generator, and any reviewer
eyeballing the tree — concluded they were missing.

Moved via `git mv` (history preserved):

| Was | Now |
|---|---|
| `services/agent.service.ts` | `agents/agents.service.ts` |
| `services/conversation.service.ts` | `conversations/conversations.service.ts` |
| `services/attachment.service.ts` | `attachments/attachments.service.ts` |
| `services/promptTemplate.service.ts` | `promptTemplates/promptTemplates.service.ts` |
| `services/apikey.service.ts` | `publicApi/publicApi.service.ts` |

Ten importers updated across routes, middleware and four sibling services
(`agentRuntime`, `message`, `talk`, plus the test). Added
`promptTemplates/bootstrap.ts` — the only one of the five with real boot work —
so the built-in prompt library is present from startup rather than seeded
lazily by whoever opens it first; it is idempotent and wrapped so it can never
block API boot.

Regenerated inventory — all five now report a real `serviceDir`:

| Module | Status | Service SLOC | Routes |
|---|---|---|---|
| agents | PARTIAL | 2085 | 14 |
| publicApi | PARTIAL | 952 | 6 |
| conversations | PARTIAL | 546 | 7 |
| attachments | PARTIAL | 260 | 4 |
| promptTemplates | PARTIAL | 212 | 5 |

Two further generator false positives fixed while verifying: the synthetic-data
detector flagged any file containing the word "seed" or "demo" (including
comments and the legitimate `seedBuiltInTemplates`), and it scanned `.test.ts`
files, where `vi.mock` and the word "placeholder" appear for good reason. It now
strips comments, requires a word that actually implies fabrication, and skips
tests. Repo-wide this moves 17 modules out of a wrongly-assigned DEMO DATA.

### Coverage added

Being pure Prisma consumers, these five could only run against a live Postgres,
so they shipped untested. `testUtils/fakePrisma.ts` is an in-memory Prisma
stand-in that parses `@default(...)` out of `schema.prisma` (staying accurate as
the schema evolves) and supports the query surface these services use — nested
`OR`, relation `some`, `include`, `_count`, `orderBy`, pagination, and both
array and interactive `$transaction`.

`services/coreCrud.test.ts` — **22 tests**: four cross-tenant isolation
assertions, access-control rejection, soft-delete preserving audit history,
upload validation (empty / bad MIME / 25 MB cap) with SHA-256 checksums,
template rendering including `{{var|default}}` and unknown-variable
substitution, and API keys where the plaintext token is asserted **never** to
appear in the persisted row, with revoked/expired/prefix-less keys rejected.

Two test assumptions were wrong and were corrected against the implementation,
not the reverse: `updateAgentStatus(agentId, status)` takes no user argument,
and a status change does not implicitly write an `AgentEvent`.

---

## 7. Thin stubs fleshed out (2026-07-31)

Seven modules — **cognitive, command, usage, opex, sustainability, aiEconomy,
autonomous** — were 11–34 lines each. They had been de-faked earlier in this
session by replacing invented metrics with zeros, which was correct, but left
them hollow: most dashboard fields were hardcoded `0` or `[]` **even where the
data to compute them already existed** in `AiRequest`, `Alert`, `WorkflowRun`,
`Task` and each module's own ledger.

| Module | Was | Now derives from real records |
|---|---|---|
| **usage** | 22 ln; every delta `0`, no series, no models | Request/token/latency/error counts from `AiRequest`; 30-day daily series; per-channel and per-model rollups; **period-over-period deltas** against the prior 30 days; adoption measured as members who *actually generated traffic*, not merely enrolled |
| **cognitive** | 22 ln; accuracy `0`, health pinned `100%` | Success rate over real AI traffic; observatory `healthy` per category from failed runs / failed requests / open alerts, so the headline can drop below 100% |
| **command** | 21 ln; incidents `0`, health = tasks only | Incidents from the `Alert` table; health blends task completion **with** open incidents and workflow failures, so an org drowning in alerts can no longer report 100% |
| **opex** | 15 ln; every trust dimension `0` | Reliability and data-freshness from real AI traffic; safety pass-rate, mitigations and bottlenecks from the recorded register; approval rate from tasks |
| **sustainability** | 11 ln; only a total | Per-scope grouping by activity, **year-on-year change**, a real 12-month kWh series, and compute rolled up under scope 2; added `GET /records` so the derived dashboard can be audited against its inputs |
| **aiEconomy** | 34 ln; credits/forecast `0` | Credits and spend from the ledger; GPU in-use vs idle from allocation utilisation; a forward projection explicitly labelled as linear extrapolation |
| **autonomous** | 17 ln; autonomy index `0` | Review rate, rejection rate as the true "override" signal, per-department rollups, and realised impact from **approved** proposals only |

Everything still genuinely unmeasurable stays `0` with an inline reason — ESG
scores (an external attestation), cloud cost, MTTR (needs paired open/close
timestamps), carbon intensity, host CPU/memory. **No value is estimated.**

Four `as SomeDashboard` casts were removed in favour of `satisfies`, which
immediately surfaced four real shape mismatches the casts had been hiding:
`ObservatoryNode` and `ReasoningCapability` take fixed enums, `Department`
needs `autonomyLevel`/`health`, `GreenAiMetric` wants `gpuHours`/`co2eKg`, and
`BoardDecision` rejected the register's own `"critical"` risk level and
free-form departments — the shared type was widened to match what the service
actually records.

### Critical 5 — per-module tests

The 22 tests previously lived in one shared file under `agents/`. Split so each
module owns its own suite (`conversations.test.ts`, `attachments.test.ts`, …),
matching the layout the rest of the repo uses.

### Coverage

`usage/rollups.test.ts` — **19 tests** across all seven modules, pinning two
properties: an empty organization reports zeros (nothing invented), and once
records exist the rollups reflect them. Includes a cross-tenant check that one
organization's AI traffic never appears in another's dashboard.

`FakePrisma` gained `aggregate`, `groupBy` and `distinct` to support them.

**Gates: build 4/4 · typecheck 5/5 · 264 tests passing** (was 245).

---

## 8. The remaining `DEMO DATA` list — the detector was pointing the wrong way (2026-07-31)

Continuing the §2.4 sweep meant working the inventory's 17 `DEMO DATA` modules.
Reading them one at a time, **16 of the 17 were false positives** — and the
detector was simultaneously **missing ten modules that genuinely fabricated
records**. The list was close to an inversion of the truth, so this pass fixed
both the modules and the instrument that was mis-measuring them.

### 8.1 Why the old flag was wrong

The classifier flagged any service file containing
`\b(fake|mock|dummy|synthetic|placeholder|lorem)\b` outside a comment. In this
codebase `synthetic` is the **honesty vocabulary**, not the fabrication
vocabulary — it is the word the code uses to *disclose* simulated data:

| Module | What actually matched | Verdict |
|---|---|---|
| `billing/exchangeRates` | `synthetic: rs.synthetic` — propagating a provenance flag so a caller can tell a real ECB rate from the offline fallback | **honest disclosure** |
| `globalCurrency/refreshRates` | `if (rs.synthetic) { syn++; continue; }` — *refusing* to cache fallback rates | **honest disclosure** |
| `aiEcosystem/trustExplainability` | `"llm-synthetic": 0.35` — a source-quality enum member, scoring LLM-written evidence *lower* | source ranking |
| `dataMarketplace` | `"Synthetic Customer Churn Dataset"` — a real catalogue product name | catalogue content |
| `architecture/bootstrap` | `"Enterprise Synthetic Intelligence Layer (SI)"` — a real component name | architecture registry |
| `projectContinuity/projectIntake` | the secret scanner's **own detection regex** | circular match |
| `benchmarks`, `biomedical`, `disasterRecovery`, `healthEcosystem` | comments this audit wrote *recording that fabrication was removed* | **fixed already** |
| `tradingIntel/marketData` | a provider explicitly named `synthetic`, always tagged `synthetic: true` | labelled by design |

Four of these had been de-faked in earlier passes; the sweep's own explanatory
comments were re-flagging the files as offenders.

### 8.2 What the detector missed — the real problem

Ten modules fabricated records inside `ensureBootstrapped` and **none were
gated**, so a default install manufactured them. They went unflagged because
they name their variables honestly.

The gate existed but was in the wrong place. Eleven bootstraps checked
`demoDataEnabled()` — in `<module>/bootstrap.ts`, the boot-time path. But
eighteen services also call `ensureBootstrapped()` **lazily from their own read
methods**:

```ts
async dashboard(oid) {
  if (!(await redis.exists(K.meta(oid)))) await this.ensureBootstrapped(undefined, oid);
```

so a plain `GET /scientific/dashboard` for an unseen organization seeded the
fabricated records on demand and reported them as that org's data. Gating
`bootstrap.ts` never closed this path. **The gate now sits inside
`ensureBootstrapped` itself**, where both entry points converge.

| Module | S | What a fresh install manufactured |
|---|---|---|
| `tradingIntel` | S81 | **Worst case.** Three open positions carrying P&L (BTC +$2,106, AAPL +$1,197.60, EURUSD +$620) and a risk profile stating **$2,480,000 exposure, 1.82 Sharpe, 4.2% drawdown, 7/8 stress tests passed**. Nothing was ever traded. `pnl24hUsd` summed the invented P&L; the 24h counters were hard-set to 12 jobs / 480 signals / 3 blocked / 38 simulations. |
| `robotics` | S57 | A 12-robot fleet across 8 named sites with battery/CPU/temperature, uptime and task counts — plus a predictive-maintenance alert naming a component at **62–91% failure risk**, and a scheduled maintenance window. |
| `education` | S67 | Courses with 20–800 enrolments and 3.6–4.9 ratings, skill levels, and a **passed assessment scoring 55–98%** attributed to the admin user. |
| `digitalHumans` | S62 | Avatars with 20–400 sessions and **78–96% satisfaction**, each with a completed session and a 3–5 star rating. |
| `training` | S60 | Datasets, and jobs with GPU-hours, **$2–220 cost estimates** and 0.72–0.94 eval scores. |
| `sdk` | S59 | Packages with **120–18,400 downloads**, a "running" emulator and a live debug session. |
| `quantum` | S63 | A post-quantum migration programme: crypto inventory with migration status/owners/target dates, vendor connectors with qubit counts. |
| `fabric` | S56 | Data sources with invented latency/throughput, twins with health and **"prediction accuracy" percentages**, signed certificates, open alerts. |
| `scientific` | S68 | Experiments at 8–92% progress, papers with **50–8,000 citations**, hypotheses with 0.4–0.85 confidence. |
| `dataMarketplace` | S61 | Listings with 12–2,400 installs, 3.2–4.9 ratings and quality scores. |

Two real side effects had to survive the gate and do:

- `fabric` — `startBus()` is a live Redis subscription, not demo content. It
  runs before the gate, otherwise nothing published by other modules would be
  captured.
- `tradingIntel` — split in two. The **catalogue** (agents, indicators,
  instruments) describes what the module *can* do and installs unconditionally;
  only the **portfolio** is gated. Money is exactly the category that must never
  be invented.

### 8.3 A real bug the gate exposed

`robotics.dashboard()` computed `avgCpuPct` by dividing by `robots.length`
unconditionally. With the seed gone, an org with no robots produced **`NaN`**,
which serialises to `null` over JSON and renders as a blank gauge rather than
"no fleet". The always-on seed had masked it. Guarded, and pinned by a test that
asserts `avgCpuPct === 0` and `Number.isNaN(...) === false`.

Every other `/ .length` in the ten modules was checked; `tradingIntel/journal.ts`
divides similarly but returns early on an empty trade list, so it is safe.

### 8.4 The detector, rebuilt

`synthetic` was removed as a keyword — it produced 16 false positives and zero
true ones. Strings, comments and regex literals are now excluded (naming a
product "Dummy Data Pack" is catalogue content; the secret scanner necessarily
contains the words it hunts). The signal that actually finds offenders is new:

> an `ensureBootstrapped` body that **manufactures values and writes them
> straight to the store, with no `demoDataEnabled()` check**

brace-matched to the method body, because a file-scoped version wrongly flagged
`industry`, `mediaGen` and `voiceStudio`, whose bootstraps install only a static
catalogue and whose RNG belongs to unrelated methods. `rnd()`/`rndInt()`
*definitions* no longer count either — `scientific` declares them at file top and
calls them only from its gated bootstrap.

Randomness reachable only behind the flag is no longer reported: it cannot run
on a default install.

**`DEMO DATA` 17 → 0 · `COMPLETE` 32 → 43 · `MISSING` 0.**

### 8.5 Verification

The detector was **mutation-tested rather than trusted**, because one that
reports zero is indistinguishable from one that is broken:

| Mutation | Expected | Result |
|---|---|---|
| Remove the gate from `robotics` | re-flag | `robotics → DEMO DATA (ungatedSeed)` ✅ |
| Inject `Math.random()` into clean `usage` | flag | `usage → SIMULATED (mathRandom)` ✅ |

Both restored after testing.

`config/seedGate.test.ts` (**15 tests**) pins the behaviour: each of the ten
bootstraps writes **no keys at all** with the flag off; `tradingIntel` installs
its catalogue but reports `positionsOpen: 0`, `pnl24hUsd: 0` and a **null** risk
profile; and the three lazy read paths (`scientific.dashboard`,
`robotics.dashboard`, `dataMarketplace.dashboard`) return empty states instead of
seeding on demand.

These were mutation-tested too — reverting the `robotics` and `tradingIntel`
gates failed 3 tests, and reverting the `NaN` guard failed with
`expected NaN to be +0`, confirming the bug was real and the tests detect it.

**Gates: build 4/4 · typecheck 5/5 · 279 tests passing, 0 failing** (was 264).
