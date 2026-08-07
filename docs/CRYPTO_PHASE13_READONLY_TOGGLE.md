# Crypto Phase 13 — Per-account Read-Only Toggle (dashboard + live propagation)

## Overview
Phase 13 adds a **per-account read-only toggle** to the Trading Dashboard so a
trader can instantly freeze outbound order placement on any broker/exchange
account without disconnecting it or touching the global kill switch. When
read-only is on, no `sendOrder`, `closePosition`, `modifyPosition`, or
`cancelOrder` calls leave WINDELS for that account — market data, account
state, positions, orders, and executions continue to stream in so the user
can still monitor risk and P/L.

WINDELS remains an **AI Trading Agent**, not a broker. This toggle only
blocks outbound API calls the user authorizes; WINDELS never holds funds,
runs an order book, or acts as counterparty.

## Changes

### Backend
- `apps/api/src/tradingIntel/brokerIntegration.service.ts`
  - `updateAccount` previously merged `connectorConfig` shallowly; it still
    does, but now additionally calls `connector._patchSessionConfig(id,
    connectorConfig)` if the connector exposes it, so a live session picks
    up config changes (readOnly, allowedSymbols/deniedSymbols) immediately
    without forcing a reconnect. Errors are logged and non-fatal.
- `apps/api/src/tradingIntel/crypto/base-crypto-connector.ts`
  - Widened `accounts` map from `private` to `protected` so the patch hook
    can look up the live session.
  - Added `_patchSessionConfig(accountId, patch)`: merges `patch` into the
    live session's `opts.config` (preserving `_oid`). The existing
    `sendOrder` read-only gate already checks `a.opts.config?.readOnly`,
    so after patching, the very next order attempt is blocked.
- `apps/api/src/tradingIntel/mt5/mt5-connector.ts`
  - Same `_patchSessionConfig` treatment for MT5 live sessions, so the
    toggle works for MT5 accounts in addition to all 12 crypto exchanges.
  - The existing `sendOrder`/`modifyPosition`/`closePosition`/`cancelOrder`
    checks against `a.opts.config?.readOnly` now take effect instantly.

### Web frontend
- `apps/web/src/lib/brokerIntegration.ts`
  - `brokerApi.updateAccount` signature widened to accept
    `connectorConfig?: { readOnly?: boolean; allowedSymbols?: string[];
    deniedSymbols?: string[] }` so the toggle can PATCH through the existing
    route (no new endpoint required).
- `apps/web/src/pages/trading/TradingDashboardPage.tsx`
  - Added a `toggleAccountReadOnly(id, ro)` callback that PATCHes the
    account's `connectorConfig.readOnly` flag and refreshes the dashboard.
  - Broker Accounts card: each row now shows an amber **"🔒 read-only"**
    badge and an Eye/EyeOff Switch labelled "Trading enabled" /
    "Locked (no new orders)". Switch disables while a busy action is
    running and on the global kill-switch busy state. The switch uses the
    existing `ui/Switch` component.
  - Imports added for `Eye`, `EyeOff`, `Lock` icons and the `Switch` component.
- `apps/web/src/components/ui/Switch.tsx`
  - `label` prop widened from `string` to `ReactNode` so labels can include
    icons (Eye/EyeOff + text). Added `select-none` to avoid accidental text
    selection on toggle clicks.

### Test
`apps/api/src/tradingIntel/crypto/crypto-phase13-readonly-toggle.test.ts`
(2 tests):
1. `_patchSessionConfig` merges the patch into the live session, preserves
   `_oid` (critical for org-scoped event fan-out) and prior config fields
   such as `allowedSymbols`.
2. After patching `readOnly: true`, `sendOrder` short-circuits at the
   pre-trade gate (returns `ok:false`, error matching `/read-only/`) without
   invoking `http.request`. Before patching, the same order proceeds past
   the gate.

## UX
- Each Broker Account row in the dashboard now has an at-a-glance lock
  indicator and a one-click freeze toggle independent of:
  - The global Kill Switch (which blocks ALL trading including manual),
  - The "Pause AI" button (which blocks only autonomous AI signals).
- Read-only is a **per-account "view-only"** mode: data streams live,
  positions/orders update in real-time (Phase 10), executions from other
  sources still appear, but WINDELS will not send new orders/cancels/
  closes for that account. This is useful for:
  - Freezing one exchange while leaving others active;
  - Auditing a newly-connected API key before enabling writes;
  - Read-only service accounts;
  - Emergency "stop everything on this account" that is softer than the
    global kill switch (which is reserved for true emergencies).

## Not a broker
Read-only mode is a **client-side outbound gate** — it does not affect what
the broker/exchange allows, and it does not custody or match anything. It
exactly mirrors the philosophy enforced throughout the stack: WINDELS is a
trading agent that calls the user's broker APIs when authorized. If not
authorized (readOnly=true, pauseAutonomousTrading=true, killSwitch=true),
it simply doesn't send.

## Verification
- Crypto test suite: 62/62 passing (+2).
- Full API suite: **1887 passing** (+2), same 8 pre-existing Prisma-WASM
  enterpriseSearch + 1 geoBilling Prisma failures (unchanged, out of scope).
- `tsc --noEmit` clean for all trading paths.
- Web build succeeds (Switch label typed as ReactNode; Trading Dashboard
  compiles).
- `Math.random()` scan clean; custody/matching-engine keyword hits are
  only in disclaimers/docs.

## Files changed
- `apps/api/src/tradingIntel/brokerIntegration.service.ts` (live session patch)
- `apps/api/src/tradingIntel/crypto/base-crypto-connector.ts` (_patchSessionConfig, widened visibility)
- `apps/api/src/tradingIntel/mt5/mt5-connector.ts` (_patchSessionConfig, widened visibility)
- `apps/api/src/tradingIntel/crypto/crypto-phase13-readonly-toggle.test.ts` (new)
- `apps/web/src/lib/brokerIntegration.ts` (widened updateAccount signature)
- `apps/web/src/components/ui/Switch.tsx` (ReactNode label, select-none)
- `apps/web/src/pages/trading/TradingDashboardPage.tsx` (per-account Switch + badge)
- `docs/CRYPTO_PHASE13_READONLY_TOGGLE.md` (this file)
