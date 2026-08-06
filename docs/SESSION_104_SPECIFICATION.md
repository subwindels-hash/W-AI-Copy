# SESSION 104 SPECIFICATION — API KEY MANAGEMENT COMPLETION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-05
Status: AUTHORITATIVE (additive session — extends S1–S103, removes nothing)
Applies To: WINDELS AI OS Monorepo
Document Owner: Developer Platform & Security
```

## 1. Objective

The repository already had a secure Prisma-backed API-key service, but the
`apikey` audit entry was incomplete: request/response types were local,
there was no dedicated client/page, the route only exposed list/create/revoke,
and mutations were not audited. Session 104 completes API-key management
without changing the token format or breaking the existing Developer Portal
routes.

1. **Shared contracts** — `Ak` types and Zod schemas for list rows, one-time
   create responses, mutations, scopes, query filters and IDs.
2. **Secure lifecycle** — CSPRNG `wnd_` tokens, SHA-256 hashes at rest,
   one-time plaintext create response, expiry/revocation verification and
   irreversible revocation.
3. **Org scoping** — all list/detail/update/revoke operations require the
   caller's organization membership; a key from another organization is
   indistinguishable from not found.
4. **Audited mutations** — create, update and revoke actions write real
   `AuditLog` records.
5. **Complete API** — add detail and update routes while preserving
   `/api/v1/apikeys` and `/api/v1/developers/api-keys` compatibility.
6. **Dedicated UI** — API key creation, one-time secret copy, scope selection,
   rename, revoke, optional expiry and revoked-key visibility.

## 2. Security model

The stored `ApiKey` row contains `keyPrefix` and `keyHash`; the raw key is
never persisted or returned by list/detail. `verifyApiKey` hashes the bearer
token, rejects revoked/expired keys and updates `lastUsedAt` on a real valid
use. The shared output types intentionally contain no hash field.

Scopes are `READ | WRITE | ADMIN`. Scope updates and key names are audited;
revocation cannot be reversed. A new key can optionally expire within 1–365
days.

## 3. API surface

### `/api/v1/apikeys` (authenticated)

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | list active keys; `includeRevoked=true` includes revoked metadata |
| POST | `/` | create key and return plaintext once |
| GET | `/:id` | read one scoped key metadata record |
| PATCH | `/:id` | rename/change scopes or revoke |
| DELETE | `/:id` | irreversible revoke |

The existing `/api/v1/developers/api-keys` list/create/delete paths continue
to call the same service and shared schema aliases.

## 4. UI

`/app/api-keys` renders the dedicated API key page. It uses
`apps/web/src/lib/apiKeys.ts` and provides:

- active/revoked/admin-key counts;
- name, scopes and expiry creation form;
- one-time plaintext panel with copy action and explicit dismissal warning;
- prefix-only key directory with last-used/created-by metadata;
- rename and revoke actions;
- optional revoked-key visibility;
- honest empty, loading and API error states.

The existing Developer Portal remains additive and continues to expose its
API-key tab.

## 5. Verification gate

- `apps/api/src/publicApi/publicApi.test.ts` now covers 10 tests: one-time
  secret/hash behavior, valid/bogus/revoked/expired verification, scoped list
  and detail, update/audit/revocation rules, cross-tenant rejection, hashing
  and shared Zod contracts.
- `make verify` must pass with offline Prisma generation; live Postgres and
  end-to-end bearer-token verification remain runtime gates.
- The inventory may mark `apikey` COMPLETE only when shared contracts,
  service/routes, typed client, dedicated UI, tests and integration exist.
