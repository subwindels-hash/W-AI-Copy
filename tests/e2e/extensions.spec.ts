import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
const API = process.env.API_BASE_URL ?? "http://127.0.0.1:4000/api/v1";

async function login(page: any) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("domcontentloaded").catch(()=>{});
  // Try direct API login + token set via localStorage, then nav to platform.
  const res = await page.request.post(`${API}/auth/login`, {
    data: { email: "admin@windels.ai", password: "W1ndels!Admin#2026" },
  });
  const j = await res.json();
  const token = j.data?.token;
  if (token) await page.evaluate((t: string) => localStorage.setItem("windels_token", t), token);
}

test.describe("Extension Platform (Session 28)", () => {
  test("dashboard rollup endpoint returns aggregate stats", async ({ request }) => {
    const lr = await request.post(`${API}/auth/login`, {
      data: { email: "admin@windels.ai", password: "W1ndels!Admin#2026" },
    });
    const { data: { token } } = await lr.json();
    const r = await request.get(`${API}/extensions/dashboard/rollup`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r.ok()).toBeTruthy();
    const d = await r.json();
    expect(d.ok).toBe(true);
    expect(d.data.totalExtensions).toBeGreaterThanOrEqual(20);
    expect(d.data.installedCount).toBeGreaterThanOrEqual(1);
    expect(d.data.byKind.business).toBeGreaterThan(0);
    expect(d.data.byKind.industry).toBeGreaterThan(0);
    expect(d.data.byKind.skill).toBeGreaterThan(0);
    expect(d.data.byKind.agent).toBeGreaterThan(0);
    expect(d.data.byKind.workflow).toBeGreaterThan(0);
    expect(d.data.byKind.dashboard).toBeGreaterThan(0);
    expect(d.data.byKind["ui-component"]).toBeGreaterThan(0);
  });

  test("registry list returns published extensions across all kinds", async ({ request }) => {
    const lr = await request.post(`${API}/auth/login`, {
      data: { email: "admin@windels.ai", password: "W1ndels!Admin#2026" },
    });
    const { data: { token } } = await lr.json();
    const r = await request.get(`${API}/extensions`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r.ok()).toBeTruthy();
    const d = await r.json();
    expect(d.data.length).toBeGreaterThanOrEqual(20);
    const kinds = new Set(d.data.map((e: any) => e.kind));
    for (const k of ["business","industry","skill","agent","workflow","dashboard","ui-component"]) {
      expect(kinds.has(k)).toBe(true);
    }
  });

  test("kind-filtered endpoints return correct subset", async ({ request }) => {
    const lr = await request.post(`${API}/auth/login`, {
      data: { email: "admin@windels.ai", password: "W1ndels!Admin#2026" },
    });
    const { data: { token } } = await lr.json();
    const biz = await (await request.get(`${API}/extensions/business/list`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(biz.data.length).toBeGreaterThan(0);
    const ind = await (await request.get(`${API}/extensions/industry/list`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(ind.data.length).toBeGreaterThan(0);
    const sk = await (await request.get(`${API}/extensions/skills/list`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(sk.data.length).toBeGreaterThan(0);
    const ag = await (await request.get(`${API}/extensions/agents/list`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(ag.data.length).toBeGreaterThan(0);
  });

  test("install + enable + disable lifecycle transitions an extension", async ({ request }) => {
    const lr = await request.post(`${API}/auth/login`, {
      data: { email: "admin@windels.ai", password: "W1ndels!Admin#2026" },
    });
    const { data: { token } } = await lr.json();
    const list = await (await request.get(`${API}/extensions?status=published`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const candidate = list.data.find((e: any) => !e.installed);
    expect(candidate).toBeTruthy();
    const install = await request.post(`${API}/extensions/${candidate.id}/install`, { headers: { Authorization: `Bearer ${token}` } });
    expect(install.ok()).toBeTruthy();
    const inst = await install.json();
    expect(inst.data.status).toBe("installed");
    const disable = await request.post(`${API}/extensions/${candidate.id}/disable`, { headers: { Authorization: `Bearer ${token}` } });
    expect(disable.ok()).toBeTruthy();
    const d = await disable.json();
    expect(d.data.status).toBe("disabled");
    const enable = await request.post(`${API}/extensions/${candidate.id}/enable`, { headers: { Authorization: `Bearer ${token}` } });
    expect(enable.ok()).toBeTruthy();
    const e = await enable.json();
    expect(e.data.status).toBe("enabled");
    const uninstall = await request.post(`${API}/extensions/${candidate.id}/uninstall`, { headers: { Authorization: `Bearer ${token}` } });
    expect(uninstall.ok()).toBeTruthy();
  });
});
