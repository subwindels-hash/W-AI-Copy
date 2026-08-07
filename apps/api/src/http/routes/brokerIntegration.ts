// WINDELS AI OS — Broker Integration Layer routes (upgrade to Trading Intel).
import { Router, type Request, type Response, type NextFunction } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import {
  CreateBrokerAccountSchema, UpdateBrokerAccountSchema, TradeSignalSchema,
  CreateStrategySchema, UpdateRiskControlsSchema, BrokerIdSchema, StrategyIdSchema,
  ConnectAccountSchema, SyncAccountSchema, CandleQuerySchema, HistoryQuerySchema,
  BrokerOrderRequestSchema,
} from "@windels/shared/brokerIntegration";
import { BrokerIntegrationService, CONNECTOR_CATALOG, BROKER_AGENT_KEYS } from "../../tradingIntel/brokerIntegration.service.js";
import { connectorRegistry } from "../../tradingIntel/connectors/connector-registry.js";
import { Mt5Monitor } from "../../tradingIntel/mt5/mt5-monitor.js";
import { tradingEvents } from "../../tradingIntel/trading-events.js";
import { logger } from "../../config/logger.js";

const brokerId = BrokerIdSchema;
const strategyId = StrategyIdSchema;

export function registerBrokerIntegrationRoutes(router: Router) {
  router.use(authenticate);
  const oid = (req: Request) => (req as any).user!.organizationId!;
  const uid = (req: Request) => (req as any).user!.id!;

  // Connector catalog + live availability
  router.get("/brokers/connectors", async (_req, res, next) => {
    try {
      const availability = await connectorRegistry.probeAvailability();
      res.json({ ok: true, data: { catalog: CONNECTOR_CATALOG, live: availability }, meta: { requestId: _req.requestId } });
    }
    catch (e) { next(e); }
  });

  // Accounts
  router.get("/brokers/accounts", async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.listAccounts(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/brokers/accounts", validate({ body: CreateBrokerAccountSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await BrokerIntegrationService.createAccount(oid(req), uid(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.patch("/brokers/accounts/:id", validate({ params: brokerId, body: UpdateBrokerAccountSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.updateAccount(oid(req), req.params.id, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.delete("/brokers/accounts/:id", validate({ params: brokerId }), async (req, res, next) => {
    try { await BrokerIntegrationService.removeAccount(oid(req), req.params.id); res.json({ ok: true, meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/brokers/accounts/:id/verify", validate({ params: brokerId }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.verifyCredentials(oid(req), req.params.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Live connection management
  router.post("/brokers/accounts/:id/connect", validate({ params: brokerId, body: ConnectAccountSchema }), async (req, res, next) => {
    try {
      const acct = await BrokerIntegrationService.connectAccount(oid(req), uid(req), req.params.id, req.body);
      res.json({ ok: true, data: acct, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.post("/brokers/accounts/:id/disconnect", validate({ params: brokerId }), async (req, res, next) => {
    try {
      const acct = await BrokerIntegrationService.disconnectAccount(oid(req), uid(req), req.params.id);
      res.json({ ok: true, data: acct, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.post("/brokers/accounts/:id/sync", validate({ params: brokerId, body: SyncAccountSchema }), async (req, res, next) => {
    try {
      const scope = {
        account: req.body.scope.includes("account"),
        symbols: req.body.scope.includes("symbols"),
        positions: req.body.scope.includes("positions"),
        orders: req.body.scope.includes("orders"),
        history: req.body.scope.includes("history"),
        historyDays: req.body.historyDays,
      };
      const acct = await BrokerIntegrationService.syncAccount(oid(req), req.params.id, scope);
      res.json({ ok: true, data: acct, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.get("/brokers/accounts/:id/health", validate({ params: brokerId }), async (req, res, next) => {
    try {
      const h = await BrokerIntegrationService.connectorHealth(oid(req), req.params.id);
      const s = await BrokerIntegrationService.syncState(oid(req), req.params.id);
      res.json({ ok: true, data: { health: h, state: s }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Positions & orders
  router.get("/brokers/accounts/:id/positions", validate({ params: brokerId }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.listPositions(oid(req), req.params.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/brokers/accounts/:id/orders", validate({ params: brokerId }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.listOrders(oid(req), req.params.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/brokers/accounts/:id/symbols", validate({ params: brokerId }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.listSymbols(oid(req), req.params.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/brokers/accounts/:id/deals", validate({ params: brokerId, query: HistoryQuerySchema.partial() }), async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await BrokerIntegrationService.listDeals(oid(req), req.params.id, { days: (req.query as any).days ? Number((req.query as any).days) : undefined, symbol: (req.query as any).symbol }),
        meta: { requestId: req.requestId },
      });
    } catch (e) { next(e); }
  });
  router.get("/brokers/accounts/:id/candles", validate({ params: brokerId, query: CandleQuerySchema }), async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await BrokerIntegrationService.getCandles(oid(req), req.params.id, req.query as any),
        meta: { requestId: req.requestId },
      });
    } catch (e) { next(e); }
  });

  // Position management (close / modify SL/TP)
  router.post("/brokers/accounts/:id/positions/:ticket/close", validate({
    params: z.object({ id: z.string().min(1).max(64), ticket: z.string().min(1).max(32) }),
    body: z.object({ volume: z.number().positive().optional() }).default({}),
  }), async (req, res, next) => {
    try {
      const ex = await BrokerIntegrationService.closePosition(oid(req), uid(req), req.params.id, req.params.ticket, (req.body as any).volume);
      res.json({ ok: true, data: ex, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.patch("/brokers/accounts/:id/positions/:ticket", validate({
    params: z.object({ id: z.string().min(1).max(64), ticket: z.string().min(1).max(32) }),
    body: z.object({ sl: z.number().positive().optional(), tp: z.number().positive().optional() }),
  }), async (req, res, next) => {
    try {
      const ex = await BrokerIntegrationService.modifyPosition(oid(req), uid(req), req.params.id, req.params.ticket, req.body);
      res.json({ ok: true, data: ex, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
  router.post("/brokers/accounts/:id/orders/:orderId/cancel", validate({
    params: z.object({ id: z.string().min(1).max(64), orderId: z.string().min(1).max(128) }),
  }), async (req, res, next) => {
    try {
      const ex = await BrokerIntegrationService.cancelOrder(oid(req), uid(req), req.params.id, req.params.orderId);
      res.json({ ok: true, data: ex, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Direct order send (bypasses AI supervisor — for manual trades from UI; still passes risk).
  router.post("/brokers/accounts/:id/orders", validate({ params: brokerId, body: BrokerOrderRequestSchema }), async (req, res, next) => {
    try {
      // Route through submitSignal so risk/supervisor gates apply with source=manual.
      const body = req.body as any;
      const ex = await BrokerIntegrationService.submitSignal(oid(req), uid(req), {
        accountId: req.params.id, symbol: body.symbol, side: body.side, volume: body.volume,
        source: "manual-direct", stopLoss: body.sl, takeProfit: body.tp,
        price: body.price, orderType: body.type, comment: body.comment, magic: body.magic,
        slippage: body.slippage,
      });
      res.status(201).json({ ok: true, data: ex, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Trade execution (supervisor/AI path)
  router.post("/brokers/trade", validate({ body: TradeSignalSchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await BrokerIntegrationService.submitSignal(oid(req), uid(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/brokers/executions", async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.listExecutions(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/brokers/executions/:id/approve", validate({ params: z.object({ id: z.string().min(1).max(64) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.approveExecution(oid(req), req.params.id, uid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/brokers/executions/:id/reject", validate({ params: z.object({ id: z.string().min(1).max(64) }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.rejectExecution(oid(req), req.params.id, uid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Audit trail (from Mt5Monitor)
  router.get("/brokers/audit", async (req, res, next) => {
    try {
      const limit = Math.min(500, Math.max(1, Number((req.query as any).limit ?? 100)));
      res.json({ ok: true, data: await Mt5Monitor.recentAudit(oid(req), limit), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Strategies
  router.get("/brokers/strategies", async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.listStrategies(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/brokers/strategies", validate({ body: CreateStrategySchema }), async (req, res, next) => {
    try { res.status(201).json({ ok: true, data: await BrokerIntegrationService.createStrategy(oid(req), uid(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/brokers/strategies/:id/toggle", validate({ params: strategyId, body: z.object({ enabled: z.boolean() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.toggleStrategy(oid(req), req.params.id, req.body.enabled), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/brokers/strategies/:id/backtest", validate({ params: strategyId }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.backtestStrategy(oid(req), req.params.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.delete("/brokers/strategies/:id", validate({ params: strategyId }), async (req, res, next) => {
    try { await BrokerIntegrationService.removeStrategy(oid(req), req.params.id); res.json({ ok: true, meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Risk controls + kill switch
  router.get("/brokers/risk", async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.getRiskControls(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.patch("/brokers/risk", validate({ body: UpdateRiskControlsSchema }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.updateRiskControls(oid(req), req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/brokers/risk/kill-switch", validate({ body: z.object({ active: z.boolean() }) }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.updateRiskControls(oid(req), { killSwitch: req.body.active }), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Portfolio intelligence
  router.get("/brokers/portfolio", async (req, res, next) => {
    try {
      const accountId = (req.query.accountId as string) || undefined;
      res.json({ ok: true, data: await BrokerIntegrationService.portfolioIntelligence(oid(req), accountId), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // Command center
  router.get("/brokers/command-center", async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.commandCenter(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Dashboard rollup (single call for the trading dashboard UI).
  router.get("/brokers/dashboard", async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.dashboard(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // AI Broker Trading agents
  router.get("/brokers/agents", async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.listAgents(oid(req)), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  const agentKey = z.object({ key: z.enum(BROKER_AGENT_KEYS as unknown as [string, ...string[]]) });
  router.post("/brokers/agents/:key/heartbeat", validate({ params: agentKey }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.heartbeatAgent(oid(req), (req.params as any).key), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.post("/brokers/agents/:key/run", validate({ params: agentKey, body: z.record(z.any()).optional() }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.runAgent(oid(req), (req.params as any).key, req.body), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Server-Sent Events tick stream (live tick broadcast from connector to browser).
  // The browser holds one SSE connection per account; we pull from the connector
  // by subscribing to its tick emitter and replaying events through the response.
  router.get("/brokers/accounts/:id/ticks/stream", validate({ params: brokerId, query: z.object({ symbols: z.string().default("") }) }), async (req, res) => {
    const acctId = req.params.id;
    const orgId = oid(req);
    try {
      const account = await BrokerIntegrationService.getAccount(orgId, acctId);
      if (!account) { res.status(404).json({ ok: false, error: "account not found" }); return; }
      const connector = connectorRegistry.get(account.broker);
      if (!connector || !connector.isConnected(acctId)) {
        res.status(400).json({ ok: false, error: "account not connected" });
        return;
      }
      const symbols = ((req.query as any).symbols as string || "").split(",").map((s) => s.trim()).filter(Boolean);
      res.setHeader("content-type", "text/event-stream");
      res.setHeader("cache-control", "no-cache");
      res.setHeader("connection", "keep-alive");
      res.setHeader("x-accel-buffering", "no");
      res.flushHeaders?.();

      const handler = (_aid: string, tick: any) => {
        try { res.write(`data: ${JSON.stringify(tick)}\n\n`); } catch { /* client gone */ }
      };
      await connector.subscribeTicks(acctId, symbols, handler);

      const hb = setInterval(() => {
        try { res.write(": hb\n\n"); } catch {}
      }, 15000);

      req.on("close", () => {
        clearInterval(hb);
        connector.unsubscribeTicks(acctId, symbols).catch((e) => logger.warn("tick unsubscribe failed", { err: (e as Error).message }));
      });
    } catch (e: any) {
      logger.warn("SSE tick stream setup failed", { err: e.message });
      if (!res.headersSent) res.status(500).json({ ok: false, error: e.message });
      else res.end();
    }
  });

  // Unified org-scoped SSE stream for all trading events (ticks, orders, positions,
  // executions, account state). Any connected connector (MT5 or crypto) whose
  // connect() was invoked with _oid on config will emit into tradingEvents; this
  // endpoint fans those events out to the browser for the authenticated org only.
  router.get("/brokers/events/stream", async (req, res) => {
    const orgId = oid(req);
    try {
      res.setHeader("content-type", "text/event-stream");
      res.setHeader("cache-control", "no-cache");
      res.setHeader("connection", "keep-alive");
      res.setHeader("x-accel-buffering", "no");
      res.flushHeaders?.();
      res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, t: new Date().toISOString() })}\n\n`);

      const off = tradingEvents.on(orgId, (evt) => {
        try { res.write(`event: ${evt.kind}\ndata: ${JSON.stringify(evt)}\n\n`); } catch { /* client gone */ }
      });

      const hb = setInterval(() => {
        try { res.write(": hb\n\n"); } catch {}
      }, 15000);

      req.on("close", () => {
        clearInterval(hb);
        off();
      });
    } catch (e: any) {
      logger.warn("SSE events stream setup failed", { err: e.message });
      if (!res.headersSent) res.status(500).json({ ok: false, error: e.message });
      else res.end();
    }
  });
}
