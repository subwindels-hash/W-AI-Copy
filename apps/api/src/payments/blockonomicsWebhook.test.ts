import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  payments: [] as any[], events: [] as any[], providerPayments: [] as any[], monitorStatus: 0, audits: [] as any[],
}));

vi.mock("../db/client.js", () => {
  const prisma: any = {
    paymentWebhookEvent: {
      findUnique: vi.fn(async ({ where }: any) => state.events.find((event) => event.eventKey === where.eventKey) ?? null),
      create: vi.fn(async ({ data }: any) => {
        if (state.events.some((event) => event.eventKey === data.eventKey)) throw Object.assign(new Error("unique"), { code: "P2002" });
        const event = { id: `evt-${state.events.length + 1}`, ...data, receivedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), processedAt: null };
        state.events.push(event); return event;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const index = state.events.findIndex((event) => event.id === where.id);
        const patch = { ...data };
        if (data.attempts?.increment) patch.attempts = state.events[index].attempts + data.attempts.increment;
        state.events[index] = { ...state.events[index], ...patch, updatedAt: new Date() };
        return state.events[index];
      }),
    },
    paymentRecord: {
      findUnique: vi.fn(async ({ where }: any) => state.payments.find((payment) => payment.id === where.id) ?? null),
      findMany: vi.fn(async ({ where, take }: any) => state.payments.filter((payment) => {
        if (where.provider && payment.provider !== where.provider) return false;
        if (where.paymentAddress && payment.paymentAddress !== where.paymentAddress) return false;
        if (where.cryptoCurrency && payment.cryptoCurrency !== where.cryptoCurrency) return false;
        if (where.organizationId && payment.organizationId !== where.organizationId) return false;
        if (where.status?.notIn?.includes(payment.status)) return false;
        return true;
      }).slice(0, take ?? 20)),
      findFirst: vi.fn(async ({ where }: any) => state.payments.find((payment) => {
        if (where.id && typeof where.id === "string" && payment.id !== where.id) return false;
        if (where.id?.not && payment.id === where.id.not) return false;
        if (where.organizationId && payment.organizationId !== where.organizationId) return false;
        if (where.provider && payment.provider !== where.provider) return false;
        if (where.providerTransactionId && payment.providerTransactionId !== where.providerTransactionId) return false;
        return true;
      }) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const index = state.payments.findIndex((payment) => payment.id === where.id);
        state.payments[index] = { ...state.payments[index], ...data, updatedAt: new Date() };
        return state.payments[index];
      }),
    },
  };
  prisma.auditLog = { create: vi.fn(async ({ data }: any) => { state.audits.push(data); return { id: `audit-${state.audits.length}`, ...data }; }) };
  prisma.$transaction = vi.fn(async (work: any) => work(prisma));
  return { prisma };
});

vi.mock("../services/billing.service.js", () => ({
  settleConfirmedBlockonomicsPayment: vi.fn(async (paymentId: string) => {
    const index = state.payments.findIndex((payment) => payment.id === paymentId);
    state.payments[index] = { ...state.payments[index], status: "completed", completedAt: new Date() };
    return { payment: state.payments[index], invoicePaid: true, idempotent: false };
  }),
}));

vi.mock("./blockonomics.service.js", () => {
  class Client {
    async listConfirmedPayments() { return state.providerPayments; }
    async monitorUsdtTransaction() { return state.monitorStatus; }
  }
  return {
    BlockonomicsConfigService: { secret: vi.fn(async () => ({ enabled: true, testMode: true, matchCallback: "payments.example.test", supportedAssets: ["BTC", "USDT"], quoteExpiryMinutes: 15, requiredConfirmations: 2, apiKey: "key", callbackSecret: "callback-secret-value-at-least-32-chars", source: "database", version: 1 })) },
    BlockonomicsClient: Client,
    configuredBlockonomicsClient: vi.fn(async () => new Client()),
  };
});

const { BlockonomicsPaymentService } = await import("./blockonomicsPayment.service.js");

function payment(overrides: Record<string, unknown> = {}) {
  const row = {
    id: `pay-${state.payments.length + 1}`, organizationId: "org-a", requestedById: "user-a",
    provider: "blockonomics", internalReference: "BLK_REF", providerPaymentId: "bc1q" + "x".repeat(38),
    providerTransactionId: null, providerStatus: "address_created", status: "pending",
    amountCents: 10000, currency: "USD", cryptoCurrency: "BTC", cryptoNetwork: "btc",
    paymentAddress: "bc1q" + "x".repeat(38), expectedCryptoUnits: 200000n, receivedCryptoUnits: null,
    quotePrice: 50000, quoteSource: "blockonomics:/price", quoteObservedAt: new Date(),
    confirmations: 0, requiredConfirmations: 2, expiresAt: new Date(Date.now() + 600_000),
    detectedAt: null, confirmedAt: null, completedAt: null,
    reconciliationStatus: "pending", metadata: {}, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
  state.payments.push(row); return row;
}
function callback(row: any, overrides: Record<string, unknown> = {}) {
  return {
    secret: "callback-secret-value-at-least-32-chars", addr: row.paymentAddress, crypto: row.cryptoCurrency,
    status: 0, value: 200000n, txid: "f".repeat(64), ...overrides,
  } as any;
}

beforeEach(() => { state.payments.length = 0; state.events.length = 0; state.providerPayments.length = 0; state.audits.length = 0; state.monitorStatus = 0; });

describe("Blockonomics Stage 5 callback processing", () => {
  it("rejects an invalid callback secret before persistence", async () => {
    const row = payment();
    await expect(BlockonomicsPaymentService.processCallback(callback(row, { secret: "wrong-secret-value" }))).rejects.toMatchObject({ status: 401 });
    expect(state.events).toHaveLength(0);
    expect(row.status).toBe("pending");
  });

  it("records unconfirmed and one-confirmation progression without financial completion", async () => {
    const row = payment();
    const detected = await BlockonomicsPaymentService.processCallback(callback(row, { status: 0 }));
    expect(detected.payment?.status).toBe("detected");
    expect(state.payments[0]).toMatchObject({ status: "detected", confirmations: 0, providerTransactionId: "f".repeat(64) });
    const confirming = await BlockonomicsPaymentService.processCallback(callback(row, { status: 1 }));
    expect(confirming.payment?.status).toBe("confirming");
    expect(state.payments[0].completedAt).toBeNull();
  });

  it("independently reconciles exact final payment and delegates one atomic settlement", async () => {
    const row = payment();
    state.providerPayments.push({ id: 42, timestamp: 1, crypto: "BTC", amount: 200000, address: row.paymentAddress, txid: "f".repeat(64) });
    const result = await BlockonomicsPaymentService.processCallback(callback(row, { status: 2 }));
    expect(result.payment).toMatchObject({ status: "completed", reconciliationStatus: "matched", confirmations: 2 });
    expect(state.payments[0].completedAt).toBeTruthy();
  });

  it("processes the same provider event exactly once", async () => {
    const row = payment();
    await BlockonomicsPaymentService.processCallback(callback(row, { status: 0 }));
    const duplicate = await BlockonomicsPaymentService.processCallback(callback(row, { status: 0 }));
    expect(duplicate.duplicate).toBe(true);
    expect(state.events).toHaveLength(1);
    expect(state.events[0].attempts).toBe(1);
  });

  it("sends underpayment and overpayment to review", async () => {
    const under = payment({ id: "under", internalReference: "UNDER" });
    await expect(BlockonomicsPaymentService.processCallback(callback(under, { txid: "a".repeat(64), value: 199999n }))).resolves.toMatchObject({ payment: { status: "under_review", reconciliationStatus: "underpaid" } });
    const over = payment({ id: "over", internalReference: "OVER", paymentAddress: "bc1q" + "o".repeat(38), providerPaymentId: "bc1q" + "o".repeat(38) });
    await expect(BlockonomicsPaymentService.processCallback(callback(over, { addr: over.paymentAddress, txid: "b".repeat(64), value: 200001n }))).resolves.toMatchObject({ payment: { status: "under_review", reconciliationStatus: "overpaid" } });
  });

  it("records unknown callbacks as ignored for administration", async () => {
    const result = await BlockonomicsPaymentService.processCallback({ secret: "callback-secret-value-at-least-32-chars", addr: "bc1q" + "u".repeat(38), crypto: "BTC", status: 2, value: 1n, txid: "c".repeat(64) } as any);
    expect(result).toMatchObject({ ignored: true, payment: null });
    expect(state.events[0]).toMatchObject({ processingStatus: "ignored", errorCode: "PAYMENT_NOT_RESOLVED" });
  });

  it("routes exact late final payments to review rather than auto-credit", async () => {
    const row = payment({ expiresAt: new Date(Date.now() - 1000) });
    state.providerPayments.push({ id: 1, timestamp: 1, crypto: "BTC", amount: 200000, address: row.paymentAddress, txid: "f".repeat(64) });
    const result = await BlockonomicsPaymentService.processCallback(callback(row, { status: 2 }));
    expect(result.payment).toMatchObject({ status: "under_review", reconciliationStatus: "late_payment" });
  });
});

describe("Blockonomics USDT transaction monitoring", () => {
  it("submits tx hash server-side and never completes from browser state", async () => {
    const row = payment({ cryptoCurrency: "USDT", cryptoNetwork: "eth_erc20", paymentAddress: "0x" + "d".repeat(40), expectedCryptoUnits: 100000000n });
    state.monitorStatus = 2;
    const txhash = "0x" + "e".repeat(64);
    const result = await BlockonomicsPaymentService.monitorUsdtTransaction("org-a", "user-a", row.id, txhash);
    expect(result).toMatchObject({ status: "confirming", providerStatus: "2", reconciliationStatus: "required" });
    expect(state.payments[0].completedAt).toBeNull();
    expect(state.audits).toContainEqual(expect.objectContaining({ action: "payment.blockonomics.monitor_requested", resourceId: row.id, userId: "user-a" }));
  });

  it("enforces organization, requester, asset, and tx-hash uniqueness", async () => {
    const row = payment({ cryptoCurrency: "USDT", cryptoNetwork: "eth_erc20", paymentAddress: "0x" + "d".repeat(40) });
    await expect(BlockonomicsPaymentService.monitorUsdtTransaction("org-b", "user-a", row.id, "0x" + "1".repeat(64))).rejects.toMatchObject({ status: 404 });
    await expect(BlockonomicsPaymentService.monitorUsdtTransaction("org-a", "user-b", row.id, "0x" + "1".repeat(64))).rejects.toMatchObject({ status: 403 });
    const btc = payment({ id: "btc", internalReference: "BTC2", paymentAddress: "bc1q" + "b".repeat(38) });
    await expect(BlockonomicsPaymentService.monitorUsdtTransaction("org-a", "user-a", btc.id, "0x" + "2".repeat(64))).rejects.toMatchObject({ status: 400 });
    payment({ id: "other", internalReference: "OTHER", providerTransactionId: "0x" + "3".repeat(64) });
    await expect(BlockonomicsPaymentService.monitorUsdtTransaction("org-a", "user-a", row.id, "0x" + "3".repeat(64))).rejects.toMatchObject({ status: 409 });
  });
});
