import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import {
  CreateTemplateSchema,
  createTemplate,
  deleteTemplate,
  listTemplates,
  UpdateTemplateSchema,
  updateTemplate,
  useTemplate,
} from "../../promptTemplates/promptTemplates.service.js";
import type { ApiEnvelope } from "@windels/shared/api";

export function registerPromptTemplateRoutes(router: Router) {
  const r = Router();
  r.use(authenticate);

  r.get("/", async (req, res, next) => {
    try {
      const templates = await listTemplates(req.user!.id, req.query.category as string | undefined);
      res.json({ ok: true, data: templates, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  r.post("/", validate({ body: CreateTemplateSchema }), async (req, res, next) => {
    try {
      const t = await createTemplate(req.user!.id, req.body);
      res.status(201).json({ ok: true, data: t, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  r.post(
    "/:id/use",
    validate({ params: z.object({ id: z.string().cuid() }), body: z.record(z.string()).default({}) }),
    async (req, res, next) => {
      try {
        const out = await useTemplate(req.user!.id, req.params.id, req.body);
        const env: ApiEnvelope<typeof out> = {
          ok: true, data: out,
          meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
        };
        res.json(env);
      } catch (e) { next(e); }
    }
  );

  r.patch("/:id", validate({ params: z.object({ id: z.string().cuid() }), body: UpdateTemplateSchema }), async (req, res, next) => {
    try {
      const data = await updateTemplate(req.user!.id, req.params.id, req.body);
      res.json({ ok: true, data, meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt } });
    } catch (e) { next(e); }
  });

  r.delete("/:id", validate({ params: z.object({ id: z.string().cuid() }) }), async (req, res, next) => {
    try {
      await deleteTemplate(req.user!.id, req.params.id);
      res.json({ ok: true, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.use("/prompt-templates", r);
}
