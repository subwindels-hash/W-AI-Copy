import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function login(request: any) {
  const r = await request.post(`${BASE}/auth/login`, {
    data: { email: "admin@windels.ai", password: "W1ndels!Admin#2026" },
  });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).data.token as string;
}

test.describe("Session 33 — Vendor-Agnostic AI Ecosystem Infrastructure", () => {
  test("dashboard aggregates all three slices", async ({ request }) => {
    const t = await login(request);
    const r = await request.get(`${BASE}/ai-ecosystem/dashboard/rollup`, { headers: { Authorization: `Bearer ${t}` } });
    expect(r.ok()).toBeTruthy();
    const d = (await r.json()).data;
    expect(d.providers).toBeGreaterThanOrEqual(6);
    expect(d.providersHealthy).toBeGreaterThanOrEqual(4);
    expect(d.models).toBeGreaterThanOrEqual(10);
    expect(d.routingPolicies).toBeGreaterThanOrEqual(3);
    expect(d.personalityProfiles).toBeGreaterThanOrEqual(4);
    expect(d.voicePersonas).toBeGreaterThanOrEqual(3);
    expect(d.trustScoredResponses24h).toBeGreaterThanOrEqual(3);
    expect(d.avgConfidence).toBeGreaterThan(0.5);
  });

  test("provider list + route endpoint picks a healthy model", async ({ request }) => {
    const t = await login(request);
    const r1 = await request.get(`${BASE}/ai-ecosystem/providers`, { headers: { Authorization: `Bearer ${t}` } });
    expect(r1.ok()).toBeTruthy();
    const ps = (await r1.json()).data;
    expect(ps.length).toBeGreaterThanOrEqual(6);
    expect(ps.some((p: any) => p.deployment === "self-hosted")).toBe(true);
    // Vendor-neutral: new adapters (openai, anthropic, google, mistral, azure, bedrock, ollama, windels) present
    const vendors = new Set(ps.map((p: any) => p.vendor));
    expect(vendors.size).toBeGreaterThanOrEqual(6);
    const r2 = await request.post(`${BASE}/ai-ecosystem/route`, { headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, data: { capabilities: ["chat"] } });
    expect(r2.ok()).toBeTruthy();
    const j = await r2.json();
    expect(j.data.provider).toBeTruthy();
    expect(j.data.model).toBeTruthy();
    expect(j.data.viaFallback).toBe(false);
  });

  test("personality studio profiles + voice + department resolve", async ({ request }) => {
    const t = await login(request);
    const [rp, rv, rd] = await Promise.all([
      request.get(`${BASE}/ai-ecosystem/personalities`, { headers: { Authorization: `Bearer ${t}` } }),
      request.get(`${BASE}/ai-ecosystem/voice-personas`, { headers: { Authorization: `Bearer ${t}` } }),
      request.get(`${BASE}/ai-ecosystem/departments`, { headers: { Authorization: `Bearer ${t}` } }),
    ]);
    expect(rp.ok()).toBeTruthy();
    expect(rv.ok()).toBeTruthy();
    expect(rd.ok()).toBeTruthy();
    const profiles = (await rp.json()).data;
    expect(profiles.length).toBeGreaterThanOrEqual(4);
    const voices = (await rv.json()).data;
    expect(voices.length).toBeGreaterThanOrEqual(2);
    const depts = (await rd.json()).data;
    expect(depts.length).toBeGreaterThanOrEqual(3);
    const rr = await request.get(`${BASE}/ai-ecosystem/resolve-persona?department=engineering`, { headers: { Authorization: `Bearer ${t}` } });
    expect(rr.ok()).toBeTruthy();
    const resolved = (await rr.json()).data;
    expect(resolved).toBeTruthy();
    expect(resolved.kind).toBe("engineering");
  });

  test("trust/explainability reports + approve human-review queue", async ({ request }) => {
    const t = await login(request);
    const r1 = await request.get(`${BASE}/ai-ecosystem/trust/reports`, { headers: { Authorization: `Bearer ${t}` } });
    expect(r1.ok()).toBeTruthy();
    const reps = (await r1.json()).data;
    expect(reps.length).toBeGreaterThanOrEqual(3);
    const r2 = await request.get(`${BASE}/ai-ecosystem/trust/scores?humanReview=queued`, { headers: { Authorization: `Bearer ${t}` } });
    expect(r2.ok()).toBeTruthy();
    const q = (await r2.json()).data;
    expect(Array.isArray(q)).toBeTruthy();
    if (q.length > 0) {
      const score = q[0];
      const r3 = await request.post(`${BASE}/ai-ecosystem/trust/scores/${score.id}/review`, { headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, data: { state: "approved", by: "playwright" } });
      expect(r3.ok()).toBeTruthy();
      const approved = (await r3.json()).data;
      expect(approved.humanReview).toBe("approved");
      expect(approved.verification).toBe("verified");
    }
    // evidence/viewpoints/uncertainty/compliance sub-resources return arrays
    const rid = reps[0].id;
    for (const sub of ["evidence", "viewpoints", "uncertainty", "compliance"]) {
      const rx = await request.get(`${BASE}/ai-ecosystem/trust/reports/${rid}/${sub}`, { headers: { Authorization: `Bearer ${t}` } });
      expect(rx.ok()).toBeTruthy();
      expect(Array.isArray((await rx.json()).data)).toBe(true);
    }
  });
});
