# Phase 19 — HTX (Huobi) v2 Private WebSocket + GZIP Public WS

**WINDELS is an AI Trading Agent — never a broker, exchange, dealing desk, custodian, LP, or execution venue.**

This phase adds full live private WebSocket user-data streaming for **HTX** (Huobi), bringing the count of certified live-WS exchanges to **8**. HTX has unusual characteristics compared to previous connectors:
- Public market-data WS is on a different endpoint (`wss://api.htx.com/ws`) from the private user-data WS (`wss://api.htx.com/ws/v2`).
- Public frames are **GZIP-compressed binary** and require server-ping reply (`{pong: <ts>}`).
- Private v2 frames are plain JSON, use lowercase params in the signature, a different signature version (`2.1`), and `action`/`ch` message framing (`req`/`sub`/`push`/`ping`/`pong`) instead of the older `op`/`topic` framing.
- Private auth is an explicit `{action:"req", ch:"auth", params:{...}}` message (not a listenKey, not per-subscription).
- Wildcard subscriptions are supported (`orders#*`, `trade.clearing#*`) so we don't need to subscribe per symbol.

## Infrastructure added

### `ExchangeWsClient` GZIP support

`exchange-ws.ts` gained a new `gzip?: boolean` option. When enabled:
1. The WebSocket's `binaryType` is set to `"arraybuffer"`.
2. On incoming binary frames, the payload is decompressed via Node's built-in
   `zlib.gunzipSync` and decoded as UTF-8 before handing to the parser.
3. Text frames continue to work unchanged (used by the private v2 endpoint).

This is the first exchange requiring binary decompression; it is opt-in per client.

### `createPublicWsClient` protected hook in base connector

The private method `seedPublicWs` in `BaseCryptoConnector` now delegates client construction to a new protected hook `createPublicWsClient(sess, url)`, so subclasses (HTX) can pass `gzip:true` without duplicating the lifecycle / event-wiring code.

## HTX implementation summary

| Channel | Endpoint | Compression | Notes |
|---|---|---|---|
| Public BBO/ticker | `wss://api.htx.com/ws` | GZIP binary | `market.<lowercase-raw>.bbo` subscriptions |
| Private accounts.update | `wss://api.htx.com/ws/v2` | plain JSON | Balance pushes |
| Private orders#* | `wss://api.htx.com/ws/v2` | plain JSON | All-symbol order updates (creation/trade/cancel/reject) |
| Private trade.clearing#* | `wss://api.htx.com/ws/v2` | plain JSON | Post-match fills with fee info |

### Auth (v2 private)
- Timestamp is ISO-8601 UTC, seconds precision (`YYYY-MM-DDTHH:MM:SS`).
- Signature string: `GET\napi.htx.com\n/ws/v2\n<urlencoded_sorted_params>` where params are:
  `accessKey=<key>&signatureMethod=HmacSHA256&signatureVersion=2.1&timestamp=<iso>`.
- Note lowercase param names (`accessKey`, `signatureMethod`, `signatureVersion`,
  `timestamp`) — different from REST's `AccessKeyId`/`SignatureVersion: 2`.
- Sent as: `{action:"req", ch:"auth", params:{authType:"api", accessKey, signatureMethod:"HmacSHA256", signatureVersion:"2.1", timestamp, signature}}`.
- The base64 HMAC-SHA256 signature uses the same secret as REST.

### Message routing
- **Server pings**:
  - Public v1: `{ping: <ts>}` (number) → reply `{pong: <ts>}` inside `parsePublicMessage`.
  - Private v2: `{action:"ping", data:{ts:<ms>}}` → reply `{action:"pong", data:{ts}}` inside `parsePrivateMessage`.
- **Subscribes** after auth ack:
  - `{action:"sub", ch:"accounts.update"}`
  - `{action:"sub", ch:"orders#*"}`
  - `{action:"sub", ch:"trade.clearing#*"}`
- **`orders#*` pushes**: merged with prior state using `cryptoOrderToHtxRaw` reverse-shape helper (HTX sends deltas with only changed fields); priorFilled seeded before applyFill to avoid double-count; `tradeVolume` used as the definitive incremental delta when present (matches `eventType:"trade"`); terminal states evict.
- **`trade.clearing#*` pushes**: fills with fee info — applied via applyFill, marked maker when `aggressor === false`.
- **`accounts.update` pushes**: merge currency balance/available into sess.balances; USD-stables get usdValue tagged; zero balances delete the entry.
- **Public BBO pushes** (`market.btcusdt.bbo`): routed as `ticker:btcusdt`; parseTickerMessage reads `tick.bid`/`tick.ask`.

### Markets
84 spot pairs (42 bases × USDT) using `majorPairs("USDT")`, with raw symbols lowercased to HTX's format (e.g. `btcusdt`).

### REST fixes
- `fetchAccountSnapshot` now merges trade (free) + frozen (locked) balance entries from `/v1/account/accounts/{id}/balance` into `{asset, free, locked, total, usdValue}`.
- `fetchRecentFills` wired through `/v1/order/matchresults`.
- `placeOrder` now supports `postOnly` via `"post-only":"true"`.
- Signer continues to use the existing HMAC-SHA256-base64 query-signing scheme (HTX is unusual: all auth is via query param `Signature=...`).

## Tests (11 new — total 98 crypto)

File: `crypto-phase19-htx-private-ws.test.ts`

1. `createPublicWsClient` returns an `ExchangeWsClient` (gzip:true wired).
2. Public `buildTickerSubscribePayload`/`buildTickerUnsubscribePayload` use `market.<raw>.bbo` with lowercase raw; ping is `{ping:<ts>}` JSON.
3. `parsePublicMessage` replies to server `{ping:ts}` with matching `pong`, ignores `pong`/sub-ack, routes BBO pushes to `ticker:<raw>`.
4. `parseTickerMessage` reads `tick.bid`/`tick.ask`.
5. `authenticatePrivateWs` sends v2 auth req with correct HMAC-SHA256-base64 signature (verification recomputes signature and matches).
6. `afterPrivateAuth` subscribes to 3 channels: `accounts.update`, `orders#*`, `trade.clearing#*`.
7. `privatePingMessage` uses `{action:"ping",data:{ts}}`.
8. `parsePrivateMessage`: responds to v2 server pings, ignores auth/sub responses, routes `orders#*` creation → partial trade → full-fill with priorFilled-safe delta accounting and terminal eviction, cancels evict.
9. `parsePrivateMessage`: routes `trade.clearing#*` fills (with fee) through applyFill; routes `accounts.update` to balances with USD-stable tagging and zero-balance deletion.
10. `cancelOrderImpl` POSTs to `/v1/order/orders/{id}/submitcancel`.
11. `htxRawToSymbol` correctly splits longest-first (e.g. `btcfdusd` → BTC/FDUSD not BTCF/DUSD).

All 98 crypto tests pass; TypeScript reports zero errors on trading paths; web builds clean.

## Files changed
- `apps/api/src/tradingIntel/crypto/exchange-ws.ts` — added `gzip?: boolean` option; binary frames are gunzipped via `zlib.gunzipSync` before parsing.
- `apps/api/src/tradingIntel/crypto/base-crypto-connector.ts` — refactored private `seedPublicWs` to delegate to new protected `createPublicWsClient` hook (default impl unchanged), so connectors like HTX can opt into GZIP without duplicating lifecycle code.
- `apps/api/src/tradingIntel/crypto/exchanges/htx.ts` — full rewrite: GZIP public WS via the new hook, public BBO ticker subscriptions with server-ping reply, full v2 private WS (auth, accounts.update, orders#*, trade.clearing#*), fill-delta accounting using incremental `tradeVolume` with reverse-shape merge for deltas, balance merging in fetchAccountSnapshot, fetchRecentFills, postOnly support, lowercase raw symbols, longest-first quote parsing.
- `apps/api/src/tradingIntel/crypto/crypto-phase19-htx-private-ws.test.ts` — 11 new tests.
- `docs/CRYPTO_PHASE19_HTX_PRIVATE_WS.md` — this document.

## Dashboard impact
No UI changes were required: the existing SSE/hub machinery picks up the new `order_update`, `execution`, `position_update`, `account_state` events automatically, so connecting an HTX API key now streams live order/fill/balance events to the Trading Dashboard, just like Binance/Bybit/OKX/MEXC/KuCoin/Bitget/Gate.io/Kraken.

## Remaining (deferred)
- **Coinbase Advanced Trade private WS** — requires ES256 PEM JWT signing (CDP keys), analogous to Hyperliquid's ECDSA requirement. Deferred pending dep/crypto support.
- **Crypto.com Exchange private WS** — id/nonce auth handshake (to do after Coinbase).
- **Hyperliquid** — ECDSA/EIP-712 signing (still returns -102).
- HTX USDT-margined perp futures (`api.hbdm.com`) is a separate connector surface; Phase 19 covers spot only.
