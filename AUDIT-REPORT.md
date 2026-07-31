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

### 2.3 Still synthetic — remaining work

**~184 calls across 66 files** still execute by default. They are concentrated in
operational dashboards rather than clinical or financial paths:

| File | Calls |
|---|---|
| `mlOps/models.service.ts` | 9 |
| `deployment/deployment.service.ts` | 8 |
| `disasterRecovery/disasterRecovery.service.ts` | 6 |
| `collaboration/meetings.service.ts` | 5 |
| `platform/iac.service.ts` | 5 |
| `updates/updates.service.ts` | 5 |
| `devportal/toolkit.service.ts`, `engineering/{metrics,pipeline}`, `mlOps/prompts`, `platform/infraMetrics`, `qa/drTest` | 4 each |
| …60 further files | 1–3 each |

Not all are defects. Legitimate uses remain and were deliberately left alone:
retry jitter, id/nonce generation, list shuffling, and Monte-Carlo sampling
inside the scenario simulator. `engineering/metrics.refreshSynthetic()` is
honestly named, has no callers, and is wired into no dashboard.

**Recommended order for the next pass:** `mlOps` → `deployment` →
`disasterRecovery` → `platform/*`, following the same record-and-derive pattern
used for S75/S65 (and previously for `usage`, `command`, `opex`,
`sustainability`).

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

Gates: **build 4/4 · typecheck 5/5 · tests 112 passing, 0 failing.**

---

## 4. Standing rule for this codebase

> Any value rendered as a measurement must be traceable to something recorded.
> If it was not measured, show an empty state — never a plausible number.

`hasData` on the health dashboard exists for exactly this reason: the UI states
plainly that nothing is recorded instead of drawing zeroed gauges that read like
real readings.
