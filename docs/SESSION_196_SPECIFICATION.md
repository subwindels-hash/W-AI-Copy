# Session 196 — `ea` Tier 4 console + dedicated web lib

**Date:** 2026-08-17
**Branch:** `arena/01a00d4e-win`
**Module focus:** `ea` (Phase 2 of tradingIntel) — MetaTrader 5 Expert
Advisor pairing, signal poll, fill ack, heartbeat, and HMAC-signed
signal envelope.

## What this session did

### 1. Real state of `ea` at session start

`ea` is unusual in the unfinished-modules list: the **backend service is
in good shape**, but the **Tier 4 console story is missing entirely**:

- The service (`apps/api/src/tradingIntel/ea.service.ts`, 429 LOC) is
  fully org-scoped: every authenticated route takes `req.user.organizationId`
  (the 3 user-facing routes — `/ea/register`, `/ea`, `DELETE /ea/:id`),
  and the bearer-token routes (`/ea/poll`, `/ea/fill`, `/ea/heartbeat`,
  `/ea/config`) resolve the org from the session body via the
  `eaAuth` middleware. The org-scoping is **enforced at the API
  boundary**, not at the Redis key level: every per-EA key is keyed by
  the server-generated `eaId` (a CSPRNG identifier, not an org id), and
  `ea:org:<oid>` is a back-reference set used by the listing endpoint
  to enumerate the calling org's EAs. This is the same pattern as
  `mfa:secret:<userId>` — principal-scoped state with an org reference
  index.
- The web client is partial: `apps/web/src/lib/brokerIntegration.ts`
  exposes `eas()` and `revokeEa(eaId)`, but the **register** flow is
  missing from the client. The inventory scanner happily maps `ea` to
  the `brokerIntegration` client (the route prefix `/ea` is in the
  `PREFIX_ALIASES` map for the brokerIntegration module), so the
  audit shows `ea` as COMPLETE even though it has no console page.
- There is no `apps/web/src/pages/ea/` directory, no `lib/ea.ts` of
  its own, no Sidebar entry, no router route, no `eaApi` client
  surface. Operators running the MQL5 Expert Advisor have no UI
  path to either pair a new EA or monitor the existing ones
  beyond the `brokersApi.eas()` listing that already lives in the
  BrokerCommandCenterPage.

### 2. The fix (additive, no breaking changes)

- **Dedicated `lib/ea.ts`**: extracted the EA surface from
  `brokerIntegration.ts` into `apps/web/src/lib/ea.ts` with the full
  client: `register(body)`, `list()`, `revoke(id)`, `getSession(id)`,
  `recentFills(id, limit)`. `brokerIntegration.ts` keeps a
  re-export of `eaApi` so existing call sites do not break (the
  `BrokerCommandCenterPage` consumes it).
- **Tier 4 console page**: `apps/web/src/pages/ea/EaPage.tsx`
  hosts the operator surface — register a new EA, list the org's
  EAs (with `connected` state from the heartbeat cache), revoke an
  EA, and inspect the per-EA fill history. The page mirrors the
  S195 honesty discipline: a fresh org sees an amber "no EAs
  paired yet" banner; `connected: true` requires a heartbeat in
  the last 15 s (the same threshold `EaService.listEa()` already
  uses), and a stale EA is honestly labelled "stale" not
  "connected".
- **Tenant isolation catalog**: the `ea:*` keys are added to
  `TI_NAMESPACE_CATALOG` as `shared` (eaId is principal-scoped,
  not org-scoped). The `ea:org:<oid>` set and `ea:acct:<aid>`
  set are reference indices, not org-scoped state, so they go
  in the same `shared` bucket. This matches the existing
  `mfa:secret` / `mfa:enforced` / `mob:action` etc. treatment.
- **Org-scope unit tests**: 5 new tests (D1–D5) exercise
  `EaService.register(oid, ...)`, `listEa(oid)`, `revoke(oid, id)`,
  and the token-resolved org in `poll(sess, ...)`,
  `ackFill(sess, ...)`, `heartbeat(sess, ...)`. The pre-existing
  `tradingIntel/ea.test.ts` already covers the HMAC/watermark
  mechanics end-to-end; the S196 suite focuses on the org
  boundary.
- **Catalogue comment** explaining the eaId-is-principal-scoped
  decision (mirrors the `mfa:secret` comment in the catalog).

### 3. Inventory + library glue

- `apps/web/src/lib/ea.ts` is new.
- `apps/web/src/router.tsx` mounts `EaPage` at `/app/ea`.
- `apps/web/src/app/Sidebar.tsx` adds the `Cpu` icon (already
  imported for `hybridExec`; reused) and a "Expert Advisors (MT5)"
  nav entry, positioned next to the other `Cpu`-iconed
  `hybridExec` entry so the operator can find both from the
  Trading family.

### 4. Test plan (D1–D5)

`apps/api/src/tradingIntel/ea.completion.test.ts` (5 test groups):

- **D1 require-oid:** every public method that takes an `oid`
  throws on empty / null oid.
- **D2 cross-tenant isolation:** two orgs register distinct
  EAs and `listEa(orgA)` never returns org B's EAs. The
  `ea:org:<oid>` set is the boundary.
- **D3 token resolves to calling org:** a stolen `eaId` from
  org A used by an attacker who only has org B's JWT cannot
  poll org A's EAs — the `eaAuth` middleware reads `sess.organizationId`
  from the session stored under the token hash, and the listing
  call uses that org.
- **D4 revoke is per-org:** `revoke(orgB, eaId)` for an `eaId`
  owned by org A returns 404 (the inline check
  `s.organizationId !== oid`).
- **D5 hard limits are per-account:** the `hardLimitsFrom` is
  pure (no state), so two orgs with the same broker account
  get identical hard limits — but those limits are derived
  from the account, not from the EA, so the per-org boundary
  is irrelevant for the test.

## Status

IMPLEMENTED → BUILT → TESTED → VERIFIED → INTEGRATED.
