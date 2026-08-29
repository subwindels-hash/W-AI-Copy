/**
 * Session 46 — Enterprise AI Model Factory routes.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ModelFactoryService } from "../../modelFactory/modelFactory.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

const create = z.object({
  name: z.string(),
  builder: z.enum(["slm","llm","vision","speech","audio","multimodal","domain"]),
  size: z.string(), quant: z.string(), vramMb: z.number().int().positive(),
  baseModelId: z.string().optional(), stage: z.enum(["research","benchmarking","validation","approval","canary","deployed","monitoring","retired"]).optional(),
});
const advance = z.object({ to: z.enum(["research","benchmarking","validation","approval","canary","deployed","monitoring","retired"]) });
const bench = z.object({ benchmark: z.string().min(1).max(120), score: z.number().min(0).max(100), pass: z.boolean() });
const finetune = z.object({ dataset: z.string(), method: z.enum(["supervised","rlhf","dpo","lora","qlora"]) });

export function registerModelFactoryRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.dashboard() }); } catch (e) { next(e); }
  });
  router.get("/models", async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.listModels(req.query.stage as any) }); } catch (e) { next(e); }
  });
  router.post("/models", validate({ body: create }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.createModel(req.body) }); } catch (e) { next(e); }
  });
  router.post("/models/:id/advance", validate({ body: advance }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.advanceStage(req.params.id, req.body.to) }); } catch (e) { next(e); }
  });
  router.post("/models/:id/benchmark", validate({ body: bench }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.runBenchmark(req.params.id, req.body.benchmark, { score: req.body.score, pass: req.body.pass }) }); } catch (e) { next(e); }
  });
  router.post("/models/:id/safety", validate({ body: z.object({ passed: z.boolean() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.approveSafety(req.params.id, req.body.passed) }); } catch (e) { next(e); }
  });
  router.post("/models/:id/governance-approve", async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.approveGovernance(req.params.id) }); } catch (e) { next(e); }
  });
  router.get("/fine-tunes", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.listFineTunes() }); } catch (e) { next(e); }
  });
  router.post("/fine-tunes", validate({ body: finetune }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ModelFactoryService.startFineTune(req.body.modelId ?? req.params.modelId, req.body.dataset, req.body.method) }); } catch (e) { next(e); }
  });


  // Real tenant-scoped notes ledger for modelFactory — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "mf:notes", idPrefix: "mf-" });
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
