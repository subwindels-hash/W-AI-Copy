/**
 * Phase 9 — Curated extended market list.
 *
 * Verifies that fetchMarkets returns a broad-enough universe across all
 * connectors to cover the major tradable assets at cold start. WINDELS is
 * not a broker; this list is the bootstrap universe until live /exchangeInfo
 * fetch is added (later phase).
 */
import { describe, it, expect } from "vitest";
import { BinanceConnector } from "./exchanges/binance.js";
import { BybitConnector } from "./exchanges/bybit.js";
import { OkxConnector } from "./exchanges/okx.js";
import { BitgetConnector } from "./exchanges/bitget.js";
import { GateioConnector } from "./exchanges/gateio.js";
import { MexcConnector } from "./exchanges/mexc.js";
import { HtxConnector } from "./exchanges/htx.js";
import { CryptocomConnector } from "./exchanges/cryptocom.js";
import { HyperliquidConnector } from "./exchanges/hyperliquid.js";
import { CoinbaseConnector } from "./exchanges/coinbase.js";
import { KrakenConnector } from "./exchanges/kraken.js";
import { KucoinConnector } from "./exchanges/kucoin.js";

const CONNECTORS: [string, any, number][] = [
  ["binance", BinanceConnector, 40],
  ["bybit", BybitConnector, 40],
  ["okx", OkxConnector, 40],
  ["bitget", BitgetConnector, 40],
  ["gateio", GateioConnector, 40],
  ["mexc", MexcConnector, 40],
  ["htx", HtxConnector, 40],
  ["cryptocom", CryptocomConnector, 40],
  ["hyperliquid", HyperliquidConnector, 30],
  ["coinbase", CoinbaseConnector, 30],
  ["kraken", KrakenConnector, 30],
  ["kucoin", KucoinConnector, 30],
];

describe("Phase 9 — extended curated market list", () => {
  for (const [name, Ctor, min] of CONNECTORS) {
    it(`${name} ships at least ${min} curated markets`, () => {
      const c = new Ctor();
      // fetchMarkets is protected but we don't want to make real HTTP calls;
      // reach in via prototype to inspect via the static major pairs usage.
      // Instead, instantiate a stub session and call the markets synthesis
      // by reading the code path indirectly via a fake http client:
      const fakeHttp = { request: async () => ({ data: [] }) };
      const fakeOpts = { config: {}, creds: { apiKey: "", apiSecret: "", passphrase: "" } };
      const sess = { http: fakeHttp, opts: fakeOpts, creds: fakeOpts.creds, markets: new Map(), marketsByRaw: new Map(), balances: new Map(), positions: new Map(), openOrders: new Map(), fills: [] };
      // Invoke fetchMarkets via the protected method on the instance.
      return (c as any).fetchMarkets(sess).then((mkts: any[]) => {
        expect(mkts.length).toBeGreaterThanOrEqual(min);
        // Must contain BTC and ETH bases.
        const bases = new Set(mkts.map((m) => m.base));
        expect(bases.has("BTC")).toBe(true);
        expect(bases.has("ETH")).toBe(true);
        // All symbols are non-empty and have the required fields.
        for (const m of mkts) {
          expect(m.symbol).toBeTruthy();
          expect(m.rawSymbol).toBeTruthy();
          expect(["spot", "perp", "margin", "futures", "options"]).toContain(m.type);
          expect(m.tickSize).toBeGreaterThan(0);
          expect(m.stepSize).toBeGreaterThan(0);
        }
      });
    });
  }
});
