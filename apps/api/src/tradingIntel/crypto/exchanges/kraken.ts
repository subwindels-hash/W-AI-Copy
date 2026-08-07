/**
 * Kraken connector (Spot — v1 WebSockets).
 *
 * Auth (REST): HMAC-SHA512 base64 of (path + SHA256(nonce+postdata)) keyed with
 * base64-decoded API secret. Headers: API-Key + API-Sign.
 * REST base: https://api.kraken.com  Path prefix /0/private/*.
 *
 * WebSockets: WINDELS uses Kraken's v1 (legacy) protocol because (a) it is
 * the certified stable feed for the ownTrades / openOrders private channels
 * (the v2 endpoints were still in flux for private data at the time of
 * writing) and (b) its token bootstrap flow (GetWebSocketsToken → token in
 * subscribe.subscription.token) is well-documented.
 *
 *   Public:   wss://ws.kraken.com          (array-form messages; ticker)
 *   Private:  wss://ws-auth.kraken.com     (array-form; ownTrades + openOrders)
 *
 * Private auth flow:
 *   1. POST /0/private/GetWebSocketsToken (signed via HttpSigner) → {token}
 *   2. Connect to wss://ws-auth.kraken.com
 *   3. Send subscribe {subscription:{name:"openOrders",token}}
 *   4. Send subscribe {subscription:{name:"ownTrades",token,snapshot:true}}
 *   5. Tokens last 15 min, but remain valid while subscription is active;
 *      the WS client will call prepareUrl (which re-fetches the token) on
 *      every reconnect so re-subscribe always uses a fresh token.
 *
 * WINDELS is an AI Trading Agent, not a broker. The Kraken connector is a
 * client of Kraken's public API; WINDELS never matches, fills, settles, or
 * custodies customer assets. All trades are dispatched to the user's own
 * Kraken account via Kraken's official REST+WS endpoints.
 */
import type { CryptoCredentials, CryptoConnectorCapabilities, CryptoMarket, CryptoOrderRequest, CryptoPosition, CryptoFill, CryptoAccountSnapshot, CryptoBalance, CryptoOrder, CryptoCandle } from "@windels/shared/crypto";
import { BaseCryptoConnector } from "../base-crypto-connector.js";
import type { CryptoAccountSession } from "../base-crypto-connector.js";
import type { OrderResult } from "../../connectors/broker-connector.js";
import type { HttpSigner } from "../exchange-http.js";
import { hmacSha512Base64, sha256Hex } from "../signing.js";
import { mkMarket } from "./common.js";

const CAPS: CryptoConnectorCapabilities = {
  markets: ["spot"],
  auth: ["hmac_sha512_header"], hasPublicWs: true, hasPrivateWs: true, hasBatchQueries: false, hasTransfers: true,
  restBaseUrl: "https://api.kraken.com",
  testnetRestUrl: "https://api.kraken.com",
  // v1 endpoints (array-form messages).
  publicWsUrl: "wss://ws.kraken.com",
  privateWsUrl: "wss://ws-auth.kraken.com",
  publicWsPingIntervalMs: 25_000,
  privateWsPingIntervalMs: 25_000,
  defaultReqPerMin: 200, correctsClockDrift: false,
};

// Kraken-specific asset name canonicalization. Kraken REST uses canonical
// "XBT"/"ETH" style alt-names but v1 websockets use "XBT/USD" pair strings.
const KRAKEN_ASSET_ALIASES: Record<string, string> = {
  XXBT: "BTC", XBT: "BTC", BTC: "BTC",
  XETH: "ETH", ETH: "ETH",
  XXRP: "XRP", XRP: "XRP",
  XLTC: "LTC", LTC: "LTC",
  XXDG: "DOGE", XDG: "DOGE", DOGE: "DOGE",
  ADA: "ADA", DOT: "DOT", SOL: "SOL", LINK: "LINK", MATIC: "MATIC",
  BCH: "BCH", ETC: "ETC", FIL: "FIL", ATOM: "ATOM", NEAR: "NEAR",
  APT: "APT", ARB: "ARB", OP: "OP", SUI: "SUI", SEI: "SEI", INJ: "INJ",
  TIA: "TIA", PEPE: "PEPE", WIF: "WIF", SHIB: "SHIB", TRX: "TRX",
  UNI: "UNI", AAVE: "AAVE", MKR: "MKR", LDO: "LDO", RNDR: "RNDR",
  IMX: "IMX", STX: "STX", FET: "FET", GRT: "GRT", PYTH: "PYTH",
  JUP: "JUP", WLD: "WLD", ENS: "ENS", TON: "TON", AVAX: "AVAX",
  BNB: "BNB",
  ZUSD: "USD", USD: "USD",
  USDT: "USDT", USDC: "USDC", BUSD: "BUSD", TUSD: "TUSD", FDUSD: "FDUSD",
  ZEUR: "EUR", EUR: "EUR", ZGBP: "GBP", GBP: "GBP", ZJPY: "JPY", JPY: "JPY",
  ZCAD: "CAD", CAD: "CAD", ZAUD: "AUD", AUD: "AUD",
};

function normalizeAsset(a: string): string {
  if (!a) return a;
  const up = a.toUpperCase();
  if (KRAKEN_ASSET_ALIASES[up]) return KRAKEN_ASSET_ALIASES[up];
  // Kraken prefixes fiat/stable assets with Z and crypto assets with X, but
  // only for legacy 3-letter codes. Try with the prefix stripped.
  const stripped = up.replace(/^[XZ]/, "");
  if (KRAKEN_ASSET_ALIASES[stripped]) return KRAKEN_ASSET_ALIASES[stripped];
  return up;
}

// v1 WebSocket pairs look like "XBT/USD", "ETH/USDT". We build our markets in
// terms of our unified "BTC/USD", "ETH/USDT" and remember the raw WS pair
// name via a lookup table.
const KRAKEN_WS_QUOTES = ["USDT", "USD"] as const;
const KRAKEN_WS_BASES = [
  "BTC", "ETH", "SOL", "XRP", "DOGE", "BNB", "ADA", "AVAX", "LINK", "MATIC",
  "DOT", "LTC",
  "BCH", "ETC", "FIL", "ATOM", "NEAR", "APT", "ARB", "OP", "SUI", "SEI",
  "INJ", "TIA", "PEPE", "WIF", "SHIB", "TRX", "UNI", "AAVE", "MKR", "LDO",
  "RNDR", "IMX", "STX", "FET", "GRT", "PYTH", "JUP", "WLD", "ENS", "TON",
];
// Map unified BASE -> Kraken v1 ws base name (XBT special, others pass through).
function krakenWsBase(b: string): string {
  if (b === "BTC") return "XBT";
  return b;
}

export class KrakenConnector extends BaseCryptoConnector {
  constructor() { super({ exchange: "kraken", label: "Kraken", capabilities: CAPS }); }
  private nextReqId = 1;
  private reqId(): number { return this.nextReqId++; }

  protected buildSigner(creds: CryptoCredentials): HttpSigner {
    return {
      sign: ({ method, path, body, headers, timestampMs }) => {
        // microsecond-grained nonce per Kraken's recommendation.
        const nonce = String(timestampMs * 1000);
        let postdata = "";
        if (method !== "GET") {
          const params = new URLSearchParams();
          if (body) {
            // Accept either form-encoded strings (already built upstream by
            // a prior signer) or JSON-object bodies from callers like
            // placeOrder/cancelOrder passing body: {txid: ...}.
            const trimmed = String(body).trim();
            if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
              try {
                const j = JSON.parse(trimmed);
                if (j && typeof j === "object") {
                  for (const [k, v] of Object.entries(j)) {
                    if (v === undefined || v === null) continue;
                    params.set(k, String(v));
                  }
                }
              } catch { /* fall through: treat as raw form */ params.set("raw", trimmed); }
            } else {
              // Already form-encoded — parse and re-emit so ordering is normalized.
              const parsed = new URLSearchParams(trimmed);
              for (const [k, v] of parsed.entries()) params.set(k, v);
            }
          }
          params.set("nonce", nonce);
          postdata = params.toString();
        }
        const np = nonce + postdata;
        const hash = sha256Hex(np);
        // API-Sign = Base64(HMAC-SHA512(base64-decoded-secret, path + sha256(nonce+postdata)))
        const sig = hmacSha512Base64(creds.apiSecret, path + hash);
        headers["API-Key"] = creds.apiKey;
        headers["API-Sign"] = sig;
        headers["content-type"] = "application/x-www-form-urlencoded";
        return { body: method !== "GET" ? postdata : null };
      },
    };
  }

  protected async fetchMarkets(): Promise<CryptoMarket[]> {
    const out: CryptoMarket[] = [];
    for (const b of KRAKEN_WS_BASES) {
      for (const q of KRAKEN_WS_QUOTES) {
        const kbase = krakenWsBase(b);
        out.push(mkMarket(`${b}/${q}`, `${kbase}${q}`, "spot", b, q, "", 0.01, 0.00001, 1, 0.00001, 5, 2, 6));
      }
    }
    return out;
  }

  protected async fetchAccountSnapshot(sess: CryptoAccountSession): Promise<CryptoAccountSnapshot> {
    const b = await sess.http.request<any>({ method: "POST", path: "/0/private/Balance" });
    const balances: CryptoBalance[] = Object.entries(b.data?.result ?? {}).map(([a, v]) => {
      const tot = Number(v);
      const asset = normalizeAsset(a);
      return { asset, free: tot, locked: 0, total: tot, usdValue: (asset === "USDT" || asset === "USDC" || asset === "USD" || asset === "BUSD") ? tot : undefined };
    }).filter((b) => b.total > 0);

    let openOrders: CryptoOrder[] = [];
    try {
      const o = await sess.http.request<any>({ method: "POST", path: "/0/private/OpenOrders" });
      openOrders = Object.entries(o.data?.result?.open ?? {}).map(([id, x]: [string, any]) => krakenRestOrderToCrypto(id, x));
    } catch { /* */ }

    const positions: CryptoPosition[] = [];
    return {
      accountId: sess.login, accountType: "spot", canTrade: true, canWithdraw: true,
      equityUsd: balances.reduce((s, b) => s + (b.usdValue ?? 0), 0),
      unrealizedPnlUsd: 0, balances, positions, openOrders,
    };
  }

  protected async placeOrder(sess: CryptoAccountSession, req: CryptoOrderRequest): Promise<OrderResult> {
    const m = sess.markets.get(req.symbol);
    if (!m) return { ok: false, error: "unknown symbol" };
    const body: Record<string, any> = {
      pair: `${krakenWsBase(m.base)}${m.quote}`,
      type: req.side === "buy" ? "buy" : "sell",
      ordertype: req.type === "limit" ? "limit" : "market",
      volume: String(req.quantity),
    };
    if (req.clientOrderId) body.userref = req.clientOrderId;
    if (req.price && body.ordertype === "limit") body.price = String(req.price);
    if (req.reduceOnly) body.oflags = "fciq";
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/0/private/AddOrder", body });
      const err = r.data?.error;
      if (err && err.length) return { ok: false, error: err.join(";"), retcode: -1 };
      return { ok: true, ticket: r.data?.result?.txid?.[0], comment: req.clientOrderId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  protected async modifyOrder(_sess: CryptoAccountSession, _id: string, _patch: any): Promise<OrderResult> {
    return { ok: false, error: "kraken modifyOrder not certified — cancel+replace instead" };
  }

  protected async closePositionImpl(sess: CryptoAccountSession, orderIdOrSymbol: string, volume?: number): Promise<OrderResult> {
    // Spot close: market sell the base balance.
    const m = sess.markets.get(orderIdOrSymbol) ?? [...sess.markets.values()].find((x) => x.rawSymbol === orderIdOrSymbol);
    if (!m) return { ok: false, error: "market not found" };
    const bal = sess.balances.get(m.base);
    const qty = volume ?? bal?.free ?? 0;
    if (qty <= 0) return { ok: false, error: "no balance" };
    return this.placeOrder(sess, { symbol: m.symbol, marketType: m.type, side: "sell", type: "market", quantity: qty });
  }

  protected async cancelOrderImpl(sess: CryptoAccountSession, orderId: string): Promise<OrderResult> {
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/0/private/CancelOrder", body: { txid: orderId } });
      if (r.data?.error?.length) return { ok: false, error: r.data.error.join(";") };
      return { ok: true, ticket: orderId };
    } catch (e: any) { return { ok: false, error: e.message }; }
  }

  protected async fetchCandles(sess: CryptoAccountSession, symbol: string, tf: string, count: number): Promise<CryptoCandle[]> {
    const m = sess.markets.get(symbol);
    if (!m) return [];
    const interval = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440, W1: 10080, MN1: 21600 }[tf] ?? 60;
    const r = await sess.http.request<any>({
      method: "GET", path: "/0/public/OHLC",
      query: { pair: `${krakenWsBase(m.base)}${m.quote}`, interval: String(interval) },
      skipAuth: true,
    });
    const key = Object.keys(r.data?.result ?? {}).find((k) => k !== "last");
    if (!key) return [];
    return (r.data.result[key] ?? []).slice(-count).map((k: any) => ({
      symbol, timeframe: tf, time: new Date(Number(k[0]) * 1000).toISOString(),
      open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[6]),
    }));
  }

  protected async fetchRecentFills(sess: CryptoAccountSession, since?: string): Promise<CryptoFill[]> {
    try {
      const r = await sess.http.request<any>({ method: "POST", path: "/0/private/TradesHistory" });
      const out: CryptoFill[] = Object.entries(r.data?.result?.trades ?? {}).map(([id, t]: [string, any]) => ({
        id, orderId: t.ordertxid, symbol: pairToUnified(t.pair), marketType: "spot",
        side: t.type === "buy" ? "buy" : "sell", price: Number(t.price), quantity: Number(t.vol),
        fee: Number(t.fee), feeCurrency: "USD", realizedPnl: undefined,
        time: new Date(Number(t.time) * 1000).toISOString(), isMaker: false, tradeId: id,
      }));
      if (since) return out.filter((f) => f.time >= since);
      return out;
    } catch { return []; }
  }

  /* ── WebSocket: private ── */

  /**
   * Get a fresh WS token. Tokens last 15 min but are cached per-session
   * on the CryptoAccountSession; the WS client calls prepareUrl on every
   * reconnect (preparePrivateWsUrl hook) so re-auth always uses a fresh token.
   */
  private async fetchWsToken(sess: CryptoAccountSession): Promise<string> {
    const r = await sess.http.request<any>({ method: "POST", path: "/0/private/GetWebSocketsToken" });
    const tok = r.data?.result?.token;
    if (!tok) throw new Error("kraken: empty WebSocket token response");
    return tok as string;
  }

  /**
   * preparePrivateWsUrl is called by the base before every private-WS TCP open.
   * We need the token to put it in subscribe frames (not the URL) but we
   * fetch it here and cache it on the session so authenticatePrivateWs can
   * send the subscribe frames synchronously.
   */
  protected async preparePrivateWsUrl(sess: CryptoAccountSession): Promise<string | undefined> {
    (sess as any)._krakenToken = await this.fetchWsToken(sess);
    return CAPS.privateWsUrl;
  }

  /**
   * Kraken v1 private WS: authentication is per-subscribe (token field),
   * there is no login frame. authenticatePrivateWs is a no-op; the real
   * subscribes happen in afterPrivateAuth.
   */
  protected authenticatePrivateWs(_sess: CryptoAccountSession, _send: (p: any) => void): void {
    // no-op — subscriptions carry the token themselves.
  }

  protected async afterPrivateAuth(sess: CryptoAccountSession, send: (p: any) => void): Promise<void> {
    const token = (sess as any)._krakenToken as string | undefined;
    if (!token) {
      // Shouldn't happen (preparePrivateWsUrl sets it), but best-effort fetch.
      try { (sess as any)._krakenToken = await this.fetchWsToken(sess); }
      catch { return; }
    }
    const tok = (sess as any)._krakenToken;
    send({ event: "subscribe", reqid: this.reqId(), subscription: { name: "openOrders", ratecounter: true, token: tok } });
    send({ event: "subscribe", reqid: this.reqId(), subscription: { name: "ownTrades", snapshot: false, token: tok } });
  }

  /* ── WebSocket: ping/pong ── */

  protected publicPingMessage(): object {
    return { event: "ping", reqid: this.reqId() };
  }
  protected privatePingMessage(): object {
    return { event: "ping", reqid: this.reqId() };
  }

  /* ── Public WS ticker ── */

  protected buildTickerSubscribePayload(m: CryptoMarket): object | null {
    // v1 ticker: {event:"subscribe", pair:["XBT/USD"], subscription:{name:"ticker"}}
    return {
      event: "subscribe", reqid: this.reqId(),
      pair: [`${krakenWsBase(m.base)}/${m.quote}`],
      subscription: { name: "ticker" },
    };
  }
  protected buildTickerUnsubscribePayload(m: CryptoMarket): object | null {
    return {
      event: "unsubscribe", reqid: this.reqId(),
      pair: [`${krakenWsBase(m.base)}/${m.quote}`],
      subscription: { name: "ticker" },
    };
  }

  protected parseTickerMessage(_sess: CryptoAccountSession, _m: CryptoMarket, payload: any): { bid: number; ask: number } | null {
    if (!payload) return null;
    // v1 ticker data object: a=[bestAsk,_,_], b=[bestBid,_,_]
    const a = Array.isArray(payload.a) ? payload.a : undefined;
    const b = Array.isArray(payload.b) ? payload.b : undefined;
    if (!a || !b) return null;
    const ask = Number(a[0]);
    const bid = Number(b[0]);
    if (!ask || !bid) return null;
    return { bid, ask };
  }

  protected parsePublicMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    // Public messages can be either object-form (event messages) or array-form
    // (data updates). We return routed events per ticker channel.
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return []; }
    if (msg && typeof msg === "object" && !Array.isArray(msg)) {
      const ev = msg.event;
      if (ev === "pong" || ev === "heartbeat" || ev === "systemStatus") return [];
      if (ev === "subscriptionStatus") return [];
      return [];
    }
    if (Array.isArray(msg)) {
      // v1 data: [channelID, data, channelName, pair?]
      const channelName = msg[msg.length - 2];
      const pair: string | undefined = msg[msg.length - 1];
      if (channelName === "ticker" && pair) {
        // Map pair (e.g. "XBT/USD") → our market.
        const sym = pairToUnified(pair);
        const m = sess.markets.get(sym);
        if (!m) return [];
        return [{ channel: `ticker:${m.rawSymbol}`, payload: msg[1] }];
      }
    }
    return [];
  }

  /* ── Private WS parser ── */

  protected parsePrivateMessage(sess: CryptoAccountSession, raw: string): Array<{ channel: string; payload: unknown }> {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return []; }
    if (msg && typeof msg === "object" && !Array.isArray(msg)) {
      const ev = msg.event;
      if (ev === "pong" || ev === "heartbeat" || ev === "systemStatus") return [];
      if (ev === "subscriptionStatus") {
        // If an error on ownTrades/openOrders, mark lastError.
        if (msg.status === "error" && msg.errorMessage) {
          // Don't throw; just log.
        }
        return [];
      }
      return [];
    }
    if (!Array.isArray(msg)) return [];
    const out: Array<{ channel: string; payload: unknown }> = [];
    const channelName = msg[msg.length - 2];
    const data = msg[0];
    if (!Array.isArray(data)) return [];

    if (channelName === "openOrders") {
      // data is array of {orderid: orderObject} entries.
      for (const entry of data) {
        if (!entry || typeof entry !== "object") continue;
        for (const [id, rawOrder] of Object.entries(entry)) {
          const o = rawOrder as any;
          // Merge with existing tracked fields: updates are delta (only changed
          // fields), so we must spread prior state.
          const prior = sess.openOrders.get(id);
          const merged: any = { ...(prior ? cryptoOrderToRaw(prior) : {}), ...o };
          const order = krakenWsOrderToCrypto(id, merged);
          const priorFilled = prior?.filledQuantity ?? 0;
          const newFilled = Number(merged.vol_exec ?? merged.filledQuantity ?? order.filledQuantity) || 0;
          const delta = Math.max(0, newFilled - priorFilled);
          // Re-seed so applyFill math matches cumulative total.
          order.filledQuantity = priorFilled;
          order.remainingQuantity = Math.max(0, order.quantity - priorFilled);
          sess.openOrders.set(id, order);
          if (delta > 0) {
            const avgPrice = Number(merged.avg_price ?? order.avgFillPrice ?? order.price ?? 0) || 0;
            this.applyFill(sess, {
              id: `${id}:${Math.floor(Number(merged.lastupdated ?? Date.now() / 1000) * 1000)}`,
              orderId: id,
              symbol: order.symbol,
              marketType: "spot",
              side: order.side,
              price: avgPrice,
              quantity: delta,
              fee: Math.abs(Number(merged.fee ?? 0)),
              feeCurrency: "USD",
              realizedPnl: 0,
              time: merged.lastupdated ? new Date(Number(merged.lastupdated) * 1000).toISOString() : new Date().toISOString(),
              isMaker: (merged.oflags ?? "").includes("post"),
              tradeId: undefined,
            });
          }
          // Evict terminal states.
          const stat = (o.status ?? merged.status ?? "").toLowerCase();
          if (stat === "closed" || stat === "canceled" || stat === "cancelled" || stat === "expired") {
            // Order done; if it was filled it may already have been removed via applyFill path.
            sess.openOrders.delete(id);
          }
        }
      }
      out.push({ channel: "order", payload: data });
    } else if (channelName === "ownTrades") {
      // data is array of {tradeid: tradeObject} entries.
      for (const entry of data) {
        if (!entry || typeof entry !== "object") continue;
        for (const [id, rawTrade] of Object.entries(entry)) {
          const t = rawTrade as any;
          const sym = pairToUnified(t.pair);
          const fill: CryptoFill = {
            id,
            orderId: t.ordertxid,
            symbol: sym,
            marketType: "spot",
            side: t.type === "sell" ? "sell" : "buy",
            price: Number(t.price ?? 0),
            quantity: Number(t.vol ?? 0),
            fee: Number(t.fee ?? 0),
            feeCurrency: "USD",
            realizedPnl: 0,
            time: t.time ? new Date(Number(t.time) * 1000).toISOString() : new Date().toISOString(),
            isMaker: false,
            tradeId: id,
          };
          if (fill.quantity > 0 && fill.orderId) this.applyFill(sess, fill);
          out.push({ channel: "fill", payload: fill });
        }
      }
    }

    return out;
  }
}

/* ── Kraken → unified helpers ── */

function pairToUnified(pair: string): string {
  // Kraken pair strings come in two shapes:
  //   v1 WS: "XBT/USD", "ETH/USDT"  (with "/" separator)
  //   REST:  "XBTUSD", "ETHUSDT"    (concatenated)
  // We always split on "/" first (unambiguous); when no slash is present we
  // fall back to suffix-matching against known quotes, ordered longest-first
  // to avoid "TUSD" matching the tail of "XBTUSD" (which should parse as
  // base=XBT, quote=USD).
  if (!pair) return "";
  if (pair.includes("/")) {
    const [baseRaw, quoteRaw] = pair.split("/");
    return `${normalizeAsset(baseRaw)}/${normalizeAsset(quoteRaw)}`;
  }
  const quotes = ["FDUSD", "USDT", "USDC", "BUSD", "TUSD", "EUR", "GBP", "JPY", "CAD", "AUD", "USD"];
  for (const q of quotes) {
    if (pair.endsWith(q)) {
      const basePart = pair.slice(0, pair.length - q.length);
      return `${normalizeAsset(basePart)}/${q}`;
    }
  }
  return pair;
}

function mapKrakenStatus(s: string | undefined): CryptoOrder["status"] {
  if (!s) return "new";
  const u = s.toLowerCase();
  if (u === "pending" || u === "new" || u === "open") return "new";
  if (u === "partial") return "partially_filled";
  if (u === "closed" || u === "filled") return "filled";
  if (u === "canceled" || u === "cancelled") return "canceled";
  if (u === "expired") return "expired";
  if (u === "rejected") return "rejected";
  return "new";
}

function krakenRestOrderToCrypto(id: string, x: any): CryptoOrder {
  const pair = x.descr?.pair ?? x.pair ?? "";
  const sym = pairToUnified(pair);
  const vol = Number(x.vol ?? 0);
  const volExec = Number(x.vol_exec ?? 0);
  return {
    id,
    clientOrderId: x.userref ?? undefined,
    symbol: sym,
    marketType: "spot",
    side: (x.descr?.type === "sell" ? "sell" : "buy"),
    type: (x.descr?.ordertype === "limit" ? "limit" : "market"),
    price: Number(x.descr?.price ?? x.price ?? 0) || null,
    triggerPrice: null,
    quantity: vol,
    filledQuantity: volExec,
    remainingQuantity: Math.max(0, vol - volExec),
    avgFillPrice: Number(x.price ?? 0) || null,
    status: mapKrakenStatus(x.status),
    timeInForce: "GTC",
    reduceOnly: false,
    createdTime: x.opentm ? new Date(Number(x.opentm) * 1000).toISOString() : new Date().toISOString(),
    updatedTime: new Date().toISOString(),
    fee: 0, feeCurrency: "ZUSD",
  };
}

function krakenWsOrderToCrypto(id: string, x: any): CryptoOrder {
  // v1 WS order objects look almost exactly like REST OpenOrders entries but
  // may be partial (delta). descr is only present on the first snapshot.
  const descr = x.descr ?? {};
  const pair = descr.pair ?? x.pair ?? "";
  const sym = pairToUnified(pair);
  const vol = Number(x.vol ?? 0);
  const volExec = Number(x.vol_exec ?? 0);
  return {
    id,
    clientOrderId: x.userref ?? undefined,
    symbol: sym || id,
    marketType: "spot",
    side: (descr.type === "sell" ? "sell" : "buy"),
    type: (descr.ordertype === "limit" ? "limit" : "market"),
    price: Number(descr.price ?? x.price ?? 0) || null,
    triggerPrice: null,
    quantity: vol,
    filledQuantity: volExec,
    remainingQuantity: Math.max(0, vol - volExec),
    avgFillPrice: Number(x.avg_price ?? 0) || null,
    status: mapKrakenStatus(x.status),
    timeInForce: "GTC",
    reduceOnly: false,
    createdTime: x.opentm ? new Date(Number(x.opentm) * 1000).toISOString() : new Date().toISOString(),
    updatedTime: x.lastupdated ? new Date(Number(x.lastupdated) * 1000).toISOString() : new Date().toISOString(),
    fee: Math.abs(Number(x.fee ?? 0)),
    feeCurrency: "ZUSD",
  };
}

/** Reverse helper used in parsePrivateMessage delta-merge (best-effort). */
function cryptoOrderToRaw(o: CryptoOrder): any {
  return {
    status: o.status === "filled" ? "closed" : o.status === "canceled" ? "canceled" : o.status === "partially_filled" ? "open" : o.status,
    vol: String(o.quantity),
    vol_exec: String(o.filledQuantity),
    avg_price: String(o.avgFillPrice ?? 0),
    descr: { pair: o.symbol.replace("/", ""), type: o.side, ordertype: o.type, price: o.price ? String(o.price) : "0" },
    fee: String(o.fee ?? 0),
    opentm: String(Math.floor(new Date(o.createdTime).getTime() / 1000)),
    lastupdated: String(Math.floor(new Date(o.updatedTime).getTime() / 1000)),
  };
}
