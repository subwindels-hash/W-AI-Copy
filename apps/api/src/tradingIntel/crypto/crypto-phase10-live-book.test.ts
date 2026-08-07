/**
 * Phase 10 — Live order/position book events fan out with merge-friendly IDs.
 *
 * Verifies:
 *   - cryptoOrderToBrokerOrder / cryptoPositionToBrokerPosition populate
 *     both `id` and `ticket` so the UI can merge by `${accountId}:${ticket}`
 *     (the same key used for polled rows).
 *   - Terminal order statuses (filled/cancelled/expired/rejected) are mapped
 *     to BrokerPendingOrder.status union so the UI can drop them live.
 *   - Volume on emitted positions is absolute (never negative) so position
 *     rows don't show up with zero-or-negative display volume.
 *
 * These invariants let TradingDashboardPage merge order_update /
 * position_update SSE events into the polled tables without waiting for
 * the next REST refresh. WINDELS is an AI Trading Agent, not a broker —
 * these events only reflect state changes reported by the user's
 * external exchange/broker.
 */
import { describe, it, expect } from "vitest";

// Re-import the converters indirectly via the real base connector module so
// any future rename breaks the test loudly. They're not exported, so we
// exercise them through the public `cryptoOrdersToBroker` /
// `cryptoPositionsToBroker` helpers (same mapping logic, batch form).
import { cryptoOrdersToBroker, cryptoPositionsToBroker } from "./base-crypto-connector.js";
import type { CryptoOrder, CryptoPosition, CryptoMarket } from "@windels/shared/crypto";

function mkMarket(symbol: string): CryptoMarket {
  const [base = "BTC", quote = "USDT"] = symbol.split("/");
  return {
    symbol, rawSymbol: symbol, base, quote, settle: quote,
    type: "perp", active: true, pricePrecision: 2, qtyPrecision: 3,
    tickSize: 0.01, stepSize: 0.001, minQty: 0.001, minNotional: 5,
    contractSize: 1, maxLeverage: 20,
  };
}

function mkOrder(partial: Partial<CryptoOrder>): CryptoOrder {
  return {
    id: "ord-1", clientOrderId: "x-bin-987654-1-abcdef01",
    symbol: "BTC/USDT", marketType: "perp", side: "buy", type: "limit",
    quantity: 0.1, filledQuantity: 0, remainingQuantity: 0.1, avgFillPrice: null,
    price: 60000, status: "new", createdTime: new Date().toISOString(),
    updatedTime: new Date().toISOString(), fee: 0, feeCurrency: "USDT",
    timeInForce: "GTC", reduceOnly: false, postOnly: false,
    stopLoss: null, takeProfit: null, leverage: 1,
    ...partial,
  } as CryptoOrder;
}

function mkPos(partial: Partial<CryptoPosition>): CryptoPosition {
  return {
    symbol: "BTC/USDT", marketType: "perp", side: "long", quantity: 0.5,
    entryPrice: 58000, markPrice: 60000,
    unrealizedPnl: 1000, realizedPnl: 0,
    marginType: "cross", leverage: 5, margin: 0,
    openedTime: new Date().toISOString(),
    updatedTime: new Date().toISOString(),
    liquidationPrice: 0,
    ...partial,
  } as CryptoPosition;
}

describe("Phase 10 — Live book events have merge-friendly shape", () => {
  it("open orders carry id==ticket for UI merge key", () => {
    const orders = new Map<string, CryptoOrder>();
    orders.set("ord-1", mkOrder({ status: "new" }));
    orders.set("ord-2", mkOrder({ id: "ord-2", clientOrderId: "x2", status: "partially_filled", filledQuantity: 0.03 }));
    const out = cryptoOrdersToBroker(orders, new Map([["BTC/USDT", mkMarket("BTC/USDT")]]));
    expect(out).toHaveLength(2);
    for (const o of out) {
      expect(o.id).toBeTruthy();
      expect(o.ticket).toBe(o.id);
      expect(o.accountId).toBe(""); // filled by caller per-session
      expect(typeof o.volume).toBe("number");
      expect(o.volume).toBeGreaterThan(0);
      expect(["active", "partial", "filled", "cancelled", "expired", "rejected"]).toContain(o.status);
    }
    expect(out.find((o) => o.id === "ord-2")?.status).toBe("partial");
  });

  it("terminal-status orders are excluded from the polled batch (UI uses hub fanout for transitions)", () => {
    const orders = new Map<string, CryptoOrder>();
    orders.set("a", mkOrder({ id: "a", status: "filled" }));
    orders.set("b", mkOrder({ id: "b", status: "canceled" }));
    orders.set("c", mkOrder({ id: "c", status: "rejected" }));
    orders.set("d", mkOrder({ id: "d", status: "expired" }));
    orders.set("e", mkOrder({ id: "e", status: "new" }));
    const out = cryptoOrdersToBroker(orders, new Map([["BTC/USDT", mkMarket("BTC/USDT")]]));
    expect(out.map((o) => o.id)).toEqual(["e"]);
  });

  it("positions carry id==ticket with positive volume for both long and short", () => {
    const positions = new Map<string, CryptoPosition>();
    positions.set("BTC/USDT", mkPos({ side: "long", quantity: 0.5 }));
    positions.set("ETH/USDT", mkPos({ symbol: "ETH/USDT", side: "short", quantity: 0.3 }));
    positions.set("SOL/USDT", mkPos({ symbol: "SOL/USDT", side: "net", quantity: -10 }));
    const out = cryptoPositionsToBroker(positions, new Map([
      ["BTC/USDT", mkMarket("BTC/USDT")],
      ["ETH/USDT", mkMarket("ETH/USDT")],
      ["SOL/USDT", mkMarket("SOL/USDT")],
    ]));
    const bySym = Object.fromEntries(out.map((p) => [p.symbol, p]));
    expect(bySym["BTC/USDT"].side).toBe("long");
    expect(bySym["BTC/USDT"].volume).toBeCloseTo(0.5);
    expect(bySym["BTC/USDT"].ticket).toBe("BTC/USDT");
    expect(bySym["ETH/USDT"].side).toBe("short");
    expect(bySym["ETH/USDT"].volume).toBeCloseTo(0.3);
    expect(bySym["ETH/USDT"].ticket).toBe("ETH/USDT");
    expect(bySym["SOL/USDT"].side).toBe("short");
    expect(bySym["SOL/USDT"].volume).toBeCloseTo(10);
    for (const p of out) {
      expect(p.id).toBe(p.ticket);
      expect(p.volume).toBeGreaterThanOrEqual(0);
    }
  });
});
