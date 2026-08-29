/**
 * Playwright E2E — Session 157: Quantum completion.
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

test.describe("Session 157 — Quantum completion", () => {
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

  test("GET /quantum/connectors never claims a live QPU", async () => {
    const res = await get("/quantum/connectors");
    expect(res.status).toBe(200);
    expect(res.data.length).toBe(6);
    for (const c of res.data) {
      expect(c.status).not.toBe("connected");
      expect(c.qubitsAvailable).toBeNull();
    }
  });

  test("empty dashboard is unassessed with null migrationPct", async () => {
    const d = await get("/quantum/dashboard/rollup");
    expect(d.status).toBe(200);
    if (d.data.cryptoInventory === 0) {
      expect(d.data.readiness).toBe("unassessed");
      expect(d.data.migrationPct).toBeNull();
    }
  });

  test("POST /quantum/inventory records an operator-entered system", async () => {
    const created = await send("POST", "/quantum/inventory", {
      system: "e2e-auth-" + Date.now(), algorithm: "RSA-2048", owner: "sec",
    });
    expect(created.status).toBe(200);
    expect(created.data.quantumVulnerable).toBe(true);
    expect(created.data.source).toBe("operator_entered");
  });

  test("POST /quantum/jobs stays queued without an objective", async () => {
    const j = await send("POST", "/quantum/jobs", { kind: "qaoa", problem: "routing" });
    expect(j.status).toBe(200);
    expect(j.data.status).toBe("queued");
    expect(j.data.objectiveValue).toBeUndefined();
  });

  test("unknown inventory entry is 404", async () => {
    const res = await get("/quantum/inventory/no-such-entry");
    expect(res.status).toBe(404);
  });
});
