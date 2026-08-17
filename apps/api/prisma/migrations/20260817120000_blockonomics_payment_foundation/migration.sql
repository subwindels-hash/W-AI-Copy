-- Blockonomics payment foundation (Stage 2)
-- Additive durable provider configuration, payment register, webhook inbox,
-- invoice allocations, and generalization of the existing billing ledger.

CREATE TABLE "payment_provider_configurations" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "testMode" BOOLEAN NOT NULL DEFAULT false,
  "apiKeyEnc" JSONB,
  "callbackSecretEnc" JSONB,
  "settings" JSONB NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "healthStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
  "lastHealthAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_provider_configurations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_provider_configurations_provider_key" ON "payment_provider_configurations"("provider");
CREATE INDEX "payment_provider_configurations_enabled_healthStatus_idx" ON "payment_provider_configurations"("enabled", "healthStatus");

CREATE TABLE "payment_records" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestedById" TEXT,
  "invoiceId" TEXT,
  "subscriptionId" TEXT,
  "provider" TEXT NOT NULL,
  "internalReference" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "providerTransactionId" TEXT,
  "providerStatus" TEXT,
  "status" TEXT NOT NULL DEFAULT 'created',
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "cryptoCurrency" TEXT,
  "cryptoNetwork" TEXT,
  "paymentAddress" TEXT,
  "expectedCryptoUnits" BIGINT,
  "receivedCryptoUnits" BIGINT,
  "quotePrice" DECIMAL(36,18),
  "quoteSource" TEXT,
  "quoteObservedAt" TIMESTAMP(3),
  "confirmations" INTEGER NOT NULL DEFAULT 0,
  "requiredConfirmations" INTEGER NOT NULL DEFAULT 2,
  "expiresAt" TIMESTAMP(3),
  "detectedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "reconciliationStatus" TEXT NOT NULL DEFAULT 'pending',
  "lastReconciledAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_records_provider_internalReference_key" ON "payment_records"("provider", "internalReference");
CREATE UNIQUE INDEX "payment_records_provider_providerTransactionId_key" ON "payment_records"("provider", "providerTransactionId");
CREATE INDEX "payment_records_organizationId_createdAt_idx" ON "payment_records"("organizationId", "createdAt");
CREATE INDEX "payment_records_organizationId_status_createdAt_idx" ON "payment_records"("organizationId", "status", "createdAt");
CREATE INDEX "payment_records_provider_paymentAddress_idx" ON "payment_records"("provider", "paymentAddress");
CREATE INDEX "payment_records_invoiceId_status_idx" ON "payment_records"("invoiceId", "status");
CREATE INDEX "payment_records_reconciliationStatus_updatedAt_idx" ON "payment_records"("reconciliationStatus", "updatedAt");

CREATE TABLE "payment_webhook_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "paymentId" TEXT,
  "provider" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "providerTransactionId" TEXT,
  "providerStatus" TEXT,
  "processingStatus" TEXT NOT NULL DEFAULT 'received',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payment_webhook_events_eventKey_key" ON "payment_webhook_events"("eventKey");
CREATE INDEX "payment_webhook_events_provider_receivedAt_idx" ON "payment_webhook_events"("provider", "receivedAt");
CREATE INDEX "payment_webhook_events_organizationId_receivedAt_idx" ON "payment_webhook_events"("organizationId", "receivedAt");
CREATE INDEX "payment_webhook_events_paymentId_receivedAt_idx" ON "payment_webhook_events"("paymentId", "receivedAt");
CREATE INDEX "payment_webhook_events_processingStatus_receivedAt_idx" ON "payment_webhook_events"("processingStatus", "receivedAt");

CREATE TABLE "invoice_payment_allocations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "paymentId" TEXT,
  "sourceKind" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'reserved',
  "appliedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoice_payment_allocations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoice_payment_allocations_invoiceId_sourceKind_sourceId_key" ON "invoice_payment_allocations"("invoiceId", "sourceKind", "sourceId");
CREATE INDEX "invoice_payment_allocations_organizationId_createdAt_idx" ON "invoice_payment_allocations"("organizationId", "createdAt");
CREATE INDEX "invoice_payment_allocations_invoiceId_status_idx" ON "invoice_payment_allocations"("invoiceId", "status");
CREATE INDEX "invoice_payment_allocations_paymentId_idx" ON "invoice_payment_allocations"("paymentId");

ALTER TABLE "BillingLedgerEntry" ALTER COLUMN "giftCardId" DROP NOT NULL;
ALTER TABLE "BillingLedgerEntry"
  ADD COLUMN "paymentId" TEXT,
  ADD COLUMN "sourceKind" TEXT NOT NULL DEFAULT 'gift_card',
  ADD COLUMN "journalKey" TEXT,
  ADD COLUMN "reversalOfId" TEXT,
  ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';
UPDATE "BillingLedgerEntry" SET "journalKey" = 'legacy:' || "id" WHERE "journalKey" IS NULL;
ALTER TABLE "BillingLedgerEntry" ALTER COLUMN "journalKey" SET NOT NULL;
CREATE UNIQUE INDEX "BillingLedgerEntry_journalKey_key" ON "BillingLedgerEntry"("journalKey");
CREATE INDEX "BillingLedgerEntry_paymentId_idx" ON "BillingLedgerEntry"("paymentId");
CREATE INDEX "BillingLedgerEntry_sourceKind_createdAt_idx" ON "BillingLedgerEntry"("sourceKind", "createdAt");

ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoice_payment_allocations" ADD CONSTRAINT "invoice_payment_allocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_payment_allocations" ADD CONSTRAINT "invoice_payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_payment_allocations" ADD CONSTRAINT "invoice_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant isolation for the new organization-scoped tables. Background provider
-- callbacks run without a tenant GUC and retain the established system-worker
-- escape hatch; authenticated requests with a tenant context are isolated.
ALTER TABLE "payment_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_records_tenant_isolation" ON "payment_records"
  USING (coalesce(current_setting('app.current_organization_id', true), '') = '' OR current_setting('app.bypass_rls', true) = 'true' OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (coalesce(current_setting('app.current_organization_id', true), '') = '' OR current_setting('app.bypass_rls', true) = 'true' OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "payment_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_webhook_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_webhook_events_tenant_isolation" ON "payment_webhook_events"
  USING (coalesce(current_setting('app.current_organization_id', true), '') = '' OR current_setting('app.bypass_rls', true) = 'true' OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (coalesce(current_setting('app.current_organization_id', true), '') = '' OR current_setting('app.bypass_rls', true) = 'true' OR "organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "invoice_payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_payment_allocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "invoice_payment_allocations_tenant_isolation" ON "invoice_payment_allocations"
  USING (coalesce(current_setting('app.current_organization_id', true), '') = '' OR current_setting('app.bypass_rls', true) = 'true' OR "organizationId" = current_setting('app.current_organization_id', true))
  WITH CHECK (coalesce(current_setting('app.current_organization_id', true), '') = '' OR current_setting('app.bypass_rls', true) = 'true' OR "organizationId" = current_setting('app.current_organization_id', true));
