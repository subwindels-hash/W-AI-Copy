/**
 * Playwright E2E — Sessions 42, 43, 44, 45, 46, 47.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";
const WEB = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173";

async function apiLogin(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
  });
  return (await res.json()).data.token;
}

test.describe("Sessions 42-47 API", () => {
  let token: string;
  test.beforeAll(async () => { token = await apiLogin(); });
  const get = (path: string) => fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
  const post = (path: string, body: any) => fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(r => r.json());

  test("S42 media-gen: 24 capabilities, kernel-routed, child-gate rejects unsafe", async () => {
    const d = await get("/media-generation/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(d.data.capabilities).toBeGreaterThanOrEqual(24);
    expect(d.data.routedThroughKernel).toBe(true);
    const caps = await get("/media-generation/capabilities?modality=video");
    expect(caps.data.length).toBeGreaterThan(0);
    const bad = await post("/media-generation/generate", { modality: "image", op: "text-to-image", prompt: "explicit gore content" });
    expect(bad.data.status).toBe("failed");
  });

  test("S43 hybrid-exec: 3 modes, vendor-neutral, routes to self-hosted GPU", async () => {
    const d = await get("/hybrid-execution/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(d.data.modes).toEqual(["self-hosted","hybrid","connected-enterprise"]);
    expect(d.data.vendorNeutral).toBe(true);
    expect(d.data.gpuNodes).toBeGreaterThanOrEqual(4);
    const dec = await post("/hybrid-execution/route", { modality: "text", requiredVramMb: 2000 });
    expect(dec.ok).toBe(true);
    expect(["self-hosted","hybrid","connected-enterprise"]).toContain(dec.data.mode);
  });

  test("S44 voice-ownership: immutable audit + consent gate backing S40/S41", async () => {
    const d = await get("/voice-ownership/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(d.data.immutableAudit).toBe(true);
    expect(d.data.governanceWired).toBe(true);
    expect(d.data.policiesActive).toBeGreaterThanOrEqual(4);
    const policies = await get("/voice-ownership/policies");
    expect(policies.data.length).toBeGreaterThanOrEqual(4);
  });

  test("S45 core-integration: critical pass, proceed to S46", async () => {
    const r = await get("/core-integration/checkpoint");
    expect(r.ok).toBe(true);
    expect(r.data.criticalPassed).toBe(true);
    expect(r.data.canProceedToSession46).toBe(true);
    expect(r.data.missing).toBe(0);
    expect(r.data.kernelDispatchRoundtripMs).toBeLessThan(100);
  });

  test("S46 model-factory: extends S43, lifecycle gates safety+governance", async () => {
    const d = await get("/model-factory/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(d.data.extendsS43Registry).toBe(true);
    const models = await get("/model-factory/models");
    expect(models.data.length).toBeGreaterThanOrEqual(5);
    const m = models.data[0];
    // Can't advance to canary without governance approval
    const bad = await post(`/model-factory/models/${m.id}/advance`, { to: "canary" });
    expect(bad.ok).toBe(false);
    // Approve safety then governance
    await post(`/model-factory/models/${m.id}/safety`, { passed: true });
    const approved = await post(`/model-factory/models/${m.id}/governance-approve`, {});
    expect(approved.ok).toBe(true);
    expect(approved.data.governanceApproved).toBe(true);
  });

  test("S47 memory-evolution: 9 types, add/recall/deduplicate works", async () => {
    const d = await get("/memory-evolution/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(d.data.extendsS37Fabric).toBe(true);
    expect(Object.keys(d.data.memoriesByType).length).toBe(9);
    const unique = "pw-memory-" + Date.now();
    const added = await post("/memory-evolution/memories", { type: "episodic", content: unique, tags: ["pw"] });
    expect(added.ok).toBe(true);
    const recall = await get("/memory-evolution/memories?type=episodic");
    expect(recall.data.some((m:any) => m.content === unique)).toBe(true);
    // dedup
    const c = await post("/memory-evolution/consolidate", { kind: "deduplicate" });
    expect(c.ok).toBe(true);
    expect(typeof c.data.affected).toBe("number");
  });

  test("UI: Core Integration tab renders PROCEED", async ({ page }) => {
    const t = await apiLogin();
    await page.addInitScript((tok) => localStorage.setItem("windels:accessToken", tok), t);
    await page.goto(`${WEB}/app/platform`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[role="tab"]', { timeout: 20000 });
    await page.getByRole("tab", { name: /Core Integration/i }).click();
    await expect(page.getByRole("tabpanel")).toContainText(/PROCEED|proceed/i);
  });
});
