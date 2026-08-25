import { api } from "./api";
import type {
  PlatformReview,
  PlatformReviewsDashboard,
  PlatformReviewStatus,
  ReviewRating,
} from "@windels/shared";
export type {
  PlatformReview,
  PlatformReviewsDashboard,
  PlatformReviewStatus,
  ReviewRating,
} from "@windels/shared";

export interface ReviewWriteInput {
  rating: ReviewRating;
  title?: string;
  content: string;
}

export const reviewsApi = {
  dashboard: () => api<PlatformReviewsDashboard>("/reviews"),
  get: (id: string) => api<PlatformReview>(`/reviews/${id}`),
  me: () => api<PlatformReview | null>("/reviews/me"),
  submit: (input: ReviewWriteInput) =>
    api<PlatformReview>("/reviews", { method: "POST", json: input }),
  update: (input: ReviewWriteInput) =>
    api<PlatformReview>("/reviews/me", { method: "PATCH", json: input }),
  remove: () => api<void>("/reviews/me", { method: "DELETE" }),
  // Admin moderation
  adminDashboard: () => api<{
    totalAll: number; totalPublished: number; hidden: number;
    averageRating: number; reviews: PlatformReview[];
  }>("/reviews/admin"),
  setStatus: (id: string, status: PlatformReviewStatus) =>
    api<PlatformReview>(`/reviews/admin/${id}`, { method: "PATCH", json: { status } }),
};
