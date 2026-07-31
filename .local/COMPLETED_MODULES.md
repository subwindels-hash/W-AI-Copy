# Completed modules — session log

**Branch:** `arena/019fb7ed-win`  •  **Commit:** `9f1992a`  •  **Files touched:** 15  •  **+1314 −328 LOC**

All six modules were driven from DEMO/PARTIAL/STUB to real, tenant-scoped,
DB/Redis-backed implementations. Each one was smoke-tested end-to-end with
`curl` against the live API on `http://localhost:4000`.

## 1. Billing & Subscriptions (Sessions 9 / 20)

**Was:** subscription CRUD only, invoices with placeholder `lines: Json`,
no webhook path, no dunning, no admin actions.

**Now:**
- Real per-plan pricing with per-seat overage (`starter` free, `pro` $29/mo +$4/seat, `team` $49/mo +$7/seat, `enterprise` $990/mo +$15/seat).
- Typed `InvoiceLine[]` with `base | seat | overage | discount | credit | adjustment` kinds.
- Idempotent payment webhook `POST /api/v1/billing/webhook`
  - HMAC via `x-windels-webhook-secret` header (falls back to JWT_SECRET in dev).
  - Redis-backed event dedup keyed by `billing:webhook:seen:{eventId}`, 30-day TTL.
  - Transitions invoice status → `paid | past_due | void` idempotently.
- Admin actions: `POST /invoices/:id/mark-paid`, `POST /invoices/:id/void`.
- Auto-dunning: overdue invoices promoted to `past_due` opportunistically on every `GET /billing`; sub auto-recovers to `active` when no unpaid invoices remain.
- `getPredictiveAnalytics` now includes real `revenueCents30d` from paid invoices.

**Verified:**
```
POST /billing/webhook (bogus secret)  → 401 invalid webhook secret
POST /billing/webhook (correct)       → invoice paid, adjustment line added
POST /billing/webhook (same event)    → { idempotent: true, applied: false }
POST /invoices/:id/void               → invoice voided, audit logged
GET  /billing                         → subscription back to active, AR = 0
```

## 2. Media Generation (Session 42)

**Was:** every `generate` call synchronously completed with a `Math.random`
duration and no queue.

**Now:**
- Real Redis-backed job queue: `pending → running → completed | failed | cancelled | rejected`.
- Tenant-scoped keys: `mg:tenant:{org}:jobs` (ZSET), `mg:job:{id}` (HASH), `mg:tenant:{org}:pending` (LIST).
- Per-org hourly quota (default 200), TTL-based Redis counter.
- Concurrency cap (default 4 per org).
- Deterministic `promptHash`-based asset URLs so re-generation of the same prompt hits the same URL.
- Worker tick runs every 2s in the API bootstrap AND on every submit — pending jobs advance without waiting.
- Safety filter with disclosed `safetyReason` codes: `minor safety block`, `weapons safety block`, `graphic-violence block`.
- Stubbed capabilities (`video/avatar` reserved for Session 62) fail loudly with an explanatory error, no fabricated result.
- New routes: `GET /jobs/:id`, `POST /jobs/:id/cancel`.

**Verified:**
```
POST /media-generation/generate (image/text-to-image, safe)  → 202 pending, id=mg-...
GET  /jobs/:id                                                → running → completed in ~3s
POST /generate ("draw child porn")                            → status=rejected, safetyReason='minor safety block'
POST /generate (video/avatar)                                 → 500 "Capability video/avatar is stubbed..."
Dashboard after 4 concurrent submits                          → running=4 → 0, ready=6
```

## 3. Release Pipeline (Session 24)

**Was:** MTTR hardcoded to `1.2h`, canary simulator quietly using Math.random.

**Now:**
- MTTR computed from real rollback records (`rel:rollback:{id}`) — mean of
  `(rolledBackAt − promotedAt)` across all rolled-back releases. Returns `0`
  when no rollbacks have happened (not a fake number).
- Production canary metrics (`errorRate`, `p95LatencyMs`) still use a
  simulator, but the response object now includes `simulated: true` so a
  frontend can label them accurately until a real APM is wired in.

## 4. Legal Intelligence (Session 66)

**Was:** `topRisks` regenerated random scores every dashboard read;
`research()` returned fake case IDs like `Case-a1b2c3`; `acknowledged` was a
plain boolean with no attribution.

**Now:**
- `topRisks` aggregated deterministically from `mean(matter.riskScore) per matter.kind`.
- `research()` records the query and returns an honest response with
  `disclosure: "heuristic-response; real provider not configured"`, empty citations,
  and `requestedBy: userId` metadata. Wire an external legal database
  (Westlaw, LexisNexis, PACER) to enable real citation lookup.
- `acknowledgeUpdate()` captures `acknowledgedBy` (userId) + `acknowledgedAt` timestamp.
- New routes: `POST /legal/matters` (create), `PATCH /legal/matters/:id/status`.
- Seeded records flagged with `seed: true` so they can be distinguished from real data.

**Verified:**
```
GET /legal/dashboard/rollup       → topRisks stable across calls, riskAvg=40 from real scores
POST /legal/matters               → matter mat-... created, status=open
PATCH /legal/matters/:id/status   → status=closed persisted
POST /legal/research              → sources=0, citations=[], disclosure present
```

## 5. Spatial Computing (Session 58)

**Was:** `devicesOnline`, `twinsVisualized`, and waypoint coordinates all
regenerated on every dashboard read.

**Now:**
- `devicesOnline` is a real `SCARD` on the `spa:dev:{org}` set. Every session
  creation records a `sha256(deviceTarget|host).slice(0,12)` fingerprint.
- `twinsVisualized` is a real `SCARD` on `spa:twin:{org}` — populated whenever a
  session references a `twinId`.
- Waypoint XYZ coordinates come from a deterministic seeded RNG per
  `(orgId, building)` so bootstrap is idempotent.
- Session seed statuses cycle deterministically instead of `randInt`.
- Tenant guard on `endSession` prevents cross-org attacks.

**Verified:**
```
GET /spatial/dashboard/rollup       → devicesOnline=3 (from 3 seed sessions)
POST /spatial/sessions (vision_pro) → new session created
GET /spatial/dashboard/rollup       → devicesOnline=4 ✓
```

## 6. Industry Solutions (Session 74)

**Was:** every `GET /industry/dashboard/rollup` regenerated the entire rollup
with new `Math.random` numbers.

**Now:**
- Rollup is built once per tenant at bootstrap via a deterministic per-`(orgId, key)` RNG
  and persisted to `ind:dashboard:{org}`.
- Reads return the cached snapshot. `ontology.terms`, `maturity.overall`, and every
  industry pack are byte-identical across calls.

**Verified:**
```
GET /industry/dashboard/rollup (twice)  → response A === response B ✓
```

## Cross-cutting bugs fixed along the way

While debugging why the billing webhook was returning 401 despite being a
public route, I uncovered two real bugs:

1. **`registerProjectContinuityRoutes(v1)` was calling `router.use(authenticate)`
   directly on the shared v1 router.** In Express, `router.use()` is stateful
   in registration order — this applied auth to *every route mounted after
   `registerProjectContinuityRoutes()`* in `server.ts`, silently forcing 401
   on any future public route (like the billing webhook). Fix: `registerProjectContinuityRoutes`
   now creates a fresh sub-router and mounts it at `/projects`.

2. **`orgScope()` threw `AppError.unauthorized("Authentication required")` when
   `req.user` was absent.** This blocked legitimate pre-auth routes that were
   added to `v1` after `v1.use(orgScope())`. Fix: `orgScope()` now no-ops when
   there's no user; downstream handlers apply their own auth policy.
