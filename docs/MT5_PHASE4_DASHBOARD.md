# MT5 Phase 4 — Trading Dashboard

Phase 4 ships a production trading dashboard that ties together the real MT5
connector (Phase 1), the MQL5 Expert Advisor (Phase 2), and the Deterministic
MT5 Simulator (Phase 3) into a single operator UI. The dashboard consumes a
single aggregated rollup endpoint so it renders fast, is honest about
connectivity state, and exposes governor actions (approve/reject pending
signals, toggle the kill switch, revoke EAs) directly.

## Files

| Path | Purpose |
|---|---|
| `apps/api/src/tradingIntel/brokerIntegration.service.ts` | New `dashboard()` rollup aggregator; `commandCenter()` extended with EA health; `round2()` helper. |
| `apps/api/src/http/routes/brokerIntegration.ts` | `GET /api/v1/brokers/dashboard` endpoint (session-auth). |
| `packages/shared/src/brokerIntegration.ts` | `TradingCommandCenter.systemHealth` extended with `eaConnected`/`eaTotal`; `CONNECTOR_TRANSPORTS` does not include internal simulators — WINDELS is an AI agent, not a broker; `BrokerSyncState.status` widened. |
| `apps/web/src/lib/brokerIntegration.ts` | Typed client: full broker-type union (23 brokers), EA transports, typed `DashboardSummary`, `brokerApi.dashboard()`, `brokerApi.eas()`, `brokerApi.revokeEa()`, `brokerApi.connect()`, `brokerApi.disconnect()`, `brokerApi.sync()`, `brokerApi.health()`, `brokerApi.closePosition()`, `brokerApi.modifyPosition()`, `brokerApi.sendOrder()`, `brokerApi.audit()`. |
| `apps/web/src/pages/trading/TradingDashboardPage.tsx` | New page: KPI tiles, accounts panel, EAs panel, positions table, pending orders table, executions + one-click approve/reject, kill switch toggle, connector health, risk-control summary. |
| `apps/web/src/router.tsx` | Route `trading/dashboard` mounted via lazy load. |
| `docs/MT5_PHASE4_DASHBOARD.md` | This file. |

## Endpoint: `GET /api/v1/brokers/dashboard`

Returns one JSON document shaped `{ ok, data: DashboardSummary }`. It is the
single source of truth for the dashboard UI and contains:

| Field | Description |
|---|---|
| `generatedAt` | ISO timestamp server-side. |
| `accounts[]` | Every broker account with live `status`, `transport`, balance, equity, P&L, last sync. |
| `positions[]` | Open positions across all connected accounts. |
| `orders[]` | Pending orders. |
| `executions[]` | Most recent 50 trade executions (includes those awaiting approval). |
| `deals[]` | Closed trades from the last 30 days (used for PnL + win-rate). |
| `strategies[]` | Trading strategies. |
| `eas[]` | Attached MQL5 EAs (connected/last-poll/magic/terminal). |
| `risk` | Current risk controls (daily/weekly/monthly loss %, max position, max drawdown, kill switch, session window, block-news). |
| `portfolio` | Output of `portfolioIntelligence()` (exposure, concentration, diversification, recommendations). |
| `health` | `{ connectedAccounts, totalAccounts, connectedEas, totalEas, recentErrors, uptimePct }`. |
| `pnl` | `{ today, week, month, allTime }` computed from closed deals. |
| `winRate` | `{ day, week }` percentage of out-trades with profit ≥ 0. |
| `connectors[]` | Probed availability of every registered connector (MT5, external exchanges, future brokers). |

Governance: the endpoint is behind session auth, same as the rest of
`/brokers/*`. The kill-switch toggle calls the existing
`POST /brokers/risk/kill-switch`. Approvals call `POST /brokers/executions/:id/approve`.

## Dashboard UI (`/trading/dashboard`)

The page composes:

1. **Header** — title + Kill Switch button (prominent, destructive when armed)
   + manual refresh.
2. **State banners** — errors, and a red banner when the kill switch is
   active.
3. **KPI row 1** — Total Equity, P&L Today (green/red), Win Rate (24h / 7d),
   Gross Exposure.
4. **KPI row 2** — Accounts Online, Attached EAs, Uptime, Recent Errors.
5. **Broker Accounts card** — per-account transport badge
   (`native_python_zmq` / `http_bridge` / `metaapi_cloud` / `ea` /
   `exchange_rest` / `exchange_ws`), status pill, live equity + floating P&L,
   last-sync indicator. (No in-house simulator appears — WINDELS is not a broker.)
6. **Expert Advisors card** — connected/disallowed dot, EA id (mono),
   magic, last poll, revoke button.
7. **Open Positions table** — symbol, side badge, volume, open price,
   current price, SL/TP, live P&L (colored).
8. **Pending Orders table** — symbol, order type, volume, limit/stop price.
9. **Trade Executions table** — every execution across all sources (AI,
   manual, strategy, EA), with status pill, decision note, and one-click
   Approve / Reject buttons on rows in `pending_approval`. Revokes block
   the order through the risk engine; approve routes it to the connector
   / EA exactly as if the user clicked Approve in the Command
   Center.
10. **Connector Health + Risk summary** — badges for every registered
    connector (ready / unavailable) plus a grid of current risk ceilings.

## Honest-state rules

- Numbers come directly from the broker/EA via the service layer;
  the dashboard never invents prices or balances.
- When a connector is unavailable the status pill shows `disconnected` or
  `error` in red; positions/orders from the last sync remain visible with
  their `lastSyncAt` timestamp so the operator knows they may be stale.
- The kill switch button reflects `risk.killSwitch`; toggling it flips the
  global hard stop (which is enforced server-side for every execution
  path: live connector, EA, and crypto exchanges).
- Pending approvals are highlighted with an amber badge and require an
  explicit click — no auto-approval.
- EA-connected accounts show `transport: "ea"`; 
  
  operators can tell paper/demo from real money at a glance.

## Tests & build

- Server trading-intel suite: **139 tests passing** (8 EA, 13 BRI, 19 MT5
  connector,  indicators/derivatives/risk/market-data).
- `pnpm --filter @windels/web typecheck` passes with zero errors.
- `pnpm --filter @windels/web build` completes successfully (the new page
  ships as `TradingDashboardPage-*.js` in the web bundle).

## Navigation

The dashboard is mounted at `/trading/dashboard`; the existing Command
Center (`/trading/brokers`) remains available for account setup, strategy
configuration, and deep per-account actions (connect/disconnect/sync,
close/modify individual positions, manual order entry, agent runs).
Dashboard is the operator's at-a-glance surface; Command Center is the
deep-configuration surface.

## Phase 4 certification checklist

- [x] Aggregated dashboard endpoint returns honest live data (no mock, no placeholder).
- [x] All three execution paths (live MT5, EA) surface through the same UI.
- [x] Kill switch wired through to server-side enforcement.
- [x] One-click approve/reject for `pending_approval` executions.
- [x] EA list + revoke control.
- [x] PnL windows (today/week/month/all-time) from real deal history.
- [x] Win-rate computed from closed trades (24h / 7d).
- [x] Connector availability badges reflect live probe results.
- [x] Web client build + typecheck green; trading-intel tests green.
- [x] Docs updated.
