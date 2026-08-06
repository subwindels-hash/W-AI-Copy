/**
 * Events / SSE real-time channel client (routes/events.ts → /api/v1/events).
 *
 * The platform exposes a long-lived Server-Sent Events stream at
 * `/events/stream` (org-scoped fan-out of the event bus, fail-closed per
 * Session 89). EventSource cannot send an Authorization header, so the token
 * is passed as a query parameter exactly like the API route accepts it.
 */
import { api } from "./api";
import { useAuthStore } from "@/store/auth";

export interface SseHealth {
  connectedClients: number;
  subscribedEvents: string[];
  uptime: number;
}

export interface PlatformEvent<T = unknown> {
  event: string;
  data: T;
  id: string;
  timestamp: string;
}

/** Open the authenticated SSE stream. Returns a close() handle. */
export function subscribeToEventStream(handlers: {
  onEvent?: (ev: PlatformEvent) => void;
  onConnected?: (ev: PlatformEvent) => void;
  onError?: (err: Event) => void;
}): { close: () => void } {
  const token = useAuthStore.getState().accessToken;
  const BASE = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");
  const es = new EventSource(`${BASE}/events/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`);

  es.addEventListener("connected", ((e: MessageEvent) => {
    try {
      handlers.onConnected?.(JSON.parse((e as MessageEvent<string>).data));
    } catch { /* ignore malformed payloads */ }
  }) as EventListener);

  es.onmessage = ((e: MessageEvent) => {
    try {
      handlers.onEvent?.(JSON.parse((e as MessageEvent<string>).data) as PlatformEvent);
    } catch { /* ignore malformed payloads */ }
  }) as EventListener;

  es.onerror = (err) => handlers.onError?.(err);
  return { close: () => es.close() };
}

/** Live connection/health stats for the SSE channel. */
export function eventsHealth(): Promise<SseHealth> {
  return api<SseHealth>("/events/health");
}
