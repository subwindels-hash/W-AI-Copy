import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { OpexService } from "../../opex/opex.service.js";
import { AppError } from "../../utils/result.js";
const Alert = z.object({ category: z.string().trim().min(1).max(64), severity: z.enum(["info", "warning", "critical"]), source: z.string().trim().min(1).max(128), message: z.string().trim().min(1).max(5000), model: z.string().max(128).optional() });
const Id = z.object({ id: z.string().min(1).max(100) });
function orgOf(req: any): string {
  const org = (req.user as any)?.organizationId ?? null;
  if (!org) throw AppError.forbidden("The operational-excellence register is organization-scoped and this session carries no organization.");
  return org;
}
export function registerOpexRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok: true, data: await OpexService.dashboard(orgOf(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/safety-alerts", requireAdmin, validate({ body: Alert }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await OpexService.createAlert(orgOf(req), req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/safety-alerts/:id/status", requireAdmin, validate({ params: Id, body: z.object({ status: z.enum(["acknowledged", "resolved"]), note: z.string().trim().max(2000).optional() }) }), async (req, res, next) => { try { res.json({ ok: true, data: await OpexService.updateAlert(orgOf(req), req.params.id, (req.user as any).id, req.body.status, req.body.note), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
}
