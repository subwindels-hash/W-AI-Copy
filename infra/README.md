# WINDELS AI OS infrastructure

## Local development dependencies

The root Compose file runs only PostgreSQL and Redis for host-based development:

```bash
docker compose up -d
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

PostgreSQL and Redis listen only on the host loopback interface. The API runs on
`:4000` and Vite on `:5173`.

## Single-server production

Use the standalone production file. Do **not** merge it with the development
Compose file.

```bash
cp .env.server.example .env.server
# Fill all required values and point DOMAIN at this server.
make docker-up
```

Direct equivalent:

```bash
docker compose --env-file .env.server \
  -f infra/docker/docker-compose.prod.yml \
  up -d --build
```

The stack provides PostgreSQL 17, authenticated Redis 8, a least-privileged API
database role, ordered migrations/bootstrap, a non-root API, Nginx SPA/API proxy,
and Traefik HTTPS. See
[`docs/WINDELS-AI-OS-Deployment-Guide.md`](../docs/WINDELS-AI-OS-Deployment-Guide.md)
for setup, verification, upgrade, backup, and operational cautions.

## Container images

```bash
# API production target
docker build --target production -f infra/docker/Dockerfile.api -t windels-ai-api .

# Static web/Nginx image
docker build -f infra/docker/Dockerfile.web -t windels-ai-web .
```

`Dockerfile.api` also exposes a `migrator` target used only by the one-shot
Compose bootstrap service.

## Monitoring

The optional monitoring stack expects the production `windels-net` network:

```bash
make monitoring-up
```

Prometheus, Grafana, and Alertmanager are bound to `127.0.0.1`; expose them only
through a secured administrative path or VPN.

## Kubernetes

The manifests in `infra/k8s/` are templates. Before applying them, provide real
Secrets, pin immutable image digests, configure ingress/cert-manager, add a
Prisma migration job, and validate storage classes and managed database/cache
connectivity in the target cluster.

```bash
kubectl apply -k infra/k8s
```

## Infrastructure layout

```text
infra/
├── docker/       # API/web images, production Compose, Nginx, DB-role setup
├── k8s/          # Kubernetes templates
├── monitoring/   # Prometheus/Grafana/Alertmanager stack
└── terraform/    # AWS infrastructure templates
```
