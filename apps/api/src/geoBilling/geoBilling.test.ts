/**
 * Unit tests for Global Currency, Payment Orchestration & Geo-Aware Billing Engine (`geoBilling`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GeoBillingService } from "./geoBilling.service.js";
import { GiftCardsService } from "../giftCards/giftCards.service.js";
import { GlobalCurrencyService } from "../globalCurrency/globalCurrency.service.js";
import { PaymentGatewaysService } from "../payments/payments.service.js";

vi.mock("../db/redis.js", () => {
  const store = new Map<string, string>();
  const zsets = new Map<string, Array<{ score: number; member: string }>>();

  return {
    redisCmd: {
      async set(k: string, v: string) { store.set(k, v); },
      async get(k: string) { return store.get(k) ?? null; },
      async del(k: string) { store.delete(k); },
      async hset(k: string, f: string, v: string) { store.set(`${k}:${f}`, v); },
      async hget(k: string, f: string) { return store.get(`${k}:${f}`) ?? null; },
      async zadd(k: string, score: string, member: string) {
        const s = Number(score);
        let list = zsets.get(k);
        if (!list) { list = []; zsets.set(k, list); }
        const idx = list.findIndex(i => i.member === member);
        if (idx !== -1) list.splice(idx, 1);
        list.push({ score: s, member });
        list.sort((a, b) => a.score - b.score);
      },
      async zcard(k: string) { return zsets.get(k)?.length ?? 0; },
      async zrange(k: string, start: number, stop: number) {
        const list = zsets.get(k) ?? [];
        const end = stop === -1 ? list.length : stop + 1;
        return list.slice(start, end).map(i => i.member);
      },
      async zrem(k: string, ...members: string[]) {
        const list = zsets.get(k);
        if (!list) return;
        for (const m of members) {
          const idx = list.findIndex(i => i.member === m);
          if (idx !== -1) list.splice(idx, 1);
        }
      },
    },
  };
});

vi.mock("../giftCards/giftCards.service.js", () => ({
  GiftCardsService: {
    listCards: vi.fn().mockResolvedValue([
      { id: "gc-test-1", balance: 40, currency: "NGN", status: "active" },
    ]),
    redeem: vi.fn().mockResolvedValue({ redeemed: 40 }),
    applyToInvoice: vi.fn().mockResolvedValue({ redeemedCents: 4_000, remainingCents: 6_000 }),
  },
}));

describe("GeoBillingService (Global Currency, Payment Orchestration & Geo-Billing Engine)", () => {
  const orgA = "org-geob-test-a";

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(GiftCardsService.listCards).mockResolvedValue([
      { id: "gc-test-1", balance: 40, currency: "NGN", status: "active" } as any,
    ]);
    vi.mocked(GiftCardsService.redeem).mockResolvedValue({ redeemed: 40 } as any);
    vi.mocked(GiftCardsService.applyToInvoice).mockResolvedValue({ redeemedCents: 4_000, remainingCents: 6_000 } as any);
    process.env.PAYSTACK_SECRET_KEY = "sk_test_geo";
    process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-geo";
    process.env.FLUTTERWAVE_SECRET_HASH = "geo-webhook-secret";
  });

  it("lists default regional country payment profiles across global markets", async () => {
    const profiles = await GeoBillingService.listProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(14);
    const codes = profiles.map((p) => p.countryCode);
    expect(codes).toContain("NG");
    expect(codes).toContain("US");
    expect(codes).toContain("GB");
    expect(codes).toContain("DE");
    expect(codes).toContain("JP");
    expect(codes).toContain("CN");
    expect(codes).toContain("ZA");
  });

  it("automatically resolves caller Geo-Billing context by country code or IP fallback", async () => {
    const ngCtx = await GeoBillingService.resolveContext({ countryCode: "NG" });
    expect(ngCtx.currency).toBe("NGN");
    expect(ngCtx.currencySymbol).toBe("₦");
    expect(ngCtx.wmpcGiftCardPriority).toBe(true);
    expect(ngCtx.supportedPaymentMethods).toContain("wmpc-gift-card");
    expect(ngCtx.supportedPaymentMethods).toContain("paystack");
    expect(ngCtx.supportedPaymentMethods).toContain("flutterwave");

    const gbCtx = await GeoBillingService.resolveContext({ countryCode: "GB" });
    expect(gbCtx.currency).toBe("GBP");
    expect(gbCtx.currencySymbol).toBe("£");
    expect(gbCtx.taxRule.type).toBe("VAT");
    expect(gbCtx.taxRule.rate).toBe(0.20);
  });

  it("computes regional tax obligations and supports auditable tax exemptions", async () => {
    const ngTax = await GeoBillingService.calculateTax({ amount: 100, country: "NG" });
    expect(ngTax.country).toBe("NG");
    expect(ngTax.taxType).toBe("VAT");
    expect(ngTax.taxRate).toBe(0.075);
    expect(ngTax.taxAmount).toBe(7.5);

    const exemptTax = await GeoBillingService.calculateTax({ amount: 100, country: "GB", isExempt: true });
    expect(exemptTax.taxRate).toBe(0);
    expect(exemptTax.taxAmount).toBe(0);
    expect(exemptTax.exemptApplied).toBe(true);
  });

  it("prioritizes WMPC Gift Card balance (#1 priority) and calculates gateway failover order", async () => {
    const plan = await GeoBillingService.routePayment(orgA, {
      amount: 100,
      currency: "NGN",
      country: "NG",
      useGiftCardBalance: true,
    });

    expect(plan.wmpcGiftCardApplied).toBe(true);
    // Gift card balance is 40 USD
    expect(plan.giftCardRedeemedAmount).toBeGreaterThan(0);
    expect(plan.remainingAmountForGateway).toBeLessThan(plan.totalWithTax);
    expect(plan.selectedProvider).toBe("paystack");
    expect(plan.fallbackProviders).toContain("flutterwave");
    expect(plan.fallbackProviders).not.toContain("crypto");
  });

  it.each([
    { sourceRate: "synthetic", rateStaleness: "fresh" },
    { sourceRate: "cache", rateStaleness: "stale" },
  ] as const)("refuses $sourceRate/$rateStaleness non-billable FX for cross-currency checkout", async ({ sourceRate, rateStaleness }) => {
    vi.spyOn(GlobalCurrencyService, "localizePrice").mockResolvedValue({
      amount: 152_000,
      currency: "NGN",
      formatted: "₦152,000.00",
      exchangeRate: 1_520,
      sourceRate,
      rateStaleness,
      rateDerived: false,
      usableForBilling: false,
    });

    await expect(GeoBillingService.routePayment(orgA, {
      amount: 100,
      currency: "USD",
      country: "NG",
      useGiftCardBalance: false,
    })).rejects.toThrow("not approved for billing");
  });

  it("routes only through configured regional providers that support the invoice currency", async () => {
    vi.spyOn(PaymentGatewaysService, "listProviders").mockResolvedValue([
      { provider: "stripe", active: true, configured: true, status: "ready", supportedCurrencies: ["USD"], displayName: "Stripe" },
      { provider: "paystack", active: true, configured: true, status: "ready", supportedCurrencies: ["NGN"], displayName: "Paystack" },
      { provider: "blockonomics", active: false, configured: true, status: "disabled", supportedCurrencies: ["NGN"], displayName: "Blockonomics" },
    ] as any);

    const plan = await GeoBillingService.routePayment(orgA, {
      amount: 100,
      currency: "NGN",
      country: "NG",
      preferredProvider: "blockonomics",
      useGiftCardBalance: false,
    });

    expect(plan.selectedProvider).toBe("paystack");
    expect(plan.fallbackProviders).toEqual([]);
  });

  it("creates Blockonomics only for the remainder after a durable WMPC invoice allocation", async () => {
    vi.mocked(GiftCardsService.listCards).mockResolvedValueOnce([
      { id: "gc-usd", balance: 40, currency: "USD", status: "active" } as any,
    ]);
    vi.spyOn(PaymentGatewaysService, "listProviders").mockResolvedValue([
      { provider: "blockonomics", active: true, configured: true, status: "ready", supportedCurrencies: ["USD"], displayName: "Blockonomics" },
    ] as any);
    const checkout = vi.spyOn(PaymentGatewaysService, "initiateCheckout").mockResolvedValue({ id: "pay-remainder", status: "pending" } as any);

    const result = await GeoBillingService.initiateGeoCheckout(orgA, {
      amount: 100,
      currency: "USD",
      country: "US",
      preferredProvider: "blockonomics",
      useGiftCardBalance: true,
      giftCardId: "gc-usd",
      invoiceId: "inv-split",
      cryptoNetwork: "eth_erc20",
    }, "user-a");

    // US sales tax is added by the existing profile: $108 total, $40 gift
    // allocation, and exactly $68 delegated to Blockonomics.
    expect(GiftCardsService.applyToInvoice).toHaveBeenCalledWith("gc-usd", "inv-split", undefined, 40, orgA);
    expect(checkout).toHaveBeenCalledWith(orgA, expect.objectContaining({
      provider: "blockonomics",
      amount: 68,
      currency: "USD",
      invoiceId: "inv-split",
      cryptoCurrency: "USDT",
    }), "user-a");
    expect(result).toMatchObject({ giftCardRedeemed: true, checkoutStatus: "pending_gateway" });
  });

  it("does not debit a gift card when no provider is available for its remainder", async () => {
    vi.mocked(GiftCardsService.listCards).mockResolvedValueOnce([
      { id: "gc-usd", balance: 40, currency: "USD", status: "active" } as any,
    ]);
    vi.spyOn(PaymentGatewaysService, "listProviders").mockResolvedValue([]);

    await expect(GeoBillingService.initiateGeoCheckout(orgA, {
      amount: 100,
      currency: "USD",
      country: "US",
      useGiftCardBalance: true,
      giftCardId: "gc-usd",
      invoiceId: "inv-no-provider",
    }, "user-a")).rejects.toThrow("No configured payment provider");
    expect(GiftCardsService.applyToInvoice).not.toHaveBeenCalled();
    expect(GiftCardsService.redeem).not.toHaveBeenCalled();
  });

  it("normalizes provider webhooks into a standard UnifiedPaymentEvent", async () => {
    const flwEvent = await GeoBillingService.normalizeWebhookEvent("flutterwave", {
      event: "charge.completed",
      tx_ref: "FLW_WIN_test_123",
      amount: 15000,
      currency: "NGN",
    }, true, orgA);

    expect(flwEvent.provider).toBe("flutterwave");
    expect(flwEvent.eventType).toBe("payment.completed");
    expect(flwEvent.transactionRef).toBe("FLW_WIN_test_123");
    expect(flwEvent.organizationId).toBe(orgA);
    expect(flwEvent.verified).toBe(true);
  });

  it("generates AI Billing Employee regional insights and fee optimization notes", async () => {
    const ngAi = await GeoBillingService.getAIInsights("NG", 100);
    expect(ngAi.country).toBe("Nigeria");
    expect(ngAi.recommendedProvider).toBe("paystack");
    expect(ngAi.estimatedProcessingFeePct).toBe(1.5);
    expect(ngAi.taxSummary).toContain("VAT (7.5%)");

    const usAi = await GeoBillingService.getAIInsights("US", 100);
    expect(usAi.country).toBe("United States");
    expect(usAi.recommendedProvider).toBe("stripe");
    expect(usAi.estimatedProcessingFeePct).toBe(2.9);
  });
});
