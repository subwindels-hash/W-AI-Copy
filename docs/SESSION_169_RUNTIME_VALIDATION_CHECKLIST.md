# Session 169 — Industry Solutions Runtime Validation Checklist

Gate status: 🟡 **VERIFIED (partial)** — Code, unit tests, and browser typecheck are green in-sandbox. Live target environment validation against PostgreSQL 17 + Redis 8 + `prisma generate` is pending deployment.

## Verification Checklist

### 1. Database & Cache Persistence
- [ ] Redis keys `ind:meta:<org>` are written only during explicit server bootstrap, not on GET requests.
- [ ] Redis keys `ind:adopt:idx:<org>` and `ind:adopt:i:<org>:<id>` store tenant adoptions with valid TTL/persistence.
- [ ] Cross-tenant probe: `ind:adopt:i:<orgA>:<id>` is unreachable when authenticated as `<orgB>`.

### 2. HTTP Endpoints
- [ ] `GET /api/v1/industry/dashboard/rollup` returns 200 with `{ ok: true, data: { ... } }`.
- [ ] `GET /api/v1/industry/suites` returns the 25 standard vertical suites.
- [ ] `GET /api/v1/industry/adoptions` returns the list of adoptions for the caller's organization.
- [ ] `POST /api/v1/industry/adoptions` creates a new adoption with 201 Created and valid schema.
- [ ] `GET /api/v1/industry/adoptions/:id` retrieves the record by id (404 for wrong org or non-existent id).
- [ ] `PATCH /api/v1/industry/adoptions/:id` updates status and employees.
- [ ] `DELETE /api/v1/industry/adoptions/:id` removes the record and returns 204 No Content.

### 3. Metric Honesty & Null Affordances
- [ ] Fresh tenant with no adoptions returns `adoptions: []` and 0 total employees covered.
- [ ] `semanticSearchLatencyMs` is `null` when no semantic search was measured.
- [ ] `maturity.overall` and dimension scores are `null` when unassessed.
- [ ] Web UI at `/app/industry` renders `—` (em-dash) for null values, never `0` or `NaN`.

### 4. Tenant Isolation
- [ ] Token without `organizationId` receives 403 Forbidden with `{ code: "FORBIDDEN" }`.
- [ ] Organization A cannot access or mutate Organization B's adoption records.
- [ ] `node audit/build-inventory.mjs` verifies `ind:*` keys as conforming `org_scoped`.
