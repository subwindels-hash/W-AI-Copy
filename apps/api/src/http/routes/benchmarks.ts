/** Session 50 — Enterprise AI Benchmark Center routes
 *
 * Session 180: all handlers now require authenticate + orgOf (no org-windels fallback).
 */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import BenchmarksService from "../../benchmarks/benchmarks.service.js";
import { z } from "zod";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";
import { AppError } from "../../utils/result.js";

const run = z.object({
  area: z.enum(["ai_models","ai_employees","ai_workflows","voice_models","vision_models","translation_quality","coding_performance","response_accuracy","latency","resource_consumption","cost_efficiency","safety_metrics","reliability","user_satisfaction"]),
  targetId: z.string().optional(), targetName: z.string().min(1).max(200).optional(), notes: z.string().max(1000).optional(),
  metrics: z.array(z.object({ key: z.string().min(1).max(80), label: z.string().min(1).max(120), value: z.number(), unit: z.string().max(32), higherIsBetter: z.boolean(), baseline: z.number().optional(), target: z.number().optional() })).min(1).max(50),
  overallScore: z.number().min(0).max(100), passed: z.boolean(), evaluator: z.string().min(1).max(200), evidence: z.string().min(1).max(2000),
});
const sched = z.object({
  area: z.enum(["ai_models","ai_employees","ai_workflows","voice_models","vision_models","translation_quality","coding_performance","response_accuracy","latency","resource_consumption","cost_efficiency","safety_metrics","reliability","user_satisfaction"]),
  targetId: z.string().optional(),
  cron: z.string().regex(/^[\d\-\*\/,\?\sA-Za-z]+$/).default("0 0 * * *"),
  enabled: z.boolean().default(true),
});

function orgOf(req: any): string {
  const org = (req.user as any)?.organizationId ?? null;
  if (!org) throw AppError.forbidden("The benchmark register is organization-scoped and this session carries no organization.");
  return org;
}

export function registerBenchmarksRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard/rollup", async (req, res, next) => { try { res.json({ ok: true, data: await BenchmarksService.dashboard(orgOf(req)) }); } catch (e) { next(e); } });
  router.get("/runs", async (req, res, next) => { try { res.json({ ok: true, data: await BenchmarksService.listRuns(orgOf(req)) }); } catch (e) { next(e); } });
  router.post("/run", validate({ body: run }), async (req, res, next) => { try { res.json({ ok: true, data: await BenchmarksService.runBenchmark({ ...req.body, organizationId: orgOf(req) }) }); } catch (e) { next(e); } });
  router.post("/schedule", validate({ body: sched }), async (req, res, next) => { try { res.json({ ok: true, data: await BenchmarksService.schedule({ ...req.body, organizationId: orgOf(req) }) }); } catch (e) { next(e); } });


  // Real tenant-scoped notes ledger for benchmarks — user-authored annotations
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "bm:notes", idPrefix: "bm-" });
  const _NoteSchema = z_notes.object({
    title: z_notes.string().min(2).max(200),
    body: z_notes.string().min(2).max(4000),
    tags: z_notes.array(z_notes.string().max(40)).max(20).default([]),
  });
  const _NoteId = z_notes.object({ id: z_notes.string().min(3).max(64) });

  router.get("/notes", async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const list = await _notes.list(oid, 200);
      res.json({ ok: true, data: list.map((n) => ({ id: n.id, createdAt: n.createdAt, createdBy: n.createdBy, ...n.data })), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/notes", validate({ body: _NoteSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const rec = await _notes.create(oid, req.body, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/notes/:id", validate({ params: _NoteId, body: _NoteSchema.partial() }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const rec = await _notes.update(oid, req.params.id, req.body);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.delete("/notes/:id", validate({ params: _NoteId }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const ok = await _notes.delete(oid, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
}
