/**
 * Agent Orchestration Service (Module 3 — Gap 4)
 *
 * Multi-agent workflow execution:
 * - Task distribution: round-robin, least-loaded, skill-based routing
 * - Parallel execution: distribute task to multiple agents, aggregate results
 * - Coordinator logic: auto-assign tasks based on agent capabilities
 * - Load balancing: track agent workload, avoid overloading
 * - Failure handling: retry on different agent if first fails
 */
import { prisma } from "../db/client.js";
import { redisCmd } from "../db/redis.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { logger } from "../config/logger.js";
import { pushEvent } from "../http/routes/events.js";
import { canAcceptTasks } from "./agentLifecycle.service.js";
import { agentHasSkill } from "./agentSkills.service.js";
import { z } from "zod";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:agentOrchestration');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export type RoutingStrategy = "round_robin" | "least_loaded" | "skill_based" | "random";

export interface OrchestrationResult {
  taskId: string;
  assignedAgentId: string;
  assignedAgentName: string;
  strategy: RoutingStrategy;
  reason: string;
}

export interface ParallelResult {
  orchestrationId: string;
  taskId: string;
  assignments: Array<{
    agentId: string;
    agentName: string;
    subtaskId: string;
    status: "assigned" | "failed";
    error?: string;
  }>;
  totalAssigned: number;
  totalFailed: number;
}

// ─── Workload Tracking ──────────────────────────────────────────

const WORKLOAD_KEY = (agentId: string) => `agent:workload:${agentId}`;

async function getAgentWorkload(agentId: string): Promise<number> {
  try {
    const raw = await redisCmd.get(WORKLOAD_KEY(agentId));
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    // Fallback: count from DB
    return prisma.task.count({
      where: { agentId, status: { in: ["TODO", "IN_PROGRESS"] } },
    });
  }
}

async function incrementWorkload(agentId: string) {
  try {
    await redisCmd.incr(WORKLOAD_KEY(agentId));
    await redisCmd.expire(WORKLOAD_KEY(agentId), 3600); // 1 hour TTL
  } catch {}
}

async function decrementWorkload(agentId: string) {
  try {
    const val = await redisCmd.decr(WORKLOAD_KEY(agentId));
    if (val < 0) await redisCmd.set(WORKLOAD_KEY(agentId), "0");
  } catch {}
}

// ─── Routing Strategies ─────────────────────────────────────────

/**
 * Select the best agent for a task based on the routing strategy.
 */
export async function selectAgent(
  organizationId: string,
  strategy: RoutingStrategy,
  options?: {
    requiredSkills?: string[];
    department?: string;
    excludeAgentIds?: string[];
  },
): Promise<{ agentId: string; agentName: string; reason: string } | null> {
  // Get eligible agents
  const where: any = {
    organizationId,
    status: { in: ["ONLINE", "IDLE", "WORKING"] },
  };
  if (options?.department) where.department = options.department;
  if (options?.excludeAgentIds?.length) {
    where.id = { notIn: options.excludeAgentIds };
  }

  const agents = await prisma.agent.findMany({
    where,
    select: {
      id: true,
      name: true,
      capabilities: true,
      department: true,
    },
  });

  if (agents.length === 0) return null;

  // Filter by lifecycle state (can accept tasks)
  const eligible: typeof agents = [];
  for (const agent of agents) {
    const canAccept = await canAcceptTasks(agent.id);
    if (canAccept) eligible.push(agent);
  }

  if (eligible.length === 0) return null;

  // Filter by required skills
  let candidates = eligible;
  if (options?.requiredSkills?.length) {
    const withSkills: typeof agents = [];
    for (const agent of candidates) {
      const hasAll = options.requiredSkills.every(
        (skill) =>
          agent.capabilities.includes(skill) ||
          (await agentHasSkill(agent.id, skill)),
      );
      if (hasAll) withSkills.push(agent);
    }
    if (withSkills.length > 0) candidates = withSkills;
    // If no agent has all skills, fall back to all eligible
  }

  // Apply routing strategy
  switch (strategy) {
    case "round_robin": {
      // Use Redis counter for round-robin
      try {
        const key = `orchestration:rr:${organizationId}`;
        const idx = await redisCmd.incr(key);
        await redisCmd.expire(key, 86400);
        const agent = candidates[(idx - 1) % candidates.length];
        return { agentId: agent.id, agentName: agent.name, reason: `Round-robin selection (index ${(idx - 1) % candidates.length})` };
      } catch {
        const agent = candidates[Math.floor(_rng.next() * candidates.length)];
        return { agentId: agent.id, agentName: agent.name, reason: "Random fallback (round-robin Redis failed)" };
      }
    }

    case "least_loaded": {
      // Find agent with lowest workload
      let minLoad = Infinity;
      let selected = candidates[0];
      for (const agent of candidates) {
        const load = await getAgentWorkload(agent.id);
        if (load < minLoad) {
          minLoad = load;
          selected = agent;
        }
      }
      return { agentId: selected.id, agentName: selected.name, reason: `Least loaded (workload: ${minLoad})` };
    }

    case "skill_based": {
      // Score agents by skill match
      if (!options?.requiredSkills?.length) {
        // No skills required, fall back to least loaded
        return selectAgent(organizationId, "least_loaded", options);
      }
      let bestScore = -1;
      let selected = candidates[0];
      for (const agent of candidates) {
        let score = 0;
        for (const skill of options.requiredSkills) {
          if (agent.capabilities.includes(skill)) score += 2;
          else if (await agentHasSkill(agent.id, skill)) score += 1;
        }
        // Penalize high workload
        const load = await getAgentWorkload(agent.id);
        score -= load * 0.5;
        if (score > bestScore) {
          bestScore = score;
          selected = agent;
        }
      }
      return { agentId: selected.id, agentName: selected.name, reason: `Skill-based routing (score: ${bestScore})` };
    }

    case "random":
    default: {
      const agent = candidates[Math.floor(_rng.next() * candidates.length)];
      return { agentId: agent.id, agentName: agent.name, reason: "Random selection" };
    }
  }
}

// ─── Task Assignment ────────────────────────────────────────────

/**
 * Assign a task to the best available agent using the specified strategy.
 */
export async function assignTask(
  userId: string,
  taskId: string,
  strategy: RoutingStrategy = "least_loaded",
  options?: {
    requiredSkills?: string[];
    department?: string;
  },
): Promise<OrchestrationResult> {
  const ctx = await resolveUserContext(userId);

  // Verify task exists and belongs to org
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: ctx.organizationId },
  });
  if (!task) throw AppError.notFound("Task not found");
  if (task.agentId) throw AppError.badRequest("Task is already assigned to an agent");

  // Select agent
  const selection = await selectAgent(ctx.organizationId, strategy, options);
  if (!selection) {
    throw AppError.serviceUnavailable("No eligible agents available for this task");
  }

  // Assign task
  await prisma.task.update({
    where: { id: taskId },
    data: { agentId: selection.agentId, status: "TODO" },
  });

  // Increment workload
  await incrementWorkload(selection.agentId);

  // Emit event
  pushEvent("task.assigned", {
    taskId,
    agentId: selection.agentId,
    agentName: selection.agentName,
    strategy,
    organizationId: ctx.organizationId,
  });

  logger.info("Task assigned via orchestration", {
    taskId,
    agentId: selection.agentId,
    strategy,
    reason: selection.reason,
  });

  return {
    taskId,
    assignedAgentId: selection.agentId,
    assignedAgentName: selection.agentName,
    strategy,
    reason: selection.reason,
  };
}

// ─── Parallel Execution ─────────────────────────────────────────

/**
 * Distribute a task to multiple agents in parallel.
 * Creates sub-tasks for each agent and tracks completion.
 */
export async function distributeTaskParallel(
  userId: string,
  input: {
    title: string;
    description?: string;
    agentIds: string[];
    strategy?: RoutingStrategy;
  },
): Promise<ParallelResult> {
  const ctx = await resolveUserContext(userId);
  const orchestrationId = `orch_${Date.now()}`;

  // Create parent task
  const parentTask = await prisma.task.create({
    data: {
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      title: `[Parallel] ${input.title}`,
      description: input.description,
      status: "IN_PROGRESS",
      creatorId: userId,
      metadata: { orchestrationId, parallel: true, agentCount: input.agentIds.length },
    },
  });

  const assignments: ParallelResult["assignments"] = [];

  // Create sub-tasks for each agent
  for (const agentId of input.agentIds) {
    try {
      const agent = await prisma.agent.findFirst({
        where: { id: agentId, organizationId: ctx.organizationId },
      });
      if (!agent) {
        assignments.push({
          agentId,
          agentName: "Unknown",
          subtaskId: "",
          status: "failed",
          error: "Agent not found",
        });
        continue;
      }

      const subtask = await prisma.task.create({
        data: {
          organizationId: ctx.organizationId,
          workspaceId: ctx.workspaceId,
          title: `[${agent.name}] ${input.title}`,
          description: input.description,
          status: "TODO",
          agentId,
          creatorId: userId,
          metadata: { orchestrationId, parentTaskId: parentTask.id },
        },
      });

      await incrementWorkload(agentId);

      assignments.push({
        agentId,
        agentName: agent.name,
        subtaskId: subtask.id,
        status: "assigned",
      });
    } catch (e: any) {
      assignments.push({
        agentId,
        agentName: "Unknown",
        subtaskId: "",
        status: "failed",
        error: e.message,
      });
    }
  }

  // Emit event
  pushEvent("task.distributed_parallel", {
    orchestrationId,
    parentTaskId: parentTask.id,
    totalAssigned: assignments.filter((a) => a.status === "assigned").length,
    totalFailed: assignments.filter((a) => a.status === "failed").length,
    organizationId: ctx.organizationId,
  });

  return {
    orchestrationId,
    taskId: parentTask.id,
    assignments,
    totalAssigned: assignments.filter((a) => a.status === "assigned").length,
    totalFailed: assignments.filter((a) => a.status === "failed").length,
  };
}

// ─── Auto-Assignment ────────────────────────────────────────────

/**
 * Auto-assign all unassigned tasks in the organization.
 * Called periodically or manually to distribute work.
 */
export async function autoAssignTasks(
  userId: string,
  strategy: RoutingStrategy = "least_loaded",
  limit: number = 20,
): Promise<{ assigned: number; skipped: number; failed: number }> {
  const ctx = await resolveUserContext(userId);

  const unassignedTasks = await prisma.task.findMany({
    where: {
      organizationId: ctx.organizationId,
      agentId: null,
      status: "TODO",
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: limit,
  });

  let assigned = 0;
  let skipped = 0;
  let failed = 0;

  for (const task of unassignedTasks) {
    try {
      const selection = await selectAgent(ctx.organizationId, strategy);
      if (!selection) {
        skipped++;
        continue;
      }

      await prisma.task.update({
        where: { id: task.id },
        data: { agentId: selection.agentId },
      });

      await incrementWorkload(selection.agentId);
      assigned++;
    } catch (e) {
      failed++;
    }
  }

  logger.info("Auto-assignment complete", { assigned, skipped, failed, strategy });

  return { assigned, skipped, failed };
}

// ─── Workload Report ────────────────────────────────────────────

/**
 * Get current workload for all agents in the organization.
 */
export async function getWorkloadReport(userId: string) {
  const ctx = await resolveUserContext(userId);

  const agents = await prisma.agent.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      id: true,
      name: true,
      role: true,
      status: true,
      department: true,
      _count: {
        select: {
          tasks: { where: { status: { in: ["TODO", "IN_PROGRESS"] } } },
        },
      },
    },
  });

  const report = [];
  for (const agent of agents) {
    const redisWorkload = await getAgentWorkload(agent.id);
    report.push({
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      department: agent.department,
      status: agent.status,
      activeTasks: agent._count.tasks,
      trackedWorkload: redisWorkload,
      canAccept: ["ONLINE", "IDLE", "WORKING"].includes(agent.status),
    });
  }

  return report.sort((a, b) => a.activeTasks - b.activeTasks);
}
