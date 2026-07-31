/**
 * Session 57 — Enterprise Robotics & Physical Automation Platform.
 * Industrial, warehouse, delivery, security, agricultural, healthcare robots,
 * autonomous vehicles, drones, smart buildings, IoT, PLC/SCADA, edge AI,
 * predictive maintenance, fleet monitoring. Emits telemetry onto AIO Bus and
 * twin state into Fabric.
 * Keys: rob:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import {
  Robot, RobotKind, RobotStatus, ROBOT_KINDS, MaintenanceWindow,
  PredictiveMaintAlert, RoboticsDashboard,
} from "@windels/shared";

const K = {
  r: (oid: string, id: string) => `rob:r:${oid}:${id}`,
  rs: (oid: string) => `rob:rs:${oid}`,
  mw: (oid: string, id: string) => `rob:mw:${oid}:${id}`,
  mws: (oid: string) => `rob:mws:${oid}`,
  pa: (oid: string, id: string) => `rob:pa:${oid}:${id}`,
  pas: (oid: string) => `rob:pas:${oid}`,
};
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0,8);
function rand(min:number,max:number) { return Math.random()*(max-min)+min; }
function randInt(min:number,max:number) { return Math.floor(rand(min,max+1)); }

async function emitTelemetry(r: Robot) {
  try {
    const { FabricService } = await import("../fabric/fabric.service.js");
    await FabricService.publish("twin.telemetry", "robotics", { robotId: r.id, site: r.site, batteryPct: r.batteryPct, cpuPct: r.cpuPct, status: r.status, organizationId: r.organizationId });
  } catch {}
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
  async ensureBootstrapped(logger?: any, oid = "org-windels") {
    if (await redis.exists(K.rs(oid))) return;
    const now = new Date().toISOString();
    for (const s of SEED_ROBOTS) {
      const id = uid("rob-");
      const statuses: RobotStatus[] = ["idle","active","active","active","paused","error","maintenance","offline"];
      const r: Robot = {
        id, organizationId: oid, name: s.name, kind: s.kind, serial: "SN-"+randomUUID().slice(0,10).toUpperCase(), site: s.site,
        firmwareVersion: "1.0."+randInt(0,12),
        status: statuses[randInt(0, statuses.length-1)],
        batteryPct: ["drone","delivery_bot","warehouse_amr","security_patrol"].includes(s.kind) ? randInt(22, 99) : undefined,
        cpuPct: randInt(8, 78), memPct: randInt(20, 70), tempC: ["industrial_arm","plc","edge_controller"].includes(s.kind)?randInt(35,78):undefined,
        uptimeSec: randInt(600, 900000), tasksCompleted: randInt(10, 2400), errorsToday: randInt(0,5),
        lastMaintenanceAt: new Date(Date.now()-randInt(3,60)*86400000).toISOString(),
        nextMaintenanceAt: new Date(Date.now()+randInt(1,30)*86400000).toISOString(),
        createdAt: now, updatedAt: now,
      };
      await redis.hset(K.r(oid,id),"_doc",s2(r)); await redis.sadd(K.rs(oid),id);
    }
    // Seed one predictive alert
    const ids = await redis.smembers(K.rs(oid));
    const pick = ids[randInt(0, ids.length-1)];
    const pa: PredictiveMaintAlert = {
      id: uid("pa-"), robotId: pick, component: "motor-b",
      riskPct: randInt(62, 91), recommendation: "Schedule replacement within 72 hours.",
      at: new Date(Date.now()-randInt(1,12)*3600000).toISOString(),
    };
    await redis.hset(K.pa(oid,pa.id),"_doc",s2(pa)); await redis.sadd(K.pas(oid),pa.id);

    // Seed one maintenance window
    const pick2 = ids[randInt(0, ids.length-1)];
    const mw: MaintenanceWindow = {
      id: uid("mw-"), robotId: pick2, scheduledAt: new Date(Date.now()+randInt(1,5)*86400000).toISOString(),
      durationMin: randInt(30, 180),
      kind: (["preventive","calibration","firmware"] as MaintenanceWindow["kind"][])[randInt(0,2)],
      status: "scheduled",
    };
    await redis.hset(K.mw(oid,mw.id),"_doc",s2(mw)); await redis.sadd(K.mws(oid),mw.id);
    logger?.info?.("[robotics] bootstrap complete", { robots: SEED_ROBOTS.length });
  },

  async dashboard(oid = "org-windels"): Promise<RoboticsDashboard> {
    const robots = await this.list(oid);
    const byKindMap: Record<string, number> = {};
    for (const r of robots) byKindMap[r.kind] = (byKindMap[r.kind]||0)+1;
    const byKind = Object.entries(byKindMap).map(([kind,count])=>({kind:kind as RobotKind, count}));
    const paIds = await redis.smembers(K.pas(oid));
    const alerts: PredictiveMaintAlert[] = [];
    for (const id of paIds) { const r = await redis.hgetall(K.pa(oid,id)); if (r._doc) alerts.push(JSON.parse(r._doc)); }
    const active = robots.filter(r=>r.status==="active").length;
    const idle = robots.filter(r=>r.status==="idle").length;
    const error = robots.filter(r=>r.status==="error").length;
    const maint = robots.filter(r=>r.status==="maintenance").length;
    const offline = robots.filter(r=>r.status==="offline").length;
    const bats = robots.map(r=>r.batteryPct).filter((x): x is number => typeof x === "number");
    const avgBattery = bats.length ? +(bats.reduce((s,x)=>s+x,0)/bats.length).toFixed(1) : 0;
    const avgCpu = +(robots.reduce((s,r)=>s+r.cpuPct,0)/robots.length).toFixed(1);
    return {
      totalRobots: robots.length, active, idle, error, maintenance: maint, offline,
      avgBatteryPct: avgBattery, tasksCompletedToday: robots.reduce((s,r)=>s+r.tasksCompleted,0),
      errorsToday: robots.reduce((s,r)=>s+r.errorsToday,0),
      sites: new Set(robots.map(r=>r.site)).size,
      avgCpuPct: avgCpu,
      predictiveAlerts: alerts.length,
      byKind, recent: robots.slice(0,8), alerts: alerts.sort((a,b)=>b.riskPct-a.riskPct),
    };
  },

  async list(oid = "org-windels"): Promise<Robot[]> {
    const ids = await redis.smembers(K.rs(oid));
    const out: Robot[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.r(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  },

  async get(id: string, oid = "org-windels"): Promise<Robot | null> {
    const r = await redis.hgetall(K.r(oid,id)); return r._doc ? JSON.parse(r._doc) : null;
  },

  async create(input: { name: string; kind: RobotKind; site: string; zone?: string; serial?: string; organizationId?: string }): Promise<Robot> {
    const oid = input.organizationId || "org-windels";
    const id = uid("rob-"); const now = new Date().toISOString();
    const r: Robot = {
      id, organizationId: oid, name: input.name, kind: input.kind, serial: input.serial, site: input.site, zone: input.zone,
      firmwareVersion: "1.0.0", status: "idle", batteryPct: ["drone","delivery_bot","warehouse_amr","security_patrol"].includes(input.kind)?100:undefined,
      cpuPct: 10, memPct: 20, uptimeSec: 0, tasksCompleted: 0, errorsToday: 0,
      createdAt: now, updatedAt: now,
    };
    await redis.hset(K.r(oid,id),"_doc",s2(r)); await redis.sadd(K.rs(oid),id);
    emitTelemetry(r);
    return r;
  },

  async command(id: string, action: "start"|"pause"|"stop"|"reset"|"maintenance", oid = "org-windels"): Promise<Robot | null> {
    const r = await this.get(id, oid); if (!r) return null;
    r.status = action==="start" ? "active" : action==="pause" ? "paused" : action==="stop" ? "idle" : action==="reset" ? "idle" : "maintenance";
    r.updatedAt = new Date().toISOString();
    await redis.hset(K.r(oid,id),"_doc",s2(r)); emitTelemetry(r);
    return r;
  },

  /**
   * Raise predictive-maintenance alerts from recorded robot telemetry.
   *
   * A maintenance alert names a component and a failure risk on a real machine.
   * This previously fired one for a random ~15% of the fleet on every scan,
   * picking the component from a list and the risk from a 55-95% range — which
   * would send crews to inspect healthy robots while masking genuine faults.
   *
   * Alerts are now derived from thresholds on telemetry the robot actually
   * reported. A fleet with no concerning readings produces no alerts.
   */
  async runPredictiveScan(oid = "org-windels"): Promise<PredictiveMaintAlert[]> {
    const robots = await this.list(oid);
    const out: PredictiveMaintAlert[] = [];
    const raise = async (r: Robot, component: string, riskPct: number, recommendation: string) => {
      const pa: PredictiveMaintAlert = {
        id: uid("pa-"), robotId: r.id, component, riskPct, recommendation,
        at: new Date().toISOString(),
      };
      await redis.hset(K.pa(oid, pa.id), "_doc", s2(pa));
      await redis.sadd(K.pas(oid), pa.id);
      out.push(pa);
    };
    for (const r of robots) {
      // Each condition cites the reading that triggered it, so an operator can
      // verify the alert rather than trusting an opaque risk score.
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
