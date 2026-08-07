/**
 * Tests for TradingEventHub — org-scoped pub/sub with unsubscribe semantics.
 */
import { describe, it, expect } from "vitest";
import { TradingEventHub } from "./trading-events.js";

describe("TradingEventHub", () => {
  it("scopes events by orgId and unsubscribes cleanly", () => {
    const hub = new TradingEventHub();
    const orgA: any[] = [];
    const orgB: any[] = [];
    const offA = hub.on("org-a", (e) => orgA.push(e));
    const offB = hub.on("org-b", (e) => orgB.push(e));

    hub.emit("org-a", { kind: "tick", accountId: "a1", data: { symbol: "BTCUSDT", bid: 1, ask: 2, timestamp: 0 } as any });
    hub.emit("org-b", { kind: "tick", accountId: "b1", data: { symbol: "ETHUSDT", bid: 3, ask: 4, timestamp: 0 } as any });

    expect(orgA).toHaveLength(1);
    expect(orgA[0].accountId).toBe("a1");
    expect(orgB).toHaveLength(1);
    expect(orgB[0].accountId).toBe("b1");

    // Unsubscribe A — further emits to A are not delivered, B still works.
    offA();
    hub.emit("org-a", { kind: "execution", accountId: "a1", data: { id: "x", status: "filled", decision: "filled", symbol: "BTCUSDT", side: "buy", volume: 0.1 } });
    hub.emit("org-b", { kind: "execution", accountId: "b1", data: { id: "y", status: "filled", decision: "filled", symbol: "ETHUSDT", side: "sell", volume: 1 } });

    expect(orgA).toHaveLength(1);
    expect(orgB).toHaveLength(2);

    // Double-unsubscribe is safe (idempotent).
    offA();
    offB();
    hub.emit("org-b", { kind: "tick", accountId: "b1", data: { symbol: "ETHUSDT", bid: 5, ask: 6, timestamp: 0 } as any });
    expect(orgB).toHaveLength(2);
  });
});
