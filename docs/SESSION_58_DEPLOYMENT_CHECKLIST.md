# WINDELS AI OS — Session 58 Runtime Validation Checklist
## Deployment & Verification Guide for Enterprise Spatial Computing Platform

This checklist must be executed on any staging, pre-production, or production environment to verify the deployment of the Enterprise Spatial Computing Platform.

---

### 1. Build Verification
- [ ] Pull latest branch `arena/019fce88-win`.
- [ ] Run `pnpm install` to download dependencies.
- [ ] Generate the Prisma client using:
  ```bash
  pnpm db:generate
  ```
  *(For offline builds, run `pnpm db:generate:offline`)*
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
  - `JWT_SECRET` (Secure 32-byte secret)
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
- [ ] Perform deep dependency readiness probe:
  ```bash
  curl http://localhost:4000/api/v1/health/deep
  ```
  Verify `"db"` and `"cache"` checks are reported as `"ok"`.

### 6. Authentication Tests
- [ ] Authenticate with the default superadmin credentials:
  ```bash
  curl -X POST -H "Content-Type: application/json" \
    -d '{"email":"admin@windels.ai","password":"W1ndels!Admin#2026"}' \
    http://localhost:4000/api/v1/auth/login
  ```
  Verify response contains a valid JWT access token.

### 7. Workflow Execution Tests
- [ ] Trigger an automated workflow or process:
  ```bash
  curl -H "Authorization: Bearer <TOKEN>" http://localhost:4000/api/v1/workflows
  ```
  Verify that workflow configurations can be retrieved and executed.

### 8. AI Execution Tests
- [ ] Trigger a test inference query through the AI Kernel:
  ```bash
  curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
    -d '{"prompt":"Hello assistant"}' \
    http://localhost:4000/api/v1/ai/chat
  ```
  Verify response is received without errors.

### 9. UI Smoke Tests
- [ ] Load the web app dashboard at `http://localhost:4173` in a browser.
- [ ] Verify the sidebar is loaded and navigate to the **Platform Admin Page** (`/admin/platform`).
- [ ] Open the **Spatial Computing** tab and ensure the stats counters (Active Sessions, Waypoints, Devices Online) are rendered.

### 10. End-to-End User Journeys (Session 58)
- [ ] **Launch Spatial Session**:
  - Open the Spatial Computing dashboard.
  - Fill in a Title (e.g. `"Emergency Factory Drift Walkthrough"`), select a Mode (e.g. `"mr"`), and a Target Device (e.g. `"hololens"`).
  - Click **Launch**.
  - Verify that the session is added to the "Spatial Sessions" table and reports a `"streaming"` status.
- [ ] **End Spatial Session**:
  - Find the newly launched session.
  - Click **End Session**.
  - Verify that the session status is updated to `"idle"` and an end timestamp is registered.

### 11. Performance Verification
- [ ] Verify average dispatch latency of the God-Node Orchestrator (`KernelService` events) is `< 10ms`.
- [ ] Verify Redis key reads/writes are completed in `< 5ms`.

### 12. Security Verification
- [ ] Attempt an unauthorized request to `/spatial/sessions` without a bearer token. Verify response is `401 Unauthorized`.
- [ ] Verify that rate-limiting headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`) are present on all endpoints in production mode.
