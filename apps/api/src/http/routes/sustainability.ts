import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { SustainabilityService } from "../../sustainability/sustainability.service.js";
const Activity = z.object({ category: z.enum(["scope1", "scope2", "scope3", "compute"]), activity: z.string().trim().min(1).max(200), quantity: z.number().positive(), unit: z.string().trim().min(1).max(32), emissionFactorKg: z.number().min(0), occurredAt: z.string().datetime(), source: z.string().trim().min(1).max(300) });
export function registerSustainabilityRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok: true, data: await SustainabilityService.dashboard(req.user!.organizationId!), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  router.post("/activity", requireAdmin, validate({ body: Activity }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await SustainabilityService.record(req.user!.organizationId!, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
}
