/**
 * Session 57 — Enterprise Robotics & Physical Automation Platform.
 * Session 155 — completion: HTTP telemetry ingest (the real connector),
 * honest null averages, MQTT reported as not connected, never fabricated.
 *
 * Keys: rob:r:<org>:<id>  rob:rs:<org>
 *       rob:mw:<org>:<id> rob:mws:<org>
 *       rob:pa:<org>:<id> rob:pas:<org>
 *       rob:tel:<org>:<robotId>  (capped list)
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { makeRng } from "../utils/detRng.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
import {
  Robot, RobotKind, RobotStatus, ROBOT_KINDS, MaintenanceWindow,
  PredictiveMaintAlert, RoboticsDashboard, FleetTelemetry,
  TelemetrySource, CommandDispatch, RoboticsConnector,
  CreateRobotInput, UpdateRobotInput, TelemetryIngestInput,
  ScheduleMaintenanceInput,
  ROBOT_TELEMETRY_STALE_MS, ROBOT_TELEMETRY_CAP,
} from "@windels/shared";

const _rng = makeRng("robotics:robotics");

const K = {
  r: (oid: string, id: string) => `rob:r:${oid}:${id}`,
  rs: (oid: string) => `rob:rs:${oid}`,
  mw: (oid: string, id: string) => `rob:mw:${oid}:${id}`,
  mws: (oid: string) => `rob:mws:${oid}`,
  pa: (oid: string, id: string) => `rob:pa:${oid}:${id}`,
  pas: (oid: string) => `rob:pas:${oid}`,
  tel: (oid: string, robotId: string) => `rob:tel:${oid}:${robotId}`,
};
const s2 = (o: unknown) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);
function randInt(min: number, max: number) { return _rng.randInt(min, max); }

const BATTERY_KINDS = new Set<RobotKind>(["drone", "delivery_bot", "warehouse_amr", "security_patrol"]);

async function emitTelemetry(r: Robot) {
  try {
    const { FabricService } = await import("../fabric/fabric.service.js");
    await FabricService.publish("twin.telemetry", "robotics", {
      robotId: r.id, site: r.site, batteryPct: r.batteryPct, cpuPct: r.cpuPct,
      status: r.status, organizationId: r.organizationId,
    });
  } catch { /* best effort */ }
}

function mqttUrl(): string | undefined {
  const v = process.env.WINDELS_ROBOTICS_MQTT_URL;
  return v && v.trim() ? v.trim() : undefined;
}

export function roboticsConnectors(): RoboticsConnector[] {
  const url = mqttUrl();
  return [
    {
      id: "http-ingest",
      name: "HTTP telemetry ingest",
      status: "ready",
      requiresConfig: false,
      note: "POST /api/v1/robotics/robots/:id/telemetry — a device reports its own readings. This is the live connector.",
    },
    {
      id: "mqtt",
      name: "MQTT / AMQP broker",
      status: url ? "configured_not_connected" : "not_configured",
      requiresConfig: true,
      note: url
        ? "WINDELS_ROBOTICS_MQTT_URL is set but no broker session is opened in this process — commands stay local_state_only."
        : "Set WINDELS_ROBOTICS_MQTT_URL to declare a broker. Until a live session exists the status is never 'connected'.",
    },
  ];
}

function decorate(r: Robot): Robot {
  const live = r.telemetrySource === "device_reported" && !!r.lastTelemetryAt
    && (Date.now() - Date.parse(r.lastTelemetryAt)) <= ROBOT_TELEMETRY_STALE_MS;
  return { ...r, telemetryStale: !live };
}

const SEED_ROBOTS: Array<{ name: string; kind: RobotKind; site: string }> = [
  { name: "Arm-Welder-01", kind: "industrial_arm", site: "Factory-A" },
  { name: "Arm-Welder-02", kind: "industrial_arm", site: "Factory-A" },
  { name: "AMR-Picker-12", kind: "warehouse_amr", site: "Warehouse-NE" },
  { name: "AMR-Picker-17", kind: "warehouse_amr", site: "Warehouse-NE" },
  { name: "Delivery-Bot-07", kind: "delivery_bot", site: "Campus-HQ" },
  { name: "Security-Patrol-03", kind: "security_patrol", site: "Campus-HQ" },
  { name: "Agri-Harvester-02", kind: "agricultural", site: "Farm-Central" },
  { name: "Hospital-Porter-01", kind: "healthcare", site: "Hospital-Downtown" },
  { name: "Drone-Surveyor-A1", kind: "drone", site: "Construction-22" },
  { name: "BMS-HVAC-CTRL", kind: "smart_building", site: "HQ-NYC" },
  { name: "PLC-Line-3", kind: "plc", site: "Factory-A" },
  { name: "Edge-Ctrl-Lobby", kind: "edge_controller", site: "HQ-NYC" },
];

export const RoboticsService = {
  async ensureBootstrapped(logger?: { info?: (...a: unknown[]) => void }, oid = "org-windels") {
    if (await redis.exists(K.rs(oid))) return;
    if (!demoDataEnabled()) return skipDemoSeed("robotics", logger);
    const now = new Date().toISOString();
    for (const s of SEED_ROBOTS) {
      const id = uid("rob-");
      const statuses: RobotStatus[] = ["idle", "active", "active", "active", "paused", "error", "maintenance", "offline"];
      const r: Robot = {
        id, organizationId: oid, name: s.name, kind: s.kind, serial: "SN-" + randomUUID().slice(0, 10).toUpperCase(), site: s.site,
        firmwareVersion: "1.0." + randInt(0, 12),
        status: statuses[randInt(0, statuses.length - 1)]!,
        batteryPct: BATTERY_KINDS.has(s.kind) ? randInt(22, 99) : undefined,
        cpuPct: randInt(8, 78), memPct: randInt(20, 70),
        tempC: ["industrial_arm", "plc", "edge_controller"].includes(s.kind) ? randInt(35, 78) : undefined,
        uptimeSec: randInt(600, 900000), tasksCompleted: randInt(10, 2400), errorsToday: randInt(0, 5),
        lastMaintenanceAt: new Date(Date.now() - randInt(3, 60) * 86400000).toISOString(),
        nextMaintenanceAt: new Date(Date.now() + randInt(1, 30) * 86400000).toISOString(),
        createdAt: now, updatedAt: now,
        telemetrySource: "demo_seed",
      };
      await redis.hset(K.r(oid, id), "_doc", s2(r)); await redis.sadd(K.rs(oid), id);
    }
    const ids = await redis.smembers(K.rs(oid));
    const pick = ids[randInt(0, ids.length - 1)]!;
    const pa: PredictiveMaintAlert = {
      id: uid("pa-"), organizationId: oid, robotId: pick, component: "motor-b",
      riskPct: randInt(62, 91), recommendation: "Schedule replacement within 72 hours.",
      at: new Date(Date.now() - randInt(1, 12) * 3600000).toISOString(),
      status: "open",
    };
    await redis.hset(K.pa(oid, pa.id), "_doc", s2(pa)); await redis.sadd(K.pas(oid), pa.id);

    const pick2 = ids[randInt(0, ids.length - 1)]!;
    const mw: MaintenanceWindow = {
      id: uid("mw-"), organizationId: oid, robotId: pick2,
      scheduledAt: new Date(Date.now() + randInt(1, 5) * 86400000).toISOString(),
      durationMin: randInt(30, 180),
      kind: (["preventive", "calibration", "firmware"] as MaintenanceWindow["kind"][])[randInt(0, 2)]!,
      status: "scheduled",
    };
    await redis.hset(K.mw(oid, mw.id), "_doc", s2(mw)); await redis.sadd(K.mws(oid), mw.id);
    logger?.info?.("[robotics] bootstrap complete", { robots: SEED_ROBOTS.length });
  },

  async dashboard(oid = "org-windels"): Promise<RoboticsDashboard> {
    const robots = await this.list(oid);
    const byKindMap: Record<string, number> = {};
    for (const r of robots) byKindMap[r.kind] = (byKindMap[r.kind] || 0) + 1;
    const byKind = Object.entries(byKindMap).map(([kind, count]) => ({ kind: kind as RobotKind, count }));
    const alerts = await this.listAlerts(oid);
    const active = robots.filter((r) => r.status === "active").length;
    const idle = robots.filter((r) => r.status === "idle").length;
    const error = robots.filter((r) => r.status === "error").length;
    const maint = robots.filter((r) => r.status === "maintenance").length;
    const offline = robots.filter((r) => r.status === "offline").length;

    const measured = robots.filter((r) => r.telemetrySource === "device_reported" && r.lastTelemetryAt);
    const bats = measured.map((r) => r.batteryPct).filter((x): x is number => typeof x === "number");
    const cpus = measured.map((r) => r.cpuPct);
    const avgBattery = bats.length ? +(bats.reduce((s, x) => s + x, 0) / bats.length).toFixed(1) : null;
    const avgCpu = cpus.length ? +(cpus.reduce((s, x) => s + x, 0) / cpus.length).toFixed(1) : null;

    return {
      totalRobots: robots.length, active, idle, error, maintenance: maint, offline,
      avgBatteryPct: avgBattery,
      tasksCompletedToday: robots.reduce((s, r) => s + r.tasksCompleted, 0),
      errorsToday: robots.reduce((s, r) => s + r.errorsToday, 0),
      sites: new Set(robots.map((r) => r.site)).size,
      avgCpuPct: avgCpu,
      predictiveAlerts: alerts.filter((a) => a.status !== "acknowledged").length,
      byKind, recent: robots.slice(0, 8), alerts: alerts.sort((a, b) => b.riskPct - a.riskPct),
      measuredRobots: measured.length,
      connectors: roboticsConnectors(),
      provenance: {
        avgBatteryPct: "Average of batteryPct on robots whose last reading is device_reported. Null when none exist.",
        avgCpuPct: "Average of cpuPct on robots whose last reading is device_reported. Null when none exist.",
        tasksCompletedToday: "Sum of the tasksCompleted field stored on each robot record — not a live daily counter.",
        mqtt: mqttUrl()
          ? "WINDELS_ROBOTICS_MQTT_URL is set; no broker session is open. Commands are local_state_only."
          : "MQTT is not configured. HTTP ingest is the live connector.",
      },
    };
  },

  async list(oid = "org-windels"): Promise<Robot[]> {
    const ids = await redis.smembers(K.rs(oid));
    const out: Robot[] = [];
    for (const id of ids) {
      const row = await redis.hgetall(K.r(oid, id));
      if (row._doc) {
        const parsed = JSON.parse(row._doc) as Robot;
        if (parsed.organizationId === oid) out.push(decorate(parsed));
      }
    }
    return out.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  },

  async get(id: string, oid = "org-windels"): Promise<Robot | null> {
    const row = await redis.hgetall(K.r(oid, id));
    if (!row._doc) return null;
    const parsed = JSON.parse(row._doc) as Robot;
    if (parsed.organizationId !== oid) return null;
    return decorate(parsed);
  },

  async create(input: CreateRobotInput & { organizationId?: string }): Promise<Robot> {
    const oid = input.organizationId || "org-windels";
    const id = uid("rob-"); const now = new Date().toISOString();
    const r: Robot = {
      id, organizationId: oid, name: input.name, kind: input.kind, serial: input.serial,
      site: input.site, zone: input.zone, firmwareVersion: "1.0.0", status: "idle",
      batteryPct: BATTERY_KINDS.has(input.kind) ? 100 : undefined,
      cpuPct: 0, memPct: 0, uptimeSec: 0, tasksCompleted: 0, errorsToday: 0,
      createdAt: now, updatedAt: now, telemetrySource: "operator_entered",
    };
    await redis.hset(K.r(oid, id), "_doc", s2(r)); await redis.sadd(K.rs(oid), id);
    emitTelemetry(r);
    return decorate(r);
  },

  async update(id: string, input: UpdateRobotInput, oid = "org-windels"): Promise<Robot | null> {
    const r = await this.get(id, oid); if (!r) return null;
    if (input.name !== undefined) r.name = input.name;
    if (input.site !== undefined) r.site = input.site;
    if (input.zone !== undefined) r.zone = input.zone;
    if (input.serial !== undefined) r.serial = input.serial;
    if (input.firmwareVersion !== undefined) r.firmwareVersion = input.firmwareVersion;
    r.updatedAt = new Date().toISOString();
    const { telemetryStale: _s, ...stored } = r;
    await redis.hset(K.r(oid, id), "_doc", s2(stored));
    return decorate(stored);
  },

  async remove(id: string, oid = "org-windels"): Promise<boolean> {
    const r = await this.get(id, oid); if (!r) return false;
    await redis.del(K.r(oid, id));
    await redis.srem(K.rs(oid), id);
    await redis.del(K.tel(oid, id));
    return true;
  },

  async command(id: string, action: "start" | "pause" | "stop" | "reset" | "maintenance", oid = "org-windels"): Promise<Robot | null> {
    const r = await this.get(id, oid); if (!r) return null;
    r.status = action === "start" ? "active" : action === "pause" ? "paused" : action === "stop" ? "idle" : action === "reset" ? "idle" : "maintenance";
    r.updatedAt = new Date().toISOString();
    r.lastCommandDispatch = "local_state_only";
    const { telemetryStale: _s, ...stored } = r;
    await redis.hset(K.r(oid, id), "_doc", s2(stored));
    emitTelemetry(stored);
    return decorate(stored);
  },

  /**
   * Record a device-reported reading. This is the live connector.
   * Operator-entered / demo_seed robots become device_reported on first ingest.
   */
  async recordTelemetry(id: string, input: TelemetryIngestInput, oid = "org-windels"): Promise<{ robot: Robot; reading: FleetTelemetry } | null> {
    const r = await this.get(id, oid); if (!r) return null;
    const ts = input.ts ?? new Date().toISOString();
    const reading: FleetTelemetry = {
      robotId: id, organizationId: oid, ts, source: "device_reported",
      batteryPct: input.batteryPct, cpuPct: input.cpuPct, memPct: input.memPct,
      tempC: input.tempC, uptimeSec: input.uptimeSec,
      speed: input.speed, x: input.x, y: input.y, z: input.z, payloadKg: input.payloadKg,
    };
    await redis.lpush(K.tel(oid, id), s2(reading));
    await redis.ltrim(K.tel(oid, id), 0, ROBOT_TELEMETRY_CAP - 1);

    if (input.batteryPct !== undefined) r.batteryPct = input.batteryPct;
    if (input.cpuPct !== undefined) r.cpuPct = input.cpuPct;
    if (input.memPct !== undefined) r.memPct = input.memPct;
    if (input.tempC !== undefined) r.tempC = input.tempC;
    if (input.uptimeSec !== undefined) r.uptimeSec = input.uptimeSec;
    r.lastTelemetryAt = ts;
    r.telemetrySource = "device_reported";
    r.updatedAt = ts;
    const { telemetryStale: _s, ...stored } = r;
    await redis.hset(K.r(oid, id), "_doc", s2(stored));
    emitTelemetry(stored);
    return { robot: decorate(stored), reading };
  },

  async listTelemetry(id: string, oid = "org-windels", limit = 50): Promise<FleetTelemetry[] | null> {
    const r = await this.get(id, oid); if (!r) return null;
    const cap = Math.max(1, Math.min(limit, ROBOT_TELEMETRY_CAP));
    const raw = await redis.lrange(K.tel(oid, id), 0, cap - 1);
    return raw.map((s) => JSON.parse(s) as FleetTelemetry);
  },

  async listAlerts(oid = "org-windels"): Promise<PredictiveMaintAlert[]> {
    const ids = await redis.smembers(K.pas(oid));
    const out: PredictiveMaintAlert[] = [];
    for (const id of ids) {
      const row = await redis.hgetall(K.pa(oid, id));
      if (row._doc) {
        const a = JSON.parse(row._doc) as PredictiveMaintAlert;
        if (!a.organizationId || a.organizationId === oid) out.push(a);
      }
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  },

  async ackAlert(id: string, oid = "org-windels"): Promise<PredictiveMaintAlert | null> {
    const row = await redis.hgetall(K.pa(oid, id));
    if (!row._doc) return null;
    const a = JSON.parse(row._doc) as PredictiveMaintAlert;
    if (a.organizationId && a.organizationId !== oid) return null;
    a.status = "acknowledged";
    a.acknowledgedAt = new Date().toISOString();
    a.organizationId = oid;
    await redis.hset(K.pa(oid, id), "_doc", s2(a));
    return a;
  },

  async listMaintenance(oid = "org-windels"): Promise<MaintenanceWindow[]> {
    const ids = await redis.smembers(K.mws(oid));
    const out: MaintenanceWindow[] = [];
    for (const id of ids) {
      const row = await redis.hgetall(K.mw(oid, id));
      if (row._doc) {
        const m = JSON.parse(row._doc) as MaintenanceWindow;
        if (!m.organizationId || m.organizationId === oid) out.push(m);
      }
    }
    return out.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  },

  async scheduleMaintenance(input: ScheduleMaintenanceInput, oid = "org-windels"): Promise<MaintenanceWindow | null> {
    const robot = await this.get(input.robotId, oid); if (!robot) return null;
    const mw: MaintenanceWindow = {
      id: uid("mw-"), organizationId: oid, robotId: input.robotId,
      scheduledAt: input.scheduledAt, durationMin: input.durationMin,
      kind: input.kind, technician: input.technician, status: "scheduled",
    };
    await redis.hset(K.mw(oid, mw.id), "_doc", s2(mw));
    await redis.sadd(K.mws(oid), mw.id);
    return mw;
  },

  connectors(): RoboticsConnector[] {
    return roboticsConnectors();
  },

  /**
   * Raise predictive-maintenance alerts from recorded robot telemetry.
   *
   * Alerts are derived from thresholds on telemetry the robot actually
   * reported. A fleet with no concerning readings produces no alerts.
   */
  async runPredictiveScan(oid = "org-windels"): Promise<PredictiveMaintAlert[]> {
    const robots = await this.list(oid);
    const out: PredictiveMaintAlert[] = [];
    const raise = async (r: Robot, component: string, riskPct: number, recommendation: string) => {
      const pa: PredictiveMaintAlert = {
        id: uid("pa-"), organizationId: oid, robotId: r.id, component, riskPct, recommendation,
        at: new Date().toISOString(), status: "open",
      };
      await redis.hset(K.pa(oid, pa.id), "_doc", s2(pa));
      await redis.sadd(K.pas(oid), pa.id);
      out.push(pa);
    };
    for (const r of robots) {
      if (r.telemetrySource !== "device_reported") continue;
      if (typeof r.tempC === "number" && r.tempC >= 70) {
        await raise(r, "thermal", Math.min(99, Math.round(r.tempC)),
          `Reported temperature ${r.tempC}°C at or above 70°C — inspect cooling before next shift.`);
      }
      if (typeof r.batteryPct === "number" && r.batteryPct <= 15) {
        await raise(r, "battery-pack", Math.min(99, 100 - r.batteryPct),
          `Battery reported ${r.batteryPct}% — charge or replace pack.`);
      }
      if (r.cpuPct >= 95) {
        await raise(r, "controller", Math.round(r.cpuPct),
          `Controller CPU sustained at ${r.cpuPct}% — check workload or firmware.`);
      }
    }
    return out;
  },
};

export const ROBOT_KIND_LIST = ROBOT_KINDS;
export type { CommandDispatch, TelemetrySource };
