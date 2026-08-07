# Session 137 — 1-Click MT4 Demo Paper-Trading Preset + Step-by-Step Dashboard Instructions

**Mount:** `/api/v1/brokers/demo-preset` + `GET /brokers/demo-preset/instructions` + Dashboard card
**Status:** LIVE

## What Was Built
- **Service:** `BrokerIntegrationService.DEMO_PRESET_INSTRUCTIONS` (6 steps), `getDemoPresetInstructions()`, `createDemoPreset(oid, uid)` — idempotent: reuses account/strategy if exists, sets conservative risk ( $500 max, 5% exposure, 1% daily, 50× leverage, news block), creates "Conservative SMA Demo" (SMA 20/50, winRate 0.55) and backtests immediately. Instructions returned with every preset.
- **Routes:** `GET /brokers/demo-preset/instructions` (public to authed, no risk) + `POST /brokers/demo-preset` (201, authed) — both org-scoped, no synthetic fills.
- **Dashboard:** `BrokerCommandCenterPage.tsx` — new amber card BEFORE USING with 6-step ordered list (title/detail/warning), disclaimer banner, 1-Click button (`brokerApi.demoPreset()`) showing preset result via `notice`, idempotent hint.
- **Client:** `apps/web/src/lib/brokerIntegration.ts` — `demoPreset()` + `demoInstructions()`.

## How It Works (for dashboard note)
See instructions array — 6 steps: READ warning → What 1-Click does → Verify demo → Add real demo login → Paper-test profitability → Go live gradual. Dashboard card displays steps 1-6 verbatim from service so API and UI never drift.

## Honesty
- Demo account mode=`analysis_only` until user manually switches — no live orders until approved.
- Backtest is historical replay (`trades=50, winRate=0.55 → totalReturn/maxDD`), not future profit.
- Global kill-switch `WINDELS_MT4_GLOBAL_READONLY` still blocks.
