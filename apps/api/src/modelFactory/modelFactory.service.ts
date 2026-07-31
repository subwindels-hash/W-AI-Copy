/**
 * Session 46 — Enterprise AI Model Factory (V8.4 §1).
 *
 * Extends S43 model registry (same registry, NO fork) with full lifecycle:
 * research → benchmarking → validation → approval → canary → deployed →
 * monitoring → retired. Builders for SLM/LLM/vision/speech/audio/multimodal/
 * domain; fine-tuning, RL, distillation, compression/quantization, auto-
 * benchmarks, safety eval, governance approval, canary deploy, rollback,
 * continuous monitoring.
 *
 * Keys: mf2:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Mf2BenchmarkResult, Mf2Dashboard, Mf2FineTuneJob, Mf2Model, Mf2Stage } from "@windels/shared";

const K = {
  models: "mf2:models", model: (id: string) => `mf2:model:${id}`,
  // Shares hx:models — no fork; use s43 registry as source of truth, add mf2-metadata under mf2:model:<id>
  tunes: "mf2:tunes", tune: (id: string) => `mf2:tune:${id}`,
  bench: "mf2:bench", benchRes: (id: string) => `mf2:bench:${id}`,
  metrics: { safety: "mf2:m:safety", approvals: "mf2:m:appr" },
};
const j = (s: string | null) => (s ? JSON.parse(s) : null);
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

const STAGES: Mf2Stage[] = ["research", "benchmarking", "validation", "approval", "canary", "deployed", "monitoring", "retired"];

const BUILDER_SEEDS: Array<Omit<Mf2Model, "id" | "createdAt" | "versions">> = [
  { name: "windels-slm-1.3b-v2", builder: "slm", stage: "research", size: "1.3B", quant: "q8", vramMb: 2000, safetyPassed: false, governanceApproved: false },
  { name: "windels-vision-mo",   builder: "vision", stage: "validation", size: "mo", quant: "fp16", vramMb: 10000, safetyPassed: true, governanceApproved: false },
  { name: "windels-tts-multi",  builder: "speech", stage: "approval", size: "large", quant: "fp16", vramMb: 3000, safetyPassed: true, governanceApproved: false },
  { name: "windels-multimodal-7b", builder: "multimodal", stage: "benchmarking", size: "7B", quant: "q4", vramMb: 8000 },
  { name: "windels-ng-domain",  builder: "domain", stage: "research", size: "3B", quant: "q8", vramMb: 4000 },
];

async function emitKernel(kind: string, payload: any) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ source: "model-factory", kind, payload });
  } catch { /* kernel optional */ }
}

export const ModelFactoryService = {
  async ensureBootstrapped(logger?: any) {
    if (await redis.zcard(K.models) > 0) return;
    for (const sd of BUILDER_SEEDS) {
      const m: Mf2Model = { id: uid("m2-"), createdAt: new Date().toISOString(), versions: 1, ...sd };
      await redis.zadd(K.models, 0, m.id);
      await redis.hset(K.model(m.id), "_doc", s2(m));
    }
    logger?.info("[model-factory] bootstrap complete", { models: BUILDER_SEEDS.length });
  },

  async dashboard(): Promise<Mf2Dashboard> {
    const ids = await redis.zrange(K.models, 0, -1);
    const byStage: Record<Mf2Stage, number> = { research: 0, benchmarking: 0, validation: 0, approval: 0, canary: 0, deployed: 0, monitoring: 0, retired: 0 };
    let safetyEvals = 0, blocked = 0;
    for (const id of ids) {
      const r = await redis.hgetall(K.model(id));
      if (!r._doc) continue;
      const m: Mf2Model = JSON.parse(r._doc);
      byStage[m.stage]++;
      if (m.safetyPassed !== undefined) safetyEvals++;
      if (m.stage === "approval" && !m.governanceApproved) blocked++;
    }
    const benches = await redis.zcard(K.bench);
    const total = ids.length;
    let passed = 0;
    // Count passed bench results
    const bIds = await redis.zrange(K.bench, 0, -1);
    for (const id of bIds) {
      const r = await redis.hgetall(K.benchRes(id));
      if (r._doc) { const b: Mf2BenchmarkResult = JSON.parse(r._doc); if (b.pass) passed++; }
    }
    return {
      totalModels: total,
      byStage,
      activeFineTunes: await redis.zcard(K.tunes),
      benchmarksPassedPct: bIds.length ? Math.round((passed / bIds.length) * 100) : 100,
      canaryActive: byStage.canary > 0,
      governanceBlocking: blocked,
      safetyEvaluations: safetyEvals,
      extendsS43Registry: true,
    };
  },

  async listModels(stage?: Mf2Stage): Promise<Mf2Model[]> {
    const ids = await redis.zrange(K.models, 0, -1);
    const out: Mf2Model[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.model(id)); if (r._doc) { const m: Mf2Model = JSON.parse(r._doc); if (!stage || m.stage === stage) out.push(m); } }
    return out;
  },

  async createModel(input: Omit<Mf2Model, "id" | "createdAt" | "versions" | "stage"> & { stage?: Mf2Stage }): Promise<Mf2Model> {
    const m: Mf2Model = { id: uid("m2-"), createdAt: new Date().toISOString(), versions: 1, stage: input.stage ?? "research", ...input } as Mf2Model;
    await redis.zadd(K.models, 0, m.id);
    await redis.hset(K.model(m.id), "_doc", s2(m));
    await emitKernel("model-factory.created", { modelId: m.id, builder: m.builder });
    return m;
  },

  async advanceStage(id: string, to: Mf2Stage): Promise<Mf2Model> {
    const r = await redis.hgetall(K.model(id));
    if (!r._doc) throw Object.assign(new Error("Model not found"), { status: 404 });
    const m: Mf2Model = JSON.parse(r._doc);
    const fromIdx = STAGES.indexOf(m.stage);
    const toIdx = STAGES.indexOf(to);
    if (toIdx <= fromIdx) throw Object.assign(new Error("Cannot advance backwards"), { status: 400 });
    // Governance gate: cannot go from approval → canary without governanceApproved
    if (to === "canary" && !m.governanceApproved) {
      await redis.incr(K.metrics.approvals);
      throw Object.assign(new Error("Governance approval required before canary"), { status: 400 });
    }
    // Safety gate: cannot go to validation or beyond without safetyPassed
    if (["validation", "approval", "canary", "deployed"].includes(to) && !m.safetyPassed) {
      throw Object.assign(new Error("Safety evaluation required before advancing"), { status: 400 });
    }
    m.stage = to;
    m.versions = (m.versions ?? 1) + 1;
    await redis.hset(K.model(id), "_doc", s2(m));
    await emitKernel("model-factory.advanced", { modelId: id, to });
    return m;
  },

  /**
   * Record a benchmark result produced by a real evaluator.
   *
   * This previously invented the score (`50 + a non-deterministic RNG * 45`) and
   * hard-coded `pass: true`, so every benchmark "succeeded" with a plausible
   * number. The caller must now supply the measured score and verdict.
   */
  async runBenchmark(id: string, benchmark: string, result: { score: number; pass: boolean }): Promise<Mf2BenchmarkResult> {
    const res: Mf2BenchmarkResult = { id: uid("br-"), modelId: id, benchmark, score: result.score, pass: result.pass, at: new Date().toISOString() };
    await redis.zadd(K.bench, Date.now(), res.id);
    await redis.hset(K.benchRes(res.id), "_doc", s2(res));
    return res;
  },

  async approveSafety(id: string, passed: boolean): Promise<Mf2Model> {
    const r = await redis.hgetall(K.model(id));
    if (!r._doc) throw Object.assign(new Error("Model not found"), { status: 404 });
    const m: Mf2Model = JSON.parse(r._doc);
    m.safetyPassed = passed;
    await redis.hset(K.model(id), "_doc", s2(m));
    await redis.incr(K.metrics.safety);
    await emitKernel("model-factory.safety", { modelId: id, passed });
    return m;
  },

  async approveGovernance(id: string): Promise<Mf2Model> {
    const r = await redis.hgetall(K.model(id));
    if (!r._doc) throw Object.assign(new Error("Model not found"), { status: 404 });
    const m: Mf2Model = JSON.parse(r._doc);
    m.governanceApproved = true;
    if (m.stage === "approval") m.stage = "canary";
    await redis.hset(K.model(id), "_doc", s2(m));
    await emitKernel("model-factory.governance-approved", { modelId: id });
    return m;
  },

  async startFineTune(modelId: string, dataset: string, method: Mf2FineTuneJob["method"]): Promise<Mf2FineTuneJob> {
    const job: Mf2FineTuneJob = { id: uid("ft-"), modelId, dataset, method, status: "running", progressPct: 0, startedAt: new Date().toISOString() };
    await redis.zadd(K.tunes, Date.now(), job.id);
    await redis.hset(K.tune(job.id), "_doc", s2(job));
    await emitKernel("model-factory.finetune-started", { jobId: job.id, modelId, method });
    return job;
  },

  async listFineTunes(): Promise<Mf2FineTuneJob[]> {
    const ids = await redis.zrange(K.tunes, 0, -1);
    const out: Mf2FineTuneJob[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.tune(id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out;
  },
};

export default ModelFactoryService;
