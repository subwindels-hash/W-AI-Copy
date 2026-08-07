# Phase 15 — Bitget Private WebSocket User-Data Stream

**WINDELS is an AI Trading Agent, not a broker, exchange, or custodian.**
All orders route to Bitget's public API via secure signed requests and WebSocket
channels; WINDELS never matches, fills, settles, or custodies customer assets.

## Scope

Production-grade Bitget v2 private WebSocket integration: live order, position,
and account events streaming from Bitget's `wss://ws.bitget.com/v2/ws/private`
directly into WINDELS' TradingEventHub so the dashboard, risk engine, and
AI agents receive sub-second updates without polling.

### Implemented

1. **Private WS user-data stream**
   - Post-connect `op:login` frame signed `HMAC-SHA256(timestamp + "GET" + "/user/verify", apiSecret)`
     carrying `apiKey`, `passphrase`, `timestamp`, `sign` (matches Bitget v2 spec).
   - `afterPrivateAuth` batch-subscribes to four channels:
     - `orders` (SPOT) with `instId=default` (wildcard)
     - `orders` (USDT-FUTURES) with `instId=default`
     - `positions` (USDT-FUTURES) with `instId=default`
     - `account` with `coin=default` (balance updates)
   - 25s ping/pong keep-alive (Bitget returns `"pong"` for `"ping"`).

2. **parsePrivateMessage routing**
   - `orders` channel → upserts `CryptoOrder` into `sess.openOrders`, computes
     incremental fill delta from cumulative `fillSize`/`baseVolume`/`accBaseVolume`,
     calls `applyFill` (dedup-aware) to append fills and update VWAP/fee totals.
     Terminal statuses (`filled`, `canceled`, `rejected`) evict from the book.
   - `positions` channel → upserts perp positions into `sess.positions` with
     side/entry/mark/PNL/leverage/margin; zero-size payloads delete the row.
   - `account` channel → upserts `CryptoBalance` entries into `sess.balances`
     (free/frozen/total/usdtValue per coin).
   - Ack frames (`event: login|subscribe|unsubscribe|error`) and `"pong"` are
     filtered out early to keep the event channel clean.
   - Events fan out to `tradingEvents` hub: `order_update`, `position_update`,
     `account_state`, and `execution` (per-fill) — the dashboard's `useTradingEvents`
     hook picks them up automatically.

3. **Public WS ticker**
   - `buildTickerSubscribePayload` / `buildTickerUnsubscribePayload` use the
     correct `instType` per market (`SPOT` vs `USDT-FUTURES`) and `channel:ticker`,
     matching Bitget's v2 public WS schema.
   - `parsePublicMessage` dispatches frames to the per-instId ticker sub;
     `parseTickerMessage` reads `bidPr`/`askPr` (best bid/ask).
   - 25s ping interval on both public and private sockets.

4. **Cancel order support**
   - `cancelOrderImpl` dispatches to `/api/v2/mix/order/cancel-order` (perp)
     or `/api/v2/spot/trade/cancel-order` (spot) with `{symbol, orderId}`.
     If the order isn't tracked locally for spot, the connector falls back
     to scanning markets (safe no-op miss) to locate the right symbol.
   - Includes `modifyOrder` for SL/TP updates (`/api/v2/mix/order/modify-order`).

5. **Fetch-open-orders on snapshot**
   - `fetchAccountSnapshot` now pulls pending perp orders via
     `/api/v2/mix/order/orders-pending?productType=usdt-futures` plus spot
     open orders via `/api/v2/spot/trade/unfilled-orders`, converting each
     through `bitgetOrderToCrypto`. This means the in-memory book is fully
     populated on connect/sync, not relying on WS priming.

### Status mapping (Bitget → unified `CryptoOrder.status`)

| Bitget value             | WINDELS          |
|--------------------------|------------------|
| new, live, init, pending, created, open | `new`            |
| partially_filled, partial_fill, partial | `partially_filled` |
| filled, full_fill, complete, success | `filled`     |
| *cancel*                 | `canceled`       |
| *reject*, *fail*         | `rejected`       |
| *expir*                  | `expired`        |

### Symbol normalization

Bitget raw symbols are e.g. `BTCUSDT` for both spot and perp. WINDELS
disambiguates using the `instType` / market type carried on each WS frame
and REST response:

- Spot: `BTCUSDT` → `BTC/USDT`
- Perp: `BTCUSDT` → `BTC/USDT:USDT`

## Tests

`crypto-phase15-bitget-private-ws.test.ts` adds 5 tests:

1. `authenticatePrivateWs` issues a correctly structured `op:login` with
   HMAC signature and current timestamp.
2. `afterPrivateAuth` subscribes to orders (SPOT + USDT-FUTURES), positions,
   and account in one batch frame.
3. `parsePrivateMessage` handles partial fill (order remains live, fill
   appended, filledQuantity accumulated), full fill (order evicted, second
   fill appended), position snapshot (position inserted), zero-size position
   (position deleted), account balance (balance map updated), and pong/ack
   ignored.
4. Public ticker subscribe uses correct `instType` per market; ping is
   the string `"ping"`; `parseTickerMessage` handles `bidPr`/`askPr`.
5. `cancelOrderImpl` for a tracked perp order POSTs to the correct path
   with `symbol`, `orderId`, and `productType:"usdt-futures"`.

## Test results

- 15 crypto test files / **69 tests passing** (5 new vs Phase 14).
- Full suite: **1894 passing** (up from 1889), 8 pre-existing Prisma-WASM
  failures and 1 geoBilling prisma failure unchanged (out of scope).
- `tsc --noEmit` clean on crypto/trading paths.
- Web build clean.

## Files changed

- `apps/api/src/tradingIntel/crypto/exchanges/bitget.ts` — full private WS
  (authenticatePrivateWs → afterPrivateAuth, parsePrivateMessage), public
  ticker subscribe/parse, cancelOrderImpl, modifyOrder SL/TP, snapshot
  open orders, ping strings.
- `apps/api/src/tradingIntel/crypto/crypto-phase15-bitget-private-ws.test.ts` — new.
- `docs/CRYPTO_PHASE15_BITGET_PRIVATE_WS.md` — this file.

## Remaining post-Phase 15 work

Same as before — next candidate exchanges still without private WS:
Gate.io (HMAC-SHA512 per-channel query-signing), Kraken (REST WS-token
bootstrap), Coinbase (channel JWT), HTX (v2 auth), Crypto.com
(id/nonce handshake). Hyperliquid ECDSA still returns -102 safely.
None of these block Bitget users — all REST execution + event emission
continues to function.
