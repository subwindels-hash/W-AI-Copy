/**
 * Playwright E2E — Session 156: Spatial completion.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.API_BASE_URL || "http://127.0.0.1:4000/api/v1";

async function apiLogin(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.data?.token) return j.data.token;
      await new Promise((r) => setTimeout(r, 1200));
    } catch {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@windels.ai", password: "W1ndels!Admin#2026",
      displayName: "Super Admin", organizationName: "WINDELS",
    }),
  });
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@windels.ai", password: "W1ndels!Admin#2026" }),
  });
  const j = await res.json();
  return j.data.token;
}

test.describe("Session 156 — Spatial completion", () => {
  let token = "";
  test.beforeAll(async () => { token = await apiLogin(); });
  const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
  async function get(path: string) {
    const res = await fetch(`${BASE}${path}`, { headers: auth() });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }
  async function send(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: auth(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, ...(await res.json().catch(() => ({}))) } as any;
  }

  test("GET /spatial/dashboard/rollup does not invent a campus", async () => {
    const d = await get("/spatial/dashboard/rollup");
    expect(d.status).toBe(200);
    expect(d.data.provenance.devicesOnline).toMatch(/heartbeat/i);
  });

  test("POST /spatial/sessions then end", async () => {
    const created = await send("POST", "/spatial/sessions", {
      title: "e2e-walk-" + Date.now(), mode: "ar", deviceTarget: "hololens",
    });
    expect(created.status).toBe(200);
    expect(created.data.status).toBe("streaming");
    const ended = await send("POST", `/spatial/sessions/${created.data.id}/end`);
    expect(ended.status).toBe(200);
    expect(ended.data.status).toBe("idle");
  });

  test("POST /spatial/devices/heartbeat increments devicesOnline", async () => {
    const beat = await send("POST", "/spatial/devices/heartbeat", {
      fingerprint: "e2e-headset-" + Date.now(), deviceTarget: "quest",
    });
    expect(beat.status).toBe(200);
    expect(beat.data.lastSeenAt).toBeTruthy();
    const d = await get("/spatial/dashboard/rollup");
    expect(d.data.devicesOnline).toBeGreaterThan(0);
  });

  test("unknown session end is 404", async () => {
    const res = await send("POST", "/spatial/sessions/no-such/end");
    expect(res.status).toBe(404);
  });
});
