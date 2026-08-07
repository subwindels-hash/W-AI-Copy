/**
 * Common helpers for crypto exchange connectors.
 */
import type { CryptoMarket, CryptoMarketType, CryptoOrder, CryptoBalance } from "@windels/shared/crypto";

/**
 * Order routing is NOT certified against this exchange's live endpoints yet.
 *
 * Risk-governed trades are still blocked until the per-exchange end-to-end
 * testnet certification test runs pass. The function returns a structured
 * OrderResult so callers don't crash; the Trade Execution Supervisor records
 * the failure. To certify an exchange, replace this call with the actual
 * REST/WS order placement implementation (see binance.ts / bybit.ts for
 * reference).
 */
export function notCertified(exchange: string) {
  return { ok: false as const, error: `${exchange} live order routing pending testnet certification in Phase 2.x`, retcode: -101 };
}

/** @deprecated use notCertified */
export const phase1Gate = notCertified;

export function mkMarket(
  sym: string, raw: string, type: CryptoMarketType, base: string, quote: string, settle: string,
  tick: number, step: number, maxLev = 1, minQty = 0.001, minNotional = 5, pricePrecision = 2, qtyPrecision = 3,
): CryptoMarket {
  return {
    symbol: sym, rawSymbol: raw, type, base, quote, settle,
    contractSize: 1, active: true, pricePrecision, qtyPrecision,
    minQty, minNotional, maxLeverage: maxLev, tickSize: tick, stepSize: step,
  };
}

export function majorPairs(suffix: string) {
  // Curated list of high-volume crypto assets. WINDELS does not list every
  // long-tail market at boot (that would slow startup and waste WS
  // subscriptions) — these are the pairs most traders will encounter in
  // practice. Additional markets can be fetched live from /exchangeInfo at
  // connector startup in a future phase; for now the curated list keeps
  // bootstrap fast and predictable.
  const bases = [
    "BTC", "ETH", "SOL", "XRP", "DOGE", "BNB", "ADA", "AVAX", "LINK", "MATIC",
    "DOT", "LTC",
    // Extended majors (Phase 9)
    "BCH", "ETC", "FIL", "ATOM", "NEAR", "APT", "ARB", "OP", "SUI", "SEI",
    "INJ", "TIA", "PEPE", "WIF", "SHIB", "TRX", "UNI", "AAVE", "MKR", "LDO",
    "RNDR", "IMX", "STX", "FET", "GRT", "PYTH", "JUP", "WLD", "ENS", "TON",
  ];
  return {
    perp: bases.map((b) => mkMarket(`${b}/${suffix}:${suffix}`, `${b}${suffix}`, "perp", b, suffix, suffix, 0.01, 0.001, 100, 0.001, 5)),
    spot: bases.map((b) => mkMarket(`${b}/${suffix}`, `${b}${suffix}`, "spot", b, suffix, "", 0.01, 0.00001, 1, 0.00001, 10, 2, 5)),
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
