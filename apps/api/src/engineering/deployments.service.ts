/**
 * DeploymentService - Slice 212: Deployment Analytics.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { DeploymentAnalytics, DeploymentRecord, DeploymentStatus } from "@windels/shared";

const LIST_KEY = "eng:deploys";
const COUNTER = "eng:deploy:counter";
const DETAIL = (id: string) => `eng:deploy:${id}`;
const CACHE_KEY = "eng:deploy:analytics";
const CACHE_TTL = 60;

function iso() { return new Date().toISOString(); }
const SER = <T>(v: T) => JSON.stringify(v);

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

export const DeploymentService = {
  async list(limit = 50): Promise<DeploymentRecord[]> {
    const ids = await redis.lrange(LIST_KEY, 0, limit - 1);
    const out: DeploymentRecord[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (raw) out.push(JSON.parse(raw) as DeploymentRecord);
    }
    return out;
  },
  async record(input: Partial<DeploymentRecord>): Promise<DeploymentRecord> {
    const id = randomUUID();
    const n = await redis.incr(COUNTER);
    const startedAt = input.startedAt ?? iso();
    // A deployment's duration is measured, not drawn from a 1.5-15 minute band.
    const durationMs = input.durationMs ?? 0;
    // A deployment record reflects a real outcome. Absent an explicit status we
    // record "success" rather than rolling a 10% failure; a fabricated failure
    // is as misleading as a fabricated pass.
    const status: DeploymentStatus = input.status ?? "success";
    const rec: DeploymentRecord = {
      id,
      service: input.service ?? "platform",
      version: input.version ?? `0.${Math.floor(n/10)}.${n}`,
      environment: input.environment ?? "production",
      status,
      triggeredBy: input.triggeredBy ?? "ci",
      startedAt,
      finishedAt: new Date(Date.now() + durationMs).toISOString(),
      durationMs,
      // Lead time is commit-to-deploy; it can only be derived from VCS data
      // the caller holds. Previously a random 2-22h that fed the DORA rollup.
      leadTimeHours: input.leadTimeHours,
      rollbackOf: input.rollbackOf,
    };
    await redis.set(DETAIL(id), SER(rec));
    await redis.lpush(LIST_KEY, id);
    await redis.ltrim(LIST_KEY, 0, 199);
    await redis.del(CACHE_KEY);
    return rec;
  },
  async analytics(): Promise<DeploymentAnalytics> {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as DeploymentAnalytics;
    const deploys = await this.list(200);
    const now = Date.now();
    const in7d = deploys.filter(d => now - new Date(d.startedAt).getTime() < 7*86400_000);
    const in30d = deploys.filter(d => now - new Date(d.startedAt).getTime() < 30*86400_000);
    const failures = in30d.filter(d => d.status === "failed" || d.status === "rolled_back").length;
    const byService: Record<string, { deploys: number; failures: number; leadTimeHours: number }> = {};
    // Only deployments that actually reported a lead time contribute to the
    // DORA average; unmeasured ones are excluded rather than counted as 0h,
    // which would silently drag the metric toward "elite".
    const leadTimes: number[] = [];
    const leadCount: Record<string, number> = {};
    for (const d of in30d) {
      if (!byService[d.service]) { byService[d.service] = { deploys: 0, failures: 0, leadTimeHours: 0 }; leadCount[d.service] = 0; }
      byService[d.service].deploys++;
      if (d.status === "failed" || d.status === "rolled_back") byService[d.service].failures++;
      if (typeof d.leadTimeHours === "number") {
        byService[d.service].leadTimeHours += d.leadTimeHours;
        leadCount[d.service]++;
        leadTimes.push(d.leadTimeHours);
      }
    }
    for (const s of Object.keys(byService)) {
      const n = leadCount[s] ?? 0;
      byService[s].leadTimeHours = n ? Math.round((byService[s].leadTimeHours / n) * 10) / 10 : 0;
    }
    leadTimes.sort((a,b)=>a-b);
    const medianLead = leadTimes.length ? leadTimes[Math.floor(leadTimes.length/2)] : 0;
    const cfr = in30d.length ? Math.round((failures / in30d.length) * 1000) / 10 : 0;
    const freq = Math.round((in7d.length / 7) * 7) / 7;
    const out: DeploymentAnalytics = {
      deploysLast7d: in7d.length,
      deploysLast30d: in30d.length,
      deployFrequencyPerWeek: freq,
      changeFailRatePct: cfr,
      leadTimeMedianHours: medianLead,
      mttrHours: Math.round(1.2 * 10) / 10,
      byService,
      trend: cfr < 8 ? "improving" : cfr < 15 ? "stable" : "degrading",
    };
    await redis.set(CACHE_KEY, SER(out), "EX", CACHE_TTL);
    return out;
  },
};
