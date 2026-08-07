# MT5 Phase 3 — Deterministic MT5 Simulator

Phase 3 ships an in-process, seedable, zero-randomness MT5 simulator that
implements `IBrokerConnector` so paper trading, backtests, and AI strategy
qualification run against the exact same code paths used by the live MT5
connector (Phase 1) and the MQL5 EA (Phase 2).

> **Hard rule:** the simulator never invents prices. Every fill comes from
> injected tick/candle data; every numeric result is reproducible from the
> same seed + same inputs; `Math.random()` and `Date.now()` are not used
> inside the matching engine.

## Files

| Path | Purpose |
|---|---|
| `apps/api/src/tradingIntel/mt5/mt5-simulator.ts` | `Mt5Simulator : IBrokerConnector` (in-process deterministic matching engine) |
| `apps/api/src/tradingIntel/mt5/mt5-simulator.test.ts` | 11 tests pinning determinism + SL/TP/limit/stop/margin/candle behavior |
| `apps/api/src/tradingIntel/connectors/connector-registry.ts` | Simulator registered alongside the real MT5 connector on boot |
| `packages/shared/src/brokerIntegration.ts` | New broker type `mt5_simulator` + transport `simulator` |
| `apps/api/src/tradingIntel/brokerIntegration.service.ts` | `BROKER_LABEL` and `CONNECTOR_CATALOG` entries for the simulator |

## Why a simulator instead of a "mock"

A mock connector returns hard-coded responses; it cannot validate the AI
end-to-end. The simulator implements actual MT5 semantics:

* Bid/ask spread per symbol (from live ticks or seeded defaults).
* Market orders fill at bid/ask (with optional deterministic slippage in points).
* Limit/stop orders trigger deterministically when price crosses (LIMIT_BUY
  when bid ≤ price; STOP_SELL when bid ≤ price; etc.).
* SL/TP close positions automatically when the relevant side touches the
  level, producing a deal history entry with realised PnL.
* Margin checks per position at fill time (`notional / leverage`). Over-
* levered orders are rejected with MT5-style retcode 10016 ("no money").
* Volume is snapped to `volumeStep` and validated against `volumeMin/Max`
  (retcode 10014 on violation).
* Positions, orders, deals, and account equity/free margin/margin level are
  kept consistent after every tick, so the dashboard and AI agents see
  exactly the same shape of state they would see against a live account.

## Determinism contract

| Guarantee | Mechanism |
|---|---|
| Same seed + same ticks → same fills | Mulberry32 seeded PRNG (`seed ^ hashStr(accountId)`) drives synthetic candle generation only; matching is purely functional on state. |
| No `Math.random()` in matching | Audited — PRNG only used in `getCandles` intra-bar model. |
| No wall-clock inside matching | Time is always injected via `a.currentTime` and advanced by `advance()`/`advanceCandles()`. |
| Ticket ids deterministic | `nextTicket` counter seeded from account hash. |
| PnL deterministic | Computed from openPrice × current bid/ask × contractSize × volume, minus commission. |

## Usage

### 1. Create a simulator account

```ts
POST /api/v1/broker/accounts
{
  "name": "Paper MT5",
  "broker": "mt5_simulator",
  "login": "paper-001",
  "server": "Simulator",
  "password": "n/a",
  "mode": "fully_autonomous",
  "currency": "USD",
  "leverage": 100,
  "environment": "sandbox"
}
```

Then `POST /api/v1/broker/accounts/:id/connect` — the simulator spins up with
a fresh $10,000 balance, 100:1 leverage, and a default universe (EURUSD,
GBPUSD, USDJPY, XAUUSD, BTCUSD). `connectorConfig.allowedSymbols` /
`deniedSymbols` restrict the universe exactly as with the live connector.

### 2. Drive the simulator (code)

`Mt5Simulator` exposes two simulation-control methods beyond
`IBrokerConnector`:

```ts
advance(accountId: string, time: string, ticks: BrokerTick[]): BrokerDeal[]
advanceCandles(accountId: string, candles: BrokerCandle[]): BrokerDeal[]
```

* `advance()` moves the sim clock to `time`, applies ticks **in order**,
  checks SL/TP and pending orders against each tick, returns any deals
  produced.
* `advanceCandles()` replays candles deterministically using a 4-tick
  intra-bar model (open → high → low → close), running SL/TP/pending
  checks at each synthetic tick.

For live-deterministic paper trading, a background driver subscribes to
real market-data ticks and calls `advance()` at each tick. For backtests,
the driver feeds historical candles through `advanceCandles()`.

### 3. Default symbol universe

| Symbol | Digits | Point | Contract | Bid/Ask seed |
|---|---|---|---|---|
| EURUSD | 5 | 0.00001 | 100,000 | 1.08501 / 1.08503 |
| GBPUSD | 5 | 0.00001 | 100,000 | 1.26500 / 1.26503 |
| USDJPY | 3 | 0.001   | 100,000 | 150.250 / 150.253 |
| XAUUSD | 2 | 0.01    | 100     | 2350.50 / 2350.80 |
| BTCUSD | 2 | 0.01    | 1       | 65000.00 / 65001.00 |

Additional symbols are injected with `addSymbol(accountId, s)` (e.g. per-
backtest universe).

## Supported order types / retcodes

| Type | Retcode on fill | Rejection retcodes |
|---|---|---|
| `market` (BUY/SELL) | 10009 | 10014 (invalid vol), 10016 (no money), 10021 (unknown symbol), 10031 (trade disabled) |
| `buy_limit` / `sell_limit` | 10009 when crossed | 10013 (invalid price), 10016 (margin) |
| `buy_stop` / `sell_stop` | 10009 when crossed | 10013, 10016 |
| SL/TP close | automatic `stop loss` / `take profit` deal comment | — |
| `closePosition` | 10009 | 10019 (position missing) |
| `modifyPosition` | 10009 | 10019 |

Partial closes reduce the position's volume rather than deleting it.

## Sync / state shape

`connector.sync()` returns a fully populated `SyncResult` with the same
field names the live connector uses: `account{balance,equity,margin,...}`,
`positions[]` (with live `currentPrice` and floating `profit`), `orders[]`,
`symbols[]`, `deals[]`. The dashboard / risk engine / AI agents treat the
simulator and the live connector identically.

## Config (`Mt5SimulatorConfig`)

| Field | Default | Purpose |
|---|---|---|
| `defaultBalance` | 10,000 | Starting USD balance for new simulator accounts. |
| `defaultLeverage` | 100 | Default leverage if not supplied. |
| `commissionPerLot` | 0 | One-way commission per lot (account currency). |
| `defaultSlippagePts` | 0 | Deterministic slippage applied to market orders (points). |
| `defaultSpreadPts` | 2 | Spread for `addSymbol` definitions that don't specify. |
| `enforceMarketHours` | false | (Reserved) weekend / close rejection. |
| `seed` | 0xA17B15 | Master seed; per-account ticket/PRNG seeds XOR this with `hashStr(accountId)`. |

## Tests (Phase 3)

`mt5-simulator.test.ts` (11 tests) pins:

1. Connected state is honest and contains no live randomness.
2. Market BUY fills at ask immediately and appears in positions.
3. SL fires on a matching tick and produces a losing deal.
4. TP fires on a matching tick and produces a winning deal.
5. BUY LIMIT fills when bid crosses limit price.
6. SELL STOP fires when bid drops through stop price.
7. `closePosition()` closes at current bid and records realised PnL.
8. Over-levered orders are rejected with retcode 10016.
9. Candle generation is deterministic per (symbol, timeframe).
10. `advanceCandles()` with a 4-tick intra-bar model deterministically
    triggers SL when price blows through the level (TP out of range).
11. Same seed + same candles → identical results (determinism test).

Total trading-intel test count after Phase 3: **139 passing** (11 sim + 8 EA +
13 brokerIntegration + 19 mt5-connector + 25 indicators + 26 derivatives + 20
derivativesContract + 10 marketData + 7 risk).

## Relationship to Phase 1 / Phase 2

* The simulator is registered alongside `Mt5Connector` in
  `registerBundledConnectors()`; the Broker Integration Service selects it
  transparently when an account's `broker` is `mt5_simulator`.
* The MQL5 EA is *not* used with the simulator (there is no MT5 terminal);
  signals for simulator accounts go straight through the matching engine.
* EAs remain the execution path for real MT5 accounts without a live bridge
  (pure EA mode, Phase 2). The simulator, live MT5 connector, and EA path
  all share the same governance gates (kill switch, risk, mode, margin,
  duplicate prevention, allowed symbols).

## Next up (Phase 4)

Phase 4 will build the Trading Dashboard on top of the broker integration
layer — live P&L, positions, orders, executions, AI agent explanations,
risk panels, and a control surface for connecting accounts / approving
signals / revoking EAs — consuming live connector, EA, and simulator data
through the same `BrokerIntegrationService` API.
