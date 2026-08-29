import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { SocialPlatformService } from "../../socialPlatform/socialPlatform.service.js";
// Request contracts live in @windels/shared so the API and the web client
// validate against one definition instead of hand-copied ones.
import {
  SpPostUpsertSchema,
  SpCommentCreateSchema,
  SpReactionToggleSchema,
} from "@windels/shared/socialPlatform";

const orgOf = (req: any) => req.user!.organizationId!;
const userOf = (req: any): string | null => req.user?.id ?? null;

const IdParam = z.object({ id: z.string().min(1).max(64) });

export function registerSocialPlatformRoutes(router: Router) {
  router.use(authenticate);

  // ── Dashboard & feed ──────────────────────────────────────────────
  router.get("/dashboard/rollup", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await SocialPlatformService.rollup(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/feed", async (req, res, next) => {
    try {
      const hashtag = typeof req.query.hashtag === "string" ? req.query.hashtag : undefined;
      const kind = typeof req.query.kind === "string" ? (req.query.kind as any) : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const data = await SocialPlatformService.feed(orgOf(req), { hashtag, kind, q });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/hashtags", async (req, res, next) => {
    try {
      res.json({ ok: true, data: await SocialPlatformService.topHashtags(orgOf(req)), meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Posts ─────────────────────────────────────────────────────────
  router.get("/posts", async (req, res, next) => {
    try {
      const status = typeof req.query.status === "string" ? (req.query.status as any) : undefined;
      const kind = typeof req.query.kind === "string" ? (req.query.kind as any) : undefined;
      const hashtag = typeof req.query.hashtag === "string" ? req.query.hashtag : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const data = await SocialPlatformService.listPosts(orgOf(req), { status, kind, hashtag, q });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/posts", validate({ body: SpPostUpsertSchema }), async (req, res, next) => {
    try {
      const data = await SocialPlatformService.createPost(orgOf(req), req.body, userOf(req));
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/posts/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await SocialPlatformService.getPostDetail(orgOf(req), req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Post not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.patch("/posts/:id", validate({ params: IdParam, body: SpPostUpsertSchema.partial() }), async (req, res, next) => {
    try {
      const data = await SocialPlatformService.updatePost(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Post not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/posts/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await SocialPlatformService.deletePost(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Post not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/posts/:id/publish", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await SocialPlatformService.publishPost(orgOf(req), req.params.id, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Post not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/posts/:id/archive", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await SocialPlatformService.archivePost(orgOf(req), req.params.id, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Post not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Comments ──────────────────────────────────────────────────────
  router.get("/posts/:id/comments", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await SocialPlatformService.listComments(orgOf(req), { postId: req.params.id });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.post("/posts/:id/comments", validate({ params: IdParam, body: SpCommentCreateSchema }), async (req, res, next) => {
    try {
      const data = await SocialPlatformService.createComment(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Post not found" } });
      res.status(201).json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.delete("/comments/:id", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const ok = await SocialPlatformService.deleteComment(orgOf(req), req.params.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Comment not found" } });
      res.json({ ok: true, data: { deleted: true, id: req.params.id }, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  // ── Reactions (toggle — idempotent) ───────────────────────────────
  router.post("/posts/:id/reactions", validate({ params: IdParam, body: SpReactionToggleSchema }), async (req, res, next) => {
    try {
      const data = await SocialPlatformService.toggleReaction(orgOf(req), req.params.id, req.body, userOf(req));
      if (!data) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Post not found" } });
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });

  router.get("/posts/:id/reactions", validate({ params: IdParam }), async (req, res, next) => {
    try {
      const data = await SocialPlatformService.reactionGroups(orgOf(req), req.params.id);
      res.json({ ok: true, data, meta: { requestId: req.requestId } });
    } catch (e) { next(e); }
  });
}
