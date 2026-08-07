# Phase 16 — Gate.io v4 Private WebSocket User-Data Stream

**WINDELS is an AI Trading Agent, not a broker, exchange, or custodian.**
All orders route to Gate.io's public API via signed requests and WebSocket
channels; WINDELS never matches, fills, settles, or custodies customer assets.

## Scope

Production-grade Gate.io v4 WebSocket integration covering both public
tickers and private user-data streams (spot orders, USDT perp orders,
USDT perp positions, spot balances), plus cancel-order REST and warmed
account snapshot.

### Gate.io v4 WS auth model

Unlike Binance-style "login op" exchanges, Gate.io v4 requires **per-channel
auth**: every subscribe frame for a private channel carries its own `auth`
block with `{method: "api_key", KEY, SIGN, Timestamp}`, where SIGN is
`HMAC-SHA512(apiSecret, "<channel>\n<event>\n<time>\n")`. There is no separate
login frame.

* `authenticatePrivateWs` is therefore a no-op.
* `afterPrivateAuth` issues one subscribe frame per private channel, each
  with a freshly-computed signature over `{channel}\nsubscribe\n{time}\n`.

### Implemented

1. **Private WS subscriptions** (4 channels, each individually signed):
   - `spot.orders` — spot order lifecycle events
   - `spot.balances` — spot balance updates (currency-level available/locked)
   - `futures.orders` — USDT perp order lifecycle events
   - `futures.positions` — USDT perp positions
   - 20s ping interval with `{time, channel: "...ping", event: "subscribe", payload: "pong"}`
   - Pong / subscribe-ack / error frames filtered out.

2. **parsePrivateMessage routing**
   - `spot.orders` / `futures.orders` → upserts into `sess.openOrders`,
     computes incremental fill delta from cumulative `filled_amount`
     /`fill_size`, calls `applyFill` for VWAP/fee aggregation and appends
     fills to the trading-events hub as `execution` events. Terminal
     statuses (`filled`, `canceled`, `rejected`) evict.
   - `futures.positions` → upserts perp positions into `sess.positions`;
     zero `size` deletes the row.
   - `spot.balances` → upserts balances into `sess.balances`
     (available/locked/total; USDT/USDC balances tagged with usdValue for
     equity calculation).

3. **Public WS tickers**
   - Spot: channel `spot.tickers`, payload `[BTC_USDT]`
   - Perp: channel `futures.tickers`, payload `[BTC_USDT]`
   - Subscribe + unsubscribe frames built per market; `parseTickerMessage`
     reads `highest_bid`/`lowest_ask`.

4. **Account snapshot warming**
   - `fetchAccountSnapshot` now pulls open spot orders (`/spot/open_orders`)
     and open perp orders (`/futures/usdt/orders?status=open`) plus perp
     positions (`/futures/usdt/positions`), converting via
     `gateSpotOrderToCrypto` / `gateFuturesOrderToCrypto` so the in-memory
     book is fully populated on connect/sync.
   - USDT/USDC balances tagged with `usdValue` so equityUsd sums correctly.

5. **Cancel order (REST)**
   - `cancelOrderImpl` dispatches DELETE `/futures/usdt/orders/{id}` (perp
     with `?contract=BTC_USDT`) or DELETE `/spot/orders/{id}` (spot with
     `?currency_pair=BTC_USDT`). If the order isn't tracked locally a
     best-effort scan over spot markets attempts to find the right pair.

6. **Place order hardening**
   - Perp orders now send `size` (signed: negative for sell) instead of
     `amount`/`side`, matching Gate.io futures API v4.
   - `reduce_only` / `auto_size=close_long_short` for closes.
   - `take_profit` / `stop_loss` parameters wired for perp.
   - `tif: gtc` passed for limit perps; `time_in_force: gtc` for spot limits.
   - `Undefined` body fields stripped before serialization (Gate.io rejects
     unknown nulls).

### Symbol normalization

Gate.io uses underscore-separated raw symbols (`BTC_USDT`) for both spot
and perp. We disambiguate by market type when converting:

- Spot: `BTC_USDT` → `BTC/USDT`
- Perp: `BTC_USDT` → `BTC/USDT:USDT`

### Status mapping (Gate.io → unified `CryptoOrder.status`)

| Gate.io value                       | WINDELS            |
|-------------------------------------|--------------------|
| open, new, received, queued, untriaged | `new`          |
| filled, closed, done, finish        | `filled`           |
| partial, partially_filled           | `partially_filled` |
| *cancel*                            | `canceled`         |
| *reject*, failed                    | `rejected`         |
| *expir*                             | `expired`          |

## Tests

`crypto-phase16-gateio-private-ws.test.ts` adds 5 tests:

1. `authenticatePrivateWs` is a no-op (per-subscription auth).
2. `afterPrivateAuth` sends exactly 4 subscribe frames, each with a valid
   HMAC-SHA512 `SIGN` (method `api_key`, correct KEY/Timestamp/time).
3. `parsePrivateMessage` routes spot partial fill (order live, fill
   appended), spot full fill (order evicted, second fill appended),
   futures partial fill (perp marketType), futures position snapshot
   (insert + `long` side from positive size), zero-size position
   (deleted), spot balance (free+locked → total=1050), and ignore
   pong/subscribe-ack/error.
4. Public ticker subscribe uses `spot.tickers` vs `futures.tickers` per
   market type; ping is an object frame; parseTickerMessage handles
   `highest_bid`/`lowest_ask`.
5. `cancelOrderImpl` for tracked perp/spot orders DELETEs the correct
   path with correct query params.

## Test results

- 16 crypto test files / **74 tests passing** (5 new vs Phase 15).
- Full suite: **1899 passing** (up from 1894), 8 pre-existing Prisma-WASM
  + geoBilling failures unchanged (out of scope).
- `tsc --noEmit` clean on crypto/trading paths.
- Web build clean.

## Files changed

- `apps/api/src/tradingIntel/crypto/exchanges/gateio.ts` — full private WS
  (per-channel signed subscribe in afterPrivateAuth, parsePrivateMessage
  for spot orders/futures orders/futures positions/spot balances), public
  ticker subscribe/parse, ping frames, cancelOrderImpl, snapshot open
  orders + positions + USDT usdValue tagging, perp place-order payload
  fixes (size signing, reduce_only, auto_size, tif, TP/SL, undefined
  stripping).
- `apps/api/src/tradingIntel/crypto/crypto-phase16-gateio-private-ws.test.ts` — new.
- `docs/CRYPTO_PHASE16_GATEIO_PRIVATE_WS.md` — this file.

## Remaining post-Phase 16 work

Exchanges still without certified private WS: Kraken (REST WS-token
bootstrap), Coinbase (channel JWT), HTX (v2 auth), Crypto.com (id/nonce
handshake). Hyperliquid ECDSA returns -102 safely. None of these block
Gate.io/Bitget/Binance/OKX/Bybit/MEXC/KuCoin users from receiving live
private-stream updates.
