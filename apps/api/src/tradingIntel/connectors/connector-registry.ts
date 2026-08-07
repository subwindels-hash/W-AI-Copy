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
// Phase 1: MT5. Crypto / traditional-broker connectors are registered in their
// own phases once built. Import is dynamic so missing optional deps don't
// hard-crash boot.
export async function registerBundledConnectors() {
  try {
    const { Mt5Connector } = await import("../mt5/mt5-connector.js");
    connectorRegistry.register(new Mt5Connector());
  } catch (e) {
    logger.warn("[connectors] MT5 connector failed to load", { err: e });
  }
}
