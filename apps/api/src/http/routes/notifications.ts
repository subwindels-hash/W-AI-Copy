import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import notificationsService from "../../notifications/notifications.service.js";
import { notificationsRoutesSchema } from "@windels/shared/notifications";

export function registerNotificationsRoutes(router: Router) {
  // All notification routes require authentication
  router.use(authenticate);

  /**
   * GET /api/v1/notifications
   * Get user's notifications
   */
  router.get(
    "/",
    validate({ query: notificationsRoutesSchema.list }),
    async (req, res, next) => {
      try {
        const notifications = await notificationsService.getForUser(req.user!.id, {
          unreadOnly: req.query.unreadOnly === "true",
          limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
          offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
        });

        const unreadCount = await notificationsService.getUnreadCount(req.user!.id);

        res.json({
          ok: true,
          data: { notifications, unreadCount },
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * GET /api/v1/notifications/unread-count
   * Get unread notification count
   */
  router.get("/unread-count", async (req, res, next) => {
    try {
      const count = await notificationsService.getUnreadCount(req.user!.id);
      res.json({
        ok: true,
        data: { count },
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * POST /api/v1/notifications/:id/read
   * Mark a notification as read
   */
  router.post(
    "/:id/read",
    validate({ params: notificationsRoutesSchema.notificationId }),
    async (req, res, next) => {
      try {
        await notificationsService.markAsRead(req.params.id, req.user!.id);
        res.json({
          ok: true,
          data: { markedAsRead: true },
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * POST /api/v1/notifications/read-all
   * Mark all notifications as read
   */
  router.post("/read-all", async (req, res, next) => {
    try {
      const count = await notificationsService.markAllAsRead(req.user!.id);
      res.json({
        ok: true,
        data: { markedAsReadCount: count },
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * GET /api/v1/notifications/preferences
   * Get user's notification preferences
   */
  router.get("/preferences", async (req, res, next) => {
    try {
      const preferences = await notificationsService.getPreferences(req.user!.id);
      res.json({
        ok: true,
        data: preferences,
        meta: { requestId: req.requestId },
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * PATCH /api/v1/notifications/preferences
   * Update notification preferences
   */
  router.patch(
    "/preferences",
    validate({ body: notificationsRoutesSchema.updatePreference }),
    async (req, res, next) => {
      try {
        const { category, channels, enabled } = req.body;
        await notificationsService.updatePreference(req.user!.id, category, channels, enabled);
        res.json({
          ok: true,
          data: { updated: true },
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * DELETE /api/v1/notifications/:id
   * Dismiss a notification
   */
  router.delete(
    "/:id",
    validate({ params: notificationsRoutesSchema.notificationId }),
    async (req, res, next) => {
      try {
        await notificationsService.delete(req.params.id, req.user!.id);
        res.json({
          ok: true,
          data: { dismissed: true },
          meta: { requestId: req.requestId },
        });
      } catch (e) {
        next(e);
      }
    },
  );
}
