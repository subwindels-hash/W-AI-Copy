/**
 * Self-Hosted AI Infrastructure singleton (Session 38).
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type {
  GpuNode, RegisteredModel, InferenceJob, VectorStore, SelfHostedDashboard,
  ModelState, InferenceBackend, ModelFormat, ModelOrigin, NodeStatus,
  SchedulingClass, VectorBackend,
} from "@windels/shared";
// Deterministic demo RNG — stable within a running process.



const K = {
  nodes: "sh:nodes", node: (id: string) => `sh:node:${id}`,
  models: "sh:models", model: (id: string) => `sh:model:${id}`,
  jobs: "sh:jobs", jobs24: "sh:jobs24", lats: "sh:lats",
  vectors: "sh:vectors", vector: (id: string) => `sh:vector:${id}`,
};
const j = (s: string) => JSON.parse(s);
const s = (o: any) => JSON.stringify(o);

export const SelfHostedService = {
  async listNodes(): Promise<GpuNode[]> {
    const ids = await redis.zrange(K.nodes, 0, -1);
    return Promise.all(ids.map(async id => j((await redis.hgetall(K.node(id)))._doc)));
  },
  async registerNode(n: Omit<GpuNode,"id">): Promise<GpuNode> {
    const id = "node-" + randomUUID().slice(0,8);
    const node: GpuNode = { ...n, id };
    const multi = redis.multi();
    multi.zadd(K.nodes, 0, id);
    multi.hset(K.node(id), "_doc", s(node));
    await multi.exec();
    return node;
  },
  async setNodeStatus(id: string, status: NodeStatus, util?: number): Promise<GpuNode|null> {
    const raw = await redis.hgetall(K.node(id));
    if (!raw._doc) return null;
    const n: GpuNode = j(raw._doc);
    n.status = status;
    if (util != null) n.utilizationPct = util;
    await redis.hset(K.node(id), "_doc", s(n));
    return n;
  },
  async listModels(): Promise<RegisteredModel[]> {
    const ids = await redis.zrange(K.models, 0, -1);
    return Promise.all(ids.map(async id => j((await redis.hgetall(K.model(id)))._doc)));
  },
  async registerModel(m: { name: string; version: string; format: ModelFormat; origin: ModelOrigin; backend: InferenceBackend; sizeGb: number; contextWindow: number; quant: string; capabilities?: string[] }): Promise<RegisteredModel> {
    const id = `mdl-${m.name.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${m.version.replace(/\./g,"")}`;
    const existing = await redis.hgetall(K.model(id));
    if (existing._doc) return j(existing._doc);
    const model: RegisteredModel = {
      id, name: m.name, version: m.version, format: m.format, origin: m.origin,
      state: "ready", backend: m.backend, sizeGb: m.sizeGb,
      contextWindow: m.contextWindow, quant: m.quant, capabilities: m.capabilities ?? ["chat"],
      createdAt: new Date().toISOString(),
    };
    const multi = redis.multi();
    multi.zadd(K.models, 0, id);
    multi.hset(K.model(id), "_doc", s(model));
    await multi.exec();
    return model;
  },
  async loadModel(id: string, nodeId?: string): Promise<RegisteredModel|null> {
    const nodes = await this.listNodes();
    const target = nodes.find(n => n.id === nodeId) ?? nodes.find(n => n.status === "online" && (n.vramGb - n.vramUsedGb) > 20);
    if (!target) return null;
    const raw = await redis.hgetall(K.model(id));
    if (!raw._doc) return null;
    const m: RegisteredModel = j(raw._doc);
    m.state = "loaded"; m.loadedOnNodeId = target.id;
    target.vramUsedGb = Math.min(target.vramGb, target.vramUsedGb + m.sizeGb);
    await redis.hset(K.model(id), "_doc", s(m));
    await redis.hset(K.node(target.id), "_doc", s(target));
    return m;
  },
  /**
   * Record an inference job.
   *
   * No model is actually invoked here — this schedules and books the job. The
   * latency was therefore invented (80-480 ms) and pushed onto the `K.lats`
   * ring buffer, which is what the dashboard averages, so the reported
   * inference latency described nothing that ran. Elapsed time is now measured
   * across the call; a caller that performs the real inference should pass the
   * observed duration via `latencyMs`.
   */
  async runInference(input: { modelId: string; prompt: string; maxTokens?: number; temperature?: number; schedulingClass?: SchedulingClass; latencyMs?: number }): Promise<InferenceJob> {
    const startedAtMs = Date.now();
    const model = (await this.listModels()).find(m => m.id === input.modelId);
    if (!model) throw new Error("model not found");
    const nodes = await this.listNodes();
    const node = model.loadedOnNodeId ? nodes.find(n => n.id === model.loadedOnNodeId) : nodes.find(n => n.status === "online");
    if (!node) throw new Error("no online node");
    const itoks = Math.floor(input.prompt.length/4);
    const otoks = Math.min(input.maxTokens ?? 256, model.contextWindow - itoks);
    const job: InferenceJob = {
      id: "job-" + randomUUID().slice(0,8), modelId: input.modelId, nodeId: node.id,
      status: "completed", scheduledAt: new Date(startedAtMs).toISOString(),
      startedAt: new Date(startedAtMs).toISOString(), completedAt: new Date().toISOString(),
      inputTokens: itoks, outputTokens: otoks,
      latencyMs: input.latencyMs ?? (Date.now() - startedAtMs),
    };
    await redis.zadd(K.jobs, Date.now(), s(job));
    await redis.incr(K.jobs24);
    await redis.lpush(K.lats, String(job.latencyMs));
    await redis.ltrim(K.lats, 0, 199);
    return job;
  },
  async listJobs(limit = 50): Promise<InferenceJob[]> {
    const raw = await redis.zrange(K.jobs, 0, -1, "REV");
    return raw.slice(0,limit).map(j);
  },
  async listVectorStores(): Promise<VectorStore[]> {
    const ids = await redis.zrange(K.vectors, 0, -1);
    return Promise.all(ids.map(async id => j((await redis.hgetall(K.vector(id)))._doc)));
  },
  async registerVectorStore(v: Omit<VectorStore,"id">): Promise<VectorStore> {
    const id = "vec-" + randomUUID().slice(0,8);
    const full: VectorStore = { ...v, id };
    const multi = redis.multi();
    multi.zadd(K.vectors, 0, id);
    multi.hset(K.vector(id), "_doc", s(full));
    await multi.exec();
    return full;
  },
  async summary(): Promise<SelfHostedDashboard> {
    const [nodes, models, vectors, jobs24] = await Promise.all([
      this.listNodes(), this.listModels(), this.listVectorStores(),
      redis.get(K.jobs24).then(x=>Number(x??0)),
    ]);
    const latRaw = await redis.lrange(K.lats,0,99);
    const lats = latRaw.map(Number).filter(n=>n>0);
    const avgLat = lats.length?Math.round(lats.reduce((a,b)=>a+b,0)/lats.length):180;
    const online = nodes.filter(n=>n.status==="online");
    return {
      nodes: nodes.length, nodesOnline: online.length,
      aggregateVramGb: nodes.reduce((s,n)=>s+n.vramGb,0),
      aggregateVramUsedGb: nodes.reduce((s,n)=>s+n.vramUsedGb,0),
      models: models.length, modelsReady: models.filter(m=>m.state==="ready").length,
      modelsLoaded: models.filter(m=>m.state==="loaded").length,
      inferenceJobs24h: jobs24, avgInferenceLatencyMs: avgLat,
      gpuUtilizationPct: online.length?Math.round(online.reduce((s,n)=>s+n.utilizationPct,0)/online.length):0,
      vectorStores: vectors.length, haClusterHealthy: online.length>=2,
      airgapMode: nodes.some(n=>n.tags.includes("airgap")), edgeNodes: nodes.filter(n=>n.kind==="edge-node").length,
    };
  },
};
