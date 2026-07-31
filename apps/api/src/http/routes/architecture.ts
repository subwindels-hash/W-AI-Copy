/**
 * Architecture introspection routes (Session 37).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ArchitectureService } from "../../architecture/architecture.service.js";

const signalBody = z.object({
  source: z.string(), signal: z.string(), confidence: z.number().min(0).max(1).default(0.75),
});

export function registerArchitectureRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ArchitectureService.status() }); } catch (e) { next(e); }
  });
  router.get("/status", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ArchitectureService.status() }); } catch (e) { next(e); }
  });
  router.get("/modules", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ArchitectureService.listModules() }); } catch (e) { next(e); }
  });
  router.get("/esi", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ArchitectureService.readEsi() }); } catch (e) { next(e); }
  });
  router.post("/esi/signals", validate({ body: signalBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ArchitectureService.pushEsiSignal(req.body) }); } catch (e) { next(e); }
  });
}
