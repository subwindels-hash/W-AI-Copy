/**
 * Self-Hosted Infrastructure bootstrap (Session 38) — 12000ms slot.
 */
import { SelfHostedService as Sh } from "./selfHosted.service.js";
import { redisCmd as redis } from "../db/redis.js";

export async function bootstrapSelfHosted(logger?: any): Promise<void> {
  if ((await redis.zcard("sh:nodes")) > 0) { logger?.info("[self-hosted] bootstrap skipped"); return; }
  const nodes = [
    { name: "GPU-A100-01", kind: "gpu-server", hostname: "gpu-a100-01.windels.local", region: "eu-west", gpus: 4, gpuType: "A100-80GB", vram: 320, vramUsed: 140, cores: 128, ram: 1024, util: 44, temp: 62, power: 980, online: new Date(Date.now()-86400000*7).toISOString(), tags: ["production","primary"] },
    { name: "GPU-H100-01", kind: "gpu-server", hostname: "gpu-h100-01.windels.local", region: "us-east", gpus: 8, gpuType: "H100-80GB-SXM", vram: 640, vramUsed: 420, cores: 192, ram: 2048, util: 68, temp: 68, power: 2400, online: new Date(Date.now()-86400000*3).toISOString(), tags: ["production","training"] },
    { name: "GPU-L4-Edge-01", kind: "edge-node", hostname: "edge-l4-01.windels.local", region: "edge-nl", gpus: 2, gpuType: "L4-24GB", vram: 48, vramUsed: 12, cores: 32, ram: 128, util: 18, temp: 52, power: 140, online: new Date(Date.now()-86400000).toISOString(), tags: ["edge","inference"] },
    { name: "Airgap-Q8-01", kind: "airgap-node", hostname: "airgap-q8.windels.local", region: "on-prem", gpus: 0, gpuType: "CPU-only", vram: 0, vramUsed: 0, cores: 64, ram: 512, util: 8, temp: 40, power: 220, tags: ["airgap","sovereign"], status: "maintenance" as const },
  ] as const;
  for (const n of nodes as any) {
    await Sh.registerNode({
      name: n.name, kind: n.kind, status: n.status ?? "online", hostname: n.hostname, region: n.region,
      gpuCount: n.gpus, gpuType: n.gpuType, vramGb: n.vram, vramUsedGb: n.vramUsed, cpuCores: n.cores,
      ramGb: n.ram, utilizationPct: n.util, temperatureC: n.temp, powerW: n.power,
      onlineSince: n.online, tags: n.tags,
    });
  }
  const models = [
    { name: "windels-core-v2", ver: "2.1.0", fmt: "gguf", origin: "fine-tuned", backend: "llama.cpp", size: 42, ctx: 128000, quant: "Q5_K_M", caps: ["chat","reasoning","code"] },
    { name: "llama-3.1-70b", ver: "1.0", fmt: "gguf", origin: "imported", backend: "vllm", size: 48, ctx: 128000, quant: "Q4_K_M", caps: ["chat","reasoning"] },
    { name: "mistral-nemo-12b", ver: "1.0", fmt: "gguf", origin: "imported", backend: "llama.cpp", size: 7, ctx: 128000, quant: "Q6_K", caps: ["chat","code"] },
    { name: "windels-embed-v1", ver: "1.0", fmt: "onnx", origin: "local", backend: "onnxruntime", size: 1.2, ctx: 8192, quant: "fp16", caps: ["embedding"] },
    { name: "windels-vision-v1", ver: "1.0", fmt: "tensorrt", origin: "fine-tuned", backend: "tensorrt-llm", size: 22, ctx: 32000, quant: "fp16", caps: ["vision","multimodal"] },
  ] as const;
  for (const m of models as any) {
    const mm = await Sh.registerModel({ name: m.name, version: m.ver, format: m.fmt, origin: m.origin, backend: m.backend, sizeGb: m.size, contextWindow: m.ctx, quant: m.quant, capabilities: m.caps });
    if (m.size < 50) await Sh.loadModel(mm.id);
  }
  const vectors = [
    { name: "org-memory", backend: "pgvector", dims: 1536, count: 2_400_000, sz: 14, endpoint: "postgresql://vec:5432", air: false },
    { name: "kb-primary", backend: "qdrant", dims: 1024, count: 8_200_000, sz: 42, endpoint: "http://qdrant:6333", air: false },
    { name: "airgap-cache", backend: "sqlite-vec", dims: 768, count: 120_000, sz: 0.8, air: true },
  ] as const;
  for (const v of vectors as any) {
    await Sh.registerVectorStore({ name: v.name, backend: v.backend, status: "online", dimensions: v.dims, vectorCount: v.count, sizeGb: v.sz, endpoint: v.endpoint, airgapped: v.air });
  }
  // Warm jobs to make dashboard realistic
  for (let i=0;i<6;i++) await Sh.runInference({ modelId: (await Sh.listModels())[0].id, prompt: "warmup" });
  logger?.info("[self-hosted] bootstrap complete", { nodes: nodes.length, models: models.length, vectors: vectors.length });
}
