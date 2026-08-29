# ── WINDELS AI OS — Makefile (Session 17) ──────────────────────────────────
# Convenience wrappers for pnpm, docker, kubectl, k6, playwright.

SHELL := /bin/bash
PNPM  := pnpm
COMPOSE := docker compose -f docker-compose.yml
COMPOSE_PROD := docker compose --env-file .env.server -f infra/docker/docker-compose.prod.yml
K8S := infra/k8s
KUSTOMIZE := kubectl

.PHONY: help dev build clean typecheck test test-unit test-e2e test-load lint verify \
        db-migrate db-seed db-reset \
        docker-build docker-up docker-down docker-dev \
        monitoring-up monitoring-down \
        k8s-apply k8s-delete \
        deploy logs seed restart restart-api restart-web

help: ## Show targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Local dev ──────────────────────────────────────────────────────────────
dev: ## Start postgres + redis + api + web in dev mode (parallel turbo)
	$(COMPOSE) up -d postgres redis
	$(PNPM) dev

build: ## Build all packages via turbo
	$(PNPM) build

clean: ## Remove build outputs
	$(PNPM) clean

typecheck: ## Run TS typecheck across all packages
	$(PNPM) typecheck

lint: ## Run linters
	$(PNPM) lint

# ── DB ─────────────────────────────────────────────────────────────────────
db-migrate: ## Run prisma migrations
	DATABASE_URL="postgresql://windels:windels@localhost:5432/windels" $(PNPM) db:migrate

db-seed: ## Run prisma seed
	DATABASE_URL="postgresql://windels:windels@localhost:5432/windels" $(PNPM) db:seed

db-reset: ## Reset dev DB (drop + migrate + seed)
	cd apps/api && DATABASE_URL="postgresql://windels:windels@localhost:5432/windels" npx prisma migrate reset --force
	$(MAKE) db-seed

# ── Tests ──────────────────────────────────────────────────────────────────
test: test-unit ## Run all tests
test-unit: ## Unit / integration (vitest)
	$(PNPM) test

verify: ## Full offline gate: prisma client + build + typecheck + test (no DB/Redis needed)
	$(PNPM) db:generate:offline
	$(PNPM) build
	$(PNPM) typecheck
	$(PNPM) test

test-e2e: ## Playwright E2E (requires built web + running API)
	$(PNPM) exec playwright test

test-e2e-ui:
	$(PNPM) exec playwright test --ui

test-load: ## k6 load test (health endpoint, default VUs=20/30s)
	BASE_URL="http://localhost:4000/api/v1" k6 run tests/load/health-get.js

test-load-chat: ## k6 load test against chat endpoint (requires AUTH_TOKEN)
	BASE_URL="http://localhost:4000/api/v1" k6 run tests/load/chat-streams.js

# ── Docker ─────────────────────────────────────────────────────────────────
docker-build: ## Build production images
	docker build -f infra/docker/Dockerfile.api -t ghcr.io/$(shell git config --get user.name 2>/dev/null || windels)/windels:dev .
	docker build -f infra/docker/Dockerfile.web -t ghcr.io/$(shell git config --get user.name 2>/dev/null || windels)/windels-web:dev .

docker-dev: ## Start local PG + redis via docker
	$(COMPOSE) up -d postgres redis

docker-up: ## Build and start the single-server production stack
	@test -f .env.server || (echo "Copy .env.server.example to .env.server and configure it first" >&2; exit 1)
	$(COMPOSE_PROD) up -d --build

docker-down: ## Stop production stack
	$(COMPOSE_PROD) down

# ── Monitoring ─────────────────────────────────────────────────────────────
monitoring-up: ## Start prometheus + grafana + alertmanager + node-exporter
	docker compose -f infra/monitoring/docker-compose.monitoring.yml up -d

monitoring-down:
	docker compose -f infra/monitoring/docker-compose.monitoring.yml down

# ── Kubernetes ─────────────────────────────────────────────────────────────
k8s-apply: ## Apply k8s manifests
	$(KUSTOMIZE) apply -k $(K8S)

k8s-delete: ## Delete k8s manifests
	$(KUSTOMIZE) delete -k $(K8S)

k8s-roll: ## Roll restart api + web
	$(KUSTOMIZE) -n windels rollout restart deployment/windels-api
	$(KUSTOMIZE) -n windels rollout restart deployment/windels-web

# ── Local services ─────────────────────────────────────────────────────────
start: ## Start API + Vite dev in background
	@scripts/start-dev.sh

stop: ## Stop background API + Vite
	@pkill -f "node dist/index.js" || true
	@pkill -f "vite" || true

logs: ## Tail API logs
	@tail -f /tmp/api.log 2>/dev/null || echo "no /tmp/api.log"
