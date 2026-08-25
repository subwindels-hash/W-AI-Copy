# WINDELS Sports Intelligence

A native WINDELS AI OS module — not a separate betting site.

Pipeline:

**DATA → VALIDATION → NORMALIZATION → DATA QUALITY → MATCH INTELLIGENCE → FEATURES → PREDICTION → CALIBRATION → VALUE → RISK → CORRELATION → OPTIMIZATION → VALIDATION → USER APPROVAL → RESULT VERIFICATION → SETTLEMENT → PERFORMANCE → BACKTESTING → MODEL EVALUATION**

## Safety

- Never guarantees winnings or profits.
- Never fabricates fixtures, odds, injuries, lineups or results.
- Never mixes SANDBOX data into production statistics.
- Automated external execution cannot be enabled.
- **NO QUALIFIED TICKET** is a valid, expected outcome.

## Modes

| Mode | Data | Decisions | Execution |
|---|---|---|---|
| SANDBOX | Labelled fictional feed | Real engines | Never |
| PAPER | Real providers when configured | Real engines | Never |
| PRODUCTION | Real providers | Real engines | Approval only |

Default is PAPER (or SANDBOX when `WINDELS_DEMO_DATA=true`).

## Providers

Configure only in environment / secret storage:

- `WINDELS_SPORTS_API_FOOTBALL_KEY` — fixtures/results
- `WINDELS_SPORTS_ODDS_API_KEY` — market prices
- `WINDELS_SPORTS_MODE`

Without keys, PAPER/PRODUCTION stay empty and honest (`NOT_CONFIGURED`).

## Surfaces

- Console: `/app/sports`
- Mobile: `/m/sports`
- API: `/api/v1/sports-intel/*` (JWT, org-scoped)
- Settings / approvals / settlement overrides: `ORG_ADMIN`

## Storage

- Hot path: org-scoped Redis `si:<entity>:i:<org>:<id>` (Session 89 catalogued)
- Historical: Prisma tables `sports_*` (migration `20260825000000_sports_intelligence`)
- Audit: module ledger + existing `AuditLog`

## Model

`WINDELS Sports Model v1.0` — independent Poisson goal model, Platt/bucket calibration when history exists, EV = calibrated × odds − 1. Predictions store model, feature, config and input-data versions.
