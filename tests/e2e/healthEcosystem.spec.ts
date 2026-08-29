/**
 * Playwright E2E — Session 175: HealthEcosystem completion (Tier 2 #10)
 *
 * Covers:
 * 1. Auth guard — dashboard 401 without token
 * 2. Empty org/user dashboard returns hasData:false and no hec:* seeding
 * 3. Metric CRUD + Fifth Standing Rule label gate
 * 4. Medication / note / alert / profile lifecycles
 * 5. Cross-org isolation (Org B cannot see Org A's metrics)
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
  const email = `hec-tenant-${Date.now()}@example.test`;
  const password = "W1ndels!Tenant#2026";
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      displayName: "Tenant HEC B",
      organizationName: `Tenant-HECB-${Date.now()}`,
    }),
  });
  return login(email, password);
}

test.describe("Session 175 — HealthEcosystem completion", () => {
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

  test("dashboard requires authentication (401 without token)", async () => {
    const res = await fetch(`${BASE}/health-ecosystem/dashboard/rollup`);
    expect([401, 403].includes(res.status)).toBeTruthy();
  });

  test("empty org/user dashboard returns hasData:false with honest empty lists", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second org registration unavailable");
    const res = await get("/health-ecosystem/dashboard/rollup", t2!);
    expect(res.status).toBe(200);
    expect(res.data.hasData).toBe(false);
    expect(res.data.recentMetrics).toEqual([]);
    expect(res.data.recentSessions).toEqual([]);
    expect(res.data.medications).toEqual([]);
    expect(res.data.wearables).toEqual([]);
    expect(res.data.medicalDevices).toEqual([]);
    expect(res.data.profile).toBeUndefined();
    expect(res.data.consentStatus).toBe("none");
    // DailyHealth zeros are scoped by hasData:false, not presented as measurements
    expect(res.data.today.score).toBe(0);
    expect(res.data.labelBreakdown.wellness_estimate).toBe(0);
  });

  test("metric CRUD and Fifth Standing Rule label gate", async () => {
    // manual cannot claim clinically_validated
    const manual = await send("POST", "/health-ecosystem/metrics", {
      kind: "bp_systolic",
      value: 120,
      unit: "mmHg",
      source: "manual",
      label: "clinically_validated",
    });
    expect(manual.status).toBe(200);
    expect(manual.data.label).toBe("wellness_estimate");

    // medical device may carry clinical
    const device = await send("POST", "/health-ecosystem/metrics", {
      kind: "bp_systolic",
      value: 118,
      unit: "mmHg",
      source: "bp_monitor",
      label: "clinically_validated",
    });
    expect(device.status).toBe(200);
    expect(device.data.label).toBe("clinically_validated");

    const listed = await get("/health-ecosystem/metrics?limit=50");
    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.data)).toBeTruthy();
    expect(listed.data.length).toBeGreaterThanOrEqual(2);

    const dash = await get("/health-ecosystem/dashboard/rollup");
    expect(dash.status).toBe(200);
    expect(dash.data.hasData).toBe(true);
    expect(dash.data.recentMetrics.length).toBeGreaterThan(0);
  });

  test("medication lifecycle — adherence starts at 0 without prescriber", async () => {
    const created = await send("POST", "/health-ecosystem/medications", {
      name: `Vitamin D3 ${Date.now()}`,
      dose: "2000 IU",
      frequency: "daily",
    });
    expect(created.status).toBe(200);
    expect(created.data.label).toBe("wellness_estimate");
    expect(created.data.adherencePct).toBe(0);

    const withPrescriber = await send("POST", "/health-ecosystem/medications", {
      name: `Lisinopril ${Date.now()}`,
      dose: "10mg",
      frequency: "daily",
      prescriber: "Dr. Demo",
    });
    expect(withPrescriber.status).toBe(200);
    expect(withPrescriber.data.label).toBe("clinically_validated");

    const listed = await get("/health-ecosystem/medications");
    expect(listed.status).toBe(200);
    expect(listed.data.some((m: any) => m.id === created.data.id)).toBeTruthy();

    const del = await send("DELETE", `/health-ecosystem/medications/${created.data.id}`);
    expect(del.status).toBe(200);
  });

  test("profile upsert and retrieval", async () => {
    const up = await send("POST", "/health-ecosystem/profile", {
      age: 42,
      consentGiven: true,
      consentVersion: "v1",
      conditions: ["hypertension"],
    });
    expect(up.status).toBe(200);
    expect(up.data.age).toBe(42);
    expect(up.data.consentGiven).toBe(true);

    const got = await get("/health-ecosystem/profile");
    expect(got.status).toBe(200);
    expect(got.data.age).toBe(42);
  });

  test("note and emergency alert lifecycle", async () => {
    const note = await send("POST", "/health-ecosystem/notes", {
      mood: 4,
      energy: 3,
      journal: "E2E test note",
    });
    expect(note.status).toBe(200);
    expect(note.data.journal).toBe("E2E test note");

    const notesListed = await get("/health-ecosystem/notes");
    expect(notesListed.status).toBe(200);
    expect(notesListed.data.some((n: any) => n.id === note.data.id)).toBeTruthy();

    const alert = await send("POST", "/health-ecosystem/emergency-alerts", {
      kind: "abnormal_vitals",
      severity: "warn",
      message: `E2E alert ${Date.now()}`,
    });
    expect(alert.status).toBe(200);
    expect(alert.data.kind).toBe("abnormal_vitals");

    const ack = await send("POST", `/health-ecosystem/emergency-alerts/${alert.data.id}/acknowledge`, {});
    expect(ack.status).toBe(200);
    expect(ack.data.acknowledged).toBe(true);
  });

  test("wearable and medical device registration", async () => {
    const w = await send("POST", "/health-ecosystem/wearables", {
      vendor: "apple",
      model: `Watch 9 ${Date.now()}`,
      batteryPct: 85,
      connected: true,
    });
    expect(w.status).toBe(200);
    expect(w.data.vendor).toBe("apple");

    const md = await send("POST", "/health-ecosystem/medical-devices", {
      kind: "bp_monitor",
      vendor: "Omron",
      model: `X7 ${Date.now()}`,
      connected: true,
    });
    expect(md.status).toBe(200);
    expect(md.data.kind).toBe("bp_monitor");
  });

  test("cross-org isolation — Org B cannot see Org A's metrics", async () => {
    const t2 = await secondOrgToken();
    test.skip(!t2, "second org registration unavailable");

    const created = await send("POST", "/health-ecosystem/metrics", {
      kind: "steps",
      value: 7777,
      unit: "steps",
      source: "wearable",
    }, token);
    expect(created.status).toBe(200);

    const theirs = await get("/health-ecosystem/metrics", t2!);
    expect(theirs.status).toBe(200);
    expect((theirs.data ?? []).some((m: any) => m.id === created.data.id)).toBe(false);

    const dashOther = await get("/health-ecosystem/dashboard/rollup", t2!);
    expect(dashOther.status).toBe(200);
    expect(dashOther.data.recentMetrics.some((m: any) => m.id === created.data.id)).toBe(false);
    // hasData for B may still be false if they have no other data; but at least not leaking A's
    // We assert that B's metrics don't contain A's id, not hasData value which could be true if B previously wrote.
  });

  test("insights derived from recorded metrics are wellness_estimate only", async () => {
    // Add enough sleep metrics to derive an insight
    for (let i = 0; i < 5; i++) {
      await send("POST", "/health-ecosystem/metrics", {
        kind: "sleep",
        value: 420,
        unit: "min",
        source: "wearable",
        at: new Date(Date.now() - i * 86_400_000).toISOString(),
      });
    }
    const dash = await get("/health-ecosystem/dashboard/rollup");
    expect(dash.status).toBe(200);
    expect(dash.data.insights.length).toBeGreaterThan(0);
    for (const ins of dash.data.insights) expect(ins.label).toBe("wellness_estimate");
  });
});
