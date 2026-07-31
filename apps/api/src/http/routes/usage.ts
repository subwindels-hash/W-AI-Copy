/** Session 55 — Enterprise Usage Intelligence */
import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { UsageService } from "../../usage/usage.service.js";
import { tenantStore } from "../../utils/tenantStore.js";

// Tenant-scoped usage event ledger. Real writes; dashboard reads roll them up.
const events = tenantStore<{
  feature: string;
  actor: string;
  quantity: number;
  unit: string;
  meta?: Record<string, unknown>;
}>({ prefix: "usg:evt", idPrefix: "u-" });

const EventSchema = z.object({
  feature: z.string().min(2).max(64),
  actor: z.string().min(2).max(120),
  quantity: z.number().nonnegative().max(1e9),
  unit: z.string().min(1).max(24),
  meta: z.record(z.any()).optional(),
});

export function registerUsageRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const [rollup, evts] = await Promise.all([
        UsageService.dashboard(oid),
        events.list(oid, 100),
      ]);
      // Aggregate by feature for a real usage summary.
      const byFeature: Record<string, { quantity: number; count: number }> = {};
      for (const e of evts) {
        const k = e.data.feature;
        byFeature[k] = byFeature[k] ?? { quantity: 0, count: 0 };
        byFeature[k].quantity += e.data.quantity;
        byFeature[k].count += 1;
      }
      res.json({ ok: true, data: { ...rollup, ledger: { total: evts.length, byFeature } } });
    } catch (e) { next(e); }
  });

  router.post("/events", requireAdmin, validate({ body: EventSchema }), async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const rec = await events.create(oid, req.body, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.get("/events", async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const list = await events.list(oid, Number(req.query.limit ?? 100));
      res.json({ ok: true, data: list.map((e) => ({ id: e.id, createdAt: e.createdAt, ...e.data })) });
    } catch (e) { next(e); }
  });
}
