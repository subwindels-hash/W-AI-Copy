/**
 * Playwright E2E — Sessions 41, 76, 77, 78, 79, 80.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";
const WEB = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173";

async function apiLogin(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
  });
  const j = await res.json();
  return j.data.token;
}

test.describe("Sessions 41/76-80 API", () => {
  let token: string;
  test.beforeAll(async () => { token = await apiLogin(); });
  const get = (path: string) => fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
  const post = (path: string, body: any) => fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(r => r.json());

  test("S41 voice foundry: dashboard returns 13+ voices + 3 packs", async () => {
    const r = await get("/voice-foundry/dashboard/rollup");
    expect(r.ok).toBe(true);
    expect(r.data.generatedVoices).toBeGreaterThanOrEqual(13);
    expect(r.data.voicePacks).toBeGreaterThanOrEqual(3);
  });

  test("S41 voice foundry: generate returns consent-exempt audit trail", async () => {
    const r = await post("/voice-foundry/voices/generate", { name: "PW Test Voice", category: "original-female" });
    expect(r.ok).toBe(true);
    expect(r.data.auditTrail.join(",")).toContain("foundry-autonomous");
    expect(r.data.ready).toBe(true);
    // User-triggered generate is owned by user; seeds owned by windels (consent-exempt either way)
    expect(["windels", "user"]).toContain(r.data.ownership);
  });

  test("S77A experts: 6+ domain agents with disclaimers", async () => {
    const r = await get("/experts/agents");
    expect(r.ok).toBe(true);
    expect(r.data.length).toBeGreaterThanOrEqual(6);
    for (const a of r.data) expect(a.disclaimer).toBeDefined();
  });

  test("S77B media factory: child safety rejects unsafe prompt", async () => {
    const r = await post("/media-factory/generate", { type: "image", channel: "web", prompt: "explicit violence content for kids" });
    expect(r.ok).toBe(true);
    expect(r.data.status).toBe("rejected");
  });

  test("S78 UX intel: 12+ components, design gate active", async () => {
    const d = await get("/ux-intelligence/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(d.data.components).toBeGreaterThanOrEqual(12);
    expect(d.data.designGateActive).toBe(true);
  });

  test("S79 gift cards: full lifecycle issue→activate→partial×2→redeemed", async () => {
    const issue = await post("/gift-cards/cards", { type: "digital", amount: 100, currency: "USD", pin: "4321" });
    expect(issue.ok).toBe(true);
    const id = issue.data.id;
    const act = await post(`/gift-cards/cards/${id}/activate`, { pin: "4321" });
    expect(act.data.status).toBe("active");
    const r1 = await post(`/gift-cards/cards/${id}/redeem`, { amount: 30, pin: "4321" });
    expect(r1.data.redeemed).toBe(30);
    expect(r1.data.card.balance).toBe(70);
    expect(r1.data.card.status).toBe("partially-redeemed");
    const r2 = await post(`/gift-cards/cards/${id}/redeem`, { amount: 70, pin: "4321" });
    expect(r2.data.card.balance).toBe(0);
    expect(r2.data.card.status).toBe("redeemed");
  });

  test("S79 gift cards: payment method registered (no parallel gw)", async () => {
    const r = await get("/gift-cards/payment-method");
    expect(r.ok).toBe(true);
    expect(r.data.kind).toBe("gift-card");
    expect(r.data.id).toBe("wmpc-gift-cards");
  });

  test("S80 currency: USD→NGN rate + NG detect + localization", async () => {
    const rate = await get("/global-currency/rates/USD/NGN");
    expect(rate.ok).toBe(true);
    expect(rate.data.rate).toBeGreaterThan(100);
    const det = await post("/global-currency/detect", { country: "NG" });
    expect(det.data.currency).toBe("NGN");
    expect(det.data.paymentMethods.length).toBeGreaterThan(0);
    const loc = await post("/global-currency/localize-price", { amount: 100, from: "USD", to: "NGN", country: "NG" });
    expect(loc.data.formatted).toContain("₦");
  });

  test("S80 currency: fraud guard flags >10% deviation", async () => {
    const r = await post("/global-currency/fraud/check", { from: "USD", to: "NGN", observedRate: 5000 });
    expect(r.ok).toBe(true);
    expect(r.data.safe).toBe(false);
  });

  test("S76 validation: 22/22 checklist, consent+governance gates, no duplicates", async () => {
    const r = await get("/validation/report");
    expect(r.ok).toBe(true);
    expect(r.data.duplicatesDetected).toBe(0);
    expect(r.data.consentGateEnforced).toBe(true);
    expect(r.data.governanceGateEnforced).toBe(true);
    expect(r.data.checklist.filter((c: any) => c.passed).length).toBe(22);
    expect(r.data.wired).toBeGreaterThanOrEqual(20);
  });
});

test.describe("Sessions 41/76-80 UI", () => {
  test("Platform page loads and Validation tab renders", async ({ page }) => {
    const token = await apiLogin();
    await page.addInitScript((t) => { localStorage.setItem("windels:accessToken", t); }, token);
    await page.goto(`${WEB}/app/platform`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="tab"]', { timeout: 20000 });
    await page.getByRole("tab", { name: /Validation/i }).click();
    // Validation tab panel shows S76 checklist content
    await expect(page.getByRole("tabpanel")).toContainText(/checklist|wired|consent/i);
  });
});
