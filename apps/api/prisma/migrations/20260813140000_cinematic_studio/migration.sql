-- AI Video Studio (Cinematic)
CREATE TABLE IF NOT EXISTS "cinematic_projects" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "enhancedPrompt" TEXT,
  "negativePrompt" TEXT,
  "mode" TEXT NOT NULL,
  "style" TEXT NOT NULL,
  "aspectRatio" TEXT NOT NULL,
  "resolution" TEXT NOT NULL,
  "fps" INTEGER NOT NULL DEFAULT 24,
  "durationSec" DOUBLE PRECISION NOT NULL,
  "quality" TEXT NOT NULL DEFAULT 'standard',
  "audioEnabled" BOOLEAN NOT NULL DEFAULT true,
  "dialogueEnabled" BOOLEAN NOT NULL DEFAULT false,
  "musicEnabled" BOOLEAN NOT NULL DEFAULT true,
  "sfxEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lipSync" BOOLEAN NOT NULL DEFAULT false,
  "seed" BIGINT,
  "variation" INTEGER NOT NULL DEFAULT 1,
  "camera" JSONB NOT NULL,
  "lighting" JSONB NOT NULL,
  "references" JSONB NOT NULL DEFAULT '[]',
  "characterIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "storyboard" JSONB,
  "audioTracks" JSONB NOT NULL DEFAULT '[]',
  "generations" JSONB NOT NULL DEFAULT '[]',
  "finalAssetId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "cinematic_projects_org_updated_idx" ON "cinematic_projects" ("organizationId", "updatedAt");

CREATE TABLE IF NOT EXISTS "cinematic_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'QUEUED',
  "percent" INTEGER NOT NULL DEFAULT 0,
  "message" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "currentShotId" TEXT,
  "estimatedCredits" INTEGER NOT NULL DEFAULT 0,
  "creditsUsed" INTEGER NOT NULL DEFAULT 0,
  "modelId" TEXT,
  "providerId" TEXT,
  "multiShot" BOOLEAN NOT NULL DEFAULT false,
  "error" TEXT,
  "errorCode" TEXT,
  "retriable" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "cinematic_jobs_org_status_idx" ON "cinematic_jobs" ("organizationId", "status");
CREATE INDEX IF NOT EXISTS "cinematic_jobs_project_idx" ON "cinematic_jobs" ("projectId");

CREATE TABLE IF NOT EXISTS "cinematic_characters" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "ageRange" TEXT,
  "voiceId" TEXT,
  "style" TEXT,
  "clothing" TEXT,
  "attributes" JSONB NOT NULL DEFAULT '{}',
  "references" JSONB NOT NULL DEFAULT '[]',
  "identityKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "cinematic_characters_org_idx" ON "cinematic_characters" ("organizationId");
