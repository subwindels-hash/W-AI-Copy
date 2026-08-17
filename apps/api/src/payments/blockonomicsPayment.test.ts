import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  payments: [] as any[],
  invoices: new Map<string, any>(),
  failAddress: false,
  price: 50_000,
  address: "bc1q" + "z".repeat(38), allocatedCents: 0,
}));

vi.mock("../db/client.js", () => ({
  prisma: {
    invoice: { findFirst: vi.fn(async ({ where }: any) => {
      const invoice = state.invoices.get(where.id);
      return invoice?.organizationId === where.organizationId ? invoice : null;
    }) },
    invoicePaymentAllocation: { aggregate: vi.fn(async () => ({ _sum: { amountCents: state.allocatedCents || null } })) },
    paymentRecord: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `pay-${state.payments.length + 1}`, ...data, confirmations: 0, reconciliationStatus: data.reconciliationStatus ?? "pending", metadata: data.metadata ?? {}, createdAt: new Date(), updatedAt: new Date(), completedAt: null };
        state.payments.push(row); return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const index = state.payments.findIndex((row) => row.id === where.id);
        state.payments[index] = { ...state.payments[index], ...data, updatedAt: new Date() };
        return state.payments[index];
      }),
      findFirst: vi.fn(async ({ where }: any) => state.payments.find((row) => row.id === where.id && row.organizationId === where.organizationId && row.provider === where.provider) ?? null),
      findMany: vi.fn(async ({ where, take }: any) => state.payments.filter((row) => row.organizationId === where.organizationId && row.provider === where.provider).slice(0, take)),
    },
  },
}));

vi.mock("./blockonomics.service.js", () => ({
  BlockonomicsConfigService: {
    secret: vi.fn(async () => ({ enabled: true, testMode: true, matchCallback: "payments.example.test", supportedAssets: ["BTC", "USDT"], quoteExpiryMinutes: 15, requiredConfirmations: 2, apiKey: "key", callbackSecret: "secret", source: "database", version: 1 })),
  },
  BlockonomicsClient: class {
    async getPrice() { return state.price; }
    async createAddress(asset: string) {
      expect(state.payments.at(-1)?.status).toBe("created");
      if (state.failAddress) throw Object.assign(new Error("provider unavailable"), { status: 502 });
      return { address: state.address, crypto: asset, reset: 0 };
    }
  },
}));

const { BlockonomicsPaymentService } = await import("./blockonomicsPayment.service.js");

beforeEach(() => {
  state.payments.length = 0;
  state.invoices.clear();
  state.failAddress = false;
  state.price = 50_000;
  state.address = "bc1q" + "z".repeat(38);
  state.allocatedCents = 0;
});

describe("Blockonomics Stage 4 durable payment creation", () => {
  it("persists CREATED before address allocation and returns PENDING instructions", async () => {
    const payment = await BlockonomicsPaymentService.create("org-a", "user-a", { amount: 100, currency: "USD", cryptoCurrency: "BTC", customerEmail: "buyer@example.test" });
    expect(payment).toMatchObject({ provider: "blockonomics", status: "pending", amount: 100, currency: "USD", cryptoCurrency: "BTC", cryptoNetwork: "btc", cryptoAddress: state.address });
    expect(payment.expectedCryptoUnits).toBe("200000");
    expect(payment.cryptoAmount).toBe(0.002);
    expect(payment.requiredConfirmations).toBe(2);
    expect(payment.expiresAt).toBeTruthy();
    expect(state.payments[0]).toMatchObject({ status: "pending", quoteSource: "blockonomics:/price", requestedById: "user-a" });
  });

  it("uses six-decimal base units for USDT ERC-20", async () => {
    state.price = 1;
    state.address = "0x" + "a".repeat(40);
    const payment = await BlockonomicsPaymentService.create("org-a", "user-a", { amount: 12.34, currency: "USD", cryptoCurrency: "USDT" });
    expect(payment).toMatchObject({ cryptoCurrency: "USDT", cryptoNetwork: "eth_erc20", expectedCryptoUnits: "12340000", cryptoAmount: 12.34 });
  });

  it("marks the durable record failed and returns no fake instructions on provider error", async () => {
    state.failAddress = true;
    await expect(BlockonomicsPaymentService.create("org-a", "user-a", { amount: 100, currency: "USD", cryptoCurrency: "BTC" })).rejects.toMatchObject({ status: 502 });
    expect(state.payments[0]).toMatchObject({ status: "failed", providerStatus: "creation_failed", reconciliationStatus: "required" });
    expect(state.payments[0].paymentAddress).toBeUndefined();
  });

  it("validates invoice organization, lifecycle, currency, and amount before provider calls", async () => {
    state.invoices.set("inv-a", { id: "inv-a", organizationId: "org-a", status: "open", currency: "USD", amountCents: 10000, subscriptionId: "sub-a" });
    await expect(BlockonomicsPaymentService.create("org-b", "user-b", { amount: 100, currency: "USD", cryptoCurrency: "BTC", invoiceId: "inv-a" })).rejects.toMatchObject({ status: 404 });
    await expect(BlockonomicsPaymentService.create("org-a", "user-a", { amount: 99, currency: "USD", cryptoCurrency: "BTC", invoiceId: "inv-a" })).rejects.toMatchObject({ status: 409 });
    await expect(BlockonomicsPaymentService.create("org-a", "user-a", { amount: 100, currency: "EUR", cryptoCurrency: "BTC", invoiceId: "inv-a" })).rejects.toMatchObject({ status: 409 });
    expect(state.payments).toHaveLength(0);
  });

  it("creates only the remaining invoice balance after an applied WMPC allocation", async () => {
    state.invoices.set("inv-split", { id: "inv-split", organizationId: "org-a", status: "open", currency: "USD", amountCents: 10000, subscriptionId: "sub-a" });
    state.allocatedCents = 4000;
    await expect(BlockonomicsPaymentService.create("org-a", "user-a", { amount: 60, currency: "USD", cryptoCurrency: "BTC", invoiceId: "inv-split" })).resolves.toMatchObject({ amount: 60, invoiceId: "inv-split" });
    await expect(BlockonomicsPaymentService.create("org-a", "user-a", { amount: 100, currency: "USD", cryptoCurrency: "BTC", invoiceId: "inv-split" })).rejects.toMatchObject({ status: 409 });
  });

  it("returns organization-scoped payment details and history", async () => {
    const created = await BlockonomicsPaymentService.create("org-a", "user-a", { amount: 10, currency: "USD", cryptoCurrency: "BTC" });
    await expect(BlockonomicsPaymentService.get("org-b", created.id)).resolves.toBeNull();
    await expect(BlockonomicsPaymentService.get("org-a", created.id)).resolves.toMatchObject({ id: created.id });
    await expect(BlockonomicsPaymentService.list("org-a")).resolves.toHaveLength(1);
  });
});
