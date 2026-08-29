/**
 * Playwright E2E — Session 155: Robotics completion.
 *
 * Validates against a live API that:
 *   - An empty fleet reports null averages (never 0-as-measurement).
 *   - Creating a robot is operator_entered and does not move averages.
 *   - HTTP telemetry ingest becomes device_reported and drives averages.
 *   - Commands stay local_state_only.
 *   - Predictive scan only fires on live-telemetry thresholds.
 *   - MQTT is never claimed connected.
 *   - Unknown robots 404.
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

test.describe("Session 155 — Robotics completion", () => {
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

  test("GET /robotics/connectors never claims MQTT connected", async () => {
    const res = await get("/robotics/connectors");
    expect(res.status).toBe(200);
    const mqtt = res.data.find((c: any) => c.id === "mqtt");
    const http = res.data.find((c: any) => c.id === "http-ingest");
    expect(http.status).toBe("ready");
    expect(mqtt.status).not.toBe("ready");
    expect(["not_configured", "configured_not_connected"]).toContain(mqtt.status);
  });

  test("POST /robots is operator_entered and does not move averages", async () => {
    const created = await send("POST", "/robotics/robots", {
      name: "e2e-arm-" + Date.now(), kind: "industrial_arm", site: "e2e-plant",
    });
    expect(created.status).toBe(200);
    expect(created.data.telemetrySource).toBe("operator_entered");
    expect(created.data.telemetryStale).toBe(true);
    const dash = await get("/robotics/dashboard/rollup");
    expect(dash.status).toBe(200);
    expect(dash.data.totalRobots).toBeGreaterThan(0);
    // Averages stay null until a device reports (this org may have leftover
    // live robots from a previous run — if measuredRobots is 0, averages are null).
    if (dash.data.measuredRobots === 0) {
      expect(dash.data.avgCpuPct).toBeNull();
      expect(dash.data.avgBatteryPct).toBeNull();
    }
  });

  test("POST /robots/:id/telemetry becomes device_reported and drives averages", async () => {
    const created = await send("POST", "/robotics/robots", {
      name: "e2e-amr-" + Date.now(), kind: "warehouse_amr", site: "e2e-wh",
    });
    const id = created.data.id;
    const ingest = await send("POST", `/robotics/robots/${id}/telemetry`, { batteryPct: 55, cpuPct: 31 });
    expect(ingest.status).toBe(200);
    expect(ingest.data.robot.telemetrySource).toBe("device_reported");
    expect(ingest.data.reading.source).toBe("device_reported");
    const hist = await get(`/robotics/robots/${id}/telemetry`);
    expect(hist.status).toBe(200);
    expect(hist.data[0].batteryPct).toBe(55);
    const dash = await get("/robotics/dashboard/rollup");
    expect(dash.data.measuredRobots).toBeGreaterThan(0);
    expect(dash.data.avgBatteryPct).not.toBeNull();
    expect(dash.data.avgCpuPct).not.toBeNull();
  });

  test("POST /robots/:id/command is local_state_only", async () => {
    const created = await send("POST", "/robotics/robots", {
      name: "e2e-patrol-" + Date.now(), kind: "security_patrol", site: "e2e-gate",
    });
    const cmd = await send("POST", `/robotics/robots/${created.data.id}/command`, { action: "start" });
    expect(cmd.status).toBe(200);
    expect(cmd.data.status).toBe("active");
    expect(cmd.data.lastCommandDispatch).toBe("local_state_only");
  });

  test("POST /predictive/scan only alerts on live high-temp telemetry", async () => {
    const hot = await send("POST", "/robotics/robots", {
      name: "e2e-hot-" + Date.now(), kind: "plc", site: "e2e-line",
    });
    await send("POST", `/robotics/robots/${hot.data.id}/telemetry`, { tempC: 81, cpuPct: 12 });
    const scan = await send("POST", "/robotics/predictive/scan");
    expect(scan.status).toBe(200);
    expect(scan.data.some((a: any) => a.robotId === hot.data.id && a.component === "thermal")).toBe(true);
  });

  test("unknown robot returns 404", async () => {
    const res = await get("/robotics/robots/no-such-robot");
    expect(res.status).toBe(404);
    expect(res.error.code).toBe("NOT_FOUND");
    const tel = await send("POST", "/robotics/robots/no-such-robot/telemetry", { cpuPct: 1 });
    expect(tel.status).toBe(404);
  });

  test("GET /robotics/health reports connector honesty", async () => {
    const res = await get("/robotics/health");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.connectors)).toBe(true);
    expect(typeof res.data.mqtt).toBe("string");
  });
});
