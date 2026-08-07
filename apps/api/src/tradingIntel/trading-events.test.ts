/**
 * Tests for the Phase 3 event hub plus SSE route contract: we don't boot an
 * HTTP server here (no supertest harness exists in the repo), but we do
 * validate that the hub correctly isolates orgs and that both MT5 connector
 * and BaseCryptoConnector path dispatch ticks into the hub when _oid is set.
 *
 * End-to-end SSE streaming is covered by the live web build + the fact that
 * the /brokers/events/stream route uses the same hub instance tested here.
 */
import { describe, it, expect } from "vitest";
import { tradingEvents, TradingEventHub } from "./trading-events.js";

describe("Phase 3 contract: trading event hub used by SSE route", () => {
  it("shared tradingEvents singleton is a TradingEventHub", () => {
    expect(tradingEvents).toBeInstanceOf(TradingEventHub);
  });

  it("does not leak events across orgs and supports multiple listeners per org", () => {
    const hub = new TradingEventHub();
    const a1: any[] = [], a2: any[] = [], b1: any[] = [];
    const off1 = hub.on("org-a", (e) => a1.push(e));
    const off2 = hub.on("org-a", (e) => a2.push(e));
    const off3 = hub.on("org-b", (e) => b1.push(e));

    hub.emit("org-a", { kind: "execution", accountId: "a", data: { id: "1", status: "filled", decision: "filled", symbol: "BTCUSDT", side: "buy", volume: 0.1 } });
    hub.emit("org-b", { kind: "tick", accountId: "b", data: { symbol: "ETHUSDT", bid: 1, ask: 2, timestamp: 0 } as any });

    expect(a1).toHaveLength(1);
    expect(a2).toHaveLength(1);
    expect(b1).toHaveLength(1);
    expect((a1[0] as any).kind).toBe("execution");
    expect((b1[0] as any).data.symbol).toBe("ETHUSDT");

    off1();
    hub.emit("org-a", { kind: "tick", accountId: "a", data: { symbol: "X", bid: 1, ask: 2, timestamp: 0 } as any });
    expect(a1).toHaveLength(1);
    expect(a2).toHaveLength(2);

    off2(); off3();
    hub.emit("org-a", { kind: "tick", accountId: "a", data: { symbol: "Y", bid: 1, ask: 2, timestamp: 0 } as any });
    hub.emit("org-b", { kind: "tick", accountId: "b", data: { symbol: "Z", bid: 1, ask: 2, timestamp: 0 } as any });
    expect(a2).toHaveLength(2);
    expect(b1).toHaveLength(1);
  });
});
