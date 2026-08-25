/**
 * Sports Intelligence HTTP surface — /api/v1/sports-intel
 *
 * Authenticated, org-scoped. Settings / approvals / settlement overrides
 * require ORG_ADMIN. Automated execution cannot be enabled through this API.
 */

import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { SportsIntelligenceService as Si } from "../../sportsIntelligence/sportsIntelligence.service.js";
import {
  SiApproveTicketSchema,
  SiBacktestParamsSchema,
  SiGenerateTicketSchema,
  SiOverrideSettlementSchema,
  SiTicketConfigPatchSchema,
} from "@windels/shared/sportsIntelligence";

const orgOf = (req: any) => {
  const oid = req.user?.organizationId;
  if (!oid) {
    const err: any = new Error("organization context required");
    err.status = 403;
    err.code = "FORBIDDEN";
    throw err;
  }
  return oid as string;
};
const userOf = (req: any): string => req.user?.id ?? "unknown";

const IdParam = z.object({ id: z.string().min(3).max(80) });

async function requireAdmin(req: any, res: any, next: any) {
  try {
    const { hasPermission } = await import("../../services/permissions.service.js");
    const { Permission } = await import("@prisma/client");
    if (!(await hasPermission(req.user!.id, Permission.ORG_ADMIN))) {
      return res.status(403).json({ ok: false, error: { code: "FORBIDDEN", message: "Administrator permission required" } });
    }
    next();
  } catch (e) { next(e); }
}

export function registerSportsIntelligenceRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await Si.dashboard(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/config", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await Si.getConfig(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/config", requireAdmin, validate({ body: SiTicketConfigPatchSchema }), async (req, res, next) => {
    try {
      const data = await Si.updateConfig(orgOf(req), req.body, userOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e: any) {
      if (e.code === "AUTOMATION_DISABLED" || e.code === "INVALID_CONFIG") {
        return res.status(400).json({ ok: false, error: { code: e.code, message: e.message } });
      }
      next(e);
    }
  });

  router.get("/matches", async (req, res, next) => {
    try {
      const live = req.query.live === "true";
      const upcoming = req.query.upcoming === "true";
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      res.json({ ok: true, data: await Si.listMatches(orgOf(req), { live, upcoming, status }), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/matches/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await Si.getMatch(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Match not found" } });
      const odds = await Si.listOdds(orgOf(req), data.id);
      const predictions = await Si.listPredictions(orgOf(req), { matchId: data.id });
      res.json({ ok: true, data: { match: data, odds, predictions }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/odds", async (req, res, next) => {
    try {
      const matchId = typeof req.query.matchId === "string" ? req.query.matchId : undefined;
      res.json({ ok: true, data: await Si.listOdds(orgOf(req), matchId), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/predictions", async (req, res, next) => {
    try {
      const matchId = typeof req.query.matchId === "string" ? req.query.matchId : undefined;
      const decision = typeof req.query.decision === "string" ? req.query.decision : undefined;
      res.json({ ok: true, data: await Si.listPredictions(orgOf(req), { matchId, decision }), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/predictions/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await Si.decisionReport(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Prediction not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/tickets", async (req, res, next) => {
    try {
      const date = typeof req.query.date === "string" ? req.query.date : undefined;
      const data = date ? await Si.dailyTickets(orgOf(req), date) : await Si.listTickets(orgOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/tickets/daily", async (req, res, next) => {
    try {
      const date = typeof req.query.date === "string" ? req.query.date : undefined;
      res.json({ ok: true, data: await Si.dailyTickets(orgOf(req), date), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/tickets/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await Si.getTicket(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Ticket not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/tickets/generate", requireAdmin, validate({ body: SiGenerateTicketSchema }), async (req, res, next) => {
    try {
      const result = await Si.generateDailyTicket(orgOf(req), userOf(req));
      res.status(201).json({ ok: true, data: result.ticket, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/tickets/:id/approve", requireAdmin, validate({ params: IdParam, body: SiApproveTicketSchema }), async (req, res, next) => {
    try {
      const data = await Si.approveTicket(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Ticket not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e: any) {
      if (e.code === "NO_QUALIFIED_TICKET") {
        return res.status(409).json({ ok: false, error: { code: e.code, message: e.message } });
      }
      next(e);
    }
  });

  router.post("/tickets/:id/override", requireAdmin, validate({ params: IdParam, body: SiOverrideSettlementSchema }), async (req, res, next) => {
    try {
      const data = await Si.overrideSettlement(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Ticket not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/results", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await Si.listResults(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/performance", async (req, res, next) => {
    try {
      const range = typeof req.query.range === "string" ? req.query.range : undefined;
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;
      res.json({ ok: true, data: await Si.performance(orgOf(req), { range, from, to }), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/backtests", requireAdmin, validate({ body: SiBacktestParamsSchema }), async (req, res, next) => {
    try {
      const data = await Si.backtest(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/backtests", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await Si.listBacktests(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/models", async (req, res, next) => {
    try {
      const [versions, metrics, alerts] = await Promise.all([
        Si.modelVersions(orgOf(req)),
        Si.modelMetrics(orgOf(req)),
        Si.driftAlerts(orgOf(req)),
      ]);
      res.json({ ok: true, data: { versions, metrics, alerts }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/providers", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await Si.providerHealth(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/jobs", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await Si.listJobs(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/jobs/:kind", requireAdmin, async (req, res, next) => {
    try {
      const kind = String(req.params.kind).toUpperCase() as any;
      const data = await Si.runJob(orgOf(req), kind, userOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/pipeline", requireAdmin, async (req, res, next) => {
    try {
      const data = await Si.runPipeline(orgOf(req), userOf(req));
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/audit", requireAdmin, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await Si.listAudit(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
