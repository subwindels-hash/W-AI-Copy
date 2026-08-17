import { createHmac } from "node:crypto";
import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { PaymentGatewaysService } from "./payments.service.js";
import { FlutterwaveService } from "./flutterwave.service.js";
import { PaystackService } from "./paystack.service.js";
import { PayPalService } from "./paypal.service.js";
import { StripeService } from "./stripe.service.js";
import { CryptoPaymentsService, CRYPTO_NETWORK_CONFIRMATIONS } from "./crypto.service.js";
import * as billing from "../services/billing.service.js";

vi.mock("../db/redis.js", () => {
  const store = new Map<string, string>();
  const zsets = new Map<string, Array<{ score: number; member: string }>>();
  return {
    __resetPaymentStore() { store.clear(); zsets.clear(); },
    redisCmd: {
      async set(k: string, v: string, ...args: any[]) {
        if (args.includes("NX") && store.has(k)) return null;
        store.set(k, v); return "OK";
      },
      async get(k: string) { return store.get(k) ?? null; },
      async del(...keys: string[]) { for (const key of keys) store.delete(key); return keys.length; },
      async zadd(k: string, score: string, member: string) {
        let list = zsets.get(k); if (!list) { list = []; zsets.set(k, list); }
        const idx = list.findIndex((item) => item.member === member); if (idx >= 0) list.splice(idx, 1);
        list.push({ score: Number(score), member }); list.sort((a, b) => a.score - b.score); return 1;
      },
      async zcard(k: string) { return zsets.get(k)?.length ?? 0; },
      async zrange(k: string, start: number, stop: number) {
        const list = zsets.get(k) ?? []; const end = stop === -1 ? list.length : stop + 1;
        return list.slice(start, end).map((item) => item.member);
      },
      async zrem(k: string, ...members: string[]) {
        const list = zsets.get(k); if (!list) return 0;
        for (const member of members) { const idx = list.findIndex((item) => item.member === member); if (idx >= 0) list.splice(idx, 1); }
        return members.length;
      },
    },
  };
});

vi.mock("../services/billing.service.js", () => ({ markInvoicePaid: vi.fn().mockResolvedValue({ id: "inv-paid", status: "PAID" }) }));

const originalEnv = { ...process.env };
const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const unset = [
  "FLUTTERWAVE_SECRET_KEY", "FLUTTERWAVE_SECRET_HASH", "PAYSTACK_SECRET_KEY",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_ENVIRONMENT",
  "BLOCKONOMICS_API_KEY", "BLOCKONOMICS_CALLBACK_SECRET",
];

beforeEach(async () => {
  vi.clearAllMocks(); vi.unstubAllGlobals();
  for (const key of unset) delete process.env[key];
  process.env.NODE_ENV = "test";
  process.env.WINDELS_PUBLIC_API_ORIGIN = "https://payments.example.test";
  (await import("../db/redis.js") as any).__resetPaymentStore();
});
afterAll(() => { process.env = originalEnv; });

describe("payment providers fail closed", () => {
  it("reports providers as inactive instead of calling missing credentials test mode", async () => {
    const providers = await PaymentGatewaysService.listProviders();
    expect(providers).toHaveLength(6);
    expect(providers.every((provider) => provider.active === false)).toBe(true);
    expect(providers.find((provider) => provider.provider === "crypto")?.status).toBe("blocked");
    expect(providers.find((provider) => provider.provider === "blockonomics")?.active).toBe(false);
    expect(providers.filter((provider) => provider.provider !== "crypto").every((provider) => provider.status === "not_configured")).toBe(true);
  });

  it.each(["flutterwave", "paystack", "stripe", "paypal", "crypto", "blockonomics"] as const)("refuses unconfigured %s checkout without creating a ledger row", async (provider) => {
    await expect(PaymentGatewaysService.initiateCheckout(`org-${provider}`, {
      provider, amount: 100, currency: "USD", customerEmail: "buyer@example.test",
      cryptoNetwork: provider === "crypto" ? "btc" : undefined,
    })).rejects.toMatchObject({ status: 503 });
    expect(await PaymentGatewaysService.listTransactions(`org-${provider}`)).toEqual([]);
  });

  it("does not fabricate a Paystack URL when the provider rejects initialization", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_real-looking";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { status: false, message: "invalid key" })));
    await expect(PaymentGatewaysService.initiateCheckout("org-paystack-fail", {
      provider: "paystack", amount: 500, currency: "NGN", customerEmail: "buyer@example.test",
    })).rejects.toMatchObject({ status: 502 });
    expect(await PaymentGatewaysService.listTransactions("org-paystack-fail")).toEqual([]);
  });

  it("disables all crypto checkout instead of generating addresses or fixed prices", async () => {
    process.env.BLOCKONOMICS_API_KEY = "configured-but-insufficient";
    process.env.BLOCKONOMICS_CALLBACK_SECRET = "callback-secret";
    expect(CryptoPaymentsService.configuration()).toMatchObject({ configured: false });
    await expect(CryptoPaymentsService.createCharge({ network: "btc", amount: 100, currency: "USD" })).rejects.toMatchObject({ status: 503 });
    await expect(CryptoPaymentsService.createCharge({ network: "tron_trc20", amount: 100, currency: "USD" })).rejects.toMatchObject({ status: 503 });
  });
});

describe("provider initialization and verification", () => {
  it("initializes and verifies Flutterwave only from real provider responses", async () => {
    process.env.FLUTTERWAVE_SECRET_KEY = "FLWSECK_TEST-key";
    process.env.FLUTTERWAVE_SECRET_HASH = "webhook-hash";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { status: "success", data: { link: "https://checkout.flutterwave.com/pay/abc" } }))
      .mockResolvedValueOnce(jsonResponse(200, { status: "success", data: { id: 77, tx_ref: "FLW_REF", status: "successful", amount: 250, currency: "NGN", flw_ref: "flw-77" } }));
    const initialized = await FlutterwaveService.initializePayment({ reference: "FLW_REF", amount: 250, currency: "NGN", customerEmail: "buyer@example.test" }, fetchMock as any);
    expect(initialized.checkoutUrl).toBe("https://checkout.flutterwave.com/pay/abc");
    const verified = await FlutterwaveService.verifyPayment("FLW_REF", "77", fetchMock as any);
    expect(verified).toMatchObject({ verified: true, status: "completed", amount: 250, currency: "NGN", providerTransactionId: "77" });
  });

  it("initializes and verifies Paystack using provider amount in major units", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_paystack";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { status: true, data: { authorization_url: "https://checkout.paystack.com/abc", access_code: "access", reference: "PYS_REF" } }))
      .mockResolvedValueOnce(jsonResponse(200, { status: true, data: { id: 88, reference: "PYS_REF", status: "success", amount: 150050, currency: "NGN", channel: "card" } }));
    await expect(PaystackService.initializePayment({ reference: "PYS_REF", amount: 1500.5, currency: "NGN", customerEmail: "buyer@example.test" }, fetchMock as any)).resolves.toMatchObject({ reference: "PYS_REF" });
    await expect(PaystackService.verifyPayment("PYS_REF", fetchMock as any)).resolves.toMatchObject({ status: "completed", amount: 1500.5, providerTransactionId: "88" });
  });

  it("uses deployment origin and requires matching Stripe session reference", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_stripe";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/test", client_reference_id: "STR_REF" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "cs_test_1", client_reference_id: "OTHER", payment_status: "paid", amount_total: 9900, currency: "usd" }));
    await StripeService.createCheckoutSession({ reference: "STR_REF", amount: 99, currency: "USD", customerEmail: "buyer@example.test" }, fetchMock as any);
    const sent = new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(sent.get("success_url")).toContain("https://payments.example.test/");
    await expect(StripeService.verifyPayment("STR_REF", "cs_test_1", fetchMock as any)).rejects.toMatchObject({ status: 502 });
  });

  it("uses PayPal official verification endpoint instead of local signature guesses", async () => {
    process.env.PAYPAL_CLIENT_ID = "paypal-client";
    process.env.PAYPAL_CLIENT_SECRET = "paypal-secret";
    process.env.PAYPAL_WEBHOOK_ID = "WH-123";
    process.env.PAYPAL_ENVIRONMENT = "sandbox";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "access" }))
      .mockResolvedValueOnce(jsonResponse(200, { verification_status: "SUCCESS" }));
    const valid = await PayPalService.verifyWebhookSignature({
      authAlgo: "SHA256withRSA", certUrl: "https://api.paypal.com/cert", transmissionId: "tx-1",
      transmissionSig: "signature", transmissionTime: new Date().toISOString(),
    }, { id: "WH-EVENT" }, fetchMock as any);
    expect(valid).toBe(true);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/v1/notifications/verify-webhook-signature");
  });
});

describe("webhook signatures and idempotency", () => {
  it("never accepts default webhook secrets", () => {
    expect(FlutterwaveService.verifyWebhookSignature("test-flw-secret-hash")).toBe(false);
    expect(PaystackService.verifyWebhookSignature("anything", "body")).toBe(false);
    expect(StripeService.verifyWebhookSignature("t=1,v1=anything", "body", undefined, 1)).toBe(false);
    expect(CryptoPaymentsService.verifyCallbackSecret("test-crypto-secret-key")).toBe(false);
  });

  it("verifies exact Paystack raw bytes", () => {
    process.env.PAYSTACK_SECRET_KEY = "paystack-secret";
    const raw = Buffer.from('{"event":"charge.success", "data":{"id":1}}');
    const signature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(raw).digest("hex");
    expect(PaystackService.verifyWebhookSignature(signature, raw)).toBe(true);
    expect(PaystackService.verifyWebhookSignature(signature, JSON.stringify(JSON.parse(raw.toString())))).toBe(false);
  });

  it("enforces Stripe timestamp tolerance and exact raw bytes", () => {
    const secret = "whsec_real"; const now = 2_000_000_000; const raw = Buffer.from('{"id":"evt_1"}');
    const signature = createHmac("sha256", secret).update(`${now}.`).update(raw).digest("hex");
    expect(StripeService.verifyWebhookSignature(`t=${now},v1=${signature}`, raw, secret, now)).toBe(true);
    expect(StripeService.verifyWebhookSignature(`t=${now - 301},v1=${signature}`, raw, secret, now)).toBe(false);
    expect(StripeService.verifyWebhookSignature(`t=${now},v1=${signature}`, Buffer.from("{}"), secret, now)).toBe(false);
  });

  it("claims a provider event only once", async () => {
    expect(await PaymentGatewaysService.claimWebhookEvent("stripe", "evt-1")).toBe(true);
    expect(await PaymentGatewaysService.claimWebhookEvent("stripe", "evt-1")).toBe(false);
    expect(await PaymentGatewaysService.claimWebhookEvent("stripe", "evt-2")).toBe(true);
  });
});

describe("settlement invariants", () => {
  async function paystackCheckout(orgId: string, amount = 100, currency = "NGN") {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_paystack";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      return jsonResponse(200, {
        status: true,
        data: { authorization_url: "https://checkout.paystack.com/live", access_code: "access", reference: request.reference },
      });
    }));
    return PaymentGatewaysService.initiateCheckout(orgId, { provider: "paystack", amount, currency, customerEmail: "buyer@example.test", invoiceId: "inv-1" });
  }

  it("refuses arbitrary completion without verified evidence", async () => {
    const tx = await paystackCheckout("org-unverified");
    await expect(PaymentGatewaysService.applyVerifiedResult("org-unverified", tx.reference, {
      verified: false, provider: "paystack", reference: tx.reference, status: "completed", amount: 100,
      currency: "NGN", providerTransactionId: "provider-1",
    } as any)).rejects.toMatchObject({ status: 403 });
    expect((await PaymentGatewaysService.getTransaction("org-unverified", tx.id))?.status).toBe("pending");
  });

  it("refuses amount, currency, provider, and reference mismatches", async () => {
    const tx = await paystackCheckout("org-mismatch");
    const base = { verified: true as const, provider: "paystack" as const, reference: tx.reference, status: "completed" as const, amount: 100, currency: "NGN", providerTransactionId: "provider-1" };
    await expect(PaymentGatewaysService.applyVerifiedResult("org-mismatch", tx.reference, { ...base, amount: 99 })).rejects.toMatchObject({ status: 409 });
    await expect(PaymentGatewaysService.applyVerifiedResult("org-mismatch", tx.reference, { ...base, currency: "USD" })).rejects.toMatchObject({ status: 409 });
    await expect(PaymentGatewaysService.applyVerifiedResult("org-mismatch", tx.reference, { ...base, provider: "stripe" })).rejects.toMatchObject({ status: 409 });
    await expect(PaymentGatewaysService.applyVerifiedResult("org-mismatch", tx.reference, { ...base, reference: "OTHER" })).rejects.toMatchObject({ status: 409 });
    expect(billing.markInvoicePaid).not.toHaveBeenCalled();
  });

  it("settles and marks an invoice only after matching provider verification", async () => {
    const tx = await paystackCheckout("org-settle");
    const settled = await PaymentGatewaysService.applyVerifiedResult("org-settle", tx.reference, {
      verified: true, provider: "paystack", reference: tx.reference, status: "completed",
      amount: 100, currency: "NGN", providerTransactionId: "provider-verified-1", verificationSource: "provider_api",
    });
    expect(settled.status).toBe("completed");
    expect((settled.metadata as any)?.verification?.providerTransactionId).toBe("provider-verified-1");
    expect(billing.markInvoicePaid).toHaveBeenCalledWith("org-settle", "inv-1");
    const retried = await PaymentGatewaysService.applyVerifiedResult("org-settle", tx.reference, {
      verified: true, provider: "paystack", reference: tx.reference, status: "completed",
      amount: 100, currency: "NGN", providerTransactionId: "provider-verified-1",
    });
    expect(retried.id).toBe(tx.id);
    expect(billing.markInvoicePaid).toHaveBeenCalledTimes(1);
  });

  it("resolves webhook references without a default organization and preserves tenant isolation", async () => {
    const tx = await paystackCheckout("org-indexed");
    expect(await PaymentGatewaysService.resolveProviderTransaction("paystack", tx.reference)).toMatchObject({ id: tx.id, organizationId: "org-indexed" });
    expect(await PaymentGatewaysService.getTransaction("org-other", tx.id)).toBeNull();
  });

  it("retains real confirmation threshold helpers without creating crypto charges", () => {
    for (const [network, required] of Object.entries(CRYPTO_NETWORK_CONFIRMATIONS)) {
      expect(CryptoPaymentsService.isConfirmed(required, required)).toBe(true);
      expect(CryptoPaymentsService.isConfirmed(required - 1, required)).toBe(false);
      expect(network).toBeTruthy();
    }
  });
});
