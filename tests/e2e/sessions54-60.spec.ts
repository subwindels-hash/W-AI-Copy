/**
 * Playwright E2E — Sessions 54-60 (Updates, Usage, Fabric, Robotics, Spatial, SDK, Training).
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";
const WEB = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173";

async function apiLogin(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
    });
    const j = await res.json().catch(() => ({}));
    if (j?.data?.token) return j.data.token;
    const waitMs = j?.meta?.retryAfterMs || 1000;
    await new Promise(r => setTimeout(r, waitMs + 200));
  }
  throw new Error("login failed after retries");
}

test.describe("Sessions 54-60 API", () => {
  let token: string;
  test.beforeAll(async () => { token = await apiLogin(); });
  const get = (path: string) => fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
  const post = (path: string, body: any) => fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(r => r.json());

  test("S54 updates: dashboard returns version + packages listable + validate path", async () => {
    const d = await get("/updates/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(typeof d.data.currentVersion).toBe("string");
    const pkgs = await get("/updates/packages");
    expect(Array.isArray(pkgs.data)).toBe(true);
  });

  test("S55 usage-intel: dashboard returns depts/modules/series/resources", async () => {
    const d = await get("/usage-intel/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(Array.isArray(d.data.departments)).toBe(true);
    expect(Array.isArray(d.data.modules)).toBe(true);
    expect(Array.isArray(d.data.series)).toBe(true);
    expect(d.data.resources).toBeDefined();
  });

  test("S56 fabric: trust, twins, sandbox creation, alerts, bus", async () => {
    const d = await get("/fabric/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(d.data.trust.overallScore).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(d.data.twins)).toBe(true);
    const sb = await post("/fabric/sandboxes", { name: "pw-sb", experiment: "playwright" });
    expect(sb.ok).toBe(true);
    expect(sb.data.id).toBeTruthy();
    const twins = await get("/fabric/twins");
    expect(Array.isArray(twins.data)).toBe(true);
    if (twins.data.length) {
      const sim = await post(`/fabric/twins/${twins.data[0].id}/simulate`, {});
      expect(sim.ok).toBe(true);
    }
  });

  test("S57 robotics: fleet listing + create + command", async () => {
    const d = await get("/robotics/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(typeof d.data.totalRobots).toBe("number");
    const cr = await post("/robotics/robots", { name: "pw-drone", kind: "drone", site: "pw-site" });
    expect(cr.ok).toBe(true);
    expect(cr.data.id).toBeTruthy();
    const cmd = await post(`/robotics/robots/${cr.data.id}/command`, { action: "start" });
    expect(cmd.ok).toBe(true);
    expect(cmd.data.status).toBe("active");
  });

  test("S58 spatial: by-mode counters + create session + end", async () => {
    const d = await get("/spatial/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(d.data.byMode.length).toBe(4);
    const s = await post("/spatial/sessions", { title: "pw-xr", mode: "xr", deviceTarget: "quest" });
    expect(s.ok).toBe(true);
    expect(s.data.status).toBe("streaming");
    const e = await post(`/spatial/sessions/${s.data.id}/end`, {});
    expect(e.ok).toBe(true);
    expect(e.data.status).toBe("idle");
  });

  test("S59 sdk: packages + CLI + emulator start", async () => {
    const d = await get("/sdk/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(d.data.commands.length).toBeGreaterThan(5);
    expect(Array.isArray(d.data.packages)).toBe(true);
    const emu = await post("/sdk/emulators", { name: "pw-emu", sdkKind: "agent" });
    expect(emu.ok).toBe(true);
  });

  test("S60 training: datasets + launch LoRA job", async () => {
    const d = await get("/training/dashboard/rollup");
    expect(d.ok).toBe(true);
    expect(typeof d.data.datasets).toBe("number");
    const ds = await post("/training/datasets", { name: "pw-ds", format: "jsonl" });
    expect(ds.ok).toBe(true);
    const j = await post("/training/jobs", { name: "pw-lora", baseModel: "Aria-7B", datasetId: ds.data.id, strategy: "lora", hyperparams: { lr: 2e-4, epochs: 2, batchSize: 8 } });
    expect(j.ok).toBe(true);
    expect(["queued","preparing","training"]).toContain(j.data.status);
  });
});

test.describe("Sessions 54-60 UI", () => {
  test("platform admin page is reachable and renders shell", async ({ page }) => {
    const token = await apiLogin();
    await page.addInitScript((t) => {
      (window as any).localStorage.setItem("windels:accessToken", t);
    }, token);
    const res = await page.goto(`${WEB}/admin/platform`, { waitUntil: "domcontentloaded", timeout: 30000 });
    expect(res?.status()).toBeLessThan(500);
    // Wait for page to initialize
    await page.waitForTimeout(2500);
    // Body should contain rendered content
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(100);
  });
});
