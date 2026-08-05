# WINDELS AI OS — Session 62 Runtime Validation Checklist
## Deployment & Verification Guide for Enterprise Digital Human Platform

This checklist must be executed on any staging, pre-production, or production environment to verify the deployment of the Enterprise Digital Human Platform.

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

### 7. Avatar Customization & Creation
- [ ] Register a new custom digital human avatar:
  ```bash
  curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
    -d '{"name":"Prof. Alexander - AI Trainer", "role":"ai_trainer", "gender":"masculine", "style":"realistic", "voiceId":"vf-cloned-alexander"}' \
    http://localhost:4000/api/v1/digital-humans
  ```
  Verify response contains the avatar details with status `"training"`.

### 8. Interactive Session Verification
- [ ] Start an interactive call with a pre-seeded receptionist avatar:
  ```bash
  curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
    -d '{"language":"es"}' \
    http://localhost:4000/api/v1/digital-humans/<RECEPIENT_AVATAR_ID>/sessions
  ```
  Verify session is initiated with status `"live"`.

### 9. UI Smoke Tests
- [ ] Load the web app dashboard at `http://localhost:4173` in a browser.
- [ ] Navigate to the **Digital Humans** page in the sidebar.
- [ ] Verify that the stats counters (Total Avatars, Satisfaction Rate, Supported Languages) are correctly rendered.

### 10. Performance Verification
- [ ] Verify dashboard rollup metrics are loaded and computed in `< 10ms`.
- [ ] Verify Redis reads for avatar configurations are completed in `< 5ms`.

### 11. Security Verification
- [ ] Attempt an unauthorized request to `/digital-humans`. Verify response is `401 Unauthorized`.
