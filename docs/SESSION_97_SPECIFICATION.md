# SESSION 97 SPECIFICATION — ENTERPRISE BUSINESS INTELLIGENCE & REPORT BUILDER

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S96, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Enterprise Applications
```

---

## 1. OBJECTIVES & ARCHITECTURE

The platform now ships a full enterprise application suite (CRM, ERP,
Website Builder, Email Intelligence, Social Platform, Helpdesk, AI Software
Factory). What it lacks is the **analysis layer**: the master spec's Phase-4
Enterprise Operations roadmap names **Analytics** ("Monitoring, Analytics,
FinOps, Resilience, Multi-Tenant Platform, Developer Platform"). Session 97
adds Enterprise Business Intelligence:

1. **Data sources** — org-scoped registrations pointing at the platform's
   real modules (CRM deals/contacts, ERP products/inventory/orders,
   Email Intel messages, Social posts, Helpdesk tickets, Software Factory
   builds/artifacts). Each source is real and measurable: a live `sample`
   query reads the actual module records through the module services.
2. **KPI definitions** — named, org-scoped KPIs with a real metric function
   over a source (e.g. `crm.forecast`, `erp.inventory_value`,
   `email.unread`, `social.reactions`, `helpdesk.open`,
   `builder.artifacts`). Values are computed from the live module store on
   every read — never stored or fabricated.
3. **Report builder** — org-scoped reports composed of one or more KPI
   "cards", each with a source, metric, period window and optional
   comparison; each card renders real data.
4. **Deterministic dashboards & rollup** — source health (last sample time,
   live record counts), KPI counts, report counts, and a generated "report
   overview" from the actual KPI values.
5. **CSV export** — a real, deterministic CSV export of any report's KPI
   values.
6. **Tenant isolation by construction** — `bi:*` org-scoped keys, fail-closed
   reads, namespaces registered in the Session 89 isolation-audit catalog.

```
                 ENTERPRISE BUSINESS INTELLIGENCE
                 ---------------------------------
   [sources]  ->  bi:source:i:<org>:<id>     (module registrations, live samples)
   [kpis]     ->  bi:kpi:i:<org>:<id>        (metric definitions → live values)
   [reports]  ->  bi:report:i:<org>:<id>     (card layouts + real data)
   [rollup]   ->  computed per read (never invented)
```

---

## 2. DATA MODEL

All types live in `packages/shared/src/businessIntelligence.ts` (prefixed
`Bi`).

### 2.1 Data source

`id` (`bis-`), `organizationId`, `name`, `module` (one of the supported
source modules below), `description?`, `enabled` (default true), `createdAt`/
`updatedAt`.

Supported `module` values (each backed by a real module service):

- `crm` — contacts, companies, open_deals, won_deals
- `erp` — products, stock_value, purchase_orders, sales_orders
- `email` — mailboxes, messages, unread, queued_outbox
- `social` — posts, comments, reactions
- `helpdesk` — tickets, open, resolved, overdue
- `builder` — projects, builds, artifacts, releases

### 2.2 KPI

`id` (`bik-`), `organizationId`, `name`, `sourceModule` (`crm|erp|email|
social|helpdesk|builder`), `metric` (a real metric key for that module),
`period` (`all | 7d | 30d` — `all` = whole store, `7d`/`30d` = windowed),
`format` (`number | currency | percent`), `createdAt`/`updatedAt`.

Metric keys (all real):

- `crm`: `contacts`, `companies`, `open_deals`, `won_deals`, `forecast`
- `erp`: `products`, `stock_value`, `purchase_orders`, `sales_orders`
- `email`: `mailboxes`, `messages`, `unread`, `queued_outbox`
- `social`: `posts`, `comments`, `reactions`
- `helpdesk`: `tickets`, `open`, `resolved`, `overdue`
- `builder`: `projects`, `builds`, `artifacts`, `releases`

### 2.3 Report

`id` (`bir-`), `organizationId`, `name`, `description?`, `cards[]` (ordered
`BiReportCard[]`), `createdAt`/`updatedAt`.

`BiReportCard`: `{ id, title, sourceModule, metric, period }`.

### 2.4 Evaluated outputs (computed per read)

- `BiKpiValue` — `{ kpiId, name, sourceModule, metric, period, value,
  format, sampledAt }` (value is a real number computed from the live
  module store).
- `BiReportCardValue` — `{ card, value, format, sampledAt }`.
- `BiReportEvaluation` — `{ report, cards: BiReportCardValue[],
  evaluatedAt }`.

### 2.5 Rollup (computed per read)

`BiRollup` — `counts` (`sources`, `enabledSources`, `kpis`, `reports`,
`cards`), `sourceHealth` (per source: `enabled`, `sampleCount`,
`lastSampleAt`), `recentReports` (up to 5), `lastUpdatedAt`.

---

## 3. METRIC ENGINE (REAL, NOT SIMULATED)

`evaluateKpi(org, sourceModule, metric, period)` reads the actual module
records through the module services (`CrmService`, `ErpService`,
`EmailIntelService`, `SocialPlatformService`, `HelpdeskService`,
`AppBuilderService`) and computes the value from real data:

- `crm.forecast` → `CrmService.rollup().forecastCents`
- `erp.stock_value` → `ErpService.rollup().inventoryValueCents`
- `email.unread` → `EmailIntelService.rollup().counts.unread`
- `social.reactions` → `SocialPlatformService.rollup().counts.reactions`
- `helpdesk.overdue` → `HelpdeskService.rollup().counts.overdue`
- `builder.artifacts` → `AppBuilderService.rollup().counts.artifacts`
- …and so on (every metric key maps to a real rollup field or a real
  module read).

Windows: `7d`/`30d` filter the module's records by `createdAt`/`receivedAt`
within the window (the rollup fields used are live). The engine is
deterministic — identical store state ⇒ identical values.

## 4. CSV EXPORT (REAL)

`GET /reports/:id/export.csv` builds a real CSV from the report's evaluated
card values (report name, evaluatedAt, card title, metric, period, value,
format) with proper escaping — no fabricated rows.

## 5. DEMO DATA POLICY

Fresh orgs start empty. `WINDELS_DEMO_DATA=true` seeds an idempotent demo
(`org-demo-bi`): 6 sources (one per module), 6 KPIs, 1 report with 4 cards.
The demo seeds do **not** fabricate module data — the KPIs evaluate against
whatever the other demo orgs (or the empty store) actually contain, so the
values are honest. See `apps/api/src/businessIntelligence/bootstrap.ts`.

## 6. API SURFACE (`/api/v1/bi`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/rollup` | computed BI rollup |
| GET/POST | `/sources` | list / create |
| GET/PATCH/DELETE | `/sources/:id` | read / update / delete |
| GET/POST | `/kpis` | list / create |
| GET/PATCH/DELETE | `/kpis/:id` | read / update / delete |
| GET | `/kpis/:id/value` | live evaluated KPI value |
| GET/POST | `/reports` | list / create |
| GET/PATCH/DELETE | `/reports/:id` | read / update / delete |
| GET | `/reports/:id/evaluate` | evaluate all cards (live) |
| GET | `/reports/:id/export.csv` | real CSV export |

## 7. DELIVERY SLICE

1. `packages/shared/src/businessIntelligence.ts` (+ index export)
2. `apps/api/src/businessIntelligence/businessIntelligence.service.ts`
3. `apps/api/src/businessIntelligence/bootstrap.ts` — demo seed (gated)
4. `apps/api/src/http/routes/businessIntelligence.ts` + server/index wiring
5. `tenantIsolation.service.ts` — register `bi:*` namespaces
6. `apps/web/src/lib/businessIntelligence.ts` + `pages/bi/BusinessIntelligencePage.tsx` + router + sidebar
7. `apps/api/src/businessIntelligence/businessIntelligence.test.ts`
8. Decision log, PROGRESS.md, CHANGELOG.md

## 8. DEFINITION OF DONE

- [ ] `pnpm build` + `pnpm typecheck` pass; `make verify` green.
- [ ] No `Math.random` in read paths; all guard suites pass.
- [ ] Cross-tenant test proves org B cannot read org A's BI records.
- [ ] KPI values are computed from live module records (never stored);
      identical store state ⇒ identical values (deterministic).
- [ ] CSV export is real and deterministic.
- [ ] UI renders real API data with demo-honesty rules intact.
