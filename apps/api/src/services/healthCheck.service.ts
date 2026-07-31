/**
 * Health Check Service (Module 21 — Gap 3)
 *
 * Comprehensive health checking:
 * - Liveness probes (is the service running?)
 * - Readiness probes (is the service ready to accept traffic?)
 * - Startup probes (has the service started successfully?)
 * - Dependency health (database, Redis, external services)
 * - Health check aggregation and reporting
 * - Health check history and trends
 *
 * Enables Kubernetes probes and load balancer health checks.
 */
import { prisma } from "../db/client.js";
import { redisCmd } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";

// ─── Types ──────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";
export type HealthCheckType = "liveness" | "readiness" | "startup" | "dependency";

export interface HealthCheck {
  id: string;
  name: string;
  type: HealthCheckType;
  status: HealthStatus;
  message: string;
  durationMs: number;
  timestamp: string;
  details?: Record<string, any>;
  dependencies?: DependencyHealth[];
}

export interface DependencyHealth {
  name: string;
  type: "database" | "redis" | "external_api" | "storage" | "queue";
  status: HealthStatus;
  latencyMs: number;
  message?: string;
  details?: Record<string, any>;
}

export interface HealthCheckResult {
  status: HealthStatus;
  checks: HealthCheck[];
  timestamp: string;
  durationMs: number;
  version: string;
  uptime: number;
}

export interface HealthCheckConfig {
  id: string;
  name: string;
  type: HealthCheckType;
  enabled: boolean;
  timeoutMs: number;
  intervalMs: number;
  threshold: number; // Number of failures before marking unhealthy
  check: () => Promise<{ status: HealthStatus; message: string; details?: Record<string, any> }>;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const HEALTH_CHECK_KEY = (id: string) => `health_check:${id}`;
const HEALTH_CHECKS_KEY = "health_checks:all";
const HEALTH_HISTORY_KEY = "health_history:all";
const HEALTH_STATUS_KEY = "health:status";

// ─── Health Check Registry ──────────────────────────────────────

const registeredChecks: Map<string, HealthCheckConfig> = new Map();

/**
 * Register a health check
 */
export function registerHealthCheck(config: Omit<HealthCheckConfig, "id">): HealthCheckConfig {
  const id = `check_${config.name.toLowerCase().replace(/\s+/g, "_")}`;

  const check: HealthCheckConfig = {
    id,
    ...config,
  };

  registeredChecks.set(id, check);

  logger.info("Health check registered", {
    id,
    name: config.name,
    type: config.type,
  });

  return check;
}

/**
 * Unregister a health check
 */
export function unregisterHealthCheck(id: string): boolean {
  const removed = registeredChecks.delete(id);

  if (removed) {
    logger.info("Health check unregistered", { id });
  }

  return removed;
}

/**
 * Get all registered health checks
 */
export function getRegisteredHealthChecks(): HealthCheckConfig[] {
  return Array.from(registeredChecks.values());
}

// ─── Built-in Health Checks ─────────────────────────────────────

/**
 * Register built-in health checks
 */
export function registerBuiltInHealthChecks(): void {
  // Database health check
  registerHealthCheck({
    name: "Database",
    type: "dependency",
    enabled: true,
    timeoutMs: 5000,
    intervalMs: 30000,
    threshold: 3,
    check: async () => {
      const start = Date.now();
      try {
        await prisma.$queryRaw`SELECT 1`;
        const latencyMs = Date.now() - start;

        return {
          status: latencyMs < 1000 ? "healthy" : "degraded",
          message: latencyMs < 1000 ? "Database is responsive" : "Database is slow",
          details: { latencyMs },
        };
      } catch (error) {
        return {
          status: "unhealthy",
          message: "Database connection failed",
          details: { error: (error as Error).message },
        };
      }
    },
  });

  // Redis health check
  registerHealthCheck({
    name: "Redis",
    type: "dependency",
    enabled: true,
    timeoutMs: 3000,
    intervalMs: 30000,
    threshold: 3,
    check: async () => {
      const start = Date.now();
      try {
        const result = await redisCmd.ping();
        const latencyMs = Date.now() - start;

        return {
          status: result === "PONG" && latencyMs < 500 ? "healthy" : "degraded",
          message: result === "PONG" ? "Redis is responsive" : "Redis is slow or unresponsive",
          details: { latencyMs, result },
        };
      } catch (error) {
        return {
          status: "unhealthy",
          message: "Redis connection failed",
          details: { error: (error as Error).message },
        };
      }
    },
  });

  // Memory health check
  registerHealthCheck({
    name: "Memory",
    type: "liveness",
    enabled: true,
    timeoutMs: 1000,
    intervalMs: 60000,
    threshold: 5,
    check: async () => {
      const memUsage = process.memoryUsage();
      const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      const rssMB = memUsage.rss / 1024 / 1024;

      const status =
        heapUsedPercent < 80 ? "healthy" : heapUsedPercent < 95 ? "degraded" : "unhealthy";

      return {
        status,
        message:
          status === "healthy"
            ? "Memory usage is normal"
            : status === "degraded"
            ? "Memory usage is high"
            : "Memory usage is critical",
        details: {
          heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
          heapUsedPercent: Math.round(heapUsedPercent),
          rssMB: Math.round(rssMB),
          externalMB: Math.round(memUsage.external / 1024 / 1024),
        },
      };
    },
  });

  // Event loop lag health check
  registerHealthCheck({
    name: "Event Loop",
    type: "liveness",
    enabled: true,
    timeoutMs: 1000,
    intervalMs: 30000,
    threshold: 3,
    check: async () => {
      return new Promise((resolve) => {
        const start = Date.now();
        setImmediate(() => {
          const lagMs = Date.now() - start;
          const status = lagMs < 100 ? "healthy" : lagMs < 500 ? "degraded" : "unhealthy";

          resolve({
            status,
            message:
              status === "healthy"
                ? "Event loop lag is normal"
                : status === "degraded"
                ? "Event loop lag is high"
                : "Event loop lag is critical",
            details: { lagMs },
          });
        });
      });
    },
  });

  // Uptime health check
  registerHealthCheck({
    name: "Uptime",
    type: "liveness",
    enabled: true,
    timeoutMs: 1000,
    intervalMs: 60000,
    threshold: 1,
    check: async () => {
      const uptimeSeconds = process.uptime();
      const uptimeHours = uptimeSeconds / 3600;

      return {
        status: "healthy",
        message: `Service has been running for ${uptimeHours.toFixed(2)} hours`,
        details: {
          uptimeSeconds: Math.round(uptimeSeconds),
          uptimeHours: Math.round(uptimeHours * 100) / 100,
        },
      };
    },
  });

  logger.info("Built-in health checks registered");
}

// ─── Health Check Execution ─────────────────────────────────────

/**
 * Run a single health check
 */
export async function runHealthCheck(id: string): Promise<HealthCheck> {
  const config = registeredChecks.get(id);

  if (!config) {
    throw new Error(`Health check not found: ${id}`);
  }

  if (!config.enabled) {
    return {
      id: config.id,
      name: config.name,
      type: config.type,
      status: "unknown",
      message: "Health check is disabled",
      durationMs: 0,
      timestamp: new Date().toISOString(),
    };
  }

  const start = Date.now();

  try {
    // Run check with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Health check timeout")), config.timeoutMs);
    });

    const result = await Promise.race([config.check(), timeoutPromise]);

    const durationMs = Date.now() - start;

    const healthCheck: HealthCheck = {
      id: config.id,
      name: config.name,
      type: config.type,
      status: result.status,
      message: result.message,
      durationMs,
      timestamp: new Date().toISOString(),
      details: result.details,
    };

    // Store result
    await storeHealthCheckResult(healthCheck);

    Metrics.increment("health_checks.executed", 1, {
      name: config.name,
      status: result.status,
    });

    return healthCheck;
  } catch (error) {
    const durationMs = Date.now() - start;

    const healthCheck: HealthCheck = {
      id: config.id,
      name: config.name,
      type: config.type,
      status: "unhealthy",
      message: `Health check failed: ${(error as Error).message}`,
      durationMs,
      timestamp: new Date().toISOString(),
      details: { error: (error as Error).message },
    };

    await storeHealthCheckResult(healthCheck);

    Metrics.increment("health_checks.failed", 1, { name: config.name });

    return healthCheck;
  }
}

/**
 * Run all health checks
 */
export async function runAllHealthChecks(
  type?: HealthCheckType,
): Promise<HealthCheckResult> {
  const start = Date.now();
  const checks: HealthCheck[] = [];

  const configs = Array.from(registeredChecks.values()).filter(
    (config) => !type || config.type === type,
  );

  // Run checks in parallel
  const results = await Promise.allSettled(
    configs.map((config) => runHealthCheck(config.id)),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      checks.push(result.value);
    }
  }

  // Determine overall status
  const status = determineOverallStatus(checks);

  const healthCheckResult: HealthCheckResult = {
    status,
    checks,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
    version: process.env.npm_package_version || "0.1.0",
    uptime: process.uptime(),
  };

  // Store overall status
  await redisCmd.set(HEALTH_STATUS_KEY, JSON.stringify(healthCheckResult));

  Metrics.gauge("health_status", status === "healthy" ? 1 : status === "degraded" ? 0.5 : 0);

  return healthCheckResult;
}

/**
 * Determine overall health status from checks
 */
function determineOverallStatus(checks: HealthCheck[]): HealthStatus {
  if (checks.length === 0) {
    return "unknown";
  }

  const unhealthy = checks.some((check) => check.status === "unhealthy");
  if (unhealthy) {
    return "unhealthy";
  }

  const degraded = checks.some((check) => check.status === "degraded");
  if (degraded) {
    return "degraded";
  }

  return "healthy";
}

/**
 * Store health check result
 */
async function storeHealthCheckResult(check: HealthCheck): Promise<void> {
  await redisCmd.set(HEALTH_CHECK_KEY(check.id), JSON.stringify(check));
  await redisCmd.sadd(HEALTH_CHECKS_KEY, check.id);

  // Add to history (keep last 100)
  await redisCmd.lpush(HEALTH_HISTORY_KEY, JSON.stringify(check));
  await redisCmd.ltrim(HEALTH_HISTORY_KEY, 0, 99);
}

// ─── Health Check Queries ───────────────────────────────────────

/**
 * Get current health status
 */
export async function getHealthStatus(): Promise<HealthCheckResult | null> {
  const data = await redisCmd.get(HEALTH_STATUS_KEY);
  return data ? JSON.parse(data) : null;
}

/**
 * Get health check by ID
 */
export async function getHealthCheck(id: string): Promise<HealthCheck | null> {
  const data = await redisCmd.get(HEALTH_CHECK_KEY(id));
  return data ? JSON.parse(data) : null;
}

/**
 * Get health check history
 */
export async function getHealthCheckHistory(
  id?: string,
  limit: number = 50,
): Promise<HealthCheck[]> {
  const history = await redisCmd.lrange(HEALTH_HISTORY_KEY, 0, limit - 1);
  const checks = history.map((h) => JSON.parse(h) as HealthCheck);

  if (id) {
    return checks.filter((check) => check.id === id);
  }

  return checks;
}

/**
 * Get health statistics
 */
export async function getHealthStats(): Promise<{
  totalChecks: number;
  byStatus: Record<HealthStatus, number>;
  byType: Record<HealthCheckType, number>;
  avgDurationMs: number;
  uptime: number;
  lastCheckAt?: string;
}> {
  const checks = Array.from(registeredChecks.values());
  const results = await Promise.all(checks.map((check) => getHealthCheck(check.id)));

  const byStatus: Record<string, number> = { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 };
  const byType: Record<string, number> = {};
  let totalDuration = 0;
  let durationCount = 0;
  let lastCheckAt: string | undefined;

  for (const result of results) {
    if (!result) continue;

    byStatus[result.status] = (byStatus[result.status] || 0) + 1;
    byType[result.type] = (byType[result.type] || 0) + 1;
    totalDuration += result.durationMs;
    durationCount++;

    if (!lastCheckAt || result.timestamp > lastCheckAt) {
      lastCheckAt = result.timestamp;
    }
  }

  return {
    totalChecks: checks.length,
    byStatus: byStatus as any,
    byType: byType as any,
    avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
    uptime: process.uptime(),
    lastCheckAt,
  };
}

// ─── Kubernetes Probes ──────────────────────────────────────────

/**
 * Liveness probe (is the service running?)
 */
export async function livenessProbe(): Promise<{
  status: "ok" | "error";
  message: string;
}> {
  const checks = Array.from(registeredChecks.values()).filter(
    (check) => check.type === "liveness",
  );

  for (const check of checks) {
    const result = await getHealthCheck(check.id);
    if (result && result.status === "unhealthy") {
      return {
        status: "error",
        message: `Liveness check failed: ${check.name} - ${result.message}`,
      };
    }
  }

  return {
    status: "ok",
    message: "Service is alive",
  };
}

/**
 * Readiness probe (is the service ready to accept traffic?)
 */
export async function readinessProbe(): Promise<{
  status: "ok" | "error";
  message: string;
  details?: Record<string, any>;
}> {
  const result = await runAllHealthChecks("readiness");

  if (result.status === "unhealthy") {
    return {
      status: "error",
      message: "Service is not ready",
      details: {
        checks: result.checks.filter((check) => check.status === "unhealthy"),
      },
    };
  }

  // Check dependencies
  const dependencyChecks = result.checks.filter((check) => check.type === "dependency");
  const unhealthyDeps = dependencyChecks.filter((check) => check.status === "unhealthy");

  if (unhealthyDeps.length > 0) {
    return {
      status: "error",
      message: "Service dependencies are unhealthy",
      details: {
        unhealthyDependencies: unhealthyDeps,
      },
    };
  }

  return {
    status: "ok",
    message: "Service is ready",
  };
}

/**
 * Startup probe (has the service started successfully?)
 */
export async function startupProbe(): Promise<{
  status: "ok" | "error";
  message: string;
}> {
  const result = await runAllHealthChecks("startup");

  if (result.status === "unhealthy") {
    return {
      status: "error",
      message: "Service startup failed",
    };
  }

  return {
    status: "ok",
    message: "Service has started successfully",
  };
}

// ─── Health Check Scheduling ────────────────────────────────────

let healthCheckInterval: NodeJS.Timeout | null = null;

/**
 * Start periodic health checks
 */
export function startPeriodicHealthChecks(): void {
  if (healthCheckInterval) {
    logger.warn("Periodic health checks already running");
    return;
  }

  // Run health checks every 30 seconds
  healthCheckInterval = setInterval(async () => {
    try {
      await runAllHealthChecks();
    } catch (error) {
      logger.error("Periodic health check failed", { error: (error as Error).message });
    }
  }, 30000);

  logger.info("Periodic health checks started");
}

/**
 * Stop periodic health checks
 */
export function stopPeriodicHealthChecks(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    logger.info("Periodic health checks stopped");
  }
}
