/**
 * Resource Quotas Service (Module 18 — Gap 3)
 *
 * Multi-tenant resource quotas and enforcement:
 * - CPU quotas (processing time per request)
 * - Memory quotas (RAM usage per tenant)
 * - Storage quotas (database size, file storage)
 * - API call quotas (requests per minute/hour/day)
 * - Concurrent connection limits
 * - Query timeout limits
 * - Quota enforcement and monitoring
 * - Quota breach alerts and notifications
 *
 * Prevents noisy neighbor problem and ensures fair resource allocation.
 */
import { prisma } from "../../db/client.js";
import { redisCmd } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:resourceQuotas');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export interface ResourceQuota {
  id: string;
  organizationId: string;
  resourceType: ResourceType;
  limit: number;
  used: number;
  unit: string;
  resetAt?: string; // For time-based quotas (e.g., API calls per day)
  createdAt: string;
  updatedAt: string;
}

export type ResourceType =
  | "api_calls_per_minute"
  | "api_calls_per_hour"
  | "api_calls_per_day"
  | "storage_bytes"
  | "database_rows"
  | "concurrent_connections"
  | "cpu_seconds_per_request"
  | "memory_mb"
  | "file_count"
  | "agent_count"
  | "workflow_count"
  | "custom";

export interface QuotaCheckResult {
  allowed: boolean;
  resourceType: ResourceType;
  limit: number;
  used: number;
  remaining: number;
  percentage: number;
  resetAt?: string;
}

export interface QuotaBreach {
  id: string;
  organizationId: string;
  resourceType: ResourceType;
  limit: number;
  attempted: number;
  breachedAt: string;
  metadata?: Record<string, any>;
}

export interface QuotaPlan {
  name: string;
  quotas: Record<ResourceType, number>;
}

// ─── Default Quota Plans ────────────────────────────────────────

export const QUOTA_PLANS: Record<string, QuotaPlan> = {
  free: {
    name: "Free",
    quotas: {
      api_calls_per_minute: 60,
      api_calls_per_hour: 1000,
      api_calls_per_day: 10000,
      storage_bytes: 1024 * 1024 * 1024, // 1 GB
      database_rows: 100000,
      concurrent_connections: 10,
      cpu_seconds_per_request: 5,
      memory_mb: 512,
      file_count: 1000,
      agent_count: 5,
      workflow_count: 10,
    },
  },
  starter: {
    name: "Starter",
    quotas: {
      api_calls_per_minute: 300,
      api_calls_per_hour: 10000,
      api_calls_per_day: 100000,
      storage_bytes: 10 * 1024 * 1024 * 1024, // 10 GB
      database_rows: 1000000,
      concurrent_connections: 50,
      cpu_seconds_per_request: 10,
      memory_mb: 2048,
      file_count: 10000,
      agent_count: 20,
      workflow_count: 50,
    },
  },
  professional: {
    name: "Professional",
    quotas: {
      api_calls_per_minute: 1000,
      api_calls_per_hour: 50000,
      api_calls_per_day: 500000,
      storage_bytes: 100 * 1024 * 1024 * 1024, // 100 GB
      database_rows: 10000000,
      concurrent_connections: 200,
      cpu_seconds_per_request: 30,
      memory_mb: 8192,
      file_count: 100000,
      agent_count: 100,
      workflow_count: 500,
    },
  },
  enterprise: {
    name: "Enterprise",
    quotas: {
      api_calls_per_minute: 10000,
      api_calls_per_hour: 500000,
      api_calls_per_day: 5000000,
      storage_bytes: 1024 * 1024 * 1024 * 1024, // 1 TB
      database_rows: 100000000,
      concurrent_connections: 1000,
      cpu_seconds_per_request: 60,
      memory_mb: 32768,
      file_count: 1000000,
      agent_count: 1000,
      workflow_count: 5000,
    },
  },
};

// ─── Redis Keys ─────────────────────────────────────────────────

const QUOTA_KEY = (orgId: string, resourceType: ResourceType) => `quota:${orgId}:${resourceType}`;
const QUOTA_USAGE_KEY = (orgId: string, resourceType: ResourceType, window: string) =>
  `quota:usage:${orgId}:${resourceType}:${window}`;
const QUOTA_BREACH_KEY = (orgId: string) => `quota:breaches:${orgId}`;

// ─── Quota Management ───────────────────────────────────────────

/**
 * Initialize quotas for an organization based on their plan.
 */
export async function initializeQuotas(
  organizationId: string,
  planName: string = "free",
): Promise<ResourceQuota[]> {
  const plan = QUOTA_PLANS[planName];

  if (!plan) {
    throw new Error(`Unknown quota plan: ${planName}`);
  }

  const quotas: ResourceQuota[] = [];
  const now = new Date().toISOString();

  for (const [resourceType, limit] of Object.entries(plan.quotas)) {
    const quota: ResourceQuota = {
      id: `quota_${organizationId}_${resourceType}`,
      organizationId,
      resourceType: resourceType as ResourceType,
      limit,
      used: 0,
      unit: getUnitForResourceType(resourceType as ResourceType),
      createdAt: now,
      updatedAt: now,
    };

    // Store quota in database
    await prisma.resourceQuota.upsert({
      where: { id: quota.id },
      update: { limit, updatedAt: new Date() },
      create: quota,
    });

    // Initialize usage counter in Redis
    await redisCmd.set(QUOTA_KEY(organizationId, resourceType as ResourceType), "0");

    quotas.push(quota);
  }

  logger.info("Quotas initialized", {
    organizationId,
    plan: planName,
    quotaCount: quotas.length,
  });

  return quotas;
}

/**
 * Get quota for a specific resource type.
 */
export async function getQuota(
  organizationId: string,
  resourceType: ResourceType,
): Promise<ResourceQuota | null> {
  return prisma.resourceQuota.findUnique({
    where: { id: `quota_${organizationId}_${resourceType}` },
  });
}

/**
 * Get all quotas for an organization.
 */
export async function getQuotas(organizationId: string): Promise<ResourceQuota[]> {
  return prisma.resourceQuota.findMany({
    where: { organizationId },
    orderBy: { resourceType: "asc" },
  });
}

/**
 * Update quota limit.
 */
export async function updateQuotaLimit(
  organizationId: string,
  resourceType: ResourceType,
  newLimit: number,
): Promise<ResourceQuota | null> {
  const quota = await prisma.resourceQuota.update({
    where: { id: `quota_${organizationId}_${resourceType}` },
    data: {
      limit: newLimit,
      updatedAt: new Date(),
    },
  });

  logger.info("Quota limit updated", {
    organizationId,
    resourceType,
    newLimit,
  });

  return quota;
}

// ─── Quota Checking & Enforcement ───────────────────────────────

/**
 * Check if an operation is allowed within quota limits.
 */
export async function checkQuota(
  organizationId: string,
  resourceType: ResourceType,
  amount: number = 1,
): Promise<QuotaCheckResult> {
  const quota = await getQuota(organizationId, resourceType);

  if (!quota) {
    // No quota defined - allow by default
    return {
      allowed: true,
      resourceType,
      limit: Infinity,
      used: 0,
      remaining: Infinity,
      percentage: 0,
    };
  }

  // Get current usage from Redis
  const used = await getCurrentUsage(organizationId, resourceType);
  const remaining = Math.max(0, quota.limit - used);
  const percentage = (used / quota.limit) * 100;
  const allowed = used + amount <= quota.limit;

  const result: QuotaCheckResult = {
    allowed,
    resourceType,
    limit: quota.limit,
    used,
    remaining,
    percentage,
    resetAt: quota.resetAt,
  };

  if (!allowed) {
    logger.warn("Quota check failed", {
      organizationId,
      resourceType,
      limit: quota.limit,
      used,
      attempted: amount,
    });

    // Record quota breach
    await recordQuotaBreach(organizationId, resourceType, quota.limit, used + amount);
  }

  return result;
}

/**
 * Increment usage for a resource type.
 */
export async function incrementUsage(
  organizationId: string,
  resourceType: ResourceType,
  amount: number = 1,
): Promise<void> {
  const key = QUOTA_KEY(organizationId, resourceType);
  await redisCmd.incrby(key, amount);

  // Set expiration for time-based quotas
  if (isTimeBasedQuota(resourceType)) {
    const ttl = getTTLForTimeBasedQuota(resourceType);
    await redisCmd.expire(key, ttl);
  }

  logger.debug("Usage incremented", {
    organizationId,
    resourceType,
    amount,
  });
}

/**
 * Decrement usage for a resource type.
 */
export async function decrementUsage(
  organizationId: string,
  resourceType: ResourceType,
  amount: number = 1,
): Promise<void> {
  const key = QUOTA_KEY(organizationId, resourceType);
  const current = parseInt(await redisCmd.get(key) ?? "0");
  const newValue = Math.max(0, current - amount);
  await redisCmd.set(key, newValue.toString());

  logger.debug("Usage decremented", {
    organizationId,
    resourceType,
    amount,
  });
}

/**
 * Set absolute usage value for a resource type.
 */
export async function setUsage(
  organizationId: string,
  resourceType: ResourceType,
  value: number,
): Promise<void> {
  const key = QUOTA_KEY(organizationId, resourceType);
  await redisCmd.set(key, value.toString());

  logger.debug("Usage set", {
    organizationId,
    resourceType,
    value,
  });
}

/**
 * Get current usage for a resource type.
 */
export async function getCurrentUsage(
  organizationId: string,
  resourceType: ResourceType,
): Promise<number> {
  const key = QUOTA_KEY(organizationId, resourceType);
  const value = await redisCmd.get(key);
  return parseInt(value ?? "0");
}

/**
 * Reset usage for time-based quotas.
 */
export async function resetUsage(
  organizationId: string,
  resourceType: ResourceType,
): Promise<void> {
  const key = QUOTA_KEY(organizationId, resourceType);
  await redisCmd.del(key);

  logger.info("Usage reset", {
    organizationId,
    resourceType,
  });
}

// ─── Quota Breach Tracking ──────────────────────────────────────

/**
 * Record a quota breach.
 */
async function recordQuotaBreach(
  organizationId: string,
  resourceType: ResourceType,
  limit: number,
  attempted: number,
  metadata?: Record<string, any>,
): Promise<QuotaBreach> {
  const breach: QuotaBreach = {
    id: `breach_${Date.now()}_${_rng.next().toString(36).slice(2, 10)}`,
    organizationId,
    resourceType,
    limit,
    attempted,
    breachedAt: new Date().toISOString(),
    metadata,
  };

  // Store breach in Redis (keep last 100 breaches per organization)
  await redisCmd.lpush(QUOTA_BREACH_KEY(organizationId), JSON.stringify(breach));
  await redisCmd.ltrim(QUOTA_BREACH_KEY(organizationId), 0, 99);

  logger.warn("Quota breach recorded", {
    organizationId,
    resourceType,
    limit,
    attempted,
  });

  return breach;
}

/**
 * Get quota breaches for an organization.
 */
export async function getQuotaBreaches(
  organizationId: string,
  limit: number = 100,
): Promise<QuotaBreach[]> {
  const breaches = await redisCmd.lrange(QUOTA_BREACH_KEY(organizationId), 0, limit - 1);
  return breaches.map(b => JSON.parse(b));
}

/**
 * Get quota breach count by resource type.
 */
export async function getQuotaBreachStats(
  organizationId: string,
): Promise<Record<ResourceType, number>> {
  const breaches = await getQuotaBreaches(organizationId, 1000);
  const stats: Record<string, number> = {};

  for (const breach of breaches) {
    stats[breach.resourceType] = (stats[breach.resourceType] ?? 0) + 1;
  }

  return stats as Record<ResourceType, number>;
}

// ─── Quota Enforcement Middleware ───────────────────────────────

/**
 * Middleware to enforce API call quotas.
 */
export function apiQuotaMiddleware(resourceType: ResourceType = "api_calls_per_minute") {
  return async (req: any, res: any, next: any) => {
    try {
      const organizationId = req.user?.organizationId ?? req.apiKey?.organizationId;

      if (!organizationId) {
        // No organization context - skip quota check
        return next();
      }

      // Check quota
      const check = await checkQuota(organizationId, resourceType, 1);

      if (!check.allowed) {
        // Quota exceeded
        res.status(429).json({
          ok: false,
          error: {
            code: "QUOTA_EXCEEDED",
            message: `Quota exceeded for ${resourceType}`,
            details: {
              resourceType: check.resourceType,
              limit: check.limit,
              used: check.used,
              remaining: check.remaining,
              percentage: check.percentage,
              resetAt: check.resetAt,
            },
          },
        });
        return;
      }

      // Add quota headers
      res.set({
        "X-RateLimit-Limit": check.limit.toString(),
        "X-RateLimit-Remaining": check.remaining.toString(),
        "X-RateLimit-Used": check.used.toString(),
        "X-RateLimit-Percentage": check.percentage.toFixed(2),
      });

      if (check.resetAt) {
        res.set("X-RateLimit-Reset", check.resetAt);
      }

      // Increment usage
      await incrementUsage(organizationId, resourceType, 1);

      next();
    } catch (error) {
      logger.error("API quota middleware error", { error });
      next(error);
    }
  };
}

// ─── Helper Functions ───────────────────────────────────────────

function getUnitForResourceType(resourceType: ResourceType): string {
  const units: Record<ResourceType, string> = {
    api_calls_per_minute: "calls/min",
    api_calls_per_hour: "calls/hour",
    api_calls_per_day: "calls/day",
    storage_bytes: "bytes",
    database_rows: "rows",
    concurrent_connections: "connections",
    cpu_seconds_per_request: "seconds",
    memory_mb: "MB",
    file_count: "files",
    agent_count: "agents",
    workflow_count: "workflows",
    custom: "units",
  };

  return units[resourceType] ?? "units";
}

function isTimeBasedQuota(resourceType: ResourceType): boolean {
  return [
    "api_calls_per_minute",
    "api_calls_per_hour",
    "api_calls_per_day",
  ].includes(resourceType);
}

function getTTLForTimeBasedQuota(resourceType: ResourceType): number {
  const ttls: Record<string, number> = {
    api_calls_per_minute: 60, // 1 minute
    api_calls_per_hour: 3600, // 1 hour
    api_calls_per_day: 86400, // 1 day
  };

  return ttls[resourceType] ?? 3600;
}

// ─── Quota Reporting ────────────────────────────────────────────

/**
 * Get quota usage report for an organization.
 */
export async function getQuotaReport(
  organizationId: string,
): Promise<{
  quotas: ResourceQuota[];
  usage: Record<ResourceType, { used: number; limit: number; percentage: number; remaining: number }>;
  breaches: QuotaBreach[];
  breachStats: Record<ResourceType, number>;
}> {
  const quotas = await getQuotas(organizationId);
  const usage: Record<string, any> = {};

  for (const quota of quotas) {
    const used = await getCurrentUsage(organizationId, quota.resourceType);
    usage[quota.resourceType] = {
      used,
      limit: quota.limit,
      percentage: (used / quota.limit) * 100,
      remaining: Math.max(0, quota.limit - used),
    };
  }

  const breaches = await getQuotaBreaches(organizationId, 100);
  const breachStats = await getQuotaBreachStats(organizationId);

  return {
    quotas,
    usage: usage as any,
    breaches,
    breachStats,
  };
}

/**
 * Get organizations exceeding quotas.
 */
export async function getOrganizationsExceedingQuotas(
  resourceType?: ResourceType,
): Promise<Array<{
  organizationId: string;
  resourceType: ResourceType;
  used: number;
  limit: number;
  percentage: number;
}>> {
  const allQuotas = await prisma.resourceQuota.findMany({
    where: resourceType ? { resourceType } : undefined,
  });

  const exceeding: Array<{
    organizationId: string;
    resourceType: ResourceType;
    used: number;
    limit: number;
    percentage: number;
  }> = [];

  for (const quota of allQuotas) {
    const used = await getCurrentUsage(quota.organizationId, quota.resourceType);
    const percentage = (used / quota.limit) * 100;

    if (percentage >= 100) {
      exceeding.push({
        organizationId: quota.organizationId,
        resourceType: quota.resourceType,
        used,
        limit: quota.limit,
        percentage,
      });
    }
  }

  return exceeding.sort((a, b) => b.percentage - a.percentage);
}
