/** Session 103 — org-scoped AI Economy / GPU ledger routes. */
import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  AiEconomyAllocationSchema,
  AiEconomyLimitQuerySchema,
  AiEconomyOfferSchema,
  AiEconomyOfferUpdateSchema,
  AiEconomyRecordIdSchema,
  AiEconomyUsageSchema,
} from "@windels/shared/aiEconomy";
import { AiEconomyService } from "../../aiEconomy/aiEconomy.service.js";

const orgOf = (req: any): string => req.user!.organizationId!;

export function registerAiEconomyRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => {
    try { res.json({ ok: true, data: await AiEconomyService.dashboard(orgOf(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });

  router.get("/usage", validate({ query: AiEconomyLimitQuerySchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AiEconomyService.listUsage(orgOf(req), (req.query as any).limit), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/usage", requireAdmin, validate({ body: AiEconomyUsageSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await AiEconomyService.recordUsage(orgOf(req), req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.delete("/usage/:id", requireAdmin, validate({ params: AiEconomyRecordIdSchema }), async (req, res, next) => {
    try {
      const deleted = await AiEconomyService.deleteUsage(orgOf(req), req.params.id);
      if (!deleted) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Usage record not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/allocations", validate({ query: AiEconomyLimitQuerySchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await AiEconomyService.listAllocations(orgOf(req), (req.query as any).limit), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/allocations", requireAdmin, validate({ body: AiEconomyAllocationSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await AiEconomyService.createAllocation(orgOf(req), req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.delete("/allocations/:id", requireAdmin, validate({ params: AiEconomyRecordIdSchema }), async (req, res, next) => {
    try {
      const deleted = await AiEconomyService.deleteAllocation(orgOf(req), req.params.id);
      if (!deleted) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Allocation not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/offers", async (req, res, next) => {
    try { res.json({ ok: true, data: await AiEconomyService.listOffers(orgOf(req)), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.post("/offers", requireAdmin, validate({ body: AiEconomyOfferSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await AiEconomyService.createOffer(orgOf(req), req.body), meta: { requestId: req.requestId } }); } catch (e) { next(e); }
  });
  router.patch("/offers/:id", requireAdmin, validate({ params: AiEconomyRecordIdSchema, body: AiEconomyOfferUpdateSchema }), async (req, res, next) => {
    try {
      const data = await AiEconomyService.updateOffer(orgOf(req), req.params.id, req.body);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Compute offer not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.delete("/offers/:id", requireAdmin, validate({ params: AiEconomyRecordIdSchema }), async (req, res, next) => {
    try {
      const deleted = await AiEconomyService.deleteOffer(orgOf(req), req.params.id);
      if (!deleted) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Compute offer not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
