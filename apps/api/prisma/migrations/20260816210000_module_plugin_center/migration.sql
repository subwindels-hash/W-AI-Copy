-- Super Admin Module & Plugin Deployment Center
-- Global platform registry: only Super Admin HTTP routes may mutate these rows.

DO $$ BEGIN CREATE TYPE "PlatformModuleLifecycle" AS ENUM (
  'UPLOADED','SCANNING','VALIDATING','COMPATIBILITY_CHECK','SANDBOX_TEST','VALIDATED','APPROVED',
  'INSTALLING','MIGRATING','HEALTH_CHECK','ACTIVE','DISABLED','FAILED','ROLLING_BACK',
  'QUARANTINED','REMOVING','REMOVED'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PlatformModuleHealth" AS ENUM ('UNKNOWN','HEALTHY','DEGRADED','UNHEALTHY','DISABLED','QUARANTINED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PlatformModuleOperationType" AS ENUM ('UPLOAD','VERIFY','SANDBOX_TEST','APPROVE','INSTALL','UPDATE','ENABLE','DISABLE','RESTART','HEALTH_CHECK','ROLLBACK','REMOVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PlatformModuleOperationStatus" AS ENUM ('PENDING','RUNNING','SUCCEEDED','FAILED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "platform_modules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "moduleKey" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "packageType" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "vendor" TEXT NOT NULL,
  "status" "PlatformModuleLifecycle" NOT NULL DEFAULT 'UPLOADED',
  "health" "PlatformModuleHealth" NOT NULL DEFAULT 'UNKNOWN',
  "currentVersion" TEXT,
  "activeReleaseId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "manifest" JSONB NOT NULL DEFAULT '{}',
  "configuration" JSONB NOT NULL DEFAULT '{}',
  "runtimeRegistration" JSONB NOT NULL DEFAULT '{}',
  "dependencies" JSONB NOT NULL DEFAULT '[]',
  "permissions" JSONB NOT NULL DEFAULT '[]',
  "installedById" TEXT,
  "installedAt" TIMESTAMP(3),
  "lastHealthCheckAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_modules_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "platform_modules_status_enabled_idx" ON "platform_modules"("status","enabled");
CREATE INDEX IF NOT EXISTS "platform_modules_health_idx" ON "platform_modules"("health");

CREATE TABLE IF NOT EXISTS "platform_module_releases" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "moduleRegistryId" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" "PlatformModuleLifecycle" NOT NULL DEFAULT 'UPLOADED',
  "checksum" TEXT NOT NULL UNIQUE,
  "artifactPath" TEXT NOT NULL,
  "packageSizeBytes" INTEGER NOT NULL,
  "manifest" JSONB NOT NULL,
  "signatureKeyId" TEXT,
  "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
  "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "compatibilityStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "sandboxStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "migrationStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "verificationReport" JSONB NOT NULL DEFAULT '{}',
  "sandboxReport" JSONB NOT NULL DEFAULT '{}',
  "healthReport" JSONB NOT NULL DEFAULT '{}',
  "rollbackMetadata" JSONB NOT NULL DEFAULT '{}',
  "previousReleaseId" TEXT,
  "uploadedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "installedById" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMP(3),
  "sandboxedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "installedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_module_releases_moduleRegistryId_fkey" FOREIGN KEY ("moduleRegistryId") REFERENCES "platform_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_module_releases_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_module_releases_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "platform_module_releases_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "platform_module_releases_module_version_unique" UNIQUE("moduleRegistryId","version")
);
CREATE INDEX IF NOT EXISTS "platform_module_releases_status_created_idx" ON "platform_module_releases"("status","createdAt");
CREATE INDEX IF NOT EXISTS "platform_module_releases_module_created_idx" ON "platform_module_releases"("moduleRegistryId","createdAt");

CREATE TABLE IF NOT EXISTS "platform_module_uploads" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "originalName" TEXT NOT NULL,
  "checksum" TEXT NOT NULL UNIQUE,
  "sizeBytes" INTEGER NOT NULL,
  "artifactPath" TEXT NOT NULL,
  "status" "PlatformModuleLifecycle" NOT NULL DEFAULT 'UPLOADED',
  "manifestId" TEXT,
  "manifestVersion" TEXT,
  "signatureKeyId" TEXT,
  "report" JSONB NOT NULL DEFAULT '{}',
  "uploadedById" TEXT NOT NULL,
  "releaseId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_module_uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_module_uploads_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "platform_module_releases"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "platform_module_uploads_status_created_idx" ON "platform_module_uploads"("status","createdAt");
CREATE INDEX IF NOT EXISTS "platform_module_uploads_manifest_idx" ON "platform_module_uploads"("manifestId","manifestVersion");

CREATE TABLE IF NOT EXISTS "platform_module_operations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "moduleRegistryId" TEXT NOT NULL,
  "releaseId" TEXT,
  "operationType" "PlatformModuleOperationType" NOT NULL,
  "status" "PlatformModuleOperationStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "correlationId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "fromVersion" TEXT,
  "toVersion" TEXT,
  "result" JSONB NOT NULL DEFAULT '{}',
  "logs" JSONB NOT NULL DEFAULT '[]',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_module_operations_moduleRegistryId_fkey" FOREIGN KEY ("moduleRegistryId") REFERENCES "platform_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_module_operations_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "platform_module_releases"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "platform_module_operations_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "platform_module_operations_module_created_idx" ON "platform_module_operations"("moduleRegistryId","createdAt");
CREATE INDEX IF NOT EXISTS "platform_module_operations_status_created_idx" ON "platform_module_operations"("status","createdAt");
