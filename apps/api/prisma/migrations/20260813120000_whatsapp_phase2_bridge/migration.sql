-- WhatsApp Phase 2 — Message Bridge & AI Orchestration
--
-- Extends the Phase 1 channel schema. Additive only: no column is dropped, no
-- existing table is rewritten, no data is destroyed. Every statement is
-- idempotent so a partial apply can be safely retried.

-- ─── Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "WhatsAppExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED', 'UNSUPPORTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppSessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── WhatsAppConversation: channel-level annotations ─────────────────────────
-- Carries the helpdesk ticket reference once a thread is escalated (§12).

ALTER TABLE "WhatsAppConversation" ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';

-- ─── WhatsAppMedia ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "WhatsAppMedia" (
  "id"                  TEXT NOT NULL,
  "organizationId"      TEXT NOT NULL,
  "conversationId"      TEXT NOT NULL,
  "messageId"           TEXT,
  "mediaId"             TEXT NOT NULL,
  "direction"           "WhatsAppDirection" NOT NULL DEFAULT 'INBOUND',
  "mediaKind"           "WhatsAppMessageType" NOT NULL DEFAULT 'UNKNOWN',
  "mimeType"            TEXT,
  "filename"            TEXT,
  "sizeBytes"           INTEGER,
  "checksum"            TEXT,
  "storageAttachmentId" TEXT,
  "extractionStatus"    "WhatsAppExtractionStatus" NOT NULL DEFAULT 'PENDING',
  "extractedText"       TEXT,
  "transcript"          TEXT,
  "analysis"            JSONB NOT NULL DEFAULT '{}',
  "errorCode"           TEXT,
  "errorMessage"        TEXT,
  "processedAt"         TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppMedia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMedia_conversationId_mediaId_key"
  ON "WhatsAppMedia" ("conversationId", "mediaId");
CREATE INDEX IF NOT EXISTS "WhatsAppMedia_organizationId_extractionStatus_idx"
  ON "WhatsAppMedia" ("organizationId", "extractionStatus");
CREATE INDEX IF NOT EXISTS "WhatsAppMedia_checksum_idx"
  ON "WhatsAppMedia" ("checksum");

DO $$ BEGIN
  ALTER TABLE "WhatsAppMedia"
    ADD CONSTRAINT "WhatsAppMedia_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppMedia"
    ADD CONSTRAINT "WhatsAppMedia_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "WhatsAppMessage" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── WhatsAppJob ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "WhatsAppJob" (
  "id"                TEXT NOT NULL,
  "organizationId"    TEXT NOT NULL,
  "conversationId"    TEXT NOT NULL,
  "requestMessageId"  TEXT,
  "kind"              TEXT NOT NULL,
  "status"            "WhatsAppJobStatus" NOT NULL DEFAULT 'QUEUED',
  "workflowId"        TEXT,
  "workflowRunId"     TEXT,
  "requestedByUserId" TEXT,
  "requestText"       TEXT,
  "params"            JSONB NOT NULL DEFAULT '{}',
  "resultText"        TEXT,
  "resultMediaId"     TEXT,
  "ackMessageId"      TEXT,
  "attempts"          INTEGER NOT NULL DEFAULT 0,
  "errorCode"         TEXT,
  "errorMessage"      TEXT,
  "startedAt"         TIMESTAMP(3),
  "completedAt"       TIMESTAMP(3),
  "notifiedAt"        TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WhatsAppJob_organizationId_status_idx"
  ON "WhatsAppJob" ("organizationId", "status");
CREATE INDEX IF NOT EXISTS "WhatsAppJob_conversationId_createdAt_idx"
  ON "WhatsAppJob" ("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppJob_status_createdAt_idx"
  ON "WhatsAppJob" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppJob_workflowRunId_idx"
  ON "WhatsAppJob" ("workflowRunId");

DO $$ BEGIN
  ALTER TABLE "WhatsAppJob"
    ADD CONSTRAINT "WhatsAppJob_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppJob"
    ADD CONSTRAINT "WhatsAppJob_requestedByUserId_fkey"
    FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── WhatsAppSession ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "WhatsAppSession" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "conversationId"   TEXT NOT NULL,
  "sessionKey"       TEXT NOT NULL,
  "status"           "WhatsAppSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "linkedUserId"     TEXT,
  "turnCount"        INTEGER NOT NULL DEFAULT 0,
  "pendingAction"    JSONB,
  "pendingExpiresAt" TIMESTAMP(3),
  "context"          JSONB NOT NULL DEFAULT '{}',
  "lastActivityAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "closedAt"         TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppSession_sessionKey_key"
  ON "WhatsAppSession" ("sessionKey");
CREATE INDEX IF NOT EXISTS "WhatsAppSession_conversationId_status_idx"
  ON "WhatsAppSession" ("conversationId", "status");
CREATE INDEX IF NOT EXISTS "WhatsAppSession_organizationId_expiresAt_idx"
  ON "WhatsAppSession" ("organizationId", "expiresAt");
CREATE INDEX IF NOT EXISTS "WhatsAppSession_status_expiresAt_idx"
  ON "WhatsAppSession" ("status", "expiresAt");

DO $$ BEGIN
  ALTER TABLE "WhatsAppSession"
    ADD CONSTRAINT "WhatsAppSession_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "WhatsAppSession"
    ADD CONSTRAINT "WhatsAppSession_linkedUserId_fkey"
    FOREIGN KEY ("linkedUserId") REFERENCES "User" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Tenant isolation ────────────────────────────────────────────────────────
--
-- Identical regime to 20260813010000_rls_tenant_isolation and the Phase 1
-- WhatsApp tables: ENABLE + FORCE, with an unset/blank org GUC or an explicit
-- bypass flag falling through so migrations and system workers still function.

ALTER TABLE "WhatsAppMedia"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppMedia"   FORCE  ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppJob"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppJob"     FORCE  ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppSession" FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_WhatsAppMedia" ON "WhatsAppMedia";
CREATE POLICY "tenant_isolation_WhatsAppMedia" ON "WhatsAppMedia"
  USING (
    current_setting('app.current_organization_id', true) IS NULL
    OR current_setting('app.current_organization_id', true) = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

DROP POLICY IF EXISTS "tenant_isolation_WhatsAppJob" ON "WhatsAppJob";
CREATE POLICY "tenant_isolation_WhatsAppJob" ON "WhatsAppJob"
  USING (
    current_setting('app.current_organization_id', true) IS NULL
    OR current_setting('app.current_organization_id', true) = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

DROP POLICY IF EXISTS "tenant_isolation_WhatsAppSession" ON "WhatsAppSession";
CREATE POLICY "tenant_isolation_WhatsAppSession" ON "WhatsAppSession"
  USING (
    current_setting('app.current_organization_id', true) IS NULL
    OR current_setting('app.current_organization_id', true) = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );
