/**
 * Organization Scoping Middleware (Module 1 — Gap 4)
 *
 * Automatically injects verified organization context into every authenticated
 * request. This prevents cross-tenant data leaks by ensuring that:
 *
 * 1. The user's JWT contains a valid organizationId
 * 2. The user has an active membership in that organization
 * 3. The org context is attached to req.org for use by downstream services
 *
 * This middleware should be applied AFTER authenticate() on any route that
 * accesses organization-scoped data.
 */
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../../db/client.js";
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/result.js";

// Cache membership lookups in Redis for 5 minutes to avoid DB hits on every request
const MEMBERSHIP_CACHE_TTL = 300; // seconds
const MEMBERSHIP_CACHE_KEY = (userId: string, orgId: string) => `org:membership:${userId}:${orgId}`;

export interface OrgContext {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  membershipRole: string;
  workspaceId: string | null;
}

// Extend Express Request to include org context
declare global {
  namespace Express {
    interface Request {
      org?: OrgContext;
    }
  }
}

/**
 * Middleware that verifies and injects organization context.
 * Must be applied after authenticate().
 */
export function orgScope() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Public / pre-auth routes (webhook receivers, healthchecks) do not have
      // a user attached. Let them through; downstream handlers that require
      // auth will call authenticate() explicitly and produce a helpful error.
      if (!req.user) {
        return next();
      }

      const { id: userId, organizationId } = req.user;

      // If no org in JWT (e.g. pre-org-creation state), skip org scoping
      if (!organizationId) {
        return next();
      }

      // Check Redis cache first
      const cacheKey = MEMBERSHIP_CACHE_KEY(userId, organizationId);
      let cached: string | null = null;
      try {
        cached = await redis.get(cacheKey);
      } catch {
        // Redis down — fall through to DB
      }

      if (cached) {
        req.org = JSON.parse(cached) as OrgContext;
        return next();
      }

      // Cache miss — query DB
      const membership = await prisma.membership.findFirst({
        where: {
          userId,
          organizationId,
        },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          workspace: { select: { id: true } },
        },
      });

      if (!membership) {
        logger.warn("org scope: user has no membership", { userId, organizationId });
        return next(AppError.forbidden("No active membership in this organization"));
      }

      const orgContext: OrgContext = {
        organizationId: membership.organization.id,
        organizationName: membership.organization.name,
        organizationSlug: membership.organization.slug,
        membershipRole: membership.role,
        workspaceId: membership.workspaceId,
      };

      // Cache the result
      try {
        await redis.set(cacheKey, JSON.stringify(orgContext), "EX", MEMBERSHIP_CACHE_TTL);
      } catch {
        // Redis down — continue without cache
      }

      req.org = orgContext;
      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Helper to get the org context from a request.
 * Throws if org context is not available.
 */
export function requireOrg(req: Request): OrgContext {
  if (!req.org) {
    throw AppError.forbidden("Organization context required");
  }
  return req.org;
}

/**
 * Invalidate the membership cache for a user/org pair.
 * Call this when memberships change (join, leave, role change).
 */
export async function invalidateMembershipCache(userId: string, organizationId: string) {
  try {
    await redis.del(MEMBERSHIP_CACHE_KEY(userId, organizationId));
  } catch {
    // Best effort
  }
}

/**
 * Invalidate all membership caches for a user (e.g. on logout).
 */
export async function invalidateUserMembershipCache(userId: string) {
  try {
    // Scan for all keys matching this user's membership cache
    // This is O(N) but only called on logout, not on every request
    const keys = await redis.keys(`org:membership:${userId}:*`);
    if (keys.length) {
      const pipe = redis.multi();
      for (const key of keys) pipe.del(key);
      await pipe.exec();
    }
  } catch {
    // Best effort
  }
}
