/** Session 51 — Disaster Recovery & AI Continuity routes */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import DisasterRecoveryService from "../../disasterRecovery/disasterRecovery.service.js";
import { z } from "zod";

const failover = z.object({
  component: z.enum(["ai_cluster","multi_region","memory_replication","knowledge_graph","ai_model_replication","backup_inference","offline_emergency","bcp","dr_automation","recovery_testing","auto_failback","infra_health"]),
  toRegion: z.string().min(2).max(32),
  reason: z.string().min(2).max(500),
});
const drill = z.object({ component: z.enum(["ai_cluster","multi_region","memory_replication","knowledge_graph","ai_model_replication","backup_inference","offline_emergency","bcp","dr_automation","recovery_testing","auto_failback","infra_health"]), scheduledAt: z.string() });
const drillResult = z.object({ passed: z.boolean(), rtoAchievedMs: z.number().int().min(0), rpoAchievedMs: z.number().int().min(0), issues: z.array(z.string().max(500)).max(50).optional() });
const em = z.object({ enabled: z.boolean() });

export function registerDisasterRecoveryRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => { try { res.json({ ok: true, data: await DisasterRecoveryService.dashboard() }); } catch (e) { next(e); } });
  router.get("/status", async (_req, res, next) => { try { res.json({ ok: true, data: await DisasterRecoveryService.getStatus() }); } catch (e) { next(e); } });
  router.get("/events", async (_req, res, next) => { try { res.json({ ok: true, data: await DisasterRecoveryService.getEvents() }); } catch (e) { next(e); } });
  router.get("/drills", async (_req, res, next) => { try { res.json({ ok: true, data: await DisasterRecoveryService.getDrills() }); } catch (e) { next(e); } });
  router.post("/failover", validate({ body: failover }), async (req, res, next) => { try { res.json({ ok: true, data: await DisasterRecoveryService.triggerFailover(req.body) }); } catch (e) { next(e); } });
  router.post("/drills", validate({ body: drill }), async (req, res, next) => { try { res.json({ ok: true, data: await DisasterRecoveryService.scheduleDrill(req.body) }); } catch (e) { next(e); } });
  router.post("/drills/:id/run", async (req, res, next) => { try { res.json({ ok: true, data: await DisasterRecoveryService.runDrill(req.params.id) }); } catch (e) { next(e); } });
  // A drill is never auto-graded — the operator who ran it records the measured
  // outcome. Without this the drill stays `running` rather than inventing a pass.
  router.post("/drills/:id/result", validate({ body: drillResult }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await DisasterRecoveryService.recordDrillResult(req.params.id, {
        passed: req.body.passed,
        rtoAchievedMs: req.body.rtoAchievedMs,
        rpoAchievedMs: req.body.rpoAchievedMs,
        issues: req.body.issues,
        recordedBy: req.user!.id,
      }) });
    } catch (e) { next(e); }
  });
  router.post("/emergency", validate({ body: em }), async (req, res, next) => { try { res.json({ ok: true, data: await DisasterRecoveryService.setEmergencyMode(req.body.enabled) }); } catch (e) { next(e); } });
}
