import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

redis.on("connect", () => logger.info("redis connected"));
redis.on("error", (err) => logger.warn("redis client error", { err }));

/**
 * Dedicated Redis connection for regular commands.
 *
 * The default `redis` export may be put into subscriber mode by modules such
 * as EventBusService; once subscribed, ioredis rejects regular commands on
 * that connection. Any module that needs to run key/value commands after
 * boot should import this client instead.
 */
export const redisCmd: Redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});
redisCmd.on("error", () => { /* swallow */ });
redisCmd.connect().catch(() => { /* best effort; retry on first command */ });

// Simple metrics for common operations via select wrapping.
// We avoid monkey-patching sendCommand because ioredis uses it for internal
// connection handshakes — a buggy wrap can deadlock connect(). Instead,
// callers should use `instrumented()` for business-code Redis calls.
export async function redisCommand<T>(command: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  let status: "ok" | "error" = "ok";
  try {
    return await fn();
  } catch (e) {
    status = "error";
    throw e;
  } finally {
    const ms = performance.now() - t0;
    Metrics.timing("redis.command.duration_ms", ms, { command, status });
    Metrics.increment("redis.command.count", 1, { command, status });
  }
}
