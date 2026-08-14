# Session 161 — Runtime validation checklist (`cyber`)

Runtime validation requires live PostgreSQL 17 + Redis 8 + `prisma generate`.
This sandbox reaches none of them, so Session 161 ships 🟡 **VERIFIED (partial)**.
Run this checklist in the target deployment environment before granting 🟢.

## Prerequisites

```bash
# Postgres 17 + Redis 8 reachable, .env populated
pnpm install && pnpm --filter @windels/shared build
cd apps/api && pnpm exec prisma generate
pnpm dev            # API on :4000
```

Confirm `WINDELS_DEMO_DATA` is **unset** (default) for §1–§6.

## 1. A fresh organization has no fabricated posture

- [ ] `GET /api/v1/cyber/dashboard/rollup` on a brand-new org returns
      `findings: []` — **not** the ten legacy findings (public S3 ACL, root
      access keys, GCP editor service account).
- [ ] `cloudFindingsOpen`, `cloudFindingsCritical`,
      `cloudFindingsRemediated30d` are all `0` with an empty register.
- [ ] `certifications: []` and `certificationsHeld: 0`.
- [ ] `leaderboardRank` is `null` (JSON `null`, not `0`).
- [ ] `provenance.findings` mentions that nothing was recorded.

## 2. Reads never seed

- [ ] `redis-cli --scan --pattern 'csec:*'` returns **nothing** for a new org
      after calling the dashboard three times.
- [ ] Restart the API and re-read the dashboard — still no `csec:find:*` keys.

## 3. The catalogue is still served

- [ ] `GET /cyber/courses` returns 16 courses, each `kind: "catalog"`,
      `enrolled: null`, `rating: null`.
- [ ] `GET /cyber/challenges` returns 15 challenges with `solvedBy: null`;
      "SQLi Basic" is `web_security`, "Kerberoasting" is `active_directory`.
- [ ] `GET /cyber/certification-tracks` returns 6 tracks with **no**
      `passed` / `scorePct` fields.

## 4. Findings register round-trip

- [ ] `POST /cyber/findings` with a valid body → 201, `source:
      "operator_entered"`, `status: "open"`, no `remediatedAt`.
- [ ] `POST /cyber/findings` with `source: "scanner_reported"` → that value is
      preserved.
- [ ] `PATCH /cyber/findings/:id {"status":"remediated"}` stamps `remediatedAt`
      and `cloudFindingsRemediated30d` increments.
- [ ] `PATCH … {"status":"accepted"}` does **not** count as remediated.
- [ ] Reverting to `open` clears `remediatedAt`.
- [ ] `PATCH /cyber/findings/f-nope` → 404.
- [ ] Invalid `severity` → 400 VALIDATION_ERROR.

## 5. Certifications

- [ ] `POST /cyber/certifications {passed:false}` → `certificationsHeld`
      unchanged.
- [ ] `POST … {passed:true}` → `certificationsHeld` +1.
- [ ] Omitting `preparationProgressPct` stores `null`, not `0`.

## 6. Labs and ranges

- [ ] `POST /cyber/labs` → `provisioning: "local_state_only"`.
- [ ] `GET /cyber/labs` lists it; `POST /cyber/labs/:id/stop` → `stopped`.
- [ ] A lab left past `expiresAt` (2h) reads `expired` and drops out of
      `labsActive`.
- [ ] `POST /cyber/ranges` → `scheduled`, counted in `upcomingRanges`.
- [ ] `PATCH /cyber/ranges/:id {"status":"live"}` moves it to `activeRanges`.

## 7. Connectors

- [ ] `GET /cyber/connectors` — `http-findings` is `ready`; `cspm` is
      `not_configured`.
- [ ] Set `WINDELS_CYBER_CSPM_URL=https://example.invalid` and restart —
      `cspm` becomes `configured_not_connected`, **never** `connected`.

## 8. Tenant isolation

- [ ] Create findings/certs/labs in org A; org B's dashboard shows none.
- [ ] `GET /api/v1/tenant-isolation/...` sweep reports no unscoped `csec:*`
      or `cy:notes` namespace.
- [ ] Confirm no bare `csec` entry exists in `TI_NAMESPACE_CATALOG`
      (it would read the literal `lab` as an organization id).

## 9. Demo gate

- [ ] With `WINDELS_DEMO_DATA=true`, restart and hit the bootstrap: five demo
      findings appear, each `source: "demo_seed"`.
- [ ] Unset it, flush `csec:*`, restart: register is empty again.

## 10. UI

- [ ] `/app/cyber` loads; sidebar shows "Cyber & Cloud Posture".
- [ ] Cloud Posture tab on an empty org shows the "WINDELS does not scan your
      cloud accounts" copy, not a findings table.
- [ ] Certifications tab shows exam **tracks** greyed out, labelled `track`.
- [ ] Academy tab shows enrolled/rating as "—".
- [ ] Leaderboard stat renders "—", never "#0" or "#null".
- [ ] Admin → Platform → Cyber Academy tab: Learners shows a plain count
      (never "0.0K"), Leaderboard shows "—".

## 11. Regression

- [ ] `GET /cyber/dashboard/rollup`, `POST /cyber/labs` and the four
      `/cyber/notes` paths keep their existing paths and response envelopes.
- [ ] `pnpm test` — `src/cyber/cyber.test.ts` 22/22.
- [ ] `pnpm exec playwright test tests/e2e/cyber.spec.ts` — 11/11.
