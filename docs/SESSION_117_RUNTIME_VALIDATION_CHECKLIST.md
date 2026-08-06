# Session 117 Runtime Validation Checklist — Mobile offline durability

> **Status:** 🟡 pending target-environment execution. Run against live
> PostgreSQL 17 + Redis 8 with `prisma generate` completed and the API booted.
> Until every box is ticked and signed, Session 117 stays 🟡 VERIFIED (partial).

Several checks below need a **real handset** — an actual iOS or Android device
with the PWA installed, put into airplane mode. The unit suite proves the queue's
arithmetic against an in-memory Prisma and KV; only a real device proves that
IndexedDB, the service worker and the network transition behave as the client
assumes.

## Route mounting and backwards compatibility

- [ ] All twenty-one Session 21 endpoints answer on their original paths after
      the Session 117 router was mounted ahead of them on the same prefix:
      `GET /mobile/config`, `POST /mobile/devices/register`,
      `GET /mobile/devices`, `DELETE /mobile/devices/:id`, the four push paths,
      the four biometric paths, `POST /mobile/pin/{set,verify}`, the
      notification paths and `POST /mobile/offline/sync`.
- [ ] `GET /mobile/config` is **still reachable without a token** — the new
      router attaches `authenticate` per handler precisely so it does not
      accidentally close a deliberately public path.
- [ ] `POST /mobile/offline/sync` still returns its original `received` field,
      and an unmodified older client build completes a sync against the new
      server without any change.
- [ ] All eighteen Session 117 paths answer `401` without a token.
- [ ] `PUT /mobile/policy` answers `403` for an ordinary member and succeeds for
      an administrator.
- [ ] A session with no organization receives `403` from `GET`/`PUT
      /mobile/policy` (not a Redis key containing the literal string
      `undefined`).
- [ ] An unknown path under `/mobile` returns `404`, not a stack trace.

## The defect this session fixes (needs a real handset)

- [ ] Install the PWA, sign in, then enable airplane mode.
- [ ] Compose three writes offline (a message, a rename, a delete). Confirm all
      three are visible in IndexedDB under `windels-offline/actions`.
- [ ] Restore the network. Confirm that after the flush:
      - [ ] `GET /mobile/offline/actions` on the server lists all three;
      - [ ] each has a `receivedAt` set by the **server**;
      - [ ] each body round-trips intact through
            `GET /mobile/offline/actions/:actionId`.
- [ ] Kill the app mid-flush (force-quit between submission and replay). On
      relaunch, the actions are still on the server, still `stored`, and the
      replay resumes rather than losing them.
- [ ] Confirm against the previous build, if one is still deployed, that the
      same sequence **lost** the three writes — this is the regression the
      session exists to close.

## Queue semantics

- [ ] Submit an action whose body exceeds 16 KiB → `rejected` with
      `body_too_large`, `retainLocally: true`, and **nothing stored** (not a
      truncated body).
- [ ] Submit `MOBILE_QUEUE_MAX_ACTIONS + 1` actions for one device → the
      overflow is rejected `queue_full`, and the actions already held are
      untouched.
- [ ] Set `offlineQueueEnabled: false` in the policy → new submissions are
      rejected `queue_disabled`, and actions already stored remain readable and
      replayable.
- [ ] Submit the same action id twice → `duplicate`, `stored` count unchanged,
      and the existing record's status returned unchanged.
- [ ] Submit an action targeting `/api/v1/auth/login` → `path_not_allowed`.
- [ ] Submit an action targeting `/etc/passwd` → `path_invalid`.
- [ ] Resolve an action `applied`, then attempt to resolve it again → refused.
- [ ] Discard a `stored` action → `discarded`; attempt to discard an `applied`
      action → refused.
- [ ] Set `actionRetentionDays` to 1, backdate a record in Redis, read it →
      reported `expired`, and `GET /mobile/events?kind=action_expired` shows the
      transition.
- [ ] Two API instances behind a load balancer share the queue: submit against
      instance A, read the replay plan from instance B. (This is the check the
      in-memory suite structurally cannot make.)

## Replay ordering (real clocks)

- [ ] Queue actions on a handset whose clock is deliberately set **twelve hours
      fast**. The replay plan orders them by server receipt time, and the
      device's own `queuedAt` is returned separately and clearly labelled.
- [ ] Two actions submitted in the same millisecond come back in a stable,
      repeatable order across three consecutive reads.

## Device trust

- [ ] Register a device from account A, then attempt to register the **same
      device id** from account B → `403`, account A's row is unchanged (name,
      platform, `lastSeenIp`, user agent), and
      `GET /mobile/events?kind=device_ownership_refused` records the attempt for
      account B.
- [ ] Grep the full JSON of `POST /mobile/devices/register`,
      `GET /mobile/devices`, `GET /mobile/devices/trust` and
      `GET /mobile/devices/:id/trust` for `pinHash` and `pushTokenHash`: there
      must be no occurrence in any of them.
- [ ] `daysSinceLastSeen` and the `stale` count track real wall-clock time
      across a day boundary, not a fake timer.

## PIN throttle

- [ ] Five wrong PINs in a row against `POST /mobile/pin/verify` → the fifth is
      still a normal failure, and the **sixth** attempt is refused with the lock
      error and a `retryAfterSeconds`.
- [ ] `GET /mobile/devices/:deviceId/pin/lock` reports a `retryAfterSeconds`
      that genuinely counts down against real Redis TTL.
- [ ] After `MOBILE_PIN_LOCKOUT_SECONDS` the lock lifts by itself with no
      further request, and `mob:pinlock:<user>:<device>` has actually expired
      (`TTL` returns `-2`).
- [ ] Four failures, wait past `MOBILE_PIN_FAILURE_WINDOW_SECONDS`, then a
      fifth: **not** locked, and the counter reads 1.
- [ ] Locking device A leaves device B on the same account unlocked.
- [ ] A correct PIN clears the counter.
- [ ] `DELETE /mobile/devices/:deviceId/pin` nulls `pinHash` in Postgres
      (verify with a direct query) and clears both Redis counters.
- [ ] The same device id belonging to another account cannot be cleared.

## Push (needs a real browser and a real push service)

- [ ] With production VAPID keys set, subscribe from a real browser and send
      `POST /mobile/push/test`. The notification arrives.
- [ ] `GET /mobile/push/health` reports `endpointHost` only — grep the payload
      for the full endpoint path segment; there must be none.
- [ ] Delete the subscription at the browser end, then send eight notifications.
      The subscription is retired, **and**
      `GET /mobile/events?kind=push_subscription_retired` records it with the
      failure count. (Before this session it vanished with no record.)
- [ ] `recordedAccepted` / `recordedAttempted` match the sends actually made in
      this window, and `lastDeliveryAt` advances.
- [ ] A push bookkeeping failure (stop Redis mid-send) does **not** turn a
      delivered notification into a 500.

## Policy

- [ ] `GET /mobile/policy` on a fresh organization reports `isDefault: true` and
      the historical behaviour (queue enabled, PIN allowed, push enabled).
- [ ] `PUT /mobile/policy` persists; a second `GET` reports `isDefault: false`
      with `updatedBy` and `updatedAt` set.
- [ ] Setting `updateRequirement: "required"` without a `minAppVersion` is
      refused.
- [ ] With a `minAppVersion` above the client's build, the client is told it is
      outdated **and the API still serves its requests** — the note promises no
      enforcement, and the runtime must match the note.
- [ ] Two organizations hold independent policies; neither read leaks the other.

## Tenant isolation (Session 89 sweep)

- [ ] Run the isolation sweep. `mob:policy` is reported `org_scoped` and
      conformant.
- [ ] The seven principal-scoped namespaces are reported `shared` with the
      catalogue reason shown, and the sweep does **not** claim to have verified
      tenant conformance on them.
- [ ] A `KEYS mob:*` dump on a live Redis with two organizations and three users
      shows every key carrying a user id, and no key carrying an organization id
      except `mob:policy:*`.

## Ledger durability

- [ ] Restart Redis with persistence enabled and confirm the device ledger and
      the queue survive.
- [ ] With persistence disabled, confirm the payload's own note is accurate
      about what was lost — and that the deployment checklist treats an
      ephemeral Redis as a **data-loss risk for the offline queue**, not merely
      for a cache.
- [ ] Confirm the ledger trims at `MOBILE_EVENT_LIMIT` and reports `stored`
      honestly at the boundary.

## VAPID keys

- [ ] With the repository's committed development key pair still in place,
      `GET /mobile/assurance/configuration` reports
      `usingRepositoryDefaultVapidKeys: true` and a `warn` check.
- [ ] Replace both keys with a generated production pair; the check turns
      `pass` and the flag turns `false`.
- [ ] Grep the configuration response for the committed private key value: there
      must be none.
- [ ] The deployment checklist treats the committed pair as a **production
      blocker**.

## Web console

- [ ] `/app/mobile-devices` loads for an administrator with all six tabs, and
      for an ordinary member without the policy tab.
- [ ] The queue tab shows a rejected action with its reason, and does not offer
      to delete it locally.
- [ ] Clearing a device PIN from the console is reflected in the device row
      without a full page reload.
- [ ] The ledger tab paginates and shows the caveat about events recorded since
      the ledger was introduced.
- [ ] The PWA at `/m` still functions end to end after the `offlineQueue`
      rewrite: enqueue, flush, and the new `FlushResult` counts surface in the
      offline page.

## Sign-off

| Check group | Run by | Date | Result |
| --- | --- | --- | --- |
| Route mounting | | | |
| The defect this session fixes | | | |
| Queue semantics | | | |
| Replay ordering | | | |
| Device trust | | | |
| PIN throttle | | | |
| Push | | | |
| Policy | | | |
| Tenant isolation | | | |
| Ledger durability | | | |
| VAPID keys | | | |
| Web console | | | |
