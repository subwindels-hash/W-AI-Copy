/**
 * Session 144 — Global Politics, Government & Political History routes.
 *
 * Mounted at `/api/v1/politics` (additive). The surface:
 *
 *   Catalog   GET  /catalog                 version + counts + neutrality note
 *             GET  /search                  natural-language search (§30)
 *             GET  /records/:id             record detail
 *             GET  /records/:id/history     versioned field history (§29)
 *             GET  /kinds                   entity-kind counts
 *   Engines   POST /ask                     question engine (§26)
 *             POST /compare                 neutral country comparison
 *             POST /claim                   fact-vs-opinion engine (§23)
 *             GET  /timeline/:countryId     country political timeline (§18)
 *             GET  /leaders/:countryId      leader timeline (§19)
 *             GET  /graph | /graph/:id      political relationship graph (§20)
 *             POST /graph/answer            complex graph questions
 *   Education POST /quiz                    deterministic quiz (§31)
 *             GET  /education/catalog       every record as a lesson
 *   Updates   POST /updates                 update engine submission (§28)
 *             GET  /updates | /updates/:id
 *             PATCH /updates/:id            Super Admin apply/reject
 *             GET  /stats, /integrity
 *
 * Catalog reads work for any authenticated session; the update engine is
 * organization-scoped; applying updates is Super Admin-only.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { AppError } from "../../utils/result.js";
import { PoliticsService } from "../../politics/politics.service.js";
import {
  PoliticsAskSchema,
  PoliticsClaimSchema,
  PoliticsCompareSchema,
  PoliticsQuizSchema,
  PoliticsSearchQuerySchema,
  PoliticsUpdateCreateSchema,
  PoliticsUpdatesQuerySchema,
  PoliticsUpdateReviewSchema,
} from "@windels/shared";

const IdParam = z.object({ id: z.string().min(1).max(64) });
const CountryParam = z.object({ countryId: z.string().min(1).max(64) });

export function registerPoliticsRoutes(router: Router) {
  const orgOf = (req: any): string => {
    const org = req.user?.organizationId ?? null;
    if (!org) throw AppError.forbidden("The politics update engine is organization-scoped and this session carries no organization.");
    return org;
  };
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });

  /* ── Catalog ──────────────────────────────────────────────────────── */

  router.get("/catalog", async (req, res, next) => {
    try {
      res.json({ ok: true, data: PoliticsService.catalogMeta(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/kinds", async (req, res, next) => {
    try {
      res.json({ ok: true, data: PoliticsService.catalogMeta().byKind, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/integrity", async (req, res, next) => {
    try {
      res.json({ ok: true, data: PoliticsService.integrity(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/search", validate({ query: PoliticsSearchQuerySchema }), async (req, res, next) => {
    try {
      const org = req.user?.organizationId ?? null;
      res.json({ ok: true, data: await PoliticsService.search(org, req.query as any), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/records/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const record = PoliticsService.getRecord(req.params.id);
      if (!record) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Political record not found" } });
      res.json({ ok: true, data: record, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/records/:id/history", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const field = String(req.query.field ?? "currentSituation");
      res.json({ ok: true, data: await PoliticsService.fieldHistory(oid, req.params.id, field), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Engines ──────────────────────────────────────────────────────── */

  router.post("/ask", validate({ body: PoliticsAskSchema }), async (req, res, next) => {
    try {
      const org = req.user?.organizationId ?? null;
      const data = await PoliticsService.ask(org, {
        question: req.body.question,
        level: req.body.level,
        limit: req.body.limit,
      });
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/compare", validate({ body: PoliticsCompareSchema }), async (req, res, next) => {
    try {
      const data = PoliticsService.compareCountry(req.body.countryIds);
      if (data.missing.length > 0 && data.items.length === 0) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: `No countries found: ${data.missing.join(", ")}` } });
      }
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/claim", validate({ body: PoliticsClaimSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: PoliticsService.classifyClaim(req.body.text), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/timeline/:countryId", validate({ params: CountryParam }), async (req, res, next) => {
    try {
      const data = PoliticsService.countryTimeline(req.params.countryId);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Country not found" } });
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/leaders/:countryId", validate({ params: CountryParam }), async (req, res, next) => {
    try {
      const country = PoliticsService.getRecord(req.params.countryId);
      if (!country) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Country not found" } });
      res.json({ ok: true, data: PoliticsService.leaderTimeline(req.params.countryId), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/graph", async (req, res, next) => {
    try {
      res.json({ ok: true, data: PoliticsService.graphStats(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/graph/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const node = PoliticsService.graphNode(req.params.id);
      if (!node) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Record not found" } });
      res.json({ ok: true, data: node, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/graph/answer", validate({ body: z.object({ question: z.string().min(3).max(500) }) }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await PoliticsService.graphAnswer(req.body.question), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Education ────────────────────────────────────────────────────── */

  router.get("/education/catalog", async (req, res, next) => {
    try {
      const catalog = PoliticsService.listByKind("country").map((c) => ({
        courseId: c.id,
        title: c.name,
        kind: c.kind,
        summary: c.summary,
      }));
      res.json({ ok: true, data: catalog, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/quiz", validate({ body: PoliticsQuizSchema }), async (req, res, next) => {
    try {
      const quiz = await PoliticsService.quiz(req.body.topicId, req.body.level, req.body.count);
      if (!quiz) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Topic not found" } });
      res.json({ ok: true, data: quiz, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Update engine (§28/§29) ──────────────────────────────────────── */

  router.post("/updates", validate({ body: PoliticsUpdateCreateSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const update = await PoliticsService.createUpdate(oid, req.user!.id, req.body);
      res.status(201).json({ ok: true, data: update, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/updates", validate({ query: PoliticsUpdatesQuerySchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      res.json({ ok: true, data: await PoliticsService.listUpdates(oid, req.query as any), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/updates/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const update = await PoliticsService.getUpdate(oid, req.params.id);
      if (!update) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Update not found in this organization" } });
      res.json({ ok: true, data: update, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.patch("/updates/:id", validate({ params: IdParam, body: PoliticsUpdateReviewSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const update = await PoliticsService.reviewUpdate(oid, { id: req.user!.id, role: req.user!.role ?? null }, req.params.id, req.body.status, req.body.reviewNote);
      if (!update) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Update not found in this organization" } });
      res.json({ ok: true, data: update, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/stats", async (req, res, next) => {
    try {
      const org = req.user?.organizationId ?? null;
      res.json({ ok: true, data: await PoliticsService.stats(org), meta: meta(req) });
    } catch (e) { next(e); }
  });
}
