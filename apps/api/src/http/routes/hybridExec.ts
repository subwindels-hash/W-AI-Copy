/**
 * Session 43 — Hybrid AI Execution routes.
 *
 * Session 194 — additive fix. Every read and write now requires an
 * authenticated user and an organization context. The pre-S194
 * version had zero org guards on the 7 read routes (`_req` was
 * unused), so a request without a token silently read the global
 * `hx:models`, `hx:nodes`, `hx:routes` keys — the cross-tenant leak
 * shape Sessions 162/163/164/165/168/179/192/193 closed in other
 * modules.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { HybridExecService } from "../../hybridExec/hybridExec.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

const route = z.object({ modality: z.string(), requiredVramMb: z.number().int().positive(), safetyCritical: z.boolean().optional(), costOptimize: z.boolean().optional() });
const reg = z.object({ name: z.string(), modality: z.enum(["text","image","audio","video","speech","multimodal","embedding"]), size: z.string(), quant: z.string(), vramMb: z.number().int().positive(), provider: z.enum(["self-hosted","connected-enterprise"]) });
const canary = z.object({ pct: z.number().min(0).max(100) });
const modeBody = z.object({ mode: z.enum(["self-hosted", "hybrid", "connected-enterprise"]) });
const flagBody = z.object({
  key: z.enum(["costOptimization", "vendorNeutral", "routedThroughKernel"]),
  enabled: z.boolean(),
});

function orgOf(req: any, res: any): string | null {
  const oid = (req.user as any)?.organizationId;
  if (!oid) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return oid;
}

export function registerHybridExecRoutes(router: Router) {
  router.get("/dashboard/rollup", authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await HybridExecService.dashboard(oid) });
    } catch (e) { next(e); }
  });
  router.get("/models", authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await HybridExecService.listModels(oid, req.query.status as any) });
    } catch (e) { next(e); }
  });
  router.post("/models", validate({ body: reg }), authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await HybridExecService.registerModel(oid, req.body) });
    } catch (e) { next(e); }
  });
  router.post("/models/:id/canary", validate({ body: canary }), authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await HybridExecService.promoteCanary(oid, req.params.id, req.body.pct) });
    } catch (e) { next(e); }
  });
  router.post("/models/:id/rollback", authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await HybridExecService.rollback(oid, req.params.id) });
    } catch (e) { next(e); }
  });
  router.get("/nodes", authenticate, async (_req, res, next) => {
    try {
      const oid = orgOf(_req, res); if (!oid) return;
      res.json({ ok: true, data: await HybridExecService.listNodes(oid) });
    } catch (e) { next(e); }
  });
  router.post("/route", validate({ body: route }), authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await HybridExecService.routeRequest(oid, req.body) });
    } catch (e) { next(e); }
  });
  // Per-org configuration. The dashboard reads these rather than
  // asserting the legacy hardcoded values (activeMode: "hybrid",
  // costOptimization / vendorNeutral / routedThroughKernel: true).
  router.put("/mode", validate({ body: modeBody }), authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await HybridExecService.setMode(oid, req.body.mode) });
    } catch (e) { next(e); }
  });
  router.put("/flags", validate({ body: flagBody }), authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await HybridExecService.setFlag(oid, req.body.key, req.body.enabled) });
    } catch (e) { next(e); }
  });


  // Real tenant-scoped notes ledger for hybridExec — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "hx:notes", idPrefix: "hx-" });
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
