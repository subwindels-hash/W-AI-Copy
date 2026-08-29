# WINDELS AI OS — Kubernetes manifests

Production manifests for deploying WINDELS to a Kubernetes cluster.

## Prerequisites

- Cluster with `nginx-ingress` controller installed
- `cert-manager` installed (for LetsEncrypt TLS) with a `letsencrypt-prod` ClusterIssuer
- `metrics-server` (for HPA)
- Container registry with images (`ghcr.io/<owner>/windels:tag`, `:tag-web`)

## Quick start (staging)

```sh
kubectl create namespace windels
# Create required secrets first
kubectl create secret generic windels-secrets -n windels \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=DATABASE_URL="postgresql://windels:<password>@windels-postgres:5432/windels" \
  --from-literal=REDIS_URL="redis://:<password>@windels-redis:6379" \
  --from-literal=BOOTSTRAP_SUPERADMIN_PASSWORD="ChangeMe!234" \
  --from-literal=ENCRYPTION_KEY="$(openssl rand -hex 32)"

kubectl create secret generic windels-db-credentials -n windels \
  --from-literal=POSTGRES_USER=windels \
  --from-literal=POSTGRES_PASSWORD="<db-password>"

# Deploy
kubectl apply -k .

# Roll status
kubectl rollout status deployment/windels-api -n windels
kubectl rollout status deployment/windels-web -n windels
```

## Rolling update

```sh
kustomize edit set image ghcr.io/windels-ai/windels=ghcr.io/<owner>/windels:<sha>
kustomize edit set image ghcr.io/windels-ai/windels-web=ghcr.io/<owner>/windels-web:<sha>
kubectl apply -k .
```

## Scaling

- API HPA: 2–10 replicas, target 70% CPU / 75% memory
- Web HPA: 2–6 replicas, target 70% CPU
- Postgres is a single-instance StatefulSet (use a managed Postgres (RDS/Cloud SQL) in production)

## What's deployed

| Workload      | Type         | Replicas | PVC   | Purpose                         |
|---------------|-------------|---------:|-------|---------------------------------|
| windels-api   | Deployment   |    2–10  | —     | Node/Express API                |
| windels-web   | Deployment   |     2–6  | —     | nginx static + /api proxy       |
| windels-postgres | StatefulSet | 1 | 20Gi | PostgreSQL 16                   |
| windels-redis | Deployment   |       1  | 5Gi   | Redis 7 (AOF)                   |

## Production recommendations

1. **Do not run Postgres in-cluster** — use AWS RDS, GCP Cloud SQL, Azure Flexible Postgres, or a managed Postgres operator (CloudNativePG, Zalando).
2. **Use external Redis** (ElastiCache/Memorystore) for HA.
3. **Network policies** to restrict pod-to-pod traffic (add NetworkPolicy resources before promoting to prod).
4. **PodDisruptionBudgets** for API/Web at 50% minAvailable.
5. **Pod Security Standards**: set `restricted` PSA at the namespace level.
6. **Secrets**: use SealedSecrets, External Secrets Operator (Vault/SSM), or your cloud's native secret manager.
