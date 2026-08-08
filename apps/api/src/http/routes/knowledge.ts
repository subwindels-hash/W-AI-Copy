/**
 * Session 140 — Global Human Knowledge & Everyday Question Intelligence routes.
 *
 * Mounted at `/api/v1/knowledge` (additive; no existing route is touched).
 * The surface:
 *
 *   Catalog   GET  /catalog                  catalog version + counts
 *             GET  /categories               the 90 master categories
 *             GET  /categories/:id           category + its records
 *             GET  /kinds                    the 24 content layers
 *             GET  /levels                   teaching audience levels
 *             GET  /eras                     the eight history eras
 *             GET  /timeline?era=            global timeline engine
 *             GET  /search                   deterministic retrieval + filters
 *             GET  /records/:id              record detail (catalog or org dynamic)
 *             GET  /integrity                catalog integrity report
 *   Engines   POST /intent                   Question Intent Engine
 *             POST /ask                      Ask WINDELS (intent → route → answer)
 *             POST /compare                  criteria-based comparison (no winner)
 *             GET  /graph | /graph/:id       knowledge graph
 *             GET  /stats                    rollup (catalog + org dynamic)
 *   Dynamic   GET  /records?scope=...        list (catalog / org / all)
 *             POST /records                  add org-scoped dynamic record
 *             PATCH /records/:id             update dynamic record
 *             DELETE /records/:id            correction path (org-scoped)
 *
 * Catalog reads work for any authenticated session; the dynamic layer is
 * organization-scoped and refuses a no-organization session with 403.
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { AppError } from "../../utils/result.js";
import { KnowledgeService } from "../../knowledge/knowledge.service.js";
import {
  CompareRequestSchema,
  DynamicKnowledgeCreateSchema,
  DynamicKnowledgePatchSchema,
  DynamicRecordsQuerySchema,
  IntentRequestSchema,
  KnowledgeAskSchema,
  KnowledgeSearchQuerySchema,
} from "@windels/shared";

const IdParam = z.object({ id: z.string().min(1).max(64) });
const CategoryParam = z.object({ id: z.string().min(1).max(40) });
const EraQuery = z.object({ era: z.string().max(40).optional() });

export function registerKnowledgeRoutes(router: Router) {
  const orgOf = (req: any): string => {
    const org = req.user?.organizationId ?? null;
    if (!org) throw AppError.forbidden("The dynamic knowledge layer is organization-scoped and this session carries no organization.");
    return org;
  };
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });

  /* ── Catalog ─────────────────────────────────────────────────────────── */

  router.get("/catalog", async (req, res, next) => {
    try {
      res.json({ ok: true, data: KnowledgeService.catalogMeta(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/integrity", async (req, res, next) => {
    try {
      res.json({ ok: true, data: KnowledgeService.integrity(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/categories", async (req, res, next) => {
    try {
      res.json({ ok: true, data: KnowledgeService.categories(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/categories/:id", validate({ params: CategoryParam }), async (req, res, next) => {
    try {
      const cat = KnowledgeService.category(req.params.id);
      if (!cat) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Category not found" } });
      res.json({ ok: true, data: cat, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/kinds", async (req, res, next) => {
    try {
      res.json({ ok: true, data: KnowledgeService.kinds(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/levels", async (req, res, next) => {
    try {
      res.json({ ok: true, data: KnowledgeService.teachingLevels(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/eras", async (req, res, next) => {
    try {
      res.json({ ok: true, data: KnowledgeService.eras(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/timeline", validate({ query: EraQuery }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: KnowledgeService.timeline(req.query.era as string | undefined), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Search ──────────────────────────────────────────────────────────── */

  router.get("/search", validate({ query: KnowledgeSearchQuerySchema }), async (req, res, next) => {
    try {
      const org = req.user?.organizationId ?? null;
      const data = await KnowledgeService.search(org, req.query as any);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Engines ─────────────────────────────────────────────────────────── */

  router.post("/intent", validate({ body: IntentRequestSchema }), async (req, res, next) => {
    try {
      res.json({ ok: true, data: KnowledgeService.intent(req.body.text), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/ask", validate({ body: KnowledgeAskSchema }), async (req, res, next) => {
    try {
      const org = req.user?.organizationId ?? null;
      const data = await KnowledgeService.ask(org, {
        question: req.body.question,
        audienceLevel: req.body.audienceLevel,
        limit: req.body.limit,
        includeDynamic: req.body.includeDynamic,
      });
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/compare", validate({ body: CompareRequestSchema }), async (req, res, next) => {
    try {
      const data = KnowledgeService.compare(req.body.recordIds, req.body.criteriaKeys);
      if (data.missing.length > 0 && data.items.length === 0) {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: `No records found: ${data.missing.join(", ")}` } });
      }
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/graph", async (req, res, next) => {
    try {
      res.json({ ok: true, data: KnowledgeService.graphStats(), meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/graph/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const node = KnowledgeService.graphNode(req.params.id);
      if (!node) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Record not found" } });
      res.json({ ok: true, data: node, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/stats", async (req, res, next) => {
    try {
      const org = req.user?.organizationId ?? null;
      res.json({ ok: true, data: await KnowledgeService.stats(org), meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Dynamic layer (org-scoped) ──────────────────────────────────────── */

  router.get("/records", validate({ query: DynamicRecordsQuerySchema }), async (req, res, next) => {
    try {
      const org = req.user?.organizationId ?? null;
      const scope = (req.query.scope as string | undefined) ?? "catalog";
      if (scope === "org" || scope === "all") {
        if (!org) throw AppError.forbidden("The dynamic knowledge layer is organization-scoped and this session carries no organization.");
      }
      if (scope === "org") {
        const records = await KnowledgeService.listDynamicRecords(org, req.query as any);
        return res.json({ ok: true, data: records, meta: meta(req) });
      }
      if (scope === "all") {
        const dynamic = await KnowledgeService.listDynamicRecords(org, req.query as any);
        return res.json({
          ok: true,
          data: {
            catalog: KnowledgeService.catalogList({ limit: 50 }),
            dynamic,
          },
          meta: meta(req),
        });
      }
      // scope = catalog → catalog records, optionally filtered by kind
      const query = req.query as any;
      const records = KnowledgeService.catalogList({ kind: query.kind, category: query.category, limit: query.limit });
      res.json({ ok: true, data: records, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.post("/records", validate({ body: DynamicKnowledgeCreateSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const record = await KnowledgeService.addDynamicRecord(oid, req.user!.id, req.body);
      res.status(201).json({ ok: true, data: record, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.get("/records/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const id = req.params.id;
      const catalogRecord = KnowledgeService.getRecord(id);
      if (catalogRecord) return res.json({ ok: true, data: catalogRecord, meta: meta(req) });
      const org = req.user?.organizationId ?? null;
      if (!org) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Record not found" } });
      const dynamic = await KnowledgeService.getDynamicRecord(org, id);
      if (!dynamic) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Record not found" } });
      res.json({ ok: true, data: dynamic, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.patch("/records/:id", validate({ params: IdParam, body: DynamicKnowledgePatchSchema }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const updated = await KnowledgeService.updateDynamicRecord(oid, req.user!.id, req.params.id, req.body);
      if (!updated) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Dynamic record not found in this organization" } });
      res.json({ ok: true, data: updated, meta: meta(req) });
    } catch (e) { next(e); }
  });

  router.delete("/records/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const oid = orgOf(req);
      const deleted = await KnowledgeService.deleteDynamicRecord(oid, req.params.id);
      if (!deleted) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Dynamic record not found in this organization" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: meta(req) });
    } catch (e) { next(e); }
  });
}
