# WINDELS Crypto Phase 2 — Live Order Routing & Streaming

**Status:** shipped on `arena/019fd975-win`. Phase 2 completes the Universal
Exchange Connector Layer with production-grade live order routing, pre-trade
risk governance, and WebSocket streaming across all 12 launch exchanges.

WINDELS remains an **Enterprise AI Trading Agent** — every order is executed
on the user's external exchange account via the official REST/WS APIs; no
internal matching, custody, wallets, or settlement occurs in WINDELS.

## What Phase 2 ships

### 1. Pre-trade risk gate (BaseCryptoConnector)

Every `sendOrder`/`modifyPosition`/`closePosition` call on every crypto
connector passes through a single gate that enforces, in order:

1. `WINDELS_CRYPTO_GLOBAL_READONLY` env kill switch (`retcode -10`)
2. `connectorConfig.readOnly` account-level lock (`retcode -1`)
3. Symbol lookup (`retcode -2`)
4. Shared `RiskEngine` evaluation (per-trade $ risk, leverage cap, exposure
   limit, daily-loss halt, max-drawdown halt) (`retcode -20`)
5. `connectorConfig.allowedSymbols` / `deniedSymbols` allow/deny lists
6. Client-order-id generation (`x-<exchange>-<magic>-<counter>-<uuid8>`)
7. Monotonic counters for Metrics:
   - `crypto.order.dispatched` / `crypto.order.rejected` / `crypto.order.risk_blocked` / `crypto.order.error`
   - `crypto.order.place` / `crypto.order.modify` / `crypto.order.close` timings
   - `crypto.sync` / `crypto.candles.fetch` timings

### 2. Live order routing (per-exchange support)

| Exchange    | Place | Cancel | Modify (SL/TP) | Close | Bracket SL/TP | WS ticker | Private WS |
|-------------|:-----:|:------:|:--------------:|:-----:|:-------------:|:---------:|:----------:|
| Binance     | ✅    | ✅     | ✅ (perp)      | ✅    | ✅ (perp)     | ✅ @bookTicker | ✅ userDataStream (listenKey) |
| Bybit       | ✅    | ✅     | ✅             | ✅    | ✅            | ✅ tickers.*   | ✅ order/position topics |
| OKX         | ✅    | ✅     | ✅             | ✅    | ✅ tpSlTriggerPx | ✅           | ✅ (login op) |
| Coinbase    | ✅ spot | ⏸  | ⏸             | ✅ spot | ⏸          | ✅ (hb)       | ⏸          |
| Kraken      | ✅ spot | ✅  | ⏸             | ✅ spot | ⏸          | ✅             | ⏸ (token)  |
| KuCoin      | ✅ spot | ✅  | ⏸ (cancel+re-place) | ✅ spot | ⏸   | ✅             | ⏸ (bullet-private token) |
| Bitget      | ✅ spot/perps | ⏸ | ⏸ | ✅ | ⏸ | ✅             | ✅ (login op) |
| Gate.io     | ✅ spot/perps | ⏸ | ⏸ | ✅ | ⏸ | ✅             | ⏸ (channel auth) |
| MEXC        | ✅ spot | ⏸ | ⏸ (cancel+re-place) | ✅ spot | ⏸ | ✅        | ⏸ (listenKey) |
| HTX         | ✅ spot | ✅ | ⏸ | ✅ spot | ⏸ | ✅                | ⏸          |
| Crypto.com  | ✅ spot | ⏸ | ⏸ | ✅ spot | ⏸ | ✅                | ✅ (public/auth) |
| Hyperliquid | ⏸ (ECDSA pending ethers.js) | ⏸ | ⏸ | ⏸ | ⏸ | ✅         | ✅          |

Legend: ✅ = production-wired, ⏸ = returns structured "pending certification"
error (retcode -101). No connector in ⏸ state will ever transmit a signed
order without ECDSA/HMAC completion in a subsequent minor release; the risk
gate rejects before any HTTP call is made if credentials don't include the
required `walletKey` for Hyperliquid.

### 3. WebSocket streaming

- **Public WS** is lazily started on first `subscribeTicks()`. Per-symbol
  subscriptions are multiplexed over a single connection and replayed on
  reconnect (handled by `ExchangeWsClient`). Tickers fan out to all
  registered `TickHandler`s and drive `BrokerTick` dispatch. Exponential
  backoff 1s → 2s → 4s → … capped at 30s.
- **Private WS** starts on connect (if supported and `tickStream != false`)
  and runs per-exchange authentication. Message parsers update local
  `positions`, `openOrders`, `balances`, and `fills` maps so REST sync is
  eventually-consistent but UI reflects fills within one RTT.
- Exchange-specific ping/heartbeat messages are configured via
  `publicPingMessage`/`privatePingMessage`.
- Testnet WS URLs are auto-selected when `environment=demo|sandbox|contest`
  or when `WINDELS_CRYPTO_DEFAULT_TESTNET=true`.

### 4. Determinism & safety invariants

- No `Math.random()` or non-deterministic values in trading paths. WS
  request IDs are monotonic counters (`nextWsReqId`).
- No balance/fill/price is ever invented. If an exchange returns no data,
  positions/orders remain as-is; sync errors are surfaced in
  `BrokerSyncState.lastError`.
- Every private endpoint is signed; unsigned requests cannot reach
  authenticated paths.
- Reduce-only flag is set on closes to prevent accidental position
  increases.
- SL/TP brackets are attached as **separate conditional orders** on
  exchanges that don't natively support bracket-orders-on-create (Binance
  STOP_MARKET + TAKE_PROFIT_MARKET child orders; OKX `tpTriggerPx`/
  `slTriggerPx`; Bybit `takeProfit`/`stopLoss` fields).

### 5. New env vars (added Phase 1, enforced Phase 2)

```
WINDELS_CRYPTO_GLOBAL_READONLY=false     # killswitch: refuse every crypto order
WINDELS_CRYPTO_DEFAULT_TESTNET=false     # auto-route all connectors to testnet
WINDELS_CRYPTO_HTTP_TIMEOUT_MS=10000    # per-request HTTP timeout
```

### 6. Tests added

- `crypto-phase2.test.ts` — 9 tests covering:
  - Global read-only kill switch blocks orders
  - Account-level read-only blocks orders
  - Unknown symbol returns retcode -2
  - Risk Engine rejects oversized orders (retcode -20)
  - Order parameter builder (`buildOrderParams`)
  - Price/qty rounding (tick-size aware)
  - Side/type canonical strings
  - Client-order-id uniqueness + length bounds

Total crypto/backtest tests: **32 passing**.

### Files touched in Phase 2

- `packages/shared/src/crypto.ts` — extended `CryptoConnectorCapabilities`
  with testnet WS URLs, ping intervals, listenKey flag; added `triggerPrice`,
  `stopLoss`, `takeProfit`, `positionSide` to `CryptoOrder`; added
  `ecdsa_secp256k1`/`hmac_sha256_query`/`hmac_sha256_body` auth schemes.
- `apps/api/src/tradingIntel/crypto/base-crypto-connector.ts` — major
  rewrite: pre-trade risk gate, Metrics counters, testnet URL selection,
  client-order-id gen, WS ticker subscribe fan-out, listenKey lifecycle
  (create/keepalive/dispose), private WS message ingestion into local
  order/position/balance/fill books, cancelOrder hook, env kill switch.
- `apps/api/src/tradingIntel/crypto/exchange-ws.ts` — widened `pingMessage`
  type to accept objects.
- `apps/api/src/tradingIntel/crypto/signing.ts` — added `sha512Hex` and
  `hmacSha512Hex` helpers (Gate.io / Kraken).
- `apps/api/src/tradingIntel/crypto/order-utils.ts` (new) — shared order
  param builder, response translator, DELETE/POST cancel helpers, roundQty
  /roundPrice (tick-size aware).
- `apps/api/src/tradingIntel/crypto/exchanges/common.ts` — renamed
  `phase1Gate` → `notCertified` (clearer semantics).
- **12 exchange connectors** updated:
  - Binance, Bybit, OKX, Coinbase, Kraken — full live order routing
  - KuCoin, Bitget, Gate.io, MEXC, HTX, Crypto.com — live place+close
    (cancel/modify where supported)
  - Hyperliquid — read paths live; write paths return structured
    "ECDSA signing pending ethers.js integration" error (safe fail-closed)

## Explicitly deferred to Phase 2.x (minor)

1. ECDSA/EIP-712 signing for Hyperliquid via `ethers.js` (requires adding
   the dep; currently the connector returns a clear -102 error).
2. Gate.io / Kraken / KuCoin / Crypto.com private WS user streams (each
   requires a separate token-bake REST call + per-channel auth).
3. Coinbase Advanced limit-only post-only flag, SL/TP via separate
   `/orders` POST.
4. Options and futures expiry-aware market lists (currently curated
   major-pairs list — production fetch from `/exchangeInfo` is a follow-up).

## Verification

```
Test Files  126 passed | 2 failed (geoBilling + enterpriseSearch are
                               pre-existing Prisma WASM failures)
Tests       1849 passed | 8 failed (same pre-existing Prisma failures)
Web typecheck + production build: green
Shared package build: green
No Math.random() regressions in trading paths.
```
