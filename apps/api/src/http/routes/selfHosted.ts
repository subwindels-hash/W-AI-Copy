/**
 * Self-Hosted AI Infrastructure routes (Session 38).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { SelfHostedService } from "../../selfHosted/selfHosted.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z as z_notes } from "zod";

const nodeCreate = z.object({
  name: z.string(), kind: z.enum(["gpu-server","cpu-node","edge-node","airgap-node"]).default("gpu-server"),
  hostname: z.string(), region: z.string().default("local"), gpuCount: z.number().int().default(0),
  gpuType: z.string().default("CPU"), vramGb: z.number().default(0), cpuCores: z.number().int().default(8),
  ramGb: z.number().default(32), tags: z.array(z.string()).default([]),
});
const modelCreate = z.object({
  name: z.string(), version: z.string().default("1.0.0"), format: z.enum(["gguf","onnx","tensorrt","safetensors","onnx-webgpu","custom"]).default("gguf"),
  origin: z.enum(["local","imported","fine-tuned","synthesized"]).default("imported"),
  backend: z.enum(["llama.cpp","vllm","tensorrt-llm","onnxruntime","webgpu","custom"]).default("llama.cpp"),
  sizeGb: z.number(), contextWindow: z.number().int().default(32000), quant: z.string().default("Q4_K_M"),
  capabilities: z.array(z.string()).default(["chat"]),
});
const inferBody = z.object({
  modelId: z.string(), prompt: z.string(), maxTokens: z.number().int().optional(), temperature: z.number().default(0.7),
  schedulingClass: z.enum(["interactive","batch","realtime","background"]).default("interactive"),
});
const vectorCreate = z.object({
  name: z.string(), backend: z.enum(["qdrant","pgvector","chroma","weaviate","sqlite-vec","custom"]),
  dimensions: z.number().int().default(1536), endpoint: z.string().optional(), airgapped: z.boolean().default(false),
});
const modelLoad = z.object({ nodeId: z.string().optional() });

export function registerSelfHostedRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await SelfHostedService.summary() }); } catch (e) { next(e); }
  });
  router.get("/nodes", async (_req, res, next) => {
    try { res.json({ ok: true, data: await SelfHostedService.listNodes() }); } catch (e) { next(e); }
  });
  router.post("/nodes", validate({ body: nodeCreate }), async (req, res, next) => {
    try {
      const node = await SelfHostedService.registerNode({
        ...req.body, status: "online", vramUsedGb: 0, utilizationPct: 0, temperatureC: 40, powerW: 0,
      });
      res.json({ ok: true, data: node });
    } catch (e) { next(e); }
  });
  router.get("/models", async (_req, res, next) => {
    try { res.json({ ok: true, data: await SelfHostedService.listModels() }); } catch (e) { next(e); }
  });
  router.post("/models", validate({ body: modelCreate }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SelfHostedService.registerModel(req.body) }); } catch (e) { next(e); }
  });
  router.post("/models/:id/load", validate({ body: modelLoad }), async (req, res, next) => {
    try { const m = await SelfHostedService.loadModel(req.params.id, req.body?.nodeId); res.json({ ok: true, data: m }); } catch (e) { next(e); }
  });
  router.post("/inference", validate({ body: inferBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SelfHostedService.runInference(req.body) }); }
    catch (e: any) { res.status(400).json({ ok: false, error: { message: e.message } }); }
  });
  router.get("/inference/jobs", async (_req, res, next) => {
    try { res.json({ ok: true, data: await SelfHostedService.listJobs() }); } catch (e) { next(e); }
  });
  router.get("/vector-stores", async (_req, res, next) => {
    try { res.json({ ok: true, data: await SelfHostedService.listVectorStores() }); } catch (e) { next(e); }
  });
  router.post("/vector-stores", validate({ body: vectorCreate }), async (req, res, next) => {
    try {
      const v = await SelfHostedService.registerVectorStore({
        ...req.body, status: "provisioning", vectorCount: 0, sizeGb: 0,
      });
      res.json({ ok: true, data: v });
    } catch (e) { next(e); }
  });


  // Real tenant-scoped notes ledger for selfHosted — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "sh:notes", idPrefix: "sh-" });
  const _NoteSchema = z_notes.object({
    title: z_notes.string().min(2).max(200),
    body: z_notes.string().min(2).max(4000),
    tags: z_notes.array(z_notes.string().max(40)).max(20).default([]),
  });
  const _NoteId = z_notes.object({ id: z_notes.string().min(3).max(64) });

  router.get("/notes", async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const list = await _notes.list(oid, 200);
      res.json({ ok: true, data: list.map((n) => ({ id: n.id, createdAt: n.createdAt, createdBy: n.createdBy, ...n.data })), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/notes", validate({ body: _NoteSchema }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.create(oid, req.body, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/notes/:id", validate({ params: _NoteId, body: _NoteSchema.partial() }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.update(oid, req.params.id, req.body);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.delete("/notes/:id", validate({ params: _NoteId }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const ok = await _notes.delete(oid, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
}
