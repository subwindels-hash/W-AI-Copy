/**
 * WINDELS AI OS — Broker Connector Registry.
 *
 * WINDELS AI OS IS NOT A BROKER, EXCHANGE, DEALING DESK, LIQUIDITY PROVIDER,
 * OR CUSTODIAN. It is an Enterprise AI Trading Agent that connects to the
 * user's own external brokers/exchanges via their official APIs. All trade
 * execution occurs at the external broker/exchange; WINDELS never holds
 * funds, runs an internal order book, matches orders, settles trades, or
 * acts as counterparty. Strategy backtesting lives in
 * tradingIntel/backtest (market-data replay for AI evaluation) and is
 * explicitly not a trading venue — it has no balances, fills, or margin.
 *
 * Every IBrokerConnector registered here talks to an external provider:
 *   Forex/CFDs: MT5 (native ZMQ/HTTP bridge or MetaApi cloud). Future: MT4/cTrader.
 *   Crypto:     Binance, Bybit, OKX, Coinbase, Kraken, KuCoin, Bitget, Gate.io,
 *               MEXC, HTX, Crypto.com, Hyperliquid (Phase 1).
 *   Traditional: IBKR, Alpaca, TradeStation, OANDA, IG (future).
 *
 * Paper/demo trading uses the external broker/exchange's own demo/testnet
 * accounts — not an internal simulator.
 *
 * Central registry for IBrokerConnector implementations. The API and service
 * layers never import a concrete connector directly; they go through the
 * registry, which selects the appropriate connector based on BrokerType.
 */
import type { BrokerType } from "@windels/shared/brokerIntegration";
import type { IBrokerConnector } from "./broker-connector.js";
import { logger } from "../../config/logger.js";

class ConnectorRegistry {
  private readonly connectors = new Map<BrokerType, IBrokerConnector>();

  register(connector: IBrokerConnector) {
    if (this.connectors.has(connector.broker)) {
      logger.warn("[connectors] overriding existing connector registration", { broker: connector.broker });
    }
    this.connectors.set(connector.broker, connector);
    logger.info("[connectors] registered broker connector", { broker: connector.broker, label: connector.label, transports: connector.supportedTransports });
  }

  get(broker: BrokerType): IBrokerConnector | null {
    return this.connectors.get(broker) ?? null;
  }

  mustGet(broker: BrokerType): IBrokerConnector {
    const c = this.get(broker);
    if (!c) {
      const available = Array.from(this.connectors.keys());
      throw new Error(`No connector registered for broker type "${broker}". Available: ${available.join(", ") || "<none>"}`);
    }
    return c;
  }

  list(): Array<{ broker: BrokerType; label: string; transports: string[]; available: boolean }> {
    return Array.from(this.connectors.values()).map((c) => ({
      broker: c.broker, label: c.label, transports: [...c.supportedTransports],
      // We cannot await isAvailable() synchronously here; callers who need the
      // live value should call probeAvailability().
      available: false,
    }));
  }

  async probeAvailability(): Promise<Array<{ broker: BrokerType; label: string; transports: string[]; available: boolean; reason?: string }>> {
    const out = [];
    for (const c of this.connectors.values()) {
      try {
        const ok = await c.isAvailable();
        out.push({ broker: c.broker, label: c.label, transports: [...c.supportedTransports], available: ok });
      } catch (e) {
        out.push({ broker: c.broker, label: c.label, transports: [...c.supportedTransports], available: false, reason: (e as Error).message });
      }
    }
    return out;
  }

  async initializeAll() {
    for (const c of this.connectors.values()) {
      try {
        await c.initialize();
        logger.info("[connectors] initialized", { broker: c.broker });
      } catch (e) {
        logger.error("[connectors] initialization failed — connector will report unavailable", { broker: c.broker, err: e });
      }
    }
  }

  async shutdownAll() {
    for (const c of this.connectors.values()) {
      try { await c.shutdown(); } catch (e) { logger.warn("[connectors] shutdown error", { broker: c.broker, err: e }); }
    }
  }

  /**
   * Aggregate recent errors from all registered connectors for a given org.
   * Phase 21 — Dashboard recent-errors panel.
   */
  aggregateRecentErrors(oid: string, limitPerAccount = 10): Array<{
    broker: BrokerType;
    label: string;
    accountId: string;
    errors: Array<{ at: string; message: string; category: string }>;
  }> {
    const out: Array<{
      broker: BrokerType;
      label: string;
      accountId: string;
      errors: Array<{ at: string; message: string; category: string }>;
    }> = [];
    for (const c of this.connectors.values()) {
      if (typeof c.getRecentErrors !== "function") continue;
      // Each connector tracks its own accounts; we call getRecentErrors for
      // each connected account. The connector internally knows which accounts
      // belong to which org (via the session opts).
      // For connectors without getRecentErrors (e.g. MT5), this is skipped.
      try {
        // Attempt to get errors for all accounts this connector manages.
        // Connectors expose their account list through the health/getState path;
        // we rely on the connector's own knowledge of its connected accounts.
        const connectorAny = c as any;
        if (connectorAny.accounts instanceof Map) {
          for (const [acctId, sess] of connectorAny.accounts) {
            const sessOid = (sess as any)?.opts?.config?._oid;
            if (sessOid !== oid) continue;
            const errs = c.getRecentErrors!(acctId, limitPerAccount);
            if (errs.length > 0) {
              out.push({ broker: c.broker, label: c.label, accountId: acctId, errors: errs });
            }
          }
        }
      } catch { /* best-effort aggregation */ }
    }
    return out;
  }
}

export const connectorRegistry = new ConnectorRegistry();

// ── Register bundled connectors ──────────────────────────────────
// Every connector below talks to an EXTERNAL broker or exchange via its
// official API. There is no in-process broker/simulator registered here —
// WINDELS is not a trading venue. Paper trading uses external demo/testnet
// accounts; strategy backtesting is a separate analytical utility (see
// tradingIntel/backtest) that does not execute trades.
//
// Forex / CFDs: MT5.
// Crypto:      12 launch exchanges.
// Traditional: IBKR/Alpaca/TradeStation/OANDA/IG (future).
// Imports are dynamic so missing optional deps don't hard-crash boot.
export async function registerBundledConnectors() {
  // Forex / CFDs
  try {
    const { Mt5Connector } = await import("../mt5/mt5-connector.js");
    connectorRegistry.register(new Mt5Connector());
  } catch (e) { logger.warn("[connectors] MT5 connector failed to load", { err: e }); }

  // Crypto — 12 exchange connectors (Phase 1 of crypto vertical).
  // Dynamic imports are typed `any` because each module has a named
  // export (*Connector) discovered at runtime.
  type Loader = () => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const cryptoConnectors: Array<[string, Loader]> = [
    ["binance",     () => import("../crypto/exchanges/binance.js")],
    ["bybit",       () => import("../crypto/exchanges/bybit.js")],
    ["okx",         () => import("../crypto/exchanges/okx.js")],
    ["coinbase",    () => import("../crypto/exchanges/coinbase.js")],
    ["kraken",      () => import("../crypto/exchanges/kraken.js")],
    ["kucoin",      () => import("../crypto/exchanges/kucoin.js")],
    ["bitget",      () => import("../crypto/exchanges/bitget.js")],
    ["gateio",      () => import("../crypto/exchanges/gateio.js")],
    ["mexc",        () => import("../crypto/exchanges/mexc.js")],
    ["htx",         () => import("../crypto/exchanges/htx.js")],
    ["cryptocom",   () => import("../crypto/exchanges/cryptocom.js")],
    ["hyperliquid", () => import("../crypto/exchanges/hyperliquid.js")],
  ];
  for (const [name, loader] of cryptoConnectors) {
    try {
      const mod = await loader();
      const Ctor = (mod as any).default
        ?? (mod as any)[name.charAt(0).toUpperCase() + name.slice(1) + "Connector"]
        ?? Object.values(mod).find((v: any) => typeof v === "function" && v.prototype?.connect) as any;
      if (Ctor) connectorRegistry.register(new Ctor());
      else logger.warn("[connectors] crypto module had no exported connector class", { name });
    } catch (e) {
      logger.warn("[connectors] crypto connector failed to load", { name, err: e });
    }
  }
}
