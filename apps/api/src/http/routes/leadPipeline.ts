/**
 * Session 115 — Lead Discovery pipeline routes.
 *
 * Mounted on a second `/lead-discovery` router registered *before* Session 85's,
 * so an unmatched request falls straight through to `POST /search`,
 * `GET /leads`, `GET|POST /collections`, `POST /collections/:id/leads` and
 * `POST /export` with their behaviour unchanged. None of the paths here collide
 * with those six.
 *
 * `authenticate` is attached per handler rather than with `router.use`, so this
 * router never changes the authentication of a path it does not itself serve.
 *
 * Who may do what: any authenticated member can work the pipeline — statuses,
 * owners, notes, renames — because that is the daily job. The two operations
 * that change many records at once or destroy a grouping (`POST
 * /duplicates/resolve`, `DELETE /collections/:id`) require an administrator.
 *
 * Every path is organization-scoped by `req.user.organizationId` and fails
 * closed when the session carries no organization; Session 85's routes
 * interpolate that value directly, so a session without one would write to a
 * key containing the string "undefined".
 */
import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  LeadCollectionIdParamSchema,
  LeadCollectionLeadParamSchema,
  LeadCollectionRenameSchema,
  LeadExportPreviewSchema,
  LeadHistoryQuerySchema,
  LeadIdParamSchema,
  LeadNoteCreateSchema,
  LeadOwnerUpdateSchema,
  LeadQuerySchema,
  LeadStatusUpdateSchema,
} from "@windels/shared/leadDiscovery";
import { LeadPipelineService } from "../../leadDiscovery/leadPipeline.service.js";
import { AppError } from "../../utils/result.js";

export function registerLeadPipelineRoutes(router: Router) {
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });
  const orgOf = (req: any): string => {
    const org = req.user?.organizationId;
    if (!org) {
      throw AppError.forbidden(
        "Lead discovery is organization-scoped and this session carries no organization.",
      );
    }
    return org;
  };
  const userOf = (req: any): string | null => req.user?.id ?? null;

  /* ── Rollups ─────────────────────────────────────────────────────────── */

  router.get("/summary", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await LeadPipelineService.summary(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/coverage", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await LeadPipelineService.coverage(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/history", authenticate, validate({ query: LeadHistoryQuerySchema }), async (req, res, next) => {
    try {
      const { limit } = req.query as unknown as { limit: number };
      res.json({ ok: true, data: await LeadPipelineService.history(orgOf(req), limit), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── The pipeline ────────────────────────────────────────────────────── */

  /**
   * Filtered, paged leads joined with pipeline state. Session 85's `GET /leads`
   * still serves its unfiltered window of raw provider records.
   */
  router.get("/pipeline", authenticate, validate({ query: LeadQuerySchema }), async (req, res, next) => {
    try {
      const data = await LeadPipelineService.listLeads(orgOf(req), req.query as any);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/leads/:id", authenticate, validate({ params: LeadIdParamSchema }), async (req, res, next) => {
    try {
      const data = await LeadPipelineService.getLead(orgOf(req), req.params.id);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.patch(
    "/leads/:id/status",
    authenticate,
    validate({ params: LeadIdParamSchema, body: LeadStatusUpdateSchema }),
    async (req, res, next) => {
      try {
        const data = await LeadPipelineService.setStatus(orgOf(req), req.params.id, req.body, userOf(req));
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.patch(
    "/leads/:id/owner",
    authenticate,
    validate({ params: LeadIdParamSchema, body: LeadOwnerUpdateSchema }),
    async (req, res, next) => {
      try {
        const data = await LeadPipelineService.setOwner(orgOf(req), req.params.id, req.body.ownerId, userOf(req));
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.get(
    "/leads/:id/notes",
    authenticate,
    validate({ params: LeadIdParamSchema }),
    async (req, res, next) => {
      try {
        const data = await LeadPipelineService.listNotes(orgOf(req), req.params.id);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.post(
    "/leads/:id/notes",
    authenticate,
    validate({ params: LeadIdParamSchema, body: LeadNoteCreateSchema }),
    async (req, res, next) => {
      try {
        const data = await LeadPipelineService.addNote(orgOf(req), req.params.id, req.body.body, userOf(req));
        res.status(201).json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  /* ── Deduplication ───────────────────────────────────────────────────── */

  router.get("/duplicates", authenticate, async (req, res, next) => {
    try {
      res.json({ ok: true, data: await LeadPipelineService.duplicates(orgOf(req)), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /** Bulk mutation across the whole organization — administrator only. */
  router.post("/duplicates/resolve", authenticate, requireAdmin, async (req, res, next) => {
    try {
      const data = await LeadPipelineService.resolveDuplicates(orgOf(req), userOf(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Collection maintenance ──────────────────────────────────────────── */

  router.get(
    "/collections/:id",
    authenticate,
    validate({ params: LeadCollectionIdParamSchema }),
    async (req, res, next) => {
      try {
        const data = await LeadPipelineService.collection(orgOf(req), req.params.id);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.patch(
    "/collections/:id",
    authenticate,
    validate({ params: LeadCollectionIdParamSchema, body: LeadCollectionRenameSchema }),
    async (req, res, next) => {
      try {
        const data = await LeadPipelineService.renameCollection(orgOf(req), req.params.id, req.body.name);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.delete(
    "/collections/:id",
    authenticate,
    requireAdmin,
    validate({ params: LeadCollectionIdParamSchema }),
    async (req, res, next) => {
      try {
        const data = await LeadPipelineService.deleteCollection(orgOf(req), req.params.id);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.delete(
    "/collections/:id/leads/:leadId",
    authenticate,
    validate({ params: LeadCollectionLeadParamSchema }),
    async (req, res, next) => {
      try {
        const data = await LeadPipelineService.removeLeadFromCollection(
          orgOf(req),
          req.params.id,
          req.params.leadId,
        );
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  /* ── Export ──────────────────────────────────────────────────────────── */

  /** What the CSV would contain, including the columns that will be empty. */
  router.post(
    "/export/preview",
    authenticate,
    validate({ body: LeadExportPreviewSchema }),
    async (req, res, next) => {
      try {
        const data = await LeadPipelineService.exportPreview(orgOf(req), req.body.leadIds);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  /**
   * CSV including the pipeline columns, every cell passed through the formula
   * guard. Session 85's `POST /export` is untouched and still serves its
   * original eleven columns.
   */
  router.post(
    "/export/csv",
    authenticate,
    validate({ body: LeadExportPreviewSchema }),
    async (req, res, next) => {
      try {
        const { csv } = await LeadPipelineService.exportCsv(orgOf(req), req.body.leadIds);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=windels-leads-pipeline.csv");
        res.send(csv);
      } catch (e) { next(e); }
    },
  );
}
