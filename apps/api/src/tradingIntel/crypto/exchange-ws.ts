/**
 * WINDELS AI OS — Shared WebSocket client for crypto exchange streams.
 *
 * Features:
 *   - Auto-reconnect with exponential backoff (1s → 2s → 4s → … capped at 30s)
 *   - Per-message callback dispatch via a user-supplied parser that maps
 *     incoming frames into {channel, payload} events
 *   - Heartbeat / ping-pong handling (configurable ping message + interval)
 *   - Subscription registry: on reconnect all active subscriptions are
 *     automatically re-subscribed so callers don't have to.
 *   - Idempotent subscribe/unsubscribe (subscribing twice doesn't double-send).
 *   - Graceful close; no-op send after close
 *   - Never logs raw messages when they might contain auth/private data;
 *     auth messages are sent through an optional signer that's in charge
 *     of constructing the login payload.
 *   - EventEmitter-style listeners with "open"/"close"/"error"/"message" events.
 */
import { EventEmitter } from "node:events";

export interface WsClientOptions {
  url: string;
  /** Send this as a ping frame every N ms. If the exchange uses a protocol-
   *  level ping, leave unset (the client answers ws pongs automatically). */
  pingMessage?: string | object | (() => string | object);
  pingIntervalMs?: number;
  /** Optional authentication step to run on every (re)connect. */
  onConnect?: (send: (payload: string | object) => void) => void | Promise<void>;
  /** Parser: given a raw message string/Buffer, return 0..n routed events. */
  parser?: (raw: string) => Array<{ channel: string; payload: unknown }>;
  /** Per-message callback for raw frames (debug/fallback). */
  onRaw?: (raw: string) => void;
  /** Label for logs. */
  label?: string;
}

export interface WsSubscription {
  /** Channel id (exchange-specific op e.g. "ticker.BTCUSDT"). */
  key: string;
  /** Payload to send on subscribe. If a function, invoked at subscribe-time. */
  subscribe: object | (() => object);
  /** Payload to send on unsubscribe. */
  unsubscribe?: object | (() => object);
  /** Callback for messages on this channel. */
  onMessage: (payload: unknown) => void;
}

export class ExchangeWsClient extends EventEmitter {
  private readonly opts: WsClientOptions;
  private ws: WebSocket | null = null;
  private connected = false;
  private shouldReconnect = true;
  private reconnectDelay = 1_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private subs = new Map<string, WsSubscription>();
  private closed = false;

  constructor(opts: WsClientOptions) {
    super();
    this.opts = opts;
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    this.shouldReconnect = true;
    await this.open();
  }

  private async open(): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        const ws = new WebSocket(this.opts.url);
        this.ws = ws;

        const opened = () => {
          this.connected = true;
          this.reconnectDelay = 1_000;
          this.emit("open");
          this.startPing();
          (async () => {
            if (this.opts.onConnect) {
              try { await this.opts.onConnect((p) => this.send(p)); }
              catch (e) { this.emit("error", e); }
            }
            // Replay all subs.
            for (const sub of this.subs.values()) this.sendSub(sub);
            resolve();
          })();
        };

        ws.onopen = opened;
        ws.onmessage = (ev) => {
          const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
          if (this.opts.onRaw) { try { this.opts.onRaw(raw); } catch {} }
          // Parse and route.
          if (this.opts.parser) {
            let events: Array<{ channel: string; payload: unknown }>;
            try { events = this.opts.parser(raw); }
            catch (e) { this.emit("error", e); return; }
            for (const ev of events) {
              const sub = this.subs.get(ev.channel);
              if (sub) {
                try { sub.onMessage(ev.payload); } catch (e) { this.emit("error", e); }
              }
              this.emit("message", ev);
            }
          } else {
            this.emit("raw", raw);
          }
        };
        ws.onerror = (e) => {
          this.emit("error", e);
        };
        ws.onclose = () => {
          this.connected = false;
          this.stopPing();
          this.ws = null;
          this.emit("close");
          if (this.shouldReconnect && !this.closed) this.scheduleReconnect();
        };

        // If open doesn't fire within 15s, abort and retry.
        setTimeout(() => {
          if (!this.connected && this.ws === ws && !this.closed) {
            try { ws.close(); } catch {}
            this.scheduleReconnect();
            resolve();
          }
        }, 15_000);
      } catch (e) {
        this.emit("error", e);
        this.scheduleReconnect();
        resolve();
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delayMs = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.closed) return;
      this.emit("reconnecting", { delayMs });
      await this.open();
    }, delayMs);
  }

  private startPing() {
    this.stopPing();
    if (!this.opts.pingIntervalMs || !this.opts.pingMessage) return;
    this.pingTimer = setInterval(() => {
      if (!this.connected) return;
      const msg = typeof this.opts.pingMessage === "function" ? this.opts.pingMessage() : this.opts.pingMessage;
      this.send(msg);
    }, this.opts.pingIntervalMs);
  }
  private stopPing() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  send(payload: string | object) {
    if (!this.ws || !this.connected) return;
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    try { this.ws.send(data); }
    catch (e) { this.emit("error", e); }
  }

  subscribe(sub: WsSubscription) {
    if (this.subs.has(sub.key)) return;
    this.subs.set(sub.key, sub);
    if (this.connected) this.sendSub(sub);
  }

  unsubscribe(key: string) {
    const sub = this.subs.get(key);
    if (!sub) return;
    this.subs.delete(key);
    if (this.connected && sub.unsubscribe) this.sendUnsub(sub);
  }

  private sendSub(sub: WsSubscription) {
    const msg = typeof sub.subscribe === "function" ? sub.subscribe() : sub.subscribe;
    this.send(msg);
  }
  private sendUnsub(sub: WsSubscription) {
    if (!sub.unsubscribe) return;
    const msg = typeof sub.unsubscribe === "function" ? sub.unsubscribe() : sub.unsubscribe;
    this.send(msg);
  }

  isOpen() { return this.connected; }

  close() {
    this.closed = true;
    this.shouldReconnect = false;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.stopPing();
    if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; }
  }
}
