/**
 * Session 117 — Mobile offline durability, device trust and push health.
 *
 * Mounted on a second `/mobile` router registered *before* the Session 21
 * endpoints, so an unmatched request falls straight through to `/mobile/config`,
 * `/mobile/devices/register`, `GET /mobile/devices`, `DELETE /mobile/devices/:id`,
 * the push, biometric, PIN, notification and `/mobile/offline/sync` handlers with
 * their behaviour unchanged. None of the paths here collide with those: the
 * device paths are `/devices/trust` and `/devices/:deviceId/{trust,pin}`, which
 * Express matches after the literal `/devices` and `/devices/register`.
 *
 * `authenticate` is attached per handler rather than with `router.use`, so this
 * router never changes the authentication of a path it does not itself serve —
 * in particular the deliberately public `GET /mobile/config`.
 *
 * Everything here is scoped to the calling principal. A device, its queue, its
 * PIN lock and its push subscriptions belong to a person, not to a tenant, and
 * every read filters on `req.user.id`. Only the organization policy is
 * tenant-scoped, and only an administrator may change it.
 */
import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  MobileActionQuerySchema,
  MobileActionResolveSchema,
  MobileEventQuerySchema,
  MobileOfflineSubmitSchema,
  MobilePolicyUpdateSchema,
  MobileReplayPlanQuerySchema,
} from "@windels/shared/mobile";
import { MobileSyncService } from "../../mobile/mobileSync.service.js";
import { AppError } from "../../utils/result.js";

export function registerMobileSyncRoutes(router: Router) {
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });
  const userOf = (req: any): string => req.user!.id;
  const orgOf = (req: any): string | null => req.user?.organizationId ?? null;
  const requireOrg = (req: any): string => {
    const org = orgOf(req);
    if (!org) {
      throw AppError.forbidden(
        "The mobile policy is organization-scoped and this session carries no organization.",
      );
    }
    return org;
  };

  /* ── Offline queue ───────────────────────────────────────────────────── */

  /**
   * Durable submission. Replaces nothing: `POST /mobile/offline/sync` still
   * exists and now writes through this same service, so an older client keeps
   * working and gains durability without changing a line.
   */
  router.post(
    "/offline/actions",
    authenticate,
    validate({ body: MobileOfflineSubmitSchema }),
    async (req, res, next) => {
      try {
        const body = req.body as any;
        await MobileSyncService.assertDeviceOwnership(userOf(req), body.deviceId);
        const result = await MobileSyncService.submitActions(
          userOf(req),
          orgOf(req),
          body.deviceId,
          body.actions ?? [],
        );
        res.json({ ok: true, data: result, meta: meta(req) });
      } catch (e) {
        next(e);
      }
    },
  );

  router.get(
    "/offline/actions",
    authenticate,
    validate({ query: MobileActionQuerySchema }),
    async (req, res, next) => {
      try {
        const q = req.query as any;
        res.json({
          ok: true,
          data: await MobileSyncService.listActions(userOf(req), {
            deviceId: q.deviceId,
            status: q.status,
            limit: q.limit,
          }),
          meta: meta(req),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * Counts and the oldest pending action. Read before `/offline/actions` by the
   * console, because "you have 4 writes that have not been applied" is the
   * thing a user needs to see first.
   */
  router.get("/offline/summary", authenticate, async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await MobileSyncService.offlineSummary(userOf(req), orgOf(req)),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  /** The ordered list a device replays, oldest first by server receipt time. */
  router.get(
    "/offline/replay-plan",
    authenticate,
    validate({ query: MobileReplayPlanQuerySchema }),
    async (req, res, next) => {
      try {
        const q = req.query as any;
        await MobileSyncService.assertDeviceOwnership(userOf(req), q.deviceId);
        res.json({
          ok: true,
          data: await MobileSyncService.replayPlan(userOf(req), q.deviceId, q.limit ?? 50),
          meta: meta(req),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /** Detail, including the stored body — the only path that returns it. */
  router.get("/offline/actions/:actionId", authenticate, async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await MobileSyncService.getAction(userOf(req), String(req.params.actionId)),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post(
    "/offline/actions/:actionId/resolve",
    authenticate,
    validate({ body: MobileActionResolveSchema }),
    async (req, res, next) => {
      try {
        const body = req.body as any;
        res.json({
          ok: true,
          data: await MobileSyncService.resolveAction(
            userOf(req),
            String(req.params.actionId),
            body.outcome,
            { statusCode: body.statusCode, error: body.error },
          ),
          meta: meta(req),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  router.post("/offline/actions/:actionId/discard", authenticate, async (req, res, next) => {
    try {
      const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : undefined;
      res.json({
        ok: true,
        data: await MobileSyncService.discardAction(
          userOf(req),
          String(req.params.actionId),
          reason,
        ),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  /* ── Device trust ────────────────────────────────────────────────────── */

  /**
   * The caller's devices with their trust signals. `GET /mobile/devices` still
   * exists and still returns the Session 21 shape; this one adds push and
   * credential counts, staleness, update standing and PIN lock state — and
   * still never returns `pinHash`.
   */
  router.get("/devices/trust", authenticate, async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await MobileSyncService.deviceInventory(userOf(req), orgOf(req)),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/devices/:deviceId/trust", authenticate, async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await MobileSyncService.deviceTrust(
          userOf(req),
          String(req.params.deviceId),
          orgOf(req),
        ),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  /** PIN lock state for one device. Readable so a locked user is told why. */
  router.get("/devices/:deviceId/pin/lock", authenticate, async (req, res, next) => {
    try {
      await MobileSyncService.assertDeviceOwnership(userOf(req), String(req.params.deviceId));
      res.json({
        ok: true,
        data: await MobileSyncService.pinLockState(userOf(req), String(req.params.deviceId)),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  /** Remove a device PIN. There was no way to do this before. */
  router.delete("/devices/:deviceId/pin", authenticate, async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await MobileSyncService.clearPin(userOf(req), String(req.params.deviceId)),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  /* ── Push health ─────────────────────────────────────────────────────── */

  router.get("/push/health", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await MobileSyncService.pushHealth(userOf(req)), meta: meta(req) });
    } catch (e) {
      next(e);
    }
  });

  /* ── Policy ──────────────────────────────────────────────────────────── */

  /** Readable by any member: it describes the rules their own client follows. */
  router.get("/policy", authenticate, async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await MobileSyncService.getPolicy(requireOrg(req)),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  router.put(
    "/policy",
    authenticate,
    requireAdmin,
    validate({ body: MobilePolicyUpdateSchema }),
    async (req, res, next) => {
      try {
        res.json({
          ok: true,
          data: await MobileSyncService.updatePolicy(
            requireOrg(req),
            userOf(req),
            req.body as any,
          ),
          meta: meta(req),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /* ── Assurance ───────────────────────────────────────────────────────── */

  router.get("/assurance/self", authenticate, async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await MobileSyncService.selfAssurance(userOf(req), orgOf(req)),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  /**
   * Configuration, read from this process's environment. Any member may read
   * it: it contains no secret and no other person's data, and it names the one
   * warning every checkout of this repository starts with — the committed
   * development VAPID key pair.
   */
  router.get("/assurance/configuration", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: MobileSyncService.configuration(), meta: meta(req) });
    } catch (e) {
      next(e);
    }
  });

  /** What this mobile surface deliberately does not do. */
  router.get("/assurance/gaps", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: MobileSyncService.gaps(), meta: meta(req) });
    } catch (e) {
      next(e);
    }
  });

  /* ── Ledger ──────────────────────────────────────────────────────────── */

  router.get(
    "/events",
    authenticate,
    validate({ query: MobileEventQuerySchema }),
    async (req, res, next) => {
      try {
        const q = req.query as any;
        res.json({
          ok: true,
          data: await MobileSyncService.listEvents(userOf(req), {
            kind: q.kind,
            deviceId: q.deviceId,
            limit: q.limit,
          }),
          meta: meta(req),
        });
      } catch (e) {
        next(e);
      }
    },
  );
}
