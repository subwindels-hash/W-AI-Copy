# MT5 Phase 3 — Backtest Engine + Broker Demo Accounts (architecture correction)

## Architectural correction

Earlier Phase 3 shipped an in-process `Mt5Simulator` that acted as an internal
matching engine with synthetic balances and fills. **That design has been removed**
because WINDELS AI OS is NOT a broker, exchange, or custodian:

- WINDELS never holds customer funds.
- WINDELS never matches orders internally.
- WINDELS never acts as counterparty or liquidity provider.
- All trade execution occurs at the user's connected external broker/exchange.

Two correct primitives replace the simulator:

## 1. Strategy Backtest Engine (analytical, not a broker)

`apps/api/src/tradingIntel/backtest/strategy-backtest.ts`

A pure, deterministic, offline market-data replay tool. It is an analytical
aid — used by AI agents and users to evaluate a strategy against historical
candles before enabling it for live trading. It does **not**:

- Hold balances
- Execute orders (all trades are hypothetical entries/exits marked at next open + slippage model)
- Connect to any network
- Implement `IBrokerConnector`
- Appear as a selectable broker in the UI or registry

Outputs: P&L series, drawdown, win rate, Sharpe ratio, max drawdown, trade log,
equity curve. Results feed the Strategy Performance Analytics module only.

## 2. Paper / demo trading via broker demo accounts

For realistic paper trading with live fills (but no real money):

- **MT5**: connect to MT5 demo servers using the same `Mt5Connector` (demo login / investor password). The broker executes fills, manages margin, hosts the order book.
- **Binance**: use Binance testnet (Testnet API keys).
- **Bybit**: use Bybit demo trading.
- **OKX**: use OKX demo trading.
- Other exchanges: each connector respects `environment: "demo"` and selects the exchange's official sandbox/testnet endpoint.

This is the only supported paper-trading path — every fill, margin call,
and slippage comes from the broker's matching engine, not WINDELS.

## Why this matters

Treating AI OS as a broker would:
- Create custody and regulatory exposure the platform is not designed for.
- Produce misleading fills that don't reflect real market impact.
- Break the architectural invariant that WINDELS is an **agent**, not a venue.

All existing MT5/crypto connectors already respect this: every `sendOrder`
call is forwarded to the external broker; every sync pulls state from the
external broker; the AI only observes, analyzes, and forwards requests.
