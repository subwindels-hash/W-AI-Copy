# WINDELS AI OS — CORE MODULE DEEP-DIVE

**Version:** 4.0  
**Date:** 2026-08-07  
**Status:** AUTHORITATIVE  

---

## MODULE: AUTH

### PURPOSE
User authentication, JWT issuance, session management, password handling.

### WHAT BELONGS INSIDE
- User registration (email/password)
- Login/logout flows
- JWT token issuance (access + refresh tokens)
- Password hashing (bcrypt)
- Email verification (when SMTP configured)
- Password reset flow
- `/auth/me` self-service endpoint
- Basic profile management

### WHAT DOES NOT BELONG
- ❌ MFA/TOTP logic → belongs to `mfa` module
- ❌ OAuth flows (Google, etc.) → belongs to `auth` OAuth submodule or separate `sso`
- ❌ Organization/workspace creation → belongs to `enterpriseFoundation`
- ❌ Role/permission checks → belongs to `permissions` service
- ❌ Session management beyond JWT → Redis handles sessions

### DEPENDENCIES
- `permissions` (for role assignment on registration)
- `enterpriseFoundation` (for org/workspace creation on first user)

### INTEGRATIONS
- Google OAuth (optional, via auth OAuth submodule)
- SMTP (optional, for email verification)

### AI AGENTS
None (infrastructure service)

### DATABASE/SERVICES
- **PostgreSQL:** `User`, `UserProfile` tables
- **Redis:** Session tokens, rate limit counters
- **Services:** `services/auth.service.ts`, `security/passwords.ts`
- **Routes:** `apps/api/src/http/routes/auth.ts`, `apps/api/src/http/routes/me.ts`, `apps/api/src/http/routes/profile.ts`

### STATUS
🟢 **COMPLETE** — Core auth flows working, JWT issued, login/logout functional

---

## MODULE: MFA (S116)

### PURPOSE
Multi-factor authentication, TOTP verification, assurance policies, compliance reporting.

### WHAT BELONGS INSIDE
- TOTP enrollment/enable
- TOTP verification/challenge
- Recovery codes (generate, use, regenerate)
- MFA policies (org-level enforcement)
- Assurance summary/gaps reporting
- Coverage reporting (who has MFA enabled)
- Enrollment lifecycle (abandon path)
- Locks/throttle management
- Exemptions management
- MFA event audit log

### WHAT DOES NOT BELONG
- ❌ Password authentication → belongs to `auth`
- ❌ OAuth flows → belongs to `auth`
- ❌ General security incidents → belongs to `security`
- ❌ User management → belongs to `auth`

### DEPENDENCIES
- `auth` (for user identity)
- `security` (for incident reporting)

### INTEGRATIONS
None (self-contained TOTP implementation)

### AI AGENTS
None

### DATABASE/SERVICES
- **PostgreSQL:** MFA enrollments, recovery codes, policies, events
- **Redis:** TOTP secrets (encrypted), throttle counters, session challenges
- **Services:** `services/mfa.service.ts`, `mfa/mfaAssurance.service.ts`
- **Routes:** `apps/api/src/http/routes/mfa.ts`, `apps/api/src/http/routes/mfaAssurance.ts`
- **Shared:** `packages/shared/src/mfa.ts` (655 LOC)

### STATUS
🟢 **COMPLETE** — TOTP RFC 6238 working, policies enforced, assurance reporting functional

---

## MODULE: KERNEL (S39)

### PURPOSE
AI provider registry, event bus dispatch, prompt guard, AI request orchestration.

### WHAT BELONGS INSIDE
- AI provider registry (OpenAI, Anthropic, Ollama, Echo fallback)
- Provider credential management
- Model selection/resolution
- Prompt injection scanning (`scanPrompt`)
- Event bus dispatch to subscribers
- AI request logging (token usage, cost tracking)
- Failover logic between providers
- `AI_REQUIRE_REAL_MODEL` enforcement
- Echo fallback with `[DEMO RESPONSE]` banner

### WHAT DOES NOT BELONG
- ❌ Agent lifecycle → belongs to `agents`
- ❌ Agent communication → belongs to `agentComm`
- ❌ Provider market/registry UI → belongs to `aiPlatform`
- ❌ Trust/explainability scoring → belongs to `aiPlatform`
- ❌ GPU capacity tracking → belongs to `aiEconomy`

### DEPENDENCIES
None (foundational service)

### INTEGRATIONS
- OpenAI API (optional, `OPENAI_API_KEY`)
- Anthropic API (optional, `ANTHROPIC_API_KEY`)
- Ollama (optional, local, `OLLAMA_BASE_URL` + `OLLAMA_MODEL`)

### AI AGENTS
None (provides AI to agents — this is the orchestration layer)

### DATABASE/SERVICES
- **Redis:** Event bus (Pub/Sub), request tracking, rate limits
- **Services:** `services/ai/registry.ts`, `kernel/kernel.service.ts`
- **Routes:** `apps/api/src/http/routes/kernel.ts`, `apps/api/src/http/routes/ai.ts`
- **Shared:** `packages/shared/src/kernel.ts`, `packages/shared/src/ai.ts`

### STATUS
🟢 **COMPLETE** — Provider registry working, prompt guard active, failover functional

---

## MODULE: SECURITY

### PURPOSE
Security posture management, incident reporting, encryption, PII redaction, rate limiting, self-test diagnostics.

### WHAT BELONGS INSIDE
- Security scorecard (aggregate security posture)
- Self-test diagnostics
- Prompt guard scan endpoint (standalone)
- Password strength checker
- Breaker management (rate limit breakers)
- Rate limit status
- Security events log
- Encryption key status/rotation
- Incident reporting (create, update, list)
- Access reviews (run, latest)
- PII redaction service
- AES-256-GCM encryption utilities
- CSRF protection

### WHAT DOES NOT BELONG
- ❌ MFA enrollment → belongs to `mfa`
- ❌ General audit logs → would belong to centralized `audit` service (🟣 NEW)
- ❌ Infrastructure alerts → belongs to `infrastructure`
- ❌ OpEx safety alerts → belongs to `opex`
- ❌ Permission checks → belongs to `permissions`

### DEPENDENCIES
- `mfa` (for MFA-related security events)
- `audit` (🟣 PLANNED: centralized audit logging)

### INTEGRATIONS
None

### AI AGENTS
None

### DATABASE/SERVICES
- **PostgreSQL:** Incidents, access review results
- **Redis:** Rate limit windows, breaker state, PII cache
- **Services:** 
  - `security/encryption.ts`
  - `security/promptGuard.ts`
  - `security/piiRedact.ts`
  - `security/rateLimit.ts`
  - `security/selfTest.ts`
  - `security/reliability.ts`
  - `security/governance.service.ts`
- **Routes:** `apps/api/src/http/routes/security.ts`
- **Shared:** `packages/shared/src/security.ts`

### STATUS
🟢 **COMPLETE** — Core security services working, PII redaction active, encryption implemented

---

## MODULE: PERMISSIONS (🟡 FORMALIZED)

### PURPOSE
Centralized RBAC, permission checks, role management, permission catalog.

### WHAT BELONGS INSIDE
- Permission definitions (all available permissions)
- Role-permission mappings (SUPER_ADMIN, ADMIN, USER)
- `hasPermission(user, permission)` check
- Role assignment (user-level)
- Permission inheritance rules
- Admin console for role management
- Permission catalog by category

### WHAT DOES NOT BELONG
- ❌ Authentication → belongs to `auth`
- ❌ Org scoping → belongs to `tenantIsolation`
- ❌ API key scoping → belongs to `apikey`
- ❌ Resource-level permissions → would be in resource-specific modules

### DEPENDENCIES
- `auth` (for user identity)

### INTEGRATIONS
None

### AI AGENTS
None

### DATABASE/SERVICES
- **PostgreSQL:** `RolePermission`, `UserPermission` tables (existing)
- **Services:** `services/permissions.service.ts` (existing, formalized)
- **Module:** `apps/api/src/permissions/permissions.module.ts`
- **Routes:** `apps/api/src/http/routes/permissions.ts`
- **Shared:** `packages/shared/src/permissions.ts`

### STATUS
🟡 **PARTIAL** — Permission checks exist and work, module formalization complete

---

## MODULE: AUDIT (🟣 NEW)

### PURPOSE
Centralized audit logging across all modules, query/export/compliance.

### WHAT BELONGS INSIDE
- Audit event ingestion (from all modules)
- Audit event query/filter (by action, user, date, resource)
- Audit retention policies
- Export audit trails (JSON/CSV)
- Compliance reporting
- Statistics by action type

### WHAT DOES NOT BELONG
- ❌ Security incidents → belongs to `security` (but mirrored to audit)
- ❌ MFA events → belongs to `mfa` (but mirrored to audit)
- ❌ Application data → belongs to respective modules

### DEPENDENCIES
None (foundational)

### INTEGRATIONS
None

### AI AGENTS
None

### DATABASE/SERVICES
- **PostgreSQL:** `AuditLog` table (existing)
- **Redis:** Recent audit log cache, delivery queues
- **Services:** `apps/api/src/audit/audit.service.ts`
- **Routes:** `apps/api/src/http/routes/audit.ts`
- **Shared:** `packages/shared/src/audit.ts`

### STATUS
🟢 **COMPLETE (NEW)** — Service created, routes registered, uses existing AuditLog table

---

## MODULE: NOTIFICATIONS (🟣 NEW)

### PURPOSE
Multi-channel notification delivery (in-app, push, email, SMS), preferences management.

### WHAT BELONGS INSIDE
- Notification preferences per user per category
- Channel adapters (in-app, push, email, SMS)
- Notification templates
- Delivery tracking
- Delivery queue processing
- Unread count
- Mark as read / mark all as read
- Dismiss notification

### WHAT DOES NOT BELONG
- ❌ Chat messages → belongs to `conversations`
- ❌ Voice messages → belongs to `talk`
- ❌ Billing invoices → belongs to `billing` (but can trigger notifications)
- ❌ System logs → belongs to `audit`

### DEPENDENCIES
- `mobile` (for push notifications)
- `auth` (for user preferences)

### INTEGRATIONS
- Email SMTP (🟡 TODO)
- Push notification services (FCM, APNS) (via mobile module)
- SMS providers (Twilio, etc.) (🟡 TODO)

### AI AGENTS
None

### DATABASE/SERVICES
- **PostgreSQL:** `Notification` (existing), `NotificationPreference` (🆕 NEW)
- **Redis:** Delivery queues, real-time counters
- **Services:** `apps/api/src/notifications/notifications.service.ts`
- **Routes:** `apps/api/src/http/routes/notifications.ts`
- **Shared:** `packages/shared/src/notifications.ts`

### STATUS
🟢 **COMPLETE (NEW)** — Service created, routes registered, in-app notifications working, push/email/SMS stubs ready

---

## SUMMARY: CORE LAYER

| Module | Status | Purpose | Key Files |
|--------|--------|---------|-----------|
| `auth` | 🟢 COMPLETE | Authentication, JWT, sessions | `services/auth.service.ts`, `routes/auth.ts` |
| `mfa` (S116) | 🟢 COMPLETE | TOTP, policies, assurance | `services/mfa.service.ts`, `mfaAssurance.service.ts` |
| `kernel` (S39) | 🟢 COMPLETE | AI provider registry, event bus, prompt guard | `services/ai/registry.ts`, `kernel.service.ts` |
| `security` | 🟢 COMPLETE | Encryption, PII, incidents, rate limits | `security/*.ts`, `routes/security.ts` |
| `permissions` | 🟡 PARTIAL | RBAC, permission checks | `permissions.module.ts`, `routes/permissions.ts` |
| `audit` | 🟢 COMPLETE (NEW) | Centralized audit logging | `audit.service.ts`, `routes/audit.ts` |
| `notifications` | 🟢 COMPLETE (NEW) | Multi-channel notifications | `notifications.service.ts`, `routes/notifications.ts` |

---

**END OF CORE MODULE DOCUMENTATION**
