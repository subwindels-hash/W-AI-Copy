/**
 * Release management routes (Session 24).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { PipelineService } from "../../release/pipeline.service.js";
import { ApprovalService } from "../../release/approval.service.js";
import { AiValidationService } from "../../release/aiValidation.service.js";
import { StagingService } from "../../release/staging.service.js";
import { ProductionService } from "../../release/production.service.js";
import { ImprovementService } from "../../release/improvement.service.js";

const createBody = z.object({
  title: z.string().min(3).max(200),
  version: z.string().regex(/^\d+\.\d+\.\d+/, "must be semver"),
  service: z.string().min(2).max(60),
  strategy: z.enum(["rolling", "blue-green", "canary", "recreate"]),
  description: z.string().max(2000).optional(),
  changelog: z.array(z.string()).max(50).optional(),
  ticketRefs: z.array(z.string()).max(30).optional(),
  risk: z.enum(["low", "medium", "high", "critical"]).optional(),
});

const voteBody = z.object({
  gate: z.enum(["engineering_lead", "security_review", "qa_signoff", "product_owner", "change_advisory_board", "sre_oncall"]),
  status: z.enum(["approved", "rejected", "waived"]),
  comment: z.string().max(500).optional(),
});

const retroBody = z.object({
  category: z.enum(["went_well", "improve", "action"]),
  text: z.string().min(2).max(500),
});

export function registerReleaseRoutes(router: Router) {
  router.get("/", async (_req, res, next) => {
    try {
      const limit = Math.min(Number((_req.query as any).limit ?? 50), 200);
      res.json({ ok: true, data: await PipelineService.list(limit) });
    } catch (e) { next(e); }
  });

  router.post("/", validate({ body: createBody }), async (req, res, next) => {
    try {
      const r = await PipelineService.create({
        ...req.body,
        author: (req.user as any)?.email ?? "system",
      });
      await ApprovalService.seedGates(r.id, r.risk);
      res.json({ ok: true, data: r });
    } catch (e) { next(e); }
  });

  router.get("/metrics", async (_req, res, next) => {
    try { res.json({ ok: true, data: await ImprovementService.metrics() }); }
    catch (e) { next(e); }
  });

  router.get("/dora", async (_req, res, next) => {
    try {
      const m = await ImprovementService.metrics();
      res.json({ ok: true, data: m.dora });
    } catch (e) { next(e); }
  });

  const rel = Router({ mergeParams: true });

  // Load release onto req; skip subrouter if not found (return 404).
  router.use("/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      const r = await PipelineService.get(id);
      if (!r) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Release not found" } });
      }
      (req as any).release = r;
      next();
    } catch (e) { next(e); }
  }, rel);

  rel.get("/", (req, res) => res.json({ ok: true, data: (req as any).release }));

  rel.post("/validate", async (req, res, next) => {
    try {
      const v = await AiValidationService.run((req as any).release.id);
      res.json({ ok: true, data: v });
    } catch (e) { next(e); }
  });
  rel.get("/validation", async (req, res, next) => {
    try { res.json({ ok: true, data: await AiValidationService.get((req as any).release.id) }); }
    catch (e) { next(e); }
  });

  rel.get("/approvals", async (req, res, next) => {
    try {
      const r = (req as any).release;
      const [records, summary] = await Promise.all([
        ApprovalService.list(r.id),
        ApprovalService.summary(r.id, r.risk),
      ]);
      res.json({ ok: true, data: { records, summary } });
    } catch (e) { next(e); }
  });

  rel.post("/approve", validate({ body: voteBody }), async (req, res, next) => {
    try {
      const r = (req as any).release;
      const approver = (req.user as any)?.email ?? "system";
      const rec = await ApprovalService.vote(r.id, req.body.gate, approver, req.body.status, req.body.comment);
      const summary = await ApprovalService.summary(r.id, r.risk);
      if (summary.quorumMet) await PipelineService.setStatus(r.id, "approved");
      res.json({ ok: true, data: { record: rec, summary } });
    } catch (e) { next(e); }
  });

  rel.post("/deploy-staging", async (req, res, next) => {
    try {
      const r = (req as any).release;
      const summary = await ApprovalService.summary(r.id, r.risk);
      if (!summary.quorumMet && r.status !== "staging_validated") {
        return res.status(409).json({ ok: false, error: { code: "GATES_NOT_MET", message: "Approval quorum not met", data: summary } });
      }
      const dep = await StagingService.deploy(r.id);
      res.json({ ok: true, data: dep });
    } catch (e) { next(e); }
  });
  rel.get("/staging", async (req, res, next) => {
    try { res.json({ ok: true, data: await StagingService.get((req as any).release.id) }); }
    catch (e) { next(e); }
  });

  rel.post("/promote", async (req, res, next) => {
    try {
      const r = (req as any).release;
      const staging = await StagingService.get(r.id);
      if (!staging || staging.status !== "healthy") {
        return res.status(409).json({ ok: false, error: { code: "STAGING_UNHEALTHY", message: "Staging must be healthy before promotion" } });
      }
      const canaryPct = Math.min(Number((req.query as any).canary ?? 5), 50);
      const dep = await ProductionService.promote(r.id, canaryPct);
      res.json({ ok: true, data: dep });
    } catch (e) { next(e); }
  });
  rel.post("/rollout", async (req, res, next) => {
    try {
      const dep = await ProductionService.promote((req as any).release.id, 100);
      res.json({ ok: true, data: dep });
    } catch (e) { next(e); }
  });
  rel.post("/rollback", async (req, res, next) => {
    try {
      const dep = await ProductionService.rollback((req as any).release.id);
      await PipelineService.rollback((req as any).release.id);
      res.json({ ok: true, data: dep });
    } catch (e) { next(e); }
  });
  rel.get("/production", async (req, res, next) => {
    try { res.json({ ok: true, data: await ProductionService.get((req as any).release.id) }); }
    catch (e) { next(e); }
  });

  rel.get("/retro", async (req, res, next) => {
    try { res.json({ ok: true, data: await ImprovementService.listRetro((req as any).release.id) }); }
    catch (e) { next(e); }
  });
  rel.post("/retro", validate({ body: retroBody }), async (req, res, next) => {
    try {
      const author = (req.user as any)?.email ?? "system";
      const item = await ImprovementService.addRetro((req as any).release.id, req.body.category, req.body.text, author);
      res.json({ ok: true, data: item });
    } catch (e) { next(e); }
  });
}
