/**
 * Module 152: AI Model Review Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides comprehensive model review capabilities including code reviews,
 * model reviews, review workflows, and review management.
 */

import { randomUUID } from 'crypto';

export interface ModelReview {
  id: string;
  organizationId: string;
  modelId: string;
  modelVersion: string;
  type: ReviewType;
  status: ReviewStatus;
  reviewer: Reviewer;
  checklist: ReviewChecklistItem[];
  comments: ReviewComment[];
  decision?: ReviewDecision;
  createdAt: string;
  updatedAt: string;
}

export type ReviewType = 'code' | 'model' | 'performance' | 'security' | 'compliance';
export type ReviewStatus = 'pending' | 'in_progress' | 'completed' | 'approved' | 'rejected';

export interface Reviewer {
  id: string;
  userId: string;
  userName: string;
  expertise: string[];
}

export interface ReviewChecklistItem {
  id: string;
  category: string;
  item: string;
  checked: boolean;
  notes?: string;
}

export interface ReviewComment {
  id: string;
  userId: string;
  userName: string;
  comment: string;
  line?: number;
  severity: 'info' | 'warning' | 'error';
  resolved: boolean;
  timestamp: string;
}

export interface ReviewDecision {
  decision: 'approved' | 'rejected' | 'changes_requested';
  comments: string;
  decidedBy: string;
  decidedAt: string;
}

const modelReviews = new Map<string, ModelReview>();

export function createModelReview(params: {
  organizationId: string;
  modelId: string;
  modelVersion: string;
  type: ReviewType;
  reviewer: Reviewer;
  checklist?: Omit<ReviewChecklistItem, 'id' | 'checked'>[];
}): ModelReview {
  const now = new Date().toISOString();
  const review: ModelReview = {
    id: randomUUID(),
    ...params,
    status: 'pending',
    checklist: params.checklist?.map(c => ({ ...c, id: randomUUID(), checked: false })) || [],
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
  modelReviews.set(review.id, review);
  return review;
}

export function getModelReview(id: string): ModelReview | undefined {
  return modelReviews.get(id);
}

export function listModelReviews(organizationId: string, filters?: { modelId?: string; status?: ReviewStatus }): ModelReview[] {
  let result = Array.from(modelReviews.values()).filter(r => r.organizationId === organizationId);
  if (filters?.modelId) result = result.filter(r => r.modelId === filters.modelId);
  if (filters?.status) result = result.filter(r => r.status === filters.status);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addReviewComment(reviewId: string, comment: Omit<ReviewComment, 'id' | 'timestamp' | 'resolved'>): ReviewComment {
  const review = modelReviews.get(reviewId);
  if (!review) throw new Error(`Review ${reviewId} not found`);
  const newComment: ReviewComment = {
    ...comment,
    id: randomUUID(),
    resolved: false,
    timestamp: new Date().toISOString(),
  };
  review.comments.push(newComment);
  review.updatedAt = new Date().toISOString();
  return newComment;
}

export function resolveComment(reviewId: string, commentId: string): void {
  const review = modelReviews.get(reviewId);
  if (!review) throw new Error(`Review ${reviewId} not found`);
  const comment = review.comments.find(c => c.id === commentId);
  if (comment) {
    comment.resolved = true;
    review.updatedAt = new Date().toISOString();
  }
}

export function submitReviewDecision(reviewId: string, decision: ReviewDecision): ModelReview {
  const review = modelReviews.get(reviewId);
  if (!review) throw new Error(`Review ${reviewId} not found`);
  review.decision = decision;
  review.status = decision.decision === 'approved' ? 'approved' : decision.decision === 'rejected' ? 'rejected' : 'completed';
  review.updatedAt = new Date().toISOString();
  return review;
}

export function getReviewDashboard(organizationId: string) {
  const reviews = Array.from(modelReviews.values()).filter(r => r.organizationId === organizationId);
  return {
    totalReviews: reviews.length,
    pendingReviews: reviews.filter(r => r.status === 'pending').length,
    completedReviews: reviews.filter(r => r.status === 'completed' || r.status === 'approved').length,
    approvalRate: reviews.length > 0 ? (reviews.filter(r => r.status === 'approved').length / reviews.length) * 100 : 0,
  };
}
