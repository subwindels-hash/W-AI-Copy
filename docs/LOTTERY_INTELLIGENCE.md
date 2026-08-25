# WINDELS Lottery Intelligence

Native WINDELS module. Catalogued lotteries: **EuroMillions** (5 from 1–50 + 2 Lucky Stars from 1–12) and **Powerball** (5 from 1–69 + 1 Powerball from 1–26). Additional games plug in through `LiLotteryRules` + a provider adapter.

## Honesty

Lottery draws are random. Historical frequency does **not** change the mathematical probability of the next independent draw.

- Scores are **statistical-fit** or **diversity**, never win chance.
- Backtests are labelled **HISTORICAL SIMULATION** and always include a **random baseline**.
- Official results are never invented. Missing feed → empty store + `NOT_CONFIGURED`.
- SANDBOX uses labelled fictional draws and is never mixed into official statistics.

## Rules (backend-configured)

EuroMillions: 5 from 1–50 + 2 Lucky Stars from 1–12 (`EUROMILLIONS_RULES`, versioned).
Powerball: 5 from 1–69 + 1 Powerball from 1–26 (`POWERBALL_RULES`, versioned).

System lines = **C(N, mainCount) × C(S, bonusCount)** — computed from the lottery's rules, never hard-coded.

## Surfaces

- Desktop: `/app/lottery`
- Mobile: `/m/lottery`
- API: `/api/v1/lottery-intel/*` (JWT, org-scoped; tickets are per-user)

## Configuration

- `WINDELS_LOTTERY_MODE` — SANDBOX | PAPER | PRODUCTION
- `WINDELS_LOTTERY_EUROMILLIONS_FEED_URL` — official JSON/CSV
- `WINDELS_LOTTERY_EUROMILLIONS_FEED_TOKEN` — optional bearer
- `WINDELS_LOTTERY_POWERBALL_FEED_URL` — official JSON/CSV
- `WINDELS_LOTTERY_POWERBALL_FEED_TOKEN` — optional bearer

## Storage

- Hot path: Redis `li:<entity>:i:<org>:<id>` (Session 89 catalogued)
- Archive: Prisma `lottery_draws`, `lottery_tickets`, `lottery_backtests`
