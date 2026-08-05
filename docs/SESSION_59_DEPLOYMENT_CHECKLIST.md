# WINDELS AI OS — Session 59 Runtime Validation Checklist
## Deployment & Verification Guide for Enterprise AI Operating System SDK

This checklist must be executed on any staging, pre-production, or production environment to verify the deployment of the Enterprise AI Operating System SDK.

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

### 7. Emulator Startup Tests
- [ ] Trigger start command for a custom agent emulator:
  ```bash
  curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
    -d '{"name":"my-agent-test-emu", "sdkKind":"agent", "port": 4210}' \
    http://localhost:4000/api/v1/sdk/emulators
  ```
  Verify response contains the starting state on port 4210.

### 8. Profiler Execution Tests
- [ ] Trigger profiler over an active workflow:
  ```bash
  curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
    -d '{"target":"workflow:support-pipeline"}' \
    http://localhost:4000/api/v1/sdk/profiler
  ```
  Verify response returns positive durations, cpu, memory usage, token metrics, and bottlenecks.

### 9. UI Smoke Tests
- [ ] Load the web app dashboard at `http://localhost:4173` in a browser.
- [ ] Navigate to the **Platform Admin Page** and select the **SDK** tab.
- [ ] Verify that CLI commands list (e.g. `windels auth login`, `windels agent create`) and Code Templates (e.g. `Hello Agent`, `Customer Support Workflow`) render correctly.

### 10. Performance Verification
- [ ] Verify profiler response is computed and returned in `< 10ms`.
- [ ] Verify Redis reads for package listings are completed in `< 5ms`.

### 11. Security Verification
- [ ] Verify that `/sdk/notes` endpoints require active session authentication.
- [ ] Attempt an unauthorized request to `/sdk/emulators`. Verify response is `401 Unauthorized`.
