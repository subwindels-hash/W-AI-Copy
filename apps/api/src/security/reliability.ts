/**
 * Security & Reliability — Circuit Breaker + timeouts (Slice 118).
 *
 * Per-external-dependency circuit breaker. When a downstream (AI provider,
 * webhook HTTP, SSO exchange) fails repeatedly over a window, the breaker
 * trips and fast-fails for a cooldown period before probing again (half-open).
 *
 * Each external integration uses `withBreaker(name, fn)` to wrap calls.
 */
import { Metrics } from "../observability/metrics.js";
import { logger } from "../config/logger.js";

type State = "closed" | "open" | "half-open";
interface Breaker {
  state: State;
  failures: number;
  successes: number;
  lastFailure: number;
  openedAt: number;
  nextProbe: number;
}
const breakers = new Map<string, Breaker>();

interface Options {
  threshold?: number;      // consecutive failures before tripping (default 5)
  cooldownMs?: number;     // how long to stay open before half-open (default 30s)
  probeSuccess?: number;   // successful probes needed to close (default 2)
  timeoutMs?: number;      // call timeout (default 30s)
}
const DEFAULTS = { threshold: 5, cooldownMs: 30_000, probeSuccess: 2, timeoutMs: 30_000 };

function getBreaker(name: string): Breaker {
  let b = breakers.get(name);
  if (!b) {
    b = { state: "closed", failures: 0, successes: 0, lastFailure: 0, openedAt: 0, nextProbe: 0 };
    breakers.set(name, b);
  }
  return b;
}

export function withBreaker<T>(name: string, fn: (signal: AbortSignal) => Promise<T>, opts: Options = {}): Promise<T> {
  const opt = { ...DEFAULTS, ...opts };
  const b = getBreaker(name);
  const now = Date.now();

  if (b.state === "open") {
    if (now < b.nextProbe) {
      Metrics.increment("reliability.breaker_rejected", 1, { name });
      const err: any = new Error(`Circuit breaker OPEN for ${name}`);
      err.code = "CIRCUIT_OPEN";
      return Promise.reject(err);
    }
    b.state = "half-open";
    b.successes = 0;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`timeout after ${opt.timeoutMs}ms`)), opt.timeoutMs);

  return fn(ctrl.signal)
    .then((v) => {
      clearTimeout(timer);
      b.failures = 0;
      if (b.state === "half-open") {
        b.successes++;
        if (b.successes >= opt.probeSuccess) {
          b.state = "closed";
          logger.info(`circuit breaker CLOSED for ${name}`);
          Metrics.increment("reliability.breaker_state_change", 1, { name, state: "closed" });
        }
      }
      Metrics.increment("reliability.calls", 1, { name, result: "ok" });
      return v;
    })
    .catch((e) => {
      clearTimeout(timer);
      b.failures++;
      b.lastFailure = now;
      Metrics.increment("reliability.calls", 1, { name, result: "fail" });
      if (b.state === "half-open" || b.failures >= opt.threshold) {
        b.state = "open";
        b.openedAt = now;
        b.nextProbe = now + opt.cooldownMs;
        logger.warn(`circuit breaker OPEN for ${name}`, { failures: b.failures, cooldownMs: opt.cooldownMs, err: e?.message });
        Metrics.increment("reliability.breaker_state_change", 1, { name, state: "open" });
      }
      throw e;
    });
}

export function breakerStatus() {
  return Array.from(breakers.entries()).map(([name, b]) => ({
    name, state: b.state, failures: b.failures, successes: b.successes,
    openedAt: b.openedAt ? new Date(b.openedAt).toISOString() : null,
    nextProbe: b.nextProbe ? new Date(b.nextProbe).toISOString() : null,
  }));
}

export function resetBreaker(name: string) {
  breakers.delete(name);
}
