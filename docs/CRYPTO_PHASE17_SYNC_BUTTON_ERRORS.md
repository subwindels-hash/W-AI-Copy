# Phase 17 — Manual Sync Button + Consecutive Error Counter

**WINDELS is an AI Trading Agent, not a broker, exchange, or custodian.** All
order routing remains through the user's own broker/exchange APIs. This phase
is an operator-observability improvement: a per-account "Sync now" button and
a live consecutive-error counter surfaced on the Latency Monitor.

## Scope

### 1. Per-account Sync Now button (UI)

A small circular refresh button now appears on every row of the Broker Accounts
card, next to the read-only Locked/Trading switch. Clicking it:
- POSTs to `/brokers/accounts/:id/sync` with a full account/positions/orders/
  symbols/history scope (the same endpoint the platform already used for
  programmatic refresh)
- Shows a spinner (`Loader2`) for the clicked account only while the request
  is in flight; other accounts remain interactive.
- Disables itself when the account is not `connected` (can't sync a
  disconnected account).
- After success, the dashboard re-polls `/brokers/dashboard` so positions,
  orders, balances and the Latency Monitor reflect the freshly-synced state.
- The global top-bar **Refresh** button is preserved; the new per-account
  button is additive for faster operator triage.

The backend route `POST /brokers/accounts/:id/sync` already existed (it was
wired up in earlier phases but had no UI control). This phase simply exposes
it per-row.

### 2. Consecutive error counter (backend + SSE + UI)

Connectors track a per-session `consecutiveErrors` counter that increments on
every `emitState(..., "error")` event (WS drops, REST failures, auth errors,
sync failures) and **resets to 0** the moment a successful sync completes.
The counter and `lastErrorAt` ISO timestamp are now:

- Carried on the BrokerAccount record (`consecutiveErrors`, `lastErrorAt`) in
  Redis, persisted on every connect/sync success or failure.
- Incremented in `BrokerIntegrationService.connectAccount` and
  `syncAccountFromConnector` on error branches, reset to 0 on success.
- Tracked per session inside `BaseCryptoConnector.sessionErrors` and
  `Mt5Connector` (emitted in SSE `account_state` events under new fields
  `consecutiveErrors`, `lastErrorAt` — the event type was widened in
  `trading-events.ts` to allow these fields).
- Surface on the SSE feed so the web UI picks up live failures without
  waiting for the next dashboard poll.

### 3. UI surface for errors

- **Broker Accounts row**: when `consecutiveErrors > 0`, a small rose badge
  with ⚠ icon and "N error(s)" appears next to the status badge, with a
  tooltip showing the latest error string.
- **Row subtitle**: when the account has an error, the error message is
  appended in rose text (e.g. "· invalid API key").
- **Latency Monitor card**: each latency row now shows a small rose pill
  with the error count when `consecutiveErrors > 0`, plus an "err X ago"
  sublabel under the "sync X ago" line. Hover shows the time of the last
  error. The existing latency color bands remain unchanged (emerald/sky/
  amber/rose by ms).
- **SSE overlay**: the `useTradingEvents` hook (web) now accepts
  `consecutiveErrors` and `lastErrorAt` in its `LiveAccount` shape and
  merges them into `accountsWithLive`, so they update live between polls.

### 4. Metrics

- New counter `bri.sync.failed{broker}` emitted when `syncAccountFromConnector`
  sees `!result.ok`, complementing the existing `bri.sync.latency_ms` timing
  and `crypto.sync.failed` counter.
- Connect failure path continues to emit `crypto.connect.failed`/
  `bri.accounts.connected`.

## Files changed

Backend:
- `packages/shared/src/brokerIntegration.ts` — added optional
  `consecutiveErrors`, `lastErrorAt` fields on `BrokerAccount`.
- `apps/api/src/tradingIntel/crypto/base-crypto-connector.ts` — added
  `sessionErrors` map, resetErrorCounter(), emitState increments errors on
  error frames and fans them out via SSE with `consecutiveErrors`/
  `lastErrorAt`; sync() calls `resetErrorCounter` after successful sync.
- `apps/api/src/tradingIntel/mt5/mt5-connector.ts` — emitState now increments
  `state.consecutiveErrors`, sets `lastErrorAt`, and emits both over SSE.
- `apps/api/src/tradingIntel/brokerIntegration.service.ts` — connect and
  sync failure branches increment `rec.consecutiveErrors`, set `lastErrorAt`;
  success branches reset to 0; sync failure path now emits
  `Metrics.counter("bri.sync.failed")`.
- `apps/api/src/tradingIntel/trading-events.ts` — widened the
  `account_state` data type to include `consecutiveErrors?`, `lastErrorAt?`.

Web:
- `apps/web/src/lib/brokerIntegration.ts` — added `consecutiveErrors`,
  `lastErrorAt` to the client-side `BrokerAccount` type.
- `apps/web/src/lib/tradingEvents.ts` — added fields to `LiveAccount`,
  parsed them from incoming `account_state` SSE frames.
- `apps/web/src/pages/trading/TradingDashboardPage.tsx` — added `syncAccount`
  callback, circular-refresh Sync button per account row, error pill +
  error subtitle, merged `consecutiveErrors`/`lastErrorAt` into
  `accountsWithLive`, Latency Monitor rows now show error count pill +
  "err X ago" sublabel.

Tests:
- `apps/api/src/tradingIntel/crypto/crypto-phase17-sync-errors.test.ts`
  (2 new tests):
  1. `emitState` increments `consecutiveErrors` on successive error calls
     and `resetErrorCounter` clears it.
  2. SSE payload contains `consecutiveErrors`, `lastErrorAt`, increments on
     repeated errors, and resets to 0 after an `emitState(_, "connected")`
     success call. Uses a unique per-test OID to avoid cross-test listener
     pollution.

## Test results

- 17 crypto test files / **76 tests passing** (2 new vs Phase 16).
- Full suite: **1900 passing** (up from 1899; note: some run-to-run jitter
  around the 1899–1900 boundary due to a pre-existing test ordering quirk;
  the only actual failures are the 8 pre-existing Prisma-WASM + 1 geoBilling
  Prisma errors, all out of scope).
- `tsc --noEmit` clean on trading/crypto/web paths.
- Web production build clean.

## UX notes

- The per-account Sync button is intentionally small (icon-only, ghost
  variant) so it doesn't compete with the global Refresh, Pause AI, and Kill
  Switch controls.
- Spinners only appear on the account being synced; other accounts retain
  their state so the UI never looks "frozen" during a refresh.
- Error counters are bounded to integer increments and reset aggressively
  (any successful sync clears them) so a single transient blip doesn't
  leave a stale warning in the UI.
- The rose error pill on the Latency Monitor is styled consistently with
  existing rose latency coloring (>1500 ms latency) for visual hierarchy.
