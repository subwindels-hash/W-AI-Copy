import type { Request, Response, NextFunction } from "express";
import { takeToken, Limits, LimitName } from "../../security/rateLimit.js";
import { Metrics } from "../../observability/metrics.js";
import { logger } from "../../config/logger.js";

export function rateLimit(name: LimitName, identifier?: (req: Request) => string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = identifier ? identifier(req) : req.ip ?? "unknown";
    const limit = Limits[name];
    try {
      const r = await takeToken(limit, id);
      res.setHeader("X-RateLimit-Limit", String(limit.max));
      res.setHeader("X-RateLimit-Remaining", String(r.remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil((Date.now() + r.retryAfterMs) / 1000)));
      if (!r.allowed) {
        Metrics.increment("security.rate_limited", 1, { endpoint: name });
        logger.warn("rate limit exceeded", { limit: name, identifier: id.slice(0, 12), retryAfterMs: r.retryAfterMs });
        res.setHeader("Retry-After", String(Math.ceil(r.retryAfterMs / 1000)));
        return res.status(429).json({ ok: false, error: { code: "RATE_LIMITED", message: "Too many requests, slow down" }, meta: { requestId: req.requestId, retryAfterMs: r.retryAfterMs } });
      }
      next();
    } catch (e) {
      // If rate limiting itself fails, allow the request through (fail open) but log.
      logger.warn("rate limit check failed — allowing", { err: (e as Error).message });
      next();
    }
  };
}
