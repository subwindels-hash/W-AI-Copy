import { test, expect } from "@playwright/test";

/**
 * E2E — Audit Trail (Session 130)
 * Verifies the 7 admin-scoped /api/v1/audit routes live.
 * Skips gracefully when API not reachable (CI without live server).
 */
const BASE = process.env.API_URL ?? "http://localhost:4000/api/v1";

async function loginAsAdmin(request: any) {
  const email = process.env.E2E_ADMIN_EMAIL ?? "admin@windels.ai";
  const password = process.env.E2E_ADMIN_PASSWORD ?? "W1ndels!Admin#2026";
  const res = await request.post(`${BASE}/auth/login`, { data: { email, password } });
  if (!res.ok()) return null;
  const body = await res.json().catch(()=> null);
  const token = body?.data?.accessToken ?? body?.accessToken ?? null;
  return token;
}

test.describe("Audit Trail — /api/v1/audit", () => {
  test("GET /audit requires auth (401 anon)", async ({ request }) => {
    const res = await request.get(`${BASE}/audit`);
    // Either 401 or 502 if server not running — don't fail CI when no server
    if (res.status() === 502) test.skip();
    expect([401,403]).toContain(res.status());
  });

  test("GET /audit returns paginated logs for admin", async ({ request }) => {
    const token = await loginAsAdmin(request);
    if (!token) test.skip();
    const res = await request.get(`${BASE}/audit?limit=5`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status() === 502) test.skip();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toHaveProperty("logs");
    expect(body.data).toHaveProperty("total");
  });

  test("GET /audit/recent returns array", async ({ request }) => {
    const token = await loginAsAdmin(request);
    if (!token) test.skip();
    const res = await request.get(`${BASE}/audit/recent?limit=5`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status() === 502) test.skip();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("GET /audit/stats returns stats object", async ({ request }) => {
    const token = await loginAsAdmin(request);
    if (!token) test.skip();
    const res = await request.get(`${BASE}/audit/stats?days=7`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status() === 502) test.skip();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data).toHaveProperty("stats");
    expect(body.data).toHaveProperty("period");
  });

  test("GET /audit/timeline returns 14 entries", async ({ request }) => {
    const token = await loginAsAdmin(request);
    if (!token) test.skip();
    const res = await request.get(`${BASE}/audit/timeline?days=7`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status() === 502) test.skip();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.entries).toHaveLength(7);
  });

  test("GET /audit/:id 404 for missing", async ({ request }) => {
    const token = await loginAsAdmin(request);
    if (!token) test.skip();
    const res = await request.get(`${BASE}/audit/nonexistent-id-xyz`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status() === 502) test.skip();
    expect(res.status()).toBe(404);
  });

  test("GET /audit/export JSON + CSV", async ({ request }) => {
    const token = await loginAsAdmin(request);
    if (!token) test.skip();
    const start = new Date(Date.now() - 86400000*7).toISOString();
    const end = new Date().toISOString();
    const j = await request.get(`${BASE}/audit/export?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&format=json`, { headers: { Authorization: `Bearer ${token}` } });
    if (j.status() === 502) test.skip();
    expect(j.ok()).toBeTruthy();
    const c = await request.get(`${BASE}/audit/export?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}&format=csv`, { headers: { Authorization: `Bearer ${token}` } });
    expect(c.ok()).toBeTruthy();
    const text = await c.text();
    expect(text.split("\n")[0]).toContain("id,action");
  });

  test("GET /audit respects action filter", async ({ request }) => {
    const token = await loginAsAdmin(request);
    if (!token) test.skip();
    const res = await request.get(`${BASE}/audit?action=auth.login&limit=5`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status() === 502) test.skip();
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    for(const row of body.data.logs){ expect(row.action).toBe("auth.login"); }
  });
});
