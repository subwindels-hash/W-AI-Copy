import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  payment: null as any, invoice: null as any, subscription: null as any,
  allocations: [] as any[], ledger: [] as any[], audits: [] as any[],
}));

vi.mock("../db/client.js", () => {
  const tx = {
    paymentRecord: {
      findUnique: vi.fn(async ({ where }: any) => state.payment?.id === where.id ? state.payment : null),
      update: vi.fn(async ({ data }: any) => (state.payment = { ...state.payment, ...data })),
    },
    invoice: {
      findUnique: vi.fn(async ({ where }: any) => state.invoice?.id === where.id ? state.invoice : null),
      findFirst: vi.fn(async ({ where }: any) => state.invoice?.id === where.id && state.invoice.organizationId === where.organizationId ? state.invoice : null),
      update: vi.fn(async ({ data }: any) => (state.invoice = { ...state.invoice, ...data })),
    },
    invoicePaymentAllocation: {
      findUnique: vi.fn(async ({ where }: any) => {
        const key = where.invoiceId_sourceKind_sourceId;
        return state.allocations.find((item) => item.invoiceId === key.invoiceId && item.sourceKind === key.sourceKind && item.sourceId === key.sourceId) ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const item = { id: `alloc-${state.allocations.length + 1}`, ...data }; state.allocations.push(item); return item;
      }),
      findMany: vi.fn(async ({ where }: any) => state.allocations.filter((item) => item.invoiceId === where.invoiceId && item.status === where.status && item.currency === where.currency)),
    },
    billingLedgerEntry: {
      findUnique: vi.fn(async ({ where }: any) => state.ledger.find((item) => item.journalKey === where.journalKey) ?? null),
      create: vi.fn(async ({ data }: any) => { const item = { id: `ledger-${state.ledger.length + 1}`, ...data }; state.ledger.push(item); return item; }),
    },
    billingSubscription: {
      update: vi.fn(async ({ where, data }: any) => {
        if (!state.subscription || state.subscription.id !== where.id) throw new Error("subscription missing");
        return (state.subscription = { ...state.subscription, ...data });
      }),
    },
    auditLog: { create: vi.fn(async ({ data }: any) => { state.audits.push(data); return { id: `audit-${state.audits.length}`, ...data }; }) },
  };
  return { prisma: { ...tx, $transaction: vi.fn(async (fn: any) => fn(tx)) } };
});

const { settleConfirmedBlockonomicsPayment } = await import("../services/billing.service.js");

function seed(overrides: Record<string, unknown> = {}) {
  state.subscription = { id: "sub-1", organizationId: "org-a", status: "past_due" };
  state.invoice = { id: "inv-1", organizationId: "org-a", subscriptionId: "sub-1", number: "INV-1", amountCents: 10000, currency: "USD", status: "open", paidAt: null };
  state.payment = {
    id: "pay-1", organizationId: "org-a", requestedById: "user-a", invoiceId: "inv-1", subscriptionId: "sub-1",
    provider: "blockonomics", providerTransactionId: "tx-1", status: "confirmed", reconciliationStatus: "matched",
    amountCents: 10000, currency: "USD", cryptoCurrency: "BTC", metadata: {}, completedAt: null,
    ...overrides,
  };
}

beforeEach(() => { state.allocations.length = 0; state.ledger.length = 0; state.audits.length = 0; seed(); vi.clearAllMocks(); });

describe("Blockonomics Stage 6 atomic billing settlement", () => {
  it("applies allocation, balanced journal, invoice, subscription, receipt, and audit exactly once", async () => {
    const result = await settleConfirmedBlockonomicsPayment("pay-1");
    expect(result).toMatchObject({ invoicePaid: true, idempotent: false, appliedCents: 10000 });
    expect(state.allocations).toHaveLength(1);
    expect(state.allocations[0]).toMatchObject({ sourceKind: "provider_payment", amountCents: 10000, status: "applied" });
    expect(state.ledger).toHaveLength(1);
    expect(state.ledger[0]).toMatchObject({
      journalKey: "blockonomics:payment:pay-1", amountCents: 10000,
      debitAccount: "crypto_cash:blockonomics", creditAccount: "accounts_receivable",
    });
    expect(state.invoice).toMatchObject({ status: "paid" });
    expect(state.subscription).toMatchObject({ status: "active" });
    expect(state.payment).toMatchObject({ status: "completed" });
    expect(state.payment.metadata.receipt.number).toBe("RCT-pay-1");
    expect(state.audits).toHaveLength(1);

    const retry = await settleConfirmedBlockonomicsPayment("pay-1");
    expect(retry.idempotent).toBe(true);
    expect(state.allocations).toHaveLength(1);
    expect(state.ledger).toHaveLength(1);
    expect(state.audits).toHaveLength(1);
  });

  it("combines an existing WMPC allocation with the provider remainder", async () => {
    state.payment.amountCents = 6000;
    state.allocations.push({ id: "alloc-gift", organizationId: "org-a", invoiceId: "inv-1", paymentId: null, sourceKind: "gift_card", sourceId: "gift-1", amountCents: 4000, currency: "USD", status: "applied" });
    const result = await settleConfirmedBlockonomicsPayment("pay-1");
    expect(result).toMatchObject({ invoicePaid: true, appliedCents: 10000 });
    expect(state.allocations).toHaveLength(2);
    expect(state.ledger).toHaveLength(1);
  });

  it("completes a partial provider contribution without falsely paying the invoice", async () => {
    state.payment.amountCents = 6000;
    const result = await settleConfirmedBlockonomicsPayment("pay-1");
    expect(result.invoicePaid).toBe(false);
    expect(state.invoice.status).toBe("open");
    expect(state.subscription.status).toBe("past_due");
    expect(state.payment.status).toBe("completed");
  });

  it("refuses ineligible or mismatched payments before ledger mutation", async () => {
    state.payment.status = "confirming";
    await expect(settleConfirmedBlockonomicsPayment("pay-1")).rejects.toThrow(/not eligible/i);
    state.payment.status = "confirmed"; state.payment.currency = "EUR";
    await expect(settleConfirmedBlockonomicsPayment("pay-1")).rejects.toThrow(/currency/i);
    expect(state.allocations).toHaveLength(0);
    expect(state.ledger).toHaveLength(0);
  });

  it("routes confirmed payments without an invoice/entitlement target to review", async () => {
    state.payment.invoiceId = null;
    const result = await settleConfirmedBlockonomicsPayment("pay-1");
    expect(result.payment).toMatchObject({ status: "under_review", reconciliationStatus: "entitlement_target_missing" });
    expect(state.allocations).toHaveLength(0);
    expect(state.ledger).toHaveLength(0);
    expect(state.audits[0]).toMatchObject({ action: "billing.payment.under_review" });
  });

  it("rejects allocation overflow rather than hiding a discrepancy", async () => {
    state.allocations.push({ id: "alloc-existing", invoiceId: "inv-1", sourceKind: "gift_card", sourceId: "gift-1", amountCents: 9000, currency: "USD", status: "applied" });
    state.payment.amountCents = 2000;
    await expect(settleConfirmedBlockonomicsPayment("pay-1")).rejects.toThrow(/exceed/i);
  });
});
