# SESSION 90 SPECIFICATION — ENTERPRISE CRM (CUSTOMER RELATIONSHIP MANAGEMENT)

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S89, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Enterprise Applications
```

---

## 1. OBJECTIVES & ARCHITECTURE

The master specification's enterprise update roadmap lists **CRM** as one of the
Phase-3 Enterprise Applications ("CRM, ERP, Website Builder, Email Intelligence,
Social Platform, Trading Intelligence, Marketplace") and Session 32's meeting
intelligence writes through "to CRM, Project, Knowledge Graph, and Enterprise
Memory". Until now the platform has had **no CRM surface at all** — contacts,
companies, deals and pipeline activity had nowhere to live.

Session 90 adds the first-class CRM application layer:

1. **Contact & company registry** — real, org-scoped CRUD for people and the
   accounts they belong to, with tags, sources, statuses and owners.
2. **Deal pipeline** — stage-aware opportunities with amounts, probabilities,
   expected close dates and an audit trail of every stage transition.
3. **Activity ledger** — notes / emails / calls / meetings / tasks linked to
   contacts, deals and companies.
4. **Deterministic pipeline intelligence** — a dashboard rollup computed from
   what is actually stored (weighted forecast, conversion rate, per-stage
   breakdown) — no randomized or fabricated numbers.
5. **Tenant isolation by construction** — every record is stored under an
   org-scoped Redis key (`crm:*:<org>:*`) and every read re-checks the org
   segment, following the Session 89 guarantee. The `crm:*` namespaces are
   registered in the Session 89 isolation-audit catalog so they are audited
   like every other org-scoped namespace.

```
                 ENTERPRISE CRM
                 ---------------
   [contacts] ->  crm:contact:i:<org>:<id>      (person records)
   [companies] -> crm:company:i:<org>:<id>      (accounts)
   [deals]    ->  crm:deal:i:<org>:<id>         (pipeline opportunities)
   [activities]-> crm:activity:i:<org>:<id>     (notes/calls/emails/tasks)
   [rollup]   ->  computed per read from the four stores (never invented)
```

---

## 2. DATA MODEL

All types live in `packages/shared/src/crm.ts` (single source of truth shared
by the API service, routes and web client). Types are prefixed `Crm`.

### 2.1 Contact

| Field | Type | Notes |
|---|---|---|
| `id` | string | `crmc-` + 8 random hex chars (CSPRNG) |
| `organizationId` | string | tenant segment — written into the key itself |
| `firstName` / `lastName` | string | both required, trimmed |
| `email` | string \| null | validated when present |
| `phone` | string \| null | free-form E.164-ish string |
| `companyId` | string \| null | FK to a company in the same org |
| `title` | string \| null | job title |
| `source` | `referral \| website \| event \| inbound \| outbound \| partner \| other` | acquisition channel |
| `status` | `lead \| prospect \| customer \| churned` | lifecycle state |
| `tags` | string[] | ≤ 20 short labels |
| `ownerId` | string \| null | platform user id (may be empty in single-admin orgs) |
| `notes` | string \| null | free text |
| `createdAt` / `updatedAt` | ISO string | server-set |

### 2.2 Company

`id` (`crmco-`), `organizationId`, `name` (required), `domain` (validated when
present), `industry` (free text), `sizeBand`
(`micro \| small \| mid \| large \| enterprise \| unknown`), `website` (URL when
present), `city`, `country`, `tags`, `createdAt` / `updatedAt`.

### 2.3 Deal & Pipeline

A deal always belongs to a company; `contactId` is optional. Fields: `id`
(`crmd-`), `organizationId`, `name` (required), `companyId` (required),
`contactId`, `amountCents` (integer ≥ 0), `currency` (ISO 4217, default
`USD`), `stage`, `probabilityPct` (0–100, derived from stage default but
overridable), `expectedCloseAt` (ISO date string \| null), `tags`, `ownerId`,
`createdAt` / `updatedAt`, plus transition metadata `wonAt` / `lostAt` /
`stageChangedAt` (ISO strings, set only when the stage actually changes).

Default pipeline stages (fixed, ordered, with default probabilities):

| key | label | order | default probability |
|---|---|---|---|
| `lead` | Lead | 0 | 10% |
| `qualified` | Qualified | 1 | 30% |
| `proposal` | Proposal | 2 | 50% |
| `negotiation` | Negotiation | 3 | 70% |
| `closed_won` | Closed Won | 4 | 100% |
| `closed_lost` | Closed Lost | 5 | 0% |

**Stage transitions are recorded as activities** (`kind: note`, subject
`"Deal moved to <label>"`) so the pipeline has a real audit trail.

### 2.4 Activity

`id` (`crma-`), `organizationId`, `kind`
(`note \| email \| call \| meeting \| task`), `subject` (required), `body`
(optional), nullable links `contactId` / `dealId` / `companyId`, `dueAt` /
`completedAt` (ISO \| null), `createdAt`, `createdBy`.

### 2.5 Dashboard rollup (computed, never stored)

`CrmDashboardRollup`:

- `counts`: `contacts`, `companies`, `openDeals`, `closedWonDeals`,
  `closedLostDeals`, `activities`
- `pipeline`: per-stage `{ stageKey, label, order, count, sumCents }`
- `forecastCents` — Σ amount × probability across open deals
- `openPipelineCents` — Σ amount across open deals
- `closedWonCents` — Σ amount of `closed_won` deals
- `conversionRate` — `closedWon / (closedWon + closedLost)` as 0–1, or `null`
  when no closed deals exist (never a fabricated number)
- `topDeals` — up to 5 open deals by amount
- `recentActivities` — up to 10 activities by recency
- `lastUpdatedAt` — ISO string of the latest write in the org (or the org's
  first record timestamp)

---

## 3. STORAGE & TENANT ISOLATION

- Redis-backed; every key embeds the org id: `crm:<entity>:i:<orgId>:<id>`.
- Index ZSET per entity per org (`crm:<entity>:idx:<orgId>`), scored by
  `Date.now()` so list reads are newest-first.
- `get` / `update` / `delete` re-parse the stored `organizationId` and refuse
  when it does not match the caller's org (defense in depth — the key layout
  and the value both carry the tenant).
- The Session 89 namespace catalog gains the four `crm:*` namespaces as
  `org_scoped`, so the live isolation audit covers CRM automatically.
- All writes that change CRM state emit a Kernel event
  (`crm.contact.created`, `crm.deal.updated`, …) via the existing
  `KernelService.dispatch` (best effort, same pattern as Session 89).

## 4. DEMO DATA POLICY

A fresh org starts **empty** — the dashboard shows zeros and real activity.
`WINDELS_DEMO_DATA=true` opts a local/demo environment into a deterministic
seed (3 companies, 5 contacts, 6 deals across pipeline stages, 4 activities)
so the UI can be exercised. The seed is additive, idempotent (skips when the
org already has contacts) and never runs by default. See
`apps/api/src/crm/bootstrap.ts`.

## 5. API SURFACE (`/api/v1/crm`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/rollup` | computed pipeline intelligence |
| GET | `/pipeline/stages` | default pipeline definition |
| GET/POST | `/contacts` | list (filter `q`, `companyId`, `status`) / create |
| GET/PATCH/DELETE | `/contacts/:id` | read / update / delete |
| GET/POST | `/companies` | list (filter `q`, `industry`) / create |
| GET/PATCH/DELETE | `/companies/:id` | read / update / delete |
| GET/POST | `/deals` | list (filter `stage`, `companyId`) / create |
| GET/PATCH/DELETE | `/deals/:id` | read / update (stage transitions audited) / delete |
| GET/POST | `/activities` | list (filter `contactId`, `dealId`, `kind`) / create |
| GET/DELETE | `/activities/:id` | read / delete |

Every handler validates against the shared Zod schemas, enforces the org from
the authenticated user, and returns the standard `{ ok, data, meta }` envelope.

## 6. DELIVERY SLICE (vertical, in order)

1. `packages/shared/src/crm.ts` — Zod schemas + types (+ export in index)
2. `apps/api/src/crm/crm.service.ts` — org-scoped service
3. `apps/api/src/crm/bootstrap.ts` — demo seed (gated)
4. `apps/api/src/http/routes/crm.ts` + mount in `http/server.ts` (+ bootstrap
   wiring in `index.ts`)
5. `apps/api/src/tenantIsolation/tenantIsolation.service.ts` — register
   `crm:*` namespaces in the isolation-audit catalog (additive)
6. `apps/web/src/lib/crm.ts` — typed client
7. `apps/web/src/pages/crm/CrmPage.tsx` + router + sidebar entry
8. `apps/api/src/crm/crm.test.ts` — vitest suite (CRUD, validation, pipeline
   transitions, cross-tenant isolation, rollup determinism)
9. Decision log (`CONVENTIONS.md`), `PROGRESS.md`, `docs/CHANGELOG.md`

## 7. DEFINITION OF DONE

- [ ] Build (`pnpm build`) and typecheck (`pnpm typecheck`) pass.
- [ ] Unit suite green (`pnpm test`) — CRM suite included.
- [ ] Every read path is deterministic (no `Math.random`), passes the repo's
      `noRandomData` guard.
- [ ] Cross-tenant test proves org B cannot read org A's records.
- [ ] UI renders real data from the API with demo-data honesty rules intact.
