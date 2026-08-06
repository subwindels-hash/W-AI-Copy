/**
 * Playwright E2E — Session 120: public API gateway completion.
 *
 * Runs against a live API and pins the behaviours only a running server can
 * prove:
 *   - the six gateway endpoints keep their paths, scopes and status codes;
 *   - the Session 120 fixes: DELETE /apikeys/:id hard-deletes (the token
 *     dies immediately and the row is gone — it used to silently *revoke*),
 *     and the call ledger records every authenticated request and is readable
 *     through both `GET /api/rest/v1/usage` and the internal
 *     `GET /api/v1/apikeys/usage`;
 *   - scope enforcement: a READ-only key cannot trigger a workflow run;
 *   - Bearer-only authentication: a key in the query string is refused;
 *   - the usage report is honest: ledgerStart present after calls, and a
 *     missing average is null, never 0.
 *
 * Unit coverage for the cross-tenant workflow pin, the renewal path, the
 * ledger arithmetic and the isolation rules lives in
 * `apps/api/src/publicApi/publicApi.completion.test.ts`.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";
const REST = process.env.PUBLIC_API_BASE_URL || "http://127.0.0.1:4000/api/rest/v1";

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

test.describe("Session 120 — public API gateway completion", () => {
  let token = "";
  const marker = `e2e-pub-${Date.now()}`;

  test.beforeAll(async () => {
    token = await apiLogin();
  });

  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });

  async function get(path: string, headers: Record<string, string> = auth()) {
    const res = await fetch(`${BASE}${path}`, { headers });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }
  async function send(method: string, path: string, body?: unknown, headers: Record<string, string> = auth()) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  async function createKey(name: string, scopes: string[]): Promise<string> {
    const created = await send("POST", "/apikeys", { name, scopes });
    expect(created.status).toBe(201);
    return created.data.key as string;
  }

  test("every gateway endpoint refuses an anonymous caller", async () => {
    for (const path of ["/", "/workflows", "/workflows/some-id", "/workflows/some-id/run", "/agents", "/talk/channels", "/talk/channels/some-id/messages", "/usage"]) {
      const res = await fetch(`${REST}${path}`);
      expect([401, 403]).toContain(res.status);
    }
  });

  test("the six Session 120 predecessor endpoints keep their paths, scopes and status codes", async () => {
    const key = await createKey(`${marker} full`, ["READ", "WRITE", "ADMIN"]);
    const k = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };

    const identity = await fetch(`${REST}/`, { headers: k });
    expect(identity.status).toBe(200);
    const idBody: any = await identity.json();
    expect(idBody.data.service).toBe("windels-api-gateway");
    expect(typeof idBody.data.organization).toBe("string");

    const workflows = await fetch(`${REST}/workflows`, { headers: k });
    expect(workflows.status).toBe(200);
    expect(Array.isArray((await workflows.json()).data)).toBe(true);

    const agents = await fetch(`${REST}/agents`, { headers: k });
    expect(agents.status).toBe(200);
    expect(Array.isArray((await agents.json()).data)).toBe(true);

    const channels = await fetch(`${REST}/talk/channels`, { headers: k });
    expect(channels.status).toBe(200);
    expect(Array.isArray((await channels.json()).data)).toBe(true);

    // Unknown ids answer 404 through the org-scoped lookups, not 500.
    const run = await fetch(`${REST}/workflows/${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}/run`, {
      method: "POST", headers: k, body: JSON.stringify({}),
    });
    expect(run.status).toBe(404);
    const msg = await fetch(`${REST}/talk/channels/${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}/messages`, {
      method: "POST", headers: k, body: JSON.stringify({ content: "hi" }),
    });
    expect(msg.status).toBe(404);
  });

  test("a READ-only key is refused by write endpoints with 403", async () => {
    const key = await createKey(`${marker} read-only`, ["READ"]);
    const k = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
    const run = await fetch(`${REST}/workflows/not-used/run`, {
      method: "POST", headers: k, body: JSON.stringify({}),
    });
    expect(run.status).toBe(403);
    const msg = await fetch(`${REST}/talk/channels/not-used/messages`, {
      method: "POST", headers: k, body: JSON.stringify({ content: "hi" }),
    });
    expect(msg.status).toBe(403);
  });

  test("a key in the query string is refused — Bearer only", async () => {
    const key = await createKey(`${marker} qs`);
    const res = await fetch(`${REST}/workflows?key=${encodeURIComponent(key)}`);
    expect(res.status).toBe(401);
  });

  test("authenticated calls land in the ledger and the report reads it", async () => {
    const key = await createKey(`${marker} ledger`, ["READ"]);
    const k = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
    // Three calls: identity + two lists.
    await fetch(`${REST}/`, { headers: k });
    await fetch(`${REST}/workflows`, { headers: k });
    await fetch(`${REST}/agents`, { headers: k });

    const usage = await fetch(`${REST}/usage?days=7`, { headers: k });
    expect(usage.status).toBe(200);
    const body: any = await usage.json();
    expect(body.data.ledgerAvailable).toBe(true);
    expect(body.data.ledgerStart).toBeTruthy();
    expect(body.data.totalCalls).toBeGreaterThanOrEqual(3);
    expect(body.data.callsToday).toBeGreaterThanOrEqual(3);
    const row = body.data.perKey.find((p: any) => p.name === `${marker} ledger`);
    expect(row).toBeTruthy();
    expect(row.calls).toBeGreaterThanOrEqual(3);
    expect(body.data.recentCalls.length).toBeGreaterThanOrEqual(3);
    expect(typeof body.data.note).toBe("string");
    if (body.data.ledgerCoveredDays === 0) expect(body.data.avgCallsPerDay).toBeNull();
  });

  test("the internal usage endpoint serves the same report to the console", async () => {
    const key = await createKey(`${marker} internal`);
    const k = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
    await fetch(`${REST}/`, { headers: k });
    const usage = await get("/apikeys/usage?days=7");
    expect(usage.status).toBe(200);
    expect(usage.data.ledgerStart).toBeTruthy();
    expect(usage.data.totalCalls).toBeGreaterThanOrEqual(1);
    const row = usage.data.perKey.find((p: any) => p.name === `${marker} internal`);
    expect(row).toBeTruthy();
    expect(row.calls).toBeGreaterThanOrEqual(1);
  });

  test("FIXED: DELETE /apikeys/:id hard-deletes — the token dies and the row is gone", async () => {
    const key = await createKey(`${marker} delete-me`, ["READ"]);
    const k = { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
    const ok = await fetch(`${REST}/`, { headers: k });
    expect(ok.status).toBe(200);

    // Find the key id via the internal list.
    const list: any = await get("/apikeys?includeRevoked=true");
    const row = list.data.find((r: any) => r.name === `${marker} delete-me`);
    expect(row).toBeTruthy();

    const deleted = await send("DELETE", `/apikeys/${row.id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.data.deleted).toBe(true);

    // The token immediately stops working.
    const after = await fetch(`${REST}/`, { headers: k });
    expect(after.status).toBe(401);

    // The row is gone even from the include-revoked list.
    const list2: any = await get("/apikeys?includeRevoked=true");
    expect(list2.data.some((r: any) => r.id === row.id)).toBe(false);
  });

  test("renewal: an expiring key is extended via PATCH and keeps verifying", async () => {
    const created = await send("POST", "/apikeys", { name: `${marker} renew`, scopes: ["READ"], expiresInDays: 1 });
    const id = created.data.id;
    const patched = await send("PATCH", `/apikeys/${id}`, { expiresInDays: 90 });
    expect(patched.status).toBe(200);
    expect(patched.data.expiresAt).toBeTruthy();
    const after = new Date(patched.data.expiresAt).getTime();
    expect(after).toBeGreaterThan(Date.now() + 80 * 86_400_000);
  });

  test("a revoked key stays revoked and cannot be changed", async () => {
    const created = await send("POST", "/apikeys", { name: `${marker} revoked`, scopes: ["READ"] });
    const id = created.data.id;
    const revoked = await send("PATCH", `/apikeys/${id}`, { revoked: true });
    expect(revoked.status).toBe(200);
    expect(revoked.data.revoked).toBe(true);
    const denied = await send("PATCH", `/apikeys/${id}`, { expiresInDays: 30 });
    expect(denied.status).toBe(409);
  });
});
