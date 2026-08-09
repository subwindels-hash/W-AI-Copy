/**
 * Architecture introspection routes (Session 37).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ArchitectureService } from "../../architecture/architecture.service.js";
import { EsiAggregationService } from "../../architecture/esiAggregation.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

const signalBody = z.object({
  source: z.string(), signal: z.string(), confidence: z.number().min(0).max(1).default(0.75),
});

export function registerArchitectureRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ArchitectureService.status() }); } catch (e) { next(e); }
  });
  router.get("/status", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ArchitectureService.status() }); } catch (e) { next(e); }
  });
  router.get("/modules", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ArchitectureService.listModules() }); } catch (e) { next(e); }
  });
  router.get("/esi", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ArchitectureService.readEsi() }); } catch (e) { next(e); }
  });
  router.post("/esi/signals", validate({ body: signalBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ArchitectureService.pushEsiSignal(req.body) }); } catch (e) { next(e); }
  });
  // Cross-portfolio ESI aggregation — reads the real module dashboards.
  router.get("/esi/report", async (_req, res, next) => {
    try { res.json({ ok: true, data: await EsiAggregationService.portfolioReport() }); } catch (e) { next(e); }
  });


  // Real tenant-scoped notes ledger for architecture — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "arch:notes", idPrefix: "arch-" });
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
