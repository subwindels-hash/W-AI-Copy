/**
 * WINDELS AI OS — MT5 ZeroMQ Transport Client.
 *
 * Communicates with the out-of-process Python MT5 bridge (scripts/mt5-bridge/bridge.py)
 * over ZeroMQ:
 *   - REQ/REP socket for request/response RPC (connect, sync, orders, candles, history)
 *   - SUB socket for streaming ticks published by the bridge
 *
 * The Python side uses the official `MetaTrader5` pip package against a running
 * MetaTrader 5 terminal (native Windows or Linux + Wine). Credentials are sent
 * per-connect request; the bridge holds the MT5 session in-memory per
 * (login,server) key.
 *
 * Design notes:
 *   - All requests have a correlation id + deadline; the transport never blocks
 *     forever.
 *   - On socket disconnect we transparently reconnect with exponential backoff.
 *   - Messages are JSON-encoded; binary framing is 4-byte big-endian length
 *     prefix so large payloads (candle history, symbol lists) are safe.
 *   - Tick subscription is multiplexed on a single SUB socket; symbols are
 *     subscribed via a control message, and the bridge filters by prefix.
 */
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { logger } from "../../config/logger.js";
import type { BrokerTick } from "@windels/shared/brokerIntegration";

let zeromq: any = null;
let zmqAvailable = false;
try {
  // Optional dependency — gracefully report unavailable when missing.
  zeromq = await import("zeromq");
  zmqAvailable = true;
} catch {
  zmqAvailable = false;
}

interface RpcRequest {
  id: string;
  method: string;
  params: Record<string, any>;
}

interface RpcResponse<T = any> {
  id: string;
  ok: boolean;
  error?: string;
  data?: T;
}

export interface ZmqTransportConfig {
  /** REQ/REP endpoint for RPC, e.g. tcp://127.0.0.1:5555 */
  rpcEndpoint: string;
  /** PUB/SUB endpoint for ticks, e.g. tcp://127.0.0.1:5556 */
  tickEndpoint: string;
  /** Per-request timeout in ms. */
  requestTimeoutMs?: number;
  /** Reconnect interval (base, ms). */
  reconnectMs?: number;
}

const CONN_DEAD = "DEAD";

export class Mt5ZmqTransport extends EventEmitter {
  private readonly cfg: Required<ZmqTransportConfig>;
  private rpcSocket: any = null;
  private tickSocket: any = null;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private connected = false;
  private tickConnected = false;
  private rpcReconnectTimer?: NodeJS.Timeout;
  private tickReconnectTimer?: NodeJS.Timeout;
  private stopping = false;
  private lastLatencyMs: number | null = null;
  private consecutiveFailures = 0;

  constructor(cfg: ZmqTransportConfig) {
    super();
    this.cfg = {
      rpcEndpoint: cfg.rpcEndpoint,
      tickEndpoint: cfg.tickEndpoint,
      requestTimeoutMs: cfg.requestTimeoutMs ?? 15_000,
      reconnectMs: cfg.reconnectMs ?? 2_000,
    };
  }

  isAvailable(): boolean { return zmqAvailable; }

  async start() {
    if (!zmqAvailable) throw new Error("zeromq npm package is not installed — native MT5 ZMQ transport unavailable");
    this.stopping = false;
    await this.connectRpc();
    await this.connectTick();
  }

  async stop() {
    this.stopping = true;
    clearTimeout(this.rpcReconnectTimer);
    clearTimeout(this.tickReconnectTimer);
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("transport shutting down"));
      this.pending.delete(id);
    }
    try { this.rpcSocket?.close(); } catch {}
    try { this.tickSocket?.close(); } catch {}
    this.rpcSocket = null;
    this.tickSocket = null;
    this.connected = false;
    this.tickConnected = false;
  }

  latencyMs(): number | null { return this.lastLatencyMs; }
  isConnected(): boolean { return this.connected; }
  isTickConnected(): boolean { return this.tickConnected; }
  failureCount(): number { return this.consecutiveFailures; }

  /* ── RPC ────────────────────────────────────────────────────── */

  async call<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
    if (!this.connected || !this.rpcSocket) {
      throw new Error(`MT5 ZMQ transport not connected (method=${method})`);
    }
    const id = randomUUID();
    const req: RpcRequest = { id, method, params };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MT5 ZMQ request ${method} timed out after ${this.cfg.requestTimeoutMs}ms`));
          this.scheduleRpcReconnect("timeout");
        }
      }, this.cfg.requestTimeoutMs);
      this.pending.set(id, { resolve: (v: RpcResponse<T>) => {
        clearTimeout(timer);
        this.pending.delete(id);
        if (v?.ok) resolve(v.data as T);
        else reject(new Error(v?.error ?? `MT5 bridge error: ${method}`));
      }, reject: (e) => { clearTimeout(timer); this.pending.delete(id); reject(e); }, timer });
      const start = Date.now();
      const framed = this.frame(JSON.stringify(req));
      this.rpcSocket.send(framed).then(() => {
        this.lastLatencyMs = Date.now() - start;
      }).catch((e: any) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
        this.scheduleRpcReconnect("send error");
      });
    });
  }

  /* ── Tick subscription ─────────────────────────────────────── */

  async subscribe(accountId: string, symbols: string[]): Promise<{ subscribed: string[] }> {
    // Tell bridge which symbols we want for this account; tick messages carry
    // the accountId so multiple accounts can share the SUB socket.
    return this.call("subscribe_ticks", { accountId, symbols });
  }

  async unsubscribe(accountId: string, symbols?: string[]): Promise<void> {
    await this.call("unsubscribe_ticks", { accountId, symbols: symbols ?? [] });
  }

  /* ── Internals ─────────────────────────────────────────────── */

  private async connectRpc() {
    if (this.stopping) return;
    try {
      this.rpcSocket = new zeromq.Request({
        linger: 0,
        connectTimeout: 5_000,
        sendTimeout: this.cfg.requestTimeoutMs,
        receiveTimeout: this.cfg.requestTimeoutMs,
        reconnectInterval: this.cfg.reconnectMs,
        reconnectMaxInterval: 30_000,
      });
      this.rpcSocket.connect(this.cfg.rpcEndpoint);
      // Heartbeat / identify: ping and wait for pong.
      await this.rpcSocket.send(this.frame(JSON.stringify({ id: "ping", method: "ping", params: {} })));
      const [msg] = await this.rpcSocket.receive();
      const parsed = this.unframe(msg) as RpcResponse;
      if (parsed?.ok && parsed?.data?.pong) {
        this.connected = true;
        this.consecutiveFailures = 0;
        this.emit("rpc:connected");
        logger.info("[mt5-zmq] RPC connected", { endpoint: this.cfg.rpcEndpoint });
        void this.readRpcLoop();
      } else {
        throw new Error(`bad handshake: ${JSON.stringify(parsed)}`);
      }
    } catch (e) {
      this.connected = false;
      this.consecutiveFailures += 1;
      logger.warn("[mt5-zmq] RPC connect failed, retrying", { err: e, attempt: this.consecutiveFailures, endpoint: this.cfg.rpcEndpoint });
      this.scheduleRpcReconnect("connect failure");
    }
  }

  private async readRpcLoop() {
    while (!this.stopping && this.rpcSocket) {
      try {
        const [msg] = await this.rpcSocket.receive();
        const parsed = this.unframe(msg) as RpcResponse;
        const pending = this.pending.get(parsed.id);
        if (pending) pending.resolve(parsed);
      } catch (e) {
        if (this.stopping) break;
        logger.warn("[mt5-zmq] RPC read error", { err: e });
        this.connected = false;
        this.scheduleRpcReconnect("read error");
        break;
      }
    }
  }

  private scheduleRpcReconnect(reason: string) {
    if (this.stopping) return;
    if (this.rpcReconnectTimer) return;
    try { this.rpcSocket?.close(); } catch {}
    this.rpcSocket = null;
    this.connected = false;
    const delay = Math.min(30_000, this.cfg.reconnectMs * Math.pow(1.5, Math.min(8, this.consecutiveFailures)));
    logger.info("[mt5-zmq] scheduling RPC reconnect", { reason, delayMs: delay });
    this.emit("rpc:disconnected", { reason });
    this.rpcReconnectTimer = setTimeout(() => {
      this.rpcReconnectTimer = undefined;
      this.connectRpc().catch(() => {});
    }, delay);
  }

  private async connectTick() {
    if (this.stopping) return;
    try {
      this.tickSocket = new zeromq.Subscriber({
        linger: 0,
        reconnectInterval: this.cfg.reconnectMs,
        reconnectMaxInterval: 30_000,
      });
      this.tickSocket.connect(this.cfg.tickEndpoint);
      this.tickSocket.subscribe("tick/");
      this.tickConnected = true;
      this.emit("tick:connected");
      logger.info("[mt5-zmq] tick stream connected", { endpoint: this.cfg.tickEndpoint });
      void this.readTickLoop();
    } catch (e) {
      this.tickConnected = false;
      logger.warn("[mt5-zmq] tick connect failed, retrying", { err: e, endpoint: this.cfg.tickEndpoint });
      this.scheduleTickReconnect();
    }
  }

  private async readTickLoop() {
    while (!this.stopping && this.tickSocket) {
      try {
        const [topic, payload] = await this.tickSocket.receive();
        const t = topic.toString();
        if (!t.startsWith("tick/")) continue;
        // topic format: tick/<accountId>/<symbol>
        const parts = t.split("/");
        const accountId = parts[1] ?? "";
        const data = JSON.parse(payload.toString()) as BrokerTick & { accountId?: string };
        this.emit("tick", accountId, data);
      } catch (e) {
        if (this.stopping) break;
        logger.warn("[mt5-zmq] tick read error", { err: e });
        this.tickConnected = false;
        this.scheduleTickReconnect();
        break;
      }
    }
  }

  private scheduleTickReconnect() {
    if (this.stopping) return;
    if (this.tickReconnectTimer) return;
    try { this.tickSocket?.close(); } catch {}
    this.tickSocket = null;
    const delay = Math.min(30_000, this.cfg.reconnectMs * 2);
    this.emit("tick:disconnected");
    this.tickReconnectTimer = setTimeout(() => {
      this.tickReconnectTimer = undefined;
      this.connectTick().catch(() => {});
    }, delay);
  }

  private frame(s: string): Buffer {
    const buf = Buffer.from(s, "utf8");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(buf.length, 0);
    return Buffer.concat([len, buf]);
  }

  private unframe(msg: Buffer | ArrayBuffer | string): unknown {
    const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg as any);
    if (buf.length < 4) throw new Error("short frame");
    const len = buf.readUInt32BE(0);
    if (buf.length < 4 + len) throw new Error("truncated frame");
    const body = buf.subarray(4, 4 + len);
    return JSON.parse(body.toString("utf8"));
  }
}

/** Singleton transport instance factory (one per endpoint pair to avoid duplicate sockets). */
const transports = new Map<string, Mt5ZmqTransport>();
export function getZmqTransport(rpcEndpoint: string, tickEndpoint: string): Mt5ZmqTransport {
  const key = `${rpcEndpoint}|${tickEndpoint}`;
  const existing = transports.get(key);
  if (existing) return existing;
  const t = new Mt5ZmqTransport({ rpcEndpoint, tickEndpoint });
  transports.set(key, t);
  return t;
}
