/** Session 49 — AI Capability Composer routes */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import ComposerService from "../../composer/composer.service.js";
import { z } from "zod";

const upsert = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  nodes: z.array(z.object({
    id: z.string(), kind: z.enum(["trigger","capability","logic","output"]),
    type: z.enum(["ocr","vision_analysis","translation","voice_generation","video_generation","knowledge_retrieval","ai_reasoning","crm_action","workflow_automation","notification","analytics"]).optional(),
    label: z.string(), x: z.number(), y: z.number(),
    config: z.record(z.string(), z.unknown()).default({}),
  })),
  edges: z.array(z.object({
    id: z.string(), source: z.string(), target: z.string(), label: z.string().optional(), condition: z.string().optional(),
  })),
});
const run = z.object({ input: z.record(z.string(), z.unknown()).optional() });

export function registerComposerRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => { try { res.json({ ok: true, data: await ComposerService.dashboard() }); } catch (e) { next(e); } });
  router.get("/workflows", async (_req, res, next) => { try { res.json({ ok: true, data: await ComposerService.list() }); } catch (e) { next(e); } });
  router.get("/workflows/:id", async (req, res, next) => { try { res.json({ ok: true, data: await ComposerService.get(req.params.id) }); } catch (e) { next(e); } });
  router.post("/workflows", validate({ body: upsert }), async (req, res, next) => { try { res.json({ ok: true, data: await ComposerService.upsert({ ...req.body, createdBy: req.user!.id }) }); } catch (e) { next(e); } });
  router.get("/workflows/:id/validate", async (req, res, next) => { try { res.json({ ok: true, data: await ComposerService.validate(req.params.id) }); } catch (e) { next(e); } });
  router.post("/workflows/:id/deploy", async (req, res, next) => { try { res.json({ ok: true, data: await ComposerService.deploy(req.params.id) }); } catch (e) { next(e); } });
  router.post("/workflows/:id/run", validate({ body: run }), async (req, res, next) => { try { res.json({ ok: true, data: await ComposerService.run(req.params.id, req.user!.id) }); } catch (e) { next(e); } });
  router.get("/runs", async (_req, res, next) => { try { res.json({ ok: true, data: await ComposerService.getRuns() }); } catch (e) { next(e); } });
  router.get("/library", async (_req, res) => res.json({ ok: true, data: (await import("../../composer/composer.service.js")).LIBRARY }));
}
