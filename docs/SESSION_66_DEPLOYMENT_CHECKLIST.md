# WINDELS AI OS — Session 66 Runtime Validation Checklist
## Deployment & Verification Guide for Enterprise Legal Intelligence Suite

This checklist must be executed on any staging, pre-production, or production environment to verify the deployment of the Enterprise Legal Intelligence Suite.

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

### 7. Contract and Case Management
- [ ] Create a new Litigation Matter:
  ```bash
  curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
    -d '{"title":"NDA breach inquiry", "kind":"ip", "riskScore":45, "summary":"Evaluating potential leak of proprietary fine-tuning dataset."}' \
    http://localhost:4000/api/v1/legal/matters
  ```
  Verify response contains the matter ID and status `"open"`.

### 8. Legal Research Dispatch
- [ ] Submit a legal research query:
  ```bash
  curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
    -d '{"query":"EU AI Act general purpose model obligations"}' \
    http://localhost:4000/api/v1/legal/research
  ```
  Verify research item is created.

### 9. UI Smoke Tests
- [ ] Load the web app dashboard at `http://localhost:4173` in a browser.
- [ ] Navigate to the **Legal Suite** page in the sidebar.
- [ ] Verify that the stats counters (Open Matters, Expiring Contracts, Compliance Pass Rate) are correctly rendered.

### 10. Performance Verification
- [ ] Verify dashboard rollup metrics are loaded and computed in `< 10ms`.
- [ ] Verify Redis reads for legal matters are completed in `< 5ms`.

### 11. Security Verification
- [ ] Attempt an unauthorized request to `/legal/dashboard/rollup`. Verify response is `401 Unauthorized`.
