# Session 198 — runtime validation checklist

**Focus:** inventory scanner `web.pages` detection + `router.tsx` build fix.
**Sandbox status:** scanner and router checks executed here; the web
production build itself needs the target environment's `pnpm install`
(node_modules are not present in this sandbox).

## 1. Build gates (target environment)

```bash
corepack pnpm --filter @windels/shared build
cd apps/web
corepack pnpm exec tsc --noEmit -p tsconfig.json   # was impossible before: router.tsx SyntaxError
corepack pnpm build                                 # bundle must include AgentsPage (app console)
```

Expected: typecheck and build pass. Before this session `router.tsx` failed to
parse at all (`The symbol "AgentsPage" has already been declared`).

## 2. Router behaviour

1. Visit `/agents` (public) → marketing agents page under `MarketingLayout`.
2. Sign in, visit `/app/workforce` → the authed agents console
   (`pages/agents/AgentsPage`, "Workforce Hub"), not the marketing page.

## 3. Scanner

```bash
node audit/build-inventory.mjs
node audit/build-inventory.mjs   # second run must be byte-identical
```

Expected:

- `153 COMPLETE / 0 PARTIAL / 0 STUB` (unchanged).
- `web.pages` entries are file-level and name routes, e.g.
  `apps/web/src/pages/bi/BusinessIntelligencePage.tsx (routes: bi, businessIntelligence)`.
- No module claims `pages/businessIntelligence/`, `pages/enterpriseSearch/`,
  `pages/enterpriseFinOps/`, `pages/mediaFactory/`,
  `pages/promptTemplates/`, `pages/apiKeys/` or `pages/canvasCollab/`
  (unrouted alias dirs).
- `engineering` reports no page (PlatformPage tab only); `platform` claims
  `admin/PlatformPage` + `dashboard/SuperAdminDashboard`.
- Spot-check client attribution: `attachments` lists `files/FilesPage`,
  `conversations` lists `chat/ChatPage`, `payments` lists
  `billing/PaymentGatewaysPage`.

## 4. Follow-up (deliberately out of scope)

The seven dead alias page directories are now unnecessary for the inventory;
whether to delete them belongs to a Tier 4 filesystem-check decision, not to
the scanner.
