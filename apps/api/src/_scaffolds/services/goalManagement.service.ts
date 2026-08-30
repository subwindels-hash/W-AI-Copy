/**
 * Goal Management Service (Module 12 — Gap 1)
 *
 * Represent and manage agent goals:
 * - Goal definition with objectives and success criteria
 * - Goal hierarchy (strategic → tactical → operational)
 * - Goal status tracking (pending, active, achieved, failed, abandoned)
 * - Goal decomposition into subgoals
 * - Progress tracking with metrics
 * - Goal dependencies and priorities
 *
 * Enables agents to be goal-directed rather than task-reactive.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../db/client.js";

// ─── Types ──────────────────────────────────────────────────────

export interface Goal {
  id: string;
  agentId: string;
  parentId?: string; // For goal hierarchy
  name: string;
  description: string;
  type: GoalType;
  status: GoalStatus;
  priority: number; // 1-10, higher = more important
  objectives: Objective[];
  successCriteria: SuccessCriterion[];
  dependencies: string[]; // Goal IDs this depends on
  createdAt: number;
  startedAt?: number;
  achievedAt?: number;
  deadline?: number;
  progress: number; // 0-100
  metadata: Record<string, any>;
}

export type GoalType = "strategic" | "tactical" | "operational";

export type GoalStatus =
  | "pending" // Not started, waiting for dependencies
  | "active" // Currently being pursued
  | "achieved" // Successfully completed
  | "failed" // Failed to achieve
  | "abandoned" // Given up
  | "blocked"; // Blocked by dependencies

export interface Objective {
  id: string;
  description: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  achieved: boolean;
}

export interface SuccessCriterion {
  id: string;
  description: string;
  metric: string; // What to measure
  target: number; // Target value
  operator: ">=" | "<=" | "==" | ">" | "<"; // Comparison operator
  achieved: boolean;
}

export interface GoalProgress {
  goalId: string;
  progress: number; // 0-100
  objectivesAchieved: number;
  objectivesTotal: number;
  criteriaAchieved: number;
  criteriaTotal: number;
  lastUpdated: number;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const GOALS_KEY = "goals:all";
const GOAL_KEY = (id: string) => `goals:goal:${id}`;
const AGENT_GOALS_KEY = (agentId: string) => `goals:agent:${agentId}`;
const GOAL_CHILDREN_KEY = (goalId: string) => `goals:children:${goalId}`;
const GOAL_HISTORY_KEY = (goalId: string) => `goals:history:${goalId}`;

// ─── Goal Management ────────────────────────────────────────────

/**
 * Create a new goal for an agent.
 */
export async function createGoal(input: {
  agentId: string;
  parentId?: string;
  name: string;
  description: string;
  type: GoalType;
  priority?: number;
  objectives?: Array<Omit<Objective, "id" | "achieved">>;
  successCriteria?: Array<Omit<SuccessCriterion, "id" | "achieved">>;
  dependencies?: string[];
  deadline?: number;
  metadata?: Record<string, any>;
}): Promise<Goal> {
  const now = Date.now();
  const goalId = `goal_${randomUUID().slice(0, 8)}`;

  const objectives: Objective[] = (input.objectives ?? []).map(obj => ({
    ...obj,
    id: `obj_${randomUUID().slice(0, 8)}`,
    achieved: false,
  }));

  const successCriteria: SuccessCriterion[] = (input.successCriteria ?? []).map(crit => ({
    ...crit,
    id: `crit_${randomUUID().slice(0, 8)}`,
    achieved: false,
  }));

  const goal: Goal = {
    id: goalId,
    agentId: input.agentId,
    parentId: input.parentId,
    name: input.name,
    description: input.description,
    type: input.type,
    status: "pending",
    priority: input.priority ?? 5,
    objectives,
    successCriteria,
    dependencies: input.dependencies ?? [],
    createdAt: now,
    deadline: input.deadline,
    progress: 0,
    metadata: input.metadata ?? {},
  };

  // Store goal
  await redis.hset(GOAL_KEY(goalId), {
    id: goal.id,
    agentId: goal.agentId,
    parentId: goal.parentId ?? "",
    name: goal.name,
    description: goal.description,
    type: goal.type,
    status: goal.status,
    priority: String(goal.priority),
    objectives: JSON.stringify(goal.objectives),
    successCriteria: JSON.stringify(goal.successCriteria),
    dependencies: JSON.stringify(goal.dependencies),
    createdAt: String(goal.createdAt),
    startedAt: goal.startedAt ? String(goal.startedAt) : "",
    achievedAt: goal.achievedAt ? String(goal.achievedAt) : "",
    deadline: goal.deadline ? String(goal.deadline) : "",
    progress: String(goal.progress),
    metadata: JSON.stringify(goal.metadata),
  });

  // Add to indexes
  await redis.sadd(GOALS_KEY, goalId);
  await redis.sadd(AGENT_GOALS_KEY(input.agentId), goalId);

  if (input.parentId) {
    await redis.sadd(GOAL_CHILDREN_KEY(input.parentId), goalId);
  }

  logger.info("Goal created", {
    goalId,
    agentId: input.agentId,
    name: input.name,
    type: input.type,
    priority: goal.priority,
  });

  return goal;
}

/**
 * Get a goal by ID.
 */
export async function getGoal(goalId: string): Promise<Goal | null> {
  const data = await redis.hgetall(GOAL_KEY(goalId));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    id: data.id,
    agentId: data.agentId,
    parentId: data.parentId || undefined,
    name: data.name,
    description: data.description,
    type: data.type as GoalType,
    status: data.status as GoalStatus,
    priority: parseInt(data.priority, 10),
    objectives: JSON.parse(data.objectives || "[]"),
    successCriteria: JSON.parse(data.successCriteria || "[]"),
    dependencies: JSON.parse(data.dependencies || "[]"),
    createdAt: parseInt(data.createdAt, 10),
    startedAt: data.startedAt ? parseInt(data.startedAt, 10) : undefined,
    achievedAt: data.achievedAt ? parseInt(data.achievedAt, 10) : undefined,
    deadline: data.deadline ? parseInt(data.deadline, 10) : undefined,
    progress: parseInt(data.progress, 10),
    metadata: JSON.parse(data.metadata || "{}"),
  };
}

/**
 * List goals for an agent.
 */
export async function listAgentGoals(
  agentId: string,
  filter?: { status?: GoalStatus; type?: GoalType },
): Promise<Goal[]> {
  const goalIds = await redis.smembers(AGENT_GOALS_KEY(agentId));
  const goals: Goal[] = [];

  for (const id of goalIds) {
    const goal = await getGoal(id);
    if (!goal) continue;

    if (filter?.status && goal.status !== filter.status) continue;
    if (filter?.type && goal.type !== filter.type) continue;

    goals.push(goal);
  }

  return goals.sort((a, b) => b.priority - a.priority);
}

/**
 * Get child goals (subgoals).
 */
export async function getChildGoals(parentGoalId: string): Promise<Goal[]> {
  const childIds = await redis.smembers(GOAL_CHILDREN_KEY(parentGoalId));
  const goals: Goal[] = [];

  for (const id of childIds) {
    const goal = await getGoal(id);
    if (goal) goals.push(goal);
  }

  return goals;
}

/**
 * Update goal status.
 */
export async function updateGoalStatus(
  goalId: string,
  status: GoalStatus,
): Promise<Goal | null> {
  const goal = await getGoal(goalId);
  if (!goal) return null;

  const now = Date.now();
  const updates: Record<string, string> = {
    status,
  };

  if (status === "active" && !goal.startedAt) {
    updates.startedAt = String(now);
  }

  if (status === "achieved") {
    updates.achievedAt = String(now);
    updates.progress = "100";
  }

  await redis.hset(GOAL_KEY(goalId), updates);

  // Record in history
  await redis.lpush(
    GOAL_HISTORY_KEY(goalId),
    JSON.stringify({
      status,
      timestamp: now,
      progress: status === "achieved" ? 100 : goal.progress,
    }),
  );
  await redis.ltrim(GOAL_HISTORY_KEY(goalId), 0, 99);

  logger.info("Goal status updated", {
    goalId,
    status,
    name: goal.name,
  });

  return getGoal(goalId);
}

/**
 * Update goal progress.
 */
export async function updateGoalProgress(
  goalId: string,
  progress: number,
): Promise<Goal | null> {
  const goal = await getGoal(goalId);
  if (!goal) return null;

  const clampedProgress = Math.max(0, Math.min(100, progress));

  await redis.hset(GOAL_KEY(goalId), {
    progress: String(clampedProgress),
  });

  // Check if goal should be marked as achieved
  if (clampedProgress >= 100 && goal.status === "active") {
    await updateGoalStatus(goalId, "achieved");
  }

  logger.debug("Goal progress updated", {
    goalId,
    progress: clampedProgress,
  });

  return getGoal(goalId);
}

/**
 * Update objective progress.
 */
export async function updateObjective(
  goalId: string,
  objectiveId: string,
  currentValue: number,
): Promise<Goal | null> {
  const goal = await getGoal(goalId);
  if (!goal) return null;

  const objective = goal.objectives.find(o => o.id === objectiveId);
  if (!objective) return null;

  objective.currentValue = currentValue;

  // Check if objective is achieved
  if (objective.targetValue !== undefined) {
    objective.achieved = currentValue >= objective.targetValue;
  }

  // Update goal
  await redis.hset(GOAL_KEY(goalId), {
    objectives: JSON.stringify(goal.objectives),
  });

  // Recalculate goal progress
  await recalculateGoalProgress(goalId);

  return getGoal(goalId);
}

/**
 * Check success criteria and update.
 */
export async function checkSuccessCriteria(
  goalId: string,
  metrics: Record<string, number>,
): Promise<Goal | null> {
  const goal = await getGoal(goalId);
  if (!goal) return null;

  let criteriaAchieved = 0;

  for (const criterion of goal.successCriteria) {
    const metricValue = metrics[criterion.metric];
    if (metricValue === undefined) continue;

    let achieved = false;
    switch (criterion.operator) {
      case ">=":
        achieved = metricValue >= criterion.target;
        break;
      case "<=":
        achieved = metricValue <= criterion.target;
        break;
      case "==":
        achieved = metricValue === criterion.target;
        break;
      case ">":
        achieved = metricValue > criterion.target;
        break;
      case "<":
        achieved = metricValue < criterion.target;
        break;
    }

    criterion.achieved = achieved;
    if (achieved) criteriaAchieved++;
  }

  await redis.hset(GOAL_KEY(goalId), {
    successCriteria: JSON.stringify(goal.successCriteria),
  });

  // If all criteria achieved, mark goal as achieved
  if (criteriaAchieved === goal.successCriteria.length && goal.successCriteria.length > 0) {
    await updateGoalStatus(goalId, "achieved");
  } else {
    await recalculateGoalProgress(goalId);
  }

  return getGoal(goalId);
}

/**
 * Recalculate goal progress based on objectives and criteria.
 */
async function recalculateGoalProgress(goalId: string): Promise<void> {
  const goal = await getGoal(goalId);
  if (!goal) return;

  let progress = 0;

  // Progress from objectives
  if (goal.objectives.length > 0) {
    const achievedObjectives = goal.objectives.filter(o => o.achieved).length;
    progress += (achievedObjectives / goal.objectives.length) * 50; // 50% weight
  }

  // Progress from success criteria
  if (goal.successCriteria.length > 0) {
    const achievedCriteria = goal.successCriteria.filter(c => c.achieved).length;
    progress += (achievedCriteria / goal.successCriteria.length) * 50; // 50% weight
  }

  // If no objectives or criteria, use child goals
  if (goal.objectives.length === 0 && goal.successCriteria.length === 0) {
    const children = await getChildGoals(goalId);
    if (children.length > 0) {
      const childProgress = children.reduce((sum, child) => sum + child.progress, 0) / children.length;
      progress = childProgress;
    }
  }

  await updateGoalProgress(goalId, progress);
}

/**
 * Get goal progress summary.
 */
export async function getGoalProgress(goalId: string): Promise<GoalProgress | null> {
  const goal = await getGoal(goalId);
  if (!goal) return null;

  return {
    goalId,
    progress: goal.progress,
    objectivesAchieved: goal.objectives.filter(o => o.achieved).length,
    objectivesTotal: goal.objectives.length,
    criteriaAchieved: goal.successCriteria.filter(c => c.achieved).length,
    criteriaTotal: goal.successCriteria.length,
    lastUpdated: Date.now(),
  };
}

/**
 * Get goal history.
 */
export async function getGoalHistory(
  goalId: string,
  limit = 50,
): Promise<Array<{ status: GoalStatus; timestamp: number; progress: number }>> {
  const raw = await redis.lrange(GOAL_HISTORY_KEY(goalId), 0, limit - 1);
  return raw.map(r => JSON.parse(r));
}

/**
 * Delete a goal and its children.
 */
export async function deleteGoal(goalId: string): Promise<boolean> {
  const goal = await getGoal(goalId);
  if (!goal) return false;

  // Delete children first
  const children = await getChildGoals(goalId);
  for (const child of children) {
    await deleteGoal(child.id);
  }

  // Delete goal
  await redis.del(GOAL_KEY(goalId));
  await redis.srem(GOALS_KEY, goalId);
  await redis.srem(AGENT_GOALS_KEY(goal.agentId), goalId);

  if (goal.parentId) {
    await redis.srem(GOAL_CHILDREN_KEY(goal.parentId), goalId);
  }

  await redis.del(GOAL_CHILDREN_KEY(goalId));
  await redis.del(GOAL_HISTORY_KEY(goalId));

  logger.info("Goal deleted", { goalId, name: goal.name });

  return true;
}

/**
 * Get goal statistics for an agent.
 */
export async function getGoalStats(agentId: string): Promise<{
  totalGoals: number;
  byStatus: Record<GoalStatus, number>;
  byType: Record<GoalType, number>;
  achievedCount: number;
  activeCount: number;
  avgProgress: number;
}> {
  const goals = await listAgentGoals(agentId);

  const byStatus = {} as Record<GoalStatus, number>;
  const byType = {} as Record<GoalType, number>;
  let achievedCount = 0;
  let activeCount = 0;
  let totalProgress = 0;

  for (const goal of goals) {
    byStatus[goal.status] = (byStatus[goal.status] ?? 0) + 1;
    byType[goal.type] = (byType[goal.type] ?? 0) + 1;

    if (goal.status === "achieved") achievedCount++;
    if (goal.status === "active") activeCount++;
    totalProgress += goal.progress;
  }

  return {
    totalGoals: goals.length,
    byStatus,
    byType,
    achievedCount,
    activeCount,
    avgProgress: goals.length > 0 ? totalProgress / goals.length : 0,
  };
}
