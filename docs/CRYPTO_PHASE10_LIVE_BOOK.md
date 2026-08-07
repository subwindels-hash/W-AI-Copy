# Crypto Phase 10 — Live Book Updates (order/position real-time UI merge)

## Overview
Phase 10 completes the live-trading UI loop that Phase 4 started. Previously
the SSE `/brokers/events/stream` endpoint already carried `order_update` and
`position_update` events from private WS/REST fan-out, but the dashboard only
rendered them into a ring buffer — pending orders and open positions only
changed on the next polling refresh. Phase 10 merges those live events
directly into the dashboard tables so fills, cancels, new opens, and SL/TP
edits appear the instant the external broker/exchange reports them.

WINDELS remains an **AI Trading Agent**, not a broker: these events are
**read-only reports** of state the user's external broker/exchange pushed to
us. WINDELS does not match, fill, or settle any order itself.

## Changes

### Backend (apps/api)
- `tradingIntel/crypto/base-crypto-connector.ts`
  - Fixed the net-position signed-quantity calculation in both
    `cryptoPositionsToBroker` (batch) and `cryptoPositionToBrokerPosition`
    (single-event). Net positions use a signed `quantity` directly so a
    negative qty correctly maps to `side: "short"`; previously the sign was
    being flipped to positive for any negative qty which made short net-mode
    positions appear as longs on the dashboard.
  - Emitted orders/positions continue to carry both `id` and `ticket` so the
    UI can merge by `${accountId}:${ticket}` (the same key used for polled
    rows). Terminal order statuses (`filled`/`cancelled`/`expired`/
    `rejected`) are normalized onto the `BrokerPendingOrder.status` union
    (`canceled` → `cancelled`) so the UI can drop rows for completed orders
    without waiting for a poll.
- New test: `tradingIntel/crypto/crypto-phase10-live-book.test.ts` — verifies
  merge-friendly shape of batch and single-event converters (id==ticket,
  positive absolute volume across long/short/net, terminal statuses excluded
  from open-orders batch).

### Shared (packages/shared)
No schema changes. The existing `BrokerPosition` and `BrokerPendingOrder`
already carry `ticket`/`id` fields; Phase 10 relies on them being populated
consistently.

### Web frontend (apps/web)
- `lib/tradingEvents.ts` — the `useTradingEvents` hook now exposes two new
  lookup maps on the returned state:
  - `latestOrderById: Record<"\${acctId}:\${ticket}", LiveOrder>`
  - `latestPositionById: Record<"\${acctId}:\${ticket}", LivePosition>`
  Each `order_update`/`position_update` SSE event writes into the
  corresponding map keyed by account + ticket, in addition to the existing
  ring buffers.
- `pages/trading/TradingDashboardPage.tsx`
  - New `positionsMerged` / `ordersMerged` memoized reducers:
    - overlay live fields onto polled rows;
    - drop orders whose latest live status is terminal (filled/cancelled/
      canceled/expired/rejected);
    - drop positions whose volume falls to 0 (fully closed between polls);
    - append rows that only exist in the live stream (e.g. orders placed by
      AI/autonomous flow that haven't been polled back yet).
  - Positions table: flashes a green dot + subtle row highlight for rows
    just updated live; live dot shown next to the title; prices continue to
    be overlaid by tick bid/ask.
  - Pending Orders table: adds a Status column (`active`/`partial`), disables
    the cancel button when the order has moved to a non-active state, shows
    LIVE badge in title.
  - Live status strip now reports count of book updates (order+position)
    alongside executions and symbols tracked.

## Why this matters
Before Phase 10, a trader clicking "Close" or watching an AI entry could see
the position/order sit in the table for up to a polling interval (or until
the next refresh click). Now private WS-supported exchanges (Binance, Bybit,
OKX already, with more coming in later phases) and REST-emitted events push
state changes to the UI immediately. Filled orders vanish from the Pending
Orders table instantly; closed positions drop out of Open Positions
instantly; newly opened positions (AI or manual) appear as soon as the
exchange confirms them.

## Not a broker
Nothing in Phase 10 introduces matching, custody, settlement, house
accounts, internal wallets, liquidity provision, market-making, or an
internal order book. All data shown is *broker-reported state* forwarded
through the `TradingEventHub`. WINDELS cannot fill a trade on its own.

## Tests
- Full crypto test suite passes: 53 tests across 10 files.
- Full API suite: 1878 passing, same 8 pre-existing Prisma-WASM failures
  (enterpriseSearch) + 1 pre-existing geoBilling Prisma failure — unchanged
  and out of scope per project policy.
- `tsc --noEmit` is clean for crypto/trading paths.
- `pnpm --filter @windels/web build` succeeds.
- `grep Math.random()` and custody/matching-engine keyword scans clean in
  trading paths.

## Files changed
- `apps/api/src/tradingIntel/crypto/base-crypto-connector.ts` (net-position sign fix)
- `apps/api/src/tradingIntel/crypto/crypto-phase10-live-book.test.ts` (new)
- `apps/web/src/lib/tradingEvents.ts` (latestOrderById / latestPositionById)
- `apps/web/src/pages/trading/TradingDashboardPage.tsx` (merged tables, status, live badges)
- `docs/CRYPTO_PHASE10_LIVE_BOOK.md` (this file)
