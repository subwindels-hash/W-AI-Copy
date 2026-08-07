# Phase 18 — Kraken v1 Private WebSocket User-Data Stream

**WINDELS is an AI Trading Agent — never a broker, exchange, dealing desk, custodian, LP, or execution venue.**

This phase adds full live private WebSocket user-data streaming for the **Kraken**
connector, joining Binance, Bybit, OKX, MEXC, KuCoin, Bitget, and Gate.io with
certified live order/fill/balance events. Kraken was previously stubbed
(`hasPrivateWs: true` but no parser, no auth, no subscribe flow).

## Coverage

| Connector | Public WS | Private WS | Status |
|-----------|-----------|------------|--------|
| Binance, Bybit, OKX | ✅ | ✅ | Certified (Phase 2/5) |
| MEXC | ✅ | ✅ listenKey | Phase 11 |
| KuCoin | ✅ | ✅ bullet-private | Phase 12 |
| Bitget v2 | ✅ | ✅ login-op | Phase 15 |
| Gate.io v4 | ✅ | ✅ per-sub auth | Phase 16 |
| **Kraken v1** | **✅** | **✅ token bootstrap** | **Phase 18** |
| Coinbase, HTX, Crypto.com | ✅/⏸ | ⏸ REST events | Deferred |
| Hyperliquid | ⏸ | ⏸ needs ECDSA | Deferred (-102) |

## Implementation

### Protocol choice: v1 over v2

Kraken operates two WS protocols:
- **v1 (legacy)** — array-form messages (`[channelID, data, channelName, pair]`); frozen
  but **stable** for the `openOrders` and `ownTrades` private feeds, which are the
  only ones we need for order-lifecycle and execution events.
- **v2** — normalized JSON object form; active development but private channels
  were not all certified/stable at the time of implementation.

We use v1 because the token bootstrap + subscribe flow is simple, battle-tested,
and matches exactly what WINDELS's unified parser needs. If v2 matures we can
migrate later without changing external semantics.

Endpoints:
- Public:  `wss://ws.kraken.com`
- Private: `wss://ws-auth.kraken.com`

### Token bootstrap (per-reconnect)

Kraken v1 does **not** use a login frame. Instead:

1. `preparePrivateWsUrl()` is invoked by `ExchangeWsClient` before every TCP open
   (first connect and every reconnect). It calls
   `POST /0/private/GetWebSocketsToken` (signed via the existing
   HMAC-SHA512-base64 `API-Sign` header) and caches the resulting `token` on the
   session as `sess._krakenToken`.
2. The WS URL is unchanged (`wss://ws-auth.kraken.com`).
3. After TCP open, `afterPrivateAuth()` sends two subscribe frames:
   - `{event:"subscribe", subscription:{name:"openOrders", ratecounter:true, token}}`
   - `{event:"subscribe", subscription:{name:"ownTrades", snapshot:false, token}}`
   (We request `snapshot:false` for ownTrades because WINDELS already warms
   recent fills via REST `TradesHistory` on connect; disabling the snapshot
   avoids double-counting.)
4. `authenticatePrivateWs()` is a **no-op** (mirroring Gate.io v4's per-sub
   pattern).

Tokens are valid for 15 minutes, but remain valid while the subscription is
active. Because `ExchangeWsClient.prepareUrl` is invoked on every reconnect, any
reconnect after token expiry automatically fetches a fresh token.

### Message parsing

- **Object-frame events** (`pong`, `heartbeat`, `systemStatus`,
  `subscriptionStatus`) are silently ignored.
- **`openOrders`** array frames deliver order-dictionary snapshots and deltas.
  Each entry is keyed by Kraken txid. The parser merges deltas into the existing
  tracked order (updates often contain only changed fields like `status` or
  `vol_exec`), seeds `priorFilled` before applying incremental fill deltas via
  `applyFill()` (the Phase 5/15/16 cumulative-fill safe pattern), and evicts
  orders whose status becomes `closed`/`canceled`/`expired`.
- **`ownTrades`** array frames deliver individual trade-execution objects keyed
  by trade id. Each is normalized to a `CryptoFill` and applied via
  `applyFill()` regardless of whether we already saw a matching `openOrders`
  fill delta (de-duped by fill id).
- **Public `ticker`** array frames use the v1 format `[chanId, {a:[ask,...], b:[bid,...],...}, "ticker", "XBT/USD"]`.
  The parser reads `a[0]` (best ask) and `b[0]` (best bid) and routes to
  `dispatchTick` via `ticker:<rawSymbol>`.

### Asset / pair normalization

Kraken uses legacy naming:
- `XBT` for BTC; `XXBT`, `XXRP`, `XLTC`, `XXDG` prefixed forms;
- `ZUSD`/`ZEUR`/... for fiat;
- WS pair strings use the slash form `"XBT/USD"`, REST uses concatenated `"XBTUSD"`.

`pairToUnified()` splits on `/` when present (unambiguous, always used by WS)
and falls back to suffix matching on concatenated REST pair strings with quotes
ordered longest-first (`FDUSD`, `USDT`, ..., `USD`) to avoid the `TUSD`/`USD`
suffix-ambiguity bug that plagued naive parsers. `normalizeAsset()` handles the
X/Z-prefix aliases.

### Signer hardening

The Kraken REST signer was updated to accept both form-encoded strings (from an
already-form-encoded body) **and** JSON-object bodies (passed by
`placeOrder`/`cancelOrder`). This matches the pattern already used by the
Binance signer: parse the body, inject `nonce`, re-serialize as
`application/x-www-form-urlencoded`, then sign
`HMAC-SHA512-base64(secret, path + SHA256(nonce + postdata))`.

### Ping/pong

Kraken uses an application-level `{event:"ping", reqid}` frame, answered by the
server with `{event:"pong", reqid}`. Both public and private WS are configured
with `publicWsPingIntervalMs: 25_000` / `privateWsPingIntervalMs: 25_000` and
use the object-form ping. The WS client's standard missed-pong reconnect
handles dead connections.

## Markets

The connector now exposes 84 spot markets (42 bases × {USD, USDT}) using the
`majorPairs` curated universe, with raw WS pairs like `XBT/USD`, `ETH/USDT`,
etc.

## Tests (11 new — total 87)

File: `crypto-phase18-kraken-private-ws.test.ts`

1. `preparePrivateWsUrl` fetches token via `GetWebSocketsToken`, returns `wss://ws-auth.kraken.com`.
2. `authenticatePrivateWs` is a no-op (no login frame).
3. `afterPrivateAuth` sends two subscribe frames (`openOrders`, `ownTrades`) with `token` field.
4. `afterPrivateAuth` auto-fetches a token on the fly if session has none.
5. `parsePrivateMessage` handles openOrders snapshot → delta partial fill → closed eviction; canceled evicted.
6. `parsePrivateMessage` routes ownTrades fills into `applyFill`.
7. Public ticker subscribe builds correct payload with `XBT` alias; parseTicker reads `a[0]`/`b[0]`.
8. `parsePublicMessage` routes array-form ticker frames, ignores object-frame events.
9. Ping frames are object-form `{event:"ping", reqid}` on both WS.
10. `cancelOrderImpl` POSTs to `/0/private/CancelOrder` with `{txid}`.
11. Asset/pair normalization handles XDG/DOGE slash-form pairs via `normalizeAsset`.

All 87 crypto tests pass; TypeScript reports zero errors on trading paths.

## Files changed

- `apps/api/src/tradingIntel/crypto/exchanges/kraken.ts` — full rewrite: v1 WS
  public+ticker, private (GetWebSocketsToken + openOrders+ownTrades subscribes,
  array-form parsers, priorFilled-safe fill accounting, object-form ping, asset
  normalization, signer hardening for JSON bodies, expanded curated markets).
- `apps/api/src/tradingIntel/crypto/crypto-phase18-kraken-private-ws.test.ts` —
  11 new tests covering the above.
- `docs/CRYPTO_PHASE18_KRAKEN_PRIVATE_WS.md` — this document.

## Dashboard impact

No UI changes were required in Phase 18: the existing `useTradingEvents` hook,
Live Orders / Open Positions / Executions tables, Sync/Error badges, and
Latency Monitor already listen to the same `tradingEvents` hub events that the
Kraken private WS now emits. Connecting a Kraken API key now surfaces live
fills, order status changes, and account state over SSE immediately.

## Remaining (deferred)

- Kraken Futures (`demo-futures.kraken.com`) — separate REST/WS surface; not yet
  wired. Spot only in Phase 18.
- `editOrder`/amend — returns the standard not-certified OrderResult.
- Coinbase Advanced, HTX, Crypto.com private WS — next phases.
- Hyperliquid ECDSA/EIP-712 signing — blocked on ethers.js dep (returns -102).
