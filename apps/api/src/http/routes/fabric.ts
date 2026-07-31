/** Session 56 — Enterprise Intelligence Fabric / Trust / Mission Control routes */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { FabricService } from "../../fabric/fabric.service.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z as z_notes } from "zod";

const SandboxSchema = z.object({
  name: z.string().min(2), experiment: z.string().min(2), gpu: z.number().int().min(0).max(8).optional(),
});

export function registerFabricRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.dashboard((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/trust", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.evaluateTrust((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/sandboxes", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.listSandboxes((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/sandboxes", validate({ body: SandboxSchema }), async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.createSandbox({ ...req.body, owner: (req.user as any).id, organizationId: (req.user as any).organizationId }) }); } catch (e) { next(e); } });
  router.get("/twins", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.listTwins((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/twins/:id/simulate", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.runSimulation(req.params.id, (req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/packages", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.listPackages((req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.post("/alerts/:id/acknowledge", async (req, res, next) => { try { res.json({ ok:true, data: await FabricService.acknowledgeAlert(req.params.id, (req.user as any).organizationId) }); } catch (e) { next(e); } });
  router.get("/bus/recent", async (req, res, next) => { try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    res.json({ ok:true, data: await FabricService.busRecent((req.user as any).organizationId, limit) });
  } catch (e) { next(e); } });


  // Real tenant-scoped notes ledger for fabric — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "fab:notes", idPrefix: "fab-" });
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
