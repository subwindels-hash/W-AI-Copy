/**
 * Real-Time Event Stream Client (Module 1 — Gap 6)
 *
 * Connects to the backend SSE endpoint `/api/v1/events/stream` and provides
 * a typed event subscription API. Automatically reconnects on disconnect
 * and handles token refresh.
 *
 * Usage:
 *   import { useRealtimeEvents } from '@/lib/realtime';
 *
 *   const unsub = useRealtimeEvents('message.created', (data) => {
 *     console.log('New message:', data);
 *   });
 *
 *   // Later:
 *   unsub();
 */
import { useAuthStore } from "@/store/auth";

const BASE = import.meta.env.VITE_API_URL ?? "/api/v1";

type EventHandler = (data: any) => void;

interface RealtimeConnection {
  eventSource: EventSource | null;
  handlers: Map<string, Set<EventHandler>>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  isConnected: boolean;
}

const state: RealtimeConnection = {
  eventSource: null,
  handlers: new Map(),
  reconnectTimer: null,
  reconnectAttempts: 0,
  isConnected: false,
};

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

function getReconnectDelay(): number {
  // Exponential backoff with jitter
  const delay = Math.min(
    BASE_RECONNECT_DELAY_MS * Math.pow(2, state.reconnectAttempts),
    MAX_RECONNECT_DELAY_MS,
  );
  return delay + Math.random() * 1000;
}

function connect() {
  const { accessToken } = useAuthStore.getState();
  if (!accessToken) return; // Not logged in

  // Close existing connection
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }

  // EventSource doesn't support custom headers, so pass token via query param
  const url = `${BASE}/events/stream?token=${encodeURIComponent(accessToken)}`;
  const es = new EventSource(url);
  state.eventSource = es;

  es.addEventListener("connected", (e: MessageEvent) => {
    state.isConnected = true;
    state.reconnectAttempts = 0;
    try {
      const data = JSON.parse(e.data);
      console.debug("[realtime] connected", data);
    } catch {}
  });

  es.onmessage = (e: MessageEvent) => {
    try {
      const { event, data } = JSON.parse(e.data);
      dispatch(event, data);
    } catch {}
  };

  // Listen for specific event types
  for (const eventName of state.handlers.keys()) {
    es.addEventListener(eventName, (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        dispatch(eventName, parsed.data ?? parsed);
      } catch {}
    });
  }

  es.onerror = () => {
    state.isConnected = false;
    es.close();
    state.eventSource = null;

    // Check if we should reconnect
    const { accessToken: token } = useAuthStore.getState();
    if (!token) return; // Logged out — don't reconnect

    if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn("[realtime] max reconnect attempts reached, giving up");
      return;
    }

    const delay = getReconnectDelay();
    state.reconnectAttempts++;
    console.debug(`[realtime] reconnecting in ${Math.round(delay)}ms (attempt ${state.reconnectAttempts})`);

    state.reconnectTimer = setTimeout(() => {
      connect();
    }, delay);
  };
}

function dispatch(event: string, data: any) {
  // Specific handlers
  const handlers = state.handlers.get(event);
  if (handlers) {
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (e) {
        console.error(`[realtime] handler error for ${event}:`, e);
      }
    }
  }
  // Wildcard handlers
  const wildcard = state.handlers.get("*");
  if (wildcard) {
    for (const handler of wildcard) {
      try {
        handler({ event, data });
      } catch (e) {
        console.error("[realtime] wildcard handler error:", e);
      }
    }
  }
}

/**
 * Subscribe to a real-time event. Returns an unsubscribe function.
 * The SSE connection is automatically opened on first subscription
 * and closed when all subscriptions are removed.
 */
export function onRealtimeEvent(event: string, handler: EventHandler): () => void {
  if (!state.handlers.has(event)) {
    state.handlers.set(event, new Set());
    // If already connected, add the event listener dynamically
    if (state.eventSource) {
      state.eventSource.addEventListener(event, (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data);
          dispatch(event, parsed.data ?? parsed);
        } catch {}
      });
    }
  }
  state.handlers.get(event)!.add(handler);

  // Auto-connect on first subscription
  if (!state.eventSource && !state.reconnectTimer) {
    connect();
  }

  return () => {
    const set = state.handlers.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        state.handlers.delete(event);
      }
    }
    // If no more handlers, disconnect
    if (state.handlers.size === 0) {
      disconnect();
    }
  };
}

/**
 * Subscribe to all real-time events.
 */
export function onAllRealtimeEvents(handler: EventHandler): () => void {
  return onRealtimeEvent("*", handler);
}

/**
 * Disconnect the SSE stream.
 */
export function disconnect() {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  state.isConnected = false;
  state.reconnectAttempts = 0;
}

/**
 * Reconnect (e.g. after token refresh or network recovery).
 */
export function reconnect() {
  disconnect();
  if (state.handlers.size > 0) {
    connect();
  }
}

/**
 * Check if the real-time stream is currently connected.
 */
export function isConnected(): boolean {
  return state.isConnected;
}

// ─── React Hook ─────────────────────────────────────────────────

/**
 * React hook for subscribing to real-time events.
 * Automatically unsubscribes on unmount.
 *
 * Usage in a component:
 *   useRealtimeSubscription('message.created', (msg) => {
 *     setMessages(prev => [...prev, msg]);
 *   });
 */
export function useRealtimeSubscription(
  event: string,
  handler: EventHandler,
  deps: any[] = [],
) {
  // Dynamic import to avoid circular dependency issues
  const { useEffect, useRef } = require("react");
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsub = onRealtimeEvent(event, (data) => handlerRef.current(data));
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps]);
}
