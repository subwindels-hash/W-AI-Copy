import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  AutDecisionCreateSchema,
  AutDecisionIdSchema,
  AutDecisionListQuerySchema,
  AutDecisionResolveSchema,
} from "@windels/shared/autonomous";
import { AutonomousService } from "../../autonomous/autonomous.service.js";

const orgOf = (req: any): string => req.user!.organizationId!;

export function registerAutonomousRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => {
    try { res.json({ ok: true, data: await AutonomousService.dashboard(orgOf(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.get("/decisions", validate({ query: AutDecisionListQuerySchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AutonomousService.listDecisions(orgOf(req), req.query as any), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/decisions", requireAdmin, validate({ body: AutDecisionCreateSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await AutonomousService.propose(orgOf(req), req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.get("/decisions/:id", validate({ params: AutDecisionIdSchema }), async (req, res, next) => {
    try {
      const data = await AutonomousService.getDecision(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Decision not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.post("/decisions/:id/resolve", requireAdmin, validate({ params: AutDecisionIdSchema, body: AutDecisionResolveSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AutonomousService.decide(orgOf(req), req.params.id, req.user!.id, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.delete("/decisions/:id", requireAdmin, validate({ params: AutDecisionIdSchema }), async (req, res, next) => {
    try {
      const deleted = await AutonomousService.deleteDecision(orgOf(req), req.params.id);
      if (!deleted) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Decision not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
