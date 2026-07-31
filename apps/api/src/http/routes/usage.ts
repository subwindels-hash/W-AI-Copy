/** Session 55 — Enterprise Usage Intelligence routes */
import { Router } from "express";
import { UsageService } from "../../usage/usage.service.js";

export function registerUsageRoutes(router: Router) {
  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok:true, data: await UsageService.dashboard((req.user as any).organizationId) }); } catch (e) { next(e); } });
}
