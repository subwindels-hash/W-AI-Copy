-- Schema drift baseline
-- =====================
-- prisma/schema.prisma declared 65 models but prisma/migrations only ever
-- created 45 tables. The 20 models below existed solely in an untracked
-- .local/sql patch that no deploy path runs, so a clean database (CI, a new
-- staging box, a rebuilt prod) came up missing the tables that RBAC
-- permission storage, notifications, alerting, mobile/biometric auth, AI
-- request logging and health checks all query at runtime.
--
-- Verified at runtime before writing this migration: booting the API against
-- a real PostgreSQL 17 failed with
--   The table `public.ModelRegistry` does not exist in the current database
--   The table `public.Plugin` does not exist in the current database
--   The table `public.RolePermission` does not exist in the current database
-- during bootstrap seeding.
--
-- Everything here is guarded (IF NOT EXISTS / duplicate_object) so it is safe
-- on an existing database that already had the .local patch applied by hand —
-- it converges both a clean database and a patched one onto the same shape.
-- Foreign keys, which the .local patch omitted entirely, are added
-- conditionally so referential integrity is real rather than implied.

-- ── Enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "Permission" AS ENUM ('ORG_READ','ORG_WRITE','ORG_ADMIN','WORKFLOW_READ','WORKFLOW_WRITE','WORKFLOW_RUN','AGENT_READ','AGENT_WRITE','TALK_READ','TALK_WRITE','CANVAS_READ','CANVAS_WRITE','BILLING_READ','BILLING_WRITE','DEVELOPER_READ','DEVELOPER_WRITE','AUDIT_READ','ADMIN_STAR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AlertSeverity" AS ENUM ('INFO','WARNING','CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AlertChannel" AS ENUM ('EMAIL','WEBHOOK','IN_APP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AccessReviewStatus" AS ENUM ('PENDING','IN_PROGRESS','COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AccessItemStatus" AS ENUM ('PENDING','APPROVED','REVOKED','QUARANTINED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RetentionResource" AS ENUM ('MESSAGES','RUNS','LOGS','AUDIT','CONVERSATIONS','ATTACHMENTS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AuditAction" AS ENUM ('CREATE','UPDATE','DELETE','LOGIN','LOGIN_FAILED','LOGOUT','RUN','APPROVE','EXPORT','LOG','API_KEY_CREATE','API_KEY_REVOKE','WEBHOOK_CREATE','WEBHOOK_DELETE','SSO_UPDATE','INTEGRATION_CONNECT','PERMISSION_GRANT','PERMISSION_REVOKE','RETENTION_UPDATE','ALERT_CREATE','BACKUP_CREATE','USER_SUSPEND'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Columns added to existing tables (from .local/sql/01_alter_drift.sql) ──
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "whiteLabel" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "AuditLog"     ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "AuditLog"     ADD COLUMN IF NOT EXISTS "apiKeyId" TEXT;
ALTER TABLE "AuditLog"     ADD COLUMN IF NOT EXISTS "userAgent" TEXT;

-- ── AI model registry & request telemetry ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "ModelRegistry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "provider" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL DEFAULT '1.0',
  "description" TEXT,
  "capabilities" TEXT[] NOT NULL DEFAULT ARRAY['chat']::TEXT[],
  "contextWindow" INTEGER NOT NULL DEFAULT 128000,
  "maxOutputTokens" INTEGER NOT NULL DEFAULT 4096,
  "costInputPer1k" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costOutputPer1k" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModelRegistry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ModelRegistry_organizationId_idx" ON "ModelRegistry" ("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "ModelRegistry_organizationId_provider_modelId_version_key" ON "ModelRegistry" ("organizationId","provider","modelId","version");

CREATE TABLE IF NOT EXISTS "AiRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT,
  "agentId" TEXT,
  "conversationId" TEXT,
  "workflowRunId" TEXT,
  "channel" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "modelRegistryId" TEXT,
  "durationMs" INTEGER NOT NULL,
  "promptTokens" INTEGER NOT NULL DEFAULT 0,
  "completionTokens" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'succeeded',
  "error" TEXT,
  "feature" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiRequest_organizationId_createdAt_idx" ON "AiRequest" ("organizationId","createdAt");
CREATE INDEX IF NOT EXISTS "AiRequest_modelId_idx" ON "AiRequest" ("modelId");
CREATE INDEX IF NOT EXISTS "AiRequest_status_idx" ON "AiRequest" ("status");

-- ── Extensibility: plugins, integrations, SSO ─────────────────────────────
CREATE TABLE IF NOT EXISTS "Plugin" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "version" TEXT NOT NULL DEFAULT '1.0.0',
  "author" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB NOT NULL DEFAULT '{}',
  "hooks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Plugin_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Plugin_organizationId_idx" ON "Plugin" ("organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "Plugin_organizationId_slug_key" ON "Plugin" ("organizationId","slug");

CREATE TABLE IF NOT EXISTS "Integration" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}',
  "credentials" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'disconnected',
  "lastSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Integration_organizationId_type_idx" ON "Integration" ("organizationId","type");

CREATE TABLE IF NOT EXISTS "SsoConfig" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "entryPoint" TEXT,
  "issuer" TEXT,
  "cert" TEXT,
  "clientId" TEXT,
  "clientSecret" TEXT,
  "domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SsoConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SsoConfig_organizationId_key" ON "SsoConfig" ("organizationId");

-- ── RBAC permission storage ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RolePermission" (
  "id" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "permission" "Permission" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_role_permission_key" ON "RolePermission" ("role","permission");

CREATE TABLE IF NOT EXISTS "UserPermission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "permission" "Permission" NOT NULL,
  "resourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UserPermission_userId_idx" ON "UserPermission" ("userId");

-- ── Alerting & health ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AlertRule" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "condition" TEXT,
  "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
  "channels" "AlertChannel"[] NOT NULL DEFAULT ARRAY['IN_APP']::"AlertChannel"[],
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AlertRule_organizationId_idx" ON "AlertRule" ("organizationId");

-- NOTE: the abandoned .local patch defined "Alert" as a duplicate of
-- "AlertRule". The schema's real Alert is a fired-alert record; that is what
-- is created here.
CREATE TABLE IF NOT EXISTS "Alert" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ruleId" TEXT,
  "severity" "AlertSeverity" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT,
  "event" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "readAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Alert_organizationId_createdAt_idx" ON "Alert" ("organizationId","createdAt");
CREATE INDEX IF NOT EXISTS "Alert_readAt_idx" ON "Alert" ("readAt");

CREATE TABLE IF NOT EXISTS "HealthCheck" (
  "id" TEXT NOT NULL,
  "service" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "latencyMs" INTEGER,
  "details" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HealthCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HealthCheck_service_createdAt_idx" ON "HealthCheck" ("service","createdAt");

-- ── Data export (GDPR/portability) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "DataExport" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "downloadUrl" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "DataExport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DataExport_organizationId_idx" ON "DataExport" ("organizationId");

-- ── Mobile, push & biometric auth ─────────────────────────────────────────
-- "pinHash" is created here so 20260801020000_mobile_device_pin_hash is a
-- no-op on a clean database and a real backfill on a hand-patched one.
CREATE TABLE IF NOT EXISTS "MobileDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "deviceName" TEXT,
  "osVersion" TEXT,
  "appVersion" TEXT,
  "deviceModel" TEXT,
  "pinHash" TEXT,
  "pushTokenHash" TEXT,
  "biometricEnabled" BOOLEAN NOT NULL DEFAULT false,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastIp" TEXT,
  "lastUserAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileDevice_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "MobileDevice" ADD COLUMN IF NOT EXISTS "pinHash" TEXT;
CREATE INDEX IF NOT EXISTS "MobileDevice_userId_idx" ON "MobileDevice" ("userId");
CREATE INDEX IF NOT EXISTS "MobileDevice_lastSeenAt_idx" ON "MobileDevice" ("lastSeenAt");

CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "vapidPublicKey" TEXT NOT NULL,
  "userAgent" TEXT,
  "failures" INTEGER NOT NULL DEFAULT 0,
  "lastDeliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription" ("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription" ("userId");

CREATE TABLE IF NOT EXISTS "BiometricCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "counter" INTEGER NOT NULL DEFAULT 0,
  "transports" TEXT,
  "aaguid" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "BiometricCredential_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BiometricCredential_userId_idx" ON "BiometricCredential" ("userId");

-- ── Notifications ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "icon" TEXT,
  "url" TEXT,
  "data" JSONB NOT NULL DEFAULT '{}',
  "pushDelivered" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification" ("userId","createdAt");
CREATE INDEX IF NOT EXISTS "Notification_readAt_idx" ON "Notification" ("readAt");

-- ── Access reviews (these 5 were missing from the .local patch entirely) ──
CREATE TABLE IF NOT EXISTS "AccessReviewCampaign" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "status" "AccessReviewStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "dormantDays" INTEGER NOT NULL DEFAULT 90,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccessReviewCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AccessReviewCampaign_organizationId_status_idx" ON "AccessReviewCampaign" ("organizationId","status");

CREATE TABLE IF NOT EXISTS "AccessReviewItem" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "AccessItemStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccessReviewItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AccessReviewItem_campaignId_idx" ON "AccessReviewItem" ("campaignId");
CREATE INDEX IF NOT EXISTS "AccessReviewItem_userId_idx" ON "AccessReviewItem" ("userId");

-- ── Incident runbooks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "IncidentRunbook" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "name" TEXT NOT NULL,
  "triggerSeverity" TEXT NOT NULL,
  "triggerArea" TEXT NOT NULL,
  "actions" JSONB NOT NULL DEFAULT '[]',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncidentRunbook_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IncidentRunbook_organizationId_enabled_idx" ON "IncidentRunbook" ("organizationId","enabled");

CREATE TABLE IF NOT EXISTS "RunbookExecution" (
  "id" TEXT NOT NULL,
  "runbookId" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'success',
  "output" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RunbookExecution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RunbookExecution_runbookId_idx" ON "RunbookExecution" ("runbookId");
CREATE INDEX IF NOT EXISTS "RunbookExecution_incidentId_idx" ON "RunbookExecution" ("incidentId");

-- ── Billing ledger ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "BillingLedgerEntry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "giftCardId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "debitAccount" TEXT NOT NULL,
  "creditAccount" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BillingLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BillingLedgerEntry_organizationId_idx" ON "BillingLedgerEntry" ("organizationId");
CREATE INDEX IF NOT EXISTS "BillingLedgerEntry_invoiceId_idx" ON "BillingLedgerEntry" ("invoiceId");
CREATE INDEX IF NOT EXISTS "BillingLedgerEntry_giftCardId_idx" ON "BillingLedgerEntry" ("giftCardId");

-- ── Foreign keys ──────────────────────────────────────────────────────────
-- Added conditionally: ADD CONSTRAINT has no IF NOT EXISTS, and this must stay
-- re-runnable on databases where the .local patch already created the tables.
DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('ModelRegistry_organizationId_fkey',        'ModelRegistry',        'organizationId', 'Organization', 'id', 'CASCADE'),
      ('AiRequest_organizationId_fkey',            'AiRequest',            'organizationId', 'Organization', 'id', 'CASCADE'),
      ('AiRequest_modelRegistryId_fkey',           'AiRequest',            'modelRegistryId','ModelRegistry','id', 'SET NULL'),
      ('Plugin_organizationId_fkey',               'Plugin',               'organizationId', 'Organization', 'id', 'CASCADE'),
      ('Integration_organizationId_fkey',          'Integration',          'organizationId', 'Organization', 'id', 'CASCADE'),
      ('SsoConfig_organizationId_fkey',            'SsoConfig',            'organizationId', 'Organization', 'id', 'CASCADE'),
      ('UserPermission_userId_fkey',               'UserPermission',       'userId',         'User',         'id', 'CASCADE'),
      ('AlertRule_organizationId_fkey',            'AlertRule',            'organizationId', 'Organization', 'id', 'CASCADE'),
      ('AlertRule_createdById_fkey',               'AlertRule',            'createdById',    'User',         'id', 'RESTRICT'),
      ('Alert_organizationId_fkey',                'Alert',                'organizationId', 'Organization', 'id', 'CASCADE'),
      ('Alert_ruleId_fkey',                        'Alert',                'ruleId',         'AlertRule',    'id', 'SET NULL'),
      ('DataExport_organizationId_fkey',           'DataExport',           'organizationId', 'Organization', 'id', 'CASCADE'),
      ('DataExport_userId_fkey',                   'DataExport',           'userId',         'User',         'id', 'CASCADE'),
      ('MobileDevice_userId_fkey',                 'MobileDevice',         'userId',         'User',         'id', 'CASCADE'),
      ('PushSubscription_userId_fkey',             'PushSubscription',     'userId',         'User',         'id', 'CASCADE'),
      ('PushSubscription_deviceId_fkey',           'PushSubscription',     'deviceId',       'MobileDevice', 'id', 'CASCADE'),
      ('BiometricCredential_userId_fkey',          'BiometricCredential',  'userId',         'User',         'id', 'CASCADE'),
      ('BiometricCredential_deviceId_fkey',        'BiometricCredential',  'deviceId',       'MobileDevice', 'id', 'CASCADE'),
      ('Notification_userId_fkey',                 'Notification',         'userId',         'User',         'id', 'CASCADE'),
      ('AccessReviewItem_campaignId_fkey',         'AccessReviewItem',     'campaignId',     'AccessReviewCampaign', 'id', 'CASCADE'),
      ('RunbookExecution_runbookId_fkey',          'RunbookExecution',     'runbookId',      'IncidentRunbook',      'id', 'CASCADE')
    ) AS t(conname, child, childcol, parent, parentcol, ondelete)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.conname) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON DELETE %s ON UPDATE CASCADE',
        fk.child, fk.conname, fk.childcol, fk.parent, fk.parentcol, fk.ondelete
      );
    END IF;
  END LOOP;
END $$;
