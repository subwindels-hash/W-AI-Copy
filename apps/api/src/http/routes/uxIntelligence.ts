import { Router } from "express";
import { UxIntelligenceService } from "../../uxIntelligence/uxIntelligence.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z as z_notes } from "zod";

/**
 * Session 192 — additive fix.
 * Every read now requires an authenticated user and an organization
 * context. The previous version had zero org guards on the 8 read
 * routes (`_req` was unused), so a request without a token or a
 * token with a null organization silently read whatever happened to
 * be in the global keys — the cross-tenant leak shape Sessions
 * 162–168 closed in other modules.
 */
export function registerUxIntelligenceRoutes(router: Router) {
  router.get("/dashboard/rollup", authenticate, async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      res.json({ ok: true, data: await UxIntelligenceService.dashboard(oid) });
    } catch (e) { next(e); }
  });
  router.get("/tokens", authenticate, async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      res.json({ ok: true, data: await UxIntelligenceService.listTokens(oid) });
    } catch (e) { next(e); }
  });
  router.get("/components", authenticate, async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      res.json({ ok: true, data: await UxIntelligenceService.listComponents(oid) });
    } catch (e) { next(e); }
  });
  router.get("/findings", authenticate, async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      res.json({ ok: true, data: await UxIntelligenceService.listFindings(oid) });
    } catch (e) { next(e); }
  });
  router.get("/agents", authenticate, async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      res.json({ ok: true, data: await UxIntelligenceService.listAgents(oid) });
    } catch (e) { next(e); }
  });
  router.get("/brands", authenticate, async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      res.json({ ok: true, data: await UxIntelligenceService.listBrands(oid) });
    } catch (e) { next(e); }
  });
  // `/devices` is a static catalogue (9 spec classes); it has no org
  // state and no auth requirement.
  router.get("/devices", (_req, res) => res.json({ ok: true, data: UxIntelligenceService.deviceClasses() }));
  router.post("/qa/run", authenticate, async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      res.json({ ok: true, data: await UxIntelligenceService.runDesignQa(oid) });
    } catch (e) { next(e); }
  });


  // Real tenant-scoped notes ledger for uxIntelligence — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "ux:notes", idPrefix: "ux-" });
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
