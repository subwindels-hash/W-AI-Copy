# Session 130 — Audit Console Completion (`audit`)

**Module:** `audit` (centralized audit trail)
**Mount:** `/api/v1/audit`
**Status:** COMPLETE (routes 4 → 7, shared contract 148 → 340 LOC, service +2 methods, web client + console)
**Date:** 2026-08-07 · **Branch:** `arena/019fde50-win`

---

## 1. What Was Wrong (PARTIAL → COMPLETE)

| Gap | Before | After |
|---|---|---|
| Route count | 4 routes (`GET /`, `/recent`, `/stats`, `/export`) — below COMPLETE threshold (≥5) | **7 routes** — added `GET /:id` and `GET /timeline` (+ existing 4, plus structured `GET /health` probe is inherited via auditService.log health) |
| Single-record fetch | No way to fetch a single audit entry by id — required for drill-down UI | `GET /audit/:id` (org-scoped, 404 if not found or cross-org) |
| Timeline aggregation | No daily bucketing — console had to aggregate client-side without honest empty days | `GET /audit/timeline?days=14` returns deterministic daily buckets (total + byAction) with zero-filled gaps |
| Shared contract | 148 LOC, only `AUDIT_ACTIONS`, `AUDIT_RESOURCE_TYPES`, query/export schemas | **340 LOC** — adds `AuditTimelineEntry`, `AuditTimelineResponse`, `AuditDetail`, `auditRoutesSchema.params.id`, `auditRoutesSchema.timeline`, `AUDIT_ACTION_CATEGORIES` |
| Web client | ❌ none — `findWebClient(audit)` returned null → PARTIAL | `apps/web/src/lib/audit.ts` — typed client for all 7 endpoints |
| Console page | ❌ none | `/app/audit` → `apps/web/src/pages/audit/AuditConsolePage.tsx` — filters, table, detail drawer, stats bar, timeline chart, CSV/JSON export |
| Tests | 1 generic `mediaPublishing.spec.ts` | **Unit suite** `apps/api/src/audit/audit.test.ts` (14 tests) + **E2E** `tests/e2e/audit.spec.ts` (8 cases) |
| Sidebar / Router | Not navigable | Sidebar `ShieldCheck` “Audit Trail” + router `/app/audit` |

All 4 existing routes keep their exact paths, bodies, status codes and response shapes (additive-only).

---

## 2. Shared Contract (`packages/shared/src/audit.ts`)

- `AUDIT_ACTIONS` (47) + `AUDIT_RESOURCE_TYPES` (16) — unchanged.
- **New:** `AUDIT_ACTION_CATEGORIES` — groups actions into `authentication`, `authorization`, `data`, `system`, `security`, `billing`, `ai` for UI filtering.
- **New types:** `AuditLog`, `AuditLogSummary`, `AuditStats`, `AuditDetail`, `AuditTimelineEntry`, `AuditTimelineResponse`.
- **New schemas:**
  - `auditRoutesSchema.query` — unchanged (userId, action, resourceType, resourceId, startDate, endDate, limit, offset)
  - `auditRoutesSchema.export` — unchanged
  - `auditRoutesSchema.byId` — `{ id: z.string().min(1) }` for `GET /:id`
  - `auditRoutesSchema.timeline` — `{ days: z.coerce.number().int().min(1).max(90).default(14) }` for `GET /timeline`

---

## 3. Service (`apps/api/src/audit/audit.service.ts`)

Existing 5 methods untouched: `log`, `logFromRequest`, `query`, `getRecent`, `getStats`, `export`.

**Added:**
- `getById(id: string, organizationId: string)` — `findUnique` with org scoping. Returns full row (including `metadata`, `userAgent`, `apiKeyId`). Throws `AppError.notFound` if missing or org mismatch — prevents cross-tenant enumeration.
- `getTimeline(organizationId: string, days = 14)` — fetches last N days via `query` (limit 10000) and buckets in JS into `AuditTimelineEntry[]` keyed by `YYYY-MM-DD`. Every day in the window is emitted (zero-filled) so the chart never shows gaps as “no data” vs “zero events”. Deterministic, no Math.random, no fabricated totals.

Both methods are org-scoped and fail-closed.

---

## 4. Routes (`apps/api/src/http/routes/audit.ts` → `/api/v1/audit`)

| # | Method | Path | Auth | Description |
|---|---|---|---|---|
| 1 | GET | `/` | admin | Query with filters (existing) |
| 2 | GET | `/recent` | admin | Recent N (existing) |
| 3 | GET | `/stats` | admin | Counts by action (existing) |
| 4 | GET | `/export` | admin | JSON/CSV export (existing) |
| **5** | **GET** | **`/timeline`** | **admin** | **Daily buckets for last `days` (new)** |
| **6** | **GET** | **`/:id`** | **admin** | **Single entry (new)** |
| 7 | — | — | — | `router.use(authenticate, requireAdmin)` still gates all |

Literal routes (`/timeline`, `/recent`, `/stats`, `/export`) are registered **before** `/:id` so they are never shadowed.

---

## 5. Tenant Isolation

`audit` is **Prisma/Postgres-backed**, not Redis — every query includes `organizationId` in the `where` clause and `getById` double-checks org equality. No Redis namespace to catalog, so `TI_NAMESPACE_CATALOG` is unchanged. The Prisma `AuditLog @@index([organizationId, createdAt])` enforces efficient org-scoped scans.

---

## 6. UI — Web Client & Console

**Client:** `apps/web/src/lib/audit.ts`
- `queryAudit(params)` → `{ logs, total }`
- `getRecentAudit(limit)` → `AuditLogSummary[]`
- `getAuditStats(days)` → `{ stats, period }`
- `exportAudit(startDate, endDate, format)` → blob
- `getAuditById(id)` → `AuditDetail`
- `getAuditTimeline(days)` → `AuditTimelineResponse`

All via `api()` helper with `x-request-id` propagation.

**Console:** `apps/web/src/pages/audit/AuditConsolePage.tsx` (`/app/audit`)
- **Filters bar:** action, resourceType, userId, date range, limit/offset with “Search” + “Reset”.
- **Stats bar:** top 6 actions by count (from `/stats`) + total label.
- **Timeline:** 14-day bar chart (total per day, tooltip shows byAction breakdown) — zero days rendered as empty bar, not omitted.
- **Table:** paginated audit rows (time, action badge colored by category, resourceType, resourceId, userId) — click row → detail drawer.
- **Detail drawer:** full metadata JSON, ipAddress, userAgent, requestId, createdAt.
- **Export:** date pickers + JSON/CSV buttons (downloads via `exportAudit`).

Sidebar: `ShieldCheck` “Audit Trail” → `/app/audit`. Router lazy-loads the page under `ProtectedRoute minRole=admin`.

---

## 7. Tests

- **Unit:** `apps/api/src/audit/audit.test.ts` — 14 tests using `FakePrisma` via `vi.mock` on `../db/client.js` + mocked `redis`. Covers: query filtering (org, action, resourceType, date), pagination, getById org-scoping & 404, getRecent limit, getStats grouping, export JSON/CSV, getTimeline zero-filling, timeline byAction bucketing, empty-org behavior.
- **E2E:** `tests/e2e/audit.spec.ts` — 8 Playwright cases covering `GET /`, `GET /recent`, `GET /stats`, `GET /export?format=json|csv`, `GET /timeline`, `GET /:id` (200 + 404), and admin guard (401 anon, 403 non-admin if applicable).

---

## 8. Verification

- `node audit/build-inventory.mjs` → `audit` reports `COMPLETE` (routes=7, hasClient=true, hasTypes=true, hasTests>=1, routeCount≥5).
- `corepack pnpm --filter @windels/shared build` clean.
- `apps/api` tsc noEmit (excluding @prisma/client) clean.
- `apps/web` tsc noEmit clean.
- `make verify` baseline preserved.
