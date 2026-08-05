import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { TenantIsolationService } from "../../tenantIsolation/tenantIsolation.service.js";
// Request contracts live in @windels/shared so the API and the web client
// validate against one definition instead of hand-copied ones.
import { TiUpsertPolicySchema, TiExportCheckSchema } from "@windels/shared/tenantIsolation";

const orgOf = (req: any) => req.user!.organizationId!;

export function registerTenantIsolationRoutes(router: Router) {
  router.use(authenticate);

  // Per-org isolation policy
  router.get("/policy", async (req, res, next) => {
    try {
      const data = await TenantIsolationService.getPolicy(orgOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.put("/policy", validate({ body: TiUpsertPolicySchema }), async (req, res, next) => {
    try {
      const data = await TenantIsolationService.upsertPolicy(orgOf(req), req.body, req.user!.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Compliance runs
  router.post("/compliance/run", async (req, res, next) => {
    try {
      const data = await TenantIsolationService.runCompliance(orgOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/compliance/runs", async (req, res, next) => {
    try {
      const data = await TenantIsolationService.listRuns(orgOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get(
    "/compliance/runs/:id",
    validate({ params: z.object({ id: z.string().min(1).max(64) }) }),
    async (req, res, next) => {
      try {
        const data = await TenantIsolationService.getRun(orgOf(req), req.params.id);
        if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Run not found" } });
        res.json({ ok: true, data, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  // Export gate — other modules call this before moving data out of the tenant.
  router.post("/export-check", validate({ body: TiExportCheckSchema }), async (req, res, next) => {
    try {
      const data = await TenantIsolationService.checkExport(orgOf(req), req.body.dataset, req.user!.id);
      res.status(data.allowed ? 200 : 403).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
