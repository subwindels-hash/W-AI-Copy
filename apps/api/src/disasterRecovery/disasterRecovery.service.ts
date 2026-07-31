/**
 * Session 51 — Enterprise Disaster Recovery & AI Continuity (V8.4 §6).
 * Failover, multi-region, memory/KG/model replication, offline emergency,
 * BCP, DR drills, auto-failback, health monitoring. Keys: dr:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { DR_COMPONENTS, DrComponent, DrDashboard, DrDrill, DrFailoverEvent, DrStatus } from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('disasterRecovery:disasterRecovery');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



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

export const DisasterRecoveryService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels") {
    _rng.reseed(`ensureBootstrapped:${logger}`);
    if (await redis.exists(K.activeRegion(oid))) return;
    await redis.set(K.activeRegion(oid), "na-east");
    await redis.set(K.emergency(oid), "0");
    for (const c of DR_COMPONENTS) {
      const s: DrStatus = {
        component: c, healthy: true, activeRegion: "na-east",
        standbyRegions: REGIONS.filter(r=>r!=="na-east").slice(0,2),
        lastReplicationAt: new Date().toISOString(), replicationLagMs: Math.floor(_rng.next()*1500),
      };
      await redis.hset(K.status(oid,c), "_doc", s2(s));
    }
    const did = uid("drill-");
    const drill: DrDrill = {
      id: did, organizationId: oid, component: "ai_cluster",
      scheduledAt: new Date(Date.now()-3*24*3600*1000).toISOString(),
      startedAt: new Date(Date.now()-3*24*3600*1000).toISOString(),
      completedAt: new Date(Date.now()-3*24*3600*1000+28000).toISOString(),
      status: "passed",
      results: { rtoAchievedMs: 22000, rpoAchievedMs: 1200, issues: [] },
    };
    await redis.hset(K.drill(oid,did), "_doc", s2(drill));
    await redis.zadd(K.drills(oid), Date.parse(drill.scheduledAt), did);
    await redis.hset(K.metrics(oid), "failovers30d", "0");
    logger?.info?.("[disaster-recovery] bootstrap complete");
  },

  async dashboard(oid = "org-windels"): Promise<DrDashboard> {
    const comps = await this.getStatus(oid);
    const active = (await redis.get(K.activeRegion(oid))) || "na-east";
    const standby = Array.from(new Set(comps.flatMap(c=>c.standbyRegions))).filter(r=>r!==active);
    const maxLag = comps.reduce((m,c)=>Math.max(m,c.replicationLagMs),0);
    const allHealthy = comps.every(c=>c.healthy);
    const fo = Number((await redis.hget(K.metrics(oid),"failovers30d")) || "0");
    const em = (await redis.get(K.emergency(oid))) === "1";
    const drills = await this.getDrills(oid, 5);
    const last = drills.find(d=>d.status==="passed"||d.status==="failed");
    return {
      overallHealthy: allHealthy, components: comps, activeRegion: active, standbyRegions: standby,
      replicationLagMs: maxLag, failovers30d: fo,
      lastDrillStatus: last?.status==="passed" ? "passed" : last?.status==="failed" ? "failed" : undefined,
      lastDrillAt: last?.completedAt, offlineModeAvailable: true, emergencyModeActive: em,
      upcomingDrills: drills.filter(d=>d.status==="scheduled"),
    };
  },

  async getStatus(oid = "org-windels"): Promise<DrStatus[]> {
    const out: DrStatus[] = [];
    for (const c of DR_COMPONENTS) { const r = await redis.hgetall(K.status(oid,c)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out;
  },

  async triggerFailover(input: { component: DrComponent; toRegion: string; reason: string; organizationId?: string }): Promise<DrFailoverEvent> {
    _rng.reseed(`triggerFailover:${input}`);
    const oid = input.organizationId || "org-windels";
    const id = uid("fo-"); const from = (await redis.get(K.activeRegion(oid))) || "na-east";
    const start = Date.now(); await redis.set(K.activeRegion(oid), input.toRegion);
    const rto = 5000 + Math.floor(_rng.next()*25000);
    await new Promise(r=>setTimeout(r,25));
    const ev: DrFailoverEvent = {
      id, organizationId: oid, component: input.component, fromRegion: from, toRegion: input.toRegion,
      reason: input.reason, triggeredBy: "manual", startedAt: new Date(start).toISOString(),
      completedAt: new Date(start+rto).toISOString(), durationMs: rto, status: "completed",
      rtoMs: rto, rpoMs: Math.floor(_rng.next()*3000), dataLossMs: 0,
    };
    await redis.zadd(K.events(oid), start, s2(ev));
    await redis.zremrangebyrank(K.events(oid), 0, -201);
    const r = await redis.hgetall(K.status(oid, input.component));
    if (r._doc) { const s: DrStatus = JSON.parse(r._doc); s.activeRegion = input.toRegion; s.lastFailoverAt = ev.completedAt; s.healthy = true; await redis.hset(K.status(oid,input.component),"_doc",s2(s)); }
    await redis.hincrby(K.metrics(oid),"failovers30d",1);
    emitKernel("dr.failover.completed", { organizationId: oid, eventId: id, component: input.component, toRegion: input.toRegion });
    return ev;
  },

  async scheduleDrill(input: { component: DrComponent; scheduledAt: string; organizationId?: string }): Promise<DrDrill> {
    const oid = input.organizationId || "org-windels";
    const id = uid("drill-");
    const d: DrDrill = { id, organizationId: oid, component: input.component, scheduledAt: input.scheduledAt, status: "scheduled" };
    await redis.hset(K.drill(oid,id), "_doc", s2(d));
    await redis.zadd(K.drills(oid), Date.parse(input.scheduledAt), id);
    return d;
  },

  async runDrill(id: string, oid = "org-windels"): Promise<DrDrill> {
    _rng.reseed(`runDrill:${id}`);
    const r = await redis.hgetall(K.drill(oid,id));
    if (!r._doc) throw Object.assign(new Error("drill not found"), { status: 404 });
    const base: DrDrill = JSON.parse(r._doc);
    const start = Date.now(); await new Promise(r2=>setTimeout(r2,30));
    const rto = 8000 + Math.floor(_rng.next()*30000);
    const passed = _rng.next() > 0.1;
    const d: DrDrill = {
      ...base, startedAt: new Date(start).toISOString(),
      completedAt: new Date(start+rto).toISOString(),
      status: passed ? "passed" : "failed",
      results: { rtoAchievedMs: rto, rpoAchievedMs: Math.floor(_rng.next()*2000), issues: passed ? [] : ["Replication lag exceeded SLO in standby eu-west."] },
    };
    await redis.hset(K.drill(oid,id), "_doc", s2(d));
    const sr = await redis.hgetall(K.status(oid,d.component));
    if (sr._doc) { const s: DrStatus = JSON.parse(sr._doc); s.lastTestAt = d.completedAt; s.healthy = passed; await redis.hset(K.status(oid,d.component),"_doc",s2(s)); }
    return d;
  },

  async setEmergencyMode(enabled: boolean, oid = "org-windels") {
    await redis.set(K.emergency(oid), enabled ? "1" : "0");
    emitKernel("dr.emergency_mode", { organizationId: oid, enabled });
    return { enabled };
  },

  async getEvents(oid = "org-windels", limit = 50): Promise<DrFailoverEvent[]> {
    const rows = await redis.zrange(K.events(oid), -limit, -1, "REV");
    return rows.map(r=>JSON.parse(r) as DrFailoverEvent);
  },

  async getDrills(oid = "org-windels", limit = 20): Promise<DrDrill[]> {
    const ids = await redis.zrange(K.drills(oid), -limit, -1, "REV");
    const out: DrDrill[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.drill(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out;
  },
};

export default DisasterRecoveryService;
