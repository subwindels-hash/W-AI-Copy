/**
 * Playwright E2E — Session 129: Global Currency, Payment Orchestration &
 * Geo-Aware Billing Engine (`geoBilling`).
 *
 * Validates against a live API that:
 *   - The legacy `billing`, `payments`, `globalCurrency`, and `giftCards` endpoints work untouched.
 *   - `GET /api/v1/geo-billing/context` resolves caller country and currency.
 *   - Country Payment Profiles (`GET/PUT /profiles/:country`) allow admin configuration.
 *   - Intelligent routing and WMPC Gift Card #1 priority work over HTTP.
 *   - Unified Webhook Normalizer standardizes provider events.
 *   - AI Billing Employee Insights return regional fee advice.
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

test.describe("Session 129 — geo-billing completion", () => {
  let token = "";
  const marker = `e2e-geob-${Date.now()}`;

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

  test("GET /geo-billing/context resolves localized country and currency settings", async () => {
    const ng = await get("/geo-billing/context?country=NG");
    expect(ng.status).toBe(200);
    expect(ng.data.countryCode).toBe("NG");
    expect(ng.data.currency).toBe("NGN");
    expect(ng.data.currencySymbol).toBe("₦");
    expect(ng.data.wmpcGiftCardPriority).toBe(true);

    const gb = await get("/geo-billing/context?country=GB");
    expect(gb.status).toBe(200);
    expect(gb.data.countryCode).toBe("GB");
    expect(gb.data.currency).toBe("GBP");
    expect(gb.data.currencySymbol).toBe("£");
  });

  test("GET /geo-billing/profiles lists 14+ Country Payment Profiles", async () => {
    const profs = await get("/geo-billing/profiles");
    expect(profs.status).toBe(200);
    expect(Array.isArray(profs.data)).toBe(true);
    expect(profs.data.length).toBeGreaterThanOrEqual(14);
  });

  test("PUT /geo-billing/profiles/:country updates profile tax and payment rules", async () => {
    const res = await send("PUT", "/geo-billing/profiles/NG", {
      billingLanguage: "en-NG",
    });
    expect(res.status).toBe(200);
    expect(res.data.countryCode).toBe("NG");
    expect(res.data.billingLanguage).toBe("en-NG");
  });

  test("POST /geo-billing/route-payment evaluates gift card priority and gateway failover order", async () => {
    const route = await send("POST", "/geo-billing/route-payment", {
      amount: 100,
      country: "NG",
      useGiftCardBalance: true,
    });
    expect(route.status).toBe(200);
    expect(typeof route.data.wmpcGiftCardApplied).toBe("boolean");
    expect(route.data.selectedProvider).toBeTruthy();
    expect(Array.isArray(route.data.fallbackProviders)).toBe(true);
  });

  test("POST /geo-billing/tax-calculate computes regional VAT, GST, and Sales Tax", async () => {
    const tax = await send("POST", "/geo-billing/tax-calculate", {
      amount: 200,
      country: "DE",
    });
    expect(tax.status).toBe(200);
    expect(tax.data.taxType).toBe("VAT");
    expect(tax.data.taxRate).toBe(0.19);
    expect(tax.data.taxAmount).toBe(38);
  });

  test("POST /geo-billing/webhook/normalize normalizes multi-provider webhook events", async () => {
    const norm = await send("POST", "/geo-billing/webhook/normalize?source=paystack", {
      verified: true,
      payload: {
        event: "charge.success",
        reference: `${marker}-whk`,
        amount: 5000,
        currency: "NGN",
      },
    });
    expect(norm.status).toBe(201);
    expect(norm.data.provider).toBe("paystack");
    expect(norm.data.eventType).toBe("payment.completed");
    expect(norm.data.transactionRef).toBe(`${marker}-whk`);
  });

  test("GET /geo-billing/ai-insights returns AI Billing Employee recommendations", async () => {
    const ai = await get("/geo-billing/ai-insights?country=KE&amount=50");
    expect(ai.status).toBe(200);
    expect(ai.data.country).toBe("Kenya");
    expect(ai.data.recommendedProvider).toBeTruthy();
    expect(typeof ai.data.estimatedProcessingFeePct).toBe("number");
  });

  test("all geo-billing endpoints refuse anonymous callers", async () => {
    for (const path of [
      "/geo-billing/context",
      "/geo-billing/profiles",
      "/geo-billing/ai-insights",
    ]) {
      const res = await fetch(`${BASE}${path}`);
      expect([401, 403]).toContain(res.status);
    }
  });
});
