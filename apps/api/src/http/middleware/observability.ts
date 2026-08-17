/**
 * Observability middleware — attaches traceId, starts a server span per request,
 * records HTTP metrics, and correlates logger context. (Slices 103–106)
 *
 * Complements (does not replace) the `requestId()` middleware which already sets
 * req.requestId + X-Request-Id response header.
 */
import { randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { contextFromTraceparent, makeTraceparent, runInCtx, startSpan, setCtx } from "../../observability/tracer.js";
import { Metrics } from "../../observability/metrics.js";
import { logger } from "../../observability/logger.js";

export function observabilityMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const parent = contextFromTraceparent(req.header("traceparent"));
    const traceId = parent?.traceId ?? randomHex(32);
    const spanId = randomHex(16);
    const requestId = req.requestId;

    (req as any).traceId = traceId;
    res.setHeader("traceparent", makeTraceparent({ traceId, spanId }));

    const ctx: any = { traceId, spanId, requestId };
    // Attach user/org to ctx lazily after auth runs — we also expose a helper.
    res.on("close", () => setCtx(null));

    const method = req.method;
    const safeUrl = redactSensitiveUrl(req.originalUrl);
    const route = normalizeRoute(safeUrl);

    const t = Metrics.startTimer("http.request.duration_ms", { method, route });
    Metrics.increment("http.request.count", 1, { method, route });
    // Prometheus-standard names (used by Grafana dashboards in infra/monitoring).
    const promT = Metrics.startTimer("http_request_duration_seconds", { method, route });

    const span = startSpan(`HTTP ${method} ${route}`, {
      kind: "server",
      attrs: {
        "http.method": method, "http.url": safeUrl, "http.route": route,
        "http.user_agent": req.header("user-agent") ?? "", "requestId": requestId,
      },
    });

    res.on("finish", () => {
      const status = res.statusCode;
      const duration = t.end({ status: String(status) });
      // Prom: record seconds (not ms)
      promT.end({ status: String(status) });
      // Convert ms→s "manually" — but startTimer records ms, so we re-record into seconds via timing():
      Metrics.increment("http_requests_total", 1, { method, route, status: String(status) });
      Metrics.timing("http_request_duration_seconds", duration / 1000, { method, route, status: String(status) });
      Metrics.increment("http.response.count", 1, { method, route, status: String(status) });
      span.setAttrs({ "http.status_code": status, "http.duration_ms": Math.round(duration) });
      span.end(status < 500 ? "ok" : "error");
      if (status >= 500) {
        logger.error(`${method} ${safeUrl} ${status} ${Math.round(duration)}ms`, { method, url: safeUrl, status, durationMs: Math.round(duration), ip: req.ip, traceId, requestId });
      } else if (envDebug() || status >= 400) {
        logger[status >= 400 ? "warn" : "debug"](`${method} ${safeUrl} ${status} ${Math.round(duration)}ms`, { method, url: safeUrl, status, durationMs: Math.round(duration), traceId, requestId });
      }
    });

    // Run downstream in ctx; morgan + handlers will see traceId via logger's global ctx binding.
    runInCtx(ctx, () => next());
    setCtx(ctx);
  };
}

function envDebug() { return process.env.DEBUG_HTTP === "1" || process.env.NODE_ENV !== "production"; }

const SENSITIVE_QUERY_KEYS = new Set(["secret", "callback_secret", "token", "access_token", "refresh_token", "api_key", "key", "code"]);

export function redactSensitiveUrl(value: string): string {
  try {
    const url = new URL(value, "http://windels.local");
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.set(key, "[REDACTED]");
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return value.replace(/([?&](?:secret|callback_secret|token|access_token|refresh_token|api_key|key|code)=)[^&]*/gi, "$1[REDACTED]");
  }
}

function normalizeRoute(url: string) {
  const p = url.split("?")[0];
  const segs = p.split("/").filter(Boolean);
  const out: string[] = [];
  for (const s of segs.slice(0, 3)) {
    if (/^cm[a-z0-9]{20,}$/i.test(s) || /^[0-9a-f-]{36}$/i.test(s) || /^\d+$/.test(s)) out.push(":id");
    else out.push(s);
    if (out.length >= 2) break;
  }
  return "/" + out.join("/");
}

function randomHex(n: number) {
  // Trace/span ids must be unique under load; draw from the CSPRNG.
  return randomBytes(Math.ceil(n / 2)).toString("hex").slice(0, n);
}
