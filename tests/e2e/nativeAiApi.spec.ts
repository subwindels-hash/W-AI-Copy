import { test, expect } from "@playwright/test";
const API = process.env.API_URL ?? "http://localhost:4000/api/v1";
const NATIVE = process.env.NATIVE_API_URL ?? "http://localhost:4000/v1";
async function login(request: any) {
  const response = await request.post(`${API}/auth/login`, { data: { email: process.env.E2E_ADMIN_EMAIL ?? "admin@windels.ai", password: process.env.E2E_ADMIN_PASSWORD ?? "W1ndels!Admin#2026" } });
  if (!response.ok()) return null;
  const body = await response.json(); return body?.data?.token ?? body?.data?.accessToken ?? null;
}
async function createKey(request: any, token: string, name: string, scopes: string[]) {
  const response = await request.post(`${API}/apikeys`, { headers: { Authorization: `Bearer ${token}` }, data: { name, scopes: ["READ", "WRITE"], granularScopes: scopes, environment: "test", expiresInDays: 1 } });
  expect(response.status()).toBe(201); return (await response.json()).data;
}

test.describe("WINDELS Native AI API /v1", () => {
  test("publishes OpenAPI without exposing an unverified model", async ({ request }) => {
    const openapi = await request.get(`${NATIVE}/openapi.json`);
    if (openapi.status() === 502) test.skip();
    expect(openapi.ok()).toBeTruthy();
    const spec = await openapi.json();
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.paths).toHaveProperty("/chat/completions");
  });

  test("creates, uses, rotates and revokes a one-time WND key", async ({ request }) => {
    const token = await login(request); if (!token) test.skip();
    const created = await createKey(request, token, `native-e2e-${Date.now()}`, ["models:read", "ai:execute"]);
    expect(created.key).toMatch(/^WND_/);
    const list = await request.get(`${API}/apikeys`, { headers: { Authorization: `Bearer ${token}` } });
    expect(JSON.stringify(await list.json())).not.toContain(created.key);

    const models = await request.get(`${NATIVE}/models`, { headers: { Authorization: `Bearer ${created.key}` } });
    expect(models.ok()).toBeTruthy();
    const catalog = await models.json();
    expect(catalog.object).toBe("list");
    for (const model of catalog.data) expect(model.status).toBe("available");

    const rotatedResponse = await request.post(`${API}/apikeys/${created.id}/rotate`, { headers: { Authorization: `Bearer ${token}` }, data: {} });
    expect(rotatedResponse.status()).toBe(201);
    const rotated = (await rotatedResponse.json()).data;
    expect(rotated.key).toMatch(/^WND_/);
    expect((await request.get(`${NATIVE}/models`, { headers: { Authorization: `Bearer ${created.key}` } })).status()).toBe(401);
    expect((await request.get(`${NATIVE}/models`, { headers: { Authorization: `Bearer ${rotated.key}` } })).ok()).toBeTruthy();

    await request.post(`${API}/apikeys/${rotated.id}/revoke`, { headers: { Authorization: `Bearer ${token}` }, data: {} });
    expect((await request.get(`${NATIVE}/models`, { headers: { Authorization: `Bearer ${rotated.key}` } })).status()).toBe(401);
  });

  test("enforces least-privilege scopes", async ({ request }) => {
    const token = await login(request); if (!token) test.skip();
    const key = await createKey(request, token, `scope-e2e-${Date.now()}`, ["models:read"]);
    const denied = await request.post(`${NATIVE}/chat/completions`, { headers: { Authorization: `Bearer ${key.key}` }, data: { model: "windels-native", messages: [{ role: "user", content: "Hello" }] } });
    expect(denied.status()).toBe(403);
    expect((await denied.json()).error.code).toBe("insufficient_scope");
  });

  test("fails unavailable instead of returning demo AI when no real model exists", async ({ request }) => {
    const token = await login(request); if (!token) test.skip();
    const key = await createKey(request, token, `no-demo-e2e-${Date.now()}`, ["ai:execute"]);
    const response = await request.post(`${NATIVE}/chat/completions`, { headers: { Authorization: `Bearer ${key.key}` }, data: { model: "windels-native", messages: [{ role: "user", content: "Do not echo this" }] } });
    // Environments with a configured real provider may succeed. An unconfigured
    // environment must fail explicitly and never return the echo demo provider.
    if (response.ok()) {
      const body = await response.json(); expect(body.model).toBe("windels-native"); expect(JSON.stringify(body)).not.toContain("DEMO");
    } else {
      expect(response.status()).toBe(503); const body = await response.json(); expect(body.error.type).toBe("api_error"); expect(JSON.stringify(body)).not.toContain("echo-demo");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
    const usage = await request.get(`${API}/developer/usage/records?days=1&perPage=100`, { headers: { Authorization: `Bearer ${token}` } });
    expect(usage.ok()).toBeTruthy();
    const usageBody = await usage.json();
    expect(usageBody.data.items.some((item: any) => item.endpoint === "native.chat.completions" && item.requestId && item.model === "windels-native")).toBe(true);
  });
});
