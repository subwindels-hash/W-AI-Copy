/**
 * API Caching Service (Module 23 — Gap 3)
 *
 * API response caching:
 * - Response caching with TTL
 * - Cache key generation from request
 * - Cache invalidation
 * - Cache hit/miss tracking
 * - Cache analytics
 * - Conditional caching based on headers
 * - Cache warming
 *
 * Provides API response caching for performance optimization.
 */
import { logger } from "../../config/logger.js";
import { Metrics } from "../../observability/metrics.js";
import { redisCmd } from "../../db/redis.js";
import { createHash } from "crypto";

// ─── Types ──────────────────────────────────────────────────────

export interface CacheConfig {
  ttlSeconds: number;
  cacheControlHeader?: string;
  varyHeaders?: string[];
  cacheableStatusCodes?: number[];
  cacheableMethods?: string[];
}

export interface CacheEntry {
  key: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  createdAt: string;
  expiresAt: string;
  ttlSeconds: number;
  hitCount: number;
}

export interface CacheStats {
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  totalEntries: number;
  totalBytes: number;
  avgTTLSeconds: number;
  topCachedEndpoints: Array<{ method: string; path: string; hits: number }>;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const CACHE_KEY = (key: string) => `api:cache:${key}`;
const CACHE_STATS_KEY = "api:cache:stats";
const CACHE_ENDPOINT_STATS_KEY = "api:cache:endpoints";

// ─── Default Cache Configuration ────────────────────────────────

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttlSeconds: 300, // 5 minutes
  cacheControlHeader: "public, max-age=300",
  varyHeaders: ["accept", "accept-encoding"],
  cacheableStatusCodes: [200, 203, 204, 300, 301, 404],
  cacheableMethods: ["GET"],
};

// ─── Cache Key Generation ───────────────────────────────────────

/**
 * Generate cache key from request
 */
export function generateCacheKey(req: any): string {
  const parts = [
    req.method,
    req.path,
    JSON.stringify(req.query || {}),
  ];

  // Add vary headers to cache key
  const varyHeaders = DEFAULT_CACHE_CONFIG.varyHeaders || [];
  for (const header of varyHeaders) {
    const value = req.get(header);
    if (value) {
      parts.push(`${header}:${value}`);
    }
  }

  const keyString = parts.join("|");
  const hash = createHash("sha256").update(keyString).digest("hex");

  return hash;
}

// ─── Cache Operations ───────────────────────────────────────────

/**
 * Get cached response
 */
export async function getCachedResponse(cacheKey: string): Promise<CacheEntry | null> {
  const key = CACHE_KEY(cacheKey);
  const data = await redisCmd.get(key);

  if (!data) {
    Metrics.increment("api.cache.miss", 1);
    return null;
  }

  const entry: CacheEntry = JSON.parse(data);

  // Check if expired
  if (new Date(entry.expiresAt) < new Date()) {
    await redisCmd.del(key);
    Metrics.increment("api.cache.miss", 1);
    Metrics.increment("api.cache.expired", 1);
    return null;
  }

  // Update hit count
  entry.hitCount++;
  await redisCmd.set(key, JSON.stringify(entry));

  Metrics.increment("api.cache.hit", 1);
  Metrics.increment("api.cache.hits.total", 1);

  // Update endpoint stats
  await updateCacheEndpointStats(cacheKey, "hit");

  logger.debug("Cache hit", { cacheKey, hitCount: entry.hitCount });

  return entry;
}

/**
 * Cache response
 */
export async function cacheResponse(
  cacheKey: string,
  statusCode: number,
  headers: Record<string, string>,
  body: string,
  config?: Partial<CacheConfig>,
): Promise<void> {
  const cacheConfig = { ...DEFAULT_CACHE_CONFIG, ...config };

  // Check if cacheable
  if (!isCacheable(statusCode, "GET", cacheConfig)) {
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + cacheConfig.ttlSeconds * 1000);

  const entry: CacheEntry = {
    key: cacheKey,
    statusCode,
    headers,
    body,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttlSeconds: cacheConfig.ttlSeconds,
    hitCount: 0,
  };

  const key = CACHE_KEY(cacheKey);
  await redisCmd.set(key, JSON.stringify(entry), "EX", cacheConfig.ttlSeconds);

  Metrics.increment("api.cache.stored", 1);
  Metrics.gauge("api.cache.entries.total", await getCacheEntryCount());

  // Update endpoint stats
  await updateCacheEndpointStats(cacheKey, "stored");

  logger.debug("Response cached", {
    cacheKey,
    ttlSeconds: cacheConfig.ttlSeconds,
    statusCode,
  });
}

/**
 * Invalidate cache entry
 */
export async function invalidateCache(cacheKey: string): Promise<void> {
  const key = CACHE_KEY(cacheKey);
  await redisCmd.del(key);

  Metrics.increment("api.cache.invalidated", 1);

  logger.debug("Cache invalidated", { cacheKey });
}

/**
 * Invalidate cache by pattern
 */
export async function invalidateCacheByPattern(pattern: string): Promise<number> {
  const keys = await redisCmd.keys(`api:cache:${pattern}`);
  
  if (keys.length === 0) {
    return 0;
  }

  await redisCmd.del(...keys);

  Metrics.increment("api.cache.invalidated", keys.length);

  logger.info("Cache invalidated by pattern", { pattern, count: keys.length });

  return keys.length;
}

/**
 * Clear all cache
 */
export async function clearAllCache(): Promise<number> {
  const keys = await redisCmd.keys("api:cache:*");
  
  if (keys.length === 0) {
    return 0;
  }

  await redisCmd.del(...keys);

  Metrics.increment("api.cache.cleared", keys.length);

  logger.info("All cache cleared", { count: keys.length });

  return keys.length;
}

// ─── Cache Validation ───────────────────────────────────────────

/**
 * Check if response is cacheable
 */
function isCacheable(
  statusCode: number,
  method: string,
  config: CacheConfig,
): boolean {
  // Check method
  const cacheableMethods = config.cacheableMethods || ["GET"];
  if (!cacheableMethods.includes(method)) {
    return false;
  }

  // Check status code
  const cacheableStatusCodes = config.cacheableStatusCodes || [200];
  if (!cacheableStatusCodes.includes(statusCode)) {
    return false;
  }

  return true;
}

// ─── Express Middleware ─────────────────────────────────────────

/**
 * Express middleware for API caching
 */
export function apiCachingMiddleware(config?: Partial<CacheConfig>) {
  return async (req: any, res: any, next: any) => {
    // Only cache GET requests
    if (req.method !== "GET") {
      return next();
    }

    const cacheConfig = { ...DEFAULT_CACHE_CONFIG, ...config };
    const cacheKey = generateCacheKey(req);

    try {
      // Try to get cached response
      const cached = await getCachedResponse(cacheKey);

      if (cached) {
        logger.debug("Serving cached response", { cacheKey });

        // Set cache headers
        res.set({
          "X-Cache": "HIT",
          "X-Cache-Key": cacheKey,
          "Cache-Control": cacheConfig.cacheControlHeader || "public, max-age=300",
          "Age": Math.floor((Date.now() - new Date(cached.createdAt).getTime()) / 1000),
        });

        // Set original headers
        for (const [key, value] of Object.entries(cached.headers)) {
          res.set(key, value);
        }

        // Send cached response
        res.status(cached.statusCode).send(cached.body);
        return;
      }

      // Cache miss - capture response
      const originalSend = res.send;
      const originalStatus = res.status;

      let responseBody: string;
      let responseStatus: number;

      res.status = function (code: number) {
        responseStatus = code;
        return originalStatus.call(this, code);
      };

      res.send = function (body: any) {
        responseBody = typeof body === "string" ? body : JSON.stringify(body);

        // Cache response if cacheable
        if (isCacheable(responseStatus, req.method, cacheConfig)) {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.getHeaders())) {
            if (value !== undefined) {
              headers[key] = String(value);
            }
          }

          cacheResponse(cacheKey, responseStatus, headers, responseBody, cacheConfig).catch(
            (error) => {
              logger.error("Failed to cache response", { error: (error as Error).message });
            },
          );
        }

        // Set cache headers
        res.set({
          "X-Cache": "MISS",
          "X-Cache-Key": cacheKey,
          "Cache-Control": cacheConfig.cacheControlHeader || "public, max-age=300",
        });

        return originalSend.call(this, body);
      };

      next();
    } catch (error) {
      logger.error("API caching middleware error", { error: (error as Error).message });
      next();
    }
  };
}

// ─── Cache Statistics ───────────────────────────────────────────

/**
 * Update cache endpoint stats
 */
async function updateCacheEndpointStats(
  cacheKey: string,
  action: "hit" | "stored",
): Promise<void> {
  const key = `${CACHE_ENDPOINT_STATS_KEY}:${cacheKey}`;
  await redisCmd.hincrby(key, action, 1);
  await redisCmd.expire(key, 86400 * 30); // 30 days
}

/**
 * Get cache entry count
 */
async function getCacheEntryCount(): Promise<number> {
  const keys = await redisCmd.keys("api:cache:*");
  return keys.length;
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  const metrics = Metrics.snapshot();

  const totalHits = metrics.counters["api.cache.hit"]?.total || 0;
  const totalMisses = metrics.counters["api.cache.miss"]?.total || 0;
  const hitRate = totalHits + totalMisses > 0 ? (totalHits / (totalHits + totalMisses)) * 100 : 0;

  const totalEntries = await getCacheEntryCount();

  // Get all cache entries to calculate total bytes and avg TTL
  const keys = await redisCmd.keys("api:cache:*");
  let totalBytes = 0;
  let totalTTL = 0;

  for (const key of keys.slice(0, 100)) {
    // Limit to 100 for performance
    const data = await redisCmd.get(key);
    if (data) {
      const entry: CacheEntry = JSON.parse(data);
      totalBytes += Buffer.byteLength(entry.body);
      totalTTL += entry.ttlSeconds;
    }
  }

  const avgTTLSeconds = keys.length > 0 ? totalTTL / Math.min(keys.length, 100) : 0;

  // Get top cached endpoints
  const endpointKeys = await redisCmd.keys(`${CACHE_ENDPOINT_STATS_KEY}:*`);
  const endpointStats: Array<{ method: string; path: string; hits: number }> = [];

  for (const key of endpointKeys.slice(0, 100)) {
    const hits = await redisCmd.hget(key, "hit");
    if (hits) {
      // Extract method and path from cache key (simplified)
      endpointStats.push({
        method: "GET",
        path: key.replace(`${CACHE_ENDPOINT_STATS_KEY}:`, ""),
        hits: parseInt(hits, 10),
      });
    }
  }

  const topCachedEndpoints = endpointStats.sort((a, b) => b.hits - a.hits).slice(0, 10);

  return {
    totalHits,
    totalMisses,
    hitRate,
    totalEntries,
    totalBytes,
    avgTTLSeconds,
    topCachedEndpoints,
  };
}

/**
 * Warm cache for specific endpoints
 */
export async function warmCache(
  endpoints: Array<{ method: string; path: string; query?: Record<string, any> }>,
): Promise<number> {
  let cached = 0;

  for (const endpoint of endpoints) {
    try {
      // Create fake request object
      const req = {
        method: endpoint.method,
        path: endpoint.path,
        query: endpoint.query || {},
        get: (header: string) => undefined,
      };

      const cacheKey = generateCacheKey(req);

      // Check if already cached
      const cached_entry = await getCachedResponse(cacheKey);
      if (cached_entry) {
        cached++;
        continue;
      }

      // In production, you would make actual HTTP request to warm cache
      // For now, just log
      logger.info("Cache warming requested", { endpoint });
    } catch (error) {
      logger.error("Failed to warm cache", {
        endpoint,
        error: (error as Error).message,
      });
    }
  }

  return cached;
}
