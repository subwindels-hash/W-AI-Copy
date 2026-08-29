/**
 * WINDELS AI OS — Platform Reviews routes.
 *
 *   GET    /reviews        public — aggregate + published reviews
 *   GET    /reviews/me     authenticated — the caller's own review
 *   POST   /reviews        authenticated — create/update the caller's review
 *   PATCH  /reviews/me     authenticated — edit the caller's review
 *   DELETE /reviews/me     authenticated — delete the caller's review
 *   GET    /reviews/admin  admin — all reviews incl. hidden (dashboard)
 *   PATCH  /reviews/admin/:id  admin — publish/hide a review
 */
import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { AppError } from "../../utils/result.js";
import { CreateReviewSchema, PlatformReviewStatusSchema } from "@windels/shared";
import { ReviewsService } from "../../reviews/reviews.service.js";

const Id = z.object({ id: z.string().min(1).max(80) });
const MeSchema = CreateReviewSchema;

function reviewerName(user: any): string {
  return user?.username?.trim() || "Verified customer";
}

export function registerReviewsRoutes(router: Router) {
  const reviews = Router();

  /* ── Public: aggregate + published reviews (rate-limited anti-spam) ── */
  reviews.get("/", rateLimit("reviews", (req) => req.ip ?? "unknown"), async (req, res, next) => {
    try {
      res.json({ ok: true, data: await ReviewsService.dashboard() });
    } catch (e) { next(e); }
  });

  reviews.get("/:id", rateLimit("reviews", (req) => req.ip ?? "unknown"), validate({ params: Id }), async (req, res, next) => {
    try {
      const review = await ReviewsService.getById(req.params.id);
      if (!review || review.status !== "published") {
        return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      }
      res.json({ ok: true, data: review });
    } catch (e) { next(e); }
  });

  /* ── Authenticated: my review ─────────────────────────────────────── */
  const me = Router();
  me.use(authenticate);

  me.get("/me", async (req, res, next) => {
    try {
      const review = await ReviewsService.getByUser(req.user!.id);
      res.json({ ok: true, data: review });
    } catch (e) { next(e); }
  });

  me.post("/", rateLimit("reviewsWrite", (req) => req.user?.id ?? "u"), validate({ body: MeSchema }), async (req, res, next) => {
    try {
      const data = await ReviewsService.upsert(req.user!.id, reviewerName(req.user), {
        rating: req.body.rating,
        title: req.body.title ?? "",
        content: req.body.content,
      });
      res.status(201).json({ ok: true, data });
    } catch (e) { next(e); }
  });

  me.patch("/me", rateLimit("reviewsWrite", (req) => req.user?.id ?? "u"), validate({ body: MeSchema }), async (req, res, next) => {
    try {
      const data = await ReviewsService.upsert(req.user!.id, reviewerName(req.user), {
        rating: req.body.rating,
        title: req.body.title ?? "",
        content: req.body.content,
      });
      res.json({ ok: true, data });
    } catch (e) { next(e); }
  });

  me.delete("/me", async (req, res, next) => {
    try {
      const ok = await ReviewsService.delete(req.user!.id);
      if (!ok) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.status(204).end();
    } catch (e) { next(e); }
  });
  reviews.use("/me", me);

  /* ── Admin: moderation dashboard ──────────────────────────────────── */
  const admin = Router();
  admin.use(authenticate, requireAdmin);

  admin.get("/", async (req, res, next) => {
    try {
      const all = await ReviewsService.listAll();
      const published = all.filter((r) => r.status === "published");
      let sum = 0;
      for (const r of published) sum += r.rating;
      res.json({
        ok: true,
        data: {
          totalAll: all.length,
          totalPublished: published.length,
          hidden: all.filter((r) => r.status === "hidden").length,
          averageRating: published.length ? Math.round((sum / published.length) * 10) / 10 : 0,
          reviews: all,
        },
      });
    } catch (e) { next(e); }
  });

  admin.patch("/:id", validate({ params: Id, body: PlatformReviewStatusSchema }), async (req, res, next) => {
    try {
      const updated = await ReviewsService.setStatus(req.params.id, req.body.status);
      if (!updated) return res.status(404).json({ ok: false, error: { code: "NOT_FOUND" } });
      res.json({ ok: true, data: updated });
    } catch (e) { next(e); }
  });
  reviews.use("/admin", admin);

  router.use("/reviews", reviews);
}
