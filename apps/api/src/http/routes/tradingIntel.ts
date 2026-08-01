/**
 * Unified Global Financial Markets Intelligence & Trading Platform routes (Session 81).
 *
 * Session 35 /crypto-intel routes remain untouched. This file mounts the additive
 * unified surface covering forex/crypto/stocks/ETFs/commodities/futures/options/
 * indices/bonds/metals/energy/agriculture/digital assets with 18 agents, 20 pluggable
 * indicators, risk engine, predictive simulation, sentiment, and continuous learning.
 *
 * Hard rule: recommendations require human/governance approval — no auto-execution
 * unless the caller explicitly holds approved-automation permission (defense-in-depth).
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { TradingIntelService } from "../../tradingIntel/tradingIntel.service.js";
import { analyzeInstrument } from "../../tradingIntel/analysis.js";
import { marketData } from "../../tradingIntel/marketData.js";
import { listAgents, runAgent } from "../../tradingIntel/agents.js";
import { JournalService } from "../../tradingIntel/journal.js";
import { tenantStore } from "../../utils/tenantStore.js";
import { authenticate as _authenticate } from "../middleware/auth.js";
import { z as z_notes } from "zod";

const simBody = z.object({
  instrumentId: z.string(),
  scenarios: z.array(z.enum(["bull","bear","sideways","high-vol","liquidity-crisis","flash-crash","economic-announcement","geopolitical"])).optional(),
  horizon: z.string().default("7d"),
});
const proposeBody = z.object({
  instrumentId: z.string(),
  marketClass: z.enum(["forex","crypto","stocks","etfs","commodities","futures","options","indices","bonds","precious-metals","energy","agriculture","digital-assets"]),
  side: z.enum(["long","short"]),
  size: z.number().positive(),
  reason: z.string().optional(),
});
const hbBody = z.object({ signals: z.number().int().optional(), approved: z.number().int().optional(), blocked: z.number().int().optional() });

const analyzeQuery = z.object({
  symbol: z.string().min(1),
  marketClass: z.enum(["forex","crypto","stocks","etfs","commodities","futures","options","indices","bonds","precious-metals","energy","agriculture","digital-assets"]),
  timeframe: z.enum(["1m","5m","15m","1h","4h","1d","1w"]).optional(),
  limit: z.coerce.number().int().min(30).max(500).optional(),
  allowSynthetic: z.enum(["true","false"]).optional().default("true"),
  capitalUsd: z.coerce.number().positive().optional(),
  riskPerTradePct: z.coerce.number().positive().max(10).optional(),
});

export function registerTradingIntelRoutes(router: Router) {
  router.get("/dashboard/rollup", async (_req, res, next) => {
    try { res.json({ ok: true, data: await TradingIntelService.dashboard() }); } catch (e) { next(e); }
  });
  router.get("/agents", async (_req, res, next) => {
    try { res.json({ ok: true, data: await TradingIntelService.listAgents() }); } catch (e) { next(e); }
  });
  router.post("/agents/:key/heartbeat", validate({ body: hbBody }), async (req, res, next) => {
    try {
      const a = await TradingIntelService.agentHeartbeat(req.params.key as any, req.body.signals, req.body.approved, req.body.blocked);
      res.json({ ok: true, data: a });
    } catch (e) { next(e); }
  });
  router.get("/indicators", async (_req, res, next) => {
    try { res.json({ ok: true, data: await TradingIntelService.listIndicators() }); } catch (e) { next(e); }
  });
  router.get("/instruments", async (req, res, next) => {
    try {
      const mc = (req.query.marketClass as string | undefined) as any;
      res.json({ ok: true, data: await TradingIntelService.listInstruments(mc) });
    } catch (e) { next(e); }
  });
  router.get("/risk", async (_req, res, next) => {
    try { res.json({ ok: true, data: await TradingIntelService.riskProfile() }); } catch (e) { next(e); }
  });
  router.get("/positions", async (_req, res, next) => {
    try { res.json({ ok: true, data: await TradingIntelService.listPositions() }); } catch (e) { next(e); }
  });
  router.get("/sentiment", async (req, res, next) => {
    try { res.json({ ok: true, data: await TradingIntelService.listSentiment(Number(req.query.limit) || 40) }); } catch (e) { next(e); }
  });
  router.post("/simulate", validate({ body: simBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await TradingIntelService.runSimulation(req.body) }); } catch (e) { next(e); }
  });
  router.get("/economic-calendar", async (req, res, next) => {
    try { res.json({ ok: true, data: await TradingIntelService.economicEvents(Number(req.query.days) || 7) }); } catch (e) { next(e); }
  });
  router.get("/insights", async (req, res, next) => {
    try { res.json({ ok: true, data: await TradingIntelService.listInsights(Number(req.query.limit) || 30) }); } catch (e) { next(e); }
  });
  router.post("/propose", validate({ body: proposeBody }), async (req, res, next) => {
    try { res.json({ ok: true, data: await TradingIntelService.proposeTrade(req.body) }); } catch (e) { next(e); }
  });

  // Real multi-indicator analysis engine. Decision-support only (no execution).
  router.get("/analyze", validate({ query: analyzeQuery }), async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof analyzeQuery>;
      const result = await analyzeInstrument({
        symbol: q.symbol,
        marketClass: q.marketClass,
        timeframe: q.timeframe,
        limit: q.limit,
        allowSynthetic: q.allowSynthetic === "true",
        capitalUsd: q.capitalUsd,
        riskPerTradePct: q.riskPerTradePct,
      });
      if ("error" in result) {
        return res.status(503).json({ ok: false, error: { code: result.error, message: result.message } });
      }
      res.json({ ok: true, data: result });
    } catch (e) { next(e); }
  });

  router.get("/market-data/providers", async (_req, res, next) => {
    try { res.json({ ok: true, data: marketData.listProviders() }); } catch (e) { next(e); }
  });

  router.get("/agents/registry", async (_req, res, next) => {
    try { res.json({ ok: true, data: listAgents() }); } catch (e) { next(e); }
  });

  const agentRun = z.object({
    agent: z.enum(["trading-intel","forex","crypto","stocks","etfs","commodities","futures","options","bonds","technical","fundamental","market-structure","sentiment","risk-mgmt","strategy-opt","perf-analytics"]),
    symbol: z.string().min(1),
    marketClass: z.enum(["forex","crypto","stocks","etfs","commodities","futures","options","indices","bonds","precious-metals","energy","agriculture","digital-assets"]),
    timeframe: z.enum(["1m","5m","15m","1h","4h","1d","1w"]).optional(),
    limit: z.coerce.number().int().min(30).max(500).optional(),
    allowSynthetic: z.enum(["true","false"]).optional().default("true"),
    capitalUsd: z.coerce.number().positive().optional(),
    riskPerTradePct: z.coerce.number().positive().max(10).optional(),
  });

  router.get("/agents/run", validate({ query: agentRun }), async (req, res, next) => {
    try {
      const q = req.query as unknown as z.infer<typeof agentRun>;
      const out = await runAgent(q.agent, {
        symbol: q.symbol, marketClass: q.marketClass, timeframe: q.timeframe,
        limit: q.limit, allowSynthetic: q.allowSynthetic === "true",
        capitalUsd: q.capitalUsd, riskPerTradePct: q.riskPerTradePct,
      });
      if ("error" in out) return res.status(503).json({ ok: false, error: { code: out.error, message: out.message } });
      res.json({ ok: true, data: out });
    } catch (e) { next(e); }
  });

  // ── Trade Journal + Performance Analytics ──────────────────────
  const journalBody = z.object({
    symbol: z.string().min(1),
    marketClass: z.string().min(2),
    side: z.enum(["long","short"]),
    entryPrice: z.coerce.number().positive(),
    exitPrice: z.coerce.number().positive().optional(),
    size: z.coerce.number().positive(),
    sizeUnits: z.string().optional(),
    stopLoss: z.coerce.number().positive().optional(),
    takeProfit: z.coerce.number().positive().optional(),
    entryAt: z.string().optional(),
    exitAt: z.string().optional(),
    fees: z.coerce.number().nonnegative().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    broker: z.string().optional(),
    strategy: z.string().optional(),
    confidenceAtEntry: z.coerce.number().min(0).max(1).optional(),
    emotionAtEntry: z.string().optional(),
  });
  const closeBody = z.object({
    exitPrice: z.coerce.number().positive(),
    exitAt: z.string().optional(),
    fees: z.coerce.number().nonnegative().optional(),
    notes: z.string().optional(),
  });

  router.post("/journal", validate({ body: journalBody }), async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const t = await JournalService.addTrade(uid, req.body);
      res.json({ ok: true, data: t });
    } catch (e) { next(e); }
  });
  router.get("/journal", async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const status = (req.query.status as string | undefined) as "open"|"closed"|undefined;
      const symbol = typeof req.query.symbol === "string" ? req.query.symbol : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      res.json({ ok: true, data: await JournalService.listTrades(uid, { status, symbol, limit }) });
    } catch (e) { next(e); }
  });
  router.post("/journal/:id/close", validate({ body: closeBody }), async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const t = await JournalService.closeTrade(uid, req.params.id, req.body.exitPrice, req.body.exitAt, req.body.fees, req.body.notes);
      if (!t) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: t });
    } catch (e) { next(e); }
  });
  router.delete("/journal/:id", async (req, res, next) => {
    try {
      const uid = (req.user as any).id;
      const ok = await JournalService.deleteTrade(uid, req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  router.get("/analytics", async (_req, res, next) => {
    try {
      const uid = (_req.user as any).id;
      res.json({ ok: true, data: await JournalService.analytics(uid) });
    } catch (e) { next(e); }
  });


  // Real tenant-scoped notes ledger for tradingIntel — user-authored annotations
  // persisted in Redis. Every write is a real Redis write; every read reflects
  // real state.
  const _notes = tenantStore<{ title: string; body: string; tags: string[]; }>({ prefix: "ti:notes", idPrefix: "ti-" });
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
}
