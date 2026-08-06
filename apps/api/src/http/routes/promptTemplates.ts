/**
 * Session 23 — Prompt Templates Library routes (Session 119 completion).
 *
 * The five Session 23 endpoints keep their exact paths, request bodies,
 * status codes and response shapes:
 *
 *   GET    /prompt-templates            list (org-scoped)
 *   POST   /prompt-templates            create  → 201
 *   POST   /prompt-templates/:id/use    render  → 200
 *   PATCH  /prompt-templates/:id        update  → 200 (built-ins: 403)
 *   DELETE /prompt-templates/:id        delete  → 200 (built-ins: 403)
 *
 * Session 119 adds (additive):
 *   GET    /prompt-templates/stats      usage statistics (windowed)
 *   GET    /prompt-templates/:id        single template
 *   POST   /prompt-templates/:id/duplicate  copy a template → 201
 *
 * `stats` is declared before `:id` so the literal segment is not captured by
 * the id parameter (which is cuid-validated and would answer 400).
 *
 * Every read is organization-scoped through the service, which resolves the
 * caller's membership; there is no cross-org path in this module.
 */
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  PromptTemplateCreateSchema,
  PromptTemplateDuplicateSchema,
  PromptTemplateIdParamSchema,
  PromptTemplateListQuerySchema,
  PromptTemplateStatsQuerySchema,
  PromptTemplateUpdateSchema,
  PromptTemplateUseBodySchema,
} from "@windels/shared/promptTemplates";
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
  useTemplate,
} from "../../promptTemplates/promptTemplates.service.js";
import { templateStats } from "../../promptTemplates/promptTemplatesUsage.service.js";

export function registerPromptTemplateRoutes(router: Router) {
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });

  router.get(
    "/prompt-templates",
    authenticate,
    validate({ query: PromptTemplateListQuerySchema }),
    async (req, res, next) => {
      try {
        const q = req.query as any;
        const templates = await listTemplates(req.user!.id, q.category, {
          q: q.q,
          limit: q.limit,
        });
        res.json({ ok: true, data: templates, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    },
  );

  router.post(
    "/prompt-templates",
    authenticate,
    validate({ body: PromptTemplateCreateSchema }),
    async (req, res, next) => {
      try {
        const t = await createTemplate(req.user!.id, req.body);
        res.status(201).json({ ok: true, data: t, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    },
  );

  // Literal path first so it is not captured by `/:id` below.
  router.get(
    "/prompt-templates/stats",
    authenticate,
    validate({ query: PromptTemplateStatsQuerySchema }),
    async (req, res, next) => {
      try {
        const q = req.query as any;
        const stats = await templateStats(req.user!.id, q.days);
        res.json({ ok: true, data: stats, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.get(
    "/prompt-templates/:id",
    authenticate,
    validate({ params: PromptTemplateIdParamSchema }),
    async (req, res, next) => {
      try {
        const t = await getTemplate(req.user!.id, req.params.id);
        res.json({ ok: true, data: t, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.post(
    "/prompt-templates/:id/use",
    authenticate,
    validate({ params: PromptTemplateIdParamSchema, body: PromptTemplateUseBodySchema }),
    async (req, res, next) => {
      try {
        const out = await useTemplate(req.user!.id, req.params.id, req.body);
        res.json({ ok: true, data: out, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.post(
    "/prompt-templates/:id/duplicate",
    authenticate,
    validate({ params: PromptTemplateIdParamSchema, body: PromptTemplateDuplicateSchema }),
    async (req, res, next) => {
      try {
        const copy = await duplicateTemplate(req.user!.id, req.params.id, req.body);
        res.status(201).json({ ok: true, data: copy, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.patch(
    "/prompt-templates/:id",
    authenticate,
    validate({ params: PromptTemplateIdParamSchema, body: PromptTemplateUpdateSchema }),
    async (req, res, next) => {
      try {
        const data = await updateTemplate(req.user!.id, req.params.id, req.body);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    },
  );

  router.delete(
    "/prompt-templates/:id",
    authenticate,
    validate({ params: PromptTemplateIdParamSchema }),
    async (req, res, next) => {
      try {
        await deleteTemplate(req.user!.id, req.params.id);
        res.json({ ok: true, meta: { requestId: req.requestId } });
      } catch (e) { next(e); }
    },
  );
}
