/**
 * Time Series Service (Module 11 — Gap 1)
 *
 * Store and manage time series data efficiently:
 * - Time series storage with timestamps and values
 * - Efficient querying by time range
 * - Aggregation (min, max, avg, sum, count) over time windows
 * - Downsampling for long-term storage
 * - Multiple metrics per entity
 * - Metadata and tags for filtering
 *
 * Uses Redis sorted sets for efficient time-based queries.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";

// ─── Types ──────────────────────────────────────────────────────

export interface TimeSeriesDataPoint {
  timestamp: number; // Unix timestamp in milliseconds
  value: number;
  metadata?: Record<string, any>;
}

export interface TimeSeries {
  id: string;
  name: string;
  entityId?: string; // Optional entity this metric belongs to
  entityType?: string;
  tags: string[];
  unit?: string; // e.g., "ms", "count", "percent"
  description?: string;
  createdAt: number;
  lastUpdated: number;
  pointCount: number;
}

export interface TimeRange {
  start: number; // Unix timestamp
  end: number; // Unix timestamp
}

export type AggregationType = "min" | "max" | "avg" | "sum" | "count" | "first" | "last";

export interface AggregatedPoint {
  timestamp: number; // Start of aggregation window
  value: number;
  count: number; // Number of points in this window
  min?: number;
  max?: number;
}

export interface DownsampleOptions {
  interval: number; // Aggregation interval in milliseconds
  aggregation: AggregationType;
  maxPoints?: number; // Maximum points to return
}

// ─── Redis Keys ─────────────────────────────────────────────────

const TIMESERIES_INDEX = "timeseries:all";
const TIMESERIES_KEY = (id: string) => `timeseries:meta:${id}`;
const TIMESERIES_DATA_KEY = (id: string) => `timeseries:data:${id}`;
const TIMESERIES_ENTITY_KEY = (entityType: string, entityId: string) => `timeseries:entity:${entityType}:${entityId}`;
const TIMESERIES_TAG_KEY = (tag: string) => `timeseries:tag:${tag}`;

// ─── Time Series Management ─────────────────────────────────────

/**
 * Create a new time series.
 */
export async function createTimeSeries(input: {
  name: string;
  entityId?: string;
  entityType?: string;
  tags?: string[];
  unit?: string;
  description?: string;
}): Promise<TimeSeries> {
  const now = Date.now();
  const tsId = `ts_${randomUUID().slice(0, 8)}`;

  const timeSeries: TimeSeries = {
    id: tsId,
    name: input.name,
    entityId: input.entityId,
    entityType: input.entityType,
    tags: input.tags ?? [],
    unit: input.unit,
    description: input.description,
    createdAt: now,
    lastUpdated: now,
    pointCount: 0,
  };

  // Store metadata
  await redis.hset(TIMESERIES_KEY(tsId), {
    id: timeSeries.id,
    name: timeSeries.name,
    entityId: timeSeries.entityId ?? "",
    entityType: timeSeries.entityType ?? "",
    tags: JSON.stringify(timeSeries.tags),
    unit: timeSeries.unit ?? "",
    description: timeSeries.description ?? "",
    createdAt: String(timeSeries.createdAt),
    lastUpdated: String(timeSeries.lastUpdated),
    pointCount: String(timeSeries.pointCount),
  });

  // Add to index
  await redis.sadd(TIMESERIES_INDEX, tsId);

  // Add to entity index if applicable
  if (input.entityId && input.entityType) {
    await redis.sadd(TIMESERIES_ENTITY_KEY(input.entityType, input.entityId), tsId);
  }

  // Add to tag indexes
  for (const tag of timeSeries.tags) {
    await redis.sadd(TIMESERIES_TAG_KEY(tag), tsId);
  }

  logger.info("Time series created", {
    tsId,
    name: timeSeries.name,
    entityId: timeSeries.entityId,
  });

  return timeSeries;
}

/**
 * Get a time series by ID.
 */
export async function getTimeSeries(tsId: string): Promise<TimeSeries | null> {
  const data = await redis.hgetall(TIMESERIES_KEY(tsId));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    id: data.id,
    name: data.name,
    entityId: data.entityId || undefined,
    entityType: data.entityType || undefined,
    tags: JSON.parse(data.tags || "[]"),
    unit: data.unit || undefined,
    description: data.description || undefined,
    createdAt: parseInt(data.createdAt, 10),
    lastUpdated: parseInt(data.lastUpdated, 10),
    pointCount: parseInt(data.pointCount, 10),
  };
}

/**
 * List time series with optional filtering.
 */
export async function listTimeSeries(
  filter?: { entityId?: string; entityType?: string; tags?: string[] },
): Promise<TimeSeries[]> {
  let tsIds: string[] = [];

  if (filter?.entityId && filter?.entityType) {
    // Filter by entity
    tsIds = await redis.smembers(TIMESERIES_ENTITY_KEY(filter.entityType, filter.entityId));
  } else if (filter?.tags?.length) {
    // Filter by tags (intersection)
    const tagSets = await Promise.all(
      filter.tags.map(tag => redis.smembers(TIMESERIES_TAG_KEY(tag)))
    );
    tsIds = tagSets.reduce((acc, set) => acc.filter(id => set.includes(id)));
  } else {
    // Get all
    tsIds = await redis.smembers(TIMESERIES_INDEX);
  }

  const timeSeries: TimeSeries[] = [];
  for (const id of tsIds) {
    const ts = await getTimeSeries(id);
    if (ts) timeSeries.push(ts);
  }

  return timeSeries.sort((a, b) => b.lastUpdated - a.lastUpdated);
}

// ─── Data Point Management ──────────────────────────────────────

/**
 * Add a data point to a time series.
 */
export async function addDataPoint(
  tsId: string,
  timestamp: number,
  value: number,
  metadata?: Record<string, any>,
): Promise<TimeSeriesDataPoint> {
  const point: TimeSeriesDataPoint = { timestamp, value, metadata };

  // Store in sorted set (score = timestamp)
  const dataStr = JSON.stringify(point);
  await redis.zadd(TIMESERIES_DATA_KEY(tsId), timestamp, dataStr);

  // Update metadata
  const ts = await getTimeSeries(tsId);
  if (ts) {
    await redis.hset(TIMESERIES_KEY(tsId), {
      lastUpdated: String(Date.now()),
      pointCount: String(ts.pointCount + 1),
    });
  }

  return point;
}

/**
 * Add multiple data points in batch.
 */
export async function addDataPoints(
  tsId: string,
  points: Array<{ timestamp: number; value: number; metadata?: Record<string, any> }>,
): Promise<number> {
  const pipeline = redis.pipeline();

  for (const point of points) {
    const dataStr = JSON.stringify(point);
    pipeline.zadd(TIMESERIES_DATA_KEY(tsId), point.timestamp, dataStr);
  }

  await pipeline.exec();

  // Update metadata
  const ts = await getTimeSeries(tsId);
  if (ts) {
    await redis.hset(TIMESERIES_KEY(tsId), {
      lastUpdated: String(Date.now()),
      pointCount: String(ts.pointCount + points.length),
    });
  }

  logger.debug("Data points added", { tsId, count: points.length });

  return points.length;
}

/**
 * Query data points in a time range.
 */
export async function queryDataPoints(
  tsId: string,
  range: TimeRange,
  limit?: number,
): Promise<TimeSeriesDataPoint[]> {
  const data = await redis.zrangebyscore(
    TIMESERIES_DATA_KEY(tsId),
    range.start,
    range.end,
    "LIMIT",
    0,
    limit ?? 10000,
  );

  return data.map(d => JSON.parse(d) as TimeSeriesDataPoint);
}

/**
 * Get the latest N data points.
 */
export async function getLatestPoints(
  tsId: string,
  count: number = 100,
): Promise<TimeSeriesDataPoint[]> {
  const data = await redis.zrevrange(TIMESERIES_DATA_KEY(tsId), 0, count - 1);
  return data.map(d => JSON.parse(d) as TimeSeriesDataPoint).reverse();
}

/**
 * Delete data points in a time range.
 */
export async function deleteDataPoints(
  tsId: string,
  range: TimeRange,
): Promise<number> {
  const deleted = await redis.zremrangebyscore(
    TIMESERIES_DATA_KEY(tsId),
    range.start,
    range.end,
  );

  // Update point count
  const ts = await getTimeSeries(tsId);
  if (ts) {
    await redis.hset(TIMESERIES_KEY(tsId), {
      pointCount: String(Math.max(0, ts.pointCount - deleted)),
    });
  }

  return deleted;
}

// ─── Aggregation ────────────────────────────────────────────────

/**
 * Aggregate data points over time windows.
 */
export async function aggregateDataPoints(
  tsId: string,
  range: TimeRange,
  options: DownsampleOptions,
): Promise<AggregatedPoint[]> {
  const points = await queryDataPoints(tsId, range);

  if (points.length === 0) return [];

  // Group points into time windows
  const windows = new Map<number, TimeSeriesDataPoint[]>();

  for (const point of points) {
    const windowStart = Math.floor(point.timestamp / options.interval) * options.interval;
    if (!windows.has(windowStart)) {
      windows.set(windowStart, []);
    }
    windows.get(windowStart)!.push(point);
  }

  // Aggregate each window
  const aggregated: AggregatedPoint[] = [];

  for (const [windowStart, windowPoints] of windows.entries()) {
    const values = windowPoints.map(p => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;

    let value: number;
    switch (options.aggregation) {
      case "min":
        value = min;
        break;
      case "max":
        value = max;
        break;
      case "avg":
        value = avg;
        break;
      case "sum":
        value = sum;
        break;
      case "count":
        value = values.length;
        break;
      case "first":
        value = windowPoints[0].value;
        break;
      case "last":
        value = windowPoints[windowPoints.length - 1].value;
        break;
      default:
        value = avg;
    }

    aggregated.push({
      timestamp: windowStart,
      value,
      count: values.length,
      min,
      max,
    });
  }

  // Sort by timestamp
  aggregated.sort((a, b) => a.timestamp - b.timestamp);

  // Limit if specified
  if (options.maxPoints && aggregated.length > options.maxPoints) {
    // Downsample further by taking every Nth point
    const step = Math.ceil(aggregated.length / options.maxPoints);
    return aggregated.filter((_, i) => i % step === 0);
  }

  return aggregated;
}

/**
 * Compute statistics for a time series in a time range.
 */
export async function computeStatistics(
  tsId: string,
  range: TimeRange,
): Promise<{
  count: number;
  min: number;
  max: number;
  avg: number;
  sum: number;
  stdDev: number;
  first: number;
  last: number;
}> {
  const points = await queryDataPoints(tsId, range);

  if (points.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, sum: 0, stdDev: 0, first: 0, last: 0 };
  }

  const values = points.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const variance = values.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return {
    count: values.length,
    min,
    max,
    avg,
    sum,
    stdDev,
    first: values[0],
    last: values[values.length - 1],
  };
}

// ─── Time Series Cleanup ────────────────────────────────────────

/**
 * Delete a time series and all its data.
 */
export async function deleteTimeSeries(tsId: string): Promise<boolean> {
  const ts = await getTimeSeries(tsId);
  if (!ts) return false;

  // Delete data
  await redis.del(TIMESERIES_DATA_KEY(tsId));

  // Delete metadata
  await redis.del(TIMESERIES_KEY(tsId));

  // Remove from indexes
  await redis.srem(TIMESERIES_INDEX, tsId);

  if (ts.entityId && ts.entityType) {
    await redis.srem(TIMESERIES_ENTITY_KEY(ts.entityType, ts.entityId), tsId);
  }

  for (const tag of ts.tags) {
    await redis.srem(TIMESERIES_TAG_KEY(tag), tsId);
  }

  logger.info("Time series deleted", { tsId });

  return true;
}

/**
 * Retain only recent data (delete old data).
 */
export async function retainRecentData(
  tsId: string,
  retentionMs: number,
): Promise<number> {
  const cutoff = Date.now() - retentionMs;
  return deleteDataPoints(tsId, { start: 0, end: cutoff });
}
