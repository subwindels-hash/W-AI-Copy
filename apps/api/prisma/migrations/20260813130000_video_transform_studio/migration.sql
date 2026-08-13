-- AI Video Transformation Studio (Switch X)
CREATE TABLE IF NOT EXISTS "video_transform_jobs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workflowId" TEXT,
  "kind" TEXT NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'QUEUED',
  "status" TEXT NOT NULL DEFAULT 'queued',
  "percent" INTEGER NOT NULL DEFAULT 0,
  "message" TEXT,
  "input" JSONB NOT NULL,
  "resultAssetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "versions" JSONB NOT NULL DEFAULT '[]',
  "error" TEXT,
  "errorCode" TEXT,
  "retriable" BOOLEAN NOT NULL DEFAULT false,
  "modelId" TEXT,
  "providerId" TEXT,
  "creditsUsed" INTEGER NOT NULL DEFAULT 0,
  "estimatedCredits" INTEGER NOT NULL DEFAULT 0,
  "estimatedSeconds" INTEGER NOT NULL DEFAULT 0,
  "durationSec" DOUBLE PRECISION,
  "resolution" TEXT,
  "qualityReport" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "video_transform_jobs_org_created_idx" ON "video_transform_jobs" ("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "video_transform_jobs_org_status_idx" ON "video_transform_jobs" ("organizationId", "status");

CREATE TABLE IF NOT EXISTS "video_transform_workflows" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "nodes" JSONB NOT NULL DEFAULT '[]',
  "connections" JSONB NOT NULL DEFAULT '[]',
  "version" INTEGER NOT NULL DEFAULT 1,
  "isTemplate" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "video_transform_workflows_org_updated_idx" ON "video_transform_workflows" ("organizationId", "updatedAt");
