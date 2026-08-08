# Session 130 Runtime Validation Checklist — Audit Console (`audit`)

> **Status:** 🟡 pending target-environment execution. Run against live PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted. Until every box is ticked and signed, Session 130 stays 🟡 VERIFIED (partial).

The unit suite proves org-scoped query, getById, stats, export and timeline bucketing against FakePrisma/Fake Redis; only a live deployment proves real Postgres indexes, real Redis `audit:log:<org>:recent` trimming, and live auth wiring behave as assumed.

---

## 1. Backwards Compatibility & Route Mounting

- [ ] `GET /api/v1/audit`, `GET /api/v1/audit/recent`, `GET /api/v1/audit/stats`, `GET /api/v1/audit/export` answer on their original paths/shapes without interruption.
- [ ] `GET /api/v1/audit/timeline?days=14` returns `200 OK` with `{ days, entries: AuditTimelineEntry[] }` — every day in window present (zero-filled).
- [ ] `GET /api/v1/audit/:id` returns `200 OK` with full `AuditDetail` for same-org id, and `404` for missing or cross-org id.
- [ ] Literal routes (`/timeline`, `/recent`, `/stats`, `/export`) are not shadowed by `/:id` (request `GET /timeline` does not hit the `:id` handler).
- [ ] All `/api/v1/audit/*` endpoints refuse anonymous callers (`401`) and non-admin callers (`403`).

---

## 2. Service Correctness

- [ ] `auditService.log()` writes to `AuditLog` (Prisma) and `lPush`+`lTrim` to `audit:log:<org>:recent` (last 1000).
- [ ] `auditService.query({ organizationId })` never returns rows from another organization.
- [ ] `auditService.getById(id, orgId)` returns 404 when `organizationId` mismatches (no cross-tenant leak).
- [ ] `auditService.getStats(orgId, days)` groups by `action` for rows with `createdAt >= now - days`.
- [ ] `auditService.export(orgId, start, end, "csv")` produces header `id,action,resourceType,resourceId,userId,organizationId,ipAddress,requestId,createdAt` with proper CSV escaping.
- [ ] `auditService.getTimeline(orgId, 14)` returns 14 entries ordered ascending by date, each with `total` and `byAction` that sum to `total`, gaps zero-filled.

---

## 3. Tenant Isolation

- [ ] Prisma `AuditLog` query plans use `@@index([organizationId, createdAt])` (EXPLAIN shows index scan, not seq scan).
- [ ] Cross-org `GET /:id` and `GET /?organizationId=other` return 404/empty, never leak rows.

---

## 4. UI & Audit Verification

- [ ] `/app/audit` renders filters, stats bar, 14-day timeline, paginated table, detail drawer and export buttons without console errors.
- [ ] Clicking a table row opens the drawer with full metadata JSON, ipAddress, userAgent, requestId.
- [ ] Export JSON downloads valid JSON array; Export CSV downloads valid CSV with header row.
- [ ] Sidebar shows “Audit Trail” entry navigating to `/app/audit` (visible to admin roles).
- [ ] `node audit/build-inventory.mjs` lists `audit` as **COMPLETE** (routes=7, hasClient=true, hasTypes=true, hasTests>=1).
