# Session 113 Runtime Validation Checklist — Derivatives & Fixed-Income Desk

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted.
> Until every box is ticked and signed, Session 113 stays 🟡 VERIFIED (partial).

## Route mounting and backwards compatibility

- [ ] `POST /api/v1/derivatives/option-greeks`, `/derivatives/implied-vol`,
      `/derivatives/option-payoff` and `/fixed-income/bond-analytics` answer
      exactly as they did before Session 113, **including without an
      `Authorization` header** — the new sub-router must not have swallowed
      them or forced auth onto them.
- [ ] `GET /api/v1/derivatives/bonds/ladder` resolves to the ladder handler and
      is **not** captured by `GET /bonds/:id`.
- [ ] `GET /api/v1/derivatives/portfolio` and `/desk` resolve, and an unknown
      path under `/derivatives` returns `404` rather than a stack trace.
- [ ] Every Session 113 path returns `401` without a token, and each mutating
      path returns `403` for a non-admin member of the organization.

## Tenant isolation

- [ ] Two organizations each create a position with the same `label` and
      `underlying`. `GET /positions`, `/positions/:id`, `/portfolio`,
      `/portfolio/hedge`, `/portfolio/scenarios`, `/desk`, `/bonds`,
      `/bonds/:id` and `/bonds/ladder` each return only the caller's rows.
- [ ] `GET /positions/:id` and `DELETE /positions/:id` with the *other*
      organization's id return `404` and leave the row intact
      (`HGET deriv:pos:i:<otherOrg>:<id> _doc` unchanged afterwards).
- [ ] Plant a record by hand under org B's key with `"organizationId":"<orgA>"`
      inside the JSON. `GET /positions` for org B does not list it and
      `GET /positions/:id` returns `404` — the fail-closed re-check, not the
      key shape, is the guarantee.
- [ ] `redis-cli --scan --pattern 'deriv:*'` shows only
      `deriv:pos:i:<org>:<id>`, `deriv:pos:idx:<org>`, `deriv:bond:i:<org>:<id>`
      and `deriv:bond:idx:<org>` — every key carries the org segment.
- [ ] The Session 89 namespace audit (`GET /api/v1/tenant-isolation/audit`)
      lists `deriv:pos` and `deriv:bond` as `org_scoped` with zero findings.

## Marks and provenance

- [ ] A position created with `markSpot` and `impliedVol` returns
      `markSource: "operator_entered"` and a non-null `markedAt`.
- [ ] A position created without either returns `markedAt: null` and is
      reported `markFreshness: "unmarked"` nowhere in `valuations` — it appears
      only in `unpriceable[]`.
- [ ] `PATCH /positions/:id` with only `{ "label": "…" }` leaves `markedAt`
      unchanged (verify the stored JSON directly); a `PATCH` carrying
      `markSpot` or `impliedVol` moves it to now.
- [ ] Back-date `markedAt` in Redis by more than
      `DERIV_MARK_STALE_AFTER_HOURS` (24h) and confirm the valuation reports
      `markFreshness: "stale"` and `GET /desk` counts it in
      `positions.staleMarks`.
- [ ] No response anywhere in the module carries a price the operator did not
      supply or the model did not derive from one — confirm by unplugging all
      outbound network access and re-running the full flow.

## Un-priceable is not zero

- [ ] A book containing only unmarked positions returns
      `totals.deltaNotional: null`, `totals.unrealizedPnl: null`,
      `byUnderlying: []`, `pricedCount: 0` and one `unpriceable[]` entry per
      position with a human-readable reason.
- [ ] `POST /portfolio/hedge` on that book returns `direction: "none"` and the
      note containing "not a flat book".
- [ ] A position with `premiumPerShare: null` reports `unrealizedPnl: null` and
      increments `totals.positionsMissingPremium`, while the rest of the book's
      P&L is still reported.
- [ ] `GET /bonds/ladder` on an empty book returns `weightedMacaulayDuration`,
      `weightedModifiedDuration`, `weightedConvexity` and `weightedYtm` as
      `null` — not `0`.

## Valuation correctness against the live pricer

- [ ] Create S=100, K=100, T=1, r=0.05, σ=0.20, 1 long call. The valuation's
      `theoreticalPricePerShare` matches `POST /derivatives/option-greeks` with
      the same inputs to 4 decimal places.
- [ ] Add the matching short: `byUnderlying[0].netValue`, `deltaShares` and
      `thetaPerDay` are all `0` to within floating-point tolerance.
- [ ] A position with `riskFreeRate: null` reports
      `rateSource: "desk_default"` and `rateUsed: 0.045`; one with an explicit
      rate reports `rateSource: "position"`.
- [ ] Two positions on the same underlying with different `markSpot` values
      report `markSpotConflict: true` and `markSpot: null` for that group.

## Scenarios, payoff and parity

- [ ] `POST /portfolio/scenarios` with 7 spot shocks × 3 vol shocks returns 21
      cells; each cell's `netValue` equals the sum of `option-greeks` prices at
      the shocked inputs (spot-check three cells by hand).
- [ ] A −0.20 vol shock against a 0.10-vol position yields
      `pricedPositions: 0` for that cell, and the cell is not silently valued
      at a clamped volatility.
- [ ] A grid request of 21 × 21 cells is rejected with a validation error
      (`DERIV_MAX_GRID_CELLS`).
- [ ] `POST /payoff-curve` for a long 100 call at \$5 over 80–130 returns a
      single breakeven within 0.01 of 105, `maxLossInRange: -500` and
      `unboundedAbove: true`.
- [ ] `POST /parity-check` with the live pricer's own call and put prices
      returns `withinTolerance: true`; inflating the call by \$3 returns
      `richLeg: "call"`.

## Fixed income

- [ ] `POST /bonds` without `ytm` and without `marketPrice` returns `400` and
      writes nothing (`ZCARD deriv:bond:idx:<org>` unchanged).
- [ ] `PATCH /bonds/:id` clearing both returns `400` and leaves the stored row
      unchanged.
- [ ] A 5% semi-annual 10-year bond at a 5% yield prices at 1000.00 ± 0.05 and
      reports `priceSource: "model"`; supplying `marketPrice: 900` with no
      yield reports `priceSource: "operator_price"` and a solved `ytm` above
      the coupon.
- [ ] `GET /bonds/ladder?shiftsBps=-100,100`: the −100bp value exceeds base,
      the +100bp value is below it, and the gain exceeds the loss in magnitude.
- [ ] Bucket market values sum to `totalMarketValue`; `shareOfPortfolio` sums
      to 1.0 ± 0.001.
- [ ] Cashflow years and amounts match the recorded coupon schedule for a
      hand-computed holding.

## Durability and determinism

- [ ] Restart Redis with persistence enabled: positions, holdings and their
      `markedAt` timestamps survive, and `GET /desk` returns the same numbers.
- [ ] Two consecutive `GET /portfolio` calls with no writes in between return
      byte-identical bodies (ignoring `meta.requestId` / `meta.tookMs`).
- [ ] `DERIV_MAX_POSITIONS` / `DERIV_MAX_BONDS` are enforced with a `409` and
      the message names the limit.

## Web console

- [ ] `/app/derivatives` renders the provenance banner from the API payload
      (change the constant server-side and confirm the page follows).
- [ ] An unpriceable position renders its API-supplied reason, not a zero row.
- [ ] A `null` delta notional renders "not measured".
- [ ] A non-admin sees the book, the exposure and the ladder, with every
      create/delete control disabled.
- [ ] The scenario grid's cell counts match the API response, including cells
      that priced fewer positions than the base valuation.

## Sign-off

| Check block | Environment | Date | Signed |
|---|---|---|---|
| Route mounting and backwards compatibility | | | |
| Tenant isolation | | | |
| Marks and provenance | | | |
| Un-priceable is not zero | | | |
| Valuation correctness | | | |
| Scenarios, payoff and parity | | | |
| Fixed income | | | |
| Durability and determinism | | | |
| Web console | | | |
