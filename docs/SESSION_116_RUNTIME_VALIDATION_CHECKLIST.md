# Session 116 Runtime Validation Checklist — MFA Assurance

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted.
> Until every box is ticked and signed, Session 116 stays 🟡 VERIFIED (partial).

Several checks below need a **real authenticator app** (or the `oathtool`
command line) holding the enrolment secret. The unit suite computes TOTPs with
its own HMAC implementation, which proves the maths; only a real app proves the
otpauth URL is scannable.

## Route mounting and backwards compatibility

- [ ] All six original endpoints answer on their original paths after the
      Session 116 router was mounted ahead of them on the same prefix:
      `GET /mfa/status`, `POST /mfa/enable`, `/mfa/confirm`, `/mfa/verify`,
      `/mfa/disable`, `/mfa/recovery-codes`.
- [ ] Their success payloads are byte-identical to the pre-Session-116 shapes
      (`{enabled, enforced, recoveryCodesRemaining}`,
      `{secret, otpauthUrl, recoveryCodes}`, `{verified, method}`,
      `{ok, data:{ok, method}}`, `{ok:true}`, `{recoveryCodes}`).
- [ ] **The 401-not-500 fix.** Every one of the six answers `401` without a
      token. Before this session they dereferenced an undefined `req.user` and
      returned `500`; confirm the change against the previous build if one is
      still deployed.
- [ ] All eighteen assurance paths answer `401` without a token.
- [ ] The eleven administrator-only paths answer `403` for an ordinary member;
      the seven member paths succeed for the same member.
- [ ] A session with no organization receives `403` from every
      organization-scoped path (not a Redis key containing the literal string
      `undefined`).
- [ ] An unknown path under `/mfa` returns `404`, not a stack trace.

## TOTP interoperability (needs a real authenticator)

- [ ] `POST /mfa/enable`, scan the returned `otpauthUrl` with Google
      Authenticator **and** one other app. Both produce codes that
      `POST /mfa/confirm` accepts.
- [ ] The configuration report's `totp` block matches the parameters in the
      scanned URL (`SHA1`, 6 digits, 30 s).
- [ ] A code from the previous period is accepted; a code two periods old is
      refused (the ±1 drift window, on real wall-clock time rather than fake
      timers).

## Throttle

- [ ] Five wrong codes in a row against `POST /mfa/verify` → the fifth response
      is still `400`, and the **sixth** attempt is `429` with a `Retry-After`
      header and `MFA_LOCKED`.
- [ ] The same threshold applies on `POST /auth/mfa/complete`; the error is
      `429`, not `401`.
- [ ] `GET /mfa/lock` reports `retryAfterSeconds` that genuinely counts down
      against real Redis TTL.
- [ ] After `MFA_LOCKOUT_SECONDS` the lock lifts by itself with no further
      request, and `mfa:lock:<user>` has actually expired in Redis
      (`TTL` returns `-2`).
- [ ] Four failures, then wait past `MFA_FAILURE_WINDOW_SECONDS`, then a fifth:
      the account is **not** locked (the window aged out) and the counter reads 1.
- [ ] `POST /mfa/locks/:userId/clear` lifts a live lock, and
      `GET /mfa/events?kind=lock_cleared` shows who lifted it.
- [ ] Two API instances behind a load balancer share the lock: fail three times
      against instance A and three against instance B → locked. (This is the
      check the in-memory suite structurally cannot make.)

## Replay guard

- [ ] Verify with a valid TOTP, then immediately submit the *same* code again
      within the same 30 s period → `400 MFA_CODE_REPLAYED`.
- [ ] The same code is still accepted for a *different* user enrolled with a
      different secret that happens to produce it.
- [ ] After `MFA_REPLAY_GUARD_SECONDS` the marker key is gone from Redis and the
      code is refused by the TOTP verifier itself (not by the guard).
- [ ] Kill Redis, restart it, and confirm the guard fails **open** (a code is
      accepted) rather than locking everyone out — and that this matches
      `MFA_REPLAY_NOTE`'s stated behaviour.

## Enrolment lifecycle

- [ ] `POST /mfa/enable` then `GET /mfa/enrollment` → `pending`.
- [ ] `POST /mfa/confirm` with a real code → `confirmed`, `confirmedAt` set once
      and never restamped by later verifications.
- [ ] `POST /mfa/enrollment/abandon` on a pending enrolment clears the secret,
      the recovery digests and the enrolment record; the next login needs no
      second factor.
- [ ] The same call on a **confirmed** enrolment changes nothing and returns the
      "disable it with a valid code instead" reason.
- [ ] A user enrolled **before** this deploy reads `unrecorded` — verify against
      a secret written by the previous build.

## Policy and enforcement

- [ ] With no stored policy, an existing deployment behaves exactly as before:
      `optional` / `report_only`, `source: "default"`, nobody blocked.
- [ ] `PUT /mfa/policy {enforcement:"block_after_grace"}` from an unenrolled
      administrator → `400`, and `GET /mfa/policy` still reports the previous
      value (the refusal must not half-apply).
- [ ] The same call from an enrolled administrator succeeds.
- [ ] With `required_all` + `graceDays: 0` + `block_after_grace`, an unenrolled
      member's `POST /auth/login` returns `403` with the enrolment message, and
      `GET /mfa/events?kind=login_blocked` records it.
- [ ] The same member enrols and can then log in — no restart, no cache flush.
- [ ] An exempt member is never blocked; the exemption expiring makes them
      blockable again with no further action.
- [ ] Point the API at a **stopped** Redis and confirm logins still succeed: the
      policy evaluation fails open by design.
- [ ] `allowRecoveryCodes: false` → a recovery code is refused at
      `POST /mfa/verify` with `MFA_RECOVERY_CODES_DISABLED`, and a TOTP still
      works.

## Coverage against real Postgres

- [ ] Create an organization with 3 members in different membership roles;
      `GET /mfa/coverage` returns one row per **user** (a member holding several
      workspace memberships appears once).
- [ ] `membersTotal` matches `SELECT count(*) FROM "Membership" WHERE
      "organizationId" = …`.
- [ ] Measure `GET /mfa/coverage` latency for an organization with 500 members.
      Coverage performs four Redis reads per member (~2 000 round trips); record
      the p95 and decide whether a pipeline/MGET batch is warranted before this
      ships to a large tenant. **Do not** lower `MFA_MAX_COVERAGE_MEMBERS` to
      make the number look better — the cap is reported, and shrinking it hides
      members rather than speeding anything up.
- [ ] `GET /mfa/assurance/summary` on the same organization returns the same
      counts as `/coverage` (the summary must not drift from the report).
- [ ] `requiredCoverageRatio` is `null` while the policy is `optional`.

## Tenant isolation (Session 89 sweep)

- [ ] The compliance run reports the four new org-scoped namespaces
      (`mfa:policy`, `mfa:exempt`, `mfa:exemptidx`, `mfa:event`) with
      `leakedKeys: []`.
- [ ] The nine principal-scoped namespaces appear with scope `shared` and the
      catalogue's stated reason; none of them is reported as a leak.
- [ ] Two organizations each save a policy and grant an exemption. Neither can
      read the other's `/mfa/policy`, `/mfa/coverage`, `/mfa/events`,
      `/mfa/exemptions` or `/mfa/locks`.
- [ ] `POST /mfa/exemptions` for a user who belongs to a *different*
      organization returns `404`.

## Ledger durability

- [ ] Drive 600 events for one organization and confirm
      `LLEN mfa:event:<org>` is capped at 500 while the member stream keeps its
      own 500.
- [ ] Restart Redis with persistence enabled and confirm the ledgers survive;
      with persistence disabled, confirm the payload's own note is accurate
      about what was lost.

## Encryption key

- [ ] With `WINDELS_ENCRYPTION_KEY` set, `GET /mfa/assurance/configuration`
      reports `keySource: "environment"`.
- [ ] Unset it and confirm the report says `development_fallback` — and that the
      deployment checklist treats that as a production blocker.
- [ ] Grep the configuration response for any 64-hex-character run: there must
      be none.

## Web console

- [ ] `/app/mfa-assurance` loads for an administrator with all seven tabs, and
      for an ordinary member with only "My second factor".
- [ ] Changing the policy mode in the console persists and is reflected in
      coverage without a reload of the whole page.
- [ ] The pending-enrolment "Clear pending enrolment" button appears only when
      the member's state is `pending`.
- [ ] The coverage table renders `not_required` and `exempt` as distinct badges
      from `covered`.

## Sign-off

| Check group | Run by | Date | Result |
| --- | --- | --- | --- |
| Route mounting | | | |
| TOTP interoperability | | | |
| Throttle | | | |
| Replay guard | | | |
| Enrolment lifecycle | | | |
| Policy and enforcement | | | |
| Coverage | | | |
| Tenant isolation | | | |
| Ledger durability | | | |
| Encryption key | | | |
| Web console | | | |
