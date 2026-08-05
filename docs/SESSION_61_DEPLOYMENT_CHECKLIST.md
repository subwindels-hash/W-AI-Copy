# WINDELS AI OS — Session 61 Runtime Validation Checklist
## Deployment & Verification Guide for Enterprise Data & Knowledge Marketplace

This checklist must be executed on any staging, pre-production, or production environment to verify the deployment of the Enterprise Data & Knowledge Marketplace.

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

### 7. Asset Verification
- [ ] List all published marketplace assets:
  ```bash
  curl -H "Authorization: Bearer <TOKEN>" \
    http://localhost:4000/api/v1/data-marketplace/assets
  ```
  Verify response returns the standard seeded dataset catalog.

### 8. Access Control Checks
- [ ] Attempt to verify access on a paid licensed dataset before installing:
  ```bash
  curl -H "Authorization: Bearer <TOKEN>" \
    http://localhost:4000/api/v1/data-marketplace/assets/<PAID_ASSET_ID>/access
  ```
  Verify response `allowed` is `false` and reason is `"no_active_license_install"`.
- [ ] Install the paid dataset:
  ```bash
  curl -X POST -H "Authorization: Bearer <TOKEN>" \
    http://localhost:4000/api/v1/data-marketplace/assets/<PAID_ASSET_ID>/install
  ```
- [ ] Re-verify access:
  ```bash
  curl -H "Authorization: Bearer <TOKEN>" \
    http://localhost:4000/api/v1/data-marketplace/assets/<PAID_ASSET_ID>/access
  ```
  Verify response `allowed` is `true`.

### 9. UI Smoke Tests
- [ ] Load the web app dashboard at `http://localhost:4173` in a browser.
- [ ] Navigate to the **Data Marketplace** page in the sidebar.
- [ ] Verify that categories, featured publishers, and hot products are rendered on the dashboard.

### 10. Performance Verification
- [ ] Verify licensing check queries (`checkAccess()`) are completed in `< 5ms`.
- [ ] Verify Redis reads for asset catalogs are completed in `< 5ms`.

### 11. Security Verification
- [ ] Attempt an unauthorized request to `/data-marketplace/assets`. Verify response is `401 Unauthorized`.
