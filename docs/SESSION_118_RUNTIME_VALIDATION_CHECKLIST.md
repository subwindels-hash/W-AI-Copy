# Session 118 Runtime Validation Checklist — Operational Excellence assurance

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted.
> Until every box is ticked and signed, Session 118 stays 🟡 VERIFIED (partial).

Several checks below need an organization that has **actually served AI
requests** and one that has **not**. The unit suite proves the arithmetic
against an in-memory Prisma and KV; only a live deployment proves that the
`AiRequest` table, the Redis keyspace and the Session 89 sweep behave as this
module assumes.

## Route mounting and backwards compatibility

- [ ] All three Session 73 endpoints answer on their original paths after the
      Session 118 router was mounted **ahead of** them on the same prefix:
      `GET /opex/dashboard/rollup`, `POST /opex/safety-alerts`,
      `POST /opex/safety-alerts/:id/status`.
- [ ] `POST /opex/safety-alerts` still returns **`201`** with the Session 73
      alert shape (`id`, `category`, `severity`, `source`, `message`, `at`,
      `status`, and optionally `model` / `acknowledgedBy` / `resolvedBy` /
      `note`) and **no** durable-only field (`filedAt`, `transitions`,
      `reopenCount`, `importedFromLegacyRegister`).
- [ ] `POST /opex/safety-alerts/:id/status` on an already-resolved record still
      answers `409`, and the message now names the reopen path.
- [ ] The `OpexTab()` in `/app/platform` renders unchanged against the rollup —
      an unmodified older web build works against the new server.
- [ ] All twenty Session 118 paths answer `401` without a token.
- [ ] `POST /opex/register/alerts/:id/reopen`, `PUT`/`DELETE
      /opex/assessments/:dimension` and `PUT /opex/policy` answer `403` for an
      ordinary member and succeed for an administrator.
- [ ] A session with **no organization** receives `403` from every assurance
      path — not a Redis key containing the literal string `undefined`, and not
      a silent fall-back to the bootstrap default `org-windels`.
- [ ] An unknown path under `/opex` returns `404`, not a stack trace.

## The defect this session fixes

- [ ] File a finding. Backdate its `filedAt` in Redis to **three days ago**,
      then resolve it now. Confirm:
      - [ ] `GET /opex/register/summary` counts it in `resolvedLast24h`;
      - [ ] `GET /opex/dashboard/rollup` reports the same number in
            `safety.mitigations24h`.
      *(Before this session it counted zero — the filter used the filing time.)*
- [ ] File a finding, backdate its `resolvedAt` to **ninety minutes ago** while
      leaving `filedAt` at two hours ago, then move `resolvedAt` to 30 hours
      ago. Confirm it **drops out** of `resolvedLast24h` even though it was
      filed recently. *(Before this session it counted.)*
- [ ] Confirm against the previous build, if one is still deployed, that the
      same two sequences produced the opposite answers — this is the regression
      the session exists to close.

## Register durability and concurrency

- [ ] `KEYS opx:alert:*` shows **one key per finding**, and `opx:idx:<org>` is a
      list, not a single JSON string.
- [ ] Fire twenty concurrent `POST /opex/safety-alerts` from two administrators
      against two API instances behind a load balancer. **All twenty** are
      present afterwards. *(This is the check the in-memory suite structurally
      cannot make; before this session the read-modify-write over one string
      lost writes.)*
- [ ] Restart Redis with persistence enabled — the register, the assessments,
      the policy and the ledger survive.
- [ ] With persistence disabled, confirm the deployment checklist treats an
      ephemeral Redis as a **data-loss risk for the safety register**, not
      merely for a cache.
- [ ] Set `registerRetention` low, file past it, and confirm the oldest records
      are trimmed, `truncated` is reported honestly, and
      `GET /opex/events?kind=alert_trimmed` records the trim.

## Session 73 register adoption

- [ ] On an organization holding a pre-existing `opex:<org>:safety-alerts`
      string, the first assurance read adopts every entry with
      `importedFromLegacyRegister: true`, `acknowledgedAt: null` and
      `resolvedAt: null`.
- [ ] The legacy string is **still present** afterwards (adoption does not
      destroy the Session 73 data).
- [ ] Adoption happens **once**: `opx:imported:<org>` is set, and a second read
      does not duplicate the records.
- [ ] Corrupt the legacy string to `"not-json"` and confirm the assurance reads
      still answer — tolerated, not fatal.
- [ ] Adopted records appear in `resolvedTimeUnknown`, are excluded from
      `GET /opex/register/timings` with the exclusion counted and explained, and
      are excluded from `GET /opex/register/breaches`
      (`excludedImported > 0`).
- [ ] `POST /opex/safety-alerts/:id/status` on a **legacy** id still works — the
      id is adopted rather than reported missing.

## Reopening

- [ ] Resolve a finding, then `POST /opex/register/alerts/:id/reopen` with a
      reason. Status returns to `open`, `reopenCount` is `1`, `reopenedAt` is
      set. *(There was no way to do this before.)*
- [ ] `GET /opex/register/alerts/:id/history` still contains the
      `→ resolved` transition **and** the `resolved → open` one — nothing was
      erased.
- [ ] A reopen with a reason shorter than 10 characters is refused while
      `requireReopenReason` is `true`.
- [ ] Set `requireReopenReason: false` and confirm the reason becomes optional
      and the change is recorded in the ledger.

## Reliability, against real AI traffic

- [ ] On an organization with **no** `AiRequest` rows:
      `successRatePercent` is `null`, `dataFreshnessHours` is `null`,
      `lastRequestAt` is `null`, and the latency percentiles are `null`.
      **None of them is `0`.**
- [ ] On an organization with exactly 1 000 recorded requests of which 1 failed,
      `successRatePercent` is **99**, not 100.
- [ ] `GET /opex/reliability?windowDays=7` and `?windowDays=365` both answer and
      report the window they used; `?windowDays=0` and `?windowDays=9999` are
      refused.
- [ ] Latency p50/p95 are computed from `durationMs`; when the window exceeds
      `OPEX_MAX_LATENCY_SAMPLE` the payload reports `sampled: true` and the
      sample size it used.
- [ ] `GET /opex/reliability/failures` groups by `provider`, `modelId` and
      `channel` from real rows, and a group with no failures reports `0`, which
      is a measurement, while a group with no traffic reports `null`.
- [ ] `dataFreshnessHours` advances as the clock moves and matches
      `now - lastRequestAt`.

## Assessments and trust

- [ ] On a fresh organization, `GET /opex/trust` reports all seven assessed
      dimensions with `value: null`, `basis: "not_assessed"`, `sampleSize: 0`.
      **Confirm visually that no dimension shows `0`.**
- [ ] `hallucination_risk` carries `direction: "lower_is_better"` and is `null`
      until assessed — the specific misreading this session exists to prevent.
- [ ] `PUT /opex/assessments/alignment` with a method shorter than 10 characters
      is refused; with a valid method it is stored with the author and time, and
      appears as `operator_assessed` in `GET /opex/trust`.
- [ ] Backdate an assessment past `assessmentValidityDays`: it is reported
      `stale: true`, and the measure carries `stale` too.
- [ ] Set `assessmentValidityDays: null`: `expiresAt` is `null` and nothing goes
      stale.
- [ ] `DELETE` an assessment that was never recorded answers honestly
      (`cleared: false`) rather than claiming a deletion.
- [ ] `GET /opex/trust` reports `compositeScore: null` on every organization,
      and `observed + assessed + notAssessed === measures.length`.
- [ ] `trust.trust`, `trust.reliability` and `trust.operationalStability` in the
      **Session 73 rollup** remain the same number (contract preserved), but the
      assurance report no longer republishes one signal under three names.

## Policy

- [ ] `GET /opex/policy` on a fresh organization reports `isDefault: true` with
      the Session 73-equivalent defaults (30-day window, 2 000 retention, 4 h
      acknowledge, 72 h resolve, 180-day assessment validity, reopen reason
      required).
- [ ] `PUT /opex/policy` persists; a second `GET` reports `isDefault: false`
      with `updatedBy` and `updatedAt` set, and the ledger records
      `policy_updated`.
- [ ] `criticalResolveHours < criticalAckHours` is refused.
- [ ] The policy is **advisory**: with a 1-hour acknowledge expectation and a
      two-day-old open critical, the API records a breach and still serves every
      request. Nothing is blocked.
- [ ] Two organizations hold independent policies; neither read leaks the other.

## Tenant isolation (Session 89 sweep)

- [ ] Run the isolation sweep. All eight namespaces — `opex`, `opx:alert`,
      `opx:idx`, `opx:assess`, `opx:policy`, `opx:event`, `opx:imported` — are
      reported `org_scoped` and conformant.
- [ ] Confirm the sweep resolves the organization segment correctly for the
      `opx:` keys (it reads `parts[2]`). A key mistakenly named
      `opex:alert:<org>:<id>` would make it read the literal `alert` as an
      organization id; assert no such key exists.
- [ ] With two organizations holding findings, a `KEYS opx:*` dump shows every
      key carrying an organization id, and no read from organization A returns a
      record belonging to organization B.
- [ ] Plant a forged record whose stored `organizationId` disagrees with its key
      and confirm the reader **skips** it rather than returning it.

## Configuration, gaps and provenance

- [ ] `GET /opex/assurance/configuration` reports `ready` as
      `!checks.some(state === "fail")` — a `warn` is never rounded up to a pass
      and never rounded down to a failure.
- [ ] `unimplementedSections` names all seven declared-but-unimplemented
      Session 73 sections.
- [ ] `GET /opex/assurance/gaps` lists those sections plus any live gaps
      (open criticals, breaches, never-assessed dimensions, stale assessments,
      no recorded AI traffic) and publishes **no score**.
- [ ] `GET /opex/assurance/provenance` marks every rollup field, and
      `structuralZeroFields > 0` on every deployment until those sections are
      implemented.
- [ ] `GET /opex/dashboard/rollup` carries the `provenance` block, and an older
      consumer that ignores it is unaffected.

## Ledger durability

- [ ] `GET /opex/events` records `alert_filed`, `alert_acknowledged`,
      `alert_resolved`, `alert_reopened`, `assessment_recorded`,
      `assessment_cleared`, `policy_updated` and
      `legacy_register_imported` as they happen.
- [ ] The ledger trims at `OPEX_EVENT_LIMIT` and reports `stored` honestly at
      the boundary.
- [ ] `?kind=` and `?alertId=` filters return only matching events.

## Existing E2E interaction

- [ ] `tests/e2e/sessions73-75.spec.ts` asserts
      `expect(d.data.trust.trust).toBeGreaterThan(0)`. `trust.trust` is now the
      **floored** success rate of recorded AI traffic. Before running that
      suite live, confirm the fixture organization (`admin@windels.ai`) has at
      least one recorded `AiRequest` **and** at least 1 % of them succeeded;
      otherwise the assertion is asserting the fixture, not the code. Decide
      then whether to seed traffic in `global-setup.ts` or relax the assertion
      in a **later** session — it was deliberately not modified in this
      additive one.
- [ ] `tests/e2e/opexAssurance.spec.ts` passes in full against the live API.

## Web console

- [ ] `/app/opex` loads for an administrator with all nine tabs and the
      **Operational Excellence** sidebar entry.
- [ ] It loads for an ordinary member with the same nine tabs, but with the
      reopen button, the assessment form, the clear buttons and the policy
      inputs absent (policy shown read-only).
- [ ] On a fresh organization, the trust tab shows *not assessed* in italics for
      all seven dimensions. **Grep the rendered DOM: there must be no `0%` in a
      dimension value cell.**
- [ ] The register tab expands a finding's history, shows the adopted badge on
      imported records, and offers reopen only on resolved ones.
- [ ] The reliability tab's window selector re-queries and the returned
      `windowDays` matches the selection.
- [ ] The gaps tab lists the seven unimplemented sections and the readiness
      checks with their real states.
- [ ] The ledger tab shows the caveat about events recorded since the ledger was
      introduced.

## Sign-off

| Check group | Run by | Date | Result |
| --- | --- | --- | --- |
| Route mounting and backwards compatibility | | | |
| The defect this session fixes | | | |
| Register durability and concurrency | | | |
| Session 73 register adoption | | | |
| Reopening | | | |
| Reliability | | | |
| Assessments and trust | | | |
| Policy | | | |
| Tenant isolation | | | |
| Configuration, gaps and provenance | | | |
| Ledger durability | | | |
| Existing E2E interaction | | | |
| Web console | | | |
