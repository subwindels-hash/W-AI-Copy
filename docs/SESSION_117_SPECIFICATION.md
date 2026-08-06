# Session 117 — Mobile: offline durability, device trust and push health

**Module:** `mobile` · **Status before:** PARTIAL (routes = 21, shared contract = none, tests = 1 suite)
**Status after:** COMPLETE (routes = 39, shared contract = 826 LOC, tests = 3 suites)
**Date:** 2026-08-06 · **Branch:** `arena/019fd574-win`

---

## 1. What already existed, and is untouched

`apps/api/src/services/mobileAuth.service.ts` (430 LOC) is a genuine WebAuthn
platform-authenticator implementation, and a good one:

* the registration and authentication ceremonies verify a real signature over
  the real `authenticatorData || SHA-256(clientDataJSON)` — it does not accept a
  credential on the client's say-so;
* the challenge is single-use and time-bounded;
* the device PIN is bcrypt-hashed into a dedicated `pinHash` column whose schema
  comment already said "Never expose this field in a select";
* the sign counter is checked.

The Session 21 PWA shell (`apps/web/src/app/mobile/*`, the `/m` route, the
service worker, `lib/mobile/{biometrics,push}.ts`) and all twenty-one original
`/mobile/*` endpoints keep their paths, request bodies and success payloads.
**None of that was rewritten.**

## 2. What was missing

| Gap | Consequence before Session 117 |
| --- | --- |
| **The offline queue stored nothing** | `POST /mobile/offline/sync` updated the device's `lastSeenAt`, answered `{ received: body.actions.length }` and **dropped the actions array on the floor**. Its own comment claimed the actions were "persisted … for auditing". They were not persisted anywhere. |
| **…and the client deleted its copy anyway** | `apps/web/src/lib/mobile/offlineQueue.ts` `flush()` posted the queue and then **unconditionally cleared every action out of IndexedDB**, without reading the response. A message composed in a tunnel was destroyed the moment the phone found signal, and the user was shown a successful sync. This is the defect that motivated the session. |
| **Device registration was not scoped by owner** | `POST /mobile/devices/register` upserted on the client-supplied `deviceId` with an update branch that filtered on the id alone. One account could overwrite another account's device row — its name, platform, last-seen IP and user agent. |
| **…and the response returned the whole row** | Including `pinHash`, the column the schema explicitly says never to select. |
| **No PIN throttle** | `POST /mobile/pin/verify` counted nothing. A four-digit PIN is 10 000 guesses, and the only thing standing in the way was bcrypt's cost factor. |
| **Push died silently** | `push.service.ts` deletes a subscription after eight consecutive delivery failures. Nothing recorded that, so notifications simply stopped and no endpoint could explain why. |
| **No organization policy** | An organization could not set a minimum app version, disable the offline queue, or require a PIN length. `GET /mobile/config` returned a build-time constant. |
| **No shared contract, no typed client, no desktop console** | `packages/shared/src/mobile.ts` did not exist; there was no way for an administrator or a user on a laptop to see their devices, their unsynced work, or their push health. |

## 3. What Session 117 adds

### 3.1 Shared contract — `packages/shared/src/mobile.ts` (826 LOC)

Types, Zod schemas, constants, the notes that ship inside the payloads, and the
pure helpers both sides derive state from (`defaultMobilePolicy`,
`normalizeMobileActionPath`, `mobileActionBodyBytes`, `mobileActionExpiry`,
`compareMobileVersions`, `mobileUpdateStanding`, `mobileDaysSince`,
`mobilePinLockRemainingSeconds`, `mobilePushEndpointHost`, `mobileGapReport`).

> `mobilePushEndpointHost` extracts the origin with a regular expression rather
> than `new URL()`: `packages/shared` compiles without the DOM lib, so `URL` is
> not in scope there.

### 3.2 Service — `apps/api/src/mobile/mobileSync.service.ts` (1 127 LOC)

* **A durable queue that stores and never executes.** `submitActions` writes
  each action — method, path, body, the device's own `queuedAt` **and the
  server's `receivedAt`** — under `mob:action:<user>:<actionId>`, and returns one
  receipt per action. The server never dispatches a queued write internally:
  doing so would run a write with none of its normal authorization, validation
  or rate-limit context re-established. Replay happens on the device, against
  the ordinary authenticated API.
* **Receipts a client can act on.** `outcome` ∈ {`stored`, `duplicate`,
  `rejected`}, with `retainLocally` set on anything the queue did not take. A
  client that honours the receipt cannot delete work the server refused.
* **Rejection is explicit, never silent.** `queue_disabled`, `queue_full`,
  `body_too_large` (> 16 KiB, refused rather than truncated), `path_invalid`,
  `path_not_allowed`, `method_not_allowed`, `action_id_invalid`. Credential and
  queue-control prefixes (`/api/v1/auth`, `/api/v1/mfa`, `/api/v1/mobile/offline`,
  `/api/v1/mobile/pin`, `/api/v1/mobile/biometric`) are never replayable from a
  stored body.
* **Ordering by the server's clock.** The replay plan is ordered by
  `receivedAt`, not by the device's `queuedAt`, because a phone's clock is
  attacker-controlled and frequently just wrong.
* **Dedupe.** A resubmitted action id is reported `duplicate` and the existing
  record's status is returned unchanged — the target endpoints are not
  idempotent, so an action already `applied` must not be replayed.
* **Resolution.** The device reports the outcome of a replay
  (`applied` / `failed`, with the HTTP status it actually received). A second
  outcome for the same action is refused; resolving a `discarded` or `expired`
  action is refused. Nothing is inferred: an unresolved action stays `stored`.
* **Expiry on read.** A record past the organization's retention window is
  reported `expired` — meaning *dropped without ever being executed* — and the
  transition is written to the ledger.
* **Device ownership.** `assertDeviceOwnership` refuses a device id registered
  to another account with `403` and records the refusal. A device id that
  belongs to nobody yet is not an error: it is how a new handset is issued one.
* **Sanitised device views.** `pinHash`, `pushTokenHash` and credential material
  never leave the server; `pinConfigured` states only that a PIN exists.
* **PIN throttle.** `MOBILE_PIN_MAX_ATTEMPTS` (5) failures inside
  `MOBILE_PIN_FAILURE_WINDOW_SECONDS` (900 s) engage a
  `MOBILE_PIN_LOCKOUT_SECONDS` (900 s) lock, **per device** — losing one handset
  must not lock the owner out of another. A success clears the counter.
* **PIN removal.** `clearPin` nulls the column. There was no way to do this: a
  user who forgot their PIN had a device permanently carrying a secret they
  could not use.
* **Push health.** Subscriptions with their **endpoint host only** (the full
  endpoint is a bearer capability), consecutive failure counts, `atRisk` one
  short of retirement, and the deliveries recorded since the ledger existed.
* **Organization policy.** `minAppVersion`, `updateRequirement`,
  `offlineQueueEnabled`, `maxQueuedActions`, `actionRetentionDays`, `pinAllowed`,
  `pinMinLength`, `biometricRecommended`, `pushEnabled`. The defaults reproduce
  the platform's historical behaviour exactly, and are reported as *defaults*.
* **Ledger** of eighteen event kinds, trimmed to `MOBILE_EVENT_LIMIT` (500).
* **Configuration report.** Reads this process's environment, makes no network
  call, and names the warning every checkout of this repository starts with:
  the **development VAPID key pair committed to `config/env.ts`**.

### 3.3 Routes — `apps/api/src/http/routes/mobileSync.ts` (18 endpoints)

Mounted on a second `/mobile` router registered **ahead of** the Session 21
routes, with `authenticate` attached per handler so an unmatched path falls
through unchanged — in particular the deliberately public `GET /mobile/config`.

| Method | Path | Access |
| --- | --- | --- |
| POST | `/mobile/offline/actions` | member (own device) |
| GET | `/mobile/offline/actions` | member |
| GET | `/mobile/offline/summary` | member |
| GET | `/mobile/offline/replay-plan` | member (own device) |
| GET | `/mobile/offline/actions/:actionId` | member (own action) |
| POST | `/mobile/offline/actions/:actionId/resolve` | member |
| POST | `/mobile/offline/actions/:actionId/discard` | member |
| GET | `/mobile/devices/trust` | member |
| GET | `/mobile/devices/:deviceId/trust` | member |
| GET | `/mobile/devices/:deviceId/pin/lock` | member |
| DELETE | `/mobile/devices/:deviceId/pin` | member |
| GET | `/mobile/push/health` | member |
| GET | `/mobile/policy` | member |
| PUT | `/mobile/policy` | admin |
| GET | `/mobile/assurance/self` | member |
| GET | `/mobile/assurance/configuration` | member |
| GET | `/mobile/assurance/gaps` | member |
| GET | `/mobile/events` | member |

### 3.4 Integration into the paths that already existed

* **`apps/api/src/http/routes/mobile.ts`** — `@ts-nocheck` removed and the file
  type-checked for the first time; the local `r` router renamed `router` so the
  audit's route scanner sees what is actually mounted. `POST /devices/register`
  now asserts ownership before it upserts and returns a **sanitised** device
  view. `POST /offline/sync` now writes through `MobileSyncService.submitActions`
  and returns `stored` / `duplicates` / `rejected` / `receipts` / `queueDepth`
  **in addition to** its original `received`, so an older client keeps working
  unchanged and gains durability without a line of change. `POST /pin/verify`
  runs through the throttle. Device, PIN, push and biometric changes are
  recorded in the ledger.
* **`apps/api/src/services/push.service.ts`** — a subscription retired at eight
  consecutive failures is now recorded, and every send records its attempt.
  Both are wrapped so a bookkeeping failure can never turn a delivered
  notification into an error, and the mobile service is imported lazily so this
  module keeps no load-time dependency on it.

### 3.5 Tenant isolation (Session 89 sweep)

Organization-scoped: `mob:policy`.

Principal-scoped, catalogued as `shared` **with the reason stated in the
catalogue**: `mob:action`, `mob:actidx`, `mob:actdev`, `mob:pinfail`,
`mob:pinlock`, `mob:event`, `mob:pushlog`. These key on a **user id**, not a
tenant: a phone, the writes it queued offline, its PIN lock and its push history
belong to the person who signed in on it — the same person may hold memberships
in several organizations from the same handset, and the queue is read before an
organization has been resolved. Cataloguing them `org_scoped` would make the
sweep read a user id as an organization id and report a check it never made.

### 3.6 Web

* **`apps/web/src/lib/mobile/offlineQueue.ts` — the client half of the fix.**
  `flush()` now (1) submits to the durable endpoint, (2) deletes from IndexedDB
  **only** the ids the server reports as `stored` or `duplicate`, (3) replays
  each stored action through the ordinary authenticated `api()` and reports the
  outcome back. It returns counts — `submitted / stored / duplicates / rejected /
  rejections / applied / failed` — rather than a bare acknowledgement, because
  "we sent 12 and 3 were refused" is exactly what the previous implementation
  hid.
* `apps/web/src/lib/mobile/sync.ts` — typed `mobileSyncApi` (18 paths) plus
  `mobileApi` for the Session 21 endpoints, which had no typed client at all.
* `apps/web/src/pages/mobile/MobileDevicesPage.tsx` — `/app/mobile-devices`
  console: overview · devices · queue · push · policy · ledger. The policy tab
  is hidden from non-administrators because the API refuses them.

## 4. Honesty rules encoded

1. **Stored is not applied.** The note ships inside every queue payload. A
   stored action has taken effect on nothing until something replays it.
2. An action that expires is reported `expired`, never `applied` — expiry means
   the record was dropped *without* being executed.
3. A rejected action sets `retainLocally`, so the client is told to keep it. The
   client honours that, and only deletes what the server says it holds.
4. Ordering uses the server's receipt time, and the field the device supplied is
   returned separately and labelled as the device's own clock.
5. Push "accepted by the push service" is not "seen by the user": the browser or
   operating system may still suppress, delay or drop the notification, and the
   note says so rather than implying a delivery guarantee.
6. Delivery counts describe attempts recorded **since this ledger existed**.
   Nothing before it is reconstructed or estimated.
7. The policy is labelled advisory except for the queue limits this API actually
   enforces — a modified or out-of-date client can ignore the rest.
8. `updateRequirement: "required"` does **not** make the API refuse an old
   build; the note says so, and a version that cannot be parsed is reported
   `unknown` rather than assumed current.
9. The PIN throttle is described as a limit on this deployment's endpoint for
   one device, not as a claim about an attacker's total budget.
10. The configuration report says *configured*, never *working*; it never echoes
    a key, and a test greps the payload for the committed private key value.
11. A device view carries no secret, and a test greps a full keyspace dump to
    prove it — after first asserting the dump is non-empty, so the check cannot
    pass vacuously.
12. The gap report lists what this mobile surface deliberately does **not** do,
    so an absence is not read as a guarantee.

## 5. Tests

`apps/api/src/mobile/mobileSync.test.ts` — **62 tests**, fully in-memory
(`FakeKv` + `FakePrisma`). Coverage includes: the stored-not-dropped defect
itself, body retention, `stored ≠ applied`, dedupe, `rejected → retainLocally`,
every path rule (absolute URL, parent segment, control character, non-API
prefix, each denied prefix), the size / capacity / queue-disabled / missing-id
rejections, resolution (verbatim outcome, second outcome refused, retry after a
failure, discard, discard-of-applied refused, resolve-of-discarded refused,
expiry and its ledger entry), replay ordering by server time including a
shared-millisecond tie and the exclusion of resolved actions, cross-user
isolation plus a forged record being skipped, device ownership (another
account's id refused *and* recorded, `null` for an unclaimed id, own device
returned), a keyspace grep proving no secret is stored in the clear, staleness,
update standing (never rounded up, `null` when unparsable), the PIN throttle
(lock at threshold, refusal while locked, window expiry, cleared on success,
per-device scoping, `clearPin` refusing another account's device), policy
defaults and storage, push health (host only, zero deliveries, counts, at-risk
and retirement), the configuration report (warns on the development VAPID pair,
never echoes the key value, labels the build-time constant), and summary,
ledger and keyspace hygiene.

Two assertions are guarded against passing vacuously: the keyspace dump must
contain `mob:action:` and the stored message before the no-secret assertion
runs, and the configuration JSON must contain `vapid_private_key` before the
no-key-echo assertion runs.

`tests/e2e/mobileSync.spec.ts` — 17 Playwright cases against a live API: path
preservation for the Session 21 endpoints and the still-public
`GET /mobile/config`, anonymous refusal of all nine read endpoints, **the central
fix proved over HTTP** (submit, then read the action back from a separate
request with its body intact), stored-never-applied, rejection with
`retainLocally` for both rejection reasons, dedupe, replay ordering, summary
arithmetic, verbatim resolution, a no-secret grep of the device inventory, push
health returning a host and not an endpoint, the default policy, the VAPID
warning without a key echo, the gap report, the ledger, and agreement between
the self view and the summary it is built from.

Repository suite after this session: **1462 passing, 51 skipped, 0 failures**
(109 files: 106 passed + 3 skipped), guard suites `noRandomData`,
`noFakeVerdict`, `demoCleanup`, `seedGate` all green.

## 6. Inventory

`mobile` PARTIAL → COMPLETE — routes 21 → 39, shared contract 826 LOC, service
total 3 685 LOC, web client 198 LOC, 3 test suites. Repository totals:
**97 COMPLETE / 6 PARTIAL / 2 STUB-by-design / 1 DEMO DATA** across 106 modules.

## 7. Status

🟡 **VERIFIED (partial).** Runtime validation against live PostgreSQL 17 +
Redis 8 + a generated Prisma client is not possible in this sandbox. See
`docs/SESSION_117_RUNTIME_VALIDATION_CHECKLIST.md`.
