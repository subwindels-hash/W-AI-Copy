/**
 * Session 112 — Conversation operations routes.
 *
 * Mounted on the same `/conversations` sub-router as Sessions 2–4, but
 * registered *before* them: `GET /search`, `GET /unread` and `GET /deleted` are
 * literal collection paths that would otherwise be swallowed by the existing
 * `GET /:id`, whose cuid param validator would reject them with a 400 instead
 * of falling through. Registration order is the fix, so nothing in the Session
 * 2–4 router had to change.
 *
 * Because these handlers run ahead of the Session 2 router's
 * `router.use(authenticate)`, each one attaches `authenticate` itself.
 */
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  ConvAddParticipantSchema,
  ConvDeletedQuerySchema,
  ConvDigestQuerySchema,
  ConvEditMessageSchema,
  ConvMarkReadSchema,
  ConvRedactMessageSchema,
  ConvSearchQuerySchema,
  ConvTranscriptQuerySchema,
  ConvUnreadQuerySchema,
} from "@windels/shared/conversations";
import {
  ConversationIdParam,
  MessageIdParam,
  ParticipantIdParam,
  addParticipant,
  conversationStats,
  digest,
  editMessage,
  getMessage,
  getReadState,
  listDeletedConversations,
  listParticipants,
  markRead,
  redactMessage,
  removeParticipant,
  restoreConversation,
  searchMessages,
  transcript,
  unreadSummary,
} from "../../conversations/conversationOps.service.js";

export function registerConversationOpsRoutes(r: Router) {
  const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });

  /* ── Collection-level paths (must precede `/:id`) ───────────────────── */

  // Cross-conversation message search. Substring matching, clearly labelled.
  r.get("/search", authenticate, validate({ query: ConvSearchQuerySchema }), async (req, res, next) => {
    try {
      const data = await searchMessages(req.user!.id, req.query as any);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  // Unread counts across the caller's conversations.
  r.get("/unread", authenticate, validate({ query: ConvUnreadQuerySchema }), async (req, res, next) => {
    try {
      const data = await unreadSummary(req.user!.id, req.query as any);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  // Soft-deleted conversations the caller created, and can restore.
  r.get("/deleted", authenticate, validate({ query: ConvDeletedQuerySchema }), async (req, res, next) => {
    try {
      const data = await listDeletedConversations(req.user!.id, req.query as any);
      res.json({ ok: true, data, meta: { ...meta(req), pagination: data.pagination } });
    } catch (e) { next(e); }
  });

  /* ── Participants ───────────────────────────────────────────────────── */

  r.get("/:id/participants", authenticate, validate({ params: ConversationIdParam }), async (req, res, next) => {
    try {
      const data = await listParticipants(req.user!.id, req.params.id);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.post(
    "/:id/participants",
    authenticate,
    validate({ params: ConversationIdParam, body: ConvAddParticipantSchema }),
    async (req, res, next) => {
      try {
        const data = await addParticipant(req.user!.id, req.params.id, req.body);
        res.status(201).json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    }
  );

  r.delete(
    "/:id/participants/:participantId",
    authenticate,
    validate({ params: ParticipantIdParam }),
    async (req, res, next) => {
      try {
        const data = await removeParticipant(req.user!.id, req.params.id, req.params.participantId);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    }
  );

  /* ── Read state ─────────────────────────────────────────────────────── */

  r.get("/:id/read-state", authenticate, validate({ params: ConversationIdParam }), async (req, res, next) => {
    try {
      const data = await getReadState(req.user!.id, req.params.id);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.post(
    "/:id/read",
    authenticate,
    validate({ params: ConversationIdParam, body: ConvMarkReadSchema }),
    async (req, res, next) => {
      try {
        const data = await markRead(req.user!.id, req.params.id, req.body);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    }
  );

  /* ── Measured statistics ────────────────────────────────────────────── */

  r.get("/:id/stats", authenticate, validate({ params: ConversationIdParam }), async (req, res, next) => {
    try {
      const data = await conversationStats(req.user!.id, req.params.id);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Transcript / export ────────────────────────────────────────────── */

  r.get(
    "/:id/transcript",
    authenticate,
    validate({ params: ConversationIdParam, query: ConvTranscriptQuerySchema }),
    async (req, res, next) => {
      try {
        const data = await transcript(req.user!.id, req.params.id, req.query as any);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    }
  );

  /* ── Extractive digest (no model is called) ─────────────────────────── */

  r.get(
    "/:id/digest",
    authenticate,
    validate({ params: ConversationIdParam, query: ConvDigestQuerySchema }),
    async (req, res, next) => {
      try {
        const data = await digest(req.user!.id, req.params.id, req.query as any);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    }
  );

  /* ── Restore ────────────────────────────────────────────────────────── */

  r.post("/:id/restore", authenticate, validate({ params: ConversationIdParam }), async (req, res, next) => {
    try {
      const data = await restoreConversation(req.user!.id, req.params.id);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Single-message operations ──────────────────────────────────────── */

  r.get(
    "/:id/messages/:messageId",
    authenticate,
    validate({ params: MessageIdParam }),
    async (req, res, next) => {
      try {
        const data = await getMessage(req.user!.id, req.params.id, req.params.messageId);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    }
  );

  r.patch(
    "/:id/messages/:messageId",
    authenticate,
    validate({ params: MessageIdParam, body: ConvEditMessageSchema }),
    async (req, res, next) => {
      try {
        const data = await editMessage(req.user!.id, req.params.id, req.params.messageId, req.body);
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    }
  );

  r.delete(
    "/:id/messages/:messageId",
    authenticate,
    validate({ params: MessageIdParam, body: ConvRedactMessageSchema }),
    async (req, res, next) => {
      try {
        const data = await redactMessage(req.user!.id, req.params.id, req.params.messageId, req.body ?? {});
        res.json({ ok: true, data, meta: meta(req) });
      } catch (e) { next(e); }
    }
  );
}
