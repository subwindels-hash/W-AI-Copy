# Session 195 — v76validation runtime validation checklist

**Module:** `v76validation` (Session 76) — Final Enterprise Integration &
Validation, Digital Operations Center.
**Date:** 2026-08-17
**Branch:** `arena/01a00d4e-win`

## 1. Service-level checks (vitest)

```bash
cd apps/api && PATH="/tmp/windels-bin:$PATH" pnpm exec vitest run src/v76validation/v76validation.completion.test.ts
```

Expected: **5 groups, 7 tests, all passing.**

- D1 require-oid (1 test): every public method throws on
  empty / null oid.
- D2 cross-tenant isolation (1 test): notes / report / marker
  keys live per-org; org B never sees org A's data.
- D3 no fake history (1 test): `history(oid)` returns `[]` on a
  fresh org, exactly the number of runs the caller performed
  afterwards, newest first.
- D4 no-seed on read (1 test): a `runReport(oid)` call writes
  the report body and pointers; nothing else.
- D5 legacy adoption (1 test + cross-tenant assertion):
  `v76:imported:<org>` is set on first report; two orgs have
  two markers.

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
- `v76validation` row moves from `web.pages: []` to
  `web.pages: ["apps/web/src/pages/v76validation/ (1 file)"]`.
- The status remains `COMPLETE` (it was already COMPLETE; this
  session only adds the missing console page and the
  tenant-isolation catalogue entries, which the audit does not
  gate the status on).
- Total `COMPLETE` modules: 143 (unchanged).
- `STUB`: 1 (`nativeAi`, intentionally).

## 4. Module-level checks

- `apps/api/src/v76validation/v76validation.service.ts` has
  `assertOrg` and every public method starts with
  `assertOrg(oid)`.
- `apps/api/src/http/routes/v76validation.ts` mounts
  `authenticate` + `orgOf` for both `/report` and the
  `/notes/*` routes (the latter were already per-org via
  `tenantStore`, but the route file used a custom inline
  check — replaced with the standard guard).
- The 6 `v76:*` prefixes are listed in
  `TI_NAMESPACE_CATALOG` (the bare `v76` prefix is
  deliberately not added — see the inline comment in
  `tenantIsolation.service.ts`).

## 5. Tier 4 console checks

- `apps/web/src/pages/v76validation/V76ValidationPage.tsx`
  exists and exports a `V76ValidationPage` component.
- `apps/web/src/router.tsx` lazy-loads it on
  `/app/v76-validation`.
- `apps/web/src/app/Sidebar.tsx` adds the `ClipboardCheck`
  icon and the nav entry.
- The page renders a fresh-org banner until the operator
  triggers a report.
- The 22-item checklist table renders pass/fail.
- The history card lists the calling org's previous reports
  newest first.

## 6. `make verify`

```bash
PATH="/tmp/windels-bin:$PATH" make verify
```

Expected: **7/7 tasks successful.**

## 7. Backwards compatibility

- The existing `GET /validation/report` endpoint still works
  (its response shape is the same `V76ValidationReport`).
- The existing `/validation/notes/*` endpoints still work and
  return the same payload shape.
- The legacy S76 global seed keys the report reads
  (`arch:*`, `sh:*`, `kernel:*`, …) are not deleted; the
  report still works against a fresh install that hasn't
  adopted the per-org scheme.
