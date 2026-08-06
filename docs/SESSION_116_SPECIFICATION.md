# Session 116 — Multi-Factor Authentication: assurance, policy and audit

**Module:** `mfa` · **Status before:** PARTIAL (routes = 6, shared contract = none, tests = 2 suites)
**Status after:** COMPLETE (routes = 24, shared contract = 655 LOC, tests = 4 suites)
**Date:** 2026-08-06 · **Branch:** `arena/019fd574-win`

---

## 1. What already existed, and is untouched

`apps/api/src/services/mfa.service.ts` is a hand-rolled RFC 6238 TOTP
implementation, and it is a good one:

* the generator is pinned against RFC 6238 Appendix B's published vectors, so it
  interoperates with Google Authenticator, 1Password and Authy rather than only
  with itself;
* the shared secret is AES-256-GCM encrypted at rest;
* recovery codes are stored only as SHA-256 digests and are consumed on use;
* the ±1 period drift window is deliberate and tested on both sides.

`services/auth.service.ts` issues a five-minute login challenge when a user has
a secret, and `POST /auth/mfa/complete` redeems it. **None of this was rewritten
in Session 116.** The six original endpoints keep their paths, their request
bodies and their success payloads.

## 2. What was missing

| Gap | Consequence before Session 116 |
| --- | --- |
| **No attempt throttle** | Nothing counted failed second-factor attempts anywhere. A 6-digit code accepted across a ±1 window is three live codes in 1 000 000 per try. `POST /auth/mfa/complete` carried `rateLimit("login")`, which is **per IP** — a distributed caller walks past it. |
| **No replay defence** | RFC 6238 §5.2 requires the verifier to refuse the second presentation of an OTP. Nothing did: a code read over a shoulder or captured at a proxy stayed usable for the rest of its ~90 s validity. |
| **Enrolment was never confirmed** | `POST /mfa/enable` wrote the secret *and* the `enforced` flag immediately, so the next login demanded a code the user might never have successfully scanned. `POST /mfa/confirm` verified a token and then **recorded nothing** — confirming was a no-op, and there was no way out of a half-finished enrolment. |
| **The routes had no authentication** | The file's own comment said "handled by auth middleware globally", but no global `authenticate` is mounted on the v1 router. Every handler dereferenced an undefined `req.user`, so an anonymous request produced a **500, not a 401**. |
| **No organization policy** | An organization could not require a second factor. `mfa:enforced:<user>` sounded like enforcement; it was written on enable, read by nothing, and only ever mirrored "enabled". |
| **No coverage** | No answer to "who in this organization has MFA?" — the first question on every security questionnaire. |
| **No audit trail** | A second factor with no record of enrolments, failures, lockouts, recovery-code use or administrative changes. |
| **No shared contract, no client, no UI** | `packages/shared/src/mfa.ts` did not exist; the login page hand-rolled the one call it needed. |

## 3. What Session 116 adds

### 3.1 Shared contract — `packages/shared/src/mfa.ts` (655 LOC)

Types, Zod schemas, constants, the notes that ship inside the payloads, and the
pure helpers both sides derive state from (`mfaComplianceState`,
`mfaGraceDeadline`, `mfaPolicyRequiresRole`, `mfaRecoveryHealth`,
`mfaTokenKind`, `mfaLockRemainingSeconds`, `defaultMfaPolicy`).

> The organization policy type is named **`MfaOrgPolicy`**, not `MfaPolicy`:
> `wakeIntel.ts` already exports an `MfaPolicy` describing wake-word factors
> (voice print, face, clap biometric). Renaming that one would break a shipped
> module, so the new type takes the longer name.

### 3.2 Service — `apps/api/src/mfa/mfaAssurance.service.ts`

* **Throttle.** `MFA_MAX_FAILED_ATTEMPTS` (5) failures inside
  `MFA_FAILURE_WINDOW_SECONDS` (900 s) engage an `MFA_LOCKOUT_SECONDS` (900 s)
  lock. Failures age out of the window; a success clears the counter; an
  administrator can lift a lock and the lift is itself recorded.
* **Replay guard.** A TOTP that verified successfully is marked for
  `MFA_REPLAY_GUARD_SECONDS` (90 s = the window it could still be live in). The
  marker is `SHA-256(token)` truncated to 32 hex characters — the token itself
  is never stored.
* **Confirmed enrolment.** `none` → `pending` → `confirmed`, plus `unrecorded`
  for a secret that predates the ledger. A **pending** enrolment can be
  abandoned, which discards the secret and its recovery codes — the lockout
  escape hatch the module never had. A *confirmed* enrolment still requires a
  valid code through the original `POST /mfa/disable`.
* **Organization policy.** `mode` ∈ {`optional`, `required_admins`,
  `required_all`}, `enforcement` ∈ {`report_only`, `block_after_grace`},
  `graceDays`, `recoveryCodeFloor`, `allowRecoveryCodes`. The defaults reproduce
  the platform's historical behaviour exactly.
* **Self-lockout guard.** Blocking enforcement cannot be switched on from an
  account that would itself be blocked. Without it, one request from an
  unenrolled owner locks every administrator out with nobody able to revert.
* **Coverage.** Members from Postgres, each with enrolment state, recovery-code
  count, lock state, exemption and a compliance standing. Capped at
  `MFA_MAX_COVERAGE_MEMBERS` (500) with the cap reported, never silently applied.
* **Exemptions.** A documented administrator decision with a reason (≥ 10 chars),
  an author and an expiry. Reported as `exempt`, never folded into `covered`.
* **Ledger.** Fifteen event kinds, written to the organization stream and the
  member's own stream, trimmed to `MFA_EVENT_LIMIT` (500) each.
* **Configuration report.** TOTP parameters, storage, throttle, replay guard and
  the paths each is wired into. No network call; reports *configured*, never
  *working*.

### 3.3 Routes — `apps/api/src/http/routes/mfaAssurance.ts` (18 endpoints)

Mounted on a second `/mfa` router registered **ahead of** the original six, with
`authenticate` attached per handler so an unmatched path falls through
unchanged.

| Method | Path | Access |
| --- | --- | --- |
| GET | `/mfa/assurance/summary` | admin |
| GET | `/mfa/assurance/gaps` | admin |
| GET | `/mfa/assurance/configuration` | member |
| GET | `/mfa/policy` | member |
| PUT | `/mfa/policy` | admin |
| GET | `/mfa/coverage` | admin |
| GET | `/mfa/coverage/me` | member |
| GET | `/mfa/enrollment` | member |
| POST | `/mfa/enrollment/abandon` | member (pending only) |
| GET | `/mfa/recovery/health` | member |
| GET | `/mfa/lock` | member |
| GET | `/mfa/locks` | admin |
| POST | `/mfa/locks/:userId/clear` | admin |
| GET | `/mfa/exemptions` | admin |
| POST | `/mfa/exemptions` | admin |
| DELETE | `/mfa/exemptions/:userId` | admin |
| GET | `/mfa/events` | admin |
| GET | `/mfa/events/me` | member |

### 3.4 Integration into the paths that already existed

* **`apps/api/src/http/routes/mfa.ts`** — `authenticate` added to all six
  handlers (anonymous callers now get 401 instead of a 500 crash); every
  verification runs through the gate first and records its outcome; `enable`
  starts the enrolment record, a successful `confirm`/`verify` closes it,
  `disable` clears it.
* **`apps/api/src/services/auth.service.ts`** — the login challenge now carries
  `organizationId` so the second-factor step can record against the right
  ledger; `completeMfaLogin` runs the gate (throttle + replay) before verifying
  and records the outcome; `loginUser` consults the organization policy. The
  policy evaluation **fails open** on an internal error — anything other than an
  explicit `block` lets the sign-in continue, because an assurance bug must not
  take logins down.

### 3.5 Tenant isolation (Session 89 sweep)

Organization-scoped: `mfa:policy`, `mfa:exempt`, `mfa:exemptidx`, `mfa:event`.

Principal-scoped, catalogued as `shared` **with the reason stated in the
catalogue**: `mfa:secret`, `mfa:recovery`, `mfa:enforced`, `mfa:challenge`
(all four predate Session 116 and were never catalogued at all), plus
`mfa:enroll`, `mfa:fail`, `mfa:lock`, `mfa:used`, `mfa:uevent`. These key on a
**user id**, not a tenant: a person's second factor belongs to the person, and
the login path that reads them has not resolved an organization yet.
Cataloguing them as `org_scoped` would let the sweep treat a user id as an
organization id and report conformance it has not checked.

### 3.6 Web

* `apps/web/src/lib/mfa.ts` — typed `mfaApi` (the original six, which had no
  typed client at all) and `mfaAssuranceApi`.
* `apps/web/src/pages/security/MfaAssurancePage.tsx` — `/app/mfa-assurance`
  console: overview · coverage · policy · lockouts · exemptions · ledger · my
  second factor. Administrative tabs are hidden from non-administrators because
  the API refuses them.

## 4. Honesty rules encoded

1. A secret that predates the ledger is `unrecorded`, **never** `confirmed` —
   whether that user ever completed a verification is unknown, and unknown is
   what the payload says.
2. `report_only` blocks nothing, and both the enforcement note and the console's
   own selector label say so in those words.
3. `not_required` is counted separately from `covered`, so a permissive policy
   cannot present itself as a protected organization.
4. `requiredCoverageRatio` is `null` when the policy requires nobody — not 0 %
   and not 100 %.
5. An exemption is always `exempt`, never folded into `covered`.
6. The lockout note states plainly that the throttle limits this deployment's
   endpoints and is not a claim about an attacker's total budget.
7. The replay guard is described as a control whose durability equals Redis's,
   not as a guarantee.
8. The configuration report reads the environment and reports "configured",
   never "working"; it never echoes a key, and a test greps the payload for any
   64-hex-character run.
9. Ledger counts describe events recorded since the ledger existed; nothing is
   back-filled or estimated.
10. Coverage states the member cap and reports `truncated` rather than silently
    shortening the list.

## 5. Tests

`apps/api/src/mfa/mfaAssurance.test.ts` — **64 tests**, fully in-memory
(`FakeKv` + `FakePrisma`), every enrolment seeded **through the real
`MfaService`** so a drift in key layout breaks the suite rather than quietly
reporting an empty organization. The suite computes TOTPs with its **own**
independent HMAC implementation, so a shared bug cannot make a test pass.

Coverage includes: policy defaults and storage, the self-lockout guard (refused,
allowed when covered, allowed when exempt, not applied to `report_only`), the
four enrolment states including `unrecorded` and staleness, abandonment of a
pending enrolment only, the throttle threshold/window/expiry/clear, the replay
guard including per-user scoping and expiry, a keyspace grep proving no token,
code or secret is stored in the clear, the recovery-code policy switch, coverage
under each policy mode with grace boundaries, truncation, filtering that does not
shrink the counts, cross-organization isolation of every artefact, all five login
decisions, both ledgers, exemption lifecycle including natural expiry, gaps and
summary, and a configuration report checked **against the otpauth URL the real
service issues**.

`tests/e2e/mfaAssurance.spec.ts` — 14 Playwright cases against a live API:
path preservation for the original six, the 401-not-500 fix, anonymous refusal
of all 13 read endpoints, the default policy, coverage honesty, throttle
preflight, configuration without a key echo, the self-lockout guard over HTTP,
exemption validation, both ledgers, gap arithmetic and summary stability.

Repository suite after this session: **1400 passing, 51 skipped, 0 failures**
(108 files: 105 passed + 3 skipped), guard suites `noRandomData`,
`noFakeVerdict`, `demoCleanup`, `seedGate` all green.

## 6. Inventory

`mfa` PARTIAL → COMPLETE — routes 6 → 24, shared contract 655 LOC, web client
149 LOC, 4 test suites. Repository totals: **96 COMPLETE / 7 PARTIAL / 2
STUB-by-design / 1 DEMO DATA** across 106 modules.

## 7. Status

🟡 **VERIFIED (partial).** Runtime validation against live PostgreSQL 17 +
Redis 8 + a generated Prisma client is not possible in this sandbox. See
`docs/SESSION_116_RUNTIME_VALIDATION_CHECKLIST.md`.
