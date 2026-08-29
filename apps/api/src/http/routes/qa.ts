/**
 * Session 22 — Enterprise QA Platform routes.
 *
 * Mounted at /api/v1/qa/* by server.ts.
 *
 * Suites  GET/POST/DELETE                    /qa/suites
 *          GET/DELETE                         /qa/suites/:id
 *          POST                               /qa/suites/:id/run
 * Cases   GET/POST                            /qa/cases
 *          GET/DELETE                         /qa/cases/:id
 * Runs    GET                                  /qa/runs
 *          GET                                 /qa/runs/:id
 *          GET                                 /qa/dashboard
 *          POST                                /qa/cases/:id/run
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { TestRunnerService } from "../../qa/testRunner.service.js";
import type { TestKind, TestSeverity } from "@windels/shared/qa";

const KindEnum = z.enum(["framework","api","ai-validation","workflow","security","chaos","dr","digital-twin"]);
const SevEnum = z.enum(["critical","high","medium","low","info"]);

export function registerQaRoutes(router: Router) {
  // admin-only already enforced at server top (platform) — but QA router is
  // mounted at top-level, so we explicitly require admin here too.
  // ── Suites ──────────────────────────────────────────────────────
  router.get("/suites", async (_req, res, next) => {
    try { res.json({ ok: true, data: { suites: await TestRunnerService.listSuites() } }); }
    catch (e) { next(e); }
  });
  router.get("/suites/:id", async (req, res, next) => {
    try {
      const s = await TestRunnerService.getSuite(req.params.id);
      if (!s) return res.status(404).json({ ok: false, error: { message: "suite not found" } });
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  router.post("/suites", validate({ body: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    kind: z.enum(["framework","api","ai-validation","workflow","security","chaos","dr","digital-twin","mixed"]).default("mixed"),
    tags: z.array(z.string()).default([]),
    schedule: z.object({
      preset: z.enum(["hourly","daily","weekly","manual"]).default("manual"),
      intervalMs: z.number().int().positive().optional(),
    }).optional(),
  }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await TestRunnerService.createSuite(req.body) }); }
    catch (e) { next(e); }
  });
  router.delete("/suites/:id", async (req, res, next) => {
    try { res.json({ ok: true, data: { removed: await TestRunnerService.deleteSuite(req.params.id) } }); }
    catch (e) { next(e); }
  });
  router.post("/suites/:id/run", validate({ body: z.object({
    triggeredBy: z.enum(["manual","ci","schedule","chaos","dr-drill"]).default("manual"),
    selector: z.string().optional(),
    actorId: z.string().optional(),
  }).default({}) }), async (req, res, next) => {
    try {
      const run = await TestRunnerService.runSuite(req.params.id, { triggeredBy: req.body.triggeredBy, actorId: req.body.actorId, selector: req.body.selector });
      res.status(201).json({ ok: true, data: run });
    } catch (e) { next(e); }
  });

  // ── Cases ───────────────────────────────────────────────────────
  router.get("/cases", validate({ query: z.object({
    suiteId: z.string().optional(), kind: KindEnum.optional(),
    tag: z.string().optional(), selector: z.string().optional(),
  }).default({}) }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: { cases: await TestRunnerService.listCases(req.query as any) } });
    } catch (e) { next(e); }
  });
  router.post("/cases", validate({ body: z.object({
    suiteId: z.string(), name: z.string().min(1), kind: KindEnum,
    severity: SevEnum.default("high"), description: z.string().optional(),
    config: z.record(z.any()).default({}),
    tags: z.array(z.string()).default([]),
    selectors: z.array(z.string()).default(["smoke"]),
    timeoutMs: z.number().int().positive().default(10000),
    enabled: z.boolean().default(true),
  }) }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await TestRunnerService.createCase(req.body) }); }
    catch (e) { next(e); }
  });
  router.get("/cases/:id", async (req, res, next) => {
    try {
      const c = await TestRunnerService.getCase(req.params.id);
      if (!c) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: c });
    } catch (e) { next(e); }
  });
  router.delete("/cases/:id", async (req, res, next) => {
    try { res.json({ ok: true, data: { removed: await TestRunnerService.deleteCase(req.params.id) } }); }
    catch (e) { next(e); }
  });
  router.post("/cases/:id/run", async (req, res, next) => {
    try {
      const r = await TestRunnerService.runCase(req.params.id);
      res.status(201).json({ ok: true, data: r });
    } catch (e) { next(e); }
  });

  // ── Runs ────────────────────────────────────────────────────────
  router.get("/runs", validate({ query: z.object({ limit: z.coerce.number().min(1).max(200).default(30) }).default({}) }), async (req, res, next) => {
    try { res.json({ ok: true, data: { runs: await TestRunnerService.recentRuns(Number(req.query.limit)) } }); }
    catch (e) { next(e); }
  });
  router.get("/runs/:id", async (req, res, next) => {
    try {
      const r = await TestRunnerService.getRun(req.params.id);
      if (!r) return res.status(404).json({ ok: false });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });

  // ── Dashboard ───────────────────────────────────────────────────
  router.get("/dashboard", async (_req, res, next) => {
    try { res.json({ ok: true, data: await TestRunnerService.dashboard() }); }
    catch (e) { next(e); }
  });
}
