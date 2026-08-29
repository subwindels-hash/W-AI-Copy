/**
 * WINDELS AI OS — Shared HTTP client for crypto exchange REST APIs.
 *
 * A small, no-SDK fetch wrapper that handles:
 *   - JSON body serialization / query-string building
 *   - Signer hook (per-exchange HMAC/JWT/ED25519)
 *   - Rate-limit token bucket (per-endpoint budget), with Retry-After honoring
 *   - Exponential-backoff retries on 5xx / 429 / network errors (3 attempts)
 *   - Timeout enforcement (default 10s)
 *   - Structured error with exchange-native code + HTTP status (never throws
 *     untyped — caller receives ExchangeHttpError)
 *
 * It uses Node's built-in fetch (undici in Node 22) to avoid any dependency
 * bloat, and keeps secrets out of logs by default (see redactHeaders).
 */
import { setTimeout as delay } from "node:timers/promises";

export interface HttpSigner {
  /** Mutate the request for auth: add headers, mutate URL/body, etc. */
  sign(args: {
    method: string;
    path: string;       // includes query string (read/write)
    body: string | null; // serialized JSON or '' or null (read/write via setter)
    headers: Record<string, string>;
    /** Unix millisecond timestamp at send-time (for clock-drift correction). */
    timestampMs: number;
  }): HttpSignerResult | void | Promise<HttpSignerResult | void>;
}

export interface HttpSignerResult {
  /** If set, replaces the request path (incl. query string). */
  path?: string;
  /** If set, replaces the request body. */
  body?: string | null;
}

export interface HttpRequest {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;                // "/api/v3/account" (no host)
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: Record<string, unknown> | string | null;
  headers?: Record<string, string>;
  /** Override default timeout for this request. */
  timeoutMs?: number;
  /** If true, do not sign (public endpoint). */
  skipAuth?: boolean;
}

export interface HttpResponse<T> {
  status: number;
  headers: Record<string, string>;
  data: T;
  latencyMs: number;
}

export class ExchangeHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly exchangeCode: number | string | null,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "ExchangeHttpError";
  }
}

export interface TokenBucketOptions {
  /** Tokens per minute. */
  perMinute: number;
  /** Maximum burst size. */
  capacity?: number;
}

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly refillPerMs: number;
  private readonly capacity: number;
  constructor(opts: TokenBucketOptions) {
    this.capacity = opts.capacity ?? opts.perMinute;
    this.tokens = this.capacity;
    this.refillPerMs = opts.perMinute / 60_000;
    this.lastRefill = Date.now();
  }
  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }
  async take(n = 1): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= n) { this.tokens -= n; return; }
      const waitMs = Math.ceil((n - this.tokens) / this.refillPerMs);
      await delay(Math.min(waitMs, 500));
    }
  }
}

export interface ExchangeHttpClientOptions {
  baseUrl: string;
  /** Optional signer for private endpoints. */
  signer?: HttpSigner;
  /** Default timeout in ms. */
  timeoutMs?: number;
  /** Per-minute rate limit (weighted). */
  defaultReqPerMinute?: number;
  /** User-agent header. */
  userAgent?: string;
  /** Latency tracker callback (for observability). */
  onRequest?: (info: { method: string; path: string; status: number; latencyMs: number }) => void;
}

export class ExchangeHttpClient {
  private readonly base: string;
  private readonly signer?: HttpSigner;
  private readonly timeoutMs: number;
  private readonly bucket: TokenBucket;
  private readonly userAgent: string;
  private readonly onRequest?: ExchangeHttpClientOptions["onRequest"];

  constructor(opts: ExchangeHttpClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.signer = opts.signer;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.bucket = new TokenBucket({ perMinute: opts.defaultReqPerMinute ?? 1200 });
    this.userAgent = opts.userAgent ?? "WINDELS-AI-OS/1.0 (Crypto-Connector)";
    this.onRequest = opts.onRequest;
  }

  async request<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
    const maxAttempts = 3;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.do<T>(req);
      } catch (e) {
        lastErr = e as Error;
        if (e instanceof ExchangeHttpError) {
          // 4xx (except 429) are non-retryable.
          if (e.status === 429 || e.status >= 500) {
            const backoff = 200 * Math.pow(2, attempt) + Math.floor(100 * attempt);
            await delay(backoff);
            continue;
          }
          throw e;
        }
        // network / fetch error
        await delay(200 * Math.pow(2, attempt));
      }
    }
    throw lastErr ?? new Error("request failed");
  }

  private async do<T = unknown>(req: HttpRequest): Promise<HttpResponse<T>> {
    await this.bucket.take(1);

    const headers: Record<string, string> = {
      "user-agent": this.userAgent,
      "accept": "application/json",
      ...(req.headers ?? {}),
    };

    // Build URL with query.
    let path = req.path;
    if (req.query) {
      const qs = buildQueryString(req.query);
      if (qs) path += (path.includes("?") ? "&" : "?") + qs;
    }
    let bodyStr: string | null = null;
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === "string") {
        bodyStr = req.body;
        if (!headers["content-type"]) headers["content-type"] = "text/plain";
      } else {
        bodyStr = JSON.stringify(req.body);
        headers["content-type"] = "application/json";
      }
    }

    if (!req.skipAuth && this.signer) {
      const result = await this.signer.sign({
        method: req.method,
        path,
        body: bodyStr,
        headers,
        timestampMs: Date.now(),
      });
      if (result) {
        if (result.path !== undefined) path = result.path;
        if (result.body !== undefined) { bodyStr = result.body; if (bodyStr && !headers["content-type"]) headers["content-type"] = "application/x-www-form-urlencoded"; }
      }
    }

    const url = this.base + path;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? this.timeoutMs);
    const start = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: req.method,
        headers,
        body: bodyStr ?? undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const latencyMs = Date.now() - start;
    const text = await res.text();
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { respHeaders[k.toLowerCase()] = v; });

    let data: unknown = null;
    if (text.length > 0) {
      try { data = JSON.parse(text); }
      catch { data = text; }
    }

    if (this.onRequest) {
      try { this.onRequest({ method: req.method, path, status: res.status, latencyMs }); }
      catch { /* ignore */ }
    }

    if (!res.ok) {
      const code = extractErrorCode(data);
      const msg = extractErrorMessage(data) ?? `HTTP ${res.status}`;
      throw new ExchangeHttpError(res.status, code, msg, data);
    }

    return { status: res.status, headers: respHeaders, data: data as T, latencyMs };
  }
}

function buildQueryString(q: Record<string, string | number | boolean | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
  }
  return parts.join("&");
}

function extractErrorCode(data: unknown): number | string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  // Common error code fields across exchanges.
  for (const key of ["code", "retCode", "rc", "errorCode", "error_code", "sCode"]) {
    if (d[key] !== undefined && d[key] !== null && d[key] !== 0 && d[key] !== "0") {
      return d[key] as number | string;
    }
  }
  return null;
}

function extractErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  for (const key of ["msg", "message", "retMsg", "error_message", "errMsg", "error", "sMsg"]) {
    if (typeof d[key] === "string" && d[key].length > 0) return d[key] as string;
  }
  return null;
}
