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
| Environment-only (missing Prisma generated client) | **9** | Not genuine bugs — will pass after `prisma generate` in a real environment. Re-verify at runtime. |
| Genuine code bug (fabricated sustainability emissions + scores) | **1** | **Fixed** (see below). |
| **Total** | **10** | 9 pending runtime re-verify · 1 fixed |

---

## 1. Environment-only failures (9) — NOT genuine bugs

These test files `import` the generated Prisma client (directly or transitively). In this
sandbox the Prisma binary engine download is network-blocked, so `.prisma/client` is never
generated and every one of these files fails to **collect** with:

```
Error: Cannot find module '.prisma/client/default'  (or '.prisma/client/wasm')
```

| Test file | Root cause |
|---|---|
| `src/agents/agents.test.ts` | imports generated client (no mock) |
| `src/attachments/attachments.test.ts` | imports generated client |
| `src/conversations/conversations.test.ts` | imports generated client |
| `src/promptTemplates/promptTemplates.test.ts` | imports generated client |
| `src/publicApi/publicApi.test.ts` | imports generated client |
| `src/services/talk.test.ts` | imports generated client |
| `src/services/ai/registry.test.ts` | imports generated client |
| `src/config/seedGate.test.ts` | imports generated client |
| `src/training/training.test.ts` | imports generated client |

**Action required at runtime (Phase 6 checklist):** after `pnpm db:generate` succeeds,
re-run `pnpm test`. These 9 files are expected to collect and pass. If any still fail
after the client is generated, that is a genuine regression and must be fixed before the
host session is certified.

> These also explain the pre-existing `@prisma/client` typecheck errors
> (`Role` / `Permission` / `Permission` member missing): the generated client is absent, so
> the type definitions that export those enums do not exist in the sandbox. They are
> environment-only and resolve after `prisma generate`.

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
- The broader Session 64 sustainability dashboard still contains several **hard-coded**
  demo fields that are **not** pinned by the current tests and are **not** part of this fix
  (`energyRenewablePct: 45`, `waterMl: 1.4`, `wasteRecycledPct: 62`, the two seeded
  `suppliers`, `reportingFrameworks`, `greenAi.gpuHours`/`optimizedPct`). These should be
  audited and de-faked in a dedicated follow-up, under the same "no invented numbers" rule.
