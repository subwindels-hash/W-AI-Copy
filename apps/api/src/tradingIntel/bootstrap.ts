/**
 * Session 81 — Unified Global Trading Intelligence bootstrap.
 *
 * Bootstraps market-data providers (real CoinGecko crypto + synthetic fallback)
 * and the trading-intel analytics service.
 */
import { TradingIntelService as Ti } from "./tradingIntel.service.js";
import { bootstrapMarketData } from "./marketData.js";

export async function bootstrapTradingIntel(logger?: any): Promise<void> {
  await bootstrapMarketData({ logger });
  await Ti.ensureBootstrapped(logger);
  const dash = await Ti.dashboard();
  logger?.info("[trading-intel] unified platform online", {
    agentsOnline: dash.agentsOnline,
    markets: Object.keys(dash.markets).length,
    indicators: dash.indicators,
    positionsOpen: dash.positionsOpen,
    pnl24hUsd: dash.pnl24hUsd,
  });
}
