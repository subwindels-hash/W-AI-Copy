/**
 * WINDELS AI OS — Broker Connector Registry.
 *
 * Central registry for IBrokerConnector implementations. The API and service
 * layers never import a concrete connector directly; they go through the
 * registry, which selects the appropriate connector based on BrokerType.
 *
 * Phase 1 ships the MT5 connector (native_python_zmq + metaapi_cloud transports).
 * Crypto exchanges (Binance, Bybit, OKX, Coinbase, Kraken, KuCoin, Bitget,
 * Gate.io, MEXC, HTX, Crypto.com, Hyperliquid) and traditional brokers (IBKR,
 * Alpaca, Tradestation, OANDA, IG) plug in here in their respective phases.
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
}

export const connectorRegistry = new ConnectorRegistry();

// ── Register bundled connectors ──────────────────────────────────
// Forex/CFDs vertical: MT5 + deterministic MT5 simulator.
// Crypto vertical: 12 launch exchanges.
// Traditional-markets connectors (IBKR/Alpaca/TradeStation/OANDA/IG) are
// registered in their own phase once built.
// Imports are dynamic so missing optional deps don't hard-crash boot.
export async function registerBundledConnectors() {
  // Forex / CFDs
  try {
    const { Mt5Connector } = await import("../mt5/mt5-connector.js");
    connectorRegistry.register(new Mt5Connector());
  } catch (e) { logger.warn("[connectors] MT5 connector failed to load", { err: e }); }
  try {
    const { Mt5Simulator } = await import("../mt5/mt5-simulator.js");
    connectorRegistry.register(new Mt5Simulator());
  } catch (e) { logger.warn("[connectors] MT5 simulator failed to load", { err: e }); }

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
