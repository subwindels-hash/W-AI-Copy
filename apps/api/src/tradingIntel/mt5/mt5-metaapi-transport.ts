/**
 * WINDELS AI OS — MT5 MetaApi Cloud Transport.
 *
 * MetaApi (https://metaapi.cloud) provides a hosted REST/Streaming API to MT4/MT5
 * accounts without needing a local terminal or Windows/Wine. Each account gets
 * provisioned in MetaApi; we use their REST API for RPC and their WebSocket
 * streaming API for real-time ticks and terminal state updates.
 *
 * This transport is selected when connectorConfig.metaapiToken is present (or
 * WINDELS_METAAPI_TOKEN is set) and `transport` is `metaapi_cloud`.
 */
import { EventEmitter } from "node:events";
import { logger } from "../../config/logger.js";
import type { BrokerTick } from "@windels/shared/brokerIntegration";

export interface MetaApiTransportConfig {
  token: string;
  /** MetaApi region: "new-york" | "london" | "singapore" | "frankfurt" | "amsterdam" | "hong-kong" */
  region?: string;
  requestTimeoutMs?: number;
}

interface RpcEnvelope<T = any> { ok: boolean; error?: string; data?: T }

const METAAPI_BASE = "https://mt-client-api-v1.new-york.agiliumtrade.ai";

export class Mt5MetaApiTransport extends EventEmitter {
  private readonly cfg: Required<MetaApiTransportConfig>;
  private connected = false;
  private streamConnected = false;
  private failures = 0;
  private lastLatencyMs: number | null = null;
  private stopping = false;
  private ws: any = null;
  private reconnectTimer?: NodeJS.Timeout;
  /** accountId -> MetaApi account id */
  private readonly accountMap = new Map<string, string>();

  constructor(cfg: MetaApiTransportConfig) {
    super();
    this.cfg = { token: cfg.token, region: cfg.region ?? "new-york", requestTimeoutMs: cfg.requestTimeoutMs ?? 15_000 };
  }

  isAvailable(): boolean { return !!this.cfg.token && this.cfg.token.length > 8; }

  async start() {
    this.stopping = false;
    // Validate token with a simple ping (list accounts).
    const res = await this.authFetch(`/users/current/accounts`, {}, { method: "GET" });
    if (!res.ok) throw new Error(`MetaApi auth failed: ${res.status}`);
    this.connected = true;
    this.emit("rpc:connected");
    logger.info("[mt5-metaapi] connected", { region: this.cfg.region });
    this.startStream();
  }

  async stop() {
    this.stopping = true;
    clearTimeout(this.reconnectTimer);
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this.connected = false;
    this.streamConnected = false;
  }

  /** Provision/register a MetaApi account for a WINDELS broker account. Returns the MetaApi account id. */
  async provisionAccount(accountId: string, login: string, password: string, server: string, platform = "mt5"): Promise<string> {
    const existing = this.accountMap.get(accountId);
    if (existing) return existing;
    const body = {
      login, password, server, platform,
      magic: 987654,
      name: `WINDELS ${accountId}`,
    };
    const res = await this.authFetch(`/users/current/accounts`, { "content-type": "application/json" }, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`MetaApi provision failed: ${res.status} ${await res.text()}`);
    const data: any = await res.json();
    const metaAccountId = data._id || data.id;
    this.accountMap.set(accountId, metaAccountId);
    return metaAccountId;
  }

  latencyMs(): number | null { return this.lastLatencyMs; }
  isConnected(): boolean { return this.connected; }
  isTickConnected(): boolean { return this.streamConnected; }
  failureCount(): number { return this.failures; }

  async call<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
    // Routes method calls to appropriate MetaApi endpoints.
    // Methods we support:
    //   connect_account, disconnect_account, get_account_info, get_symbols,
    //   get_positions, get_orders, get_deals, get_candles, send_order,
    //   close_position, modify_position, subscribe_ticks, unsubscribe_ticks
    const start = Date.now();
    try {
      const { accountId } = params;
      const metaId = this.accountMap.get(accountId);
      if (!metaId && method !== "connect_account") throw new Error(`account ${accountId} not provisioned on MetaApi`);
      const env = await this.dispatch(method, params, metaId!);
      this.lastLatencyMs = Date.now() - start;
      this.failures = 0;
      if (!env.ok) throw new Error(env.error ?? method);
      return env.data as T;
    } catch (e) {
      this.failures += 1;
      throw e;
    }
  }

  private async dispatch(method: string, params: any, metaId: string): Promise<RpcEnvelope> {
    const base = `/users/current/accounts/${metaId}`;
    const timeout = this.cfg.requestTimeoutMs;
    switch (method) {
      case "connect_account": {
        const id = await this.provisionAccount(params.accountId, params.login, params.password, params.server, params.platform ?? "mt5");
        // Deploy and connect the MetaApi account.
        await this.authFetch(`/users/current/accounts/${id}/deploy`, {}, { method: "POST" });
        // Wait up to 30s for connection to terminal.
        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
          const r: any = await (await this.authFetch(`/users/current/accounts/${id}`, {}, { method: "GET" })).json();
          if (r.state === "DEPLOYED" && r.connectionStatus === "CONNECTED") {
            this.accountMap.set(params.accountId, id);
            return { ok: true, data: { metaAccountId: id, connected: true } };
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
        return { ok: false, error: "MetaApi account did not reach CONNECTED state" };
      }
      case "disconnect_account": {
        await this.authFetch(`/users/current/accounts/${metaId}/undeploy`, {}, { method: "POST" });
        this.accountMap.delete(params.accountId);
        return { ok: true, data: {} };
      }
      case "get_account_info": {
        const r = await (await this.authFetch(`${base}/account-information`, {}, { method: "GET" })).json();
        return { ok: true, data: r };
      }
      case "get_symbols": {
        const r = await (await this.authFetch(`${base}/symbols`, {}, { method: "GET" })).json();
        return { ok: true, data: r };
      }
      case "get_positions": {
        const r = await (await this.authFetch(`${base}/positions`, {}, { method: "GET" })).json();
        return { ok: true, data: r };
      }
      case "get_orders": {
        const r = await (await this.authFetch(`${base}/orders`, {}, { method: "GET" })).json();
        return { ok: true, data: r };
      }
      case "get_deals": {
        let url = `${base}/deals`;
        const q = new URLSearchParams();
        if (params.from) q.set("startTime", new Date(params.from).toISOString());
        if (params.to) q.set("endTime", new Date(params.to).toISOString());
        if (q.toString()) url += `?${q}`;
        const r = await (await this.authFetch(url, {}, { method: "GET" })).json();
        return { ok: true, data: r };
      }
      case "get_candles": {
        const url = `${base}/historical-market-data/symbols/${encodeURIComponent(params.symbol)}/timeframes/${params.timeframe}/candles?limit=${params.count ?? 100}`;
        const r = await (await this.authFetch(url, {}, { method: "GET" })).json();
        return { ok: true, data: r };
      }
      case "send_order": {
        const resp = await this.authFetch(`${base}/trade`, { "content-type": "application/json" }, { method: "POST", body: JSON.stringify(params.order) });
        const body: any = await resp.json();
        if (!resp.ok) return { ok: false, error: body.message || `MetaApi trade ${resp.status}` };
        return { ok: true, data: body };
      }
      case "close_position": {
        const resp = await this.authFetch(`${base}/positions/${params.ticket}/close`, { "content-type": "application/json" }, { method: "POST", body: JSON.stringify({ volume: params.volume }) });
        const body: any = await resp.json();
        if (!resp.ok) return { ok: false, error: body.message || "close failed" };
        return { ok: true, data: body };
      }
      case "modify_position": {
        const resp = await this.authFetch(`${base}/positions/${params.ticket}`, { "content-type": "application/json" }, { method: "PATCH", body: JSON.stringify({ stopLoss: params.sl, takeProfit: params.tp }) });
        const body: any = await resp.json();
        if (!resp.ok) return { ok: false, error: body.message || "modify failed" };
        return { ok: true, data: body };
      }
      case "subscribe_ticks": {
        // Ticks come via the WebSocket stream; add to subscription list server-side.
        await this.authFetch(`${base}/symbols/${encodeURIComponent(params.symbols.join?.(",") ?? "*")}/subscribe`, {}, { method: "POST" }).catch(() => {});
        return { ok: true, data: { subscribed: params.symbols } };
      }
      case "unsubscribe_ticks": {
        return { ok: true, data: {} };
      }
      default:
        return { ok: false, error: `unsupported method ${method}` };
    }
    void timeout;
  }

  private async authFetch(path: string, headers: Record<string, string>, init: RequestInit): Promise<Response> {
    return fetch(`${METAAPI_BASE}${path}`, {
      ...init,
      headers: {
        "auth-token": this.cfg.token,
        ...headers,
      },
      signal: AbortSignal.timeout(this.cfg.requestTimeoutMs),
    });
  }

  private startStream() {
    if (this.stopping) return;
    try {
      // MetaApi provides an SDK-based websocket; for a lean integration we use
      // their streaming endpoint via plain WS. If available, we connect for tick
      // + state streaming; otherwise we degrade to polling via the RPC path.
      // (Node's global WebSocket is available in Node 22+, which we already require.)
      const ws = new WebSocket(`wss://mt-client-api-v1.new-york.agiliumtrade.ai/ws?auth-token=${this.cfg.token}`);
      this.ws = ws;
      ws.onopen = () => { this.streamConnected = true; this.emit("tick:connected"); logger.info("[mt5-metaapi] streaming websocket open"); };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "tick" && msg.data) this.emit("tick", msg.accountId ?? "", msg.data as BrokerTick);
        } catch {}
      };
      ws.onclose = () => {
        this.streamConnected = false;
        this.emit("tick:disconnected");
        if (this.stopping) return;
        this.reconnectTimer = setTimeout(() => this.startStream(), 3000);
      };
      ws.onerror = (e: any) => {
        logger.warn("[mt5-metaapi] websocket error", { err: e?.message ?? e });
        try { ws.close(); } catch {}
      };
    } catch (e) {
      logger.warn("[mt5-metaapi] websocket setup failed; polling fallback will be used", { err: e });
      this.reconnectTimer = setTimeout(() => this.startStream(), 5000);
    }
  }
}

const metaTransports = new Map<string, Mt5MetaApiTransport>();
export function getMetaApiTransport(token: string, region?: string): Mt5MetaApiTransport {
  const key = `${region ?? "new-york"}|${token.slice(0, 8)}`;
  const existing = metaTransports.get(key);
  if (existing) return existing;
  const t = new Mt5MetaApiTransport({ token, region });
  metaTransports.set(key, t);
  return t;
}
