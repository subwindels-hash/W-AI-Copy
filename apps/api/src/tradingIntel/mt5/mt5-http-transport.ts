/**
 * WINDELS AI OS — MT5 HTTP/SSE Transport Client.
 *
 * An alternative transport that talks to the Python MT5 bridge over plain HTTP
 * (JSON POST for RPC) + Server-Sent Events for tick streaming. No native
 * ZeroMQ dependency required — easier to deploy on hosts where building zeromq
 * is painful. The Python bridge listens on two ports (rpc + sse) or multiplexes
 * via path; we use path-routed single port for simplicity.
 *
 * This transport satisfies the same logical contract as Mt5ZmqTransport; the
 * connector picks whichever is configured. It also supports bearer-token auth
 * (WINDELS_MT5_BRIDGE_TOKEN) to prevent local network spoofing.
 */
import { EventEmitter } from "node:events";
import { logger } from "../../config/logger.js";
import type { BrokerTick } from "@windels/shared/brokerIntegration";

export interface HttpTransportConfig {
  /** Base URL, e.g. http://127.0.0.1:8765 */
  baseUrl: string;
  /** Shared secret for Authorization: Bearer. */
  token?: string;
  requestTimeoutMs?: number;
  sseReconnectMs?: number;
}

interface RpcEnvelope<T = any> { id: string; ok: boolean; error?: string; data?: T }

export class Mt5HttpTransport extends EventEmitter {
  private readonly cfg: Required<Omit<HttpTransportConfig, "token">> & { token?: string };
  private connected = false;
  private sseConnected = false;
  private sse: EventSource | null = null;
  private sseReconnectTimer?: NodeJS.Timeout;
  private stopping = false;
  private lastLatencyMs: number | null = null;
  private failures = 0;
  private abortCtl = new AbortController();

  constructor(cfg: HttpTransportConfig) {
    super();
    this.cfg = {
      baseUrl: cfg.baseUrl.replace(/\/$/, ""),
      token: cfg.token,
      requestTimeoutMs: cfg.requestTimeoutMs ?? 15_000,
      sseReconnectMs: cfg.sseReconnectMs ?? 2_000,
    };
  }

  isAvailable(): boolean { return true; }

  async start() {
    this.stopping = false;
    await this.probe();
    this.connectSse();
  }

  async stop() {
    this.stopping = true;
    clearTimeout(this.sseReconnectTimer);
    this.abortCtl.abort();
    this.abortCtl = new AbortController();
    this.sse?.close(); this.sse = null;
    this.connected = false;
    this.sseConnected = false;
  }

  latencyMs(): number | null { return this.lastLatencyMs; }
  isConnected(): boolean { return this.connected; }
  isTickConnected(): boolean { return this.sseConnected; }
  failureCount(): number { return this.failures; }

  async call<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.cfg.requestTimeoutMs);
    const start = Date.now();
    try {
      const res = await fetch(`${this.cfg.baseUrl}/rpc`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.cfg.token ? { authorization: `Bearer ${this.cfg.token}` } : {}),
        },
        body: JSON.stringify({ id: crypto.randomUUID(), method, params }),
        signal: ctl.signal,
      });
      this.lastLatencyMs = Date.now() - start;
      if (!res.ok) throw new Error(`MT5 HTTP bridge ${res.status} ${res.statusText}`);
      const env = (await res.json()) as RpcEnvelope<T>;
      if (!env.ok) throw new Error(env.error ?? `MT5 bridge error: ${method}`);
      this.failures = 0;
      this.connected = true;
      return env.data as T;
    } catch (e) {
      this.failures += 1;
      this.connected = false;
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  async subscribe(accountId: string, symbols: string[]): Promise<{ subscribed: string[] }> {
    return this.call("subscribe_ticks", { accountId, symbols });
  }
  async unsubscribe(accountId: string, symbols?: string[]): Promise<void> {
    await this.call("unsubscribe_ticks", { accountId, symbols: symbols ?? [] });
  }

  private async probe() {
    const ping = await this.call<{ pong: boolean; uptime: number }>("ping");
    if (!ping?.pong) throw new Error("MT5 HTTP bridge ping failed");
    this.connected = true;
    this.emit("rpc:connected");
    logger.info("[mt5-http] connected", { url: this.cfg.baseUrl, uptime: ping.uptime });
  }

  private connectSse() {
    if (this.stopping) return;
    try {
      const url = `${this.cfg.baseUrl}/ticks/stream`;
      // Node 20+ has global EventSource in recent releases; fall back if missing.
      const ES = (globalThis as any).EventSource;
      if (!ES) {
        logger.warn("[mt5-http] EventSource not available; tick streaming disabled (polling fallback will be used)");
        return;
      }
      this.sse = new ES(url, { fetch: (input: any, init: any) => fetch(input, { ...init, headers: { ...(init?.headers ?? {}), ...(this.cfg.token ? { authorization: `Bearer ${this.cfg.token}` } : {}) } }) });
      this.sse!.onopen = () => {
        this.sseConnected = true; this.failures = 0; this.emit("tick:connected");
        logger.info("[mt5-http] SSE tick stream connected");
      };
      this.sse!.onmessage = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data);
          this.emit("tick", data.accountId ?? "", data as BrokerTick);
        } catch {}
      };
      this.sse!.onerror = () => {
        this.sseConnected = false;
        this.emit("tick:disconnected");
        this.sse?.close(); this.sse = null;
        this.sseReconnectTimer = setTimeout(() => this.connectSse(), this.cfg.sseReconnectMs);
      };
    } catch (e) {
      logger.warn("[mt5-http] SSE setup failed", { err: e });
      this.sseReconnectTimer = setTimeout(() => this.connectSse(), this.cfg.sseReconnectMs);
    }
  }
}

const httpTransports = new Map<string, Mt5HttpTransport>();
export function getHttpTransport(baseUrl: string, token?: string): Mt5HttpTransport {
  const key = `${baseUrl}|${token ?? ""}`;
  const existing = httpTransports.get(key);
  if (existing) return existing;
  const t = new Mt5HttpTransport({ baseUrl, token });
  httpTransports.set(key, t);
  return t;
}
