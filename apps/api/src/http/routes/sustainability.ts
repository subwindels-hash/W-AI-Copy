/**
 * Session 64 — Sustainability & ESG routes (Session 121 completion).
 *
 * The three Session 64 endpoints keep their paths, request bodies, status
 * codes and response shapes:
 *
 *   GET  /sustainability/dashboard/rollup   any authenticated member
 *   GET  /sustainability/records            any authenticated member (?limit)
 *   POST /sustainability/activity           requireAdmin → 201
 *
 * Session 121 adds (additive):
 *   GET    /sustainability/records/:id      single record
 *   DELETE /sustainability/records/:id      correction path (requireAdmin)
 *
 * The activity body schema moved into the shared contract
 * (`SustainabilityActivitySchema`) — same fields, same rules, one definition
 * for API and web.
 *
 * Every handler refuses a session carrying no organization with 403 rather
 * than building a Redis key containing the literal string "undefined".
 */
import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../../utils/result.js";
import { SustainabilityService } from "../../sustainability/sustainability.service.js";
import {
  SustainabilityActivitySchema,
  SustainabilityRecordIdSchema,
} from "@windels/shared/sustainability";

export function registerSustainabilityRoutes(router: Router) {
  const orgOf = (req: any): string => {
    const org = req.user?.organizationId ?? null;
    if (!org) {
      throw AppError.forbidden(
        "The sustainability ledger is organization-scoped and this session carries no organization.",
      );
    }
    return org;
  };

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await SustainabilityService.dashboard(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Read back the raw ledger, so the derived dashboard can be audited against
  // the records it was computed from. `?limit` keeps its historical clamp
  // semantics (default 200, max 1000) — not a validation rejection.
  router.get("/records", async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 200) || 200, 1000);
      res.json({ ok: true, data: await SustainabilityService.listRecords(orgOf(req), limit), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Session 121 — single record (org-scoped).
  router.get("/records/:id", validate({ params: SustainabilityRecordIdSchema }), async (req, res, next) => {
    try {
      const record = await SustainabilityService.getRecord(orgOf(req), req.params.id);
      if (!record) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Record not found" } });
      }
      res.json({ ok: true, data: record, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Session 121 — correction path: remove a mis-entered record. Admin-gated
  // like the write endpoint.
  router.delete("/records/:id", requireAdmin, validate({ params: SustainabilityRecordIdSchema }), async (req, res, next) => {
    try {
      const out = await SustainabilityService.deleteRecord(orgOf(req), req.params.id);
      if (!out) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Record not found" } });
      }
      res.json({ ok: true, data: out, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/activity", requireAdmin, validate({ body: SustainabilityActivitySchema }), async (req, res, next) => {
    try {
      res.status(201).json({ ok: true, data: await SustainabilityService.record(orgOf(req), req.body), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
