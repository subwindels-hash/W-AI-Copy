# SESSION 93 SPECIFICATION — WEBSITE BUILDER (ENTERPRISE SITE & PAGE BUILDER)

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S92, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Enterprise Applications
```

---

## 1. OBJECTIVES & ARCHITECTURE

The master specification's Phase-3 Enterprise Applications list **Website
Builder** ("CRM, ERP, Website Builder, Email Intelligence, Social Platform,
Trading Intelligence, Marketplace") and later updates pair it with Canvas
Builder and Creative Studio. After Sessions 90–92 it is the next named
application still missing. Session 93 adds it:

1. **Sites** — org-scoped website records with slug, optional domain, theme,
   and an honest lifecycle (draft → published | archived).
2. **Pages & blocks** — hierarchical pages under a site, each built from
   typed, validated blocks (hero / text / image / button / features / cta /
   divider / html). Blocks are ordered and editable via a real API.
3. **Deterministic HTML renderer** — a pure block→HTML renderer with output
   escaping; preview and publish produce real, deterministic snapshots
   (`renderedHtml`), never fabricated.
4. **Publish pipeline** — publishing a site (or page) validates, flips
   status, stamps `publishedAt` only on the transition, and snapshots the
   rendered HTML of every published page.
5. **AI copy assistance** — hero/section/CTA copy via the AI ProviderRegistry
   with honest labeling (`modelSource: real|echo-demo`) and a deterministic
   fallback.
6. **Deterministic rollup** — site/page/block counts computed per read.
7. **Tenant isolation by construction** — `wb:*` org-scoped keys, fail-closed
   reads, and the namespaces registered in the Session 89 audit catalog.

```
                 WEBSITE BUILDER
                 ---------------
   [sites]   ->  wb:site:i:<org>:<id>      (site records + lifecycle)
   [pages]   ->  wb:page:i:<org>:<id>      (pages + ordered blocks)
   [render]  ->  pure block→HTML renderer  (escaped, deterministic)
   [publish] ->  snapshot renderedHtml per page; stamp publishedAt on change
   [rollup]  ->  computed per read (never invented)
```

---

## 2. DATA MODEL

All types live in `packages/shared/src/websiteBuilder.ts` (prefixed `Wb`).

### 2.1 Site

`id` (`wbs-`), `organizationId`, `name` (required), `slug` (required, unique
per org, lowercase alphanumeric + dashes), `domain` (validated when present),
`description?`, `themeColor` (CSS hex, default `#0ea5e9`), `status`
(`draft | published | archived`), `publishedAt?` (stamped only on the
draft→published transition), `createdAt`/`updatedAt`.

### 2.2 Page

`id` (`wbp-`), `organizationId`, `siteId`, `path` (required, starts with `/`,
unique per site; `/` reserved for the home page), `title` (required),
`seoDescription?`, `isHome` (derived from `path === "/"`), `status`
(`draft | published`), `publishedAt?`, `renderedHtml?` (snapshot from the
real renderer), `blocks[]` (ordered `WbBlock[]`), `createdAt`/`updatedAt`.

### 2.3 Block

`id` (`wbb-…`), `type` (`hero | text | image | button | features | cta |
divider | html`), `props` (typed per block), `order` (int ≥ 0).

Typed props:

- `hero`: `headline`, `subheadline?`, `ctaLabel?`, `ctaHref?`, `align?`
- `text`: `body`
- `image`: `src` (URL), `alt`, `caption?`
- `button`: `label`, `href`, `variant?` (`primary | secondary | outline`)
- `features`: `title?`, `items: { title, description }[]` (1–6)
- `cta`: `headline`, `subheadline?`, `buttonLabel?`, `buttonHref?`
- `divider`: no props
- `html`: `content` (raw HTML — rendered as-is, explicitly labeled)

### 2.4 Site detail

`WbSiteDetail extends WbSite` — `pages: WbPage[]`, `blocksTotal` (computed).

### 2.5 Operations rollup (computed per read)

`WbRollup`: `counts` (`sites`, `publishedSites`, `archivedSites`, `pages`,
`publishedPages`, `blocks`), `recentSites` (up to 5 by updatedAt),
`totalRenderedBytes` (sum of `renderedHtml.length` across published pages),
`lastUpdatedAt`.

---

## 3. STORAGE & TENANT ISOLATION

- Redis-backed, org-scoped: `wb:site:i:<org>:<id>`, `wb:page:i:<org>:<id>`.
- Reads re-parse the stored `organizationId` and refuse on mismatch.
- The Session 89 catalog gains `wb:site`, `wb:page` as `org_scoped`.
- Writes emit Kernel events (`wb.site.created`, `wb.page.published`, …).

## 4. RENDERER (REAL, NOT SIMULATED)

`renderPageHtml(page)` is a pure function: each block maps to deterministic
HTML with proper escaping of text fields (headlines, captions, button
labels, feature text) and structural attributes (hrefs, image src, alt). The
`html` block passes raw content through unchanged (labeled). `preview` and
`publish` both use this renderer — the snapshot is what the renderer
produces, never a fabricated string.

## 5. DEMO DATA POLICY

Fresh orgs start empty. `WINDELS_DEMO_DATA=true` seeds an idempotent demo
(`org-demo-wb`): 1 published marketing site with 3 pages (home with hero +
features + cta, about with text, contact with button), all rendered. See
`apps/api/src/websiteBuilder/bootstrap.ts`.

## 6. API SURFACE (`/api/v1/website-builder`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/rollup` | computed rollup |
| GET/POST | `/sites` | list (filter `q`, `status`) / create |
| GET/PATCH/DELETE | `/sites/:id` | read / update / delete |
| GET | `/sites/:id/detail` | site + pages + blocksTotal |
| POST | `/sites/:id/publish` | publish (snapshots all pages) |
| POST | `/sites/:id/archive` | archive |
| GET/POST | `/sites/:id/pages` | list / create page |
| GET/PATCH/DELETE | `/pages/:id` | read / update / delete |
| POST | `/pages/:id/publish` | publish one page (snapshot) |
| GET | `/pages/:id/preview` | rendered HTML |
| POST | `/pages/:id/blocks` | add block |
| PATCH/DELETE | `/pages/:id/blocks/:blockId` | update / remove block |
| POST | `/pages/:id/blocks/reorder` | reorder blocks |
| POST | `/intelligence/copy` | AI copy (`kind`, `context`) with honest labeling |

## 7. DELIVERY SLICE

1. `packages/shared/src/websiteBuilder.ts` (+ index export)
2. `apps/api/src/websiteBuilder/renderer.ts` — pure block→HTML renderer
3. `apps/api/src/websiteBuilder/websiteBuilder.service.ts`
4. `apps/api/src/websiteBuilder/bootstrap.ts` — demo seed (gated)
5. `apps/api/src/http/routes/websiteBuilder.ts` + server/index wiring
6. `tenantIsolation.service.ts` — register `wb:*` namespaces
7. `apps/web/src/lib/websiteBuilder.ts` + `pages/websiteBuilder/WebsiteBuilderPage.tsx` + router + sidebar
8. `apps/api/src/websiteBuilder/websiteBuilder.test.ts`
9. Decision log, PROGRESS.md, CHANGELOG.md

## 8. DEFINITION OF DONE

- [ ] `pnpm build` + `pnpm typecheck` pass; `make verify` green.
- [ ] No `Math.random` in read paths; all guard suites pass.
- [ ] Cross-tenant test proves org B cannot read org A's sites/pages.
- [ ] Renderer test proves deterministic, escaped output; publish snapshot
      equals the renderer output.
- [ ] AI copy carries explicit `modelSource` labeling.
- [ ] UI renders real API data with demo-honesty rules intact.
