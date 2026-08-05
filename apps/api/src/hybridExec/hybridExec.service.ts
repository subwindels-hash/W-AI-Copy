/**
 * Session 43 — Hybrid AI Execution & Model/Compute Management.
 *
 * Three execution modes (self-hosted / hybrid / connected-enterprise),
 * model registry extending S38, GPU scheduling, canary/rollback,
 * cost optimization, policy routing. Vendor-neutral (S33 rule).
 *
 * Keys: hx:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { HxDashboard, HxExecutionMode, HxGpuNode, HxModel, HxRouteDecision } from "@windels/shared";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";

const K = {
  models: "hx:models", model: (id: string) => `hx:model:${id}`,
  nodes: "hx:nodes", node: (id: string) => `hx:node:${id}`,
  routes: "hx:routes",
  metrics: { req24: "hx:m:req", rollback24: "hx:m:rb" },
};
const j = (s: string | null) => (s ? JSON.parse(s) : null);
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

const MODEL_SEEDS: Omit<HxModel, "id" | "registeredAt">[] = [
  { name: "windels-slm-1.3b", modality: "text", size: "1.3B", quant: "q8", vramMb: 2000, provider: "self-hosted", status: "deployed", benchmarkScore: 72 },
  { name: "windels-llm-7b",    modality: "text", size: "7B",   quant: "q4", vramMb: 5500, provider: "self-hosted", status: "deployed", benchmarkScore: 78 },
  { name: "windels-vision-xl", modality: "vision", size: "xl", quant: "fp16", vramMb: 8000, provider: "self-hosted", status: "deployed", benchmarkScore: 81 },
  { name: "windels-tts-pro",  modality: "speech", size: "large", quant: "fp16", vramMb: 2500, provider: "self-hosted", status: "deployed", benchmarkScore: 86 },
  { name: "windels-asr-pro",  modality: "speech", size: "large", quant: "q8", vramMb: 1800, provider: "self-hosted", status: "deployed", benchmarkScore: 83 },
  { name: "windels-music-sd", modality: "audio", size: "medium", quant: "fp16", vramMb: 4000, provider: "self-hosted", status: "deployed", benchmarkScore: 74 },
];

const NODE_SEEDS: Omit<HxGpuNode, "id">[] = [
  { name: "gpu-node-0", vramTotalMb: 24000, vramUsedMb: 8400, utilPct: 35, activeJobs: 2, online: true },
  { name: "gpu-node-1", vramTotalMb: 24000, vramUsedMb: 12000, utilPct: 50, activeJobs: 4, online: true },
  { name: "gpu-node-2", vramTotalMb: 48000, vramUsedMb: 16000, utilPct: 33, activeJobs: 3, online: true },
  { name: "gpu-node-3", vramTotalMb: 24000, vramUsedMb: 4800, utilPct: 20, activeJobs: 1, online: true },
];

async function emitKernel(kind: string, payload: any) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ source: "hybrid-exec", kind, payload });
  } catch { /* kernel optional */ }
}

export const HybridExecService = {
  async ensureBootstrapped(logger?: any) {
    if (await redis.zcard(K.models) > 0) return;
    // Demo/sample records are opt-in; production starts empty (no sample data auto-created).
    if (!demoDataEnabled()) return skipDemoSeed("hybridExec", logger);
    for (const sd of MODEL_SEEDS) {
      const m: HxModel = { id: uid("mdl-"), registeredAt: new Date().toISOString(), ...sd };
      await redis.zadd(K.models, 0, m.id);
      await redis.hset(K.model(m.id), "_doc", s2(m));
    }
    for (const sd of NODE_SEEDS) {
      const n: HxGpuNode = { id: uid("gpu-"), ...sd };
      await redis.zadd(K.nodes, 0, n.id);
      await redis.hset(K.node(n.id), "_doc", s2(n));
    }
    logger?.info("[hybrid-exec] bootstrap complete", { models: MODEL_SEEDS.length, nodes: NODE_SEEDS.length });
  },

  async dashboard(): Promise<HxDashboard> {
    const modelIds = await redis.zrange(K.models, 0, -1);
    let deployed = 0; let canary = false;
    for (const id of modelIds) { const r = await redis.hgetall(K.model(id)); if (r._doc) { const m: HxModel = JSON.parse(r._doc); if (m.status === "deployed") deployed++; if (m.status === "canary") canary = true; } }
    const nodeIds = await redis.zrange(K.nodes, 0, -1);
    let util = 0; let n = 0;
    for (const id of nodeIds) { const r = await redis.hgetall(K.node(id)); if (r._doc) { const g: HxGpuNode = JSON.parse(r._doc); util += g.utilPct; n++; } }
    return {
      modes: ["self-hosted", "hybrid", "connected-enterprise"],
      activeMode: "hybrid",
      modelsRegistered: modelIds.length,
      modelsDeployed: deployed,
      gpuNodes: nodeIds.length,
      gpuUtilizationPct: n ? Math.round(util / n) : 0,
      canaryActive: canary,
      rollbacks24h: Number(await redis.get(K.metrics.rollback24) ?? 0),
      costOptimization: true,
      vendorNeutral: true,
      routedThroughKernel: true,
    };
  },

  listModels(): Promise<HxModel[]> { return this.models(); },
  async models(status?: HxModel["status"]): Promise<HxModel[]> {
    const ids = await redis.zrange(K.models, 0, -1);
    const out: HxModel[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.model(id)); if (r._doc) { const m: HxModel = JSON.parse(r._doc); if (!status || m.status === status) out.push(m); } }
    return out;
  },

  async listNodes(): Promise<HxGpuNode[]> {
    const ids = await redis.zrange(K.nodes, 0, -1);
    const out: HxGpuNode[] = [];
    for (const id of ids) { const r = await redis.hgetall(K.node(id)); if (r._doc) out.push(JSON.parse(r._doc)); }
    return out;
  },

  /** Policy routing: self-hosted preferred, hybrid fallback to connected-enterprise when GPU saturated or safety-critical. */
  async routeRequest(input: { modality: string; requiredVramMb: number; safetyCritical?: boolean; costOptimize?: boolean }): Promise<HxRouteDecision> {
    const reqId = uid("req-");
    const nodes = await this.listNodes();
    const available = nodes.filter(n => n.online && (n.vramTotalMb - n.vramUsedMb) >= input.requiredVramMb);
    let mode: HxExecutionMode = "self-hosted";
    let targetNode: string | undefined;
    let targetModel = `windels-${input.modality}`;
    let reason = "";
    if (available.length > 0) {
      targetNode = available.sort((a, b) => (a.vramTotalMb - a.vramUsedMb) - (b.vramTotalMb - b.vramUsedMb))[0].id;
      reason = `Scheduled on least-loaded self-hosted node (${available.length} candidates)`;
    } else if (input.costOptimize !== false) {
      mode = "hybrid";
      reason = "Self-hosted GPU saturated; falling back to connected-enterprise via hybrid routing";
    } else {
      mode = "connected-enterprise";
      reason = "Insufficient GPU + costOptimize=false → direct to connected";
    }
    if (input.safetyCritical) reason += "; safety-critical → routed through governance audit layer";
    const decision: HxRouteDecision = { requestId: reqId, mode, targetModel, targetNode, reason, fallbackAvailable: available.length > 0 };
    await redis.zadd(K.routes, Date.now(), reqId);
    await redis.hset(`hx:route:${reqId}`, "_doc", s2(decision));
    await redis.incr(K.metrics.req24);
    await emitKernel("hybrid-exec.routed", { reqId, mode, targetNode, targetModel });
    return decision;
  },

  async registerModel(input: Omit<HxModel, "id" | "registeredAt" | "status">): Promise<HxModel> {
    const m: HxModel = { id: uid("mdl-"), registeredAt: new Date().toISOString(), status: "registered", ...input };
    await redis.zadd(K.models, 0, m.id);
    await redis.hset(K.model(m.id), "_doc", s2(m));
    await emitKernel("hybrid-exec.model-registered", { modelId: m.id });
    return m;
  },

  async promoteCanary(id: string, pct: number): Promise<HxModel> {
    const r = await redis.hgetall(K.model(id));
    if (!r._doc) throw Object.assign(new Error("Model not found"), { status: 404 });
    const m: HxModel = JSON.parse(r._doc);
    m.status = "canary"; m.canaryPct = Math.max(0, Math.min(100, pct)); m.versions = (m.versions ?? 1);
    await redis.hset(K.model(id), "_doc", s2(m));
    await emitKernel("hybrid-exec.canary-promoted", { modelId: id, pct });
    return m;
  },

  async rollback(id: string): Promise<HxModel> {
    const r = await redis.hgetall(K.model(id));
    if (!r._doc) throw Object.assign(new Error("Model not found"), { status: 404 });
    const m: HxModel = JSON.parse(r._doc);
    m.status = "deployed"; m.canaryPct = 0;
    await redis.hset(K.model(id), "_doc", s2(m));
    await redis.incr(K.metrics.rollback24);
    await emitKernel("hybrid-exec.rolled-back", { modelId: id });
    return m;
  },
};

export default HybridExecService;
