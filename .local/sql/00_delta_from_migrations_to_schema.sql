DO $$ BEGIN CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AlertChannel" AS ENUM ('EMAIL', 'WEBHOOK', 'IN_APP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "Permission" AS ENUM ('ORG_READ', 'ORG_WRITE', 'ORG_ADMIN', 'WORKFLOW_READ', 'WORKFLOW_WRITE', 'WORKFLOW_RUN', 'AGENT_READ', 'AGENT_WRITE', 'TALK_READ', 'TALK_WRITE', 'CANVAS_READ', 'CANVAS_WRITE', 'BILLING_READ', 'BILLING_WRITE', 'DEVELOPER_READ', 'DEVELOPER_WRITE', 'AUDIT_READ', 'ADMIN_STAR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ModelRegistry" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "provider" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL DEFAULT '1.0',
  "description" TEXT,
  "capabilities" TEXT[] DEFAULT '{chat}',
  "contextWindow" INTEGER NOT NULL DEFAULT 128000,
  "maxOutputTokens" INTEGER NOT NULL DEFAULT 4096,
  "costInputPer1k" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costOutputPer1k" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("organizationId","provider","modelId","version")
);
CREATE INDEX IF NOT EXISTS "ModelRegistry_organizationId_idx" ON "ModelRegistry" ("organizationId");

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
  "createdAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiRequest_organizationId_createdAt_idx" ON "AiRequest" ("organizationId","createdAt");
CREATE INDEX IF NOT EXISTS "AiRequest_modelId_idx" ON "AiRequest" ("modelId");
CREATE INDEX IF NOT EXISTS "AiRequest_status_idx" ON "AiRequest" ("status");

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
  "hooks" TEXT[] DEFAULT '{}',
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("organizationId","slug")
);
CREATE INDEX IF NOT EXISTS "Plugin_organizationId_idx" ON "Plugin" ("organizationId");

CREATE TABLE IF NOT EXISTS "Integration" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}',
  "credentials" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'disconnected',
  "lastSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id")
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
  "domains" TEXT[] DEFAULT '{}',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("organizationId")
);

CREATE TABLE IF NOT EXISTS "RolePermission" (
  "id" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "permission" "Permission" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("role","permission")
);

CREATE TABLE IF NOT EXISTS "UserPermission" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "permission" "Permission" NOT NULL,
  "resourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UserPermission_userId_idx" ON "UserPermission" ("userId");

CREATE TABLE IF NOT EXISTS "AlertRule" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "condition" TEXT,
  "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING'::"AlertSeverity",
  "channels" "AlertChannel"[] DEFAULT '{IN_APP}',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AlertRule_organizationId_idx" ON "AlertRule" ("organizationId");

CREATE TABLE IF NOT EXISTS "Alert" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "condition" TEXT,
  "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING'::"AlertSeverity",
  "channels" "AlertChannel"[] DEFAULT '{IN_APP}',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Alert_organizationId_idx" ON "Alert" ("organizationId");

CREATE TABLE IF NOT EXISTS "HealthCheck" (
  "id" TEXT NOT NULL,
  "service" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "latencyMs" INTEGER,
  "details" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HealthCheck_service_createdAt_idx" ON "HealthCheck" ("service","createdAt");

CREATE TABLE IF NOT EXISTS "DataExport" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "downloadUrl" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DataExport_organizationId_idx" ON "DataExport" ("organizationId");

CREATE TABLE IF NOT EXISTS "MobileDevice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "deviceName" TEXT,
  "osVersion" TEXT,
  "appVersion" TEXT,
  "deviceModel" TEXT,
  "pushTokenHash" TEXT,
  "biometricEnabled" BOOLEAN NOT NULL DEFAULT false,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "lastIp" TEXT,
  "lastUserAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id")
);
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
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("endpoint")
);
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
  "createdAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BiometricCredential_userId_idx" ON "BiometricCredential" ("userId");

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
  "createdAt" TIMESTAMP(3) NOT NULL,
  PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification" ("userId","createdAt");
CREATE INDEX IF NOT EXISTS "Notification_readAt_idx" ON "Notification" ("readAt");

