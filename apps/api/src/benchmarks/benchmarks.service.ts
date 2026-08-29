/**
 * Session 50 — Enterprise AI Benchmark Center (V8.4 §5).
 * 14 evaluation areas. Results feed S46 model-factory optimization loop.
 * Keys: bm:*
 *
 * ── RESULT-REGISTRY SCOPE ────────────────────────────────────────────
 * This service records benchmark results that a real evaluator produced. It
 * does not run or synthesise evaluations.
 *
 * The bootstrap previously seeded one "completed" run per area with randomly
 * generated metrics — p95 latency, success rate, factuality, Pass@1, MOS — and
 * a random 70-98 overall score. Those numbers were indistinguishable from real
 * measurements in the dashboard and leaderboard, which made the benchmark
 * centre actively misleading. All synthetic result generation is removed.
 *
 * Results enter only through runBenchmark(), which requires an `evaluator` and
 * `evidence` reference. Until something is recorded the dashboard reports zero.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { BM_AREAS, BmArea, BmDashboard, BmMetric, BmRun, BmScheduled } from "@windels/shared";

const K = {
  run: (oid: string, id: string) => `bm:run:${oid}:${id}`,
  runs: (oid: string) => `bm:runs:${oid}`,
  sched: (oid: string, id: string) => `bm:sched:${oid}:${id}`,
  scheds: (oid: string) => `bm:scheds:${oid}`,
  metrics: (oid: string) => `bm:m:${oid}`,
  areaScore: (oid: string) => `bm:area:${oid}`,
};
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

async function emitKernel(kind: string, payload: any) {
  try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ source: "benchmarks", kind, payload }); } catch {}
}

export const BenchmarksService = {
  /**
   * Marks the organization as initialised. Seeds **no** runs: an organization
   * with no recorded evaluations reports an empty benchmark centre.
   */
  async ensureBootstrapped(logger?: any, oid?: string) {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) return;
    if (await redis.exists(K.metrics(oid))) return;
    await redis.hset(K.metrics(oid), "optimizedModels", "0", "pending", "0");
    logger?.info?.("[benchmarks] initialized (result-registry; no synthetic runs)", { areas: BM_AREAS.length });
  },

  async dashboard(oid: string): Promise<BmDashboard> {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) throw new Error("organizationId is required");
    const runs = await this.listRuns(oid, 100);
    const completed = runs.filter(r=>r.status==="completed");
    const last24h = runs.filter(r=>Date.now()-new Date(r.startedAt).getTime()<24*3600*1000 && r.status==="completed").length;
    const avg = completed.length ? completed.reduce((s,r)=>s+r.overallScore,0)/completed.length : 0;
    const passed = completed.filter(r=>r.passed).length;
    const scores: Record<BmArea, number> = Object.fromEntries(BM_AREAS.map(a=>[a,0])) as Record<BmArea,number>;
    for (const a of BM_AREAS) { const m = await redis.zscore(K.areaScore(oid), a); scores[a] = m ? Number(m) : 0; }
    const lb = completed.slice().sort((a,b)=>b.overallScore-a.overallScore).slice(0,8).map(r=>({ area: r.area, targetName: r.targetName, overallScore: r.overallScore, runs: 1 }));
    const m = await redis.hgetall(K.metrics(oid));
    return {
      totalRuns: runs.length, completed24h: last24h, avgScore: Math.round(avg*10)/10,
      passRate: completed.length ? passed/completed.length : 0, leaderboard: lb,
      areaScores: scores, recentRuns: runs.slice(0,10),
      feedbackToModelFactory: { optimizedModels: Number(m.optimizedModels||"0"), pendingRecommendations: Number(m.pending||"0") },
    };
  },

  async runBenchmark(input: { area: BmArea; targetId?: string; targetName?: string; notes?: string; metrics: BmMetric[]; overallScore: number; passed: boolean; evaluator: string; evidence: string; organizationId: string }): Promise<BmRun> {
    const oid = input.organizationId;
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) throw new Error("organizationId is required");
    const id = uid("br-"); const start = Date.now();
    const run: BmRun = { id, organizationId: oid, area: input.area, targetId: input.targetId, targetName: input.targetName || input.targetId || input.area.replace(/_/g," "), status: "completed", startedAt: new Date(start).toISOString(), completedAt: new Date(start).toISOString(), durationMs: 0, metrics: input.metrics, overallScore: input.overallScore, passed: input.passed, notes: input.notes, metadata: { evaluator: input.evaluator, evidence: input.evidence, imported: true } };
    await redis.hset(K.run(oid,id), "_doc", s2(run));
    await redis.zadd(K.runs(oid), start, id);
    await redis.zadd(K.areaScore(oid), input.overallScore, input.area);
    if (input.overallScore < 80) { await redis.hincrby(K.metrics(oid), "pending", 1); emitKernel("benchmarks.underperforming", { organizationId: oid, area: input.area, score: input.overallScore, runId: id }); }
    else { await redis.hincrby(K.metrics(oid), "optimizedModels", 1); }
    return run;
  },

  async schedule(input: { area: BmArea; cron: string; enabled: boolean; targetId?: string; organizationId: string }): Promise<BmScheduled> {
    const oid = input.organizationId;
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) throw new Error("organizationId is required");
    const id = uid("sc-");
    const s: BmScheduled = { id, area: input.area, targetId: input.targetId, cron: input.cron, enabled: input.enabled, nextRunAt: new Date(Date.now()+3600_000).toISOString() };
    await redis.hset(K.sched(oid,id), "_doc", s2(s));
    await redis.sadd(K.scheds(oid), id);
    return s;
  },

  async listRuns(oid: string, limit = 30): Promise<BmRun[]> {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) throw new Error("organizationId is required");
    const ids = await redis.zrange(K.runs(oid), -limit, -1, "REV");
    const out: BmRun[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.run(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out;
  },
};

export default BenchmarksService;
