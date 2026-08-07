# Crypto Phase 7 — Connector Health & Account-State Streaming

WINDELS is an **Enterprise AI Trading Agent / Trading Intelligence Platform** —
NOT a broker, exchange, custodian, or execution venue. Account/connector state
events are derived purely from the user's external broker/exchange responses
and WebSocket lifecycle callbacks; WINDELS never fabricates its own
"connected" state.

## What Phase 7 delivers

Before Phase 7, the Trading Event Hub carried `tick`, `order_update`,
`position_update`, and `execution` events, but **connector lifecycle events**
(`connect`, `disconnect`, `error`, `syncing`) did not reach the hub. The
dashboard had to wait for a full `/brokers/dashboard` poll (manual Refresh or
page load) to see that a broker had disconnected or errored out.

Phase 7 wires connector-health events into the same SSE stream so the UI
reacts instantly when:

- a broker/exchange connects successfully
- a sync fails
- a WS drops and triggers reconnect
- an account is explicitly disconnected

### Files changed

| File | Change |
|---|---|
| `apps/api/src/tradingIntel/crypto/base-crypto-connector.ts` | `emitState()` now fans out to `tradingEvents.emit(oid, { kind: "account_state", accountId, data: { status, lastSyncAt, latencyMs, error } })` when `_oid` is on session config. This covers connected/error/disconnected/syncing transitions from both REST sync and the WebSocket lifecycle. |
| `apps/api/src/tradingIntel/mt5/mt5-connector.ts` | Same change in Mt5Connector's private `emitState()` — MT5 state transitions now also reach the hub. |
| `apps/web/src/lib/tradingEvents.ts` | New `accountStateByAccount: Record<accountId, LiveAccount>` map in the hook state; `account_state` events update both the ring buffer and the per-account latest entry. |
| `apps/web/src/pages/trading/TradingDashboardPage.tsx` | Derives `accountsWithLive` via `useMemo` — overlays SSE-driven account state onto the polled accounts list so the broker-account list reflects `connected/error/disconnected/syncing/idle` instantly without waiting for the next `/brokers/dashboard` poll. Added `"idle"` to statusColor map. |
| `apps/api/src/tradingIntel/crypto/crypto-phase7-health.test.ts` | 2 new tests covering account_state fan-out + cross-org isolation. |
| `docs/CRYPTO_PHASE7_CONNECTOR_HEALTH.md` | This file. |

### Event contract (extended)

```ts
{
  kind: "account_state";
  accountId: string;
  data: {
    status: "connected" | "connecting" | "syncing" | "reconnecting" | "disconnected" | "error" | "idle";
    lastSyncAt?: string;   // ISO timestamp of last successful sync
    latencyMs?: number;   // last measured REST/WS latency
    error?: string;       // error message when status === "error"
  };
}
```

These events are emitted from two places:

1. **BaseCryptoConnector.emitState** for all 12 crypto exchanges — on connect,
   sync success, sync failure, explicit disconnect, and pre-trade errors.
2. **Mt5Connector.emitState** for the three MT5 transports — on connect,
   sync, transport error, and disconnect.

### UI behavior

- Account list badge/color reflects the latest SSE `account_state.status`
  immediately, rather than waiting up to the polling interval for the next
  `/brokers/dashboard` refresh.
- Error messages (e.g. "listenKey expired", "auth failed", "upstream timeout")
  surface in the per-account error line the moment they fire, giving the
  operator instant feedback that a connector needs attention.
- After the next successful `/brokers/dashboard` poll, status converges to
  the polled snapshot (the SSE overlay is purely additive/latency-reducing).

### Latency semantics

The SSE account_state overlay is **not** the source of truth — the
authoritative snapshot always comes from `/brokers/dashboard`. The overlay
only ever sets `status`, `lastSyncAt`, and `error`; balance/equity/positions
continue to come from the poll (and from position_update events which are
already wired via Phase 5 private WS). This keeps the UI honest even if an
event fires out of order.

### Test results

- 1860 API tests passing (+2 Phase 7 tests); pre-existing 8 Prisma-WASM + 1
  geoBilling failures unchanged and out of scope.
- Web production build green.
- tsc clean across all trading/crypto/dashboard paths.
- noRandomData guard passes; no Math.random added.
- No broker/custody/internal-matching logic — `account_state` is a lifecycle
  telemetry channel, not an execution venue.
