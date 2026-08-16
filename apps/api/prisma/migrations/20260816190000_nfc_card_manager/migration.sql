-- WINDELS NFC Card Manager
-- Additive, tenant-scoped persistence for readers, observed cards, NDEF records,
-- write/verification operations, and links into the existing identity/profile system.

ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'NFC_READ';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'NFC_WRITE';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'NFC_DESTRUCTIVE';
ALTER TYPE "Permission" ADD VALUE IF NOT EXISTS 'NFC_ADMIN';

DO $$ BEGIN CREATE TYPE "NfcInterfaceType" AS ENUM ('PCSC','WEB_NFC','ANDROID_NATIVE','IOS_CORE_NFC','READER_SDK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NfcSupportStatus" AS ENUM ('SUPPORTED','PARTIALLY_SUPPORTED','READ_ONLY','WRITE_SUPPORTED','UNSUPPORTED','UNVERIFIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NfcLockStatus" AS ENUM ('UNLOCKED','LOCKED','PARTIALLY_LOCKED','UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NfcOperationType" AS ENUM ('DETECT','READ','WRITE','UPDATE','VERIFY','ERASE','LOCK','PROTECT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NfcOperationStatus" AS ENUM ('PENDING_CONFIRMATION','READY','IN_PROGRESS','VERIFYING','SUCCEEDED','FAILED','CANCELLED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "nfc_readers" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "registeredById" TEXT NOT NULL,
  "localIdHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "vendor" TEXT,
  "product" TEXT,
  "interfaceType" "NfcInterfaceType" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OFFLINE',
  "capabilities" JSONB NOT NULL DEFAULT '{}',
  "qualifiedCombinations" JSONB NOT NULL DEFAULT '[]',
  "bridgeVersion" TEXT,
  "platform" TEXT,
  "lastSeenAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nfc_readers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "nfc_readers_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "nfc_readers_org_local_unique" UNIQUE("organizationId","localIdHash")
);
CREATE INDEX IF NOT EXISTS "nfc_readers_org_seen_idx" ON "nfc_readers"("organizationId","lastSeenAt");

CREATE TABLE IF NOT EXISTS "nfc_profiles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "profileType" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "secureUrl" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nfc_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "nfc_profiles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "nfc_profiles_org_type_idx" ON "nfc_profiles"("organizationId","profileType");
CREATE INDEX IF NOT EXISTS "nfc_profiles_target_idx" ON "nfc_profiles"("targetType","targetId");

CREATE TABLE IF NOT EXISTS "nfc_cards" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "assignedUserId" TEXT,
  "readerId" TEXT,
  "profileId" TEXT,
  "cardKeyHash" TEXT NOT NULL,
  "uidMasked" TEXT,
  "name" TEXT NOT NULL,
  "technology" TEXT NOT NULL DEFAULT 'Unknown NFC Technology',
  "supportStatus" "NfcSupportStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "memoryBytes" INTEGER,
  "writableBytes" INTEGER,
  "ndefSupported" BOOLEAN NOT NULL DEFAULT false,
  "readable" BOOLEAN NOT NULL DEFAULT false,
  "writable" BOOLEAN NOT NULL DEFAULT false,
  "erasable" BOOLEAN NOT NULL DEFAULT false,
  "lockable" BOOLEAN NOT NULL DEFAULT false,
  "protectable" BOOLEAN NOT NULL DEFAULT false,
  "lockStatus" "NfcLockStatus" NOT NULL DEFAULT 'UNKNOWN',
  "capabilitySource" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "qualification" TEXT NOT NULL DEFAULT 'NOT_QUALIFIED',
  "capabilities" JSONB NOT NULL DEFAULT '{}',
  "ndefHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastDetectedAt" TIMESTAMP(3),
  "lastReadAt" TIMESTAMP(3),
  "lastWrittenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nfc_cards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "nfc_cards_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "nfc_cards_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "nfc_cards_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "nfc_readers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "nfc_cards_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "nfc_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "nfc_cards_org_key_unique" UNIQUE("organizationId","cardKeyHash")
);
CREATE INDEX IF NOT EXISTS "nfc_cards_org_updated_idx" ON "nfc_cards"("organizationId","updatedAt");
CREATE INDEX IF NOT EXISTS "nfc_cards_profile_idx" ON "nfc_cards"("profileId");

CREATE TABLE IF NOT EXISTS "nfc_ndef_records" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cardId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "tnf" INTEGER NOT NULL,
  "recordType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nfc_ndef_records_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "nfc_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "nfc_ndef_records_card_position_unique" UNIQUE("cardId","position")
);
CREATE INDEX IF NOT EXISTS "nfc_ndef_records_card_idx" ON "nfc_ndef_records"("cardId");

CREATE TABLE IF NOT EXISTS "nfc_operations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "readerId" TEXT,
  "cardId" TEXT,
  "operationType" "NfcOperationType" NOT NULL,
  "status" "NfcOperationStatus" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "challengeHash" TEXT,
  "requestedRecords" JSONB NOT NULL DEFAULT '[]',
  "expectedNdefHash" TEXT,
  "previousNdefHash" TEXT,
  "readbackNdefHash" TEXT,
  "requiredBytes" INTEGER,
  "availableBytes" INTEGER,
  "overwriteConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "irreversibleConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "hardwareEvidence" JSONB NOT NULL DEFAULT '{}',
  "result" JSONB NOT NULL DEFAULT '{}',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nfc_operations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "nfc_operations_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "nfc_operations_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "nfc_readers"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "nfc_operations_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "nfc_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "nfc_operations_org_idempotency_unique" UNIQUE("organizationId","idempotencyKey")
);
CREATE INDEX IF NOT EXISTS "nfc_operations_org_created_idx" ON "nfc_operations"("organizationId","createdAt");
CREATE INDEX IF NOT EXISTS "nfc_operations_card_created_idx" ON "nfc_operations"("cardId","createdAt");
CREATE INDEX IF NOT EXISTS "nfc_operations_status_expiry_idx" ON "nfc_operations"("status","expiresAt");

-- Database-layer tenant isolation, matching the existing WINDELS RLS policy.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['nfc_readers','nfc_profiles','nfc_cards','nfc_operations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_tenant_isolation', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (coalesce(current_setting(''app.current_organization_id'', true), '''') = '''' OR current_setting(''app.bypass_rls'', true) = ''true'' OR "organizationId"::text = current_setting(''app.current_organization_id'', true)) WITH CHECK (coalesce(current_setting(''app.current_organization_id'', true), '''') = '''' OR current_setting(''app.bypass_rls'', true) = ''true'' OR "organizationId"::text = current_setting(''app.current_organization_id'', true))',
      table_name || '_tenant_isolation', table_name
    );
  END LOOP;
END $$;

ALTER TABLE "nfc_ndef_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nfc_ndef_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nfc_ndef_records_tenant_isolation" ON "nfc_ndef_records";
CREATE POLICY "nfc_ndef_records_tenant_isolation" ON "nfc_ndef_records"
  USING (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "nfc_cards"
      WHERE "nfc_cards"."id" = "nfc_ndef_records"."cardId"
        AND "nfc_cards"."organizationId"::text = current_setting('app.current_organization_id', true)
    )
  )
  WITH CHECK (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "nfc_cards"
      WHERE "nfc_cards"."id" = "nfc_ndef_records"."cardId"
        AND "nfc_cards"."organizationId"::text = current_setting('app.current_organization_id', true)
    )
  );

-- Register the additive NFC API product for both fresh and existing installs.
INSERT INTO "ApiProduct" (
  "id", "organizationId", "slug", "name", "category", "description", "version",
  "requiredScopes", "basePriceUsd", "enabled", "rateLimitPerMin", "docsUrl", "example", "createdAt", "updatedAt"
)
SELECT
  'api-product-nfc-v1', NULL, 'nfc', 'NFC Card Manager', 'hardware',
  'Orchestrate authorized NFC reads and capability-checked, read-back-verified NDEF operations through a local WINDELS hardware adapter.',
  'v1', ARRAY['nfc:read','nfc:write']::TEXT[], 0.5, true, 30, '/docs/api#nfc',
  '{"listCards":"GET /api/rest/v1/nfc/cards","prepareWrite":"POST /api/rest/v1/nfc/write","verify":"POST /api/rest/v1/nfc/verify"}'::JSONB,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ApiProduct" WHERE "organizationId" IS NULL AND "slug" = 'nfc');
