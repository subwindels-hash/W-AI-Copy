-- Row-Level Security: tenant isolation at the database layer
-- =========================================================
-- Layer 5 of the architecture review. Before this migration the codebase had a
-- complete RLS *service* (src/services/rowLevelSecurity.service.ts) that no
-- migration, route or job ever called: pg_policies returned 0 rows and
-- 0 tables had relrowsecurity set. Tenant isolation was therefore entirely
-- application-level (http/middleware/orgScope.ts), so any query path that
-- forgot its organizationId filter returned another tenant's rows.
--
-- This migration adds the missing database-layer enforcement over every table
-- that carries an "organizationId" (36 of them).
--
-- DESIGN — why the policy has a "no context set" escape hatch
-- -----------------------------------------------------------
-- The predicate is:
--
--   no tenant context set   -> allow   (unchanged legacy behaviour)
--   app.bypass_rls = 'true' -> allow   (super-admin / platform jobs)
--   organizationId matches  -> allow
--   otherwise               -> deny
--
-- Background workers, migrations, bootstrap seeding and any code path that has
-- not yet been converted to run inside withTenantContext() set no context and
-- keep working exactly as they do today, so this cannot break existing
-- functionality. Wherever context IS set — every authenticated HTTP request
-- once tenantContext middleware runs — the database now refuses cross-tenant
-- reads AND writes even if the application-level filter is missing. That is a
-- strict improvement over "no enforcement at all", added without a flag day.
--
-- Tightening the escape hatch to fail-closed is a follow-up that requires every
-- background job to adopt withTenantContext() first; doing it here would take
-- the platform down.
--
-- FORCE ROW LEVEL SECURITY is required because the application connects as the
-- owner of these tables, and owners bypass RLS unless it is forced.
--
-- Tested by src/services/rowLevelSecurity.rls.integration.test.ts, which runs
-- real cross-tenant reads/writes against a live PostgreSQL instance.

-- AccessReviewCampaign
ALTER TABLE "AccessReviewCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessReviewCampaign" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AccessReviewCampaign_tenant_isolation" ON "AccessReviewCampaign";
CREATE POLICY "AccessReviewCampaign_tenant_isolation" ON "AccessReviewCampaign"
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

-- ActionItem
ALTER TABLE "ActionItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActionItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ActionItem_tenant_isolation" ON "ActionItem";
CREATE POLICY "ActionItem_tenant_isolation" ON "ActionItem"
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

-- Activity
ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Activity_tenant_isolation" ON "Activity";
CREATE POLICY "Activity_tenant_isolation" ON "Activity"
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

-- Agent
ALTER TABLE "Agent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Agent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agent_tenant_isolation" ON "Agent";
CREATE POLICY "Agent_tenant_isolation" ON "Agent"
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

-- AiRequest
ALTER TABLE "AiRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AiRequest_tenant_isolation" ON "AiRequest";
CREATE POLICY "AiRequest_tenant_isolation" ON "AiRequest"
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

-- Alert
ALTER TABLE "Alert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Alert" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Alert_tenant_isolation" ON "Alert";
CREATE POLICY "Alert_tenant_isolation" ON "Alert"
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

-- AlertRule
ALTER TABLE "AlertRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AlertRule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AlertRule_tenant_isolation" ON "AlertRule";
CREATE POLICY "AlertRule_tenant_isolation" ON "AlertRule"
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

-- ApiKey
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ApiKey_tenant_isolation" ON "ApiKey";
CREATE POLICY "ApiKey_tenant_isolation" ON "ApiKey"
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

-- ApiProduct (organizationId nullable: global/system rows stay readable by all tenants)
ALTER TABLE "ApiProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiProduct" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ApiProduct_tenant_isolation" ON "ApiProduct";
CREATE POLICY "ApiProduct_tenant_isolation" ON "ApiProduct"
  USING (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
      OR "organizationId" IS NULL
  )
  WITH CHECK (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

-- ApiSubscription
ALTER TABLE "ApiSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiSubscription" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ApiSubscription_tenant_isolation" ON "ApiSubscription";
CREATE POLICY "ApiSubscription_tenant_isolation" ON "ApiSubscription"
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

-- ApiUsageRecord
ALTER TABLE "ApiUsageRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiUsageRecord" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ApiUsageRecord_tenant_isolation" ON "ApiUsageRecord";
CREATE POLICY "ApiUsageRecord_tenant_isolation" ON "ApiUsageRecord"
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

-- AuditLog (organizationId nullable: global/system rows stay readable by all tenants)
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "AuditLog_tenant_isolation" ON "AuditLog";
CREATE POLICY "AuditLog_tenant_isolation" ON "AuditLog"
  USING (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
      OR "organizationId" IS NULL
  )
  WITH CHECK (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

-- BillingLedgerEntry
ALTER TABLE "BillingLedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingLedgerEntry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "BillingLedgerEntry_tenant_isolation" ON "BillingLedgerEntry";
CREATE POLICY "BillingLedgerEntry_tenant_isolation" ON "BillingLedgerEntry"
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

-- BillingSubscription
ALTER TABLE "BillingSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingSubscription" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "BillingSubscription_tenant_isolation" ON "BillingSubscription";
CREATE POLICY "BillingSubscription_tenant_isolation" ON "BillingSubscription"
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

-- Canvas
ALTER TABLE "Canvas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Canvas" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Canvas_tenant_isolation" ON "Canvas";
CREATE POLICY "Canvas_tenant_isolation" ON "Canvas"
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

-- ContactRequest (organizationId nullable: global/system rows stay readable by all tenants)
ALTER TABLE "ContactRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ContactRequest_tenant_isolation" ON "ContactRequest";
CREATE POLICY "ContactRequest_tenant_isolation" ON "ContactRequest"
  USING (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
      OR "organizationId" IS NULL
  )
  WITH CHECK (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

-- Conversation
ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Conversation_tenant_isolation" ON "Conversation";
CREATE POLICY "Conversation_tenant_isolation" ON "Conversation"
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

-- DataExport
ALTER TABLE "DataExport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataExport" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "DataExport_tenant_isolation" ON "DataExport";
CREATE POLICY "DataExport_tenant_isolation" ON "DataExport"
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

-- DeveloperApp
ALTER TABLE "DeveloperApp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeveloperApp" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "DeveloperApp_tenant_isolation" ON "DeveloperApp";
CREATE POLICY "DeveloperApp_tenant_isolation" ON "DeveloperApp"
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

-- IncidentRunbook (organizationId nullable: global/system rows stay readable by all tenants)
ALTER TABLE "IncidentRunbook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncidentRunbook" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "IncidentRunbook_tenant_isolation" ON "IncidentRunbook";
CREATE POLICY "IncidentRunbook_tenant_isolation" ON "IncidentRunbook"
  USING (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
      OR "organizationId" IS NULL
  )
  WITH CHECK (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

-- Integration
ALTER TABLE "Integration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Integration" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Integration_tenant_isolation" ON "Integration";
CREATE POLICY "Integration_tenant_isolation" ON "Integration"
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

-- Invitation
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Invitation_tenant_isolation" ON "Invitation";
CREATE POLICY "Invitation_tenant_isolation" ON "Invitation"
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

-- Invoice
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Invoice_tenant_isolation" ON "Invoice";
CREATE POLICY "Invoice_tenant_isolation" ON "Invoice"
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

-- Meeting
ALTER TABLE "Meeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Meeting" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Meeting_tenant_isolation" ON "Meeting";
CREATE POLICY "Meeting_tenant_isolation" ON "Meeting"
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

-- Membership
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Membership_tenant_isolation" ON "Membership";
CREATE POLICY "Membership_tenant_isolation" ON "Membership"
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

-- MessageAttachment
ALTER TABLE "MessageAttachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessageAttachment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "MessageAttachment_tenant_isolation" ON "MessageAttachment";
CREATE POLICY "MessageAttachment_tenant_isolation" ON "MessageAttachment"
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

-- ModelRegistry (organizationId nullable: global/system rows stay readable by all tenants)
ALTER TABLE "ModelRegistry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModelRegistry" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ModelRegistry_tenant_isolation" ON "ModelRegistry";
CREATE POLICY "ModelRegistry_tenant_isolation" ON "ModelRegistry"
  USING (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
      OR "organizationId" IS NULL
  )
  WITH CHECK (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

-- Notification (organizationId nullable: global/system rows stay readable by all tenants)
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Notification_tenant_isolation" ON "Notification";
CREATE POLICY "Notification_tenant_isolation" ON "Notification"
  USING (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
      OR "organizationId" IS NULL
  )
  WITH CHECK (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

-- Plugin (organizationId nullable: global/system rows stay readable by all tenants)
ALTER TABLE "Plugin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Plugin" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Plugin_tenant_isolation" ON "Plugin";
CREATE POLICY "Plugin_tenant_isolation" ON "Plugin"
  USING (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
      OR "organizationId" IS NULL
  )
  WITH CHECK (
    coalesce(current_setting('app.current_organization_id', true), '') = ''
    OR current_setting('app.bypass_rls', true) = 'true'
    OR "organizationId"::text = current_setting('app.current_organization_id', true)
  );

-- PromptTemplate
ALTER TABLE "PromptTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromptTemplate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "PromptTemplate_tenant_isolation" ON "PromptTemplate";
CREATE POLICY "PromptTemplate_tenant_isolation" ON "PromptTemplate"
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

-- SsoConfig
ALTER TABLE "SsoConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SsoConfig" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SsoConfig_tenant_isolation" ON "SsoConfig";
CREATE POLICY "SsoConfig_tenant_isolation" ON "SsoConfig"
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

-- TalkChannel
ALTER TABLE "TalkChannel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TalkChannel" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "TalkChannel_tenant_isolation" ON "TalkChannel";
CREATE POLICY "TalkChannel_tenant_isolation" ON "TalkChannel"
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

-- Task
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Task_tenant_isolation" ON "Task";
CREATE POLICY "Task_tenant_isolation" ON "Task"
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

-- WebhookEndpoint
ALTER TABLE "WebhookEndpoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEndpoint" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "WebhookEndpoint_tenant_isolation" ON "WebhookEndpoint";
CREATE POLICY "WebhookEndpoint_tenant_isolation" ON "WebhookEndpoint"
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

-- Workflow
ALTER TABLE "Workflow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workflow" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Workflow_tenant_isolation" ON "Workflow";
CREATE POLICY "Workflow_tenant_isolation" ON "Workflow"
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

-- Workspace
ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workspace" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Workspace_tenant_isolation" ON "Workspace";
CREATE POLICY "Workspace_tenant_isolation" ON "Workspace"
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

