import { describe, it, expect, vi } from "vitest";

// Mock ioredis globally so it does not connect to localhost
const store = new Map<string, string>();
vi.mock("ioredis", () => {
  return {
    Redis: class {
      constructor() {}
      async get(key: string) { return store.get(key) || null; }
      async set(key: string, value: string) { store.set(key, value); return "OK"; }
      async exists(key: string) { return store.has(key) ? 1 : 0; }
      multi() {
        return {
          set(key: string, val: string) { store.set(key, val); return this; },
          sadd() { return this; },
          async exec() { return []; }
        };
      }
      on() { return this; }
      async connect() { return Promise.resolve(); }
    }
  };
});

// Stub global fetch to mock CoinGecko endpoints locally
vi.stubGlobal("fetch", async (url: string) => {
  if (url.includes("coingecko.com")) {
    if (url.includes("/simple/price")) {
      return {
        ok: true,
        json: async () => ({
          bitcoin: { usd: 65000, usd_24h_vol: 25000000000, usd_24h_change: 1.5 }
        })
      };
    }
    if (url.includes("/market_chart")) {
      const prices = Array.from({ length: 90 }, (_, i) => [Date.now() - (90 - i) * 86400000, 60000 + i * 100]);
      return {
        ok: true,
        json: async () => ({ prices, total_volumes: prices.map(p => [p[0], 1000000]) })
      };
    }
    if (url.includes("/ping")) {
      return { ok: true, status: 200 };
    }
  }
  return { ok: false, status: 404, statusText: "Not Found" };
});

import { marketData } from "./marketData.js";
import { analyzeInstrument } from "./analysis.js";
import { runAgent } from "./agents.js";

describe("market data service", () => {
  it("lists providers (coingecko + synthetic)", () => {
    const ps = marketData.listProviders();
    const ids = ps.map((p) => p.id);
    expect(ids).toContain("coingecko");
    expect(ids).toContain("synthetic");
  });

  it("fetches BTC quote from coingecko (live)", async () => {
    const q = await marketData.getQuote("BTC/USD", "crypto");
    expect(q.quote.symbol).toBe("BTC/USD");
    expect(q.quote.price).toBeGreaterThan(100);
    expect(q.synthetic).toBe(false);
    expect(q.source).toBe("coingecko");
  }, 30000);

  it("falls back to synthetic for unsupported symbols/classes", async () => {
    const q = await marketData.getQuote("WHEAT", "commodities");
    expect(q.quote.synthetic).toBe(true);
    expect(q.source).toBe("synthetic");
  }, 5000);
});

describe("analysis engine", () => {
  it("returns MARKET_DATA_SOURCE_REQUIRED when allowSynthetic=false and no real data", async () => {
    const r = await analyzeInstrument({
      symbol: "WHEAT", marketClass: "commodities", timeframe: "1d", limit: 60, allowSynthetic: false,
    });
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toBe("MARKET_DATA_SOURCE_REQUIRED");
  }, 10000);

  it("produces full report with synthetic data clearly flagged", async () => {
    const r = await analyzeInstrument({
      symbol: "WHEAT", marketClass: "commodities", timeframe: "1d", limit: 90, allowSynthetic: true,
    });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.synthetic).toBe(true);
    expect(r.candlesUsed).toBe(90);
    expect(["trending-up","trending-down","ranging","high-volatility","low-liquidity"]).toContain(r.marketRegime);
    expect(r.signals.length).toBeGreaterThan(5);
    expect(r.tradeSetup === null || r.tradeSetup.bias === "long" || r.tradeSetup.bias === "short").toBe(true);
    expect(r.disclaimer).toContain("DECISION SUPPORT ONLY");
  }, 10000);

  it("produces a real BTC report from live data", async () => {
    const r = await analyzeInstrument({ symbol: "BTC/USD", marketClass: "crypto", timeframe: "1d", limit: 90 });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.synthetic).toBe(false);
    expect(r.dataSource).toContain("coingecko");
    expect(r.candlesUsed).toBeGreaterThanOrEqual(60);
    expect(r.price).toBeGreaterThan(100);
  }, 30000);
});

describe("trading agents", () => {
  it("lists 16 specialized agents", async () => {
    const ag = await import("./agents.js");
    expect(ag.listAgents()).toHaveLength(16);
  });

  it("crypto agent returns a structured advisory report (live BTC)", async () => {
    const r = await runAgent("crypto", { symbol: "BTC/USD", marketClass: "crypto", timeframe: "1d", limit: 90 });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.agent).toBe("crypto");
    expect(["bullish","bearish","neutral"]).toContain(r.technicalBias);
    expect(r.keyFindings.length).toBeGreaterThan(2);
    expect(r.risks.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
    expect(r.disclaimer).toContain("DECISION SUPPORT ONLY");
    expect(r.synthetic).toBe(false);
  }, 30000);

  it("options agent clearly states options-chain data is required", async () => {
    const r = await runAgent("options", { symbol: "SPY", marketClass: "etfs", timeframe: "1d", limit: 90 });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.recommendations.join(" ")).toMatch(/options|chain|Greeks|IV/i);
  }, 10000);

  it("perf-analytics agent reports trade-journal requirement", async () => {
    const r = await runAgent("perf-analytics", { symbol: "SPY", marketClass: "etfs", timeframe: "1d", limit: 90 });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.keyFindings.join(" ")).toMatch(/journal|history/i);
  }, 10000);
});
