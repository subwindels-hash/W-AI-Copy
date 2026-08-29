import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
const API = process.env.API_BASE_URL ?? "http://127.0.0.1:4000/api/v1";

test.describe("Session 29 — Platform Services", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const r = await request.post(`${API}/auth/login`, {
      data: { email: "admin@windels.ai", password: "W1ndels!Admin#2026" },
    });
    const j = await r.json();
    token = j.data.token;
    expect(token).toBeTruthy();
  });

  test("rollup aggregates all slices", async ({ request }) => {
    const r = await request.get(`${API}/platform-services/dashboard/rollup`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.ok()).toBeTruthy();
    const j = await r.json();
    expect(j.ok).toBe(true);
    const d = j.data;
    expect(d.configEntries).toBeGreaterThanOrEqual(20);
    expect(d.featureFlags).toBeGreaterThanOrEqual(15);
    expect(d.policies).toBeGreaterThanOrEqual(8);
    expect(d.tenants).toBeGreaterThanOrEqual(2);
    expect(d.licenses).toBeGreaterThanOrEqual(2);
    expect(d.accounts).toBeGreaterThanOrEqual(2);
    expect(d.capabilities).toBeGreaterThanOrEqual(15);
    expect(d.ontologyClasses).toBeGreaterThanOrEqual(15);
    expect(d.blueprints).toBeGreaterThanOrEqual(5);
  });

  test("toggle feature flag then list reflects state", async ({ request }) => {
    const list0 = await request.get(`${API}/platform-services/flags`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j0 = await list0.json();
    const flag = j0.data[0];
    expect(flag).toBeTruthy();
    const orig = flag.enabled;
    const tog = await request.post(`${API}/platform-services/flags/${flag.id}/toggle`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(tog.ok()).toBeTruthy();
    const jTog = await tog.json();
    expect(jTog.data.enabled).toBe(!orig);
    // toggle back
    await request.post(`${API}/platform-services/flags/${flag.id}/toggle`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  test("policy evaluation returns allow/deny", async ({ request }) => {
    // Evaluate with a safe context (no PCI export)
    const allow = await request.post(`${API}/platform-services/policies/evaluate`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { context: { action: "read", dataset: "crm" } },
    });
    const ja = await allow.json();
    expect(ja.ok).toBe(true);
    expect(ja.data.allow).toBe(true);

    // Evaluate PCI export -> should be denied
    const deny = await request.post(`${API}/platform-services/policies/evaluate`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { context: { action: "export", dataset: "pci" } },
    });
    const jd = await deny.json();
    expect(jd.ok).toBe(true);
    expect(jd.data.allow).toBe(false);
    expect(jd.data.deniedBy.key).toBe("pci-no-export");
  });

  test("tenant, license, blueprint, capability, ontology lists populated", async ({ request }) => {
    const h = { Authorization: `Bearer ${token}` };
    for (const path of [
      "/platform-services/config",
      "/platform-services/flags",
      "/platform-services/policies",
      "/platform-services/tenants",
      "/platform-services/licenses",
      "/platform-services/billing",
      "/platform-services/capabilities",
      "/platform-services/ontology",
      "/platform-services/blueprints",
      "/platform-services/config/runtime",
    ]) {
      const r = await request.get(`${API}${path}`, { headers: h });
      expect(r.ok()).toBeTruthy();
      const j = await r.json();
      expect(j.ok).toBe(true);
      const data = j.data;
      if (Array.isArray(data)) expect(data.length).toBeGreaterThan(0);
      else expect(typeof data).toBe("object");
    }
  });
});
