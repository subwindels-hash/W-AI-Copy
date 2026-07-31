/** Session 74 — Semantic Intelligence, Industry Solutions & Digital Operations */
import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { IndustryService } from "../../industry/industry.service.js";
import { tenantStore } from "../../utils/tenantStore.js";

// Real tenant-scoped store for user-authored industry deployments/adoption records
// on top of the deterministic seed rollup.
const adoptions = tenantStore<{
  industry: string;
  packageName: string;
  status: "planned" | "piloting" | "adopted" | "sunset";
  employees: number;
  notes?: string;
}>({ prefix: "ind:adopt", idPrefix: "ind-" });

const AdoptionSchema = z.object({
  industry: z.string().min(2).max(64),
  packageName: z.string().min(2).max(200),
  status: z.enum(["planned", "piloting", "adopted", "sunset"]),
  employees: z.number().int().min(0).max(1_000_000),
  notes: z.string().max(2000).optional(),
});

const IdParams = z.object({ id: z.string().min(3).max(64) });

export function registerIndustryRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const [rollup, adoptionList] = await Promise.all([
        IndustryService.dashboard(oid),
        adoptions.list(oid, 50),
      ]);
      res.json({
        ok: true,
        data: { ...rollup, adoptions: adoptionList.map((a) => ({ id: a.id, createdAt: a.createdAt, ...a.data })) },
        meta: { requestId: req.requestId },
      });
    } catch (e) { next(e); }
  });

  router.get("/adoptions", async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const list = await adoptions.list(oid, 200);
      res.json({ ok: true, data: list.map((a) => ({ id: a.id, createdAt: a.createdAt, ...a.data })) });
    } catch (e) { next(e); }
  });

  router.post("/adoptions", requireAdmin, validate({ body: AdoptionSchema }), async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const rec = await adoptions.create(oid, req.body, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.patch("/adoptions/:id", requireAdmin, validate({ params: IdParams, body: AdoptionSchema.partial() }), async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const rec = await adoptions.update(oid, req.params.id, req.body);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "adoption not found" } });
      res.json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.delete("/adoptions/:id", requireAdmin, validate({ params: IdParams }), async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const ok = await adoptions.delete(oid, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "adoption not found" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
}
