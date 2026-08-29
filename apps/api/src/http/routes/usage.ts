/**
 * Session 55 — Enterprise Usage Intelligence (Session 123 completion).
 *
 * The three Session 55 endpoints keep their paths, request bodies, status
 * codes and response shapes:
 *
 *   GET  /usage-intel/dashboard/rollup   any authenticated member
 *   POST /usage-intel/events             requireAdmin → 201
 *   GET  /usage-intel/events             any authenticated member
 *
 * Session 123 changes (all additive):
 *   - the event body schema moved into the shared contract
 *     (`UsageEventSchema` — same fields, same rules);
 *   - `GET /events` clamps `?limit` to 1–1000 (default 100) instead of
 *     passing an arbitrary number to Redis;
 *   - the rollup's `ledger` block gains a `note` stating that the counts
 *     cover the most recent 100 recorded events — the number is a window,
 *     not the whole ledger;
 *   - every handler refuses a session carrying no organization with 403
 *     rather than building a Redis key containing the literal string
 *     "undefined".
 */
import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../../utils/result.js";
import { UsageService } from "../../usage/usage.service.js";
import { UsageEventsService } from "../../usage/usageEvents.service.js";
import { UsageEventSchema, UsageEventsQuerySchema } from "@windels/shared/usage";

export function registerUsageRoutes(router: Router) {
  const orgOf = (req: any): string => {
    const org = req.user?.organizationId ?? null;
    if (!org) {
      throw AppError.forbidden(
        "The usage ledger is organization-scoped and this session carries no organization.",
      );
    }
    return org;
  };

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const [rollup, evts] = await Promise.all([
        UsageService.dashboard(oid),
        UsageEventsService.list(oid, 100),
      ]);
      // Aggregate by feature for a real usage summary.
      const byFeature: Record<string, { quantity: number; count: number }> = {};
      for (const e of evts) {
        const k = e.data.feature;
        byFeature[k] = byFeature[k] ?? { quantity: 0, count: 0 };
        byFeature[k].quantity += e.data.quantity;
        byFeature[k].count += 1;
      }
      res.json({
        ok: true,
        data: {
          ...rollup,
          ledger: {
            total: evts.length,
            byFeature,
            // Session 123 — the counts cover the most recent 100 events, not
            // the whole ledger; say so rather than letting "total" read as
            // the ledger's full size.
            note: "Counts cover the most recent 100 recorded events, newest first.",
          },
        },
      });
    } catch (e) { next(e); }
  });

  router.post("/events", requireAdmin, validate({ body: UsageEventSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const rec = await UsageEventsService.record(oid, req.body, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.get("/events", validate({ query: UsageEventsQuerySchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      // Session 123 — clamp the limit instead of passing arbitrary input.
      const limit = Math.min(Number(req.query.limit ?? 100) || 100, 1000);
      const list = await UsageEventsService.list(oid, limit);
      res.json({ ok: true, data: list.map((e) => ({ id: e.id, createdAt: e.createdAt, ...e.data })) });
    } catch (e) { next(e); }
  });

  // Session 123 — single event fetch (org-scoped; the tenantStore re-checks
  // the record's organization on read).
  router.get("/events/:id", async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const rec = await UsageEventsService.get(oid, req.params.id);
      if (!rec) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Event not found" } });
      }
      res.json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, ...rec.data } });
    } catch (e) { next(e); }
  });

  // Session 123 — correction path: remove a mis-recorded event
  // (admin-gated like the write endpoint).
  router.delete("/events/:id", requireAdmin, async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const removed = await UsageEventsService.remove(oid, req.params.id);
      if (!removed) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Event not found" } });
      }
      res.json({ ok: true, data: { id: req.params.id, deleted: true } });
    } catch (e) { next(e); }
  });
}
