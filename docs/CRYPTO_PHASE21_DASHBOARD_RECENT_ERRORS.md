# Phase 21: Dashboard Recent Errors Panel

> **WINDELS remains an AI TRADING AGENT — never a broker, exchange, custodian, LP, or execution venue.**

## Overview

Phase 21 adds a **Recent Connector Errors** panel to the Trading Dashboard, surfacing per-connector error history from all connected crypto exchange sessions. This gives operators instant visibility into what is failing, where, and why — without digging through logs.

## Components

### 1. Error History Ring Buffer (`base-crypto-connector.ts`)

Every crypto connector (Binance, Bybit, OKX, Kraken, KuCoin, Bitget, Gate.io, MEXC, HTX, Crypto.com, Coinbase, Hyperliquid) inherits a per-account **ring buffer** of up to **50 structured error entries**:

```typescript
interface ConnectorError {
  at: string;       // ISO-8601 timestamp
  message: string;  // Human-readable error message
  category: "rest" | "ws" | "auth" | "sync" | "order" | "rate_limit" | "network" | "unknown";
}
```

- **`pushError(accountId, message, category)`** — appends to the ring buffer, evicting the oldest entry when the buffer exceeds 50.
- **`getRecentErrors(accountId, limit?)`** — returns the last N errors in reverse-chronological order (most recent first).
- **`classifyError(message)`** — auto-classifies error messages into categories using keyword matching:
  - `rate_limit`: "rate limit", "429", "too many requests"
  - `network`: "ECONNREFUSED", "ETIMEDOUT", "fetch failed", "socket hang"
  - `auth`: "auth", "unauthorized", "forbidden", "invalid api", "signature", "401", "403"
  - `order`: "order", "insufficient", "margin", "position", "reject"
  - `ws`: "ws", "websocket", "heartbeat", "ping"
  - `sync`: "sync", "snapshot"
  - `rest`: "http", "status", "response"
  - `unknown`: fallback

### 2. Integration with emitState

The existing `emitState(id, status, error?)` method now:
1. Increments the consecutive-error counter (Phase 17).
2. **Pushes the error to the ring buffer** with auto-classification (Phase 21).
3. Fans out via SSE `account_state` event.

An optional fourth parameter `category` allows callers to override auto-classification:
```typescript
emitState(id, "error", "message", "ws"); // explicit category
```

### 3. Connector Registry Aggregation

`connectorRegistry.aggregateRecentErrors(oid, limitPerAccount?)` iterates all registered connectors, filters accounts by organization ID, and returns:
```typescript
Array<{
  broker: string;      // e.g. "binance"
  label: string;       // e.g. "Binance"
  accountId: string;
  errors: ConnectorError[];
}>
```

Accounts with zero errors are omitted from the result.

### 4. API Endpoints

**`GET /brokers/recent-errors?limit=10`** — Dedicated endpoint returning per-connector error groups.

**`GET /brokers/dashboard`** — Now includes `recentErrorsByConnector` in its response payload alongside the existing `health.recentErrors` count.

### 5. Dashboard UI (`TradingDashboardPage.tsx`)

A new **Recent Connector Errors** card appears below the Connector Health / Latency Monitor section:

- **Table columns**: Time (relative), Connector (label + truncated account ID), Category (color-coded badge), Message (monospace, truncated with tooltip).
- **Color coding** by category:
  - `auth` → rose (critical)
  - `network` → amber
  - `rate_limit` → orange
  - `ws` → sky
  - `order` → violet
  - `rest` → cyan
  - `sync` → indigo
  - `unknown` → slate
- Shows up to 30 most recent errors across all connectors.
- Badge in the card header shows total error count.
- Empty state: "No connector errors recorded this session. ✓"

## Test Coverage (10 new tests)

| Test | What it verifies |
|------|------------------|
| `pushError adds structured errors and getRecentErrors returns them in reverse order` | Ring buffer ordering and structure |
| `ring buffer caps at 50 entries` | Eviction of oldest entries |
| `getRecentErrors with limit returns capped subset` | Limit parameter |
| `getRecentErrors returns empty array for unknown account` | Graceful handling |
| `emitState with error pushes to ring buffer; no error does not` | Integration with emitState |
| `emitState with explicit category overrides auto-classification` | Category override |
| `classifies common error patterns correctly` | 15 classification cases |
| `aggregateRecentErrors gathers errors from all registered connectors for a given org` | Cross-connector aggregation |
| `aggregateRecentErrors filters by organization id` | Org-level isolation |
| `aggregateRecentErrors skips accounts with no errors` | Empty account filtering |

## Test Totals

- **119 crypto tests pass** (109 prior + 10 new Phase 21 tests)
- **TSC clean** (backend + frontend)

## Files Changed

| File | Change |
|------|--------|
| `apps/api/src/tradingIntel/crypto/base-crypto-connector.ts` | Added `ConnectorError` interface, `errorHistory` ring buffer, `pushError()`, `getRecentErrors()`, `classifyError()`, integrated into `emitState()` |
| `apps/api/src/tradingIntel/connectors/broker-connector.ts` | Added optional `getRecentErrors()` to `IBrokerConnector` interface |
| `apps/api/src/tradingIntel/connectors/connector-registry.ts` | Added `aggregateRecentErrors()` method |
| `apps/api/src/tradingIntel/brokerIntegration.service.ts` | Added `recentErrorsByConnector` to dashboard response |
| `apps/api/src/http/routes/brokerIntegration.ts` | Added `GET /brokers/recent-errors` endpoint |
| `apps/web/src/lib/brokerIntegration.ts` | Added `ConnectorErrorEntry`, `ConnectorErrorGroup` types, `recentErrorsByConnector` to `DashboardSummary`, `recentErrors()` API method |
| `apps/web/src/pages/trading/TradingDashboardPage.tsx` | Added Recent Connector Errors panel with categorized error table |
| `apps/api/src/tradingIntel/crypto/crypto-phase21-recent-errors.test.ts` | 10 new tests |

---

*Phase 21 — WINDELS AI OS. WINDELS is an Enterprise AI Trading Agent; all trades execute at the user's external broker/exchange via official APIs.*
