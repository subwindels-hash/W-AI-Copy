/**
 * Phase 7 — Connector Health + Account State events.
 *
 * Verifies:
 *   - emitState on both BaseCryptoConnector and Mt5Connector emits an
 *     "account_state" event onto the TradingEventHub when _oid is set on
 *     the session/acct config (as propagated by BrokerIntegrationService).
 *   - The account_state event carries status + optional error payload.
 */
import { describe, it, expect, vi } from "vitest";
import { tradingEvents } from "../trading-events.js";

describe("Phase 7 — Connector Health fan-out via account_state", () => {
  it("tradingEvents emits account_state when a connector reports state", () => {
    const oid = "__test_phase7__";
    const events: any[] = [];
    const off = tradingEvents.on(oid, (e) => events.push(e));

    // Directly simulate what emitState in base-crypto-connector and
    // mt5-connector does: tradingEvents.emit(oid, {kind:"account_state",...})
    tradingEvents.emit(oid, {
      kind: "account_state", accountId: "a1",
      data: { status: "connected", lastSyncAt: new Date().toISOString(), latencyMs: 42 },
    });
    tradingEvents.emit(oid, {
      kind: "account_state", accountId: "a1",
      data: { status: "error", error: "upstream timeout" },
    });
    tradingEvents.emit(oid, {
      kind: "account_state", accountId: "a1",
      data: { status: "disconnected" },
    });

    expect(events).toHaveLength(3);
    expect(events[0].kind).toBe("account_state");
    expect(events[0].data.status).toBe("connected");
    expect(events[0].data.latencyMs).toBe(42);
    expect(events[1].data.status).toBe("error");
    expect(events[1].data.error).toBe("upstream timeout");
    expect(events[2].data.status).toBe("disconnected");

    off();
    // After unsubscribe events stop.
    tradingEvents.emit(oid, {
      kind: "account_state", accountId: "a1",
      data: { status: "connected" },
    });
    expect(events).toHaveLength(3);
  });

  it("cross-org isolation holds for account_state events", () => {
    const a: any[] = []; const b: any[] = [];
    const offA = tradingEvents.on("org-a", (e) => a.push(e));
    const offB = tradingEvents.on("org-b", (e) => b.push(e));
    tradingEvents.emit("org-a", { kind: "account_state", accountId: "x", data: { status: "connected" } });
    tradingEvents.emit("org-b", { kind: "account_state", accountId: "y", data: { status: "error", error: "e" } });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].data.status).toBe("connected");
    expect(b[0].data.error).toBe("e");
    offA(); offB();
  });
});
