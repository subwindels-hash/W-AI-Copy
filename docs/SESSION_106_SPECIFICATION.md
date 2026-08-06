# SESSION 106 SPECIFICATION — AUTONOMOUS ORGANIZATION APPROVAL REGISTER COMPLETION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S105, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: AI Governance & Platform Operations
```

## 1. Objective

The Session 72 Autonomous Organization module already had an approval-first
concept and a dashboard, but its proposals lived in a per-organization JSON
blob, there were no shared request contracts, no detail/list/delete lifecycle,
no dedicated UI, and the dashboard could imply 100% governance compliance on
an empty organization. Session 106 completes the approval register while
preserving the important boundary: **this module never executes autonomously**.

1. individual org-scoped decision records with CSPRNG IDs;
2. shared `Aut` contracts and Zod validation;
3. proposal, list, detail, human resolve and pending-delete paths;
4. fail-closed cross-tenant reads and mutations;
5. safe migration from legacy per-org decision blobs;
6. computed department and guardrail summaries from real proposals;
7. honest empty-state governance/impact values and explicit approved-estimate
   labeling;
8. dedicated approval-first UI with admin actions and read-only user state.

## 2. Storage model

New records use:

- `aut:meta:i:<org>:ledger`
- `aut:decision:i:<org>:<id>`
- `aut:decision:idx:<org>`

Each decision stores its `organizationId` and remains `awaiting_human` until
an authenticated admin resolves it to `approved` or `rejected`. The legacy
`aut:<org>:decisions` JSON blob is migrated once and removed; no new writes
use it.

`autonomyIndex` is the human review rate, not a claim of machine autonomy.
`autonomousSavings30dUsd` is only approved estimated impact and carries
`impactKind: approved_estimate`; it is not realized savings. Budgets, plans,
board seats and AI executives remain zero/empty without their own ledgers.

## 3. API surface (`/api/v1/autonomous`, authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/rollup` | computed approval-first dashboard |
| GET | `/decisions` | list with status/department/limit filters |
| POST | `/decisions` | admin submits a proposal for human approval |
| GET | `/decisions/:id` | scoped decision detail |
| POST | `/decisions/:id/resolve` | admin approves/rejects with note |
| DELETE | `/decisions/:id` | admin deletes only a pending proposal |

## 4. UI

`/app/autonomous` is a dedicated approval console with:

- human review rate, open approvals, derived departments and approved-estimate
  cards;
- decision register with risk/status/recommendation/approver details;
- admin proposal and approve/reject forms;
- pending draft deletion;
- guardrail messaging that no autonomous execution occurs;
- read-only state for non-admin users and honest zero/empty states.

The existing PlatformPage Autonomous Organization tab remains compatible with
the extended dashboard type.

## 5. Verification gate

- `apps/api/src/autonomous/autonomous.test.ts` covers 10 cases: record keys,
  filters, human resolution, cross-tenant fail-closed behavior, pending delete,
  empty honesty, dashboard aggregation, blocked guardrails, legacy migration,
  determinism and shared contracts.
- Existing `usage/rollups.test.ts` remains green.
- `make verify` must pass with offline Prisma generation; live Redis and
  authenticated end-to-end approval validation remain runtime gates.
- The inventory may mark Autonomous Organization COMPLETE only after shared
  contracts, scoped ledger service/routes, typed client, dedicated UI, tests
  and isolation registration exist.
