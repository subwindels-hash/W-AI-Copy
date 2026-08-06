# Session 123 Runtime Validation Checklist — Usage Intelligence completion

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted.
> Until every box is ticked and signed, Session 123 stays 🟡 VERIFIED (partial).

The unit suite proves the deltas, empty-denominator rules, per-module metrics
and series arithmetic against FakePrisma; only a live deployment proves the
`AiRequest` table, the `usg:evt` keyspace, the Session 89 sweep and the real
pagination behave as this module assumes.

## Route mounting and backwards compatibility

- [ ] The three Session 55 endpoints answer on their original paths and
      shapes: `GET /usage-intel/dashboard/rollup` (with `metrics`,
      `modules`, `topModels`, `series`, `resources`, and the `ledger` block),
      `POST /usage-intel/events` (201, admin-gated), `GET /usage-intel/events`.
- [ ] `GET /events?limit=50` returns ≤ 50 events; `?limit=0` and
      `?limit=1001` answer `400` (validation); an absent limit returns 100.
- [ ] The rollup's `ledger` block carries `note` stating its counts cover the
      most recent 100 events.
- [ ] All five paths answer `401` without a token; `POST`/`DELETE /events`
      answer `403` for a non-administrator.
- [ ] A session with no organization receives `403`, not a Redis key
      containing `undefined`.
- [ ] The PlatformPage S55 tab and the new `/app/usage` console render
      against the new payloads (null values print "not recorded").

## The defects this session fixes

- [ ] **Deltas.** With AI requests in the current 30-day window and a
      different count in the prior window, `AI requests (30d).deltaPct` is
      the measured percentage (e.g. 2 vs 1 → 100) — not the hardcoded 0.
      With nothing in the prior window, `Conversations (30d).deltaPct` is
      `null` and `trend` is `null` — never 0/"flat".
- [ ] **Empty denominators.** On an organization with no AI requests:
      `Avg AI latency` is `null` (not 0 ms), `AI error rate` is `null` (not
      0 %). With no workflow runs, `automationRate` is `null`. With no
      members, `adoptionPct` is `null`.
- [ ] **Per-module metrics.** With requests in two channels (different
      latencies, one failure, two users), `GET /dashboard/rollup` reports
      per-module `users`, `p95LatencyMs` (nearest-rank) and `errorRate` —
      not 0s. A channel with no requests is absent.
- [ ] **Series.** On a day with AI requests, the series point carries the
      real `tokens` sum and the average `latencyMs`. On a day with none,
      `latencyMs` is `null` and `automationTasks` is `null`.
- [ ] **Correction path.** `DELETE /usage-intel/events/:id` (admin) removes
      the event; `GET /usage-intel/events/:id` afterwards answers 404, and
      the rollup's ledger aggregation no longer counts it.

## Storage (Redis)

- [ ] After recording events, the keyspace shows `usg:evt:idx:<org>` (zset)
      and `usg:evt:i:<org>:<id>` (hash) — org in the segment after the index
      marker, the same shape as the CRM/AppBuilder stores.
- [ ] `KEYS usg:*` with a live Session 89 sweep run: the namespace is
      conforming and no finding is reported for `usg:evt`.

## Console (web)

- [ ] `/app/usage` loads with the sidebar entry; stat cards show "no
      baseline" / "not recorded" where appropriate, the by-module table shows
      "—" for null p95/error, and the provenance card renders.
- [ ] Recording an event through the API (or a mis-recorded one being
      deleted) is reflected in the ledger card on refresh.
