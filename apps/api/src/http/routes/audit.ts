import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import auditService from "../../audit/audit.service.js";
import { auditRoutesSchema } from "@windels/shared/audit";

export function registerAuditRoutes(router: Router) {
  // All audit routes require admin access
  router.use(authenticate, requireAdmin);

  /**
   * GET /api/v1/audit
   * Query audit logs with filters
   */
  router.get("/", validate({ query: auditRoutesSchema.query }), async (req, res, next) => {
    try {
      const filter = {
        organizationId: req.user!.organizationId,
        userId: req.query.userId as string | undefined,
        action: req.query.action as any,
        resourceType: req.query.resourceType as any,
        resourceId: req.query.resourceId as string | undefined,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      };

      const result = await auditService.query(filter);
      res.json({
        ok: true,
        data: result,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * GET /api/v1/audit/recent
   * Get recent audit logs for the organization
   */
  router.get("/recent", async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await auditService.getRecent(req.user!.organizationId!, limit);
      res.json({
        ok: true,
        data: logs,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * GET /api/v1/audit/stats
   * Get audit statistics by action type
   */
  router.get("/stats", async (req, res, next) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const stats = await auditService.getStats(req.user!.organizationId!, days);
      res.json({
        ok: true,
        data: { stats, period: { days } },
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * GET /api/v1/audit/export
   * Export audit logs for compliance
   */
  router.get("/export", validate({ query: auditRoutesSchema.export }), async (req, res, next) => {
    try {
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);
      const format = (req.query.format as "json" | "csv") || "json";

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error("Invalid date format");
      }

      if (endDate < startDate) {
        throw new Error("End date must be after start date");
      }

      const exportData = await auditService.export(
        req.user!.organizationId!,
        startDate,
        endDate,
        format,
      );

      res.setHeader("Content-Type", format === "json" ? "application/json" : "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audit-export-${startDate.toISOString().split("T")[0]}-to-${endDate.toISOString().split("T")[0]}.${format === "json" ? "json" : "csv"}"`,
      );
      res.send(exportData);
    } catch (e) {
      next(e);
    }
  });

  /**
   * GET /api/v1/audit/timeline
   * Daily buckets for last N days (zero-filled, deterministic)
   * Must be before /:id to avoid shadowing.
   */
  router.get("/timeline", validate({ query: auditRoutesSchema.timeline }), async (req, res, next) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 14;
      const entries = await auditService.getTimeline(req.user!.organizationId!, days);
      res.json({
        ok: true,
        data: { days, entries },
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * GET /api/v1/audit/:id
   * Single audit entry (org-scoped)
   */
  router.get("/:id", validate({ params: auditRoutesSchema.byId }), async (req, res, next) => {
    try {
      const entry = await auditService.getById(req.params.id as string, req.user!.organizationId!);
      res.json({
        ok: true,
        data: entry,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });
}
