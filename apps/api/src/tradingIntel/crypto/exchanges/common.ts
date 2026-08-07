/**
 * Common helpers for crypto exchange connectors.
 */
import type { CryptoMarket, CryptoMarketType, CryptoOrder, CryptoBalance } from "@windels/shared/crypto";

export function phase1Gate(exchange: string) {
  return { ok: false as const, error: `${exchange} live order routing pending Phase 2 risk-gate sign-off`, retcode: -100 };
}

export function mkMarket(sym: string, raw: string, type: CryptoMarketType, base: string, quote: string, settle: string, tick: number, step: number, maxLev = 1, minQty = 0.001, minNotional = 5): CryptoMarket {
  return {
    symbol: sym, rawSymbol: raw, type, base, quote, settle,
    contractSize: 1, active: true, pricePrecision: 2, qtyPrecision: 3,
    minQty, minNotional, maxLeverage: maxLev, tickSize: tick, stepSize: step,
  };
}

export function majorPairs(suffix: string, base: "quote" | "settle" = "settle") {
  const bases = ["BTC", "ETH", "SOL", "XRP", "DOGE", "BNB", "ADA", "AVAX", "LINK", "MATIC", "DOT", "LTC"];
  return {
    perp: bases.map((b) => mkMarket(`${b}/${suffix}:${suffix}`, `${b}${suffix}`, "perp", b, suffix, suffix, 0.01, 0.001, 100)),
    spot: bases.map((b) => mkMarket(`${b}/${suffix}`, `${b}${suffix}`, "spot", b, suffix, "", 0.01, 0.00001)),
  };
}

export function mapTimeframeStd(tf: string): string {
  const m: Record<string, string> = { M1: "1m", M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1d", W1: "1w", MN1: "1M" };
  return m[tf] ?? "1h";
}

export function mapStatusStd(s: string): CryptoOrder["status"] {
  const u = s.toLowerCase();
  if (u.includes("new") || u === "open" || u === "active" || u === "pending" || u === "untriaged" || u.includes("wait")) return "new";
  if (u.includes("partial")) return "partially_filled";
  if (u.includes("fill") || u === "closed" || u === "complete") return "filled";
  if (u.includes("cancel") || u === "deactivated") return "canceled";
  if (u.includes("reject")) return "rejected";
  if (u.includes("expir")) return "expired";
  return "new";
}

export function sumBalanceUsd(balances: CryptoBalance[]): number {
  let s = 0;
  for (const b of balances) s += b.usdValue ?? (b.asset === "USDT" || b.asset === "USDC" || b.asset === "BUSD" || b.asset === "FDUSD" || b.asset === "TUSD" ? b.total : 0);
  return s;
}
