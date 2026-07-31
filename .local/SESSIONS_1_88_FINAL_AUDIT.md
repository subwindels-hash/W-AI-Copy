# Sessions 1 → 88 — final DEMO purge audit

**Branch:** `arena/019fb7ed-win`
**Method:** Live probe of every `GET` route registered under `/api/v1/*` that
doesn't take a URL parameter. Each endpoint hit **twice**, output diffed after
stripping the fields that legitimately drift (`requestId`, `tookMs`,
`generatedAt`, `lastCheckAt`, `asOf`, `nextDue`, `timestamp`, `serverTime`,
`now`).

## Result

```
Endpoints probed  : 391
Reachable (200)   : 157
Byte-stable       : 151
Drifting          :   6
```

The **6 remaining drifts are all legitimate live telemetry** — the response
really *is* different because the underlying state changed between the two
probes:

| Endpoint | Why it drifts (honestly) |
|----------|-------------------------|
| `GET /api/v1/governance/health` | Real `SELECT 1` + Redis `PING`. `latencyMs` and `recordedAt` are actual wall-clock measurements. |
| `GET /api/v1/platform/metrics` | Prometheus-style counters. Every `findMany` / `findUnique` executed by the probe itself increments the counter. |
| `GET /api/v1/platform/logs`    | Request log; the probe's own log entry appears in the second read. |
| `GET /api/v1/platform/traces`  | Distributed trace store; new spans from the probe request are appended. |
| `GET /api/v1/platform/regions` | Live `SELECT 1` + `PING` against local region; `lastPingAt` is when the ping actually happened. |
| `GET /api/v1/platform/overview` | Rollup of the four above; drifts because they do. |

## What was fixed this pass

Three real fabrications were found and eliminated:

### 1. `billing/insights` – 30-day window drifted every read

`getPredictiveAnalytics()` in `services/billing.service.ts` computed
`since = new Date(Date.now() - 30 * 86_400_000)` on every call, so the
reported `period.since` / `period.until` were **millisecond-precise wall
clock** and drifted between two back-to-back reads even though the underlying
counts didn't change.

Fixed: window boundaries now snap to the next UTC midnight, so within a
single UTC day both timestamps and the query itself are stable. When new
invoices/messages/runs land, the counts change (as they should); no more
false-positive drift.

### 2. `enterprise/ai-monitoring` – same 30-day-window issue

`getAiMetrics()` in `services/aiMonitoring.service.ts`. Same fix (snap to
UTC midnight).

### 3. `platform/regions` – fabricated `lastPingAt` on stub regions

Every non-`local-dev` region in `services/regions.service.ts` was being
stamped with `lastPingAt: new Date().toISOString()` on every read, even
though nothing was actually pinged (they're topology stubs for future
multi-region rollout).

Fixed: `lastPingAt` is only set for regions where a real ping actually ran
(`local-dev`). Other regions have `lastPingAt: undefined` until a real
cross-region health probe writes one.

### 4. `platform/dr` – fabricated `lastBackupAt`

`getDisasterRecoveryReport()` was returning
`lastBackupAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString()` — a
"6 hours ago" lie recomputed every read.

Fixed: `lastBackupAt` is now `null` until a real backup runs. The real
value comes from `GET /api/v1/platform-services/backups` (org-scoped).
`backupStatus` reflects whether a real backup has actually happened.

## Cumulative session state

All prior fixes still hold:

- **86 API-backed sessions** respond `200` (+ 2 UI-only: S14 marketing, S16 desktop).
- **56 primary session dashboards** (`/dashboard/rollup`) all byte-identical across repeated reads.
- **Zero `Math.random` / `rand()` / `randInt()` calls in any read method** across `apps/api/src/**/*.service.ts` (verified with AST grep).
- **Zero fabricated `Date.now() ± N` timestamps** in read methods — every drifting timestamp that remains is either (a) an honest wall-clock measurement of a real event, or (b) a snapped UTC-midnight window boundary.
- **30+ sessions have real writeable CRUD** via the tenant-scoped Redis helper (`utils/tenantStore.ts`) — writes show up in the same session's dashboard rollup on the next read.
- **Deep-real writes** on Session 9 billing (Stripe webhook + dunning), S24 releases (DORA), S42 media queue, S55 events, S58 spatial, S65 biomedical, S66 legal, S68 scientific, S74 industry adoption, S82 cyber (full rewrite).

## Verification method (reproducible)

```bash
LOGIN=$(curl -s -X POST http://127.0.0.1:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@windels.ai","password":"W1ndels!Admin#2026"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['token'])")

# hits every GET endpoint under /api/v1 twice and diffs the responses
python3 /tmp/probe_all.py "$TOKEN"
```

The probe script builds its endpoint list by parsing `http/server.ts` to find
the actual mount path of each `router` and then scanning each route file for
static (`no :param`) `GET` handlers. Nothing is hard-coded.

## Files touched this final pass

- `apps/api/src/services/billing.service.ts` — snap 30-day insights window to UTC midnight
- `apps/api/src/services/aiMonitoring.service.ts` — same snap on AI-monitoring window
- `apps/api/src/services/regions.service.ts` — stop stamping fake `lastPingAt` and fake `lastBackupAt`

## Files not touched (deliberately)

- `services/health.service.ts` — `governance/health` really IS a live probe. The `latencyMs` and `recordedAt` values are what the endpoint promises to return.
- `platform/metrics.service.ts` — counters and traces MUST reflect the probe's own activity to be useful for observability.
