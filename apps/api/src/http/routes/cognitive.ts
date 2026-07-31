/** Session 69 — Cognitive Evolution & World Intelligence (V9.0) */
import { Router } from "express";
import { z } from "zod";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { CognitiveService } from "../../cognitive/cognitive.service.js";
import { tenantStore } from "../../utils/tenantStore.js";

// Cognitive observations: user-recorded insights the platform's cognitive layer
// collected. Persisted per-tenant.
const observations = tenantStore<{
  topic: string;
  claim: string;
  confidence: number;   // 0..1
  evidence: string[];
  source: string;
}>({ prefix: "cog:obs", idPrefix: "cog-" });

const ObsSchema = z.object({
  topic: z.string().min(2).max(120),
  claim: z.string().min(2).max(2000),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().max(500)).max(20).default([]),
  source: z.string().max(120),
});
const Id = z.object({ id: z.string().min(3).max(64) });

export function registerCognitiveRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const [rollup, obs] = await Promise.all([
        CognitiveService.dashboard(oid),
        observations.list(oid, 50),
      ]);
      res.json({ ok: true, data: { ...rollup, observations: obs.map((o) => ({ id: o.id, createdAt: o.createdAt, ...o.data })) } });
    } catch (e) { next(e); }
  });

  router.get("/observations", async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      res.json({ ok: true, data: (await observations.list(oid, 200)).map((o) => ({ id: o.id, createdAt: o.createdAt, ...o.data })) });
    } catch (e) { next(e); }
  });

  router.post("/observations", requireAdmin, validate({ body: ObsSchema }), async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const rec = await observations.create(oid, req.body, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.delete("/observations/:id", requireAdmin, validate({ params: Id }), async (req, res, next) => {
    try {
      const oid = (req.user as any).organizationId;
      const ok = await observations.delete(oid, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
}
