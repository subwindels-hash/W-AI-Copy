import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { SustainabilityService } from "../../sustainability/sustainability.service.js";
const Activity = z.object({
  category: z.enum(["scope1", "scope2", "scope3", "compute"]),
  activity: z.string().trim().min(1).max(200),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1).max(32),
  emissionFactorKg: z.number().min(0),
  occurredAt: z.string().datetime(),
  source: z.string().trim().min(1).max(300),
  // Optional energy reading so the 12-month series reflects real consumption.
  kwh: z.number().min(0).optional(),
});
export function registerSustainabilityRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok: true, data: await SustainabilityService.dashboard(req.user!.organizationId!), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
  // Read back the raw ledger, so the derived dashboard can be audited against
  // the records it was computed from.
  router.get("/records", async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 200) || 200, 1000);
      res.json({ ok: true, data: await SustainabilityService.listRecords(req.user!.organizationId!, limit), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.post("/activity", requireAdmin, validate({ body: Activity }), async (req, res, next) => { try { res.status(201).json({ ok: true, data: await SustainabilityService.record(req.user!.organizationId!, req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); } });
}
