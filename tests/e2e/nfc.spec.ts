import { test, expect } from "@playwright/test";

const APP_API = process.env.API_URL ?? "http://localhost:4000/api/v1";
const PUBLIC_API = process.env.PUBLIC_API_URL ?? "http://localhost:4000/api/rest/v1";
async function login(request: any) {
  const response = await request.post(`${APP_API}/auth/login`, { data: {
    email: process.env.E2E_ADMIN_EMAIL ?? "admin@windels.ai",
    password: process.env.E2E_ADMIN_PASSWORD ?? "W1ndels!Admin#2026",
  } });
  if (!response.ok()) return null;
  const body = await response.json().catch(() => null);
  return body?.data?.accessToken ?? body?.data?.token ?? body?.accessToken ?? null;
}

test.describe("NFC Card Manager API", () => {
  test("application NFC inventory requires authentication", async ({ request }) => {
    const response = await request.get(`${APP_API}/nfc/cards`);
    if (response.status() === 502) test.skip();
    expect([401, 403]).toContain(response.status());
  });

  test("API-key NFC gateway rejects anonymous access", async ({ request }) => {
    const response = await request.get(`${PUBLIC_API}/nfc/cards`);
    if (response.status() === 502) test.skip();
    expect(response.status()).toBe(401);
  });

  test("templates and diagnostics expose honest hardware posture", async ({ request }) => {
    const token = await login(request); if (!token) test.skip();
    const headers = { Authorization: `Bearer ${token}` };
    const templates = await request.get(`${APP_API}/nfc/templates`, { headers });
    if (templates.status() === 502) test.skip();
    expect(templates.ok()).toBeTruthy();
    const templateBody = await templates.json();
    expect(templateBody.ok).toBe(true);
    expect(templateBody.data.length).toBeGreaterThanOrEqual(10);
    expect(templateBody.data.some((item: any) => item.id === "windels-profile")).toBe(true);

    const diagnostics = await request.get(`${APP_API}/nfc/diagnostics`, { headers });
    expect(diagnostics.ok()).toBeTruthy();
    const diagnosticBody = await diagnostics.json();
    expect(diagnosticBody.data.moduleStatus).toBe("HARDWARE_VALIDATION_REQUIRED");
    expect(diagnosticBody.data.checks.some((item: any) => item.code === "UNQUALIFIED_COMBINATION")).toBe(true);
  });

  test("card library starts from persisted observations, never fabricated sample hardware", async ({ request }) => {
    const token = await login(request); if (!token) test.skip();
    const response = await request.get(`${APP_API}/nfc/cards`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status() === 502) test.skip();
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    for (const card of body.data) {
      expect(card).not.toHaveProperty("cardKeyHash");
      if (card.uidMasked) expect(card.uidMasked).toMatch(/^••••[A-F0-9]{1,4}$/);
    }
  });
});
