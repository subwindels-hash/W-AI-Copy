/**
 * Log Aggregation Service (Module 21 — Gap 2)
 *
 * Centralized log storage and search:
 * - Log ingestion from multiple sources
 * - Log storage with retention policies
 * - Full-text search and filtering
 * - Log aggregation and analytics
 * - Log export and archival
 * - Log correlation with traces
 *
 * Enables historical log analysis and debugging.
 */
import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import { redisCmd } from "../db/redis.js";
import { Metrics } from "../observability/metrics.js";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:logAggregation');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  environment: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  organizationId?: string;
  requestId?: string;
  labels: Record<string, string>;
  metadata: Record<string, any>;
  source: string; // File, module, or component
  hostname?: string;
  pid?: number;
}

export interface LogQuery {
  level?: LogLevel | LogLevel[];
  service?: string;
  traceId?: string;
  userId?: string;
  organizationId?: string;
  requestId?: string;
  labels?: Record<string, string>;
  search?: string; // Full-text search
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
  orderBy?: "timestamp" | "level";
  orderDirection?: "asc" | "desc";
}

export interface LogAggregation {
  field: string;
  buckets: Array<{
    value: string;
    count: number;
  }>;
}

export interface LogStats {
  totalLogs: number;
  byLevel: Record<LogLevel, number>;
  byService: Record<string, number>;
  byHour: Array<{ hour: string; count: number }>;
  avgLogsPerMinute: number;
  topMessages: Array<{ message: string; count: number }>;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const LOG_KEY = (id: string) => `log:${id}`;
const LOGS_KEY = "logs:all";
const LOG_INDEX_KEY = "logs:index";
const LOG_RETENTION_KEY = "logs:retention";

// ─── Log Ingestion ──────────────────────────────────────────────

/**
 * Ingest a log entry
 */
export async function ingestLog(input: {
  level: LogLevel;
  message: string;
  service?: string;
  environment?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  organizationId?: string;
  requestId?: string;
  labels?: Record<string, string>;
  metadata?: Record<string, any>;
  source?: string;
  hostname?: string;
  pid?: number;
}): Promise<LogEntry> {
  const id = `log_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`;
  const timestamp = new Date().toISOString();

  const logEntry: LogEntry = {
    id,
    timestamp,
    level: input.level,
    message: input.message,
    service: input.service || "windels-api",
    environment: input.environment || process.env.NODE_ENV || "development",
    traceId: input.traceId,
    spanId: input.spanId,
    userId: input.userId,
    organizationId: input.organizationId,
    requestId: input.requestId,
    labels: input.labels || {},
    metadata: input.metadata || {},
    source: input.source || "unknown",
    hostname: input.hostname || require("os").hostname(),
    pid: input.pid || process.pid,
  };

  // Store in database
  await prisma.logEntry.create({ data: logEntry });

  // Store in Redis for fast retrieval (keep last 10000)
  await redisCmd.set(LOG_KEY(id), JSON.stringify(logEntry));
  await redisCmd.sadd(LOGS_KEY, id);
  await redisCmd.zadd(LOG_INDEX_KEY, Date.parse(timestamp), id);

  // Trim to 10000 entries
  const allIds = await redisCmd.zrange(LOG_INDEX_KEY, 0, -10001);
  if (allIds.length > 0) {
    for (const deleteId of allIds) {
      await redisCmd.del(LOG_KEY(deleteId));
      await redisCmd.srem(LOGS_KEY, deleteId);
      await redisCmd.zrem(LOG_INDEX_KEY, deleteId);
    }
  }

  Metrics.increment("logs.ingested", 1, { level: logEntry.level, service: logEntry.service });

  return logEntry;
}

/**
 * Ingest logs in bulk
 */
export async function ingestLogsBulk(
  logs: Array<{
    level: LogLevel;
    message: string;
    service?: string;
    metadata?: Record<string, any>;
  }>,
): Promise<number> {
  let ingested = 0;

  for (const log of logs) {
    try {
      await ingestLog(log);
      ingested++;
    } catch (error) {
      logger.error("Failed to ingest log", { error: (error as Error).message });
    }
  }

  logger.info("Logs ingested in bulk", { total: logs.length, ingested });

  return ingested;
}

/**
 * Ingest logs from logger ring buffer
 */
export async function ingestFromLoggerBuffer(): Promise<number> {
  const { snapshotRing } = await import("../observability/logger.js");
  const logs = snapshotRing({ limit: 1000 });

  let ingested = 0;

  for (const log of logs) {
    try {
      await ingestLog({
        level: log.level,
        message: log.msg,
        service: "windels-api",
        traceId: log.traceId,
        userId: log.userId,
        organizationId: log.orgId,
        requestId: log.requestId,
        metadata: log,
      });
      ingested++;
    } catch (error) {
      // Ignore errors to avoid infinite loop
    }
  }

  if (ingested > 0) {
    logger.info("Logs ingested from logger buffer", { ingested });
  }

  return ingested;
}

// ─── Log Queries ────────────────────────────────────────────────

/**
 * Query logs with filters
 */
export async function queryLogs(query: LogQuery): Promise<{
  logs: LogEntry[];
  total: number;
  limit: number;
  offset: number;
}> {
  const where: any = {};

  if (query.level) {
    if (Array.isArray(query.level)) {
      where.level = { in: query.level };
    } else {
      where.level = query.level;
    }
  }

  if (query.service) {
    where.service = query.service;
  }

  if (query.traceId) {
    where.traceId = query.traceId;
  }

  if (query.userId) {
    where.userId = query.userId;
  }

  if (query.organizationId) {
    where.organizationId = query.organizationId;
  }

  if (query.requestId) {
    where.requestId = query.requestId;
  }

  if (query.startTime) {
    where.timestamp = { gte: query.startTime };
  }

  if (query.endTime) {
    where.timestamp = {
      ...where.timestamp,
      lte: query.endTime,
    };
  }

  if (query.search) {
    where.message = { contains: query.search, mode: "insensitive" };
  }

  const limit = query.limit || 100;
  const offset = query.offset || 0;
  const orderBy = query.orderBy || "timestamp";
  const orderDirection = query.orderDirection || "desc";

  const [logs, total] = await Promise.all([
    prisma.logEntry.findMany({
      where,
      orderBy: { [orderBy]: orderDirection },
      take: limit,
      skip: offset,
    }),
    prisma.logEntry.count({ where }),
  ]);

  return { logs, total, limit, offset };
}

/**
 * Get log by ID
 */
export async function getLog(logId: string): Promise<LogEntry | null> {
  return prisma.logEntry.findUnique({ where: { id: logId } });
}

/**
 * Get logs by trace ID
 */
export async function getLogsByTraceId(traceId: string): Promise<LogEntry[]> {
  return prisma.logEntry.findMany({
    where: { traceId },
    orderBy: { timestamp: "asc" },
  });
}

/**
 * Get logs by request ID
 */
export async function getLogsByRequestId(requestId: string): Promise<LogEntry[]> {
  return prisma.logEntry.findMany({
    where: { requestId },
    orderBy: { timestamp: "asc" },
  });
}

// ─── Log Aggregation ────────────────────────────────────────────

/**
 * Aggregate logs by field
 */
export async function aggregateLogs(
  field: string,
  query?: LogQuery,
): Promise<LogAggregation> {
  const where: any = {};

  if (query?.level) {
    where.level = Array.isArray(query.level) ? { in: query.level } : query.level;
  }

  if (query?.service) {
    where.service = query.service;
  }

  if (query?.startTime) {
    where.timestamp = { gte: query.startTime };
  }

  if (query?.endTime) {
    where.timestamp = { ...where.timestamp, lte: query.endTime };
  }

  // Get all logs matching query
  const logs = await prisma.logEntry.findMany({
    where,
    select: { [field]: true },
  });

  // Count by field value
  const counts: Record<string, number> = {};
  for (const log of logs) {
    const value = String((log as any)[field] || "unknown");
    counts[value] = (counts[value] || 0) + 1;
  }

  // Convert to buckets
  const buckets = Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);

  return { field, buckets };
}

/**
 * Get log statistics
 */
export async function getLogStats(query?: LogQuery): Promise<LogStats> {
  const where: any = {};

  if (query?.startTime) {
    where.timestamp = { gte: query.startTime };
  }

  if (query?.endTime) {
    where.timestamp = { ...where.timestamp, lte: query.endTime };
  }

  const logs = await prisma.logEntry.findMany({
    where,
    select: {
      level: true,
      service: true,
      message: true,
      timestamp: true,
    },
  });

  const byLevel: Record<string, number> = {};
  const byService: Record<string, number> = {};
  const byHour: Record<string, number> = {};
  const messageCounts: Record<string, number> = {};

  for (const log of logs) {
    byLevel[log.level] = (byLevel[log.level] || 0) + 1;
    byService[log.service] = (byService[log.service] || 0) + 1;

    const hour = new Date(log.timestamp).toISOString().slice(0, 13); // YYYY-MM-DDTHH
    byHour[hour] = (byHour[hour] || 0) + 1;

    // Normalize message (remove IDs, numbers)
    const normalizedMessage = log.message
      .replace(/\b\w{8,}\b/g, "{id}")
      .replace(/\b\d+\b/g, "{n}")
      .slice(0, 100);
    messageCounts[normalizedMessage] = (messageCounts[normalizedMessage] || 0) + 1;
  }

  // Calculate time range
  const startTime = query?.startTime ? new Date(query.startTime) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const endTime = query?.endTime ? new Date(query.endTime) : new Date();
  const minutes = Math.max(1, (endTime.getTime() - startTime.getTime()) / 60000);

  const topMessages = Object.entries(messageCounts)
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalLogs: logs.length,
    byLevel: byLevel as any,
    byService,
    byHour: Object.entries(byHour)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour)),
    avgLogsPerMinute: logs.length / minutes,
    topMessages,
  };
}

// ─── Log Retention ──────────────────────────────────────────────

/**
 * Set log retention policy
 */
export async function setLogRetention(days: number): Promise<void> {
  await redisCmd.set(LOG_RETENTION_KEY, days.toString());

  logger.info("Log retention policy set", { days });
}

/**
 * Get log retention policy
 */
export async function getLogRetention(): Promise<number> {
  const days = await redisCmd.get(LOG_RETENTION_KEY);
  return days ? parseInt(days) : 30; // Default 30 days
}

/**
 * Delete expired logs
 */
export async function deleteExpiredLogs(): Promise<number> {
  const retentionDays = await getLogRetention();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await prisma.logEntry.deleteMany({
    where: {
      timestamp: { lt: cutoffDate },
    },
  });

  if (result.count > 0) {
    logger.info("Expired logs deleted", {
      count: result.count,
      retentionDays,
    });
  }

  return result.count;
}

// ─── Log Export ─────────────────────────────────────────────────

/**
 * Export logs to file
 */
export async function exportLogs(
  query: LogQuery,
  format: "json" | "csv" = "json",
): Promise<string> {
  const { logs } = await queryLogs({ ...query, limit: 100000 });

  if (format === "json") {
    return JSON.stringify(logs, null, 2);
  } else {
    // CSV format
    const headers = ["timestamp", "level", "service", "message", "traceId", "userId"];
    const rows = logs.map((log) => [
      log.timestamp,
      log.level,
      log.service,
      `"${log.message.replace(/"/g, '""')}"`,
      log.traceId || "",
      log.userId || "",
    ]);

    return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  }
}

// ─── Log Correlation ────────────────────────────────────────────

/**
 * Get logs correlated with a trace
 */
export async function getCorrelatedLogs(traceId: string): Promise<{
  logs: LogEntry[];
  spans: any[];
}> {
  const logs = await getLogsByTraceId(traceId);

  // Get spans from tracer
  const { getTrace } = await import("../observability/tracer.js");
  const spans = getTrace(traceId);

  return { logs, spans };
}

/**
 * Search logs and traces together
 */
export async function searchLogsAndTraces(
  search: string,
  limit: number = 50,
): Promise<{
  logs: LogEntry[];
  traces: any[];
}> {
  const { logs } = await queryLogs({ search, limit });

  // Get unique trace IDs from logs
  const traceIds = new Set(logs.map((log) => log.traceId).filter(Boolean));

  // Get traces
  const { getTrace } = await import("../observability/tracer.js");
  const traces = Array.from(traceIds).map((traceId) => ({
    traceId,
    spans: getTrace(traceId!),
  }));

  return { logs, traces };
}
