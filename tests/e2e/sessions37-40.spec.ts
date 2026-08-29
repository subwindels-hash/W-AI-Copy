/**
 * Sessions 37 (Architecture) / 38 (Self-Hosted) / 39 (Kernel) / 40 (Voice Studio) E2E.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";
const UI = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173";

async function apiLogin() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
  });
  const j = await res.json();
  return j.data.token;
}

test.describe("Sessions 37-40 API", () => {
  let token: string;
  test.beforeAll(async () => { token = await apiLogin(); });

  const get = (path: string) =>
    fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
  const post = (path: string, body: any) =>
    fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(r => r.json());

  test("S37 Architecture - status has 8 deploy targets and 13 modules", async () => {
    const r = await get("/architecture/dashboard/rollup");
    expect(r.ok).toBe(true);
    expect(r.data.deploymentTargets).toHaveLength(8);
    expect(r.data.modules.length).toBeGreaterThanOrEqual(13);
  });

  test("S37 Architecture - ESI feed is an array", async () => {
    const r = await get("/architecture/esi");
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.data.signals)).toBe(true);
  });

  test("S38 Self-Hosted - dashboard has healthy nodes", async () => {
    const r = await get("/self-hosted/dashboard/rollup");
    expect(r.ok).toBe(true);
    expect(r.data.nodes).toBeGreaterThanOrEqual(4);
    expect(r.data.models).toBeGreaterThanOrEqual(5);
    expect(r.data.vectorStores).toBeGreaterThanOrEqual(3);
  });

  test("S38 Self-Hosted - inference runs", async () => {
    const models = await get("/self-hosted/models");
    const modelId = models.data[0].id;
    const r = await post("/self-hosted/inference", { modelId, prompt: "ping", maxTokens: 16 });
    expect(r.ok).toBe(true);
    expect(r.data.status).toBe("completed");
    expect(typeof r.data.latencyMs).toBe("number");
  });

  test("S39 Kernel - has 20 components", async () => {
    const r = await get("/kernel/status");
    expect(r.ok).toBe(true);
    expect(r.data.components).toHaveLength(20);
    const online = r.data.components.filter((c:any) => c.status === "online").length;
    expect(online).toBeGreaterThanOrEqual(10);
  });

  test("S39 Kernel - dispatch emits event, high-risk policy is blocked", async () => {
    const ev = await post("/kernel/dispatch", { kind: "e2e.test", source: "playwright", payload: { ok: true } });
    expect(ev.ok).toBe(true);
    expect(ev.data.id).toMatch(/^ke-/);
    const pol = await post("/kernel/policy/evaluate", { risk: "high", action: "deploy" });
    expect(pol.ok).toBe(true);
    expect(pol.data.allowed).toBe(false);
    expect(pol.data.requiredApprovals.length).toBeGreaterThanOrEqual(1);
  });

  test("S40 Voice Studio - 49+ builtin voices, 13 emotions, consent gate works", async () => {
    const d = await get("/voice-studio/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(d.data.builtInVoices).toBeGreaterThanOrEqual(47);
    expect(d.data.emotions).toBe(13);
    const bad = await post("/voice-studio/voices/clone", { name: "Bad", gender: "feminine", age: "adult", consentGranted: false });
    expect(bad.ok).toBe(false);
    expect(bad.error.code).toBe("CONSENT_REQUIRED");
  });

  test("S40 Voice Studio - synthesize returns audio url", async () => {
    const voices = await get("/voice-studio/voices/builtin");
    const vid = voices.data[0].id;
    const r = await post("/voice-studio/synthesize", { voiceId: vid, text: "Hello from Playwright" });
    expect(r.ok).toBe(true);
    expect(r.data.status).toBe("ready");
    expect(r.data.audioUrl).toContain("/audio/");
  });
});

test.describe("Sessions 37-40 UI", () => {
  test("platform page mounts with pre-injected auth and shows new tabs", async ({ page }) => {
    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
    });
    const loginJson = await loginRes.json();
    const tok = loginJson.data.token;
    await page.goto(`${UI}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => { localStorage.setItem("windels:accessToken", t); }, tok);
    await page.goto(`${UI}/app/platform`, { waitUntil: "domcontentloaded" });
    // Wait for tab strip to render
    await page.waitForSelector('[role="tab"]', { timeout: 20000 });
    await expect(page.getByRole("tab", { name: /Architecture/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("tab", { name: /Self-Hosted/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Voice Studio/i })).toBeVisible();
  });
});
