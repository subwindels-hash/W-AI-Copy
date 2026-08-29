import { test, expect } from "@playwright/test";
const BASE = process.env.API_URL ?? "http://localhost:4000/api/v1";
async function login(request: any) {
  const response = await request.post(`${BASE}/auth/login`, { data: { email: process.env.E2E_ADMIN_EMAIL ?? "admin@windels.ai", password: process.env.E2E_ADMIN_PASSWORD ?? "W1ndels!Admin#2026" } });
  if (!response.ok()) return null;
  const body = await response.json().catch(() => null);
  return body?.data?.accessToken ?? body?.data?.token ?? body?.accessToken ?? null;
}

test.describe("Super Admin Module & Plugin Center", () => {
  test("control-plane inventory requires authentication", async ({ request }) => {
    const response = await request.get(`${BASE}/super-admin/module-center/modules`);
    if (response.status() === 502) test.skip();
    expect([401, 403]).toContain(response.status());
  });

  test("dashboard reports real security-gate configuration", async ({ request }) => {
    const token = await login(request); if (!token) test.skip();
    const response = await request.get(`${BASE}/super-admin/module-center/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status() === 502) test.skip();
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual(expect.objectContaining({ total: expect.any(Number), active: expect.any(Number), runnerConfigured: expect.any(Boolean), scannerConfigured: expect.any(Boolean), signatureKeysConfigured: expect.any(Number) }));
  });

  test("registry does not expose protected artifact filesystem paths", async ({ request }) => {
    const token = await login(request); if (!token) test.skip();
    const response = await request.get(`${BASE}/super-admin/module-center/modules`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status() === 502) test.skip();
    expect(response.ok()).toBeTruthy();
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain("artifactPath");
    expect(text).not.toContain("MODULE_RUNNER_HMAC_SECRET");
  });

  test("runtime registrations require auth and expose active modules only", async ({ request }) => {
    const anonymous = await request.get(`${BASE}/module-runtime/registrations`);
    if (anonymous.status() === 502) test.skip();
    expect([401, 403]).toContain(anonymous.status());
    const token = await login(request); if (!token) test.skip();
    const response = await request.get(`${BASE}/module-runtime/registrations`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);
    for (const registration of body.data) {
      expect(registration.health).toBe("HEALTHY");
      expect(registration).not.toHaveProperty("serviceUrl");
    }
  });
});
