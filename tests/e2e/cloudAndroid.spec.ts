import { test, expect } from "@playwright/test";
const API = process.env.API_URL ?? "http://localhost:4000/api/v1";
const NATIVE = process.env.NATIVE_API_URL ?? "http://localhost:4000/v1";
async function login(request: any) { const response = await request.post(`${API}/auth/login`, { data: { email: process.env.E2E_ADMIN_EMAIL ?? "admin@windels.ai", password: process.env.E2E_ADMIN_PASSWORD ?? "W1ndels!Admin#2026" } }); if (!response.ok()) return null; const body = await response.json(); return body.data?.token ?? body.data?.accessToken; }
async function key(request: any, token: string, scopes: string[]) { const response = await request.post(`${API}/apikeys`, { headers: { Authorization: `Bearer ${token}` }, data: { name: `cloud-android-e2e-${Date.now()}`, scopes: ["READ", "WRITE"], granularScopes: scopes, environment: "test", expiresInDays: 1 } }); expect(response.status()).toBe(201); return (await response.json()).data.key; }
const config = { name: "E2E Android", androidVersion: "15", region: "ng-central-1", cpuCores: 2, ramMb: 4096, storageGb: 32, locale: "en-US", timezone: "Africa/Lagos", networkPolicy: { mode: "restricted", internetAccess: false, domainAllowlist: [], domainBlocklist: [], bandwidthMbps: 20 }, securityProfile: "testing", installedApplications: [] };

test.describe("WINDELS AI Cloud Android", () => {
  test("internal control plane is authenticated and reports provider truthfully", async ({ request }) => {
    const anonymous = await request.get(`${API}/cloud-android/status`); if (anonymous.status() === 502) test.skip(); expect(anonymous.status()).toBe(401);
    const token = await login(request); if (!token) test.skip();
    const response = await request.get(`${API}/cloud-android/status`, { headers: { Authorization: `Bearer ${token}` } }); expect(response.ok()).toBeTruthy(); const body = await response.json(); expect(body.data).toEqual(expect.objectContaining({ configured: expect.any(Boolean), healthy: expect.any(Boolean) }));
  });

  test("public API scopes and tenant device list are enforced", async ({ request }) => {
    const token = await login(request); if (!token) test.skip();
    const readKey = await key(request, token, ["cloud-android:read"]);
    const list = await request.get(`${NATIVE}/cloud-android/devices`, { headers: { Authorization: `Bearer ${readKey}` } }); expect(list.ok()).toBeTruthy(); expect((await list.json()).object).toBe("list");
    const denied = await request.post(`${NATIVE}/cloud-android/devices`, { headers: { Authorization: `Bearer ${readKey}` }, data: config }); expect(denied.status()).toBe(403); expect((await denied.json()).error.code).toBe("insufficient_scope");
  });

  test("does not fabricate a device when Android runtime is unavailable", async ({ request }) => {
    const token = await login(request); if (!token) test.skip();
    const manageKey = await key(request, token, ["cloud-android:read", "cloud-android:manage"]);
    const before = await request.get(`${NATIVE}/cloud-android/devices`, { headers: { Authorization: `Bearer ${manageKey}` } }); const beforeCount = (await before.json()).data.length;
    const response = await request.post(`${NATIVE}/cloud-android/devices`, { headers: { Authorization: `Bearer ${manageKey}` }, data: config });
    if (!response.ok()) { expect(response.status()).toBe(503); expect((await response.json()).error.type).toBe("api_error"); }
    const after = await request.get(`${NATIVE}/cloud-android/devices`, { headers: { Authorization: `Bearer ${manageKey}` } });
    if (!response.ok()) expect((await after.json()).data.length).toBe(beforeCount);
  });

  test("OpenAPI advertises the Cloud Android control plane", async ({ request }) => {
    const response = await request.get(`${NATIVE}/openapi.json`); if (response.status() === 502) test.skip(); const spec = await response.json(); expect(spec.paths).toHaveProperty("/cloud-android/devices"); expect(spec.paths).toHaveProperty("/cloud-android/devices/{id}/ui/tap");
  });
});
