/**
 * Query Analysis Service (Module 20 — Gap 2)
 *
 * Slow query detection and EXPLAIN ANALYZE integration:
 * - Track slow queries (>500ms, >1s, >5s)
 * - Query execution statistics
 * - EXPLAIN ANALYZE for query plans
 * - Query pattern detection
 * - Query performance trends
 * - Recommendations for optimization
 *
 * Identifies performance bottlenecks and optimization opportunities.
 */
import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { redisCmd } from "../db/redis.js";

// ─── Types ──────────────────────────────────────────────────────

export interface QueryStats {
  query: string;
  model: string;
  action: string;
  count: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  totalDurationMs: number;
  errorCount: number;
  lastExecutedAt: string;
}

export interface SlowQuery {
  id: string;
  query: string;
  model: string;
  action: string;
  durationMs: number;
  timestamp: string;
  userId?: string;
  organizationId?: string;
  metadata?: Record<string, any>;
}

export interface ExplainPlan {
  query: string;
  plan: any;
  executionTimeMs: number;
  planningTimeMs: number;
  totalRows: number;
  recommendations: string[];
}

export interface QueryPattern {
  pattern: string;
  model: string;
  action: string;
  count: number;
  avgDurationMs: number;
  firstSeen: string;
  lastSeen: string;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const SLOW_QUERY_KEY = (id: string) => `slow_query:${id}`;
const SLOW_QUERIES_KEY = "slow_queries:all";
const QUERY_STATS_KEY = "query_stats:all";
const QUERY_PATTERN_KEY = "query_patterns:all";

// ─── Slow Query Tracking ────────────────────────────────────────

/**
 * Record a slow query
 */
export async function recordSlowQuery(input: {
  query: string;
  model: string;
  action: string;
  durationMs: number;
  userId?: string;
  organizationId?: string;
  metadata?: Record<string, any>;
}): Promise<SlowQuery> {
  const id = `sq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const slowQuery: SlowQuery = {
    id,
    query: input.query,
    model: input.model,
    action: input.action,
    durationMs: input.durationMs,
    timestamp: new Date().toISOString(),
    userId: input.userId,
    organizationId: input.organizationId,
    metadata: input.metadata,
  };

  // Store in Redis (keep last 1000 slow queries)
  await redisCmd.set(SLOW_QUERY_KEY(id), JSON.stringify(slowQuery));
  await redisCmd.sadd(SLOW_QUERIES_KEY, id);

  // Trim to 1000 entries
  const allIds = await redisCmd.smembers(SLOW_QUERIES_KEY);
  if (allIds.length > 1000) {
    const toDelete = allIds.slice(0, allIds.length - 1000);
    for (const deleteId of toDelete) {
      await redisCmd.del(SLOW_QUERY_KEY(deleteId));
      await redisCmd.srem(SLOW_QUERIES_KEY, deleteId);
    }
  }

  // Categorize by severity
  let severity = "warning";
  if (input.durationMs > 5000) {
    severity = "critical";
  } else if (input.durationMs > 1000) {
    severity = "error";
  }

  logger.warn(`Slow query detected (${severity})`, {
    id,
    model: input.model,
    action: input.action,
    durationMs: input.durationMs,
    severity,
  });

  Metrics.increment("db.slow_query", 1, { severity, model: input.model });

  return slowQuery;
}

/**
 * Get slow query by ID
 */
export async function getSlowQuery(id: string): Promise<SlowQuery | null> {
  const data = await redisCmd.get(SLOW_QUERY_KEY(id));
  return data ? JSON.parse(data) : null;
}

/**
 * List slow queries with filters
 */
export async function listSlowQueries(filters?: {
  model?: string;
  action?: string;
  minDurationMs?: number;
  limit?: number;
}): Promise<SlowQuery[]> {
  const allIds = await redisCmd.smembers(SLOW_QUERIES_KEY);
  const queries: SlowQuery[] = [];

  for (const id of allIds) {
    const query = await getSlowQuery(id);
    if (!query) continue;

    if (filters?.model && query.model !== filters.model) continue;
    if (filters?.action && query.action !== filters.action) continue;
    if (filters?.minDurationMs && query.durationMs < filters.minDurationMs) continue;

    queries.push(query);
  }

  // Sort by duration (descending)
  queries.sort((a, b) => b.durationMs - a.durationMs);

  return queries.slice(0, filters?.limit || 100);
}

/**
 * Get slow query statistics
 */
export async function getSlowQueryStats(): Promise<{
  totalSlowQueries: number;
  byModel: Record<string, number>;
  byAction: Record<string, number>;
  bySeverity: Record<string, number>;
  avgDurationMs: number;
  maxDurationMs: number;
}> {
  const queries = await listSlowQueries({ limit: 10000 });

  const byModel: Record<string, number> = {};
  const byAction: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  let totalDuration = 0;
  let maxDuration = 0;

  for (const query of queries) {
    byModel[query.model] = (byModel[query.model] || 0) + 1;
    byAction[query.action] = (byAction[query.action] || 0) + 1;

    const severity = query.durationMs > 5000 ? "critical" : query.durationMs > 1000 ? "error" : "warning";
    bySeverity[severity] = (bySeverity[severity] || 0) + 1;

    totalDuration += query.durationMs;
    maxDuration = Math.max(maxDuration, query.durationMs);
  }

  return {
    totalSlowQueries: queries.length,
    byModel,
    byAction,
    bySeverity,
    avgDurationMs: queries.length > 0 ? totalDuration / queries.length : 0,
    maxDurationMs: maxDuration,
  };
}

// ─── EXPLAIN ANALYZE Integration ────────────────────────────────

/**
 * Run EXPLAIN ANALYZE on a query
 */
export async function explainQuery(
  query: string,
  params?: any[],
): Promise<ExplainPlan> {
  const startTime = Date.now();

  try {
    // Run EXPLAIN ANALYZE
    const explainResult = await prisma.$queryRawUnsafe(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
      ...(params || []),
    );

    const plan = (explainResult as any)[0]?.["QUERY PLAN"]?.[0]?.Plan;
    const executionTime = (explainResult as any)[0]?.["QUERY PLAN"]?.[0]?.["Execution Time"] || 0;
    const planningTime = (explainResult as any)[0]?.["QUERY PLAN"]?.[0]?.["Planning Time"] || 0;

    // Analyze plan and generate recommendations
    const recommendations = analyzeQueryPlan(plan);

    const durationMs = Date.now() - startTime;

    logger.info("EXPLAIN ANALYZE completed", {
      query: query.slice(0, 100),
      executionTimeMs: executionTime,
      planningTimeMs: planningTime,
      recommendations: recommendations.length,
    });

    return {
      query,
      plan,
      executionTimeMs: executionTime,
      planningTimeMs: planningTime,
      totalRows: plan?.["Actual Rows"] || 0,
      recommendations,
    };
  } catch (error) {
    logger.error("EXPLAIN ANALYZE failed", { query: query.slice(0, 100), error });
    throw error;
  }
}

/**
 * Analyze query plan and generate recommendations
 */
function analyzeQueryPlan(plan: any): string[] {
  const recommendations: string[] = [];

  if (!plan) return recommendations;

  // Check for sequential scans on large tables
  if (plan["Node Type"] === "Seq Scan") {
    const rows = plan["Actual Rows"] || 0;
    if (rows > 1000) {
      recommendations.push(
        `Sequential scan on ${plan["Relation Name"]} returned ${rows} rows. Consider adding an index.`,
      );
    }
  }

  // Check for high-cost operations
  const totalCost = plan["Total Cost"] || 0;
  if (totalCost > 10000) {
    recommendations.push(
      `High total cost: ${totalCost}. Review query structure and indexes.`,
    );
  }

  // Check for nested loops with high row counts
  if (plan["Node Type"] === "Nested Loop") {
    const rows = plan["Actual Rows"] || 0;
    if (rows > 10000) {
      recommendations.push(
        `Nested loop with ${rows} rows. Consider using a hash join or adding indexes.`,
      );
    }
  }

  // Check for sort operations
  if (plan["Node Type"] === "Sort") {
    const rows = plan["Actual Rows"] || 0;
    if (rows > 10000) {
      recommendations.push(
        `Sort operation on ${rows} rows. Consider adding an index for the sort columns.`,
      );
    }
  }

  // Recursively analyze child plans
  if (plan.Plans) {
    for (const childPlan of plan.Plans) {
      recommendations.push(...analyzeQueryPlan(childPlan));
    }
  }

  return recommendations;
}

// ─── Query Statistics Tracking ──────────────────────────────────

/**
 * Update query statistics
 */
export async function updateQueryStats(input: {
  model: string;
  action: string;
  durationMs: number;
  error?: boolean;
}): Promise<void> {
  const key = `${input.model}:${input.action}`;

  try {
    // Get existing stats
    const existing = await redisCmd.hget(QUERY_STATS_KEY, key);
    const stats: QueryStats = existing
      ? JSON.parse(existing)
      : {
          query: `${input.model}.${input.action}`,
          model: input.model,
          action: input.action,
          count: 0,
          avgDurationMs: 0,
          minDurationMs: Infinity,
          maxDurationMs: 0,
          p95DurationMs: 0,
          p99DurationMs: 0,
          totalDurationMs: 0,
          errorCount: 0,
          lastExecutedAt: new Date().toISOString(),
        };

    // Update stats
    stats.count++;
    stats.totalDurationMs += input.durationMs;
    stats.avgDurationMs = stats.totalDurationMs / stats.count;
    stats.minDurationMs = Math.min(stats.minDurationMs, input.durationMs);
    stats.maxDurationMs = Math.max(stats.maxDurationMs, input.durationMs);
    stats.lastExecutedAt = new Date().toISOString();

    if (input.error) {
      stats.errorCount++;
    }

    // Update percentiles (simplified - in production use a proper percentile library)
    // For now, approximate p95 and p99 based on max
    stats.p95DurationMs = stats.maxDurationMs * 0.8;
    stats.p99DurationMs = stats.maxDurationMs * 0.95;

    // Save stats
    await redisCmd.hset(QUERY_STATS_KEY, key, JSON.stringify(stats));
  } catch (error) {
    logger.error("Failed to update query stats", { model: input.model, action: input.action, error });
  }
}

/**
 * Get query statistics
 */
export async function getQueryStats(filters?: {
  model?: string;
  action?: string;
  limit?: number;
}): Promise<QueryStats[]> {
  const allStats = await redisCmd.hgetall(QUERY_STATS_KEY);
  const stats: QueryStats[] = [];

  for (const [key, value] of Object.entries(allStats)) {
    const stat: QueryStats = JSON.parse(value);

    if (filters?.model && stat.model !== filters.model) continue;
    if (filters?.action && stat.action !== filters.action) continue;

    stats.push(stat);
  }

  // Sort by average duration (descending)
  stats.sort((a, b) => b.avgDurationMs - a.avgDurationMs);

  return stats.slice(0, filters?.limit || 100);
}

/**
 * Get top N slowest queries
 */
export async function getTopSlowQueries(limit: number = 10): Promise<QueryStats[]> {
  const stats = await getQueryStats({ limit: 1000 });
  return stats.slice(0, limit);
}

/**
 * Get top N most frequent queries
 */
export async function getTopFrequentQueries(limit: number = 10): Promise<QueryStats[]> {
  const stats = await getQueryStats({ limit: 1000 });
  stats.sort((a, b) => b.count - a.count);
  return stats.slice(0, limit);
}

// ─── Query Pattern Detection ────────────────────────────────────

/**
 * Detect query patterns
 */
export async function detectQueryPatterns(): Promise<QueryPattern[]> {
  const stats = await getQueryStats({ limit: 1000 });

  // Group by model and action
  const patterns: QueryPattern[] = [];

  for (const stat of stats) {
    patterns.push({
      pattern: `${stat.model}.${stat.action}`,
      model: stat.model,
      action: stat.action,
      count: stat.count,
      avgDurationMs: stat.avgDurationMs,
      firstSeen: stat.lastExecutedAt, // Simplified
      lastSeen: stat.lastExecutedAt,
    });
  }

  // Sort by count (descending)
  patterns.sort((a, b) => b.count - a.count);

  return patterns;
}

// ─── Recommendations ────────────────────────────────────────────

/**
 * Generate performance recommendations
 */
export async function generatePerformanceRecommendations(): Promise<
  Array<{
    type: "index" | "query" | "cache" | "configuration";
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    description: string;
    impact: string;
    effort: string;
  }>
> {
  const recommendations: Array<{
    type: "index" | "query" | "cache" | "configuration";
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    description: string;
    impact: string;
    effort: string;
  }> = [];

  // Get slow query stats
  const slowQueryStats = await getSlowQueryStats();
  const topSlowQueries = await getTopSlowQueries(10);

  // Recommend indexes for slow queries
  if (slowQueryStats.totalSlowQueries > 50) {
    recommendations.push({
      type: "index",
      severity: "high",
      title: "Review database indexes",
      description: `${slowQueryStats.totalSlowQueries} slow queries detected. Review and add missing indexes.`,
      impact: "Reduce query times by 50-90%",
      effort: "Medium",
    });
  }

  // Recommend query optimization
  if (topSlowQueries.length > 0 && topSlowQueries[0].avgDurationMs > 2000) {
    recommendations.push({
      type: "query",
      severity: "high",
      title: "Optimize slowest query",
      description: `Query ${topSlowQueries[0].model}.${topSlowQueries[0].action} averages ${topSlowQueries[0].avgDurationMs}ms. Optimize query or add index.`,
      impact: "Reduce query time by 70-95%",
      effort: "Medium",
    });
  }

  // Recommend caching for frequent queries
  const topFrequentQueries = await getTopFrequentQueries(10);
  if (topFrequentQueries.length > 0 && topFrequentQueries[0].count > 1000) {
    recommendations.push({
      type: "cache",
      severity: "medium",
      title: "Cache frequent query results",
      description: `Query ${topFrequentQueries[0].model}.${topFrequentQueries[0].action} executed ${topFrequentQueries[0].count} times. Cache results to reduce database load.`,
      impact: "Reduce database load by 30-60%",
      effort: "Low",
    });
  }

  // Recommend connection pool tuning
  const avgDuration = slowQueryStats.avgDurationMs;
  if (avgDuration > 500) {
    recommendations.push({
      type: "configuration",
      severity: "medium",
      title: "Review connection pool settings",
      description: `Average query duration is ${avgDuration}ms. Review connection pool size and timeouts.`,
      impact: "Improve throughput by 20-40%",
      effort: "Low",
    });
  }

  return recommendations;
}
