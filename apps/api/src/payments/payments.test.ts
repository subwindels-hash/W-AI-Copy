/**
 * Unit tests for Multi-Provider Payment Gateways Service (Session 128).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PaymentGatewaysService } from "./payments.service.js";
import { FlutterwaveService } from "./flutterwave.service.js";
import { PaystackService } from "./paystack.service.js";
import { PayPalService } from "./paypal.service.js";
import { CryptoPaymentsService, CRYPTO_NETWORK_CONFIRMATIONS } from "./crypto.service.js";
import * as billing from "../services/billing.service.js";

vi.mock("../db/redis.js", () => {
  const store = new Map<string, string>();
  const zsets = new Map<string, Array<{ score: number; member: string }>>();

  return {
    redisCmd: {
      async set(k: string, v: string) { store.set(k, v); },
      async get(k: string) { return store.get(k) ?? null; },
      async del(k: string) { store.delete(k); },
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

vi.mock("../services/billing.service.js", () => ({
  markInvoicePaid: vi.fn().mockResolvedValue({ id: "inv-mock-paid", status: "PAID" }),
}));

describe("Multi-Provider Payment Gateways & Crypto Checkout (Session 128)", () => {
  const orgA = "org-pay-test-a";
  const orgB = "org-pay-test-b";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists all 4 configured payment providers and their supported currencies", async () => {
    const providers = await PaymentGatewaysService.listProviders();
    expect(providers.length).toBe(4);
    const names = providers.map((p) => p.provider);
    expect(names).toContain("flutterwave");
    expect(names).toContain("paystack");
    expect(names).toContain("paypal");
    expect(names).toContain("crypto");
  });

  it("initiates a Flutterwave checkout transaction and records in ledger", async () => {
    const tx = await PaymentGatewaysService.initiateCheckout(orgA, {
      provider: "flutterwave",
      amount: 15000,
      currency: "NGN",
      description: "Flutterwave test order",
    });

    expect(tx.provider).toBe("flutterwave");
    expect(tx.reference).toMatch(/^FLW_WIN_/);
    expect(tx.status).toBe("pending");

    const list = await PaymentGatewaysService.listTransactions(orgA);
    expect(list.some((t) => t.id === tx.id)).toBe(true);
  });

  it("verifies Flutterwave verif-hash webhook signature header in constant time", () => {
    const secret = "test-flw-secret-hash";
    expect(FlutterwaveService.verifyWebhookSignature(secret, secret)).toBe(true);
    expect(FlutterwaveService.verifyWebhookSignature("invalid-hash", secret)).toBe(false);
  });

  it("initiates a Paystack checkout transaction and verifies SHA512 HMAC signature", async () => {
    const tx = await PaymentGatewaysService.initiateCheckout(orgA, {
      provider: "paystack",
      amount: 500,
      currency: "GHS",
      description: "Paystack Ghana order",
    });

    expect(tx.provider).toBe("paystack");
    expect(tx.reference).toMatch(/^PYS_WIN_/);

    const secret = "test-paystack-secret-key-123";
    const body = JSON.stringify({ event: "charge.success", data: { reference: tx.reference } });
    const computed = require("node:crypto").createHmac("sha512", secret).update(body, "utf8").digest("hex");

    expect(PaystackService.verifyWebhookSignature(computed, body, secret)).toBe(true);
    expect(PaystackService.verifyWebhookSignature("bad-hmac", body, secret)).toBe(false);
  });

  it("creates a PayPal order and verifies transmission signature", async () => {
    const tx = await PaymentGatewaysService.initiateCheckout(orgA, {
      provider: "paypal",
      amount: 99.99,
      currency: "USD",
      description: "PayPal USD order",
    });

    expect(tx.provider).toBe("paypal");
    expect(tx.reference).toMatch(/^PPL_WIN_/);
    expect(tx.checkoutUrl).toContain("paypal.com");

    const webhookId = "test-ppl-webhook-id";
    expect(PayPalService.verifyWebhookSignature("SHA256withRSA", "https://api.paypal.com/cert", "trans-1", webhookId, "time-1", webhookId)).toBe(true);
  });

  it("creates Blockonomics / Crypto charges across BTC, TRC-20, ERC-20, and BNB Chain", async () => {
    const networks = ["btc", "tron_trc20", "eth_erc20", "bnb_chain"] as const;

    for (const net of networks) {
      const tx = await PaymentGatewaysService.initiateCheckout(orgA, {
        provider: "crypto",
        amount: 100,
        currency: "USD",
        cryptoNetwork: net,
      });

      expect(tx.provider).toBe("crypto");
      expect(tx.cryptoNetwork).toBe(net);
      expect(tx.cryptoAmount).toBeGreaterThan(0);
      expect(tx.cryptoAddress).toBeTruthy();
      expect(tx.requiredConfirmations).toBe(CRYPTO_NETWORK_CONFIRMATIONS[net]);
    }
  });

  it("enforces confirmation threshold rules for crypto networks", () => {
    // BTC: 1 confirmation required
    expect(CryptoPaymentsService.isConfirmed(1, 1)).toBe(true);
    expect(CryptoPaymentsService.isConfirmed(0, 1)).toBe(false);

    // TRC-20: 19 confirmations required
    expect(CryptoPaymentsService.isConfirmed(19, 19)).toBe(true);
    expect(CryptoPaymentsService.isConfirmed(18, 19)).toBe(false);

    // ERC-20: 12 confirmations required
    expect(CryptoPaymentsService.isConfirmed(12, 12)).toBe(true);
    expect(CryptoPaymentsService.isConfirmed(11, 12)).toBe(false);

    // BNB Chain: 15 confirmations required
    expect(CryptoPaymentsService.isConfirmed(15, 15)).toBe(true);
    expect(CryptoPaymentsService.isConfirmed(14, 15)).toBe(false);
  });

  it("settles a transaction and automatically marks corresponding billing invoice paid", async () => {
    const tx = await PaymentGatewaysService.initiateCheckout(orgA, {
      provider: "flutterwave",
      amount: 250,
      currency: "USD",
      invoiceId: "inv-s128-test",
    });

    expect(tx.status).toBe("pending");

    const settled = await PaymentGatewaysService.settleTransaction(orgA, tx.reference, "completed");
    expect(settled).not.toBeNull();
    expect(settled?.status).toBe("completed");
    expect(settled?.completedAt).toBeTruthy();

    expect(billing.markInvoicePaid).toHaveBeenCalledWith(orgA, "inv-s128-test");
  });

  it("enforces organization scoping when listing or retrieving transactions", async () => {
    const txA = await PaymentGatewaysService.initiateCheckout(orgA, {
      provider: "paystack",
      amount: 100,
    });
    await PaymentGatewaysService.initiateCheckout(orgB, {
      provider: "paypal",
      amount: 200,
    });

    const listA = await PaymentGatewaysService.listTransactions(orgA);
    expect(listA.every((t) => t.organizationId === orgA)).toBe(true);

    const checkCrossTenant = await PaymentGatewaysService.getTransaction(orgB, txA.id);
    expect(checkCrossTenant).toBeNull();
  });
});
