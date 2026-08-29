# Session 163 — Runtime validation checklist (`constitution`)

Runtime validation requires live PostgreSQL 17 + Redis 8 + `prisma generate`.
This sandbox reaches none of them, so Session 163 ships 🟡 **VERIFIED (partial)**.

**§1 is a safety regression gate and §2 a security regression gate — run both
before anything else.** This module decides whether an AI action may proceed;
a regression here is not cosmetic.

## Prerequisites

```bash
pnpm install && pnpm --filter @windels/shared build
cd apps/api && pnpm exec prisma generate
pnpm dev
```

Register a second organization to test against:

```bash
curl -sX POST localhost:4000/api/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"b@example.test","password":"W1ndels!Tenant#2026","displayName":"B","organizationName":"Tenant-B"}'
```

Export `A=<primary token>` and `B=<tenant B token>` for the commands below.

## 1. The gate fails closed (safety regression gate)

- [ ] `POST /constitution/check` as **tenant B** (which has published nothing)
      with `{"source":"t","promptOrAction":"wire the treasury balance"}`
      returns `allowed: false`.
- [ ] The same response carries `posture: "unconfigured"` and
      `requiresConfiguration: true`.
- [ ] `constitutionVersion` is `null` — **not** `0`.
- [ ] `reason` explains that no constitution is published.
- [ ] A baseline safety term (`"how do i kill myself"`) is refused for tenant B
      even though it has no policies, and the violation carries
      `policyId: null` with `unmatchedDomain: true`.
- [ ] Restart the API with `WINDELS_CONSTITUTION_FAIL_OPEN=true`. The first
      check now returns `allowed: true` **and** `posture: "fail_open"`.
- [ ] With fail-open still set, the self-harm prompt is **still refused**.
- [ ] Unset the flag and restart; the gate refuses again.

## 2. Tenant isolation (security regression gate)

Pre-S163 every route operated on `org-windels` regardless of caller.

- [ ] `GET /constitution/policies` as B returns `[]` while A has policies.
- [ ] Create a policy as B; `GET /constitution/policies` as **A** does not
      contain it.
- [ ] `POST /constitution/publish` as B does not change A's
      `GET /constitution/active` (`constitution.id` and `version` unchanged).
- [ ] `GET /constitution/violations` as B contains only B's violations.
- [ ] Every route returns **403 FORBIDDEN** when the bearer token resolves to a
      user with no `organizationId`.
- [ ] `redis-keys 'cst:*'` shows only `cst:<entity>:<org>:…` shapes — no key
      without an org segment.

## 3. Policies are actually evaluated

- [ ] Create as B: domain `decision_boundaries`, `status: "approved"`,
      `enforcementLevel: "hard_block"`,
      `rule: {"kind":"monetary_threshold","maxUsd":10000}`; publish it.
- [ ] `POST /constitution/check` with `context: {"amountUsd": 500}` →
      `allowed: true`, `posture: "enforced"`.
- [ ] Same with `context: {"amountUsd": 99000}` → `allowed: false`, and the
      violation's `policyId` matches the created policy.
- [ ] Omitting `amountUsd` entirely does not trip the threshold.
- [ ] A `requires_human` policy blocks `context: {"actionKind":"email_customer"}`
      and permits it once `humanApproved: true` is added.
- [ ] A `required` (not `hard_block`) policy produces `action: "warned"` and
      leaves `allowed: true`.
- [ ] A policy in `status: "draft"` is not evaluated.
- [ ] `evaluated` lists the rule kinds that ran.
- [ ] Updating a policy without a `rule` field preserves the existing rule
      rather than silently disarming it.

## 4. Honest reporting

- [ ] `GET /constitution/dashboard/rollup` returns `coveredWorkforces: null`
      (nothing measures it) — never `0`.
- [ ] `activeVersion` is `null` before any publication, then a real integer.
- [ ] `posture` on the dashboard matches the posture `check` reports.
- [ ] `unenforceablePolicies` counts approved policies with no `rule`; add a
      prose-only policy and confirm it increments.
- [ ] `blockedActions24h` reflects real blocked checks in the window.
- [ ] `redis` holds no `cst:m:<org>` `workforces` field for a fresh org.

## 5. Seeding is opt-in

- [ ] With `WINDELS_DEMO_DATA` unset, boot against an empty Redis:
      `GET /constitution/policies` is `[]` and the log records
      `synthetic seed skipped`.
- [ ] Because the gate fails closed, that empty org **refuses** checks rather
      than allowing them — confirm explicitly.
- [ ] With `WINDELS_DEMO_DATA=true`, 11 policies appear, every one with
      `approvedBy: "demo_seed"` and **none** with `approvedBy: "system"`.
- [ ] The seeded fiduciary policy blocks `context: {"amountUsd": 12000}`.
- [ ] Reads never seed: delete all policies, `GET` them, confirm they stay gone.

## 6. Console

- [ ] `/app/constitution` loads with Policies · Constitution · Check · Violations.
- [ ] The posture banner is red ("Not configured") for a fresh org, green when
      enforcing, amber when failing open.
- [ ] "Covered workforces" renders `—`, never `0`.
- [ ] A policy created without a rule shows the amber **not enforceable** badge.
- [ ] Seeded policies show the "review and re-approve" note.
- [ ] The Check tab states that evaluation is deterministic and not a semantic
      classifier.
- [ ] Running a check that refuses shows the reason and each violation's
      action/severity.
- [ ] The sidebar has exactly one "Constitution" entry.

## 7. Regression

- [ ] `pnpm --filter @windels/api test` — 30 constitution tests pass; the
      moduleGates suite is 23/23.
- [ ] Full API suite matches the known baseline (2912 passed / 29 pre-existing
      Prisma `.prisma/client/default` failures).
- [ ] `pnpm --filter @windels/web build` succeeds.
- [ ] `npx playwright test tests/e2e/constitution.spec.ts` passes against the
      live API.
- [ ] The tenant-isolation sweep reports the seven `cst:*` prefixes as
      `org_scoped` with no findings.

## 8. Known limitation to confirm, not fix

- [ ] `checkRequest` still has **no production callers** — `grep -rn
      "checkRequest" apps/api/src` finds only this module, its route and the
      tests. The header comment claims "every AI Employee/Workforce inherits
      the active approved constitution"; nothing enforces that yet. Wiring the
      gate into the agent execution path is deliberately out of S163 scope and
      should be its own session, now that the gate is safe to call.
