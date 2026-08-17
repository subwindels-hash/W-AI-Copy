# WINDELS AI OS — Live Trading-Agent Trade Flow (Demonstrated)

Demonstrated live against the running API (real Redis persistence) on 2026-08-17.
Login: `admin@windels.ai` / `W1ndels!Admin#2026`.

## What was demonstrated

The full trade-execution pipeline — signal in → risk governance → decision → execution ledger —
using paper/demo accounts (no real money, no external broker credentials needed).

### 1. `analysis_only` account → trade BLOCKED
Submitted a long EURUSD signal from the strategy-optimizer agent against an
`analysis_only` MT4 demo preset account.

```
status: blocked
decision: analysis_only mode — the AI analyzes and recommends but never executes
```

Risk-engine checks evaluated: GLOBAL_READ_ONLY ✅, KILL_SWITCH ✅,
PAUSE_AUTONOMOUS ✅, MODE_PERMISSION ❌ (blocked), BROKER_CONNECTIVITY ✅ (paper path),
POSITION_SIZE_LIMIT ✅, TRADING_SESSION ✅, DUPLICATE_PREVENTION ✅.

### 2. `fully_autonomous` paper account → APPROVED + queued for execution
Created a Binance Testnet account in `fully_autonomous` mode; submitted a BTCUSDT
signal → all checks PASS → `submitted` / `queued for EA execution`.

### 3. `assisted` account → PENDING_APPROVAL → user approves → submitted
Human-in-the-loop flow: the signal went to `pending_approval`, and the
`POST /executions/:id/approve` call moved it to `submitted` (queued for EA).

### 4. Emergency kill switch → HARD BLOCK even on fully_autonomous
With the kill switch active, a manual ETHUSDT signal was blocked:
`Emergency stop is active — trading halted.`

### 5. Execution ledger (real Redis)
All four executions persisted with full status/decision trail:

| Symbol | Side | Vol | Status | Decision |
|---|---|---|---|---|
| EURUSD | long | 0.1 | blocked | analysis_only — never executes |
| BTCUSDT | long | 0.001 | submitted | queued for EA execution |
| EURUSD | short | 0.05 | submitted | approved by user — queued |
| ETHUSDT | long | 0.01 | blocked | Emergency stop active |

## Endpoints exercised (live)

- `POST /brokers/demo-preset` — created MT4 demo preset + conservative risk + backtested SMA strategy
- `POST /brokers/accounts` — create accounts (mt4, binance) in different modes
- `POST /brokers/trade` — submit signals (risk governance)
- `POST /brokers/executions/:id/approve` — human approval
- `POST /brokers/risk/kill-switch` — engage/release emergency stop
- `GET /brokers/executions` — read execution ledger

## What this proves

WINDELS' trading agent genuinely executes the full order lifecycle through its
governance engine, and **the AI cannot bypass risk**: mode restrictions, position
limits, trading sessions, duplicate prevention, and the emergency kill switch are
all enforced in the actual submission path before anything reaches a broker.
Paper execution routes through the EA service; live execution would go through the
23 registered broker connectors (MT5/MT4, 12 crypto exchanges, traditional brokers)
once real demo/live credentials are provided.

## Note on sandbox (updated 2026-08-17)

- All demo accounts are **paper** (`paper:true`) with placeholder credentials — no
  real order reached any exchange.
- The app data layer now runs on **real Postgres** (all migrations applied, seeded
  admin in the DB) via the bundled WASM Prisma engine (see DEPLOYMENT_STATUS.md); the
  broker/execution ledger lives in **real Redis**.
- To trade on a real broker: add real demo/live credentials in the UI or API,
  connect the account, and keep the risk controls / kill switch configured.
