import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { OpexService } from "../../opex/opex.service.js";
const Alert = z.object({ category: z.string().trim().min(1).max(64), severity: z.enum(["info", "warning", "critical"]), source: z.string().trim().min(1).max(128), message: z.string().trim().min(1).max(5000), model: z.string().max(128).optional() });
const Id = z.object({ id: z.string().min(1).max(100) });
export function registerOpexRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok: true, data: await OpexService.dashboard(req.user!.organizationId!), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/safety-alerts", requireAdmin, validate({ body: Alert }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await OpexService.createAlert(req.user!.organizationId!, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/safety-alerts/:id/status", requireAdmin, validate({ params: Id, body: z.object({ status: z.enum(["acknowledged", "resolved"]), note: z.string().trim().max(2000).optional() }) }), async (req, res, next) => { try { res.json({ ok: true, data: await OpexService.updateAlert(req.user!.organizationId!, req.params.id, req.user!.id, req.body.status, req.body.note), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
}
