/**
 * Session 74 / Session 169 — Semantic Intelligence, Industry Solutions & Digital Operations routes.
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { IndustryService } from "../../industry/industry.service.js";
import {
  IndustryAdoptionSchema,
  IndustryAdoptionPatchSchema,
} from "@windels/shared";

function orgOf(req: any, res: any): string | null {
  const oid = req.user?.organizationId;
  if (!oid) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return oid;
}

function userOf(req: any): string | undefined {
  return req.user?.id;
}

const IdParams = z.object({ id: z.string().min(3).max(64) });

export function registerIndustryRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const oid = orgOf(req, res);
      if (!oid) return;
      const data = await IndustryService.dashboard(oid);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) {
      next(e);
    }
  });

  router.get("/suites", async (_req, res, next) => {
    try {
      res.json({ ok: true, data: IndustryService.listSuites() });
    } catch (e) {
      next(e);
    }
  });

  router.get("/adoptions", async (req, res, next) => {
    try {
      const oid = orgOf(req, res);
      if (!oid) return;
      const data = await IndustryService.listAdoptions(oid);
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  });

  router.get("/adoptions/:id", validate({ params: IdParams }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res);
      if (!oid) return;
      const data = await IndustryService.getAdoption(oid, req.params.id);
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "adoption not found" } });
      }
      res.json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  });

  router.post("/adoptions", requireAdmin, validate({ body: IndustryAdoptionSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res);
      if (!oid) return;
      const data = await IndustryService.createAdoption(oid, req.body, userOf(req));
      res.status(201).json({ ok: true, data });
    } catch (e) {
      next(e);
    }
  });

  router.patch(
    "/adoptions/:id",
    requireAdmin,
    validate({ params: IdParams, body: IndustryAdoptionPatchSchema }),
    async (req, res, next) => {
      try {
        const oid = orgOf(req, res);
        if (!oid) return;
        const data = await IndustryService.updateAdoption(oid, req.params.id, req.body);
        if (!data) {
          return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "adoption not found" } });
        }
        res.json({ ok: true, data });
      } catch (e) {
        next(e);
      }
    }
  );

  router.delete("/adoptions/:id", requireAdmin, validate({ params: IdParams }), async (req, res, next) => {
    try {
      const oid = orgOf(req, res);
      if (!oid) return;
      const ok = await IndustryService.deleteAdoption(oid, req.params.id);
      if (!ok) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "adoption not found" } });
      }
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });
}
