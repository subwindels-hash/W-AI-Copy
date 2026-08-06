# Session 120 Runtime Validation Checklist — Public API Gateway completion

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted.
> Until every box is ticked and signed, Session 120 stays 🟡 VERIFIED (partial).

The unit suite proves the cross-tenant pin, the delete/renewal correction
paths and the ledger arithmetic against in-memory Prisma and KV fakes; only a
live deployment proves the `ApiKey`/`Workflow` tables, the `pub:*` keyspace,
the Session 89 sweep and the real `runWorkflow` executor behave as this module
assumes.

## Route mounting and backwards compatibility

- [ ] All six gateway endpoints answer on their original paths and shapes:
      `GET /api/rest/v1/`, `GET /workflows`, `POST /workflows/:id/run` (201),
      `GET /agents`, `POST /talk/channels/:id/messages` (201),
      `GET /talk/channels`.
- [ ] `POST /workflows/:id/run` still returns the run record shape
      (`runId`, `status`, `nodeRuns`) and still answers `404` for an unknown
      or foreign workflow id, `400` for a non-runnable status.
- [ ] `POST /talk/channels/:id/messages` still returns the raw `TalkMessage`
      row and `404` for a foreign channel.
- [ ] `GET /workflows` / `/agents` / `/talk/channels` return the same arrays
      when `?limit` is absent (historical behaviour) and a capped array when
      `?limit=50` is given; `?limit=0` and `?limit=201` answer `400`.
- [ ] The internal `/api/v1/apikeys` `GET /`, `GET /:id`, `POST /` and
      `PATCH /:id` behave exactly as before, including the `201` on create and
      the plaintext-key-once rule.
- [ ] All eight gateway paths answer `401` without a token, and `403` for a
      valid key lacking the required scope.
- [ ] A session with a revoked or expired key answers `401`, not `500`.

## The defect this session fixes

- [ ] **Cross-tenant workflow trigger.** Create org A and org B. Give a user
      memberships in both. Issue a key to org A through that user, then:
      - [ ] `POST /api/rest/v1/workflows/:id/run` against a workflow owned by
            **org B** answers **404** and creates **no** `WorkflowRun` row.
            *(Before this session it ran org B's workflow: the route resolved
            the workflow through the creator's membership, not the key's
            org.)*
      - [ ] The same call against a workflow owned by org A succeeds, and the
            run row's `workflowId` is org A's workflow.
- [ ] **DELETE /apikeys/:id revoke-vs-delete.** Create a key, call
      `DELETE /api/v1/apikeys/:id`:
      - [ ] the response is `{ ok: true, data: { id, deleted: true } }`;
      - [ ] the token immediately answers `401` on the gateway;
      - [ ] the row is absent from `GET /apikeys?includeRevoked=true`;
      - [ ] an `AuditLog` row with action `admin.apikey.deleted` exists.
      *(Before this session DELETE silently revoked — the row and the
      `includeRevoked` listing were permanent.)*
- [ ] **Renewal.** Create a key with `expiresInDays: 1`, then
      `PATCH /api/v1/apikeys/:id { "expiresInDays": 90 }`:
      - [ ] the response reports the new `expiresAt`;
      - [ ] the key verifies after its original expiry would have passed.
      Revoked keys still answer `409` to any PATCH.

## The call ledger (Redis)

- [ ] Fire several authenticated gateway calls; confirm the keyspace:
      - [ ] `pub:since:<org>` — one string, set once (NX), never overwritten;
      - [ ] `pub:req:<org>` — a hash `{keyId: lifetimeCalls}`;
      - [ ] `pub:day:<org>:<YYYY-MM-DD>` — a hash with a TTL of 92 days,
            refreshed on each call that day;
      - [ ] `pub:evt:<org>` — a list capped at 200, newest first, entries
            `{keyId, method, path, at}`.
- [ ] Fire 250 calls; `pub:evt:<org>` holds exactly 200 and `pub:since:<org>`
      still holds the first call's timestamp.
- [ ] `KEYS pub:*` with a live Session 89 sweep run: every `pub:` key is
      conforming (org segment present straight after the prefix) and no
      finding is reported for the four new namespaces.
- [ ] Stop Redis and call the gateway: requests still succeed (200/201) —
      the ledger is best-effort. Restart Redis; `GET /api/rest/v1/usage`
      answers `ledgerAvailable: false` with empty ledger fields (not zeros),
      while `perKey` still lists the database identifiers.

## Usage-report honesty

- [ ] Fresh organization with a key but no calls: `GET /api/rest/v1/usage`
      returns `totalCalls: 0`, `ledgerStart: null`, `avgCallsPerDay: null`,
      `daily`-style fields empty — and the console shows "not recorded",
      never `0`.
- [ ] Record a call today and one 10 days ago. With `days=7`:
      `callsInWindow` counts only today's call; `totalCalls` is 2;
      `ledgerStart` still reports the 10-day-old timestamp;
      `ledgerCoveredDays` is 7, not 11.
- [ ] 3 calls over 2 covered days → `avgCallsPerDay` is `1.5`; 1 call over 7
      covered days → `0.14`, never rounded up.
- [ ] Delete a key that has recorded calls: the report keeps its counts with
      `name: null` and `keyPrefix: null`.
- [ ] Two organizations: org A's calls never appear in org B's report, and
      `pub:*` keys are separate.

## Console (web)

- [ ] `/app/public-api` loads with the sidebar entry visible; the stat cards,
      keys-and-usage table, recent calls and endpoint reference render.
- [ ] The Usage tab shows "not recorded" for a null average, the
      `ledgerAvailable: false` banner when Redis is down, and the
      ledger-start line.
- [ ] A revoked key shows a "revoked" badge; a deleted key appears as
      "deleted key" with its historical counts.
- [ ] Non-administrator members see the same org-scoped read surface.
