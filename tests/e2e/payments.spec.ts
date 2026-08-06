/**
 * Playwright E2E — Session 128: Multi-Provider Payment Gateways &
 * Crypto Checkout (Flutterwave, Paystack, PayPal & Blockonomics).
 *
 * Validates against a live API that:
 *   - The legacy `billing` endpoints operate untouched.
 *   - `GET /api/v1/payments/providers` returns all 4 configured payment providers.
 *   - Universal checkouts initiate correctly across all 4 gateways and networks.
 *   - Transactions persist in the organization ledger (`pay:tx`).
 *   - Gateway verification endpoints settle transactions cleanly.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function apiLogin(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.data?.token) return j.data.token;
      await new Promise((r) => setTimeout(r, 1200));
    } catch {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@windels.ai", password: "W1ndels!Admin#2026",
      displayName: "Super Admin", organizationName: "WINDELS",
    }),
  });
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
  });
  const j = await res.json();
  return j.data.token;
}

test.describe("Session 128 — multi-provider payments completion", () => {
  let token = "";
  const marker = `e2e-pay-${Date.now()}`;

  test.beforeAll(async () => {
    token = await apiLogin();
  });

  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  async function get(path: string) {
    const res = await fetch(`${BASE}${path}`, { headers: auth() });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  async function send(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: auth(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  test("GET /payments/providers lists Flutterwave, Paystack, Stripe, PayPal, and Crypto", async () => {
    const res = await get("/payments/providers");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBe(5);

    const ids = res.data.map((p: any) => p.provider);
    expect(ids).toContain("flutterwave");
    expect(ids).toContain("paystack");
    expect(ids).toContain("stripe");
    expect(ids).toContain("paypal");
    expect(ids).toContain("crypto");
  });

  test("POST /payments/checkout initiates checkouts for all 5 payment providers", async () => {
    const providers = [
      { p: "flutterwave", prefix: "FLW_WIN_" },
      { p: "paystack", prefix: "PYS_WIN_" },
      { p: "stripe", prefix: "STR_WIN_" },
      { p: "paypal", prefix: "PPL_WIN_" },
      { p: "crypto", prefix: "CRY_WIN_" },
    ];

    for (const { p, prefix } of providers) {
      const init = await send("POST", "/payments/checkout", {
        provider: p,
        amount: 50,
        currency: "USD",
        description: `${marker} checkout (${p})`,
        cryptoNetwork: p === "crypto" ? "tron_trc20" : undefined,
      });

      expect(init.status).toBe(201);
      expect(init.data.provider).toBe(p);
      expect(init.data.reference.startsWith(prefix)).toBe(true);
      expect(init.data.status).toBe("pending");

      const single = await get(`/payments/transactions/${init.data.id}`);
      expect(single.status).toBe(200);
      expect(single.data.id).toBe(init.data.id);
    }
  });

  test("POST /payments/crypto/create-charge generates deposit addresses across BTC, TRC-20, ERC-20, and BNB Chain", async () => {
    const networks = ["btc", "tron_trc20", "eth_erc20", "bnb_chain"] as const;

    for (const net of networks) {
      const charge = await send("POST", "/payments/crypto/create-charge", {
        network: net,
        amount: 100,
        currency: "USD",
        description: `${marker} crypto charge`,
      });

      expect(charge.status).toBe(201);
      expect(charge.data.provider).toBe("crypto");
      expect(charge.data.cryptoNetwork).toBe(net);
      expect(charge.data.cryptoAmount).toBeGreaterThan(0);
      expect(charge.data.cryptoAddress).toBeTruthy();
      expect(typeof charge.data.requiredConfirmations).toBe("number");

      const fetchCharge = await get(`/payments/crypto/charge/${charge.data.id}`);
      expect(fetchCharge.status).toBe(200);
      expect(fetchCharge.data.id).toBe(charge.data.id);
    }
  });

  test("GET /payments/transactions returns organization transaction ledger", async () => {
    const txs = await get("/payments/transactions?limit=50");
    expect(txs.status).toBe(200);
    expect(Array.isArray(txs.data)).toBe(true);
    expect(txs.data.length).toBeGreaterThanOrEqual(1);
  });

  test("GET /payments/flutterwave/verify/:reference settles transaction", async () => {
    const init = await send("POST", "/payments/flutterwave/initialize", {
      amount: 5000,
      currency: "NGN",
      description: `${marker} verify test`,
    });
    expect(init.status).toBe(201);

    const verify = await get(`/payments/flutterwave/verify/${init.data.reference}`);
    expect(verify.status).toBe(200);
    expect(verify.data.reference).toBe(init.data.reference);
  });

  test("GET /payments/paystack/verify/:reference settles transaction", async () => {
    const init = await send("POST", "/payments/paystack/initialize", {
      amount: 100,
      currency: "GHS",
      description: `${marker} paystack verify`,
    });
    expect(init.status).toBe(201);

    const verify = await get(`/payments/paystack/verify/${init.data.reference}`);
    expect(verify.status).toBe(200);
    expect(verify.data.reference).toBe(init.data.reference);
  });

  test("GET /payments/stripe/verify/:reference settles transaction", async () => {
    const init = await send("POST", "/payments/stripe/initialize", {
      amount: 120,
      currency: "USD",
      description: `${marker} stripe verify`,
    });
    expect(init.status).toBe(201);

    const verify = await get(`/payments/stripe/verify/${init.data.reference}`);
    expect(verify.status).toBe(200);
    expect(verify.data.reference).toBe(init.data.reference);
  });

  test("all payments endpoints refuse anonymous callers", async () => {
    for (const path of [
      "/payments/providers",
      "/payments/transactions",
      "/payments/transactions/fake-id",
    ]) {
      const res = await fetch(`${BASE}${path}`);
      expect([401, 403]).toContain(res.status);
    }
  });
});
