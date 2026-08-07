# Crypto Phase 11 — MEXC listenKey private WebSocket

## Overview
Phase 11 brings **live private user-data streams to MEXC**. MEXC uses a
Binance-clone bootstrap: REST-POST a listenKey, then open a WS at
`wss://wbs.mexc.com/ws/<listenKey>` and the server pushes order/fill/balance
events. With this phase MEXC joins Binance, Bybit, and OKX in providing
real-time order/position/fill updates to the Trading Dashboard without
waiting for the polling refresh.

WINDELS remains an **AI Trading Agent**, not a broker. The private WS only
reports state that originates at MEXC; WINDELS does not match, fill, settle,
or custody anything.

## Changes

### Shared WS client (apps/api/src/tradingIntel/crypto/exchange-ws.ts)
Added a new optional hook `prepareUrl?: () => string | Promise<string>` to
`WsClientOptions`. The `ExchangeWsClient` invokes this hook **before each
TCP open** (initial + every automatic reconnect) so connectors like
Binance/MEXC can obtain a fresh listenKey over REST and embed it in the WS
URL. Errors from `prepareUrl` are routed through the reconnect path so a
stale listenKey doesn't dead-lock the connection.

### Base crypto connector (base-crypto-connector.ts)
`startPrivateWs` now wires the `prepareUrl` hook for any connector that
declares `privateWsUsesListenKey: true`. On every open/reconnect:
1. Calls `createListenKey(sess)` over authenticated REST.
2. Schedules `keepAliveListenKey` every 30 minutes (already in place).
3. Returns the final WS URL `<base>/<listenKey>` to `ExchangeWsClient`.
4. After open, runs `authenticatePrivateWs` (no-op for Binance/MEXC style)
   and `afterPrivateAuth` (subscriptions if any).

This fixes a latent bug: previously Binance/MEXC `createListenKey` ran
**after** the WS open (inside `onConnect`), so the initial open hit the URL
*without* the listenKey path suffix — which meant the private stream didn't
actually receive messages until after an error/reconnect cycle. It now
works on the first attempt.

### MEXC connector (exchanges/mexc.ts)
- Set `privateWsUsesListenKey: true` and added `publicWsPingIntervalMs: 20_000`.
- Implemented `publicPingMessage` / `privatePingMessage` (MEXC requires app
  level `{method:"PING"}` to keep streams alive).
- Public WS: implemented `buildTickerSubscribePayload`/
  `buildTickerUnsubscribePayload`/`parsePublicMessage`/`parseTickerMessage`
  so spot bookTicker frames fan out real bid/ask ticks.
- Private WS: implemented `parsePrivateMessage` covering:
  - `spot@private.orders.v3.api` → {channel:"order"} + {channel:"fill"} for
    TRADE executions.
  - `spot@private.deals.v3.api`  → {channel:"fill"}.
  - `spot@private.account.v3.api` → {channel:"balance"} updates to
    `sess.balances`.
  - Status/type normalisation helpers (`normalizeOrderStatus`,
    `normalizeOrderType`, `rawToUnified`) map MEXC raw fields onto the
    shared CryptoOrder/CryptoFill shapes used by the rest of the engine.
- `cancelOrderImpl` is now wired through `DELETE /api/v3/order?symbol=...&orderId=...`
  (previously inherited the no-op default, so cancel from the dashboard
  silently no-op'd for MEXC — now real).
- `fetchAccountSnapshot.openOrders`/`positions` were always empty (spot
  only); the private WS now drives live order state, and REST sync is
  unchanged.

### Test
`apps/api/src/tradingIntel/crypto/crypto-phase11-mexc-private-ws.test.ts`
(3 tests):
1. MEXC declares `privateWsUsesListenKey: true` and `createListenKey`
   returns the REST-issued key.
2. `parsePrivateMessage` converts a spot executionReport TRADE frame into
   both an "order" event and a "fill" event, mutates the local open-orders
   book correctly (filled orders evicted), and appends the fill to
   `sess.fills`.
3. `keepAliveListenKey` and `disposeListenKey` hit the documented PUT and
   DELETE REST endpoints.

## Not a broker
- WINDELS still does not hold customer funds, does not run an internal
  order book, does not act as counterparty, and does not settle.
- The MEXC connector is an HTTP+WS **client** of MEXC's public API, using
  the user's own encrypted API key; all order flow is signed and sent
  directly to MEXC.

## Verification
- Crypto test suite: 56 passing (up from 53; +3 new).
- Full API suite: **1881 passing**, same 8 pre-existing Prisma-WASM failures
  (enterpriseSearch) + 1 pre-existing geoBilling Prisma failure — unchanged.
- `tsc --noEmit` clean for all crypto/trading paths.
- `pnpm --filter @windels/web build` succeeds.
- `Math.random()` scan clean; custody/matching-engine keyword hits are only
  in disclaimers.

## Files changed
- `apps/api/src/tradingIntel/crypto/exchange-ws.ts` (prepareUrl hook)
- `apps/api/src/tradingIntel/crypto/base-crypto-connector.ts` (listenKey
  applied to URL pre-open for every reconnect)
- `apps/api/src/tradingIntel/crypto/exchanges/mexc.ts` (private WS +
  public WS tickers + cancelOrder + live order/fill/balance parsing)
- `apps/api/src/tradingIntel/crypto/crypto-phase11-mexc-private-ws.test.ts` (new)
- `docs/CRYPTO_PHASE11_MEXC_PRIVATE_WS.md` (this file)
