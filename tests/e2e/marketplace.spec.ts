import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173";
const API = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function login(): Promise<string> {
  const r = await fetch(API + "/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
  });
  const j = await r.json();
  return j.data.token;
}

test.describe("Session 33/34/35/36 — Platform tabs render & APIs respond", () => {
  let token: string;
  test.beforeAll(async () => { token = await login(); });

  test("AI Ecosystem dashboard returns expected keys", async () => {
    const r = await fetch(API + "/ai-ecosystem/dashboard/rollup", { headers: { authorization: "Bearer " + token } });
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.data.providers).toBeGreaterThanOrEqual(8);
    expect(j.data.personalityProfiles).toBeGreaterThanOrEqual(6);
    expect(j.data.trustScoredResponses24h).toBeGreaterThanOrEqual(5);
    expect(j.data.avgBrandAlignment).toBeGreaterThan(80);
  });

  test("Marketplace rollup aggregates skills/twins/scenarios/apps", async () => {
    const r = await fetch(API + "/marketplace/dashboard/rollup", { headers: { authorization: "Bearer " + token } });
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.data.skillsAvailable).toBeGreaterThanOrEqual(8);
    expect(j.data.twins).toBeGreaterThanOrEqual(4);
    expect(j.data.scenarios).toBeGreaterThanOrEqual(4);
    expect(j.data.appsAvailable).toBeGreaterThanOrEqual(4);
  });

  test("Marketplace lists seeded skills and installations", async () => {
    const r = await fetch(API + "/marketplace/skills", { headers: { authorization: "Bearer " + token } });
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.data.length).toBeGreaterThanOrEqual(8);
    const inst = await (await fetch(API + "/marketplace/skills/installations", { headers: { authorization: "Bearer " + token } })).json();
    expect(inst.ok).toBe(true);
  });

  test("Digital twins: list returns seeds, entities populated", async () => {
    const r = await fetch(API + "/marketplace/twins", { headers: { authorization: "Bearer " + token } });
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.data.length).toBeGreaterThanOrEqual(4);
    const firstId = j.data[0].id;
    const entities = await (await fetch(API + "/marketplace/twins/" + firstId + "/entities", { headers: { authorization: "Bearer " + token } })).json();
    expect(entities.ok).toBe(true);
    expect(entities.data.length).toBeGreaterThanOrEqual(3);
  });

  test("Simulation: running a scenario returns KPI impacts", async () => {
    const sc = await (await fetch(API + "/marketplace/scenarios", { headers: { authorization: "Bearer " + token } })).json();
    const id = sc.data[0].id;
    const r = await fetch(API + "/marketplace/scenarios/" + id + "/run", {
      method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: "{}",
    });
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.data.status).toBe("completed");
    expect(j.data.kpiImpacts.length).toBeGreaterThanOrEqual(3);
    expect(j.data.feedsSuperintelligence).toBe(true);
  });

  test("App store: published apps, installs tracked", async () => {
    const r = await fetch(API + "/marketplace/apps?approved=true", { headers: { authorization: "Bearer " + token } });
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.data.length).toBeGreaterThanOrEqual(4);
  });

  test("Crypto module is disabled by default", async () => {
    const r = await fetch(API + "/crypto-intel/dashboard/rollup", { headers: { authorization: "Bearer " + token } });
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.data.moduleEnabled).toBe(false);
    expect(j.data.moduleStatus).toBe("disabled");
    expect(j.data.note).toContain("DISABLED");
    // Chains still visible read-only
    const chains = await (await fetch(API + "/crypto-intel/chains", { headers: { authorization: "Bearer " + token } })).json();
    expect(chains.data.length).toBeGreaterThanOrEqual(4);
  });

  test("Crypto trade propose rejected when disabled", async () => {
    const r = await fetch(API + "/crypto-intel/trades", {
      method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ side: "buy", symbol: "BTC", orderType: "market", amountUsd: 1000, reason: "speculative", confidence: 0.7, riskLevel: "high" }),
    });
    expect(r.status).toBe(403);
  });

  test("Wake intelligence: config + patterns + devices + bindings", async () => {
    const r = await fetch(API + "/wake-intel/dashboard/rollup", { headers: { authorization: "Bearer " + token } });
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.data.clapPatterns).toBeGreaterThanOrEqual(3);
    expect(j.data.mfaPolicies).toBeGreaterThanOrEqual(1);
    expect(j.data.workforceBindings).toBeGreaterThanOrEqual(3);
    expect(j.data.activations24h).toBeGreaterThanOrEqual(10);
    const pats = await (await fetch(API + "/wake-intel/clap/patterns", { headers: { authorization: "Bearer " + token } })).json();
    expect(pats.data.length).toBeGreaterThanOrEqual(3);
    const devs = await (await fetch(API + "/wake-intel/devices", { headers: { authorization: "Bearer " + token } })).json();
    expect(devs.data.length).toBeGreaterThanOrEqual(3);
  });

  test("Wake endpoint accepts hotkey activation", async () => {
    const r = await fetch(API + "/wake-intel/activate", {
      method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ method: "hotkey", deviceId: "dev-laptop-01", deviceKind: "laptop", userId: "admin" }),
    });
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.data.outcome).toBe("accepted");
  });
});
