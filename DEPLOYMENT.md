# WINDELS AI OS — Deployment Guide (v0.89.0)

This document is the single source of truth for installing, building, deploying, verifying,
backing up, maintaining, and rolling back WINDELS AI OS. It is written so a new engineer can
go from a fresh Ubuntu 22.04/24.04 (or Debian 12) machine to a running production instance by
following it top-to-bottom.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Server & Infrastructure Sizing](#2-server--infrastructure-sizing)
3. [Installation](#3-installation)
4. [Environment Variables](#4-environment-variables)
5. [Database Setup & Migrations](#5-database-setup--migrations)
6. [Redis Setup](#6-redis-setup)
7. [Third-Party Services (optional)](#7-third-party-services-optional)
8. [Build](#8-build)
9. [Production Deployment](#9-production-deployment)
10. [Post-Deployment Verification](#10-post-deployment-verification)
11. [First-Run Bootstrap](#11-first-run-bootstrap)
12. [Backup & Maintenance](#12-backup--maintenance)
13. [Rollback](#13-rollback)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Prerequisites

### Required software (install on host or use Docker images)

| Component        | Minimum version | Recommended        | Notes                                                                 |
|------------------|-----------------|--------------------|-----------------------------------------------------------------------|
| OS               | Ubuntu 22.04    | Ubuntu 24.04 LTS   | Debian 12 works. RHEL-family needs `dnf` equivalents.                 |
| Node.js          | 20.x            | 20.17+ LTS         | Node 22 is untested; do NOT use Node 18 or 21.                        |
| pnpm             | 9.x             | 10.34.5            | Install via npm (see below).                                          |
| PostgreSQL       | 15              | 17.x               | 14 works but 15+ recommended for JSONB performance.                   |
| Redis            | 7.x             | 7.2 / 8.x          | Used for cache, rate limits, pub/sub, and all module state.           |
| Build toolchain  | —               | `build-essential`, `python3` | Required for native modules (`bcrypt`, `better-sqlite3` stubs). |
| nginx (prod)     | 1.24            | 1.26+              | Terminates TLS and reverse-proxies API + static web.                  |

### System packages (Ubuntu / Debian)

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates build-essential python3 git \
                        postgresql postgresql-contrib redis-server nginx
```

### Install Node 20 and pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm (global, user-level)
mkdir -p "$HOME/.npm-global"
npm config set prefix "$HOME/.npm-global"
export PATH="$HOME/.npm-global/bin:$PATH"
npm i -g pnpm@10.34.5
pnpm --version   # expect 10.34.5
```

Make the PATH change permanent (append to `~/.bashrc`):
```bash
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
```

---

## 2. Server & Infrastructure Sizing

### Development (local / VM)
- **CPU:** 2 vCPUs
- **RAM:** 4 GB
- **Disk:** 20 GB SSD
- **Network:** localhost only
- **Sufficient for:** local build + unit/E2E, one logged-in user, all dashboards.

### Small production (≤ 50 MAU, single-tenant)
- **CPU:** 4 vCPUs
- **RAM:** 8 GB
- **Disk:** 80 GB SSD
- **DB + Redis:** same host or small managed instances
- **Reverse proxy:** nginx on same host
- **Backup:** nightly `pg_dump` to S3/Volume.

### Large production (multi-tenant, ≥ 1000 MAU)
- **API:** 2–4 replicas × 2 vCPU / 4 GB each (behind load balancer)
- **Web:** 2 replicas of nginx serving static build
- **Postgres:** managed (RDS / Cloud SQL / Azure PostgreSQL) — 4 vCPU / 16 GB, Multi-AZ, 100 GB SSD, daily snapshots
- **Redis:** managed (ElastiCache / Memorystore) — 2 GB primary + replica
- **Observability:** Prometheus + Grafana on a separate node (see `infra/monitoring/`)
- **TLS:** Let's Encrypt via certbot or Traefik.

For Kubernetes deployment manifests, see `infra/k8s/`.
For Terraform AWS reference, see `infra/terraform/`.

---

## 3. Installation

### 3.1 Clone

```bash
git clone <repo-url> windels-ai-os
cd windels-ai-os
```

### 3.2 Install dependencies

```bash
pnpm install
```

This will install all workspace dependencies (root, `apps/api`, `apps/web`, `apps/desktop`, `packages/shared`).

### 3.3 Configure environment

Copy the example env and edit for your environment:

```bash
cp .env.example .env
$EDITOR .env
```

At minimum you must change (see §4 for the full table):
- `JWT_SECRET` → 64+ random hex chars
- `WINDELS_ENCRYPTION_KEY` → 64 hex chars (generate via `openssl rand -hex 32`)
- `DATABASE_URL` → your real Postgres URL
- `REDIS_URL` → your real Redis URL
- `SESSION_COOKIE_SECURE=true` (prod)
- `NODE_ENV=production` (prod)
- `API_CORS_ORIGIN=https://your.domain`
- `VITE_API_URL=https://your.domain/api/v1`
- `BOOTSTRAP_SUPERADMIN_PASSWORD` → a strong password that meets the policy (≥10 chars, upper+lower+digit+symbol, not in common-password lists)

### 3.4 (Optional) Electron desktop
Desktop build is optional for headless servers. To skip it:
```bash
# No action needed — the server runs without building desktop.
```

---

## 4. Environment Variables

All variables are read via `process.env`. Defaults are set in code where safe; variables marked
**Required** must be supplied or the service will fail to start.

| Variable                       | Required | Default                                       | Description                                                                           |
|--------------------------------|----------|-----------------------------------------------|---------------------------------------------------------------------------------------|
| `NODE_ENV`                     | yes      | `development`                                 | `development` or `production`.                                                        |
| `LOG_LEVEL`                    | no       | `info`                                        | `trace`, `debug`, `info`, `warn`, `error`, `fatal`.                                  |
| `API_PORT`                     | no       | `4000`                                        | TCP port the Express API listens on.                                                 |
| `API_HOST`                     | no       | `0.0.0.0`                                     | Bind address.                                                                         |
| `API_CORS_ORIGIN`              | prod yes | `http://localhost:5173`                       | Comma-separated allowed origins. Set to your public web origin in prod.              |
| `VITE_API_URL`                 | yes      | `http://localhost:4000/api/v1`                | **Build-time** for web. In prod use `https://your.domain/api/v1`.                     |
| `DATABASE_URL`                 | yes      | `postgresql://windels:windels@localhost:5432/windels?schema=public` | Postgres connection string.                                |
| `POSTGRES_USER/PASSWORD/DB`    | no       | used by docker-compose only                   | Convenience vars for the Docker stack.                                               |
| `REDIS_URL`                    | yes      | `redis://127.0.0.1:6379`                      | Redis connection. Supports `rediss://` for TLS and `redis://:pass@host:6379` for auth.|
| `JWT_SECRET`                   | yes      | dev-only default                              | ≥32 random bytes. **Rotate if compromised.**                                          |
| `JWT_ISSUER`                   | no       | `windels-ai-os`                               | JWT `iss` claim.                                                                      |
| `JWT_ACCESS_TTL`               | no       | `15m`                                         | Access-token expiry (ms vercel/ms string).                                            |
| `JWT_REFRESH_TTL`              | no       | `7d`                                          | Refresh-token expiry.                                                                 |
| `BOOTSTRAP_SUPERADMIN_EMAIL`   | no       | `admin@windels.ai`                            | First registered user is promoted to `SUPER_ADMIN` automatically with this email.    |
| `BOOTSTRAP_SUPERADMIN_PASSWORD`| yes      | `ChangeMe!234` (dev only — rejected in prod)  | Initial super-admin password. **Must be changed on first login.**                    |
| `SESSION_COOKIE_NAME`          | no       | `windels_sid`                                 | Cookie name.                                                                          |
| `SESSION_COOKIE_SECURE`        | prod yes | `false`                                       | Set `true` in prod (HTTPS-only cookies).                                              |
| `WINDELS_ENCRYPTION_KEY`       | yes      | all-zero dev key                              | 64 hex chars (AES-256-GCM). Generate with `openssl rand -hex 32`.                    |
| `VAPID_PUBLIC_KEY`             | no       | built-in dev keypair                          | VAPID public key for web push.                                                        |
| `VAPID_PRIVATE_KEY`            | no       | built-in dev keypair                          | VAPID private key.                                                                    |
| `VAPID_SUBJECT`                | no       | `mailto:push@windels.ai`                      | VAPID contact (mailto: or https:// URL).                                              |
| `DOMAIN`                       | prod rec | —                                             | Public domain (used by Docker/ACME setup).                                             |
| `ACME_EMAIL`                   | prod rec | —                                             | Email for Let's Encrypt cert expiry notices.                                          |
| `IMAGE_TAG`                    | docker   | `latest`                                      | Container image tag (CI/CD).                                                          |
| `GIT_COMMIT`                   | no       | —                                             | Build metadata surfaced in `/health/deep` and Prometheus metric.                     |
| `SENTRY_DSN`                   | no       | —                                             | Sentry error reporting DSN.                                                           |
| `GRAFANA_USER/PASSWORD`        | monitoring | —                                           | Grafana admin creds in the monitoring compose file.                                   |
| `OPENAI_API_KEY`               | no       | —                                             | Optional external LLM provider key. Without it, the system uses built-in windels-assistant stub. |
| `ANTHROPIC_API_KEY`            | no       | —                                             | Optional Anthropic key.                                                               |
| `AI_DEFAULT_MODEL`             | no       | `windels-assistant`                           | Default model routed through the vendor-agnostic provider abstraction (S33).         |
| `AI_MAX_CONTEXT_MESSAGES`      | no       | `40`                                          | Cap on context messages sent to the model on each request.                            |

> **All module state for Sessions 38–82** (dashboards, agents, models, marketplace assets,
> quantum inventory, ESG scores, cyber ranges, health ecosystem etc.) is stored in Redis
> under org-scoped keys. Postgres holds users, organizations, conversations, workflows,
> audit logs, and other relational data per the Prisma schema.

---

## 5. Database Setup & Migrations

### 5.1 Create the database and user (Debian/Ubuntu packaged Postgres)

```bash
sudo -u postgres psql <<'SQL'
CREATE USER windels WITH PASSWORD 'windels' SUPERUSER;
CREATE DATABASE windels OWNER windels;
SQL
```

(Use a strong password in production; match it to `DATABASE_URL`.)

### 5.2 Push schema and generate Prisma client

The Prisma schema uses `prisma db push` for MVP (schema-first, no migration files yet).
Run from the repo root:

```bash
cd apps/api
DATABASE_URL="postgresql://windels:windels@localhost:5432/windels?schema=public" \
  ./node_modules/.bin/prisma db push --accept-data-loss
DATABASE_URL="postgresql://windels:windels@localhost:5432/windels?schema=public" \
  ./node_modules/.bin/prisma generate
cd ../..
```

`db push` will:
1. Create all tables, enums, indexes and relations per `prisma/schema.prisma`.
2. Run `prisma generate` as a side-effect, producing `@prisma/client` in `node_modules/.prisma/client`
   for the API's TypeScript build to consume.

> **Important:** after any `pnpm install` that wipes `node_modules`, you MUST run
> `prisma generate` (or `db push`) **before** `pnpm --filter @windels/api build`. If you see
> `TS2305: Module has no exported member 'MeetingStatus'` (or any other Prisma enum), the
> client wasn't regenerated after install. Fix: re-run the two commands above, then build.

### 5.3 Future migrations
When migration files are introduced in a later version, replace `db push` with:
```bash
pnpm --filter @windels/api exec prisma migrate deploy
```

---

## 6. Redis Setup

### Local Debian/Ubuntu package

```bash
sudo systemctl enable redis-server
sudo systemctl start redis-server
redis-cli ping   # expect PONG
```

By default Redis binds to `127.0.0.1:6379` without a password. For production:
1. Set a strong password in `/etc/redis/redis.conf` (`requirepass <strong>`).
2. Bind to private IP only (`bind 10.0.0.5`).
3. Enable TLS (`port 0` + `tls-port 6379` + `tls-cert-file`/`tls-key-file`/`tls-ca-cert-file`).
4. Use `rediss://:password@host:6379` in `REDIS_URL`.

### What Redis is used for
- **Module state (Sessions 38–82+):** all dashboards, seeds, simulation state, rollups are
  stored in Redis under org-scoped keys (`<ns>:<oid>:...`). Redis data loss means the
  dynamic dashboards reset to their seeded state on next boot; relational user/workflow/
  conversation data is unaffected (Postgres).
- **Rate limiting** (token bucket with Lua atomicity).
- **CSRF tokens.**
- **Event bus pub/sub** (cross-process delivery; a dedicated subscriber client `redis` is
  used — all other reads/writes go through `redisCmd`).
- **Observability ring buffers** (logs, traces, events).

Redis persistence: enable AOF + RDB snapshots (default on most distros) so dynamic module
state survives restart. For maximum safety in multi-replica, use a managed Redis with
replication + automatic failover.

---

## 7. Third-Party Services (optional)

WINDELS AI OS runs fully air-gapped without any external API keys. The following
integrations are **optional**; if not configured the relevant features fall back to the
internal `windels-assistant` stub and to seeded synthetic data.

| Provider / Service       | Env var              | Purpose                                                |
|--------------------------|----------------------|--------------------------------------------------------|
| OpenAI                   | `OPENAI_API_KEY`     | GPT-class models routed through S33 provider layer.    |
| Anthropic                | `ANTHROPIC_API_KEY`  | Claude-class models.                                   |
| Google AI / Gemini       | `GOOGLE_API_KEY`     | Gemini models (add through `/ai-ecosystem` UI).        |
| Sentry (error reporting) | `SENTRY_DSN`         | Server + client error reporting.                       |
| SMTP (email)             | `SMTP_*`             | For production invites/password resets — configured via UI later. |
| Slack/Teams/Discord/etc. | configured in-app    | Enterprise integrations managed through `/app/enterprise/integrations`. |

For production email, object storage (S3-compatible), and other connectors, add
credentials via the **Enterprise → Integrations** page after first login — these are
encrypted at rest with AES-256-GCM using `WINDELS_ENCRYPTION_KEY`.

---

## 8. Build

Build order matters: `shared` first, then `api`, then `web`.

```bash
pnpm --filter @windels/shared build
pnpm --filter @windels/api build
pnpm --filter @windels/web exec vite build
```

Artifacts:
- `packages/shared/dist/` — compiled JS + `.d.ts`
- `apps/api/dist/` — compiled API server (`index.js` is the entry)
- `apps/web/dist/` — static Vite production bundle (served by nginx in prod)

> If the API build fails with Prisma enum errors, go back to §5.2 and run
> `prisma generate` again before retrying.

---

## 9. Production Deployment

You have two supported paths: **systemd + nginx** (simple, one-host) and **Docker/Kubernetes**.

### 9.1 Systemd + nginx (recommended for single-host production)

#### 9.1.1 API process — `/etc/systemd/system/windels-api.service`

```ini
[Unit]
Description=WINDELS AI OS API
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=windels
Group=windels
WorkingDirectory=/opt/windels-ai-os/apps/api
Environment=NODE_ENV=production
EnvironmentFile=/opt/windels-ai-os/.env
ExecStart=/usr/bin/node /opt/windels-ai-os/apps/api/dist/index.js
Restart=always
RestartSec=3
StandardOutput=append:/var/log/windels/api.log
StandardError=append:/var/log/windels/api.log
# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/opt/windels-ai-os /var/log/windels

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /bin/false windels
sudo mkdir -p /opt/windels-ai-os /var/log/windels
sudo chown -R windels:windels /opt/windels-ai-os /var/log/windels
# copy repo to /opt/windels-ai-os and set ownership, then:
sudo systemctl daemon-reload
sudo systemctl enable --now windels-api
sudo systemctl status windels-api   # should show "active (running)"
```

#### 9.1.2 Web (Vite static build via nginx)

Copy the Vite build to a served directory:

```bash
sudo mkdir -p /var/www/windels
sudo cp -r apps/web/dist/* /var/www/windels/
```

#### 9.1.3 nginx vhost — `/etc/nginx/sites-available/windels.conf`

```nginx
server {
    listen 80;
    server_name windels.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name windels.example.com;

    ssl_certificate     /etc/letsencrypt/live/windels.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/windels.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Static web bundle
    root /var/www/windels;
    index index.html;
    location / {
        try_files $uri /index.html;
    }

    # API reverse proxy
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/windels.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

To obtain the certificate:
```bash
sudo certbot --nginx -d windels.example.com
```

### 9.2 Docker / docker-compose

Use the provided stack for quick deploys:

```bash
docker compose -f docker-compose.yml -f infra/docker/docker-compose.prod.yml up -d
```

- `Dockerfile.api` (multi-stage Node 20 Alpine, non-root, tini init)
- `Dockerfile.web` (nginx:alpine serving Vite static + API proxy, gzip, SPA fallback)
- See `infra/docker/` for override files and Traefik TLS config.

### 9.3 Kubernetes

Manifests are in `infra/k8s/` (namespace, postgres/redis statefulsets, API + web deployments,
services, HPA, ingress, kustomization). Apply with:

```bash
kubectl apply -k infra/k8s/
```

Production recommendations in `infra/k8s/README.md` (managed DB/Redis, NetworkPolicy, PDBs,
Pod Security Admission restricted, SealedSecrets/ESO).

---

## 10. Post-Deployment Verification

Wait ~60 seconds after starting the API. Bootstraps fire up to 23.5s post-listen and S76
validation fires at 17s of that sequence.

### 10.1 Liveness

```bash
curl -fsS http://localhost:4000/api/v1/health
# expect {"ok":true,"data":{"service":"windels-api","status":"ok",...}}
```

### 10.2 Deep health (includes version + uptime + memory)

```bash
curl -fsS http://localhost:4000/api/v1/health/deep
```

### 10.3 Prometheus metrics

```bash
curl -fsS http://localhost:4000/api/v1/metrics | head -30
```

Expect `windels_build_info`, `windels_db_up 1`, `windels_redis_up 1`, `http_requests_total`.

### 10.4 Log in (obtain a JWT)

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@windels.ai","password":"W1ndels!Admin#2026"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
echo "token length: ${#TOKEN}"   # expect ~325 chars
```

> The first registered user is promoted to SUPER_ADMIN automatically. If the DB was just
> created, either log in once through the UI (register flow) or hit `/auth/login` with the
> bootstrap super-admin credentials above.

### 10.5 Dashboard smoke test — all 16 S61–S75 + S82 modules

Run this as the super-admin:

```bash
for ep in data-marketplace digital-humans quantum sustainability biomedical legal education scientific cognitive command ai-economy autonomous opex industry health-ecosystem cyber; do
  code=$(curl -s -o /tmp/$ep.json -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "http://localhost:4000/api/v1/$ep/dashboard/rollup")
  echo "$code  $ep"
done
```

**All should print `200`**. If any returns non-200, check `/var/log/windels/api.log` (or
docker logs) for stack traces. Common fixes in §14.

### 10.6 Web UI sanity check

Open `https://windels.example.com/app` and log in.
- Sidebar should read **"Sessions 38–75 · v0.89.0"**.
- Clicking **Platform** in the sidebar should load with 20+ tabs visible
  (Self-Hosted, Kernel, Voice Studio, ... Cyber, QA, Governance, Releases, ... Health Ecosystem).
- Clicking each tab should render its dashboard without console errors.

### 10.7 Run the E2E suite

```bash
pnpm --filter @windels/web exec playwright install chromium
# in one terminal: start API + web (dev or prod — web needs to be reachable at :5173 for dev tests)
bash start.sh        # API on :4000
bash start_vite.sh   # Vite dev on :5173
# in another terminal:
pnpm exec playwright test tests/e2e/ --reporter=list
```

Expected: ~40+ tests pass across `smoke`, `auth`, `sessions41-76-80`, `sessions54-60`,
`sessions61-72-82`, `sessions73-75`, and the feature-specific specs.

### 10.8 S76 final integration validation

S76's automated report is exposed at:

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/v1/validation/report
```

Expected: `checks.passed == checks.total` (22/22 in the historical shipped build), `systemsWired`
contains all expected module prefixes, `duplicateSystems == 0`, `consentGateEnforced == true`,
`governanceGateEnforced == true`. A markdown checklist is also provided in
`S76-final-validation.md` in this repo.

---

## 11. First-Run Bootstrap

After first login as the super-admin:

1. **Change the super-admin password.** The bootstrap password is a public default in this guide.
2. **Set organization name** to your company under Settings → Account.
3. **Invite team members** via Settings → Team (or `/app/settings/team`).
4. **Configure integrations** (Slack, email, etc.) under Enterprise → Integrations.
5. **Enable AI providers** (if using external) under Platform → AI Ecosystem → Providers.
6. **Review consent gate** (Voice Studio → Consent) and confirm it displays "Consent gate enforced".
7. **Set encryption key rotation reminder** (rotate `WINDELS_ENCRYPTION_KEY` every 90 days;
   re-encrypt credentials manually through the UI after rotation for now — automated KMS
   integration is on the roadmap).

The bootstrap sequence populates every module with realistic seed data when the first
request for that module hits the API (lazy-bootstrap pattern, see CONVENTIONS.md). You
don't need to manually seed anything.

---

## 12. Backup & Maintenance

### 12.1 PostgreSQL (primary persistent store)

Daily backup (add to cron):
```bash
#!/usr/bin/env bash
# /usr/local/bin/windels-backup.sh
set -euo pipefail
TS=$(date +%Y%m%d-%H%M%S)
PGPASSWORD='<pw>' pg_dump -h localhost -U windels -Fc windels \
  | gzip > /var/backups/windels/windels-$TS.dump.gz
find /var/backups/windels -name '*.dump.gz' -mtime +14 -delete
```

Restore:
```bash
gunzip -c windels-20260721-020000.dump.gz | pg_restore -h localhost -U windels -d windels --clean --if-exists
```

For managed Postgres (RDS, Cloud SQL), use the provider's automated snapshots (7–35 days)
plus periodic `pg_dump` export to object storage for redundancy.

### 12.2 Redis (module state, cache, rate limits)

Redis data can be regenerated from seeds after a flush (all dashboards reseed on next access
via the lazy-bootstrap guards), so RPO is lenient. Enable AOF for bounded loss:

```bash
# /etc/redis/redis.conf
appendonly yes
appendfsync everysec
```

Daily RDB snapshot backup for warm-start recovery:
```bash
cp /var/lib/redis/dump.rdb /var/backups/windels/redis-$(date +%Y%m%d).rdb
```

### 12.3 Environment secrets

- Store `.env` (or systemd `EnvironmentFile`) with `0600` permissions.
- Rotate `JWT_SECRET` and `WINDELS_ENCRYPTION_KEY` on a schedule; rotating the JWT secret
  invalidates all active sessions.
- For Kubernetes, use SealedSecrets or External Secrets Operator (ESO) backed by
  AWS Secrets Manager / HashiCorp Vault.

### 12.4 Application updates

The S54 Update module surfaces in-product updates; for out-of-band updates:

```bash
cd /opt/windels-ai-os
sudo -u windels git pull
sudo -u windels pnpm install
sudo -u windels bash -c 'cd apps/api && DATABASE_URL=... ./node_modules/.bin/prisma db push'
sudo -u windels pnpm -F @windels/shared build
sudo -u windels pnpm -F @windels/api build
sudo -u windels pnpm -F @windels/web exec vite build
sudo cp -r apps/web/dist/* /var/www/windels/
sudo systemctl restart windels-api
sudo systemctl reload nginx
```

Then re-run the §10 smoke tests.

### 12.5 Log rotation

The systemd unit writes to `/var/log/windels/api.log`; add a logrotate entry:
```
/var/log/windels/*.log {
  daily rotate 14 compress missingok notifempty
  copytruncate
}
```

---

## 13. Rollback

If a new deploy misbehaves:

1. **Revert code:**
   ```bash
   cd /opt/windels-ai-os
   git fetch --tags
   git checkout <previous-good-tag>   # e.g. v0.88.0
   ```
2. **Rebuild:**
   ```bash
   pnpm install
   cd apps/api && ./node_modules/.bin/prisma generate && cd ../..
   pnpm -F @windels/shared build
   pnpm -F @windels/api build
   pnpm -F @windels/web exec vite build
   sudo cp -r apps/web/dist/* /var/www/windels/
   ```
3. **Database rollback** (only if a forward migration was applied — MVP uses `db push`
   without migration files today, so manual SQL restore is needed if a push changed schema):
   ```bash
   # Restore from the most recent pre-deploy backup
   gunzip -c /var/backups/windels/windels-<TS>.dump.gz | \
     pg_restore -h localhost -U windels -d windels --clean --if-exists
   ```
4. **Redis** — flush (module dashboards reseed automatically):
   ```bash
   redis-cli FLUSHALL
   ```
5. **Restart:**
   ```bash
   sudo systemctl restart windels-api
   sudo systemctl reload nginx
   ```
6. **Verify** with §10 smoke tests before re-routing traffic.

For Docker/K8s deploys, roll back by changing the image tag to the previous version and
re-applying manifests (`kubectl rollout undo deployment/windels-api`).

---

## 14. Troubleshooting

| Symptom                                              | Likely cause                                                                           | Fix                                                                                                                                                                 |
|------------------------------------------------------|----------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| API fails to boot with `PrismaClientInitializationError` | Postgres not running, or `DATABASE_URL` wrong.                                    | Check `sudo systemctl status postgresql`; verify `DATABASE_URL` with `psql "$DATABASE_URL" -c 'select 1'`.                                                          |
| API fails to boot with `ioredis` connection refused  | Redis not running or password mismatch.                                                | `sudo systemctl status redis-server`; test `redis-cli -u "$REDIS_URL" ping`.                                                                                        |
| API build fails `TS2305: Module has no exported member 'MeetingStatus'` (or other Prisma enum) | Prisma client not regenerated after `pnpm install`.                           | `cd apps/api && ./node_modules/.bin/prisma generate && cd ../..` then rebuild.                                                                                      |
| API build fails `TS2769: No overload matches this call ... logger.info` | New code using string-first pino signature.                                    | Use object form: `logger.info({ msg: "…", key: value })`.                                                                                                           |
| Login returns 429 Too Many Requests                  | Aggressive `/auth/login` rate limiter triggered (10/min, 5-min lockout).              | Wait 5 minutes, or run `redis-cli DEL ratelimit:login:<ip>`; restart the API clears in-memory LRU too.                                                               |
| Login returns 401 "Invalid credentials" with the right password | Password policy rejected the bootstrap password; or first user was created with a different password. | Re-run register once; or update the user via psql (`UPDATE "User" SET "passwordHash"='$2b$12$...'`); ensure `BOOTSTRAP_SUPERADMIN_PASSWORD` meets the policy (10+ chars, upper+lower+digit+symbol). |
| Module dashboard returns 500 on first hit            | Bootstrap timeout; lazy-bootstrap didn't fire because Redis key is partially present. | `redis-cli KEYS '<ns>:<oid>:*' \| xargs redis-cli DEL` (replace `<ns>` with module prefix, e.g. `hec` for health-ecosystem) — it will reseed on next call.         |
| Dashboard returns 401                                 | Missing `Authorization: Bearer <token>`; or token expired (TTL 15m); or CSRF mismatch. | Re-login. If using cookie sessions, include `X-XSRF-TOKEN` header on POSTs.                                                                                        |
| CSRF errors on POSTs from browser                    | Client is not sending the double-submit token.                                         | Read `XSRF-TOKEN` cookie; echo it back in `X-XSRF-TOKEN` request header. Axios/fetch clients in this repo do this automatically via interceptor.                    |
| Vite build fails `Cannot find module …LEGAL_DOCS`    | `apps/web/src/lib/legal.ts` must export both `legalApi` and the public `LEGAL_DOCS` marketing constant. | Ensure `LEGAL_DOCS` is exported from `legal.ts` (used by `/legal` marketing page).                                                                                |
| Web page shows blank + console `Failed to fetch /api/v1/...` | API CORS origin mismatch or nginx proxy misconfigured.                          | Check `API_CORS_ORIGIN` matches the browser origin; verify nginx `/api/` `proxy_pass` is reachable; check `curl http://127.0.0.1:4000/api/v1/health` from the web host. |
| "Connection in subscriber mode" ioredis error        | Code wrote to the subscriber client `redis` instead of the command client `redisCmd`. | Always use `redisCmd` for reads/writes after boot; `redis` is reserved for pub/sub (Session 20+ pattern).                                                          |
| Event bus messages not crossing between replicas     | Only one replica has subscribers, or `REDIS_URL` doesn't point at a shared Redis.      | Ensure all replicas use the same Redis; EventBus uses Redis pub/sub for cross-process delivery.                                                                      |
| Vite dev HMR not working over nginx                  | WebSocket upgrade headers missing.                                                     | Ensure `proxy_set_header Upgrade` and `Connection "upgrade"` are present (see nginx template in §9.1.3).                                                            |
| High memory usage after long uptime                  | Event ring buffers and metrics time series grow unboundedly under misconfigured TTLs. | Restart API (all Redis-persisted dashboards reseed instantly); check `Metrics` ring windows. Memory stays bounded in shipped configuration (2000-entry rings).     |
| Health endpoint returns `"db":"fail"`                 | Postgres connection pool exhausted or DB restarted.                                    | Check Postgres logs; API auto-reconnects. If persistent, restart API.                                                                                               |
| Prometheus metric `windels_redis_up 0`                | Redis restarted while API was running and reconnect backoff hasn't completed yet.      | Wait 15 s (probes every 15 s), or restart API.                                                                                                                       |

### Where to look

- **API logs:** `journalctl -u windels-api -f` or `/var/log/windels/api.log`
- **nginx logs:** `/var/log/nginx/access.log`, `/var/log/nginx/error.log`
- **Postgres logs:** `sudo journalctl -u postgresql` or `/var/log/postgresql/`
- **Redis logs:** `sudo journalctl -u redis-server` or `/var/log/redis/redis-server.log`
- **Build errors:** Reproduce locally with `pnpm -F @windels/api build` — TypeScript errors
  surface the file + line.

---

**Document version:** v0.89.0 (Sessions 1–75 + S82 shipped).
**Repo path:** `/home/user/windels-ai-os/DEPLOYMENT.md`
