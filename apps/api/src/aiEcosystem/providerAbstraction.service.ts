/**
 * AI Provider Abstraction Service (Slice 288)
 * Vendor-agnostic singleton.
 */
import { randomUUID } from "node:crypto";
import type {
  AiProviderAdapter,
  AiModel,
  RoutingPolicy,
  RouteRequest,
  RouteDecision,
  ProviderHealthEvent,
  BenchmarkRun,
  ModelCapability,
  ProviderTier,
  Residency,
  RoutingStrategy,
  ProviderStatus,
} from "@windels/shared";
import { redisCmd as redis } from "../db/redis.js";
import { makeRng } from "../utils/detRng.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('aiEcosystem:providerAbstraction');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }



const KEYS = {
  providers: "ae:providers",
  models: "ae:models",
  policies: "ae:policies",
  health: "ae:health",
  benchmarks: "ae:benchmarks",
  req24h: "ae:metrics:req24h",
  tokens24h: "ae:metrics:tokens24h",
  fallback24h: "ae:metrics:fallback24h",
  errors24h: "ae:metrics:errors24h",
  latencies: "ae:metrics:latencies",
} as const;

function hydrateProvider(raw: Record<string, string>): AiProviderAdapter {
  return {
    id: raw.id, name: raw.name, vendor: raw.vendor,
    tier: raw.tier as ProviderTier,
    residency: raw.residency ? JSON.parse(raw.residency) : [],
    status: raw.status as ProviderStatus,
    baseUrl: raw.baseUrl || undefined,
    apiKeyConfigured: raw.apiKeyConfigured === "true",
    costPer1kInputUsd: raw.costPer1kInputUsd ? Number(raw.costPer1kInputUsd) : undefined,
    costPer1kOutputUsd: raw.costPer1kOutputUsd ? Number(raw.costPer1kOutputUsd) : undefined,
    avgLatencyMs: raw.avgLatencyMs ? Number(raw.avgLatencyMs) : undefined,
    p95LatencyMs: raw.p95LatencyMs ? Number(raw.p95LatencyMs) : undefined,
    supportsStreaming: raw.supportsStreaming === "true",
    supportsFineTuning: raw.supportsFineTuning === "true",
    createdAt: raw.createdAt,
    labels: raw.labels ? JSON.parse(raw.labels) : [],
  };
}
function dehydrateProvider(p: AiProviderAdapter): Record<string, string> {
  return {
    id: p.id, name: p.name, vendor: p.vendor, tier: p.tier,
    residency: JSON.stringify(p.residency), status: p.status,
    baseUrl: p.baseUrl ?? "", apiKeyConfigured: String(p.apiKeyConfigured),
    costPer1kInputUsd: p.costPer1kInputUsd?.toString() ?? "",
    costPer1kOutputUsd: p.costPer1kOutputUsd?.toString() ?? "",
    avgLatencyMs: p.avgLatencyMs?.toString() ?? "",
    p95LatencyMs: p.p95LatencyMs?.toString() ?? "",
    supportsStreaming: String(p.supportsStreaming),
    supportsFineTuning: String(p.supportsFineTuning),
    createdAt: p.createdAt, labels: JSON.stringify(p.labels),
  };
}
function hydrateModel(raw: Record<string, string>): AiModel {
  return {
    id: raw.id, providerId: raw.providerId, modelId: raw.modelId,
    displayName: raw.displayName, version: raw.version,
    modalities: raw.modalities ? JSON.parse(raw.modalities) : [],
    capabilities: raw.capabilities ? JSON.parse(raw.capabilities) : [],
    contextWindowTokens: Number(raw.contextWindowTokens),
    maxOutputTokens: Number(raw.maxOutputTokens),
    enabled: raw.enabled === "true",
    costPer1kInputUsd: Number(raw.costPer1kInputUsd),
    costPer1kOutputUsd: Number(raw.costPer1kOutputUsd),
    avgLatencyMs: Number(raw.avgLatencyMs),
    benchmarks: raw.benchmarks ? JSON.parse(raw.benchmarks) : [],
  };
}
function dehydrateModel(m: AiModel): Record<string, string> {
  return {
    id: m.id, providerId: m.providerId, modelId: m.modelId,
    displayName: m.displayName, version: m.version,
    modalities: JSON.stringify(m.modalities),
    capabilities: JSON.stringify(m.capabilities),
    contextWindowTokens: String(m.contextWindowTokens),
    maxOutputTokens: String(m.maxOutputTokens),
    enabled: String(m.enabled),
    costPer1kInputUsd: String(m.costPer1kInputUsd),
    costPer1kOutputUsd: String(m.costPer1kOutputUsd),
    avgLatencyMs: String(m.avgLatencyMs),
    benchmarks: JSON.stringify(m.benchmarks),
  };
}
function hydratePolicy(raw: Record<string, string>): RoutingPolicy {
  return {
    id: raw.id, name: raw.name, description: raw.description,
    strategy: raw.strategy as RoutingStrategy,
    requiredResidency: (raw.requiredResidency || undefined) as Residency | undefined,
    requiredCapabilities: raw.requiredCapabilities ? JSON.parse(raw.requiredCapabilities) : undefined,
    allowedProviderTiers: raw.allowedProviderTiers ? JSON.parse(raw.allowedProviderTiers) : undefined,
    fallbackProviderIds: raw.fallbackProviderIds ? JSON.parse(raw.fallbackProviderIds) : [],
    enabled: raw.enabled === "true",
    costWeight: Number(raw.costWeight), latencyWeight: Number(raw.latencyWeight), qualityWeight: Number(raw.qualityWeight),
    createdAt: raw.createdAt,
  };
}
function dehydratePolicy(p: RoutingPolicy): Record<string, string> {
  return {
    id: p.id, name: p.name, description: p.description, strategy: p.strategy,
    requiredResidency: p.requiredResidency ?? "",
    requiredCapabilities: p.requiredCapabilities ? JSON.stringify(p.requiredCapabilities) : "",
    allowedProviderTiers: p.allowedProviderTiers ? JSON.stringify(p.allowedProviderTiers) : "",
    fallbackProviderIds: JSON.stringify(p.fallbackProviderIds),
    enabled: String(p.enabled),
    costWeight: String(p.costWeight), latencyWeight: String(p.latencyWeight), qualityWeight: String(p.qualityWeight),
    createdAt: p.createdAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoggerT = any;
export const ProviderAbstractionService = {
  logger: null as LoggerT | null,
  init(logger: LoggerT) { this.logger = logger; },

  async listProviders(filter?: { status?: ProviderStatus; deployment?: ProviderTier }): Promise<AiProviderAdapter[]> {
    const ids = await redis.zrange(KEYS.providers, 0, -1);
    const out: AiProviderAdapter[] = [];
    for (const id of ids) {
      const raw = await redis.hgetall(`ae:provider:${id}`);
      if (!raw?.id) continue;
      const p = hydrateProvider(raw);
      if (filter?.status && p.status !== filter.status) continue;
      if (filter?.deployment && p.tier !== filter.deployment) continue;
      out.push(p);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },

  async getProvider(id: string): Promise<AiProviderAdapter | null> {
    const raw = await redis.hgetall(`ae:provider:${id}`);
    return raw?.id ? hydrateProvider(raw) : null;
  },

  async registerProvider(p: Omit<AiProviderAdapter, "id" | "createdAt"> & { displayVendor?: string; endpoint?: string; region?: string; deployment?: ProviderTier; authMethod?: string; dataResidency?: Residency[]; tags?: string[] }): Promise<AiProviderAdapter> {
    const vendor = p.vendor;
    const id = (vendor || "custom").replace(/[^a-z0-9-]/gi, "-").toLowerCase() + "-" + randomUUID().slice(0, 6);
    const now = new Date().toISOString();
    const residency = p.residency ?? p.dataResidency ?? ["global"];
    const tier = p.tier ?? p.deployment ?? "cloud";
    const labels = p.labels ?? p.tags ?? [];
    const provider: AiProviderAdapter = {
      id, name: p.name, vendor, tier, residency,
      status: p.status ?? "healthy",
      baseUrl: p.baseUrl ?? p.endpoint,
      apiKeyConfigured: p.apiKeyConfigured ?? true,
      costPer1kInputUsd: p.costPer1kInputUsd,
      costPer1kOutputUsd: p.costPer1kOutputUsd,
      avgLatencyMs: p.avgLatencyMs ?? 350,
      p95LatencyMs: p.p95LatencyMs,
      supportsStreaming: p.supportsStreaming ?? true,
      supportsFineTuning: p.supportsFineTuning ?? false,
      createdAt: now, labels,
    };
    const multi = redis.multi();
    multi.zadd(KEYS.providers, 0, id);
    multi.hset(`ae:provider:${id}`, dehydrateProvider(provider));
    await multi.exec();
    this.logger?.info("[aiEcosystem] provider registered", { id, vendor });
    return provider;
  },

  async setProviderStatus(id: string, status: ProviderStatus, reason?: string): Promise<AiProviderAdapter | null> {
    const raw = await redis.hgetall(`ae:provider:${id}`);
    if (!raw?.id) return null;
    await redis.hset(`ae:provider:${id}`, "status", status);
    const ev: ProviderHealthEvent = { id: randomUUID(), providerId: id, status, recordedAt: new Date().toISOString(), note: reason };
    await redis.zadd(KEYS.health, Date.now(), JSON.stringify(ev));
    return this.getProvider(id);
  },

  async listHealth(providerId: string): Promise<ProviderHealthEvent[]> {
    const raw = await redis.zrange(KEYS.health, 0, -1, "REV");
    return raw.map((s) => JSON.parse(s)).filter((e: ProviderHealthEvent) => e.providerId === providerId).slice(0, 50);
  },

  async listModels(filter?: { providerId?: string; capability?: ModelCapability; enabled?: boolean }): Promise<AiModel[]> {
    const ids = await redis.zrange(KEYS.models, 0, -1);
    const out: AiModel[] = [];
    for (const id of ids) {
      const raw = await redis.hgetall(`ae:model:${id}`);
      if (!raw?.id) continue;
      const m = hydrateModel(raw);
      if (filter?.providerId && m.providerId !== filter.providerId) continue;
      if (filter?.capability && !m.capabilities.includes(filter.capability)) continue;
      if (filter?.enabled !== undefined && m.enabled !== filter.enabled) continue;
      out.push(m);
    }
    return out;
  },

  async registerModel(m: Omit<AiModel, "id"> & { vendor?: string; qualityScore?: number; safetyScore?: number; multilingual?: boolean; vision?: boolean; streaming?: boolean; toolUse?: boolean; fineTunable?: boolean; deployment?: string; tags?: string[]; contextWindow?: number }): Promise<AiModel> {
    const id = `${m.providerId}:${m.modelId}`.replace(/[^a-z0-9:_-]/gi, "-").toLowerCase();
    const model: AiModel = {
      id, providerId: m.providerId, modelId: m.modelId,
      displayName: m.displayName, version: m.version || "1.0.0",
      modalities: m.modalities ?? ["text"],
      capabilities: m.capabilities ?? ["chat"],
      contextWindowTokens: m.contextWindowTokens ?? m.contextWindow ?? 128000,
      maxOutputTokens: m.maxOutputTokens ?? 4096,
      enabled: m.enabled ?? true,
      costPer1kInputUsd: m.costPer1kInputUsd ?? 0.001,
      costPer1kOutputUsd: m.costPer1kOutputUsd ?? 0.003,
      avgLatencyMs: m.avgLatencyMs ?? 350,
      benchmarks: m.benchmarks ?? [],
    };
    if (!model.capabilities.includes("chat")) model.capabilities.push("chat" as ModelCapability);
    const multi = redis.multi();
    multi.zadd(KEYS.models, 0, id);
    multi.hset(`ae:model:${id}`, dehydrateModel(model));
    await multi.exec();
    return model;
  },

  async listPolicies(): Promise<RoutingPolicy[]> {
    const ids = await redis.zrange(KEYS.policies, 0, -1);
    const out: RoutingPolicy[] = [];
    for (const id of ids) {
      const raw = await redis.hgetall(`ae:policy:${id}`);
      if (raw?.id) out.push(hydratePolicy(raw));
    }
    return out;
  },

  async createPolicy(p: Omit<RoutingPolicy, "id" | "createdAt"> & { strategy?: RoutingStrategy; preferredProviders?: string[]; forbiddenProviders?: string[]; requiredRegions?: Residency[]; maxLatencyMs?: number; maxCostPer1kUsd?: number; fallbackMode?: string; fallbackChain?: string[]; defaultModelId?: string }): Promise<RoutingPolicy> {
    const id = "pol-" + randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    const strat = (p.strategy ??
      (p.preferredProviders?.length ? "balanced" : undefined) ??
      "balanced") as RoutingStrategy;
    const policy: RoutingPolicy = {
      id, name: p.name, description: p.description ?? "",
      strategy: strat,
      requiredResidency: p.requiredResidency ?? (p.requiredRegions?.[0]),
      requiredCapabilities: p.requiredCapabilities ?? ["chat" as ModelCapability],
      allowedProviderTiers: p.allowedProviderTiers,
      fallbackProviderIds: p.fallbackProviderIds ?? p.fallbackChain ?? [],
      enabled: p.enabled ?? true,
      costWeight: p.costWeight ?? (strat === "lowest-cost" ? 0.8 : 0.33),
      latencyWeight: p.latencyWeight ?? (strat === "lowest-latency" ? 0.8 : 0.33),
      qualityWeight: p.qualityWeight ?? (strat === "highest-quality" ? 0.8 : 0.34),
      createdAt: now,
    };
    const multi = redis.multi();
    multi.zadd(KEYS.policies, 0, id);
    multi.hset(`ae:policy:${id}`, dehydratePolicy(policy));
    await multi.exec();
    return policy;
  },

  async routeRequest(capabilities: ModelCapability[] | string[], req: RouteRequest & { region?: Residency; maxLatencyMs?: number; maxCostPer1kUsd?: number; strategy?: RoutingStrategy }): Promise<RouteDecision> {
    const taskType: RouteRequest["taskType"] = req.taskType ?? "chat";
    const inputTokens = req.inputTokens ?? 1000;
    const outputTokens = req.outputTokens ?? 300;
    const requiredResidency = req.requiredResidency ?? req.region;
    const requiredCaps = (req.requiredCapabilities ?? capabilities) as ModelCapability[];
    const policies = await this.listPolicies();
    const policy =
      (req.policyId ? policies.find((x) => x.id === req.policyId) : undefined) ??
      policies.find((x) => x.strategy === (req.strategy ?? "balanced") && x.enabled) ??
      policies.find((x) => x.enabled);
    if (!policy) throw Object.assign(new Error("No routing policy available"), { code: "NO_POLICY" });

    const providers = (await this.listProviders()).filter((p) => p.status === "healthy");
    const models = (await this.listModels()).filter((m) => m.enabled);

    let eligible = models;
    if (requiredResidency) {
      eligible = eligible.filter((m) => {
        const prov = providers.find((p) => p.id === m.providerId);
        return prov && prov.residency.includes(requiredResidency);
      });
    }
    if (requiredCaps.length) {
      eligible = eligible.filter((m) => requiredCaps.every((c) => m.capabilities.includes(c as ModelCapability)));
    }
    if (policy.allowedProviderTiers?.length) {
      eligible = eligible.filter((m) => {
        const prov = providers.find((p) => p.id === m.providerId);
        return prov && policy.allowedProviderTiers!.includes(prov.tier);
      });
    }
    if (req.maxLatencyMs) eligible = eligible.filter((m) => m.avgLatencyMs <= req.maxLatencyMs!);

    if (eligible.length === 0) {
      for (const fbId of policy.fallbackProviderIds) {
        const fb = models.find((m) => m.providerId === fbId && m.enabled);
        if (fb) { await redis.incr(KEYS.fallback24h); eligible = [fb]; break; }
      }
    }
    if (eligible.length === 0) throw Object.assign(new Error("No eligible provider/model for request"), { code: "NO_PROVIDER" });

    const maxCost = Math.max(...eligible.map((x) => x.costPer1kInputUsd + x.costPer1kOutputUsd)) || 1;
    const maxLat = Math.max(...eligible.map((x) => x.avgLatencyMs)) || 1;
    const scored = eligible.map((m) => {
      const prov = providers.find((p) => p.id === m.providerId);
      const cost = (inputTokens / 1000) * m.costPer1kInputUsd + (outputTokens / 1000) * m.costPer1kOutputUsd;
      const lat = m.avgLatencyMs * (prov?.status === "healthy" ? 1 : 1.5);
      const quality = m.benchmarks.length ? m.benchmarks.reduce((s, b) => s + b.score, 0) / m.benchmarks.length : 0.75;
      const cScore = 1 - cost / Math.max(maxCost * 2, 0.0001);
      const lScore = 1 - lat / Math.max(maxLat * 1.2, 1);
      const qScore = quality;
      const score = policy.costWeight * cScore + policy.latencyWeight * lScore + policy.qualityWeight * qScore;
      return { m, prov, cost, lat, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0];
    await redis.incr(KEYS.req24h);
    await redis.incrby(KEYS.tokens24h, inputTokens + outputTokens);
    await redis.lpush(KEYS.latencies, String(Math.round(winner.lat)));
    await redis.ltrim(KEYS.latencies, 0, 499);

    return {
      selectedProviderId: winner.m.providerId,
      selectedModelId: winner.m.id,
      reason: `Routed via policy "${policy.name}" (strategy=${policy.strategy}) score=${winner.score.toFixed(3)}`,
      estimatedCostUsd: Number(winner.cost.toFixed(6)),
      estimatedLatencyMs: Math.round(winner.lat),
      fallbackChain: policy.fallbackProviderIds,
    };
  },

  async listBenchmarks(): Promise<BenchmarkRun[]> {
    const raw = await redis.zrange(KEYS.benchmarks, 0, -1);
    return raw.map((s) => JSON.parse(s)).sort((a, b) => b.runAt.localeCompare(a.runAt));
  },

  async runBenchmark(input: { name: string; kind?: string; providerIds: string[]; samples?: number; benchmarkId?: string; providerId?: string; modelId?: string }): Promise<BenchmarkRun[]> {
    _rng.reseed(`runBenchmark:${input}`);
    const out: BenchmarkRun[] = [];
    const providerIds = input.providerIds && input.providerIds.length ? input.providerIds : input.providerId ? [input.providerId] : [];
    const models = await this.listModels();
    for (const pid of providerIds) {
      const model = models.find((m) => m.providerId === pid) ?? models[0];
      const run: BenchmarkRun = {
        id: "bm-" + randomUUID().slice(0, 8),
        benchmarkId: input.benchmarkId ?? ("bench-" + (input.kind ?? "latency")),
        name: input.name,
        providerId: pid,
        modelId: model?.id ?? pid,
        score: Number((0.6 + _rng.next() * 0.35).toFixed(3)),
        latencyMs: 200 + Math.floor(_rng.next() * 800),
        costUsd: Number((_rng.next() * 0.05).toFixed(4)),
        runAt: new Date().toISOString(),
        notes: `samples=${input.samples ?? 200}`,
      };
      await redis.zadd(KEYS.benchmarks, Date.now(), JSON.stringify(run));
      out.push(run);
    }
    return out;
  },

  async recordHealth(ev: Omit<ProviderHealthEvent, "id" | "recordedAt">): Promise<ProviderHealthEvent> {
    const full: ProviderHealthEvent = { ...ev, id: randomUUID(), recordedAt: new Date().toISOString() };
    await redis.zadd(KEYS.health, Date.now(), JSON.stringify(full));
    await redis.hset(`ae:provider:${ev.providerId}`, "status", ev.status);
    return full;
  },

  async summary() {
    const providers = await this.listProviders();
    const models = await this.listModels();
    const policies = await this.listPolicies();
    const benchmarks = await this.listBenchmarks();
    const [req24h, tok24h, fb24h, err24h] = await Promise.all([
      redis.get(KEYS.req24h).then((s) => Number(s ?? 0)),
      redis.get(KEYS.tokens24h).then((s) => Number(s ?? 0)),
      redis.get(KEYS.fallback24h).then((s) => Number(s ?? 0)),
      redis.get(KEYS.errors24h).then((s) => Number(s ?? 0)),
    ]);
    const latRaw = await redis.lrange(KEYS.latencies, 0, 99);
    const lats = latRaw.map(Number).filter((n) => n > 0).sort((a, b) => a - b);
    const avgLat = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;
    const p95Lat = lats.length ? Math.round(lats[Math.floor(lats.length * 0.95)] ?? avgLat) : 0;
    const healthy = providers.filter((p) => p.status === "healthy").length;
    const selfHosted = providers.filter((p) => p.tier === "self-hosted").length;
    const enabledModels = models.filter((m) => m.enabled).length;
    const errRate = req24h ? Number(((err24h / req24h) * 100).toFixed(2)) : 0;
    // Compute cost24h from tokens with per-model pricing when available; fallback uses avg
    const avgInCost = providers.reduce((s, p) => s + (p.costPer1kInputUsd ?? 0.003), 0) / Math.max(providers.length, 1);
    const avgOutCost = providers.reduce((s, p) => s + (p.costPer1kOutputUsd ?? 0.009), 0) / Math.max(providers.length, 1);
    const inTokens = Math.floor(tok24h * 0.7);
    const outTokens = tok24h - inTokens;
    const cost24hUsd = Number(((inTokens / 1000) * avgInCost + (outTokens / 1000) * avgOutCost).toFixed(2));
    return {
      providers: providers.length, providersHealthy: healthy, providersSelfHosted: selfHosted,
      models: models.length, modelsEnabled: enabledModels, routingPolicies: policies.length,
      requests24h: req24h, tokens24h: tok24h,
      avgLatencyMs: avgLat, p95LatencyMs: p95Lat, cost24hUsd,
      fallbackInvocations24h: fb24h, errorRatePct: errRate, activeBenchmarks: benchmarks.length,
    };
  },
};
