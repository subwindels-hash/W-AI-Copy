/**
 * Collaborative Task Service (Module 5 — Gap 3)
 *
 * Enables multiple agents to work on the same task simultaneously:
 * - Task partitioning (split task into subtasks for parallel execution)
 * - Work assignment and tracking per agent
 * - Progress aggregation across agents
 * - Result merging and conflict resolution
 * - Real-time collaboration via shared context
 * - Completion detection and final result assembly
 *
 * Integrates with:
 * - Shared Context Service for shared state
 * - Global Scheduler for task distribution
 * - Agent Runtime for task execution
 */
import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/result.js";
import { pushEvent } from "../http/routes/events.js";
import { z } from "zod";

// ─── Types ──────────────────────────────────────────────────────

export type CollaborativeTaskStatus = "planning" | "in_progress" | "merging" | "completed" | "failed";
export type SubtaskStatus = "pending" | "assigned" | "in_progress" | "completed" | "failed";

export interface CollaborativeTask {
  id: string;
  parentTaskId: string; // Original task ID
  organizationId: string;
  title: string;
  description: string;
  status: CollaborativeTaskStatus;
  strategy: CollaborationStrategy;
  subtasks: Subtask[];
  sharedContextId?: string; // Shared context for collaboration
  results: Record<string, any>; // agentId -> result
  finalResult?: any;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  metadata: Record<string, any>;
}

export interface Subtask {
  id: string;
  collaborativeTaskId: string;
  title: string;
  description: string;
  assignedTo?: string; // agent ID
  status: SubtaskStatus;
  dependencies: string[]; // subtask IDs this depends on
  result?: any;
  startedAt?: number;
  completedAt?: number;
  metadata: Record<string, any>;
}

export type CollaborationStrategy = "parallel" | "pipeline" | "map_reduce" | "divide_conquer";

export interface CollaborationProgress {
  collaborativeTaskId: string;
  totalSubtasks: number;
  completedSubtasks: number;
  failedSubtasks: number;
  inProgressSubtasks: number;
  pendingSubtasks: number;
  overallProgress: number; // 0-100
  estimatedCompletion?: number; // Unix timestamp
}

// ─── Redis Keys ─────────────────────────────────────────────────

const COLLAB_TASK_KEY = (id: string) => `collab:task:${id}`;
const COLLAB_TASK_INDEX_KEY = "collab:tasks";
const COLLAB_TASK_ORG_KEY = (orgId: string) => `collab:org:${orgId}`;
const COLLAB_TASK_PARENT_KEY = (parentId: string) => `collab:parent:${parentId}`;
const SUBTASK_KEY = (id: string) => `collab:subtask:${id}`;

// ─── Schemas ────────────────────────────────────────────────────

export const CreateCollaborativeTaskSchema = z.object({
  parentTaskId: z.string().cuid(),
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  strategy: z.enum(["parallel", "pipeline", "map_reduce", "divide_conquer"]).default("parallel"),
  subtasks: z.array(z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000),
    assignedTo: z.string().cuid().optional(),
    dependencies: z.array(z.string()).default([]),
    metadata: z.record(z.any()).optional(),
  })).min(1).max(50),
  createSharedContext: z.boolean().default(true),
  metadata: z.record(z.any()).optional(),
});

export const AssignSubtaskSchema = z.object({
  subtaskId: z.string(),
  agentId: z.string().cuid(),
});

export const CompleteSubtaskSchema = z.object({
  subtaskId: z.string(),
  result: z.any(),
  status: z.enum(["completed", "failed"]).default("completed"),
});

// ─── Collaborative Task Management ──────────────────────────────

/**
 * Create a collaborative task with subtasks.
 */
export async function createCollaborativeTask(
  organizationId: string,
  creatorId: string,
  input: z.infer<typeof CreateCollaborativeTaskSchema>,
): Promise<CollaborativeTask> {
  const id = `collab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  // Create subtasks
  const subtasks: Subtask[] = input.subtasks.map((st, index) => ({
    id: `sub_${id}_${index}`,
    collaborativeTaskId: id,
    title: st.title,
    description: st.description,
    assignedTo: st.assignedTo,
    status: st.assignedTo ? "assigned" : "pending",
    dependencies: st.dependencies,
    metadata: st.metadata ?? {},
  }));

  // Create shared context if requested
  let sharedContextId: string | undefined;
  if (input.createSharedContext) {
    try {
      const { createContext } = await import("./sharedContext.service.js");
      const context = await createContext(organizationId, creatorId, {
        name: `Collaboration: ${input.title}`,
        scope: "task",
        scopeId: id,
        initialData: {
          parentTaskId: input.parentTaskId,
          strategy: input.strategy,
          subtaskCount: subtasks.length,
        },
      });
      sharedContextId = context.id;
    } catch (e) {
      logger.warn("Failed to create shared context", { error: e });
    }
  }

  const collabTask: CollaborativeTask = {
    id,
    parentTaskId: input.parentTaskId,
    organizationId,
    title: input.title,
    description: input.description,
    status: "planning",
    strategy: input.strategy,
    subtasks,
    sharedContextId,
    results: {},
    createdBy: creatorId,
    createdAt: now,
    updatedAt: now,
    metadata: input.metadata ?? {},
  };

  // Store collaborative task
  await redis.hset(COLLAB_TASK_KEY(id), {
    id: collabTask.id,
    parentTaskId: collabTask.parentTaskId,
    organizationId: collabTask.organizationId,
    title: collabTask.title,
    description: collabTask.description,
    status: collabTask.status,
    strategy: collabTask.strategy,
    subtasks: JSON.stringify(collabTask.subtasks),
    sharedContextId: collabTask.sharedContextId ?? "",
    results: JSON.stringify(collabTask.results),
    finalResult: collabTask.finalResult ? JSON.stringify(collabTask.finalResult) : "",
    createdBy: collabTask.createdBy,
    createdAt: String(collabTask.createdAt),
    updatedAt: String(collabTask.updatedAt),
    completedAt: collabTask.completedAt ? String(collabTask.completedAt) : "",
    metadata: JSON.stringify(collabTask.metadata),
  });

  // Store subtasks
  for (const subtask of subtasks) {
    await redis.hset(SUBTASK_KEY(subtask.id), {
      id: subtask.id,
      collaborativeTaskId: subtask.collaborativeTaskId,
      title: subtask.title,
      description: subtask.description,
      assignedTo: subtask.assignedTo ?? "",
      status: subtask.status,
      dependencies: JSON.stringify(subtask.dependencies),
      result: subtask.result ? JSON.stringify(subtask.result) : "",
      startedAt: subtask.startedAt ? String(subtask.startedAt) : "",
      completedAt: subtask.completedAt ? String(subtask.completedAt) : "",
      metadata: JSON.stringify(subtask.metadata),
    });
  }

  // Add to indexes
  const pipeline = redis.multi();
  pipeline.sadd(COLLAB_TASK_INDEX_KEY, id);
  pipeline.sadd(COLLAB_TASK_ORG_KEY(organizationId), id);
  pipeline.sadd(COLLAB_TASK_PARENT_KEY(input.parentTaskId), id);
  await pipeline.exec();

  logger.info("Collaborative task created", {
    collabTaskId: id,
    parentTaskId: input.parentTaskId,
    strategy: input.strategy,
    subtaskCount: subtasks.length,
    sharedContextId,
  });

  // Emit event
  pushEvent("collab_task.created", {
    collabTaskId: id,
    parentTaskId: input.parentTaskId,
    strategy: input.strategy,
    subtaskCount: subtasks.length,
    organizationId,
  });

  return collabTask;
}

/**
 * Get a collaborative task by ID.
 */
export async function getCollaborativeTask(taskId: string): Promise<CollaborativeTask | null> {
  const data = await redis.hgetall(COLLAB_TASK_KEY(taskId));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    id: data.id,
    parentTaskId: data.parentTaskId,
    organizationId: data.organizationId,
    title: data.title,
    description: data.description,
    status: data.status as CollaborativeTaskStatus,
    strategy: data.strategy as CollaborationStrategy,
    subtasks: JSON.parse(data.subtasks || "[]"),
    sharedContextId: data.sharedContextId || undefined,
    results: JSON.parse(data.results || "{}"),
    finalResult: data.finalResult ? JSON.parse(data.finalResult) : undefined,
    createdBy: data.createdBy,
    createdAt: parseInt(data.createdAt, 10),
    updatedAt: parseInt(data.updatedAt, 10),
    completedAt: data.completedAt ? parseInt(data.completedAt, 10) : undefined,
    metadata: JSON.parse(data.metadata || "{}"),
  };
}

/**
 * List collaborative tasks for an organization.
 */
export async function listCollaborativeTasks(
  organizationId: string,
  filter?: { status?: CollaborativeTaskStatus; limit?: number },
): Promise<CollaborativeTask[]> {
  const taskIds = await redis.smembers(COLLAB_TASK_ORG_KEY(organizationId));
  const tasks: CollaborativeTask[] = [];

  for (const id of taskIds) {
    const task = await getCollaborativeTask(id);
    if (!task) continue;
    if (filter?.status && task.status !== filter.status) continue;
    tasks.push(task);
    if (filter?.limit && tasks.length >= filter.limit) break;
  }

  return tasks.sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Subtask Management ─────────────────────────────────────────

/**
 * Assign a subtask to an agent.
 */
export async function assignSubtask(
  collabTaskId: string,
  agentId: string,
  input: z.infer<typeof AssignSubtaskSchema>,
): Promise<Subtask> {
  const collabTask = await getCollaborativeTask(collabTaskId);
  if (!collabTask) throw AppError.notFound("Collaborative task not found");

  const subtaskIndex = collabTask.subtasks.findIndex(st => st.id === input.subtaskId);
  if (subtaskIndex === -1) throw AppError.notFound("Subtask not found");

  const subtask = collabTask.subtasks[subtaskIndex];
  if (subtask.status !== "pending") {
    throw AppError.badRequest(`Subtask is ${subtask.status}, cannot assign`);
  }

  // Check dependencies
  for (const depId of subtask.dependencies) {
    const dep = collabTask.subtasks.find(st => st.id === depId);
    if (!dep || dep.status !== "completed") {
      throw AppError.badRequest(`Subtask depends on ${depId} which is not completed`);
    }
  }

  // Update subtask
  subtask.assignedTo = agentId;
  subtask.status = "assigned";
  collabTask.subtasks[subtaskIndex] = subtask;
  collabTask.updatedAt = Date.now();

  // Update Redis
  await redis.hset(SUBTASK_KEY(subtask.id), {
    assignedTo: agentId,
    status: "assigned",
  });
  await redis.hset(COLLAB_TASK_KEY(collabTaskId), {
    subtasks: JSON.stringify(collabTask.subtasks),
    updatedAt: String(collabTask.updatedAt),
  });

  logger.info("Subtask assigned", {
    collabTaskId,
    subtaskId: subtask.id,
    agentId,
  });

  // Emit event
  pushEvent("subtask.assigned", {
    collabTaskId,
    subtaskId: subtask.id,
    agentId,
    organizationId: collabTask.organizationId,
  });

  return subtask;
}

/**
 * Start working on a subtask.
 */
export async function startSubtask(
  collabTaskId: string,
  subtaskId: string,
  agentId: string,
): Promise<Subtask> {
  const collabTask = await getCollaborativeTask(collabTaskId);
  if (!collabTask) throw AppError.notFound("Collaborative task not found");

  const subtaskIndex = collabTask.subtasks.findIndex(st => st.id === subtaskId);
  if (subtaskIndex === -1) throw AppError.notFound("Subtask not found");

  const subtask = collabTask.subtasks[subtaskIndex];
  if (subtask.assignedTo !== agentId) {
    throw AppError.forbidden("Subtask not assigned to this agent");
  }
  if (subtask.status !== "assigned") {
    throw AppError.badRequest(`Subtask is ${subtask.status}, cannot start`);
  }

  // Update subtask
  subtask.status = "in_progress";
  subtask.startedAt = Date.now();
  collabTask.subtasks[subtaskIndex] = subtask;
  collabTask.status = "in_progress";
  collabTask.updatedAt = Date.now();

  // Update Redis
  await redis.hset(SUBTASK_KEY(subtaskId), {
    status: "in_progress",
    startedAt: String(subtask.startedAt),
  });
  await redis.hset(COLLAB_TASK_KEY(collabTaskId), {
    subtasks: JSON.stringify(collabTask.subtasks),
    status: collabTask.status,
    updatedAt: String(collabTask.updatedAt),
  });

  logger.info("Subtask started", { collabTaskId, subtaskId, agentId });

  return subtask;
}

/**
 * Complete a subtask with result.
 */
export async function completeSubtask(
  collabTaskId: string,
  agentId: string,
  input: z.infer<typeof CompleteSubtaskSchema>,
): Promise<{ subtask: Subtask; progress: CollaborationProgress }> {
  const collabTask = await getCollaborativeTask(collabTaskId);
  if (!collabTask) throw AppError.notFound("Collaborative task not found");

  const subtaskIndex = collabTask.subtasks.findIndex(st => st.id === input.subtaskId);
  if (subtaskIndex === -1) throw AppError.notFound("Subtask not found");

  const subtask = collabTask.subtasks[subtaskIndex];
  if (subtask.assignedTo !== agentId) {
    throw AppError.forbidden("Subtask not assigned to this agent");
  }
  if (subtask.status !== "in_progress") {
    throw AppError.badRequest(`Subtask is ${subtask.status}, cannot complete`);
  }

  // Update subtask
  subtask.status = input.status;
  subtask.result = input.result;
  subtask.completedAt = Date.now();
  collabTask.subtasks[subtaskIndex] = subtask;
  collabTask.results[agentId] = input.result;
  collabTask.updatedAt = Date.now();

  // Update Redis
  await redis.hset(SUBTASK_KEY(input.subtaskId), {
    status: input.status,
    result: JSON.stringify(input.result),
    completedAt: String(subtask.completedAt),
  });

  // Check if all subtasks are complete
  const progress = calculateProgress(collabTask);
  if (progress.completedSubtasks + progress.failedSubtasks === progress.totalSubtasks) {
    collabTask.status = progress.failedSubtasks > 0 ? "failed" : "merging";
    collabTask.completedAt = Date.now();
  }

  await redis.hset(COLLAB_TASK_KEY(collabTaskId), {
    subtasks: JSON.stringify(collabTask.subtasks),
    results: JSON.stringify(collabTask.results),
    status: collabTask.status,
    updatedAt: String(collabTask.updatedAt),
    completedAt: collabTask.completedAt ? String(collabTask.completedAt) : "",
  });

  logger.info("Subtask completed", {
    collabTaskId,
    subtaskId: input.subtaskId,
    status: input.status,
    overallProgress: progress.overallProgress,
  });

  // Emit event
  pushEvent("subtask.completed", {
    collabTaskId,
    subtaskId: input.subtaskId,
    status: input.status,
    progress: progress.overallProgress,
    organizationId: collabTask.organizationId,
  });

  // If all subtasks complete, trigger result merging
  if (collabTask.status === "merging") {
    await mergeResults(collabTaskId);
  }

  return { subtask, progress };
}

// ─── Progress Tracking ──────────────────────────────────────────

/**
 * Calculate progress for a collaborative task.
 */
export function calculateProgress(collabTask: CollaborativeTask): CollaborationProgress {
  const subtasks = collabTask.subtasks;
  const totalSubtasks = subtasks.length;
  const completedSubtasks = subtasks.filter(st => st.status === "completed").length;
  const failedSubtasks = subtasks.filter(st => st.status === "failed").length;
  const inProgressSubtasks = subtasks.filter(st => st.status === "in_progress").length;
  const pendingSubtasks = subtasks.filter(st => st.status === "pending" || st.status === "assigned").length;

  const overallProgress = totalSubtasks > 0
    ? Math.round(((completedSubtasks + failedSubtasks) / totalSubtasks) * 100)
    : 0;

  // Estimate completion based on average subtask duration
  let estimatedCompletion: number | undefined;
  const completedWithTime = subtasks.filter(st => st.startedAt && st.completedAt);
  if (completedWithTime.length > 0 && inProgressSubtasks > 0) {
    const avgDuration = completedWithTime.reduce((sum, st) => {
      return sum + ((st.completedAt! - st.startedAt!) / 1000);
    }, 0) / completedWithTime.length;
    estimatedCompletion = Date.now() + (inProgressSubtasks * avgDuration * 1000);
  }

  return {
    collaborativeTaskId: collabTask.id,
    totalSubtasks,
    completedSubtasks,
    failedSubtasks,
    inProgressSubtasks,
    pendingSubtasks,
    overallProgress,
    estimatedCompletion,
  };
}

/**
 * Get progress for a collaborative task.
 */
export async function getCollaborativeTaskProgress(
  collabTaskId: string,
): Promise<CollaborationProgress> {
  const collabTask = await getCollaborativeTask(collabTaskId);
  if (!collabTask) throw AppError.notFound("Collaborative task not found");
  return calculateProgress(collabTask);
}

// ─── Result Merging ─────────────────────────────────────────────

/**
 * Merge results from all subtasks into a final result.
 */
async function mergeResults(collabTaskId: string) {
  const collabTask = await getCollaborativeTask(collabTaskId);
  if (!collabTask) return;

  logger.info("Merging collaborative task results", {
    collabTaskId,
    resultCount: Object.keys(collabTask.results).length,
  });

  // Strategy-specific merging
  let finalResult: any;

  switch (collabTask.strategy) {
    case "parallel":
      // Simple aggregation of all results
      finalResult = {
        strategy: "parallel",
        results: collabTask.results,
        subtaskResults: collabTask.subtasks
          .filter(st => st.status === "completed")
          .map(st => ({ subtaskId: st.id, title: st.title, result: st.result })),
      };
      break;

    case "pipeline":
      // Chain results in order
      finalResult = {
        strategy: "pipeline",
        pipeline: collabTask.subtasks
          .filter(st => st.status === "completed")
          .map(st => ({ step: st.title, result: st.result })),
      };
      break;

    case "map_reduce":
      // Combine mapped results
      finalResult = {
        strategy: "map_reduce",
        mappedResults: Object.values(collabTask.results),
        reducedResult: Object.values(collabTask.results).flat(),
      };
      break;

    case "divide_conquer":
      // Hierarchical result structure
      finalResult = {
        strategy: "divide_conquer",
        solutions: collabTask.subtasks
          .filter(st => st.status === "completed")
          .map(st => ({ problem: st.title, solution: st.result })),
      };
      break;

    default:
      finalResult = collabTask.results;
  }

  // Update collaborative task with final result
  collabTask.finalResult = finalResult;
  collabTask.status = "completed";

  await redis.hset(COLLAB_TASK_KEY(collabTaskId), {
    finalResult: JSON.stringify(finalResult),
    status: "completed",
  });

  logger.info("Collaborative task results merged", {
    collabTaskId,
    strategy: collabTask.strategy,
  });

  // Emit event
  pushEvent("collab_task.completed", {
    collabTaskId,
    parentTaskId: collabTask.parentTaskId,
    strategy: collabTask.strategy,
    organizationId: collabTask.organizationId,
  });

  // Update parent task with final result
  try {
    await prisma.task.update({
      where: { id: collabTask.parentTaskId },
      data: {
        status: "DONE",
        description: `${collabTask.description}\n\n---\n**Collaborative Result (${collabTask.strategy}):**\n${JSON.stringify(finalResult, null, 2)}`,
        completedAt: new Date(),
      },
    });
  } catch (e) {
    logger.warn("Failed to update parent task", { error: e, parentTaskId: collabTask.parentTaskId });
  }
}
