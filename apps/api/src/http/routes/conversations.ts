import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { PaginationQuery } from "@windels/shared/api";
import { z } from "zod";
import {
  CreateConversationSchema,
  UpdateConversationSchema,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  updateConversation,
} from "../../services/conversation.service.js";
import type { ApiEnvelope } from "@windels/shared/api";

/**
 * Registers conversation CRUD on the provided router. Does NOT add a
 * `/conversations` prefix itself — the caller decides mount point.
 */
const ConversationId = z.object({ id: z.string().cuid() });

export function registerConversationRoutes(r: Router) {
  r.use(authenticate);

  r.get(
    "/",
    validate({ query: PaginationQuery.extend({ pinned: z.enum(["true", "false"]).optional() }) }),
    async (req, res, next) => {
      try {
        const data = await listConversations(req.user!.id, req.query as any);
        const env: ApiEnvelope<typeof data> = {
          ok: true,
          data,
          meta: {
            requestId: req.requestId,
            tookMs: Date.now() - req.startedAt,
            pagination: data.pagination,
          },
        };
        res.json(env);
      } catch (e) { next(e); }
    }
  );

  r.post("/", validate({ body: CreateConversationSchema }), async (req, res, next) => {
    try {
      const conv = await createConversation(req.user!.id, req.body);
      res.status(201).json({
        ok: true, data: conv,
        meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt },
      });
    } catch (e) { next(e); }
  });

  r.get("/:id", validate({ params: ConversationId }), async (req, res, next) => {
    try {
      const c = await getConversation(req.user!.id, req.params.id);
      res.json({ ok: true, data: c, meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt } });
    } catch (e) { next(e); }
  });

  r.patch("/:id", validate({ params: ConversationId, body: UpdateConversationSchema }), async (req, res, next) => {
    try {
      const c = await updateConversation(req.user!.id, req.params.id, req.body);
      res.json({ ok: true, data: c, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  r.delete("/:id", validate({ params: ConversationId }), async (req, res, next) => {
    try {
      const r2 = await deleteConversation(req.user!.id, req.params.id);
      res.json({ ok: true, data: r2, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
