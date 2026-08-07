# Crypto Phase 3 — Trading Event Hub & Unified SSE Streaming

WINDELS is an **Enterprise AI Trading Agent / Trading Intelligence Platform** —
NOT a broker, exchange, custodian, or execution venue. All fills, ticks, and
account snapshots that flow through the hub **originate from external
brokers/exchanges** connected via their official APIs. WINDELS never originates
a fill, never runs an internal matching engine, never holds customer funds, and
never maintains its own order book.

## Overview

Phase 3 introduces an in-process, org-scoped **Trading Event Hub**
(`apps/api/src/tradingIntel/trading-events.ts`) and a unified
**Server-Sent Events (SSE)** endpoint (`GET /brokers/events/stream`) so the
trading dashboard and any other front-end consumers can subscribe to a single
stream for every connector across MT5 and crypto.

## Event Types

```ts
type TradingEvent =
  | { kind: "tick";           accountId: string; data: BrokerTick }
  | { kind: "order_update";   accountId: string; data: BrokerPendingOrder }
  | { kind: "position_update";accountId: string; data: BrokerPosition }
  | { kind: "execution";      accountId: string; data: { id, status, decision, symbol, side, volume, brokerTicket?, error? } }
  | { kind: "account_state";  accountId: string; data: { status, lastSyncAt?, latencyMs?, error? } };
```

## Producers

| Producer | Events emitted |
|---|---|
| `BaseCryptoConnector` (all 12 crypto exchanges) | `tick` on every public-WS book ticker (when `_oid` is set on config) |
| `Mt5Connector` (all 3 MT5 transports) | `tick` for every inbound symbol tick (when `_oid` is set on config) |
| `BrokerIntegrationService.dispatchToBroker` | `execution` on fill/submit/reject/error |

### Org scoping

`BrokerIntegrationService.connectAccount` piggybacks the organization id onto
the connector config as `_oid` before calling `connector.connect(...)`. Both
`BaseCryptoConnector` and `Mt5Connector` read `(sess|a).opts.config._oid` and
emit into `tradingEvents.emit(oid, ...)` so events are never routed to the
wrong customer. The hub keys listeners by `org:<oid>` and has a
`MAX_LISTENERS = 100` ceiling per Node process.

## Consumer: `GET /brokers/events/stream`

Authenticated endpoint requiring a valid session/JWT. It streams events for
the caller's organization only.

```
GET /brokers/events/stream
Accept: text/event-stream

→ event: ready
  data: {"ok":true,"t":"2025-01-01T00:00:00.000Z"}

→ event: tick
  data: {"kind":"tick","accountId":"...","data":{"symbol":"BTCUSDT","bid":...,"ask":...}}

→ event: execution
  data: {"kind":"execution","accountId":"...","data":{"id":"...","status":"filled",...}}

→ : hb   (every 15s, comment-only keepalive)
```

Response headers: `content-type: text/event-stream`, `cache-control: no-cache`,
`x-accel-buffering: no`, `connection: keep-alive`. The connection is closed
cleanly when the client disconnects; the hub unsubscribe is idempotent.

## Existing endpoint preserved

`GET /brokers/accounts/:id/ticks/stream` remains intact (per-account,
per-symbol filtered tick stream pulled directly from the connector). The new
`/brokers/events/stream` is broader: it aggregates ticks + orders + positions +
executions + account state across all connected accounts for the org.

## Invariants

1. **No cross-org leakage.** Listeners receive only events emitted under their
   own org id; no shared namespace.
2. **No synthetic fills.** The hub never generates a `kind: "execution"` event
   on its own — every execution event is the direct result of a response (or
   error) from an external broker/exchange API call in `dispatchToBroker`.
3. **Best-effort fan-out.** Listener exceptions are swallowed so one buggy
   subscriber cannot break other consumers or the connector itself.
4. **No broker logic.** The hub is an in-memory relay; it does not match,
   clear, settle, custody, or hold any balance.

## Web consumption

The existing `apps/web/src/lib/sse.ts` `streamSSE()` helper can point at
`/brokers/events/stream` and switch on `evt.kind` to update the trading
dashboard (Phase 4).

## Files changed

- `apps/api/src/tradingIntel/trading-events.ts` (new) — `TradingEventHub`
- `apps/api/src/tradingIntel/trading-events.test.ts` (new) — hub unit test
- `apps/api/src/tradingIntel/brokerIntegration.service.ts` — injects `_oid` on
  connect; emits `execution` events from `dispatchToBroker`
- `apps/api/src/tradingIntel/mt5/mt5-connector.ts` — emits `tick` into hub
- `apps/api/src/tradingIntel/crypto/base-crypto-connector.ts` — emits `tick`
  into hub (Phase 3 diff, already applied)
- `apps/api/src/http/routes/brokerIntegration.ts` — `GET /brokers/events/stream`
- `docs/CRYPTO_PHASE3_EVENTS.md` (this file)
