# Session 121 Runtime Validation Checklist — Sustainability/ESG completion

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted.
> Until every box is ticked and signed, Session 121 stays 🟡 VERIFIED (partial).

The unit suite proves the storage, arithmetic and adoption rules against an
in-memory KV; only a live deployment proves the `pub:*`-style Redis keyspace,
the Session 89 sweep and the real concurrent behaviour of the API.

## Route mounting and backwards compatibility

- [ ] All three Session 64 endpoints answer on their original paths with
      their original payload shapes: `GET /sustainability/dashboard/rollup`,
      `GET /sustainability/records` (with the historical `?limit` clamp:
      default 200, max 1000, never a validation rejection),
      `POST /sustainability/activity` (201, admin-gated).
- [ ] `POST /sustainability/activity` with the Session 64 body still returns
      **201** with the record shape (`id`, `category`, `activity`,
      `quantity`, `unit`, `emissionFactorKg`, `tCO2e`, `occurredAt`,
      `source`, optional `kwh`, `recordedAt`) and `meta.requestId`.
- [ ] The rollup keeps every Session 64 key; `provenance` is the only
      addition (optional).
- [ ] All five paths answer `401` without a token; `POST /activity` and
      `DELETE /records/:id` answer `403` for an ordinary member.
- [ ] A session with **no organization** receives `403`, not a Redis key
      containing `undefined`.
- [ ] An over-long record id answers `400`; a well-formed unknown id answers
      `404`.

## The defects this session fixes

- [ ] **Lost writes.** Fire twenty concurrent `POST /sustainability/activity`
      from two administrators against two API instances. **All twenty** are
      present in `GET /records` afterwards. *(Before this session the whole
      ledger was one JSON string and a read-modify-write lost one of them.)*
- [ ] **Wrong windows.** With records in Jan–Aug this year and Jan–Dec last
      year, confirm `emissionsYtdChangePct` compares against Jan–Aug last
      year only — a December-only prior record must not move the number.
- [ ] **Null baselines.** An organization with this-year records only reports
      `emissionsYtdChangePct: null` and per-source `changePct: null` — never
      `0`.
- [ ] **No invented scores.** `scores.environmental/social/governance/overall`
      are `null` and `scores.note` explains why, regardless of how much
      activity is recorded. *(Before this session `92 − ytd×2.5` and
      hard-coded 85/88 were returned as "data-derived" scores.)*
- [ ] **greenAi.** Record a compute activity with `kwh` and a scope2 activity
      with `kwh`: `greenAi[0].kwh` equals the compute reading only. Record a
      compute activity whose tCO2e is under 0.5 kg: the row still appears
      (`co2eKg` > 0). *(Before this session both were wrong — the row summed
      all scopes' kWh, and a sub-0.5 kg record vanished entirely.)*
- [ ] **Correction path.** Delete a record via `DELETE /records/:id`: the
      record disappears from `GET /records/:id` and from the rollup totals,
      and the index no longer contains it.
- [ ] **Adoption.** If the target environment has a pre-Session-121
      `esg:<org>:records` blob, the first read adopts it once (per-record
      keys + index entries), the legacy string stays in place, the
      `esg:<org>:imported` marker is set, and repeated reads do not
      duplicate. A deliberately corrupted blob must not crash the dashboard.

## Storage (Redis)

- [ ] After recording activity, the keyspace shows:
      - [ ] `esg:<org>:rec:<id>` — one key per record;
      - [ ] `esg:<org>:idx` — a **list** (not a JSON blob), newest first,
            capped at 10 000;
      - [ ] `esg:<org>:imported` — the adoption marker (set once).
- [ ] `KEYS esg:*` with a live Session 89 sweep run: every key conforms (org
      segment present straight after `esg:`), and no finding is reported for
      the namespace.

## Rollup honesty

- [ ] Fresh organization, no demo data: `emissionsTotalTCO2e: 0`,
      `emissionsYtdChangePct: null`, `scores.*: null` with a note,
      `emissionsBySource: []`, `energySeries` of 12 months, and the console
      prints "not attested" / "no baseline" — never `0`.
- [ ] `provenance.entries` names the measured fields
      (`emissionsTotalTCO2e`, `emissionsYtdChangePct`, `emissionsBySource`,
      `energySeries.kwh`, `greenAi`) and the structural zeros
      (`energyRenewablePct`, `waterMl`, `wasteRecycledPct`,
      `offsetsPurchasedT`, `netZeroTargetYear`, `gpuHours`, `optimizedPct`,
      `resources`/`suppliers`/`reportingFrameworks`).

## Console (web)

- [ ] `/app/sustainability` loads with the sidebar entry; the measured cards,
      the "not attested" score card, the by-source list, the energy chart,
      the records table and the provenance card render.
- [ ] An administrator sees the "Record activity" form and row delete
      controls; a non-administrator sees neither (the API refuses them).
- [ ] Recording an activity through the form updates the rollup and the
      records table on refresh.
