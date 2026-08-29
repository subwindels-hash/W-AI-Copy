# WINDELS AI OS — Single-Server Deployment Guide

WINDELS AI OS can run on a Linux server. The supported single-server path is the
standalone Docker Compose stack in `infra/docker/docker-compose.prod.yml`.

The stack contains:

- React web application served by Nginx
- Node/Express API on a private container network
- PostgreSQL 17 with a separate, non-superuser API login
- Redis 8 with authentication and persistent append-only storage
- a one-shot database-role, migration, and bootstrap sequence
- Traefik with automatic Let's Encrypt HTTPS
- persistent volumes for PostgreSQL, Redis, uploaded files, generated media,
  module packages, and TLS state

> **Scope:** this is an appropriate starting point for a VPS, staging system, or
> small production installation. It does not by itself provide multi-node high
> availability. Modules requiring external providers, GPUs, Android
> virtualization, trading bridges, payment credentials, or physical hardware
> remain unavailable until those providers are separately configured and
> accepted in the target environment.

## 1. Server requirements

### Minimum for evaluation or a small team

- Ubuntu 22.04/24.04, Debian 12, or another supported Docker host
- 4 vCPU
- 8 GB RAM (16 GB recommended)
- 50 GB SSD (100 GB recommended when storing media)
- Docker Engine 26+ with Docker Compose v2
- a public DNS name whose A/AAAA record points to the server
- inbound TCP ports 80 and 443 open

The server does **not** need Node.js or pnpm when using Docker.

## 2. Prepare the server

```bash
git clone <repository-url> /opt/windels
cd /opt/windels
cp .env.server.example .env.server
chmod 600 .env.server
```

Generate independent secrets. Hex output is deliberately used for the database,
Redis, and JWT values because it is safe inside connection URLs:

```bash
openssl rand -hex 32   # POSTGRES_PASSWORD
openssl rand -hex 32   # POSTGRES_APP_PASSWORD
openssl rand -hex 32   # REDIS_PASSWORD
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # WEBHOOK_SECRET
openssl rand -hex 32   # WINDELS_ENCRYPTION_KEY (must be exactly 64 hex chars)
```

Generate a unique Web Push VAPID pair on an administrator workstation:

```bash
npx web-push generate-vapid-keys
```

Edit `.env.server` and set every blank required value, especially:

- `DOMAIN` and `ACME_EMAIL`
- both PostgreSQL passwords and the Redis password
- JWT, webhook, and encryption secrets
- bootstrap administrator email/password
- VAPID public/private keys and subject

Do not use the example values from `.env.example` in production. Do not commit
`.env.server`.

## 3. Configure DNS and firewall

Create an A record (and AAAA record when applicable) for `DOMAIN` pointing to the
server. Confirm it resolves before launching, then allow HTTP and HTTPS:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

PostgreSQL, Redis, and the API are intentionally not published on host ports.
Only Traefik publishes ports 80 and 443.

## 4. Build and start

From the repository root:

```bash
docker compose --env-file .env.server \
  -f infra/docker/docker-compose.prod.yml \
  up -d --build
```

Equivalent convenience commands are:

```bash
make docker-up
# or
pnpm docker:up
```

Startup is ordered as follows:

1. PostgreSQL and Redis become healthy.
2. `database-role` creates/reconciles the `windels_app` login and grants it only
   application data privileges.
3. `bootstrap` runs all committed Prisma migrations as the schema owner and then
   runs the idempotent initial-admin seed.
4. The API starts as an unprivileged Linux user and must pass its database/Redis
   health check.
5. Nginx and Traefik begin serving the site over HTTPS.

If a migration or seed fails, the API does not start. This avoids running new
application code against an old schema.

## 5. Verify the deployment

```bash
COMPOSE="docker compose --env-file .env.server -f infra/docker/docker-compose.prod.yml"
$COMPOSE ps
curl -fsS "https://${DOMAIN}/healthz"
curl -fsS "https://${DOMAIN}/api/v1/health"
curl -fsS "https://${DOMAIN}/api/v1/health/deep"
```

Expected results:

- all long-running services show `Up`/`healthy`
- `database-role` and `bootstrap` show exit code 0
- `/healthz` returns `ok`
- `/api/v1/health` returns HTTP 200 with database and cache checks equal to `ok`

View startup or failure details with:

```bash
$COMPOSE logs --tail=200 bootstrap api web traefik
$COMPOSE logs -f api
```

## 6. AI and integration availability

The operating system and non-AI modules can start without an AI provider. In
production, AI calls fail closed rather than returning fake provider output.
Configure at least one real provider in `.env.server`, for example
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, or a reachable
`OLLAMA_BASE_URL`, and restart the API:

```bash
$COMPOSE up -d --no-deps --force-recreate api
```

Keep `WINDELS_NATIVE_API_ENABLED=false` until real-provider inference,
streaming, tenant isolation, quota, metering, and billing acceptance tests pass
for this specific installation.

Likewise, optional modules report not-configured/unavailable until their real
provider credentials and infrastructure are present. `WINDELS_DEMO_DATA` and
`WINDELS_ALLOW_MOCK_DB_FALLBACK` are forced off by the production Compose file.

### 6.1 Credential and master-key rotation

GitHub and broker/exchange credentials can be rotated or revoked from their
administrative consoles. Rotation verifies GitHub replacements before commit;
broker replacements disconnect the active session so the next connection uses
the new encrypted credential.

For an AES master-key rotation:

1. Keep the old `key-id -> 64-hex key` in `WINDELS_ENCRYPTION_KEYRING`.
2. Set a new `WINDELS_ENCRYPTION_KEY_ID` and `WINDELS_ENCRYPTION_KEY`.
3. Restart the API. Credential reads automatically re-encrypt old envelopes
   with the new primary key.
4. Exercise/list all credential-bearing connections and verify recovery before
   removing the old key from the keyring.
5. Back up the old key securely until rollback and restoration tests pass.

Never replace the primary key without retaining the prior key in the keyring;
those envelopes will correctly fail closed and require reconnection.

### 6.2 Blockonomics payment deployment

Blockonomics is a separate additive provider; the generic `crypto` safety gate
remains disabled. Before enabling Blockonomics:

1. Apply the committed Prisma migrations with the bootstrap/migrator container.
2. Configure a Blockonomics store for BTC and/or USDT on Ethereum ERC-20.
3. Generate a random callback secret of at least 32 characters and configure the
   provider callback as:
   `https://${DOMAIN}/api/v1/payments/blockonomics/webhook?secret=<secret>`.
4. Keep provider and WINDELS Test Mode enabled during qualification.
5. Configure credentials through `/platform/blockonomics` as Super Admin, or use
   the `BLOCKONOMICS_*` environment bootstrap values in `.env.server`.
6. Run the read-only provider health probe, create real Test Mode BTC and USDT
   payments, deliver status 0/1/2 callbacks, verify invoice/ledger settlement,
   and run reconciliation.
7. Enable the provider only after all checks pass. Test Mode in WINDELS does not
   turn on Test Mode in the Blockonomics store; both must be configured.

Set `BLOCKONOMICS_RECONCILIATION_ENABLED=true` and choose an interval from 5 to
1440 minutes. The default is 15 minutes. Redis must be persistent and available
for the distributed reconciliation lock; PostgreSQL remains the payment source
of truth.

The complete setup, API, callback, operations, and acceptance procedure is in
[`BLOCKONOMICS_API_SETUP_DEPLOYMENT.md`](./BLOCKONOMICS_API_SETUP_DEPLOYMENT.md).
Do not use live funds until that document's Stage 15 evidence is captured.

## 7. Upgrade

Take a backup first, pull the desired release, then rebuild:

```bash
cd /opt/windels
git pull --ff-only
docker compose --env-file .env.server \
  -f infra/docker/docker-compose.prod.yml \
  up -d --build
```

The one-shot bootstrap service applies pending migrations before the replacement
API becomes healthy. Review its logs after every upgrade.

Pin production deployments to reviewed commits or release tags; do not blindly
track a moving branch.

## 8. Backup and restore

### PostgreSQL backup

```bash
mkdir -p backups
COMPOSE="docker compose --env-file .env.server -f infra/docker/docker-compose.prod.yml"
$COMPOSE exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "backups/windels-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

### Runtime files

Back up the named volume `windels_runtime-data` as well as PostgreSQL. Database
rows for attachments are not sufficient without their corresponding files.
Redis persistence should also be backed up when queued jobs or ephemeral ledgers
must survive disaster recovery.

Test restoration regularly on a separate server. A backup that has never been
restored is not a verified backup.

## 9. Stop or remove

Stop containers while retaining data:

```bash
make docker-down
```

Never add `--volumes` unless you intentionally want to destroy the PostgreSQL,
Redis, runtime-file, and certificate volumes.

## 10. Operational cautions

Before handling real users, money, medical data, or other sensitive content:

- complete the repository's production-readiness and runtime-validation checks
- place backups in encrypted off-host storage
- add host monitoring, log collection, alerting, and disk-capacity alerts
- configure a secret manager and a documented key-rotation procedure
- qualify every external provider used by enabled modules
- test restore, upgrade, rollback, and incident-response procedures
- use managed PostgreSQL/Redis or Kubernetes for stronger high availability

Kubernetes manifests under `infra/k8s/` are deployment templates, not a substitute
for target-cluster validation, secret provisioning, ingress/cert-manager setup,
and a migration job.
