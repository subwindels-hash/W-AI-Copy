# PRE-EXISTING TEST FAILURES — INVENTORY & RESOLUTION

**Date:** 2026-08-05
**Branch:** `arena/019fd31a-win`
**Purpose:** Track the test failures that existed **before** the Session 1 certification
work and their disposition. This is the audit trail for the "10 pre-existing failing test
files" flagged during Session 1 certification.

---

## Summary

| Category | Count | Disposition |
|---|---|---|
| Environment-only (missing Prisma generated client) | **9** | **Resolved in-repo** via a shared `@prisma/client` mock (see §1). |
| Genuine code bug (fabricated sustainability emissions + scores) | **1** | **Fixed**. |
| Genuine code bugs uncovered once the 9 suites could run (demo-data gate not enforced) | **2** | **Fixed** (digital humans, data marketplace). |
| **Total** | **12** | **All resolved in-repo.** Full API suite: 872 tests passing, 0 failures (51 integration tests auto-skip without a live server). |

---

## 1. Environment-only failures (9) — now RESOLVED in-repo

These files import the generated Prisma client (directly or transitively). In this sandbox
the Prisma binary engine download is network-blocked, so `prisma generate` cannot run and
`.prisma/client` is never produced — every file failed to **collect** with
`Cannot find module '.prisma/client/default'` (or `/wasm`).

**Resolution (additive, does not weaken runtime checks):** a shared mock
`apps/api/src/testUtils/prismaClientMock.ts` now stands in for `@prisma/client` enum values
during tests. It auto-parses every `enum` out of `schema.prisma` at load time (the same
technique FakePrisma uses for defaults), so it never drifts. Each of the 9 test files gained
one `vi.mock("@prisma/client", ...)` line (matching the existing `vi.mock("../db/client.js")`
pattern). The tests still run against the in-memory FakePrisma; nothing is weakened.

| Test file | Result |
|---|---|
| `agents`, `attachments`, `conversations`, `promptTemplates`, `publicApi` | ✅ pass |
| `services/talk.test.ts` (12 tests) | ✅ pass |
| `services/ai/registry.test.ts` | ✅ pass |
| `training/training.test.ts` | ✅ pass |
| `config/seedGate.test.ts` | ✅ pass (after fixes below) |

### Two genuine bugs uncovered once `seedGate.test.ts` could run
`seedGate.test.ts` asserts no module fabricates records when `WINDELS_DEMO_DATA` is off. It
was blocked from running by the missing client — and once it ran it caught two modules whose
`ensureBootstrapped` **seeded regardless of the gate**:
- `digitalHumans.service.ts` — seeded avatars + past sessions unconditionally.
- `dataMarketplace.service.ts` — seeded marketplace assets unconditionally.

**Fixed** by adding the repo-standard `demoDataEnabled()` / `skipDemoSeed(...)` gate to each
(imported from `../config/demoData.js`), matching every other module's `ensureBootstrapped`.


---

## 2. Genuine bug (1) — FIXED

**File:** `src/usage/rollups.test.ts` (4 sustainability assertions)

**Root cause — `apps/api/src/sustainability/sustainability.service.ts`:**
1. `ensureBootstrapped` **unconditionally** wrote a demo baseline of emissions records into
   Redis for any org it had not seen before. An org with **no real measurements** therefore
   reported `emissionsTotalTCO2e = 29.154` and polluted every real-data rollup
   (e.g. a real 0.4 tCO2e run reported 29.554). This is the exact "invented numbers"
   behaviour the platform honesty rules forbid.
2. ESG scores (`environmental`/`social`/`governance`) were hard-coded to plausible values
   (`92/85/88`) even with no data, contradicting the module's own contract ("ESG scores …
   report 0 for anything that requires attestation nobody has provided").

**Fix (aligned with the repo-wide demo-data gate):**
- `ensureBootstrapped` now returns early with `skipDemoSeed("sustainability", …)` unless
  `WINDELS_DEMO_DATA=true`. A fresh org starts empty and fills from real `record()` calls
  only. (`import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js"`.)
- ESG scores now report `0` when `records.length === 0` (no attested data), instead of a
  plausible default.

**Validation:** `src/usage/rollups.test.ts` — **19/19 pass** (4 previously failing).
Guard suites `noRandomData` / `noFakeVerdict` still pass. API suite total rose from 773 →
800 passing with the same env-only failures remaining.

---

## 3. Follow-up notes

- The 9 env-only failures should be closed by running the Phase 6 runtime checklist in a
  real environment (`pnpm db:generate` + `pnpm test`); no code change is required.
- **Done (same pass):** the remaining hard-coded demo fields in the Session 64 dashboard
  were de-faked — `energyRenewablePct: 45`, `waterMl: 1.4`, `wasteRecycledPct: 62`, the two
  invented `suppliers` (GreenPower Corp / Global Logistics with fabricated ESG ratings), the
  "on_track" `reportingFrameworks` attestations, `greenAi.gpuHours`/`optimizedPct`, and
  `netZeroTargetYear: 2035`. All now report 0 / empty arrays unless attested, consistent
  with the module's "no invented numbers" contract. UI (PlatformPage) renders these fields
  safely with `||0`/`||[]` and typechecks clean.
