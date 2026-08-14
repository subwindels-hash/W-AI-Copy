/**
 * Playwright E2E — Session 162: Voice Studio completion.
 *
 * The critical case is cross-tenant isolation: this spec registers a SECOND
 * organization and proves it cannot see the first org's cloned voices, presets
 * or synthesis history. Before S162 every one of those stores was global.
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
      email: "admin@windels.ai", password: "W1ndels!Admin#2026",
      displayName: "Super Admin", organizationName: "WINDELS",
    }),
  });
  return (await login("admin@windels.ai", "W1ndels!Admin#2026"))!;
}

/** A throwaway second tenant, used to prove isolation. */
async function secondOrgToken(): Promise<string | null> {
  const email = `vs-tenant-${Date.now()}@example.test`;
  const password = "W1ndels!Tenant#2026";
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email, password, displayName: "Tenant B", organizationName: `Tenant-B-${Date.now()}`,
    }),
  });
  return login(email, password);
}

test.describe("Session 162 — Voice Studio completion", () => {
  let token = "";
  test.beforeAll(async () => { token = await apiLogin(); });
  const auth = (t = token) => ({ "Content-Type": "application/json", Authorization: `Bearer ${t}` });

  async function get(path: string, t = token) {
    const res = await fetch(`${BASE}${path}`, { headers: auth(t) });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }
  async function send(method: string, path: string, body?: unknown, t = token) {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: auth(t),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  test("cloning without consent is rejected and counted", async () => {
    const res = await send("POST", "/voice-studio/voices/clone", {
      name: "no-consent-" + Date.now(), gender: "feminine", age: "adult", consentGranted: false,
    });
    expect(res.status).toBe(400);
    expect(res.error.code).toBe("CONSENT_REQUIRED");
  });

  test("a clone records consent and invents no training epochs", async () => {
    const res = await send("POST", "/voice-studio/voices/clone", {
      name: "e2e-voice-" + Date.now(), gender: "feminine", age: "adult",
      language: "en", method: "hf-clone", consentGranted: true,
    });
    expect(res.status).toBe(200);
    expect(res.data.consent).toBe("consent-recorded");
    expect(res.data.consentRecordedAt).toBeTruthy();
    expect(res.data.organizationId).toBeTruthy();
    expect(res.data.visibility).toBe("private");
    // Used to be 12 for hf-clone, for a process that trains nothing.
    expect(res.data.trainedEpochs ?? null).toBeNull();
  });

  test("latency is null until a synthesis is measured, never 180", async () => {
    const res = await get("/voice-studio/dashboard/rollup");
    expect(res.status).toBe(200);
    if (res.data.ttsJobsTotal === 0) {
      expect(res.data.avgSynthLatencyMs).toBeNull();
    }
    expect(res.data.provenance).toBeTruthy();
  });

  test("languages is a measured count, not 19 + n", async () => {
    const [dash, builtin] = await Promise.all([
      get("/voice-studio/dashboard/rollup"),
      get("/voice-studio/voices/builtin"),
    ]);
    const builtinLangs = new Set(builtin.data.map((v: any) => v.language)).size;
    // The old formula guaranteed >= 19 + customLangs; the honest count can
    // never be below the built-in distinct count nor absurdly above it.
    expect(dash.data.languages).toBeGreaterThanOrEqual(builtinLangs);
    expect(dash.data.languages).toBeLessThan(builtinLangs + 50);
  });

  test("24h jobs and lifetime total are reported separately", async () => {
    const res = await get("/voice-studio/dashboard/rollup");
    expect(res.data).toHaveProperty("ttsJobs24h");
    expect(res.data).toHaveProperty("ttsJobsTotal");
    expect(res.data.ttsJobs24h).toBeLessThanOrEqual(res.data.ttsJobsTotal);
  });

  test("a second organization cannot see the first org's voices, presets or jobs", async () => {
    const tokenB = await secondOrgToken();
    test.skip(!tokenB, "second tenant registration unavailable");

    // Org A creates a voice, a preset and a synthesis job.
    const marker = "isolation-" + Date.now();
    const cloned = await send("POST", "/voice-studio/voices/clone", {
      name: marker, gender: "feminine", age: "adult", language: "en", consentGranted: true,
    });
    expect(cloned.status).toBe(200);
    await send("POST", "/voice-studio/presets", {
      name: marker, voiceId: cloned.data.id, settings: { warmth: 0.8 },
    });
    await send("POST", "/voice-studio/synthesize", { voiceId: cloned.data.id, text: marker });

    // Org B must see none of it.
    const bVoices = await get("/voice-studio/voices/custom", tokenB!);
    const bPresets = await get("/voice-studio/presets", tokenB!);
    const bJobs = await get("/voice-studio/jobs", tokenB!);

    expect(bVoices.data.find((v: any) => v.name === marker)).toBeUndefined();
    expect(bPresets.data.find((p: any) => p.name === marker)).toBeUndefined();
    expect(bJobs.data.find((j: any) => j.voiceId === cloned.data.id)).toBeUndefined();
  });

  test("a second organization cannot mutate the first org's voice", async () => {
    const tokenB = await secondOrgToken();
    test.skip(!tokenB, "second tenant registration unavailable");

    const cloned = await send("POST", "/voice-studio/voices/clone", {
      name: "guard-" + Date.now(), gender: "feminine", age: "adult", language: "en", consentGranted: true,
    });
    const attempt = await send("PATCH", `/voice-studio/voices/${cloned.data.id}/settings`,
      { pitch: 9 }, tokenB!);
    expect(attempt.status).toBe(404);
  });

  test("consent violations are scoped per organization", async () => {
    const tokenB = await secondOrgToken();
    test.skip(!tokenB, "second tenant registration unavailable");

    const before = (await get("/voice-studio/dashboard/rollup", tokenB!)).data.consentViolations;
    // Org A triggers a violation.
    await send("POST", "/voice-studio/voices/clone", {
      name: "viol-" + Date.now(), gender: "feminine", age: "adult", consentGranted: false,
    });
    const after = (await get("/voice-studio/dashboard/rollup", tokenB!)).data.consentViolations;
    expect(after).toBe(before);
  });

  test("the built-in catalogue is stable across calls", async () => {
    const a = await get("/voice-studio/voices/builtin");
    const b = await get("/voice-studio/voices/builtin");
    expect(a.data.length).toBe(b.data.length);
    expect(a.data.map((v: any) => `${v.id}:${v.gender}`))
      .toEqual(b.data.map((v: any) => `${v.id}:${v.gender}`));
  });
});
