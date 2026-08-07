/**
 * Binance connector (Spot + USDⓈ-M Futures + COIN-M Futures).
 *
 * Auth: HMAC-SHA256 of query+body with secret; signature in `signature`
 * query param; API key in `X-MBX-APIKEY` header.
 * Endpoints:
 *   - Spot: https://api.binance.com  (testnet: https://testnet.binance.vision)
 *   - USDⓈ-M Futures: https://fapi.binance.com (testnet: https://testnet.binancefuture.com)
 *   - COIN-M Futures: https://dapi.binance.com
 * Phase 1 supports spot and USDⓈ-M perp (most common set). Coin-M is wired
 * but only enabled when markets return.
 */
import type {
  CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket,
  CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot,
  CryptoBalance, CryptoOrder, CryptoCandle, CryptoMarketType, CryptoTicker,
} from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha256Hex } from "../signing.js";
import { phase1Gate } from "./common.js";

type BinanceSession = ReturnType<BaseCryptoConnector["mustGet"]> & { clock: { serverTimeMs?: number; localSampleMs?: number } };

const CAPABILITIES: CryptoConnectorCapabilities = {
  markets: ["spot", "perp", "futures", "margin"],
  auth: ["hmac_sha256_header"],
  hasPublicWs: true,
  hasPrivateWs: true,
  hasBatchQueries: true,
  hasTransfers: false,
  restBaseUrl: "https://api.binance.com",
  testnetRestUrl: "https://testnet.binance.vision",
  publicWsUrl: "wss://stream.binance.com:9443/ws",
  privateWsUrl: "wss://stream.binance.com:9443/ws",
  defaultReqPerMin: 1200,
  correctsClockDrift: true,
};

export class BinanceConnector extends BaseCryptoConnector {
  constructor() {
    super({ exchange: "binance", label: "Binance", capabilities: CAPABILITIES });
  }

  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        headers["X-MBX-APIKEY"] = creds.apiKey;
        const ts = timestampMs;
        const recvWindow = 5000;
        const addSig = (params: string) => {
          const sig = hmacSha256Hex(creds.apiSecret, params);
          return params + "&signature=" + sig;
        };
        if (method === "GET" || method === "DELETE") {
          const url = new URL("http://x" + path);
          url.searchParams.set("timestamp", String(ts));
          url.searchParams.set("recvWindow", String(recvWindow));
          const newQuery = addSig(url.searchParams.toString());
          const qIndex = path.indexOf("?");
          const basePath = qIndex >= 0 ? path.slice(0, qIndex) : path;
          return { path: basePath + "?" + newQuery };
        } else {
          // Parse existing body if any; merge timestamp/recvWindow; form-encode; sign.
          const params = new URLSearchParams();
          if (body) {
            try {
              const j = JSON.parse(body);
              for (const [k, v] of Object.entries(j)) {
                if (v === undefined || v === null) continue;
                params.set(k, String(v));
              }
            } catch {
              // body is already form-encoded
              for (const pair of body.split("&")) {
                const [k, v] = pair.split("=");
                if (k) params.set(k, v ?? "");
              }
            }
          }
          params.set("timestamp", String(ts));
          params.set("recvWindow", String(recvWindow));
          const newBody = addSig(params.toString());
          headers["content-type"] = "application/x-www-form-urlencoded";
          return { body: newBody };
        }
      },
    };
  }

  protected async fetchMarkets(_sess: BinanceSession): Promise<CryptoMarket[]> {
    // Phase 1: return a curated major-markets list to keep payload small.
    // Production can pull /api/v3/exchangeInfo for spot + /fapi/v1/exchangeInfo for perps.
    const pairs = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "MATICUSDT", "DOTUSDT", "LTCUSDT", "BCHUSDT", "ATOMUSDT", "UNIUSDT"];
    return pairs.map<CryptoMarket>((r) => {
      const base = r.replace(/USDT$/, "");
      return {
        symbol: `${base}/USDT`, rawSymbol: r, type: "spot",
        base, quote: "USDT", settle: "", contractSize: 1, active: true,
        pricePrecision: 2, qtyPrecision: 5, minQty: 0.00001, minNotional: 10,
        maxLeverage: 1, tickSize: 0.01, stepSize: 0.00001,
      };
    }).concat(pairs.map<CryptoMarket>((r) => {
      const base = r.replace(/USDT$/, "");
      return {
        symbol: `${base}/USDT:USDT`, rawSymbol: r, type: "perp",
        base, quote: "USDT", settle: "USDT", contractSize: 1, active: true,
        pricePrecision: 2, qtyPrecision: 3, minQty: 0.001, minNotional: 5,
        maxLeverage: 125, tickSize: 0.01, stepSize: 0.001,
      };
    }));
  }

  protected async fetchAccountSnapshot(sess: BinanceSession): Promise<CryptoAccountSnapshot> {
    // For Phase 1: fetch balances from /api/v3/account; positions from /fapi/v2/positionRisk.
    const http = sess.http;
    const bal = await http.request<any>({ method: "GET", path: "/api/v3/account", skipAuth: false });
    const balances: CryptoBalance[] = (bal.data.balances ?? [])
      .map((b: any) => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked), total: Number(b.free) + Number(b.locked) }))
      .filter((b: CryptoBalance) => b.total > 0);
    let positions: CryptoPosition[] = [];
    let openOrders: CryptoOrder[] = [];
    try {
      const pos = await http.request<any>({ method: "GET", path: "/fapi/v2/positionRisk" });
      positions = (pos.data ?? []).filter((p: any) => Number(p.positionAmt) !== 0).map((p: any) => ({
        symbol: rawToUnifiedPerp(p.symbol),
        marketType: "perp" as CryptoMarketType,
        side: Number(p.positionAmt) > 0 ? "long" : "short",
        quantity: Math.abs(Number(p.positionAmt)),
        entryPrice: Number(p.entryPrice),
        markPrice: Number(p.markPrice),
        unrealizedPnl: Number(p.unRealizedProfit),
        realizedPnl: 0,
        leverage: Number(p.leverage) ?? 1,
        margin: 0,
        marginType: "cross",
        liquidationPrice: Number(p.liquidationPrice) || null,
        openedTime: new Date(Number(p.updateTime)).toISOString(),
        updatedTime: new Date(Number(p.updateTime)).toISOString(),
      }));
      const oo = await http.request<any>({ method: "GET", path: "/fapi/v1/openOrders" });
      openOrders = (oo.data ?? []).map((o: any) => ({
        id: String(o.orderId), clientOrderId: o.clientOrderId,
        symbol: rawToUnifiedPerp(o.symbol), marketType: "perp",
        side: o.side.toLowerCase() === "buy" ? "buy" : "sell",
        type: normalizeType(o.type), price: Number(o.price) || null,
        quantity: Number(o.origQty), filledQuantity: Number(o.executedQty),
        remainingQuantity: Number(o.origQty) - Number(o.executedQty),
        avgFillPrice: Number(o.avgPrice) || null,
        status: normalizeStatus(o.status),
        timeInForce: o.timeInForce ?? "GTC",
        reduceOnly: !!o.reduceOnly, leverage: undefined,
        createdTime: new Date(o.time).toISOString(), updatedTime: new Date(o.updateTime ?? o.time).toISOString(),
        fee: 0, feeCurrency: "USDT",
      }));
    } catch { /* perms may not include futures */ }

    const equityUsd = balances.reduce((s, b) => s + approximateUsd(b.asset, b.total), 0);
    const unrealizedPnlUsd = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
    return { accountId: sess.login, accountType: "spot+futures", canTrade: true, canWithdraw: false, equityUsd, unrealizedPnlUsd, balances, positions, openOrders };
  }

  protected async placeOrder(_sess: BinanceSession, _req: CryptoOrderRequest): Promise<OrderResult> { return phase1Gate("binance"); }
  protected async modifyOrder(_sess: BinanceSession, _orderId: string, _patch: { sl?: number; tp?: number; comment?: string }): Promise<OrderResult> { return phase1Gate("binance"); }
  protected async closePositionImpl(_sess: BinanceSession, _orderIdOrSymbol: string, _volume?: number): Promise<OrderResult> { return phase1Gate("binance"); }
  protected async fetchCandles(sess: BinanceSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol); if (!m) return [];
    const interval = mapTimeframe(tf);
    const path = m.type === "perp" ? "/fapi/v1/klines" : "/api/v3/klines";
    const r = await sess.http.request<any[]>({
      method: "GET", path, query: { symbol: m.rawSymbol, interval, limit: Math.min(count, 1000) }, skipAuth: true,
    });
    return (r.data ?? []).map((k: any) => ({
      symbol, timeframe: tf, time: new Date(k[0]).toISOString(),
      open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]),
      volume: Number(k[5]), quoteVolume: Number(k[7]), trades: k[8] ? Number(k[8]) : undefined,
    }));
  }
  protected async fetchRecentFills(sess: BinanceSession, sinceIso?: string): Promise<CryptoFill[]> {
    // /api/v3/myTrades for spot, /fapi/v1/userTrades for futures
    const out: CryptoFill[] = [];
    try {
      const r = await sess.http.request<any[]>({ method: "GET", path: "/fapi/v1/userTrades", query: { limit: 100 } });
      for (const t of r.data ?? []) {
        out.push({
          id: String(t.id), orderId: String(t.orderId), symbol: rawToUnifiedPerp(t.symbol), marketType: "perp",
          side: t.buyer ? "buy" : "sell", price: Number(t.price), quantity: Number(t.qty),
          fee: Number(t.commission), feeCurrency: t.commissionAsset, realizedPnl: Number(t.realizedPnl),
          time: new Date(t.time).toISOString(), isMaker: !!t.maker, tradeId: String(t.id),
        });
      }
    } catch { /* perms */ }
    if (sinceIso) return out.filter((f) => f.time >= sinceIso);
    return out;
  }
  protected authenticatePrivateWs(_sess: BinanceSession, _send: (p: string | object) => void): void | Promise<void> {
    // Binance user-data streams require a listenKey from POST /api/v3/userDataStream; Phase 2 wires this.
  }
}

/* ── helpers ─────────────────────────────────────────────── */

function rawToUnifiedPerp(raw: string): string {
  const s = raw.replace(/USDT$/, "");
  return `${s}/USDT:USDT`;
}
function normalizeType(t: string): CryptoOrderRequest["type"] {
  const u = t.toUpperCase();
  if (u === "LIMIT") return "limit";
  if (u === "MARKET") return "market";
  if (u === "STOP") return "stop_market";
  if (u === "STOP_MARKET") return "stop_market";
  if (u === "TAKE_PROFIT_MARKET") return "take_profit_market";
  if (u === "TAKE_PROFIT") return "take_profit_limit";
  if (u === "LIMIT_MAKER") return "post_only";
  return "limit";
}
function normalizeStatus(s: string): CryptoOrder["status"] {
  const u = s.toUpperCase();
  if (u === "NEW" || u === "PENDING_NEW") return "new";
  if (u === "PARTIALLY_FILLED") return "partially_filled";
  if (u === "FILLED") return "filled";
  if (u === "CANCELED" || u === "CANCELLED" || u === "EXPIRED") return "canceled";
  if (u === "REJECTED") return "rejected";
  if (u === "EXPIRED") return "expired";
  return "new";
}
function mapTimeframe(tf: string): string {
  const map: Record<string, string> = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1d", W1: "1w", MN1: "1M" };
  return map[tf] ?? "1h";
}
function approximateUsd(asset: string, total: number): number {
  if (total <= 0) return 0;
  if (asset === "USDT" || asset === "BUSD" || asset === "USDC" || asset === "TUSD" || asset === "FDUSD") return total;
  if (asset === "BTC") return total * 65000;
  if (asset === "ETH") return total * 3200;
  if (asset === "BNB") return total * 580;
  return total * 0.5; // conservative unknown; exact pricing via tickers in Phase 2
}
