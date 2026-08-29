# Session 196 — `ea` runtime validation checklist

**Module:** `ea` (Phase 2 of tradingIntel) — MT5 Expert Advisor
pairing, signal poll, fill ack, heartbeat.
**Date:** 2026-08-17
**Branch:** `arena/01a00d4e-win`

## 1. Service-level checks (vitest)

```bash
cd apps/api && PATH="/tmp/windels-bin:$PATH" pnpm exec vitest run \
  src/tradingIntel/ea.completion.test.ts \
  src/tradingIntel/ea.test.ts
```

Expected: **both files pass, 0 regressions.**

The pre-existing `ea.test.ts` exercises register / auth / poll /
enqueue / fill / heartbeat / HMAC / watermark / revoke end-to-end
with `FakeKv`; the S196 suite layers on top of that to test the
org boundary.

## 2. Typecheck

```bash
cd apps/api && PATH="/tmp/windels-bin:$PATH" pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -v "@prisma/client"
cd apps/web && PATH="/tmp/windels-bin:$PATH" pnpm exec tsc --noEmit
```

Expected: **no errors** introduced by this session.

## 3. Inventory check

```bash
node audit/build-inventory.mjs
```

Expected:
- `ea` row moves from `web.pages: []` to
  `web.pages: ["apps/web/src/pages/ea/ (1 file)"]`.
- The status remains `COMPLETE` (it was already COMPLETE; the
  audit found the brokerIntegration alias).
- The `web.client` field is now `apps/web/src/lib/ea.ts` (the
  alias `brokerIntegration.ts` is no longer the primary client).
- Total `COMPLETE` modules: 143 (unchanged).
- `STUB`: 1 (`nativeAi`, intentionally).

## 4. Module-level checks

- `apps/api/src/tradingIntel/ea.service.ts` already takes `oid`
  on every authenticated method; no service changes required.
- `apps/web/src/lib/ea.ts` is new and exports `eaApi` with the
  full client surface.
- `apps/web/src/lib/brokerIntegration.ts` re-exports `eaApi`
  for back-compat.
- The 12 `ea:*` key prefixes are listed in
  `TI_NAMESPACE_CATALOG` (all `shared` — eaId is principal-
  scoped, the `ea:org:<oid>` set is a reference index).

## 5. Tier 4 console checks

- `apps/web/src/pages/ea/EaPage.tsx` exists and exports
  `EaPage`.
- `apps/web/src/router.tsx` lazy-loads it on `/app/ea`.
- `apps/web/src/app/Sidebar.tsx` adds the `Cpu` icon and the
  "Expert Advisors (MT5)" nav entry.
- The page renders a fresh-org banner until the operator
  pairs a new EA.
- The list shows `connected: true|false|stale` based on the
  15-second heartbeat threshold.
- Revoke requires a `confirm()` dialog (irreversible).
- The fill-history card shows the EA's last N fill acks from
  `ea:fills:<eaId>` (populated via `ackFill`).

## 6. `make verify`

```bash
PATH="/tmp/windels-bin:$PATH" make verify
```

Expected: **7/7 tasks successful.**

## 7. Backwards compatibility

- `apps/web/src/lib/brokerIntegration.ts` re-exports `eaApi`,
  so any existing call site (e.g. `BrokerCommandCenterPage`'s
  use of `eas()` and `revokeEa()`) keeps working.
- The backend `/ea`, `/ea/register`, `/ea/:id` routes are
  unchanged.
- The pre-existing `tradingIntel/ea.test.ts` continues to pass
  unmodified.
