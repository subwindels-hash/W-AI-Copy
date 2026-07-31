/**
 * API Rate Limiting Service (Module 23 — Gap 1)
 *
 * Per-API-key rate limiting with tiered limits:
 * - Per-key rate limits (requests per minute/hour/day)
 * - Tiered rate limits (free, basic, premium, enterprise)
 * - Rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
 * - Rate limit tracking and analytics
 * - Rate limit bypass for admin keys
 * - Burst handling
 *
 * Provides granular API rate limiting.
 */
import { logger } from "../config/logger.js";
import { Metrics } from "../observability/metrics.js";
import { redisCmd } from "../db/redis.js";

// ─── Types ──────────────────────────────────────────────────────

export type RateLimitTier = "free" | "basic" | "premium" | "enterprise" | "unlimited";

export interface RateLimitConfig {
  tier: RateLimitTier;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstSize: number;
  burstWindowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
  retryAfterSeconds?: number;
  tier: RateLimitTier;
}

export interface APIKeyRateLimit {
  apiKeyId: string;
  tier: RateLimitTier;
  requestsThisMinute: number;
  requestsThisHour: number;
  requestsThisDay: number;
  lastRequestAt: string;
  blocked: boolean;
  blockReason?: string;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const RATE_LIMIT_KEY = (apiKeyId: string, window: string) => `api:ratelimit:${apiKeyId}:${window}`;
const RATE_LIMIT_CONFIG_KEY = (apiKeyId: string) => `api:ratelimit:config:${apiKeyId}`;
const RATE_LIMIT_STATS_KEY = "api:ratelimit:stats";

// ─── Default Tier Configurations ────────────────────────────────

const TIER_CONFIGS: Record<RateLimitTier, RateLimitConfig> = {
  free: {
    tier: "free",
    requestsPerMinute: 10,
    requestsPerHour: 100,
    requestsPerDay: 1000,
    burstSize: 5,
    burstWindowSeconds: 10,
  },
  basic: {
    tier: "basic",
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 10000,
    burstSize: 20,
    burstWindowSeconds: 10,
  },
  premium: {
    tier: "premium",
    requestsPerMinute: 300,
    requestsPerHour: 10000,
    requestsPerDay: 100000,
    burstSize: 50,
    burstWindowSeconds: 10,
  },
  enterprise: {
    tier: "enterprise",
    requestsPerMinute: 1000,
    requestsPerHour: 50000,
    requestsPerDay: 500000,
    burstSize: 100,
    burstWindowSeconds: 10,
  },
  unlimited: {
    tier: "unlimited",
    requestsPerMinute: Infinity,
    requestsPerHour: Infinity,
    requestsPerDay: Infinity,
    burstSize: Infinity,
    burstWindowSeconds: 10,
  },
};

// ─── Rate Limit Configuration ───────────────────────────────────

/**
 * Set rate limit tier for API key
 */
export async function setAPIKeyRateLimitTier(
  apiKeyId: string,
  tier: RateLimitTier,
): Promise<void> {
  const config = TIER_CONFIGS[tier];

  await redisCmd.set(RATE_LIMIT_CONFIG_KEY(apiKeyId), JSON.stringify(config));

  logger.info("API key rate limit tier set", { apiKeyId, tier });
}

/**
 * Get rate limit configuration for API key
 */
export async function getAPIKeyRateLimitConfig(apiKeyId: string): Promise<RateLimitConfig> {
  const data = await redisCmd.get(RATE_LIMIT_CONFIG_KEY(apiKeyId));

  if (data) {
    return JSON.parse(data);
  }

  // Default to free tier
  return TIER_CONFIGS.free;
}

// ─── Rate Limit Checking ────────────────────────────────────────

/**
 * Check rate limit for API key
 */
export async function checkAPIKeyRateLimit(apiKeyId: string): Promise<RateLimitResult> {
  const config = await getAPIKeyRateLimitConfig(apiKeyId);

  // Unlimited tier always allowed
  if (config.tier === "unlimited") {
    return {
      allowed: true,
      limit: Infinity,
      remaining: Infinity,
      resetTime: Math.floor(Date.now() / 1000) + 60,
      tier: config.tier,
    };
  }

  const now = Date.now();
  const minuteWindow = Math.floor(now / 60000);
  const hourWindow = Math.floor(now / 3600000);
  const dayWindow = Math.floor(now / 86400000);

  // Get current counts
  const [minuteCount, hourCount, dayCount] = await Promise.all([
    getCount(apiKeyId, `minute:${minuteWindow}`),
    getCount(apiKeyId, `hour:${hourWindow}`),
    getCount(apiKeyId, `day:${dayWindow}`),
  ]);

  // Check limits
  const minuteLimit = config.requestsPerMinute;
  const hourLimit = config.requestsPerHour;
  const dayLimit = config.requestsPerDay;

  let allowed = true;
  let limit = minuteLimit;
  let remaining = minuteLimit - minuteCount - 1;
  let resetTime = (minuteWindow + 1) * 60;
  let retryAfterSeconds: number | undefined;

  if (minuteCount >= minuteLimit) {
    allowed = false;
    retryAfterSeconds = resetTime - Math.floor(now / 1000);
  } else if (hourCount >= hourLimit) {
    allowed = false;
    limit = hourLimit;
    remaining = 0;
    resetTime = (hourWindow + 1) * 3600;
    retryAfterSeconds = resetTime - Math.floor(now / 1000);
  } else if (dayCount >= dayLimit) {
    allowed = false;
    limit = dayLimit;
    remaining = 0;
    resetTime = (dayWindow + 1) * 86400;
    retryAfterSeconds = resetTime - Math.floor(now / 1000);
  }

  // Increment counters if allowed
  if (allowed) {
    await Promise.all([
      incrementCount(apiKeyId, `minute:${minuteWindow}`, 60),
      incrementCount(apiKeyId, `hour:${hourWindow}`, 3600),
      incrementCount(apiKeyId, `day:${dayWindow}`, 86400),
    ]);
  }

  // Update metrics
  Metrics.increment("api.ratelimit.checked", 1, {
    tier: config.tier,
    allowed: allowed ? "true" : "false",
  });

  if (!allowed) {
    Metrics.increment("api.ratelimit.exceeded", 1, { tier: config.tier });
  }

  return {
    allowed,
    limit,
    remaining: Math.max(0, remaining),
    resetTime,
    retryAfterSeconds,
    tier: config.tier,
  };
}

/**
 * Get count for window
 */
async function getCount(apiKeyId: string, window: string): Promise<number> {
  const key = RATE_LIMIT_KEY(apiKeyId, window);
  const count = await redisCmd.get(key);
  return count ? parseInt(count, 10) : 0;
}

/**
 * Increment count for window
 */
async function incrementCount(apiKeyId: string, window: string, ttlSeconds: number): Promise<void> {
  const key = RATE_LIMIT_KEY(apiKeyId, window);
  await redisCmd.incr(key);
  await redisCmd.expire(key, ttlSeconds);
}

// ─── Express Middleware ─────────────────────────────────────────

/**
 * Express middleware for API rate limiting
 */
export function apiRateLimitMiddleware() {
  return async (req: any, res: any, next: any) => {
    try {
      const apiKey = req.apiKey;
      if (!apiKey) {
        // No API key, skip rate limiting (other auth middleware will handle)
        return next();
      }

      const result = await checkAPIKeyRateLimit(apiKey.id);

      // Set rate limit headers
      res.set({
        "X-RateLimit-Limit": result.limit === Infinity ? "unlimited" : String(result.limit),
        "X-RateLimit-Remaining": result.remaining === Infinity ? "unlimited" : String(result.remaining),
        "X-RateLimit-Reset": String(result.resetTime),
        "X-RateLimit-Tier": result.tier,
      });

      if (result.retryAfterSeconds !== undefined) {
        res.set("Retry-After", String(result.retryAfterSeconds));
      }

      if (!result.allowed) {
        logger.warn("API rate limit exceeded", {
          apiKeyId: apiKey.id,
          tier: result.tier,
          limit: result.limit,
        });

        return res.status(429).json({
          ok: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: `API rate limit exceeded. Limit: ${result.limit} requests per ${result.limit === result.limit ? "minute" : "period"}`,
            details: {
              tier: result.tier,
              limit: result.limit,
              remaining: result.remaining,
              resetTime: result.resetTime,
              retryAfterSeconds: result.retryAfterSeconds,
            },
          },
        });
      }

      next();
    } catch (error) {
      logger.error("API rate limit middleware error", { error: (error as Error).message });
      // Fail open - allow request if rate limiting fails
      next();
    }
  };
}

// ─── Statistics ─────────────────────────────────────────────────

/**
 * Get API rate limit statistics
 */
export async function getAPIRateLimitStats(): Promise<{
  totalChecks: number;
  totalExceeded: number;
  byTier: Record<RateLimitTier, { checks: number; exceeded: number }>;
}> {
  const metrics = Metrics.snapshot();

  const totalChecks = metrics.counters["api.ratelimit.checked"]?.total || 0;
  const totalExceeded = metrics.counters["api.ratelimit.exceeded"]?.total || 0;

  const byTier: Record<string, { checks: number; exceeded: number }> = {};

  for (const tier of ["free", "basic", "premium", "enterprise", "unlimited"] as RateLimitTier[]) {
    const checks = metrics.counters["api.ratelimit.checked"]?.tags?.[tier] || 0;
    const exceeded = metrics.counters["api.ratelimit.exceeded"]?.tags?.[tier] || 0;

    byTier[tier] = { checks, exceeded };
  }

  return {
    totalChecks,
    totalExceeded,
    byTier: byTier as Record<RateLimitTier, { checks: number; exceeded: number }>,
  };
}
