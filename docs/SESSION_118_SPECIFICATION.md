# Session 118 — Operational Excellence: a register that survives, and numbers that admit what they are not

**Module:** `opex` · **Status before:** PARTIAL (routes = 3, shared contract = 73 LOC, tests = 0 unit suites)
**Status after:** COMPLETE (routes = 23, shared contract = 760 LOC, tests = 2 suites)
**Date:** 2026-08-06 · **Branch:** `arena/019fd574-win`

---

## 1. What already existed, and is untouched

Session 73 shipped three endpoints on `/api/v1/opex`:

| Endpoint | Access |
| --- | --- |
| `GET /opex/dashboard/rollup` | any authenticated member |
| `POST /opex/safety-alerts` | `requireAdmin` |
| `POST /opex/safety-alerts/:id/status` | `requireAdmin` |

Their paths, request bodies, status codes (`201` on file, `200` on transition,
`409` on an already-resolved record) and response shapes are **unchanged**. The
`OpexDashboard` contract in `packages/shared/src/opex.ts` keeps every field it
declared; `apps/web/src/lib/opex.ts` keeps `opexApi.dashboard()`; the `OpexTab()`
in `apps/web/src/pages/admin/PlatformPage.tsx` keeps working against the same
payload. `apps/api/src/opex/bootstrap.ts` still calls
`OpexService.ensureBootstrapped`. **Nothing was removed or rewritten away.**

## 2. What was wrong

This module was not merely thin. Several of the numbers it published were
false, and two of them were false in the direction that makes a system look
safer than it is.

| Defect | Consequence before Session 118 |
| --- | --- |
| **The whole register was one JSON array in one Redis string** (`opex:<org>:safety-alerts`). Every write was a read-modify-write over the entire register. | Two administrators filing a finding in the same instant lost one of them, silently. There was no per-record key, no index, no history. |
| **There was no resolution timestamp at all.** The record stored `at` (the filing time) and overwrote `acknowledgedBy` / `resolvedBy` in place. | `mitigations24h` filtered on `a.status === "resolved" && a.at >= 24h ago`. A finding filed three days ago and closed a minute ago **did not count**; one filed two hours ago and closed ninety minutes ago **did**. The headline "mitigations in the last 24 hours" measured filings, not mitigations. |
| **`reliability` used `Math.round`.** | 999 successes out of 1 000 reported **100 %**. A reliability metric that rounds a failure away cannot be used to notice one. |
| **`dataFreshnessHours` was `0` when nothing had ever run.** | Zero hours old is the value for *perfectly fresh*. A deployment that had never recorded a single AI request reported the freshest possible data. |
| **`trust.humanApprovalRate` mixed two windows.** | The numerator was tasks completed in the last 30 days; the denominator was every `TODO`/`IN_PROGRESS` task ever created. The ratio moved for reasons unrelated to approval behaviour. |
| **Five trust dimensions were the literal number `0`.** `alignment`, `compliance`, `transparency`, `explainability`, `hallucinationRisk`. | On a 0–100 scale, zero is a score. `alignment: 0` reads as "catastrophically misaligned". Worse, `hallucinationRisk: 0` — a *risk* dimension where low is good — reads as **"this system does not hallucinate"**. Nothing in the platform assesses any of them. |
| **One signal was published under three names.** `trust.trust`, `trust.reliability` and `trust.operationalStability` were the same variable. | A dashboard showing three green gauges was showing one number three times. |
| **`safety.passRate` was the closure rate, labelled as safety.** | An organization that files one trivial finding and closes it reaches 100 % "safety pass rate". |
| **A resolved finding could never be reopened.** The Session 73 handler refused every change to a resolved record. | A mis-resolution was permanent. There was no correction path and no audit of one. |
| **Seven contract sections had no implementation.** `regulations`, `playbooks`, `explanations`, `governance.gates`, `safety.benchmarks`, `continuous.maturityScore`, `collaborationSessionsActive`. | They returned structural zeros indistinguishable from measurements of zero. |

## 3. What Session 118 adds

### 3.1 Shared contract — `packages/shared/src/opex.ts` (73 → 760 LOC, **appended**)

The Session 73 block is untouched; everything below it is new. `OpexDashboard`
gained one **optional** field (`provenance?`) so existing consumers still
compile.

Core type: **`OpexMeasure`** — `value: number | null`, plus `basis`
(`observed` | `operator_assessed` | `not_assessed`), `direction`
(`higher_is_better` | `lower_is_better`), `sampleSize`, `asOf`, `stale`,
`detail`. Every published number in the new surface is one of these, and a
measure nobody has taken carries `null`, never `0`.

Also: `OpexAlertRecord` (durable, with `filedAt` / `acknowledgedAt` /
`resolvedAt` / `reopenedAt` / `reopenCount` / `importedFromLegacyRegister` /
`transitions[]`), `OpexTransition`, `OpexAlertPage`, `OpexAgeing`,
`OpexRegisterSummary`, `OpexStat`, `OpexTimings`, `OpexReliability`,
`OpexFailureGroup`/`OpexFailureBreakdown`, `OpexAssessment` /
`OpexAssessmentRegister`, `OpexTrustReport`, `OpexPolicy` /
`OpexPolicyUpdateInput`, `OpexBreach` / `OpexBreachReport`,
`OpexConfigurationCheck` / `OpexConfigurationReport`, `OpexGap` /
`OpexGapReport`, `OpexProvenanceEntry` / `OpexProvenance`, `OpexEvent` /
`OpexEventPage`, `OpexAssuranceSummary`.

Constants: `OPEX_MAX_ALERTS = 2000`, `OPEX_MAX_ALERT_PAGE = 200`,
`OPEX_EVENT_LIMIT = 500`, `OPEX_MAX_LATENCY_SAMPLE = 2000`,
`OPEX_DEFAULT_RELIABILITY_WINDOW_DAYS = 30`,
`OPEX_MAX_RELIABILITY_WINDOW_DAYS = 365`, `OPEX_DEFAULT_CRITICAL_ACK_HOURS = 4`,
`OPEX_DEFAULT_CRITICAL_RESOLVE_HOURS = 72`,
`OPEX_DEFAULT_ASSESSMENT_VALIDITY_DAYS = 180`,
`OPEX_MIN_ASSESSMENT_METHOD_LENGTH = 10`, `OPEX_MIN_REOPEN_REASON_LENGTH = 10`,
`OPEX_ASSESSED_DIMENSIONS` (7), `OPEX_RISK_DIMENSIONS`,
`OPEX_UNIMPLEMENTED_SECTIONS` (7), `OPEX_EVENT_KINDS` (9).

Pure helpers, shared by both sides: `defaultOpexPolicy`, **`opexRatePercent`**
(floored; `null` for an empty denominator), `opexHoursBetween`,
`opexPercentile`, `opexAgeingBucket`, `emptyOpexAgeing`, `opexAssessmentStale`,
`opexAssessmentExpiry`, `opexDimensionDirection`, `notAssessedMeasure`,
`opexGapReport`.

Zod: `OpexAlertQuerySchema`, `OpexAlertIdParamSchema`, `OpexReopenSchema`
(reason ≥ 10 chars), `OpexDimensionParamSchema`, `OpexAssessmentInputSchema`
(method ≥ 10 chars), `OpexPolicyUpdateSchema`, `OpexWindowQuerySchema`,
`OpexEventQuerySchema`.

### 3.2 Service — `apps/api/src/opex/opexAssurance.service.ts` (1 272 LOC, new)

**Durability.** One key per finding — `opx:alert:<org>:<id>` — behind an
append-only newest-first index `opx:idx:<org>`. Two concurrent files no longer
race over one string. Assessments live at `opx:assess:<org>:<dimension>`, the
policy at `opx:policy:<org>`, the ledger at `opx:event:<org>`, and the
one-shot adoption marker at `opx:imported:<org>`.

**Adoption, not migration-by-invention.** `ensureLegacyImported` reads the
Session 73 blob once and writes each entry as a durable record with
`importedFromLegacyRegister: true`, `acknowledgedAt: null` and `resolvedAt:
null` — because those times were never recorded and cannot be recovered. The
legacy string is **left in place**; a corrupt or non-array blob is tolerated
rather than fatal. Adopted records are excluded from every timing statistic and
counted in `resolvedTimeUnknown`, never given an invented timestamp.

**Correct arithmetic.** `resolvedLast24h` filters on `resolvedAt`.
`successRatePercent` is floored. `dataFreshnessHours` is `null` when no request
was ever recorded. `taskClosure` puts both sides of the ratio in the same
window. Latency percentiles are computed from a bounded sample and the payload
says when it was sampled.

**Correction path.** `reopenAlert` moves a `resolved` finding back to `open`,
increments `reopenCount`, sets `reopenedAt`, requires a written reason when the
policy says so, and **appends** the transition — the resolution it undoes stays
in the history.

**No composite.** `trustReport` returns `compositeScore: null` as a typed
literal, so the field cannot be filled in later by accident, plus the
`observed` / `assessed` / `notAssessed` counts that sum to the number of
measures.

### 3.3 Session 73 service — `apps/api/src/opex/opex.service.ts` (93 → 199 LOC)

Same exports, same signatures, same return shapes. `createAlert` and
`updateAlert` now write through `OpexAssuranceService` (the `409` message now
points at the reopen path, which exists). `dashboard` keeps its shape, corrects
`mitigations24h`, floors `reliability`, aligns the `humanApprovalRate` windows,
and attaches the new `provenance` block. The remaining zeros stay — the
contract types them non-nullable — but provenance now states, field by field,
which is a measurement and which is a structural zero, and `GET /opex/trust`
publishes the nullable version.

### 3.4 Routes — `apps/api/src/http/routes/opexAssurance.ts` (374 LOC, 20 endpoints)

Mounted on the same `/opex` router **ahead of** `registerOpexRoutes`, so the
Session 73 paths fall through untouched; none of the new paths collide with
`/safety-alerts/...`. `authenticate` is already applied to the router in
`server.ts`; `requireAdmin` is attached to every state-changing handler,
matching the access rules Session 73 chose. A session carrying no organization
is refused rather than falling back to a default — the Session 73 bootstrap
default (`org-windels`) is never used as a read scope.

```
GET    /opex/register/alerts                    GET    /opex/reliability
GET    /opex/register/summary                   GET    /opex/reliability/failures
GET    /opex/register/timings                   GET    /opex/assessments
GET    /opex/register/breaches                  PUT    /opex/assessments/:dimension   (admin)
GET    /opex/register/alerts/:alertId           DELETE /opex/assessments/:dimension   (admin)
GET    /opex/register/alerts/:alertId/history   GET    /opex/trust
POST   /opex/register/alerts/:alertId/reopen    GET    /opex/policy
       (admin)                                  PUT    /opex/policy                   (admin)
GET    /opex/assurance/summary                  GET    /opex/assurance/configuration
GET    /opex/assurance/gaps                     GET    /opex/assurance/provenance
GET    /opex/events
```

### 3.5 Tenant isolation (Session 89 sweep)

All eight prefixes are catalogued `org_scoped`: the legacy `opex` (covering
`opex:<org>:meta` and `opex:<org>:safety-alerts`), plus `opx:alert`, `opx:idx`,
`opx:assess`, `opx:policy`, `opx:event`, `opx:imported`.

> The new keys use `opx:` rather than `opex:` **on purpose**. The sweep derives
> the organization position as `ns.prefix.split(":").length`. Session 73's keys
> put the organization in the second segment (`opex:<org>:…`), so a new
> `opex:alert:<org>:<id>` key would make the sweep read the literal string
> `alert` as an organization id and report a check it never made. `opx:alert`
> is a two-segment prefix, so the organization lands where the sweep looks.

### 3.6 Web

* `apps/web/src/lib/opex.ts` (8 → 159 LOC) — `opexApi` unchanged; adds the typed
  `opexAssuranceApi` (20 paths), `formatOpexMeasure` (renders `null` as
  "not assessed", never `0`), `OPEX_BASIS_LABELS`, `OPEX_STATUS_LABELS`.
* `apps/web/src/pages/admin/OpexAssurancePage.tsx` (1 149 LOC, new) —
  `/app/opex`, sidebar entry **Operational Excellence**. Nine tabs: overview ·
  safety register · response times · reliability · assessments · trust
  dimensions · policy · gaps & readiness · ledger. Reads are open to any member
  because the API allows them; the write controls (reopen, record/clear an
  assessment, save the policy) are hidden from non-administrators because the
  API refuses them, and a control that always fails is worse than no control.
  A `null` measure renders as *not assessed* in italics — the page has no
  `?? 0` fallback anywhere in a value position.

## 4. Honesty rules encoded

1. **A measure with no data is `null`, never `0`.** Stated in the payload
   (`OPEX_MEASURE_NOTE`) and enforced by the type: `OpexMeasure.value` is
   `number | null`.
2. **A risk dimension is never zero by default.** `hallucination_risk` reports
   `not_assessed` with `direction: "lower_is_better"`, so a missing value cannot
   be read as "no risk".
3. **No composite trust score.** `compositeScore` is typed `null`, and
   `compositeNote` says why: averaging observed traffic statistics against
   unassessed dimensions produces a figure whose movement cannot be attributed
   to anything.
4. **Rates are floored, never rounded.** 999/1 000 is 99 %.
5. **An empty denominator yields `null`, not `0`.** No filings means no closure
   rate; no traffic means no success rate.
6. **Closure is not safety.** `closureNote` says the rate is the share of
   findings a human marked closed, and says the one-trivial-finding case out
   loud.
7. **Freshness is `null` when nothing was ever recorded**, because `0 h old`
   is the value for *perfectly fresh*.
8. **Adopted records are flagged and excluded**, with `excluded` and
   `excludedReason` shipped inside every timing stat, rather than being given
   an invented timestamp.
9. **A reopen appends; it never erases.** The resolution it undoes stays in the
   transition list, and `reopenCount` is published.
10. **Expectations are advisory.** The policy note says this API records
    breaches of the organization's own expectations and refuses nothing.
11. **A warning is never rounded up to a pass.** `ready` is derived as
    `!checks.some(c => c.state === "fail")`, and warnings are shown as
    warnings.
12. **Structural zeros are named.** The provenance block lists, field by field,
    which Session 73 rollup numbers are observed and which come from one of the
    seven declared-but-unimplemented sections; the gap report lists the same
    sections so an absence is not read as a measurement.
13. **The ledger describes events recorded since it was introduced.** Nothing
    before it is reconstructed or estimated.
14. **An assessment is a human judgement this platform reports**, not the
    platform evaluating itself: the method is required (≥ 10 characters), the
    author and time are stored, and an assessment past its validity window is
    marked `stale` rather than silently trusted.

## 5. Tests

`apps/api/src/opex/opexAssurance.test.ts` — **80 tests**, fully in-memory
(`FakeKv` + `FakePrisma`), across 15 groups:

* **safety register durability** — one key per finding, concurrent files both
  survive, the index is append-only, retention trims oldest-first and records
  the trim;
* **transition timestamps** — the filing-vs-resolution bug proved in *both*
  directions: a finding filed three days ago and closed now **counts**, one
  filed two hours ago and closed ninety minutes ago **does not**;
* **reopening** — a resolved finding reopens, the reason is required, the
  resolution stays in the history, `reopenCount` increments;
* **Session 73 register adoption** — adopted once only, `null` transition
  times, `resolvedTimeUnknown`, a corrupt blob tolerated, the legacy string not
  destroyed;
* **register summary** — floored closure rate, `null` closure rate on an empty
  register, ageing buckets, acknowledged still counted as open;
* **timings** — median and p90, `null` rather than `0` on an empty sample,
  exclusions counted with a reason;
* **expectation breaches** — critical-only, adopted records excluded, cleared
  on resolve;
* **reliability** — 999/1 000 → 99, `null` (not `0`) freshness with no traffic,
  latency percentiles, window bounds, failure breakdown by provider / model /
  channel, a 0 % failure rate reported as a measurement rather than an absence;
* **operator assessments** — `null` not `0` before assessment, the risk
  dimension `null`, staleness, never-expires when validity is `null`, cleared →
  `not_assessed`, an honest "there was nothing to clear";
* **trust report** — no composite, `observed + assessed + notAssessed ===
  measures.length`, the one-signal-under-three-names duplication gone, task
  closure labelled, both sides of the task ratio in one window;
* **policy** — defaults, storage, a resolution expectation earlier than the
  acknowledgement expectation refused, per-organization isolation;
* **organization isolation** — no cross-organization read, a forged record
  skipped, assessments and ledgers kept apart, the key-prefix shape asserted;
* **configuration and gaps** — warnings not rounded up, the seven unimplemented
  sections named, the ledger's own caveat;
* **Session 73 compatibility** — `createAlert` / `updateAlert` return the old
  shape, no durable-only field leaks, the `409` message points at the reopen
  path, the rollup's `mitigations24h` fix, provenance attached, reliability
  floored;
* **shared helpers** — the pure functions both sides derive state from.

`tests/e2e/opexAssurance.spec.ts` — 21 Playwright cases against a live API:
anonymous refusal of all eight read paths, Session 73 path and shape
preservation, provenance, a finding driven file → acknowledge → close → reopen
over HTTP with its three distinct timestamps, `mitigations24h` agreeing with
`resolvedLast24h`, closure labelled as closure, a reason-less reopen refused,
timing exclusions, floored reliability, `null` dimensions, no composite,
assessment record/clear round-trip, a method-less assessment refused, the risk
dimension's direction, the advisory policy, an inverted policy refused,
readiness, gaps, the ledger, and agreement between the assurance summary and
the reports it is built from.

> **Deliberately not asserted:** that `trust.trust` in the Session 73 rollup is
> greater than zero. That number is now the floored success rate of recorded AI
> traffic, so on a deployment that has served no AI request it is legitimately
> `0`. `tests/e2e/sessions73-75.spec.ts` still contains
> `expect(d.data.trust.trust).toBeGreaterThan(0)` — it was **not** modified in
> this additive session; see the runtime checklist, which asks the operator to
> confirm the fixture has AI traffic before that live-only assertion is
> expected to hold.

Repository suite after this session: **1 542 passing, 51 skipped, 0 failures**
(110 files: 107 passed + 3 skipped); guard suites `noRandomData`,
`noFakeVerdict`, `demoCleanup`, `seedGate` all green. `apps/api` typechecks with
zero non-Prisma errors; `apps/web` typechecks clean.

## 6. Inventory

`opex` PARTIAL → COMPLETE — routes 3 → 23, shared contract 73 → 760 LOC,
service total 3 935 LOC, web client 8 → 159 LOC, one new console page, 2 test
suites. Repository totals: **98 COMPLETE / 5 PARTIAL / 2 STUB-by-design /
1 DEMO DATA** across 106 modules.

Remaining PARTIAL: `promptTemplates`, `publicApi`, `sustainability`, `talk`,
`usage`.

## 7. Status

🟡 **VERIFIED (partial).** Runtime validation against live PostgreSQL 17 +
Redis 8 + a generated Prisma client is not possible in this sandbox. See
`docs/SESSION_118_RUNTIME_VALIDATION_CHECKLIST.md`.
