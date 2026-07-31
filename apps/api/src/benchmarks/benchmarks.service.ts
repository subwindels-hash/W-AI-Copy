/**
 * Session 50 — Enterprise AI Benchmark Center (V8.4 §5).
 * 14 evaluation areas. Results feed S46 model-factory optimization loop.
 * Keys: bm:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { BM_AREAS, BmArea, BmDashboard, BmMetric, BmRun, BmScheduled } from "@windels/shared";
import { makeRng } from "../utils/detRng.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('benchmarks:benchmarks');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



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

function randomMetrics(area: BmArea): BmMetric[] {
  const base: BmMetric[] = [
    { key: "p95_latency_ms", label: "p95 Latency", value: Math.round(40 + _rng.next()*180), unit: "ms", higherIsBetter: false, baseline: 200, target: 100 },
    { key: "success_pct", label: "Success Rate", value: Math.round((0.9 + _rng.next()*0.09)*1000)/10, unit: "%", higherIsBetter: true, baseline: 85, target: 99 },
    { key: "cost_per_1k_usd", label: "Cost / 1k", value: Math.round((0.05 + _rng.next()*0.4)*1000)/1000, unit: "USD", higherIsBetter: false, baseline: 0.5, target: 0.1 },
  ];
  if (area === "safety_metrics") base.push({ key: "policy_pass_rate", label: "Policy Pass", value: Math.round((0.95+_rng.next()*0.049)*1000)/10, unit: "%", higherIsBetter: true, target: 99.5 });
  if (area === "response_accuracy") base.push({ key: "factuality", label: "Factuality", value: Math.round((0.8+_rng.next()*0.18)*100)/100, unit: "score", higherIsBetter: true, target: 0.95 });
  if (area === "coding_performance") base.push({ key: "pass_at_1", label: "Pass@1", value: Math.round((0.4+_rng.next()*0.4)*100)/100, unit: "score", higherIsBetter: true, target: 0.75 });
  if (area === "voice_models") base.push({ key: "mos", label: "MOS", value: Math.round((3.6+_rng.next()*0.9)*10)/10, unit: "/5", higherIsBetter: true, target: 4.5 });
  if (area === "latency") base.push({ key: "ttft_ms", label: "TTFT", value: Math.round(80+_rng.next()*220), unit: "ms", higherIsBetter: false, target: 150 });
  if (area === "resource_consumption") base.push({ key: "gpu_util_pct", label: "GPU Utilization", value: Math.round(40+_rng.next()*50), unit: "%", higherIsBetter: false, target: 70 });
  return base;
}

async function emitKernel(kind: string, payload: any) {
  try { const { KernelService } = await import("../kernel/kernel.service.js"); await KernelService.dispatch({ source: "benchmarks", kind, payload }); } catch {}
}

export const BenchmarksService = {
  async ensureBootstrapped(logger?: any, oid = "org-windels") {
    _rng.reseed(`ensureBootstrapped:${logger}`);
    if (await redis.exists(K.runs(oid))) return;
    for (const area of BM_AREAS) {
      const id = uid("br-"); const started = Date.now() - Math.floor(_rng.next()*24*3600*1000); const dur = 800 + Math.floor(_rng.next()*3200);
      const metrics = randomMetrics(area); const score = Math.round(70 + _rng.next()*28);
      const run: BmRun = { id, organizationId: oid, area, targetName: area.replace(/_/g," "), status: "completed", startedAt: new Date(started).toISOString(), completedAt: new Date(started+dur).toISOString(), durationMs: dur, metrics, overallScore: score, passed: score>=80 };
      await redis.hset(K.run(oid,id), "_doc", s2(run));
      await redis.zadd(K.runs(oid), started, id);
      await redis.zadd(K.areaScore(oid), score, area);
    }
    await redis.hset(K.metrics(oid), "optimizedModels", "0", "pending", "2");
    logger?.info?.("[benchmarks] bootstrap complete", { areas: BM_AREAS.length });
  },

  async dashboard(oid = "org-windels"): Promise<BmDashboard> {
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

  async runBenchmark(input: { area: BmArea; targetId?: string; targetName?: string; notes?: string; metrics: BmMetric[]; overallScore: number; passed: boolean; evaluator: string; evidence: string; organizationId?: string }): Promise<BmRun> {
    const oid = input.organizationId || "org-windels";
    const id = uid("br-"); const start = Date.now();
    const run: BmRun = { id, organizationId: oid, area: input.area, targetId: input.targetId, targetName: input.targetName || input.targetId || input.area.replace(/_/g," "), status: "completed", startedAt: new Date(start).toISOString(), completedAt: new Date(start).toISOString(), durationMs: 0, metrics: input.metrics, overallScore: input.overallScore, passed: input.passed, notes: input.notes, metadata: { evaluator: input.evaluator, evidence: input.evidence, imported: true } } as BmRun;
    await redis.hset(K.run(oid,id), "_doc", s2(run));
    await redis.zadd(K.runs(oid), start, id);
    await redis.zadd(K.areaScore(oid), input.overallScore, input.area);
    if (input.overallScore < 80) { await redis.hincrby(K.metrics(oid), "pending", 1); emitKernel("benchmarks.underperforming", { organizationId: oid, area: input.area, score: input.overallScore, runId: id }); }
    else { await redis.hincrby(K.metrics(oid), "optimizedModels", 1); }
    return run;
  },

  async schedule(input: { area: BmArea; cron: string; enabled: boolean; targetId?: string; organizationId?: string }): Promise<BmScheduled> {
    const oid = input.organizationId || "org-windels";
    const id = uid("sc-");
    const s: BmScheduled = { id, area: input.area, targetId: input.targetId, cron: input.cron, enabled: input.enabled, nextRunAt: new Date(Date.now()+3600_000).toISOString() };
    await redis.hset(K.sched(oid,id), "_doc", s2(s));
    await redis.sadd(K.scheds(oid), id);
    return s;
  },

  async listRuns(oid = "org-windels", limit = 30): Promise<BmRun[]> {
    const ids = await redis.zrange(K.runs(oid), -limit, -1, "REV");
    const out: BmRun[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.run(oid,id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out;
  },
};

export default BenchmarksService;
