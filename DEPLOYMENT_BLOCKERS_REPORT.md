# DEPLOYMENT BLOCKERS REPORT — WINDELS AI OS

> **⚠️ SUPERSEDED (2026-07-31).** This report has drifted from the code. Its
> §1.1 (MFA form) and §1.2 (S84/S85 frontends) describe blockers that **are
> already implemented** — verified by reading the source, not the changelog.
> See **[AUDIT-REPORT.md](./AUDIT-REPORT.md)** for the corrected, evidence-based
> status. Retained for history.

**Date:** 2026-07-28  
**Scope:** Sessions 1–88 Infrastructure and Key Blockades  

This document logs every infrastructural blocker preventing a production launch of WINDELS AI OS, outlining severity, operational impact, root causes, and estimated effort to resolve.

---

## 1. COMPREHENSIVE REGISTRY OF PRODUCTION BLOCKERS

The following concerns block immediate deployment to live environments:

### 1.1 Blocker 1: Missing MFA Front-End Token Form
*   **Classification**: **Development Issue**
*   **Severity**: **CRITICAL**
*   **Impact**: Prevents users with multi-factor authentication (MFA) enabled from logging in, resulting in absolute lockout.
*   **Root Cause**: The API router (`apps/api/src/http/routes/auth.ts`) returns `mfaRequired: true` when a user attempts to log in with correct password credentials if MFA is configured. The login page (`apps/web/src/pages/auth/LoginPage.tsx`) does not handle this challenge state, nor does any component exist to input the 6-digit passcode.
*   **Evidence**:
    ```typescript
    // apps/api/src/http/routes/auth.ts
    if (user.mfaEnabled) {
      const mfaToken = await AuthService.generateMfaChallenge(user.id);
      return res.json({ ok: true, data: { mfaRequired: true, mfaToken } });
    }
    ```
    And no search matches exist for MFA input form components inside `apps/web/src/pages/auth/`.
*   **Recommended Fix**: Implement a conditional screen inside the login UI that captures and posts the TOTP challenge token:
    ```bash
    POST /api/v1/auth/mfa/complete { mfaToken: string, code: string }
    ```
*   **Estimated Effort**: **3 Hours**

---

### 1.2 Blocker 2: Missing Front-End Interfaces for Sessions 84 & 85
*   **Classification**: **Development Issue**
*   **Severity**: **HIGH**
*   **Impact**: Users cannot utilize the newly introduced Project Import or AI Lead Discovery systems from the web shell.
*   **Root Cause**: While API routes are registered under `/api/v1/projectContinuity` and `/api/v1/leadDiscovery`, no corresponding frontend routing or TSX components exist in `apps/web/src/pages/`.
*   **Evidence**:
    `apps/web/src/router.tsx` does not define routes or import components for project Continuity or Lead Discovery panels.
*   **Recommended Fix**: Create visual search interfaces, file dropzones, and collection viewers in `apps/web/src/pages/admin/` linking to the backend endpoints.
*   **Estimated Effort**: **5 Days**

---

### 1.3 Blocker 3: Lack of Swappable AI API Key Configuration
*   **Classification**: **Infrastructure Issue**
*   **Severity**: **HIGH**
*   **Impact**: The entire AI agent swarm and messaging modules fallback to a local mock text generator (`modelSource: "echo-demo"`).
*   **Root Cause**: Environment variables `OPENAI_API_KEY` or local `OLLAMA_BASE_URL` are not defined in the active environment.
*   **Evidence**:
    `apps/api/src/services/ai/registry.ts` checks for active model keys and invokes the `EchoProvider` when keys are undefined:
    ```typescript
    if (!process.env.OPENAI_API_KEY && !process.env.OLLAMA_BASE_URL) {
      return this.providers.get("echo");
    }
    ```
*   **Recommended Fix**: Populate a valid, billing-active `OPENAI_API_KEY` inside `.env` on startup, or set `AI_REQUIRE_REAL_MODEL=true` to enforce strict model compliance.
*   **Estimated Effort**: **1 Hour**

---

### 1.4 Blocker 4: Unapplied DB Schema Migrations
*   **Classification**: **Infrastructure Issue**
*   **Severity**: **HIGH**
*   **Impact**: Starting the production server against an unmigrated DB results in runtime exceptions due to missing tables.
*   **Root Cause**: Eight migration scripts in `apps/api/prisma/migrations/` have not been executed.
*   **Evidence**:
    `prisma migrate status` reveals unapplied migration steps.
*   **Recommended Fix**: Execute the database migration script before launching the container:
    ```bash
    DATABASE_URL=postgresql://... npx prisma migrate deploy
    ```
*   **Estimated Effort**: **1 Hour**

---

### 1.5 Blocker 5: Lack of Active Cluster Orchestration
*   **Classification**: **Infrastructure Issue**
*   **Severity**: **MEDIUM**
*   **Impact**: Deploying to production without active nodes results in high latency, lack of horizontal auto-scaling, and single points of failure.
*   **Root Cause**: Kubernetes configurations in `infra/k8s/` and Terraform scripts in `infra/terraform/` have not been run against a live cloud console (AWS/GCP).
*   **Evidence**:
    Configurations exist as static files, but no active endpoints or clusters are active in this workspace.
*   **Recommended Fix**: Configure AWS/GCP administrative credentials and execute:
    ```bash
    terraform apply
    kubectl apply -k infra/k8s/
    ```
*   **Estimated Effort**: **2 Days**
