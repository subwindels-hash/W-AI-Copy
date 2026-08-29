-- WINDELS AI Cloud Android control plane
-- Metadata, policy, session, approval, audit-action and usage records only.
-- Android runtimes remain behind the signed provider abstraction.

ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'CLOUD_ANDROID_READ';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'CLOUD_ANDROID_CONTROL';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'CLOUD_ANDROID_MANAGE';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'CLOUD_ANDROID_APP';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'CLOUD_ANDROID_FILE';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'CLOUD_ANDROID_SENSITIVE';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'CLOUD_ANDROID_ADMIN';
ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "cloudAndroidRequirements" JSONB NOT NULL DEFAULT '{}';

DO $$ BEGIN CREATE TYPE "CloudAndroidLifecycle" AS ENUM ('CREATING','PROVISIONING','STOPPED','BOOTING','RUNNING','SUSPENDING','SUSPENDED','REBOOTING','SNAPSHOTTING','RESTORING','DEGRADED','FAILED','DESTROYING','DESTROYED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CloudAndroidSessionMode" AS ENUM ('HUMAN','AI','COLLABORATIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CloudAndroidSessionStatus" AS ENUM ('ACTIVE','PAUSED_FOR_APPROVAL','PAUSED_FOR_TAKEOVER','COMPLETED','CANCELLED','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CloudAndroidActionStatus" AS ENUM ('PREPARING','APPROVAL_REQUIRED','EXECUTING','VERIFYING','SUCCEEDED','FAILED','REJECTED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CloudAndroidApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED','EXPIRED','CONSUMED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE "cloud_android_providers" (
  "id" TEXT NOT NULL PRIMARY KEY, "providerKey" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
  "adapterVersion" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  "capabilities" JSONB NOT NULL DEFAULT '[]', "regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "androidVersions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "lastHealthAt" TIMESTAMP(3),
  "lastError" TEXT, "metadata" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "cloud_android_providers_status_idx" ON "cloud_android_providers"("status");

CREATE TABLE "cloud_android_templates" (
  "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL, "description" TEXT, "category" TEXT NOT NULL, "androidVersion" TEXT NOT NULL,
  "cpuCores" INTEGER NOT NULL, "ramMb" INTEGER NOT NULL, "storageGb" INTEGER NOT NULL, "region" TEXT NOT NULL,
  "locale" TEXT NOT NULL, "timezone" TEXT NOT NULL, "networkPolicy" JSONB NOT NULL,
  "securityProfile" TEXT NOT NULL, "installedApplications" JSONB NOT NULL DEFAULT '[]', "imageId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cloud_android_templates_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_templates_user_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_templates_org_name_unique" UNIQUE("organizationId","name")
);
CREATE INDEX "cloud_android_templates_org_category_idx" ON "cloud_android_templates"("organizationId","category");

CREATE TABLE "cloud_android_images" (
  "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL, "version" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'CREATING', "providerImageRef" TEXT,
  "androidVersion" TEXT NOT NULL, "configuration" JSONB NOT NULL DEFAULT '{}', "applications" JSONB NOT NULL DEFAULT '[]',
  "agentConfiguration" JSONB NOT NULL DEFAULT '{}', "automationConfiguration" JSONB NOT NULL DEFAULT '{}',
  "sizeBytes" BIGINT, "checksum" TEXT, "securityReport" JSONB NOT NULL DEFAULT '{}', "sourceDeviceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cloud_android_images_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_images_user_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_images_org_name_version_unique" UNIQUE("organizationId","name","version")
);
CREATE INDEX "cloud_android_images_org_status_idx" ON "cloud_android_images"("organizationId","status");

CREATE TABLE "cloud_android_devices" (
  "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "providerId" TEXT NOT NULL,
  "providerDeviceRef" TEXT UNIQUE, "templateId" TEXT, "imageId" TEXT, "name" TEXT NOT NULL, "androidVersion" TEXT NOT NULL,
  "lifecycle" "CloudAndroidLifecycle" NOT NULL DEFAULT 'CREATING', "desiredState" TEXT NOT NULL DEFAULT 'STOPPED',
  "cpuCores" INTEGER NOT NULL, "ramMb" INTEGER NOT NULL, "storageGb" INTEGER NOT NULL, "region" TEXT NOT NULL,
  "locale" TEXT NOT NULL, "timezone" TEXT NOT NULL, "networkPolicy" JSONB NOT NULL, "securityProfile" TEXT NOT NULL,
  "metrics" JSONB NOT NULL DEFAULT '{}', "runtimeState" JSONB NOT NULL DEFAULT '{}', "securityStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "activeControllerType" TEXT, "activeControllerId" TEXT, "activeSessionId" TEXT, "controlLockVersion" INTEGER NOT NULL DEFAULT 0,
  "controlLockExpiresAt" TIMESTAMP(3), "lastObservedAt" TIMESTAMP(3), "lastHealthAt" TIMESTAMP(3), "lastError" TEXT,
  "provisionedAt" TIMESTAMP(3), "destroyedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cloud_android_devices_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_devices_owner_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_devices_provider_fkey" FOREIGN KEY ("providerId") REFERENCES "cloud_android_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_devices_template_fkey" FOREIGN KEY ("templateId") REFERENCES "cloud_android_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_devices_image_fkey" FOREIGN KEY ("imageId") REFERENCES "cloud_android_images"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "cloud_android_devices_org_lifecycle_idx" ON "cloud_android_devices"("organizationId","lifecycle");
CREATE INDEX "cloud_android_devices_provider_lifecycle_idx" ON "cloud_android_devices"("providerId","lifecycle");
CREATE INDEX "cloud_android_devices_active_session_idx" ON "cloud_android_devices"("activeSessionId");

CREATE TABLE "cloud_android_agent_grants" (
  "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "agentId" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL, "permissions" TEXT[] NOT NULL, "sensitiveActions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "domainAllowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "active" BOOLEAN NOT NULL DEFAULT true, "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cloud_android_grants_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_grants_device_fkey" FOREIGN KEY ("deviceId") REFERENCES "cloud_android_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_grants_agent_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_grants_user_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_grants_device_agent_unique" UNIQUE("deviceId","agentId")
);
CREATE INDEX "cloud_android_grants_org_active_idx" ON "cloud_android_agent_grants"("organizationId","active");
CREATE INDEX "cloud_android_grants_agent_active_idx" ON "cloud_android_agent_grants"("agentId","active");

CREATE TABLE "cloud_android_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "agentId" TEXT, "apiKeyId" TEXT, "mode" "CloudAndroidSessionMode" NOT NULL,
  "status" "CloudAndroidSessionStatus" NOT NULL DEFAULT 'ACTIVE', "controllerType" TEXT NOT NULL, "controllerId" TEXT NOT NULL,
  "applicationPackage" TEXT, "permissions" JSONB NOT NULL, "result" JSONB NOT NULL DEFAULT '{}',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMP(3),
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cloud_android_sessions_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_sessions_device_fkey" FOREIGN KEY ("deviceId") REFERENCES "cloud_android_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_sessions_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_sessions_agent_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_sessions_apikey_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "cloud_android_sessions_org_started_idx" ON "cloud_android_sessions"("organizationId","startedAt");
CREATE INDEX "cloud_android_sessions_device_status_idx" ON "cloud_android_sessions"("deviceId","status");
CREATE INDEX "cloud_android_sessions_agent_status_idx" ON "cloud_android_sessions"("agentId","status");

CREATE TABLE "cloud_android_actions" (
  "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "sessionId" TEXT NOT NULL,
  "userId" TEXT, "agentId" TEXT, "actionType" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "sensitivity" TEXT NOT NULL DEFAULT 'UNKNOWN', "status" "CloudAndroidActionStatus" NOT NULL DEFAULT 'PREPARING',
  "providerOperationId" TEXT, "preparedTokenHash" TEXT, "beforeObservationHash" TEXT, "afterObservationHash" TEXT,
  "result" JSONB NOT NULL DEFAULT '{}', "errorCode" TEXT, "errorMessage" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cloud_android_actions_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_actions_device_fkey" FOREIGN KEY ("deviceId") REFERENCES "cloud_android_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_actions_session_fkey" FOREIGN KEY ("sessionId") REFERENCES "cloud_android_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_actions_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_actions_agent_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "cloud_android_actions_org_created_idx" ON "cloud_android_actions"("organizationId","createdAt");
CREATE INDEX "cloud_android_actions_device_created_idx" ON "cloud_android_actions"("deviceId","createdAt");
CREATE INDEX "cloud_android_actions_session_created_idx" ON "cloud_android_actions"("sessionId","createdAt");
CREATE INDEX "cloud_android_actions_status_idx" ON "cloud_android_actions"("status");

CREATE TABLE "cloud_android_approvals" (
  "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "actionId" TEXT NOT NULL UNIQUE, "sessionId" TEXT NOT NULL,
  "status" "CloudAndroidApprovalStatus" NOT NULL DEFAULT 'PENDING', "sensitivity" TEXT NOT NULL, "description" TEXT NOT NULL,
  "target" JSONB NOT NULL DEFAULT '{}', "requestedByAgentId" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL,
  "decidedById" TEXT, "decisionNote" TEXT, "decidedAt" TIMESTAMP(3), "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cloud_android_approvals_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_approvals_action_fkey" FOREIGN KEY ("actionId") REFERENCES "cloud_android_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_approvals_session_fkey" FOREIGN KEY ("sessionId") REFERENCES "cloud_android_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_approvals_decider_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "cloud_android_approvals_org_status_created_idx" ON "cloud_android_approvals"("organizationId","status","createdAt");
CREATE INDEX "cloud_android_approvals_session_status_idx" ON "cloud_android_approvals"("sessionId","status");

CREATE TABLE "cloud_android_snapshots" (
  "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATING', "providerSnapshotRef" TEXT, "sizeBytes" BIGINT, "checksum" TEXT,
  "createdByType" TEXT NOT NULL, "createdById" TEXT NOT NULL, "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "cloud_android_snapshots_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_snapshots_device_fkey" FOREIGN KEY ("deviceId") REFERENCES "cloud_android_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "cloud_android_snapshots_org_created_idx" ON "cloud_android_snapshots"("organizationId","createdAt");
CREATE INDEX "cloud_android_snapshots_device_created_idx" ON "cloud_android_snapshots"("deviceId","createdAt");

CREATE TABLE "cloud_android_usage" (
  "id" TEXT NOT NULL PRIMARY KEY, "organizationId" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "sessionId" TEXT,
  "apiKeyId" TEXT, "metric" TEXT NOT NULL, "quantity" BIGINT NOT NULL, "unit" TEXT NOT NULL, "costMicros" BIGINT,
  "source" TEXT NOT NULL, "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cloud_android_usage_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_usage_device_fkey" FOREIGN KEY ("deviceId") REFERENCES "cloud_android_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_usage_session_fkey" FOREIGN KEY ("sessionId") REFERENCES "cloud_android_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cloud_android_usage_apikey_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "cloud_android_usage_org_measured_idx" ON "cloud_android_usage"("organizationId","measuredAt");
CREATE INDEX "cloud_android_usage_device_measured_idx" ON "cloud_android_usage"("deviceId","measuredAt");
CREATE INDEX "cloud_android_usage_session_idx" ON "cloud_android_usage"("sessionId");

-- RLS on every tenant-bearing control-plane table.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cloud_android_templates','cloud_android_images','cloud_android_devices','cloud_android_agent_grants','cloud_android_sessions','cloud_android_actions','cloud_android_approvals','cloud_android_snapshots','cloud_android_usage'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (coalesce(current_setting(''app.current_organization_id'',true),'''')='''' OR current_setting(''app.bypass_rls'',true)=''true'' OR "organizationId"::text=current_setting(''app.current_organization_id'',true)) WITH CHECK (coalesce(current_setting(''app.current_organization_id'',true),'''')='''' OR current_setting(''app.bypass_rls'',true)=''true'' OR "organizationId"::text=current_setting(''app.current_organization_id'',true))', t || '_tenant_isolation', t);
  END LOOP;
END $$;

INSERT INTO "ApiProduct" ("id","organizationId","slug","name","category","description","version","requiredScopes","basePriceUsd","enabled","rateLimitPerMin","docsUrl","example","createdAt","updatedAt")
SELECT 'api-product-cloud-android-v1',NULL,'cloud-android','WINDELS AI Cloud Android','hardware',
'Human and AI collaborative cloud Android control plane with policy, approval, device sessions, verification and fleet APIs.',
'v1',ARRAY['cloud-android:read','cloud-android:control']::TEXT[],1.0,true,120,'/docs/api#cloud-android',
'{"devices":"GET /v1/cloud-android/devices","create":"POST /v1/cloud-android/devices"}'::JSONB,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ApiProduct" WHERE "organizationId" IS NULL AND "slug"='cloud-android');
