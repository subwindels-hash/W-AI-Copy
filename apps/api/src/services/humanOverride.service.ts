/**
 * Human Override Service (Module 14 — Gap 3)
 *
 * Human override mechanisms for agent decisions and actions:
 * - Override agent decisions with reason
 * - Override agent actions before execution
 * - Override history and audit trail
 * - Override policies and permissions
 * - Integration with approval workflows
 * - Real-time override notifications
 *
 * Enables human intervention in autonomous agent behavior.
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { prisma } from "../db/client.js";
import { pushEvent } from "../http/routes/events.js";

// ─── Types ──────────────────────────────────────────────────────

export interface HumanOverride {
  id: string;
  overriderId: string; // User ID
  overriderName: string;
  overriderRole?: string;
  targetAgentId: string;
  targetAgentName: string;
  overrideType: OverrideType;
  targetId: string; // Decision ID, action ID, task ID, etc.
  targetType: "decision" | "action" | "task" | "goal" | "plan";
  reason: string;
  originalValue?: any;
  overriddenValue?: any;
  status: OverrideStatus;
  createdAt: string;
  expiresAt?: string;
  metadata: Record<string, any>;
}

export type OverrideType =
  | "decision_override" // Override a decision
  | "action_block" // Block an action from executing
  | "action_modify" // Modify action parameters
  | "task_reassign" // Reassign task to different agent or human
  | "goal_modify" // Modify goal parameters
  | "plan_pause" // Pause plan execution
  | "plan_cancel" // Cancel a plan
  | "behavior_restrict" // Restrict agent behavior temporarily
  | "custom";

export type OverrideStatus =
  | "active" // Override is currently active
  | "applied" // Override was applied once
  | "expired" // Override expired
  | "revoked" // Override was revoked by human
  | "completed"; // Override completed its purpose

export interface OverridePolicy {
  id: string;
  name: string;
  description: string;
  targetRoles: string[]; // Agent roles this policy applies to
  overrideTypes: OverrideType[];
  requiresApproval: boolean;
  approverIds?: string[]; // Users who can approve
  maxDuration?: number; // Max duration in hours
  createdAt: string;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const OVERRIDES_KEY = "overrides:all";
const OVERRIDE_KEY = (id: string) => `overrides:override:${id}`;
const AGENT_OVERRIDES_KEY = (agentId: string) => `overrides:agent:${agentId}`;
const ACTIVE_OVERRIDES_KEY = "overrides:active";
const POLICIES_KEY = "overrides:policies";
const POLICY_KEY = (id: string) => `overrides:policy:${id}`;

// ─── Override Management ────────────────────────────────────────

/**
 * Create a human override.
 */
export async function createOverride(input: {
  overriderId: string;
  targetAgentId: string;
  overrideType: OverrideType;
  targetId: string;
  targetType: "decision" | "action" | "task" | "goal" | "plan";
  reason: string;
  originalValue?: any;
  overriddenValue?: any;
  duration?: number; // Duration in hours
  metadata?: Record<string, any>;
}): Promise<HumanOverride> {
  const id = randomUUID();
  const now = new Date();

  // Get overrider and target info
  const [overrider, targetAgent] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.overriderId },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.agent.findUnique({
      where: { id: input.targetAgentId },
      select: { id: true, name: true, role: true },
    }),
  ]);

  if (!overrider) {
    throw new Error(`Overrider ${input.overriderId} not found`);
  }

  if (!targetAgent) {
    throw new Error(`Target agent ${input.targetAgentId} not found`);
  }

  const override: HumanOverride = {
    id,
    overriderId: overrider.id,
    overriderName: overrider.name ?? overrider.email,
    overriderRole: overrider.role,
    targetAgentId: targetAgent.id,
    targetAgentName: targetAgent.name,
    overrideType: input.overrideType,
    targetId: input.targetId,
    targetType: input.targetType,
    reason: input.reason,
    originalValue: input.originalValue,
    overriddenValue: input.overriddenValue,
    status: "active",
    createdAt: now.toISOString(),
    expiresAt: input.duration
      ? new Date(now.getTime() + input.duration * 60 * 60 * 1000).toISOString()
      : undefined,
    metadata: input.metadata ?? {},
  };

  // Store override
  await redisCmd.set(OVERRIDE_KEY(id), JSON.stringify(override));
  await redisCmd.sadd(OVERRIDES_KEY, id);
  await redisCmd.sadd(AGENT_OVERRIDES_KEY(input.targetAgentId), id);
  await redisCmd.sadd(ACTIVE_OVERRIDES_KEY, id);

  // Emit event
  pushEvent("override.created", {
    overrideId: id,
    overriderId: input.overriderId,
    targetAgentId: input.targetAgentId,
    overrideType: input.overrideType,
    targetType: input.targetType,
    targetId: input.targetId,
  });

  logger.info("Human override created", {
    overrideId: id,
    overriderId: input.overriderId,
    targetAgentId: input.targetAgentId,
    overrideType: input.overrideType,
    targetType: input.targetType,
  });

  return override;
}

/**
 * Get an override by ID.
 */
export async function getOverride(id: string): Promise<HumanOverride | null> {
  const data = await redisCmd.get(OVERRIDE_KEY(id));
  return data ? JSON.parse(data) : null;
}

/**
 * List overrides with filters.
 */
export async function listOverrides(filter?: {
  status?: OverrideStatus;
  targetAgentId?: string;
  overriderId?: string;
  overrideType?: OverrideType;
  limit?: number;
}): Promise<HumanOverride[]> {
  let ids: string[] = [];

  if (filter?.targetAgentId) {
    ids = await redisCmd.smembers(AGENT_OVERRIDES_KEY(filter.targetAgentId));
  } else if (filter?.status === "active") {
    ids = await redisCmd.smembers(ACTIVE_OVERRIDES_KEY);
  } else {
    ids = await redisCmd.smembers(OVERRIDES_KEY);
  }

  const limit = filter?.limit ?? 100;
  const overrides: HumanOverride[] = [];

  for (const id of ids) {
    const override = await getOverride(id);
    if (!override) continue;

    if (filter?.status && override.status !== filter.status) continue;
    if (filter?.overriderId && override.overriderId !== filter.overriderId) continue;
    if (filter?.overrideType && override.overrideType !== filter.overrideType) continue;

    overrides.push(override);
    if (overrides.length >= limit) break;
  }

  return overrides.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Apply an override (mark as applied).
 */
export async function applyOverride(overrideId: string): Promise<HumanOverride | null> {
  const override = await getOverride(overrideId);
  if (!override) return null;

  if (override.status !== "active") {
    throw new Error(`Override is ${override.status}, cannot apply`);
  }

  override.status = "applied";
  override.metadata.appliedAt = new Date().toISOString();

  await redisCmd.set(OVERRIDE_KEY(overrideId), JSON.stringify(override));
  await redisCmd.srem(ACTIVE_OVERRIDES_KEY, overrideId);

  pushEvent("override.applied", {
    overrideId,
    targetAgentId: override.targetAgentId,
    overrideType: override.overrideType,
  });

  logger.info("Override applied", {
    overrideId,
    targetAgentId: override.targetAgentId,
    overrideType: override.overrideType,
  });

  return override;
}

/**
 * Revoke an override.
 */
export async function revokeOverride(
  overrideId: string,
  revokedBy: string,
  reason?: string,
): Promise<HumanOverride | null> {
  const override = await getOverride(overrideId);
  if (!override) return null;

  if (override.status !== "active" && override.status !== "applied") {
    throw new Error(`Override is ${override.status}, cannot revoke`);
  }

  override.status = "revoked";
  override.metadata.revokedAt = new Date().toISOString();
  override.metadata.revokedBy = revokedBy;
  override.metadata.revokeReason = reason;

  await redisCmd.set(OVERRIDE_KEY(overrideId), JSON.stringify(override));
  await redisCmd.srem(ACTIVE_OVERRIDES_KEY, overrideId);

  pushEvent("override.revoked", {
    overrideId,
    revokedBy,
    targetAgentId: override.targetAgentId,
  });

  logger.info("Override revoked", {
    overrideId,
    revokedBy,
    targetAgentId: override.targetAgentId,
  });

  return override;
}

// ─── Override Checks ────────────────────────────────────────────

/**
 * Check if an agent has active overrides.
 */
export async function hasActiveOverrides(agentId: string): Promise<boolean> {
  const overrideIds = await redisCmd.smembers(AGENT_OVERRIDES_KEY(agentId));
  
  for (const id of overrideIds) {
    const override = await getOverride(id);
    if (override && override.status === "active") {
      return true;
    }
  }

  return false;
}

/**
 * Get active overrides for an agent.
 */
export async function getActiveOverridesForAgent(agentId: string): Promise<HumanOverride[]> {
  return listOverrides({ targetAgentId: agentId, status: "active" });
}

/**
 * Check if a specific action/decision is overridden.
 */
export async function isOverridden(
  agentId: string,
  targetType: "decision" | "action" | "task" | "goal" | "plan",
  targetId: string,
): Promise<HumanOverride | null> {
  const overrides = await listOverrides({ targetAgentId: agentId, status: "active" });

  for (const override of overrides) {
    if (override.targetType === targetType && override.targetId === targetId) {
      return override;
    }
  }

  return null;
}

// ─── Override Expiration ────────────────────────────────────────

/**
 * Check for expired overrides.
 */
export async function checkExpiredOverrides(): Promise<number> {
  const activeIds = await redisCmd.smembers(ACTIVE_OVERRIDES_KEY);
  const now = new Date();
  let expiredCount = 0;

  for (const id of activeIds) {
    const override = await getOverride(id);
    if (!override || !override.expiresAt) continue;

    if (new Date(override.expiresAt) < now) {
      override.status = "expired";
      override.metadata.expiredAt = now.toISOString();
      await redisCmd.set(OVERRIDE_KEY(id), JSON.stringify(override));
      await redisCmd.srem(ACTIVE_OVERRIDES_KEY, id);

      pushEvent("override.expired", {
        overrideId: id,
        targetAgentId: override.targetAgentId,
      });

      expiredCount++;
    }
  }

  if (expiredCount > 0) {
    logger.info("Expired overrides processed", { count: expiredCount });
  }

  return expiredCount;
}

// ─── Override Statistics ────────────────────────────────────────

/**
 * Get override statistics.
 */
export async function getOverrideStats(): Promise<{
  totalOverrides: number;
  activeOverrides: number;
  byType: Record<OverrideType, number>;
  byAgent: Array<{ agentId: string; agentName: string; count: number }>;
  avgDurationHours: number;
}> {
  const allIds = await redisCmd.smembers(OVERRIDES_KEY);
  const activeIds = await redisCmd.smembers(ACTIVE_OVERRIDES_KEY);

  const byType: Record<string, number> = {};
  const agentCounts: Record<string, { agentName: string; count: number }> = {};
  let totalDurationHours = 0;
  let durationCount = 0;

  for (const id of allIds) {
    const override = await getOverride(id);
    if (!override) continue;

    byType[override.overrideType] = (byType[override.overrideType] ?? 0) + 1;

    if (!agentCounts[override.targetAgentId]) {
      agentCounts[override.targetAgentId] = {
        agentName: override.targetAgentName,
        count: 0,
      };
    }
    agentCounts[override.targetAgentId].count++;

    // Calculate duration for completed overrides
    if (override.metadata.appliedAt || override.metadata.revokedAt || override.metadata.expiredAt) {
      const endTime = new Date(
        override.metadata.appliedAt ?? override.metadata.revokedAt ?? override.metadata.expiredAt
      );
      const startTime = new Date(override.createdAt);
      totalDurationHours += (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      durationCount++;
    }
  }

  const byAgent = Object.entries(agentCounts).map(([agentId, data]) => ({
    agentId,
    agentName: data.agentName,
    count: data.count,
  }));

  return {
    totalOverrides: allIds.length,
    activeOverrides: activeIds.length,
    byType: byType as Record<OverrideType, number>,
    byAgent: byAgent.sort((a, b) => b.count - a.count),
    avgDurationHours: durationCount > 0 ? totalDurationHours / durationCount : 0,
  };
}

// ─── Override Policies ──────────────────────────────────────────

/**
 * Create an override policy.
 */
export async function createOverridePolicy(input: {
  name: string;
  description: string;
  targetRoles: string[];
  overrideTypes: OverrideType[];
  requiresApproval: boolean;
  approverIds?: string[];
  maxDuration?: number;
}): Promise<OverridePolicy> {
  const id = randomUUID();
  const policy: OverridePolicy = {
    id,
    name: input.name,
    description: input.description,
    targetRoles: input.targetRoles,
    overrideTypes: input.overrideTypes,
    requiresApproval: input.requiresApproval,
    approverIds: input.approverIds,
    maxDuration: input.maxDuration,
    createdAt: new Date().toISOString(),
  };

  await redisCmd.set(POLICY_KEY(id), JSON.stringify(policy));
  await redisCmd.sadd(POLICIES_KEY, id);

  logger.info("Override policy created", {
    policyId: id,
    name: input.name,
    targetRoles: input.targetRoles,
  });

  return policy;
}

/**
 * Get applicable policies for an agent.
 */
export async function getApplicablePolicies(agentRole: string): Promise<OverridePolicy[]> {
  const policyIds = await redisCmd.smembers(POLICIES_KEY);
  const policies: OverridePolicy[] = [];

  for (const id of policyIds) {
    const data = await redisCmd.get(POLICY_KEY(id));
    if (!data) continue;

    const policy: OverridePolicy = JSON.parse(data);
    if (policy.targetRoles.includes(agentRole) || policy.targetRoles.includes("*")) {
      policies.push(policy);
    }
  }

  return policies;
}
