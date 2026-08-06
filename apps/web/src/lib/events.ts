/**
 * Events / SSE real-time channel client (routes/events.ts → /api/v1/events).
 *
 * The platform exposes a long-lived Server-Sent Events stream at
 * `/events/stream` (org-scoped fan-out of the event bus, fail-closed per
 * Session 89), historical replay buffer (`/events/history`), stream client
 * inspection (`/events/clients`), and custom event publishing (`/events/publish`).
 */
import { api } from "./api";
import { useAuthStore } from "@/store/auth";
import type {
  SSEEventPayload,
  SSEClientInfo,
  EventsHealthResponse,
  EventHistoryQueryInput,
  PublishEventInput,
} from "@windels/shared";

export type { SSEEventPayload, SSEClientInfo, EventsHealthResponse };

export interface SseHealth {
  connectedClients: number;
  subscribedEvents: string[];
  uptime: number;
  orgConnectedClients?: number;
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
  lastEventId?: string;
}): { close: () => void } {
  const token = useAuthStore.getState().accessToken;
  const BASE = (import.meta.env.VITE_API_URL ?? "/api/v1").replace(/\/$/, "");
  const queryParts = [];
  if (token) queryParts.push(`token=${encodeURIComponent(token)}`);
  if (handlers.lastEventId) queryParts.push(`since=${encodeURIComponent(handlers.lastEventId)}`);
  const qs = queryParts.length ? `?${queryParts.join("&")}` : "";

  const es = new EventSource(`${BASE}/events/stream${qs}`);

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

/**
 * Get recent event history for the caller's organization from the ring buffer.
 */
export function getEventHistory(params?: Partial<EventHistoryQueryInput>): Promise<SSEEventPayload[]> {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.since) q.set("since", params.since);
  if (params?.eventType) q.set("eventType", params.eventType);
  const qs = q.toString() ? `?${q.toString()}` : "";
  return api<SSEEventPayload[]>(`/events/history${qs}`);
}

/**
 * List active SSE client sessions for the caller's organization.
 */
export function getSSEClients(): Promise<SSEClientInfo[]> {
  return api<SSEClientInfo[]>("/events/clients");
}

/**
 * Publish a custom event to the caller's organization stream.
 */
export function publishCustomEvent(input: PublishEventInput): Promise<SSEEventPayload> {
  return api<SSEEventPayload>("/events/publish", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Disconnect/revoke a specific active SSE client session.
 */
export function disconnectSSEClient(clientId: string): Promise<void> {
  return api<void>(`/events/clients/${encodeURIComponent(clientId)}`, {
    method: "DELETE",
  });
}
