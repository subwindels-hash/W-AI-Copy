/** Super Admin control plane for the Blockonomics payment provider. */
import { Router } from "express";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { BlockonomicsAdminConfigUpdateSchema, BlockonomicsAdminToggleSchema } from "@windels/shared/payments";
import { BlockonomicsConfigService } from "../../payments/blockonomics.service.js";
import { BlockonomicsAdminService } from "../../payments/blockonomicsAdmin.service.js";

export function registerBlockonomicsAdminRoutes(router: Router) {
  const admin = Router();
  admin.use(authenticate, requireSuperAdmin);

  admin.get("/config", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await BlockonomicsConfigService.public(), meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  admin.put("/config", validate({ body: BlockonomicsAdminConfigUpdateSchema }), async (req, res, next) => {
    try {
      const config = await BlockonomicsConfigService.upsert(req.body, req.user!.id);
      res.json({ ok: true, data: config, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  admin.patch("/enabled", validate({ body: BlockonomicsAdminToggleSchema }), async (req, res, next) => {
    try {
      const config = await BlockonomicsConfigService.setEnabled(req.body.enabled, req.user!.id);
      res.json({ ok: true, data: config, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  admin.post("/health", async (req, res, next) => {
    try {
      const result = await BlockonomicsAdminService.checkHealth(req.user!.id);
      res.json({ ok: true, data: result, meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  admin.get("/dashboard", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await BlockonomicsAdminService.dashboard(), meta: { requestId: req.requestId } });
    } catch (error) { next(error); }
  });

  router.use("/admin/payments/blockonomics", admin);
}
