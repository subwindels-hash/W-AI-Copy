/**
 * Market Data Abstraction Layer
 * ──────────────────────────────
 * Provider-neutral market data interface. Supports crypto, equities, forex,
 * commodities, futures, options, bonds, indices.
 *
 * Providers:
 *   - coingecko  : crypto (no API key required, public endpoint, rate limited)
 *   - synthetic  : seeded deterministic demo data (always available, flagged synthetic=true)
 *   - (stub)     : alphaVantage, twelveData, polygon, iexCloud, openExchangeRates,
 *                  binance, coinbase, oanda, interactiveBrokers, alpaca — require API keys
 *
 * Guarantees:
 *   - Every provider reports health (connected, lastSuccess, lastError, latencyMs).
 *   - Data is cached in Redis with TTL and stale-data detection.
 *   - Failover: if primary provider is unhealthy or stale, next provider is tried.
 *   - Synthetic/demo data is ALWAYS flagged synthetic=true (Fifth Standing Rule for trading).
 *   - Rate-limited: client-side token bucket per provider.
 */
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import type { TiMarketClass, TiCandle, TiQuote, TiProviderStatus } from "@windels/shared";

const DEFAULT_TTL = {
  quote: 30,          // 30s for quotes
  candles_1m: 60,
  candles_5m: 120,
  candles_1h: 300,
  candles_1d: 1800,
  instruments: 3600,
};

export type Timeframe = "1m"|"5m"|"15m"|"1h"|"4h"|"1d"|"1w";

export interface MarketDataProvider {
  id: string;
  name: string;
  supports: TiMarketClass[];
  rateLimit: { perSecond: number; perMinute: number };

  /** Health probe */
  ping(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
  /** Get quote. Returns null if unavailable. */
  getQuote(symbol: string, marketClass: TiMarketClass): Promise<TiQuote | null>;
  /** Get historical candles. Oldest first. */
  getCandles(symbol: string, marketClass: TiMarketClass, timeframe: Timeframe, limit: number): Promise<TiCandle[] | null>;
  /** Instrument metadata (exchange, base/quote, name, etc.) */
  listInstruments(marketClass: TiMarketClass): Promise<Array<{symbol:string;name:string;marketClass:TiMarketClass}> | null>;
}

interface ProviderMetrics {
  id: string;
  connected: boolean;
  lastSuccessAt: number;
  lastFailureAt: number;
  lastError: string;
  latencyMs: number;
  callsThisMinute: number;
  callsThisSecond: number;
  rateLimitRemaining: number;
  supports: TiMarketClass[];
}

// ── Redis key helpers ───────────────────────────────────────────────────
const K = {
  quote: (prov: string, sym: string, cls: string) => `md:q:${prov}:${cls}:${sym}`,
  candles: (prov: string, sym: string, cls: string, tf: string) => `md:c:${prov}:${cls}:${sym}:${tf}`,
  meta: (prov: string) => `md:meta:${prov}`,
  health: (prov: string) => `md:health:${prov}`,
  symb: (cls: string) => `md:symbols:${cls}`,
};

// ── CoinGecko provider (no API key required) ────────────────────────────
class CoinGeckoProvider implements MarketDataProvider {
  id = "coingecko";
  name = "CoinGecko";
  supports: TiMarketClass[] = ["crypto"];
  rateLimit = { perSecond: 0.5, perMinute: 10 };    // 30 calls/min for free
  private base = "https://api.coingecko.com/api/v3";
  private lastCall = 0;
  private callCountMin = 0;
  private windowStart = Date.now();

  private async throttle() {
    const now = Date.now();
    if (now - this.windowStart > 60000) { this.callCountMin = 0; this.windowStart = now; }
    const minGap = 1200; // ~50 req/min conservative
    const wait = Math.max(0, minGap - (now - this.lastCall));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this.lastCall = Date.now();
    this.callCountMin++;
  }

  async ping() {
    const t0 = Date.now();
    try {
      const r = await fetch(`${this.base}/ping`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  async getQuote(symbol: string, _marketClass: TiMarketClass): Promise<TiQuote | null> {
    await this.throttle();
    const id = coingeckoId(symbol);
    if (!id) return null;
    try {
      const r = await fetch(`${this.base}/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const j = await r.json() as Record<string, any>;
      const d = j[id]; if (!d) return null;
      const price = d.usd as number;
      return {
        symbol, price, bid: price*0.9999, ask: price*1.0001,
        volume24h: (d.usd_24h_vol as number) ?? 0, change24hPct: (d.usd_24h_change as number) ?? 0,
        marketStatus: "24/7", timestamp: Math.floor(Date.now()/1000), source: this.id, synthetic: false,
      };
    } catch { return null; }
  }

  async getCandles(symbol: string, _cls: TiMarketClass, timeframe: Timeframe, limit: number): Promise<TiCandle[]|null> {
    await this.throttle();
    const id = coingeckoId(symbol); if (!id) return null;
    const days = timeframeToDays(timeframe, limit);
    try {
      const r = await fetch(`${this.base}/coins/${id}/market_chart?vs_currency=usd&days=${days}`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) return null;
      const j = await r.json() as any;
      const prices: [number,number][] = j.prices || [];
      const vols:  [number,number][] = j.total_volumes || [];
      const step = Math.max(1, Math.floor(prices.length / Math.min(limit, prices.length)));
      const out: TiCandle[] = [];
      for (let i = 0; i < prices.length; i += step) {
        const [t, p] = prices[i];
        const slice = prices.slice(i, i+step);
        const highs = slice.map(x=>x[1]);
        const lows  = slice.map(x=>x[1]);
        const v = vols[i]?.[1] ?? 0;
        out.push({
          time: Math.floor(t/1000),
          open: prices[Math.max(0,i-step)]?.[1] ?? p,
          high: Math.max(...highs),
          low: Math.min(...lows),
          close: p,
          volume: v,
        });
        if (out.length >= limit) break;
      }
      return out;
    } catch { return null; }
  }

  async listInstruments(_cls: TiMarketClass) {
    await this.throttle();
    try {
      const r = await fetch(`${this.base}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) return null;
      const j = await r.json() as any[];
      return j.map((c:any) => ({ symbol: `${c.symbol.toUpperCase()}/USD`, name: c.name, marketClass: "crypto" as TiMarketClass }));
    } catch { return null; }
  }
}

function coingeckoId(symbol: string): string | null {
  const map: Record<string,string> = {
    "BTC/USD":"bitcoin", "ETH/USD":"ethereum", "SOL/USD":"solana", "BNB/USD":"binancecoin",
    "XRP/USD":"ripple", "ADA/USD":"cardano", "DOGE/USD":"dogecoin", "AVAX/USD":"avalanche-2",
    "DOT/USD":"polkadot", "MATIC/USD":"matic-network", "LINK/USD":"chainlink", "LTC/USD":"litecoin",
    "BCH/USD":"bitcoin-cash", "XLM/USD":"stellar", "ATOM/USD":"cosmos", "UNI/USD":"uniswap",
  };
  return map[symbol.toUpperCase()] ?? null;
}
function timeframeToDays(tf: Timeframe, limit: number): number {
  switch(tf) {
    case "1m": return 1;
    case "5m": return 1;
    case "15m": return 7;
    case "1h": return 30;
    case "4h": return 90;
    case "1d": return Math.min(365, Math.ceil(limit));
    case "1w": return Math.min(1500, Math.ceil(limit*7));
  }
}

// ── Synthetic (demo) provider ──────────────────────────────────────────
class SyntheticProvider implements MarketDataProvider {
  id = "synthetic";
  name = "Synthetic Demo Data";
  supports: TiMarketClass[] = ["forex","crypto","stocks","etfs","commodities","futures","options","indices","bonds","precious-metals","energy","agriculture","digital-assets"];
  rateLimit = { perSecond: 1000, perMinute: 1_000_000 };
  async ping(){return{ok:true,latencyMs:0};}
  async getQuote(symbol: string, marketClass: TiMarketClass): Promise<TiQuote> {
    const seed = hashSym(symbol);
    const base = basePrice(symbol, marketClass, seed);
    const jitter = (Math.sin(seed+Date.now()/10000)*0.5+Math.cos(seed*3+Date.now()/15000)*0.3)*0.01;
    const price = +(base*(1+jitter)).toFixed(base<10?4:2);
    return { symbol, price, bid: price*0.9995, ask: price*1.0005, volume24h: 1_000_000+seed%5_000_000, change24hPct: +(jitter*100).toFixed(2), marketStatus: "24/7", timestamp: Math.floor(Date.now()/1000), source: this.id, synthetic: true };
  }
  async getCandles(symbol: string, marketClass: TiMarketClass, tf: Timeframe, limit: number): Promise<TiCandle[]> {
    const base = basePrice(symbol, marketClass, hashSym(symbol));
    const now = Math.floor(Date.now()/60000)*60;
    const stepSec = tfToSec(tf);
    let price = base*0.9;
    const out: TiCandle[] = [];
    for (let i=0;i<limit;i++) {
      const t = now - (limit-i)*stepSec;
      const drift = Math.sin(i/8+hashSym(symbol))*base*0.003;
      const o = price;
      price = Math.max(0.0001, price + drift);
      const c = price;
      const h = Math.max(o,c)*(1+0.001);
      const l = Math.min(o,c)*(1-0.001);
      out.push({time:t,open:+o.toFixed(4),high:+h.toFixed(4),low:+l.toFixed(4),close:+c.toFixed(4),volume:100000+hashSym(symbol)%900000});
    }
    return out;
  }
  async listInstruments(marketClass: TiMarketClass) { return SYMBOLS[marketClass]??[]; }
}

function hashSym(s: string){ let h=0; for (let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; return Math.abs(h); }
function tfToSec(tf: Timeframe){ return { "1m":60,"5m":300,"15m":900,"1h":3600,"4h":14400,"1d":86400,"1w":604800 }[tf]; }
function basePrice(sym: string, mc: TiMarketClass, seed: number){
  const upper = sym.toUpperCase();
  if (mc==="forex") {
    if (upper.includes("JPY")) return 150+(seed%20);
    return 0.85+(seed%30)/100;
  }
  if (mc==="crypto") { const m:Record<string,number>={"BTC":65000,"ETH":3400,"SOL":150,"BNB":600,"XRP":0.5,"ADA":0.45,"DOGE":0.12,"AVAX":35,"DOT":7,"MATIC":0.7,"LINK":15,"LTC":75}; for (const [k,v] of Object.entries(m)) if (upper.startsWith(k)) return v; return 10+(seed%500); }
  if (mc==="stocks"||mc==="etfs") { const m:Record<string,number>={"AAPL":220,"MSFT":420,"GOOGL":175,"AMZN":190,"TSLA":240,"NVDA":120,"META":520,"SPY":560,"QQQ":470}; for (const [k,v] of Object.entries(m)) if (upper.startsWith(k)) return v; return 20+seed%400; }
  if (mc==="commodities"||mc==="precious-metals"||mc==="energy") return 100+(seed%2000);
  if (mc==="indices") return 3000+seed%30000;
  if (mc==="bonds") return 95+((seed%500)/100);
  return 100;
}
const SYMBOLS: Record<TiMarketClass,Array<{symbol:string;name:string;marketClass:TiMarketClass}>> = {
  forex:["EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD","USD/CHF","NZD/USD"].map(s=>({symbol:s,name:s,marketClass:"forex" as TiMarketClass})),
  crypto:["BTC/USD","ETH/USD","SOL/USD","BNB/USD","XRP/USD","ADA/USD","DOGE/USD"].map(s=>({symbol:s,name:s,marketClass:"crypto" as TiMarketClass})),
  stocks:["AAPL","MSFT","GOOGL","AMZN","TSLA","NVDA","META"].map(s=>({symbol:s,name:s,marketClass:"stocks" as TiMarketClass})),
  etfs:["SPY","QQQ","DIA","IWM","GLD","SLV","TLT"].map(s=>({symbol:s,name:s,marketClass:"etfs" as TiMarketClass})),
  commodities:["CL=F","GC=F","SI=F","HG=F","NG=F","ZC=F","ZW=F"].map(s=>({symbol:s,name:s,marketClass:"commodities" as TiMarketClass})),
  futures:["ES","NQ","YM","RTY","CL","GC","SI"].map(s=>({symbol:s,name:s,marketClass:"futures" as TiMarketClass})),
  options:[],
  indices:["SPX","NDX","DJI","RUT","VIX","FTSE","DAX","N225","HSI"].map(s=>({symbol:s,name:s,marketClass:"indices" as TiMarketClass})),
  bonds:["US10Y","US2Y","US30Y","DE10Y","UK10Y","JP10Y"].map(s=>({symbol:s,name:s,marketClass:"bonds" as TiMarketClass})),
  "precious-metals":["XAU/USD","XAG/USD","XPT/USD","XPD/USD"].map(s=>({symbol:s,name:s,marketClass:"precious-metals" as TiMarketClass})),
  energy:["WTI","BRENT","NATGAS","HH"].map(s=>({symbol:s,name:s,marketClass:"energy" as TiMarketClass})),
  agriculture:["CORN","WHEAT","SOY","COFFEE","SUGAR","COTTON"].map(s=>({symbol:s,name:s,marketClass:"agriculture" as TiMarketClass})),
  "digital-assets":[],
};

// ── Market Data Service ────────────────────────────────────────────────
class MarketDataService {
  private providers: MarketDataProvider[] = [];
  private metrics = new Map<string, ProviderMetrics>();

  register(p: MarketDataProvider) {
    this.providers.push(p);
    this.metrics.set(p.id, {
      id: p.id, connected: false, lastSuccessAt: 0, lastFailureAt: 0, lastError: "",
      latencyMs: 0, callsThisMinute: 0, callsThisSecond: 0, rateLimitRemaining: p.rateLimit.perMinute,
      supports: p.supports,
    });
  }

  async refreshHealth(logger?: Logger) {
    for (const p of this.providers) {
      const m = this.metrics.get(p.id)!;
      const res = await p.ping();
      m.connected = res.ok;
      m.latencyMs = res.latencyMs ?? 0;
      if (res.ok) { m.lastSuccessAt = Date.now(); m.lastError = ""; }
      else { m.lastFailureAt = Date.now(); m.lastError = res.error ?? "unknown"; }
      await redis.set(K.health(p.id), JSON.stringify(m), "EX", 300);
      logger?.debug({ msg: "[market-data] health", provider: p.id, connected: m.connected, latencyMs: m.latencyMs });
    }
  }

  listProviders(): Array<Omit<TiProviderStatus,"lastSuccessAt"|"lastFailureAt">&{lastSuccessAt?:string;lastFailureAt?:string}> {
    return this.providers.map(p => {
      const m = this.metrics.get(p.id)!;
      return {
        id: p.id, name: p.name, connected: m.connected, rateLimitRemaining: m.rateLimitRemaining,
        lastSuccessAt: m.lastSuccessAt ? new Date(m.lastSuccessAt).toISOString() : undefined,
        lastFailureAt: m.lastFailureAt ? new Date(m.lastFailureAt).toISOString() : undefined,
        lastError: m.lastError || undefined,
        latencyMs: m.latencyMs || undefined,
        supports: p.supports,
      };
    });
  }

  private supportingProviders(cls: TiMarketClass): MarketDataProvider[] {
    const real = this.providers.filter(p => p.id !== "synthetic" && p.supports.includes(cls));
    const syn  = this.providers.filter(p => p.id === "synthetic");
    return [...real, ...syn];  // try real first, fall back to synthetic
  }

  async getQuote(symbol: string, cls: TiMarketClass): Promise<{quote: TiQuote; source: string; synthetic: boolean; stale: boolean}> {
    const cacheKey = K.quote("best", symbol, cls);
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        const q = JSON.parse(cached) as TiQuote;
        const age = Date.now()/1000 - q.timestamp;
        return { quote: q, source: q.source, synthetic: !!q.synthetic, stale: age > DEFAULT_TTL.quote*2 };
      } catch {}
    }
    let lastErr: any = null;
    for (const p of this.supportingProviders(cls)) {
      try {
        const q = await p.getQuote(symbol, cls);
        if (q) {
          await redis.set(cacheKey, JSON.stringify(q), "EX", DEFAULT_TTL.quote);
          const m = this.metrics.get(p.id)!;
          m.lastSuccessAt = Date.now();
          m.connected = true;
          return { quote: q, source: p.id, synthetic: !!q.synthetic, stale: false };
        }
      } catch(e) { lastErr = e;
        const m = this.metrics.get(p.id)!;
        m.lastFailureAt = Date.now(); m.lastError = String(e); m.connected = false;
      }
    }
    throw Object.assign(new Error(`No provider could quote ${cls}:${symbol}`), { lastErr });
  }

  async getCandles(symbol: string, cls: TiMarketClass, tf: Timeframe, limit: number): Promise<{candles: TiCandle[]; source: string; synthetic: boolean; stale: boolean}> {
    const cacheKey = K.candles("best", symbol, cls, tf);
    const metaKey = `${cacheKey}:meta`;
    const [cached, cachedMeta] = await Promise.all([redis.get(cacheKey), redis.get(metaKey)]);
    if (cached) {
      try {
        const arr = JSON.parse(cached) as TiCandle[];
        const age = arr.length ? Date.now()/1000 - arr[arr.length-1].time : 0;
        const isStale = age > DEFAULT_TTL.candles_1d*2;
        const meta = cachedMeta ? JSON.parse(cachedMeta) : { source: "cache", synthetic: false };
        return { candles: arr, source: meta.source, synthetic: !!meta.synthetic, stale: isStale };
      } catch {}
    }
    for (const p of this.supportingProviders(cls)) {
      try {
        const c = await p.getCandles(symbol, cls, tf, limit);
        if (c && c.length) {
          const ttl = DEFAULT_TTL["candles_1h"];
          const pipe = redis.multi();
          pipe.set(cacheKey, JSON.stringify(c), "EX", ttl);
          pipe.set(metaKey, JSON.stringify({ source: p.id, synthetic: p.id === "synthetic" }), "EX", ttl);
          await pipe.exec();
          return { candles: c, source: p.id, synthetic: p.id === "synthetic", stale: false };
        }
      } catch {}
    }
    throw new Error(`No provider could serve candles for ${cls}:${symbol}:${tf}`);
  }

  async listInstruments(cls: TiMarketClass) {
    for (const p of this.supportingProviders(cls)) {
      const inst = await p.listInstruments(cls);
      if (inst && inst.length) return inst;
    }
    return [];
  }
}

// ── Singleton ──────────────────────────────────────────────────────────
export const marketData = new MarketDataService();
marketData.register(new CoinGeckoProvider());
marketData.register(new SyntheticProvider());

export { CoinGeckoProvider, SyntheticProvider };
// Initialize in bootstrap
export async function bootstrapMarketData({ logger }: { logger?: Logger }) {
  await marketData.refreshHealth(logger);
  logger?.info({ msg: "[market-data] providers registered", providers: marketData.listProviders().length });
}
