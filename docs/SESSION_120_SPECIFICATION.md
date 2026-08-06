# Session 120 — Public API Gateway: a cross-tenant hole closed, DELETE that deletes, and a call ledger that admits what it has not measured

**Module:** `publicApi` · **Status before:** PARTIAL (routes = 6, shared contract = borrowed `apiKeys.ts`, web client = none)
**Status after:** COMPLETE (routes = 8, shared contract = 178 LOC, web client + console, 3 test suites)
**Date:** 2026-08-06 · **Branch:** `arena/019fd6f3-win`

---

## 1. What already existed, and is untouched

The public gateway is mounted at `/api/rest/v1` (separate from the internal `/api/v1`), authenticated with organization API keys via `Authorization: Bearer wnd_…`. Its six endpoints keep their exact paths, scopes, status codes and response shapes:

| Endpoint | Scope | Status |
| --- | --- | --- |
| `GET /` | any valid key | 200 |
| `GET /workflows` | READ | 200 |
| `POST /workflows/:id/run` | WRITE\|ADMIN | 201 |
| `GET /agents` | READ | 200 |
| `POST /talk/channels/:id/messages` | WRITE\|ADMIN | 201 |
| `GET /talk/channels` | READ | 200 |

The key lifecycle service (`publicApi.service.ts` — CSPRNG `wnd_` tokens, sha256 at rest, `lastUsedAt`, expiry, revocation, audit trail) is untouched in behaviour; the internal `/api/v1/apikeys` routes keep `GET /`, `GET /:id`, `POST /` and `PATCH /:id` exactly as they were. **Nothing was removed or rewritten away.**

## 2. What was wrong

| Defect | Consequence before Session 120 |
| --- | --- |
| **The public workflow trigger resolved the workflow through the key creator's *membership*, not the key's organization.** `POST /api/rest/v1/workflows/:id/run` passed only `apiUser.id` into `runWorkflow`, which calls `resolveUserContext(userId)` and looks the workflow up in *that* organization. The key itself was verified against its own org (the middleware attaches `apiOrganization`), so the request was authenticated as org A and executed org B's node graph. | A key issued to org A whose creator also held a membership in org B could **trigger org B's workflows** — read org B's workflow definitions, execute them, and write `WorkflowRun` rows into org B's tables. Every other gateway route scoped correctly; this one did not. |
| **`DELETE /api/v1/apikeys/:id` revoked instead of deleting.** The Express `delete` handler called `revokeApiKey`. HTTP DELETE semantics — and the caller's reasonable expectation — are "remove this resource", but the row stayed, the response was the mutation shape, and there was **no way to permanently remove an API key ever**. | Revoked (or merely unwanted) keys accumulated forever. A leaked key could be revoked but its row — and its presence in `?includeRevoked=true` listings — was permanent. There was no correction path. |
| **No renewal path.** `expiresAt` was set at creation and could never be changed by `PATCH` (the schema had no expiry field and the handler ignored none). | An expiring key was a countdown to a permanently dead credential: once expired, `verifyApiKey` returns null and nothing could extend it (or delete it — see above). |
| **No usage accounting.** The gateway recorded nothing about who calls what; the only signal was `lastUsedAt` — a database write on every request — with no counts, no time dimension, no history. | An organization could not answer "which key is hammering the API", "how many calls did we serve this week", or "which keys are dead weight". |
| **Unbounded list endpoints and no detail fetch.** | `GET /workflows`, `/agents` and `/talk/channels` had no result cap; consumers could not fetch a single workflow. |

## 3. What Session 120 adds

### 3.1 Shared contract — `packages/shared/src/publicApi.ts` (new, 178 LOC)

The module's first *dedicated* contract (it previously borrowed `apiKeys.ts`, which is untouched). `PUBLIC_API_BASE_PATH`, typed views of the whole public surface (`PubGatewayIdentity`, `PubWorkflowSummary`/`PubWorkflowDetail`, `PubAgentSummary`, `PubTalkChannelSummary`, `PubTalkMessageSent`), the usage report types (`PubUsageReport`, `PubKeyUsageRow`, `PubRecentCall`), constants (`PUBLIC_API_EVENT_CAP = 200`, `PUBLIC_API_RECENT_CALLS_LIMIT = 50`, day-bucket TTL 92 d, window bounds 1–90 d, list limit 1–200) and Zod schemas (`PubListQuerySchema`, `PubWorkflowIdSchema`, `PubTalkChannelIdSchema`, `PubRunWorkflowBodySchema`, `PubTalkMessageBodySchema`, `PubUsageQuerySchema`).

`packages/shared/src/apiKeys.ts` gains **one appended optional field** — `expiresInDays` on `AkApiKeyUpdateSchema` (1–365) — and `AkApiKeyMutation` gains `expiresAt: string | null` so renewal responses report the new expiry. Existing bodies and consumers are unaffected.

### 3.2 Service fixes

**The cross-tenant hole.** `runWorkflow(userId, id, input)` in `services/workflow.service.ts` gains an optional fourth parameter `organizationId`. When omitted, behaviour is byte-for-byte the historical one (resolve through the actor's membership — all internal callers unchanged). When provided, the workflow lookup — and the `executeNode` context and run-dispatch events — use that organization, and the actor's membership is not consulted at all. The gateway now passes the **verified key's** organization, so the run cannot leave the tenant that authenticated the request.

**The correction path.** New `deleteApiKey(userId, id)` in `publicApi.service.ts`: org-scoped lookup → hard delete of the row → audit `admin.apikey.deleted` (with `wasRevoked` and `keyPrefix`) → `{ id, deleted: true }`. `DELETE /api/v1/apikeys/:id` now calls it. Soft revocation remains available via `PATCH { revoked: true }`, so no capability is lost — the semantics are just no longer a lie.

**The renewal path.** `updateApiKey` applies `expiresInDays` as a fresh `expiresAt = now + days`, audits it (`expiresInDays`, `expiresAt` in metadata) and reports the new expiry in the response. An *expired* (but not revoked) key verifies again after renewal; revoked keys remain immutable (409).

### 3.3 The call ledger — `publicApiUsage.service.ts` (new)

Org-scoped, **best-effort** Redis ledger written from `apiKeyAuth` after a successful verification:

| Key | Shape | Contents |
| --- | --- | --- |
| `pub:since:<org>` | string, NX once | first-call timestamp |
| `pub:req:<org>` | hash | keyId → lifetime calls |
| `pub:day:<org>:<YYYY-MM-DD>` | hash, TTL 92 d refreshed | keyId → calls that UTC day |
| `pub:evt:<org>` | list, capped 200 | recent `{keyId, method, path, at}` |

The prefix is `pub:` and **not** a bare `pub` catalog entry — `pub:req:<org>` has the org in the *second* segment, and a shorter entry would make the Session 89 sweep read the literal `req` as an organization id (the same prefix-length constraint as `opx:` and `pt:`). All four namespaces are registered in `TI_NAMESPACE_CATALOG` as org-scoped.

`recordPublicApiCall` never throws: a Redis outage must not fail or slow an API call. The report (`publicApiUsage(orgId, windowDays)`):

- **database side (identifiers only):** per-key `name`, `keyPrefix`, `revoked`, `lastUsedAt`;
- **ledger side (counts only):** `ledgerAvailable`, `ledgerStart` (the NX marker — immune to the event cap), `totalCalls`, `callsInWindow`, `callsToday`, `distinctUseDays`, `ledgerCoveredDays`, `avgCallsPerDay` (floored, `null` on zero covered days), `perKey` (union of DB keys and ledger keys; a key deleted after its calls were recorded keeps its counts with `name: null` / `keyPrefix: null`), `recentCalls` (≤ 50), and a static `note` stating what the numbers are.

### 3.4 Routes

- `routes/publicApi.ts` — the six endpoints unchanged; **added** `GET /workflows/:id` (READ, detail with triggers/nodes/edges) and `GET /usage` (READ, the ledger report); all three list endpoints accept an **optional** `?limit=1..200` (absent = historical behaviour); the run route is pinned to the key's organization.
- `routes/apikey.ts` — `DELETE /:id` → hard delete (semantic correction, documented in the route); **added** `GET /apikeys/usage` (internal, user auth, declared before `/:id`) serving the same report to the console.
- `http/middleware/apiKeyAuth.ts` — after a successful verification, fires the best-effort `recordPublicApiCall` (Bearer-only auth and scope enforcement unchanged).

### 3.5 Web — typed client + console

`apps/web/src/lib/publicApi.ts` (new): shared-contract types re-exported, `PUBLIC_API_BASE_PATH`, and `publicApiUsageApi.usage(days)` against the internal endpoint.

New `apps/web/src/pages/admin/PublicApiPage.tsx`, routed at `/app/public-api` with a sidebar entry ("Public API"): the gateway base path + auth scheme; a `ledgerAvailable: false` banner; null-aware stat cards (`avgCallsPerDay` prints "not recorded", never `0`); a keys-and-usage table (name/prefix/status/calls/in-window/today/last-used, with deleted keys shown as `deleted key` without a name); recent calls; and an endpoint reference explicitly labelled as documentation, not measured data. **No `?? 0` in any value position.**

### 3.6 Tenant isolation

`TI_NAMESPACE_CATALOG` gains four org-scoped namespaces: `pub:since`, `pub:req`, `pub:day`, `pub:evt` — each with the org id in the segment straight after the prefix, with a comment explaining why a bare `pub` entry must never be added.

## 4. Tests

- `apps/api/src/publicApi/publicApi.test.ts` — the Session 104/120 predecessor suite, untouched (10 tests, all passing).
- `apps/api/src/publicApi/publicApi.completion.test.ts` — **new, 38 tests**:
  - the cross-tenant fix: pinned run works, refuses the other org's workflow even when the creator belongs to it (404, no run row), works when the pinned org is the creator's *second* membership, membership-resolution regression guard, non-runnable status → 400;
  - DELETE semantics: row gone, token dies, revoked keys deletable, audit entry, cross-org refusal, 404;
  - renewal: extension + reported expiry, expired key verifies again, revoked key refused (409), audit metadata, schema bounds;
  - ledger: NX marker, totals/day buckets/TTL/events, event cap, per-key counts;
  - report: honest empty shape, window/today/covered-day math, pre-window exclusion with floored average, deleted-key counts with null identifiers, org isolation, `ledgerAvailable: false` on failure, revoked marking;
  - middleware: Bearer-only, revoked → 401, org attachment + ledger write, ledger failure never fails the request, `requireScope` semantics (ADMIN satisfies all, 403 names the scopes);
  - shared Zod: list/usage bounds, message content bounds, run-body default, cuid params.
- `tests/e2e/publicApi.spec.ts` — **new, 9 Playwright cases** against a live API: anonymous refusals on all eight paths; the six predecessor endpoints' paths/scopes/status codes with a full-scope key (unknown ids → 404); READ-only key refused with 403 on both write endpoints; query-string key refused (Bearer only); calls landing in the ledger and readable via `GET /api/rest/v1/usage`; the internal `GET /apikeys/usage`; **DELETE hard-deletes** (token 401 + row gone from `includeRevoked=true`); renewal extends the expiry; revoked keys stay immutable (409).

**Full suite: 1656 passing / 51 skipped / 112 files** (Session 119 baseline was 1618 / 51 / 111). API and web typecheck clean; web production build emits the new console chunk.

## 5. Honesty notes

- The ledger is **best-effort and says so**: `ledgerAvailable: false` on a Redis failure, and the note explains counts come from the ledger and identifiers from the database.
- Days before `ledgerStart` are never reported as zero-call days; averages are floored and `null` on an empty denominator.
- A deleted key's past calls stay in the report with `name: null` / `keyPrefix: null` — no invented identifiers, no dropped history.
- The endpoint reference in the console is labelled as documentation, not measured data.
- No `Math.random` anywhere; tokens remain CSPRNG, hashes at rest.

## 6. Runtime validation

Live PostgreSQL 17 + Redis 8 + Prisma generation is not reachable in this sandbox, so this session ends **🟡 VERIFIED (partial)** and ships `docs/SESSION_120_RUNTIME_VALIDATION_CHECKLIST.md` for the target environment.

## 7. Files touched

| File | Change |
| --- | --- |
| `packages/shared/src/publicApi.ts` | **new** — contract, Zod, constants |
| `packages/shared/src/apiKeys.ts` | appended optional `expiresInDays` + `AkApiKeyMutation.expiresAt` |
| `packages/shared/src/index.ts` | export added |
| `apps/api/src/publicApi/publicApi.service.ts` | `deleteApiKey` new; `updateApiKey` renewal (behaviour preserved) |
| `apps/api/src/publicApi/publicApiUsage.service.ts` | **new** — ledger + report |
| `apps/api/src/services/workflow.service.ts` | `runWorkflow` optional org pin (additive) |
| `apps/api/src/http/routes/publicApi.ts` | 6 unchanged + `GET /workflows/:id`, `GET /usage`, `?limit`, org-pinned run |
| `apps/api/src/http/routes/apikey.ts` | DELETE semantics corrected; `GET /apikeys/usage` added |
| `apps/api/src/http/middleware/apiKeyAuth.ts` | best-effort ledger write |
| `apps/api/src/tenantIsolation/tenantIsolation.service.ts` | `pub:*` namespaces catalogued |
| `apps/api/src/testUtils/prismaClientMock.ts` | `WorkflowStatus`/`WorkflowRunStatus`/`WorkflowNodeType`/`NodeRunStatus` exports |
| `apps/api/src/publicApi/publicApi.completion.test.ts` | **new** — 38 tests |
| `apps/web/src/lib/publicApi.ts` | **new** — client |
| `apps/web/src/pages/admin/PublicApiPage.tsx` | **new** — console |
| `apps/web/src/router.tsx`, `apps/web/src/app/Sidebar.tsx` | `/app/public-api` wired |
| `tests/e2e/publicApi.spec.ts` | **new** — 9 cases |
| `audit/build-inventory.mjs` | publicApi client alias |
| `audit/module-inventory.json` | regenerated |
| `PROGRESS.md`, `docs/CHANGELOG.md`, `CONVENTIONS.md`, `project-understanding.md` | updated |
