/**
 * RegionService — Slice 182 (Multi-Region Deployment).
 *
 * Maintains a registry of platform regions (id/name/cloud/tier/lat-lng/status/
 * replication-role/lag/capacity/load/failover priority) and tracks
 * in-progress failovers. MVP seeds 5 regions across NA/EU/AP with realistic
 * load values and supports triggering a failover (state machine: idle →
 * preflight → draining → switching → verifying → complete).
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../db/redis.js";
import { logger } from "../observability/logger.js";
import type { Region, FailoverStatus, RegionStatus, ReplicationRole, RegionTier } from "@windels/shared/infrastructure";

const REG_KEY = "infra:regions";
const REG_PREFIX = "infra:region:";
const FAILOVER_KEY = "infra:active-failover";
let seeded = false;
function now(){return new Date().toISOString();}
function rand(min:number,max:number){return (min+max)/2;} // deterministic

const DEFAULT_REGIONS: Array<Omit<Region,"id"|"status"|"replicationLagMs"|"loadPercent"|"capacity"|"lastHealthCheckAt"|"replicationRole">> = [
  { name:"US East (N. Virginia)", cloud:"aws", tier:"primary", lat:39.02, lng:-77.44, endpoint:"https://api-na-east.windels.ai", failoverPriority:1 },
  { name:"US West (Oregon)",       cloud:"aws", tier:"secondary", lat:45.52, lng:-122.68, endpoint:"https://api-na-west.windels.ai", failoverPriority:2 },
  { name:"EU West (Ireland)",      cloud:"aws", tier:"secondary", lat:53.35, lng:-6.26,  endpoint:"https://api-eu-west.windels.ai", failoverPriority:3 },
  { name:"AP South (Mumbai)",      cloud:"aws", tier:"secondary", lat:19.08, lng:72.88,  endpoint:"https://api-ap-south.windels.ai", failoverPriority:4 },
  { name:"EU West (Frankfurt) DR", cloud:"gcp", tier:"dr", lat:50.11, lng:8.68, endpoint:"https://api-eu-central.windels.ai", failoverPriority:99 },
];

export const RegionService = {
  async seed() {
    if (seeded) return; seeded = true;
    try { if (await redisCmd.exists(REG_KEY)) return; } catch {}
    for (const r of DEFAULT_REGIONS) {
      const id = r.name.toLowerCase().replace(/[^a-z]+/g,"-").replace(/(^-|-$)/g,"").replace("--","-");
      const region: Region = {
        id, ...r,
        status: (r.tier === "primary" ? "online" : "online") as RegionStatus,
        replicationRole: (r.tier === "primary" ? "primary" : r.tier === "dr" ? "standby" : "replica") as ReplicationRole,
        replicationLagMs: r.tier === "primary" ? 0 : Math.floor(rand(10, 250)),
        capacity: { requestsPerSec: Math.floor(rand(5000, 15000)), activeUsers: Math.floor(rand(2000, 20000)), pods: Math.floor(rand(10, 60)) },
        loadPercent: rand(30, 75),
        lastHealthCheckAt: now(),
      };
      await redisCmd.set(REG_PREFIX + id, JSON.stringify(region));
      await redisCmd.sadd(REG_KEY, id);
    }
  },

  async list(): Promise<Region[]> {
    await this.seed();
    const ids = await redisCmd.smembers(REG_KEY);
    const out: Region[] = [];
    for (const id of ids) { const r = await redisCmd.get(REG_PREFIX+id); if (r) out.push(JSON.parse(r)); }
    return out.sort((a,b)=>a.failoverPriority-b.failoverPriority);
  },
  async get(id: string): Promise<Region|null> {
    await this.seed(); const r = await redisCmd.get(REG_PREFIX+id); return r?JSON.parse(r):null;
  },
  async update(id: string, patch: Partial<Region>): Promise<Region|null> {
    const r = await this.get(id); if (!r) return null;
    Object.assign(r, patch); r.lastHealthCheckAt = now();
    await redisCmd.set(REG_PREFIX+id, JSON.stringify(r));
    return r;
  },

  async refreshHealth() {
    await this.seed();
    const regions = await this.list();
    for (const r of regions) {
      r.loadPercent = Math.max(5, Math.min(99, r.loadPercent + rand(-8, 8)));
      r.replicationLagMs = r.tier === "primary" ? 0 : Math.max(5, Math.floor((r.replicationLagMs ?? 50) + rand(-20, 20)));
      r.capacity.requestsPerSec += Math.floor(rand(-500, 500));
      r.status = r.loadPercent > 92 ? "degraded" : "online";
      r.lastHealthCheckAt = now();
      await redisCmd.set(REG_PREFIX+r.id, JSON.stringify(r));
    }
  },

  async failover(fromId: string, toId: string, reason: string, triggeredBy = "system"): Promise<FailoverStatus> {
    await this.seed();
    const existing = await this.getActiveFailover();
    if (existing && existing.state !== "complete" && existing.state !== "failed") {
      throw new Error(`failover already in progress: ${existing.fromRegion}→${existing.toRegion}`);
    }
    const from = await this.get(fromId); const to = await this.get(toId);
    if (!from || !to) throw new Error("unknown region");
    if (to.status === "offline") throw new Error("target region offline");
    const fo: FailoverStatus = {
      fromRegion: fromId, toRegion: toId, state: "preflight", startedAt: now(), reason: reason ?? "manual failover",
    };
    await redisCmd.set(FAILOVER_KEY, JSON.stringify(fo));
    // Simulate linear state transitions
    fo.state = "draining"; await redisCmd.set(FAILOVER_KEY, JSON.stringify(fo));
    from.status = "read-only"; await redisCmd.set(REG_PREFIX+fromId, JSON.stringify(from));
    fo.state = "switching"; await redisCmd.set(FAILOVER_KEY, JSON.stringify(fo));
    to.replicationRole = "primary"; from.replicationRole = "standby";
    await redisCmd.set(REG_PREFIX+toId, JSON.stringify(to)); await redisCmd.set(REG_PREFIX+fromId, JSON.stringify(from));
    fo.state = "verifying"; await redisCmd.set(FAILOVER_KEY, JSON.stringify(fo));
    to.status = "online"; from.status = "online";
    await redisCmd.set(REG_PREFIX+toId, JSON.stringify(to)); await redisCmd.set(REG_PREFIX+fromId, JSON.stringify(from));
    fo.state = "complete"; fo.completedAt = now();
    await redisCmd.set(FAILOVER_KEY, JSON.stringify(fo));
    logger.info("failover complete", { from: fromId, to: toId, triggeredBy });
    return fo;
  },

  async getActiveFailover(): Promise<FailoverStatus | null> {
    await this.seed(); const r = await redisCmd.get(FAILOVER_KEY); return r?JSON.parse(r):null;
  },
};
