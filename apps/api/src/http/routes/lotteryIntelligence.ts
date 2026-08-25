import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { LotteryIntelligenceService as Li } from "../../lotteryIntelligence/lotteryIntelligence.service.js";
import {
  LiAnalyzeSchema,
  LiBacktestParamsSchema,
  LiConfigPatchSchema,
  LiGenerateSchema,
  LiSystemSchema,
  LiTicketCreateSchema,
} from "@windels/shared/lotteryIntelligence";

const orgOf = (req: any) => {
  const oid = req.user?.organizationId;
  if (!oid) {
    const err: any = new Error("organization context required");
    err.status = 403; err.code = "FORBIDDEN";
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

async function isAdmin(req: any): Promise<boolean> {
  try {
    const { hasPermission } = await import("../../services/permissions.service.js");
    const { Permission } = await import("@prisma/client");
    return hasPermission(req.user!.id, Permission.ORG_ADMIN);
  } catch { return false; }
}

export function registerLotteryIntelligenceRoutes(router: Router) {
  router.use(authenticate);

  router.get("/dashboard", async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.dashboard(orgOf(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/rules", async (req, res, next) => {
    try { res.json({ ok: true, data: Li.rules(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/config", async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.getConfig(orgOf(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.patch("/config", requireAdmin, validate({ body: LiConfigPatchSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.updateConfig(orgOf(req), req.body, userOf(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/draws", async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.listDraws(orgOf(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/draws/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await Li.getDraw(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Draw not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/numbers", async (req, res, next) => {
    try {
      const lastN = req.query.lastN ? Number(req.query.lastN) : undefined;
      const window = typeof req.query.window === "string" ? req.query.window : undefined;
      res.json({ ok: true, data: await Li.numberIntelligence(orgOf(req), "MAIN", { lastN, window }), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/stars", async (req, res, next) => {
    try {
      const lastN = req.query.lastN ? Number(req.query.lastN) : undefined;
      const window = typeof req.query.window === "string" ? req.query.window : undefined;
      res.json({ ok: true, data: await Li.numberIntelligence(orgOf(req), "BONUS", { lastN, window }), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/distribution", async (req, res, next) => {
    try {
      const lastN = req.query.lastN ? Number(req.query.lastN) : undefined;
      res.json({ ok: true, data: await Li.distribution(orgOf(req), { lastN }), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/pairs", async (req, res, next) => {
    try {
      const kind = req.query.kind === "BONUS" ? "BONUS" : "MAIN";
      res.json({ ok: true, data: await Li.pairs(orgOf(req), kind), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/analyze", validate({ body: LiAnalyzeSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.analyze(orgOf(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e: any) {
      if (e.code === "INVALID_COMBINATION") return res.status(400).json({ ok: false, error: { code: e.code, message: e.message } });
      next(e);
    }
  });

  router.post("/generate", validate({ body: LiGenerateSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.generate(orgOf(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e: any) {
      if (e.code === "MODULE_DISABLED" || e.code === "INVALID_CONSTRAINT" || e.code === "INSUFFICIENT_POOL") {
        return res.status(400).json({ ok: false, error: { code: e.code, message: e.message } });
      }
      next(e);
    }
  });

  router.post("/system", validate({ body: LiSystemSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.systemPlan(orgOf(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e: any) {
      if (e.code === "INVALID_COMBINATION") return res.status(400).json({ ok: false, error: { code: e.code, message: e.message } });
      next(e);
    }
  });

  router.get("/tickets", async (req, res, next) => {
    try {
      const admin = await isAdmin(req);
      res.json({ ok: true, data: await Li.listTickets(orgOf(req), userOf(req), admin), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/tickets", validate({ body: LiTicketCreateSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await Li.saveTicket(orgOf(req), userOf(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e: any) {
      if (e.code === "INVALID_COMBINATION") return res.status(400).json({ ok: false, error: { code: e.code, message: e.message } });
      next(e);
    }
  });

  router.get("/tickets/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const admin = await isAdmin(req);
      const data = await Li.getTicket(orgOf(req), userOf(req), req.params.id, admin);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Ticket not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/tickets/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const admin = await isAdmin(req);
      const ok = await Li.deleteTicket(orgOf(req), userOf(req), req.params.id, admin);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Ticket not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/performance", async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.performance(orgOf(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/backtests", validate({ body: LiBacktestParamsSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await Li.backtest(orgOf(req), req.body, userOf(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/backtests", async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.listBacktests(orgOf(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/strategies/compare", async (req, res, next) => {
    try {
      const lastN = Number(req.body?.lastN ?? 25);
      const strategies = Array.isArray(req.body?.strategies) ? req.body.strategies : ["BALANCED", "HISTORICAL", "RANDOM", "DIVERSIFIED"];
      res.json({ ok: true, data: await Li.compareStrategies(orgOf(req), strategies, lastN, userOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/providers", async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.providerHealth(), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/jobs", async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.listJobs(orgOf(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/jobs/:kind", requireAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.runJob(orgOf(req), String(req.params.kind).toUpperCase() as any, userOf(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.post("/pipeline", requireAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.runPipeline(orgOf(req), userOf(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  router.get("/audit", requireAdmin, async (req, res, next) => {
    try { res.json({ ok: true, data: await Li.listAudit(orgOf(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
}
