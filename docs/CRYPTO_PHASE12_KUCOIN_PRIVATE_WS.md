# Crypto Phase 12 — KuCoin bullet-private WebSocket

## Overview
Phase 12 wires up live private user-data streams for **KuCoin**, using the
`POST /api/v1/bullet-private` token-bootstrap flow. KuCoin now joins Binance,
Bybit, OKX, and MEXC in delivering real-time order/fill/balance events to the
Trading Dashboard. With this, 5 of the 12 launch exchanges have private WS
coverage; the remaining (Gate.io, Kraken, Coinbase, HTX, Crypto.com,
Bitget REST-fallback) emit events through the REST fan-out path already and
will gain private WS in later phases.

WINDELS remains an **AI Trading Agent**, not a broker. All events are
read-outs of state reported by KuCoin through the user's own API-key
connection — WINDELS never matches, fills, settles, or custodies.

## Changes

### Base crypto connector (base-crypto-connector.ts)
- `startPrivateWs` now uses a unified `prepareUrl` hook that supports both
  the listenKey pattern (Binance/MEXC) **and** a new dynamic-URL pattern
  used by KuCoin (and future Gate.io/Kraken/etc.):
  - Listen-key connectors: compose `<base>/<listenKey>`, keepalive on 30 min.
  - Other connectors: call a new overridable `preparePrivateWsUrl(sess)`
    method to obtain the final WSS URL on every (re)connect; if it returns
    `undefined`, fall back to the configured `privateWsUrl`.
- Added a new protected hook `preparePrivateWsUrl(sess)` that subclasses can
  override to perform the REST bootstrap (bullet-private, WS token, etc.)
  and return a fully-formed `wss://…?token=…` URL.

### ExchangeWsClient (exchange-ws.ts)
`prepareUrl` hook remains as added in Phase 11; no further changes needed
since it is already invoked before every TCP open.

### KuCoin connector (exchanges/kucoin.ts)
- Set `publicWsPingIntervalMs` and `privateWsPingIntervalMs` to 18 000 ms.
- Implemented `publicPingMessage` / `privatePingMessage` sending
  `{id, type:"ping"}` — required by KuCoin to keep the WS alive.
- Implemented `preparePrivateWsUrl(sess)`:
  - POSTs `/api/v1/bullet-private` over authenticated REST.
  - Parses `{data:{token, instanceServers:[{endpoint}]}}`.
  - Returns `${endpoint}?token=${token}&connectId=wkc-<acct>-<ts>`.
  - Errors degrade gracefully to a logged warning (reconnect retries).
- `authenticatePrivateWs` is a no-op — KuCoin auth is via the `?token=` query
  parameter, not a login frame.
- Implemented `afterPrivateAuth` to send two subscribe frames:
  - `/spotMarket/tradeOrders` (order changes + match events)
  - `/account/balance` (balance changes)
  Both with `privateChannel: true, response: true`.
- **Public WS tickers**: implemented `buildTickerSubscribePayload`/
  `UnsubscribePayload`, `parsePublicMessage`, `parseTickerMessage` for the
  `/market/ticker:<symbol>` topic — live bid/ask ticks now flow for KuCoin.
- Implemented `parsePrivateMessage` covering:
  - `/spotMarket/tradeOrders` subject `match` / `filled` / `open` / `cancel`
    → updates `sess.openOrders`, evicts terminal statuses, applies fills
    for `match` frames, emits both `order` and `fill` channels.
  - `/account/balance` → updates `sess.balances` and emits `balance`.
  - Ignores `pong`, `ack`, `welcome` system frames.
- Added a shared `kucoinOrderToCrypto` helper used by both `fetchAccountSnapshot`
  and the private-WS parser for consistent status/type mapping.
- Added `mapKucoinType` / `mapKucoinStatus` normalizers.
- Logged errors route through `logger` from `config/logger` (import added).

### Test
`apps/api/src/tradingIntel/crypto/crypto-phase12-kucoin-private-ws.test.ts`
(4 new tests):
1. `preparePrivateWsUrl` hits `/api/v1/bullet-private` over POST and builds
   a wss URL with `?token=...&connectId=...`.
2. `afterPrivateAuth` subscribes to both `/spotMarket/tradeOrders` and
   `/account/balance` topics with `privateChannel: true`.
3. `parsePrivateMessage` routes a match/fill frame into `order`+`fill`
   channels, evicts the filled order from `sess.openOrders`, appends a
   fill, and routes balance frames into `sess.balances`.
4. `parsePrivateMessage` returns `[]` for `pong`/`ack`/`welcome` frames.

## Not a broker
- No internal order book, no matching engine, no custody, no house account,
  no settlement, no liquidity provision. The KuCoin connector is an HTTP/WS
  client of api.kucoin.com using the user's encrypted API key.
- All trade execution happens at KuCoin; WINDELS signs and forwards
  authorized requests and reports back what KuCoin confirms.

## Verification
- Crypto test suite: 60/60 passing (+4).
- Full API suite: **1885 passing** (+4), same 8 pre-existing Prisma-WASM
  enterpriseSearch + 1 geoBilling Prisma failures (unchanged, out of scope).
- `tsc --noEmit` clean for all crypto/trading paths.
- Web build succeeds.
- `Math.random()` scan clean; custody/matching-engine keyword hits are
  only in disclaimers/docs.

## Private-WS coverage after Phase 12
- ✅ Binance (listenKey)
- ✅ Bybit (afterPrivateAuth subscribe)
- ✅ OKX (login frame + afterPrivateAuth subscribe)
- ✅ MEXC (listenKey) — Phase 11
- ✅ KuCoin (bullet-private token in URL) — Phase 12
- 🔜 Gate.io, Kraken, Coinbase, Bitget, HTX, Crypto.com, Hyperliquid (deferred)

## Files changed
- `apps/api/src/tradingIntel/crypto/exchange-ws.ts` (prepareUrl hook, shipped Phase 11)
- `apps/api/src/tradingIntel/crypto/base-crypto-connector.ts` (refactored startPrivateWs to dispatch between listenKey and preparePrivateWsUrl flows; added preparePrivateWsUrl hook)
- `apps/api/src/tradingIntel/crypto/exchanges/kucoin.ts` (bullet-private bootstrap; public+ticker WS; private order/balance parser; cancel/order helpers)
- `apps/api/src/tradingIntel/crypto/crypto-phase12-kucoin-private-ws.test.ts` (new, 4 tests)
- `docs/CRYPTO_PHASE12_KUCOIN_PRIVATE_WS.md` (this file)
