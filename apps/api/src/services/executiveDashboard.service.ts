/**
 * Executive Dashboard Service (Module 13 — Gap 1)
 *
 * Unified executive dashboard aggregating data from all modules:
 * - Agent performance and workforce analytics
 * - Goal achievement and plan execution
 * - Decision intelligence and recommendations
 * - Predictive insights and forecasts
 * - System health and resource utilization
 * - Real-time activity and events
 *
 * Provides single source of truth for platform performance.
 */
import { prisma } from "../db/client.js";
import { logger } from "../config/logger.js";
import { getWorkforceAnalytics } from "./agentAnalytics.service.js";
import { listAgentGoals, getGoalStats } from "./goalManagement.service";
import { listAgentPlans } from "./planning.service";
import { listDecisionModels } from "./decisionModel.service";
import { listTimeSeries } from "./timeSeries.service";
import { KnowledgeGraphService } from "../enterprise/knowledgeGraph/knowledgeGraph.service";

// ─── Types ──────────────────────────────────────────────────────

export interface ExecutiveDashboard {
  generatedAt: number;
  organizationId: string;
  summary: ExecutiveSummary;
  workforce: WorkforceSection;
  goals: GoalsSection;
  decisions: DecisionsSection;
  predictions: PredictionsSection;
  system: SystemSection;
  activity: ActivitySection;
}

export interface ExecutiveSummary {
  overallHealth: number; // 0-100
  keyMetrics: Array<{
    label: string;
    value: string | number;
    delta?: number; // Percentage change
    trend?: "up" | "down" | "stable";
    tone?: "emerald" | "azure" | "violet" | "fuchsia" | "teal" | "crimson";
  }>;
  alerts: Array<{
    severity: "info" | "warning" | "critical";
    message: string;
    timestamp: number;
  }>;
}

export interface WorkforceSection {
  totalAgents: number;
  activeAgents: number;
  totalTasks: number;
  avgSuccessRate: number;
  totalCost: number;
  topPerformers: Array<{
    agentId: string;
    agentName: string;
    metric: string;
    value: number;
  }>;
  underperformers: Array<{
    agentId: string;
    agentName: string;
    metric: string;
    value: number;
    reason: string;
  }>;
}

export interface GoalsSection {
  totalGoals: number;
  activeGoals: number;
  achievedGoals: number;
  failedGoals: number;
  avgProgress: number;
  byType: {
    strategic: number;
    tactical: number;
    operational: number;
  };
  topGoals: Array<{
    id: string;
    name: string;
    progress: number;
    status: string;
    type: string;
  }>;
  atRiskGoals: Array<{
    id: string;
    name: string;
    progress: number;
    reason: string;
  }>;
}

export interface DecisionsSection {
  totalDecisions: number;
  decidedCount: number;
  evaluatingCount: number;
  avgConfidence: number;
  recentDecisions: Array<{
    id: string;
    name: string;
    status: string;
    selectedOption?: string;
    decidedAt?: number;
  }>;
}

export interface PredictionsSection {
  activeForecasts: number;
  timeSeriesCount: number;
  topForecasts: Array<{
    timeSeriesId: string;
    name: string;
    method: string;
    nextValue: number;
    confidence: number;
  }>;
  anomalies: Array<{
    timeSeriesId: string;
    name: string;
    timestamp: number;
    value: number;
    expected: number;
  }>;
}

export interface SystemSection {
  knowledgeGraph: {
    totalEntities: number;
    totalRelations: number;
    inferredFacts: number;
  };
  worldState: {
    totalStates: number;
    totalTransitions: number;
    lastStateCapture?: number;
  };
  reasoning: {
    totalInferences: number;
    totalRules: number;
    ruleApplications: number;
  };
}

export interface ActivitySection {
  recentEvents: Array<{
    type: string;
    message: string;
    timestamp: number;
    agentId?: string;
    agentName?: string;
  }>;
  activityByHour: Array<{
    hour: string;
    count: number;
  }>;
}

// ─── Dashboard Generation ───────────────────────────────────────

/**
 * Generate comprehensive executive dashboard.
 */
export async function generateExecutiveDashboard(
  userId: string,
  organizationId: string,
): Promise<ExecutiveDashboard> {
  const generatedAt = Date.now();

  // Fetch all data in parallel
  const [
    workforceAnalytics,
    goalStats,
    decisions,
    timeSeries,
    knowledgeGraphStats,
    recentActivities,
  ] = await Promise.all([
    getWorkforceAnalytics(userId, "30d"),
    getGoalStatsForOrg(organizationId),
    getDecisionStats(organizationId),
    getTimeSeriesStats(organizationId),
    getKnowledgeGraphStats(),
    getRecentActivities(organizationId),
  ]);

  // Build summary
  const summary = buildSummary(
    workforceAnalytics,
    goalStats,
    decisions,
    recentActivities,
  );

  // Build sections
  const workforce = buildWorkforceSection(workforceAnalytics);
  const goals = buildGoalsSection(goalStats);
  const decisionsSection = buildDecisionsSection(decisions);
  const predictions = buildPredictionsSection(timeSeries);
  const system = buildSystemSection(knowledgeGraphStats);
  const activity = buildActivitySection(recentActivities);

  const dashboard: ExecutiveDashboard = {
    generatedAt,
    organizationId,
    summary,
    workforce,
    goals,
    decisions: decisionsSection,
    predictions,
    system,
    activity,
  };

  logger.info("Executive dashboard generated", {
    organizationId,
    generatedAt,
    totalAgents: workforce.totalAgents,
    totalGoals: goals.totalGoals,
  });

  return dashboard;
}

// ─── Helper Functions ───────────────────────────────────────────

async function getGoalStatsForOrg(organizationId: string) {
  const agents = await prisma.agent.findMany({
    where: { organizationId },
    select: { id: true },
  });

  let totalGoals = 0;
  let activeGoals = 0;
  let achievedGoals = 0;
  let failedGoals = 0;
  let totalProgress = 0;
  const byType = { strategic: 0, tactical: 0, operational: 0 };
  const topGoals: GoalsSection["topGoals"] = [];
  const atRiskGoals: GoalsSection["atRiskGoals"] = [];

  for (const agent of agents) {
    const stats = await getGoalStats(agent.id);
    totalGoals += stats.totalGoals;
    activeGoals += stats.byStatus.active ?? 0;
    achievedGoals += stats.byStatus.achieved ?? 0;
    failedGoals += stats.byStatus.failed ?? 0;
    totalProgress += stats.avgProgress * stats.totalGoals;

    byType.strategic += stats.byType.strategic ?? 0;
    byType.tactical += stats.byType.tactical ?? 0;
    byType.operational += stats.byType.operational ?? 0;

    // Get top goals
    const goals = await listAgentGoals(agent.id, { status: "active" });
    for (const goal of goals.slice(0, 5)) {
      topGoals.push({
        id: goal.id,
        name: goal.name,
        progress: goal.progress,
        status: goal.status,
        type: goal.type,
      });

      // Check for at-risk goals
      if (goal.progress < 30 && goal.deadline && goal.deadline < Date.now() + 7 * 24 * 60 * 60 * 1000) {
        atRiskGoals.push({
          id: goal.id,
          name: goal.name,
          progress: goal.progress,
          reason: "Low progress with approaching deadline",
        });
      }
    }
  }

  return {
    totalGoals,
    activeGoals,
    achievedGoals,
    failedGoals,
    avgProgress: totalGoals > 0 ? totalProgress / totalGoals : 0,
    byType,
    topGoals: topGoals.slice(0, 10),
    atRiskGoals: atRiskGoals.slice(0, 5),
  };
}

async function getDecisionStats(organizationId: string) {
  const decisions = await listDecisionModels();
  const orgDecisions = decisions.filter(d => d.organizationId === organizationId);

  const decidedCount = orgDecisions.filter(d => d.status === "decided").length;
  const evaluatingCount = orgDecisions.filter(d => d.status === "evaluating").length;

  // Calculate average confidence (would need to fetch recommendations)
  const avgConfidence = 0.75; // Placeholder

  const recentDecisions = orgDecisions
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10)
    .map(d => ({
      id: d.id,
      name: d.name,
      status: d.status,
      selectedOption: d.selectedOptionId,
      decidedAt: d.decidedAt,
    }));

  return {
    totalDecisions: orgDecisions.length,
    decidedCount,
    evaluatingCount,
    avgConfidence,
    recentDecisions,
  };
}

async function getTimeSeriesStats(organizationId: string) {
  const timeSeries = await listTimeSeries();
  const orgTimeSeries = timeSeries.filter(ts => ts.organizationId === organizationId);

  return {
    activeForecasts: 0, // Would need to track active forecasts
    timeSeriesCount: orgTimeSeries.length,
    topForecasts: [], // Would need to fetch forecast results
    anomalies: [], // Would need anomaly detection
  };
}

async function getKnowledgeGraphStats() {
  const stats = await KnowledgeGraphService.getStats();
  
  return {
    knowledgeGraph: {
      totalEntities: stats.totalEntities,
      totalRelations: stats.totalRelations,
      inferredFacts: stats.inferredFacts ?? 0,
    },
    worldState: {
      totalStates: 0, // Would need to query world state service
      totalTransitions: 0,
      lastStateCapture: undefined,
    },
    reasoning: {
      totalInferences: 0, // Would need to query inference engine
      totalRules: 0,
      ruleApplications: 0,
    },
  };
}

async function getRecentActivities(organizationId: string) {
  const activities = await prisma.activity.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      agent: { select: { id: true, name: true } },
    },
  });

  const recentEvents = activities.map(a => ({
    type: a.type,
    message: a.message,
    timestamp: a.createdAt.getTime(),
    agentId: a.agent?.id,
    agentName: a.agent?.name,
  }));

  // Activity by hour (last 24 hours)
  const activityByHour: ActivitySection["activityByHour"] = [];
  for (let i = 23; i >= 0; i--) {
    const hourStart = new Date();
    hourStart.setHours(hourStart.getHours() - i, 0, 0, 0);
    const hourEnd = new Date(hourStart);
    hourEnd.setHours(hourEnd.getHours() + 1);

    const count = activities.filter(a => 
      a.createdAt >= hourStart && a.createdAt < hourEnd
    ).length;

    activityByHour.push({
      hour: hourStart.toISOString(),
      count,
    });
  }

  return { recentEvents, activityByHour };
}

function buildSummary(
  workforce: any,
  goals: any,
  decisions: any,
  activities: any,
): ExecutiveSummary {
  // Calculate overall health (simplified)
  const healthFactors = [
    workforce.summary.avgSuccessRate,
    goals.avgProgress,
    decisions.avgConfidence * 100,
  ];
  const overallHealth = Math.round(
    healthFactors.reduce((sum, f) => sum + f, 0) / healthFactors.length
  );

  const keyMetrics: ExecutiveSummary["keyMetrics"] = [
    {
      label: "Active Agents",
      value: workforce.summary.activeAgents,
      tone: "azure",
    },
    {
      label: "Task Success Rate",
      value: `${workforce.summary.avgSuccessRate}%`,
      tone: workforce.summary.avgSuccessRate > 80 ? "emerald" : "crimson",
    },
    {
      label: "Active Goals",
      value: goals.activeGoals,
      tone: "violet",
    },
    {
      label: "Goal Progress",
      value: `${Math.round(goals.avgProgress)}%`,
      tone: goals.avgProgress > 60 ? "emerald" : "fuchsia",
    },
    {
      label: "Decisions Made",
      value: decisions.decidedCount,
      tone: "teal",
    },
    {
      label: "Total Cost (30d)",
      value: `$${workforce.summary.totalCost.toFixed(2)}`,
      tone: "azure",
    },
  ];

  // Build alerts
  const alerts: ExecutiveSummary["alerts"] = [];

  if (workforce.summary.avgSuccessRate < 70) {
    alerts.push({
      severity: "warning",
      message: `Agent success rate (${workforce.summary.avgSuccessRate}%) is below 70% threshold`,
      timestamp: Date.now(),
    });
  }

  if (goals.atRiskGoals.length > 0) {
    alerts.push({
      severity: "warning",
      message: `${goals.atRiskGoals.length} goals are at risk of missing deadlines`,
      timestamp: Date.now(),
    });
  }

  if (workforce.underperformers.length > 0) {
    alerts.push({
      severity: "info",
      message: `${workforce.underperformers.length} agents are underperforming`,
      timestamp: Date.now(),
    });
  }

  return { overallHealth, keyMetrics, alerts };
}

function buildWorkforceSection(workforce: any): WorkforceSection {
  return {
    totalAgents: workforce.summary.totalAgents,
    activeAgents: workforce.summary.activeAgents,
    totalTasks: workforce.summary.totalTasks,
    avgSuccessRate: workforce.summary.avgSuccessRate,
    totalCost: workforce.summary.totalCost,
    topPerformers: workforce.topPerformers,
    underperformers: workforce.underperformers,
  };
}

function buildGoalsSection(goals: any): GoalsSection {
  return goals;
}

function buildDecisionsSection(decisions: any): DecisionsSection {
  return decisions;
}

function buildPredictionsSection(predictions: any): PredictionsSection {
  return predictions;
}

function buildSystemSection(system: any): SystemSection {
  return system;
}

function buildActivitySection(activities: any): ActivitySection {
  return activities;
}

/**
 * Get dashboard summary (lightweight version).
 */
export async function getDashboardSummary(
  userId: string,
  organizationId: string,
): Promise<ExecutiveSummary> {
  const dashboard = await generateExecutiveDashboard(userId, organizationId);
  return dashboard.summary;
}

/**
 * Get workforce section only.
 */
export async function getWorkforceDashboard(
  userId: string,
  period: "24h" | "7d" | "30d" | "90d" | "all" = "30d",
): Promise<WorkforceSection> {
  const workforce = await getWorkforceAnalytics(userId, period);
  return buildWorkforceSection(workforce);
}

/**
 * Get goals section only.
 */
export async function getGoalsDashboard(
  organizationId: string,
): Promise<GoalsSection> {
  const goals = await getGoalStatsForOrg(organizationId);
  return buildGoalsSection(goals);
}
