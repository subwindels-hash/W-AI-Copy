# Session 165 — Runtime validation checklist (`deployment`)

Runtime validation requires live PostgreSQL 17 + Redis 8 + `prisma generate`.
This sandbox reaches none of them, so Session 165 ships 🟡 **VERIFIED (partial)**.

**§1 is a health-report integrity gate — run it before anything else.** The
core-integration checkpoint feeds `criticalPassed`, `blockers` and
`canProceedToSession46`; a regression there produces false assurance.

## Prerequisites

```bash
pnpm install && pnpm --filter @windels/shared build
cd apps/api && pnpm exec prisma generate
pnpm dev
```

Register a second organization; export `A=<primary token>`, `B=<tenant B token>`.

## 1. The health probe reads, it does not write (integrity gate)

- [ ] On empty Redis (`redis-cli --scan --pattern 'dep:*'` returns nothing),
      fetch the core-integration checkpoint.
- [ ] The `deployments` link reports **`missing`** with
      `"no deployment targets registered"`.
- [ ] `redis-cli --scan --pattern 'dep:*'` **still returns nothing** — the probe
      created no targets. Pre-S165 it called `ensureBootstrapped()` and then
      counted what it had just written.
- [ ] Register one target, do not validate it. The link reports **`stub`** with
      `"registration is not verification"` — not `wired`.
- [ ] The checkpoint's `wired` count does not include `deployments`.
- [ ] Validate the target so `validationPassed` is true. Only now does the link
      report `wired`, and its evidence names a non-zero validated count.
- [ ] Confirm `NA-East Production`, `EU-West Production` and `Edge Retail NYC`
      do **not** exist unless `WINDELS_DEMO_DATA=true`.

## 2. Tenant isolation

- [ ] `GET /deployment/targets` as B returns `[]` while A has targets.
- [ ] A target created by B does not appear in A's list.
- [ ] `DELETE /deployment/targets/:id` as A against **B's** target leaves B's
      target intact. Pre-S165 both operated on org-windels, making this a
      cross-tenant destructive operation.
- [ ] `POST /targets/:id/report` as A against B's target returns 404.
- [ ] `GET /targets/:id/validation` as A returns null for B's target.
- [ ] All six target routes return **403 FORBIDDEN** without an org context.
- [ ] `redis-cli --scan --pattern 'dep:*'` shows only `dep:<entity>:<org>:…`.

## 3. Health score reports only what was measured

- [ ] With one registered, never-validated target, `avgHealthScore` is `null`
      and `validatedTargets` is 0. Pre-S165 it was 50.
- [ ] An org with no targets reports `null`, not 0.
- [ ] After one passing validation with a target-scoped check,
      `avgHealthScore` is 100.
- [ ] With one passing and one failing validated target, it is 50.
- [ ] An unvalidated target never changes the score.

## 4. Validation scope is honest

- [ ] Every check in a run carries a `scope` of `local_host` or `target`.
- [ ] `redis`, `database`, `storage`, `kernel`, `models` are `local_host`.
- [ ] `connectivity` and `security` are `target` **and** `skipped` — they cannot
      be asserted from the API host.
- [ ] `targetScopedChecks` is 0 for a default run.
- [ ] After such a run the target's status is `validated_locally`, never
      `healthy`, and `lastHealthOk` remains **undefined**.
- [ ] Because `lastHealthOk` is undefined, that target does not contribute to
      `avgHealthScore`.
- [ ] A run where every check is skipped still reports `passed: false`
      (guarded by the pre-existing `verdicts.test.ts`).

## 5. Version reporting

- [ ] A new target has no `reportedVersion` and counts in
      `unknownVersionTargets`, not `outdatedTargets`.
- [ ] `POST /targets/:id/report {"version":"0.1.0"}` sets `reportedVersion` and
      `versionReportedAt`.
- [ ] That target now counts in `outdatedTargets`.
- [ ] Reporting `LATEST_VERSION` (0.84.0) moves it out of `outdatedTargets`.
- [ ] Reporting against an unknown target returns 404.

## 6. De-registration does not claim teardown

- [ ] `DELETE /deployment/targets/:id` returns
      `{ deregistered: true, infrastructureModified: false }`.
- [ ] The target's stored status is `deregistered`, not `destroyed`.
- [ ] Deleting an unknown id returns `deregistered: false` rather than throwing.
- [ ] Confirm no cloud/infra API was called (nothing in this module can).

## 7. Seeding is opt-in

- [ ] With `WINDELS_DEMO_DATA` unset, boot on empty Redis: no targets, and the
      log records `synthetic seed skipped`.
- [ ] With `WINDELS_DEMO_DATA=true`, three targets appear, all with
      `source: "demo_seed"`.
- [ ] Seeded targets are unvalidated: `avgHealthScore` stays `null`.
- [ ] An operator-registered target carries `source: "operator_registered"`.

## 8. Console

- [ ] `/app/deployment` loads with Targets · Validation.
- [ ] The amber "Registry and validator — not a provisioner" banner is visible.
- [ ] "Health" renders `—` with "nothing validated" before any run.
- [ ] Both "Outdated" and "Version unknown" are shown.
- [ ] A validation run lists each check with a `local host` / `target` badge and
      a skipped/passed/failed state.
- [ ] The Validation tab states when nothing exercised the remote target.
- [ ] De-registering reports that infrastructure was not modified.
- [ ] The PlatformPage Deployment tab shows the same disclaimer, renders `—`
      for an unmeasured health score, and its form says "Register Target"
      rather than "Provision Target".
- [ ] The sidebar has exactly one "Deployment" entry.

## 9. Regression

- [ ] `pnpm --filter @windels/api test` — 28 new deployment tests plus the 8
      pre-existing `verdicts.test.ts` cases pass (36 total in `src/deployment`).
- [ ] `src/coreIntegration` is 6/6, including "does not create targets as a
      side effect of being probed".
- [ ] Full API suite matches the baseline (2973 passed / 29 pre-existing Prisma
      `.prisma/client/default` failures).
- [ ] `pnpm --filter @windels/web build` succeeds.
- [ ] `npx playwright test tests/e2e/deployment.spec.ts` passes.
- [ ] The tenant-isolation sweep reports the four `dep:*` prefixes as
      `org_scoped` with no findings.

## 10. Known limitations to confirm, not fix

- [ ] **Nothing provisions.** The module registers declared targets and runs
      local dependency checks. No cloud API is called anywhere in it.
- [ ] **No target-scoped probe exists yet.** Until one does, every run reports
      `targetScopedChecks: 0` and no target can reach `healthy` through
      validation alone. Implementing an endpoint/TLS probe is its own session;
      the honest intermediate state is `validated_locally`.
- [ ] **`cpuPct`/`memPct`/`gpuPct` are never populated.** They remain optional
      and absent rather than being filled with plausible numbers.
- [ ] **The checkpoint reads one organization.** `WINDELS_PLATFORM_ORG_ID`
      (default `org-windels`) names it explicitly; the report describes that
      org's deployments, not a whole-fleet view.
