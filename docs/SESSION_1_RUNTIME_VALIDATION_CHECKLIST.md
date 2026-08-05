# SESSION 1 — RUNTIME VALIDATION CHECKLIST

**Owner:** Deployment / QA engineer (or next certified agent session)
**Applies to:** WINDELS AI OS, Session 1 (Auth Foundation)
**Status:** 🟡 NOT YET EXECUTED — this checklist must be run in the **target deployment
environment** (live PostgreSQL 17, Redis 8, Node 20/22, pnpm ≥9, and a reachable Prisma
engine download). It must pass before Session 1 is declared **PRODUCTION COMPLETE**.

> This sandbox cannot execute these steps: it has no reachable Postgres/Redis and the
> Prisma binary engine download is network-blocked. Do **not** substitute "passed in
> sandbox unit tests" for any row here — that would be fabricated completion.

---

## 0. Prerequisites
- `pnpm install` completed; Prisma engine downloadable on this host.
- `.env` populated: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (≥16 chars),
  `WINDELS_ENCRYPTION_KEY` (64 hex), `JWT_ISSUER`, `API_CORS_ORIGIN`, `LOG_LEVEL`.
- Target Postgres 17 + Redis 8 reachable.

## 1. Build verification
```bash
pnpm build            # all 4 workspaces build
pnpm typecheck        # 5/5 packages typecheck
```
- [ ] Build succeeds for `shared`, `api`, `web`, `desktop`.

## 2. Database migrations
```bash
cd apps/api && pnpm exec prisma generate && pnpm exec prisma migrate deploy
```
- [ ] `prisma generate` completes (no `Role`/`Permission` member errors afterwards).
- [ ] `migrate deploy` applies the `init` migration; `User/UserProfile/Organization/Workspace/Membership/AuditLog/RolePermission/UserPermission` tables exist.

## 3. Environment configuration
- [ ] API reaches Postgres (`DATABASE_URL`) and Redis (`REDIS_URL`); no fallback-to-mock warnings in logs.

## 4. Service startup & health
```bash
pnpm --filter @windels/api start
curl -fsS http://localhost:4000/healthz
```
- [ ] `/healthz` returns 200 `ok:true`.
- [ ] Role-permission seed runs at boot (`ensureRolePermissions`).

## 5. Authentication tests (curl-level)
- [ ] `POST /api/v1/auth/register` with a ≥10-char complex password → 201; first user role `super_admin`.
- [ ] Register duplicate email → 409 `CONFLICT`.
- [ ] Register with a weak (<10 char) password → 422 (policy enforced).
- [ ] `POST /api/v1/auth/login` → `token` + `refreshToken` + `user` (role/org).
- [ ] Wrong password and unknown email both return the identical generic message (no enumeration).
- [ ] Suspended user → 403 `Account is suspended`.
- [ ] `GET /api/v1/auth/me` (Bearer) → profile + organization/workspace.
- [ ] `POST /api/v1/auth/refresh` → new token; **replaying the consumed refresh token → 401**.
- [ ] `POST /api/v1/auth/logout` → refresh token invalidated.

## 6. RBAC verification (live DB)
- [ ] `hasPermission` matrix: super_admin has all 18 permissions (ADMIN_STAR); admin has billing/developer/audit; user lacks billing/developer/audit.
- [ ] Grant a user-level permission and confirm `listPermissions` reflects it; non-admin grant → 403.
- [ ] Cross-tenant: user in org A cannot read org B resources (orgScope enforced).

## 7. Workflow / AI execution tests
- [ ] (Session 1 has no workflows/AI agents; confirm auth-gated route 401s without a token.)

## 8. Frontend smoke & E2E journey
```bash
pnpm test:e2e --project=chromium   # auth.spec, smoke.spec, + others
```
- [ ] Register → login → role dashboard renders (`/app` for user, `/admin` for admin/super_admin).
- [ ] Logout clears session; refresh flow recovers a still-valid session without re-login.
- [ ] Login form starts empty (no prefilled demo credentials).

## 9. Performance verification
- [ ] Login + refresh each complete within budget (e.g. < 500 ms p95 with bcrypt cost 12).
- [ ] Rate limiter returns 429 after N rapid auth attempts.

## 10. Security verification
- [ ] Audit ledger rows exist for `user.register`, `user.login`, `user.logout`, `user.login.failed`, `user.login.rejected`.
- [ ] No password stored in plaintext (bcrypt `$2a$12$...` in DB).
- [ ] CSRF double-submit active on cookie-authed routes; `helmet` headers present.
- [ ] Failed-login audit entries do not leak whether the email exists.

## Sign-off
All boxes checked + recorded evidence (command outputs, DB queries) attached → Session 1
becomes **PRODUCTION COMPLETE**. Until then, status remains **🟡 VERIFIED (partial)**.
