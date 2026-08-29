/**
 * Session 200 — Self-Hosted AI Infrastructure tests (first dedicated suite).
 *
 * The selfHosted module shipped with no tests. It manages GPU nodes, model
 * registration/loading (with VRAM accounting), inference bookkeeping and the
 * dashboard rollup. This suite exercises the real singleton against the shared
 * in-memory Redis fake (multi/zadd/incr/lpush all supported):
 *   - node register/list/status
 *   - model register (idempotent by derived id) + list
 *   - loadModel places on a capable online node and books VRAM; null when none
 *   - runInference computes token counts, records a measured latency, errors on
 *     unknown model / no online node
 *   - vector store register/list
 *   - summary aggregates VRAM/online/latency, HA cluster & airgap detection
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { SelfHostedService: SH } = await import("./selfHosted.service.js");

function nodeInput(over: Partial<any> = {}) {
  return {
    name: "gpu-1", kind: "gpu-server" as const, status: "online" as const,
    hostname: "gpu1.local", region: "us-east", gpuCount: 1, gpuType: "A100",
    vramGb: 80, vramUsedGb: 0, cpuCores: 32, ramGb: 256,
    utilizationPct: 10, temperatureC: 45, powerW: 300, tags: [] as string[],
    ...over,
  };
}
function modelInput(over: Partial<any> = {}) {
  return {
    name: "Llama", version: "3.1", format: "gguf" as const, origin: "local" as const,
    backend: "llama.cpp" as const, sizeGb: 40, contextWindow: 8192, quant: "Q4_K_M",
    ...over,
  };
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.lists.clear(); kv.sets.clear(); kv.zsets.clear();
});

describe("nodes", () => {
  it("registers, lists and updates node status/utilization", async () => {
    const n = await SH.registerNode(nodeInput());
    expect(n.id).toMatch(/^node-/);
    expect((await SH.listNodes()).map((x) => x.id)).toContain(n.id);
    const updated = await SH.setNodeStatus(n.id, "draining", 55);
    expect(updated?.status).toBe("draining");
    expect(updated?.utilizationPct).toBe(55);
    expect(await SH.setNodeStatus("nope", "offline")).toBeNull();
  });
});

describe("models", () => {
  it("registers a model with a derived id and is idempotent on re-register", async () => {
    const m1 = await SH.registerModel(modelInput());
    expect(m1.id).toBe("mdl-llama-31");
    expect(m1.state).toBe("ready");
    expect(m1.capabilities).toContain("chat");
    const m2 = await SH.registerModel(modelInput());
    expect(m2.id).toBe(m1.id);
    expect((await SH.listModels()).filter((m) => m.id === m1.id)).toHaveLength(1);
  });
});

describe("loadModel — placement & VRAM accounting", () => {
  it("loads onto a capable online node and books its VRAM", async () => {
    const node = await SH.registerNode(nodeInput({ vramGb: 80, vramUsedGb: 0 }));
    const model = await SH.registerModel(modelInput({ sizeGb: 40 }));
    const loaded = await SH.loadModel(model.id);
    expect(loaded?.state).toBe("loaded");
    expect(loaded?.loadedOnNodeId).toBe(node.id);
    const after = (await SH.listNodes()).find((n) => n.id === node.id);
    expect(after?.vramUsedGb).toBe(40);
  });

  it("returns null when no node has enough free VRAM", async () => {
    await SH.registerNode(nodeInput({ vramGb: 24, vramUsedGb: 20, status: "online" }));
    const model = await SH.registerModel(modelInput({ sizeGb: 40 }));
    expect(await SH.loadModel(model.id)).toBeNull();
  });

  it("returns null for an unknown model id", async () => {
    await SH.registerNode(nodeInput());
    expect(await SH.loadModel("mdl-missing")).toBeNull();
  });
});

describe("runInference — bookkeeping", () => {
  it("computes token counts and records a measured latency", async () => {
    await SH.registerNode(nodeInput());
    const model = await SH.registerModel(modelInput({ contextWindow: 8192 }));
    const prompt = "x".repeat(400); // 400/4 = 100 input tokens
    const job = await SH.runInference({ modelId: model.id, prompt, maxTokens: 128 });
    expect(job.status).toBe("completed");
    expect(job.inputTokens).toBe(100);
    expect(job.outputTokens).toBe(128);
    expect(job.latencyMs).toBeGreaterThanOrEqual(0);
    expect((await SH.listJobs()).map((j) => j.id)).toContain(job.id);
  });

  it("honors an explicitly provided (measured) latency", async () => {
    await SH.registerNode(nodeInput());
    const model = await SH.registerModel(modelInput());
    const job = await SH.runInference({ modelId: model.id, prompt: "hi", latencyMs: 1234 });
    expect(job.latencyMs).toBe(1234);
  });

  it("errors on an unknown model or when no node is online", async () => {
    await expect(SH.runInference({ modelId: "mdl-missing", prompt: "hi" })).rejects.toThrow(/model not found/);
    await SH.registerNode(nodeInput({ status: "offline" }));
    const model = await SH.registerModel(modelInput());
    await expect(SH.runInference({ modelId: model.id, prompt: "hi" })).rejects.toThrow(/no online node/);
  });
});

describe("vector stores", () => {
  it("registers and lists vector stores", async () => {
    const v = await SH.registerVectorStore({
      name: "kb", backend: "qdrant", status: "online", dimensions: 1536, vectorCount: 0, sizeGb: 1, airgapped: false,
    });
    expect(v.id).toMatch(/^vec-/);
    expect((await SH.listVectorStores()).map((x) => x.id)).toContain(v.id);
  });
});

describe("summary dashboard", () => {
  it("aggregates VRAM, online nodes, HA cluster and airgap flags", async () => {
    await SH.registerNode(nodeInput({ name: "a", vramGb: 80, vramUsedGb: 40, status: "online", utilizationPct: 50 }));
    await SH.registerNode(nodeInput({ name: "b", vramGb: 40, vramUsedGb: 0, status: "online", utilizationPct: 10, tags: ["airgap"] }));
    await SH.registerNode(nodeInput({ name: "c", vramGb: 24, vramUsedGb: 0, status: "offline", kind: "edge-node" }));
    const model = await SH.registerModel(modelInput());
    await SH.loadModel(model.id);
    await SH.runInference({ modelId: model.id, prompt: "hello there", latencyMs: 200 });

    const d = await SH.summary();
    expect(d.nodes).toBe(3);
    expect(d.nodesOnline).toBe(2);
    expect(d.aggregateVramGb).toBe(80 + 40 + 24);
    expect(d.models).toBe(1);
    expect(d.modelsLoaded).toBe(1);
    expect(d.inferenceJobs24h).toBe(1);
    expect(d.avgInferenceLatencyMs).toBe(200);
    expect(d.haClusterHealthy).toBe(true);   // >=2 online
    expect(d.airgapMode).toBe(true);         // a node is tagged airgap
    expect(d.edgeNodes).toBe(1);
    expect(d.gpuUtilizationPct).toBe(30);    // (50 + 10) / 2
  });

  it("reports an honest empty dashboard with no infra", async () => {
    const d = await SH.summary();
    expect(d.nodes).toBe(0);
    expect(d.nodesOnline).toBe(0);
    expect(d.aggregateVramGb).toBe(0);
    expect(d.inferenceJobs24h).toBe(0);
    expect(d.haClusterHealthy).toBe(false);
    expect(d.gpuUtilizationPct).toBe(0);
  });
});
