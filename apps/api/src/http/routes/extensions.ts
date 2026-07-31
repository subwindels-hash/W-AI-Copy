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
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

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
  // Real tenant-scoped notes ledger for extensions — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "ext:notes", idPrefix: "ext-" });
  const _NoteSchema = z_notes.object({
    title: z_notes.string().min(2).max(200),
    body: z_notes.string().min(2).max(4000),
    tags: z_notes.array(z_notes.string().max(40)).max(20).default([]),
  });
  const _NoteId = z_notes.object({ id: z_notes.string().min(3).max(64) });

  router.get("/notes", async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const list = await _notes.list(oid, 200);
      res.json({ ok: true, data: list.map((n) => ({ id: n.id, createdAt: n.createdAt, createdBy: n.createdBy, ...n.data })), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/notes", validate({ body: _NoteSchema }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.create(oid, req.body, (req.user as any).id);
      res.status(201).json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/notes/:id", validate({ params: _NoteId, body: _NoteSchema.partial() }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const rec = await _notes.update(oid, req.params.id, req.body);
      if (!rec) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: { id: rec.id, createdAt: rec.createdAt, createdBy: rec.createdBy, ...rec.data } });
    } catch (e) { next(e); }
  });

  router.delete("/notes/:id", validate({ params: _NoteId }), async (req, res, next) => {
    try {
      const oid = (req.user as any)?.organizationId;
      if (!oid) return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
      const ok = await _notes.delete(oid, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });

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
