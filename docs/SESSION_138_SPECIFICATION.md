# Session 138 — Trading Intelligence Hardening (Health, Tick, Backtest, PnL, Risk)

**Implements CRITICAL ARCHITECTURE RULE: WINDELS is NOT a broker — MT4/MT5 are external connections.**

## Scope (hardens existing, no duplicates)
- Reuses: `tradingIntel/*` (indicators, risk, marketData, backtest), `brokerIntegration` (41 routes), `trading-events` SSE, `Mt5Monitor`, `TradingCommandCenter`
- Adds 3 new honest endpoints + dashboard hardening:
  1. `GET /brokers/health/detailed` — state machine (CONNECTING/CONNECTED/DEGRADED/DISCONNECTED/AUTH_ERROR/CONFIG_ERROR/MARKET_DATA_ERROR/EXECUTION_UNAVAILABLE)
  2. `POST /brokers/backtest/history` — historical candles + strategy backtest (symbol/timeframe/start/end, labeled BACKTEST)
  3. `GET /brokers/pnl/sparkline` — live PnL sparkline from real deals/positions (LIVE DATA, empty when offline)

## Hardening Details
- **Health:** `health.connected=false` is never hidden. Dashboard now shows amber **MT5 CONNECTION OFFLINE** banner + per-account state badge + config error when `WINDELS_MT4/MT5_BRIDGE_*` missing. Verified via `connectorRegistry.probeAvailability()` + `Mt5Monitor` lastError + env check.
- **Tick:** SSE `GET /brokers/events/stream` and `GET /brokers/accounts/:id/ticks/stream` remain, UI subscribes only when `connected`. When offline, chart shows **MT5 CONNECTION OFFLINE** not simulated ticks.
- **Backtest:** Uses `marketData.getCandles` (CoinGecko for crypto, synthetic flagged `synthetic=true` otherwise) + `BrokerIntegrationService.backtestStrategy` (historical replay). Returns `{candles, backtest, labels: BACKTEST/HISTORICAL}` with metrics (trades, winRate, profitFactor, netPnL, maxDD, avgWin/loss, equityCurve).
- **PnL Sparkline:** Aggregates real `deals` + `positions` equity curve, `GET /brokers/pnl/sparkline?period=1d|7d|30d` → `[{t, equity, balance, floatingPnL, realizedPnL, drawdown}]`. When no account connected → `{points:[], reason:"NO_LIVE_ACCOUNT"}` labeled **LIVE DATA — offline**.
- **Risk:** All trade signals still flow `AI → RiskEngine → approval → MT4/MT5` — blocked trades record `riskChecks` + audit `Mt5Monitor.audit("risk_block")`.
- **Modes:** `analysis_only` (no order), `assisted` (proposal + approval), `fully_autonomous` (requires `killSwitch=false`, risk pass, connected) — enforced in `submitSignal`.
- **Audit:** Every signal/reasoning/approval/order/confirmation/failure is `Mt5Monitor.audit` + `KernelService.dispatch` (existing).

## Honesty
- No fake tick/balance/PnL/connection. Mocks only in tests. UI badges: **LIVE DATA** vs **BACKTEST DATA** vs **HISTORICAL DATA**.
- If bridge unavailable (no env creds), health returns `CONFIGURATION_ERROR` with `reason:"WINDELS_MT4_BRIDGE_* not configured — MT4/MT5 is an external platform, connect your demo account"` and dashboard shows offline banner.
