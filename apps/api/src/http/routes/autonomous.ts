import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AutonomousService } from "../../autonomous/autonomous.service.js";

const Proposal = z.object({ title: z.string().trim().min(1).max(200), department: z.string().trim().min(1).max(64), recommendation: z.string().trim().min(1).max(10000), confidence: z.number().min(0).max(1), riskLevel: z.enum(["low", "med", "high", "critical"]), estimatedImpactUsd: z.number(), reasoning: z.string().trim().min(1).max(20000) });
const DecisionId = z.object({ id: z.string().min(1).max(100) });

export function registerAutonomousRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok: true, data: await AutonomousService.dashboard(req.user!.organizationId!), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/decisions", requireAdmin, validate({ body: Proposal }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await AutonomousService.propose(req.user!.organizationId!, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/decisions/:id/resolve", requireAdmin, validate({ params: DecisionId, body: z.object({ approved: z.boolean(), note: z.string().trim().max(2000).optional() }) }), async (req, res, next) => { try { res.json({ ok: true, data: await AutonomousService.decide(req.user!.organizationId!, req.params.id, req.user!.id, req.body.approved, req.body.note), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
}
