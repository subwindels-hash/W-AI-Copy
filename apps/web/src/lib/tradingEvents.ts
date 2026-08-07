/**
 * WINDELS AI OS — Live trading-events hook.
 *
 * Consumes GET /brokers/events/stream (Server-Sent Events) from the API and
 * exposes the last N events per kind so React components can render live
 * ticks, execution updates, and account state without polling.
 *
 * WINDELS is an AI Trading Agent, NOT a broker. This hook is read-only: it
 * subscribes to events that originate at the user's external broker/exchange
 * and are relayed server-side by the TradingEventHub. It never places orders
 * or holds balances.
 */
import { useEffect, useRef, useState } from "react";
import { streamSSE } from "./sse";
import type { BrokerPosition, BrokerPendingOrder } from "@/lib/brokerIntegration";

interface BrokerTick { symbol: string; bid: number; ask: number; timestamp: number; [k: string]: any }


export type TradingEventKind = "tick" | "order_update" | "position_update" | "execution" | "account_state";

export interface LiveTick { accountId: string; symbol: string; bid: number; ask: number; timestamp: number; at: string }
export interface LiveExecution {
  accountId: string; id: string; status: string; decision: string;
  symbol: string; side: string; volume: number;
  brokerTicket?: string; error?: string; at: string;
}
export interface LiveOrder   { accountId: string; data: BrokerPendingOrder; at: string }
export interface LivePosition{ accountId: string; data: BrokerPosition; at: string }
export interface LiveAccount { accountId: string; status: string; lastSyncAt?: string; latencyMs?: number; error?: string; at: string }

export interface TradingLiveState {
  connected: boolean;
  readyAt: string | null;
  lastEventAt: string | null;
  recentTicks: LiveTick[];        // capped ring buffer
  recentExecutions: LiveExecution[];
  orderUpdates: LiveOrder[];
  positionUpdates: LivePosition[];
  accountUpdates: LiveAccount[];
  /** Per-symbol latest tick keyed by `${accountId}:${symbol}`. */
  latestTickByKey: Record<string, LiveTick>;
}

const RING = 50;

function pushRing<T>(arr: T[], item: T): T[] {
  const next = arr.length >= RING ? arr.slice(arr.length - RING + 1) : arr.slice();
  next.push(item);
  return next;
}

function normalizeTick(acctId: string, d: any): LiveTick | null {
  if (!d || typeof d.symbol !== "string") return null;
  const bid = Number(d.bid);
  const ask = Number(d.ask);
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null;
  const ts = Number(d.timestamp);
  return {
    accountId: acctId,
    symbol: d.symbol, bid, ask,
    timestamp: Number.isFinite(ts) ? ts : Date.now(),
    at: new Date().toISOString(),
  };
}

function normalizeExec(acctId: string, d: any): LiveExecution | null {
  if (!d || typeof d.id !== "string" || typeof d.symbol !== "string") return null;
  return {
    accountId: acctId, id: d.id, status: String(d.status ?? ""), decision: String(d.decision ?? ""),
    symbol: d.symbol, side: String(d.side ?? ""), volume: Number(d.volume) || 0,
    brokerTicket: d.brokerTicket, error: d.error, at: new Date().toISOString(),
  };
}

/**
 * Subscribe to the org-scoped trading event stream. Connection lifecycle is
 * tied to the consuming component; auto-reconnects if the iterator throws
 * (e.g. network blip, server restart) with a small delay.
 */
export function useTradingEvents(opts: { enabled?: boolean } = {}) {
  const { enabled = true } = opts;
  const [state, setState] = useState<TradingLiveState>(() => ({
    connected: false, readyAt: null, lastEventAt: null,
    recentTicks: [], recentExecutions: [],
    orderUpdates: [], positionUpdates: [], accountUpdates: [],
    latestTickByKey: {},
  }));
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!enabled) return;
    let aborted = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      try {
        for await (const { event, data } of streamSSE("/api/v1/brokers/events/stream", { method: "GET" })) {
          if (aborted) return;
          if (event === "ready") {
            setState((s) => ({ ...s, connected: true, readyAt: data?.t ?? new Date().toISOString() }));
            continue;
          }
          const kind = event as TradingEventKind;
          const acctId: string = data?.accountId ?? "";
          const now = new Date().toISOString();
          setState((s) => {
            const next: TradingLiveState = { ...s, lastEventAt: now };
            switch (kind) {
              case "tick": {
                const t = normalizeTick(acctId, data?.data);
                if (!t) return s;
                next.recentTicks = pushRing(s.recentTicks, t);
                next.latestTickByKey = { ...s.latestTickByKey, [`${acctId}:${t.symbol}`]: t };
                return next;
              }
              case "execution": {
                const e = normalizeExec(acctId, data?.data);
                if (!e) return s;
                next.recentExecutions = pushRing(s.recentExecutions, e);
                return next;
              }
              case "order_update": {
                if (!data?.data) return s;
                next.orderUpdates = pushRing(s.orderUpdates, { accountId: acctId, data: data.data, at: now });
                return next;
              }
              case "position_update": {
                if (!data?.data) return s;
                next.positionUpdates = pushRing(s.positionUpdates, { accountId: acctId, data: data.data, at: now });
                return next;
              }
              case "account_state": {
                const d = data?.data ?? {};
                next.accountUpdates = pushRing(s.accountUpdates, {
                  accountId: acctId, status: String(d.status ?? ""),
                  lastSyncAt: d.lastSyncAt, latencyMs: d.latencyMs, error: d.error, at: now,
                });
                return next;
              }
              default:
                return s;
            }
          });
        }
      } catch (e) {
        if (aborted) return;
        // Mark disconnected and schedule a reconnect. Backoff is handled by
        // the browser/HTTP stack; we just retry after 2s.
        setState((s) => ({ ...s, connected: false }));
        reconnectTimer = setTimeout(connect, 2000);
      }
    };

    // Microtask defer so SSR/hydration doesn't try to fetch during render.
    void Promise.resolve().then(connect);

    return () => {
      aborted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      setState((s) => ({ ...s, connected: false }));
    };
  }, [enabled]);

  return state;
}
