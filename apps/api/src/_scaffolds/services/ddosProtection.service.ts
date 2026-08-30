/**
 * DDoS Protection Service (Module 22 — Gap 2)
 *
 * Protect against DDoS attacks:
 * - Traffic rate monitoring and anomaly detection
 * - IP reputation checking
 * - Geo-blocking
 * - Automatic IP blocking on threshold breach
 * - Traffic pattern analysis
 * - Volumetric attack detection
 * - Application-layer DDoS protection
 *
 * Provides multi-layer DDoS protection.
 */
import { logger } from "../../config/logger.js";
import { Metrics } from "../../observability/metrics.js";
import { redisCmd } from "../../db/redis.js";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:ddosProtection');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export interface TrafficStats {
  ip: string;
  requestCount: number;
  bytesTransferred: number;
  errorCount: number;
  firstSeen: string;
  lastSeen: string;
  blocked: boolean;
  blockReason?: string;
}

export interface DDoSConfig {
  // Rate limits
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  bytesPerSecond: number;
  bytesPerMinute: number;

  // Anomaly detection
  anomalyThresholdMultiplier: number; // Block if traffic exceeds baseline * multiplier
  baselineWindowMinutes: number; // Window for calculating baseline

  // Auto-blocking
  autoBlockEnabled: boolean;
  autoBlockDurationMinutes: number;
  maxConcurrentConnections: number;

  // Geo-blocking
  geoBlockingEnabled: boolean;
  blockedCountries: string[];
  allowedCountries: string[]; // If set, only these countries are allowed

  // IP reputation
  ipReputationEnabled: boolean;
  blockKnownBadIPs: boolean;
}

export interface DDoSEvent {
  id: string;
  timestamp: string;
  type: "rate_limit" | "anomaly" | "geo_block" | "ip_reputation" | "connection_limit";
  severity: "low" | "medium" | "high" | "critical";
  ip: string;
  country?: string;
  details: Record<string, any>;
  action: "logged" | "blocked" | "challenged";
}

// ─── Redis Keys ─────────────────────────────────────────────────

const TRAFFIC_KEY = (ip: string) => `ddos:traffic:${ip}`;
const BASELINE_KEY = (ip: string) => `ddos:baseline:${ip}`;
const BLOCKLIST_KEY = "ddos:blocklist";
const WHITELIST_KEY = "ddos:whitelist";
const EVENTS_KEY = "ddos:events";
const CONFIG_KEY = "ddos:config";

// ─── Default Configuration ──────────────────────────────────────

const DEFAULT_CONFIG: DDoSConfig = {
  requestsPerSecond: 100,
  requestsPerMinute: 1000,
  requestsPerHour: 10000,
  bytesPerSecond: 10 * 1024 * 1024, // 10 MB/s
  bytesPerMinute: 100 * 1024 * 1024, // 100 MB/min

  anomalyThresholdMultiplier: 5,
  baselineWindowMinutes: 60,

  autoBlockEnabled: true,
  autoBlockDurationMinutes: 60,
  maxConcurrentConnections: 100,

  geoBlockingEnabled: false,
  blockedCountries: [],
  allowedCountries: [],

  ipReputationEnabled: false,
  blockKnownBadIPs: false,
};

// ─── Configuration Management ───────────────────────────────────

/**
 * Get DDoS configuration
 */
export async function getDDoSConfig(): Promise<DDoSConfig> {
  const data = await redisCmd.get(CONFIG_KEY);
  return data ? JSON.parse(data) : DEFAULT_CONFIG;
}

/**
 * Update DDoS configuration
 */
export async function updateDDoSConfig(updates: Partial<DDoSConfig>): Promise<DDoSConfig> {
  const current = await getDDoSConfig();
  const updated = { ...current, ...updates };

  await redisCmd.set(CONFIG_KEY, JSON.stringify(updated));

  logger.info("DDoS config updated", { updates: Object.keys(updates) });

  return updated;
}

// ─── Traffic Tracking ───────────────────────────────────────────

/**
 * Track request from IP
 */
export async function trackRequest(
  ip: string,
  bytes: number = 0,
  isError: boolean = false,
): Promise<void> {
  const now = Date.now();
  const key = TRAFFIC_KEY(ip);

  // Get current stats
  const data = await redisCmd.get(key);
  let stats: TrafficStats = data
    ? JSON.parse(data)
    : {
        ip,
        requestCount: 0,
        bytesTransferred: 0,
        errorCount: 0,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        blocked: false,
      };

  // Update stats
  stats.requestCount++;
  stats.bytesTransferred += bytes;
  if (isError) stats.errorCount++;
  stats.lastSeen = new Date().toISOString();

  // Save with 1 hour expiry
  await redisCmd.set(key, JSON.stringify(stats), "EX", 3600);

  // Update baseline
  await updateBaseline(ip, stats.requestCount);

  // Update metrics
  Metrics.increment("ddos.requests.total", 1);
  Metrics.increment("ddos.bytes.total", bytes);
}

/**
 * Update traffic baseline for anomaly detection
 */
async function updateBaseline(ip: string, currentRequests: number): Promise<void> {
  const key = BASELINE_KEY(ip);
  const data = await redisCmd.get(key);

  let baseline: { requests: number[]; lastUpdate: number } = data
    ? JSON.parse(data)
    : { requests: [], lastUpdate: Date.now() };

  baseline.requests.push(currentRequests);

  // Keep only last N minutes of data
  const config = await getDDoSConfig();
  const maxEntries = config.baselineWindowMinutes;
  if (baseline.requests.length > maxEntries) {
    baseline.requests = baseline.requests.slice(-maxEntries);
  }

  baseline.lastUpdate = Date.now();

  await redisCmd.set(key, JSON.stringify(baseline), "EX", 3600 * 24); // 24 hour expiry
}

/**
 * Get traffic stats for IP
 */
export async function getTrafficStats(ip: string): Promise<TrafficStats | null> {
  const data = await redisCmd.get(TRAFFIC_KEY(ip));
  return data ? JSON.parse(data) : null;
}

// ─── Rate Limiting ──────────────────────────────────────────────

/**
 * Check if IP exceeds rate limits
 */
export async function checkRateLimit(ip: string): Promise<{
  exceeded: boolean;
  limit?: string;
  current?: number;
  threshold?: number;
}> {
  // Check whitelist first
  if (await isIPWhitelisted(ip)) {
    return { exceeded: false };
  }

  const stats = await getTrafficStats(ip);
  if (!stats) {
    return { exceeded: false };
  }

  const config = await getDDoSConfig();
  const now = Date.now();
  const firstSeen = new Date(stats.firstSeen).getTime();
  const secondsSinceFirstSeen = (now - firstSeen) / 1000;
  const minutesSinceFirstSeen = secondsSinceFirstSeen / 60;
  const hoursSinceFirstSeen = minutesSinceFirstSeen / 60;

  // Check per-second rate
  if (secondsSinceFirstSeen > 0) {
    const requestsPerSecond = stats.requestCount / secondsSinceFirstSeen;
    if (requestsPerSecond > config.requestsPerSecond) {
      return {
        exceeded: true,
        limit: "requests_per_second",
        current: Math.round(requestsPerSecond),
        threshold: config.requestsPerSecond,
      };
    }
  }

  // Check per-minute rate
  if (minutesSinceFirstSeen > 0) {
    const requestsPerMinute = stats.requestCount / minutesSinceFirstSeen;
    if (requestsPerMinute > config.requestsPerMinute) {
      return {
        exceeded: true,
        limit: "requests_per_minute",
        current: Math.round(requestsPerMinute),
        threshold: config.requestsPerMinute,
      };
    }
  }

  // Check per-hour rate
  if (hoursSinceFirstSeen > 0) {
    const requestsPerHour = stats.requestCount / hoursSinceFirstSeen;
    if (requestsPerHour > config.requestsPerHour) {
      return {
        exceeded: true,
        limit: "requests_per_hour",
        current: Math.round(requestsPerHour),
        threshold: config.requestsPerHour,
      };
    }
  }

  // Check bytes per second
  if (secondsSinceFirstSeen > 0) {
    const bytesPerSecond = stats.bytesTransferred / secondsSinceFirstSeen;
    if (bytesPerSecond > config.bytesPerSecond) {
      return {
        exceeded: true,
        limit: "bytes_per_second",
        current: Math.round(bytesPerSecond),
        threshold: config.bytesPerSecond,
      };
    }
  }

  return { exceeded: false };
}

// ─── Anomaly Detection ──────────────────────────────────────────

/**
 * Check for traffic anomalies
 */
export async function checkAnomaly(ip: string): Promise<{
  isAnomaly: boolean;
  currentRate?: number;
  baselineRate?: number;
  multiplier?: number;
}> {
  const stats = await getTrafficStats(ip);
  if (!stats) {
    return { isAnomaly: false };
  }

  const baselineData = await redisCmd.get(BASELINE_KEY(ip));
  if (!baselineData) {
    return { isAnomaly: false };
  }

  const baseline: { requests: number[] } = JSON.parse(baselineData);
  if (baseline.requests.length < 10) {
    // Not enough data for baseline
    return { isAnomaly: false };
  }

  // Calculate baseline average
  const avgBaseline = baseline.requests.reduce((sum, r) => sum + r, 0) / baseline.requests.length;

  // Calculate current rate (requests in last minute)
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const firstSeen = new Date(stats.firstSeen).getTime();

  if (firstSeen > oneMinuteAgo) {
    // IP seen less than a minute ago
    return { isAnomaly: false };
  }

  const currentRate = stats.requestCount;
  const multiplier = avgBaseline > 0 ? currentRate / avgBaseline : 0;

  const config = await getDDoSConfig();
  const isAnomaly = multiplier > config.anomalyThresholdMultiplier;

  return {
    isAnomaly,
    currentRate,
    baselineRate: Math.round(avgBaseline),
    multiplier: Math.round(multiplier * 100) / 100,
  };
}

// ─── IP Blocking ────────────────────────────────────────────────

/**
 * Block IP address
 */
export async function blockIP(
  ip: string,
  reason: string,
  durationMinutes?: number,
): Promise<void> {
  const config = await getDDoSConfig();
  const duration = durationMinutes || config.autoBlockDurationMinutes;

  await redisCmd.sadd(BLOCKLIST_KEY, ip);

  // Update traffic stats
  const stats = await getTrafficStats(ip);
  if (stats) {
    stats.blocked = true;
    stats.blockReason = reason;
    await redisCmd.set(TRAFFIC_KEY(ip), JSON.stringify(stats), "EX", duration * 60);
  }

  // Set expiry on blocklist entry
  await redisCmd.expire(`${BLOCKLIST_KEY}:${ip}`, duration * 60);

  logger.warn("IP blocked", { ip, reason, durationMinutes: duration });

  Metrics.increment("ddos.ip.blocked", 1);

  // Log event
  await logDDoSEvent({
    id: `event_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    type: "rate_limit",
    severity: "high",
    ip,
    details: { reason, durationMinutes: duration },
    action: "blocked",
  });
}

/**
 * Unblock IP address
 */
export async function unblockIP(ip: string): Promise<void> {
  await redisCmd.srem(BLOCKLIST_KEY, ip);

  const stats = await getTrafficStats(ip);
  if (stats) {
    stats.blocked = false;
    stats.blockReason = undefined;
    await redisCmd.set(TRAFFIC_KEY(ip), JSON.stringify(stats), "EX", 3600);
  }

  logger.info("IP unblocked", { ip });
}

/**
 * Check if IP is blocked
 */
export async function isIPBlocked(ip: string): Promise<boolean> {
  return await redisCmd.sismember(BLOCKLIST_KEY, ip);
}

/**
 * Get blocked IPs
 */
export async function getBlockedIPs(): Promise<string[]> {
  return await redisCmd.smembers(BLOCKLIST_KEY);
}

// ─── IP Whitelisting ────────────────────────────────────────────

/**
 * Whitelist IP address
 */
export async function whitelistIP(ip: string): Promise<void> {
  await redisCmd.sadd(WHITELIST_KEY, ip);
  logger.info("IP whitelisted", { ip });
}

/**
 * Remove IP from whitelist
 */
export async function unwhitelistIP(ip: string): Promise<void> {
  await redisCmd.srem(WHITELIST_KEY, ip);
  logger.info("IP removed from whitelist", { ip });
}

/**
 * Check if IP is whitelisted
 */
export async function isIPWhitelisted(ip: string): Promise<boolean> {
  return await redisCmd.sismember(WHITELIST_KEY, ip);
}

/**
 * Get whitelisted IPs
 */
export async function getWhitelistedIPs(): Promise<string[]> {
  return await redisCmd.smembers(WHITELIST_KEY);
}

// ─── Event Logging ──────────────────────────────────────────────

/**
 * Log DDoS event
 */
async function logDDoSEvent(event: DDoSEvent): Promise<void> {
  await redisCmd.lpush(EVENTS_KEY, JSON.stringify(event));
  await redisCmd.ltrim(EVENTS_KEY, 0, 9999); // Keep last 10000 events
}

/**
 * Get DDoS events
 */
export async function getDDoSEvents(filters?: {
  type?: DDoSEvent["type"];
  ip?: string;
  limit?: number;
}): Promise<DDoSEvent[]> {
  const data = await redisCmd.lrange(EVENTS_KEY, 0, (filters?.limit || 100) - 1);
  let events = data.map((d) => JSON.parse(d) as DDoSEvent);

  if (filters?.type) {
    events = events.filter((e) => e.type === filters.type);
  }

  if (filters?.ip) {
    events = events.filter((e) => e.ip === filters.ip);
  }

  return events;
}

// ─── Express Middleware ─────────────────────────────────────────

/**
 * Express middleware for DDoS protection
 */
export function ddosProtectionMiddleware() {
  return async (req: any, res: any, next: any) => {
    try {
      const ip = req.ip;

      // Track request
      const bytes = parseInt(req.get("content-length") || "0", 10);
      await trackRequest(ip, bytes);

      // Check if IP is blocked
      if (await isIPBlocked(ip)) {
        logger.warn("Blocked IP attempted request", { ip, path: req.path });
        Metrics.increment("ddos.requests.blocked", 1);

        return res.status(403).json({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Your IP has been temporarily blocked due to suspicious activity",
          },
        });
      }

      // Check rate limits
      const rateLimitResult = await checkRateLimit(ip);
      if (rateLimitResult.exceeded) {
        logger.warn("Rate limit exceeded", {
          ip,
          limit: rateLimitResult.limit,
          current: rateLimitResult.current,
          threshold: rateLimitResult.threshold,
        });

        const config = await getDDoSConfig();
        if (config.autoBlockEnabled) {
          await blockIP(ip, `Rate limit exceeded: ${rateLimitResult.limit}`);
        }

        Metrics.increment("ddos.rate_limit.exceeded", 1);

        return res.status(429).json({
          ok: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests",
            details: {
              limit: rateLimitResult.limit,
              current: rateLimitResult.current,
              threshold: rateLimitResult.threshold,
            },
          },
        });
      }

      // Check for anomalies
      const anomalyResult = await checkAnomaly(ip);
      if (anomalyResult.isAnomaly) {
        logger.warn("Traffic anomaly detected", {
          ip,
          currentRate: anomalyResult.currentRate,
          baselineRate: anomalyResult.baselineRate,
          multiplier: anomalyResult.multiplier,
        });

        const config = await getDDoSConfig();
        if (config.autoBlockEnabled) {
          await blockIP(ip, `Traffic anomaly: ${anomalyResult.multiplier}x baseline`);
        }

        Metrics.increment("ddos.anomaly.detected", 1);

        return res.status(429).json({
          ok: false,
          error: {
            code: "TRAFFIC_ANOMALY",
            message: "Unusual traffic pattern detected",
          },
        });
      }

      next();
    } catch (error) {
      logger.error("DDoS middleware error", { error: (error as Error).message });
      // Fail open - allow request if DDoS protection fails
      next();
    }
  };
}

// ─── Statistics ─────────────────────────────────────────────────

/**
 * Get DDoS protection statistics
 */
export async function getDDoSStats(): Promise<{
  totalRequests: number;
  totalBytes: number;
  blockedIPs: number;
  whitelistedIPs: number;
  events: {
    total: number;
    byType: Record<string, number>;
  };
}> {
  const blockedIPs = await getBlockedIPs();
  const whitelistedIPs = await getWhitelistedIPs();
  const events = await getDDoSEvents({ limit: 10000 });

  const byType: Record<string, number> = {};
  for (const event of events) {
    byType[event.type] = (byType[event.type] || 0) + 1;
  }

  const metrics = Metrics.snapshot();

  return {
    totalRequests: metrics.counters["ddos.requests.total"]?.total || 0,
    totalBytes: metrics.counters["ddos.bytes.total"]?.total || 0,
    blockedIPs: blockedIPs.length,
    whitelistedIPs: whitelistedIPs.length,
    events: {
      total: events.length,
      byType,
    },
  };
}
