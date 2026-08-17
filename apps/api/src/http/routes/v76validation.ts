/**
 * Session 76: Final Enterprise Integration & Validation routes.
 *
 * Session 195 — additive fix. Every read and write now requires an
 * authenticated user and an organization context. The previous version
 * had `GET /report` taking no org argument — the report was platform-
 * global and identical for every tenant. The S195 fix mirrors the S192
 * uxIntelligence / S193 architecture / S194 hybridExec pattern:
 * per-org keys with a one-shot adoption marker, plus a `history` and
 * `lastReport` companion to the existing live `/report` endpoint.
 *
 * The notes ledger has always been per-org via `tenantStore`; the
 * `orgOf` guard here makes the org boundary explicit and consistent
 * with the other Tier 4 modules.
 */
import { Router } from "express";
import { V76ValidationService } from "../../v76validation/v76validation.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z as z_notes } from "zod";

function orgOf(req: any, res: any): string | null {
  const oid = (req.user as any)?.organizationId;
  if (!oid) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return oid;
}

export function registerV76ValidationRoutes(router: Router) {
  // Live report (re-runs the 22-system probe and records the result for
  // the calling org). The previous S76 implementation ran this every
  // call; the S195 version persists the body so the Tier 4 console can
  // re-render without paying the probe cost on every read.
  router.post("/run", authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await V76ValidationService.runReport(oid) });
    } catch (e) { next(e); }
  });

  router.get("/report", authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      // Return the most recent persisted report body if one exists; this
      // is what the e2e suite and the legacy `/validation/report` path
      // expect. If the org has never run a report, run one and persist it.
      const last = await V76ValidationService.lastReport(oid);
      if (last) return res.json({ ok: true, data: last });
      res.json({ ok: true, data: await V76ValidationService.runReport(oid) });
    } catch (e) { next(e); }
  });

  router.get("/history", authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await V76ValidationService.history(oid) });
    } catch (e) { next(e); }
  });

  // Per-org notes ledger — user-authored annotations persisted in Redis.
  // Every write is a real Redis write; every read reflects real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "v76:notes", idPrefix: "v76-" });
  const _NoteSchema = z_notes.object({
    title: z_notes.string().min(2).max(200),
    body: z_notes.string().min(2).max(4000),
    tags: z_notes.array(z_notes.string().max(40)).max(20).default([]),
  });
  const _NoteId = z_notes.object({ id: z_notes.string().min(3).max(64) });

  router.get("/notes", authenticate, async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const list = await _notes.list(oid, 200);
      res.json({ ok: true, data: list.map((n) => ({ id: n.id, createdAt: n.createdAt, createdBy: n.createdBy, ...n.data })), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/notes", authenticate, validate({ body: _NoteSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const rec = await _notes.create(oid, req.body, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/notes/:id", authenticate, validate({ params: _NoteId, body: _NoteSchema.partial() }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const rec = await _notes.update(oid, req.params.id, req.body);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.delete("/notes/:id", authenticate, validate({ params: _NoteId }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const ok = await _notes.delete(oid, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
}
