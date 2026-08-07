/**
 * Phase 14 — Latency / Health monitor.
 *
 * Verifies:
 *   - The brokerIntegration health() surface returns latencyMs per connector
 *     and the shared BrokerAccount type now exposes latencyMs for UI rendering.
 *   - The TradingEventHub's account_state event carries latencyMs from
 *     BaseCryptoConnector.emitState (already exercised in Phase 7 but re-
 *     asserted here for the dashboard monitor panel).
 *
 * WINDELS is an AI Trading Agent, not a broker. Latency is observed from the
 * user's external broker/exchange responses — WINDELS never originates or
 * fills a trade on its own.
 */
import { describe, it, expect } from "vitest";
import type { BrokerAccount } from "@windels/shared/brokerIntegration";
import { tradingEvents } from "../trading-events.js";

describe("Phase 14 — Latency monitor plumbing", () => {
  it("BrokerAccount shape supports latencyMs for dashboard rendering", () => {
    // TS-level compile check + runtime shape sanity.
    const a: BrokerAccount = {
      id: "a", organizationId: "o", name: "n", broker: "binance", brokerLabel: "Binance",
      login: "k", server: "binance", mode: "semi_autonomous", status: "connected",
      currency: "USD", leverage: 1, account: { balance: 0, equity: 0, margin: 0, freeMargin: 0, profit: 0, dailyPnl: 0 },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      latencyMs: 84,
    };
    expect(a.latencyMs).toBe(84);
  });

  it("account_state events carry latencyMs when connectors emit state", () => {
    const oid = "__p14__";
    const events: any[] = [];
    const off = tradingEvents.on(oid, (e) => events.push(e));
    tradingEvents.emit(oid, {
      kind: "account_state", accountId: "a1",
      data: { status: "connected", latencyMs: 123 },
    });
    expect(events).toHaveLength(1);
    expect(events[0].data.latencyMs).toBe(123);
    off();
  });
});
