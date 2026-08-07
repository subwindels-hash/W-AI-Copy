# Phase 20 — Crypto.com Exchange v1 Private WebSocket User-Data Stream

WINDELS is an AI **TRADING AGENT**, never a broker, exchange, or custodian. All
order execution happens at the user's own Crypto.com Exchange account through
Crypto.com's official public REST and WebSocket APIs.

## What was delivered

Upgraded the Crypto.com Exchange connector to fully certified private-WS status,
matching the capabilities added for Binance, OKX, Bybit, KuCoin, MEXC, Bitget,
Gate.io, Kraken, and HTX in earlier phases.

### Authentication (corrected v1 signer)

* POST bodies follow JSON-RPC style: `{ id, method, params, nonce, api_key, sig }`.
* Signature is `HMAC-SHA256-HEX(secret, method + id + api_key + paramsStr + nonce)`
  where `paramsStr` is the canonical alphabetically-sorted key+value
  concatenation of the `params` object (supporting nested objects and arrays,
  depth-limited to 3 levels per Crypto.com's documented recipe).
* WebSocket `public/auth` uses the same algorithm with empty params.
* REST base upgraded from legacy `/v2/` to `https://api.crypto.com/exchange/v1/`.

### Markets

* 42 bases × 2 quote-forms = **84 markets** (spot `BASE/USDT` and perp
  `BASE/USDT:USDT`), all using Crypto.com's underscore raw naming (`BASE_USDT`).

### REST

| Endpoint | Purpose |
| --- | --- |
| `POST /exchange/v1/private/create-order` | Place limit/market orders (spot & perp). |
| `POST /exchange/v1/private/cancel-order` | Cancel an order by id; retries without `instrument_name` on failure. |
| `POST /exchange/v1/private/get-account-summary` | Account balances (available/order/balance). |
| `POST /exchange/v1/private/get-positions` | Derivatives positions (entry cost, mark price, PnL, leverage). |
| `POST /exchange/v1/private/get-open-orders` | Paging open orders for snapshot warmup. |
| `POST /exchange/v1/private/get-trades` | Recent fills (fetchRecentFills). |
| `GET  /exchange/v1/public/get-candlestick` | OHLCV candles. |

`modifyOrder` remains explicitly not-certified (Crypto.com's advanced order
replace requires the advanced-order endpoints; deferred).

### WebSocket

* **Public WS** — `wss://stream.crypto.com/exchange/v1/market`
  * Subscribes to `ticker.<raw>` channels; parses `b` (best bid) and `k` (best
    ask) from the push payload.
  * Server `public/heartbeat` frames are answered with
    `{id, method:"public/respond-heartbeat"}` to keep the connection alive.
  * A periodic `public/respond-heartbeat` is sent as the client ping.
* **Private WS** — `wss://stream.crypto.com/exchange/v1/user`
  * `public/auth` once on connect; then subscribes (wildcard, no per-instrument
    filter — the agent trades many majors) to:
    * `user.order`      (order lifecycle pushes)
    * `user.trade`      (individual trade fills)
    * `user.balance`    (spot balances)
    * `user.positions`  (perpetual-swap positions)
  * Same heartbeat reply protocol as the public WS.
  * Prior-fill seeding: cumulative_quantity updates are diffed against the
    locally-tracked filledQuantity, and only the delta is applied through
    `applyFill` (matching Bybit/Bitget/Gate.io/HTX to avoid double counting).
  * Terminal statuses (`FILLED`, `CANCELED`, `CANCELLED`, `REJECTED`, `EXPIRED`)
    evict the open order; `ACTIVE`/`PARTIAL` upsert.
  * Zero-quantity positions deletes; zero balances delete; USDT/USDT balances
    are tagged with `usdValue` for equity calculations.
  * Subscription acks are distinguished from data pushes by the presence of
    the `result.data` array (acks carry `result.channel` but no data array).

### Observability

* `Metrics.counter("crypto.order.place"/"crypto.order.rejected"/...)` —
  unchanged, inherited from BaseCryptoConnector.
* Latency is stamped per-REST-call and reported on `account_state` events
  via `TradingEventHub`.
* Per-account consecutive errors and last-error timestamps are tracked via the
  Phase 17 error counter.

### Tests

11 new tests in `crypto-phase20-cryptocom-private-ws.test.ts`:
* Public subscribe payload shape + ticker `b`/`k` parsing.
* `parsePublicMessage` replies to heartbeats and routes tickers.
* Public/private ping messages are `public/respond-heartbeat`.
* `authenticatePrivateWs` HMAC signature matches deterministic recomputation
  over `method+id+apiKey+""+nonce`.
* `afterPrivateAuth` subscribes to all four user channels.
* `parsePrivateMessage`: heartbeat reply, order lifecycle (create → partial →
  filled → evicted; canceled → evicted), fill routing, balance merge + zero
  eviction, positions + zero-quantity delete.
* `cancelOrderImpl` POSTs to correct path with order_id + instrument_name.
* Signer test with canonical `private/get-order-detail` + `order_id` param
  validates alphabetically-sorted param-string construction.
* `fetchMarkets` returns exactly 84 markets (42 perp + 42 spot) with `_USDT`
  raw names and correct unified symbols.

Total crypto tests: **109 passing** (98 prior + 11 new). The 1 known
cross-test-pollution flake between Gate.io and Bitget (1 test fails ~15% of
runs when all tests run in parallel) is pre-existing and not caused by this
phase; both tests pass in isolation or when run in a file order that doesn't
trigger the leak.

### Dashboard (web)

Added per-account **Reconnect** and **Disconnect** buttons to the Broker
Accounts row on the Trading Dashboard:
* **Reconnect** (cyan Power icon): disconnects the account (best-effort) so
  the Supervisor re-establishes the connection — useful when a WS has
  silently stalled.
* **Sync** (RefreshCw, added in Phase 17): force-refresh balances/orders/
  positions from REST.
* **Disconnect** (rose X icon): disconnects the account from WINDELS without
  touching open positions or orders at the broker. A tooltip clarifies this
  to avoid any ambiguity — WINDELS never closes broker-side positions on
  its own.
Both new actions share the existing busy-key pattern (`conn:<id>` /
`disc:<id>`) with per-row spinner and disabled-while-busy states.

## Compliance / Disclaimers

WINDELS does **not**:
* hold customer funds or operate a wallet
* run an internal order book, matching engine, or execution venue
* act as a broker, dealer, exchange, custodian, LP, or settlement agent
* provide brokerage services or route orders to any WINDELS-affiliated venue

WINDELS **does**:
* connect to each user's existing Crypto.com (or other) exchange account
  using the user's own API credentials over TLS
* place/cancel/monitor orders on the user's behalf through Crypto.com's
  official public APIs
* stream live market data and user events through officially documented
  WebSocket channels
* enforce pre-trade risk, pause/kill switches, and human-in-the-loop controls
* expose audit trail, live PnL, latency monitoring, and the SSE event stream
  to the operator dashboard

## Files changed

* `apps/api/src/tradingIntel/crypto/exchanges/cryptocom.ts` — upgraded to
  full certified v1 connector with private WS, cancel, recent fills, v1
  signer, ticker WS, 84 markets.
* `apps/api/src/tradingIntel/crypto/crypto-phase20-cryptocom-private-ws.test.ts`
  — new test file with 11 tests.
* `docs/CRYPTO_PHASE20_CDC_PRIVATE_WS.md` — this document.
