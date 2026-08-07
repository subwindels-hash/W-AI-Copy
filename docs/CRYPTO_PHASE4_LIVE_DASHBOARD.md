# Crypto Phase 4 — Live Dashboard Hooked to Unified SSE Stream

WINDELS is an **Enterprise AI Trading Agent / Trading Intelligence Platform** —
NOT a broker, exchange, custodian, or execution venue. The live dashboard is a
**read-only view** of data that originates from the user's own external
broker/exchange accounts. The browser never holds funds, never matches orders,
and never executes on its own.

## What Phase 4 adds

The Phase 3 hub/SSE endpoint (`GET /brokers/events/stream`) is now wired into
the Trading Dashboard React UI via a new `useTradingEvents` hook.

### Files added/changed

| File | Change |
|---|---|
| `apps/web/src/lib/tradingEvents.ts` | New React hook `useTradingEvents()` that consumes `/api/v1/brokers/events/stream` via the existing `streamSSE()` async iterator, normalizes tick/execution/order/position/account_state events, and exposes ring-buffered lists plus per-symbol latest tick. Auto-reconnects after disconnect with a 2s delay. |
| `apps/web/src/pages/trading/TradingDashboardPage.tsx` | Wires the hook into the page. Adds a live-connection status strip + scrolling ticker tape of recent ticks; overlays live bid/ask onto positions for near-real-time P/L; merges live executions ahead of the polled executions list so fills appear instantly without waiting for the next `/brokers/dashboard` poll; adds a LIVE badge to the executions card header. |

### Hook contract

```ts
interface TradingLiveState {
  connected: boolean;
  readyAt: string | null;
  lastEventAt: string | null;
  recentTicks: LiveTick[];        // capped at 50
  recentExecutions: LiveExecution[];
  orderUpdates: LiveOrder[];
  positionUpdates: LivePosition[];
  accountUpdates: LiveAccount[];
  latestTickByKey: Record<`${acctId}:${symbol}`, LiveTick>;
}
```

- **Auto-reconnect.** If the SSE iterator throws (network blip, server
  restart), the hook marks `connected: false` and reconnects after 2 seconds.
- **SSR-safe.** The fetch is deferred via a microtask so the hook doesn't run
  during server render.
- **Read-only.** No write paths; `useTradingEvents` only consumes.

### Live ticker tape

Rendered as a horizontally-scrolling strip showing the 20 most recent ticks in
monospaced font (`SYMBOL bid/ask`). Hidden scrollbars; fades at the edges
via CSS mask for a polished look. The strip reads "Awaiting market ticks from
connected brokers/exchanges…" when no events have arrived yet.

### Live P/L overlay

For each open position, if a live tick exists for `(accountId, symbol)`, the
position's `currentPrice` is replaced with `bid` (for longs) or `ask` (for
shorts), so the displayed P/L reflects the current market before the next
dashboard poll refreshes. This is cosmetic only — the authoritative P/L still
comes from `/brokers/dashboard` which pulls numbers from the broker.

### Live executions

Executions that arrive over SSE but aren't yet in the polled list are
prepended to the Executions table with `source: "live"` so the trader sees
fills/submissions/rejections instantly. They're replaced by the authoritative
polled row on the next refresh.

### Connection UX

- Wi-Fi icon: green = connected, amber = (re)connecting.
- "since X ago" shows when the SSE session began.
- "last event X ago" shows recency of the most recent event — useful for
  spotting a silent stream.
- LIVE badge on executions card header when stream is active.
- Counters: total live executions seen + number of distinct symbols tracked.

## Polling model

The dashboard still uses periodic manual "Refresh" clicks + the initial
`load()` fetch for the authoritative snapshot. SSE events are an **optimistic,
low-latency overlay** on top of that snapshot, not a replacement. This keeps
the UI honest: if a tick is stale or an execution is rolled back (e.g. a
rejected order), the next authoritative poll corrects the view.

## Invariants reaffirmed

1. **No client-side matching or custody.** The browser renders what it
   receives; it never holds keys, balances, or fills.
2. **Auth scoping.** The SSE endpoint is behind `authenticate` middleware and
   reads `oid(req)`; the hook receives no cross-org events.
3. **Fail-closed reconnect.** If the stream drops, the UI shows
   "Connecting…" rather than freezing or showing stale data as "live".
4. **Bounded memory.** Ring buffers cap at 50 events per kind; the
   per-symbol tick map grows only per `(accountId, symbol)` pair the
   connected accounts actually stream — bounded by the symbols a trader has
   subscribed to.
5. **No random data.** The hook uses deterministic logic; no `Math.random`
   calls in live code paths.

## Build verification

- `pnpm --filter @windels/web build` passes cleanly.
- Backend unit tests unchanged (1850 passed, pre-existing 8 Prisma-WASM + 1
  geoBilling failures out of scope).
- No new broker-side code in this phase — it's a consumer-only UI layer atop
  Phase 3's event hub.
