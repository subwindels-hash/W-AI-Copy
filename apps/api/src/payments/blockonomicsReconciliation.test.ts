import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  local: [] as any[],
  provider: [] as any[],
  audits: [] as any[],
  locked: false,
}));
const settle = vi.hoisted(() => vi.fn(async (paymentId: string) => {
  const row = state.local.find((item) => item.id === paymentId);
  row.status = "completed";
  row.completedAt = new Date();
  return { payment: row };
}));

vi.mock("../db/redis.js", () => ({
  redisCmd: {
    set: vi.fn(async () => {
      if (state.locked) return null;
      state.locked = true;
      return "OK";
    }),
    eval: vi.fn(async () => { state.locked = false; return 1; }),
  },
}));

vi.mock("../db/client.js", () => {
  const paymentRecord = {
    findMany: vi.fn(async ({ where, take }: any) => state.local.filter((row) => row.provider === where.provider && row.cryptoCurrency === where.cryptoCurrency).slice(0, take)),
    update: vi.fn(async ({ where, data }: any) => {
      const row = state.local.find((item) => item.id === where.id);
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    }),
  };
  const auditLog = { create: vi.fn(async ({ data }: any) => { const row = { id: `audit-${state.audits.length + 1}`, ...data, createdAt: new Date() }; state.audits.push(row); return row; }) };
  const prisma = { paymentRecord, auditLog, $transaction: vi.fn(async (work: any) => work({ paymentRecord, auditLog })) };
  return { prisma };
});

vi.mock("../services/billing.service.js", () => ({ settleConfirmedBlockonomicsPayment: settle }));
vi.mock("./blockonomics.service.js", () => ({
  BlockonomicsConfigService: { secret: vi.fn(async () => ({ enabled: true, supportedAssets: ["BTC", "USDT"], apiKey: "key", callbackSecret: "secret", matchCallback: "example.test", testMode: true })) },
  BlockonomicsClient: class {
    async listConfirmedPayments(input: any) { return state.provider.filter((row) => row.crypto === input.crypto); }
  },
}));
vi.mock("@prisma/client", async () => ({ ...(await import("../testUtils/prismaClientMock.js")) }));

const { BlockonomicsReconciliationService } = await import("./blockonomicsReconciliation.service.js");
const indexSource = readFileSync(resolve(import.meta.dirname, "../index.ts"), "utf8");
const adminRouteSource = readFileSync(resolve(import.meta.dirname, "../http/routes/blockonomicsAdmin.ts"), "utf8");

function local(overrides: Record<string, any> = {}) {
  const row = {
    id: `pay-${state.local.length + 1}`,
    organizationId: "org-a",
    requestedById: "user-a",
    provider: "blockonomics",
    internalReference: `BLK_${state.local.length + 1}`,
    providerTransactionId: null,
    providerStatus: "address_created",
    status: "pending",
    amountCents: 1000,
    currency: "USD",
    cryptoCurrency: "BTC",
    cryptoNetwork: "btc",
    paymentAddress: `bc1q${String(state.local.length + 1).padEnd(38, "x")}`,
    expectedCryptoUnits: 100_000n,
    receivedCryptoUnits: null,
    confirmations: 0,
    requiredConfirmations: 2,
    expiresAt: new Date(Date.now() + 60_000),
    confirmedAt: null,
    completedAt: null,
    reconciliationStatus: "pending",
    lastReconciledAt: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  state.local.push(row);
  return row;
}

function provider(payment: any, overrides: Record<string, any> = {}) {
  const row = {
    id: state.provider.length + 1,
    timestamp: Math.floor(Date.now() / 1000),
    crypto: payment.cryptoCurrency,
    amount: Number(payment.expectedCryptoUnits),
    address: payment.paymentAddress,
    txid: `${state.provider.length + 1}`.padStart(64, "a"),
    ...overrides,
  };
  state.provider.push(row);
  return row;
}

beforeEach(() => {
  state.local.length = 0;
  state.provider.length = 0;
  state.audits.length = 0;
  state.locked = false;
  settle.mockClear();
});

describe("Blockonomics reconciliation", () => {
  it("connects both the scheduled worker and Super Admin manual trigger", () => {
    expect(indexSource).toContain("BLOCKONOMICS_RECONCILIATION_INTERVAL_MINUTES");
    expect(indexSource).toContain('trigger: "scheduled"');
    expect(adminRouteSource).toContain('admin.post("/reconcile"');
    expect(adminRouteSource).toContain('trigger: "manual"');
  });

  it("matches authenticated provider history and settles an exact pending payment", async () => {
    const payment = local();
    const chain = provider(payment);
    const result = await BlockonomicsReconciliationService.reconcile({ trigger: "manual", timeframe: "1M", actorId: "super-admin" });
    expect(result).toMatchObject({ localPaymentsScanned: 1, providerPaymentsScanned: 1, matched: 1, settled: 1, issues: [] });
    expect(payment).toMatchObject({ status: "completed", providerTransactionId: chain.txid, reconciliationStatus: "matched", confirmations: 2 });
    expect(settle).toHaveBeenCalledWith(payment.id);
    expect(state.audits.some((row) => row.action === "payment_provider.reconciliation_completed")).toBe(true);
  });

  it("moves under/overpayment to review without settlement or balance adjustment", async () => {
    const payment = local();
    provider(payment, { amount: 99_999 });
    const result = await BlockonomicsReconciliationService.reconcile({ trigger: "manual" });
    expect(result.issues).toContainEqual(expect.objectContaining({ kind: "amount_mismatch", paymentId: payment.id }));
    expect(payment).toMatchObject({ status: "under_review", reconciliationStatus: "underpaid", receivedCryptoUnits: 99_999n });
    expect(settle).not.toHaveBeenCalled();
  });

  it("does not misclassify a submitted but unconfirmed USDT hash as missing final evidence", async () => {
    const payment = local({
      cryptoCurrency: "USDT", cryptoNetwork: "eth_erc20", paymentAddress: `0x${"b".repeat(40)}`,
      providerTransactionId: `0x${"c".repeat(64)}`, status: "detected", confirmations: 0,
    });
    const result = await BlockonomicsReconciliationService.reconcile({ trigger: "scheduled" });
    expect(result.issues).toEqual([]);
    expect(payment).toMatchObject({ status: "detected", reconciliationStatus: "pending" });
  });

  it("flags missing completed provider evidence but never silently reverses completion", async () => {
    const payment = local({ status: "completed", providerTransactionId: "f".repeat(64), reconciliationStatus: "matched" });
    const result = await BlockonomicsReconciliationService.reconcile({ trigger: "scheduled" });
    expect(result.issues).toContainEqual(expect.objectContaining({ kind: "provider_payment_missing" }));
    expect(payment).toMatchObject({ status: "completed", reconciliationStatus: "provider_payment_missing" });
    expect(settle).not.toHaveBeenCalled();
  });

  it("detects duplicate and orphan provider transactions", async () => {
    const payment = local({ providerTransactionId: "d".repeat(64) });
    provider(payment, { txid: "d".repeat(64) });
    provider(payment, { txid: "d".repeat(64) });
    state.provider.push({ id: 3, timestamp: Math.floor(Date.now() / 1000), crypto: "BTC", amount: 50, address: "bc1q-orphan-address-xxxxxxxxxxxx", txid: "e".repeat(64) });
    const result = await BlockonomicsReconciliationService.reconcile({ trigger: "manual" });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "duplicate_provider_transaction", paymentId: payment.id }),
      expect.objectContaining({ kind: "orphan_provider_payment", providerTransactionId: "e".repeat(64) }),
    ]));
    expect(payment.status).toBe("under_review");
  });

  it("refuses an ambiguous shared-address USDT match", async () => {
    const address = `0x${"a".repeat(40)}`;
    const first = local({ cryptoCurrency: "USDT", cryptoNetwork: "eth_erc20", paymentAddress: address, expectedCryptoUnits: 10_000_000n });
    const second = local({ cryptoCurrency: "USDT", cryptoNetwork: "eth_erc20", paymentAddress: address, expectedCryptoUnits: 10_000_000n });
    provider(first, { crypto: "USDT", address, amount: 10_000_000 });
    const result = await BlockonomicsReconciliationService.reconcile({ trigger: "manual" });
    expect(result.issues.filter((issue) => issue.kind === "ambiguous_provider_match")).toHaveLength(2);
    expect(first.status).toBe("under_review");
    expect(second.status).toBe("under_review");
    expect(settle).not.toHaveBeenCalled();
  });

  it("uses a distributed lock to reject overlapping runs", async () => {
    state.locked = true;
    await expect(BlockonomicsReconciliationService.reconcile({ trigger: "manual" })).rejects.toMatchObject({ status: 409 });
  });
});
