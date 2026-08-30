/**
 * Module 59: AI Circuit Breaker & Fault Tolerance Service
 *
 * Provides AI-specific fault tolerance infrastructure including circuit breakers
 * with open/half-open/closed state management, intelligent retry policies with
 * exponential backoff and jitter, bulkhead isolation for AI models, timeout
 * management for inference workloads, and health scoring with failure tracking.
 *
 * Phase 1 — Critical Gap: AI-specific fault tolerance and circuit breaker infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiCircuitBreaker');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half-open";

export type RetryStrategy = "exponential-backoff" | "linear" | "fixed" | "fibonacci" | "decorrelated-jitter";

export type FailureType = "timeout" | "error-response" | "network" | "rate-limit" | "overload" | "model-error" | "resource-exhausted" | "unknown";

export type BulkheadStatus = "healthy" | "degraded" | "saturated" | "rejected";

export interface CircuitBreaker {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  target: CircuitBreakerTarget;
  state: CircuitState;
  config: CircuitBreakerConfig;
  metrics: CircuitBreakerMetrics;
  failureTracking: FailureTracking;
  retryPolicy: RetryPolicy;
  bulkhead?: BulkheadConfig;
  lastStateChange: string;
  stateHistory: StateChange[];
  createdAt: string;
  updatedAt: string;
}

export interface CircuitBreakerTarget {
  modelId: string;
  modelName: string;
  endpoint: string;
  deploymentId?: string;
  version?: string;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutSeconds: number;
  halfOpenMaxRequests: number;
  windowSizeSeconds: number;
  volumeThreshold: number;
  sleepWindowSeconds: number;
  forceOpen: boolean;
  forceClosed: boolean;
  failureTypes: FailureType[];
  slowCallThresholdMs: number;
  slowCallRateThreshold: number;
}

export interface CircuitBreakerMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rejectedRequests: number;
  timeoutRequests: number;
  slowRequests: number;
  successRate: number;
  failureRate: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  requestsInWindow: number;
  failuresInWindow: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  uptimePercent: number;
}

export interface FailureTracking {
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalFailures: number;
  totalSuccesses: number;
  failuresByType: Record<string, number>;
  recentFailures: FailureEvent[];
  firstFailureAt?: string;
  lastFailureAt?: string;
}

export interface FailureEvent {
  id: string;
  timestamp: string;
  type: FailureType;
  message: string;
  statusCode?: number;
  latencyMs?: number;
  retryCount: number;
  metadata?: Record<string, unknown>;
}

export interface RetryPolicy {
  enabled: boolean;
  maxRetries: number;
  strategy: RetryStrategy;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number;
  retryableStatusCodes: number[];
  retryableExceptions: string[];
  timeout: number;
  exponentialBase: number;
}

export interface BulkheadConfig {
  maxConcurrentRequests: number;
  maxQueueSize: number;
  queueTimeoutMs: number;
  isolationLevel: "model" | "endpoint" | "deployment" | "global";
}

export interface StateChange {
  from: CircuitState;
  to: CircuitState;
  reason: string;
  timestamp: string;
  metrics: { failures: number; successes: number; rate: number };
}

export interface CircuitBreakerExecution {
  id: string;
  circuitBreakerId: string;
  status: "success" | "failure" | "rejected" | "timeout" | "retry";
  circuitState: CircuitState;
  latencyMs: number;
  retryCount: number;
  error?: { type: FailureType; message: string; statusCode?: number };
  timestamp: string;
}

export interface FaultToleranceStats {
  totalCircuitBreakers: number;
  openCircuits: number;
  halfOpenCircuits: number;
  closedCircuits: number;
  totalRequests: number;
  totalFailures: number;
  totalRetries: number;
  totalRejections: number;
  averageSuccessRate: number;
  averageLatencyMs: number;
  topFailureTypes: Record<string, number>;
  mostTrippedBreakers: Array<{ name: string; tripCount: number }>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const breakers = new Map<string, CircuitBreaker>();
const executions = new Map<string, CircuitBreakerExecution[]>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a circuit breaker
 */
export async function createCircuitBreaker(params: {
  organizationId: string;
  name: string;
  description?: string;
  target: CircuitBreakerTarget;
  config?: Partial<CircuitBreakerConfig>;
  retryPolicy?: Partial<RetryPolicy>;
  bulkhead?: BulkheadConfig;
  createdBy: string;
}): Promise<CircuitBreaker> {
  const now = new Date().toISOString();

  const breaker: CircuitBreaker = {
    id: `cb_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    target: params.target,
    state: "closed",
    config: {
      failureThreshold: 5,
      successThreshold: 3,
      timeoutSeconds: 30,
      halfOpenMaxRequests: 3,
      windowSizeSeconds: 60,
      volumeThreshold: 10,
      sleepWindowSeconds: 30,
      forceOpen: false,
      forceClosed: false,
      failureTypes: ["timeout", "error-response", "network", "overload"],
      slowCallThresholdMs: 5000,
      slowCallRateThreshold: 0.5,
      ...params.config,
    },
    metrics: {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      timeoutRequests: 0,
      slowRequests: 0,
      successRate: 100,
      failureRate: 0,
      averageLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      requestsInWindow: 0,
      failuresInWindow: 0,
      uptimePercent: 100,
    },
    failureTracking: {
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      failuresByType: {},
      recentFailures: [],
    },
    retryPolicy: {
      enabled: true,
      maxRetries: 3,
      strategy: "exponential-backoff",
      baseDelayMs: 100,
      maxDelayMs: 10000,
      jitterFactor: 0.25,
      retryableStatusCodes: [429, 500, 502, 503, 504],
      retryableExceptions: ["TimeoutError", "NetworkError", "OverloadError"],
      timeout: 30000,
      exponentialBase: 2,
      ...params.retryPolicy,
    },
    bulkhead: params.bulkhead,
    lastStateChange: now,
    stateHistory: [],
    createdAt: now,
    updatedAt: now,
  };

  breakers.set(breaker.id, breaker);
  executions.set(breaker.id, []);
  return breaker;
}

/**
 * Execute a request through the circuit breaker
 */
export async function executeWithCircuitBreaker(params: {
  circuitBreakerId: string;
  executeFn: () => Promise<{ success: boolean; latencyMs: number; statusCode?: number; error?: string }>;
}): Promise<CircuitBreakerExecution> {
  const breaker = breakers.get(params.circuitBreakerId);
  if (!breaker) throw new Error(`Circuit breaker ${params.circuitBreakerId} not found`);

  // Check bulkhead
  if (breaker.bulkhead) {
    const status = checkBulkhead(breaker);
    if (status === "rejected") {
      return recordExecution(breaker, { status: "rejected", latencyMs: 0, retryCount: 0, error: { type: "overload", message: "Bulkhead full — request rejected" } });
    }
  }

  // Check circuit state
  if (breaker.state === "open" && !breaker.config.forceClosed) {
    const timeSinceOpen = (Date.now() - new Date(breaker.lastStateChange).getTime()) / 1000;
    if (timeSinceOpen < breaker.config.sleepWindowSeconds) {
      return recordExecution(breaker, { status: "rejected", latencyMs: 0, retryCount: 0, error: { type: "overload", message: "Circuit is open — request rejected" } });
    }
    // Transition to half-open
    transitionState(breaker, "half-open", "Sleep window elapsed — testing with half-open");
  }

  if (breaker.config.forceOpen && !breaker.config.forceClosed) {
    return recordExecution(breaker, { status: "rejected", latencyMs: 0, retryCount: 0, error: { type: "overload", message: "Circuit forced open" } });
  }

  // Execute with retries
  let lastError: { type: FailureType; message: string; statusCode?: number } | undefined;
  let retryCount = 0;
  const maxAttempts = breaker.retryPolicy.enabled ? breaker.retryPolicy.maxRetries + 1 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      retryCount = attempt;
      const delay = calculateRetryDelay(breaker.retryPolicy, attempt);
      await new Promise(r => setTimeout(r, Math.min(delay, 50))); // Capped for simulation
    }

    try {
      const result = await executeWithTimeout(params.executeFn, breaker.config.timeoutSeconds * 1000);

      if (result.success) {
        recordSuccess(breaker, result.latencyMs);
        return recordExecution(breaker, { status: "success", latencyMs: result.latencyMs, retryCount });
      } else {
        const failureType = classifyFailure(result.statusCode, result.error);
        lastError = { type: failureType, message: result.error ?? "Unknown error", statusCode: result.statusCode };

        if (isRetryable(breaker.retryPolicy, failureType, result.statusCode) && attempt < maxAttempts - 1) {
          continue;
        }

        recordFailure(breaker, failureType, result.latencyMs, result.error ?? "Unknown error", result.statusCode);
        return recordExecution(breaker, { status: "failure", latencyMs: result.latencyMs, retryCount, error: lastError });
      }
    } catch (error) {
      const failureType: FailureType = error instanceof Error && error.message.includes("timeout") ? "timeout" : "unknown";
      lastError = { type: failureType, message: error instanceof Error ? error.message : String(error) };
      recordFailure(breaker, failureType, 0, lastError.message);

      if (!isRetryable(breaker.retryPolicy, failureType) || attempt >= maxAttempts - 1) {
        return recordExecution(breaker, { status: "failure", latencyMs: 0, retryCount, error: lastError });
      }
    }
  }

  return recordExecution(breaker, { status: "failure", latencyMs: 0, retryCount, error: lastError ?? { type: "unknown", message: "Max retries exceeded" } });
}

/**
 * Get circuit breaker by ID
 */
export async function getCircuitBreaker(breakerId: string): Promise<CircuitBreaker | null> {
  return breakers.get(breakerId) ?? null;
}

/**
 * List circuit breakers
 */
export async function listCircuitBreakers(
  organizationId: string,
  filters?: { state?: CircuitState; limit?: number },
): Promise<CircuitBreaker[]> {
  let result = Array.from(breakers.values()).filter(b => b.organizationId === organizationId);
  if (filters?.state) result = result.filter(b => b.state === filters.state);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, filters?.limit ?? 50);
}

/**
 * Force circuit breaker state
 */
export async function forceCircuitBreakerState(breakerId: string, state: CircuitState): Promise<CircuitBreaker | null> {
  const breaker = breakers.get(breakerId);
  if (!breaker) return null;

  if (state === "open") breaker.config.forceOpen = true;
  else if (state === "closed") { breaker.config.forceOpen = false; breaker.config.forceClosed = true; }
  else breaker.config.forceOpen = false;

  transitionState(breaker, state, `Forced to ${state} state`);
  return breaker;
}

/**
 * Reset circuit breaker metrics
 */
export async function resetCircuitBreaker(breakerId: string): Promise<CircuitBreaker | null> {
  const breaker = breakers.get(breakerId);
  if (!breaker) return null;

  breaker.metrics = { totalRequests: 0, successfulRequests: 0, failedRequests: 0, rejectedRequests: 0, timeoutRequests: 0, slowRequests: 0, successRate: 100, failureRate: 0, averageLatencyMs: 0, p95LatencyMs: 0, p99LatencyMs: 0, requestsInWindow: 0, failuresInWindow: 0, uptimePercent: 100 };
  breaker.failureTracking = { consecutiveFailures: 0, consecutiveSuccesses: 0, totalFailures: 0, totalSuccesses: 0, failuresByType: {}, recentFailures: [] };
  breaker.state = "closed";
  breaker.config.forceOpen = false;
  breaker.config.forceClosed = false;
  breaker.lastStateChange = new Date().toISOString();
  breaker.updatedAt = breaker.lastStateChange;
  executions.set(breakerId, []);
  breakers.set(breakerId, breaker);
  return breaker;
}

/**
 * Get fault tolerance statistics
 */
export async function getFaultToleranceStats(organizationId: string): Promise<FaultToleranceStats> {
  const all = Array.from(breakers.values()).filter(b => b.organizationId === organizationId);

  let totalRequests = 0;
  let totalFailures = 0;
  let totalRetries = 0;
  let totalRejections = 0;
  let totalSuccessRate = 0;
  let totalLatency = 0;
  const failureTypes: Record<string, number> = {};
  const tripCounts: Record<string, number> = {};

  for (const b of all) {
    totalRequests += b.metrics.totalRequests;
    totalFailures += b.metrics.failedRequests;
    totalRejections += b.metrics.rejectedRequests;
    totalSuccessRate += b.metrics.successRate;
    totalLatency += b.metrics.averageLatencyMs;

    for (const [type, count] of Object.entries(b.failureTracking.failuresByType)) {
      failureTypes[type] = (failureTypes[type] || 0) + count;
    }

    const trips = b.stateHistory.filter(h => h.to === "open").length;
    if (trips > 0) tripCounts[b.name] = trips;

    const execs = executions.get(b.id) ?? [];
    totalRetries += execs.reduce((s, e) => s + e.retryCount, 0);
  }

  return {
    totalCircuitBreakers: all.length,
    openCircuits: all.filter(b => b.state === "open").length,
    halfOpenCircuits: all.filter(b => b.state === "half-open").length,
    closedCircuits: all.filter(b => b.state === "closed").length,
    totalRequests,
    totalFailures,
    totalRetries,
    totalRejections,
    averageSuccessRate: all.length > 0 ? Math.round(totalSuccessRate / all.length * 100) / 100 : 0,
    averageLatencyMs: all.length > 0 ? Math.round(totalLatency / all.length * 100) / 100 : 0,
    topFailureTypes: failureTypes,
    mostTrippedBreakers: Object.entries(tripCounts).map(([name, count]) => ({ name, tripCount: count })).sort((a, b) => b.tripCount - a.tripCount).slice(0, 5),
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

function recordSuccess(breaker: CircuitBreaker, latencyMs: number): void {
  breaker.metrics.totalRequests++;
  breaker.metrics.successfulRequests++;
  breaker.metrics.requestsInWindow++;
  breaker.metrics.successRate = Math.round((breaker.metrics.successfulRequests / breaker.metrics.totalRequests) * 10000) / 100;
  breaker.metrics.failureRate = 100 - breaker.metrics.successRate;
  breaker.metrics.averageLatencyMs = Math.round((breaker.metrics.averageLatencyMs * (breaker.metrics.totalRequests - 1) + latencyMs) / breaker.metrics.totalRequests * 100) / 100;
  breaker.metrics.lastSuccessAt = new Date().toISOString();
  breaker.failureTracking.consecutiveSuccesses++;
  breaker.failureTracking.consecutiveFailures = 0;
  breaker.failureTracking.totalSuccesses++;

  if (latencyMs > breaker.config.slowCallThresholdMs) breaker.metrics.slowRequests++;

  if (breaker.state === "half-open" && breaker.failureTracking.consecutiveSuccesses >= breaker.config.successThreshold) {
    transitionState(breaker, "closed", `Success threshold reached (${breaker.config.successThreshold} consecutive successes)`);
  }

  breaker.updatedAt = new Date().toISOString();
  breakers.set(breaker.id, breaker);
}

function recordFailure(breaker: CircuitBreaker, type: FailureType, latencyMs: number, message: string, statusCode?: number): void {
  breaker.metrics.totalRequests++;
  breaker.metrics.failedRequests++;
  breaker.metrics.requestsInWindow++;
  breaker.metrics.failuresInWindow++;
  breaker.metrics.successRate = Math.round((breaker.metrics.successfulRequests / breaker.metrics.totalRequests) * 10000) / 100;
  breaker.metrics.failureRate = 100 - breaker.metrics.successRate;
  breaker.metrics.lastFailureAt = new Date().toISOString();
  breaker.failureTracking.consecutiveFailures++;
  breaker.failureTracking.consecutiveSuccesses = 0;
  breaker.failureTracking.totalFailures++;
  breaker.failureTracking.failuresByType[type] = (breaker.failureTracking.failuresByType[type] || 0) + 1;

  if (type === "timeout") breaker.metrics.timeoutRequests++;

  const failure: FailureEvent = {
    id: `fe_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    timestamp: new Date().toISOString(),
    type,
    message,
    statusCode,
    latencyMs,
    retryCount: 0,
  };
  breaker.failureTracking.recentFailures.push(failure);
  if (breaker.failureTracking.recentFailures.length > 50) breaker.failureTracking.recentFailures.shift();
  if (!breaker.failureTracking.firstFailureAt) breaker.failureTracking.firstFailureAt = failure.timestamp;
  breaker.failureTracking.lastFailureAt = failure.timestamp;

  // Check if circuit should open
  if (breaker.state === "closed" && breaker.metrics.failuresInWindow >= breaker.config.failureThreshold && breaker.metrics.requestsInWindow >= breaker.config.volumeThreshold) {
    transitionState(breaker, "open", `Failure threshold reached (${breaker.metrics.failuresInWindow} failures in window)`);
  } else if (breaker.state === "half-open") {
    transitionState(breaker, "open", "Failure during half-open state");
  }

  breaker.updatedAt = new Date().toISOString();
  breakers.set(breaker.id, breaker);
}

function recordExecution(breaker: CircuitBreaker, result: { status: CircuitBreakerExecution["status"]; latencyMs: number; retryCount: number; error?: CircuitBreakerExecution["error"] }): CircuitBreakerExecution {
  const execution: CircuitBreakerExecution = {
    id: `cbe_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    circuitBreakerId: breaker.id,
    status: result.status,
    circuitState: breaker.state,
    latencyMs: result.latencyMs,
    retryCount: result.retryCount,
    error: result.error,
    timestamp: new Date().toISOString(),
  };

  if (result.status === "rejected") {
    breaker.metrics.rejectedRequests++;
    breaker.updatedAt = new Date().toISOString();
    breakers.set(breaker.id, breaker);
  }

  const execs = executions.get(breaker.id) ?? [];
  execs.push(execution);
  if (execs.length > 200) execs.shift();
  executions.set(breaker.id, execs);
  return execution;
}

function transitionState(breaker: CircuitBreaker, newState: CircuitState, reason: string): void {
  const change: StateChange = {
    from: breaker.state,
    to: newState,
    reason,
    timestamp: new Date().toISOString(),
    metrics: { failures: breaker.metrics.failuresInWindow, successes: breaker.metrics.successfulRequests, rate: breaker.metrics.failureRate },
  };

  breaker.stateHistory.push(change);
  if (breaker.stateHistory.length > 100) breaker.stateHistory.shift();
  breaker.state = newState;
  breaker.lastStateChange = change.timestamp;

  if (newState === "closed") {
    breaker.metrics.failuresInWindow = 0;
    breaker.metrics.requestsInWindow = 0;
    breaker.failureTracking.consecutiveFailures = 0;
  }

  breaker.updatedAt = change.timestamp;
  breakers.set(breaker.id, breaker);
}

function checkBulkhead(breaker: CircuitBreaker): BulkheadStatus {
  if (!breaker.bulkhead) return "healthy";
  const execs = executions.get(breaker.id) ?? [];
  const recentExecs = execs.filter(e => Date.now() - new Date(e.timestamp).getTime() < 1000);
  const activeRequests = recentExecs.filter(e => e.status !== "rejected").length;

  if (activeRequests >= breaker.bulkhead.maxConcurrentRequests + breaker.bulkhead.maxQueueSize) return "rejected";
  if (activeRequests >= breaker.bulkhead.maxConcurrentRequests) return "saturated";
  if (activeRequests >= breaker.bulkhead.maxConcurrentRequests * 0.8) return "degraded";
  return "healthy";
}

function calculateRetryDelay(policy: RetryPolicy, attempt: number): number {
  let delay: number;
  switch (policy.strategy) {
    case "exponential-backoff":
      delay = policy.baseDelayMs * Math.pow(policy.exponentialBase, attempt);
      break;
    case "linear":
      delay = policy.baseDelayMs * (attempt + 1);
      break;
    case "fixed":
      delay = policy.baseDelayMs;
      break;
    case "fibonacci": {
      const fib = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
      delay = policy.baseDelayMs * (fib[Math.min(attempt, fib.length - 1)] ?? 55);
      break;
    }
    case "decorrelated-jitter":
      delay = Math.min(policy.maxDelayMs, policy.baseDelayMs * Math.pow(2, attempt) + _rng.next() * policy.baseDelayMs);
      break;
    default:
      delay = policy.baseDelayMs * Math.pow(2, attempt);
  }

  // Apply jitter
  const jitter = delay * policy.jitterFactor * (_rng.next() * 2 - 1);
  return Math.min(policy.maxDelayMs, Math.max(0, delay + jitter));
}

function classifyFailure(statusCode?: number, error?: string): FailureType {
  if (statusCode === 429) return "rate-limit";
  if (statusCode === 408 || statusCode === 504) return "timeout";
  if (statusCode === 503) return "overload";
  if (statusCode && statusCode >= 500) return "error-response";
  if (error?.includes("timeout") || error?.includes("Timeout")) return "timeout";
  if (error?.includes("network") || error?.includes("ECONNREFUSED")) return "network";
  if (error?.includes("model")) return "model-error";
  return "unknown";
}

function isRetryable(policy: RetryPolicy, type: FailureType, statusCode?: number): boolean {
  if (statusCode && policy.retryableStatusCodes.includes(statusCode)) return true;
  return ["timeout", "network", "rate-limit", "overload"].includes(type);
}

async function executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), Math.min(timeoutMs, 200))),
  ]);
}
