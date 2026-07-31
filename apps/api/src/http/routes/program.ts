/**
 * Program management routes (Session 25: AI Program Management, Slices 205–210).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { RoadmapService } from "../../program/roadmap.service.js";
import { SprintService } from "../../program/sprint.service.js";
import { RequirementsService } from "../../program/requirements.service.js";
import { ArchReviewService } from "../../program/archReview.service.js";
import { RiskService } from "../../program/risk.service.js";
import { ExecReportService } from "../../program/execReport.service.js";

const roadmapBody = z.object({
  title: z.string().min(3).max(200),
  year: z.number().int().min(2020).max(2099).optional(),
  vision: z.string().max(2000).optional(),
  themes: z.array(z.string()).max(30).optional(),
});
const initiativeBody = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  quarter: z.enum(["Q1","Q2","Q3","Q4"]).optional(),
  year: z.number().int().optional(),
  priority: z.enum(["p0","p1","p2","p3"]).optional(),
  owner: z.string().max(80).optional(),
  status: z.enum(["draft","proposed","approved","in_progress","completed","at_risk","blocked"]).optional(),
});
const storyBody = z.object({
  title: z.string().min(3).max(200),
  epic: z.string().max(80).optional(),
  points: z.number().int().min(0).max(100).optional(),
  status: z.enum(["backlog","ready","in_progress","in_review","done","blocked"]).optional(),
  tags: z.array(z.string()).max(20).optional(),
  acceptanceCriteria: z.array(z.string()).max(20).optional(),
});
const assignBody = z.object({ sprintId: z.string().nullable() });
const statusBody = z.object({ status: z.enum(["backlog","ready","in_progress","in_review","done","blocked"]) });
const riskBody = z.object({
  title: z.string().min(3).max(200),
  category: z.enum(["technical","schedule","resource","security","compliance","market","operational"]).optional(),
  likelihood: z.number().int().min(1).max(5).optional(),
  impact: z.number().int().min(1).max(5).optional(),
  owner: z.string().max(80).optional(),
  description: z.string().max(2000).optional(),
});
const mitigationBody = z.object({ action: z.string().min(3).max(300), owner: z.string().max(80) });
const reviewBody = z.object({
  title: z.string().min(3).max(200),
  scope: z.string().max(200).optional(),
  requestedBy: z.string().max(80).optional(),
});
const riskStatusBody = z.object({ status: z.enum(["identified","assessed","mitigating","accepted","resolved","escalated"]) });

export function registerProgramRoutes(router: Router) {
  // ─── Roadmaps (205) ─────────────────────────────────────
  router.get("/roadmaps", async (_req, res, next) => {
    try { res.json({ ok: true, data: await RoadmapService.list() }); } catch (e) { next(e); }
  });
  router.post("/roadmaps", validate({ body: roadmapBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await RoadmapService.create(req.body) }); } catch (e) { next(e); }
  });
  router.get("/roadmaps/:id", async (req, res, next) => {
    try {
      const r = await RoadmapService.get(req.params.id);
      if (!r) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.get("/roadmaps/:id/initiatives", async (req, res, next) => {
    try { res.json({ ok: true, data: await RoadmapService.listInitiatives(req.params.id) }); } catch (e) { next(e); }
  });
  router.post("/roadmaps/:id/initiatives", validate({ body: initiativeBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await RoadmapService.addInitiative(req.params.id, req.body) }); } catch (e) { next(e); }
  });

  // ─── Sprints (206) ──────────────────────────────────────
  router.get("/sprints", async (_req, res, next) => {
    try { res.json({ ok: true, data: await SprintService.listSprints() }); } catch (e) { next(e); }
  });
  router.get("/sprints/:id", async (req, res, next) => {
    try {
      const s = await SprintService.getSprint(req.params.id);
      if (!s) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  router.get("/sprints/:id/burndown", async (req, res, next) => {
    try { res.json({ ok: true, data: await SprintService.burndown(req.params.id) }); } catch (e) { next(e); }
  });
  router.get("/backlog", async (_req, res, next) => {
    try { res.json({ ok: true, data: await SprintService.listBacklog() }); } catch (e) { next(e); }
  });
  router.post("/stories", validate({ body: storyBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await SprintService.createStory(req.body) }); } catch (e) { next(e); }
  });
  router.post("/stories/:id/assign", validate({ body: assignBody }), async (req, res, next) => {
    try {
      const s = await SprintService.assignToSprint(req.params.id, req.body.sprintId);
      if (!s) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });
  router.post("/stories/:id/status", validate({ body: statusBody }), async (req, res, next) => {
    try {
      const s = await SprintService.setStoryStatus(req.params.id, req.body.status);
      if (!s) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: s });
    } catch (e) { next(e); }
  });

  // ─── Requirements Intel (207) ───────────────────────────
  router.get("/requirements", async (_req, res, next) => {
    try { res.json({ ok: true, data: await RequirementsService.list() }); } catch (e) { next(e); }
  });
  router.get("/requirements/intel", async (_req, res, next) => {
    try { res.json({ ok: true, data: await RequirementsService.intel() }); } catch (e) { next(e); }
  });

  // ─── Architecture Review (208) ──────────────────────────
  router.get("/arch-reviews", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ArchReviewService.list() }); } catch (e) { next(e); }
  });
  router.post("/arch-reviews", validate({ body: reviewBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await ArchReviewService.create(req.body) }); } catch (e) { next(e); }
  });
  router.post("/arch-reviews/:id/run", async (req, res, next) => {
    try {
      const r = await ArchReviewService.runAiReview(req.params.id);
      if (!r) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.get("/arch-hotspots", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ArchReviewService.hotspots() }); } catch (e) { next(e); }
  });

  // ─── Risk Management (209) ──────────────────────────────
  router.get("/risks", async (_req, res, next) => {
    try { res.json({ ok: true, data: await RiskService.list() }); } catch (e) { next(e); }
  });
  router.post("/risks", validate({ body: riskBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await RiskService.create(req.body) }); } catch (e) { next(e); }
  });
  router.get("/risks/matrix", async (_req, res, next) => {
    try { res.json({ ok: true, data: await RiskService.matrix() }); } catch (e) { next(e); }
  });
  router.post("/risks/:id/mitigations", validate({ body: mitigationBody }), async (req, res, next) => {
    try {
      const r = await RiskService.addMitigation(req.params.id, req.body.action, req.body.owner);
      if (!r) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });
  router.post("/risks/:id/status", validate({ body: riskStatusBody }), async (req, res, next) => {
    try {
      const r = await RiskService.setStatus(req.params.id, req.body.status);
      if (!r) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });

  // ─── Executive Reporting (210) ──────────────────────────
  router.get("/exec/latest", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ExecReportService.latest() }); } catch (e) { next(e); }
  });
  router.post("/exec/generate", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ExecReportService.generate() }); } catch (e) { next(e); }
  });
}
