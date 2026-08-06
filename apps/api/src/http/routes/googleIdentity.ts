/**
 * Session 114 — Google Identity governance routes.
 *
 * Mounted on an `/auth/google` sub-router that is registered *before* the
 * original OAuth endpoints (`GET /auth/google`, `/auth/google/status`,
 * `/auth/google/callback`). None of the paths here collide with those three,
 * and because this router deliberately does **not** call
 * `router.use(authenticate)` — each handler attaches it individually — an
 * unmatched request falls straight through to the OAuth handlers with their
 * behaviour, including their unauthenticated status, unchanged.
 *
 * Reads need an authenticated caller. Anything that changes who may sign in —
 * the policy, a revoke, a restore, an unlink — needs an administrator. The two
 * `/me` endpoints are the exception: they act only on the caller's own linked
 * identity, so any authenticated user may use them.
 *
 * Every path is organization-scoped by `req.user.organizationId` and fails
 * closed when the caller has no organization.
 */
import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  GoogleAuthPolicyUpdateSchema,
  GoogleEventQuerySchema,
  GoogleIdentityIdParamSchema,
  GoogleIdentityQuerySchema,
  GoogleIdentityRevokeSchema,
  GooglePolicyEvaluateSchema,
} from "@windels/shared/googleAuth";
import { GoogleIdentityService } from "../../googleAuth/googleIdentity.service.js";
import { AppError } from "../../utils/result.js";

export function registerGoogleIdentityRoutes(router: Router) {
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });
  const orgOf = (req: any): string => {
    const org = req.user?.organizationId;
    if (!org) {
      throw AppError.forbidden(
        "Google identity governance is organization-scoped and this session carries no organization.",
      );
    }
    return org;
  };
  const userOf = (req: any): string | null => req.user?.id ?? null;

  /* ── Rollup ──────────────────────────────────────────────────────────── */

  router.get("/summary", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await GoogleIdentityService.summary(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /**
   * Configuration report. Administrator-only: it names the redirect URI and
   * whether a secret is present, which is deployment detail rather than
   * something every member needs.
   */
  router.get("/config", authenticate, requireAdmin, async (req, res, next) => {
    try {
      res.json({ ok: true, data: GoogleIdentityService.config(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Policy ──────────────────────────────────────────────────────────── */

  router.get("/policy", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await GoogleIdentityService.getPolicy(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.put("/policy", authenticate, requireAdmin, validate({ body: GoogleAuthPolicyUpdateSchema }), async (req, res, next) => {
    try {
      const data = await GoogleIdentityService.updatePolicy(orgOf(req), req.body, userOf(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.delete("/policy", authenticate, requireAdmin, async (req, res, next) => {
    try {
      const data = await GoogleIdentityService.resetPolicy(orgOf(req), userOf(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /** Dry run: evaluates an address against the stored policy, writes nothing. */
  router.post("/policy/evaluate", authenticate, requireAdmin, validate({ body: GooglePolicyEvaluateSchema }), async (req, res, next) => {
    try {
      const data = await GoogleIdentityService.evaluate(orgOf(req), req.body);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Caller's own identity ───────────────────────────────────────────── */

  router.get("/me", authenticate, async (req, res, next) => {
    try {
      const data = await GoogleIdentityService.self(orgOf(req), (req as any).user.id, (req as any).user.email ?? null);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/me/revoke", authenticate, validate({ body: GoogleIdentityRevokeSchema }), async (req, res, next) => {
    try {
      const data = await GoogleIdentityService.revokeOwn(
        orgOf(req),
        (req as any).user.id,
        (req as any).user.email ?? null,
        req.body?.reason,
      );
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Linked identities ───────────────────────────────────────────────── */

  router.get("/identities", authenticate, validate({ query: GoogleIdentityQuerySchema }), async (req, res, next) => {
    try {
      const data = await GoogleIdentityService.listIdentities(orgOf(req), req.query as any);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/identities/:id", authenticate, validate({ params: GoogleIdentityIdParamSchema }), async (req, res, next) => {
    try {
      const data = await GoogleIdentityService.getIdentity(orgOf(req), req.params.id);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post(
    "/identities/:id/revoke",
    authenticate,
    requireAdmin,
    validate({ params: GoogleIdentityIdParamSchema, body: GoogleIdentityRevokeSchema }),
    async (req, res, next) => {
      try {
        const data = await GoogleIdentityService.revokeIdentity(orgOf(req), req.params.id, userOf(req), req.body?.reason);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.post(
    "/identities/:id/restore",
    authenticate,
    requireAdmin,
    validate({ params: GoogleIdentityIdParamSchema }),
    async (req, res, next) => {
      try {
        const data = await GoogleIdentityService.restoreIdentity(orgOf(req), req.params.id, userOf(req));
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.delete("/identities/:id", authenticate, requireAdmin, validate({ params: GoogleIdentityIdParamSchema }), async (req, res, next) => {
    try {
      const data = await GoogleIdentityService.unlinkIdentity(orgOf(req), req.params.id, userOf(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Ledger and rollups ──────────────────────────────────────────────── */

  router.get("/events", authenticate, requireAdmin, validate({ query: GoogleEventQuerySchema }), async (req, res, next) => {
    try {
      const data = await GoogleIdentityService.listEvents(orgOf(req), req.query as any);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/domains", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await GoogleIdentityService.domains(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });
}
