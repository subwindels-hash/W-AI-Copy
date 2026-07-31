/**
 * Session 45 — Core Enterprise Integration checkpoint routes.
 */
import { Router } from "express";
import { CoreIntegrationService } from "../../coreIntegration/coreIntegration.service.js";

export function registerCoreIntegrationRoutes(router: Router) {
  router.get("/checkpoint", async (_req, res, next) => {
    try { res.json({ ok: true, data: await CoreIntegrationService.checkpoint() }); } catch (e) { next(e); }
  });
}
