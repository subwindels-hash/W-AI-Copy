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
import { makeRng } from "../utils/detRng.js";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";
// Deterministic demo RNG — stable per (module, seed) so dashboard
// reads return the same numbers within a running process.
const _rng = makeRng('platform');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const REG_KEY = "infra:regions";
const REG_PREFIX = "infra:region:";
const FAILOVER_KEY = "infra:active-failover";
let seeded = false;
function now(){return new Date().toISOString();}
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
    // Five regions across NA/EU/AP with invented replication lag, capacity
    // (5-15k rps, 2-20k active users, 10-60 pods) and 30-75% load — and a 10%
    // chance each non-primary shows "degraded". ClusterService's fabricated
    // Kubernetes estate was gated for exactly this reason; this is the same
    // fiction one layer up, and failover drills read from it.
    if (!demoDataEnabled()) return skipDemoSeed("platform-regions", logger);
    for (const r of DEFAULT_REGIONS) {
      const id = r.name.toLowerCase().replace(/[^a-z]+/g,"-").replace(/(^-|-$)/g,"").replace("--","-");
      const region: Region = {
        id, ...r,
        status: r.tier === "primary" ? "online" : (_rng.next() < 0.9 ? "online" : "degraded") as RegionStatus,
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

  /**
   * Refresh region health from reported telemetry.
   *
   * This used to walk every region applying ±8% load jitter, ±20 ms of
   * replication lag and ±500 rps of capacity drift, then *derive* the region's
   * status from the number it had just invented (`loadPercent > 92 → degraded`).
   * Polling it produced a convincing live feed of a multi-region estate, and
   * because it also set `lastHealthCheckAt`, every region looked freshly probed.
   *
   * A region's health can only come from that region. Until something reports,
   * this records that no check has happened rather than manufacturing one.
   */
  async refreshHealth() {
    await this.seed();
  },

  /**
   * Record a health report for one region, from whatever actually probed it.
   */
  async recordHealth(
    regionId: string,
    report: { loadPercent?: number; replicationLagMs?: number; requestsPerSec?: number; status?: RegionStatus },
  ): Promise<Region | null> {
    const r = await this.get(regionId);
    if (!r) return null;
    if (report.loadPercent !== undefined) r.loadPercent = report.loadPercent;
    if (report.replicationLagMs !== undefined) r.replicationLagMs = report.replicationLagMs;
    if (report.requestsPerSec !== undefined) r.capacity.requestsPerSec = report.requestsPerSec;
    // Prefer an explicitly reported status; otherwise derive it from a load
    // figure that was actually measured.
    r.status = report.status
      ?? (report.loadPercent !== undefined ? (report.loadPercent > 92 ? "degraded" : "online") : r.status);
    r.lastHealthCheckAt = now();
    await redisCmd.set(REG_PREFIX + r.id, JSON.stringify(r));
    return r;
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
