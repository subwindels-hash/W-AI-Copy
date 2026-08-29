/**
 * Tenant Context Middleware (Module 18 — Gap 2)
 *
 * Automatic tenant context injection for multi-tenant isolation:
 * - Extract organizationId from authenticated user
 * - Set tenant context in database session (for RLS)
 * - Clear tenant context after request completes
 * - Handle tenant context for API keys and service tokens
 * - Propagate tenant context to background jobs
 *
 * Ensures every database query is automatically scoped to the current tenant.
 */
import type { Request, Response, NextFunction } from "express";
import { setTenantContext, clearTenantContext, type TenantContext } from "../../services/rowLevelSecurity.service.js";
import { logger } from "../../config/logger.js";

// ─── Types ──────────────────────────────────────────────────────

export interface TenantAwareRequest extends Request {
  tenantContext?: TenantContext;
}

// ─── Main Middleware ────────────────────────────────────────────

/**
 * Middleware to set tenant context for authenticated requests.
 * This should be installed after the auth middleware.
 */
export function tenantContextMiddleware() {
  return async (req: TenantAwareRequest, res: Response, next: NextFunction) => {
    try {
      // Extract user from request (set by auth middleware)
      const user = req.user;

      if (!user) {
        // Unauthenticated request - no tenant context
        return next();
      }

      // Extract organizationId from user
      const organizationId = user.organizationId;

      if (!organizationId) {
        // User has no organization (e.g., super-admin without org context)
        // Set bypass RLS for super-admins
        if (user.role === "super_admin") {
          const context: TenantContext = {
            organizationId: "system", // Dummy value for super-admin
            userId: user.id,
            userRole: user.role,
            isSuperAdmin: true,
            bypassRLS: true,
          };

          await setTenantContext(context);
          req.tenantContext = context;

          logger.debug("Tenant context set (super-admin)", {
            userId: user.id,
            bypassRLS: true,
          });
        } else {
          // Regular user without organization - this shouldn't happen
          logger.warn("User without organization", { userId: user.id });
          return next();
        }
      } else {
        // Regular user with organization
        const context: TenantContext = {
          organizationId,
          userId: user.id,
          userRole: user.role,
          isSuperAdmin: user.role === "super_admin",
          bypassRLS: user.role === "super_admin",
        };

        await setTenantContext(context);
        req.tenantContext = context;

        logger.debug("Tenant context set", {
          organizationId,
          userId: user.id,
          userRole: user.role,
          bypassRLS: context.bypassRLS,
        });
      }

      // Clear tenant context when response finishes
      res.on("finish", async () => {
        try {
          await clearTenantContext();
          logger.debug("Tenant context cleared", {
            userId: user?.id,
          });
        } catch (error) {
          logger.error("Failed to clear tenant context", { error });
        }
      });

      next();
    } catch (error) {
      logger.error("Tenant context middleware error", { error });
      next(error);
    }
  };
}

// ─── API Key Tenant Context ─────────────────────────────────────

/**
 * Middleware to set tenant context for API key authenticated requests.
 * This should be installed after the API key auth middleware.
 */
export function apiKeyTenantContextMiddleware() {
  return async (req: TenantAwareRequest, res: Response, next: NextFunction) => {
    try {
      // Extract API key from request (set by API key auth middleware)
      const apiKey = (req as any).apiKey;

      if (!apiKey) {
        // No API key - skip tenant context
        return next();
      }

      const organizationId = apiKey.organizationId;

      if (!organizationId) {
        // API key without organization - this shouldn't happen
        logger.warn("API key without organization", { apiKeyId: apiKey.id });
        return next();
      }

      const context: TenantContext = {
        organizationId,
        userId: apiKey.id, // Use API key ID as user ID
        userRole: "api_key",
        isSuperAdmin: false,
        bypassRLS: false,
      };

      await setTenantContext(context);
      req.tenantContext = context;

      logger.debug("Tenant context set (API key)", {
        organizationId,
        apiKeyId: apiKey.id,
      });

      // Clear tenant context when response finishes
      res.on("finish", async () => {
        try {
          await clearTenantContext();
          logger.debug("Tenant context cleared (API key)", {
            apiKeyId: apiKey.id,
          });
        } catch (error) {
          logger.error("Failed to clear tenant context (API key)", { error });
        }
      });

      next();
    } catch (error) {
      logger.error("API key tenant context middleware error", { error });
      next(error);
    }
  };
}

// ─── Service Token Tenant Context ───────────────────────────────

/**
 * Middleware to set tenant context for service token authenticated requests.
 * This should be installed after the service token auth middleware.
 */
export function serviceTokenTenantContextMiddleware() {
  return async (req: TenantAwareRequest, res: Response, next: NextFunction) => {
    try {
      // Extract service token from request (set by service token auth middleware)
      const serviceToken = (req as any).serviceToken;

      if (!serviceToken) {
        // No service token - skip tenant context
        return next();
      }

      const organizationId = serviceToken.organizationId;

      if (!organizationId) {
        // Service token without organization - system-level token
        const context: TenantContext = {
          organizationId: "system",
          userId: serviceToken.id,
          userRole: "service",
          isSuperAdmin: false,
          bypassRLS: serviceToken.scope.includes("system"),
        };

        await setTenantContext(context);
        req.tenantContext = context;

        logger.debug("Tenant context set (service token)", {
          serviceTokenId: serviceToken.id,
          bypassRLS: context.bypassRLS,
        });
      } else {
        const context: TenantContext = {
          organizationId,
          userId: serviceToken.id,
          userRole: "service",
          isSuperAdmin: false,
          bypassRLS: false,
        };

        await setTenantContext(context);
        req.tenantContext = context;

        logger.debug("Tenant context set (service token)", {
          organizationId,
          serviceTokenId: serviceToken.id,
        });
      }

      // Clear tenant context when response finishes
      res.on("finish", async () => {
        try {
          await clearTenantContext();
          logger.debug("Tenant context cleared (service token)", {
            serviceTokenId: serviceToken.id,
          });
        } catch (error) {
          logger.error("Failed to clear tenant context (service token)", { error });
        }
      });

      next();
    } catch (error) {
      logger.error("Service token tenant context middleware error", { error });
      next(error);
    }
  };
}

// ─── Background Job Tenant Context ──────────────────────────────

/**
 * Set tenant context for background jobs.
 * This should be called at the start of each background job.
 */
export async function withTenantContext<T>(
  context: TenantContext,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    await setTenantContext(context);

    logger.debug("Tenant context set (background job)", {
      organizationId: context.organizationId,
      userId: context.userId,
    });

    const result = await fn();

    return result;
  } finally {
    try {
      await clearTenantContext();
      logger.debug("Tenant context cleared (background job)", {
        organizationId: context.organizationId,
        userId: context.userId,
      });
    } catch (error) {
      logger.error("Failed to clear tenant context (background job)", { error });
    }
  }
}

/**
 * Run a function with super-admin context (bypass RLS).
 * Use sparingly for system operations.
 */
export async function withSuperAdminContext<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const context: TenantContext = {
    organizationId: "system",
    userId,
    userRole: "super_admin",
    isSuperAdmin: true,
    bypassRLS: true,
  };

  return withTenantContext(context, fn);
}

/**
 * Run a function with specific organization context.
 * Useful for cross-tenant operations or admin tasks.
 */
export async function withOrganizationContext<T>(
  organizationId: string,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const context: TenantContext = {
    organizationId,
    userId,
    userRole: "admin",
    isSuperAdmin: false,
    bypassRLS: false,
  };

  return withTenantContext(context, fn);
}

// ─── Tenant Context Utilities ───────────────────────────────────

/**
 * Get current tenant context from request.
 */
export function getTenantContextFromRequest(req: TenantAwareRequest): TenantContext | null {
  return req.tenantContext ?? null;
}

/**
 * Require tenant context (throws if not set).
 */
export function requireTenantContext(req: TenantAwareRequest): TenantContext {
  const context = req.tenantContext;

  if (!context) {
    throw new Error("Tenant context not set");
  }

  return context;
}

/**
 * Check if request has tenant context.
 */
export function hasTenantContext(req: TenantAwareRequest): boolean {
  return !!req.tenantContext;
}

/**
 * Check if request is from super-admin (bypass RLS).
 */
export function isSuperAdminRequest(req: TenantAwareRequest): boolean {
  return req.tenantContext?.isSuperAdmin ?? false;
}

/**
 * Check if request bypasses RLS.
 */
export function bypassesRLS(req: TenantAwareRequest): boolean {
  return req.tenantContext?.bypassRLS ?? false;
}

// ─── Express Router Integration ─────────────────────────────────

/**
 * Apply tenant context middleware to an Express router.
 */
export function applyTenantContextToRouter(router: any): void {
  router.use(tenantContextMiddleware());
}

/**
 * Apply tenant context middleware to specific routes.
 */
export function applyTenantContextToRoutes(router: any, routes: string[]): void {
  for (const route of routes) {
    router.use(route, tenantContextMiddleware());
  }
}

// ─── Prisma Client Extension ────────────────────────────────────

/**
 * Create a Prisma client extension that automatically sets tenant context.
 * This is an alternative to middleware-based approach.
 */
export function createTenantAwarePrismaClient(baseClient: any, getTenantContext: () => TenantContext | null) {
  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          const context = getTenantContext();

          if (!context || context.bypassRLS) {
            // No tenant context or bypass RLS - execute as-is
            return query(args);
          }

          // Add organizationId filter for read operations
          if (operation === "findMany" || operation === "findFirst" || operation === "findUnique") {
            args.where = {
              ...args.where,
              organizationId: context.organizationId,
            };
          }

          // Add organizationId for create operations
          if (operation === "create") {
            args.data = {
              ...args.data,
              organizationId: context.organizationId,
            };
          }

          // Add organizationId filter for update operations
          if (operation === "update" || operation === "updateMany") {
            args.where = {
              ...args.where,
              organizationId: context.organizationId,
            };
          }

          // Add organizationId filter for delete operations
          if (operation === "delete" || operation === "deleteMany") {
            args.where = {
              ...args.where,
              organizationId: context.organizationId,
            };
          }

          return query(args);
        },
      },
    },
  });
}
