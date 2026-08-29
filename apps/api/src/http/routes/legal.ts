/** Session 66 — Legal Intelligence routes */
import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { LegalService } from "../../legal/legal.service.js";

const ResearchSchema = z.object({ query: z.string().min(3).max(2000) });
const UpdateIdParams = z.object({ id: z.string().min(3).max(64) });
const MatterIdParams = z.object({ id: z.string().min(3).max(64) });
const CreateMatterSchema = z.object({
  title: z.string().min(2).max(300),
  kind: z.enum(["litigation", "contract", "regulatory", "employment", "advisory", "ip", "privacy", "compliance"]),
  riskScore: z.number().int().min(0).max(100),
  dueDate: z.string().datetime().optional(),
  summary: z.string().max(4000).optional(),
});
const MatterStatusSchema = z.object({
  status: z.enum(["open", "active", "review", "closed"]),
});

function orgOr403(req: any, res: any): string | null {
  const org = req.user?.organizationId;
  if (!org) {
    res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "organization context required" } });
    return null;
  }
  return org;
}

export function registerLegalRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      const org = orgOr403(req, res); if (!org) return;
      res.json({ ok: true, data: await LegalService.dashboard(org), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/matters", validate({ body: CreateMatterSchema }), async (req, res, next) => {
    try {
      const org = orgOr403(req, res); if (!org) return;
      const m = await LegalService.createMatter(org, req.user!.id, req.body);
      res.status(201).json({ ok: true, data: m, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/matters/:id/status", validate({ params: MatterIdParams, body: MatterStatusSchema }), async (req, res, next) => {
    try {
      const org = orgOr403(req, res); if (!org) return;
      const m = await LegalService.updateMatterStatus(org, req.params.id, req.body.status);
      if (!m) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "matter not found" } });
      res.json({ ok: true, data: m, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/research", validate({ body: ResearchSchema }), async (req, res, next) => {
    try {
      const org = orgOr403(req, res); if (!org) return;
      res.json({ ok: true, data: await LegalService.research(req.body.query, org, req.user!.id), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/matters", async (req, res, next) => {
    try {
      const org = orgOr403(req, res); if (!org) return;
      res.json({ ok: true, data: await LegalService.listMatters(org), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.get("/contracts", async (req, res, next) => {
    try {
      const org = orgOr403(req, res); if (!org) return;
      res.json({ ok: true, data: await LegalService.listContracts(org), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.post("/contracts", validate({
    body: z.object({
      title: z.string().min(2).max(300),
      counterparty: z.string().min(1).max(200),
      type: z.enum(["nda", "msa", "sow", "employment", "vendor", "lease", "license", "other"]),
      valueUsd: z.number().min(0).optional(),
    }),
  }), async (req, res, next) => {
    try {
      const org = orgOr403(req, res); if (!org) return;
      const c = await LegalService.createContract(org, req.user!.id, req.body);
      res.status(201).json({ ok: true, data: c, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.get("/updates", async (req, res, next) => {
    try {
      const org = orgOr403(req, res); if (!org) return;
      res.json({ ok: true, data: await LegalService.listUpdates(org), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.post("/updates", validate({
    body: z.object({
      jurisdiction: z.string().min(1).max(80),
      title: z.string().min(2).max(300),
      topic: z.string().min(1).max(80),
      impact: z.enum(["low", "medium", "high", "critical"]),
      summary: z.string().max(4000).optional(),
    }),
  }), async (req, res, next) => {
    try {
      const org = orgOr403(req, res); if (!org) return;
      const u = await LegalService.createUpdate(org, req.body);
      res.status(201).json({ ok: true, data: u, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.get("/research", async (req, res, next) => {
    try {
      const org = orgOr403(req, res); if (!org) return;
      res.json({ ok: true, data: await LegalService.listResearch(org), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/updates/:id/acknowledge", validate({ params: UpdateIdParams }), async (req, res, next) => {
    try {
      const org = orgOr403(req, res); if (!org) return;
      const u = await LegalService.acknowledgeUpdate(req.params.id, org, req.user!.id);
      if (!u) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "update not found" } });
      res.json({ ok: true, data: u, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
