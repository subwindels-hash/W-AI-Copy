# Session 166 — Runtime validation checklist (`composer`)

Runtime validation requires live PostgreSQL 17 + Redis 8 + `prisma generate`.
This sandbox reaches none of them, so Session 166 ships 🟡 **VERIFIED (partial)**.

**§1 is a data-safety gate — run it before anything else, and run it against a
throwaway Redis.** The defect it covers deleted an organization's workflows at
boot; a regression there destroys customer data with no operator involved.

## Prerequisites

```bash
pnpm install && pnpm --filter @windels/shared build
cd apps/api && pnpm exec prisma generate
pnpm dev
```

Register a second organization; export `A=<primary token>`, `B=<tenant B token>`.

## 1. The bootstrap never deletes (data-safety gate)

- [ ] Create three workflows as A. Record their ids.
- [ ] Corrupt one: `redis-cli HSET cmp:wf:<orgA>:<id> _doc '{not json'`.
- [ ] Restart the API with `WINDELS_DEMO_DATA=true`.
- [ ] **All three keys still exist.** Pre-S166, if no row parsed, the bootstrap
      ran `DEL` over every id in the set plus `cmp:wfs` and `cmp:m`, then seeded
      the demo example — silent data loss at boot.
- [ ] Corrupt **all three**, restart, and confirm again that nothing was
      deleted and no example workflow was added.
- [ ] `GET /composer/dashboard/rollup` reports `unreadableWorkflows: 3` and
      excludes them from `totalWorkflows`.
- [ ] `cmp:m:<orgA>` counters survive the restart.
- [ ] Delete the demo example as an operator, restart, and confirm it does not
      come back while `WINDELS_DEMO_DATA` is unset.

## 2. The seed is opt-in

- [ ] With `WINDELS_DEMO_DATA` unset, a fresh org has zero workflows and the log
      records `synthetic seed skipped`.
- [ ] With `WINDELS_DEMO_DATA=true`, exactly one workflow appears, named
      "Customer Inquiry Auto-Responder (Example)".
- [ ] It carries `source: "demo_seed"`; an operator-created one carries
      `source: "operator_created"`.
- [ ] The seeded workflow has `successRate: null`, `avgDurationMs: null`,
      `runs: 0`, `status: "draft"`.

## 3. Tenant isolation

- [ ] `GET /composer/workflows` as B returns `[]` while A has workflows.
- [ ] `GET /composer/workflows/:id` as B against A's id returns 404.
- [ ] **`POST /composer/workflows` as B with `{"id": "<A's id>"}` does not
      modify A's workflow.** Pre-S166 the body id plus the missing org made this
      a cross-tenant overwrite of a workflow definition.
- [ ] `POST /workflows/:id/deploy`, `/run`, `/pause`, `/resume` as B against
      A's id all fail.
- [ ] `POST /runs/:runId/outcome` as B against A's run returns 404.
- [ ] `GET /composer/runs` as B does not show A's runs.
- [ ] All ten workflow routes return **403 FORBIDDEN** with no org context.
- [ ] `GET /composer/library` still works for any authenticated caller — it is
      a static catalogue, not org state.
- [ ] `redis-cli --scan --pattern 'cmp:*'` shows only `cmp:<entity>:<org>:…`.

## 4. Success rate is a measurement

- [ ] A fresh org's dashboard reports `successRate: null`. Pre-S166 it was
      **1** (100%).
- [ ] The console renders `—`, not `100%`.
- [ ] Trigger three runs without resolving them: `successRate` stays `null`,
      `queuedRuns: 3`, `resolvedRuns: 0`.
- [ ] Resolve one as `failed`: `successRate` becomes **0**, not null.
- [ ] Confirm the console shows `0%` and not `100%` — the old
      `(d.successRate||1)` turned a total failure into a perfect score.
- [ ] Resolve three succeeded + one failed: `successRate` is `0.75`.
- [ ] A workflow with no resolved runs reports `avgDurationMs: null`.

## 5. Queued is not done

- [ ] `POST /workflows/:id/run` returns `status: "queued"` with no
      `completedAt`.
- [ ] The workflow's `runs` stays 0 and `queuedRuns` increments.
- [ ] The dashboard's `totalRuns` counts it but `resolvedRuns` does not.
- [ ] `POST /runs/:id/outcome` with `{"status":"succeeded","reportedBy":"x"}`
      moves it to resolved and decrements `queuedRuns`.
- [ ] Replaying the same outcome returns **409** (otherwise an executor can
      inflate the rate by retrying).
- [ ] The console banner states that the platform ships no executor.

## 6. Only a deployed workflow runs

- [ ] `POST /workflows/:id/run` on a **draft** returns 409. The console disabled
      the button; the endpoint did not check.
- [ ] Pause a deployed workflow, then run it: 409.
- [ ] Edit a deployed workflow — it returns to `draft` and refuses runs until
      redeployed.

## 7. Pause is reachable

- [ ] `POST /workflows/:id/pause` on a deployed workflow yields
      `status: "paused"`. Pre-S166 nothing could assign it.
- [ ] Pausing a draft returns 409; resuming a non-paused workflow returns 409.
- [ ] The dashboard reports `pausedWorkflows`.
- [ ] Write `"status":"validated"` into a stored `_doc` by hand; reading it back
      yields `draft`. (`validated` was unassignable and is now removed.)

## 8. No fabricated cost

- [ ] `GET /workflows/:id/validate` returns `estimatedCostPerRun: null` and
      `costModelConfigured: false`.
- [ ] Neither console shows a dollar figure; both say cost per run is not
      configured. Pre-S166 both rendered `est $0.0020/run` from
      `capabilityCount * 0.002`.
- [ ] `capabilityCount` is still the real node count.

## 9. Run ordering

- [ ] Trigger five runs, then `GET /composer/runs`. The **newest** is first.
      Pre-S166 `zrange(key, -limit, -1, "REV")` returned the oldest, so a fresh
      run never appeared at the top of "Recent Runs".
- [ ] `?limit` behaviour: requesting 3 of 6 returns the 3 most recent.
- [ ] A `queued` run renders slate in both consoles, not crimson — it was
      previously coloured as a failure.

## 10. Regression

- [ ] `pnpm --filter @windels/api test` — `src/composer` is 55/55 (42 new +
      13 pre-existing, all preserved).
- [ ] `src/config/moduleGates` is 23/23.
- [ ] `noFakeVerdict.guard.test.ts` still passes — it cites `composer.run()`'s
      `queued` status as a reference pattern for the whole repo.
- [ ] Full API suite matches baseline (3015 passed / 29 pre-existing Prisma
      `.prisma/client/default` failures).
- [ ] `pnpm --filter @windels/web build` succeeds.
- [ ] `npx playwright test tests/e2e/composer.spec.ts` passes.
- [ ] The tenant-isolation sweep reports the five `cmp:*` prefixes as
      `org_scoped` with no findings.

## 11. Known limitations to confirm, not fix

- [ ] **No executor exists.** Nothing in this repository executes a composed
      workflow's nodes. Runs stay `queued` indefinitely unless an external
      system reports outcomes. Building an executor is its own session; the
      honest intermediate state is a queue that says it is a queue.
- [ ] **No pricing model.** `estimatedCostPerRun` stays null until
      per-capability rates exist somewhere real.
- [ ] **`cmp:m` counts triggers, workflow docs count resolutions.** They
      deliberately disagree; the difference is queue depth. Do not "reconcile"
      them into one number.
- [ ] **The canvas is a read-only preview.** Node positions render, but there is
      no drag-and-drop editing in either console; graphs are authored through
      `POST /composer/workflows`.
