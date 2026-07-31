/**
 * Developer Portal routes (Session 27: Enterprise Developer Platform, Slices 216–235).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { SDKRegistryService } from "../../devportal/sdkRegistry.service.js";
import { CLIService } from "../../devportal/cli.service.js";
import { EnvironmentService } from "../../devportal/environment.service.js";
import { ToolkitService } from "../../devportal/toolkit.service.js";

const testBody = z.object({
  suite: z.string().min(2).max(100).default("platform-smoke"),
  target: z.string().min(2).max(100).default("local"),
});
const deployBody = z.object({
  target: z.enum(["dev","staging","canary","production"]),
  service: z.string().min(2).max(60),
  version: z.string().min(2).max(40),
});
const envStartBody = z.object({}).optional();

export function registerDevPortalRoutes(router: Router) {
  // ─── SDK registry (216-229) ───────────────────────────
  router.get("/sdk", async (req, res, next) => {
    try {
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      res.json({ ok: true, data: await SDKRegistryService.list(category) });
    } catch (e) { next(e); }
  });
  router.get("/sdk/:id", async (req, res, next) => {
    try {
      const s = await SDKRegistryService.get(req.params.id);
      if (!s) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  router.post("/sdk/:id/download", async (req, res, next) => {
    try {
      await SDKRegistryService.recordDownload(req.params.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ─── CLI (230) ────────────────────────────────────────
  router.get("/cli", async (req, res, next) => {
    try {
      const group = typeof req.query.group === "string" ? req.query.group : undefined;
      res.json({ ok: true, data: await CLIService.list(group) });
    } catch (e) { next(e); }
  });

  // ─── Environments (231-233) ──────────────────────────
  router.get("/envs", async (_req, res, next) => {
    try { res.json({ ok: true, data: await EnvironmentService.list() }); } catch (e) { next(e); }
  });
  router.get("/envs/:id", async (req, res, next) => {
    try {
      const e = await EnvironmentService.get(req.params.id);
      if (!e) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: e });
    } catch (e) { next(e); }
  });
  router.post("/envs/:id/start", validate({ body: envStartBody }), async (req, res, next) => {
    try {
      const e = await EnvironmentService.start(req.params.id);
      if (!e) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: e });
    } catch (e) { next(e); }
  });
  router.post("/envs/:id/stop", async (req, res, next) => {
    try {
      const e = await EnvironmentService.stop(req.params.id);
      if (!e) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: e });
    } catch (e) { next(e); }
  });

  // ─── Toolkit (234-235) ───────────────────────────────
  router.post("/toolkit/test", validate({ body: testBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ToolkitService.runTests(req.body.suite, req.body.target) }); } catch (e) { next(e); }
  });
  router.get("/toolkit/test/runs", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ToolkitService.recentTestRuns() }); } catch (e) { next(e); }
  });
  router.post("/toolkit/deploy", validate({ body: deployBody }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await ToolkitService.deploy(req.body.target, req.body.service, req.body.version) });
    } catch (e) { next(e); }
  });
  router.get("/toolkit/deploy/runs", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ToolkitService.recentDeploys() }); } catch (e) { next(e); }
  });

  // ─── Rollup dashboard ────────────────────────────────
  router.get("/dashboard", async (_req, res, next) => {
    try {
      const [sdks, cli, envs, tests, deps, weeklyDl] = await Promise.all([
        SDKRegistryService.list(),
        CLIService.list(),
        EnvironmentService.list(),
        ToolkitService.recentTestRuns(5),
        ToolkitService.recentDeploys(5),
        SDKRegistryService.weeklyTotal(),
      ]);
      res.json({
        ok: true,
        data: {
          totalSdks: sdks.length,
          gaCount: sdks.filter(s=>s.status==="ga").length,
          betaCount: sdks.filter(s=>s.status==="beta").length,
          previewCount: sdks.filter(s=>s.status==="preview").length,
          totalCliCommands: cli.length,
          runningEnvironments: envs.filter(e=>e.status==="running").length,
          latestSdkVersion: "1.0.0",
          recentRuns: tests,
          recentDeploys: deps,
          weeklyDownloadsTotal: weeklyDl,
        },
      });
    } catch (e) { next(e); }
  });
}
