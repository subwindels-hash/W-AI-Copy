/**
 * Agent Lifecycle Management Service (Module 3 — Gap 3)
 *
 * Manages the structured lifecycle of AI agents:
 * ONBOARDING → ACTIVE → TRAINING → RETIRED → ARCHIVED
 *
 * Each transition has validation rules and side effects:
 * - ONBOARDING: Initial setup, skill assignment, knowledge seeding
 * - ACTIVE: Normal operation, can receive and execute tasks
 * - TRAINING: Reduced task load, evaluation tracking
 * - RETIRED: No new tasks, finish existing tasks, memory archival
 * - ARCHIVED: Delete agent data after retention period
 *
 * All transitions are audited with metadata.
 */
import { prisma } from "../db/client.js";
import { redisCmd } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { logger } from "../config/logger.js";
import { pushEvent } from "../http/routes/events.js";
import type { z } from "zod";
import { AgLifecycleTransitionSchema } from "@windels/shared/agents";

// ─── Lifecycle States ───────────────────────────────────────────

export type LifecycleState = "ONBOARDING" | "ACTIVE" | "TRAINING" | "RETIRED" | "ARCHIVED";

const LIFECYCLE_STATES: LifecycleState[] = ["ONBOARDING", "ACTIVE", "TRAINING", "RETIRED", "ARCHIVED"];

// Valid transitions: from → [to, to, ...]
const VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  ONBOARDING: ["ACTIVE"],
  ACTIVE: ["TRAINING", "RETIRED"],
  TRAINING: ["ACTIVE", "RETIRED"],
  RETIRED: ["ARCHIVED", "ACTIVE"], // Can reactivate from retired
  ARCHIVED: [], // Terminal state
};

// Redis keys for lifecycle state (supplements Prisma Agent.status). The org
// segment is required even though agent ids are globally opaque; this keeps
// lifecycle state auditable by the Session 89 namespace checker.
const LIFECYCLE_KEY = (organizationId: string, agentId: string) => `agent:lifecycle:${organizationId}:${agentId}`;
const LIFECYCLE_HISTORY_KEY = (organizationId: string, agentId: string) => `agent:lifecycle:history:${organizationId}:${agentId}`;
// Legacy keys are read once and migrated after an upgrade, never written.
const LEGACY_LIFECYCLE_KEY = (agentId: string) => `agent:lifecycle:${agentId}`;
const LEGACY_HISTORY_KEY = (agentId: string) => `agent:lifecycle:history:${agentId}`;

async function organizationForAgent(agentId: string): Promise<string> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { organizationId: true } });
  if (!agent) throw AppError.notFound("Agent not found");
  return agent.organizationId;
}

// ─── Schemas ────────────────────────────────────────────────────

// Backwards-compatible name retained for route imports.
export const TransitionSchema = AgLifecycleTransitionSchema;

// ─── State Management ───────────────────────────────────────────

/**
 * Get the current lifecycle state of an agent.
 */
export async function getLifecycleState(agentId: string, organizationId?: string): Promise<{
  state: LifecycleState;
  since: string;
  metadata: Record<string, any>;
}> {
  const orgId = organizationId ?? await organizationForAgent(agentId);
  // Try the org-scoped Redis key first (fast). Upgrade legacy state once if it
  // exists; the agent's organization was resolved from Prisma before reading
  // the legacy slot, so this migration cannot cross an agent boundary.
  try {
    let raw = await redisCmd.get(LIFECYCLE_KEY(orgId, agentId));
    if (!raw) {
      raw = await redisCmd.get(LEGACY_LIFECYCLE_KEY(agentId));
      if (raw) {
        await redisCmd.set(LIFECYCLE_KEY(orgId, agentId), raw);
        await redisCmd.del(LEGACY_LIFECYCLE_KEY(agentId));
      }
    }
    if (raw) {
      const data = JSON.parse(raw);
      return {
        state: data.state,
        since: data.since,
        metadata: data.metadata ?? {},
      };
    }
  } catch {}

  // Fallback: derive from Prisma Agent.status
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw AppError.notFound("Agent not found");

  // Map Prisma status to lifecycle state
  const stateMap: Record<string, LifecycleState> = {
    IDLE: "ACTIVE",
    ONLINE: "ACTIVE",
    WORKING: "ACTIVE",
    ERROR: "ACTIVE",
    PAUSED: "TRAINING",
    OFFLINE: "RETIRED",
  };

  const state = stateMap[agent.status] ?? "ONBOARDING";
  return {
    state,
    since: agent.createdAt.toISOString(),
    metadata: {},
  };
}

/**
 * Get the full lifecycle history of an agent.
 */
export async function getLifecycleHistory(agentId: string, organizationId?: string): Promise<
  Array<{
    from: LifecycleState | null;
    to: LifecycleState;
    reason: string;
    userId?: string;
    timestamp: string;
    metadata: Record<string, any>;
  }>
> {
  const orgId = organizationId ?? await organizationForAgent(agentId);
  try {
    let raw = await redisCmd.lrange(LIFECYCLE_HISTORY_KEY(orgId, agentId), 0, -1);
    if (raw.length === 0) {
      const legacy = await redisCmd.lrange(LEGACY_HISTORY_KEY(agentId), 0, -1);
      if (legacy.length > 0) {
        const pipeline = redisCmd.multi();
        for (const entry of [...legacy].reverse()) pipeline.lpush(LIFECYCLE_HISTORY_KEY(orgId, agentId), entry);
        pipeline.ltrim(LIFECYCLE_HISTORY_KEY(orgId, agentId), 0, 99);
        await pipeline.exec();
        await redisCmd.del(LEGACY_HISTORY_KEY(agentId));
        raw = legacy;
      }
    }
    return raw.map((r) => JSON.parse(r));
  } catch {
    return [];
  }
}

// ─── State Transitions ──────────────────────────────────────────

/**
 * Transition an agent to a new lifecycle state.
 * Validates the transition, applies side effects, and records the change.
 */
export async function transitionAgent(
  userId: string,
  agentId: string,
  input: z.infer<typeof TransitionSchema>,
): Promise<{
  from: LifecycleState;
  to: LifecycleState;
  timestamp: string;
}> {
  const ctx = await resolveUserContext(userId);

  // Verify agent belongs to org
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, organizationId: ctx.organizationId },
  });
  if (!agent) throw AppError.notFound("Agent not found");

  // Get current state
  const current = await getLifecycleState(agentId, ctx.organizationId);
  const from = current.state;
  const to = input.to as LifecycleState;

  // Validate transition
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw AppError.badRequest(
      `Invalid lifecycle transition: ${from} → ${to}. ` +
        `Valid transitions from ${from}: ${VALID_TRANSITIONS[from]?.join(", ") ?? "none"}`,
    );
  }

  const timestamp = new Date().toISOString();

  // Apply side effects for the transition
  await applyTransitionSideEffects(agentId, from, to, input.metadata);

  // Record the transition
  const historyEntry = {
    from,
    to,
    reason: input.reason,
    userId,
    timestamp,
    metadata: input.metadata ?? {},
  };

  // Update Redis state
  try {
    const pipeline = redisCmd.multi();
    pipeline.set(
      LIFECYCLE_KEY(ctx.organizationId, agentId),
      JSON.stringify({
        state: to,
        since: timestamp,
        metadata: input.metadata ?? {},
      }),
    );
    pipeline.lpush(LIFECYCLE_HISTORY_KEY(ctx.organizationId, agentId), JSON.stringify(historyEntry));
    pipeline.ltrim(LIFECYCLE_HISTORY_KEY(ctx.organizationId, agentId), 0, 99); // Keep last 100 transitions
    await pipeline.exec();
  } catch (e) {
    logger.warn("Failed to persist lifecycle state to Redis", { agentId, error: e });
  }

  // Update Prisma Agent.status to reflect lifecycle state
  const statusMap: Record<LifecycleState, string> = {
    ONBOARDING: "IDLE",
    ACTIVE: "ONLINE",
    TRAINING: "PAUSED",
    RETIRED: "OFFLINE",
    ARCHIVED: "OFFLINE",
  };

  await prisma.agent.update({
    where: { id: agentId },
    data: { status: statusMap[to] as any },
  });

  // Record audit event
  await prisma.agentEvent.create({
    data: {
      agentId,
      type: "STATUS_CHANGED",
      message: `Lifecycle transition: ${from} → ${to}. Reason: ${input.reason}`,
      metadata: {
        lifecycleFrom: from,
        lifecycleTo: to,
        reason: input.reason,
        userId,
        ...(input.metadata ?? {}),
      },
    },
  });

  // Emit SSE event
  pushEvent("agent.lifecycle_changed", {
    agentId,
    agentName: agent.name,
    from,
    to,
    reason: input.reason,
    organizationId: ctx.organizationId,
  });

  logger.info("Agent lifecycle transition", {
    agentId,
    agentName: agent.name,
    from,
    to,
    reason: input.reason,
    userId,
  });

  return { from, to, timestamp };
}

// ─── Side Effects ───────────────────────────────────────────────

async function applyTransitionSideEffects(
  agentId: string,
  from: LifecycleState,
  to: LifecycleState,
  metadata?: Record<string, any>,
) {
  switch (to) {
    case "ACTIVE":
      // Agent is now fully operational
      // Reassign any pending tasks that were paused
      if (from === "TRAINING" || from === "RETIRED") {
        await prisma.task.updateMany({
          where: { agentId, status: "TODO" },
          data: { status: "TODO" }, // Trigger re-pickup by runtime
        });
      }
      break;

    case "TRAINING":
      // Reduce task load — mark excess tasks as unassigned
      const activeTasks = await prisma.task.count({
        where: { agentId, status: { in: ["TODO", "IN_PROGRESS"] } },
      });
      if (activeTasks > 2) {
        // Keep only 2 active tasks, unassign the rest
        const tasksToUnassign = await prisma.task.findMany({
          where: { agentId, status: "TODO" },
          orderBy: { createdAt: "asc" },
          skip: 2,
          select: { id: true },
        });
        if (tasksToUnassign.length > 0) {
          await prisma.task.updateMany({
            where: { id: { in: tasksToUnassign.map((t) => t.id) } },
            data: { agentId: null },
          });
        }
      }
      break;

    case "RETIRED":
      // Unassign all pending tasks
      await prisma.task.updateMany({
        where: { agentId, status: "TODO" },
        data: { agentId: null },
      });
      // Mark in-progress tasks as blocked
      await prisma.task.updateMany({
        where: { agentId, status: "IN_PROGRESS" },
        data: { status: "BLOCKED" },
      });
      break;

    case "ARCHIVED":
      // Archive agent data (soft delete)
      // In production, this would move data to cold storage
      await prisma.agentMemory.deleteMany({ where: { agentId } });
      await prisma.agentKnowledge.deleteMany({ where: { agentId } });
      await prisma.agentSkill.deleteMany({ where: { agentId } });
      // Keep events for audit trail but mark as archived
      await prisma.agentEvent.create({
        data: {
          agentId,
          type: "STATUS_CHANGED",
          message: "Agent archived — memory, knowledge, and skills deleted",
          metadata: { archived: true, ...(metadata ?? {}) },
        },
      });
      break;
  }
}

// ─── Lifecycle Queries ──────────────────────────────────────────

/**
 * List all agents in a specific lifecycle state.
 */
export async function listAgentsByLifecycle(
  userId: string,
  state: LifecycleState,
): Promise<Array<{ agentId: string; agentName: string; since: string }>> {
  const ctx = await resolveUserContext(userId);

  // Map lifecycle state to Prisma status
  const statusMap: Record<LifecycleState, string[]> = {
    ONBOARDING: ["IDLE"],
    ACTIVE: ["ONLINE", "WORKING", "ERROR"],
    TRAINING: ["PAUSED"],
    RETIRED: ["OFFLINE"],
    ARCHIVED: [], // Archived agents are soft-deleted
  };

  const statuses = statusMap[state] ?? [];
  const agents = await prisma.agent.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: { in: statuses as any[] },
    },
    select: { id: true, name: true, lastActivityAt: true },
  });

  return agents.map((a) => ({
    agentId: a.id,
    agentName: a.name,
    since: a.lastActivityAt.toISOString(),
  }));
}

/**
 * Get lifecycle statistics for the organization.
 */
export async function getLifecycleStats(userId: string) {
  const ctx = await resolveUserContext(userId);

  const agents = await prisma.agent.findMany({
    where: { organizationId: ctx.organizationId },
    select: { status: true },
  });

  const stats: Record<LifecycleState, number> = {
    ONBOARDING: 0,
    ACTIVE: 0,
    TRAINING: 0,
    RETIRED: 0,
    ARCHIVED: 0,
  };

  const statusToLifecycle: Record<string, LifecycleState> = {
    IDLE: "ONBOARDING",
    ONLINE: "ACTIVE",
    WORKING: "ACTIVE",
    ERROR: "ACTIVE",
    PAUSED: "TRAINING",
    OFFLINE: "RETIRED",
  };

  for (const agent of agents) {
    const state = statusToLifecycle[agent.status] ?? "ACTIVE";
    stats[state]++;
  }

  return {
    total: agents.length,
    byState: stats,
  };
}

/**
 * Check if an agent can accept new tasks based on lifecycle state.
 */
export async function canAcceptTasks(agentId: string): Promise<boolean> {
  const { state } = await getLifecycleState(agentId);
  return state === "ACTIVE";
}

/**
 * Bulk transition multiple agents (e.g., retire all agents in a department).
 */
export async function bulkTransition(
  userId: string,
  agentIds: string[],
  input: z.infer<typeof TransitionSchema>,
): Promise<{ succeeded: number; failed: number; errors: Array<{ agentId: string; error: string }> }> {
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ agentId: string; error: string }> = [];

  for (const agentId of agentIds) {
    try {
      await transitionAgent(userId, agentId, input);
      succeeded++;
    } catch (e: any) {
      failed++;
      errors.push({ agentId, error: e.message ?? "Unknown error" });
    }
  }

  return { succeeded, failed, errors };
}
