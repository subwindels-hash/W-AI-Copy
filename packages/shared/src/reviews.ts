/**
 * WINDELS AI OS — Platform Reviews.
 *
 * Customers rate the WINDELS AI OS platform (1–5 stars) and write a review.
 * One review per authenticated account (upsert). Reviews are moderated with a
 * `published` / `hidden` status; only `published` reviews are shown to the
 * public. The aggregate rating is computed from persisted reviews on read —
 * it is never seeded or fabricated.
 */
import { z } from "zod";

export const PLATFORM_REVIEW_STATUS = ["published", "hidden"] as const;
export type PlatformReviewStatus = (typeof PLATFORM_REVIEW_STATUS)[number];

export const REVIEW_RATING = [1, 2, 3, 4, 5] as const;
export type ReviewRating = (typeof REVIEW_RATING)[number];

export interface PlatformReview {
  id: string;
  userId: string;
  userName: string;
  rating: ReviewRating;
  title: string;
  content: string;
  status: PlatformReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformReviewsDashboard {
  /** Count of published reviews (what the public sees). */
  totalPublished: number;
  /** Total reviews including hidden ones (admin view). */
  totalAll: number;
  /** Arithmetic mean of published ratings, 0 when none. */
  averageRating: number;
  /** Rating distribution over published reviews: 1★..5★. */
  distribution: Record<`${number}`, number>;
  /** Published reviews, newest first. */
  reviews: PlatformReview[];
}

/** Create/update a review (validated before hitting the service). */
export const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(120).optional().or(z.literal("")),
  content: z.string().trim().min(2).max(4000),
});
export type CreateReviewInput = z.input<typeof CreateReviewSchema>;

/** Admin moderation action. */
export const PlatformReviewStatusSchema = z.object({ status: z.enum(PLATFORM_REVIEW_STATUS) });
