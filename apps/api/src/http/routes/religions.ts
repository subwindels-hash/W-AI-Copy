/**
 * Session 141 — Global Religion, Belief & Spirituality Knowledge routes.
 *
 * Mounted at `/api/v1/religions` (additive; nothing existing is touched).
 * The surface:
 *
 *   Catalog   GET  /catalog                  version + counts + neutrality note
 *             GET  /families                 the 12 families with counts
 *             GET  /search                   deterministic retrieval + filters
 *             GET  /records/:id              record detail (catalog or approved extension)
 *             GET  /records/:id/teach?level= educational levels (beginner → research)
 *             GET  /integrity                catalog integrity report
 *             GET  /stats                    rollup (catalog + extensions + submissions)
 *   Engines   POST /ask                      religion question engine (definition,
 *                                            comparison, truth-claim neutrality, …)
 *             POST /compare                  criteria-based comparison (no winner)
 *   Expansion POST /submissions              ten-step expansion pipeline (org-scoped)
 *             GET  /submissions              list (org-scoped)
 *             GET  /submissions/:id          detail
 *             DELETE /submissions/:id        correction path
 *             PATCH /submissions/:id         Super Admin approve/reject (+note)
 *
 * Neutrality is structural: comparisons attribute each tradition's own
 * teachings; truth-claim questions receive the neutrality policy answer; the
 * catalog never ranks religions.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { AppError } from "../../utils/result.js";
import { ReligionsService } from "../../religions/religions.service.js";
import {
  ReligionAskSchema,
  ReligionCompareSchema,
  ReligionSearchQuerySchema,
  ReligionSubmissionCreateSchema,
  ReligionSubmissionsQuerySchema,
  ReligionSubmissionReviewSchema,
} from "@windels/shared";

const IdParam = z.object({ id: z.string().min(1).max(64) });
const TeachQuery = z.object({ level: z.enum(["beginner", "intermediate", "advanced", "research"]).default("intermediate") });

export function registerReligionsRoutes(router: Router) {
  const orgOf = (req: any): string => {
    const org = req.user?.organizationId ?? null;
    if (!org) throw AppError.forbidden("The religion expansion pipeline is organization-scoped and this session carries no organization.");
    return org;
  };
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });

  /* ── Catalog ───────────────────────────────────────────────────────── */

  router.get("/catalog", async (req, res, next) => {
    try {
      res.json({ ok: true, data: ReligionsService.catalogMeta(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/families", async (req, res, next) => {
    try {
      res.json({ ok: true, data: ReligionsService.listFamilies(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/integrity", async (req, res, next) => {
    try {
      res.json({ ok: true, data: ReligionsService.integrity(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/search", validate({ query: ReligionSearchQuerySchema }), async (req, res, next) => {
    try {
      const org = req.user?.organizationId ?? null;
      res.json({ ok: true, data: await ReligionsService.search(org, req.query as any), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/records/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const record = await ReligionsService.getRecordAnywhere(req.params.id);
      if (!record) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Religion record not found" } });
      res.json({ ok: true, data: record, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/records/:id/teach", validate({ params: IdParam, query: TeachQuery }), async (req, res, next) => {
    try {
      const taught = await ReligionsService.teach(req.params.id, req.query.level as any);
      if (!taught) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Religion record not found" } });
      res.json({ ok: true, data: taught, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Engines ───────────────────────────────────────────────────────── */

  router.post("/ask", validate({ body: ReligionAskSchema }), async (req, res, next) => {
    try {
      const org = req.user?.organizationId ?? null;
      const data = await ReligionsService.ask(org, {
        question: req.body.question,
        level: req.body.level,
        limit: req.body.limit,
      });
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/compare", validate({ body: ReligionCompareSchema }), async (req, res, next) => {
    try {
      const data = await ReligionsService.compare(req.body.recordIds);
      if (data.missing.length > 0 && data.items.length === 0) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: `No records found: ${data.missing.join(", ")}` } });
      }
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Expansion pipeline (§18) ──────────────────────────────────────── */

  router.post("/submissions", validate({ body: ReligionSubmissionCreateSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const sub = await ReligionsService.createSubmission(oid, req.user!.id, req.body);
      res.status(201).json({ ok: true, data: sub, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/submissions", validate({ query: ReligionSubmissionsQuerySchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const subs = await ReligionsService.listSubmissions(oid, req.query as any);
      res.json({ ok: true, data: subs, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/submissions/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const sub = await ReligionsService.getSubmission(oid, req.params.id);
      if (!sub) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Submission not found in this organization" } });
      res.json({ ok: true, data: sub, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.delete("/submissions/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const deleted = await ReligionsService.deleteSubmission(oid, req.params.id);
      if (!deleted) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Submission not found in this organization" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.patch("/submissions/:id", validate({ params: IdParam, body: ReligionSubmissionReviewSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const decision = req.body.status;
      const sub = await ReligionsService.reviewSubmission(oid, { id: req.user!.id, role: req.user!.role ?? null }, req.params.id, decision, req.body.reviewNote);
      if (!sub) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Submission not found in this organization" } });
      res.json({ ok: true, data: sub, meta: meta(req) });
    } catch (e) { next(e); }
  });
}
