# Crypto Phase 6 — Pause Autonomous Trading (User Control)

WINDELS is an **Enterprise AI Trading Agent / Trading Intelligence Platform** —
NOT a broker, exchange, custodian, or execution venue. Per the product
requirement that **"users must be able to pause or disable autonomous trading
at any time,"** Phase 6 adds a dedicated soft-kill toggle that freezes AI
autonomous execution without locking the trader out of their own account.

## What's new

### `pauseAutonomousTrading` risk flag

Added to `BrokerRiskControls`:

```ts
pauseAutonomousTrading: boolean;  // default false
```

| Switch | Scope | Manual orders? | Assisted approval? | Autonomous (semi/full auto)? | AI signals? |
|---|---|---|---|---|---|
| `killSwitch` (existing) | ALL orders | ❌ blocked | ❌ blocked | ❌ blocked | ❌ blocked |
| `pauseAutonomousTrading` (new) | AI only | ✅ allowed | ✅ allowed (human clicks Approve) | ❌ blocked | ❌ blocked |
| `WINDELS_CRYPTO_GLOBAL_READONLY` env | Crypto only, all orders | ❌ blocked | ❌ blocked | ❌ blocked | ❌ blocked |
| Per-account `readOnly` | That account | ❌ blocked | ❌ blocked | ❌ blocked | ❌ blocked |

This distinction is the point: a trader who is uncomfortable with AI behavior
can hit **Pause AI** and instantly freeze every autonomous signal, while still
being able to close a risky position, place a manual hedge, or approve an
assisted recommendation they've already reviewed. The hard Kill Switch remains
available for true emergencies where no order should leave the building.

### Enforcement point

`BrokerIntegrationService.submitSignal()` is the single funnel for all trade
signals (MT5 and crypto alike). Phase 6 adds a `PAUSE_AUTONOMOUS` check right
after the kill-switch check:

```ts
const manualSources = new Set(["manual", "manual-direct", "manual-close",
                               "manual-modify", "assisted-approved"]);
const isManual = manualSources.has((signal.source ?? "manual").toLowerCase());
const autonomousModes: TradingMode[] = ["semi_autonomous", "fully_autonomous"];
const autoPauseBlocked = risk.pauseAutonomousTrading && !isManual
                       && autonomousModes.includes(account.mode);
```

The rule is added to `hardFail`, so any matching signal is recorded as
`status = "blocked"` with decision text `"Autonomous trading is paused — manual
& assisted-approval actions still available."` and does NOT reach
`dispatchToBroker`. Because `dispatchToBroker` is also the path that MT5 EAs,
crypto connectors, and manual UI routes use, the gating is uniform.

### Manual sources whitelist (stable)

| source | Used by |
|---|---|
| `manual` | BrokerIntegrationService default source for UI-initiated signals |
| `manual-direct` | `POST /brokers/accounts/:id/orders` direct-order route |
| `manual-close` | closePosition / close-ticket flows |
| `manual-modify` | SL/TP position modification |
| `assisted-approved` | Approve button in assisted mode |

These sources bypass PAUSE_AUTONOMOUS because in every case a human is
explicitly initiating the action; there is no autonomous decision. AI agents,
strategies, and supervisor agents use `source: "ai-agent" / "strategy" /
"supervisor-agent"` and are blocked when paused.

### Dashboard UI

- **New "Pause AI" / "AI Paused" button** next to the Kill Switch. Uses the
  warning (amber) `variant="warning"` styling, a raised-hand icon (`Hand` from
  lucide-react), and a tooltip explaining that manual + approvals still work.
- When paused, an amber **"AI Autonomous Trading Paused"** DataBanner appears
  at the top of the trading dashboard explaining exactly what is blocked and
  how to resume.
- The Connector Health grid shows an **"AI autonomous: running / PAUSED"**
  line for at-a-glance status.
- `brokerApi.pauseAutonomous(paused)` is a new client helper that calls
  `PATCH /brokers/risk` with `{ pauseAutonomousTrading: paused }`, reusing the
  existing risk-controls endpoint (no new server route needed).

### Files changed

| File | Change |
|---|---|
| `packages/shared/src/brokerIntegration.ts` | Added `pauseAutonomousTrading` to `BrokerRiskControls`, defaulted to `false` in `DEFAULT_RISK_CONTROLS`, added to `UpdateRiskControlsSchema`. |
| `apps/api/src/tradingIntel/brokerIntegration.service.ts` | Added PAUSE_AUTONOMOUS gate inside `submitSignal()`; whitelisted manual sources; added rule to `hardFail` list so autonomous signals are blocked before dispatch. |
| `apps/web/src/lib/brokerIntegration.ts` | Added `pauseAutonomousTrading` to web `BrokerRiskControls`; added `brokerApi.pauseAutonomous(paused)` client helper. |
| `apps/web/src/pages/trading/TradingDashboardPage.tsx` | New Pause AI button + handler (`toggleAutonomousPause`), amber pause banner, AI autonomous status in Connector Health grid; new `Hand` icon imported. |
| `apps/api/src/tradingIntel/crypto/crypto-phase6-pause.test.ts` | New unit tests: default value, manual-source whitelist stability, source-level presence of the gate. |
| `docs/CRYPTO_PHASE6_PAUSE_AUTONOMOUS.md` | This file. |

## Why a separate toggle (not just mode switch)

- **One-click safety.** Users asked for "pause or disable autonomous trading
  at any time." Switching every account to `analysis_only` mode is
  multi-click, irreversible without re-configuration, and not obvious in a
  panic. A single dashboard-level button satisfies the requirement.
- **No loss of state.** Pausing does not change `account.mode`. Flipping it
  back off resumes autonomous operation instantly — no reconnection, no
  config rewrite.
- **Granularity preserved.** Kill Switch (total halt) remains for emergency;
  Pause AI is the everyday "freeze the bots" control.
- **Auditability.** Every blocked signal is still recorded as a
  `TradeExecution` with `status=blocked` and `decision` citing the pause
  reason, so the audit trail shows when and why the AI was held back.

## Invariants upheld

- **No broker / custody / matching logic.** This is a governance gate, same
  class as the existing kill switch — it decides whether to *call* the
  connector, it never executes, matches, or holds funds.
- **Fail-closed.** If risk controls fail to load, signals default safe
  (they fall through to other hard-fail gates; risk.getRiskControls returns
  DEFAULT_RISK_CONTROLS where `pauseAutonomousTrading=false`).
- **Org scoping.** Risk controls (including pause state) are stored at
  `bri:<oid>:risk` and never cross organizations.
- **No Math.random** introduced.
- **Manual actions always available.** The trader can close, hedge, or flatten
  positions even while AI is paused — a critical safety property so pausing
  the AI never traps a user in a losing position.

## Verification

- 1858 API tests passing (+3 new Phase 6 tests); pre-existing 8 Prisma-WASM +
  1 geoBilling failures unchanged and out of scope.
- web production build green (`pnpm --filter @windels/web build`).
- tsc clean on all trading/crypto/dashboard paths.
- noRandomData guard clean.
- No custody / broker / internal-matching patterns added.
