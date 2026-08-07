# WINDELS AI OS — Trading Architecture Guardrails

**WINDELS AI OS is an Enterprise AI Trading Agent and Trading Intelligence
Platform — NOT a broker, NOT an exchange, NOT a custodian, NOT a dealing desk,
NOT a liquidity provider, NOT a market maker, NOT an execution venue.**

Every line of trading code MUST respect these guardrails. CI review should
reject PRs that violate them.

## What WINDELS does

- Connects securely to the user's own broker/exchange account via official APIs.
- Analyzes markets using the AI Trading Intelligence Engine.
- Generates trading opportunities using the AI Strategy Engine.
- Calculates risk via the AI Risk Management Engine.
- Presents opportunities to the user in the configured trading mode
  (analysis only / assisted / semi-autonomous / fully autonomous).
- With authorization, forwards trade orders through the external broker's API.
- Synchronizes execution results, balances, positions, and orders back from
  the external broker.
- Monitors and optimizes strategies on an ongoing basis.
- Provides performance analytics, audit trails, governance, and compliance.

## What WINDELS never does

- ❌ Never holds customer funds.
- ❌ Never runs an internal order book.
- ❌ Never matches, fills, or settles trades internally.
- ❌ Never acts as counterparty to any trade.
- ❌ Never provides custody, internal wallets, or clearing.
- ❌ Never operates a "house account" that trades against users.
- ❌ Never acts as a market maker or liquidity provider.
- ❌ Never becomes a broker-dealer or exchange.

## Trading-mode semantics

| Mode               | AI behavior                                                                                  |
|--------------------|----------------------------------------------------------------------------------------------|
| Manual             | Analysis only. User places trades manually at their broker.                                   |
| AI Assisted        | AI recommends trades; user must approve each one before WINDELS forwards to broker.           |
| Semi-Autonomous    | AI executes automatically within user-defined risk parameters; user monitors.                 |
| Fully Autonomous   | AI executes + manages under governance/risk limits; user can pause/disable at any time.      |

In every mode, the order is **sent to the external broker** for execution.
WINDELS never "fills" anything.

## Connector layer

The only code that talks to external providers lives under:
- `apps/api/src/tradingIntel/mt5/` (MT5 via ZMQ bridge / HTTP / MetaApi cloud)
- `apps/api/src/tradingIntel/crypto/exchanges/` (12 crypto exchanges)
- `apps/api/src/tradingIntel/connectors/` (registry + IBrokerConnector interface)

Connectors MAY only:
1. Authenticate with official APIs
2. Retrieve market data
3. Retrieve balances, positions, orders, trades (read-only sync)
4. Submit / modify / cancel orders when authorized
5. Synchronize execution results back into WINDELS
6. Handle API errors and reconnects

Connectors MUST NOT:
- Hold synthetic balances
- Run internal matching
- Simulate fills
- Make pricing decisions (that is an AI/strategy concern, not a connector concern)

## Paper / demo trading

Paper trading uses the **external broker's demo/testnet accounts** (MT5 demo
servers, Binance testnet, Bybit demo, OKX demo, etc.). This way fills, margin,
and slippage come from the broker's real matching engine (just in sandbox
mode) rather than from an internal simulation.

## Strategy backtesting

Backtesting lives in `apps/api/src/tradingIntel/backtest/strategy-backtest.ts`.
It is an **analytical market-data replay tool** for evaluating strategy ideas
offline. It does NOT:
- Connect to the network
- Hold balances
- Implement IBrokerConnector
- Appear as a broker option in the UI

Its outputs (performance reports, equity curves, drawdowns) feed AI evaluation
and the user's strategy-approval workflow only.

## AI / Risk / Workflow reuse

Trading reuses, never duplicates:
- AI Trading Intelligence Engine
- AI Workforce (God-Node orchestration)
- Workflow Engine
- Memory Fabric + Knowledge Graph
- Risk Management Engine
- Audit Logging
- Governance & Compliance
- Security / encryption / credential vault
- Billing & Notifications

## Enforcement

- No `IBrokerConnector` implementation is permitted to implement fill/match/custody logic.
- Code review checks for keywords: internal matching, house account, counterparty, custody, settlement engine.
- `apps/api/src/tradingIntel/backtest/strategy-backtest.ts` is explicitly scoped as an offline analytical tool with no network access and no connector registration.
- Broker accounts in the UI are selected exclusively from the list of real external connectors; no "simulator" option is presented.
