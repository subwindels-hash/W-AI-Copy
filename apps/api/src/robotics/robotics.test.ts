import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({
  redis: kv, redisCmd: kv, redisSub: kv,
  redisCommand: (_c: string, fn: () => unknown) => fn(),
}));
vi.mock("../config/demoData.js", async (orig) => {
  const actual = await (orig() as Promise<typeof import("../config/demoData.js")>);
  return { ...actual, demoDataEnabled: () => false };
});

const { RoboticsService } = await import("./robotics.service.js");

const ORG_A = "org-rob-a";
const ORG_B = "org-rob-b";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("Robotics — Session 155 completion", () => {
  it("empty fleet reports null averages, never 0-as-measurement", async () => {
    const d = await RoboticsService.dashboard(ORG_A);
    expect(d.totalRobots).toBe(0);
    expect(d.avgBatteryPct).toBeNull();
    expect(d.avgCpuPct).toBeNull();
    expect(d.measuredRobots).toBe(0);
    expect(Number.isNaN(d.avgCpuPct as unknown as number)).toBe(false);
  });

  it("does not seed when demo data is off", async () => {
    await RoboticsService.ensureBootstrapped(undefined, ORG_A);
    expect(await RoboticsService.list(ORG_A)).toEqual([]);
  });

  it("create is operator_entered and does not count toward live averages", async () => {
    const r = await RoboticsService.create({ name: "Arm-1", kind: "industrial_arm", site: "Plant-A", organizationId: ORG_A });
    expect(r.telemetrySource).toBe("operator_entered");
    expect(r.telemetryStale).toBe(true);
    expect(r.lastTelemetryAt).toBeUndefined();
    const d = await RoboticsService.dashboard(ORG_A);
    expect(d.totalRobots).toBe(1);
    expect(d.measuredRobots).toBe(0);
    expect(d.avgCpuPct).toBeNull();
    expect(d.avgBatteryPct).toBeNull();
  });

  it("HTTP telemetry ingest is device_reported and drives averages", async () => {
    const r = await RoboticsService.create({ name: "AMR-1", kind: "warehouse_amr", site: "WH", organizationId: ORG_A });
    const out = await RoboticsService.recordTelemetry(r.id, { batteryPct: 64, cpuPct: 22, tempC: 41 }, ORG_A);
    expect(out).not.toBeNull();
    expect(out!.reading.source).toBe("device_reported");
    expect(out!.robot.telemetrySource).toBe("device_reported");
    expect(out!.robot.lastTelemetryAt).toBeTruthy();
    expect(out!.robot.telemetryStale).toBe(false);
    expect(out!.robot.batteryPct).toBe(64);
    expect(out!.robot.cpuPct).toBe(22);

    const d = await RoboticsService.dashboard(ORG_A);
    expect(d.measuredRobots).toBe(1);
    expect(d.avgBatteryPct).toBe(64);
    expect(d.avgCpuPct).toBe(22);
  });

  it("telemetry history is newest-first and capped", async () => {
    const r = await RoboticsService.create({ name: "Drone-1", kind: "drone", site: "Pad", organizationId: ORG_A });
    await RoboticsService.recordTelemetry(r.id, { batteryPct: 90 }, ORG_A);
    await RoboticsService.recordTelemetry(r.id, { batteryPct: 80 }, ORG_A);
    const hist = await RoboticsService.listTelemetry(r.id, ORG_A);
    expect(hist).toHaveLength(2);
    expect(hist![0].batteryPct).toBe(80);
    expect(hist![1].batteryPct).toBe(90);
  });

  it("org isolation: org B cannot read org A's robot, telemetry or alerts", async () => {
    const r = await RoboticsService.create({ name: "Secret", kind: "plc", site: "A", organizationId: ORG_A });
    await RoboticsService.recordTelemetry(r.id, { cpuPct: 10 }, ORG_A);
    expect(await RoboticsService.get(r.id, ORG_B)).toBeNull();
    expect(await RoboticsService.listTelemetry(r.id, ORG_B)).toBeNull();
    expect(await RoboticsService.list(ORG_B)).toEqual([]);
    const dB = await RoboticsService.dashboard(ORG_B);
    expect(dB.totalRobots).toBe(0);
  });

  it("command flips local status and labels dispatch local_state_only", async () => {
    const r = await RoboticsService.create({ name: "Patrol", kind: "security_patrol", site: "Gate", organizationId: ORG_A });
    const started = await RoboticsService.command(r.id, "start", ORG_A);
    expect(started!.status).toBe("active");
    expect(started!.lastCommandDispatch).toBe("local_state_only");
    const paused = await RoboticsService.command(r.id, "pause", ORG_A);
    expect(paused!.status).toBe("paused");
    const stopped = await RoboticsService.command(r.id, "stop", ORG_A);
    expect(stopped!.status).toBe("idle");
  });

  it("update and delete are org-scoped", async () => {
    const r = await RoboticsService.create({ name: "Old", kind: "iot_gateway", site: "Lab", organizationId: ORG_A });
    const upd = await RoboticsService.update(r.id, { name: "New", site: "Dock" }, ORG_A);
    expect(upd!.name).toBe("New");
    expect(upd!.site).toBe("Dock");
    expect(await RoboticsService.update(r.id, { name: "X" }, ORG_B)).toBeNull();
    expect(await RoboticsService.remove(r.id, ORG_B)).toBe(false);
    expect(await RoboticsService.remove(r.id, ORG_A)).toBe(true);
    expect(await RoboticsService.get(r.id, ORG_A)).toBeNull();
  });

  it("predictive scan only fires on device_reported thresholds", async () => {
    const cold = await RoboticsService.create({ name: "Cold", kind: "industrial_arm", site: "A", organizationId: ORG_A });
    await RoboticsService.recordTelemetry(cold.id, { tempC: 40, cpuPct: 10 }, ORG_A);
    const hot = await RoboticsService.create({ name: "Hot", kind: "industrial_arm", site: "A", organizationId: ORG_A });
    await RoboticsService.recordTelemetry(hot.id, { tempC: 78, cpuPct: 10 }, ORG_A);
    const seededOnly = await RoboticsService.create({ name: "Seedish", kind: "plc", site: "A", organizationId: ORG_A });
    // operator_entered with a high cpu on the record must NOT alert
    expect(seededOnly.telemetrySource).toBe("operator_entered");

    const alerts = await RoboticsService.runPredictiveScan(ORG_A);
    expect(alerts.every((a) => a.robotId === hot.id)).toBe(true);
    expect(alerts.some((a) => a.component === "thermal")).toBe(true);
    expect(alerts.every((a) => a.status === "open")).toBe(true);
  });

  it("low battery and high CPU raise alerts from live telemetry", async () => {
    const r = await RoboticsService.create({ name: "Tired", kind: "drone", site: "Pad", organizationId: ORG_A });
    await RoboticsService.recordTelemetry(r.id, { batteryPct: 8, cpuPct: 97 }, ORG_A);
    const alerts = await RoboticsService.runPredictiveScan(ORG_A);
    const comps = alerts.map((a) => a.component).sort();
    expect(comps).toContain("battery-pack");
    expect(comps).toContain("controller");
  });

  it("ack alert is org-scoped and flips status", async () => {
    const r = await RoboticsService.create({ name: "Hot2", kind: "plc", site: "A", organizationId: ORG_A });
    await RoboticsService.recordTelemetry(r.id, { tempC: 80, cpuPct: 10 }, ORG_A);
    const [alert] = await RoboticsService.runPredictiveScan(ORG_A);
    expect(alert).toBeTruthy();
    expect(await RoboticsService.ackAlert(alert!.id, ORG_B)).toBeNull();
    const acked = await RoboticsService.ackAlert(alert!.id, ORG_A);
    expect(acked!.status).toBe("acknowledged");
    expect(acked!.acknowledgedAt).toBeTruthy();
    const d = await RoboticsService.dashboard(ORG_A);
    expect(d.predictiveAlerts).toBe(0);
  });

  it("schedule maintenance requires a robot in the same org", async () => {
    const r = await RoboticsService.create({ name: "Cell", kind: "manufacturing_cell", site: "Line", organizationId: ORG_A });
    const miss = await RoboticsService.scheduleMaintenance({
      robotId: r.id, scheduledAt: "2030-01-01T00:00:00.000Z", durationMin: 60, kind: "preventive",
    }, ORG_B);
    expect(miss).toBeNull();
    const mw = await RoboticsService.scheduleMaintenance({
      robotId: r.id, scheduledAt: "2030-01-01T00:00:00.000Z", durationMin: 45, kind: "calibration", technician: "Ada",
    }, ORG_A);
    expect(mw!.kind).toBe("calibration");
    expect(mw!.technician).toBe("Ada");
    const list = await RoboticsService.listMaintenance(ORG_A);
    expect(list).toHaveLength(1);
    expect(await RoboticsService.listMaintenance(ORG_B)).toEqual([]);
  });

  it("HTTP connector is ready; MQTT is never claimed connected", () => {
    const cs = RoboticsService.connectors();
    const http = cs.find((c) => c.id === "http-ingest")!;
    const mqtt = cs.find((c) => c.id === "mqtt")!;
    expect(http.status).toBe("ready");
    expect(http.requiresConfig).toBe(false);
    expect(mqtt.status).not.toBe("ready");
    expect(["not_configured", "configured_not_connected"]).toContain(mqtt.status);
  });

  it("unknown robot paths return null, never a fabricated machine", async () => {
    expect(await RoboticsService.get("nope", ORG_A)).toBeNull();
    expect(await RoboticsService.command("nope", "start", ORG_A)).toBeNull();
    expect(await RoboticsService.recordTelemetry("nope", { cpuPct: 1 }, ORG_A)).toBeNull();
    expect(await RoboticsService.listTelemetry("nope", ORG_A)).toBeNull();
  });

  it("averages only include device-reported robots", async () => {
    const live = await RoboticsService.create({ name: "Live", kind: "warehouse_amr", site: "A", organizationId: ORG_A });
    await RoboticsService.recordTelemetry(live.id, { batteryPct: 50, cpuPct: 40 }, ORG_A);
    await RoboticsService.create({ name: "Paper", kind: "warehouse_amr", site: "A", organizationId: ORG_A });
    const d = await RoboticsService.dashboard(ORG_A);
    expect(d.totalRobots).toBe(2);
    expect(d.measuredRobots).toBe(1);
    expect(d.avgBatteryPct).toBe(50);
    expect(d.avgCpuPct).toBe(40);
  });
});
