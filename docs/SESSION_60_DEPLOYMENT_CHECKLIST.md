# WINDELS AI OS — Session 60 Runtime Validation Checklist
## Deployment & Verification Guide for Enterprise AI Training & Fine-Tuning Platform

This checklist must be executed on any staging, pre-production, or production environment to verify the deployment of the Enterprise AI Training & Fine-Tuning Platform.

---

### 1. Build Verification
- [ ] Pull latest branch `arena/019fce88-win`.
- [ ] Run `pnpm install` to download dependencies.
- [ ] Generate the Prisma client:
  ```bash
  pnpm db:generate
  ```
- [ ] Run `pnpm build` to compile both backend and frontend applications. Verify exit code is `0`.

### 2. Database Migrations
- [ ] Apply pending migrations to the PostgreSQL database:
  ```bash
  pnpm db:migrate
  ```
- [ ] Seed base database records:
  ```bash
  pnpm db:seed
  ```

### 3. Environment Configuration
- [ ] Ensure `.env` is loaded with correct variables:
  - `DATABASE_URL` (PostgreSQL 17 connection string)
  - `REDIS_URL` (Redis 8 connection string)
  - `NODE_ENV=production`
  - `API_PORT=4000`

### 4. Service Startup
- [ ] Start the backend API server process:
  ```bash
  node apps/api/dist/index.js
  ```
- [ ] Start the frontend Vite preview server:
  ```bash
  cd apps/web && npx vite preview --host 127.0.0.1 --port 4173
  ```
- [ ] Verify that ports `4000` and `4173` are open and listening.

### 5. API Health Checks
- [ ] Perform local API liveness check:
  ```bash
  curl -I http://localhost:4000/api/v1/health
  ```
  Verify response is `200 OK` and status is `"ok"`.

### 6. Authentication Tests
- [ ] Authenticate with the default superadmin credentials:
  ```bash
  curl -X POST -H "Content-Type: application/json" \
    -d '{"email":"admin@windels.ai","password":"W1ndels!Admin#2026"}' \
    http://localhost:4000/api/v1/auth/login
  ```
  Verify response contains a valid JWT access token.

### 7. Dataset Creation Tests
- [ ] Create a new training dataset:
  ```bash
  curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
    -d '{"name":"Customer Feedback Corpus", "format":"jsonl", "rows":5000, "cleaned":true}' \
    http://localhost:4000/api/v1/training/datasets
  ```
  Verify response contains the dataset ID.

### 8. Fine-Tuning Job Creation
- [ ] Trigger a fine-tuning job with LoRA:
  ```bash
  curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
    -d '{"name":"customer-feedback-lora-run", "baseModel":"Aria-7B", "datasetId":"<DATASET_ID>", "strategy":"lora", "hyperparams":{"lr":0.0002, "epochs":3, "batchSize":16}}' \
    http://localhost:4000/api/v1/training/jobs
  ```
  Verify job is queued successfully.

### 9. UI Smoke Tests
- [ ] Load the web app dashboard at `http://localhost:4173` in a browser.
- [ ] Navigate to the **Platform Admin Page** and select the **Training** tab.
- [ ] Verify that the stats counters (Datasets, Jobs Running, Safety Pass, Cost) render correctly.

### 10. Performance Verification
- [ ] Verify dashboard rollup metrics are loaded and computed in `< 10ms`.
- [ ] Verify Redis reads for job lists are completed in `< 5ms`.

### 11. Security Verification
- [ ] Verify that `/training/notes` and `/training/jobs` require active token authentication.
- [ ] Attempt an unauthorized request to `/training/jobs`. Verify response is `401 Unauthorized`.
