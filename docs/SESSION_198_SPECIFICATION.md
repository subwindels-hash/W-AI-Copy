# Session 198 — Inventory scanner `web.pages` made router-grounded (+ router build fix)

**Date:** 2026-08-25
**Branch:** `arena/01a03824-windels-ai-os`
**Module focus:** `audit/build-inventory.mjs` (page detection) + `apps/web/src/router.tsx` (build regression).

## What was broken

### 1. `apps/web/src/router.tsx` did not compile

The marketing section's lazy binding was declared as a second
`const AgentsPage` (from `pages/marketing/MarketingPages`), colliding with the
app console binding `const AgentsPage` (from `pages/agents/AgentsPage`) ten
lines above. A duplicate `const` in one module scope is a `SyntaxError`, so
`vite build` / `tsc` failed on the whole web app
(`esbuild apps/web/src/router.tsx` reproduced it before the fix). Beyond the
build break, the shadowing had silently redirected `/app/workforce` — the
sidebar's "Workforce Hub", whose QuickAccess card says "Manage AI employees" —
to the *marketing* agents page.

**Fix:** renamed the marketing binding to `MarketingAgentsPage` (matching its
siblings `MarketingDevelopers` etc.) and pointed the public `/agents` route at
it. `/app/workforce` now renders `pages/agents/AgentsPage`, the authed console,
again.

### 2. The scanner's page detection was directory-name-based, not router-based

`findWebPages()` (added in Session 191) checked `apps/web/src/pages/<dir>/`
existence against a 60-entry hand-maintained `PAGE_HOME` map. Two failure
modes were live in the committed inventory:

- **Dead directories counted as pages.** Seven one-file alias directories that
  *nothing imports* — `pages/businessIntelligence/`, `pages/enterpriseSearch/`,
  `pages/enterpriseFinOps/`, `pages/mediaFactory/`, `pages/promptTemplates/`,
  `pages/apiKeys/`, `pages/canvasCollab/` (S182–S184 created them to satisfy
  the old filesystem check; the router imports the canonical `bi/`, `search/`,
  `finops/`, `media/`, `admin/PromptTemplatesPage`, `apikey/ApiKeyPage`,
  `canvas/` components instead) — were each reported as an additional module
  page. The scanner could not distinguish a routed console from an unrouted
  folder, so it could not regress-detect a deleted route either (S191's stated
  goal).
- **False attribution.** `engineering` was credited with the `events/` and
  `webhook/` consoles — pages belonging to the `events` and `webhook` modules.
  `engineering` has no dedicated console (its observability UI is a
  `PlatformPage` tab), and per the S187–S190 doctrine a PlatformPage tab is not
  a dedicated page.

## The fix

`findWebPages()` now derives everything from the router, the thing that
actually makes a page reachable at a URL:

1. **A router table is parsed once** from `apps/web/src/router.tsx`:
   component → lazy-imported page file, and route entry → rendered
   components. Components imported but never rendered (dead bindings, e.g.
   `dashboard/AdminDashboard`) are excluded — an unrouted page is not a
   console.
2. **Route-path attribution.** A page belongs to a module when a route path
   rendering it matches one of the module's path tokens: the module key, its
   kebab-case form, `moduleRoutePrefix()`, or an entry in the new
   `ROUTE_ALIASES` table (29 verified entries replacing the directory-name
   guesses — e.g. `agents → workforce`, `payments → payments`,
   `videoEngine → video-studio`, `apikey → api-keys`). Paths are compared per
   segment, so nested (`modules/:moduleId`) and public (`/contact`) paths
   match. Files under `pages/marketing/` are public website sections, not
   module consoles, and are excluded (the `marketing` module keeps its own
   `MarketingDashboardPage` console).
3. **Web-client attribution.** A page also belongs to a module when it imports
   the client `findWebClient()` resolved for that module — the page really
   calls that module's endpoints. This recovers consoles the old map missed
   by design: `files/FilesPage` (attachments, via `lib/files`), `chat/ChatPage`
   (conversations, via `lib/chat`), `github/GitHubConnectorPage`, the
   `mobile/Mobile*` PWA pages (via `lib/mobile/*`), `billing/PaymentGatewaysPage`
   (payments), `admin/EnterprisePage` (agentComm), `erp/ErpPage` (crm), etc.
   Two guards keep it honest: `lib/api.ts` is the shared fetch wrapper, not
   the `auth` module's client (matching it had attributed two dozen unrelated
   pages to `auth`), and `admin/PlatformPage.tsx` — the everything-tab shell —
   is skipped, because a shared tab is not a module console.

The emitted `web.pages` entries are now per-file and name the routes that
render them, e.g.

```
apps/web/src/pages/bi/BusinessIntelligencePage.tsx (routes: bi, businessIntelligence)
apps/web/src/pages/agents/AgentsPage.tsx (routes: workforce)
```

instead of the old whole-directory `"pages/admin/ (23 files)"` count, which
attributed every file in a shared directory to each of its modules.

## Result (regenerated inventory)

| | Before | After |
|---|---|---|
| Modules | 153 | 153 |
| Statuses | 153 COMPLETE / 0 other | 153 COMPLETE / 0 other (unchanged — `classifyStatus` never read `web.pages`) |
| Modules with ≥1 page | 149 | 149 |
| Modules with no page | developerGateway, kernel, platform, platformServices | developerGateway, **engineering**, kernel, platformServices |
| Dead alias dirs counted as pages | 7 | 0 |
| False cross-module attributions | engineering → events/webhook | none |

- `platform` (MODULE_META: "Platform Admin UI Shell") now correctly claims
  `admin/PlatformPage` + `dashboard/SuperAdminDashboard` (both routed under
  `/platform`); it was previously reported page-less by accident of the map.
- `engineering` is honestly page-less: its console is a PlatformPage tab,
  exactly the distinction S187–S190 codified.
- The scanner output is deterministic (two consecutive runs produce a
  byte-identical `module-inventory.json`).

## Files changed

- `apps/web/src/router.tsx` — rename marketing `AgentsPage` →
  `MarketingAgentsPage`, repoint `/agents`; `/app/workforce` renders the
  authed agents console again; the file parses (esbuild) again.
- `audit/build-inventory.mjs` — router-table parser (`buildRouterTable`),
  `ROUTE_ALIASES`, router+client grounded `findWebPages(modKey, webClient)`;
  call site passes the resolved client through (one `findWebClient` call
  serves both `web.client` and `web.pages`).
- `audit/module-inventory.json` — regenerated.

The seven dead alias directories are left in place on purpose: Tier 4's
separate filesystem check may still reference them, and deleting repo files is
not this session's call. The scanner simply no longer needs them.
