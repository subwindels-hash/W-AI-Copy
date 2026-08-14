# WINDELS AI OS — Server Deployment Guide

## Key Deployment Options

There are four primary ways to run WINDELS AI OS on a server.

### 1. Docker Compose (Recommended for Single Server / VPS)

The repository includes production Docker and Compose configurations in `docker-compose.yml` and `infra/docker/`.

**Quick Docker Launch:**

```bash
# 1. Clone the repository
git clone <repo-url> /opt/windels && cd /opt/windels

# 2. Configure environment variables
cp .env.example .env
# Set secure values for JWT_SECRET, POSTGRES_PASSWORD, REDIS_PASSWORD, etc.

# 3. Launch the full production stack (API + Web + PostgreSQL + Redis + Traefik/Nginx)
DOMAIN=windels.yourdomain.com ACME_EMAIL=ops@yourdomain.com \
docker compose -f docker-compose.yml -f infra/docker/docker-compose.prod.yml up -d

# 4. Run database migrations
docker compose -f docker-compose.yml -f infra/docker/docker-compose.prod.yml --profile migrate up migrate
```

**Services launched in containers:**

| Service | Role |
|---|---|
| API Service (`windels-api`) | Express backend with Prisma ORM (internal port 4000) |
| Web Frontend (`windels-web`) | React 19 + Vite compiled SPA served via lightweight Nginx |
| Database (`windels-postgres`) | PostgreSQL 17 (supporting pgvector) |
| Cache & Event Bus (`windels-redis`) | Redis 8.0 (Pub/Sub & session cache) |
| Reverse Proxy / TLS (`windels-traefik` / `windels-nginx`) | Automated SSL certificates (Let's Encrypt) and routing |

---

### 2. Bare-Metal / Virtual Machine (Ubuntu / Debian / RHEL / Rocky Linux)

Run WINDELS AI OS directly on a Linux server using Node.js and PM2 / systemd.

**Prerequisites:**
- OS: Ubuntu 22.04/24.04 LTS, Debian 12, or RHEL 9 / Rocky Linux 9
- Runtime: Node.js >= 20.11 and pnpm >= 10
- Services: PostgreSQL 17 & Redis 8 installed locally or accessible via cloud managed services (AWS RDS, ElastiCache, etc.)

**Step-by-Step Installation:**

```bash
# 1. Install dependencies & build packages
pnpm install
pnpm build

# 2. Set up database schema
pnpm --filter @windels/api exec prisma migrate deploy
# Optional: Seed initial admin & demo data
pnpm --filter @windels/api exec tsx prisma/seed.ts

# 3. Run the API service (e.g. via PM2 or systemd)
DATABASE_URL="postgresql://user:pass@localhost:5432/windels" \
REDIS_URL="redis://localhost:6379" \
JWT_SECRET="your-secure-jwt-secret" \
NODE_ENV="production" \
node apps/api/dist/index.js

# 4. Serve the Web App (apps/web/dist) via Nginx or Caddy pointing to API on port 4000
```

---

### 3. Kubernetes (Multi-Node / Enterprise Cluster)

For high-availability enterprise environments, the repo includes ready-to-use Kubernetes manifests in `infra/k8s/`:

```bash
# Deploy all manifests (API, Web, Redis, Postgres, Ingress, and HPA)
make k8s-apply
# or: kubectl apply -k infra/k8s
```

- Includes Horizontal Pod Autoscaling (HPA) for dynamic scaling under load.
- Supports external managed database configurations (AWS RDS, Cloud SQL) by configuring `windels-secrets`.

---

### 4. Cloud Infrastructure as Code (Terraform)

If provisioning cloud infrastructure on AWS, pre-configured Terraform modules exist in `infra/terraform/` for VPC, RDS PostgreSQL, and ElastiCache Redis.

---

## Minimum & Recommended Server Requirements

| Component | Minimum (Staging / Small Team) | Production Standard |
|---|---|---|
| CPU | 2 vCPUs | 4–8 vCPUs |
| RAM | 4 GB | 16–32 GB |
| Disk | 30 GB SSD | 100+ GB NVMe |
| Database | PostgreSQL 17 + pgvector | Managed PostgreSQL (RDS / Cloud SQL) |
| Cache / Queue | Redis 7+ / 8.0 | Managed Redis (ElastiCache / MemoryDB) |

---

## Built-in Server Observability & Health Checks

Once deployed, WINDELS AI OS exposes built-in monitoring:

- **Liveness check:** `GET /api/v1/health` (or `/healthz`)
- **Deep readiness check:** `GET /api/v1/health/deep` (checks Postgres, Redis, memory, and uptime)
- **Prometheus Metrics:** `GET /api/v1/metrics`
- **Grafana & Loki:** Ready-to-use monitoring stack via `make monitoring-up` (Prometheus `:9090`, Grafana `:3000`, Alertmanager `:9093`)

---

## Google Places API — Lead Discovery Setup

To connect and enable Lead Discovery in WINDELS AI OS, configure the Google Places API. WINDELS AI OS uses the Google Places Text Search engine to discover real-world business listings, verify company metadata, manage lead pipelines, detect duplicates, and export sanitized lead datasets.

### Step 1: Obtain a Google Places API Key

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Google Cloud project or select an existing project.
3. In the sidebar, navigate to **APIs & Services → Library**.
4. Search for and enable **Places API** (or Places API / Maps JavaScript API).
5. Go to **APIs & Services → Credentials**.
6. Click **+ Create Credentials → API Key**.
7. *(Recommended for Security)* Restrict the API Key: under **API restrictions**, select **Restrict key** and choose **Places API**.

### Step 2: Configure the Environment Variable

Add your API key to your server's `.env` file:

```env
# Google Places API for AI Lead Discovery
GOOGLE_PLACES_API_KEY=AIzaSyYourActualGooglePlacesAPIKeyHere
```

- **Docker Compose:** pass `GOOGLE_PLACES_API_KEY` into your `docker-compose.yml` / `infra/docker/docker-compose.prod.yml` under the `api` service environment.
- **Kubernetes:** add `GOOGLE_PLACES_API_KEY` to the `windels-secrets` Secret object.

### Step 3: Restart the API Backend

```bash
# If running locally / dev:
pnpm dev

# If running via Docker Compose:
docker compose restart api

# If running via systemd/PM2:
pm2 restart windels-api
```

### Step 4: Using Lead Discovery in the Web App

Once the key is set, the UI activates automatically:

- **Lead Search** (`/app/leads` or Sidebar → Lead Discovery): enter natural language queries (e.g., "Coffee shops in Austin, TX", "Logistics warehouses in Rotterdam", "Fintech startups in London"). The platform fetches verified business records, addresses, categories, and Google Place IDs.
- **Collections & Segmentation:** create custom collections (e.g., "Q3 Outreach - Tech") and group relevant leads.
- **Pipeline Management** (`/app/leads/pipeline`): track lead stages (New → Contacted → Qualified → Disqualified). Add internal team notes and review search logs.
- **Automated Deduplication:** the system automatically identifies duplicate Place IDs across repeated searches and flags them so exports remain clean.
- **Sanitized Export:** export selected leads as CSV or JSON with built-in spreadsheet formula-injection protection.

### Step 5: Direct REST API Endpoints

You can also search and manage leads programmatically:

| Method | Endpoint | Description | Request Body Example |
|---|---|---|---|
| POST | `/api/v1/lead-discovery/search` | Discovers businesses via Google Places | `{"query": "Solar panel installers in Munich"}` |
| GET | `/api/v1/lead-discovery/leads` | Lists all discovered leads in the organization | — |
| GET | `/api/v1/lead-discovery/collections` | Lists lead collections | — |
| POST | `/api/v1/lead-discovery/collections` | Creates a new collection | `{"name": "EU Expansion"}` |
| POST | `/api/v1/lead-discovery/collections/:id/leads` | Adds a lead to a collection | `{"leadId": "lead-uuid"}` |
| POST | `/api/v1/lead-discovery/export` | Exports selected leads (CSV / JSON) | `{"leadIds": ["..."], "format": "csv"}` |
| GET | `/api/v1/lead-discovery/pipeline/summary` | Retrieves pipeline metrics & duplicate counts | — |
