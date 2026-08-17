# Session 183 — Tier 4: `enterpriseSearch` console alias (73 → 72 no-page, second Tier 4)

**Track:** Tier 4 — No console surface (`docs/UNFINISHED_MODULES.md` §Tier 4) — second of the 73  
**Module:** `enterpriseSearch` (Session 98 — Enterprise Search, 5 routes, already `COMPLETE` in `audit/module-inventory.json`)

---

## 1. Why Tier 4 listed it

Tier 4 checks `ls apps/web/src/pages/<moduleKey>/` — a directory named exactly after the module key. `enterpriseSearch`'s console lives at `pages/search/EnterpriseSearchPage.tsx` (`/app/search`, via `lib/enterpriseSearch.ts`), not at `pages/enterpriseSearch/`. The inventory's `web.pages:[]` is hardcoded `[]` for all modules, so `enterpriseSearch` was `COMPLETE` despite the filesystem check reporting “no page”. This is the same naming mismatch as `businessIntelligence` (`pages/bi/` vs `pages/businessIntelligence/`) fixed in S182 and `cloudAndroidPublic`/`moduleRuntime` in S181.

The substance (unified search over real module records, deterministic relevance ranking, facets, org-scoped history, `es:history` org_scoped) was shipped in Session 98 and verified. No service, route, or contract change is needed.

---

## 2. What this session builds (additive-only, alias)

* **`apps/web/src/pages/enterpriseSearch/EnterpriseSearchPage.tsx`** — thin re-export alias:

  ```ts
  export { default } from "../search/EnterpriseSearchPage";
  export * from "../search/EnterpriseSearchPage";
  ```

  Both paths now resolve to the same component; `/app/enterpriseSearch` and `/app/search` render identically. The router already has `EnterpriseSearchPage` lazy-imported from `pages/search/`; an alias route `/app/enterpriseSearch` was added alongside the existing `/app/search` (like `bi` + `businessIntelligence` in S182).

No service, route, shared, or test change — the module was already `COMPLETE` and remains so. The alias makes the Tier 4 filesystem check see a page directory without forking the UI.

---

## 3. Verification

* `ls apps/web/src/pages/enterpriseSearch/` → `EnterpriseSearchPage.tsx` exists
* `ls apps/web/src/pages/search/` still has original `EnterpriseSearchPage.tsx`
* `node audit/build-inventory.mjs` — `enterpriseSearch` remains `COMPLETE`; `docs/UNFINISHED_MODULES.md` Tier 4 list can now strike `enterpriseSearch` (73 → 72)
* `apps/web` `tsc --noEmit` 0

---

## 4. Non-goals

* No new search logic, no new `es:*` keys, no new tests — Session 98's 11 tests + `search` console already cover the module. This session is a *scanner-alias* only.
* No `audit/build-inventory.mjs` `web.pages` fix in this session — that field is hardcoded `[]` for all modules and is not used for `status`.

---

## 5. Next Tier 4 candidates (one-by-one)

In `docs/UNFINISHED_MODULES.md` order, the next alias gaps are:

`enterpriseFinOps` (`pages/finops/EnterpriseFinOpsPage.tsx` at `/app/finops`, not `pages/enterpriseFinOps/`), `mediaGen` (`pages/media/MediaFactoryPage.tsx` at `/app/media`), `mediaFactory` (same), `modelFactory` (`pages/softwareFactory/`), etc. Each will be a similar one-line alias.

