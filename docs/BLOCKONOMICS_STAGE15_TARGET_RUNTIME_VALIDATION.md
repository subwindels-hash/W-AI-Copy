# Blockonomics Integration — Stage 15 Target-Runtime Validation

**Stage:** 15 of 15

**Validation status:** **BLOCKED — TARGET RUNTIME NOT AVAILABLE**

**Production status:** **NOT PRODUCTION COMPLETE**

**Attempt date:** 2026-08-17

## Validation attempted

The Stage 15 gate was started in the available Arena workspace. No mock
provider, fake callback, fabricated address, fallback quote, or in-memory
financial substitute was used.

### Environment posture

Secret-safe presence checks found all required target settings absent:

- `DATABASE_URL` — absent;
- `REDIS_URL` — absent;
- `WINDELS_ENCRYPTION_KEY` — absent;
- `BLOCKONOMICS_API_KEY` — absent;
- `BLOCKONOMICS_CALLBACK_SECRET` — absent;
- `BLOCKONOMICS_MATCH_CALLBACK` — absent;
- `BLOCKONOMICS_ENABLED` — absent/not enabled; and
- `BLOCKONOMICS_TEST_MODE` — absent/not enabled.

No credential values were printed or stored in this report.

The workspace also has no `docker`, `psql`, or `pg_isready` binary, so it cannot
start or inspect a local PostgreSQL target as a substitute.

### PostgreSQL migration validator

Command:

```bash
node scripts/validate-migrations.mjs
```

Measured result:

```text
Cannot reach PostgreSQL at 127.0.0.1:5432: connect ECONNREFUSED 127.0.0.1:5432
Set DATABASE_URL to a reachable server. Exiting non-zero.
```

No migration was applied. PostgreSQL foreign keys, RLS, concurrency,
transactions, and rollback remain unvalidated in a real runtime.

### Prisma schema/type generation

Command:

```bash
bash scripts/prisma-generate-offline.sh
```

Measured result: passed. Prisma Client v5.22.0 generated with `engine=none`.
This validates schema/client type generation only and is not database-runtime
evidence.

### Real Blockonomics public API probe

Non-authenticated real-provider requests were attempted for:

- `GET /api/price?crypto=BTC&currency=USD`;
- `GET /api/price?crypto=USDT&currency=USD`.

Both were blocked before TLS establishment:

```text
ECONNRESET: Client network socket disconnected before secure TLS connection was established
```

The sandbox therefore cannot validate even the non-mutating real quote path.
Authenticated history, health, address creation, USDT monitoring, and real
callbacks cannot be attempted here.

### Non-destructive target preflight

Added:

```bash
node scripts/validate-blockonomics-target.mjs
# or
pnpm validate:blockonomics-target
```

The command prints only configuration presence/posture, endpoint host/port,
HTTP/schema posture, and sanitized network errors. It never prints credentials,
allocates an address, creates a payment, or mutates billing.

Current result: failed as expected because target configuration, PostgreSQL,
Redis, and provider network access are unavailable.

## Checks not executed

The following mandatory checks remain unexecuted—not passed:

- applying migrations to clean/upgrade PostgreSQL databases;
- API non-superuser and RLS tenant isolation;
- real PostgreSQL callback/settlement rollback and concurrency;
- authenticated Blockonomics health and `/v2/payments` history;
- real Test Mode BTC quote and address allocation;
- real Test Mode USDT quote/address and `/monitor_tx`;
- actual callback statuses 0, 1, and 2;
- provider callback retries and duplicate delivery;
- underpayment, overpayment, late payment, unknown payment, and mismatch cases;
- WMPC Gift Card plus Blockonomics split tender on PostgreSQL;
- invoice, existing-ledger, receipt, subscription, and audit conservation;
- scheduled/manual multi-replica reconciliation;
- deployed browser QR and backend polling;
- deployed Super Admin RBAC and secret rotation;
- deployed AI read-only tool authorization; and
- controlled first live payment.

## Required target environment

Do not paste credentials into chat. Configure them through the secured target
runtime's environment/secret manager or the deployed Super Admin encrypted
configuration UI.

To resume Stage 15:

1. Deploy PostgreSQL and Redis using the supported Compose stack or managed
   equivalents.
2. Configure a 64-hex encryption key and secure JWT/runtime values.
3. Configure a Blockonomics Test Mode store, API key, 32+ character callback
   secret, callback URL, and match host.
4. Keep live mode disabled.
5. Run:

   ```bash
   pnpm db:generate
   pnpm db:migrate
   node scripts/validate-migrations.mjs
   pnpm validate:blockonomics-target
   ```

6. Execute every item in
   [`BLOCKONOMICS_API_SETUP_DEPLOYMENT.md` §15](./BLOCKONOMICS_API_SETUP_DEPLOYMENT.md#15-stage-15-target-runtime-acceptance-checklist).
7. Capture transaction IDs, timestamps, statuses, database row counts, audit IDs,
   and screenshots without secrets.
8. Obtain payment/security owner approval before live enablement.

## Gate decision

Stage 15 cannot pass in the current workspace. Stages 1–14 remain implemented,
tested, documented, committed, and pushed, but the integration must remain
classified as **target-runtime validation pending**.

No `PRODUCTION COMPLETE` claim is made.
