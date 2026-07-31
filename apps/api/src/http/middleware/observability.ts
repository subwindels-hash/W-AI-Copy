/**
 * Observability middleware — attaches traceId, starts a server span per request,
 * records HTTP metrics, and correlates logger context. (Slices 103–106)
 *
 * Complements (does not replace) the `requestId()` middleware which already sets
 * req.requestId + X-Request-Id response header.
 */
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
    const route = normalizeRoute(req.originalUrl);

    const t = Metrics.startTimer("http.request.duration_ms", { method, route });
    Metrics.increment("http.request.count", 1, { method, route });
    // Prometheus-standard names (used by Grafana dashboards in infra/monitoring).
    const promT = Metrics.startTimer("http_request_duration_seconds", { method, route });

    const span = startSpan(`HTTP ${method} ${route}`, {
      kind: "server",
      attrs: {
        "http.method": method, "http.url": req.originalUrl, "http.route": route,
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
        logger.error(`${method} ${req.originalUrl} ${status} ${Math.round(duration)}ms`, { method, url: req.originalUrl, status, durationMs: Math.round(duration), ip: req.ip, traceId, requestId });
      } else if (envDebug() || status >= 400) {
        logger[status >= 400 ? "warn" : "debug"](`${method} ${req.originalUrl} ${status} ${Math.round(duration)}ms`, { method, url: req.originalUrl, status, durationMs: Math.round(duration), traceId, requestId });
      }
    });

    // Run downstream in ctx; morgan + handlers will see traceId via logger's global ctx binding.
    runInCtx(ctx, () => next());
    setCtx(ctx);
  };
}

function envDebug() { return process.env.DEBUG_HTTP === "1" || process.env.NODE_ENV !== "production"; }

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
  const chars = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}
