/**
 * Human Approval Workflow Service (Module 14 — Gap 1)
 *
 * Structured approval workflows for human oversight:
 * - Approval requests with context and metadata
 * - Multi-level approval chains
 * - Approval, rejection, and delegation
 * - Approval history and audit trail
 * - Integration with constitution policies
 * - Timeout and escalation handling
 *
 * Enables human-in-the-loop decision making.
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../db/client.js";
import { pushEvent } from "../../http/routes/events.js";

// ─── Types ──────────────────────────────────────────────────────

export interface ApprovalRequest {
  id: string;
  requesterId: string; // Agent or user ID
  requesterType: "agent" | "user";
  requestType: ApprovalRequestType;
  title: string;
  description: string;
  context: Record<string, any>;
  priority: "low" | "normal" | "high" | "urgent";
  status: ApprovalStatus;
  approvalChain: ApprovalStep[];
  currentStepIndex: number;
  createdAt: string;
  expiresAt?: string;
  completedAt?: string;
  metadata: Record<string, any>;
}

export type ApprovalRequestType =
  | "decision"
  | "action"
  | "goal"
  | "plan"
  | "expenditure"
  | "external_communication"
  | "data_access"
  | "policy_exception"
  | "custom";

export type ApprovalStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "rejected"
  | "delegated"
  | "expired"
  | "cancelled";

export interface ApprovalStep {
  stepIndex: number;
  approverId: string; // User ID
  approverName: string;
  approverRole?: string;
  status: "pending" | "approved" | "rejected" | "delegated" | "skipped";
  decidedAt?: string;
  decision?: "approved" | "rejected" | "delegated";
  comments?: string;
  delegatedTo?: string; // User ID if delegated
}

export interface ApprovalDecision {
  approvalId: string;
  stepIndex: number;
  deciderId: string;
  decision: "approved" | "rejected" | "delegated";
  comments?: string;
  delegatedTo?: string;
  decidedAt: string;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const APPROVALS_KEY = "approvals:all";
const APPROVAL_KEY = (id: string) => `approvals:request:${id}`;
const USER_APPROVALS_KEY = (userId: string) => `approvals:user:${userId}`;
const REQUESTER_APPROVALS_KEY = (requesterId: string) => `approvals:requester:${requesterId}`;
const PENDING_APPROVALS_KEY = "approvals:pending";

// ─── Approval Request Management ────────────────────────────────

/**
 * Create a new approval request.
 */
export async function createApprovalRequest(input: {
  requesterId: string;
  requesterType: "agent" | "user";
  requestType: ApprovalRequestType;
  title: string;
  description: string;
  context?: Record<string, any>;
  priority?: "low" | "normal" | "high" | "urgent";
  approvalChain: Array<{
    approverId: string;
    approverName: string;
    approverRole?: string;
  }>;
  expiresAt?: string;
  metadata?: Record<string, any>;
}): Promise<ApprovalRequest> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const approvalChain: ApprovalStep[] = input.approvalChain.map((step, index) => ({
    stepIndex: index,
    approverId: step.approverId,
    approverName: step.approverName,
    approverRole: step.approverRole,
    status: "pending",
  }));

  const request: ApprovalRequest = {
    id,
    requesterId: input.requesterId,
    requesterType: input.requesterType,
    requestType: input.requestType,
    title: input.title,
    description: input.description,
    context: input.context ?? {},
    priority: input.priority ?? "normal",
    status: "pending",
    approvalChain,
    currentStepIndex: 0,
    createdAt: now,
    expiresAt: input.expiresAt,
    metadata: input.metadata ?? {},
  };

  // Store approval request
  await redisCmd.set(APPROVAL_KEY(id), JSON.stringify(request));
  await redisCmd.sadd(APPROVALS_KEY, id);
  await redisCmd.sadd(PENDING_APPROVALS_KEY, id);

  // Index by approvers
  for (const step of approvalChain) {
    await redisCmd.sadd(USER_APPROVALS_KEY(step.approverId), id);
  }

  // Index by requester
  await redisCmd.sadd(REQUESTER_APPROVALS_KEY(input.requesterId), id);

  // Emit event
  pushEvent("approval.requested", {
    approvalId: id,
    requesterId: input.requesterId,
    requestType: input.requestType,
    title: input.title,
    priority: input.priority,
    currentApprover: approvalChain[0]?.approverId,
  });

  logger.info("Approval request created", {
    approvalId: id,
    requesterId: input.requesterId,
    requestType: input.requestType,
    title: input.title,
    chainLength: approvalChain.length,
  });

  return request;
}

/**
 * Get an approval request by ID.
 */
export async function getApprovalRequest(id: string): Promise<ApprovalRequest | null> {
  const data = await redisCmd.get(APPROVAL_KEY(id));
  return data ? JSON.parse(data) : null;
}

/**
 * List approval requests with filters.
 */
export async function listApprovalRequests(filter?: {
  status?: ApprovalStatus;
  requesterId?: string;
  approverId?: string;
  requestType?: ApprovalRequestType;
  limit?: number;
}): Promise<ApprovalRequest[]> {
  let ids: string[] = [];

  if (filter?.approverId) {
    ids = await redisCmd.smembers(USER_APPROVALS_KEY(filter.approverId));
  } else if (filter?.requesterId) {
    ids = await redisCmd.smembers(REQUESTER_APPROVALS_KEY(filter.requesterId));
  } else if (filter?.status === "pending") {
    ids = await redisCmd.smembers(PENDING_APPROVALS_KEY);
  } else {
    ids = await redisCmd.smembers(APPROVALS_KEY);
  }

  const limit = filter?.limit ?? 100;
  const requests: ApprovalRequest[] = [];

  for (const id of ids) {
    const request = await getApprovalRequest(id);
    if (!request) continue;

    if (filter?.status && request.status !== filter.status) continue;
    if (filter?.requestType && request.requestType !== filter.requestType) continue;

    requests.push(request);
    if (requests.length >= limit) break;
  }

  return requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ─── Approval Decisions ─────────────────────────────────────────

/**
 * Submit an approval decision (approve, reject, or delegate).
 */
export async function submitApprovalDecision(input: {
  approvalId: string;
  deciderId: string;
  decision: "approved" | "rejected" | "delegated";
  comments?: string;
  delegatedTo?: string;
}): Promise<ApprovalDecision> {
  const request = await getApprovalRequest(input.approvalId);
  if (!request) {
    throw new Error(`Approval request ${input.approvalId} not found`);
  }

  if (request.status !== "pending" && request.status !== "in_review") {
    throw new Error(`Approval request is already ${request.status}`);
  }

  const currentStep = request.approvalChain[request.currentStepIndex];
  if (!currentStep) {
    throw new Error("No current approval step");
  }

  if (currentStep.approverId !== input.deciderId) {
    throw new Error(`User ${input.deciderId} is not the current approver`);
  }

  const now = new Date().toISOString();

  // Update current step
  currentStep.status = input.decision === "delegated" ? "delegated" : input.decision;
  currentStep.decidedAt = now;
  currentStep.decision = input.decision;
  currentStep.comments = input.comments;

  if (input.decision === "delegated" && input.delegatedTo) {
    currentStep.delegatedTo = input.delegatedTo;

    // Add new step for delegated approver
    const delegatedUser = await prisma.user.findUnique({
      where: { id: input.delegatedTo },
      select: { id: true, name: true, email: true },
    });

    if (delegatedUser) {
      const newStep: ApprovalStep = {
        stepIndex: request.approvalChain.length,
        approverId: delegatedUser.id,
        approverName: delegatedUser.name ?? delegatedUser.email,
        status: "pending",
      };
      request.approvalChain.push(newStep);
      await redisCmd.sadd(USER_APPROVALS_KEY(delegatedUser.id), request.id);
    }
  }

  // Determine next step or final status
  if (input.decision === "rejected") {
    request.status = "rejected";
    request.completedAt = now;
    await redisCmd.srem(PENDING_APPROVALS_KEY, request.id);
  } else if (input.decision === "approved") {
    // Move to next step or complete
    if (request.currentStepIndex < request.approvalChain.length - 1) {
      request.currentStepIndex++;
      request.status = "in_review";
    } else {
      request.status = "approved";
      request.completedAt = now;
      await redisCmd.srem(PENDING_APPROVALS_KEY, request.id);
    }
  } else if (input.decision === "delegated") {
    request.currentStepIndex = request.approvalChain.length - 1;
    request.status = "in_review";
  }

  // Update request
  await redisCmd.set(APPROVAL_KEY(request.id), JSON.stringify(request));

  const decision: ApprovalDecision = {
    approvalId: request.id,
    stepIndex: currentStep.stepIndex,
    deciderId: input.deciderId,
    decision: input.decision,
    comments: input.comments,
    delegatedTo: input.delegatedTo,
    decidedAt: now,
  };

  // Emit event
  pushEvent("approval.decided", {
    approvalId: request.id,
    deciderId: input.deciderId,
    decision: input.decision,
    status: request.status,
  });

  logger.info("Approval decision submitted", {
    approvalId: request.id,
    deciderId: input.deciderId,
    decision: input.decision,
    status: request.status,
  });

  return decision;
}

/**
 * Cancel an approval request.
 */
export async function cancelApprovalRequest(
  approvalId: string,
  cancelledBy: string,
): Promise<ApprovalRequest | null> {
  const request = await getApprovalRequest(approvalId);
  if (!request) return null;

  if (request.status === "approved" || request.status === "rejected") {
    throw new Error("Cannot cancel completed approval request");
  }

  request.status = "cancelled";
  request.completedAt = new Date().toISOString();
  request.metadata.cancelledBy = cancelledBy;

  await redisCmd.set(APPROVAL_KEY(approvalId), JSON.stringify(request));
  await redisCmd.srem(PENDING_APPROVALS_KEY, approvalId);

  pushEvent("approval.cancelled", {
    approvalId,
    cancelledBy,
  });

  logger.info("Approval request cancelled", { approvalId, cancelledBy });

  return request;
}

// ─── Approval Queries ───────────────────────────────────────────

/**
 * Get pending approvals for a user.
 */
export async function getPendingApprovalsForUser(userId: string): Promise<ApprovalRequest[]> {
  return listApprovalRequests({ approverId: userId, status: "pending" });
}

/**
 * Get approval history for a requester.
 */
export async function getApprovalHistory(requesterId: string, limit = 50): Promise<ApprovalRequest[]> {
  return listApprovalRequests({ requesterId, limit });
}

/**
 * Get approval statistics.
 */
export async function getApprovalStats(): Promise<{
  totalRequests: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  avgApprovalTimeMs: number;
}> {
  const allIds = await redisCmd.smembers(APPROVALS_KEY);
  const pendingIds = await redisCmd.smembers(PENDING_APPROVALS_KEY);

  let approvedCount = 0;
  let rejectedCount = 0;
  let totalTimeMs = 0;
  let completedCount = 0;

  for (const id of allIds) {
    const request = await getApprovalRequest(id);
    if (!request) continue;

    if (request.status === "approved") {
      approvedCount++;
      if (request.completedAt) {
        totalTimeMs += new Date(request.completedAt).getTime() - new Date(request.createdAt).getTime();
        completedCount++;
      }
    } else if (request.status === "rejected") {
      rejectedCount++;
      if (request.completedAt) {
        totalTimeMs += new Date(request.completedAt).getTime() - new Date(request.createdAt).getTime();
        completedCount++;
      }
    }
  }

  return {
    totalRequests: allIds.length,
    pendingRequests: pendingIds.length,
    approvedRequests: approvedCount,
    rejectedRequests: rejectedCount,
    avgApprovalTimeMs: completedCount > 0 ? totalTimeMs / completedCount : 0,
  };
}

/**
 * Check for expired approval requests.
 */
export async function checkExpiredApprovals(): Promise<number> {
  const pendingIds = await redisCmd.smembers(PENDING_APPROVALS_KEY);
  const now = new Date();
  let expiredCount = 0;

  for (const id of pendingIds) {
    const request = await getApprovalRequest(id);
    if (!request || !request.expiresAt) continue;

    if (new Date(request.expiresAt) < now) {
      request.status = "expired";
      request.completedAt = now.toISOString();
      await redisCmd.set(APPROVAL_KEY(id), JSON.stringify(request));
      await redisCmd.srem(PENDING_APPROVALS_KEY, id);

      pushEvent("approval.expired", { approvalId: id });
      expiredCount++;
    }
  }

  if (expiredCount > 0) {
    logger.info("Expired approvals processed", { count: expiredCount });
  }

  return expiredCount;
}
