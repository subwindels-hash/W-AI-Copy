/**
 * Extension Platform routes (Session 28: Phase 27, Slices 236–244).
 * Mounted at /extensions behind authenticate + ORG_ADMIN.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { ExtensionRegistryService } from "../../extensions/registry.service.js";
import { BusinessModuleService } from "../../extensions/business.service.js";
import { IndustryModuleService } from "../../extensions/industry.service.js";
import { SkillsService } from "../../extensions/skills.service.js";
import { AgentsService } from "../../extensions/agents.service.js";
import { WorkflowExtService } from "../../extensions/workflowExt.service.js";
import { DashboardExtService } from "../../extensions/dashboardExt.service.js";
import { UIComponentsService } from "../../extensions/uiComponents.service.js";

const reviewSchema = z.object({
  author: z.string().min(1).max(80).default("admin"),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(2).max(500),
});
const transitionSchema = z.object({
  to: z.enum(["draft","submitted","validating","security_review","testing","approved","published",
              "installed","enabled","disabled","deprecated","retired","rejected"]),
  actor: z.string().default("admin"),
  note: z.string().max(200).optional(),
});
const versionSchema = z.object({
  version: z.string().min(2).max(30),
  changelog: z.string().min(2).max(500),
  minPlatformVersion: z.string().default("0.28.0"),
});

export function registerExtensionRoutes(router: Router) {
  // ── Registry (236+244) ──────────────────────────────────────
  router.get("/", async (req, res, next) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind as any : undefined;
      const status = typeof req.query.status === "string" ? req.query.status as any : undefined;
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      res.json({ ok: true, data: await ExtensionRegistryService.list({ kind, status, category, q }) });
    } catch (e) { next(e); }
  });
  router.get("/:id", async (req, res, next) => {
    try {
      const e = await ExtensionRegistryService.get(req.params.id);
      if (!e) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:e });
    } catch (e) { next(e); }
  });
  router.post("/:id/transition", validate({ body: transitionSchema }), async (req, res, next) => {
    try {
      const e = await ExtensionRegistryService.transition(req.params.id, req.body.to, req.body.actor, req.body.note);
      if (!e) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:e });
    } catch (e:any) {
      if (/Invalid transition/.test(e?.message??"")) return res.status(422).json({ ok:false, error:{code:"INVALID_TRANSITION", message:e.message} });
      next(e);
    }
  });
  router.post("/:id/install", async (req, res, next) => {
    try {
      const e = await ExtensionRegistryService.install(req.params.id, req.body?.version);
      if (!e) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:e });
    } catch (e:any) { next(e); }
  });
  router.post("/:id/uninstall", async (req, res, next) => {
    try {
      const e = await ExtensionRegistryService.uninstall(req.params.id);
      if (!e) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:e });
    } catch (e) { next(e); }
  });
  router.post("/:id/enable", async (req, res, next) => {
    try {
      const e = await ExtensionRegistryService.setEnabled(req.params.id, true);
      res.json({ ok:true, data:e });
    } catch (e) { next(e); }
  });
  router.post("/:id/disable", async (req, res, next) => {
    try {
      const e = await ExtensionRegistryService.setEnabled(req.params.id, false);
      res.json({ ok:true, data:e });
    } catch (e) { next(e); }
  });
  router.post("/:id/review", validate({ body: reviewSchema }), async (req, res, next) => {
    try {
      const e = await ExtensionRegistryService.review(req.params.id, req.body.author, req.body.rating, req.body.comment);
      if (!e) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:e });
    } catch (e) { next(e); }
  });
  router.post("/:id/version", validate({ body: versionSchema }), async (req, res, next) => {
    try {
      const e = await ExtensionRegistryService.releaseVersion(req.params.id, req.body.version, req.body.changelog, req.body.minPlatformVersion);
      if (!e) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:e });
    } catch (e) { next(e); }
  });

  // ── Business modules (237) ──────────────────────────────────
  router.get("/business/list", async (req, res, next) => {
    try {
      const c = typeof req.query.category === "string" ? req.query.category as any : undefined;
      res.json({ ok:true, data: await BusinessModuleService.list(c) });
    } catch (e) { next(e); }
  });
  router.get("/business/:id", async (req, res, next) => {
    try {
      const m = await BusinessModuleService.get(req.params.id);
      if (!m) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:m });
    } catch (e) { next(e); }
  });

  // ── Industry modules (238) ──────────────────────────────────
  router.get("/industry/list", async (req, res, next) => {
    try {
      const v = typeof req.query.vertical === "string" ? req.query.vertical as any : undefined;
      res.json({ ok:true, data: await IndustryModuleService.list(v) });
    } catch (e) { next(e); }
  });
  router.get("/industry/:id", async (req, res, next) => {
    try {
      const m = await IndustryModuleService.get(req.params.id);
      if (!m) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:m });
    } catch (e) { next(e); }
  });

  // ── AI Skills (239) ────────────────────────────────────────
  router.get("/skills/list", async (req, res, next) => {
    try {
      const c = typeof req.query.category === "string" ? req.query.category as any : undefined;
      res.json({ ok:true, data: await SkillsService.list(c) });
    } catch (e) { next(e); }
  });
  router.get("/skills/:id", async (req, res, next) => {
    try {
      const s = await SkillsService.get(req.params.id);
      if (!s) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:s });
    } catch (e) { next(e); }
  });
  router.post("/skills/:id/invoke", async (req, res, next) => {
    try {
      const s = await SkillsService.invoke(req.params.id);
      if (!s) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:s });
    } catch (e) { next(e); }
  });

  // ── Custom Agents (240) ────────────────────────────────────
  router.get("/agents/list", async (req, res, next) => {
    try {
      const d = typeof req.query.department === "string" ? req.query.department as any : undefined;
      res.json({ ok:true, data: await AgentsService.list(d) });
    } catch (e) { next(e); }
  });
  router.get("/agents/:id", async (req, res, next) => {
    try {
      const a = await AgentsService.get(req.params.id);
      if (!a) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:a });
    } catch (e) { next(e); }
  });

  // ── Workflow extensions (241) ──────────────────────────────
  router.get("/workflows/list", async (req, res, next) => {
    try {
      const c = typeof req.query.category === "string" ? req.query.category as any : undefined;
      res.json({ ok:true, data: await WorkflowExtService.list(c) });
    } catch (e) { next(e); }
  });
  router.get("/workflows/:id", async (req, res, next) => {
    try {
      const w = await WorkflowExtService.get(req.params.id);
      if (!w) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:w });
    } catch (e) { next(e); }
  });

  // ── Dashboard extensions (242) ─────────────────────────────
  router.get("/dashboards/list", async (_req, res, next) => {
    try { res.json({ ok:true, data: await DashboardExtService.list() }); } catch (e) { next(e); }
  });
  router.get("/dashboards/:id", async (req, res, next) => {
    try {
      const d = await DashboardExtService.get(req.params.id);
      if (!d) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:d });
    } catch (e) { next(e); }
  });

  // ── UI components (243) ────────────────────────────────────
  router.get("/ui/list", async (req, res, next) => {
    try {
      const c = typeof req.query.category === "string" ? req.query.category as any : undefined;
      res.json({ ok:true, data: await UIComponentsService.list(c) });
    } catch (e) { next(e); }
  });
  router.get("/ui/:id", async (req, res, next) => {
    try {
      const u = await UIComponentsService.get(req.params.id);
      if (!u) return res.status(404).json({ ok:false, error:{code:"NOT_FOUND"} });
      res.json({ ok:true, data:u });
    } catch (e) { next(e); }
  });

  // ── Aggregate dashboard ────────────────────────────────────
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try {
      const [all, biz, ind, sk, ag, wf, da, ui, recent, pending] = await Promise.all([
        ExtensionRegistryService.list(),
        BusinessModuleService.list(),
        IndustryModuleService.list(),
        SkillsService.list(),
        AgentsService.list(),
        WorkflowExtService.list(),
        DashboardExtService.list(),
        UIComponentsService.list(),
        ExtensionRegistryService.recentInstalls(8),
        ExtensionRegistryService.pendingReviewCount(),
      ]);
      const byKind = await ExtensionRegistryService.countByKind();
      const byStatus: Record<string,number> = {};
      for (const e of all) byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
      const ratings = all.filter(e => e.reviewCount > 0).map(e => e.ratingAvg);
      const avg = ratings.length ? ratings.reduce((a,b)=>a+b,0)/ratings.length : 0;
      res.json({ ok:true, data: {
        totalExtensions: all.length,
        installedCount: all.filter(e=>e.installed).length,
        enabledCount: all.filter(e=>e.enabled).length,
        byKind, byStatus,
        avgRating: +avg.toFixed(2),
        pendingReviews: pending,
        businessModules: biz.length,
        industryModules: ind.length,
        skills: sk.length,
        agents: ag.length,
        workflowExts: wf.length,
        dashboardExts: da.length,
        uiComponents: ui.length,
        certifiedCount: all.filter(e=>e.certified!=="community").length,
        recentInstalls: recent,
      }});
    } catch (e) { next(e); }
  });
}
