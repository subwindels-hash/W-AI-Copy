/**
 * Session 47 — Enterprise Memory Evolution Engine routes.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { MemoryEvolutionService } from "../../memoryEvolution/memoryEvolution.service.js";

const add = z.object({
  type: z.enum(["episodic","semantic","procedural","organizational","department","project","user","team","knowledge"]),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  scope: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
const recall = z.object({ type: z.string().optional(), scope: z.string().optional(), query: z.string().optional(), limit: z.number().int().positive().optional() });
const consol = z.object({ kind: z.enum(["merge","deduplicate","refine","age","forget"]).default("merge") });
const share = z.object({ agentId: z.string() });

export function registerMemoryEvolutionRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await MemoryEvolutionService.dashboard() }); } catch (e) { next(e); }
  });
  router.get("/memories", validate({ query: recall }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await MemoryEvolutionService.recall({ type: (req.query as any).type, scope: (req.query as any).scope, query: (req.query as any).query, limit: Number((req.query as any).limit ?? 20) }) });
    } catch (e) { next(e); }
  });
  router.post("/memories", validate({ body: add }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MemoryEvolutionService.add(req.body) }); } catch (e) { next(e); }
  });
  router.post("/consolidate", validate({ body: consol }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MemoryEvolutionService.consolidate(req.body.kind) }); } catch (e) { next(e); }
  });
  router.get("/consolidations", async (_req, res, next) => {
    try { res.json({ ok: true, data: await MemoryEvolutionService.listConsolidations() }); } catch (e) { next(e); }
  });
  router.post("/memories/:id/share", validate({ body: share }), async (req, res, next) => {
    try { res.json({ ok: true, data: await MemoryEvolutionService.share(req.params.id, req.body.agentId) }); } catch (e) { next(e); }
  });
}
