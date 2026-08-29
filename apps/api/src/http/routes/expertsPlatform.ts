import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ExpertsPlatformService } from "../../expertsPlatform/expertsPlatform.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

// The web client posts `{ question }`; earlier API consumers used `{ q }`.
// Accepting either fixes a 400 on every UI call without breaking existing
// callers. At least one must be present.
const query = z.object({
  q: z.string().min(1).max(4000).optional(),
  question: z.string().min(1).max(4000).optional(),
}).refine((v) => Boolean(v.q ?? v.question), {
  message: "Provide a question",
  path: ["question"],
});

export function registerExpertsPlatformRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => { try { res.json({ ok:true, data: await ExpertsPlatformService.dashboard() }); } catch(e){next(e);} });
  router.get("/agents", async (req, res, next) => { try { res.json({ ok:true, data: await ExpertsPlatformService.listAgents(req.query.domain as any) }); } catch(e){next(e);} });
  router.post("/agents/:id/query", validate({body:query}), async (req, res, next) => { try { res.json({ ok:true, data: await ExpertsPlatformService.query(req.params.id, (req.body.question ?? req.body.q) as string) }); } catch(e){next(e);} });
  router.get("/courses", async (_req, res, next) => { try { res.json({ ok:true, data: await ExpertsPlatformService.listCourses() }); } catch(e){next(e);} });
  router.get("/packages", async (_req, res, next) => { try { res.json({ ok:true, data: await ExpertsPlatformService.listPackages() }); } catch(e){next(e);} });


  // Real tenant-scoped notes ledger for expertsPlatform — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "exp:notes", idPrefix: "exp-" });
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
