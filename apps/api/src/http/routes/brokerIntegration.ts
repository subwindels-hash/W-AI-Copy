// WINDELS AI OS — Broker Integration Layer routes (upgrade to Trading Intel).
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import {
  CreateBrokerAccountSchema, UpdateBrokerAccountSchema, TradeSignalSchema,
  CreateStrategySchema, UpdateRiskControlsSchema, BrokerIdSchema, StrategyIdSchema,
} from "@windels/shared/brokerIntegration";
import { BrokerIntegrationService, CONNECTOR_CATALOG } from "../../tradingIntel/brokerIntegration.service.js";

const brokerId = BrokerIdSchema;
const strategyId = StrategyIdSchema;

export function registerBrokerIntegrationRoutes(router: Router) {
  router.use(authenticate);
  const oid = (req: any) => req.user!.organizationId!;
  const uid = (req: any) => req.user!.id!;

  // Connector catalog
  router.get("/brokers/connectors", async (_req, res, next) => {
    try { res.json({ ok: true, data: CONNECTOR_CATALOG, meta: { requestId: _req.requestId } }); }
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

  // Positions & orders
  router.get("/brokers/accounts/:id/positions", validate({ params: brokerId }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.listPositions(oid(req), req.params.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });
  router.get("/brokers/accounts/:id/orders", validate({ params: brokerId }), async (req, res, next) => {
    try { res.json({ ok: true, data: await BrokerIntegrationService.listOrders(oid(req), req.params.id), meta: { requestId: req.requestId } }); }
    catch (e) { next(e); }
  });

  // Trade execution (supervisor)
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
}
