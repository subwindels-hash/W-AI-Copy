# Crypto Exchange Connector Layer — Phase 1

Phase 1 of the Cryptocurrency Trading Platform vertical delivers a production-ready
universal connector layer for 12 exchanges, plugging into the same `IBrokerConnector`
abstraction used by MT5 so crypto accounts are first-class citizens across the
dashboard, risk engine, AI workforce, and strategy runner.

## Exchanges shipped (12)

| Exchange       | Module                                              | Auth                       | Markets                  | WS |
|----------------|-----------------------------------------------------|----------------------------|--------------------------|----|
| Binance        | `crypto/exchanges/binance.ts`                       | HMAC-SHA256 (X-MBX-APIKEY) | spot, USDⓈ-M perps, margin, futures | ✅ |
| Bybit          | `crypto/exchanges/bybit.ts`                         | HMAC-SHA256 (X-BAPI-*)     | spot, linear/inverse perps, options | ✅ |
| OKX            | `crypto/exchanges/okx.ts`                           | HMAC-SHA256 base64 (OK-ACCESS-*, passphrase) | spot, margin, swap, futures, options | ✅ |
| Coinbase Adv.  | `crypto/exchanges/coinbase.ts`                      | HMAC-SHA256 (CB-ACCESS-*, passphrase) | spot, perps | ✅ |
| Kraken         | `crypto/exchanges/kraken.ts`                        | HMAC-SHA512 base64 key     | spot, futures, margin | ✅ |
| KuCoin         | `crypto/exchanges/kucoin.ts`                        | HMAC-SHA256 base64 (KC-API-*, passphrase v2) | spot, margin, futures | ✅ |
| Bitget         | `crypto/exchanges/bitget.ts`                        | HMAC-SHA256 (ACCESS-*, passphrase) | spot, USDT/Coin perps | ✅ |
| Gate.io        | `crypto/exchanges/gateio.ts`                        | HMAC-SHA512 (KEY/SIGN)     | spot, USDT/BTC perps, options | ✅ |
| MEXC           | `crypto/exchanges/mexc.ts`                          | HMAC-SHA256 (ApiKey/Request-Time/Signature) | spot, USDT perps | ✅ |
| HTX (Huobi)    | `crypto/exchanges/htx.ts`                           | HMAC-SHA256 (query sig, AccessKeyId+SignatureMethod) | spot, futures, swaps | ✅ |
| Crypto.com Ex. | `crypto/exchanges/cryptocom.ts`                     | HMAC-SHA256 body sig       | spot, perps, margin, options | ✅ |
| Hyperliquid    | `crypto/exchanges/hyperliquid.ts`                   | ECDSA wallet (info/exchange JSON POST) | perps, spot | ✅ |

## Architecture

```
apps/api/src/tradingIntel/crypto/
├── base-crypto-connector.ts     # IBrokerConnector adapter, session map, tick fan-out
├── exchange-http.ts             # Shared signed HTTP client: retries, 429, token bucket, structured errors
├── exchange-ws.ts               # Shared WS client: auto-reconnect, ping, subscription replay
├── signing.ts                   # HMAC-SHA256/512 helpers (hex/base64), clock drift, canonical QS
├── hmac-variants.ts             # Factory for common HMAC signing variants
└── exchanges/                   # Per-exchange connector class
    ├── binance.ts, bybit.ts, okx.ts, coinbase.ts, kraken.ts,
    ├── kucoin.ts, bitget.ts, gateio.ts, mexc.ts, htx.ts,
    ├── cryptocom.ts, hyperliquid.ts
    └── common.ts                # phase1Gate, mkMarket, majorPairs, mapTimeframe, mapStatus
```

Each `XxxConnector extends BaseCryptoConnector` and implements:

- `buildSigner(creds)` → `HttpSigner` (per-exchange HMAC/JWT/ECDSA)
- `fetchMarkets(sess)` → unified `CryptoMarket[]` (symbol normalization, precision, leverage)
- `fetchAccountSnapshot(sess)` → balances + positions + open orders
- `placeOrder / modifyOrder / closePositionImpl` → **Phase 1 returns `phase1Gate()`**
  (structured "pending risk gate sign-off") so live-order routing cannot accidentally fire
  before the crypto order-routing + risk+approval pipeline ships in Phase 2
- `fetchCandles(sess, symbol, tf, count)` → OHLCV history (public endpoints, no auth required — already live)
- `fetchRecentFills(sess, since)` → fill history
- `authenticatePrivateWs(sess, send)` → WS login payload per exchange

## Design constraints honored

- **No third-party exchange SDKs** — raw REST+WS over Node's built-in fetch to avoid
  CVE churn and keep latency / bundle size tight.
- **Credentials encrypted at rest** — existing `encryptString` (AES-256-GCM) in
  `security/encryption.ts`, stored in Redis under `exc:<oid>:creds:<id>`.
- **API keys never logged** — logger only emits exchange/method/path/status/latency.
- **Read-only mode honored** — `connectorConfig.readOnly` short-circuits all order paths
  before they hit the network; global `WINDELS_CRYPTO_GLOBAL_READONLY` acts as an org-wide
  kill switch layered above per-account config.
- **Deterministic symbol normalization** — `BTC/USDT` spot, `BTC/USDT:USDT` linear perp,
  `BTC/USD:BTC` inverse perp — the same format CCXT and our MT5/EAs converge on.
- **Capabilities declared up-front** — each connector exposes `CryptoConnectorCapabilities`
  (markets, auth schemes, WS URLs, rate limits, testnet URLs) so the UI can render
  which markets/features are enabled per exchange.
- **Token-bucket rate limiting** — shared `ExchangeHttpClient` enforces per-minute budgets
  and honors Retry-After with exponential backoff on 5xx/429.
- **WS auto-reconnect with subscription replay** — `ExchangeWsClient` reconnects
  1s→2s→4s→… capped at 30s and re-sends all active subscribe + auth frames so callers
  never have to re-hydrate after a blip.
- **Multi-account** — one connector instance handles many API keys (separate sessions,
  HTTP clients, and WS connections per `accountId`).

## Phase 1 scope (this delivery)

✅ Markets discovery (instrument metadata with precision/leverage/min-size)
✅ Connect + auth signature for all 12 exchanges
✅ Balances / positions / open orders sync
✅ OHLCV candles (public endpoints — no key required for market data)
✅ Connector registry wired into `registerBundledConnectors()`
✅ All 12 exchanges appear in `CONNECTOR_CATALOG` and dashboard connector health
✅ Shared HTTP + WS primitives with retries / rate limits / auto-reconnect
✅ 17 new tests (HTTP client, signing helpers, connector registry, signer output, market shapes)
✅ No regression: 1845 API tests pass, 8 pre-existing Prisma WASM failures unchanged
✅ Web typecheck clean, web build clean
✅ Env vars: `WINDELS_CRYPTO_GLOBAL_READONLY`, `WINDELS_CRYPTO_DEFAULT_TESTNET`, `WINDELS_CRYPTO_HTTP_TIMEOUT_MS`

## Phase 1 safety gate

Live order placement (`placeOrder/modifyOrder/closePosition`) currently returns a
structured `{ ok:false, retcode:-100, error:"<exchange> live order routing pending Phase 2
risk-gate sign-off" }` response. This is **by design**: Phase 1 certifies auth, market
data, account/position sync, and read surfaces end-to-end before any orders can leave
the system. Phase 2 will wire the AI risk-approval pipeline (same pipeline MT5 uses),
implement per-exchange order-type mapping, SL/TP attach, reduce-only, and testnet
certification against each exchange's sandbox.

## Phase 2 / 3 roadmap (not yet started)

- **Phase 2 — Live order routing**: per-exchange order builders (market/limit/stop/TP/SL,
  reduce-only, post-only, time-in-force), idempotency `clientOrderId`, testnet parity
  tests against each sandbox, approval pipeline integration (AI → Risk → Supervisor →
  Connector), ledger writes for fills, error-code mapping, partial-fill handling.
- **Phase 2 — WS market data**: ticker/trade/candle/orderbook subscriptions routed
  through the existing `subscribeTicks` fan-out for realtime dashboards.
- **Phase 2 — Private WS**: user order/fill/balance/position streams replacing polling
  for low-latency state sync.
- **Phase 3 — Cross-exchange smart routing** (aggregated quotes, liquidity sweep),
  transfers / deposit addresses / withdrawal whitelisting, portfolio margin across
  exchanges, sub-account management (Binance/Bybit/OKX/KuCoin).
