/**
 * Session 76: Final Enterprise Integration & Validation routes.
 */
import { Router } from "express";
import { V76ValidationService } from "../../v76validation/v76validation.service.js";

export function registerV76ValidationRoutes(router: Router) {
  router.get("/report", async (_req, res, next) => {
    try { res.json({ ok: true, data: await V76ValidationService.runReport() }); } catch (e) { next(e); }
  });
}
