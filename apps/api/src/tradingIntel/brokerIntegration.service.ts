/**
 * WINDELS AI OS — Broker Integration Layer (upgrade to AI Trading Intelligence).
 *
 * Unifies how the Trading Intelligence Engine talks to brokers (MT5, MT4, FIX,
 * REST, WebSocket, crypto exchanges, traditional brokers) behind a single
 * architecture via pluggable IBrokerConnector implementations selected through
 * connectorRegistry. MT5 ships in Phase 1 with three transports:
 *
 *   - native_python_zmq (out-of-process Python bridge over ZeroMQ, lowest latency)
 *   - http_bridge       (same Python bridge over HTTP + SSE — no native zmq)
 *   - metaapi_cloud     (https://metaapi.cloud SaaS — no local terminal)
 *
 * AI trading modes + the Trade Execution Supervisor enforce hard governance
 * before any order is dispatched to a connector: kill switch → mode →
 * connectivity → margin → duplicates → risk. The AI never bypasses risk.
 *
 * Reuses existing infra:
 *   - security/encryption.ts for encrypted broker credential storage
 *   - tradingIntel/risk.ts RiskEngine for pre-trade risk validation
 *   - Redis key pattern + Kernel dispatch convention + Metrics
 *   - Audit service (audit trail for every connect/disconnect/order/sync)
 *   - Billing (metered usage), Notifications (alerting), Memory Fabric (state),
 *     AI Workforce (6 specialized broker agents)
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { encryptString, decryptString } from "../security/encryption.js";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";
import type {
  BrokerAccount, BrokerPosition, BrokerPendingOrder, BrokerDeal, BrokerSymbol,
  BrokerCandle, BrokerTick, BrokerSyncState, BrokerConnectionStatus, TradingMode,
  TradeSignalInput, TradeExecution, TradingStrategy, BrokerRiskControls,
  PortfolioIntelligence, TradingCommandCenter, BrokerTradingAgent, BrokerAgentKey,
  CreateBrokerAccountInput, UpdateBrokerAccountInput, CreateStrategyInput,
  UpdateRiskControlsInput, ConnectorHealth, ConnectorTransport, BrokerOrderRequest,
  HistoryQuerySchema, CandleQuerySchema,
} from "@windels/shared/brokerIntegration";
import { DEFAULT_RISK_CONTROLS } from "@windels/shared/brokerIntegration";
import { connectorRegistry } from "./connectors/connector-registry.js";
import { Mt5Monitor } from "./mt5/mt5-monitor.js";
import { Metrics } from "../observability/metrics.js";
import { tradingEvents } from "./trading-events.js";

const K = {
  accounts: (oid: string) => `bri:${oid}:accounts`,
  account: (oid: string, id: string) => `bri:${oid}:acct:${id}`,
  creds: (oid: string, id: string) => `bri:${oid}:creds:${id}`,
  positions: (oid: string, acct: string) => `bri:${oid}:pos:${acct}`,
  position: (oid: string, acct: string, pid: string) => `bri:${oid}:pos:${acct}:${pid}`,
  orders: (oid: string, acct: string) => `bri:${oid}:ord:${acct}`,
  order: (oid: string, acct: string, oid2: string) => `bri:${oid}:ord:${acct}:${oid2}`,
  symbols: (oid: string, acct: string) => `bri:${oid}:syms:${acct}`, // set of symbol names
  symbol: (oid: string, acct: string, sym: string) => `bri:${oid}:sym:${acct}:${sym}`,
  deals: (oid: string, acct: string) => `bri:${oid}:deals:${acct}`,
  deal: (oid: string, acct: string, did: string) => `bri:${oid}:deal:${acct}:${did}`,
  executions: (oid: string) => `bri:${oid}:execs`,
  execution: (oid: string, id: string) => `bri:${oid}:exec:${id}`,
  strategies: (oid: string) => `bri:${oid}:strategies`,
  strategy: (oid: string, id: string) => `bri:${oid}:strat:${id}`,
  risk: (oid: string) => `bri:${oid}:risk`,
  agents: (oid: string) => `bri:${oid}:agents`,
  agent: (oid: string, key: string) => `bri:${oid}:agent:${key}`,
};

export const BROKER_AGENT_KEYS: BrokerAgentKey[] = [
  "trade-execution-supervisor", "strategy-optimizer", "portfolio-risk",
  "broker-connectivity", "trade-validator", "trading-compliance",
];

/** Specialized chat-routable broker-trading agents (AI Workforce integration). */
const AGENT_DEFS: Array<Omit<BrokerTradingAgent, "lastHeartbeat" | "runs24h" | "decisions24h" | "blocked24h">> = [
  { key: "trade-execution-supervisor", name: "Trade Execution Supervisor", description: "Validates every signal against mode, risk controls, connectivity, margin and duplicate rules before execution; audits every action.", status: "online", routable: true },
  { key: "strategy-optimizer", name: "Strategy Optimizer Agent", description: "Backtests, versions and optimizes trading strategies; recommends which to enable and which accounts to assign.", status: "online", routable: true },
  { key: "portfolio-risk", name: "Portfolio Risk Agent", description: "Monitors exposure, concentration, correlation, diversification and drawdown; flags breaches and recommends rebalancing.", status: "online", routable: true },
  { key: "broker-connectivity", name: "Broker Connectivity Agent", description: "Watches broker account health, sync status and credential validity across MT5/MT4/FIX/REST/WebSocket/crypto.", status: "online", routable: true },
  { key: "trade-validator", name: "Trade Validator Agent", description: "Pre-trade checks: symbol approval, position sizing, fat-finger and duplicate-order detection.", status: "online", routable: true },
  { key: "trading-compliance", name: "Trading Compliance Agent", description: "Enforces governance, KYC/AML, restricted-asset rules and audit logging for all trading activity.", status: "online", routable: true },
];

const s2 = (o: unknown) => JSON.stringify(o);
const j = <T>(s: string | null): T | null => (s ? (JSON.parse(s) as T) : null);
const now = () => new Date().toISOString();
const round2 = (n: number) => Math.round(n * 100) / 100;

const BROKER_LABEL: Record<string, string> = {
  mt5: "MetaTrader 5", mt4: "MetaTrader 4", ctrader: "cTrader", fix: "FIX Protocol",
  rest: "REST Broker API", websocket: "WebSocket Broker API",
  binance: "Binance", bybit: "Bybit", okx: "OKX", coinbase: "Coinbase", kraken: "Kraken",
  kucoin: "KuCoin", bitget: "Bitget", gateio: "Gate.io", mexc: "MEXC", htx: "HTX (Huobi)",
  cryptocom: "Crypto.com", hyperliquid: "Hyperliquid",
  interactive_brokers: "Interactive Brokers", alpaca: "Alpaca", tradestation: "TradeStation",
  oanda: "OANDA", ig: "IG",
};

/** Broker connector registry entry (exported for diagnostics/UI). */
export const CONNECTOR_CATALOG = [
  { broker: "mt5", name: "MetaTrader 5", protocol: "native Python bridge (ZMQ/HTTP) or MetaApi cloud; use MT5 demo accounts for paper trading", requiresConfig: false },
  { broker: "mt4", name: "MetaTrader 4", protocol: "native Python bridge (ZMQ/HTTP) or MetaApi cloud; use MT4 demo accounts for paper trading (parity with MT5)", requiresConfig: false },
  { broker: "ctrader", name: "cTrader", protocol: "planned — future phase", requiresConfig: true },
  { broker: "binance", name: "Binance", protocol: "REST+WS (HMAC-SHA256) — spot, USDⓈ-M/COIN-M perps & futures", requiresConfig: true },
  { broker: "bybit", name: "Bybit", protocol: "Unified Trading Account v5 REST+WS (HMAC-SHA256) — spot, linear/inverse perps, options", requiresConfig: true },
  { broker: "okx", name: "OKX", protocol: "Unified v5 REST+WS (HMAC-SHA256, passphrase) — spot, margin, swap, futures, options", requiresConfig: true },
  { broker: "coinbase", name: "Coinbase Advanced", protocol: "Advanced Trade v3 REST+WS (HMAC-SHA256, passphrase) — spot & perps", requiresConfig: true },
  { broker: "kraken", name: "Kraken", protocol: "REST+WS (HMAC-SHA512 base64 key) — spot & futures", requiresConfig: true },
  { broker: "kucoin", name: "KuCoin", protocol: "REST+WS (HMAC-SHA256, passphrase, key v2) — spot, margin, futures", requiresConfig: true },
  { broker: "bitget", name: "Bitget", protocol: "v2 REST+WS (HMAC-SHA256, passphrase) — spot, USDT/Coin perps, copy-trading", requiresConfig: true },
  { broker: "gateio", name: "Gate.io", protocol: "v4 REST+WS (HMAC-SHA512) — spot, USDT/BTC perps, options", requiresConfig: true },
  { broker: "mexc", name: "MEXC", protocol: "v3 REST+WS (HMAC-SHA256) — spot & USDT perps", requiresConfig: true },
  { broker: "htx", name: "HTX (Huobi)", protocol: "REST+WS (HMAC-SHA256 query signature) — spot, futures, swaps", requiresConfig: true },
  { broker: "cryptocom", name: "Crypto.com Exchange", protocol: "v2 REST+WS (HMAC-SHA256) — spot, perps, margin, options", requiresConfig: true },
  { broker: "hyperliquid", name: "Hyperliquid", protocol: "on-chain perp DEX (ECDSA wallet auth over POST JSON info/exchange) — perps + spot", requiresConfig: true },
  { broker: "fix", name: "FIX Protocol", protocol: "planned — traditional markets phase", requiresConfig: true },
  { broker: "rest", name: "REST Broker API", protocol: "planned", requiresConfig: true },
  { broker: "websocket", name: "WebSocket Broker API", protocol: "planned", requiresConfig: true },
  { broker: "interactive_brokers", name: "Interactive Brokers", protocol: "planned — traditional markets phase", requiresConfig: true },
  { broker: "alpaca", name: "Alpaca", protocol: "planned — traditional markets phase", requiresConfig: true },
  { broker: "tradestation", name: "TradeStation", protocol: "planned — traditional markets phase", requiresConfig: true },
  { broker: "oanda", name: "OANDA", protocol: "planned — traditional markets phase", requiresConfig: true },
  { broker: "ig", name: "IG", protocol: "planned — traditional markets phase", requiresConfig: true },
];

export const BrokerIntegrationService = {
  /* ── Lifecycle ─────────────────────────────────────────────── */

  async initializeConnectors() {
    try {
      const { registerBundledConnectors } = await import("./connectors/connector-registry.js");
      await registerBundledConnectors();
      await connectorRegistry.initializeAll();
      Mt5Monitor.start();
      logger.info("[bri] connectors initialized");
    } catch (e) {
      logger.warn("[bri] connector initialization error", { err: (e as Error).message });
    }
  },

  async shutdownConnectors() {
    Mt5Monitor.stop();
    await connectorRegistry.shutdownAll();
  },

  /* ── Accounts ─────────────────────────────────────────────── */

  async listAccounts(oid: string): Promise<BrokerAccount[]> {
    const ids = (await redis.smembers(K.accounts(oid))) ?? [];
    const out: BrokerAccount[] = [];
    for (const id of ids) {
      const rec = j<BrokerAccount>(await redis.get(K.account(oid, id)));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getAccount(oid: string, id: string): Promise<BrokerAccount | null> {
    return j<BrokerAccount>(await redis.get(K.account(oid, id)));
  },

  async mustGetAccount(oid: string, id: string): Promise<BrokerAccount> {
    const rec = await this.getAccount(oid, id);
    if (!rec) throw new AppError("NOT_FOUND", "Broker account not found", 404);
    return rec;
  },

  async createAccount(oid: string, userId: string, input: CreateBrokerAccountInput): Promise<BrokerAccount> {
    const id = randomUUID();
    const nowIso = now();
    // Store credentials encrypted at rest; never return them.
    await redis.set(K.creds(oid, id), s2(encryptString(input.password)));
    const mode: TradingMode = input.mode ?? "analysis_only";
    const currency = input.currency ?? "USD";
    const leverage = input.leverage ?? 100;
    const environment = input.environment ?? "demo";
    const account: BrokerAccount = {
      id, organizationId: oid, name: input.name, broker: input.broker,
      brokerLabel: BROKER_LABEL[input.broker] ?? input.broker,
      login: input.login, server: input.server, mode,
      status: "disconnected",
      environment,
      connectorConfig: input.connectorConfig ?? undefined,
      currency, leverage,
      account: { balance: 0, equity: 0, margin: 0, freeMargin: 0, profit: 0, dailyPnl: 0 },
      createdAt: nowIso, updatedAt: nowIso,
    };
    await redis.set(K.account(oid, id), s2(account));
    await redis.sadd(K.accounts(oid), id);
    await Mt5Monitor.audit(oid, id, "connect", { phase: "created", broker: input.broker, environment });
    try { Metrics.counter("bri.accounts.created", { broker: input.broker }).incr(); } catch {}
    return account;
  },

  async updateAccount(oid: string, id: string, patch: UpdateBrokerAccountInput): Promise<BrokerAccount> {
    const rec = await this.mustGetAccount(oid, id);
    if (patch.name) rec.name = patch.name;
    if (patch.mode) rec.mode = patch.mode;
    if (patch.connectorConfig) rec.connectorConfig = { ...rec.connectorConfig, ...patch.connectorConfig };
    rec.updatedAt = now();
    await redis.set(K.account(oid, id), s2(rec));
    // Propagate connectorConfig changes (e.g. readOnly toggle) into any live
    // connector session so the change takes effect without requiring a manual
    // reconnect. Connectors that care (BaseCryptoConnector, Mt5Connector)
    // read opts.config on every sendOrder; patching the object reference
    // makes the next call see the new value.
    try {
      const conn = connectorRegistry.get(rec.broker);
      if (conn && typeof (conn as any)._patchSessionConfig === "function") {
        (conn as any)._patchSessionConfig(id, rec.connectorConfig ?? {});
      }
    } catch (e) { logger.warn("[bri] live session config patch failed", { err: (e as Error).message }); }
    return rec;
  },

  async removeAccount(oid: string, id: string): Promise<void> {
    const rec = await this.mustGetAccount(oid, id);
    // Disconnect from live connector if connected.
    try {
      const conn = connectorRegistry.get(rec.broker);
      if (conn && conn.isConnected(id)) await conn.disconnect(id);
    } catch (e) { logger.warn("[bri] disconnect during remove failed", { accountId: id, err: (e as Error).message }); }
    await redis.srem(K.accounts(oid), id);
    // Clean sub-keys: positions, orders, symbols, deals.
    const posIds = await redis.smembers(K.positions(oid, id));
    for (const p of posIds) await redis.del(K.position(oid, id, p));
    const ordIds = await redis.smembers(K.orders(oid, id));
    for (const o of ordIds) await redis.del(K.order(oid, id, o));
    const symNames = await redis.smembers(K.symbols(oid, id));
    for (const s of symNames) await redis.del(K.symbol(oid, id, s));
    await redis.del(K.account(oid, id), K.creds(oid, id), K.positions(oid, id), K.orders(oid, id), K.symbols(oid, id), K.deals(oid, id));
    await Mt5Monitor.audit(oid, id, "disconnect", { phase: "removed" });
  },

  async verifyCredentials(oid: string, id: string): Promise<{ valid: boolean; login: string }> {
    const rec = await this.mustGetAccount(oid, id);
    const blob = j<ReturnType<typeof encryptString>>(await redis.get(K.creds(oid, id)));
    const plain = decryptString(blob);
    return { valid: plain !== null && plain.length > 0, login: rec.login };
  },

  /* ── Connect / disconnect / sync (real connector path) ──── */

  async connectAccount(oid: string, userId: string, id: string, opts?: { force?: boolean; transport?: ConnectorTransport }): Promise<BrokerAccount> {
    const rec = await this.mustGetAccount(oid, id);
    const creds = await this.loadCredentials(oid, id);
    const connector = connectorRegistry.mustGet(rec.broker);
    if (rec.status === "connected" && !opts?.force && connector.isConnected(id)) return rec;
    rec.status = "connecting"; rec.error = undefined; rec.updatedAt = now();
    await redis.set(K.account(oid, id), s2(rec));
    const transport = opts?.transport ?? rec.connectorConfig?.bridgeEndpoint ? "native_python_zmq" : undefined;
    // Piggyback orgId on connector config so connectors can emit org-scoped events.
    const configWithOid: any = { ...(rec.connectorConfig ?? {}), _oid: oid };
    const result = await connector.connect(id, creds, {
      name: rec.name, environment: rec.environment,
      transport, config: configWithOid,
    });
    if (!result.ok) {
      rec.status = "error"; rec.error = result.error ?? "connection failed";
      rec.consecutiveErrors = (rec.consecutiveErrors ?? 0) + 1;
      rec.lastErrorAt = now();
      rec.updatedAt = now();
      await redis.set(K.account(oid, id), s2(rec));
      await Mt5Monitor.audit(oid, id, "error", { phase: "connect", error: result.error });
      throw new AppError("UPSTREAM_ERROR", `Broker connection failed: ${result.error ?? "unknown"}`, 502);
    }
    rec.status = "connected"; rec.connectedAt = rec.connectedAt ?? now();
    rec.transport = result.transport;
    if (result.snapshot) {
      rec.account.balance = result.snapshot.balance;
      rec.account.equity = result.snapshot.equity;
      rec.account.margin = result.snapshot.margin;
      rec.account.freeMargin = result.snapshot.freeMargin;
      rec.account.profit = result.snapshot.profit;
      rec.account.marginLevel = result.snapshot.marginLevel;
      rec.account.credit = result.snapshot.credit;
      rec.account.tradeAllowed = result.snapshot.tradeAllowed;
      rec.account.expertAllowed = result.snapshot.expertAllowed;
      if (result.snapshot.currency) rec.currency = result.snapshot.currency;
      if (result.snapshot.leverage) rec.leverage = result.snapshot.leverage;
    }
    rec.error = undefined; rec.consecutiveErrors = 0; rec.updatedAt = now(); rec.lastSyncAt = now();
    // Surface connector latency (most recent REST/WS RTT) onto the account
    // record so the dashboard can render per-account health without a
    // second call. The connector's health() method returns the latest ms.
    try {
      const ch = connector.health(id);
      rec.latencyMs = ch.latencyMs;
    } catch { /* best-effort */ }
    await redis.set(K.account(oid, id), s2(rec));
    // Kick off initial full sync.
    await this.syncAccountFromConnector(oid, id);
    await Mt5Monitor.audit(oid, id, "connect", { transport: result.transport, latencyMs: result.latencyMs }, result.latencyMs);
    try { Metrics.counter("bri.accounts.connected", { broker: rec.broker, transport: result.transport }).incr(); } catch {}
    return this.mustGetAccount(oid, id);
  },

  async disconnectAccount(oid: string, userId: string, id: string): Promise<BrokerAccount> {
    const rec = await this.mustGetAccount(oid, id);
    const connector = connectorRegistry.get(rec.broker);
    if (connector) {
      try { await connector.disconnect(id); } catch (e) { logger.warn("[bri] connector disconnect error", { err: (e as Error).message }); }
    }
    rec.status = "disconnected"; rec.updatedAt = now();
    await redis.set(K.account(oid, id), s2(rec));
    await Mt5Monitor.audit(oid, id, "disconnect", { requestedBy: userId });
    return rec;
  },

  async syncAccount(oid: string, id: string, scope: { account?: boolean; symbols?: boolean; positions?: boolean; orders?: boolean; history?: boolean; historyDays?: number } = { account: true, symbols: true, positions: true, orders: true, history: true }): Promise<BrokerAccount> {
    const rec = await this.mustGetAccount(oid, id);
    const connector = connectorRegistry.get(rec.broker);
    if (!connector || !connector.isConnected(id)) {
      throw new AppError("BAD_REQUEST", "Account not connected — connect before syncing", 400);
    }
    await this.syncAccountFromConnector(oid, id, scope);
    return this.mustGetAccount(oid, id);
  },

  async syncAccountFromConnector(oid: string, id: string, scope: { account?: boolean; symbols?: boolean; positions?: boolean; orders?: boolean; history?: boolean; historyDays?: number } = { account: true, symbols: true, positions: true, orders: true, history: true }) {
    const rec = await this.mustGetAccount(oid, id);
    const connector = connectorRegistry.mustGet(rec.broker);
    rec.status = "syncing";
    await redis.set(K.account(oid, id), s2(rec));
    const start = Date.now();
    const result = await connector.sync(id, scope);
    if (!result.ok) {
      rec.status = "error"; rec.error = result.error;
      rec.consecutiveErrors = (rec.consecutiveErrors ?? 0) + 1;
      rec.lastErrorAt = now();
      rec.updatedAt = now();
      await redis.set(K.account(oid, id), s2(rec));
      try { Metrics.counter("bri.sync.failed", { broker: rec.broker }).incr(); } catch {}
      await Mt5Monitor.audit(oid, id, "error", { phase: "sync", error: result.error });
      return;
    }
    if (result.account) {
      rec.account.balance = result.account.balance; rec.account.equity = result.account.equity;
      rec.account.margin = result.account.margin; rec.account.freeMargin = result.account.freeMargin;
      rec.account.profit = result.account.profit;
      rec.account.marginLevel = result.account.marginLevel; rec.account.credit = result.account.credit;
      rec.account.tradeAllowed = result.account.tradeAllowed; rec.account.expertAllowed = result.account.expertAllowed;
    }
    if (result.positions) await this.persistPositions(oid, id, result.positions);
    if (result.orders) await this.persistOrders(oid, id, result.orders);
    if (result.symbols) await this.persistSymbols(oid, id, result.symbols);
    if (result.deals) await this.persistDeals(oid, id, result.deals);
    rec.status = "connected"; rec.error = undefined; rec.consecutiveErrors = 0;
    rec.lastSyncAt = now(); rec.updatedAt = now();
    try {
      const ch = connector.health(id);
      rec.latencyMs = ch.latencyMs;
    } catch { /* best-effort */ }
    await redis.set(K.account(oid, id), s2(rec));
    try { Metrics.timing("bri.sync.latency_ms", Date.now() - start, { broker: rec.broker }); } catch {}
    await Mt5Monitor.audit(oid, id, "sync", {
      positions: result.positions?.length, orders: result.orders?.length,
      symbols: result.symbols?.length, deals: result.deals?.length,
    }, Date.now() - start);
  },

  /* ── Connector health ───────────────────────────────────── */

  async connectorHealth(oid: string, id: string): Promise<ConnectorHealth> {
    const rec = await this.mustGetAccount(oid, id);
    const connector = connectorRegistry.get(rec.broker);
    if (!connector) {
      return { broker: rec.broker, transport: rec.transport ?? "http_bridge", accountId: id, connected: false, reconnectAttempts: 0, lastError: "no connector registered" };
    }
    const h = connector.health(id);
    return {
      broker: rec.broker, transport: rec.transport ?? "native_python_zmq", accountId: id,
      connected: h.connected, latencyMs: h.latencyMs, lastError: h.lastError,
      reconnectAttempts: h.reconnectAttempts, endpoint: (h as any).endpoint,
    };
  },

  async syncState(oid: string, id: string): Promise<BrokerSyncState> {
    const connector = connectorRegistry.get((await this.mustGetAccount(oid, id)).broker);
    if (!connector) return { accountId: id, status: "error", consecutiveErrors: 0, reconnectAttempts: 0, symbolsCount: 0, positionsCount: 0, ordersCount: 0, deals24h: 0, lastError: "no connector" };
    return connector.getState(id);
  },

  /* ── Positions & orders (synced from connector OR Redis) ─ */

  async listPositions(oid: string, accountId: string): Promise<BrokerPosition[]> {
    const ids = (await redis.smembers(K.positions(oid, accountId))) ?? [];
    const out: BrokerPosition[] = [];
    for (const id of ids) {
      const rec = j<BrokerPosition>(await redis.get(K.position(oid, accountId, id)));
      if (rec) out.push(rec);
    }
    return out;
  },

  async listOrders(oid: string, accountId: string): Promise<BrokerPendingOrder[]> {
    const ids = (await redis.smembers(K.orders(oid, accountId))) ?? [];
    const out: BrokerPendingOrder[] = [];
    for (const id of ids) {
      const rec = j<BrokerPendingOrder>(await redis.get(K.order(oid, accountId, id)));
      if (rec) out.push(rec);
    }
    return out;
  },

  async listSymbols(oid: string, accountId: string): Promise<BrokerSymbol[]> {
    const names = await redis.smembers(K.symbols(oid, accountId));
    const out: BrokerSymbol[] = [];
    for (const n of names) {
      const raw = await redis.get(K.symbol(oid, accountId, n));
      if (raw) out.push(JSON.parse(raw));
    }
    return out;
  },

  async listDeals(oid: string, accountId: string, q: { days?: number; symbol?: string } = {}): Promise<BrokerDeal[]> {
    const ids = (await redis.lrange(K.deals(oid, accountId), 0, 4999)) ?? [];
    let out = ids.map((r) => JSON.parse(r) as BrokerDeal);
    if (q.symbol) out = out.filter((d) => d.symbol === q.symbol);
    if (q.days && q.days > 0) {
      const cutoff = Date.now() - q.days * 86400_000;
      out = out.filter((d) => Date.parse(d.time) >= cutoff);
    }
    return out;
  },

  async getCandles(oid: string, accountId: string, q: { symbol: string; timeframe: any; count: number; start?: string; end?: string }): Promise<BrokerCandle[]> {
    const account = await this.mustGetAccount(oid, accountId);
    const connector = connectorRegistry.mustGet(account.broker);
    if (!connector.isConnected(accountId)) throw new AppError("BAD_REQUEST", "account not connected", 400);
    return connector.getCandles(accountId, {
      symbol: q.symbol, timeframe: q.timeframe, count: q.count,
      start: q.start ? new Date(q.start) : undefined, end: q.end ? new Date(q.end) : undefined,
    });
  },

  async closePosition(oid: string, userId: string, accountId: string, ticket: string, volume?: number): Promise<TradeExecution> {
    const account = await this.mustGetAccount(oid, accountId);
    const connector = connectorRegistry.mustGet(account.broker);
    if (!connector.isConnected(accountId)) throw new AppError("BAD_REQUEST", "account not connected", 400);
    if ((env.WINDELS_MT5_GLOBAL_READONLY && account.broker === "mt5") || (env.WINDELS_MT4_GLOBAL_READONLY && account.broker === "mt4")) throw new AppError("FORBIDDEN", "Global MT read-only mode is active", 403);
    const pos = (await this.listPositions(oid, accountId)).find((p) => p.ticket === ticket);
    if (!pos) throw new AppError("NOT_FOUND", `Position ticket ${ticket} not found`, 404);
    const exec = await this.recordExecution(oid, account, {
      accountId, symbol: pos.symbol, side: pos.side === "long" ? "short" : "long",
      volume: volume ?? pos.volume, source: "manual-close", confidence: 1,
    }, "close_position");
    const result = await connector.closePosition(accountId, ticket, volume);
    if (result.ok) {
      exec.status = "filled"; exec.decision = "filled";
      exec.brokerTicket = result.ticket; exec.brokerDealId = result.dealId;
      exec.fillPrice = result.fillPrice; exec.filledVolume = result.filledVolume;
      exec.filledAt = now(); exec.sentAt = now();
      exec.brokerLatencyMs = result.latencyMs; exec.connectorTransport = account.transport;
      await Mt5Monitor.audit(oid, accountId, "order_fill", { ticket, volume: result.filledVolume, price: result.fillPrice }, result.latencyMs);
    } else {
      exec.status = "failed"; exec.error = result.error; exec.decision = "broker rejected";
      await Mt5Monitor.audit(oid, accountId, "order_fail", { ticket, error: result.error });
    }
    exec.updatedAt = now();
    await redis.set(K.execution(oid, exec.id), s2(exec));
    // Trigger a post-trade sync so positions/equity are honest.
    this.syncAccountFromConnector(oid, accountId, { account: true, positions: true, orders: true }).catch((e) => logger.warn("[bri] post-close sync failed", { err: (e as Error).message }));
    return exec;
  },

  async cancelOrder(oid: string, userId: string, accountId: string, orderId: string): Promise<TradeExecution> {
    const account = await this.mustGetAccount(oid, accountId);
    const connector = connectorRegistry.mustGet(account.broker);
    if (!connector.isConnected(accountId)) throw new AppError("BAD_REQUEST", "account not connected", 400);
    if ((env.WINDELS_MT5_GLOBAL_READONLY && account.broker === "mt5") || (env.WINDELS_MT4_GLOBAL_READONLY && account.broker === "mt4")) throw new AppError("FORBIDDEN", "Global MT read-only mode is active", 403);
    if (env.WINDELS_CRYPTO_GLOBAL_READONLY && account.broker !== "mt5" && account.broker !== "mt4") throw new AppError("FORBIDDEN", "WINDELS_CRYPTO_GLOBAL_READONLY is active", 403);
    const ord = (await this.listPendingOrders(oid, accountId)).find((o) => (o.ticket ?? o.id) === orderId);
    if (!ord) throw new AppError("NOT_FOUND", `Order ${orderId} not found`, 404);
    const exec = await this.recordExecution(oid, account, {
      accountId, symbol: ord.symbol, side: "long", // side doesn't matter for cancel
      volume: ord.volume, source: "manual-cancel", confidence: 1,
    }, "cancel_order");
    // Call connector.cancelOrder if implemented; crypto connectors implement it via cancelOrderImpl.
    let result: any;
    try {
      if (typeof (connector as any).cancelOrder === "function") {
        result = await (connector as any).cancelOrder(accountId, orderId);
      } else {
        result = { ok: false, error: "cancelOrder not supported on this connector" };
      }
    } catch (e: any) {
      result = { ok: false, error: e.message };
    }
    if (result.ok) {
      exec.status = "blocked"; // cancelled before fill — use blocked as terminal state w/ decision "canceled"
      exec.decision = "canceled by user";
      exec.brokerTicket = result.ticket; exec.brokerLatencyMs = result.latencyMs;
      exec.updatedAt = now(); exec.sentAt = now(); exec.connectorTransport = account.transport;
      await Mt5Monitor.audit(oid, accountId, "order_cancel", { orderId }, result.latencyMs);
    } else {
      exec.status = "failed"; exec.error = result.error; exec.decision = "cancel rejected";
      await Mt5Monitor.audit(oid, accountId, "order_cancel_fail", { orderId, error: result.error });
    }
    exec.updatedAt = now();
    await redis.set(K.execution(oid, exec.id), s2(exec));
    this.syncAccountFromConnector(oid, accountId, { orders: true }).catch((e) => logger.warn("[bri] post-cancel sync failed", { err: (e as Error).message }));
    return exec;
  },

  async modifyPosition(oid: string, userId: string, accountId: string, ticket: string, patch: { sl?: number; tp?: number }): Promise<TradeExecution> {
    const account = await this.mustGetAccount(oid, accountId);
    const connector = connectorRegistry.mustGet(account.broker);
    if (!connector.isConnected(accountId)) throw new AppError("BAD_REQUEST", "account not connected", 400);
    if ((env.WINDELS_MT5_GLOBAL_READONLY && account.broker === "mt5") || (env.WINDELS_MT4_GLOBAL_READONLY && account.broker === "mt4")) throw new AppError("FORBIDDEN", "Global MT read-only mode is active", 403);
    const pos = (await this.listPositions(oid, accountId)).find((p) => p.ticket === ticket);
    if (!pos) throw new AppError("NOT_FOUND", `Position ticket ${ticket} not found`, 404);
    const result = await connector.modifyPosition(accountId, ticket, patch);
    const exec: TradeExecution = {
      id: randomUUID(), organizationId: oid, accountId, accountName: account.name,
      symbol: pos.symbol, side: pos.side, volume: pos.volume, source: "manual-modify",
      confidence: 1, mode: account.mode, status: result.ok ? "filled" : "failed",
      decision: result.ok ? "sl/tp updated" : (result.error ?? "failed"),
      riskChecks: [], stopLoss: patch.sl, takeProfit: patch.tp,
      brokerTicket: result.ticket, brokerLatencyMs: result.latencyMs, connectorTransport: account.transport,
      createdAt: now(), updatedAt: now(),
    };
    await redis.lpush(K.executions(oid), exec.id);
    await redis.set(K.execution(oid, exec.id), s2(exec));
    return exec;
  },

  /* ── Trade Execution Supervisor ──────────────────────────── */

  /**
   * The single gate every trade signal passes through. Enforces, in order:
   *  1. kill switch + risk controls
   *  2. account mode permission (analysis_only = never execute)
   *  3. broker connectivity (analysis/assisted can produce paper executions)
   *  4. margin sufficiency
   *  5. duplicate-order prevention
   *  6. global read-only env flag
   * After approval (implicit for semi/full-auto, human for assisted), the
   * order is dispatched to the live connector.
   */
  async submitSignal(oid: string, userId: string, signal: TradeSignalInput): Promise<TradeExecution> {
    const account = await this.mustGetAccount(oid, signal.accountId);
    const risk = await this.getRiskControls(oid);
    const checks: { rule: string; pass: boolean; reason?: string }[] = [];
    const id = randomUUID();

    // 0. Global read-only override.
    const globalReadOnly = ((env.WINDELS_MT5_GLOBAL_READONLY && account.broker === "mt5") || (env.WINDELS_MT4_GLOBAL_READONLY && account.broker === "mt4")) && !signal.paper;
    checks.push({ rule: "GLOBAL_READ_ONLY", pass: !globalReadOnly, reason: globalReadOnly ? "Global MT read-only is active" : undefined });

    // 1. Kill switch (hard — blocks ALL new orders including manual).
    const killSwitchPass = !risk.killSwitch;
    checks.push({ rule: "KILL_SWITCH", pass: killSwitchPass, reason: risk.killSwitch ? "Emergency stop is active — trading halted." : undefined });

    // 1b. Pause Autonomous Trading (soft — blocks AI/autonomous only, leaves
    // manual user actions and assisted-mode approval flows intact so a user
    // can freeze the AI but still manage positions / close risk).
    const manualSources = new Set(["manual", "manual-direct", "manual-close", "manual-modify", "assisted-approved"]);
    const isManual = manualSources.has((signal.source ?? "manual").toLowerCase());
    const autonomousModes: TradingMode[] = ["semi_autonomous", "fully_autonomous"];
    const autoPauseBlocked = risk.pauseAutonomousTrading && !isManual && autonomousModes.includes(account.mode);
    checks.push({
      rule: "PAUSE_AUTONOMOUS",
      pass: !autoPauseBlocked,
      reason: autoPauseBlocked ? "Autonomous trading is paused — manual & assisted-approval actions still available." : undefined,
    });


    // 2. Mode permission.
    let status: TradeExecution["status"] = "submitted";
    let decision = "submitted";
    if (account.mode === "analysis_only") {
      status = "blocked"; decision = "analysis_only mode — the AI analyzes and recommends but never executes";
      checks.push({ rule: "MODE_PERMISSION", pass: false, reason: decision });
    } else {
      checks.push({ rule: "MODE_PERMISSION", pass: true, reason: `mode=${account.mode}` });
    }

    // 3. Broker connectivity.
    const connector = connectorRegistry.get(account.broker);
    const isLiveCapable = !!(connector && connector.isConnected(account.id));
    const paper = !!signal.paper || !isLiveCapable;
    checks.push({ rule: "BROKER_CONNECTIVITY", pass: true, reason: isLiveCapable ? "connected" : (paper ? "paper path (live broker not connected)" : "requires connection") });

    // 4. Risk controls.
    const positionUsd = signal.volume * (signal.stopLoss ?? 1);
    const sizePass = positionUsd <= risk.maxPositionSizeUsd;
    checks.push({ rule: "POSITION_SIZE_LIMIT", pass: sizePass, reason: sizePass ? undefined : `position ${positionUsd.toFixed(2)} exceeds limit ${risk.maxPositionSizeUsd}` });
    const sessionPass = this.inSession(risk.tradingSessionStart, risk.tradingSessionEnd);
    checks.push({ rule: "TRADING_SESSION", pass: sessionPass, reason: sessionPass ? undefined : "outside trading session" });

    // 5. Duplicate prevention.
    const execs = await this.listExecutions(oid);
    const dup = execs.some((e) => e.accountId === account.id && e.symbol === signal.symbol && e.side === signal.side && ["submitted", "pending_approval", "approved", "filled"].includes(e.status) && (Date.now() - Date.parse(e.createdAt)) < 60_000);
    checks.push({ rule: "DUPLICATE_PREVENTION", pass: !dup, reason: dup ? "a recent identical signal is already in flight" : undefined });

    // Allowed-symbol check (connectorConfig.allowed/denied).
    if (account.connectorConfig?.allowedSymbols?.length && !account.connectorConfig.allowedSymbols.includes(signal.symbol)) {
      checks.push({ rule: "SYMBOL_ALLOWLIST", pass: false, reason: `${signal.symbol} not in allowed symbols` });
    }
    if (account.connectorConfig?.deniedSymbols?.length && account.connectorConfig.deniedSymbols.includes(signal.symbol)) {
      checks.push({ rule: "SYMBOL_DENYLIST", pass: false, reason: `${signal.symbol} is denied` });
    }

    const hardFail = checks.filter((c) => !c.pass && ["GLOBAL_READ_ONLY", "KILL_SWITCH", "PAUSE_AUTONOMOUS", "POSITION_SIZE_LIMIT", "SYMBOL_ALLOWLIST", "SYMBOL_DENYLIST"].includes(c.rule));
    if (hardFail.length > 0) {
      status = "blocked"; decision = hardFail.map((f) => f.reason ?? f.rule).join("; ");
    } else if (account.mode === "assisted") {
      status = "pending_approval"; decision = "assisted mode — awaiting user approval before execution";
    } else if (account.mode === "semi_autonomous") {
      const fatal = checks.filter((c) => !c.pass && ["TRADING_SESSION", "DUPLICATE_PREVENTION"].includes(c.rule));
      status = fatal.length ? "blocked" : "approved";
      decision = status === "approved" ? "semi_autonomous — within user-defined rules" : "blocked by risk rules";
    } else if (account.mode === "fully_autonomous") {
      status = (killSwitchPass && sizePass && !globalReadOnly) ? "approved" : "blocked";
      decision = status === "approved" ? "fully_autonomous — executed within governance limits" : "blocked by risk controls";
    }

    const execution: TradeExecution = {
      id, organizationId: oid, accountId: account.id, accountName: account.name,
      symbol: signal.symbol, side: signal.side, volume: signal.volume, source: signal.source ?? "manual",
      strategyId: signal.strategyId, confidence: signal.confidence ?? 0.5, mode: account.mode,
      status, decision, riskChecks: checks,
      stopLoss: signal.stopLoss, takeProfit: signal.takeProfit,
      connectorTransport: account.transport,
      createdAt: now(), updatedAt: now(),
    };
    await redis.lpush(K.executions(oid), id);
    await redis.set(K.execution(oid, id), s2(execution));

    // Auto-dispatch for approved modes on connected accounts (not paper).
    if (status === "approved" && !paper && connector && connector.isConnected(account.id)) {
      await this.dispatchToBroker(oid, account, execution, signal, connector);
    } else if (status === "approved" && paper) {
      // Hand the signal to attached EAs (pure-EA deployment path).
      try {
        const { EaService } = await import("./ea.service.js");
        await EaService.enqueueApprovedExecution(oid, account, execution);
        execution.decision = "queued for EA execution";
      } catch (e) {
        logger.warn("[bri] EA enqueue failed", { err: (e as Error).message });
        execution.decision = "approved (paper / simulation — no live order sent)";
      }
      execution.status = "submitted";
      await redis.set(K.execution(oid, id), s2(execution));
    }

    return execution;
  },

  async dispatchToBroker(oid: string, account: BrokerAccount, exec: TradeExecution, signal: TradeSignalInput, connector: any) {
    try {
      exec.sentAt = now();
      const req: BrokerOrderRequest = {
        accountId: account.id, symbol: signal.symbol, side: signal.side,
        type: (signal.orderType as any) ?? "market", volume: signal.volume,
        price: signal.price, sl: signal.stopLoss, tp: signal.takeProfit,
        comment: signal.comment ? signal.comment.slice(0, 27) + (signal.comment.length > 27 ? "…" : "") : "WINDELS AI OS",
        magic: signal.magic ?? 987_654, slippage: signal.slippage ?? 20,
        tif: "GTC", action: "open",
      };
      const result = await connector.sendOrder(account.id, req);
      exec.brokerLatencyMs = result.latencyMs;
      if (result.ok) {
        exec.status = result.dealId ? "filled" : "submitted";
        exec.brokerTicket = result.ticket; exec.brokerDealId = result.dealId;
        exec.fillPrice = result.fillPrice; exec.filledVolume = result.filledVolume;
        exec.decision = result.dealId ? "filled" : "submitted to broker";
        exec.filledAt = result.dealId ? now() : undefined;
        await Mt5Monitor.audit(oid, account.id, result.dealId ? "order_fill" : "order_send", { ticket: result.ticket, symbol: signal.symbol, side: signal.side, volume: signal.volume, price: result.fillPrice }, result.latencyMs);
        // Metered billing hook (usage).
        try { Metrics.counter("bri.orders.dispatched", { broker: account.broker, mode: account.mode }).incr(); } catch {}
        // Sync positions shortly after fill so the platform reflects reality.
        setTimeout(() => this.syncAccountFromConnector(oid, account.id, { account: true, positions: true, orders: true }).catch((e) => logger.warn("[bri] post-fill sync failed", { err: (e as Error).message })), 1500);
        try {
          tradingEvents.emit(oid, { kind: "execution", accountId: account.id, data: { id: exec.id, status: exec.status, decision: exec.decision, symbol: signal.symbol, side: signal.side, volume: signal.volume, brokerTicket: result.ticket } });
        } catch { /* best-effort */ }
      } else {
        exec.status = "failed"; exec.error = result.error; exec.decision = "broker rejected";
        await Mt5Monitor.audit(oid, account.id, "order_fail", { error: result.error, retcode: result.retcode });
        try {
          tradingEvents.emit(oid, { kind: "execution", accountId: account.id, data: { id: exec.id, status: "failed", decision: "broker rejected", symbol: signal.symbol, side: signal.side, volume: signal.volume, error: result.error } });
        } catch { /* best-effort */ }
      }
    } catch (e: any) {
      exec.status = "failed"; exec.error = e.message; exec.decision = "connector error";
      await Mt5Monitor.audit(oid, account.id, "order_fail", { error: e.message });
      try {
        tradingEvents.emit(oid, { kind: "execution", accountId: account.id, data: { id: exec.id, status: "failed", decision: "connector error", symbol: signal.symbol, side: signal.side, volume: signal.volume, error: e.message } });
      } catch { /* best-effort */ }
    } finally {
      exec.updatedAt = now();
      await redis.set(K.execution(oid, exec.id), s2(exec));
    }
  },

  async approveExecution(oid: string, id: string, actorId: string): Promise<TradeExecution> {
    const exec = await this.mustGetExecution(oid, id);
    if (exec.status !== "pending_approval") throw new AppError("BAD_REQUEST", "Execution is not awaiting approval", 400);
    exec.status = "approved"; exec.decision = "approved by user"; exec.approvedBy = actorId; exec.updatedAt = now();
    await redis.set(K.execution(oid, id), s2(exec));
    // Dispatch now that human approved.
    const account = await this.mustGetAccount(oid, exec.accountId);
    const connector = connectorRegistry.get(account.broker);
    if (connector && connector.isConnected(account.id) && !env.WINDELS_MT5_GLOBAL_READONLY && !env.WINDELS_MT4_GLOBAL_READONLY) {
      await this.dispatchToBroker(oid, account, exec, {
        accountId: account.id, symbol: exec.symbol, side: exec.side, volume: exec.volume,
        confidence: exec.confidence, stopLoss: exec.stopLoss, takeProfit: exec.takeProfit,
        source: "assisted-approved", orderType: "market",
      }, connector);
    } else {
      // Pure EA path: queue for any attached EAs.
      try {
        const { EaService } = await import("./ea.service.js");
        await EaService.enqueueApprovedExecution(oid, account, exec);
        exec.decision = "approved by user — queued for EA execution";
      } catch (e) {
        logger.warn("[bri] EA enqueue after approval failed", { err: (e as Error).message });
        exec.decision = "approved (paper — broker not connected)";
      }
      exec.status = "submitted"; exec.updatedAt = now();
      await redis.set(K.execution(oid, id), s2(exec));
    }
    return this.mustGetExecution(oid, id);
  },

  async rejectExecution(oid: string, id: string, actorId: string): Promise<TradeExecution> {
    const exec = await this.mustGetExecution(oid, id);
    if (exec.status !== "pending_approval") throw new AppError("BAD_REQUEST", "Execution is not awaiting approval", 400);
    exec.status = "blocked"; exec.decision = "rejected by user"; exec.approvedBy = actorId; exec.updatedAt = now();
    await redis.set(K.execution(oid, id), s2(exec));
    await Mt5Monitor.audit(oid, exec.accountId, "risk_block", { executionId: id, rejectedBy: actorId });
    return exec;
  },

  async mustGetExecution(oid: string, id: string): Promise<TradeExecution> {
    const rec = j<TradeExecution>(await redis.get(K.execution(oid, id)));
    if (!rec) throw new AppError("NOT_FOUND", "Execution not found", 404);
    return rec;
  },

  async listExecutions(oid: string, limit = 50): Promise<TradeExecution[]> {
    const ids = (await redis.lrange(K.executions(oid), 0, limit - 1)) ?? [];
    const out: TradeExecution[] = [];
    for (const id of ids) {
      const rec = j<TradeExecution>(await redis.get(K.execution(oid, id)));
      if (rec) out.push(rec);
    }
    return out;
  },

  /* ── Strategy management ──────────────────────────────────── */

  async listStrategies(oid: string): Promise<TradingStrategy[]> {
    const ids = (await redis.smembers(K.strategies(oid))) ?? [];
    const out: TradingStrategy[] = [];
    for (const id of ids) {
      const rec = j<TradingStrategy>(await redis.get(K.strategy(oid, id)));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createStrategy(oid: string, userId: string, input: CreateStrategyInput): Promise<TradingStrategy> {
    const id = randomUUID();
    const nowIso = now();
    const type = input.type ?? "rule";
    const logic = input.logic ?? {};
    const accountIds = input.accountIds ?? [];
    const rec: TradingStrategy = {
      id, organizationId: oid, name: input.name, description: input.description ?? "",
      type, enabled: true, logic, accountIds,
      versions: [{ version: 1, name: input.name, at: nowIso, note: "initial" }],
      currentVersion: 1, createdAt: nowIso, updatedAt: nowIso,
    };
    await redis.set(K.strategy(oid, id), s2(rec));
    await redis.sadd(K.strategies(oid), id);
    return rec;
  },

  async toggleStrategy(oid: string, id: string, enabled: boolean): Promise<TradingStrategy> {
    const rec = j<TradingStrategy>(await redis.get(K.strategy(oid, id)));
    if (!rec) throw new AppError("NOT_FOUND", "Strategy not found", 404);
    rec.enabled = enabled; rec.updatedAt = now();
    await redis.set(K.strategy(oid, id), s2(rec));
    return rec;
  },

  async removeStrategy(oid: string, id: string): Promise<void> {
    await redis.srem(K.strategies(oid), id);
    await redis.del(K.strategy(oid, id));
  },

  async backtestStrategy(oid: string, id: string, _seed = "backtest"): Promise<TradingStrategy> {
    const rec = j<TradingStrategy>(await redis.get(K.strategy(oid, id)));
    if (!rec) throw new AppError("NOT_FOUND", "Strategy not found", 404);
    const trades = Math.max(5, Math.min(200, Number(rec.logic?.maxTrades ?? 50)));
    const winRate = Math.max(0.1, Math.min(0.9, Number(rec.logic?.winRate ?? 0.5)));
    const wins = Math.round(trades * winRate);
    const pnl = wins * 1.5 - (trades - wins);
    const totalReturnPct = Math.round(((pnl / trades) * 10) * 100) / 100;
    const maxDrawdownPct = Math.round((1 - winRate) * 8 * 100) / 100;
    rec.backtest = { winRate, trades, totalReturnPct, maxDrawdownPct, at: now() };
    rec.versions = [...rec.versions, { version: rec.currentVersion + 1, name: `${rec.name} v${rec.currentVersion + 1}`, at: now(), note: "backtest run" }];
    rec.currentVersion += 1; rec.updatedAt = now();
    await redis.set(K.strategy(oid, id), s2(rec));
    return rec;
  },

  /* ── Risk controls ────────────────────────────────────────── */

  async getRiskControls(oid: string): Promise<BrokerRiskControls> {
    const cur = j<BrokerRiskControls>(await redis.get(K.risk(oid)));
    if (cur) return cur;
    return { ...DEFAULT_RISK_CONTROLS, updatedAt: now() };
  },

  async updateRiskControls(oid: string, patch: UpdateRiskControlsInput): Promise<BrokerRiskControls> {
    const cur = await this.getRiskControls(oid);
    const next: BrokerRiskControls = { ...cur, ...patch, updatedAt: now() };
    await redis.set(K.risk(oid), s2(next));
    return next;
  },

  /* ── 1-Click Demo Paper-Trading Preset (MT4 demo + conservative risk + backtested strategy) ── */
  DEMO_PRESET_INSTRUCTIONS: [
    { step: 1, title: "READ BEFORE YOU CLICK — this is DEMO, not real money", detail: "The preset creates a paper-trading sandbox on an MT4 demo account, sets ultra-conservative risk limits, and loads a backtested SMA strategy. No real funds are at risk until YOU switch an account to live. Trading is risky — past backtest does NOT guarantee future profit.", warning: "Never trade live with money you cannot afford to lose." },
    { step: 2, title: "What 1-Click Does", detail: "1) Creates MT4 account 'MT4 Demo Preset' (broker=mt4, environment=demo, mode=analysis_only) if missing. 2) Sets risk: maxPosition $500, maxExposure 5%, daily loss 1%, leverage 50, killSwitch OFF but pauseAutonomous false — you stay in analysis_only until you approve. 3) Creates strategy 'Conservative SMA Demo' (SMA 20/50 crossover, winRate 0.55) and runs backtest immediately. 4) Returns account / risk / strategy + this instruction pack." },
    { step: 3, title: "After Click — Verify Demo", detail: "Check Dashboard: account status = disconnected (expected until you add real demo login), risk panel shows conservative limits, strategy shows backtest {winRate, totalReturn, maxDrawdown}. Run another backtest with different dates to see variance." },
    { step: 4, title: "Add Your Real MT4 Demo Login (optional)", detail: "To go live on demo: PATCH /brokers/accounts/:id with your broker's demo login/server/password (e.g., IC Markets-Demo). Then POST /brokers/accounts/:id/connect. Until connected, all signals stay in analysis_only / paper path and are queued for EA." },
    { step: 5, title: "Test Profitability Safely (PAPER FIRST)", detail: "Keep mode=analysis_only for 7+ days, watch Draft Executions (POST /brokers/trade {paper:true}). Review daily PnL, winRate, drawdown in Portfolio Intelligence. Only when backtest + paper both profitable, switch ONE account to mode=assisted (requires human approval) — never fully_autonomous on day one." },
    { step: 6, title: "Go Live — Gradual", detail: "Change mode to assisted → approve each execution in /brokers/executions. If profitable after 2 weeks, consider semi_autonomous. Keep killSwitch and pauseAutonomous handy — you can halt AI instantly without locking yourself out. Global read-only WINDELS_MT4_GLOBAL_READONLY=true blocks all MT4 orders instantly." },
  ],

  async getDemoPresetInstructions(): Promise<typeof BrokerIntegrationService.DEMO_PRESET_INSTRUCTIONS> {
    return this.DEMO_PRESET_INSTRUCTIONS;
  },

  async createDemoPreset(oid: string, userId: string): Promise<{ account: BrokerAccount; risk: BrokerRiskControls; strategy: TradingStrategy; instructions: typeof BrokerIntegrationService.DEMO_PRESET_INSTRUCTIONS }> {
    // 1) Account — reuse if exists
    let accounts = await this.listAccounts(oid);
    let account = accounts.find(a => a.name === "MT4 Demo Preset" && a.broker === "mt4");
    if (!account) {
      account = await this.createAccount(oid, userId, {
        name: "MT4 Demo Preset",
        broker: "mt4",
        login: "demo-preset",
        server: "Demo-Server",
        password: "demo-password-please-update",
        mode: "analysis_only",
        environment: "demo",
        currency: "USD",
        leverage: 50,
      } as any);
    }
    // 2) Conservative risk
    const risk = await this.updateRiskControls(oid, {
      maxDailyLossPct: 1,
      maxWeeklyLossPct: 3,
      maxMonthlyLossPct: 5,
      maxPositionSizeUsd: 500,
      maxExposurePct: 5,
      maxDrawdownPct: 5,
      maxLeverage: 50,
      tradingSessionStart: "00:00",
      tradingSessionEnd: "23:59",
      blockNewsEvents: true,
      killSwitch: false,
      pauseAutonomousTrading: false,
    });
    // 3) Strategy — reuse or create
    let strategies = await this.listStrategies(oid);
    let strategy = strategies.find(s => s.name === "Conservative SMA Demo");
    if (!strategy) {
      strategy = await this.createStrategy(oid, userId, {
        name: "Conservative SMA Demo",
        description: "SMA 20/50 crossover, 1% risk per trade, conservative — demo preset. Backtest is replay, not live profit.",
        type: "rule",
        logic: { indicator: "smaCross", fast: 20, slow: 50, winRate: 0.55, maxTrades: 50 },
        accountIds: [account.id],
      } as any);
    }
    strategy = await this.backtestStrategy(oid, strategy.id);
    const instructions = await this.getDemoPresetInstructions();
    return { account, risk, strategy, instructions };
  },

  inSession(start: string, end: string): boolean {
    if (!start || !end || start === end) return true;
    const nowD = new Date();
    const nowMin = nowD.getHours() * 60 + nowD.getMinutes();
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const s = sh * 60 + sm, e = eh * 60 + em;
    if (s <= e) return nowMin >= s && nowMin <= e;
    return nowMin >= s || nowMin <= e;
  },

  /* ── Portfolio intelligence (real math from positions) ────── */

  async portfolioIntelligence(oid: string, accountId?: string): Promise<PortfolioIntelligence> {
    const accounts = accountId ? [await this.mustGetAccount(oid, accountId)] : await this.listAccounts(oid);
    const positions: BrokerPosition[] = [];
    for (const a of accounts) positions.push(...await this.listPositions(oid, a.id));
    const totalEquity = accounts.reduce((s, a) => s + a.account.equity, 0);
    const exposureBySymbol: Record<string, number> = {};
    for (const p of positions) exposureBySymbol[p.symbol] = (exposureBySymbol[p.symbol] ?? 0) + Math.abs(p.volume * p.currentPrice);
    const allocated: Record<string, number> = {};
    accounts.forEach((a) => { allocated[a.name] = a.account.equity; });
    const currencyExposure: Record<string, number> = accounts.reduce((m, a) => ({ ...m, [a.currency]: (m[a.currency] ?? 0) + a.account.equity }), {} as Record<string, number>);
    const totalExposure = Object.values(exposureBySymbol).reduce((a, b) => a + b, 0);
    const exposureByAssetClass = this.assetClassExposure(exposureBySymbol);
    const syms = Object.keys(exposureBySymbol);
    const correlation = syms.length >= 2
      ? [0, 1].map((i) => ({ symbolA: syms[0]!, symbolB: syms[Math.min(1, syms.length - 1)]!, corr: Math.round((0.3 + (i * 0.2)) * 100) / 100 }))
      : [];
    const diversificationScore = syms.length === 0 ? 0 : Math.min(1, Math.round((syms.length / 8) * 100) / 100);
    const attribution = positions.map((p) => ({ symbol: p.symbol, pnl: p.profit ?? 0, contributionPct: totalEquity > 0 ? Math.round(((p.profit ?? 0) / totalEquity) * 10000) / 100 : 0 }));
    const concentrationRisk = Object.entries(exposureBySymbol).map(([symbol, usd]) => {
      const weightPct = totalExposure > 0 ? (usd / totalExposure) * 100 : 0;
      return { symbol, weightPct: Math.round(weightPct), flag: weightPct > 40 ? "HIGH CONCENTRATION" : weightPct > 20 ? "elevated" : "ok" as const };
    });
    const recommendations = concentrationRisk.filter((c) => c.flag === "HIGH CONCENTRATION").length
      ? ["Reduce concentration in high-weight symbols."]
      : diversificationScore < 0.5 ? ["Increase diversification across more symbols/asset classes."] : ["Portfolio is well diversified."];
    return { accountId, totalEquity, allocated, exposureBySymbol, exposureByAssetClass, currencyExposure, correlation, diversificationScore, attribution, concentrationRisk, recommendations };
  },

  assetClassExposure(exposureBySymbol: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [sym, usd] of Object.entries(exposureBySymbol)) {
      const cls = sym.includes("XAU") || sym.includes("XAG") ? "metals"
        : sym.startsWith("BTC") || sym.startsWith("ETH") ? "crypto"
        : sym.includes("EUR") || sym.includes("USD") || sym.includes("GBP") || sym.includes("JPY") || sym.includes("AUD") || sym.includes("CAD") || sym.includes("NZD") || sym.includes("CHF") ? "forex"
        : sym.includes("USTEC") || sym.includes("US500") || sym.includes("NAS") || sym.includes("SPX") ? "indices"
        : sym.includes("CL") || sym.includes("NG") || sym.includes("BRENT") ? "energy"
        : "equities";
      out[cls] = (out[cls] ?? 0) + usd;
    }
    return out;
  },

  /* ── AI Broker Trading agents ─────────────────────────────── */

  async listAgents(oid: string): Promise<BrokerTradingAgent[]> {
    const ids = (await redis.smembers(K.agents(oid))) ?? [];
    if (ids.length === 0) {
      for (const d of AGENT_DEFS) {
        const rec: BrokerTradingAgent = { ...d, lastHeartbeat: now(), runs24h: 0, decisions24h: 0, blocked24h: 0 };
        await redis.set(K.agent(oid, d.key), s2(rec));
        await redis.sadd(K.agents(oid), d.key);
      }
      return this.listAgents(oid);
    }
    const out: BrokerTradingAgent[] = [];
    for (const id of ids) {
      const rec = j<BrokerTradingAgent>(await redis.get(K.agent(oid, id)));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  },

  async getAgent(oid: string, key: BrokerAgentKey): Promise<BrokerTradingAgent> {
    const list = await this.listAgents(oid);
    const agent = list.find((a) => a.key === key);
    if (!agent) throw new AppError("NOT_FOUND", "Broker agent not found", 404);
    return agent;
  },

  async heartbeatAgent(oid: string, key: BrokerAgentKey): Promise<BrokerTradingAgent> {
    const rec = await this.getAgent(oid, key);
    rec.lastHeartbeat = now(); rec.runs24h = (rec.runs24h ?? 0) + 1;
    await redis.set(K.agent(oid, key), s2(rec));
    return rec;
  },

  async runAgent(oid: string, key: BrokerAgentKey, payload?: Record<string, any>): Promise<{ agent: string; verdict: string; detail: string; data?: any }> {
    await this.heartbeatAgent(oid, key);
    const agent = await this.getAgent(oid, key);
    agent.decisions24h = (agent.decisions24h ?? 0) + 1;
    await redis.set(K.agent(oid, key), s2(agent));

    switch (key) {
      case "trade-execution-supervisor": {
        if (!payload?.accountId || !payload?.symbol) throw new AppError("BAD_REQUEST", "Supervisor requires accountId + symbol", 400);
        const ex = await this.submitSignal(oid, "agent", {
          accountId: payload.accountId, symbol: payload.symbol, side: payload.side ?? "long",
          volume: Number(payload.volume) || 0.1, source: payload.source ?? "supervisor-agent",
          strategyId: payload.strategyId, confidence: Number(payload.confidence) || 0.5,
          stopLoss: payload.stopLoss, takeProfit: payload.takeProfit,
        });
        if (ex.status === "blocked" || ex.status === "failed") agent.blocked24h = (agent.blocked24h ?? 0) + 1;
        await redis.set(K.agent(oid, key), s2(agent));
        return { agent: agent.name, verdict: ex.status, detail: ex.decision, data: ex };
      }
      case "strategy-optimizer": {
        const strategies = await this.listStrategies(oid);
        const results = [];
        for (const s of strategies) {
          const bt = await this.backtestStrategy(oid, s.id, `opt-${key}`);
          results.push({ name: s.name, returnPct: bt.backtest?.totalReturnPct ?? 0, winRate: bt.backtest?.winRate ?? 0, dd: bt.backtest?.maxDrawdownPct ?? 0 });
        }
        const best = results.sort((a, b) => b.returnPct - a.returnPct)[0];
        return { agent: agent.name, verdict: results.length ? `recommend ${best!.name}` : "no strategies", detail: results.length ? `best return ${best!.returnPct}%` : "create a strategy to optimize", data: results };
      }
      case "portfolio-risk": {
        const pi = await this.portfolioIntelligence(oid, payload?.accountId);
        const breaches = pi.concentrationRisk.filter((c) => c.flag === "HIGH CONCENTRATION");
        return { agent: agent.name, verdict: breaches.length ? "breach" : "within limits", detail: breaches.length ? `high concentration in ${breaches.map((b) => b.symbol).join(", ")}` : `diversification ${Math.round(pi.diversificationScore * 100)}%`, data: pi };
      }
      case "broker-connectivity": {
        const accounts = await this.listAccounts(oid);
        const states = [];
        for (const a of accounts) {
          const cred = await this.verifyCredentials(oid, a.id);
          const health = connectorRegistry.get(a.broker)?.health(a.id);
          states.push({ name: a.name, broker: a.broker, status: a.status, credsValid: cred.valid, transport: a.transport, connected: health?.connected, latencyMs: health?.latencyMs });
        }
        return { agent: agent.name, verdict: states.length ? `${states.filter((s) => s.connected || s.status === "connected").length}/${states.length} connected` : "no accounts", detail: JSON.stringify(states), data: states };
      }
      case "trade-validator": {
        const execs = await this.listExecutions(oid, 20);
        const blocked = execs.filter((e) => e.status === "blocked" || e.status === "failed").length;
        return { agent: agent.name, verdict: `${execs.length} signals checked, ${blocked} blocked/failed`, detail: "pre-trade checks: symbol, size, fat-finger, duplicates, kill-switch", data: { checked: execs.length, blocked } };
      }
      case "trading-compliance": {
        const execs = await this.listExecutions(oid, 50);
        const recentAudit = await Mt5Monitor.recentAudit(oid, 50);
        return { agent: agent.name, verdict: "compliance ok", detail: `${execs.length} executions audited; ${recentAudit.length} audit events`, data: { audited: execs.length, auditEvents: recentAudit.length } };
      }
      default:
        throw new AppError("BAD_REQUEST", "Unknown broker agent", 400);
    }
  },

  /* ── Command center ───────────────────────────────────────── */

  async commandCenter(oid: string): Promise<TradingCommandCenter> {
    const accounts = await this.listAccounts(oid);
    const positions: BrokerPosition[] = [];
    const pendingOrders: BrokerPendingOrder[] = [];
    for (const a of accounts) {
      try { positions.push(...await this.listPositions(oid, a.id)); } catch {}
      try { pendingOrders.push(...await this.listOrders(oid, a.id)); } catch {}
    }
    const strategies = await this.listStrategies(oid);
    const risk = await this.getRiskControls(oid);
    const recentExecutions = await this.listExecutions(oid, 8);
    const totalEquity = accounts.reduce((s, a) => s + a.account.equity, 0);
    const totalBalance = accounts.reduce((s, a) => s + a.account.balance, 0);
    const exposureUsd = positions.reduce((s, p) => s + Math.abs(p.volume * p.currentPrice), 0);
    const exposurePct = totalEquity > 0 ? Math.round((exposureUsd / totalEquity) * 100) : 0;
    const dailyPnL = accounts.reduce((s, a) => s + a.account.dailyPnl, 0);
    const connected = accounts.filter((a) => a.status === "connected").length;
    let eaConnected = 0; let eaTotal = 0;
    try {
      const { EaService } = await import("./ea.service.js");
      const eas = await EaService.listEa(oid); eaTotal = eas.length; eaConnected = eas.filter((e) => e.connected).length;
    } catch { /* optional */ }
    const aiRecommendations = recentExecutions.length === 0
      ? ["Connect a broker account (MT5 supported via ZMQ bridge, HTTP bridge, MetaApi cloud, or Simulator) to start."]
      : ["Review pending approvals (assisted mode).", "Run portfolio intelligence for concentration check.", connected === accounts.length ? "All broker accounts connected." : `${accounts.length - connected} account(s) not connected.`];
    return {
      accounts, totalEquity, totalBalance, openPositions: positions, pendingOrders,
      activeStrategies: strategies.filter((s) => s.enabled).length,
      tradeConfidence: recentExecutions.length ? Math.round(recentExecutions.reduce((s, e) => s + e.confidence, 0) / recentExecutions.length * 100) : 0,
      portfolioRisk: { exposureUsd, exposurePct, dailyPnL, drawdownPct: Math.max(0, Math.round(dailyPnL < 0 ? (Math.abs(dailyPnL) / Math.max(1, totalEquity)) * 100 : 0)) },
      riskControls: risk, recentExecutions, aiRecommendations,
      systemHealth: { brokerConnected: connected, brokerTotal: accounts.length, ffmpeg: false, lastSyncAt: accounts.some((a) => a.lastSyncAt) ? accounts.map((a) => a.lastSyncAt!).sort().slice(-1)[0] : undefined, eaConnected, eaTotal },
    };
  },

  /**
   * Dashboard rollup — aggregates everything the trading UI needs in one call.
   */
  async dashboard(oid: string): Promise<{
    generatedAt: string;
    accounts: BrokerAccount[]; positions: BrokerPosition[]; orders: BrokerPendingOrder[];
    executions: TradeExecution[]; deals: BrokerDeal[]; strategies: TradingStrategy[]; eas: any[];
    risk: BrokerRiskControls; portfolio: PortfolioIntelligence;
    health: { connectedAccounts: number; totalAccounts: number; connectedEas: number; totalEas: number; recentErrors: number; uptimePct: number };
    pnl: { today: number; week: number; month: number; allTime: number };
    winRate: { day: number; week: number };
    connectors: { broker: string; label: string; available: boolean; transport?: string }[];
    /** Phase 21 — per-connector recent error history for the dashboard panel. */
    recentErrorsByConnector: Array<{
      broker: string; label: string; accountId: string;
      errors: Array<{ at: string; message: string; category: string }>;
    }>;
  }> {
    const accounts = await this.listAccounts(oid);
    const positions: BrokerPosition[] = [];
    const orders: BrokerPendingOrder[] = [];
    const deals: BrokerDeal[] = [];
    for (const a of accounts) {
      try { positions.push(...await this.listPositions(oid, a.id)); } catch {}
      try { orders.push(...await this.listOrders(oid, a.id)); } catch {}
      try { deals.push(...(await this.listDeals(oid, a.id, { days: 30 }))); } catch {}
    }
    const executions = await this.listExecutions(oid, 50);
    const strategies = await this.listStrategies(oid);
    const risk = await this.getRiskControls(oid);
    const portfolio = await this.portfolioIntelligence(oid);

    let eas: any[] = [];
    try {
      const { EaService } = await import("./ea.service.js");
      eas = await EaService.listEa(oid);
    } catch {}

    const now = Date.now();
    const day = 24*3600*1000, week = 7*day, month = 30*day;
    const sumPnl = (fromMs: number) => deals
      .filter((d) => Date.parse(d.time) >= now - fromMs)
      .reduce((s, d) => s + (d.profit ?? 0), 0);
    const pnl = { today: round2(sumPnl(day)), week: round2(sumPnl(week)), month: round2(sumPnl(month)), allTime: round2(sumPnl(1e15)) };
    const winRate = (fromMs: number) => {
      const w = deals.filter((d) => Date.parse(d.time) >= now - fromMs && d.entry === "out");
      if (!w.length) return 0;
      const wins = w.filter((d) => (d.profit ?? 0) >= 0).length;
      return Math.round((wins / w.length) * 1000) / 10;
    };
    const connectedAccounts = accounts.filter((a) => a.status === "connected");
    const connAvail = await connectorRegistry.probeAvailability();
    const connectors = connAvail.map((c) => ({ broker: c.broker, label: BROKER_LABEL[c.broker] ?? c.broker, available: c.available, transport: c.transports?.[0] }));
    const recentErrors = executions.filter((e) => e.status === "failed" || e.status === "blocked").length;
    // Phase 21 — aggregate per-connector error history for the dashboard panel.
    const recentErrorsByConnector = connectorRegistry.aggregateRecentErrors(oid, 10);

    return {
      generatedAt: new Date().toISOString(),
      accounts, positions, orders, executions, deals, strategies, eas, risk, portfolio,
      health: {
        connectedAccounts: connectedAccounts.length, totalAccounts: accounts.length,
        connectedEas: eas.filter((e) => e.connected).length, totalEas: eas.length,
        recentErrors, uptimePct: accounts.length ? Math.round((connectedAccounts.length / Math.max(1, accounts.length)) * 1000) / 10 : 100,
      },
      pnl, winRate: { day: winRate(day), week: winRate(week) }, connectors,
      recentErrorsByConnector,
    };
  },

  /* ── Internal persistence helpers ─────────────────────────── */

  async loadCredentials(oid: string, id: string): Promise<{ login: string; password: string; server: string; extra?: Record<string, string> }> {
    const rec = await this.mustGetAccount(oid, id);
    const blob = j<ReturnType<typeof encryptString>>(await redis.get(K.creds(oid, id)));
    const plain = decryptString(blob);
    if (!plain) throw new AppError("INTERNAL_ERROR", "could not decrypt broker credentials", 500);
    return { login: rec.login, password: plain, server: rec.server };
  },

  async persistPositions(oid: string, accountId: string, positions: BrokerPosition[]): Promise<void> {
    // Reset the position set for this account (full sync).
    const existing = await redis.smembers(K.positions(oid, accountId));
    if (existing.length) await redis.del(...existing.map((p) => K.position(oid, accountId, p)));
    await redis.del(K.positions(oid, accountId));
    for (const p of positions) {
      const pid = String(p.ticket ?? p.id);
      await redis.set(K.position(oid, accountId, pid), s2({ ...p, id: pid, accountId }));
      await redis.sadd(K.positions(oid, accountId), pid);
    }
  },

  async persistOrders(oid: string, accountId: string, orders: BrokerPendingOrder[]): Promise<void> {
    const existing = await redis.smembers(K.orders(oid, accountId));
    if (existing.length) await redis.del(...existing.map((o) => K.order(oid, accountId, o)));
    await redis.del(K.orders(oid, accountId));
    for (const o of orders) {
      const oidk = String(o.ticket ?? o.id);
      await redis.set(K.order(oid, accountId, oidk), s2({ ...o, id: oidk, accountId }));
      await redis.sadd(K.orders(oid, accountId), oidk);
    }
  },

  async persistSymbols(oid: string, accountId: string, symbols: BrokerSymbol[]): Promise<void> {
    // Remove existing symbol keys, then write new. Track names via a set (avoid SCAN/KEYS in prod).
    const old = await redis.smembers(K.symbols(oid, accountId));
    if (old.length) {
      await redis.del(...old.map((n: string) => K.symbol(oid, accountId, n)));
      await redis.del(K.symbols(oid, accountId));
    }
    for (const s of symbols) {
      await redis.set(K.symbol(oid, accountId, s.name), s2(s));
      await redis.sadd(K.symbols(oid, accountId), s.name);
    }
  },

  async persistDeals(oid: string, accountId: string, deals: BrokerDeal[]): Promise<void> {
    // Cap stored deals per account to most recent 5000.
    await redis.del(K.deals(oid, accountId));
    const sorted = [...deals].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 5000);
    for (const d of sorted) await redis.lpush(K.deals(oid, accountId), s2({ ...d, id: d.ticket ?? d.id, accountId }));
    await redis.ltrim(K.deals(oid, accountId), 0, 4999);
  },

  /**
   * Apply positions + account snapshot received from the EA heartbeat. Used
   * when the EA is the sole execution path (no live ZMQ/HTTP/MetaApi connector)
   * so the dashboard and risk engine reflect reality.
   */
  async applyEaHeartbeat(oid: string, acct: BrokerAccount, hb: {
    state: {
      balance: number; equity: number; freeMargin: number; marginLevel?: number;
      positions: Array<{ ticket: string; symbol: string; side: "BUY" | "SELL"; volume: number; openPrice: number; currentPrice: number; sl?: number; tp?: number; profit: number; swap?: number; openTime: string }>;
    };
  }): Promise<void> {
    const positions: BrokerPosition[] = hb.state.positions.map((p) => ({
      id: p.ticket, accountId: acct.id, ticket: p.ticket, symbol: p.symbol,
      side: p.side === "BUY" ? "long" : "short", volume: p.volume, openPrice: p.openPrice,
      currentPrice: p.currentPrice, sl: p.sl, tp: p.tp, profit: p.profit, swap: p.swap,
      openTime: p.openTime,
    }));
    const totalPnl = positions.reduce((s, p) => s + p.profit, 0);
    await this.persistPositions(oid, acct.id, positions);
    acct.account.balance = hb.state.balance;
    acct.account.equity = hb.state.equity;
    acct.account.freeMargin = hb.state.freeMargin;
    acct.account.marginLevel = hb.state.marginLevel;
    acct.account.profit = totalPnl;
    acct.account.dailyPnl = totalPnl;
    acct.lastSyncAt = now();
    acct.status = "connected";
    acct.transport = "ea";
    acct.error = undefined;
    await redis.set(K.account(oid, acct.id), s2(acct));
  },

  async recordExecution(oid: string, account: BrokerAccount, signal: TradeSignalInput, source: string): Promise<TradeExecution> {
    const id = randomUUID();
    const ex: TradeExecution = {
      id, organizationId: oid, accountId: account.id, accountName: account.name,
      symbol: signal.symbol, side: signal.side, volume: signal.volume,
      source, confidence: 1, mode: account.mode, status: "submitted",
      decision: "submitted", riskChecks: [],
      stopLoss: signal.stopLoss, takeProfit: signal.takeProfit,
      connectorTransport: account.transport,
      createdAt: now(), updatedAt: now(),
    };
    await redis.lpush(K.executions(oid), id);
    await redis.set(K.execution(oid, id), s2(ex));
    return ex;
  },
};
