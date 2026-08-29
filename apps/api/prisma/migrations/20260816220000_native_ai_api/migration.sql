-- WINDELS Native AI API and External Agent Platform
-- Extends the existing API key, usage, billing and agent systems additively.

ALTER TABLE "ApiUsageRecord" ADD COLUMN IF NOT EXISTS "requestId" TEXT;
ALTER TABLE "ApiUsageRecord" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "ApiUsageRecord" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "ApiUsageRecord" ADD COLUMN IF NOT EXISTS "toolCalls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ApiUsageRecord" ADD COLUMN IF NOT EXISTS "actualCostMicros" INTEGER;
ALTER TABLE "ApiUsageRecord" ADD COLUMN IF NOT EXISTS "errorCode" TEXT;
ALTER TABLE "ApiUsageRecord" ADD COLUMN IF NOT EXISTS "agentRuns" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ApiUsageRecord" ADD COLUMN IF NOT EXISTS "workflowExecutions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ApiUsageRecord" ADD COLUMN IF NOT EXISTS "images" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ApiUsageRecord" ADD COLUMN IF NOT EXISTS "audioSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ApiUsageRecord" ADD COLUMN IF NOT EXISTS "storageBytes" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "ApiUsageRecord_requestId_idx" ON "ApiUsageRecord"("requestId");
CREATE INDEX IF NOT EXISTS "ApiUsageRecord_model_idx" ON "ApiUsageRecord"("model");

CREATE TABLE IF NOT EXISTS "external_agent_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "apiKeyId" TEXT,
  "requestedById" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "model" TEXT,
  "input" JSONB NOT NULL,
  "output" JSONB NOT NULL DEFAULT '{}',
  "usage" JSONB NOT NULL DEFAULT '{}',
  "provider" TEXT,
  "toolCalls" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "cancelRequestedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_agent_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "external_agent_runs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "external_agent_runs_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "external_agent_runs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "external_agent_runs_org_idempotency_unique" UNIQUE("organizationId", "idempotencyKey")
);
CREATE INDEX IF NOT EXISTS "external_agent_runs_org_created_idx" ON "external_agent_runs"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "external_agent_runs_agent_created_idx" ON "external_agent_runs"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "external_agent_runs_api_key_idx" ON "external_agent_runs"("apiKeyId");
CREATE INDEX IF NOT EXISTS "external_agent_runs_status_idx" ON "external_agent_runs"("status");

CREATE TABLE IF NOT EXISTS "external_agent_messages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "toolCallId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_agent_messages_runId_fkey" FOREIGN KEY ("runId") REFERENCES "external_agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "external_agent_messages_run_created_idx" ON "external_agent_messages"("runId", "createdAt");

-- Tenant isolation follows the existing current-setting RLS contract.
ALTER TABLE "external_agent_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_agent_runs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "external_agent_runs_tenant_isolation" ON "external_agent_runs";
CREATE POLICY "external_agent_runs_tenant_isolation" ON "external_agent_runs"
  USING (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  )
  WITH CHECK (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

ALTER TABLE "external_agent_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_agent_messages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "external_agent_messages_tenant_isolation" ON "external_agent_messages";
CREATE POLICY "external_agent_messages_tenant_isolation" ON "external_agent_messages"
  USING (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "external_agent_runs"
      WHERE "external_agent_runs"."id" = "external_agent_messages"."runId"
        AND "external_agent_runs"."organizationId"::text = current_setting('app.current_organization_id', true)
    )
  )
  WITH CHECK (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "external_agent_runs"
      WHERE "external_agent_runs"."id" = "external_agent_messages"."runId"
        AND "external_agent_runs"."organizationId"::text = current_setting('app.current_organization_id', true)
    )
  );

-- Make the native AI API visible in the existing developer API marketplace.
INSERT INTO "ApiProduct" (
  "id", "organizationId", "slug", "name", "category", "description", "version",
  "requiredScopes", "basePriceUsd", "enabled", "rateLimitPerMin", "docsUrl", "example", "createdAt", "updatedAt"
)
SELECT
  'api-product-native-ai-v1', NULL, 'native-ai', 'WINDELS Native AI API', 'agents',
  'OpenAI-pattern chat, responses, real embeddings, files, health-gated multimodal APIs, and tenant-scoped WINDELS agent execution.',
  'v1', ARRAY['models:read','ai:execute']::TEXT[], 0.6, true, 120, '/docs/api#native-ai',
  '{"baseUrl":"https://api.windels.ai/v1","models":"GET /v1/models","chat":"POST /v1/chat/completions","responses":"POST /v1/responses","embeddings":"POST /v1/embeddings"}'::JSONB,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "ApiProduct" WHERE "organizationId" IS NULL AND "slug" = 'native-ai');
