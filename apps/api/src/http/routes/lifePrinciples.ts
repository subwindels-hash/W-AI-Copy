/**
 * Session 150 — Life Operating Principles Engine routes.
 *
 * Mounted at `/api/v1/life-principles` (additive; nothing existing is
 * touched). The surface:
 *
 *   Catalog  GET  /catalog                  version + counts + framing note
 *            GET  /parts                    the 10 rule parts with counts
 *            GET  /rules                    list (part filter, pagination)
 *            GET  /rules/:number            single rule by number (1–115)
 *            POST /search                   deterministic text search
 *            GET  /integrity                catalog integrity report
 *   Engines  POST /ask                      Life Coaching Engine (13 areas;
 *                                           "rules of life" → area menu)
 *            GET  /areas                    the 13 coaching areas
 *            GET  /daily                    Daily Rules Mode (deterministic
 *                                           per date; ?date=YYYY-MM-DD or
 *                                           ?rule=N override)
 *            POST /decision                 Decision Mode (10-question
 *                                           framework; never decides for the
 *                                           user)
 *            GET  /philosophy               the 12 "X without Y" balance pairs
 *            GET  /principle                Part X — the WINDELS Principle
 *
 * Neutrality is structural: the catalog presents practical principles, not
 * absolute laws; the coaching engine never claims a universal way to live;
 * decision mode returns a thinking framework, never a verdict.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { AppError } from "../../utils/result.js";
import { LifePrinciplesService } from "../../lifePrinciples/lifePrinciples.service.js";
import { LifeAskSchema, LifeDecisionInputSchema, LifeSearchQuerySchema } from "@windels/shared";

const NumberParam = z.object({ number: z.coerce.number().int().min(1).max(115) });
const DailyQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rule: z.coerce.number().int().min(1).max(115).optional(),
});
const RulesQuery = z.object({
  part: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(115).optional(),
  offset: z.coerce.number().int().min(0).max(115).optional(),
});

export function registerLifePrinciplesRoutes(router: Router) {
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });

  /* ── Catalog ───────────────────────────────────────────────────────── */

  router.get("/catalog", async (req, res, next) => {
    try {
      res.json({ ok: true, data: LifePrinciplesService.catalogMeta(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/parts", async (req, res, next) => {
    try {
      res.json({ ok: true, data: LifePrinciplesService.parts(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/rules", validate({ query: RulesQuery }), async (req, res, next) => {
    try {
      const q = req.query as z.infer<typeof RulesQuery>;
      const data = LifePrinciplesService.listRules({
        part: q.part,
        limit: q.limit,
        offset: q.offset,
      });
      res.json({
        ok: true,
        data,
        meta: { ...meta(req), total: LifePrinciplesService.catalogMeta().ruleCount, count: data.length },
      });
    } catch (e) { next(e); }
  });

  router.get("/rules/:number", validate({ params: NumberParam }), async (req, res, next) => {
    try {
      const rule = LifePrinciplesService.getRuleByNumber(Number(req.params.number));
      if (!rule) throw AppError.notFound(`No rule ${req.params.number} in the catalog.`);
      res.json({ ok: true, data: rule, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/search", validate({ body: LifeSearchQuerySchema }), async (req, res, next) => {
    try {
      const data = LifePrinciplesService.search(req.body.q, { part: req.body.part, limit: req.body.limit });
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/integrity", async (req, res, next) => {
    try {
      res.json({ ok: true, data: LifePrinciplesService.integrity(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Engines ───────────────────────────────────────────────────────── */

  router.post("/ask", validate({ body: LifeAskSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: LifePrinciplesService.ask({ question: req.body.question, area: req.body.area, limit: req.body.limit }), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/areas", async (req, res, next) => {
    try {
      res.json({ ok: true, data: LifePrinciplesService.areas(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/daily", validate({ query: DailyQuery }), async (req, res, next) => {
    try {
      const q = req.query as z.infer<typeof DailyQuery>;
      const data = LifePrinciplesService.dailyRule(q.date, q.rule);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/decision", validate({ body: LifeDecisionInputSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: LifePrinciplesService.decisionMode({ situation: req.body.situation, context: req.body.context }), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/philosophy", async (req, res, next) => {
    try {
      res.json({ ok: true, data: LifePrinciplesService.philosophy(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/principle", async (req, res, next) => {
    try {
      res.json({ ok: true, data: LifePrinciplesService.principle(), meta: meta(req) });
    } catch (e) { next(e); }
  });
}
