import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import { PaginationQuery } from "@windels/shared/api";
import * as wf from "../../services/workflow.service.js";

export function registerWorkflowRoutes(router: Router) {
  router.use(authenticate);

  // ─── Workflows ────────────────────────────────────────────────
  router.get(
    "/",
    validate({ query: PaginationQuery.extend({ status: z.string().optional() }) }),
    async (req, res, next) => {
      try {
        const data = await wf.listWorkflows(req.user!.id, req.query as any);
        res.json({ ok: true, data, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  router.post("/", validate({ body: wf.CreateWorkflowSchema }), async (req, res, next) => {
    try {
      const data = await wf.createWorkflow(req.user!.id, req.body);
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const data = await wf.getWorkflow(req.user!.id, req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/:id", validate({ body: wf.UpdateWorkflowSchema }), async (req, res, next) => {
    try {
      const data = await wf.updateWorkflow(req.user!.id, req.params.id, req.body);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      await wf.deleteWorkflow(req.user!.id, req.params.id);
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ─── Execution ────────────────────────────────────────────────
  router.post(
    "/:id/run",
    validate({ body: wf.RunWorkflowSchema }),
    async (req, res, next) => {
      try {
        const data = await wf.runWorkflow(req.user!.id, req.params.id, req.body);
        res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  // ─── Runs ─────────────────────────────────────────────────────
  router.get(
    "/runs/list",
    validate({
      query: PaginationQuery.extend({
        workflowId: z.string().cuid().optional(),
        status: z.string().optional(),
      }),
    }),
    async (req, res, next) => {
      try {
        const data = await wf.listRuns(req.user!.id, req.query as any);
        res.json({ ok: true, data, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  router.get("/runs/:id", async (req, res, next) => {
    try {
      const data = await wf.getRun(req.user!.id, req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post(
    "/runs/:id/approve",
    validate({ body: z.object({ approved: z.boolean(), feedback: z.string().max(1000).optional() }) }),
    async (req, res, next) => {
      try {
        const data = await wf.approveRun(req.user!.id, req.params.id, req.body.approved, req.body.feedback);
        res.json({ ok: true, data, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    }
  );

  router.post("/runs/:id/cancel", async (req, res, next) => {
    try {
      await wf.cancelRun(req.user!.id, req.params.id);
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ─── Analytics ────────────────────────────────────────────────
  router.get("/analytics/overview", async (req, res, next) => {
    try {
      const data = await wf.getAnalytics(req.user!.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
