import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { listPermissions as coreListPermissions, grantPermission, revokePermission } from "../../services/permissions.service.js";
import permissionsModule from "../../permissions/permissions.module.js";
import { permissionsRoutesSchema } from "@windels/shared/permissions";

export function registerPermissionsRoutes(router: Router) {
  // All permission routes require authentication
  router.use(authenticate);

  /**
   * GET /api/v1/permissions
   * Get current user's permissions
   */
  router.get("/", async (req, res, next) => {
    try {
      const result = await coreListPermissions(req.user!.id);
      res.json({
        ok: true,
        data: result,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * GET /api/v1/permissions/catalog
   * Get all available permissions (admin only)
   */
  router.get(
    "/catalog",
    permissionsModule.requirePermission("ORG_ADMIN"),
    async (_req, res) => {
      const catalog = permissionsModule.getPermissionCatalog();
      res.json({
        ok: true,
        data: catalog,
      });
    },
  );

  /**
   * GET /api/v1/permissions/users/:userId
   * Get specific user's permissions (admin only)
   */
  router.get(
    "/users/:userId",
    validate({ params: permissionsRoutesSchema.userId }),
    permissionsModule.requirePermission("ORG_ADMIN"),
    async (req, res, next) => {
      try {
        const result = await coreListPermissions(req.params.userId);
        res.json({
          ok: true,
          data: result,
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * POST /api/v1/permissions/grant
   * Grant a permission to a user (admin only)
   */
  router.post(
    "/grant",
    validate({ body: permissionsRoutesSchema.grant }),
    permissionsModule.requirePermission("ORG_ADMIN"),
    async (req, res, next) => {
      try {
        const { targetUserId, permission, resourceId } = req.body;
        await grantPermission(req.user!.id, targetUserId, permission, resourceId || undefined);
        res.json({
          ok: true,
          data: { granted: true },
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * DELETE /api/v1/permissions/grant/:grantId
   * Revoke a permission grant (admin only)
   */
  router.delete(
    "/grant/:grantId",
    validate({ params: permissionsRoutesSchema.grantId }),
    permissionsModule.requirePermission("ORG_ADMIN"),
    async (req, res, next) => {
      try {
        await revokePermission(req.user!.id, req.params.grantId);
        res.json({
          ok: true,
          data: { revoked: true },
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * GET /api/v1/permissions/check
   * Check if current user has a permission
   */
  router.get(
    "/check",
    validate({ query: permissionsRoutesSchema.check }),
    async (req, res, next) => {
      try {
        const { permission } = req.query;
        const has = await permissionsModule.hasPermission(req.user!.id, permission as any);
        res.json({
          ok: true,
          data: { hasPermission: has },
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );
}
