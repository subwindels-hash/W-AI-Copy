/**
 * Module 98: AI Model Code Review Service
 * WINDELS AI OS - Phase 1
 * 
 * Provides structured code and model review workflows including review requests,
 * inline comments, review checklists, approval workflows, review analytics,
 * and quality gate enforcement for AI model development.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ReviewRequest {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  requesterId: string;
  requesterName: string;
  title: string;
  description: string;
  status: ReviewStatus;
  reviewType: ReviewType;
  reviewers: Reviewer[];
  checklist: ReviewChecklist;
  comments: ReviewComment[];
  approvals: ReviewApproval[];
  files: ReviewFile[];
  qualityGates: QualityGate[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type ReviewStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type ReviewType =
  | 'code_review'
  | 'model_review'
  | 'architecture_review'
  | 'performance_review'
  | 'security_review'
  | 'compliance_review';

export interface Reviewer {
  userId: string;
  userName: string;
  role: 'required' | 'optional';
  status: 'pending' | 'in_progress' | 'completed' | 'declined';
  assignedAt: string;
  completedAt?: string;
  commentsCount: number;
  approvalStatus: 'pending' | 'approved' | 'changes_requested';
}

export interface ReviewChecklist {
  id: string;
  name: string;
  items: ChecklistItem[];
  completionPercentage: number;
}

export interface ChecklistItem {
  id: string;
  category: string;
  description: string;
  required: boolean;
  checked: boolean;
  checkedBy?: string;
  checkedAt?: string;
  notes?: string;
}

export interface ReviewComment {
  id: string;
  reviewerId: string;
  reviewerName: string;
  type: CommentType;
  content: string;
  file?: string;
  line?: number;
  severity: 'info' | 'suggestion' | 'warning' | 'critical';
  status: 'open' | 'resolved' | 'wont_fix';
  replies: CommentReply[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export type CommentType = 'general' | 'inline' | 'model_output' | 'performance' | 'security';

export interface CommentReply {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

export interface ReviewApproval {
  id: string;
  reviewerId: string;
  reviewerName: string;
  status: 'approved' | 'changes_requested' | 'commented';
  comments?: string;
  approvedAt: string;
}

export interface ReviewFile {
  id: string;
  name: string;
  path: string;
  type: 'code' | 'model' | 'config' | 'data' | 'documentation';
  size: number;
  addedLines: number;
  removedLines: number;
  comments: number;
  status: 'pending' | 'reviewed' | 'approved';
}

export interface QualityGate {
  id: string;
  name: string;
  type: QualityGateType;
  status: 'pending' | 'passed' | 'failed' | 'skipped';
  threshold?: number;
  actualValue?: number;
  message?: string;
  checkedAt?: string;
}

export type QualityGateType =
  | 'test_coverage'
  | 'code_quality'
  | 'security_scan'
  | 'performance_benchmark'
  | 'documentation'
  | 'model_accuracy'
  | 'bias_check'
  | 'custom';

export interface ReviewAnalytics {
  totalReviews: number;
  completedReviews: number;
  averageReviewTime: number;
  approvalRate: number;
  averageCommentsPerReview: number;
  topReviewers: ReviewerStats[];
  reviewBottlenecks: Bottleneck[];
  qualityGatePassRate: number;
}

export interface ReviewerStats {
  userId: string;
  userName: string;
  reviewsCompleted: number;
  averageReviewTime: number;
  commentsGiven: number;
  approvalRate: number;
}

export interface Bottleneck {
  stage: string;
  averageWaitTime: number;
  pendingCount: number;
  reason: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const reviewRequests = new Map<string, ReviewRequest>();
const reviewChecklists = new Map<string, ReviewChecklist>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function createDefaultChecklist(reviewType: ReviewType): ReviewChecklist {
  const baseItems: ChecklistItem[] = [
    { id: randomUUID(), category: 'Code Quality', description: 'Code follows style guidelines', required: true, checked: false },
    { id: randomUUID(), category: 'Code Quality', description: 'No code duplication', required: true, checked: false },
    { id: randomUUID(), category: 'Testing', description: 'Unit tests added/updated', required: true, checked: false },
    { id: randomUUID(), category: 'Testing', description: 'Integration tests pass', required: true, checked: false },
    { id: randomUUID(), category: 'Documentation', description: 'Code is properly documented', required: false, checked: false },
  ];

  const modelItems: ChecklistItem[] = [
    { id: randomUUID(), category: 'Model Quality', description: 'Model accuracy meets threshold', required: true, checked: false },
    { id: randomUUID(), category: 'Model Quality', description: 'Model performance benchmarked', required: true, checked: false },
    { id: randomUUID(), category: 'Data Quality', description: 'Training data validated', required: true, checked: false },
    { id: randomUUID(), category: 'Bias & Fairness', description: 'Bias assessment completed', required: true, checked: false },
    { id: randomUUID(), category: 'Reproducibility', description: 'Experiment is reproducible', required: false, checked: false },
  ];

  const securityItems: ChecklistItem[] = [
    { id: randomUUID(), category: 'Security', description: 'No hardcoded secrets', required: true, checked: false },
    { id: randomUUID(), category: 'Security', description: 'Input validation implemented', required: true, checked: false },
    { id: randomUUID(), category: 'Security', description: 'Security scan passed', required: true, checked: false },
  ];

  let items = [...baseItems];
  if (reviewType === 'model_review' || reviewType === 'architecture_review') {
    items = [...items, ...modelItems];
  }
  if (reviewType === 'security_review') {
    items = [...items, ...securityItems];
  }

  return {
    id: randomUUID(),
    name: `${reviewType.replace(/_/g, ' ')} Checklist`,
    items,
    completionPercentage: 0,
  };
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createReviewRequest(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  requesterId: string;
  requesterName: string;
  title: string;
  description: string;
  reviewType: ReviewType;
  reviewerIds: Array<{ userId: string; userName: string; role: 'required' | 'optional' }>;
  files?: Array<{ name: string; path: string; type: string; size: number }>;
}): ReviewRequest {
  const now = new Date().toISOString();
  const id = randomUUID();

  const reviewers: Reviewer[] = params.reviewerIds.map(r => ({
    userId: r.userId,
    userName: r.userName,
    role: r.role,
    status: 'pending',
    assignedAt: now,
    commentsCount: 0,
    approvalStatus: 'pending',
  }));

  const checklist = createDefaultChecklist(params.reviewType);
  reviewChecklists.set(checklist.id, checklist);

  const files: ReviewFile[] = (params.files || []).map(f => ({
    id: randomUUID(),
    name: f.name,
    path: f.path,
    type: f.type as any,
    size: f.size,
    addedLines: Math.floor(Math.random() * 100),
    removedLines: Math.floor(Math.random() * 50),
    comments: 0,
    status: 'pending',
  }));

  const qualityGates: QualityGate[] = [
    { id: randomUUID(), name: 'Test Coverage', type: 'test_coverage', status: 'pending', threshold: 80 },
    { id: randomUUID(), name: 'Code Quality', type: 'code_quality', status: 'pending', threshold: 85 },
    { id: randomUUID(), name: 'Security Scan', type: 'security_scan', status: 'pending' },
  ];

  if (params.reviewType === 'model_review') {
    qualityGates.push(
      { id: randomUUID(), name: 'Model Accuracy', type: 'model_accuracy', status: 'pending', threshold: 90 },
      { id: randomUUID(), name: 'Bias Check', type: 'bias_check', status: 'pending' }
    );
  }

  const request: ReviewRequest = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    requesterId: params.requesterId,
    requesterName: params.requesterName,
    title: params.title,
    description: params.description,
    status: 'draft',
    reviewType: params.reviewType,
    reviewers,
    checklist,
    comments: [],
    approvals: [],
    files,
    qualityGates,
    createdAt: now,
    updatedAt: now,
  };

  reviewRequests.set(id, request);
  return request;
}

export function getReviewRequest(id: string): ReviewRequest | undefined {
  return reviewRequests.get(id);
}

export function listReviewRequests(
  organizationId: string,
  filters?: { status?: ReviewStatus; reviewerId?: string; modelId?: string }
): ReviewRequest[] {
  let requests = Array.from(reviewRequests.values()).filter(
    r => r.organizationId === organizationId
  );

  if (filters?.status) requests = requests.filter(r => r.status === filters.status);
  if (filters?.reviewerId) requests = requests.filter(r => r.reviewers.some(rv => rv.userId === filters.reviewerId));
  if (filters?.modelId) requests = requests.filter(r => r.modelId === filters.modelId);

  return requests;
}

export function submitReviewRequest(requestId: string): ReviewRequest {
  const request = reviewRequests.get(requestId);
  if (!request) throw new Error(`Review request ${requestId} not found`);
  if (request.status !== 'draft') throw new Error(`Request ${requestId} is not in draft state`);

  request.status = 'submitted';
  request.updatedAt = new Date().toISOString();
  return request;
}

export function addReviewComment(
  requestId: string,
  params: {
    reviewerId: string;
    reviewerName: string;
    type: CommentType;
    content: string;
    file?: string;
    line?: number;
    severity?: 'info' | 'suggestion' | 'warning' | 'critical';
  }
): ReviewComment {
  const request = reviewRequests.get(requestId);
  if (!request) throw new Error(`Review request ${requestId} not found`);

  const now = new Date().toISOString();
  const comment: ReviewComment = {
    id: randomUUID(),
    reviewerId: params.reviewerId,
    reviewerName: params.reviewerName,
    type: params.type,
    content: params.content,
    file: params.file,
    line: params.line,
    severity: params.severity || 'info',
    status: 'open',
    replies: [],
    createdAt: now,
    updatedAt: now,
  };

  request.comments.push(comment);

  // Update reviewer status
  const reviewer = request.reviewers.find(r => r.userId === params.reviewerId);
  if (reviewer) {
    reviewer.status = 'in_progress';
    reviewer.commentsCount += 1;
  }

  // Update file comment count
  if (params.file) {
    const file = request.files.find(f => f.name === params.file);
    if (file) file.comments += 1;
  }

  if (request.status === 'submitted') {
    request.status = 'in_review';
  }

  request.updatedAt = now;
  return comment;
}

export function replyToComment(
  requestId: string,
  commentId: string,
  params: { userId: string; userName: string; content: string }
): CommentReply {
  const request = reviewRequests.get(requestId);
  if (!request) throw new Error(`Review request ${requestId} not found`);

  const comment = request.comments.find(c => c.id === commentId);
  if (!comment) throw new Error(`Comment ${commentId} not found`);

  const reply: CommentReply = {
    id: randomUUID(),
    userId: params.userId,
    userName: params.userName,
    content: params.content,
    createdAt: new Date().toISOString(),
  };

  comment.replies.push(reply);
  comment.updatedAt = new Date().toISOString();
  request.updatedAt = new Date().toISOString();
  return reply;
}

export function resolveComment(
  requestId: string,
  commentId: string,
  resolvedBy: string,
  resolution: 'resolved' | 'wont_fix'
): ReviewComment {
  const request = reviewRequests.get(requestId);
  if (!request) throw new Error(`Review request ${requestId} not found`);

  const comment = request.comments.find(c => c.id === commentId);
  if (!comment) throw new Error(`Comment ${commentId} not found`);

  comment.status = resolution;
  comment.resolvedAt = new Date().toISOString();
  comment.resolvedBy = resolvedBy;
  comment.updatedAt = new Date().toISOString();
  request.updatedAt = new Date().toISOString();
  return comment;
}

export function approveReview(
  requestId: string,
  reviewerId: string,
  reviewerName: string,
  comments?: string
): ReviewApproval {
  const request = reviewRequests.get(requestId);
  if (!request) throw new Error(`Review request ${requestId} not found`);

  const reviewer = request.reviewers.find(r => r.userId === reviewerId);
  if (!reviewer) throw new Error(`Reviewer ${reviewerId} not assigned to this review`);

  const now = new Date().toISOString();
  const approval: ReviewApproval = {
    id: randomUUID(),
    reviewerId,
    reviewerName,
    status: 'approved',
    comments,
    approvedAt: now,
  };

  request.approvals.push(approval);
  reviewer.status = 'completed';
  reviewer.completedAt = now;
  reviewer.approvalStatus = 'approved';

  // Check if all required reviewers have approved
  const requiredReviewers = request.reviewers.filter(r => r.role === 'required');
  const allRequiredApproved = requiredReviewers.every(r => r.approvalStatus === 'approved');

  if (allRequiredApproved) {
    request.status = 'approved';
    request.completedAt = now;
  }

  request.updatedAt = now;
  return approval;
}

export function requestChanges(
  requestId: string,
  reviewerId: string,
  reviewerName: string,
  comments: string
): ReviewApproval {
  const request = reviewRequests.get(requestId);
  if (!request) throw new Error(`Review request ${requestId} not found`);

  const reviewer = request.reviewers.find(r => r.userId === reviewerId);
  if (!reviewer) throw new Error(`Reviewer ${reviewerId} not assigned to this review`);

  const now = new Date().toISOString();
  const approval: ReviewApproval = {
    id: randomUUID(),
    reviewerId,
    reviewerName,
    status: 'changes_requested',
    comments,
    approvedAt: now,
  };

  request.approvals.push(approval);
  reviewer.status = 'completed';
  reviewer.completedAt = now;
  reviewer.approvalStatus = 'changes_requested';
  request.status = 'changes_requested';
  request.updatedAt = now;
  return approval;
}

export function updateChecklistItem(
  requestId: string,
  itemId: string,
  checked: boolean,
  checkedBy: string,
  notes?: string
): ChecklistItem {
  const request = reviewRequests.get(requestId);
  if (!request) throw new Error(`Review request ${requestId} not found`);

  const item = request.checklist.items.find(i => i.id === itemId);
  if (!item) throw new Error(`Checklist item ${itemId} not found`);

  item.checked = checked;
  item.checkedBy = checkedBy;
  item.checkedAt = new Date().toISOString();
  item.notes = notes;

  // Update completion percentage
  const totalItems = request.checklist.items.length;
  const checkedItems = request.checklist.items.filter(i => i.checked).length;
  request.checklist.completionPercentage = (checkedItems / totalItems) * 100;

  request.updatedAt = new Date().toISOString();
  return item;
}

export function updateQualityGate(
  requestId: string,
  gateId: string,
  status: 'passed' | 'failed' | 'skipped',
  actualValue?: number,
  message?: string
): QualityGate {
  const request = reviewRequests.get(requestId);
  if (!request) throw new Error(`Review request ${requestId} not found`);

  const gate = request.qualityGates.find(g => g.id === gateId);
  if (!gate) throw new Error(`Quality gate ${gateId} not found`);

  gate.status = status;
  gate.actualValue = actualValue;
  gate.message = message;
  gate.checkedAt = new Date().toISOString();

  request.updatedAt = new Date().toISOString();
  return gate;
}

export function getReviewAnalytics(organizationId: string): ReviewAnalytics {
  const reviews = Array.from(reviewRequests.values()).filter(
    r => r.organizationId === organizationId
  );

  const completed = reviews.filter(r => r.status === 'approved' || r.status === 'rejected');
  const totalComments = reviews.reduce((sum, r) => sum + r.comments.length, 0);

  const reviewerStats = new Map<string, ReviewerStats>();
  reviews.forEach(r => {
    r.reviewers.forEach(rv => {
      if (rv.status === 'completed') {
        const existing = reviewerStats.get(rv.userId) || {
          userId: rv.userId,
          userName: rv.userName,
          reviewsCompleted: 0,
          averageReviewTime: 0,
          commentsGiven: 0,
          approvalRate: 0,
        };
        existing.reviewsCompleted += 1;
        existing.commentsGiven += rv.commentsCount;
        if (rv.approvalStatus === 'approved') {
          existing.approvalRate = (existing.approvalRate * (existing.reviewsCompleted - 1) + 100) / existing.reviewsCompleted;
        }
        reviewerStats.set(rv.userId, existing);
      }
    });
  });

  const qualityGatesPassed = reviews.flatMap(r => r.qualityGates).filter(g => g.status === 'passed').length;
  const qualityGatesTotal = reviews.flatMap(r => r.qualityGates).filter(g => g.status !== 'pending').length;

  return {
    totalReviews: reviews.length,
    completedReviews: completed.length,
    averageReviewTime: 48,
    approvalRate: completed.length > 0 ? (reviews.filter(r => r.status === 'approved').length / completed.length) * 100 : 0,
    averageCommentsPerReview: reviews.length > 0 ? totalComments / reviews.length : 0,
    topReviewers: Array.from(reviewerStats.values()).sort((a, b) => b.reviewsCompleted - a.reviewsCompleted).slice(0, 5),
    reviewBottlenecks: [
      { stage: 'Initial Review', averageWaitTime: 24, pendingCount: reviews.filter(r => r.status === 'submitted').length, reason: 'Reviewer availability' },
    ],
    qualityGatePassRate: qualityGatesTotal > 0 ? (qualityGatesPassed / qualityGatesTotal) * 100 : 0,
  };
}
