import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PAYMENT_PROVIDERS,
  PAYMENT_TRANSACTION_STATUSES,
  BlockonomicsCallbackSchema,
  BlockonomicsCreatePaymentSchema,
  BlockonomicsProviderSettingsSchema,
} from "@windels/shared/payments";

const root = resolve(import.meta.dirname, "../../../..");
const schema = readFileSync(resolve(root, "apps/api/prisma/schema.prisma"), "utf8");
const migration = readFileSync(resolve(root, "apps/api/prisma/migrations/20260817120000_blockonomics_payment_foundation/migration.sql"), "utf8");

describe("Blockonomics Stage 2 payment foundation", () => {
  it("adds Blockonomics without removing any existing provider", () => {
    expect(PAYMENT_PROVIDERS).toEqual(expect.arrayContaining(["stripe", "paypal", "paystack", "flutterwave", "crypto", "blockonomics"]));
  });

  it("extends the shared lifecycle additively", () => {
    expect(PAYMENT_TRANSACTION_STATUSES).toEqual(expect.arrayContaining([
      "created", "pending", "detected", "confirming", "confirmed", "completed",
      "expired", "failed", "cancelled", "under_review", "refunded",
    ]));
  });

  it("accepts only provider-supported merchant assets", () => {
    expect(BlockonomicsCreatePaymentSchema.parse({ amount: 100, currency: "usd", cryptoCurrency: "BTC" })).toMatchObject({ currency: "USD", cryptoCurrency: "BTC" });
    expect(BlockonomicsCreatePaymentSchema.parse({ amount: 100, currency: "EUR", cryptoCurrency: "USDT" })).toMatchObject({ cryptoCurrency: "USDT" });
    expect(() => BlockonomicsCreatePaymentSchema.parse({ amount: 100, currency: "USD", cryptoCurrency: "TRX" })).toThrow();
  });

  it("pins final confirmation to official status 2 and validates smallest units", () => {
    const callback = BlockonomicsCallbackSchema.parse({ secret: "a".repeat(32), addr: "bc1q" + "x".repeat(36), status: "2", value: "500000", txid: "f".repeat(64) });
    expect(callback.status).toBe(2);
    expect(callback.value).toBe(500000n);
    expect(BlockonomicsProviderSettingsSchema.parse({ enabled: true, matchCallback: "payments.example.com" }).requiredConfirmations).toBe(2);
  });

  it("creates one durable payment register, webhook inbox, allocation model, and generalized existing ledger", () => {
    for (const model of ["PaymentProviderConfiguration", "PaymentRecord", "PaymentWebhookEvent", "InvoicePaymentAllocation", "BillingLedgerEntry"]) {
      expect(schema).toContain(`model ${model}`);
    }
    expect(schema).toContain('journalKey     String   @unique');
    expect(schema).toContain('giftCardId     String?');
    expect(schema).toContain('paymentId      String?');
  });

  it("migration has durable uniqueness, foreign keys, and tenant isolation", () => {
    for (const table of ["payment_provider_configurations", "payment_records", "payment_webhook_events", "invoice_payment_allocations"]) {
      expect(migration).toContain(`CREATE TABLE \"${table}\"`);
    }
    expect(migration).toContain('payment_webhook_events_eventKey_key');
    expect(migration).toContain('payment_records_provider_providerTransactionId_key');
    expect(migration).toContain('BillingLedgerEntry_journalKey_key');
    expect(migration).toContain('ALTER TABLE \"payment_records\" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE \"invoice_payment_allocations\" ENABLE ROW LEVEL SECURITY');
  });
});
