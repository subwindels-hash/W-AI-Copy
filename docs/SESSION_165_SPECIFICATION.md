# Session 165 — Deployment completion (unfinished-module track, 11/N)

**Module:** `deployment` (Session 53 — Enterprise Deployment Platform)
**Status:** 🟡 VERIFIED (partial)

## Prior art — what is already fixed

Unlike the previous four modules, `deployment` has had real remediation. An
earlier session removed `validate()`'s `passed = Math.random() > 0.05`, replaced
it with genuine probes (Redis PING, `SELECT 1`, a real filesystem write, kernel
dispatch, model-registry count), made unverifiable checks `skipped` rather than
passed, and stopped targets being born `healthy` with random cpu/mem/gpu
telemetry. `verdicts.test.ts` guards all of that. **None of it is re-litigated
here.**

## What was unfinished

### 1. The health probe seeds the evidence it then reports (critical)

This is the defect the audit flagged, and it is worse than "an ungated seed".
`coreIntegration`'s `deployments` probe:

```ts
const { DeploymentService } = await import("../deployment/deployment.service.js");
await DeploymentService.ensureBootstrapped();          // ← writes 3 targets
const targets = await DeploymentService.list("org-windels");
if (!targets.length) return { status: "missing", … };
return { status: "wired", evidence: `${targets.length} deployment target(s) registered…` };
```

The probe **calls the seeder and then counts what the seeder just wrote.** The
`missing` branch is unreachable on a first run: `ensureBootstrapped` guarantees
three targets exist before `list()` is called. So the platform's core
integration checkpoint — which feeds `criticalPassed`, `blockers` and
`canProceedToSession46` — reports `deployments: wired` on an installation where
nobody has ever deployed anything.

The three seeded targets are `NA-East Production` (aws/us-east-1), `EU-West
Production` (kubernetes/eu-west-1) and `Edge Retail NYC` (edge/us-east-4). These
are not neutral placeholders; they are named, regioned production environments.
A reader of that health report concludes the platform is deployed to AWS and
Kubernetes in two regions plus a retail edge site.

The existing test cannot catch this. `"reports missing when no targets exist"`
asserts `expect(["wired","missing"]).toContain(dep!.status)` — a test that
accepts both outcomes and therefore cannot fail.

### 2. Every non-notes route drops the caller's organization

The six deployment routes call the service with no org and fall through to
`oid = "org-windels"`; only the four `notes` routes resolve
`req.user.organizationId`. So one tenant lists, creates, validates and
**destroys** another tenant's deployment targets. `DELETE /targets/:id`
routed to a shared namespace is a cross-tenant destructive operation.

`dep:*` is absent from `TI_NAMESPACE_CATALOG`.

### 3. `avgHealthScore` is a fabricated composite

```ts
s + (t.status === "healthy" ? 100 : t.status === "degraded" ? 60 :
     t.status === "failed" ? 20 : 50)
```

Four invented constants averaged into a 0–100 "Health Score" rendered green
above 90. A target that has never been validated (`status: "validating"`) scores
**50** — a mid-range figure implying partial health for something entirely
unmeasured. Nothing anywhere measures health on a 0–100 scale; the number is
manufactured from a status enum.

### 4. `version` is assigned, never observed

`create()` sets `version: LATEST_VERSION` on every target, so `outdatedTargets`
(`t.version !== LATEST_VERSION`) is **always 0** by construction. The dashboard
reports "N outdated" where N can never be anything but zero, because no code
ever learns what version a target is actually running.

### 5. `destroy()` claims a lifecycle it does not perform

It sets `status: "destroyed"` and removes the id from the index. No
infrastructure is touched. The method name and status assert teardown of a
cloud environment; what happens is a Redis de-registration.

### 6. Validation writes health it did not check

`validate()` probes the **local API host** — its Redis, its Postgres, its
uploads directory. It then writes the verdict onto a *remote* target as
`status: "healthy"` and `lastHealthOk: true`. For `NA-East Production` in
`us-east-1`, local Redis connectivity says nothing about that environment. The
two genuinely target-specific checks (endpoint reachability, TLS) are the two
that are skipped.

## What this session adds

**The probe stops seeding.** `coreIntegration` no longer calls
`ensureBootstrapped`; it reads what exists. With no targets it reports
`missing` with `"no deployment targets registered"`. The `deployments` link
also stops claiming `wired` on registration alone — registration is not
verification (the module's own `routesPresent` helper already says so). It
reports `wired` only when at least one target has actually passed validation,
`stub` when targets are registered but none is validated.

**Organization scoping.** `orgOf(req,res)` on all six routes; service
parameters required, not defaulted. `dep:t/ts/v` catalogued. The
`coreIntegration` probe reads a platform-scoped org explicitly rather than
inheriting a default.

**`avgHealthScore` becomes honest.** `number | null` — null when no target has
been validated. It is now the share of validated targets whose last real health
check passed, not an average of invented per-status constants. A never-validated
target is excluded from the denominator rather than scored 50.

**Version reporting becomes real.** `DeploymentTarget.reportedVersion?: string`
is set only by a new `POST /targets/:id/report` (an agent/operator reporting
what the environment actually runs). `outdatedTargets` counts only targets whose
*reported* version differs from `LATEST_VERSION`; targets that have never
reported are counted separately as `unknownVersionTargets`. The assigned
`version` field is renamed in meaning to `intendedVersion` in documentation and
kept for compatibility.

**Honest lifecycle naming.** `destroy()` becomes `deregister()` (with `destroy`
retained as a deprecated alias), sets `status: "deregistered"`, and the response
states that no infrastructure was modified.

**Validation scope is labelled.** `DeploymentValidationCheck` gains
`scope: "local_host" | "target"`, and `DeploymentValidation` gains
`targetScopedChecks: number`. When every executed check is `local_host`, the
target's status becomes `validated_locally` rather than `healthy`, and
`lastHealthOk` is left undefined — the local API's health is not the remote
target's health.

**Seed gated.** `WINDELS_DEMO_DATA`; targets tagged `source: "demo_seed"`.

**Surfaces.** `/app/deployment` console (Targets / Validation) + sidebar.

## Not claimed

Nothing here provisions, configures or tears down infrastructure. The module
is a registry of declared targets plus a local-dependency validator. The
console says so.

## Additive-only

Existing paths keep their shapes. `avgHealthScore` changes to `number | null`
and the `deployments` link may now report `stub` where it previously said
`wired` — both are the fix.
