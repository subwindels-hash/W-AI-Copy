# Crypto Phase 5 — Private WebSocket Execution Streams + REST Event Emission

WINDELS is an **Enterprise AI Trading Agent / Trading Intelligence Platform** —
NOT a broker, exchange, custodian, or execution venue. Private WebSocket streams
are **read-only consumers** of the user's own broker/exchange data; WINDELS
never originates fills, holds keys outside connector config, or maintains its
own order book.

## What Phase 5 delivers

Before Phase 5, private WS clients started up and authenticated (on exchanges
where auth was implemented) but incoming order/position/balance frames were
parsed only for in-memory state updates on Binance and Bybit — they never
reached the Trading Event Hub, so the live dashboard did not react to
order/fill events in real time (only to ticks and REST-dispatched orders).

Phase 5 closes that loop:

1. **Private WS channel events fan out to the hub.** When the private WS
   parser emits `{channel:"order"|"position"|"balance"|"account"|"fill"}`
   frames, the `ExchangeWsClient` "message" listener in `startPrivateWs()`
   routes them into `tradingEvents.emit(oid, { kind: "order_update" |
   "position_update" | "account_state" | "execution", ... })` — so the
   dashboard (Phase 4) picks up fills instantly, without waiting for REST
   background sync.
2. **REST order dispatch emits execution events immediately.** Every
   `sendOrder()` response (success + reject + exception) emits an `execution`
   event via a new `emitOrderEvent()` helper. This means **all 12 exchanges**
   produce live execution events the moment the REST call returns, regardless
   of whether their private WS is fully wired. Private WS simply enriches
   latency (follow-up fills, position updates) for exchanges that support it.
3. **After-auth subscribe hook.** Subclasses may override `afterPrivateAuth()`
   to send subscribe frames after WS authentication completes.
4. **Per-event converter helpers** (`cryptoOrderToBrokerOrder`,
   `cryptoPositionToBrokerPosition`) convert internal CryptoOrder/CryptoPosition
   shapes into the shared BrokerPendingOrder/BrokerPosition types expected by
   the SSE event contract.
5. **Binance parsePrivateMessage fixed** — fill accumulation bug (pre-maturely
   deleting the order before applying the fill on TRADE frames) resolved by
   reordering set → applyFill → delete.
6. **Bybit parsePrivateMessage fixed** — fill accumulation bug (subtracting
   filledQuantity from cumExecQty when cumExecQty was just assigned) resolved
   by snapshotting priorFilled before constructing the order.
7. **OKX Private WS fully wired:**
   - `afterPrivateAuth` subscribes to `orders`, `positions`, `account` channels.
   - `parsePrivateMessage` parses orders (with incremental fills via
     `fillPx`/`fillSz`), positions, and account balance updates.
   - Public ticker WS added (`tickers` channel) — OKX now streams live bid/ask
     ticks just like Binance/Bybit.
8. **Bybit afterPrivateAuth** subscribes to `order` + `position` topics.
9. **4 new tests** (`crypto-phase5.test.ts`):
   - Binance order/fill/position channel routing + fill accumulation.
   - Bybit afterPrivateAuth subscribe op structure.
   - OKX afterPrivateAuth + parsePrivateMessage (orders/positions/account/tickers).
   - TradingEventHub singleton behavior (subscribe → emit → unsubscribe).

## Files changed

| File | Change |
|---|---|
| `apps/api/src/tradingIntel/crypto/base-crypto-connector.ts` | Added `emitOrderEvent` helper; REST `sendOrder` now emits `execution` events on ok/error; added `afterPrivateAuth` hook; `startPrivateWs` now listens on private WS for "order"/"position"/"balance"/"account"/"fill" channels and fans out to tradingEvents hub; added single-event converters `cryptoOrderToBrokerOrder`/`cryptoPositionToBrokerPosition`. |
| `apps/api/src/tradingIntel/crypto/exchanges/binance.ts` | Fixed fill-accumulate ordering bug in `parsePrivateMessage` (set → applyFill → delete) so TRADE frames record fills before order eviction. |
| `apps/api/src/tradingIntel/crypto/exchanges/bybit.ts` | Fixed `cumExecQty` incremental-fill bug; added `afterPrivateAuth` subscribing to `order`/`position` topics. |
| `apps/api/src/tradingIntel/crypto/exchanges/okx.ts` | Added complete `parsePrivateMessage` (orders/positions/account), `afterPrivateAuth` subscribe, public WS ticker subscription (`tickers` instId channel + parser), helpers `okxToUnified`/`mapOkxOrderState`. |
| `apps/api/src/tradingIntel/crypto/crypto-phase5.test.ts` | 4 new tests covering the above. |
| `docs/CRYPTO_PHASE5_PRIVATE_WS.md` | This file. |

## Exchanges with full private WS live updates

| Exchange | Auth | Subscribes | Parses |
|---|---|---|---|
| Binance | listenKey (REST) | implicit via URL | orders, fills (TRADE), balances, positions |
| Bybit | HMAC op:auth | order, position | orders, fills (cumExecQty), positions |
| OKX | HMAC op:login | orders, positions, account | orders, fills (fillPx/sz), positions, account |

## Exchanges with REST-driven events only (WS bootstrapping deferred)

The remaining 9 exchanges still produce live events because every REST order
dispatch emits `execution` immediately:

- Bitget, Coinbase, Kraken, KuCoin, Gate.io, MEXC, HTX, Crypto.com,
  Hyperliquid.

Private WS for these exchanges will be activated in future phases (some
require extra REST round-trips for bootstrap tokens — KuCoin bullet-private,
Kraken WS token, Gate.io per-channel signed "auth" channel, MEXC listenKey
POST, HTX v2 auth, Coinbase channel-level JWT, Crypto.com auth id/nonce
handshake). Until then the dashboard sees executions at REST-return time
(~50-200ms) which is already near-real-time.

## Test results

- 1855 API tests passing (up from 1851 — +4 new Phase 5 tests).
- Pre-existing 8 Prisma-WASM + 1 geoBilling failures unchanged, out of scope.
- Web production build green.
- noRandomData guard passes.
- No new broker/custody/internal-matching code.

## Invariants reaffirmed

- **No synthetic fills.** Private WS frames come directly from the exchange's
  own user-data channel; WINDELS never creates a fill on its own.
- **Org scoping.** All hub emits key on `_oid`; cross-tenant leakage blocked
  by event key `org:<oid>`.
- **Best-effort fan-out.** Listener exceptions are swallowed so a bad UI
  consumer can't break connector ingestion.
- **No Math.random()** in live paths.
- **Bounded memory** — ring buffers + per-symbol maps.
