/**
 * Session 200 — AI Provider Abstraction routing tests (first dedicated suite).
 *
 * aiEcosystem shipped with no tests, yet providerAbstraction owns the
 * vendor-agnostic routing engine: it filters models by residency / capability /
 * tier / latency, scores the survivors by a cost/latency/quality-weighted
 * strategy, and falls back through a policy chain. This suite exercises the
 * real singleton against the shared in-memory Redis fake.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { ProviderAbstractionService: PA } = await import("./providerAbstraction.service.js");

beforeEach(() => { kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear(); });

async function provider(over: Record<string, any> = {}) {
  return PA.registerProvider({
    name: over.name ?? "Prov", vendor: over.vendor ?? "acme", tier: over.tier ?? "cloud",
    residency: over.residency ?? ["global"], status: over.status ?? "healthy",
    apiKeyConfigured: true, supportsStreaming: true, supportsFineTuning: false, labels: [],
    ...over,
  } as any);
}
async function model(providerId: string, over: Record<string, any> = {}) {
  return PA.registerModel({
    providerId, modelId: over.modelId ?? "m1", displayName: over.displayName ?? "Model 1",
    version: "1.0.0", modalities: ["text"], capabilities: over.capabilities ?? ["chat"],
    contextWindowTokens: 128000, maxOutputTokens: 4096, enabled: over.enabled ?? true,
    costPer1kInputUsd: over.costPer1kInputUsd ?? 0.001, costPer1kOutputUsd: over.costPer1kOutputUsd ?? 0.003,
    avgLatencyMs: over.avgLatencyMs ?? 350, benchmarks: over.benchmarks ?? [],
    ...over,
  } as any);
}
async function policy(over: Record<string, any> = {}) {
  return PA.createPolicy({ name: over.name ?? "P", strategy: over.strategy ?? "balanced", ...over } as any);
}

describe("registration round-trips", () => {
  it("registers and lists a provider with defaults applied", async () => {
    const p = await provider({ vendor: "openai" });
    expect(p.id).toContain("openai");
    expect(p.tier).toBe("cloud");
    const list = await PA.listProviders();
    expect(list.map((x) => x.id)).toContain(p.id);
    expect(await PA.getProvider(p.id)).toMatchObject({ id: p.id, vendor: "openai" });
  });

  it("registers a model and forces the chat capability", async () => {
    const p = await provider();
    const m = await model(p.id, { capabilities: ["vision"] });
    expect(m.capabilities).toContain("chat"); // always ensured
    expect(m.capabilities).toContain("vision");
    expect((await PA.listModels({ providerId: p.id })).length).toBe(1);
  });

  it("filters models by capability and enabled flag", async () => {
    const p = await provider();
    await model(p.id, { modelId: "a", capabilities: ["chat", "vision"] });
    await model(p.id, { modelId: "b", capabilities: ["chat"], enabled: false });
    expect((await PA.listModels({ capability: "vision" })).length).toBe(1);
    expect((await PA.listModels({ enabled: false })).length).toBe(1);
  });
});

describe("provider status & health", () => {
  it("records a status change with a health event", async () => {
    const p = await provider();
    const updated = await PA.setProviderStatus(p.id, "degraded", "elevated latency");
    expect(updated?.status).toBe("degraded");
    const health = await PA.listHealth(p.id);
    expect(health[0]).toMatchObject({ providerId: p.id, status: "degraded" });
  });
  it("returns null for an unknown provider status change", async () => {
    expect(await PA.setProviderStatus("ghost", "healthy")).toBeNull();
  });
});

describe("routeRequest — the routing engine", () => {
  it("throws NO_POLICY when no policy exists", async () => {
    const p = await provider();
    await model(p.id);
    await expect(PA.routeRequest(["chat"], {} as any)).rejects.toMatchObject({ code: "NO_POLICY" });
  });

  it("throws NO_PROVIDER when nothing satisfies the request", async () => {
    await policy();
    // No models registered at all.
    await expect(PA.routeRequest(["chat"], {} as any)).rejects.toMatchObject({ code: "NO_PROVIDER" });
  });

  it("lowest-cost strategy prefers the cheaper model", async () => {
    await policy({ name: "cheap", strategy: "lowest-cost" });
    const p = await provider();
    const cheap = await model(p.id, { modelId: "cheap", costPer1kInputUsd: 0.0005, costPer1kOutputUsd: 0.001, avgLatencyMs: 500 });
    await model(p.id, { modelId: "premium", costPer1kInputUsd: 0.02, costPer1kOutputUsd: 0.06, avgLatencyMs: 200 });
    const decision = await PA.routeRequest(["chat"], { strategy: "lowest-cost" } as any);
    expect(decision.selectedModelId).toBe(cheap.id);
    expect(decision.reason).toContain("lowest-cost");
  });

  it("lowest-latency strategy prefers the faster model", async () => {
    await policy({ name: "fast", strategy: "lowest-latency" });
    const p = await provider();
    await model(p.id, { modelId: "slow", avgLatencyMs: 900 });
    const fast = await model(p.id, { modelId: "fast", avgLatencyMs: 120 });
    const decision = await PA.routeRequest(["chat"], { strategy: "lowest-latency" } as any);
    expect(decision.selectedModelId).toBe(fast.id);
  });

  it("highest-quality strategy prefers the better-benchmarked model", async () => {
    await policy({ name: "quality", strategy: "highest-quality" });
    const p = await provider();
    await model(p.id, { modelId: "meh", benchmarks: [{ name: "mmlu", score: 0.4 }] });
    const great = await model(p.id, { modelId: "great", benchmarks: [{ name: "mmlu", score: 0.95 }] });
    const decision = await PA.routeRequest(["chat"], { strategy: "highest-quality" } as any);
    expect(decision.selectedModelId).toBe(great.id);
  });

  it("filters by required residency (only same-region providers survive)", async () => {
    await policy();
    const eu = await provider({ vendor: "eu", residency: ["eu"] });
    const us = await provider({ vendor: "us", residency: ["us"] });
    await model(eu.id, { modelId: "eu-m" });
    const usModel = await model(us.id, { modelId: "us-m" });
    const decision = await PA.routeRequest(["chat"], { requiredResidency: "us" } as any);
    expect(decision.selectedModelId).toBe(usModel.id);
  });

  it("filters by required capability", async () => {
    await policy();
    const p = await provider();
    await model(p.id, { modelId: "text-only", capabilities: ["chat"] });
    const visionM = await model(p.id, { modelId: "vision-m", capabilities: ["chat", "vision"] });
    const decision = await PA.routeRequest(["vision"], { requiredCapabilities: ["vision"] } as any);
    expect(decision.selectedModelId).toBe(visionM.id);
  });

  it("excludes an unhealthy provider's models from eligibility", async () => {
    await policy();
    const bad = await provider({ vendor: "bad" });
    const good = await provider({ vendor: "good" });
    await model(bad.id, { modelId: "bad-m" });
    const goodModel = await model(good.id, { modelId: "good-m" });
    await PA.setProviderStatus(bad.id, "down");
    const decision = await PA.routeRequest(["chat"], {} as any);
    expect(decision.selectedModelId).toBe(goodModel.id);
  });

  it("drops models over the max latency budget", async () => {
    await policy();
    const p = await provider();
    await model(p.id, { modelId: "slow", avgLatencyMs: 2000 });
    const fast = await model(p.id, { modelId: "fast", avgLatencyMs: 200 });
    const decision = await PA.routeRequest(["chat"], { maxLatencyMs: 500 } as any);
    expect(decision.selectedModelId).toBe(fast.id);
  });

  it("uses the policy fallback chain when no model is eligible", async () => {
    const fb = await provider({ vendor: "fallback" });
    const fbModel = await model(fb.id, { modelId: "fb" });
    await policy({ name: "resid", fallbackProviderIds: [fb.id] });
    // Require a residency no provider offers → primary filter empties, fallback kicks in.
    const decision = await PA.routeRequest(["chat"], { requiredResidency: "antarctica" } as any);
    expect(decision.selectedModelId).toBe(fbModel.id);
  });

  it("estimates cost from the requested token counts", async () => {
    await policy({ strategy: "balanced" });
    const p = await provider();
    await model(p.id, { modelId: "m", costPer1kInputUsd: 0.01, costPer1kOutputUsd: 0.03 });
    const decision = await PA.routeRequest(["chat"], { inputTokens: 1000, outputTokens: 1000 } as any);
    // 1k input * 0.01 + 1k output * 0.03 = 0.04
    expect(decision.estimatedCostUsd).toBeCloseTo(0.04, 5);
  });
});
