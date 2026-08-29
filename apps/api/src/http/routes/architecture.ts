/**
 * Architecture introspection routes (Session 37).
 *
 * Session 193 — additive fix. Every read and write now requires an
 * authenticated user and an organization context. The previous version
 * had zero org guards on the 6 read routes (`_req` was unused), so a
 * request without a token silently read the global `arch:modules` and
 * `arch:esi` keys — every tenant saw the same "the platform's
 * architecture" report. The S193 fix mirrors the S192 (uxIntelligence)
 * pattern: per-org keys with a one-shot adoption of the legacy
 * global keys.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ArchitectureService } from "../../architecture/architecture.service.js";
import { EsiAggregationService } from "../../architecture/esiAggregation.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

const signalBody = z.object({
  source: z.string(), signal: z.string(), confidence: z.number().min(0).max(1).default(0.75),
});

function orgOf(req: any, res: any): string | null {
  const oid = (req.user as any)?.organizationId;
  if (!oid) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return oid;
}

export function registerArchitectureRoutes(router: Router) {
  router.get("/dashboard/rollup", authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await ArchitectureService.status(oid) });
    } catch (e) { next(e); }
  });
  router.get("/status", authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await ArchitectureService.status(oid) });
    } catch (e) { next(e); }
  });
  router.get("/modules", authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await ArchitectureService.listModules(oid) });
    } catch (e) { next(e); }
  });
  router.get("/esi", authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await ArchitectureService.readEsi(oid) });
    } catch (e) { next(e); }
  });
  router.post("/esi/signals", validate({ body: signalBody }), authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await ArchitectureService.pushEsiSignal(oid, req.body) });
    } catch (e) { next(e); }
  });
  // Cross-portfolio ESI aggregation — passes the calling org to every
  // source module's dashboard so a tenant reads its own values rather
  // than org-windels'. The aggregation shape is unchanged.
  router.get("/esi/report", authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await EsiAggregationService.portfolioReport(oid) });
    } catch (e) { next(e); }
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
