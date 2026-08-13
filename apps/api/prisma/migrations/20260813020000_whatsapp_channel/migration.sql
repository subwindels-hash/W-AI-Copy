-- ═══════════════════════════════════════════════════════════════════════════
-- WhatsApp Channel foundation.
--
-- Additive only: creates five new tables plus their enums. No existing table
-- is altered, dropped or rewritten, and no existing data is touched. Every
-- statement is idempotent so the migration is safe to replay.
--
-- Tenant isolation: all five tables carry organizationId and are enrolled in
-- the same ENABLE + FORCE ROW LEVEL SECURITY regime established by
-- 20260813010000_rls_tenant_isolation.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "WhatsAppChannelStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR', 'DISABLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppWebhookStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'FAILING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppContactStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'OPTED_OUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppConversationStatus" AS ENUM ('OPEN', 'CLOSED', 'ESCALATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppDirection" AS ENUM ('INBOUND', 'OUTBOUND');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppMessageType" AS ENUM (
    'TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'LOCATION', 'INTERACTIVE',
    'BUTTON', 'REACTION', 'STICKER', 'CONTACTS', 'ORDER', 'SYSTEM', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DUPLICATE', 'IGNORED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── WhatsAppChannel ──────────────────────────────────────────────────────
-- accessTokenEnc / appSecretEnc / verifyTokenEnc hold AES-256-GCM blobs
-- produced by src/security/encryption.ts. Plaintext credentials are never
-- written to any column.
CREATE TABLE IF NOT EXISTS "WhatsAppChannel" (
  "id"                 TEXT NOT NULL,
  "organizationId"     TEXT NOT NULL,
  "name"               TEXT NOT NULL,
  "phoneNumberId"      TEXT NOT NULL,
  "businessAccountId"  TEXT NOT NULL,
  "displayPhoneNumber" TEXT,
  "status"             "WhatsAppChannelStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "webhookStatus"      "WhatsAppWebhookStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "enabled"            BOOLEAN NOT NULL DEFAULT false,
  "apiVersion"         TEXT NOT NULL DEFAULT 'v21.0',
  "accessTokenEnc"     JSONB,
  "appSecretEnc"       JSONB,
  "verifyTokenEnc"     JSONB,
  "appId"              TEXT,
  "webhookUrl"         TEXT,
  "settings"           JSONB NOT NULL DEFAULT '{}',
  "lastWebhookAt"      TIMESTAMP(3),
  "lastErrorAt"        TIMESTAMP(3),
  "lastError"          TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "deletedAt"          TIMESTAMP(3),
  CONSTRAINT "WhatsAppChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppChannel_phoneNumberId_key" ON "WhatsAppChannel"("phoneNumberId");
CREATE INDEX IF NOT EXISTS "WhatsAppChannel_organizationId_enabled_idx" ON "WhatsAppChannel"("organizationId", "enabled");
CREATE INDEX IF NOT EXISTS "WhatsAppChannel_businessAccountId_idx" ON "WhatsAppChannel"("businessAccountId");

-- ── WhatsAppContact ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "WhatsAppContact" (
  "id"                  TEXT NOT NULL,
  "organizationId"      TEXT NOT NULL,
  "whatsappChannelId"   TEXT NOT NULL,
  "whatsappUserId"      TEXT NOT NULL,
  "phoneNumber"         TEXT NOT NULL,
  "displayName"         TEXT,
  "linkedWindelsUserId" TEXT,
  "linkedAt"            TIMESTAMP(3),
  "status"              "WhatsAppContactStatus" NOT NULL DEFAULT 'ACTIVE',
  "firstSeenAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppContact_whatsappChannelId_whatsappUserId_key"
  ON "WhatsAppContact"("whatsappChannelId", "whatsappUserId");
CREATE INDEX IF NOT EXISTS "WhatsAppContact_organizationId_idx" ON "WhatsAppContact"("organizationId");
CREATE INDEX IF NOT EXISTS "WhatsAppContact_linkedWindelsUserId_idx" ON "WhatsAppContact"("linkedWindelsUserId");
CREATE INDEX IF NOT EXISTS "WhatsAppContact_phoneNumber_idx" ON "WhatsAppContact"("phoneNumber");

-- ── WhatsAppConversation ─────────────────────────────────────────────────
-- windelsConversationId is the bridge into the EXISTING conversation system.
CREATE TABLE IF NOT EXISTS "WhatsAppConversation" (
  "id"                    TEXT NOT NULL,
  "organizationId"        TEXT NOT NULL,
  "channelId"             TEXT NOT NULL,
  "contactId"             TEXT NOT NULL,
  "windelsConversationId" TEXT,
  "status"                "WhatsAppConversationStatus" NOT NULL DEFAULT 'OPEN',
  "lastMessageAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConversation_channelId_contactId_key"
  ON "WhatsAppConversation"("channelId", "contactId");
CREATE INDEX IF NOT EXISTS "WhatsAppConversation_organizationId_lastMessageAt_idx"
  ON "WhatsAppConversation"("organizationId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "WhatsAppConversation_windelsConversationId_idx"
  ON "WhatsAppConversation"("windelsConversationId");

-- ── WhatsAppMessage ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "WhatsAppMessage" (
  "id"                TEXT NOT NULL,
  "organizationId"    TEXT NOT NULL,
  "conversationId"    TEXT NOT NULL,
  "whatsappMessageId" TEXT,
  "direction"         "WhatsAppDirection" NOT NULL,
  "messageType"       "WhatsAppMessageType" NOT NULL DEFAULT 'UNKNOWN',
  "text"              TEXT,
  "mediaId"           TEXT,
  "status"            "WhatsAppMessageStatus" NOT NULL DEFAULT 'PENDING',
  "errorCode"         TEXT,
  "errorMessage"      TEXT,
  "metadata"          JSONB NOT NULL DEFAULT '{}',
  "windelsMessageId"  TEXT,
  "sentAt"            TIMESTAMP(3),
  "deliveredAt"       TIMESTAMP(3),
  "readAt"            TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- The wamid uniqueness constraint is what makes inbound processing idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessage_whatsappMessageId_key"
  ON "WhatsAppMessage"("whatsappMessageId");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_conversationId_createdAt_idx"
  ON "WhatsAppMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_organizationId_direction_status_idx"
  ON "WhatsAppMessage"("organizationId", "direction", "status");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_status_idx" ON "WhatsAppMessage"("status");

-- ── WhatsAppWebhookEvent ─────────────────────────────────────────────────
-- Stores a SHA-256 of the payload, not the payload: enough to debug and to
-- detect duplicates without retaining sensitive message content.
CREATE TABLE IF NOT EXISTS "WhatsAppWebhookEvent" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT,
  "channelId"        TEXT,
  "eventId"          TEXT NOT NULL,
  "eventType"        TEXT NOT NULL,
  "payloadHash"      TEXT NOT NULL,
  "processingStatus" "WhatsAppEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "attempts"         INTEGER NOT NULL DEFAULT 0,
  "receivedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt"      TIMESTAMP(3),
  "errorMessage"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppWebhookEvent_eventId_key" ON "WhatsAppWebhookEvent"("eventId");
CREATE INDEX IF NOT EXISTS "WhatsAppWebhookEvent_processingStatus_receivedAt_idx"
  ON "WhatsAppWebhookEvent"("processingStatus", "receivedAt");
CREATE INDEX IF NOT EXISTS "WhatsAppWebhookEvent_channelId_receivedAt_idx"
  ON "WhatsAppWebhookEvent"("channelId", "receivedAt");
CREATE INDEX IF NOT EXISTS "WhatsAppWebhookEvent_payloadHash_idx" ON "WhatsAppWebhookEvent"("payloadHash");

-- ── Foreign keys ─────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "WhatsAppChannel" ADD CONSTRAINT "WhatsAppChannel_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppContact" ADD CONSTRAINT "WhatsAppContact_whatsappChannelId_fkey"
    FOREIGN KEY ("whatsappChannelId") REFERENCES "WhatsAppChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppContact" ADD CONSTRAINT "WhatsAppContact_linkedWindelsUserId_fkey"
    FOREIGN KEY ("linkedWindelsUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "WhatsAppChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "WhatsAppContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppConversation" ADD CONSTRAINT "WhatsAppConversation_windelsConversationId_fkey"
    FOREIGN KEY ("windelsConversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppWebhookEvent" ADD CONSTRAINT "WhatsAppWebhookEvent_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "WhatsAppChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Row-Level Security ───────────────────────────────────────────────────
-- Same regime as 20260813010000_rls_tenant_isolation: ENABLE + FORCE so the
-- table owner is not exempt, and a single permissive policy that fails OPEN
-- when no tenant context is set (background workers) but hard-scopes every
-- request that does set one.
--
-- WhatsAppWebhookEvent.organizationId is nullable: an event can arrive before
-- its channel is resolved, so the policy tolerates NULL like the other
-- nullable-org tables (AuditLog, Notification, ...).

ALTER TABLE "WhatsAppChannel"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppChannel"      FORCE  ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppContact"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppContact"      FORCE  ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppConversation" FORCE  ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppMessage"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppMessage"      FORCE  ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppWebhookEvent" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_WhatsAppChannel" ON "WhatsAppChannel";
CREATE POLICY "tenant_isolation_WhatsAppChannel" ON "WhatsAppChannel"
  USING (
    current_setting('app.current_organization_id', true) IS NULL
    OR current_setting('app.current_organization_id', true) = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

DROP POLICY IF EXISTS "tenant_isolation_WhatsAppContact" ON "WhatsAppContact";
CREATE POLICY "tenant_isolation_WhatsAppContact" ON "WhatsAppContact"
  USING (
    current_setting('app.current_organization_id', true) IS NULL
    OR current_setting('app.current_organization_id', true) = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

DROP POLICY IF EXISTS "tenant_isolation_WhatsAppConversation" ON "WhatsAppConversation";
CREATE POLICY "tenant_isolation_WhatsAppConversation" ON "WhatsAppConversation"
  USING (
    current_setting('app.current_organization_id', true) IS NULL
    OR current_setting('app.current_organization_id', true) = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

DROP POLICY IF EXISTS "tenant_isolation_WhatsAppMessage" ON "WhatsAppMessage";
CREATE POLICY "tenant_isolation_WhatsAppMessage" ON "WhatsAppMessage"
  USING (
    current_setting('app.current_organization_id', true) IS NULL
    OR current_setting('app.current_organization_id', true) = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

DROP POLICY IF EXISTS "tenant_isolation_WhatsAppWebhookEvent" ON "WhatsAppWebhookEvent";
CREATE POLICY "tenant_isolation_WhatsAppWebhookEvent" ON "WhatsAppWebhookEvent"
  USING (
    current_setting('app.current_organization_id', true) IS NULL
    OR current_setting('app.current_organization_id', true) = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId" IS NULL
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );
