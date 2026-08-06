/**
 * Session 116 — MFA assurance routes.
 *
 * Mounted on a second `/mfa` router registered *before* the original six
 * endpoints, so an unmatched request falls straight through to `GET
 * /mfa/status`, `POST /mfa/enable`, `/mfa/confirm`, `/mfa/verify`,
 * `/mfa/disable` and `/mfa/recovery-codes` with their behaviour unchanged. None
 * of the paths here collide with those six.
 *
 * `authenticate` is attached per handler rather than with `router.use`, so this
 * router never changes the authentication of a path it does not itself serve.
 *
 * Who may do what: a member can always read and act on their own second factor
 * (`/policy`, `/coverage/me`, `/enrollment`, `/enrollment/abandon`,
 * `/recovery/health`, `/lock`, `/events/me`). Everything that reads or changes
 * another person's standing — coverage, the organization ledger, locks,
 * exemptions and the policy itself — requires an administrator.
 *
 * Every administrative path is organization-scoped by
 * `req.user.organizationId` and fails closed when the session carries no
 * organization.
 */
import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  MfaCoverageQuerySchema,
  MfaEventQuerySchema,
  MfaExemptionCreateSchema,
  MfaPolicyUpdateSchema,
  MfaUserIdParamSchema,
} from "@windels/shared/mfa";
import { MfaAssuranceService } from "../../mfa/mfaAssurance.service.js";
import { AppError } from "../../utils/result.js";

export function registerMfaAssuranceRoutes(router: Router) {
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });
  const orgOf = (req: any): string => {
    const org = req.user?.organizationId;
    if (!org) {
      throw AppError.forbidden(
        "MFA assurance is organization-scoped and this session carries no organization.",
      );
    }
    return org;
  };
  const userOf = (req: any): string => req.user!.id;

  /* ── Rollups ─────────────────────────────────────────────────────────── */

  router.get("/assurance/summary", authenticate, requireAdmin, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await MfaAssuranceService.summary(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/assurance/gaps", authenticate, requireAdmin, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await MfaAssuranceService.gaps(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /**
   * What this deployment is configured to do. Readable by any member because it
   * contains no secret and no other person's data — only parameters, thresholds
   * and whether an encryption key is present (never its value).
   */
  router.get("/assurance/configuration", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: MfaAssuranceService.configuration(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Policy ──────────────────────────────────────────────────────────── */

  router.get("/policy", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await MfaAssuranceService.getPolicy(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.put(
    "/policy",
    authenticate,
    requireAdmin,
    validate({ body: MfaPolicyUpdateSchema }),
    async (req, res, next) => {
      try {
        const data = await MfaAssuranceService.setPolicy(orgOf(req), req.body, { id: userOf(req) });
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  /* ── Coverage ────────────────────────────────────────────────────────── */

  router.get(
    "/coverage",
    authenticate,
    requireAdmin,
    validate({ query: MfaCoverageQuerySchema }),
    async (req, res, next) => {
      try {
        const data = await MfaAssuranceService.coverage(orgOf(req), req.query as any);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  /** A member's own standing — no administrator rights required to see it. */
  router.get("/coverage/me", authenticate, async (req, res, next) => {
    try {
      const data = await MfaAssuranceService.selfView(userOf(req), req.user?.organizationId ?? null);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Enrolment lifecycle ─────────────────────────────────────────────── */

  router.get("/enrollment", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await MfaAssuranceService.getEnrollment(userOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /**
   * Walk out of an enrolment that was started and never confirmed. This is the
   * lockout escape hatch: `POST /mfa/enable` stores the secret immediately, so
   * a user who closed the tab before scanning could not otherwise get past the
   * challenge. A *confirmed* enrolment is untouched by this and still needs a
   * valid code through `POST /mfa/disable`.
   */
  router.post("/enrollment/abandon", authenticate, async (req, res, next) => {
    try {
      const data = await MfaAssuranceService.abandonEnrollment(
        userOf(req),
        req.user?.organizationId ?? null,
      );
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Recovery codes and throttle state ───────────────────────────────── */

  router.get("/recovery/health", authenticate, async (req, res, next) => {
    try {
      const data = await MfaAssuranceService.recoveryHealth(userOf(req), req.user?.organizationId ?? null);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /** Preflight: is this account currently throttled, and for how long. */
  router.get("/lock", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await MfaAssuranceService.lockState(userOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/locks", authenticate, requireAdmin, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await MfaAssuranceService.listLocks(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post(
    "/locks/:userId/clear",
    authenticate,
    requireAdmin,
    validate({ params: MfaUserIdParamSchema }),
    async (req, res, next) => {
      try {
        const data = await MfaAssuranceService.clearLock(orgOf(req), req.params.userId, userOf(req));
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  /* ── Exemptions ──────────────────────────────────────────────────────── */

  router.get("/exemptions", authenticate, requireAdmin, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await MfaAssuranceService.listExemptions(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post(
    "/exemptions",
    authenticate,
    requireAdmin,
    validate({ body: MfaExemptionCreateSchema }),
    async (req, res, next) => {
      try {
        const data = await MfaAssuranceService.grantExemption(orgOf(req), req.body, userOf(req));
        res.status(201).json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.delete(
    "/exemptions/:userId",
    authenticate,
    requireAdmin,
    validate({ params: MfaUserIdParamSchema }),
    async (req, res, next) => {
      try {
        const data = await MfaAssuranceService.revokeExemption(orgOf(req), req.params.userId, userOf(req));
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  /* ── Ledger ──────────────────────────────────────────────────────────── */

  router.get(
    "/events",
    authenticate,
    requireAdmin,
    validate({ query: MfaEventQuerySchema }),
    async (req, res, next) => {
      try {
        const data = await MfaAssuranceService.events(orgOf(req), req.query as any);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.get(
    "/events/me",
    authenticate,
    validate({ query: MfaEventQuerySchema }),
    async (req, res, next) => {
      try {
        const data = await MfaAssuranceService.memberEvents(userOf(req), req.query as any);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );
}
