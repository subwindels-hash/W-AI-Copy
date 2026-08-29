/** Session 51 — Disaster Recovery & AI Continuity routes
 *
 * Session 179: all handlers now require authenticate + orgOf (no unauthenticated
 * read, no org-windels fallback). Dashboard is pure read (no seeding).
 */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import DisasterRecoveryService from "../../disasterRecovery/disasterRecovery.service.js";
import { z } from "zod";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

const failover = z.object({
  component: z.enum(["ai_cluster","multi_region","memory_replication","knowledge_graph","ai_model_replication","backup_inference","offline_emergency","bcp","dr_automation","recovery_testing","auto_failback","infra_health"]),
  toRegion: z.string().min(2).max(32),
  reason: z.string().min(2).max(500),
});
const drill = z.object({ component: z.enum(["ai_cluster","multi_region","memory_replication","knowledge_graph","ai_model_replication","backup_inference","offline_emergency","bcp","dr_automation","recovery_testing","auto_failback","infra_health"]), scheduledAt: z.string() });
const drillResult = z.object({ passed: z.boolean(), rtoAchievedMs: z.number().int().min(0), rpoAchievedMs: z.number().int().min(0), issues: z.array(z.string().max(500)).max(50).optional() });
const em = z.object({ enabled: z.boolean() });

function orgOf(req: any, res: any): string | null {
  const oid = (req.user as any)?.organizationId ?? null;
  if (!oid) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return oid;
}

export function registerDisasterRecoveryRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DisasterRecoveryService.dashboard(oid) });
    } catch (e) { next(e); }
  });
  router.get("/status", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DisasterRecoveryService.getStatus(oid) });
    } catch (e) { next(e); }
  });
  router.get("/events", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DisasterRecoveryService.getEvents(oid) });
    } catch (e) { next(e); }
  });
  router.get("/drills", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DisasterRecoveryService.getDrills(oid) });
    } catch (e) { next(e); }
  });
  router.post("/failover", validate({ body: failover }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DisasterRecoveryService.triggerFailover({ ...req.body, organizationId: oid }) });
    } catch (e) { next(e); }
  });
  router.post("/drills", validate({ body: drill }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DisasterRecoveryService.scheduleDrill({ ...req.body, organizationId: oid }) });
    } catch (e) { next(e); }
  });
  router.post("/drills/:id/run", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DisasterRecoveryService.runDrill(req.params.id, oid) });
    } catch (e) { next(e); }
  });
  router.post("/drills/:id/result", validate({ body: drillResult }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DisasterRecoveryService.recordDrillResult(req.params.id, {
        passed: req.body.passed,
        rtoAchievedMs: req.body.rtoAchievedMs,
        rpoAchievedMs: req.body.rpoAchievedMs,
        issues: req.body.issues,
        recordedBy: (req.user as any).id,
      }, oid) });
    } catch (e) { next(e); }
  });
  router.post("/emergency", validate({ body: em }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      res.json({ ok: true, data: await DisasterRecoveryService.setEmergencyMode(req.body.enabled, oid) });
    } catch (e) { next(e); }
  });


  // Real tenant-scoped notes ledger for disasterRecovery — user-authored annotations
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "dr:notes", idPrefix: "dr-" });
  const _NoteSchema = z_notes.object({
    title: z_notes.string().min(2).max(200),
    body: z_notes.string().min(2).max(4000),
    tags: z_notes.array(z_notes.string().max(40)).max(20).default([]),
  });
  const _NoteId = z_notes.object({ id: z_notes.string().min(3).max(64) });

  router.get("/notes", async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const list = await _notes.list(oid, 200);
      res.json({ ok: true, data: list.map((n) => ({ id: n.id, createdAt: n.createdAt, createdBy: n.createdBy, ...n.data })), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/notes", validate({ body: _NoteSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const rec = await _notes.create(oid, req.body, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/notes/:id", validate({ params: _NoteId, body: _NoteSchema.partial() }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const rec = await _notes.update(oid, req.params.id, req.body);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.delete("/notes/:id", validate({ params: _NoteId }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res); if (!oid) return;
      const ok = await _notes.delete(oid, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
}
