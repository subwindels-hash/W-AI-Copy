# WINDELS AI OS — PRODUCTION INSTALLATION & DEPLOYMENT MANUAL

> **Archived reference:** this document contains historical architecture examples
> and is not the executable single-server runbook. For the current, fail-fast
> Docker deployment use
> [`docs/WINDELS-AI-OS-Deployment-Guide.md`](./docs/WINDELS-AI-OS-Deployment-Guide.md)
> with `infra/docker/docker-compose.prod.yml`. Do not copy credentials or Compose
> snippets from this archived document into a live environment.

```
WINDELS AI OS Enterprise Documentation
Version: 2.0
Documentation Release: 2026 Edition
Repository Version: 0e0bc27
Last Updated: 2026-07-30
Status: AUTHORITATIVE
Applies To: WINDELS AI OS Monorepo

Document Owner: Director of Infrastructure & DevOps
Review Status: APPROVED / PRODUCTION-READY
Change Approval: Enterprise Architecture Board (EAB)
Supersedes: INSTALLATION & PRODUCTION DEPLOYMENT MANUAL (v2.0)
Next Scheduled Review: 2027-01-30
```

---

## TABLE OF CONTENTS

1. [Introduction](#1-introduction)
2. [Supported Operating Systems](#2-supported-operating-systems)
3. [Hardware Requirements](#3-hardware-requirements)
4. [Production Architecture](#4-production-architecture)
5. [Docker Deployment](#5-docker-deployment)
6. [Kubernetes Deployment](#6-kubernetes-deployment)
7. [PostgreSQL Setup](#7-postgresql-setup)
8. [Redis Setup](#8-redis-setup)
9. [Object Storage](#9-object-storage)
10. [SSL Configuration](#10-ssl-configuration)
11. [Reverse Proxy (NGINX/Caddy)](#11-reverse-proxy-nginx-caddy)
12. [Environment Variables](#12-environment-variables)
13. [Secrets Management](#13-secrets-management)
14. [AI Model Configuration](#14-ai-model-configuration)
15. [Vector Database Configuration](#15-vector-database-configuration)
16. [Event Bus Configuration](#16-event-bus-configuration)
17. [Monitoring](#17-monitoring)
    - [Prometheus](#prometheus)
    - [Grafana](#grafana)
    - [Loki](#loki)
18. [Backup Strategy](#18-backup-strategy)
19. [Disaster Recovery](#19-disaster-recovery)
20. [High Availability](#20-high-availability)
21. [Zero Downtime Deployment](#21-zero-downtime-deployment)
22. [Production Software Factory Build Host Setup](#22-production-software-factory-build-host-setup)
23. [Production Checklist](#23-production-checklist)
24. [Troubleshooting](#24-troubleshooting)
25. [Daily Maintenance](#25-daily-maintenance)
26. [Upgrade Procedures](#26-upgrade-procedures)

---

## 1. INTRODUCTION

WINDELS AI OS is the industry's first completely autonomous, AI-Native Enterprise Operating System. Unlike traditional operating systems centered on scheduling human computations against local physical hardware, WINDELS coordinates a unified event-loop containing multi-agent networks, cognitive loops, background workers, and distributed microservices. This deployment guide provides concrete system design configurations, step-by-step terminal instructions, and cluster manifests necessary to move the current staging-ready candidate codebase into a fully live, secured production cluster.

---

## 2. SUPPORTED OPERATING SYSTEMS

The underlying platform services, Express API clusters, and React web wrappers of WINDELS AI OS have been fully validated, containerized, and certified on the following kernel environments:

*   **Primary OS**: Ubuntu Server 22.04 LTS / 24.04 LTS (Kernel v5.15 / v6.8+)
*   **Enterprise OS**: Red Hat Enterprise Linux (RHEL) 9.4+ / Rocky Linux 9.4+
*   **Minimal/Container OS**: Alpine Linux 3.19+ (specifically for lightweight container runtimes)
*   **Edge AI Node OS**: Ubuntu Core 22 (for NVIDIA Jetson, Orin, and local CCTV gateways)

---

## 3. HARDWARE REQUIREMENTS

Ensure your node configurations meet or exceed these physical bounds before starting:

| Infrastructure Layer | Standard Host Role | CPU / Cores | RAM | Storage / Disk | Recommended Accel. |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **API Server Node** | Express microservice | 4 vCPUs | 8 GB | 50 GB NVMe | N/A |
| **Web Host Node** | NGINX static asset CDN | 2 vCPUs | 4 GB | 20 GB SSD | N/A |
| **Database Host** | PostgreSQL 17 server | 8 vCPUs | 32 GB | 250 GB NVMe | pgvector cache |
| **Caching Node** | Redis 8.0 cluster | 4 vCPUs | 16 GB | 20 GB SSD | In-Memory (LRU) |
| **GPU Vision Node** | Camera YOLO pipeline | 16 vCPUs | 64 GB | 500 GB NVMe | 2x NVIDIA A10G (24GB VRAM) |
| **Builder Compile Host**| Software Factory engine| 16 vCPUs | 64 GB | 1 TB NVMe | Build Accelerators |

---

## 4. PRODUCTION ARCHITECTURE

WINDELS AI OS utilizes a decoupled 4-layer enterprise architecture ensuring high availability, strict multi-tenant logical isolation, and horizontal scaling capabilities:

```
                                [ CLIENT TRAFFIC ]
                                        │ (HTTPS / WSS / WebRTC)
                                        ▼
                             [ NGINX REVERSE PROXY ]
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 ▼ (Port 4000)                                 ▼ (Port 80)
        [ API EXPRESS SERVERS ]                      [ FRONTEND STATIC CONTENT ]
                 │                                             │
                 ├──────────────────────┬──────────────────────┤
                 ▼                      ▼                      ▼
         [ POSTGRESQL 17 ]         [ REDIS 8.0 ]        [ OBJECT STORAGE ]
          (pgvector index)         (Pub/Sub Cache)         (S3 Bucket)
                 ▲
                 │ (Inference / Alerts)
         [ EDGE GPU WORKERS ]
          (ONVIF / CCTV / YOLO)
```

---

## 5. DOCKER DEPLOYMENT

The baseline production candidate container layout packages both the Express server API and React web CDN.

### 5.1 Multi-Stage Production Dockerfile (`Dockerfile`)
```dockerfile
# ==========================================
# STAGE 1: Build dependencies & workspaces
# ==========================================
FROM node:20.18-alpine AS builder
RUN apk add --no-cache libc6-compat python3 make g++ git openjdk17-jre
WORKDIR /app
RUN npm install -g pnpm@10.34.5
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @windels/shared build
RUN pnpm --filter @windels/api build
RUN pnpm --filter @windels/web build

# ==========================================
# STAGE 2: Lightweight Production Execution
# ==========================================
FROM node:20.18-alpine AS runner
RUN apk add --no-cache ffmpeg python3 opencv-dev
WORKDIR /app
RUN npm install -g pnpm@10.34.5
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/apps/api /app/apps/api
COPY --from=builder /app/packages/shared /app/packages/shared
RUN pnpm install --prod --frozen-lockfile
EXPOSE 4000
CMD ["pnpm", "--filter", "@windels/api", "start"]
```

### 5.2 Multi-Node Docker Compose (`docker-compose.yml`)
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:17-alpine
    container_name: windels-db
    environment:
      POSTGRES_USER: windels_admin
      POSTGRES_PASSWORD: SecretSecurePassword99!
      POSTGRES_DB: windels_prod
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U windels_admin -d windels_prod"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:8.0-alpine
    container_name: windels-cache
    command: redis-server --requirepass SecretRedisPass88! --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "SecretRedisPass88!", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: windels-core-api
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://windels_admin:SecretSecurePassword99!@postgres:5432/windels_prod?schema=public
      - REDIS_URL=redis://:SecretRedisPass88!@redis:6379/0
      - JWT_SECRET=openssl_rand_base64_generated_value_here
      - WINDELS_ENCRYPTION_KEY=64_character_hex_key_here
    ports:
      - "4000:4000"

volumes:
  pgdata:
  redisdata:
```

---

## 6. KUBERNETES DEPLOYMENT

For microservice clustering across multiple Kubernetes nodes, deploy the production manifests:

### 6.1 Service & Deployment Manifest (`apps/api-deployment.yaml`)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: windels-api-deployment
  namespace: windels-production
  labels:
    app: windels-api
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: windels-api
  template:
    metadata:
      labels:
        app: windels-api
    spec:
      containers:
        - name: api
          image: windels-api:v2.0.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 4000
          envFrom:
            - secretRef:
                name: windels-secrets
            - configMapRef:
                name: windels-config
          resources:
            requests:
              memory: "2Gi"
              cpu: "1000m"
            limits:
              memory: "4Gi"
              cpu: "2000m"
          readinessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 15
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 30
            periodSeconds: 15
---
apiVersion: v1
kind: Service
metadata:
  name: windels-api-service
  namespace: windels-production
spec:
  selector:
    app: windels-api
  ports:
    - protocol: TCP
      port: 4000
      targetPort: 4000
  type: ClusterIP
```

---

## 7. POSTGRESQL SETUP

PostgreSQL v17 acts as the master persistence layer.

1.  **Installation**: Ensure PostgreSQL is compiled with openssl:
    ```bash
    sudo apt-get install postgresql-17 postgresql-contrib-17 postgresql-17-pgvector
    ```
2.  **Enable vector extensions**: Connect to the DB shell and run:
    ```sql
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS vector;
    ```
3.  **Generate DB Prisma Schema**:
    ```bash
    pnpm prisma generate
    ```
4.  **Safely Apply Migrations**:
    ```bash
    pnpm prisma migrate deploy
    ```
5.  **Seed Database Accounts**:
    ```bash
    pnpm prisma db seed
    ```

---

## 8. REDIS SETUP

To manage heavy rates of message Pub/Sub streaming:

1.  **Configure Memory Limits**: Edit `/etc/redis/redis.conf` to use standard LRU cache policies:
    ```conf
    maxmemory 8gb
    maxmemory-policy allkeys-lru
    appendonly yes
    appendfsync everysec
    ```
2.  **Authentication**: Secure TCP bindings:
    ```conf
    requirepass SecretRedisPass88!
    bind 0.0.0.0
    ```
3.  **Service Restart**:
    ```bash
    sudo systemctl restart redis-server
    ```

---

## 9. OBJECT STORAGE

Configure AWS S3 or on-premise MinIO buckets to store camera video streams and attachments:
*   Add S3 configurations:
    ```env
    AWS_ACCESS_KEY_ID="AWS_ACCESS_KEY"
    AWS_SECRET_ACCESS_KEY="AWS_SECRET"
    AWS_S3_REGION="us-east-1"
    AWS_S3_BUCKET="windels-enterprise-vault"
    ```
*   Set Lifecycle Policies: Automate deletes for raw CCTV segment temporary caches after 7 days:
    ```xml
    <LifecycleConfiguration>
      <Rule>
        <ID>CCTV-Temporary-Clean</ID>
        <Filter><Prefix>temp/cctv/</Prefix></Filter>
        <Status>Enabled</Status>
        <Expiration><Days>7</Expiration>
      </Rule>
    </LifecycleConfiguration>
    ```

---

## 10. SSL CONFIGURATION

Obtain Let's Encrypt TLS certificates using certbot:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.windels.ai -d app.windels.ai
```
Verify automatic cert renewals are set up on crontab:
```bash
sudo systemctl status certbot.timer
```

---

## 11. REVERSE PROXY (NGINX/CADDY)

Proxy incoming secure requests from ports 80/443 directly to Node instance pools.

### 11.1 Nginx Ingress Configuration (`/etc/nginx/sites-available/windels.conf`)
```nginx
upstream windels_api_pool {
    server 127.0.0.1:4000;
    keepalive 32;
}

server {
    listen 80;
    server_name api.windels.ai;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.windels.ai;

    ssl_certificate /etc/letsencrypt/live/api.windels.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.windels.ai/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    client_max_body_size 100M; # required for large project ZIP imports (S84)

    location / {
        proxy_pass http://windels_api_pool;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 12. ENVIRONMENT VARIABLES

Ensure your `.env` contains all properties matching the verified monorepo services:

```env
# Node Environment Settings
NODE_ENV=production
LOG_LEVEL=info
WINDELS_ENCRYPTION_KEY=64_HEX_CHARS_FOR_AES_ENVELOPE_ENCRYPTION_KEY

# Port Configurations
API_PORT=4000
API_HOST=0.0.0.0
WEB_ORIGIN=https://app.windels.ai

# Database Parameters
DATABASE_URL="postgresql://windels_admin:SecretSecurePassword99!@db_host:5432/windels_prod?schema=public"
REDIS_URL="redis://:SecretRedisPass88!@redis_host:6379/0"

# Secrets & Signatures
JWT_SECRET="openssl_generated_jwt_token_secret"
JWT_ISSUER="windels-ai-os"

# Google Sign-In (OIDC)
GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
GOOGLE_REDIRECT_URI="https://api.windels.ai/api/v1/auth/google/callback"

# LLM Providers
OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
ANTHROPIC_API_KEY="YOUR_ANTHROPIC_API_KEY"
OLLAMA_BASE_URL="http://local-ollama:11434"
AI_REQUIRE_REAL_MODEL=true
```

---

## 13. SECRETS MANAGEMENT

Never persist hardcoded secrets into version control or readable environment files.
*   **Production VMs**: Store variables inside system services or use HashiCorp Vault.
*   **Kubernetes Secrets**: Encrypt secrets at rest using sealer keys inside etcd:
    ```bash
    kubectl create secret generic windels-secrets --from-env-file=.env -n windels-production
    ```

---

## 14. AI MODEL CONFIGURATION

WINDELS AI OS is model-agnostic, enabling deep API routing to cloud LLMs or offline local GPU instances.
*   **Cloud Fallbacks**: Set `AI_REQUIRE_REAL_MODEL=true` in `.env` to disable standard Echo simulation filters.
*   **Ollama GPU Local Inference**: Enable local Ollama engines on edge instances:
    ```bash
    ollama pull llama3
    ollama run llama3
    ```
    Point `.env` API configs to: `OLLAMA_BASE_URL="http://edge-ollama:11434"`.

---

## 15. VECTOR DATABASE CONFIGURATION

The pgvector relational framework provides lightning-fast semantic context retrievals for AI employees.
*   Ensure that PostgreSQL is tuned to handle multi-dimension vectors (e.g. 1536 properties for OpenAI embeddings).
*   Add optimized HNSW index parameters:
    ```sql
    CREATE INDEX ON "AgentMemory" USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
    ```

---

## 16. EVENT BUS CONFIGURATION

The central Redis Event Bus utilizes distinct worker connections to avoid memory blocking:
*   **Publisher Clients**: Transmit async alerts instantly.
*   **Subscriber Clients**: Bind persistent listeners to channel clusters (such as camera feed streams).

---

## 17. MONITORING

Maintain granular visibility on system states using standard telemetry platforms.

### Prometheus Scrapers (`/etc/prometheus/prometheus.yml`)
```yaml
scrape_configs:
  - job_name: 'windels-api'
    scrape_interval: 5s
    static_configs:
      - targets: ['api-service:4000']
```

### Grafana Dashboards
Import standard dashboard configurations to track node CPU usage, relational connections, and Redis event throughput.

### Loki Log Aggregations
Log files are exported in JSON formats directly to Loki. Setup Promtail log filters to prevent leaking API authorization tokens:
```yaml
scrape_configs:
  - job_name: windels-api-logs
    static_configs:
      - targets: [localhost]
        labels:
          job: windels-api
          __path__: /var/log/windels/*.log
```

---

## 18. BACKUP STRATEGY

Maintain an automated database backup structure:
```bash
# /etc/cron.daily/windels-backup
#!/bin/bash
BACKUP_DIR="/mnt/backups/windels"
mkdir -p $BACKUP_DIR
pg_dump -U windels_admin -h db_host -d windels_prod | gzip > $BACKUP_DIR/db_backup_$(date +%Y%m%d).sql.gz
find $BACKUP_DIR -type f -mtime +14 -delete
```

---

## 19. DISASTER RECOVERY

If regional network outages or database corruptions strike:
1.  **Route Traffic**: Divert Nginx loads to cold-standby nodes.
2.  **Pull Backups**: Retrieve the latest daily SQL gzip archive.
3.  **Restore DB State**:
    ```bash
    gunzip -c db_backup_latest.sql.gz | psql -U windels_admin -d windels_prod
    ```
4.  **Caches Warmup**: Warm up active Redis databases to rebuild search sessions.

---

## 20. HIGH AVAILABILITY

Ensure 100% system uptime:
*   **Load Balancing**: Use HAProxy or AWS ALB to distribute HTTP/WS connections.
*   **PostgreSQL Replicas**: Deploy hot-standby nodes with streaming replication.
*   **Redis Sentinel**: Group caching clusters to guarantee failover lookups.

---

## 21. ZERO DOWNTIME DEPLOYMENT

Ensure uninterrupted user canvas sessions during code updates:
*   Set Rolling Updates: Deploy pods incrementally on Kubernetes.
*   Keep connection proxies alive:
    ```bash
    # Rebuild backend and perform smooth rolling reload
    docker compose up -d --no-deps --build api
    ```

---

## 22. PRODUCTION SOFTWARE FACTORY BUILD HOST SETUP

For compiler nodes running the **WINDELS AI Software Factory** to package target apps, configure these dependencies:

### 22.1 Desktop Compiler Configuration
Install native packaging libraries for Electron-builder and Tauri compiling targets:
```bash
# Install macOS/Linux system tool chains
sudo apt-get install -y dpkg fakeroot rpm libwxgtk3.0-gtk3-dev build-essential
# Install Rust toolchain for Tauri compilation
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 22.2 Mobile Compiler Configuration
Configure SDK compilation environments:
1.  **Android Build Support**:
    *   Install OpenJDK 17: `sudo apt install -y openjdk-17-jdk`
    *   Install Android Commandline Tools and SDK licenses.
    *   Configure path boundaries inside `.bashrc`:
        ```bash
        export ANDROID_HOME=$HOME/Android/Sdk
        export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/tools/bin
        ```
2.  **macOS iOS Build Support**:
    *   Ensure Xcode commandline tools are configured: `xcode-select --install`
    *   Install CocoaPods: `sudo gem install cocoapods`

---

## 23. PRODUCTION CHECKLIST

Confirm these metrics before marking host states as "Live":
- [ ] Envelope Encryption Keys generated and saved to Vault.
- [ ] Database credentials rotated and locked.
- [ ] SSL certificates active with Auto-Renewals enabled.
- [ ] Prometheus metrics scraping verified.
- [ ] PII log redactors active and tested.
- [ ] CORS policies locked to strict enterprise domains.
- [ ] Mobile/Desktop build SDK paths configured on compiling nodes.

---

## 24. TROUBLESHOOTING

Common deployment obstacles and solutions:
*   **Prisma TS Errors**: Clear existing caches (`pnpm clean`) and re-run Prisma compilation.
*   **Redis Starvations**: Increase maximum client file descriptors:
    ```bash
    ulimit -n 65536
    ```

---

## 25. DAILY MAINTENANCE

Schedule clean-up tasks:
*   Purge temp folders on an automated cron:
    ```bash
    find /app/uploads/temp -type f -mtime +2 -delete
    ```
*   Rotate Express logs.

---

## 26. UPGRADE PROCEDURES

1.  Pull newer commits from target branch:
    ```bash
    git checkout arena/019faafb-windels
    git pull origin arena/019faafb-windels
    ```
2.  Install dependencies:
    ```bash
    pnpm install --frozen-lockfile
    ```
3.  Run DB updates:
    ```bash
    pnpm prisma migrate deploy
    ```
4.  Recompile and reload containers.
