# SESSION 114 SPECIFICATION — GOOGLE IDENTITY COMPLETION

```
WINDELS AI OS Enterprise Documentation
Version: 1.0
Documentation Release: 2026 Edition
Last Updated: 2026-08-06
Status: AUTHORITATIVE (additive session — extends S1–S113, removes nothing)
Document Owner: Platform — Identity & Access
Applies To: WINDELS AI OS Monorepo
```

## 1. Objective

The Google sign-in path was already real. `apps/api/src/services/googleAuth.service.ts`
performs an OpenID Connect authorization-code exchange, verifies the ID token
against Google's published JWKS (signature, `iss`, `aud`, `exp`, `nonce`,
`email_verified`), links to an existing user or provisions a new
user/organization/membership, and mints the platform session JWT. Its unit suite
generates a real RSA keypair, serves it as a JWKS from a stubbed `fetch`, and
proves each rejection — including a token signed by the wrong key. **None of
that is modified by this session.**

What did not exist was everything an operator needs *around* that flow:

- **No policy.** Any Google account that resolved to a member of an
  organization could sign in. An organization could not restrict Google
  sign-in to its own domain, could not require that an administrator link the
  account first, and could not turn Google sign-in off for itself at all.
- **No record.** Nothing was written when a Google sign-in happened, so nobody
  could answer "who uses Google here, from which domains, and when did they
  last sign in". The only trace was an `AuditLog` row with no queryable shape.
- **No way to cut an account off.** A departed employee's Google account kept
  working until the platform user itself was deleted.
- **No visibility of the configuration.** `GET /auth/google/status` returned a
  single boolean. Whether the redirect URI was the one this API actually
  serves, or whether it was plain HTTP on a public host, was invisible.
- **A broken return leg.** The API has always finished the flow by redirecting
  the browser to `<web origin>/auth/callback#token=…`. **That route did not
  exist in the web app.** A successful Google sign-in landed on the not-found
  page and the token in the fragment was discarded.

Session 114 completes the module additively:

1. a new shared contract `packages/shared/src/googleAuth.ts` (types, Zod
   schemas, the notes that ship with each payload);
2. an organization-scoped governance service over Redis —
   policy, linked-identity register, ledger, configuration report;
3. fifteen new endpoints on an `/auth/google` sub-router mounted **ahead of**
   the three original OAuth endpoints, which keep their paths and their
   unauthenticated status;
4. a policy gate and a ledger write wired into the real callback, so the
   governance layer is enforced where it matters rather than only in tests;
5. a typed web client, an `/app/google-identity` console, and the missing
   `/auth/callback` page;
6. forty-one unit tests, seven new integration cases inside the existing OAuth
   suite, and a ten-case Playwright spec.

Nothing in `services/googleAuth.service.ts`'s verification logic, and nothing in
the three original routes' contracts, was rewritten or removed.

## 2. Domain model

| Record / view | Purpose | Honesty rule |
|---|---|---|
| `GoogleAuthPolicy` | who may use Google to sign in to this organization | when no record is stored the response is the platform default with `isDefault: true` — the API never presents a default as a decision somebody made |
| `GooglePolicyDecision` | the outcome of evaluating one address | carries the `mode` it was evaluated under, whether that mode was the default, the allowlist entry that matched, and a prose `reason` naming the rule that decided |
| `GooglePolicyDryRun` | the same, from the console | adds `applied: false` and a note stating that no sign-in was attempted and no ledger entry was written |
| `GoogleLinkedIdentity` | one Google account linked in this organization | `subjectFingerprint` is a truncated SHA-256 of Google's `sub`, never the raw value; `lastSignInAt` is `null` until a sign-in is recorded; `recordedSignIns` counts what the ledger observed, not a lifetime total |
| `GoogleSignInEvent` | one recorded event | `outcome` is `null` for administrative actions rather than being coerced to a sign-in outcome |
| `GoogleEventList` | the ledger | reports `stored`, `retentionLimit` and `oldestAt` so a trimmed history is visible as trimmed |
| `GoogleAuthConfigStatus` | environment readiness | `ready` is *derived* from the checks (`every(status === "pass")`); a warning is never rounded up to a pass |
| `GoogleAuthSummary` | console rollup | every count is of recorded events; `lastAt`, `oldestAt` are `null` rather than a placeholder date |
| `GoogleIdentitySelf` | the caller's own link | `decision: null` when unlinked — no decision is invented for an address that has no identity |

### Policy modes

| Mode | Meaning |
|---|---|
| `open` | any member of the organization may sign in with Google. **The platform default, and exactly the historical behaviour.** |
| `domain_allowlist` | the address domain must appear on the allowlist. Matched exactly: a subdomain is not a match for its parent, and wildcards are rejected at validation time. |
| `linked_only` | an active linked identity must already exist for the address. A first Google sign-in is refused until an administrator links it. |
| `disabled` | Google sign-in is refused for members of this organization. |

`blockRevokedIdentities` (default `true`) refuses a revoked identity regardless
of mode. It can be turned off deliberately, and the test suite pins that too.

## 3. What the policy can and cannot gate

Stated in the payload itself (`GOOGLE_PROVISIONING_NOTE`), not only here:

> A Google account with no existing platform user provisions its own workspace
> and therefore belongs to no organization at the moment the decision is made.
> No organization policy can gate that first sign-in; the resulting identity is
> recorded in the new workspace's ledger and can be revoked there.

The gate runs after the ID token has been verified and the account has been
resolved to an existing user with a membership. It does not affect
email/password sign-in, API keys, enterprise SSO, or a session that has already
been issued — an existing access token runs until it expires
(`GOOGLE_POLICY_NOTE`).

## 4. Storage

Redis, organization-scoped, audited by the Session 89 namespace sweep:

```
gid:policy:i:<org>:current
gid:link:i:<org>:<id>     gid:link:idx:<org>
gid:event:i:<org>:<id>    gid:event:idx:<org>
```

`gid:policy`, `gid:link` and `gid:event` were added to `TI_NAMESPACE_CATALOG` as
`org_scoped`. The pre-existing `google:state` namespace (OAuth CSRF state) was
added as `shared` **by design**: it is issued before any user — and therefore
any organization — is known, and expires in ten minutes.

Reads are fail-closed: the stored document's `organizationId` is re-checked
after the key lookup, so a record planted under another organization's key is
invisible rather than merely unlikely to be found. Identifiers are CSPRNG
(`gid_${randomUUID()}`, `gev_${randomUUID()}`).

The ledger keeps `GOOGLE_EVENT_LIMIT` (500) entries per organization and trims
the oldest by score. The per-identity `recordedSignIns` counter is durable and
is *not* recomputed from the ledger, so the two can legitimately disagree after
trimming — both numbers are reported rather than reconciled behind the
operator's back.

## 5. Endpoints

Mounted on an `/auth/google` sub-router registered **before**
`registerGoogleAuthRoutes(v1)`. The sub-router attaches `authenticate` per
handler rather than with `router.use`, so `GET /auth/google`,
`GET /auth/google/status` and `GET /auth/google/callback` fall through to the
original handlers unchanged — including remaining unauthenticated.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/auth/google/summary` | member | console rollup |
| GET | `/auth/google/config` | admin | environment readiness checklist |
| GET | `/auth/google/policy` | member | current policy (or the labelled default) |
| PUT | `/auth/google/policy` | admin | replace the policy |
| DELETE | `/auth/google/policy` | admin | remove the record; the default applies again |
| POST | `/auth/google/policy/evaluate` | admin | dry run against one address |
| GET | `/auth/google/me` | member | the caller's own link and the decision for it |
| POST | `/auth/google/me/revoke` | member | revoke one's own link |
| GET | `/auth/google/identities` | member | register, filtered by status/domain/user/text |
| GET | `/auth/google/identities/:id` | member | one identity |
| POST | `/auth/google/identities/:id/revoke` | admin | refuse future Google sign-ins for it |
| POST | `/auth/google/identities/:id/restore` | admin | undo a revoke |
| DELETE | `/auth/google/identities/:id` | admin | forget the register entry |
| GET | `/auth/google/events` | admin | the ledger |
| GET | `/auth/google/domains` | member | domains observed among linked identities |

## 6. Integration into the live flow

Two call sites inside `handleCallback`, both additive:

1. **Gate.** After the ID token is verified and the account resolves to a user
   with a membership, `GoogleIdentityService.authorizeSignIn` is consulted. A
   refusal is written to that organization's ledger and then raised as
   `GOOGLE_SIGNIN_BLOCKED`. With no stored policy the decision is `allowed`, so
   a deployment that never configures a policy behaves exactly as before.
2. **Record.** After the session JWT is signed,
   `GoogleIdentityService.recordSignIn` upserts the identity and appends the
   event. This is best effort on purpose: the sign-in has already been
   authorized, and losing an audit row must not lock a legitimate user out.

The callback route translates `GOOGLE_SIGNIN_BLOCKED` into a redirect to
`<web origin>/auth/callback#error=policy_blocked&outcome=…&message=…`, so the
user is told the organization's own reason instead of meeting a 500. Every
other failure keeps its original path through the error handler.

## 7. Web surface

- `apps/web/src/lib/googleAuth.ts` — `googleSignIn` (pre-auth: status and the
  full-page navigation URL) and `googleAuthApi` (the governance surface).
- `apps/web/src/pages/googleAuth/GoogleIdentityPage.tsx` at
  `/app/google-identity`, five tabs (overview, linked identities, policy,
  ledger, configuration). Counts that were never recorded render "none
  recorded"; a date that was never observed renders "never". The
  privacy/ledger/policy/provisioning notes are rendered from the API payload
  rather than restated in the UI, so they cannot drift.
- `apps/web/src/pages/auth/GoogleCallbackPage.tsx` at `/auth/callback` — the
  missing return leg. It adopts the token, clears the fragment from history
  immediately, and renders the refusal reason when the API sent one. It states
  the honest limitation that the callback issues no refresh token, so the
  session ends when the access token expires.

## 8. Verification

| Check | Result |
|---|---|
| `apps/api/src/googleAuth/googleIdentity.test.ts` | 41 tests, all passing |
| `apps/api/src/services/googleAuth.test.ts` | 30 tests (23 pre-existing + 7 new integration cases), all passing |
| `tests/e2e/googleAuth.spec.ts` | 10 Playwright cases (require a live API) |
| `make verify` | 7/7 tasks, **1294 passing**, 51 skipped, 0 failures |
| API typecheck | clean apart from the pre-existing `@prisma/client` generated-type errors (Prisma engines cannot be fetched in this sandbox) |
| Web typecheck | clean |
| Guards | `noRandomData.guard.test.ts` and `noFakeVerdict.guard.test.ts` pass; no `Math.random` was introduced |
| Inventory | `googleAuth` PARTIAL → **COMPLETE**; 106 modules, 94 COMPLETE, 9 PARTIAL, 2 STUB-by-design, 1 DEMO DATA |

Runtime validation against live PostgreSQL 17 + Redis 8 is **pending** in this
sandbox; see `docs/SESSION_114_RUNTIME_VALIDATION_CHECKLIST.md`. Session 114 is
therefore 🟡 VERIFIED (partial).
