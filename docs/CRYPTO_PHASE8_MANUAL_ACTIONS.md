# Crypto Phase 8 — Manual Action Buttons (Close Position / Cancel Order)

WINDELS is an **Enterprise AI Trading Agent / Trading Intelligence Platform** —
NOT a broker, exchange, custodian, or execution venue. The new action buttons
only send official cancel / close-position requests to the user's external
broker/exchange via the official APIs. WINDELS never closes or cancels against
an internal book.

## What Phase 8 delivers

Phase 7 made the dashboard reflect connector health in real time. Phase 8
adds in-dashboard manual-action buttons so a trader can close a position or
cancel a pending order **directly from the dashboard** without leaving for the
broker terminal.

### Capabilities

| Action | Surface | Backend path | Respects read-only / kill switch? |
|---|---|---|---|
| **Close position** (market order flattening the position) | Open Positions table, per-row ✕ button (rose X icon) | `POST /brokers/accounts/:id/positions/:ticket/close` (already existed) | ✅ |
| **Cancel pending order** | Pending Orders table, per-row ✕ button (amber X icon) | `POST /brokers/accounts/:id/orders/:orderId/cancel` (**new**) | ✅ |

### Files changed

| File | Change |
|---|---|
| `apps/api/src/tradingIntel/brokerIntegration.service.ts` | New `cancelOrder(oid, userId, accountId, orderId)`: locates the pending order, creates a TradeExecution audit record with `source:"manual-cancel"`, dispatches to `connector.cancelOrder()` if the connector implements it (crypto connectors already did via `cancelOrderImpl`/`cancelOrder?`; MT5 now also supports it), returns the resulting `TradeExecution`. Blocks if account not connected, global read-only is active, or pause/kill switch blocks manual actions. |
| `apps/api/src/http/routes/brokerIntegration.ts` | New route `POST /brokers/accounts/:id/orders/:orderId/cancel` — validates params and delegates to `BrokerIntegrationService.cancelOrder`. |
| `apps/api/src/tradingIntel/mt5/mt5-connector.ts` | Implements `cancelOrder(accountId, orderId)` over the transport RPC `"cancel_order"`; returns `ok:true` on success, `ok:false` with retcode on failure. |
| `apps/api/src/tradingIntel/mt5/mt5-monitor.ts` | Extended audit-event union with `"order_cancel"` / `"order_cancel_fail"` / `"order_close"` for better audit granularity. |
| `apps/web/src/lib/brokerIntegration.ts` | Added `cancelOrder(id, orderId)` client helper bound to the new endpoint. |
| `apps/web/src/pages/trading/TradingDashboardPage.tsx` | Added Action column to both the Open Positions and Pending Orders tables with per-row ✕ buttons wired to `closePosition()` and `cancelOrder()` handlers. Buttons disable while any action is busy (`Loader2` spinner) and when the Kill Switch is engaged. Handler hooks fall back to the first connected account when a row lacks `accountId` (single-account deployments). |
| `apps/api/src/tradingIntel/crypto/crypto-phase8-manual-actions.test.ts` | 3 unit tests covering prototype presence, MT5 error path, and risk-control default regression. |
| `docs/CRYPTO_PHASE8_MANUAL_ACTIONS.md` | This file. |

### UX details

- Each action is a **ghost-styled icon button** (small, non-intrusive) at the
  right edge of the table row to avoid visual clutter.
- **Positions** get a red X (`text-rose-400`) — close is a risk-reducing
  action that sells out of exposure; using a danger color is appropriate.
- **Orders** get an amber X (`text-amber-400`) — cancel is a neutral action
  (no fill occurs), distinct from position close.
- While an action is in flight the icon swaps to a spinning `Loader2` and the
  row's button is disabled; on success/failure the dashboard refreshes via
  the existing `load()` call so the row disappears immediately if the broker
  confirmed.
- Errors surface via the existing DataBanner error channel.
- The Kill Switch **locks the buttons** (danger override takes precedence).
  Pause AI does **not** lock the buttons, because these are explicit manual
  actions (Pause AI only blocks autonomous/semi-autonomous signals, not the
  human pressing buttons).
- Buttons are also gated by the per-connector `readOnly` config and the
  `WINDELS_CRYPTO_GLOBAL_READONLY` / `WINDELS_MT5_GLOBAL_READONLY` env flags
  at the service layer.

### Order cancellation dispatch

Crypto connectors already implemented an optional `cancelOrder` method
(BaseCryptoConnector defined `cancelOrder?` + `cancelOrderImpl` overridable;
Binance, OKX, Bybit, Bitget, Gate.io, KuCoin, MEXC, HTX, Crypto.com all
implement it). MT5 did not; Phase 8 adds `Mt5Connector.cancelOrder` invoking
the bridge RPC `"cancel_order"` so MT5 (ZMQ/HTTP/MetaApi) supports cancel
from the dashboard as well. Connectors that don't yet support cancel (e.g.
Hyperliquid pending ECDSA, Coinbase advanced) return
`{ok:false, error:"cancelOrder not supported"}` from the default
`cancelOrderImpl`, which surfaces as a failed execution (auditable) but
never crashes.

### Audit trail

Every cancel creates a `TradeExecution` with:

- `status: "blocked"` on success (canonical "pre-fill cancelled" terminal
  state) with `decision: "canceled by user"`
- `status: "failed"` with the connector error on failure
- `source: "manual-cancel"`
- Audited via `Mt5Monitor.audit(..., "order_cancel" | "order_cancel_fail")`

Because the hub already fans `execution` events (Phase 3/5), the new
cancel-flow execution appears on the dashboard's Executions table instantly
over SSE before the next poll.

### Test results

- 1863 API tests (+3 new Phase 8 tests over the Phase 7 count); pre-existing
  8 Prisma-WASM + 1 geoBilling failures unchanged and out of scope.
- Web production build green.
- tsc clean across trading/crypto/dashboard paths.
- No Math.random() introduced.
- No broker/custody/internal-matching logic: all closes/cancels are one-way
  REST/RPC calls into the user's connected broker; WINDELS never originates
  fills or maintains its own book.
