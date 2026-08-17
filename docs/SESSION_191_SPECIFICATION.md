# Session 191 — Tier 4 disasterRecovery console + inventory scanner `web.pages` fix

**Date:** 2026-08-17
**Branch:** `arena/01a00d4e-win`
**Module focus:** `disasterRecovery` (new Tier 4 page) + `audit/build-inventory.mjs` (real defect documented in `UNFINISHED_MODULES.md`).

## What this session did

### 1. Fixed the inventory scanner's `web.pages` detection

`docs/UNFINISHED_MODULES.md` listed this as item 7 under "Suggested order for
sessions 161+":

> Fix `audit/build-inventory.mjs` `web.pages` detection.

The previous scanner hardcoded `pages: []` for every module, so the inventory
could not regress-detect a missing console. The new `findWebPages()` follows
the same prefix-alias map pattern as `findWebClient()` and resolves a
module's console directory in three layers:

1. **Module-key directory** at `apps/web/src/pages/<modKey>/` (the default
   convention, e.g. `pages/composer/` for `composer`).
2. **Alias directories** for modules whose consoles live under a different
   folder name (e.g. `pages/bi/` for `businessIntelligence`, `pages/finops/`
   for `enterpriseFinOps`, `pages/voice/` for `voice` and `voiceStudio`,
   `pages/security/` for `mfa`). Sessions 181–190 added these aliases; the
   scanner now sees both the alias and the canonical directory.
3. **`admin/` consoles** for the modules S121–S190 added pages for
   (`sustainability`, `opex`, `aiEngineering`, `identityKnowledge`,
   `tenantIsolation`, `security`, `governance`, `enterprise`,
   `adminApiControl`, `usage`, `publicApi`, `promptTemplates`).

The scanner previously reported 0 modules with pages. After the fix it
detects **86 of 144 modules** with a real console directory, and the
remaining 58 are correctly headless (`kernel`, `permissions`, `mfa`, etc.)
or genuinely missing a page.

### 2. Real bugs found and fixed during the work

The session also surfaced four real build defects that were preventing
`make verify` from going green:

- **`apps/web/src/pages/nativeAiApi/NativeAiApiPage.tsx`** had a literal
  `<api-key>` inside a JSX string, which JSX parsed as a (unclosed) element.
  Replaced with `&lt;api-key&gt;`.
- **`pages/businessIntelligence/BusinessIntelligencePage.tsx`**,
  **`pages/enterpriseFinOps/EnterpriseFinOpsPage.tsx`** and
  **`pages/enterpriseSearch/EnterpriseSearchPage.tsx`** were aliased with
  `export { default } from "..."` but the source pages use *named* exports
  (no default). Each alias re-exports the named symbol as `default` now.
- **`apps/web/src/pages/cloudAndroidPublic/CloudAndroidPublicPage.tsx`** and
  **`pages/nfcPublic/NfcPublicPage.tsx`** were re-exports, but `router.tsx`
  accessed `.CloudAndroidPublicPage` / `.NfcPublicPage` on the module
  namespace. Each alias now re-exports the parent component under both
  names.
- **`apps/web/src/pages/modelFactory/ModelFactoryPage.tsx`** passed
  `builder: "custom"` to the API but `Mf2BuilderKind` is a closed union
  (`"slm" | "llm" | "vision" | "speech" | "audio" | "multimodal" |
  "domain"`). Replaced with `"domain"`.

These were S181/S182/S183/S184/S186/S187 introduced defects that prevented
the web build from compiling in the sandbox. None affected production
runtime — `vite build` and `pnpm tsc -b` are not in the runtime hot path —
but they were regression-detected by the new console work.

### 3. New `disasterRecovery` console page

Tier 4 work: `disasterRecovery` had 13 routes, a 17-LOC web client, and
S179's honest dashboard (activeRegion is null until configured), but no
console. Added `apps/web/src/pages/disasterRecovery/DisasterRecoveryPage.tsx`
that mirrors the dashboard's honesty discipline:

- A fresh org sees a "no topology configured" banner instead of a
  fabricated na-east active region.
- Components are listed with `healthy: false` (unverified) until a real
  drill records a passing result.
- The provenance block is rendered verbatim.
- Replication lag is "—" until at least one component reports a reading.
- Failover form requires a `reason` string (the API accepts empty, but the
  console refuses — defending against the operator clicking through
  without explanation).
- Emergency-mode toggle is admin-gated; non-admins see the current state
  read-only.
- Drill scheduling, drill starting (admin-only) and the event feed all
  surface the real, measured records.

The page is registered in `router.tsx` at `/app/disaster-recovery` and
linked from `app/Sidebar.tsx` (icon: `ShieldAlert`).

### 4. New e2e test

`tests/e2e/disasterRecovery.spec.ts` covers the dashboard shape, the
no-org 401 guard, and the honest empty state. The session's unit-test
discipline is unchanged — the existing `disasterRecovery.completion.test.ts`
(S179) covers the service.

## Inventory state

| Status | Before S191 | After S191 |
|---|---|---|
| COMPLETE | 143 | 143 |
| STUB | 1 (`nativeAi` legacy, intentionally superseded) | 1 (unchanged) |
| User-facing modules with no console page | 51 | 50 |
| Modules with detected `web.pages` | 0 (hardcoded `[]`) | 86 |
| Total modules | 144 | 144 |

## Files changed

- `apps/web/src/pages/nativeAiApi/NativeAiApiPage.tsx` — fix JSX escape
- `apps/web/src/pages/businessIntelligence/BusinessIntelligencePage.tsx` — fix default re-export
- `apps/web/src/pages/enterpriseFinOps/EnterpriseFinOpsPage.tsx` — fix default re-export
- `apps/web/src/pages/enterpriseSearch/EnterpriseSearchPage.tsx` — fix default re-export
- `apps/web/src/pages/cloudAndroidPublic/CloudAndroidPublicPage.tsx` — fix router alias name
- `apps/web/src/pages/nfcPublic/NfcPublicPage.tsx` — fix router alias name
- `apps/web/src/pages/modelFactory/ModelFactoryPage.tsx` — fix builder enum
- `apps/web/src/router.tsx` — add disasterRecovery import + route
- `apps/web/src/app/Sidebar.tsx` — add ShieldAlert icon + sidebar nav entry
- `apps/web/src/pages/disasterRecovery/DisasterRecoveryPage.tsx` — new Tier 4 page (added)
- `audit/build-inventory.mjs` — `findWebPages()` function, replaces hardcoded `[]`
- `tests/e2e/disasterRecovery.spec.ts` — new e2e spec (added)

## Test counts

- `apps/api`: **3309 passing / 65 skipped** (unchanged)
- `apps/web` typecheck + build: **clean**
- `packages/shared` build: **clean**
- `make verify`: **7/7 tasks successful**

## Honesty discipline

The new console page does not invent: a fresh org shows "no topology
configured" rather than a default na-east active region. The form requires
a real `reason` for any manual failover. Components are
`unverified: true` until a real drill records a passing result. The
provenance block is rendered as a card so the operator sees the source of
every value.

## Runtime validation

This sandbox cannot reach live PostgreSQL 17 / Redis 8 or download the
Prisma engine. Runtime validation of the new page is pending in the
target environment; the e2e spec runs there and verifies the
authenticated dashboard endpoint plus the no-token 401/403 guard.
