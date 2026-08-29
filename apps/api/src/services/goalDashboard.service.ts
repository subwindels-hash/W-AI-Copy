/**
 * Goal & Plan Dashboard Service (Module 13 — Gap 2)
 *
 * Visualize goals, plans, and progress:
 * - Goal hierarchy and relationships
 * - Goal progress with objectives and success criteria
 * - Plan execution status and action progress
 * - Goal achievement trends over time
 * - Plan performance metrics
 *
 * Provides comprehensive visibility into autonomous agent behavior.
 */
import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import {
  getGoal,
  listAgentGoals,
  getChildGoals,
  getGoalProgress,
  getGoalHistory,
  type Goal,
  type GoalStatus,
  type GoalType,
} from "./goalManagement.service";
import {
  getPlan,
  listGoalPlans,
  listAgentPlans,
  getPlanProgress,
  type Plan,
  type PlanStatus,
} from "./planning.service";

// ─── Types ──────────────────────────────────────────────────────

export interface GoalDashboard {
  generatedAt: number;
  agentId: string;
  summary: GoalSummary;
  goalTree: GoalNode[];
  activeGoals: GoalDetail[];
  recentAchievements: AchievementEvent[];
  trends: GoalTrends;
}

export interface GoalSummary {
  totalGoals: number;
  byStatus: Record<GoalStatus, number>;
  byType: Record<GoalType, number>;
  avgProgress: number;
  achievedThisMonth: number;
  failedThisMonth: number;
  activePlans: number;
}

export interface GoalNode {
  goal: GoalDetail;
  children: GoalNode[];
  depth: number;
}

export interface GoalDetail {
  id: string;
  name: string;
  description: string;
  type: GoalType;
  status: GoalStatus;
  priority: number;
  progress: number;
  objectives: Array<{
    id: string;
    description: string;
    targetValue?: number;
    currentValue?: number;
    unit?: string;
    achieved: boolean;
    progress: number; // 0-100
  }>;
  successCriteria: Array<{
    id: string;
    description: string;
    metric: string;
    target: number;
    operator: string;
    achieved: boolean;
  }>;
  plans: PlanSummary[];
  createdAt: number;
  startedAt?: number;
  achievedAt?: number;
  deadline?: number;
  daysRemaining?: number;
  isAtRisk: boolean;
  riskReason?: string;
}

export interface PlanSummary {
  id: string;
  name: string;
  status: PlanStatus;
  totalActions: number;
  completedActions: number;
  progress: number;
  startedAt?: number;
  completedAt?: number;
  estimatedDuration?: number;
  actualDuration?: number;
}

export interface AchievementEvent {
  goalId: string;
  goalName: string;
  achievedAt: number;
  duration: number; // milliseconds from start to achievement
  objectivesAchieved: number;
  objectivesTotal: number;
}

export interface GoalTrends {
  progressOverTime: Array<{
    date: string;
    avgProgress: number;
    goalsAchieved: number;
    goalsFailed: number;
  }>;
  achievementRate: number; // Goals achieved per month
  avgTimeToAchieve: number; // Average days to achieve a goal
}

// ─── Dashboard Generation ───────────────────────────────────────

/**
 * Generate comprehensive goal dashboard for an agent.
 */
export async function generateGoalDashboard(
  agentId: string,
): Promise<GoalDashboard> {
  const generatedAt = Date.now();

  // Get all goals for the agent
  const goals = await listAgentGoals(agentId);

  // Build summary
  const summary = await buildGoalSummary(agentId, goals);

  // Build goal tree (hierarchical)
  const goalTree = await buildGoalTree(agentId);

  // Get active goals with details
  const activeGoals = await buildActiveGoals(goals.filter(g => g.status === "active"));

  // Get recent achievements
  const recentAchievements = await buildRecentAchievements(agentId);

  // Build trends
  const trends = await buildGoalTrends(agentId, goals);

  const dashboard: GoalDashboard = {
    generatedAt,
    agentId,
    summary,
    goalTree,
    activeGoals,
    recentAchievements,
    trends,
  };

  logger.info("Goal dashboard generated", {
    agentId,
    totalGoals: goals.length,
    activeGoals: activeGoals.length,
    achievements: recentAchievements.length,
  });

  return dashboard;
}

// ─── Helper Functions ───────────────────────────────────────────

async function buildGoalSummary(agentId: string, goals: Goal[]): Promise<GoalSummary> {
  const byStatus: Record<GoalStatus, number> = {
    pending: 0,
    active: 0,
    achieved: 0,
    failed: 0,
    abandoned: 0,
    blocked: 0,
  };

  const byType: Record<GoalType, number> = {
    strategic: 0,
    tactical: 0,
    operational: 0,
  };

  let totalProgress = 0;
  let achievedThisMonth = 0;
  let failedThisMonth = 0;

  const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  for (const goal of goals) {
    byStatus[goal.status]++;
    byType[goal.type]++;
    totalProgress += goal.progress;

    if (goal.status === "achieved" && goal.achievedAt && goal.achievedAt > oneMonthAgo) {
      achievedThisMonth++;
    }

    if (goal.status === "failed" && goal.achievedAt && goal.achievedAt > oneMonthAgo) {
      failedThisMonth++;
    }
  }

  // Count active plans
  const plans = await listAgentPlans(agentId, { status: "executing" });

  return {
    totalGoals: goals.length,
    byStatus,
    byType,
    avgProgress: goals.length > 0 ? totalProgress / goals.length : 0,
    achievedThisMonth,
    failedThisMonth,
    activePlans: plans.length,
  };
}

async function buildGoalTree(agentId: string): Promise<GoalNode[]> {
  // Get top-level goals (no parent)
  const allGoals = await listAgentGoals(agentId);
  const topLevelGoals = allGoals.filter(g => !g.parentId);

  const tree: GoalNode[] = [];

  for (const goal of topLevelGoals) {
    const node = await buildGoalNode(goal, 0);
    tree.push(node);
  }

  return tree;
}

async function buildGoalNode(goal: Goal, depth: number): Promise<GoalNode> {
  const detail = await buildGoalDetail(goal);
  const children = await getChildGoals(goal.id);

  const childNodes: GoalNode[] = [];
  for (const child of children) {
    const childNode = await buildGoalNode(child, depth + 1);
    childNodes.push(childNode);
  }

  return {
    goal: detail,
    children: childNodes,
    depth,
  };
}

async function buildActiveGoals(goals: Goal[]): Promise<GoalDetail[]> {
  const details: GoalDetail[] = [];

  for (const goal of goals) {
    const detail = await buildGoalDetail(goal);
    details.push(detail);
  }

  // Sort by priority and progress
  return details.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.progress - b.progress; // Lower progress first (needs attention)
  });
}

async function buildGoalDetail(goal: Goal): Promise<GoalDetail> {
  // Get plans for this goal
  const plans = await listGoalPlans(goal.id);
  const planSummaries: PlanSummary[] = [];

  for (const plan of plans) {
    const progress = await getPlanProgress(plan.id);
    if (progress) {
      planSummaries.push({
        id: plan.id,
        name: plan.name,
        status: plan.status,
        totalActions: progress.totalActions,
        completedActions: progress.completedActions,
        progress: progress.progress,
        startedAt: plan.startedAt,
        completedAt: plan.completedAt,
        estimatedDuration: plan.estimatedDuration,
        actualDuration: plan.actualDuration,
      });
    }
  }

  // Calculate objective progress
  const objectives = goal.objectives.map(obj => {
    let progress = 0;
    if (obj.targetValue !== undefined && obj.currentValue !== undefined) {
      progress = Math.min(100, (obj.currentValue / obj.targetValue) * 100);
    } else if (obj.achieved) {
      progress = 100;
    }
    return { ...obj, progress };
  });

  // Check if goal is at risk
  let isAtRisk = false;
  let riskReason: string | undefined;

  if (goal.deadline) {
    const daysRemaining = Math.ceil((goal.deadline - Date.now()) / (24 * 60 * 60 * 1000));
    const expectedProgress = goal.status === "active" && goal.startedAt
      ? ((Date.now() - goal.startedAt) / (goal.deadline - goal.startedAt)) * 100
      : 0;

    if (daysRemaining < 7 && goal.progress < 80) {
      isAtRisk = true;
      riskReason = `Only ${daysRemaining} days remaining with ${goal.progress}% progress`;
    } else if (goal.progress < expectedProgress * 0.7) {
      isAtRisk = true;
      riskReason = `Progress (${goal.progress}%) is behind expected (${Math.round(expectedProgress)}%)`;
    }
  }

  return {
    id: goal.id,
    name: goal.name,
    description: goal.description,
    type: goal.type,
    status: goal.status,
    priority: goal.priority,
    progress: goal.progress,
    objectives,
    successCriteria: goal.successCriteria,
    plans: planSummaries,
    createdAt: goal.createdAt,
    startedAt: goal.startedAt,
    achievedAt: goal.achievedAt,
    deadline: goal.deadline,
    daysRemaining: goal.deadline
      ? Math.ceil((goal.deadline - Date.now()) / (24 * 60 * 60 * 1000))
      : undefined,
    isAtRisk,
    riskReason,
  };
}

async function buildRecentAchievements(agentId: string): Promise<AchievementEvent[]> {
  const goals = await listAgentGoals(agentId, { status: "achieved" });
  const achievements: AchievementEvent[] = [];

  // Get last 10 achievements
  const recentGoals = goals
    .filter(g => g.achievedAt)
    .sort((a, b) => (b.achievedAt ?? 0) - (a.achievedAt ?? 0))
    .slice(0, 10);

  for (const goal of recentGoals) {
    if (!goal.achievedAt || !goal.startedAt) continue;

    const progress = await getGoalProgress(goal.id);
    if (!progress) continue;

    achievements.push({
      goalId: goal.id,
      goalName: goal.name,
      achievedAt: goal.achievedAt,
      duration: goal.achievedAt - goal.startedAt,
      objectivesAchieved: progress.objectivesAchieved,
      objectivesTotal: progress.objectivesTotal,
    });
  }

  return achievements;
}

async function buildGoalTrends(agentId: string, goals: Goal[]): Promise<GoalTrends> {
  // Progress over time (last 30 days)
  const progressOverTime: GoalTrends["progressOverTime"] = [];

  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    const dateStr = date.toISOString().split("T")[0];

    // Calculate average progress for active goals on this date
    // (simplified - in production would track historical progress)
    const activeGoalsOnDate = goals.filter(g => 
      g.status === "active" || 
      (g.achievedAt && g.achievedAt > date.getTime())
    );

    const avgProgress = activeGoalsOnDate.length > 0
      ? activeGoalsOnDate.reduce((sum, g) => sum + g.progress, 0) / activeGoalsOnDate.length
      : 0;

    const goalsAchieved = goals.filter(g => 
      g.achievedAt && 
      g.achievedAt >= date.getTime() && 
      g.achievedAt < date.getTime() + 24 * 60 * 60 * 1000
    ).length;

    const goalsFailed = goals.filter(g => 
      g.status === "failed" &&
      g.achievedAt && 
      g.achievedAt >= date.getTime() && 
      g.achievedAt < date.getTime() + 24 * 60 * 60 * 1000
    ).length;

    progressOverTime.push({
      date: dateStr,
      avgProgress,
      goalsAchieved,
      goalsFailed,
    });
  }

  // Achievement rate (goals achieved per month)
  const achievedGoals = goals.filter(g => g.status === "achieved");
  const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const achievedThisMonth = achievedGoals.filter(g => g.achievedAt && g.achievedAt > oneMonthAgo).length;

  // Average time to achieve
  const achievedWithDuration = achievedGoals.filter(g => g.achievedAt && g.startedAt);
  const avgTimeToAchieve = achievedWithDuration.length > 0
    ? achievedWithDuration.reduce((sum, g) => sum + ((g.achievedAt! - g.startedAt!) / (24 * 60 * 60 * 1000)), 0) / achievedWithDuration.length
    : 0;

  return {
    progressOverTime,
    achievementRate: achievedThisMonth,
    avgTimeToAchieve,
  };
}

// ─── Specialized Queries ────────────────────────────────────────

/**
 * Get goal details with full context.
 */
export async function getGoalDetail(goalId: string): Promise<GoalDetail | null> {
  const goal = await getGoal(goalId);
  if (!goal) return null;

  return buildGoalDetail(goal);
}

/**
 * Get plan details with action progress.
 */
export async function getPlanDetail(planId: string): Promise<Plan | null> {
  return getPlan(planId);
}

/**
 * Get goals by status.
 */
export async function getGoalsByStatus(
  agentId: string,
  status: GoalStatus,
): Promise<GoalDetail[]> {
  const goals = await listAgentGoals(agentId, { status });
  return buildActiveGoals(goals);
}

/**
 * Get goals by type.
 */
export async function getGoalsByType(
  agentId: string,
  type: GoalType,
): Promise<GoalDetail[]> {
  const goals = await listAgentGoals(agentId);
  const filtered = goals.filter(g => g.type === type);
  return buildActiveGoals(filtered);
}

/**
 * Get at-risk goals.
 */
export async function getAtRiskGoals(agentId: string): Promise<GoalDetail[]> {
  const goals = await listAgentGoals(agentId, { status: "active" });
  const details = await buildActiveGoals(goals);
  return details.filter(g => g.isAtRisk);
}

/**
 * Get goal hierarchy as flat list with depth.
 */
export async function getGoalHierarchy(
  agentId: string,
): Promise<Array<{ goal: GoalDetail; depth: number }>> {
  const tree = await buildGoalTree(agentId);
  const flat: Array<{ goal: GoalDetail; depth: number }> = [];

  function flatten(nodes: GoalNode[]) {
    for (const node of nodes) {
      flat.push({ goal: node.goal, depth: node.depth });
      flatten(node.children);
    }
  }

  flatten(tree);
  return flat;
}

/**
 * Get plan execution timeline.
 */
export async function getPlanTimeline(
  planId: string,
): Promise<Array<{
  actionId: string;
  actionName: string;
  status: string;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
}>> {
  const plan = await getPlan(planId);
  if (!plan) return [];

  return plan.actions.map(action => ({
    actionId: action.id,
    actionName: action.actionName,
    status: action.status,
    startedAt: action.startedAt,
    completedAt: action.completedAt,
    duration: action.startedAt && action.completedAt
      ? action.completedAt - action.startedAt
      : undefined,
  }));
}
