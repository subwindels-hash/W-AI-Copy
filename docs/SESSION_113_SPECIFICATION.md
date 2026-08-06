# SESSION 113 SPECIFICATION — DERIVATIVES & FIXED-INCOME COMPLETION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S112, removes nothing)
Document Owner: Markets — Derivatives & Fixed Income
Applies To: WINDELS AI OS Monorepo
```

## 1. Objective

Session 81 shipped four derivatives endpoints backed by genuinely good
quantitative code: Black-Scholes with Greeks, a Newton-Raphson implied-volatility
solver that reports non-convergence as `null` rather than a clamped boundary,
multi-leg payoff, and bond duration/convexity. That maths is correct, well
tested (`tradingIntel/derivatives.test.ts`, `derivativesContract.test.ts`) and is
**not** touched by this session.

What was missing was everything that makes those functions a product:

- **Nothing was ever stored.** All four endpoints were pure functions of the
  request body. You could price one option, read the number and close the tab.
  There was no book, so there was no portfolio delta, no theta bleed, no
  scenario analysis, no ladder — and no way to answer "what does this
  organization actually hold".
- **There was no organization scope at all.** The four routes were registered
  directly on the `/api/v1` router with no `authenticate`, because a pure
  function has nothing to scope. The moment the module holds records, that
  stops being acceptable.
- **The only UI was a tab inside Trading Intelligence.** `DerivativesPanel`
  is a calculator; there was no desk, and the inventory reported
  `web.pages: []` for the module.
- **Payoff was a single point.** `strategyPayoff(legs, S)` answers "what is
  this worth at exactly this spot" — not where the breakevens are, whether the
  loss is capped, or whether the upside is unbounded.

Session 113 completes the module additively:

1. a `Deriv*` extension to the existing shared contract (same file, nothing
   renamed) with Zod input schemas;
2. an organization-scoped desk service over Redis — option positions and bond
   holdings — that re-uses the Session 81 functions for every number it reports;
3. seventeen new endpoints on a `/derivatives` sub-router mounted **ahead of**
   the Session 81 calculators, which keep their paths and their behaviour;
4. a typed web client and a dedicated `/app/derivatives` desk;
5. twenty-seven unit tests and a seven-case Playwright spec.

Nothing in `tradingIntel/derivatives.ts`, `routes/derivatives.ts` or the
Trading Intelligence panel was rewritten or removed.

## 2. Domain model

| Record / view | Purpose | Honesty rule |
|---|---|---|
| `DerivPosition` | one option line in the book | every mark is `markSource: "operator_entered"` with the timestamp it was entered; `markSpot`, `impliedVol`, `riskFreeRate` and `premiumPerShare` are `null` when nobody supplied them, never defaulted into existence |
| `DerivPositionValuation` | one position priced at its own mark | carries `markFreshness` (`fresh`/`stale`/`unmarked`), `rateUsed` **and** `rateSource` so a desk-default rate is never mistaken for the position's own, and `unrealizedPnl: null` when no entry premium was recorded |
| `DerivUnpriceable` | why a position was left out | every aggregate that excludes a position also names it and states the reason in prose |
| `DerivUnderlyingExposure` | exposure grouped per symbol | `markSpotConflict: true` when two positions on the same underlying carry different marks — the desk reports the disagreement instead of picking one |
| `DerivPortfolioGreeks` | book-level exposure | `deltaNotional: null` when nothing could be priced (an unmeasured book is not a flat book); `positionsMissingPremium` counts what was left out of P&L; ships `DERIV_AGGREGATION_NOTE` and `DERIV_VALUATION_DISCLAIMER` |
| `DerivScenarioGrid` | spot × vol stress | `method: "full_reprice"` — every cell goes back through Black-Scholes, not a Taylor expansion — and each cell reports `pricedPositions`, which *drops* where a shock pushes volatility to zero |
| `DerivPayoffCurve` | expiry payoff over a range | extremes are named `maxProfitInRange` / `maxLossInRange`; `unboundedAbove` / `unboundedBelow` flag strategies whose payoff keeps moving past the sampled boundary; breakevens are declared linearly interpolated |
| `DerivHedgeSuggestion` | delta-neutral share count | `method: "static_delta_neutral"`, gamma explicitly ignored; a book with nothing priced is reported as unmeasured, with the sentence "this is not a flat book — it is an unmeasured one" |
| `DerivParityCheck` | put-call parity residual | reports the arithmetic and names the rich leg; states in the payload that it is **not** an arbitrage claim |
| `DerivBondHolding` | one fixed-income line | a holding needs either a yield or a price; creating (or updating into) a state with neither is a `400`, because the desk will not assume a yield |
| `DerivBondLadder` | ladder rollup | weighted metrics are `null`, not `0`, when nothing could be valued; shifted yields are a **full reprice** compared against the model's own base valuation; excluded holdings are listed |
| `DerivDeskSummary` | desk rollup | declares `marketDataSource: "none_operator_entered_only"` |

### What is deliberately *not* implemented

- **No market data.** No options chain, no quote feed, no yield curve, no
  dividend calendar. Every input is operator-entered and stamped as such. The
  platform has no credentialed market-data provider, and this session does not
  pretend otherwise.
- **No mark-to-market clock.** `yearsToExpiry` is what was recorded; the desk
  does not decay it in the background, because silently changing a stored input
  would change every historical number with it.
- **No American exercise, skew surface, borrow cost or accrued interest.**
  The disclaimer names each of these omissions.
- **No AI.** Nothing in this module calls a model. Every figure is arithmetic
  over stored inputs.
- **No trade execution.** The book records what an operator says they hold; it
  places no orders and connects to no broker. (The separate Session 81 broker
  surface is untouched.)

## 3. Storage

Redis, organization-scoped, following the key shape the Session 89 namespace
audit recognises:

```
deriv:pos:i:<org>:<id>     deriv:pos:idx:<org>     (ZSET, score = createdAt)
deriv:bond:i:<org>:<id>    deriv:bond:idx:<org>    (ZSET, score = createdAt)
```

`deriv:pos` and `deriv:bond` were added to `TI_NAMESPACE_CATALOG` as
`org_scoped`, so the Session 89 sweep now flags any key of theirs that is
missing the org segment.

Reads fail closed twice: the key is org-addressed, **and** the decoded record's
stored `organizationId` is re-checked before it is returned. A record planted
under another tenant's key with a foreign `organizationId` is invisible — this
is covered by a test rather than asserted here.

Identifiers are `deriv_pos_${randomUUID()}` / `deriv_bnd_${randomUUID()}` from
`node:crypto` — never a counter, a timestamp or `Math.random`.

## 4. Endpoints

All under `/api/v1/derivatives`. Reads and the stateless analytics require an
authenticated caller; anything that mutates the book requires an administrator.

| Method | Path | Notes |
|---|---|---|
| GET | `/desk` | rollup across both books, with disclaimers |
| GET | `/portfolio` | exposure, optionally filtered to one `underlying` |
| POST | `/portfolio/scenarios` | spot × vol grid, full reprice, ≤ 400 cells |
| POST | `/portfolio/hedge` | static delta-neutral share count for one symbol |
| GET | `/positions` | filter by `underlying`, `type`, `side`; newest first |
| POST | `/positions` | admin; creates a book line |
| GET | `/positions/:id` | fail-closed org check |
| PATCH | `/positions/:id` | admin; only a re-mark refreshes `markedAt` |
| DELETE | `/positions/:id` | admin |
| POST | `/payoff-curve` | sampled expiry payoff, breakevens, boundedness |
| POST | `/parity-check` | put-call parity residual |
| GET | `/bonds/ladder` | declared **before** `/bonds/:id`; `shiftsBps` query |
| GET | `/bonds` | holdings, newest first |
| POST | `/bonds` | admin; `400` without a yield or a price |
| GET | `/bonds/:id` | fail-closed org check |
| PATCH | `/bonds/:id` | admin; `400` if it would leave the holding unvaluable |
| DELETE | `/bonds/:id` | admin |

The Session 81 endpoints — `POST /derivatives/option-greeks`,
`/derivatives/implied-vol`, `/derivatives/option-payoff` and
`/fixed-income/bond-analytics` — are unchanged, including their
unauthenticated status. The new sub-router deliberately does **not** call
`router.use(authenticate)`; each handler attaches it individually, so an
unmatched path falls straight through to the Session 81 layer. A Playwright
case pins that behaviour.

## 5. Correctness properties the tests pin

`apps/api/src/derivatives/derivativesDesk.test.ts` (27 tests) asserts against
model identities and honesty invariants rather than snapshots:

- the desk's valuation **equals** `blackScholes()` at the same inputs, scaled by
  contracts × multiplier, with short positions negated — so the aggregate can
  never quietly diverge from the pricer it claims to use;
- a long and an equal short on the same contract net to zero value, zero delta
  and zero theta;
- an unmarked position and a position with no volatility are both excluded,
  each with its own reason, and the totals report `null` rather than `0`;
- the desk-default rate is applied only where the position omits one, and
  `rateSource` says which was used;
- disagreeing marks on one underlying set `markSpotConflict` instead of the
  desk picking a spot;
- a scenario cell matches `blackScholes()` at the shocked inputs exactly (a
  Taylor approximation would fail this), and a −20 vol-point shock on a 10-vol
  option drops that position from the cell, reported as `pricedPositions: 0`;
- a long 100 call at \$5 breaks even at exactly 105, caps its loss at the
  premium and reports `unboundedAbove: true`; a call spread reports
  `unboundedAbove: false`; a straddle reports two breakevens at 90 and 110;
- put-call parity passes on model-consistent prices and names the rich leg when
  a leg is marked \$3 too high;
- a 5% coupon at a 5% yield prices at par; the ladder's weighted duration is
  dominated by the larger holding; a −100bp shift gains more than a +100bp
  shift loses (convexity); cashflows for a 10-year semi-annual 5% bond are
  \$50/yr with \$1,000 principal in year 10;
- an empty ladder reports `null` weighted metrics, not zeros;
- repeated reads of an unchanged book are byte-identical;
- a kernel dispatch failure does not fail the write.

`tests/e2e/derivatives.spec.ts` (7 Playwright cases) repeats the important ones
against a live API, including that the Session 81 calculators still answer.

## 6. Web

- `apps/web/src/lib/derivatives.ts` — typed `deskApi`, re-exporting the Session
  81 `derivativesApi` so a caller reaches both halves from one import.
- `apps/web/src/pages/derivatives/DerivativesPage.tsx` — `/app/derivatives`,
  sidebar entry "Derivatives Desk" (Σ). Five tabs: position book, exposure,
  scenarios, fixed income, tools.
- The provenance banner is rendered from the API's own
  `DERIV_VALUATION_DISCLAIMER`, not a hardcoded copy, so it cannot drift.
- `<Measured>` renders "not measured" for a `null` figure; unpriceable
  positions get an amber row with the API's reason string; stale marks get a
  badge. Non-admins see the book read-only.

## 7. Inventory effect

`derivatives`: **PARTIAL → COMPLETE**. Routes 4 → 21, service SLOC 226 → 2,468
(the Session 81 pricer plus the new desk service), shared contract 136 → 645
LOC, web client `apps/web/src/lib/derivatives.ts` present, four test files.
Repository totals: **93 COMPLETE, 10 PARTIAL**, 2 STUB-by-design (`events`,
`webhook`), 1 DEMO DATA (`quantum`) across 106 modules.

## 8. Status

🟡 **VERIFIED (partial).** `make verify` is green in this sandbox (1,246 tests
passing, 51 skipped, 0 failures). Runtime validation against live PostgreSQL 17
+ Redis 8 is pending and tracked in
`docs/SESSION_113_RUNTIME_VALIDATION_CHECKLIST.md`.
