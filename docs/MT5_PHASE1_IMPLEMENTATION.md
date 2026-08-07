# WINDELS AI OS — MetaTrader 5 (MT5) Connector — Phase 1

This document describes the production MT5 broker integration shipped in Phase 1 of the
unified trading connector work. Subsequent phases (MQL5 Expert Advisor, Deterministic
Simulator, Dashboard) build on the foundation here.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                       WINDELS AI OS (Node.js API)                    │
│                                                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐  │
│  │ AI Trading   │   │ Risk Engine  │   │ Trade Execution Supervisor│  │
│  │ Intelligence │   │              │   │ (kill-switch, mode,      │  │
│  │ (agents /    │   │ (position /  │   │  margin, duplicates,     │  │
│  │  strategies) │   │  exposure)   │   │  global read-only)       │  │
│  └──────┬───────┘   └──────┬───────┘   └────────────┬─────────────┘  │
│         │                  │                        │                │
│         ▼                  ▼                        ▼                │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │              BrokerIntegrationService  (Redis-backed)         │    │
│  │      accounts, positions, orders, executions, audit, sync    │    │
│  └─────────────────────────┬────────────────────────────────────┘    │
│                            │                                         │
│                            ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                Connector Registry  (IBrokerConnector)        │    │
│  │  MT5  │  (future: MT4, cTrader, Binance, Bybit, IBKR, …)    │    │
│  └────┬─────────────────────────────────────────────────────────┘    │
│       │  transport (pluggable)                                      │
│       ├──────── ZeroMQ REQ/PUB ──► Python MT5 bridge (out-of-proc)  │
│       ├──────── HTTP/SSE ──────► Python MT5 bridge (fallback)      │
│       └──────── HTTPS/WSS ──────► MetaApi cloud (no local MT5)     │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
                   ┌────────────────────────┐
                   │   MetaTrader 5 terminal│
                   │  (Windows or Wine)     │
                   └────────────────────────┘
```

## Three transports

| Transport         | Use case                                 | Requires           | Latency |
|-------------------|------------------------------------------|--------------------|---------|
| `native_python_zmq` | Lowest-latency production (default)    | MT5 terminal + Python bridge (pyzmq) | < 5 ms |
| `http_bridge`       | Easier deploy / firewalled hosts       | MT5 terminal + Python bridge (no zmq) | 10–30 ms |
| `metaapi_cloud`     | Cloud, no local terminal, easy dev     | MetaApi token       | 50–200 ms |

Each transport is selected per account via `connectorConfig` or via environment
variables (`WINDELS_MT5_BRIDGE_ZMQ`, `WINDELS_MT5_BRIDGE_HTTP`, `WINDELS_METAAPI_TOKEN`).
Transports share one `IBrokerConnector` surface — switching transport is a
config change, not a code change.

## Python bridge (scripts/mt5-bridge/bridge.py)

The Python sidecar runs on the same host as the MT5 terminal (natively on Windows, or
on Linux + Wine). It uses the official `MetaTrader5` pip package and exposes MT5 over
either ZeroMQ (REQ/REP for RPC, PUB/SUB for ticks) or HTTP+SSE.

### Install (on the terminal host)

```powershell
# Windows
python -m venv .venv
.venv\Scripts\activate
pip install -r scripts/mt5-bridge/requirements.txt
# (on a Linux+Wine host you also need MetaTrader5 installed under Wine)
```

### Run

```bash
# ZeroMQ mode (recommended)
python scripts/mt5-bridge/bridge.py --rpc 5555 --pub 5556 --token <shared-secret>

# HTTP/SSE mode
python scripts/mt5-bridge/bridge.py --http 8765 --token <shared-secret>
```

The bridge is multi-account: the Node.js side sends `connect_account` RPCs with
login/password/server and the bridge handles MT5.initialize/login lifecycle
per (login, server) tuple. Tick subscriptions are multiplexed on a single PUB/SSE
stream, framed with `tick/<accountId>/<symbol>` topics.

## Configuration

Set in `.env` (see `.env.example`):

| Variable | Purpose |
|----------|---------|
| `WINDELS_MT5_BRIDGE_ZMQ` | ZMQ REQ endpoint, e.g. `tcp://127.0.0.1:5555`. Ticks are on port +1. |
| `WINDELS_MT5_BRIDGE_HTTP` | HTTP base URL, e.g. `http://127.0.0.1:8765`. |
| `WINDELS_MT5_BRIDGE_TOKEN` | Shared bearer token for bridge auth (recommended). |
| `WINDELS_MT5_TERMINAL_PATH` | Path to `terminal64.exe` (used to auto-launch terminals). |
| `WINDELS_METAAPI_TOKEN` | MetaApi cloud token. Set this to enable cloud mode globally. |
| `WINDELS_METAAPI_REGION` | MetaApi region (default `new-york`). |
| `WINDELS_MT5_GLOBAL_READONLY` | Hard global kill-switch: when `true` all MT5 order send/modify/close are refused. |

Per-account `connectorConfig` (at account-create time) can override any of these
(e.g. per-account `bridgeEndpoint`, `metaapiToken`, `readOnly`, `allowedSymbols`,
`deniedSymbols`, `tickStream`, `syncIntervalMs`).

## Security & governance hard-gates

Every order passes through **all** of these gates in order before touching a connector:

1. `WINDELS_MT5_GLOBAL_READONLY` (hard env kill-switch) — global override.
2. Kill switch (per-org risk control).
3. Trading mode permission:
   - `analysis_only`: orders always blocked (analysis & signals only).
   - `assisted`: orders block until human approval (`POST /brokers/executions/:id/approve`).
   - `semi_autonomous`: orders execute within configured risk rules, blocked on hard failures.
   - `fully_autonomous`: orders execute within risk limits; kill switch still stops everything.
4. Broker connectivity (connected = live; else paper/simulation).
5. Position size limit, session window, max exposure/drawdown/leverage.
6. Duplicate-order prevention (60-second cooldown on identical signals).
7. `allowedSymbols` / `deniedSymbols` gate (per-account).
8. `connectorConfig.readOnly` (per-account read-only).

Credentials are encrypted at rest via AES-256-GCM (the existing
`security/encryption.ts` envelope); the bridge never sees credentials on disk and
they are never logged.

## Synchronization

On `connect` the connector does a full pull:

- Account info (balance, equity, margin, free margin, profit, margin level, credit,
  leverage, currency, trade/expert permissions).
- Symbols (all visible symbols, digits, point, contract size, volume min/max/step,
  bid/ask, spread, trade mode).
- Open positions (ticket, symbol, side, volume, prices, SL/TP, profit, swap,
  commission, open time, comment, magic).
- Pending orders (ticket, symbol, type, volume, open/expiry time, price, SL/TP).
- Trade history (deals over configured window, default 30 days).

After connect, a periodic sync (default 5 s) refreshes account/positions/orders.
Symbols are refreshed on demand; tick stream updates symbol bid/ask live. Sync
state is exposed via `GET /brokers/accounts/:id/health`.

## Streaming ticks

- Server → browser: `GET /brokers/accounts/:id/ticks/stream?symbols=EURUSD,XAUUSD`
  returns SSE.
- The connector subscribes to the bridge once and fans out to all SSE clients.
- Tick-stream stalls (> 60 s) raise a `tick_stream_stall` audit event which the
  monitor surfaces for health alerts.

## HTTP API surface (added/updated)

| Method | Path | Purpose |
|--------|------|---------|
| GET    | `/brokers/connectors`             | Catalog + live availability. |
| POST   | `/brokers/accounts`               | Create broker account record (creds encrypted). |
| POST   | `/brokers/accounts/:id/connect`   | Connect via chosen transport. |
| POST   | `/brokers/accounts/:id/disconnect`| Disconnect. |
| POST   | `/brokers/accounts/:id/sync`      | On-demand sync (scope selectable). |
| GET    | `/brokers/accounts/:id/health`    | Connector health + sync state. |
| GET    | `/brokers/accounts/:id/positions` | Synced positions. |
| GET    | `/brokers/accounts/:id/orders`    | Synced pending orders. |
| GET    | `/brokers/accounts/:id/symbols`   | Synced symbol metadata. |
| GET    | `/brokers/accounts/:id/deals`     | Closed-trade history. |
| GET    | `/brokers/accounts/:id/candles`   | OHLCV history (M1..MN1). |
| POST   | `/brokers/accounts/:id/orders`    | Direct order send (passes supervisor). |
| POST   | `/brokers/accounts/:id/positions/:ticket/close`  | Close position. |
| PATCH  | `/brokers/accounts/:id/positions/:ticket`        | Modify SL/TP. |
| POST   | `/brokers/trade`                  | AI/manual signal (full supervisor path). |
| GET    | `/brokers/executions`             | Execution log (audit). |
| POST   | `/brokers/executions/:id/approve` | Approve (assisted mode). |
| POST   | `/brokers/executions/:id/reject`  | Reject (assisted mode). |
| GET    | `/brokers/audit`                  | Structured audit trail from Mt5Monitor. |
| GET    | `/brokers/command-center`         | Aggregate dashboard. |
| GET    | `/brokers/accounts/:id/ticks/stream` | SSE tick stream. |

## Cross-module integration

- **AI Trading Intelligence** (Session 81): signals flow through existing indicator /
  risk / agent pipeline; the connector is the execution sink.
- **AI Workforce**: 6 broker-specific agents are routable — trade-execution-supervisor,
  strategy-optimizer, portfolio-risk, broker-connectivity, trade-validator,
  trading-compliance.
- **Kernel**: every connect/disconnect/sync/order/fill/block/error emits a Kernel event
  on domain `trading.mt5` with severity (low/medium/high).
- **Notifications**: audit events feed the alerting subsystem (stalled streams,
  disconnects, risk blocks, failed orders).
- **Billing**: order dispatches and bridge RPCs are metered (`bri.orders.dispatched`
  counter, `bri.sync.latency_ms` histogram) for chargeback in Session 100 FinOps.
- **Memory Fabric / Knowledge Graph**: execution records and audit events are
  append-only Redis structures that the memory and knowledge subsystems can index.
- **Audit**: Mt5Monitor writes up to 500 structured events per org in Redis lists
  (`mt5:<oid>:audit`) with exact latency, transport, and decision per action.

## Monitoring & health

Mt5Monitor runs every 15 s:

- Probes all MT5 accounts across every org.
- Emits per-account health records (TTL 300 s).
- Detects tick-stream stalls and raises audit events.
- Maintains active/error gauges (`mt5:connections:active`, `mt5:connections:error`).
- Tracks reconnect attempts, consecutive errors, and last latency per account.

The Python bridge exposes `/healthz` (HTTP mode) and responds to `ping` RPC (ZMQ)
for uptime + MT5 availability probing.

## Error recovery

- Transient RPC/network errors: per-call timeout (15 s default) + exponential backoff
  reconnect (base 2 s, cap 30 s).
- Per-account state tracks `consecutiveErrors`; ≥ 3 flips the account to `error`
  status and triggers audit events.
- Bridge process death: transport detects disconnect (socket hang-up / EOF),
  attempts reconnect; account state is marked `reconnecting` and periodic sync
  pauses until connection resumes.
- Fill confirmation: after `send_order` resolves, a sync fires 1.5 s later to
  capture the resulting fill/position state from MT5 (single source of truth is
  always the broker, never our cache).

## Tests

```bash
# MT5 connector + broker integration tests
cd apps/api
WINDELS_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
  npx vitest run src/tradingIntel/
```

All 121 trading-intel tests pass. The new MT5 test file uses an in-process
deterministic `FakeMt5Transport` so tests run without any MT5 terminal, MetaApi
keys, or network access — no Math.random(), no seeded demo data, no placeholders.

## What is NOT in Phase 1

Per your ordering:

- **MQL5 Expert Advisor** (Phase 2) — the Python bridge does not run inside the MT5
  terminal; Phase 2 ships a native MQL5 EA for signal pull / execution push.
- **Deterministic simulator** (Phase 3) — built on the same IBrokerConnector but
  with local order-matching; not yet present.
- **Trading Dashboard UI** (Phase 4) — routes are complete; React UI for
  `/app/trading` is the last phase.
- **Crypto / traditional-market connectors** — catalog slots are reserved for
  Binance, Bybit, OKX, Coinbase, Kraken, KuCoin, Bitget, Gate.io, MEXC, HTX,
  Crypto.com, Hyperliquid, Interactive Brokers, Alpaca, TradeStation, OANDA, IG,
  cTrader, MT4, FIX, REST, WebSocket; connectors arrive in their own phases.

Phase 1 completes the hard foundation: real transport, real security model, real
sync, real monitoring/audit, real multi-account support, and a test suite that
exercises every gate without requiring a live terminal.
