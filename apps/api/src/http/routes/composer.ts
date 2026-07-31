/** Session 49 — AI Capability Composer routes */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import ComposerService from "../../composer/composer.service.js";
import { z } from "zod";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z as z_notes } from "zod";

const upsert = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  nodes: z.array(z.object({
    id: z.string(), kind: z.enum(["trigger","capability","logic","output"]),
    type: z.enum(["ocr","vision_analysis","translation","voice_generation","video_generation","knowledge_retrieval","ai_reasoning","crm_action","workflow_automation","notification","analytics"]).optional(),
    label: z.string(), x: z.number(), y: z.number(),
    config: z.record(z.string(), z.unknown()).default({}),
  })),
  edges: z.array(z.object({
    id: z.string(), source: z.string(), target: z.string(), label: z.string().optional(), condition: z.string().optional(),
  })),
});
const run = z.object({ input: z.record(z.string(), z.unknown()).optional() });

export function registerComposerRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => { try { res.json({ ok: true, data: await ComposerService.dashboard() }); } catch (e) { next(e); } });
  router.get("/workflows", async (_req, res, next) => { try { res.json({ ok: true, data: await ComposerService.list() }); } catch (e) { next(e); } });
  router.get("/workflows/:id", async (req, res, next) => { try { res.json({ ok: true, data: await ComposerService.get(req.params.id) }); } catch (e) { next(e); } });
  router.post("/workflows", validate({ body: upsert }), async (req, res, next) => { try { res.json({ ok: true, data: await ComposerService.upsert({ ...req.body, createdBy: req.user!.id }) }); } catch (e) { next(e); } });
  router.get("/workflows/:id/validate", async (req, res, next) => { try { res.json({ ok: true, data: await ComposerService.validate(req.params.id) }); } catch (e) { next(e); } });
  router.post("/workflows/:id/deploy", async (req, res, next) => { try { res.json({ ok: true, data: await ComposerService.deploy(req.params.id) }); } catch (e) { next(e); } });
  router.post("/workflows/:id/run", validate({ body: run }), async (req, res, next) => { try { res.json({ ok: true, data: await ComposerService.run(req.params.id, req.user!.id) }); } catch (e) { next(e); } });
  router.get("/runs", async (_req, res, next) => { try { res.json({ ok: true, data: await ComposerService.getRuns() }); } catch (e) { next(e); } });
  router.get("/library", async (_req, res) => res.json({ ok: true, data: (await import("../../composer/composer.service.js")).LIBRARY }));


  // Real tenant-scoped notes ledger for composer — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "cmp:notes", idPrefix: "cmp-" });
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
