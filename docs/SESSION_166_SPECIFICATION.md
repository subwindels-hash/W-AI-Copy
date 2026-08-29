# Session 166 — `composer` completion (unfinished-module track, 12/N)

Module: **AI Capability Composer** (Session 49, V8.4 §4) — visual no-code
composition of 11 AI primitives into runnable workflows.

## Correction to the audit

`docs/UNFINISHED_MODULES.md` row 6 says composer *"re-seeds on read"*. **It does
not.** `ensureBootstrapped` is called from exactly one place —
`apps/api/src/index.ts:546`, a boot timer. No read path calls it; `dashboard()`
delegates to `list()`, which does not bootstrap. The audit was inferring from
the `needsSeed` recovery branch without tracing its call sites.

The recovery branch is still a real and *worse* defect than the label suggested,
just not the one named. See D1.

## Prior art (do NOT redo)

An earlier session already fixed the fake-verdict defect and left tests:

- `run()` no longer marks a run `succeeded` on trigger (and an earlier version's
  `Math.random()` 1% failure is gone). A triggered run is `queued`.
- `reportRunOutcome()` is the only path that resolves a run or moves
  `successRate`.
- `composer.test.ts` has 13 passing tests pinning that.
- `noFakeVerdict.guard.test.ts` cites `composer.run()`'s `queued` status as one
  of two reference patterns for the whole repo.

All of that stays untouched. This session does not re-litigate it.

## Defects found

### D1 — a boot path that deletes tenant data

`ensureBootstrapped` decides `needsSeed` by reading every workflow in the set
and counting how many parse as valid JSON with an `id` and `name`. If **zero**
parse, it runs:

```ts
for (const id of existing) { await redis.del(K.wf(oid, id)); }
await redis.del(K.wfs(oid), K.metrics(oid));
```

…and reseeds. So a Redis hiccup, a partial write, or a schema change that makes
`_doc` unparseable causes the **next server restart to delete every workflow the
organization has** and replace them with the example. The recovery path is
indistinguishable from data loss. It also fires whenever the set is merely
empty, so deleting the example workflow un-deletes it on restart.

A bootstrap may create; it must never delete.

### D2 — the seed is ungated

No `demoDataEnabled()` / `skipDemoSeed()`. Every fresh org boots with
"Customer Inquiry Auto-Responder (Example)". `grep -c demoDataEnabled` = 0.

### D3 — every workflow route drops the caller's organization

Ten of the fourteen routes call the service with no org, defaulting to
`oid = "org-windels"`. Only the four `/notes` routes resolve
`req.user.organizationId`. So every tenant lists, reads, **overwrites**,
deploys and runs org-windels' workflows. `POST /workflows` accepts a
caller-supplied `id`, so one tenant can overwrite another tenant's workflow
definition by guessing an id. `cmp:*` is absent from `TI_NAMESPACE_CATALOG`.

Same defect family as S163/S164/S165. It keeps appearing because the service
signatures default the parameter rather than requiring it.

### D4 — 100% success reported for zero runs, twice

Service: `successRate: totalRuns ? succ/totalRuns : 1`. An org that has never
run anything reports a **perfect success rate**.

UI: `Math.round((d.successRate||1)*100)` — the `||` means a genuine `0`
(everything failed) also renders **100%**. The worst possible reading is
displayed as the best.

An unmeasured rate is `null`.

### D5 — a fabricated dollar figure

`estimatedCostPerRun: caps * 0.002` — presented in the UI as
`est $0.0000/run`. There is no pricing table anywhere in the module. A video
generation node and an analytics event are priced identically. The number is
invented, and it is denominated in dollars.

### D6 — "Recent Runs" shows the oldest runs

```ts
zrange(K.runs(oid), -limit, -1, "REV")
```

With `REV`, index 0 is the **highest** score. `-limit..-1` therefore selects the
tail of the reversed list — the `limit` **oldest** runs. Correct is
`0, limit-1`. The panel titled "Recent Runs" is showing the least recent.

### D7 — two of four statuses are unassignable

`status: "draft" | "validated" | "deployed" | "paused"`. Nothing anywhere
assigns `validated` or `paused`. Per the S164 rule, a status value nothing can
assign is a broken promise. `validated` is not a state at all — validity is
computed from the graph on demand — so it is removed. `paused` is a real
operational need, so it is implemented.

### D8 — a metrics hash written by two paths, read by none

`cmp:m:<oid>` gets `totalRuns` incremented by `run()` and `success` by
`reportRunOutcome()`. Nothing ever reads it — `dashboard()` recomputes from the
workflow docs. The two counters also disagree by construction: `run()` counts
*triggered*, `wf.runs` counts *resolved*. Same shape as licensing's
write-only royalty ledger. Read it or drop it; this session reads it, because
the queued-vs-resolved gap is exactly what an operator needs to see.

### D9 — a draft workflow can be run

`run()` never checks status. The UI disables the button for non-deployed
workflows, but the endpoint does not, so `POST /workflows/:id/run` executes
against a draft or (after D7) a paused workflow.

### D10 — no console

`/app/composer` does not exist. The module is reachable only through the
PlatformPage admin tab.

## Changes

**`packages/shared/src/composer.ts`**
- `ComposedWorkflow.successRate: number | null`, `avgDurationMs: number | null`.
- `ComposedWorkflow.status`: `"draft" | "deployed" | "paused"` (drop
  `validated`).
- `ComposedWorkflow.source: "operator_created" | "demo_seed"`.
- `ComposedWorkflow.queuedRuns` — triggered but unresolved.
- `ComposerDashboard.successRate: number | null`, plus `resolvedRuns`,
  `queuedRuns`, `failedRuns`, `workflowsWithRuns`.
- `ComposerValidationResult.estimatedCostPerRun: number | null` +
  `costModelConfigured: boolean`.

**`apps/api/src/composer/composer.service.ts`**
- `ensureBootstrapped` gated behind `demoDataEnabled()`; **deletes nothing**;
  seeds only when the set is genuinely empty; marks rows `demo_seed`.
- Corrupt rows are counted and surfaced, never destroyed.
- `oid` required (no default) on every method.
- Honest `dashboard()` — null success rate, queued/resolved split, reads
  `cmp:m`.
- `estimatedCostPerRun` → `null`, `costModelConfigured: false`.
- `getRuns` → `zrange(key, 0, limit-1, "REV")`.
- `pause()` / `resume()`.
- `run()` refuses a non-deployed workflow (409).

**`apps/api/src/http/routes/composer.ts`** — `orgOf(req,res)` on all ten
workflow routes; `POST /workflows/:id/pause`, `/resume`.

**`apps/api/src/composer/bootstrap.ts`** — unchanged pass-through.

**`apps/api/src/tenantIsolation/tenantIsolation.service.ts`** — catalogue
`cmp:wf`, `cmp:wfs`, `cmp:runs`, `cmp:m`, `cmp:notes` as `org_scoped`. Bare
`cmp` is never added: it would read `wf` as an org id.

**Web** — new `/app/composer` console, sidebar entry, `composerApi` additions,
PlatformPage tab made null-aware and its `||1` fallback removed.

**Tests** — `composer.service.test.ts` (new, ~30 cases) alongside the existing
`composer.test.ts` (13, untouched); `tests/e2e/composer.spec.ts`.

## Non-goals

- No workflow **executor**. Nothing in this repo executes composer nodes; runs
  stay `queued` until an external executor reports. That is the honest state,
  not a gap this session closes.
- No pricing model. `estimatedCostPerRun` stays `null` until per-capability
  rates exist somewhere real.
