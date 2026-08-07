/**
 * Shared helpers for crypto order placement.
 *
 * Each exchange has its own idiosyncratic parameter names for orders:
 *   - side      : BUY/SELL vs buy/sell vs 1/2
 *   - type      : MARKET/LIMIT vs market/limit
 *   - quantity  : quantity/qty/size/amount/vol
 *   - price     : price vs limitPrice vs px
 *   - tif       : GTC/IOC/FOK vs GoodTillCancel/ImmediateOrCancel
 *   - stop price: stopPrice/triggerPrice/trigger/stopPx
 *   - sl/tp     : separate params vs attached brackets vs separate endpoint
 *
 * This file provides a generic parameter builder; individual connectors
 * can pick keys off the returned record to minimize boilerplate.
 */
import type { CryptoOrderRequest, CryptoOrderSide, CryptoOrderType } from "@windels/shared/crypto";
import type { OrderResult } from "../connectors/broker-connector.js";
import type { ExchangeHttpClient } from "./exchange-http.js";

/** Side to uppercase (most exchanges expect BUY/SELL). */
export function sideUpper(s: CryptoOrderSide): string { return s === "buy" ? "BUY" : "SELL"; }

/** Map unified order type to a common uppercase variant. */
export function stdType(t: CryptoOrderType): string {
  switch (t) {
    case "market": return "MARKET";
    case "limit": return "LIMIT";
    case "stop_market": return "STOP_MARKET";
    case "stop_limit": return "STOP";
    case "take_profit_market": return "TAKE_PROFIT_MARKET";
    case "take_profit_limit": return "TAKE_PROFIT";
    case "post_only":
    case "limit_maker": return "LIMIT_MAKER";
    case "ioc": return "IOC";
    case "fok": return "FOK";
    default: return "MARKET";
  }
}

export function stdTif(t: CryptoOrderRequest["timeInForce"]): string {
  return t ?? "GTC";
}

/** Round quantity to qty precision (floor to avoid exceeding available). */
export function roundQty(qty: number, precision: number): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  const p = Math.pow(10, precision);
  return Math.floor(qty * p) / p;
}
/** Round price to price precision (half-up). */
export function roundPrice(price: number, precision: number, tickSize?: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (tickSize && tickSize > 0) {
    return Math.round(price / tickSize) * tickSize;
  }
  const p = Math.pow(10, precision);
  return Math.round(price * p) / p;
}

/** Build the standard order params bag used by most exchanges. */
export function buildOrderParams(req: CryptoOrderRequest, opts: {
  rawSymbol: string;
  pricePrecision: number;
  qtyPrecision: number;
  tickSize?: number;
  stepSize?: number;
  qtyKey?: string;
  priceKey?: string;
  stopKey?: string;
  typeKey?: string;
  sideKey?: string;
  tifKey?: string;
  clientKey?: string;
  reduceKey?: string;
}): Record<string, string | number | boolean | undefined> {
  const qKey = opts.qtyKey ?? "quantity";
  const pKey = opts.priceKey ?? "price";
  const sKey = opts.stopKey ?? "stopPrice";
  const tKey = opts.typeKey ?? "type";
  const sideK = opts.sideKey ?? "side";
  const tifK = opts.tifKey ?? "timeInForce";
  const cKey = opts.clientKey ?? "newClientOrderId";
  const rKey = opts.reduceKey ?? "reduceOnly";
  const qty = roundQty(req.quantity, opts.qtyPrecision);
  const params: Record<string, string | number | boolean | undefined> = {
    symbol: opts.rawSymbol,
    [sideK]: sideUpper(req.side),
    [tKey]: stdType(req.type),
    [qKey]: qty,
  };
  if (req.timeInForce) params[tifK] = stdTif(req.timeInForce);
  if (req.clientOrderId) params[cKey] = req.clientOrderId;
  if (req.reduceOnly) params[rKey] = true;
  if (req.postOnly) params[tifK] = "GTX"; // Binance/Bybit/OKX use GTX for post-only
  const needPrice = req.type === "limit" || req.type === "stop_limit" || req.type === "take_profit_limit";
  if (needPrice && req.price) params[pKey] = roundPrice(req.price, opts.pricePrecision, opts.tickSize);
  if (req.type === "stop_market" || req.type === "stop_limit" || req.type === "take_profit_market" || req.type === "take_profit_limit") {
    const trig = req.triggerPrice ?? req.stopLoss?.price ?? req.takeProfit?.price ?? req.price;
    if (trig) params[sKey] = roundPrice(trig, opts.pricePrecision, opts.tickSize);
  }
  return params;
}

/** Translate a normalized OrderResult from common exchange REST responses. */
export function resultFromCreateResponse(raw: any, opts: {
  idKey: string;
  clientKey?: string;
  priceKey?: string;
  qtyKey?: string;
  statusKey?: string;
  codeKey?: string;
  msgKey?: string;
}): OrderResult {
  // If response is wrapped (retCode/rc/code) check error first.
  if (raw && typeof raw === "object") {
    const code = raw[opts.codeKey ?? "code"];
    if (code !== undefined && code !== null && code !== 0 && code !== "0" && code !== 200) {
      return { ok: false, retcode: Number(code) || -1, error: String(raw[opts.msgKey ?? "msg"] ?? "order rejected") };
    }
  }
  const data = raw?.result ?? raw?.data ?? raw;
  const id = data?.[opts.idKey] ?? raw?.[opts.idKey] ?? "";
  const clientId = opts.clientKey ? (data?.[opts.clientKey] ?? raw?.[opts.clientKey]) : undefined;
  const price = Number(data?.[opts.priceKey ?? "price"] ?? raw?.[opts.priceKey ?? "price"] ?? 0) || undefined;
  const qty = Number(data?.[opts.qtyKey ?? "qty"] ?? raw?.[opts.qtyKey ?? "qty"] ?? 0) || undefined;
  const filled = Number(data?.executedQty ?? data?.cumQty ?? data?.filledQty ?? 0);
  const avg = Number(data?.avgPrice ?? data?.avgFillPrice ?? 0) || undefined;
  const status = (data?.[opts.statusKey ?? "status"] ?? raw?.[opts.statusKey ?? "status"] ?? "").toString().toUpperCase();
  const immediatelyFilled = status === "FILLED" || (status === "NEW" && filled > 0 && avg);
  return {
    ok: true,
    ticket: String(id || clientId || ""),
    dealId: immediatelyFilled ? String(id || clientId) : undefined,
    fillPrice: immediatelyFilled ? (avg ?? price) : undefined,
    filledVolume: immediatelyFilled ? (filled ?? qty) : undefined,
    comment: clientId,
  };
}

export async function cancelByDelete(
  http: ExchangeHttpClient,
  path: string,
  query: Record<string, string | number | boolean | undefined>,
): Promise<OrderResult> {
  try {
    const r = await http.request<any>({ method: "DELETE", path, query });
    return { ok: true, ticket: String(r.data?.orderId ?? r.data?.id ?? ""), comment: "canceled" };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function cancelByBody(
  http: ExchangeHttpClient,
  path: string,
  body: Record<string, unknown>,
): Promise<OrderResult> {
  try {
    const r = await http.request<any>({ method: "POST", path, body });
    return resultFromCreateResponse(r.data, { idKey: "orderId" });
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
