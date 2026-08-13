/**
 * Playwright E2E — Session 158: Legal completion.
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

test.describe("Session 158 — Legal completion", () => {
  let token = "";
  test.beforeAll(async () => { token = await apiLogin(); });
  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  async function get(path: string) {
    const res = await fetch(`${BASE}${path}`, { headers: auth() });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }
  async function send(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: auth(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  test("empty dashboard does not claim 100% compliance", async () => {
    const d = await get("/legal/dashboard/rollup");
    expect(d.status).toBe(200);
    if (d.data.mattersOpen === 0) {
      expect(d.data.riskAvg).toBeNull();
    }
    // If this org has no checks, pass rate must be null not 1.
    expect(d.data.provenance.compliancePassRate).toMatch(/not 100%/);
  });

  test("POST /legal/matters then list", async () => {
    const created = await send("POST", "/legal/matters", {
      title: "e2e-matter-" + Date.now(), kind: "advisory", riskScore: 15,
    });
    expect(created.status).toBe(201);
    const list = await get("/legal/matters");
    expect(list.data.some((m: any) => m.id === created.data.id)).toBe(true);
  });

  test("POST /legal/research invents no citations", async () => {
    const r = await send("POST", "/legal/research", { query: "What is the EU AI Act?" });
    expect(r.status).toBe(200);
    expect(r.data.citations).toEqual([]);
    expect(r.data.sources).toBe(0);
  });

  test("unknown update ack is 404", async () => {
    const res = await send("POST", "/legal/updates/no-such/acknowledge");
    expect(res.status).toBe(404);
  });
});
