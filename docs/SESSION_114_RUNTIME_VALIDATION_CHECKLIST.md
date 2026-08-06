# Session 114 Runtime Validation Checklist — Google Identity

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted.
> Until every box is ticked and signed, Session 114 stays 🟡 VERIFIED (partial).

## Route mounting and backwards compatibility

- [ ] `GET /api/v1/auth/google/status` answers `200` **without** an
      `Authorization` header — the Session 114 sub-router must not have
      swallowed it or forced auth onto it.
- [ ] `GET /api/v1/auth/google` still issues a `302` to
      `accounts.google.com/o/oauth2/v2/auth` when credentials are configured,
      and `503 PLATFORM_CREDENTIALS_REQUIRED` when they are not.
- [ ] `GET /api/v1/auth/google/callback` with no `code`/`state` still returns
      `400 Missing code/state`.
- [ ] Every Session 114 path returns `401` without a token; `/config`,
      `/events`, `PUT|DELETE /policy`, `/policy/evaluate` and the
      `/identities/:id` mutations return `403` for a non-admin member.
- [ ] An unknown path under `/auth/google` returns `404`, not a stack trace.

## Tenant isolation

- [ ] Two organizations each complete a Google sign-in for a different address.
      `GET /auth/google/identities`, `/summary`, `/events` and `/domains`
      return only the caller's rows in each.
- [ ] `GET /auth/google/identities/:id` with the *other* organization's id
      returns `404` and leaves the record intact
      (`HGET gid:link:i:<otherOrg>:<id> _doc` unchanged afterwards).
- [ ] Same for `POST /identities/:id/revoke`, `/restore` and
      `DELETE /identities/:id`.
- [ ] Plant a record by hand under org B's key with `"organizationId":"<orgA>"`
      inside the JSON. `GET /identities` for org B does not list it and
      `GET /identities/:id` returns `404` — the fail-closed re-check, not the
      key shape, is the guarantee.
- [ ] `redis-cli --scan --pattern 'gid:*'` shows only
      `gid:policy:i:<org>:current`, `gid:link:i:<org>:<id>`,
      `gid:link:idx:<org>`, `gid:event:i:<org>:<id>` and
      `gid:event:idx:<org>` — every key carries the org segment.
- [ ] `GET /api/v1/tenant-isolation/audit` lists `gid:policy`, `gid:link` and
      `gid:event` as `org_scoped` with zero findings, and `google:state` as
      `shared`.

## Policy enforcement through a real Google sign-in

These require a Google Cloud OAuth client whose redirect URI points at this
deployment. Perform each with a real browser.

- [ ] **Default is unchanged behaviour.** With no policy stored, an existing
      member signs in with Google exactly as before Session 114, and
      `GET /auth/google/policy` reports `isDefault: true`.
- [ ] **`disabled`.** Set the mode to `disabled`; the same member's sign-in ends
      on `/auth/callback` showing the refusal, `outcome=blocked_disabled`, and
      **no session is issued** (local storage carries no new token).
- [ ] **`domain_allowlist`.** Allow only a domain the member does not use; the
      sign-in is refused with `outcome=blocked_domain` and the reason names the
      rejected domain. Add their domain; the next attempt succeeds.
- [ ] **Subdomains are not matched.** With `windels.ai` allowed, an address at
      `sub.windels.ai` is refused.
- [ ] **`linked_only`.** A member with no linked identity is refused with
      `blocked_not_linked`; after an administrator has one recorded, they pass.
- [ ] **Revocation bites.** Revoke a linked identity, then attempt a Google
      sign-in for it: refused with `blocked_revoked`, and the reason quotes the
      revoke reason. Restore it and confirm the next attempt succeeds.
- [ ] **A blocked attempt is visible.** Each refusal above appears in
      `GET /auth/google/events?kind=blocked` with the matching `outcome` and the
      user id.
- [ ] **A brand-new Google account is not gated.** Signing in with an address
      that has no platform user still provisions a workspace, and its identity
      appears in that new organization's register with
      `provisionedByGoogle: true` — matching `GOOGLE_PROVISIONING_NOTE`.

## Register and ledger integrity

- [ ] First Google sign-in creates exactly one identity with
      `recordedSignIns: 1`; the second sign-in updates the same record to `2`
      and does not create a duplicate.
- [ ] `HGET gid:link:i:<org>:<id> _doc` contains **no** raw Google `sub` — only
      the truncated SHA-256 fingerprint. Grep the whole `gid:*` keyspace for the
      subject value and confirm zero hits.
- [ ] `GET /auth/google/events` returns newest first, including two events
      written in the same second (the write-order tiebreak).
- [ ] Drive more than `GOOGLE_EVENT_LIMIT` (500) events for one organization:
      `stored` caps at 500, `oldestAt` advances, and the per-identity
      `recordedSignIns` continues past 500.
- [ ] `DELETE /auth/google/identities/:id` removes the register entry, writes an
      `unlink` event, and **leaves the platform user, its memberships and its
      active sessions working** (verify the user can still sign in with a
      password and that an existing token still authenticates).

## Configuration report

- [ ] With all three variables set to an HTTPS redirect that matches
      `/api/v1/auth/google/callback`, every check is `pass` and `ready: true`.
- [ ] Unset `GOOGLE_CLIENT_SECRET` and restart: the check is `fail` (not
      `warn`), `enabled: false`, `ready: false`, and the secret's value appears
      nowhere in the response.
- [ ] Point `GOOGLE_REDIRECT_URI` at `http://localhost:…`: `warn`. Point it at
      `http://public.example.com/…`: `fail`.
- [ ] Point it at a path this API does not serve: the `redirect_path` check is
      `warn` and its detail explains that a rewriting proxy cannot be
      distinguished from a misconfiguration.
- [ ] Block outbound network access entirely and re-request
      `GET /auth/google/config`: it still answers, unchanged — the report makes
      no network call.

## Web surface

- [ ] `/auth/callback` exists: after a successful Google sign-in the browser
      lands there, the session is adopted, and the URL fragment is cleared from
      the address bar (check browser history carries no token).
- [ ] After a policy refusal the same page shows the organization's reason and
      the `outcome` code, with a working link back to `/auth/login`.
- [ ] `/app/google-identity` renders for a member: policy inputs are disabled,
      the ledger tab explains that administrator access is required, and no
      write control is offered.
- [ ] As an administrator, saving a policy, running a dry run, revoking,
      restoring and unlinking each round-trip and refresh the console.
- [ ] With no recorded activity the overview shows "none recorded" and "never"
      — never `0` presented as a measured figure.

## Regression sweep

- [ ] `pnpm --filter @windels/api test` — 1294 passing, 51 skipped, 0 failures.
- [ ] `pnpm exec playwright test tests/e2e/googleAuth.spec.ts` — 10 passing
      against the live API.
- [ ] `make verify` — 7/7 tasks.
- [ ] `node audit/build-inventory.mjs` — `googleAuth` reports COMPLETE with
      18 routes across two route files.

---

**Sign-off**

| Role | Name | Date | Result |
|---|---|---|---|
| Platform engineer | | | |
| Security reviewer | | | |
