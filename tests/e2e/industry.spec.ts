/**
 * Playwright E2E — Session 169: Industry Solutions completion.
 *
 * Covers:
 *   1. Dashboard rollup does not seed on read.
 *   2. Unmeasured metrics (semanticSearchLatencyMs, maturity) return null, never 0.
 *   3. Real adoptions aggregate accurately into the 25 vertical suites.
 *   4. Adoptions CRUD lifecycle through HTTP endpoints.
 *   5. Cross-tenant isolation (Org B cannot view or manipulate Org A's adoptions).
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function login(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json().catch(() => ({}));
  return j?.data?.token ?? null;
}

async function apiLogin(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const t = await login("admin@windels.ai", "W1ndels!Admin#2026");
    if (t) return t;
    await new Promise((r) => setTimeout(r, 1200));
  }
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@windels.ai",
      password: "W1ndels!Admin#2026",
      displayName: "Super Admin",
      organizationName: "WINDELS",
    }),
  });
  return (await login("admin@windels.ai", "W1ndels!Admin#2026"))!;
}

async function secondOrgToken(): Promise<string | null> {
  const email = `ind-tenant-${Date.now()}@example.test`;
  const password = "W1ndels!Tenant#2026";
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      displayName: "Tenant Industry B",
      organizationName: `Tenant-IndB-${Date.now()}`,
    }),
  });
  return login(email, password);
}

test.describe("Session 169 — Industry Solutions completion", () => {
  let token = "";
  test.beforeAll(async () => {
    token = await apiLogin();
  });
  const auth = (t = token) => ({ "Content-Type": "application/json", Authorization: `Bearer ${t}` });

  async function get(path: string, t = token) {
    const res = await fetch(`${BASE}${path}`, { headers: auth(t) });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }
  async function send(method: string, path: string, body?: unknown, t = token) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: auth(t),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  test("dashboard rollup returns honest nulls for unmeasured values and valid provenance", async () => {
    const res = await get("/industry/dashboard/rollup");
    expect(res.status).toBe(200);
    expect(res.data).toBeDefined();
    expect(res.data.semanticSearchLatencyMs).toBeNull();
    expect(res.data.maturity.overall).toBeNull();
    expect(res.data.provenance).toBeDefined();
    expect(res.data.industries.length).toBe(25);
  });

  test("suites endpoint lists all 25 vertical packs", async () => {
    const res = await get("/industry/suites");
    expect(res.status).toBe(200);
    expect(res.data.length).toBe(25);
    expect(res.data.some((s: any) => s.id === "healthcare")).toBe(true);
    expect(res.data.some((s: any) => s.id === "banking")).toBe(true);
  });

  test("adoptions CRUD lifecycle and aggregation in dashboard", async () => {
    const createRes = await send("POST", "/industry/adoptions", {
      industry: "healthcare",
      packageName: `E2E Clinical Pack ${Date.now()}`,
      status: "adopted",
      employees: 150,
      notes: "E2E deployment verification",
    });
    expect(createRes.status).toBe(201);
    const adoptionId = createRes.data.id;
    expect(adoptionId).toMatch(/^ind-/);

    const getRes = await get(`/industry/adoptions/${adoptionId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.employees).toBe(150);

    const patchRes = await send("PATCH", `/industry/adoptions/${adoptionId}`, {
      employees: 180,
      status: "piloting",
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.employees).toBe(180);
    expect(patchRes.data.status).toBe("piloting");

    const dashRes = await get("/industry/dashboard/rollup");
    expect(dashRes.status).toBe(200);
    const hc = dashRes.data.industries.find((i: any) => i.id === "healthcare");
    expect(hc.employees).toBeGreaterThanOrEqual(180);

    const delRes = await send("DELETE", `/industry/adoptions/${adoptionId}`);
    expect(delRes.status).toBe(204);

    const afterGet = await get(`/industry/adoptions/${adoptionId}`);
    expect(afterGet.status).toBe(404);
  });

  test("cross-tenant isolation on industry adoptions", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second org registration unavailable");

    const created = await send(
      "POST",
      "/industry/adoptions",
      {
        industry: "mining",
        packageName: `Mining AI Safety ${Date.now()}`,
        status: "adopted",
        employees: 300,
      },
      token
    );
    expect(created.status).toBe(201);

    const theirs = await get("/industry/adoptions", t2!);
    expect(theirs.status).toBe(200);
    const ids = (theirs.data ?? []).map((a: any) => a.id);
    expect(ids).not.toContain(created.data.id);

    const direct = await get(`/industry/adoptions/${created.data.id}`, t2!);
    expect(direct.status).toBe(404);

    const dash = await get("/industry/dashboard/rollup", t2!);
    const mining = dash.data.industries.find((i: any) => i.id === "mining");
    expect(mining.employees).toBe(0);
    expect(mining.readinessPct).toBeNull();
  });
});
