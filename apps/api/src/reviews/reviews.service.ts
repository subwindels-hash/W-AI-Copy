/**
 * WINDELS AI OS — Platform Reviews service.
 *
 * A customer rates the platform (1–5★) and writes a review. Each account owns
 * at most one review (upsert on write). Reviews are moderated: only
 * `published` reviews appear on the public page; `hidden` ones stay visible
 * only to admins.
 *
 * HONESTY CONTRACT
 *   - A fresh platform starts with ZERO reviews and a 0.0 average — nothing is
 *     seeded to make the page look populated.
 *   - The average and distribution are computed on read from persisted reviews.
 *   - No Math.random anywhere; ids come from the CSPRNG.
 *   - User id comes from the authenticated session, never from the request body.
 *
 * Keys: rv:*
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import {
  PlatformReview,
  PlatformReviewsDashboard,
  ReviewRating,
  PlatformReviewStatus,
} from "@windels/shared";

const K = {
  review: (id: string) => `rv:review:${id}`,
  idx: () => `rv:idx`,
  userMap: () => `rv:userMap`,
};

const s2 = (o: unknown) => JSON.stringify(o);
const parse = (s: string | null | undefined): PlatformReview | null => {
  if (!s) return null;
  try { return JSON.parse(s) as PlatformReview; } catch { return null; }
};

async function readReview(id: string): Promise<PlatformReview | null> {
  if (!id) return null;
  return parse(await redis.hget(K.review(id), "_doc"));
}

export const ReviewsService = {
  /** Marks the module initialised. Writes NO synthetic reviews. */
  async ensureBootstrapped(logger?: any, oid?: string) {
    if (!oid || typeof oid !== "string" || oid.trim().length === 0) return;
    const key = "rv:meta:" + oid;
    if (await redis.exists(key)) return;
    await redis.hset(key, "initialized", "1");
    logger?.info?.("[reviews] initialized (no synthetic reviews)");
  },

  async getById(id: string): Promise<PlatformReview | null> {
    return readReview(id);
  },

  async getByUser(userId: string): Promise<PlatformReview | null> {
    if (!userId) return null;
    const id = await redis.hget(K.userMap(), userId);
    return readReview(id);
  },

  /** All reviews (admin view, newest first). */
  async listAll(): Promise<PlatformReview[]> {
    const ids = await redis.smembers(K.idx());
    const reviews: PlatformReview[] = [];
    for (const id of ids) {
      const r = await readReview(id);
      if (r) reviews.push(r);
    }
    return reviews.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** Published reviews, newest first (public view). */
  async listPublished(): Promise<PlatformReview[]> {
    return (await this.listAll()).filter((r) => r.status === "published");
  },

  /**
   * Create a new review for a user, or update their existing one (upsert).
   * userName is derived from the authenticated session, never from the body.
   */
  async upsert(
    userId: string,
    userName: string,
    input: { rating: ReviewRating; title?: string; content: string },
  ): Promise<PlatformReview> {
    if (!userId) throw new Error("userId is required");

    const existingId = await redis.hget(K.userMap(), userId);
    const now = new Date().toISOString();

    if (existingId) {
      const existing = await readReview(existingId);
      if (existing) {
        const updated: PlatformReview = {
          ...existing,
          userName,
          rating: input.rating,
          title: input.title ?? "",
          content: input.content,
          updatedAt: now,
        };
        await redis.hset(K.review(existingId), "_doc", s2(updated));
        return updated;
      }
      await redis.srem(K.idx(), existingId);
    }

    const review: PlatformReview = {
      id: "rv-" + randomUUID().slice(0, 12),
      userId,
      userName,
      rating: input.rating,
      title: input.title ?? "",
      content: input.content,
      status: "published",
      createdAt: now,
      updatedAt: now,
    };
    await redis.hset(K.review(review.id), "_doc", s2(review));
    await redis.sadd(K.idx(), review.id);
    await redis.hset(K.userMap(), userId, review.id);
    return review;
  },

  async delete(userId: string): Promise<boolean> {
    const id = await redis.hget(K.userMap(), userId);
    if (!id) return false;
    await redis.srem(K.idx(), id);
    await redis.del(K.review(id));
    await redis.hset(K.userMap(), userId, "");
    return true;
  },

  /** Admin moderation: set a review's visibility status. */
  async setStatus(id: string, status: PlatformReviewStatus): Promise<PlatformReview | null> {
    const review = await readReview(id);
    if (!review) return null;
    const updated = { ...review, status, updatedAt: new Date().toISOString() };
    await redis.hset(K.review(id), "_doc", s2(updated));
    return updated;
  },

  async dashboard(): Promise<PlatformReviewsDashboard> {
    const all = await this.listAll();
    const published = all.filter((r) => r.status === "published");
    const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    let sum = 0;
    for (const r of published) {
      distribution[String(r.rating)] += 1;
      sum += r.rating;
    }
    return {
      totalPublished: published.length,
      totalAll: all.length,
      averageRating: published.length ? Math.round((sum / published.length) * 10) / 10 : 0,
      distribution,
      reviews: published.slice(0, 50),
    };
  },
};
