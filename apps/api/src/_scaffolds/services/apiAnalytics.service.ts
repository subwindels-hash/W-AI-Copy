/**
 * API Analytics Service (Module 23 — Gap 2)
 *
 * API usage analytics and monitoring:
 * - API call tracking (count, latency, errors)
 * - Endpoint popularity tracking
 * - API key usage tracking
 * - Latency percentiles (p50, p95, p99)
 * - Error rate tracking
 * - Time-series analytics
 * - API usage dashboards
 *
 * Provides comprehensive API usage analytics.
 */
import { logger } from "../../config/logger.js";
import { Metrics } from "../../observability/metrics.js";
import { redisCmd } from "../../db/redis.js";

// ─── Types ──────────────────────────────────────────────────────

export interface APIAnalytics {
  timestamp: string;
  apiKeyId?: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  bytesTransferred: number;
  userAgent?: string;
  ip: string;
}

export interface APIEndpointStats {
  method: string;
  path: string;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  bytesTransferred: number;
  lastCalledAt: string;
}

export interface APIKeyStats {
  apiKeyId: string;
  apiKeyName: string;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  avgLatencyMs: number;
  bytesTransferred: number;
  topEndpoints: Array<{ method: string; path: string; calls: number }>;
  lastUsedAt: string;
}

export interface APIAnalyticsSummary {
  totalCalls: number;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  bytesTransferred: number;
  topEndpoints: Array<{ method: string; path: string; calls: number }>;
  topAPIKeys: Array<{ apiKeyId: string; apiKeyName: string; calls: number }>;
  errorRate: number;
  callsPerMinute: number;
  callsPerHour: number;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const API_ANALYTICS_KEY = (timestamp: string) => `api:analytics:${timestamp}`;
const API_ENDPOINT_STATS_KEY = "api:analytics:endpoints";
const API_KEY_STATS_KEY = "api:analytics:keys";
const API_ANALYTICS_SUMMARY_KEY = "api:analytics:summary";

// ─── Analytics Tracking ─────────────────────────────────────────

/**
 * Track API call
 */
export async function trackAPICall(analytics: APIAnalytics): Promise<void> {
  const timestamp = new Date().toISOString();

  // Store analytics event
  const hourKey = timestamp.slice(0, 13); // YYYY-MM-DDTHH
  await redisCmd.lpush(API_ANALYTICS_KEY(hourKey), JSON.stringify(analytics));
  await redisCmd.ltrim(API_ANALYTICS_KEY(hourKey), 0, 9999); // Keep last 10000 per hour
  await redisCmd.expire(API_ANALYTICS_KEY(hourKey), 86400 * 7); // 7 days

  // Update endpoint stats
  await updateEndpointStats(analytics);

  // Update API key stats
  if (analytics.apiKeyId) {
    await updateAPIKeyStats(analytics);
  }

  // Update metrics
  Metrics.increment("api.calls.total", 1, {
    method: analytics.method,
    path: analytics.path,
    status: String(analytics.statusCode),
  });

  Metrics.timing("api.latency", analytics.latencyMs, {
    method: analytics.method,
    path: analytics.path,
  });

  if (analytics.statusCode >= 400) {
    Metrics.increment("api.errors", 1, {
      method: analytics.method,
      path: analytics.path,
      status: String(analytics.statusCode),
    });
  }
}

/**
 * Update endpoint statistics
 */
async function updateEndpointStats(analytics: APIAnalytics): Promise<void> {
  const key = `${analytics.method}:${analytics.path}`;
  const statsKey = `${API_ENDPOINT_STATS_KEY}:${key}`;

  const data = await redisCmd.get(statsKey);
  let stats: any = data
    ? JSON.parse(data)
    : {
        method: analytics.method,
        path: analytics.path,
        totalCalls: 0,
        successCalls: 0,
        errorCalls: 0,
        totalLatencyMs: 0,
        latencies: [],
        bytesTransferred: 0,
        lastCalledAt: analytics.timestamp,
      };

  stats.totalCalls++;
  if (analytics.statusCode < 400) {
    stats.successCalls++;
  } else {
    stats.errorCalls++;
  }
  stats.totalLatencyMs += analytics.latencyMs;
  stats.bytesTransferred += analytics.bytesTransferred;
  stats.lastCalledAt = analytics.timestamp;

  // Keep last 1000 latencies for percentile calculation
  stats.latencies.push(analytics.latencyMs);
  if (stats.latencies.length > 1000) {
    stats.latencies = stats.latencies.slice(-1000);
  }

  await redisCmd.set(statsKey, JSON.stringify(stats));
  await redisCmd.expire(statsKey, 86400 * 30); // 30 days
}

/**
 * Update API key statistics
 */
async function updateAPIKeyStats(analytics: APIAnalytics): Promise<void> {
  const statsKey = `${API_KEY_STATS_KEY}:${analytics.apiKeyId}`;

  const data = await redisCmd.get(statsKey);
  let stats: any = data
    ? JSON.parse(data)
    : {
        apiKeyId: analytics.apiKeyId,
        totalCalls: 0,
        successCalls: 0,
        errorCalls: 0,
        totalLatencyMs: 0,
        bytesTransferred: 0,
        endpoints: {},
        lastUsedAt: analytics.timestamp,
      };

  stats.totalCalls++;
  if (analytics.statusCode < 400) {
    stats.successCalls++;
  } else {
    stats.errorCalls++;
  }
  stats.totalLatencyMs += analytics.latencyMs;
  stats.bytesTransferred += analytics.bytesTransferred;
  stats.lastUsedAt = analytics.timestamp;

  // Track endpoint usage
  const endpointKey = `${analytics.method}:${analytics.path}`;
  stats.endpoints[endpointKey] = (stats.endpoints[endpointKey] || 0) + 1;

  await redisCmd.set(statsKey, JSON.stringify(stats));
  await redisCmd.expire(statsKey, 86400 * 30); // 30 days
}

// ─── Analytics Queries ──────────────────────────────────────────

/**
 * Get endpoint statistics
 */
export async function getEndpointStats(
  method?: string,
  path?: string,
): Promise<APIEndpointStats[]> {
  const keys = await redisCmd.keys(`${API_ENDPOINT_STATS_KEY}:*`);
  const stats: APIEndpointStats[] = [];

  for (const key of keys) {
    const data = await redisCmd.get(key);
    if (!data) continue;

    const rawStats = JSON.parse(data);

    if (method && rawStats.method !== method) continue;
    if (path && rawStats.path !== path) continue;

    // Calculate percentiles
    const latencies = rawStats.latencies.sort((a: number, b: number) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

    stats.push({
      method: rawStats.method,
      path: rawStats.path,
      totalCalls: rawStats.totalCalls,
      successCalls: rawStats.successCalls,
      errorCalls: rawStats.errorCalls,
      avgLatencyMs: rawStats.totalCalls > 0 ? rawStats.totalLatencyMs / rawStats.totalCalls : 0,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      bytesTransferred: rawStats.bytesTransferred,
      lastCalledAt: rawStats.lastCalledAt,
    });
  }

  // Sort by total calls (descending)
  return stats.sort((a, b) => b.totalCalls - a.totalCalls);
}

/**
 * Get API key statistics
 */
export async function getAPIKeyStats(apiKeyId?: string): Promise<APIKeyStats[]> {
  const pattern = apiKeyId
    ? `${API_KEY_STATS_KEY}:${apiKeyId}`
    : `${API_KEY_STATS_KEY}:*`;

  const keys = await redisCmd.keys(pattern);
  const stats: APIKeyStats[] = [];

  for (const key of keys) {
    const data = await redisCmd.get(key);
    if (!data) continue;

    const rawStats = JSON.parse(data);

    // Get top endpoints
    const topEndpoints = Object.entries(rawStats.endpoints)
      .map(([endpoint, calls]) => {
        const [method, path] = endpoint.split(":");
        return { method, path, calls: calls as number };
      })
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 10);

    stats.push({
      apiKeyId: rawStats.apiKeyId,
      apiKeyName: rawStats.apiKeyName || "Unknown",
      totalCalls: rawStats.totalCalls,
      successCalls: rawStats.successCalls,
      errorCalls: rawStats.errorCalls,
      avgLatencyMs: rawStats.totalCalls > 0 ? rawStats.totalLatencyMs / rawStats.totalCalls : 0,
      bytesTransferred: rawStats.bytesTransferred,
      topEndpoints,
      lastUsedAt: rawStats.lastUsedAt,
    });
  }

  // Sort by total calls (descending)
  return stats.sort((a, b) => b.totalCalls - a.totalCalls);
}

/**
 * Get API analytics summary
 */
export async function getAPIAnalyticsSummary(): Promise<APIAnalyticsSummary> {
  const endpointStats = await getEndpointStats();
  const apiKeyStats = await getAPIKeyStats();

  const totalCalls = endpointStats.reduce((sum, s) => sum + s.totalCalls, 0);
  const successCalls = endpointStats.reduce((sum, s) => sum + s.successCalls, 0);
  const errorCalls = endpointStats.reduce((sum, s) => sum + s.errorCalls, 0);
  const totalLatencyMs = endpointStats.reduce((sum, s) => sum + s.avgLatencyMs * s.totalCalls, 0);
  const bytesTransferred = endpointStats.reduce((sum, s) => sum + s.bytesTransferred, 0);

  // Calculate p95 latency
  const allLatencies = endpointStats.flatMap((s) => [s.p50LatencyMs, s.p95LatencyMs, s.p99LatencyMs]);
  const p95LatencyMs = allLatencies.length > 0 ? Math.max(...allLatencies) : 0;

  // Top endpoints
  const topEndpoints = endpointStats
    .slice(0, 10)
    .map((s) => ({ method: s.method, path: s.path, calls: s.totalCalls }));

  // Top API keys
  const topAPIKeys = apiKeyStats
    .slice(0, 10)
    .map((s) => ({ apiKeyId: s.apiKeyId, apiKeyName: s.apiKeyName, calls: s.totalCalls }));

  return {
    totalCalls,
    successRate: totalCalls > 0 ? (successCalls / totalCalls) * 100 : 0,
    avgLatencyMs: totalCalls > 0 ? totalLatencyMs / totalCalls : 0,
    p95LatencyMs,
    bytesTransferred,
    topEndpoints,
    topAPIKeys,
    errorRate: totalCalls > 0 ? (errorCalls / totalCalls) * 100 : 0,
    callsPerMinute: totalCalls / (24 * 60), // Assuming 24 hours
    callsPerHour: totalCalls / 24,
  };
}

/**
 * Get time-series analytics
 */
export async function getTimeSeriesAnalytics(
  hours: number = 24,
): Promise<Array<{ timestamp: string; calls: number; errors: number; avgLatencyMs: number }>> {
  const now = new Date();
  const timeSeries: Array<{ timestamp: string; calls: number; errors: number; avgLatencyMs: number }> = [];

  for (let i = hours - 1; i >= 0; i--) {
    const hour = new Date(now.getTime() - i * 3600000);
    const hourKey = hour.toISOString().slice(0, 13); // YYYY-MM-DDTHH

    const data = await redisCmd.lrange(API_ANALYTICS_KEY(hourKey), 0, -1);
    const analytics = data.map((d) => JSON.parse(d) as APIAnalytics);

    const calls = analytics.length;
    const errors = analytics.filter((a) => a.statusCode >= 400).length;
    const avgLatencyMs = calls > 0 ? analytics.reduce((sum, a) => sum + a.latencyMs, 0) / calls : 0;

    timeSeries.push({
      timestamp: hour.toISOString(),
      calls,
      errors,
      avgLatencyMs,
    });
  }

  return timeSeries;
}

// ─── Express Middleware ─────────────────────────────────────────

/**
 * Express middleware for API analytics tracking
 */
export function apiAnalyticsMiddleware() {
  return async (req: any, res: any, next: any) => {
    const startTime = Date.now();
    const originalEnd = res.end;

    // Override res.end to capture response
    res.end = function (chunk: any, encoding?: any, callback?: any) {
      const latencyMs = Date.now() - startTime;
      const bytesTransferred = chunk ? Buffer.byteLength(chunk, encoding) : 0;

      // Track API call
      const analytics: APIAnalytics = {
        timestamp: new Date().toISOString(),
        apiKeyId: req.apiKey?.id,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        latencyMs,
        bytesTransferred,
        userAgent: req.get("user-agent"),
        ip: req.ip,
      };

      // Track asynchronously
      trackAPICall(analytics).catch((error) => {
        logger.error("Failed to track API call", { error: (error as Error).message });
      });

      // Call original end
      return originalEnd.call(this, chunk, encoding, callback);
    };

    next();
  };
}
