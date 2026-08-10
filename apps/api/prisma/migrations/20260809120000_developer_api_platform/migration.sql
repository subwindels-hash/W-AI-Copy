-- Session: Developer / API Platform upgrade.
--
-- Additive: adds developer applications, an API product/marketplace catalog,
-- product subscriptions, a persistent API usage ledger, and extends ApiKey
-- with fine-grained scopes, app binding, environment and IP restrictions.

ALTER TABLE "ApiKey"
  ADD COLUMN "granularScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "appId" TEXT,
  ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'production',
  ADD COLUMN "ipRestrictions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "DeveloperApp" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "logoUrl" TEXT,
  "environment" TEXT NOT NULL DEFAULT 'development',
  "redirectUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allowedScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "productionApproved" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeveloperApp_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiProduct" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "version" TEXT NOT NULL DEFAULT 'v1',
  "requiredScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "basePriceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "rateLimitPerMin" INTEGER NOT NULL DEFAULT 60,
  "docsUrl" TEXT,
  "example" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ApiProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiSubscription" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "appId" TEXT,
  "productId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "quota" INTEGER NOT NULL DEFAULT 0,
  "usedThisMonth" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ApiSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApiUsageRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "apiKeyId" TEXT,
  "appId" TEXT,
  "userId" TEXT,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "status" INTEGER NOT NULL,
  "durationMs" INTEGER NOT NULL DEFAULT 0,
  "channel" TEXT NOT NULL,
  "productSlug" TEXT,
  "tokensIn" INTEGER NOT NULL DEFAULT 0,
  "tokensOut" INTEGER NOT NULL DEFAULT 0,
  "aiCostMicros" INTEGER NOT NULL DEFAULT 0,
  "sourceIp" TEXT,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "permission" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ApiUsageRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiKey_appId_idx" ON "ApiKey"("appId");
CREATE INDEX "DeveloperApp_organizationId_idx" ON "DeveloperApp"("organizationId");
CREATE INDEX "DeveloperApp_ownerId_idx" ON "DeveloperApp"("ownerId");
CREATE UNIQUE INDEX "ApiProduct_organizationId_slug_key" ON "ApiProduct"("organizationId", "slug");
CREATE INDEX "ApiProduct_organizationId_idx" ON "ApiProduct"("organizationId");
CREATE INDEX "ApiSubscription_organizationId_idx" ON "ApiSubscription"("organizationId");
CREATE INDEX "ApiSubscription_appId_idx" ON "ApiSubscription"("appId");
CREATE UNIQUE INDEX "ApiSubscription_appId_productId_key" ON "ApiSubscription"("appId", "productId");
CREATE INDEX "ApiUsageRecord_organizationId_createdAt_idx" ON "ApiUsageRecord"("organizationId", "createdAt");
CREATE INDEX "ApiUsageRecord_apiKeyId_idx" ON "ApiUsageRecord"("apiKeyId");
CREATE INDEX "ApiUsageRecord_endpoint_idx" ON "ApiUsageRecord"("endpoint");
CREATE INDEX "ApiUsageRecord_appId_idx" ON "ApiUsageRecord"("appId");

ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_appId_fkey"
  FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeveloperApp"
  ADD CONSTRAINT "DeveloperApp_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeveloperApp"
  ADD CONSTRAINT "DeveloperApp_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiProduct"
  ADD CONSTRAINT "ApiProduct_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiSubscription"
  ADD CONSTRAINT "ApiSubscription_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiSubscription"
  ADD CONSTRAINT "ApiSubscription_appId_fkey"
  FOREIGN KEY ("appId") REFERENCES "DeveloperApp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiSubscription"
  ADD CONSTRAINT "ApiSubscription_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "ApiProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiUsageRecord"
  ADD CONSTRAINT "ApiUsageRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiUsageRecord"
  ADD CONSTRAINT "ApiUsageRecord_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
