import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { EnterpriseSearchService } from "../../enterpriseSearch/enterpriseSearch.service.js";

const orgOf = (req: any) => req.user!.organizationId!;

const IdParam = z.object({ id: z.string().min(1).max(64) });
const VALID_TYPES = new Set([
  "contact", "company", "deal", "product", "supplier", "purchase_order",
  "sales_order", "message", "post", "comment", "ticket", "task", "project",
  "artifact", "report",
]);

export function registerEnterpriseSearchRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await EnterpriseSearchService.rollup(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/query", async (req, res, next) => {
    try {
      const q = String(req.query.q ?? "").trim();
      if (!q || q.length > 200) {
        return res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: "q is required (1–200 chars)" } });
      }
      const rawTypes = typeof req.query.types === "string" ? req.query.types.split(",") : [];
      const types = rawTypes.filter((t) => VALID_TYPES.has(t)) as any;
      const rawLimit = Number(req.query.limit ?? 25);
      const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.round(rawLimit))) : 25;
      const data = await EnterpriseSearchService.search(orgOf(req), { q, types, limit });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/history", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await EnterpriseSearchService.listHistory(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/history", async (req, res, next) => {
    try {
      await EnterpriseSearchService.clearHistory(orgOf(req));
      res.json({ ok: true, data: { cleared: true }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/history/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await EnterpriseSearchService.removeHistory(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Recent search not found" } });
      res.json({ ok: true, data: { removed: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
