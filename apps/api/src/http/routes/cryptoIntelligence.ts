/**
 * Crypto Intelligence routes (Session 35). OPT-IN MODULE.
 * Mounted at /crypto-intel behind authenticate + ORG_ADMIN.
 * Returns disabled-by-default signals; trading endpoints require governance.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { CryptoIntelligenceService as Ci } from "../../cryptoIntelligence/cryptoIntelligence.service.js";

const enableSchema = z.object({ status: z.enum(["disabled","enabled-readonly","enabled-paper","enabled-live"]) });
const tradeSchema = z.object({
  side: z.enum(["buy","sell"]), symbol: z.string(), orderType: z.enum(["market","limit","stop-loss","take-profit"]).default("market"),
  amountUsd: z.number().optional(), amountAsset: z.number().optional(), limitPrice: z.number().optional(),
  reason: z.string(), confidence: z.number().min(0).max(1).default(0.7), riskLevel: z.enum(["low","medium","high","extreme"]).default("medium"),
  expectedSlippagePct: z.number().optional(), strategyId: z.string().optional(),
});
const approveSchema = z.object({ approver: z.string().optional() });

export function registerCryptoIntelligenceRoutes(router: Router) {
  // All endpoints respect the module-enabled flag.
  router.use(async (req, res, next) => {
    try {
      const cfg = await Ci.isEnabled();
      (req as any).ciEnabled = cfg.enabled; (req as any).ciStatus = cfg.status;
      next();
    } catch (e) { next(e); }
  });

  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Ci.summary() }); } catch (e) { next(e); }
  });
  router.post("/enable", validate({ body: enableSchema }), async (req, res, next) => {
    try { await Ci.setModuleStatus(req.body.status); res.json({ ok: true, data: await Ci.summary() }); } catch (e) { next(e); }
  });

  // Slice 295
  router.get("/chains", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Ci.listChains() }); } catch (e) { next(e); }
  });
  router.get("/markets", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Ci.listTickers() }); } catch (e) { next(e); }
  });
  // Slice 296
  router.get("/defi/protocols", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Ci.listProtocols() }); } catch (e) { next(e); }
  });
  router.get("/defi/yields", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Ci.listYields() }); } catch (e) { next(e); }
  });
  // Slice 297
  router.get("/wallets", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Ci.listWallets() }); } catch (e) { next(e); }
  });
  router.get("/portfolio", async (req, res, next) => {
    try { const w = typeof req.query.walletId === "string" ? req.query.walletId : undefined; res.json({ ok: true, data: await Ci.listPositions(w) }); } catch (e) { next(e); }
  });
  router.get("/security/alerts", async (req, res, next) => {
    try { const sev = typeof req.query.severity === "string" ? req.query.severity as any : undefined; res.json({ ok: true, data: await Ci.listAlerts(sev) }); } catch (e) { next(e); }
  });
  // Slice 298
  router.get("/strategies", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Ci.listStrategies() }); } catch (e) { next(e); }
  });
  router.get("/trades", async (req, res, next) => {
    try { const state = typeof req.query.state === "string" ? req.query.state as any : undefined; res.json({ ok: true, data: await Ci.listTrades({ state }) }); } catch (e) { next(e); }
  });
  router.post("/trades", validate({ body: tradeSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await Ci.proposeTrade({ ...req.body, approvalsReceived: 0, approvedBy: [] }) }); } catch (e: any) { if (e.code === "MODULE_DISABLED") return res.status(403).json({ok:false,error:{code:"MODULE_DISABLED",message:e.message}}); next(e); }
  });
  router.post("/trades/:id/approve", validate({ body: approveSchema }), async (req, res, next) => {
    try { const t = await Ci.approveTrade(req.params.id, req.body.approver ?? (req as any).user?.id ?? "admin"); if (!t) return res.status(404).json({ok:false}); res.json({ok:true,data:t}); } catch (e) { next(e); }
  });
  router.post("/trades/:id/reject", validate({ body: z.object({ reason: z.string() }) }), async (req, res, next) => {
    try { const t = await Ci.rejectTrade(req.params.id, req.body.reason); if (!t) return res.status(404).json({ok:false}); res.json({ok:true,data:t}); } catch (e) { next(e); }
  });
  // Slice 299
  router.get("/exchanges", async (_req, res, next) => {
    try { res.json({ ok: true, data: await Ci.listExchanges() }); } catch (e) { next(e); }
  });
}
