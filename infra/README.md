# WINDELS AI OS — Infrastructure (Session 17)

Production-grade DevOps & infrastructure-as-code for WINDELS AI OS.

```
infra/
├── docker/          # Dockerfiles (api, web), nginx config, production compose override
├── k8s/             # Kubernetes manifests (api, web, postgres, redis, ingress, HPA, kustomization)
├── terraform/       # Terraform IaC for AWS (VPC, RDS, ElastiCache, K8s apply module)
│   ├── modules/     # Reusable network/database/redis/k8s modules
│   └── environments/{dev,staging,prod}/main.tf
└── monitoring/      # Prometheus, Grafana, Alertmanager (docker-compose + provisioned dashboards)
    └── grafana/dashboards/   # WINDELS API overview dashboard
```

## Quick start (local dev)

```bash
# Just Postgres + Redis
make docker-dev     # = docker compose up -d postgres redis
pnpm dev            # API (4000) + Web (5173) via turbo

# Full production-like stack (Traefik TLS, api+web+nginx)
DOMAIN=windels.local ACME_EMAIL=dev@windels.ai \
  docker compose -f docker-compose.yml -f infra/docker/docker-compose.prod.yml up -d

# Monitoring (Prometheus :9090, Grafana :3000 admin/admin, Alertmanager :9093)
make monitoring-up
```

## Tests

```bash
make test-unit      # vitest
make test-e2e       # Playwright (build web first: pnpm --filter @windels/web build)
make test-load      # k6 against http://localhost:4000/api/v1/health
```

## Production deployment

### Docker single-node (recommended for MVP/self-host)
1. Copy `.env.example` → `.env` and set strong secrets (`JWT_SECRET`, `POSTGRES_PASSWORD`, `BOOTSTRAP_SUPERADMIN_PASSWORD`, `ENCRYPTION_KEY`).
2. `docker compose -f docker-compose.yml -f infra/docker/docker-compose.prod.yml up -d`
3. Traefik will issue a Let's Encrypt cert for `$DOMAIN`.
4. Run migrations once: `docker compose -f docker-compose.yml -f infra/docker/docker-compose.prod.yml --profile migrate up migrate`

### Kubernetes
1. Apply manifests: `make k8s-apply` (or `kubectl apply -k infra/k8s`).
2. Update the image tag in `infra/k8s/kustomization.yaml` to point to a pinned SHA.
3. Ensure `windels-secrets` and `windels-db-credentials` Secrets exist.
4. For production: replace in-cluster Postgres/Redis with managed services (RDS/ElastiCache/CloudSQL) and remove their manifests.

### Terraform (AWS)
1. Create an S3 bucket for remote state + a DynamoDB lock table.
2. `cd infra/terraform/environments/staging && terraform init && terraform apply`
3. Use outputs (`db_endpoint`, `redis_endpoint`) to populate K8s Secret values.

## Observability
- Prometheus scrapes `GET /api/v1/metrics` every 10s.
- Grafana provisions a "WINDELS API Overview" dashboard (QPS, p95 latency, error rate, memory, handles, load).
- Alert rules in `infra/monitoring/alerts.yml` cover API down, high error rate, slow routes, DB/Redis down, heap pressure.
- `/api/v1/health` (liveness) and `/api/v1/health/deep` (readiness + memory/uplift/version/commit) expose deployment metadata.

## CI/CD
- `.github/workflows/ci.yml` — lint, typecheck, build, migrate, unit tests, API smoke on every PR/push.
- `.github/workflows/docker.yml` — Build & push api + web multi-stage images to GHCR on every tag.
- `.github/workflows/cd.yml` — Deploy to staging/prod via kubectl or SSH after main merge or manual dispatch.
- `.github/workflows/e2e.yml` — Playwright smoke on every PR (postgres+redis services, built web, API, vite preview).
- `.github/workflows/load-test.yml` — Manual dispatch k6 load tests against a target URL.
