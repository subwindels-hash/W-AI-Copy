/**
 * Session 118 — Operational-excellence assurance.
 *
 * Registered on the same `/opex` router as Session 73's three endpoints, and
 * *before* them, so `GET /opex/dashboard/rollup`, `POST /opex/safety-alerts`
 * and `POST /opex/safety-alerts/:id/status` keep their paths and payloads. None
 * of the paths here collide with those: the register lives under
 * `/register/...`, not `/safety-alerts/...`.
 *
 * `authenticate` is already applied to the `/opex` router in `server.ts`, so it
 * is not repeated here; `requireAdmin` is attached to every handler that
 * changes state, matching the access rules Session 73 chose for the two write
 * endpoints it shipped.
 *
 * Every read is organization-scoped from `req.user.organizationId`. A session
 * carrying no organization is refused rather than falling back to a default,
 * which would read another tenant's register.
 */
import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  OpexAlertIdParamSchema,
  OpexAlertQuerySchema,
  OpexAssessmentInputSchema,
  OpexDimensionParamSchema,
  OpexEventQuerySchema,
  OpexPolicyUpdateSchema,
  OpexReopenSchema,
  OpexWindowQuerySchema,
} from "@windels/shared/opex";
import { OpexAssuranceService } from "../../opex/opexAssurance.service.js";
import { AppError } from "../../utils/result.js";

export function registerOpexAssuranceRoutes(router: Router) {
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });
  const orgOf = (req: any): string => {
    const org = req.user?.organizationId ?? null;
    if (!org) {
      throw AppError.forbidden(
        "The operational-excellence register is organization-scoped and this session carries no organization.",
      );
    }
    return org;
  };
  const userOf = (req: any): string => req.user!.id;

  /* ── Register ────────────────────────────────────────────────────────── */

  router.get(
    "/register/alerts",
    validate({ query: OpexAlertQuerySchema }),
    async (req, res, next) => {
      try {
        const q = req.query as any;
        res.json({
          ok: true,
          data: await OpexAssuranceService.listAlerts(orgOf(req), {
            status: q.status,
            severity: q.severity,
            category: q.category,
            limit: q.limit,
          }),
          meta: meta(req),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  router.get("/register/summary", async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await OpexAssuranceService.registerSummary(orgOf(req)),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  /** Median and p90 time-to-acknowledge / time-to-resolve, with exclusions stated. */
  router.get("/register/timings", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await OpexAssuranceService.timings(orgOf(req)), meta: meta(req) });
    } catch (e) {
      next(e);
    }
  });

  /** Findings older than this organization's own stated expectation. */
  router.get("/register/breaches", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await OpexAssuranceService.breaches(orgOf(req)), meta: meta(req) });
    } catch (e) {
      next(e);
    }
  });

  router.get(
    "/register/alerts/:alertId",
    validate({ params: OpexAlertIdParamSchema }),
    async (req, res, next) => {
      try {
        res.json({
          ok: true,
          data: await OpexAssuranceService.getAlert(orgOf(req), String(req.params.alertId)),
          meta: meta(req),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /** The append-only transition history for one finding. */
  router.get(
    "/register/alerts/:alertId/history",
    validate({ params: OpexAlertIdParamSchema }),
    async (req, res, next) => {
      try {
        const record = await OpexAssuranceService.getAlert(orgOf(req), String(req.params.alertId));
        res.json({
          ok: true,
          data: {
            alertId: record.id,
            transitions: record.transitions,
            reopenCount: record.reopenCount,
            importedFromLegacyRegister: record.importedFromLegacyRegister,
            note: record.importedFromLegacyRegister
              ? "This finding was adopted from the Session 73 register, which stored no transition history. Its history begins at adoption."
              : "Transitions are append-only; a reopen adds an entry, it does not erase the resolution it undoes.",
          },
          meta: meta(req),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /**
   * Reopen a resolved finding. There was no way to do this before: the Session
   * 73 handler refused every change to a resolved record, so a mis-resolution
   * was permanent.
   */
  router.post(
    "/register/alerts/:alertId/reopen",
    requireAdmin,
    validate({ params: OpexAlertIdParamSchema, body: OpexReopenSchema }),
    async (req, res, next) => {
      try {
        res.json({
          ok: true,
          data: await OpexAssuranceService.reopenAlert(
            orgOf(req),
            String(req.params.alertId),
            userOf(req),
            String((req.body as any).reason),
          ),
          meta: meta(req),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /* ── Reliability ─────────────────────────────────────────────────────── */

  router.get("/reliability", validate({ query: OpexWindowQuerySchema }), async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await OpexAssuranceService.reliability(orgOf(req), (req.query as any).windowDays),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  router.get(
    "/reliability/failures",
    validate({ query: OpexWindowQuerySchema }),
    async (req, res, next) => {
      try {
        res.json({
          ok: true,
          data: await OpexAssuranceService.failureBreakdown(
            orgOf(req),
            (req.query as any).windowDays,
          ),
          meta: meta(req),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /* ── Assessments and trust ───────────────────────────────────────────── */

  router.get("/assessments", async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await OpexAssuranceService.listAssessments(orgOf(req)),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  router.put(
    "/assessments/:dimension",
    requireAdmin,
    validate({ params: OpexDimensionParamSchema, body: OpexAssessmentInputSchema }),
    async (req, res, next) => {
      try {
        const body = req.body as any;
        res.json({
          ok: true,
          data: await OpexAssuranceService.recordAssessment(
            orgOf(req),
            (req.params as any).dimension,
            userOf(req),
            { score: body.score, method: body.method, note: body.note },
          ),
          meta: meta(req),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  router.delete(
    "/assessments/:dimension",
    requireAdmin,
    validate({ params: OpexDimensionParamSchema }),
    async (req, res, next) => {
      try {
        res.json({
          ok: true,
          data: await OpexAssuranceService.clearAssessment(
            orgOf(req),
            (req.params as any).dimension,
            userOf(req),
          ),
          meta: meta(req),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /** Every dimension with the basis it was obtained on, and no composite score. */
  router.get("/trust", async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await OpexAssuranceService.trustReport(orgOf(req)),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  /* ── Policy ──────────────────────────────────────────────────────────── */

  router.get("/policy", async (req, res, next) => {
    try {
      res.json({
        ok: true,
        data: await OpexAssuranceService.getPolicy(orgOf(req)),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  router.put(
    "/policy",
    requireAdmin,
    validate({ body: OpexPolicyUpdateSchema }),
    async (req, res, next) => {
      try {
        res.json({
          ok: true,
          data: await OpexAssuranceService.updatePolicy(orgOf(req), userOf(req), req.body as any),
          meta: meta(req),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  /* ── Assurance ───────────────────────────────────────────────────────── */

  router.get("/assurance/summary", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await OpexAssuranceService.summary(orgOf(req)), meta: meta(req) });
    } catch (e) {
      next(e);
    }
  });

  /**
   * What this deployment implements. Read by any member: it holds no secret and
   * no other tenant's data, and it names the sections of the Session 73 rollup
   * that report structural zeros.
   */
  router.get("/assurance/configuration", async (req, res, next) => {
    try {
      res.json({ ok: true, data: OpexAssuranceService.configuration(), meta: meta(req) });
    } catch (e) {
      next(e);
    }
  });

  router.get("/assurance/gaps", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await OpexAssuranceService.gaps(orgOf(req)), meta: meta(req) });
    } catch (e) {
      next(e);
    }
  });

  /** Provenance for the Session 73 rollup, field by field. */
  router.get("/assurance/provenance", async (req, res, next) => {
    try {
      const reliability = await OpexAssuranceService.reliability(orgOf(req));
      const register = await OpexAssuranceService.registerSummary(orgOf(req));
      res.json({
        ok: true,
        data: OpexAssuranceService.provenance({
          reliability: reliability.total > 0,
          freshness: reliability.lastRequestAt !== null,
          register: register.total > 0,
        }),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });

  /* ── Ledger ──────────────────────────────────────────────────────────── */

  router.get("/events", validate({ query: OpexEventQuerySchema }), async (req, res, next) => {
    try {
      const q = req.query as any;
      res.json({
        ok: true,
        data: await OpexAssuranceService.listEvents(orgOf(req), {
          kind: q.kind,
          alertId: q.alertId,
          limit: q.limit,
        }),
        meta: meta(req),
      });
    } catch (e) {
      next(e);
    }
  });
}
