/**
 * Planning Service (Module 12 — Gap 2)
 *
 * Generate action plans to achieve goals:
 * - Goal decomposition into subgoals and actions
 * - Action sequencing with dependencies
 * - Integration with world model for state awareness
 * - Integration with state transitions for action effects
 * - Plan validation and feasibility checking
 * - Plan adaptation and replanning
 *
 * Enables agents to plan how to achieve goals autonomously.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { KnowledgeGraphService } from "../enterprise/knowledgeGraph/knowledgeGraph.service.js";
import { InferenceEngine } from "./inferenceEngine.service";
import {
  executeTransition,
  type Action,
  type StateTransition,
} from "./stateTransition.service";
import {
  getGoal,
  updateGoalStatus,
  createGoal,
  type Goal,
} from "./goalManagement.service";
import { captureState, type WorldState } from "./worldState.service";

// ─── Types ──────────────────────────────────────────────────────

export interface Plan {
  id: string;
  goalId: string;
  agentId: string;
  name: string;
  description: string;
  status: PlanStatus;
  actions: PlannedAction[];
  subgoalIds: string[]; // Goals created as part of this plan
  currentStateId?: string;
  targetStateId?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  estimatedDuration?: number; // milliseconds
  actualDuration?: number;
  metadata: Record<string, any>;
}

export type PlanStatus =
  | "draft"
  | "ready"
  | "executing"
  | "completed"
  | "failed"
  | "abandoned";

export interface PlannedAction {
  id: string;
  actionId: string; // Reference to Action definition
  actionName: string;
  description: string;
  parameters: Record<string, any>;
  preconditions: string[]; // Action IDs that must complete first
  status: ActionStatus;
  startedAt?: number;
  completedAt?: number;
  result?: any;
  error?: string;
}

export type ActionStatus =
  | "pending"
  | "ready" // Preconditions met
  | "executing"
  | "completed"
  | "failed"
  | "skipped";

export interface PlanStep {
  actionId: string;
  actionName: string;
  description: string;
  parameters: Record<string, any>;
  preconditions: string[];
  effects: string[]; // Expected state changes
}

export interface PlanningResult {
  plan?: Plan;
  success: boolean;
  error?: string;
  subgoals?: Goal[];
  steps?: PlanStep[];
}

// ─── Redis Keys ─────────────────────────────────────────────────

const PLANS_KEY = "plans:all";
const PLAN_KEY = (id: string) => `plans:plan:${id}`;
const GOAL_PLANS_KEY = (goalId: string) => `plans:goal:${goalId}`;
const AGENT_PLANS_KEY = (agentId: string) => `plans:agent:${agentId}`;

// ─── Plan Management ────────────────────────────────────────────

/**
 * Create a new plan for a goal.
 */
export async function createPlan(input: {
  goalId: string;
  agentId: string;
  name: string;
  description: string;
  actions?: Array<Omit<PlannedAction, "id" | "status">>;
  subgoalIds?: string[];
  currentStateId?: string;
  targetStateId?: string;
  estimatedDuration?: number;
  metadata?: Record<string, any>;
}): Promise<Plan> {
  const now = Date.now();
  const planId = `plan_${randomUUID().slice(0, 8)}`;

  const actions: PlannedAction[] = (input.actions ?? []).map(act => ({
    ...act,
    id: `pact_${randomUUID().slice(0, 8)}`,
    status: "pending",
  }));

  const plan: Plan = {
    id: planId,
    goalId: input.goalId,
    agentId: input.agentId,
    name: input.name,
    description: input.description,
    status: "draft",
    actions,
    subgoalIds: input.subgoalIds ?? [],
    currentStateId: input.currentStateId,
    targetStateId: input.targetStateId,
    createdAt: now,
    estimatedDuration: input.estimatedDuration,
    metadata: input.metadata ?? {},
  };

  // Store plan
  await redis.hset(PLAN_KEY(planId), {
    id: plan.id,
    goalId: plan.goalId,
    agentId: plan.agentId,
    name: plan.name,
    description: plan.description,
    status: plan.status,
    actions: JSON.stringify(plan.actions),
    subgoalIds: JSON.stringify(plan.subgoalIds),
    currentStateId: plan.currentStateId ?? "",
    targetStateId: plan.targetStateId ?? "",
    createdAt: String(plan.createdAt),
    startedAt: plan.startedAt ? String(plan.startedAt) : "",
    completedAt: plan.completedAt ? String(plan.completedAt) : "",
    estimatedDuration: plan.estimatedDuration ? String(plan.estimatedDuration) : "",
    actualDuration: plan.actualDuration ? String(plan.actualDuration) : "",
    metadata: JSON.stringify(plan.metadata),
  });

  // Add to indexes
  await redis.sadd(PLANS_KEY, planId);
  await redis.sadd(GOAL_PLANS_KEY(input.goalId), planId);
  await redis.sadd(AGENT_PLANS_KEY(input.agentId), planId);

  logger.info("Plan created", {
    planId,
    goalId: input.goalId,
    name: input.name,
    actionCount: actions.length,
  });

  return plan;
}

/**
 * Get a plan by ID.
 */
export async function getPlan(planId: string): Promise<Plan | null> {
  const data = await redis.hgetall(PLAN_KEY(planId));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    id: data.id,
    goalId: data.goalId,
    agentId: data.agentId,
    name: data.name,
    description: data.description,
    status: data.status as PlanStatus,
    actions: JSON.parse(data.actions || "[]"),
    subgoalIds: JSON.parse(data.subgoalIds || "[]"),
    currentStateId: data.currentStateId || undefined,
    targetStateId: data.targetStateId || undefined,
    createdAt: parseInt(data.createdAt, 10),
    startedAt: data.startedAt ? parseInt(data.startedAt, 10) : undefined,
    completedAt: data.completedAt ? parseInt(data.completedAt, 10) : undefined,
    estimatedDuration: data.estimatedDuration ? parseInt(data.estimatedDuration, 10) : undefined,
    actualDuration: data.actualDuration ? parseInt(data.actualDuration, 10) : undefined,
    metadata: JSON.parse(data.metadata || "{}"),
  };
}

/**
 * List plans for a goal.
 */
export async function listGoalPlans(goalId: string): Promise<Plan[]> {
  const planIds = await redis.smembers(GOAL_PLANS_KEY(goalId));
  const plans: Plan[] = [];

  for (const id of planIds) {
    const plan = await getPlan(id);
    if (plan) plans.push(plan);
  }

  return plans.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * List plans for an agent.
 */
export async function listAgentPlans(
  agentId: string,
  filter?: { status?: PlanStatus },
): Promise<Plan[]> {
  const planIds = await redis.smembers(AGENT_PLANS_KEY(agentId));
  const plans: Plan[] = [];

  for (const id of planIds) {
    const plan = await getPlan(id);
    if (!plan) continue;

    if (filter?.status && plan.status !== filter.status) continue;

    plans.push(plan);
  }

  return plans.sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Plan Generation ────────────────────────────────────────────

/**
 * Generate a plan for a goal using AI reasoning.
 */
export async function generatePlan(
  goalId: string,
  options?: {
    maxDepth?: number; // Max decomposition depth
    useSubgoals?: boolean; // Whether to create subgoals
  },
): Promise<PlanningResult> {
  const { maxDepth = 3, useSubgoals = true } = options ?? {};

  const goal = await getGoal(goalId);
  if (!goal) {
    return { success: false, error: "Goal not found" };
  }

  // Capture current state
  const currentState = await captureState(`Planning for goal: ${goal.name}`);

  // Get relevant knowledge from knowledge graph
  const relevantKnowledge = await KnowledgeGraphService.query({
    entityTypes: ["action", "capability", "resource"],
    tags: [goal.type, "planning"],
    limit: 20,
  });

  // Get available actions
  const availableActions = await InferenceEngine.query({
    type: "Action",
    limit: 50,
  });

  // Use AI to generate plan
  const planPrompt = `
Goal: ${goal.name}
Description: ${goal.description}
Type: ${goal.type}
Priority: ${goal.priority}

Objectives:
${goal.objectives.map(o => `- ${o.description}${o.targetValue ? ` (target: ${o.targetValue}${o.unit ?? ""})` : ""}`).join("\n")}

Success Criteria:
${goal.successCriteria.map(c => `- ${c.description}: ${c.metric} ${c.operator} ${c.target}`).join("\n")}

Current State:
- Entities: ${currentState.entities.length}
- Relations: ${currentState.relations.length}

Available Actions:
${availableActions.slice(0, 20).map(a => `- ${a.name}: ${a.description}`).join("\n")}

Generate a plan to achieve this goal. Include:
1. Ordered list of actions to execute
2. Parameters for each action
3. Dependencies between actions
4. Whether to decompose into subgoals (if complex)
`;

  // Call AI to generate plan (simplified - in production would use actual AI)
  const planSteps = await generatePlanWithAI(planPrompt, availableActions);

  if (!planSteps || planSteps.length === 0) {
    return { success: false, error: "Failed to generate plan steps" };
  }

  // Create subgoals if needed
  const subgoals: Goal[] = [];
  if (useSubgoals && goal.type === "strategic") {
    for (const step of planSteps.filter(s => s.requiresSubgoal)) {
      const subgoal = await createGoal({
        agentId: goal.agentId,
        parentId: goalId,
        name: step.subgoalName ?? step.actionName,
        description: step.description,
        type: goal.type === "strategic" ? "tactical" : "operational",
        priority: goal.priority - 1,
        objectives: step.objectives,
        successCriteria: step.successCriteria,
      });
      subgoals.push(subgoal);
    }
  }

  // Create plan
  const plan = await createPlan({
    goalId,
    agentId: goal.agentId,
    name: `Plan for ${goal.name}`,
    description: `Auto-generated plan to achieve: ${goal.name}`,
    actions: planSteps.map(step => ({
      actionId: step.actionId,
      actionName: step.actionName,
      description: step.description,
      parameters: step.parameters,
      preconditions: step.preconditions,
    })),
    subgoalIds: subgoals.map(s => s.id),
    currentStateId: currentState.id,
  });

  // Update plan status to ready
  await updatePlanStatus(plan.id, "ready");

  logger.info("Plan generated", {
    planId: plan.id,
    goalId,
    stepCount: planSteps.length,
    subgoalCount: subgoals.length,
  });

  return {
    success: true,
    plan,
    subgoals,
    steps: planSteps,
  };
}

/**
 * Generate plan steps using AI (simplified implementation).
 */
async function generatePlanWithAI(
  prompt: string,
  availableActions: any[],
): Promise<PlanStep[]> {
  // In production, this would call an AI model
  // For now, return a simple template-based plan

  const steps: PlanStep[] = [];

  // Analyze goal and generate appropriate steps
  // This is a simplified heuristic - real implementation would use AI

  // Step 1: Analyze current state
  steps.push({
    actionId: "analyze_state",
    actionName: "Analyze Current State",
    description: "Analyze the current state to understand what needs to change",
    parameters: {},
    preconditions: [],
    effects: ["state_analyzed"],
  });

  // Step 2: Identify required changes
  steps.push({
    actionId: "identify_changes",
    actionName: "Identify Required Changes",
    description: "Identify what changes are needed to achieve the goal",
    parameters: {},
    preconditions: ["analyze_state"],
    effects: ["changes_identified"],
  });

  // Step 3: Execute changes (placeholder for actual actions)
  steps.push({
    actionId: "execute_changes",
    actionName: "Execute Changes",
    description: "Execute the identified changes",
    parameters: {},
    preconditions: ["identify_changes"],
    effects: ["changes_executed"],
  });

  // Step 4: Verify goal achievement
  steps.push({
    actionId: "verify_goal",
    actionName: "Verify Goal Achievement",
    description: "Verify that the goal has been achieved",
    parameters: {},
    preconditions: ["execute_changes"],
    effects: ["goal_verified"],
  });

  return steps;
}

// ─── Plan Execution ─────────────────────────────────────────────

/**
 * Update plan status.
 */
export async function updatePlanStatus(
  planId: string,
  status: PlanStatus,
): Promise<Plan | null> {
  const plan = await getPlan(planId);
  if (!plan) return null;

  const now = Date.now();
  const updates: Record<string, string> = { status };

  if (status === "executing" && !plan.startedAt) {
    updates.startedAt = String(now);
  }

  if (status === "completed" || status === "failed") {
    updates.completedAt = String(now);
    if (plan.startedAt) {
      updates.actualDuration = String(now - plan.startedAt);
    }
  }

  await redis.hset(PLAN_KEY(planId), updates);

  logger.info("Plan status updated", {
    planId,
    status,
    name: plan.name,
  });

  return getPlan(planId);
}

/**
 * Execute the next ready action in a plan.
 */
export async function executeNextAction(planId: string): Promise<{
  success: boolean;
  actionId?: string;
  error?: string;
}> {
  const plan = await getPlan(planId);
  if (!plan) {
    return { success: false, error: "Plan not found" };
  }

  if (plan.status !== "executing") {
    return { success: false, error: "Plan is not in executing status" };
  }

  // Find next ready action (all preconditions completed)
  const readyAction = plan.actions.find(action => {
    if (action.status !== "pending") return false;

    // Check if all preconditions are completed
    return action.preconditions.every(precondId => {
      const precondAction = plan.actions.find(a => a.id === precondId);
      return precondAction?.status === "completed";
    });
  });

  if (!readyAction) {
    // Check if all actions are completed
    const allCompleted = plan.actions.every(a => a.status === "completed" || a.status === "skipped");
    if (allCompleted) {
      await updatePlanStatus(planId, "completed");
      const goal = await getGoal(plan.goalId);
      if (goal) {
        await updateGoalStatus(goal.id, "achieved");
      }
      return { success: true, actionId: undefined };
    }

    return { success: false, error: "No ready actions available" };
  }

  // Mark action as executing
  readyAction.status = "executing";
  readyAction.startedAt = Date.now();
  await redis.hset(PLAN_KEY(planId), {
    actions: JSON.stringify(plan.actions),
  });

  // Execute action
  try {
    const result = await executeTransition(readyAction.actionId, readyAction.parameters);

    readyAction.status = "completed";
    readyAction.completedAt = Date.now();
    readyAction.result = result;

    await redis.hset(PLAN_KEY(planId), {
      actions: JSON.stringify(plan.actions),
    });

    logger.info("Action executed", {
      planId,
      actionId: readyAction.id,
      actionName: readyAction.actionName,
    });

    return { success: true, actionId: readyAction.id };
  } catch (error: any) {
    readyAction.status = "failed";
    readyAction.error = error.message;

    await redis.hset(PLAN_KEY(planId), {
      actions: JSON.stringify(plan.actions),
    });

    logger.error("Action execution failed", {
      planId,
      actionId: readyAction.id,
      error: error.message,
    });

    return { success: false, actionId: readyAction.id, error: error.message };
  }
}

/**
 * Start plan execution.
 */
export async function startPlanExecution(planId: string): Promise<Plan | null> {
  const plan = await getPlan(planId);
  if (!plan) return null;

  if (plan.status !== "ready") {
    logger.warn("Cannot start plan: not in ready status", { planId, status: plan.status });
    return null;
  }

  // Update goal status to active
  const goal = await getGoal(plan.goalId);
  if (goal) {
    await updateGoalStatus(goal.id, "active");
  }

  return updatePlanStatus(planId, "executing");
}

/**
 * Get plan progress summary.
 */
export async function getPlanProgress(planId: string): Promise<{
  planId: string;
  status: PlanStatus;
  totalActions: number;
  completedActions: number;
  failedActions: number;
  progress: number; // 0-100
} | null> {
  const plan = await getPlan(planId);
  if (!plan) return null;

  const completed = plan.actions.filter(a => a.status === "completed").length;
  const failed = plan.actions.filter(a => a.status === "failed").length;
  const total = plan.actions.length;

  const progress = total > 0 ? (completed / total) * 100 : 0;

  return {
    planId,
    status: plan.status,
    totalActions: total,
    completedActions: completed,
    failedActions: failed,
    progress,
  };
}

/**
 * Delete a plan.
 */
export async function deletePlan(planId: string): Promise<boolean> {
  const plan = await getPlan(planId);
  if (!plan) return false;

  await redis.del(PLAN_KEY(planId));
  await redis.srem(PLANS_KEY, planId);
  await redis.srem(GOAL_PLANS_KEY(plan.goalId), planId);
  await redis.srem(AGENT_PLANS_KEY(plan.agentId), planId);

  logger.info("Plan deleted", { planId, name: plan.name });

  return true;
}
