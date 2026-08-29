import { test, expect } from "@playwright/test";

const API = process.env.API_BASE_URL ?? "http://127.0.0.1:4000/api/v1";

test.describe("Session 31 — Enterprise Foundation", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    const r = await request.post(`${API}/auth/login`, {
      data: { email: "admin@windels.ai", password: "W1ndels!Admin#2026" },
    });
    const j = await r.json();
    token = j.data.token;
    expect(token).toBeTruthy();
  });

  test("dashboard aggregates all foundation slices", async ({ request }) => {
    const r = await request.get(`${API}/enterprise-foundation/dashboard/rollup`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.ok()).toBeTruthy();
    const j = await r.json();
    expect(j.ok).toBe(true);
    const d = j.data;
    expect(d.connectors).toBeGreaterThanOrEqual(10);
    expect(d.dataProducts).toBeGreaterThanOrEqual(5);
    expect(d.principals).toBeGreaterThanOrEqual(30);
    expect(d.idps).toBeGreaterThanOrEqual(4);
    expect(d.monthlyCost).toBeGreaterThan(0);
    expect(d.autoHealingPlaybooks).toBeGreaterThanOrEqual(5);
    expect(d.bcpPlans).toBeGreaterThanOrEqual(5);
    expect(d.qualityScorecards).toBeGreaterThanOrEqual(5);
    expect(d.globalRps).toBeGreaterThan(0);
  });

  test("list endpoints return non-empty data", async ({ request }) => {
    const h = { Authorization: `Bearer ${token}` };
    const paths = [
      "/enterprise-foundation/connectors",
      "/enterprise-foundation/products",
      "/enterprise-foundation/lineage",
      "/enterprise-foundation/principals",
      "/enterprise-foundation/idps",
      "/enterprise-foundation/service-accounts",
      "/enterprise-foundation/accounts",
      "/enterprise-foundation/anomalies",
      "/enterprise-foundation/optimizations",
      "/enterprise-foundation/incidents",
      "/enterprise-foundation/playbooks",
      "/enterprise-foundation/bcp",
      "/enterprise-foundation/scorecards",
      "/enterprise-foundation/eval-runs",
      "/enterprise-foundation/global-status",
      "/enterprise-foundation/kpis",
    ];
    for (const p of paths) {
      const r = await request.get(`${API}${p}`, { headers: h });
      expect(r.ok()).toBeTruthy();
      const j = await r.json();
      expect(j.ok).toBe(true);
      const data = j.data;
      if (Array.isArray(data)) expect(data.length).toBeGreaterThan(0);
      else expect(typeof data).toBe("object");
    }
  });

  test("apply a recommended optimization succeeds", async ({ request }) => {
    const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const list = await request.get(`${API}/enterprise-foundation/optimizations?status=recommended`, { headers: h });
    const opts = (await list.json()).data;
    expect(opts.length).toBeGreaterThan(0);
    const target = opts[0];
    const apply = await request.post(`${API}/enterprise-foundation/optimizations/${target.id}/apply`, { headers: h });
    expect(apply.ok()).toBeTruthy();
    const j = await apply.json();
    expect(j.data.status).toBe("applied");
  });

  test("running a playbook and acknowledging an anomaly", async ({ request }) => {
    const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const pbList = await request.get(`${API}/enterprise-foundation/playbooks`, { headers: h });
    const pb = (await pbList.json()).data[0];
    const run = await request.post(`${API}/enterprise-foundation/playbooks/${pb.id}/run`, { headers: h });
    expect(run.ok()).toBeTruthy();

    const anomList = await request.get(`${API}/enterprise-foundation/anomalies?status=open`, { headers: h });
    const anoms = (await anomList.json()).data;
    if (anoms.length > 0) {
      const ack = await request.post(`${API}/enterprise-foundation/anomalies/${anoms[0].id}/ack`, { headers: h });
      expect(ack.ok()).toBeTruthy();
      const ja = await ack.json();
      expect(ja.data.status).toBe("acknowledged");
    }
  });
});
