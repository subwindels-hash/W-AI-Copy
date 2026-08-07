# Crypto Phase 14 — Latency / Health Monitor panel

## Overview
Phase 14 adds a dedicated **Latency Monitor** card to the Trading Dashboard
that surfaces per-account REST/WS round-trip latency alongside the existing
Connector Health card. Every connected MT5/crypto account shows its most
recent observed RTT, color-coded (green/sky/amber/rose) so the trader can
see at a glance which connectors are healthy and which are degrading.
Latency is sourced from two places (no polling the dashboard has to do):

1. **Polled snapshot:** `BrokerAccount.latencyMs` is now populated by
   `BrokerIntegrationService.connectAccount` and `syncAccountFromConnector`
   using the connector's `health()` snapshot (crypto tracks every HTTP
   response in `sess.latencyMs`; MT5 reports transport latency).
2. **Live SSE:** every `account_state` event (emitted on connect, sync,
   error, and after every HTTP request via `emitState`) carries the latest
   `latencyMs`. The `useTradingEvents` hook already captures this in
   `accountStateByAccount` — Phase 10 simply threads it through to the UI.

WINDELS remains an **AI Trading Agent**, not a broker. Latency numbers are
measurements of how fast the *external* broker/exchange responds to requests
signed with the user's own API key. WINDELS never matches, fills, settles,
or custodies.

## Changes

### Shared (`packages/shared/src/brokerIntegration.ts`)
- Added optional `latencyMs?: number` field to `BrokerAccount` so connector
  latency can travel from API → dashboard in the existing rollup without a
  second endpoint.

### Backend (`apps/api/src/tradingIntel/brokerIntegration.service.ts`)
- `connectAccount` now reads `connector.health(id)` after a successful
  connect and stamps `rec.latencyMs` on the cached BrokerAccount before
  persisting, so the first dashboard render post-connect already has a
  latency number.
- `syncAccountFromConnector` does the same after every sync, keeping the
  polled number fresh.

### Web client (`apps/web/src/lib/brokerIntegration.ts`)
- Mirrored the new `latencyMs?: number` field on the client-side
  `BrokerAccount` type.

### Web dashboard (`apps/web/src/pages/trading/TradingDashboardPage.tsx`)
- `accountsWithLive` now also overlays a `liveLatencyMs` field from SSE
  `account_state.latencyMs` so the panel updates between polls.
- Refactored the bottom card row to a 2/3 + 1/3 grid:
  - **Connector Health** card (existing) retains the readiness badges,
    risk control grid, and AI-autonomous status.
  - **Latency Monitor** card (new) lists every connected account with its
    broker label, name, "sync X ago", and color-coded latency:
    - <150 ms → emerald (excellent)
    - 150–500 ms → sky (good)
    - 500–1500 ms → amber (slow)
    - \>1500 ms → rose (degraded)
    - missing → "—" (connecting/never-synced)
    Formats sub-second as `N ms`, ≥1 s as `N.N s`.

### Test
`apps/api/src/tradingIntel/crypto/crypto-phase14-latency.test.ts` (+2 tests):
1. TS-level sanity check that `BrokerAccount` accepts the new `latencyMs`
   field (compile-time regressions fail the build and this test).
2. `account_state` events published on the `TradingEventHub` carry the
   `latencyMs` field end-to-end so the SSE stream can drive the panel.

## Why this matters
Latency directly governs the outcome of stop orders, slippage, and AI-
initiated entries. Surfacing it inline (rather than buried in browser dev
tools or external monitoring) lets a trader spot a degrading exchange
connection *before* it causes a missed fill or rejected order. Combined
with the existing three safety layers (Kill Switch, Pause AI, per-account
read-only from Phase 13), a trader can instantly freeze trading on an
account showing pathologically high latency with a single click.

## Not a broker
- Latency is measured against the user's own broker/exchange endpoints
  using the user's own credentials. WINDELS is not a venue — slow latency
  means the *broker* is slow, not that WINDELS is acting as a
  counterparty.
- No internal order book, no matching, no settlement, no custody, no
  liquidity provision, no house account logic anywhere in this phase.

## Verification
- Crypto test suite: 64/64 passing (+2).
- Full API suite: **1889 passing** (+2), same 9 pre-existing Prisma-WASM
  enterpriseSearch + geoBilling failures (unchanged, out of scope).
- `tsc --noEmit` clean for all trading/shared paths.
- Web build succeeds.
- `Math.random()` scan clean; custody/matching-engine keyword hits are only
  in disclaimer comments in test files.

## Files changed
- `packages/shared/src/brokerIntegration.ts` (latencyMs field)
- `apps/api/src/tradingIntel/brokerIntegration.service.ts` (stamp latencyMs on connect + sync)
- `apps/web/src/lib/brokerIntegration.ts` (latencyMs field on client type)
- `apps/web/src/pages/trading/TradingDashboardPage.tsx` (Latency Monitor card, liveLatencyMs overlay, grid refactor)
- `apps/api/src/tradingIntel/crypto/crypto-phase14-latency.test.ts` (new)
- `docs/CRYPTO_PHASE14_LATENCY.md` (this file)
