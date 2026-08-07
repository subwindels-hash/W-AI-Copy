/**
 * WINDELS Trading Event Hub — in-process pub/sub for trading lifecycle events.
 *
 * The event hub is the glue between connectors (who emit ticks, order state
 * changes, fills) and the SSE/WebSocket routes (who fan them out to the UI).
 * It is NOT a matching engine, NOT a venue, NOT a custodian — it only relays
 * events that originate from external brokers/exchanges. WINDELS never
 * originates a fill on its own.
 *
 * Keys are org-scoped so one customer's events never leak to another.
 */
import { EventEmitter } from "node:events";
import type { BrokerTick, BrokerPosition, BrokerPendingOrder } from "@windels/shared/brokerIntegration";

export type TradingEvent =
  | { kind: "tick"; accountId: string; data: BrokerTick }
  | { kind: "order_update"; accountId: string; data: BrokerPendingOrder }
  | { kind: "position_update"; accountId: string; data: BrokerPosition }
  | { kind: "execution"; accountId: string; data: { id: string; status: string; decision: string; symbol: string; side: string; volume: number; brokerTicket?: string; error?: string } }
  | { kind: "account_state"; accountId: string; data: { status: string; lastSyncAt?: string; latencyMs?: number; error?: string } };

type Listener = (evt: TradingEvent) => void;

export class TradingEventHub {
  private ee = new EventEmitter();
  private readonly MAX_LISTENERS = 100;

  constructor() { this.ee.setMaxListeners(this.MAX_LISTENERS); }

  emit(orgId: string, evt: TradingEvent) {
    this.ee.emit(`org:${orgId}`, evt);
  }

  on(orgId: string, fn: Listener): () => void {
    const key = `org:${orgId}`;
    this.ee.on(key, fn as any);
    let off = false;
    return () => {
      if (off) return;
      off = true; this.ee.off(key, fn as any);
    };
  }
}

export const tradingEvents = new TradingEventHub();
