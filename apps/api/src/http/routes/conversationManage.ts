/**
 * Session — Conversation-management routes (pin, archive, rename, share).
 *
 * Mounted on the same `/conversations` sub-router as the Session 2/3/4 + 112
 * handlers. Every path is `/:id/...` so nothing collides with the existing
 * `/:id`, and each handler attaches `authenticate` itself (like the ops
 * router) so registration order relative to `router.use(authenticate)` does
 * not matter.
 */
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  ConversationIdParam,
  ShareIdParam,
  ShareTokenParam,
  renameConversation,
  pinConversation,
  unpinConversation,
  archiveConversation,
  unarchiveConversation,
  purgeConversation,
  createShare,
  listShares,
  updateShare,
  enableShare,
  revokeShare,
  deleteShare,
  shareAccessLog,
  resolveShare,
} from "../../conversations/conversationManage.service.js";
import {
  ConvCreateShareSchema,
  ConvRenameSchema,
  ConvResolveShareSchema,
  ConvUpdateShareSchema,
} from "@windels/shared/conversations";

function reqCtx(req: any) {
  return { ip: req.ip, userAgent: req.get?.("user-agent"), requestId: req.requestId };
}

const meta = (req: any) => ({ requestId: req.requestId, tookMs: Date.now() - req.startedAt });

export function registerConversationManageRoutes(r: Router) {
  /* ── Rename ─────────────────────────────────────────────────────────── */
  r.patch("/:id/rename", authenticate, validate({ params: ConversationIdParam, body: ConvRenameSchema }), async (req, res, next) => {
    try {
      const data = await renameConversation(req.user!.id, req.params.id, req.body.title, reqCtx(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Pin / Unpin ────────────────────────────────────────────────────── */
  r.post("/:id/pin", authenticate, validate({ params: ConversationIdParam }), async (req, res, next) => {
    try {
      const data = await pinConversation(req.user!.id, req.params.id, reqCtx(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.delete("/:id/pin", authenticate, validate({ params: ConversationIdParam }), async (req, res, next) => {
    try {
      const data = await unpinConversation(req.user!.id, req.params.id, reqCtx(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Archive / Unarchive ────────────────────────────────────────────── */
  r.post("/:id/archive", authenticate, validate({ params: ConversationIdParam }), async (req, res, next) => {
    try {
      const data = await archiveConversation(req.user!.id, req.params.id, reqCtx(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.post("/:id/unarchive", authenticate, validate({ params: ConversationIdParam }), async (req, res, next) => {
    try {
      const data = await unarchiveConversation(req.user!.id, req.params.id, reqCtx(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Permanent delete (soft delete stays on DELETE /:id) ────────────── */
  r.delete("/:id/permanent", authenticate, validate({ params: ConversationIdParam }), async (req, res, next) => {
    try {
      const data = await purgeConversation(req.user!.id, req.params.id, reqCtx(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  /* ── Sharing ────────────────────────────────────────────────────────── */
  r.post("/:id/share", authenticate, validate({ params: ConversationIdParam, body: ConvCreateShareSchema }), async (req, res, next) => {
    try {
      const data = await createShare(req.user!.id, req.params.id, req.body, reqCtx(req));
      res.status(201).json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.get("/:id/share", authenticate, validate({ params: ConversationIdParam }), async (req, res, next) => {
    try {
      const data = await listShares(req.user!.id, req.params.id);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.patch("/:id/share/:shareId", authenticate, validate({ params: ShareIdParam, body: ConvUpdateShareSchema }), async (req, res, next) => {
    try {
      const data = await updateShare(req.user!.id, req.params.id, req.params.shareId, req.body, reqCtx(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.post("/:id/share/:shareId/enable", authenticate, validate({ params: ShareIdParam }), async (req, res, next) => {
    try {
      const data = await enableShare(req.user!.id, req.params.id, req.params.shareId, reqCtx(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  // Disable (reversible) — aliases revokeShare.
  r.post("/:id/share/:shareId/disable", authenticate, validate({ params: ShareIdParam }), async (req, res, next) => {
    try {
      const data = await revokeShare(req.user!.id, req.params.id, req.params.shareId, reqCtx(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  // Permanent revocation.
  r.delete("/:id/share/:shareId", authenticate, validate({ params: ShareIdParam }), async (req, res, next) => {
    try {
      const data = await deleteShare(req.user!.id, req.params.id, req.params.shareId, reqCtx(req));
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });

  r.get("/:id/share/:shareId/access", authenticate, validate({ params: ShareIdParam }), async (req, res, next) => {
    try {
      const data = await shareAccessLog(req.user!.id, req.params.id, req.params.shareId);
      res.json({ ok: true, data, meta: meta(req) });
    } catch (e) { next(e); }
  });
}

/** Public share-link resolution, mounted at `/share`. Handlers authenticate
 * opportunistically (req.user is set when a valid token is supplied, but an
 * anonymous request for an `anyone_with_link` share still works). */
export function registerShareResolveRoutes(r: Router) {
  r.get("/:token", validate({ params: ShareTokenParam, query: ConvResolveShareSchema }), async (req, res, next) => {
    try {
      const data = await resolveShare(
        req.params.token,
        req.query as any,
        req.user ? { id: req.user.id, email: req.user.email, organizationId: req.user.organizationId } : undefined,
        { ip: req.ip, userAgent: req.get?.("user-agent"), requestId: req.requestId }
      );
      res.json({ ok: true, data, meta: { requestId: req.requestId, tookMs: Date.now() - req.startedAt } });
    } catch (e) { next(e); }
  });
}
