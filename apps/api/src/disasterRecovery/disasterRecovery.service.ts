// @ts-nocheck
/**
 * Session 51 — Enterprise Disaster Recovery & AI Continuity (V8.4 §6).
 * Failover, multi-region, memory/KG/model replication, offline emergency,
 * BCP, DR drills, auto-failback, health monitoring. Keys: dr:*
 *
 * Session 179: dashboard is now pure read — activeRegion null until
 * topology is configured, no na-east seeding on read.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { DR_COMPONENTS, DrComponent, DrDashboard, DrDrill, DrFailoverEvent, DrStatus } from "@windels/shared";

const K = {
  status: (oid: string, c: DrComponent) => `dr:status:${oid}:${c}`,
  activeRegion: (oid: string) => `dr:active:${oid}`,
  events: (oid: string) => `dr:ev:${oid}`,
  drill: (oid: string, id: string) => `dr:drill:${oid}:${id}`,
  drills: (oid: string) => `dr:drills:${oid}`,
  emergency: (oid: string) => `dr:em:${oid}`,
  metrics: (oid: string) => `dr:m:${oid}`,
};
const j = (s: string | null) => (s ? JSON.parse(s) : null);
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

const REGIONS = ["na-east","na-west","eu-west","ap-south","ap-southeast"];

async function emitKernel(kind: string, payload: any) {
  try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ source: "disasterRecovery", kind, payload }); } catch {}
}

function assertOrg(oid: string) {
  if (!oid || typeof oid !== "string" || oid.trim().length === 0) throw new Error("organizationId is required");
}

export const DisasterRecoveryService = {
  /**
   * Register the DR component topology. Components start with `healthy: false`
   * and no replication telemetry: nothing is known until a real probe or drill
   * reports in.
   *
   * The previous bootstrap seeded a random replication lag and a fully-formed
   * "passed" drill dated three days ago, complete with RTO/RPO figures — an
   * audit record for a test that never happened.
   */
  async ensureBootstrapped(logger?: any, oid?: string) {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) return;
    if (await redis.exists(K.activeRegion(oid))) return;
    await redis.set(K.activeRegion(oid), "na-east");
    await redis.set(K.emergency(oid), "0");
    for (const c of DR_COMPONENTS) {
      const s: DrStatus = {
        component: c,
        // Unverified until a drill or probe proves otherwise.
        healthy: false,
        activeRegion: "na-east",
        standbyRegions: REGIONS.filter((r) => r !== "na-east").slice(0, 2),
      };
      await redis.hset(K.status(oid, c), "_doc", s2(s));
    }
    await redis.hset(K.metrics(oid), "failovers30d", "0");
    logger?.info?.("[disaster-recovery] initialized (no synthetic drills; components unverified until tested)");
  },

  async dashboard(oid: string): Promise<DrDashboard> {
    assertOrg(oid);
    const comps = await this.getStatus(oid);
    const activeRaw = await redis.get(K.activeRegion(oid));
    const active: string | null = activeRaw || null;
    const standby = active ? Array.from(new Set(comps.flatMap(c=>c.standbyRegions))).filter(r=>r!==active) : [];
    // Only components that actually reported lag contribute; unsampled
    // components are skipped rather than counted as 0ms.
    const sampledLags = comps.map((c) => c.replicationLagMs).filter((v): v is number => typeof v === "number");
    const maxLag: number | null = sampledLags.length ? Math.max(...sampledLags) : null;
    const allHealthy = comps.length ? comps.every(c=>c.healthy) : false;
    const fo = Number((await redis.hget(K.metrics(oid),"failovers30d")) || "0");
    const em = (await redis.get(K.emergency(oid))) === "1";
    const drills = await this.getDrills(oid, 5);
    const last = drills.find(d=>d.status==="passed"||d.status==="failed");
    const hasTopology = active !== null && comps.length > 0;
    return {
      overallHealthy: allHealthy, components: comps, activeRegion: active, standbyRegions: standby,
      replicationLagMs: maxLag, failovers30d: fo,
      lastDrillStatus: last?.status==="passed" ? "passed" : last?.status==="failed" ? "failed" : undefined,
      lastDrillAt: last?.completedAt, offlineModeAvailable: true, emergencyModeActive: em,
      upcomingDrills: drills.filter(d=>d.status==="scheduled"),
      provenance: {
        topology: hasTopology ? "configured" : "unconfigured",
        note: hasTopology ? `Topology configured: active ${active} with ${comps.length} components` : "No topology configured — activeRegion is null until ensureBootstrapped or a failover configures it",
      },
    } as DrDashboard;
  },

  async getStatus(oid: string): Promise<DrStatus[]> {
    assertOrg(oid);
    const out: DrStatus[] = [];
    for (const c of DR_COMPONENTS) { const r = await redis.hgetall(K.status(oid,c)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out;
  },

  async triggerFailover(input: { component: DrComponent; toRegion: string; reason: string; organizationId: string }): Promise<DrFailoverEvent> {
    const oid = input.organizationId;
    assertOrg(oid);
    const id = uid("fo-"); const from = (await redis.get(K.activeRegion(oid))) || "na-east";
    const start = Date.now();
    await redis.set(K.activeRegion(oid), input.toRegion);
    const durationMs = Date.now() - start;
    const ev: DrFailoverEvent = {
      id, organizationId: oid, component: input.component, fromRegion: from, toRegion: input.toRegion,
      reason: input.reason, triggeredBy: "manual", startedAt: new Date(start).toISOString(),
      completedAt: new Date().toISOString(), durationMs, status: "completed",
      rtoMs: durationMs,
    };
    await redis.zadd(K.events(oid), start, s2(ev));
    await redis.zremrangebyrank(K.events(oid), 0, -201);
    const r = await redis.hgetall(K.status(oid, input.component));
    if (r._doc) {
      const s: DrStatus = JSON.parse(r._doc);
      s.activeRegion = input.toRegion;
      s.lastFailoverAt = ev.completedAt;
      await redis.hset(K.status(oid, input.component), "_doc", s2(s));
    }
    await redis.hincrby(K.metrics(oid),"failovers30d",1);
    emitKernel("dr.failover.completed", { organizationId: oid, eventId: id, component: input.component, toRegion: input.toRegion });
    return ev;
  },

  async scheduleDrill(input: { component: DrComponent; scheduledAt: string; organizationId: string }): Promise<DrDrill> {
    const oid = input.organizationId;
    assertOrg(oid);
    const id = uid("drill-");
    const d: DrDrill = { id, organizationId: oid, component: input.component, scheduledAt: input.scheduledAt, status: "scheduled" };
    await redis.hset(K.drill(oid,id), "_doc", s2(d));
    await redis.zadd(K.drills(oid), Date.parse(input.scheduledAt), id);
    return d;
  },

  /**
   * Start a scheduled drill. The drill moves to `running` and stays there until
   * an operator records the measured outcome via `recordDrillResult`.
   */
  async runDrill(id: string, oid: string): Promise<DrDrill> {
    assertOrg(oid);
    const r = await redis.hgetall(K.drill(oid, id));
    if (!r._doc) throw Object.assign(new Error("drill not found"), { status: 404 });
    const base: DrDrill = JSON.parse(r._doc);
    if (base.status === "passed" || base.status === "failed") return base;
    const d: DrDrill = { ...base, startedAt: new Date().toISOString(), status: "running" };
    await redis.hset(K.drill(oid, id), "_doc", s2(d));
    emitKernel("dr.drill.started", { organizationId: oid, drillId: id, component: d.component });
    return d;
  },

  /**
   * Record the measured outcome of a drill. RTO/RPO are supplied by whoever ran
   * it; the component's health flag is only updated from this real result.
   */
  async recordDrillResult(
    id: string,
    input: { passed: boolean; rtoAchievedMs: number; rpoAchievedMs: number; issues?: string[]; recordedBy: string },
    oid: string,
  ): Promise<DrDrill> {
    assertOrg(oid);
    const r = await redis.hgetall(K.drill(oid, id));
    if (!r._doc) throw Object.assign(new Error("drill not found"), { status: 404 });
    const base: DrDrill = JSON.parse(r._doc);
    const d: DrDrill = {
      ...base,
      completedAt: new Date().toISOString(),
      status: input.passed ? "passed" : "failed",
      results: {
        rtoAchievedMs: input.rtoAchievedMs,
        rpoAchievedMs: input.rpoAchievedMs,
        issues: input.issues ?? [],
      },
      recordedBy: input.recordedBy,
    };
    await redis.hset(K.drill(oid, id), "_doc", s2(d));
    const sr = await redis.hgetall(K.status(oid, d.component));
    if (sr._doc) {
      const st: DrStatus = JSON.parse(sr._doc);
      st.lastTestAt = d.completedAt;
      st.healthy = input.passed;
      await redis.hset(K.status(oid, d.component), "_doc", s2(st));
    }
    emitKernel("dr.drill.completed", { organizationId: oid, drillId: id, component: d.component, passed: input.passed });
    return d;
  },

  async setEmergencyMode(enabled: boolean, oid: string) {
    assertOrg(oid);
    await redis.set(K.emergency(oid), enabled ? "1" : "0");
    emitKernel("dr.emergency_mode", { organizationId: oid, enabled });
    return { enabled };
  },

  async getEvents(oid: string, limit = 50): Promise<DrFailoverEvent[]> {
    assertOrg(oid);
    const rows = await redis.zrange(K.events(oid), -limit, -1, "REV");
    return rows.map(r=>JSON.parse(r) as DrFailoverEvent);
  },

  async getDrills(oid: string, limit = 20): Promise<DrDrill[]> {
    assertOrg(oid);
    const ids = await redis.zrange(K.drills(oid), -limit, -1, "REV");
    const out: DrDrill[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.drill(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out;
  },
};

export default DisasterRecoveryService;
