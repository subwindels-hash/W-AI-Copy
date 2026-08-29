import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function login(request: any) {
  const r = await request.post(`${BASE}/auth/login`, {
    data: { email: "admin@windels.ai", password: "W1ndels!Admin#2026" },
  });
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  return j.data.token as string;
}

test.describe("Session 32 — Collaboration & Perception Intelligence", () => {
  test("dashboard aggregates all three slices", async ({ request }) => {
    const token = await login(request);
    const r = await request.get(`${BASE}/collaboration/dashboard/rollup`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r.ok()).toBeTruthy();
    const d = (await r.json()).data;
    expect(d.connectors).toBeGreaterThanOrEqual(6);
    expect(d.connectorsHealthy).toBeGreaterThanOrEqual(4);
    expect(d.meetingsLive).toBeGreaterThanOrEqual(1);
    expect(d.meetingsToday).toBeGreaterThanOrEqual(4);
    expect(d.screenSessionsActive).toBeGreaterThanOrEqual(1);
    expect(d.cameraPipelines).toBe(6);
    expect(d.openFindings).toBeGreaterThanOrEqual(5);
    expect(d.advisoryFindingsPct).toBeGreaterThanOrEqual(50);
  });

  test("meetings list + AI join flow", async ({ request }) => {
    const token = await login(request);
    const r1 = await request.get(`${BASE}/collaboration/meetings?status=scheduled`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r1.ok()).toBeTruthy();
    const meets = (await r1.json()).data;
    expect(Array.isArray(meets)).toBeTruthy();
    const scheduled = meets[0];
    expect(scheduled.status).toBe("scheduled");
    const r2 = await request.post(`${BASE}/collaboration/meetings/${scheduled.id}/join`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r2.ok()).toBeTruthy();
    const j = await r2.json();
    expect(j.data.aiParticipantJoined).toBe(true);
    expect(["live", "transcribing"]).toContain(j.data.status);
  });

  test("screen sessions list + guided step advance", async ({ request }) => {
    const token = await login(request);
    const r1 = await request.get(`${BASE}/collaboration/screen/sessions`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r1.ok()).toBeTruthy();
    const sessions = (await r1.json()).data;
    expect(sessions.length).toBeGreaterThanOrEqual(3);
    const s = sessions[0];
    const r2 = await request.get(`${BASE}/collaboration/screen/sessions/${s.id}/steps`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r2.ok()).toBeTruthy();
    const steps = (await r2.json()).data;
    expect(Array.isArray(steps)).toBeTruthy();
    // code assists + docs + issues endpoints all reachable
    for (const path of ["code-assist", "docs", "issues"]) {
      const rx = await request.get(`${BASE}/collaboration/screen/sessions/${s.id}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(rx.ok()).toBeTruthy();
    }
  });

  test("camera pipelines list + acknowledge advisory finding", async ({ request }) => {
    const token = await login(request);
    const r1 = await request.get(`${BASE}/collaboration/camera/pipelines`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r1.ok()).toBeTruthy();
    const pipes = (await r1.json()).data;
    expect(pipes.length).toBe(6);
    // Advisory default pipeline (first non-approved one)
    const adv = pipes.find((p: any) => p.verdictDefault === "advisory");
    expect(adv).toBeTruthy();
    const r2 = await request.get(`${BASE}/collaboration/camera/pipelines/${adv.id}/findings`, { headers: { Authorization: `Bearer ${token}` } });
    expect(r2.ok()).toBeTruthy();
    const finds = (await r2.json()).data;
    expect(finds.length).toBeGreaterThanOrEqual(1);
    const open = finds.find((f: any) => !f.acknowledged);
    expect(open).toBeTruthy();
    expect(open.verdict).toBe("advisory");
    const r3 = await request.post(`${BASE}/collaboration/camera/pipelines/${adv.id}/findings/${open.id}/acknowledge`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: { by: "playwright" },
    });
    expect(r3.ok()).toBeTruthy();
    const ackd = (await r3.json()).data;
    expect(ackd.acknowledged).toBe(true);
    expect(ackd.acknowledgedBy).toBe("playwright");
  });
});
