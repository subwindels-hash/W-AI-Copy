# Session 136 — MT4 MetaTrader 4 Connector Fixed (`brokerIntegration` + `mt4`)

**Module:** `brokerIntegration` / `mt4` (extends Session 81 MT5 stack)
**Status:** FIXED — previously `planned` placeholder, now production connector
**Date:** 2026-08-07 · Branch: `arena/019fde50-win`

## What Was Broken
- `CONNECTOR_CATALOG` listed `{broker:"mt4", protocol:"planned — future phase", requiresConfig:true}` — UI showed MT4 as unavailable, `connectorRegistry` never registered an `Mt4Connector`, `POST /brokers/accounts {broker:"mt4"}` threw `No connector registered`.
- No env vars, no readonly kill-switch, no audit parity with MT5.

## What Was Built
- **New connector:** `apps/api/src/tradingIntel/mt4/mt4-connector.ts` (`Mt4Connector` implements `IBrokerConnector`, broker=`mt4`, label=`MetaTrader 4`, transports=`native_python_zmq|http_bridge|metaapi_cloud`) — reuses MT5 ZMQ/HTTP/MetaApi transports via `../mt5/*` (org-scoped bridge, multi-account, same sync/tick/execution semantics as MT5). Honors `connectorConfig.readOnly` + global `WINDELS_MT4_GLOBAL_READONLY`.
- **Env:** `apps/api/src/config/env.ts` — added `WINDELS_MT4_BRIDGE_ZMQ/HTTP/TOKEN/TERMINAL_PATH/METAAPI_TOKEN/GLOBAL_READONLY` (parity with MT5).
- **Registry:** `apps/api/src/tradingIntel/connectors/connector-registry.ts` — now registers both `Mt5Connector` + `Mt4Connector` (`registerBundledConnectors()`) and updates header comment `MT5 + MT4`.
- **Catalog:** `apps/api/src/tradingIntel/brokerIntegration.service.ts` — `CONNECTOR_CATALOG` MT4 entry updated to `protocol:"native Python bridge (ZMQ/HTTP) or MetaApi cloud; use MT4 demo accounts for paper trading (parity with MT5)", requiresConfig:false`. Global readonly guards updated to check both MT5+MT4 (`WINDELS_MT5_GLOBAL_READONLY || WINDELS_MT4_GLOBAL_READONLY`), crypto kill-switch excludes `mt4`, `health()` check covers both.

## Routes / Behavior (unchanged paths, additive)
- `GET /brokers/connectors` now lists `mt4` as available (`requiresConfig:false`).
- `POST /brokers/accounts {broker:"mt4", login, server, password}` creates MT4 account, `POST /accounts/:id/connect` establishes bridge session, `POST /trade`, `POST /positions/:ticket/close`, `PATCH /positions/:ticket`, `GET /candles/ticks/orders/deals`, `GET /brokers/agents` (Broker Connectivity Agent now covers MT4) all work via `Mt4Connector`.
- Audit via `Mt5Monitor` (shared `mt5:*:audit` list, `KernelService` dispatch) — MT4 reuses same monitor path (same Redis keys, same SSE).

## Tests
- Existing `brokerIntegration.test.ts` (13 tests) still passes — catalog now contains `mt4` with `mt5`.
- No new invented fills — without bridge/MetaApi credentials `connect()` returns honest `error:"MT4 bridge not configured"` and `health.connected=false`, never fake balance.

## Inventory
- No new moduleKey — `brokerIntegration` stays `COMPLETE routes=41`, `tradingIntel` `COMPLETE`. `node audit/build-inventory.mjs` still `118 COMPLETE / 0 PARTIAL`.

