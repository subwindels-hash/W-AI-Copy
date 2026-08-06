# Session 123 — Usage Intelligence: deltas that are measured or null, denominators that admit they are empty, and the last PARTIAL module completed

**Module:** `usage` · **Status before:** PARTIAL (routes = 3, shared contract = 84 LOC, tests = 1 suite)
**Status after:** COMPLETE (routes = 5, shared contract = 168 LOC, tests = 2 suites + 1 e2e spec, web client + console)
**Date:** 2026-08-06 · **Branch:** `arena/019fd6f3-win`

---

## 1. What already existed, and is untouched

Session 55 shipped three endpoints on `/api/v1/usage-intel`:

| Endpoint | Access | Status |
| --- | --- | --- |
| `GET /usage-intel/dashboard/rollup` | any authenticated member | 200 |
| `POST /usage-intel/events` | `requireAdmin` | 201 |
| `GET /usage-intel/events` | any authenticated member | 200 |

Their paths, request bodies, status codes and response shapes are **unchanged**
(the rollup gains one **optional** `provenance` field; the ledger block gains
one additive `note`). The event ledger (`usg:evt` tenantStore keys), the
counts-from-real-records charter and the structural zeros for cost/resources
are kept. **Nothing was removed or rewritten away.**

## 2. What was wrong

| Defect | Consequence before Session 123 |
| --- | --- |
| **`deltaPct` returned `0` without a prior baseline.** | 0 reads as "no change". An organization that started measuring this month reported flat trends it had no baseline for. |
| **The AI metrics' deltas were hardcoded `0`/`"flat"`** — the prior 30-day AI window was never even queried. | "AI requests +0 % (flat)" was not a measurement; it was a placeholder. |
| **Empty denominators reported 0.** No AI requests → `Avg AI latency: 0` (0 ms is the *perfectly fast* reading) and `AI error rate: 0` (0 % is the *no failures* reading); no workflow runs → `automationRate: 0`; no members → `adoptionPct: 0`. | A fresh organization read as "perfectly fast, zero failures, nothing automated, nobody adopted it" — every one of those is an accusation or a compliment the data cannot support. |
| **Per-module `p95LatencyMs`, `errorRate` and `users` were hardcoded `0`** even though `durationMs`, `status` and `userId` sat on every AiRequest row. | The by-module breakdown — the most useful view for finding a slow/failing module — was blank. |
| **The 30-day series never carried tokens.** The field existed, but the row fetch selected only `createdAt` and `durationMs`, so `tokens` was always 0; empty days reported `latencyMs: 0`. | "Tokens per day" was a structural zero wearing a measured field's name, and empty days looked perfectly fast. |
| **`GET /events` passed an arbitrary `?limit` to Redis** and `POST /events`/`GET /events` had no no-org guard. | A `limit` of `NaN` or `1e9` went straight to the store; a session without an organization would build a key containing `undefined`. |

## 3. What Session 123 adds

### 3.1 Shared contract — `packages/shared/src/usage.ts` (84 → 168 LOC, widened + appended)

- `UsageMetric.value` / `deltaPct` are `number | null`, `trend` is
  `"up" | "down" | "flat" | null` — a measure nobody took, or a change with
  no baseline, is never 0/"flat".
- `UsageByModule.p95LatencyMs` / `errorRate` are `number | null`; `users` is
  now the measured distinct-user count.
- `UsageTimeSeriesPoint.latencyMs` is `number | null`; `automationTasks` is
  `number | null` (no metering exists); `tokens` is the real per-day sum.
- `UsageDashboard.automationRate` / `adoptionPct` are `number | null`.
- New `UsageLedgerSummary` (the route's ledger block, with the `note`),
  `UsageProvenance` + `USAGE_PROVENANCE_NOTE` (the S118 pattern), and the
  event schemas moved from the route file: `UsageEventSchema` (identical
  rules) and `UsageEventsQuerySchema` (limit 1–1000).

### 3.2 Service — measured or null

- **Prior-window AI baselines are now queried** (requests, tokens, latency,
  error rate) and the AI metrics' deltas/trends are computed from them.
- `deltaPct` returns `null` when there is no positive prior baseline; the
  point-in-time counts (AI employees, members) honestly report `null` deltas
  instead of 0/"flat".
- Empty denominators are `null`: `avgLatencyMs` (no requests), `errorRatePct`
  (no requests), `automationRate` (no runs), `adoptionPct` (no members).
- **Per-module metrics are measured from the window's request rows** — a
  single `findMany` (createdAt, durationMs, status, channel, modelId, userId,
  promptTokens, completionTokens) now drives the daily series, the per-module
  breakdown (requests, distinct users, nearest-rank p95 latency, error rate,
  share) and the per-model rollup (requests, tokens). No more hardcoded 0s.
- The 30-day series carries real token sums; empty days report
  `latencyMs: null` / `automationTasks: null`.
- `dashboard(oid, now?)` accepts an injectable clock for deterministic tests.

### 3.3 Routes — guards, clamps, correction path (3 → 5)

- All five handlers refuse a session with **no organization** with 403
  instead of building a key containing `undefined`.
- `GET /events` clamps `?limit` to 1–1000 (default 100) via the shared
  `UsageEventsQuerySchema`.
- The rollup's `ledger` block gains `note` stating its counts cover the most
  recent 100 events, newest first — "total" cannot be misread as the whole
  ledger.
- New endpoints (additive): `GET /usage-intel/events/:id` (single event,
  org-scoped — the tenantStore re-checks the record's org on read) and
  `DELETE /usage-intel/events/:id` (`requireAdmin` — the correction path for
  a mis-recorded event). Routes 3 → 5.

### 3.4 Tenant isolation

`usg:evt` is now catalogued in `TI_NAMESPACE_CATALOG` as org-scoped — the
tenantStore shape (`usg:evt:idx:<org>` / `usg:evt:i:<org>:<id>`), the same
convention as the CRM/AppBuilder/Helpdesk stores.

### 3.5 Web — client + first console

`apps/web/src/lib/usage.ts` keeps `dashboard()` and adds `events`, `event`,
`recordEvent`, `removeEvent`, re-exporting the widened contract. New
`apps/web/src/pages/admin/UsagePage.tsx` at `/app/usage` (sidebar "Usage"):
measured stat cards whose deltas print "no baseline", "not recorded" for null
values (never `0`), a 30-day request chart with per-day latency, a by-module
table (requests · users · p95 · error), top models, automation/adoption cards
("not recorded" when null), a structural-zeros card, the provenance card, and
the ledger block with its 100-event note. The S55 tab inside `PlatformPage`
was updated to the null-safe contract (a null value prints "not recorded", a
null delta prints "no baseline"). **No `?? 0` in any value position.**

## 4. Tests

- `apps/api/src/usage/usage.completion.test.ts` — **new, 21 tests**:
  - deltas: null without a baseline (conversations, members), real
    prior-window AI request/token deltas, latency/error deltas measured and
    null without a prior window, negative deltas with "down" trends;
  - empty denominators: latency/error/adoption/automation all null, and
    measured (2 of 2 members → 1.0) when data exists;
  - per-module: users/p95/error computed per channel (p95 = nearest-rank
    percentile, 33.33 % error), null rows when a module has none, top models
    with real tokens;
  - series: real per-day token counts, empty days null-latency,
    pre-window requests excluded;
  - provenance + org isolation;
  - shared schemas: event constraints identical to the old inline schema,
    query limit bounds.
- `tests/e2e/usage.spec.ts` — **new, 6 Playwright cases**: the Session 55
  surface (rollup with ledger note + provenance, events list), the
  null-not-0 invariants, an event round-trip landing in the ledger and the
  rollup aggregation, series invariants, the single-fetch + delete correction
  path (404 after), anonymous refusals on all five paths.
- The `rollups.test.ts` empty-org assertions were updated to pin the honest
  shape (adoption/automation/latency/error → `null` instead of `0`).

**Full suite: 1725 passing / 51 skipped / 115 files** (Session 122 baseline
1706 / 51 / 114). API and web typecheck clean; web production build emits the
new console chunk.

## 5. Honesty notes

- A change without a prior-period baseline is `null`, never 0/"flat"; the
  prior AI window is actually queried, not assumed.
- An empty denominator is `null`: no requests is not 0 ms latency, not a 0 %
  error rate; no runs is not 0 % automation; no members is not 0 % adoption.
- Per-module p95/error/users are measured from real rows or absent — never
  hardcoded 0.
- The series carries real tokens; empty days are `null`, not "perfectly fast".
- Structural zeros (resources, cost, savings, ROI, carbon) keep their 0 and
  are named by `provenance`; the ledger block states its 100-event window.

## 6. Runtime validation

Live PostgreSQL 17 + Redis 8 + Prisma generation is not reachable in this
sandbox, so this session ends **🟡 VERIFIED (partial)** and ships
`docs/SESSION_123_RUNTIME_VALIDATION_CHECKLIST.md` for the target
environment.

## 7. Files touched

| File | Change |
| --- | --- |
| `packages/shared/src/usage.ts` | widened null-able fields, ledger/provenance types, event schemas |
| `apps/api/src/usage/usage.service.ts` | prior-window AI baselines, measured per-module/series metrics, null empty denominators, provenance |
| `apps/api/src/http/routes/usage.ts` | org guard, limit clamp, ledger note, `GET/DELETE /events/:id` |
| `apps/api/src/tenantIsolation/tenantIsolation.service.ts` | `usg:evt` catalogued |
| `apps/api/src/usage/usage.completion.test.ts` | **new** — 21 tests |
| `apps/api/src/usage/rollups.test.ts` | empty-org assertions updated to null |
| `apps/web/src/lib/usage.ts` | events methods + widened contract |
| `apps/web/src/pages/admin/UsagePage.tsx` | **new** — console |
| `apps/web/src/pages/admin/PlatformPage.tsx` | S55 tab made null-safe |
| `apps/web/src/router.tsx`, `apps/web/src/app/Sidebar.tsx` | `/app/usage` wired |
| `tests/e2e/usage.spec.ts` | **new** — 6 cases |
| `audit/build-inventory.mjs` | usage prefix alias (`/usage-intel`) |
| `audit/module-inventory.json` | regenerated |
| `PROGRESS.md`, `docs/CHANGELOG.md`, `CONVENTIONS.md`, `README.md`, `project-understanding.md` | updated |
