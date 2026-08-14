# Session 163 — Constitution completion (unfinished-module track, 9/N)

**Module:** `constitution` (Session 48 — Constitution Studio)
**Status:** 🟡 VERIFIED (partial)

## What was unfinished

The audit queued this as "ungated seed writes pre-approved governance". That is
real, but it is the *least* serious of the three defects here. This module owns
the platform's "may this proceed?" decision for every AI Employee, and it
currently **fails open in two different ways**.

### 1. `checkRequest` silently allows everything for an unconfigured org (critical)

`checkRequest` looks up a blocklist keyword, finds the matching policy, and
derives the action from `policy?.enforcementLevel`:

```ts
const policy = policies.find((p) => p.domain === bl.domain);
const action = policy?.enforcementLevel === "hard_block" ? "blocked"
             : policy?.enforcementLevel === "required"   ? "warned" : "logged";
```

If the organization has **no policy for that domain** — which is every
organization except the seeded `org-windels` — `policy` is `undefined`, so the
action falls through to `"logged"` and `blocked` stays `0`. The method then
returns `allowed: true`.

A self-harm prompt, a jailbreak attempt or a fraud request is **allowed** for
any org that has not published a constitution. The gate does not announce that
it is unconfigured; it returns a confident `allowed: true` with
`constitutionVersion: 0`. A caller cannot distinguish "checked and clean" from
"nothing was checked".

This is why simply gating the seed behind `WINDELS_DEMO_DATA` would be actively
dangerous: it would turn the default deployment from "protected by a seeded
constitution" into "silently unprotected". The gate must fail **closed** first.

### 2. `checkRequest` only evaluates the blocklist, never the policies

The 11 seeded policies contain real, checkable rules — a $10,000 human-approval
threshold, a $1,000/day AI spending cap, PII handling, external-commit
approval. **None of them is ever evaluated.** The only thing that can trigger a
violation is a hardcoded 12-keyword `BLOCKLIST`, and a policy's sole
contribution is lending its `enforcementLevel` to a keyword that already
matched.

So a policy whose domain has no keyword entry — `decision_boundaries`,
`ai_decision_limits`, `human_approval_rules`, `brand_standards`,
`risk_appetite`, `industry_rules`, `regional_policies`,
`communication_style` — is **decorative**. Eight of the eleven domains cannot
produce a violation under any input. The existing test acknowledges this with
`if (!entry) return;`.

### 3. Every route ignores the caller's organization

`registerConstitutionRoutes` contains **zero** references to
`organizationId`. All seven handlers call the service with no argument, so
every request operates on the `"org-windels"` default:

```ts
router.get("/policies", … ConstitutionService.listPolicies())      // → org-windels
router.post("/policies", … upsertPolicy({ ...req.body, createdBy }))// → org-windels
router.post("/check", … checkRequest({ ...req.body }))              // → org-windels
```

Tenant B reads, edits and publishes **tenant A's constitution**. The service
layer is correctly org-scoped throughout — the routes simply never pass the
value. `cst:*` is also absent from `TI_NAMESPACE_CATALOG`.

### 4. The ungated seed (the original audit entry)

`ensureBootstrapped` writes 11 policies with `status: "approved"`,
`approvedBy: "system"`, `approvedAt: now`, plus a "Default Enterprise
Constitution" already `status: "active"` — governance the organization never
ratified, attributed to an approver that is not a person.

### 5. Other

- `coveredWorkforces` reads a `cst:m:<org>` hash field that **nothing ever
  writes** — a structural `0` presented as coverage.
- `activeVersion: constitution?.version || 0` — version 0 means "no
  constitution", but renders as a version number.
- No `/app/constitution` console; only a PlatformPage tab.

## What this session adds

**The gate fails closed.** `checkRequest` gains an explicit, typed posture:

- A new `ConstitutionCheckPosture`: `"enforced"` | `"unconfigured"`.
- When the org has no active constitution, the result is
  `allowed: false`, `posture: "unconfigured"`, with a
  `requiresConfiguration: true` flag and a plain-language reason — never a
  silent `allowed: true`.
- When a blocklist term matches a domain the org has **no policy for**, the
  violation is recorded with `action: "blocked"` and
  `policyId: null`, `unmatchedDomain: true`. An unconfigured domain is not a
  permissive one.
- `WINDELS_CONSTITUTION_FAIL_OPEN=true` restores the old permissive behaviour
  for operators who need it, and the response then carries
  `failOpen: true` so the choice is visible in the payload rather than implied.

**Policies are actually evaluated.** A deterministic rule engine reads the
structured thresholds now carried on a policy (`rule`), so the seeded rules
become enforceable:

- `monetary_threshold` — trips when the request's `context.amountUsd` exceeds
  the policy's limit (the $10,000 and $1,000/day rules).
- `keyword` — the existing blocklist, now expressible per policy.
- `requires_human` — trips when `context.actionKind` is in the policy's list
  (email/publish/commit).
- `advisory` — never blocks; recorded as `logged`.

A policy with no rule is explicitly reported as `unenforceable` in the
dashboard's new `unenforceablePolicies` count, so a decorative policy is
visible rather than silently inert.

**Routes carry the caller's organization.** All seven handlers resolve
`req.user.organizationId` and 403 without one. `upsertPolicy`,
`publishConstitution` and `checkRequest` receive it explicitly.

**The seed is gated, but the default is safe.** With `WINDELS_DEMO_DATA` unset
no policies are written — and because the gate now fails closed, that org is
*more* protected, not less. The seed keeps its 11 policies for demos, marked
`approvedBy: "demo_seed"` rather than `"system"`.

**Honest dashboard.** `coveredWorkforces` is `number | null` (null — nothing
writes it), `activeVersion` is `number | null`, and `posture` +
`unenforceablePolicies` are surfaced.

**Surfaces.** `/app/constitution` console (Policies / Constitution / Check /
Violations) + sidebar. `cst:active/policy/policies/c/cs/v/m` catalogued
org-scoped.

## Not claimed

This is a deterministic rule engine over structured policy fields and a keyword
list. It is not a semantic classifier: it cannot detect an intent that uses none
of its keywords and supplies no structured context. The console says so, and
`checkRequest` reports `evaluated` (which rule kinds ran) so a caller can see
the basis of the verdict.

## Additive-only

All seven paths keep their shapes. `CheckResult` gains fields; `allowed` changes
from `true` to `false` for an unconfigured organization, which is the security
fix and is intentionally not backwards compatible.
