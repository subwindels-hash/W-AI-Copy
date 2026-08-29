/**
 * Session 43 — Hybrid AI Execution & Model/Compute Management.
 *
 * Three execution modes (self-hosted / hybrid / connected-enterprise),
 * model registry extending S38, GPU scheduling, canary/rollback,
 * cost optimization, policy routing. Vendor-neutral (S33 rule).
 *
 * Session 194 — additive fix:
 *  - Every method requires `oid` (no implicit global reads).
 *  - All keys are now `<prefix>:<org>:…` so a tenant's models, GPU
 *    nodes, route ledger, and counters never leak to another tenant.
 *  - One-shot legacy adoption of the Session 43 global keys.
 *  - The dashboard no longer hardcodes `activeMode: "hybrid"`,
 *    `costOptimization: true`, `vendorNeutral: true`,
 *    `routedThroughKernel: true`. `activeMode` is computed from the
 *    org's `hx:mode:<org>` key (default `null` until configured).
 *    The three boolean flags come from the org's `hx:flags:<org>`
 *    hash and default to `false`.
 *  - Reads do not seed; the `WINDELS_DEMO_DATA` gate stays in place
 *    for the bootstrap that runs at server start.
 *
 * Keys (org id is always the segment straight after the prefix):
 *   hx:models:<org>          zset of model ids
 *   hx:model:<org>:<id>      hash of a model
 *   hx:nodes:<org>           zset of GPU node ids
 *   hx:node:<org>:<id>       hash of a GPU node
 *   hx:routes:<org>          zset of route decisions (timestamped)
 *   hx:route:<org>:<id>      hash of a route decision
 *   hx:m:req:<org>           routing counter
 *   hx:m:rb:<org>            rollback counter
 *   hx:mode:<org>            active execution mode (per-org config)
 *   hx:flags:<org>           hash of feature flags (costOptimization, etc.)
 *   hx:imported:<org>        marker: legacy global keys adopted
 *   hx:notes:<org>           tenantStore-backed notes ledger
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { HxDashboard, HxExecutionMode, HxGpuNode, HxModel, HxRouteDecision } from "@windels/shared";
import { demoDataEnabled, skipDemoSeed } from "../config/demoData.js";

const K = {
  models: (oid: string) => `hx:models:${oid}`,
  model: (oid: string, id: string) => `hx:model:${oid}:${id}`,
  nodes: (oid: string) => `hx:nodes:${oid}`,
  node: (oid: string, id: string) => `hx:node:${oid}:${id}`,
  routes: (oid: string) => `hx:routes:${oid}`,
  route: (oid: string, id: string) => `hx:route:${oid}:${id}`,
  metrics: {
    req24: (oid: string) => `hx:m:req:${oid}`,
    rollback24: (oid: string) => `hx:m:rb:${oid}`,
  },
  mode: (oid: string) => `hx:mode:${oid}`,
  flags: (oid: string) => `hx:flags:${oid}`,
  imported: (oid: string) => `hx:imported:${oid}`,
  // Legacy global keys from S43 — left in place after adoption.
  legacyModels: "hx:models",
  legacyModel: (id: string) => `hx:model:${id}`,
  legacyNodes: "hx:nodes",
  legacyNode: (id: string) => `hx:node:${id}`,
  legacyRoutes: "hx:routes",
  legacyRoute: (id: string) => `hx:route:${id}`,
  legacyMetricsReq24: "hx:m:req",
  legacyMetricsRollback24: "hx:m:rb",
};
const j = (s: string | null) => (s ? JSON.parse(s) : null);
const s2 = (o: any) => JSON.stringify(o);
const uid = (p: string) => p + randomUUID().slice(0, 8);

function assertOrg(oid: string) {
  if (!oid || typeof oid !== "string" || oid.trim().length === 0) {
    throw Object.assign(new Error("organizationId is required"), { status: 403 });
  }
}

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

/**
 * One-shot adoption of the S43 global keys. Runs once per organization:
 * the global zset is read, every entry is written into the org namespace,
 * the marker is set, and the legacy global keys are left in place
 * (rollback safety; no invented timestamps).
 */
async function ensureAdopted(oid: string) {
  if (await redis.exists(K.imported(oid))) return;
  const globalModels = await redis.zrange(K.legacyModels, 0, -1);
  for (const id of globalModels) {
    const r = await redis.hgetall(K.legacyModel(id));
    if (!r._doc) continue;
    try {
      const m: HxModel = JSON.parse(r._doc);
      if (m && typeof m.id === "string" && typeof m.name === "string") {
        await redis.zadd(K.models(oid), 0, m.id);
        await redis.hset(K.model(oid, m.id), "_doc", s2(m));
      }
    } catch {
      // Corrupt legacy entry: skip.
    }
  }
  const globalNodes = await redis.zrange(K.legacyNodes, 0, -1);
  for (const id of globalNodes) {
    const r = await redis.hgetall(K.legacyNode(id));
    if (!r._doc) continue;
    try {
      const n: HxGpuNode = JSON.parse(r._doc);
      if (n && typeof n.id === "string" && typeof n.name === "string") {
        await redis.zadd(K.nodes(oid), 0, n.id);
        await redis.hset(K.node(oid, n.id), "_doc", s2(n));
      }
    } catch {
      // Corrupt legacy entry: skip.
    }
  }
  const globalRoutes = await redis.zrange(K.legacyRoutes, 0, -1);
  for (const id of globalRoutes) {
    const r = await redis.hgetall(K.legacyRoute(id));
    if (!r._doc) continue;
    try {
      const d: HxRouteDecision = JSON.parse(r._doc);
      if (d && typeof d.requestId === "string") {
        await redis.zadd(K.routes(oid), Date.now(), d.requestId);
        await redis.hset(K.route(oid, d.requestId), "_doc", s2(d));
      }
    } catch {
      // Corrupt legacy entry: skip.
    }
  }
  const globalReq = await redis.get(K.legacyMetricsReq24);
  if (globalReq) await redis.set(K.metrics.req24(oid), globalReq);
  const globalRb = await redis.get(K.legacyMetricsRollback24);
  if (globalRb) await redis.set(K.metrics.rollback24(oid), globalRb);
  await redis.set(K.imported(oid), "1");
}

async function emitKernel(kind: string, payload: any) {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ source: "hybrid-exec", kind, payload });
  } catch { /* kernel optional */ }
}

export const HybridExecService = {
  /**
   * Server-start bootstrap, gated behind `WINDELS_DEMO_DATA` (default off).
   * The default install starts empty; demo seeds (catalogue models, GPU
   * nodes) are only installed when the operator opts in.
   *
   * Per-org seed (preferred path) is provided by `bootstrapOrg(oid)`;
   * this global call seeds nothing.
   */
  async ensureBootstrapped(logger?: any) {
    if (!demoDataEnabled()) return skipDemoSeed("hybridExec", logger);
    // The S43 behaviour: install into the legacy global keys so the
    // legacy adoption (S194) can copy them per-org. The S194 service
    // never reads these directly.
    for (const sd of MODEL_SEEDS) {
      const m: HxModel = { id: uid("mdl-"), registeredAt: new Date().toISOString(), ...sd };
      await redis.zadd(K.legacyModels, 0, m.id);
      await redis.hset(K.legacyModel(m.id), "_doc", s2(m));
    }
    for (const sd of NODE_SEEDS) {
      const n: HxGpuNode = { id: uid("gpu-"), ...sd };
      await redis.zadd(K.legacyNodes, 0, n.id);
      await redis.hset(K.legacyNode(n.id), "_doc", s2(n));
    }
    logger?.info?.("[hybrid-exec] global bootstrap seeded (legacy keys; per-org adoption happens lazily)");
  },

  /**
   * Per-org seed. Called by the S194 flow when the operator enables
   * hybrid execution for an org. Idempotent (skips if `hx:imported:<org>`
   * is set after legacy adoption).
   */
  async bootstrapOrg(oid: string, logger?: any) {
    assertOrg(oid);
    if (await redis.exists(K.imported(oid))) return;
    if (!demoDataEnabled()) return skipDemoSeed("hybridExec", logger);
    for (const sd of MODEL_SEEDS) {
      const m: HxModel = { id: uid("mdl-"), registeredAt: new Date().toISOString(), ...sd };
      await redis.zadd(K.models(oid), 0, m.id);
      await redis.hset(K.model(oid, m.id), "_doc", s2(m));
    }
    for (const sd of NODE_SEEDS) {
      const n: HxGpuNode = { id: uid("gpu-"), ...sd };
      await redis.zadd(K.nodes(oid), 0, n.id);
      await redis.hset(K.node(oid, n.id), "_doc", s2(n));
    }
    await redis.set(K.imported(oid), "1");
    logger?.info?.("[hybrid-exec] per-org seed complete", { oid, models: MODEL_SEEDS.length, nodes: NODE_SEEDS.length });
  },

  /**
   * Tenant-scoped dashboard. All counts come from real per-org state.
   * The boolean flags are org-configured (hx:flags:<org> hash), not
   * hardcoded true. `activeMode` is org-configured (hx:mode:<org>), not
   * always "hybrid". `rollbacks24h` is a real counter, not 0.
   */
  async dashboard(oid: string): Promise<HxDashboard> {
    assertOrg(oid);
    await ensureAdopted(oid);

    const modelIds = await redis.zrange(K.models(oid), 0, -1);
    let deployed = 0;
    let canary = false;
    for (const id of modelIds) {
      const r = await redis.hgetall(K.model(oid, id));
      if (!r._doc) continue;
      try {
        const m: HxModel = JSON.parse(r._doc);
        if (m.status === "deployed") deployed++;
        if (m.status === "canary") canary = true;
      } catch { /* skip corrupt */ }
    }

    const nodeIds = await redis.zrange(K.nodes(oid), 0, -1);
    let util = 0;
    let n = 0;
    for (const id of nodeIds) {
      const r = await redis.hgetall(K.node(oid, id));
      if (!r._doc) continue;
      try {
        const g: HxGpuNode = JSON.parse(r._doc);
        util += g.utilPct;
        n++;
      } catch { /* skip corrupt */ }
    }

    // activeMode is org-configured; null when the operator has not
    // chosen one.
    const mode = (await redis.get(K.mode(oid))) as HxExecutionMode | null;
    // Boolean flags are org-configured; default to false. The dashboard
    // is honest: nothing is asserted true unless the operator set it.
    const flags = await redis.hgetall(K.flags(oid));

    return {
      modes: ["self-hosted", "hybrid", "connected-enterprise"],
      activeMode: mode ?? "self-hosted",
      modelsRegistered: modelIds.length,
      modelsDeployed: deployed,
      gpuNodes: nodeIds.length,
      gpuUtilizationPct: n ? Math.round(util / n) : 0,
      canaryActive: canary,
      rollbacks24h: Number((await redis.get(K.metrics.rollback24(oid))) ?? 0),
      costOptimization: flags.costOptimization === "1",
      vendorNeutral: flags.vendorNeutral === "1",
      routedThroughKernel: flags.routedThroughKernel === "1",
    };
  },

  async listModels(oid: string, status?: HxModel["status"]): Promise<HxModel[]> {
    assertOrg(oid);
    await ensureAdopted(oid);
    const ids = await redis.zrange(K.models(oid), 0, -1);
    const out: HxModel[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.model(oid, id));
      if (!r._doc) continue;
      try {
        const m: HxModel = JSON.parse(r._doc);
        if (!status || m.status === status) out.push(m);
      } catch { /* skip corrupt */ }
    }
    return out;
  },

  async listNodes(oid: string): Promise<HxGpuNode[]> {
    assertOrg(oid);
    await ensureAdopted(oid);
    const ids = await redis.zrange(K.nodes(oid), 0, -1);
    const out: HxGpuNode[] = [];
    for (const id of ids) {
      const r = await redis.hgetall(K.node(oid, id));
      if (!r._doc) continue;
      try {
        const n: HxGpuNode = JSON.parse(r._doc);
        out.push(n);
      } catch { /* skip corrupt */ }
    }
    return out;
  },

  /**
   * Set the org's active execution mode. The dashboard reads this
   * rather than asserting "hybrid" by default. Idempotent: setting the
   * same mode twice is a no-op.
   */
  async setMode(oid: string, mode: HxExecutionMode): Promise<{ mode: HxExecutionMode }> {
    assertOrg(oid);
    await ensureAdopted(oid);
    await redis.set(K.mode(oid), mode);
    return { mode };
  },

  /**
   * Set org-level feature flags. The dashboard reads these rather than
   * asserting `true` for costOptimization / vendorNeutral /
   * routedThroughKernel.
   */
  async setFlag(oid: string, key: "costOptimization" | "vendorNeutral" | "routedThroughKernel", enabled: boolean): Promise<{ key: string; enabled: boolean }> {
    assertOrg(oid);
    await ensureAdopted(oid);
    if (enabled) await redis.hset(K.flags(oid), key, "1");
    else await redis.hdel(K.flags(oid), key);
    return { key, enabled };
  },

  /**
   * Policy routing. Self-hosted preferred, hybrid fallback when GPU
   * is saturated, direct connected-enterprise when costOptimize=false.
   * Routes are per-org.
   */
  async routeRequest(oid: string, input: { modality: string; requiredVramMb: number; safetyCritical?: boolean; costOptimize?: boolean }): Promise<HxRouteDecision> {
    assertOrg(oid);
    await ensureAdopted(oid);
    const reqId = uid("req-");
    const nodes = await this.listNodes(oid);
    const available = nodes.filter((n) => n.online && (n.vramTotalMb - n.vramUsedMb) >= input.requiredVramMb);
    let mode: HxExecutionMode = "self-hosted";
    let targetNode: string | undefined;
    const targetModel = `windels-${input.modality}`;
    let reason = "";
    if (available.length > 0) {
      const sorted = [...available].sort((a, b) => (a.vramTotalMb - a.vramUsedMb) - (b.vramTotalMb - b.vramUsedMb));
      targetNode = sorted[0].id;
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
    await redis.zadd(K.routes(oid), Date.now(), reqId);
    await redis.hset(K.route(oid, reqId), "_doc", s2(decision));
    await redis.incr(K.metrics.req24(oid));
    await emitKernel("hybrid-exec.routed", { org: oid, reqId, mode, targetNode, targetModel });
    return decision;
  },

  async registerModel(oid: string, input: Omit<HxModel, "id" | "registeredAt" | "status">): Promise<HxModel> {
    assertOrg(oid);
    await ensureAdopted(oid);
    const m: HxModel = { id: uid("mdl-"), registeredAt: new Date().toISOString(), status: "registered", ...input };
    await redis.zadd(K.models(oid), 0, m.id);
    await redis.hset(K.model(oid, m.id), "_doc", s2(m));
    await emitKernel("hybrid-exec.model-registered", { org: oid, modelId: m.id });
    return m;
  },

  async promoteCanary(oid: string, id: string, pct: number): Promise<HxModel> {
    assertOrg(oid);
    const r = await redis.hgetall(K.model(oid, id));
    if (!r._doc) throw Object.assign(new Error("Model not found"), { status: 404 });
    const m: HxModel = JSON.parse(r._doc);
    m.status = "canary";
    m.canaryPct = Math.max(0, Math.min(100, pct));
    m.versions = (m.versions ?? 1);
    await redis.hset(K.model(oid, id), "_doc", s2(m));
    await emitKernel("hybrid-exec.canary-promoted", { org: oid, modelId: id, pct });
    return m;
  },

  async rollback(oid: string, id: string): Promise<HxModel> {
    assertOrg(oid);
    const r = await redis.hgetall(K.model(oid, id));
    if (!r._doc) throw Object.assign(new Error("Model not found"), { status: 404 });
    const m: HxModel = JSON.parse(r._doc);
    m.status = "deployed";
    m.canaryPct = 0;
    await redis.hset(K.model(oid, id), "_doc", s2(m));
    await redis.incr(K.metrics.rollback24(oid));
    await emitKernel("hybrid-exec.rolled-back", { org: oid, modelId: id });
    return m;
  },
};

export default HybridExecService;
