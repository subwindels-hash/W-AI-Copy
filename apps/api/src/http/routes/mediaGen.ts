/**
 * Session 42 — Universal Media Generation routes.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { MediaGenService } from "../../mediaGen/mediaGen.service.js";

const gen = z.object({
  modality: z.enum(["image", "audio", "video"]),
  op: z.string().min(2),
  prompt: z.string().min(1),
  childTargeted: z.boolean().optional(),
});

export function registerMediaGenRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await MediaGenService.dashboard() }); } catch (e) { next(e); }
  });
  router.get("/capabilities", async (req, res, next) => {
    try { res.json({ ok: true, data: await MediaGenService.capabilities(req.query.modality as any) }); } catch (e) { next(e); }
  });
  router.post("/generate", validate({ body: gen }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MediaGenService.generate(req.body.modality, req.body.op as any, req.body.prompt, !!req.body.childTargeted) }); } catch (e) { next(e); }
  });
  router.get("/jobs", async (_req, res, next) => {
    try { res.json({ ok: true, data: await MediaGenService.listJobs() }); } catch (e) { next(e); }
  });
}
