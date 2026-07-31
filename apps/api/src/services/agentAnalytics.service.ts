/**
 * Agent Performance Analytics Service (Module 3 — Gap 2)
 *
 * Tracks and reports on agent performance metrics:
 * - Task completion rates (completed, failed, in-progress)
 * - Success rate and failure reasons
 * - Average task duration
 * - Token usage (input/output)
 * - Cost tracking
 * - Memory and knowledge utilization
 * - Comparison across agents and time periods
 *
 * Data is pulled from AgentEvent, Task, AgentMemory, AgentKnowledge models.
 */
import { prisma } from "../db/client.js";
import { AppError } from "../utils/result.js";
import { resolveUserContext } from "./workspace.service.js";
import { logger } from "../config/logger.js";

// ─── Types ──────────────────────────────────────────────────────

export interface AgentMetrics {
  agentId: string;
  agentName: string;
  agentRole: string;
  period: {
    start: Date;
    end: Date;
    label: string;
  };
  tasks: {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
    blocked: number;
    cancelled: number;
    successRate: number; // 0-100
  };
  performance: {
    avgDurationMs: number;
    totalDurationMs: number;
    fastestTaskMs: number | null;
    slowestTaskMs: number | null;
  };
  tokens: {
    totalIn: number;
    totalOut: number;
    total: number;
    avgPerTask: number;
  };
  cost: {
    totalMicros: number;
    totalUsd: number;
    avgPerTask: number;
  };
  memory: {
    total: number;
    byType: Record<string, number>;
    avgImportance: number;
  };
  knowledge: {
    total: number;
    totalTokens: number;
    byType: Record<string, number>;
  };
  events: {
    total: number;
    byType: Record<string, number>;
  };
}

export interface WorkforceAnalytics {
  organizationId: string;
  period: {
    start: Date;
    end: Date;
    label: string;
  };
  summary: {
    totalAgents: number;
    activeAgents: number;
    totalTasks: number;
    totalCost: number;
    avgSuccessRate: number;
  };
  agents: AgentMetrics[];
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

// ─── Time Period Helpers ────────────────────────────────────────

function getDateRange(period: "24h" | "7d" | "30d" | "90d" | "all"): { start: Date; end: Date; label: string } {
  const end = new Date();
  let start: Date;
  let label: string;

  switch (period) {
    case "24h":
      start = new Date(Date.now() - 24 * 60 * 60 * 1000);
      label = "Last 24 hours";
      break;
    case "7d":
      start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      label = "Last 7 days";
      break;
    case "30d":
      start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      label = "Last 30 days";
      break;
    case "90d":
      start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      label = "Last 90 days";
      break;
    case "all":
    default:
      start = new Date(0);
      label = "All time";
  }

  return { start, end, label };
}

// ─── Single Agent Metrics ───────────────────────────────────────

/**
 * Get comprehensive metrics for a single agent.
 */
export async function getAgentMetrics(
  userId: string,
  agentId: string,
  period: "24h" | "7d" | "30d" | "90d" | "all" = "30d",
): Promise<AgentMetrics> {
  const ctx = await resolveUserContext(userId);
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, organizationId: ctx.organizationId },
  });
  if (!agent) throw AppError.notFound("Agent not found");

  const dateRange = getDateRange(period);

  // Fetch all data in parallel
  const [tasks, memories, knowledge, events] = await Promise.all([
    // Tasks
    prisma.task.findMany({
      where: {
        agentId,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      select: {
        status: true,
        completedAt: true,
        createdAt: true,
        description: true,
      },
    }),
    // Memories
    prisma.agentMemory.findMany({
      where: { agentId },
      select: { type: true, importance: true },
    }),
    // Knowledge
    prisma.agentKnowledge.findMany({
      where: { agentId },
      select: { type: true, tokens: true },
    }),
    // Events
    prisma.agentEvent.findMany({
      where: {
        agentId,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      select: { type: true },
    }),
  ]);

  // Calculate task metrics
  const taskStats = {
    total: tasks.length,
    completed: tasks.filter((t) => t.status === "DONE").length,
    failed: tasks.filter((t) => t.status === "BLOCKED").length,
    inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    blocked: tasks.filter((t) => t.status === "BLOCKED").length,
    cancelled: tasks.filter((t) => t.status === "CANCELLED").length,
  };
  taskStats["successRate" as keyof typeof taskStats] =
    taskStats.total > 0
      ? Math.round((taskStats.completed / (taskStats.completed + taskStats.failed)) * 100) || 0
      : 0;

  // Calculate duration metrics
  const completedTasks = tasks.filter((t) => t.completedAt && t.createdAt);
  const durations = completedTasks.map((t) => t.completedAt!.getTime() - t.createdAt.getTime());
  const performance = {
    avgDurationMs: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    totalDurationMs: durations.reduce((a, b) => a + b, 0),
    fastestTaskMs: durations.length > 0 ? Math.min(...durations) : null,
    slowestTaskMs: durations.length > 0 ? Math.max(...durations) : null,
  };

  // Token and cost metrics (from agent events with metadata)
  const eventsWithTokens = await prisma.agentEvent.findMany({
    where: {
      agentId,
      type: "TASK_COMPLETED",
      createdAt: { gte: dateRange.start, lte: dateRange.end },
    },
    select: { metadata: true },
  });

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostMicros = 0;

  for (const event of eventsWithTokens) {
    const meta = event.metadata as any;
    totalTokensIn += meta?.tokensIn ?? 0;
    totalTokensOut += meta?.tokensOut ?? 0;
    totalCostMicros += meta?.costMicros ?? 0;
  }

  const tokens = {
    totalIn: totalTokensIn,
    totalOut: totalTokensOut,
    total: totalTokensIn + totalTokensOut,
    avgPerTask: taskStats.completed > 0 ? Math.round((totalTokensIn + totalTokensOut) / taskStats.completed) : 0,
  };

  const cost = {
    totalMicros: totalCostMicros,
    totalUsd: totalCostMicros / 1e8,
    avgPerTask: taskStats.completed > 0 ? totalCostMicros / taskStats.completed : 0,
  };

  // Memory metrics
  const memoryByType: Record<string, number> = {};
  let totalImportance = 0;
  for (const m of memories) {
    memoryByType[m.type] = (memoryByType[m.type] ?? 0) + 1;
    totalImportance += m.importance;
  }
  const memory = {
    total: memories.length,
    byType: memoryByType,
    avgImportance: memories.length > 0 ? totalImportance / memories.length : 0,
  };

  // Knowledge metrics
  const knowledgeByType: Record<string, number> = {};
  let totalKnowledgeTokens = 0;
  for (const k of knowledge) {
    knowledgeByType[k.type] = (knowledgeByType[k.type] ?? 0) + 1;
    totalKnowledgeTokens += k.tokens;
  }
  const knowledgeMetrics = {
    total: knowledge.length,
    totalTokens: totalKnowledgeTokens,
    byType: knowledgeByType,
  };

  // Event metrics
  const eventsByType: Record<string, number> = {};
  for (const e of events) {
    eventsByType[e.type] = (eventsByType[e.type] ?? 0) + 1;
  }
  const eventsMetrics = {
    total: events.length,
    byType: eventsByType,
  };

  return {
    agentId,
    agentName: agent.name,
    agentRole: agent.role,
    period: dateRange,
    tasks: taskStats as any,
    performance,
    tokens,
    cost,
    memory,
    knowledge: knowledgeMetrics,
    events: eventsMetrics,
  };
}

// ─── Workforce Analytics ─────────────────────────────────────────

/**
 * Get analytics for the entire AI workforce.
 */
export async function getWorkforceAnalytics(
  userId: string,
  period: "24h" | "7d" | "30d" | "90d" | "all" = "30d",
): Promise<WorkforceAnalytics> {
  const ctx = await resolveUserContext(userId);
  const dateRange = getDateRange(period);

  // Get all agents in the organization
  const agents = await prisma.agent.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, name: true, role: true, status: true },
  });

  // Get metrics for each agent
  const agentMetrics: AgentMetrics[] = [];
  for (const agent of agents) {
    try {
      const metrics = await getAgentMetrics(userId, agent.id, period);
      agentMetrics.push(metrics);
    } catch (e) {
      logger.warn("Failed to get metrics for agent", { agentId: agent.id, error: e });
    }
  }

  // Calculate summary
  const totalTasks = agentMetrics.reduce((sum, m) => sum + m.tasks.total, 0);
  const totalCost = agentMetrics.reduce((sum, m) => sum + m.cost.totalUsd, 0);
  const avgSuccessRate =
    agentMetrics.length > 0
      ? agentMetrics.reduce((sum, m) => sum + m.tasks.successRate, 0) / agentMetrics.length
      : 0;

  const summary = {
    totalAgents: agents.length,
    activeAgents: agents.filter((a) => a.status === "ONLINE" || a.status === "WORKING").length,
    totalTasks,
    totalCost,
    avgSuccessRate: Math.round(avgSuccessRate),
  };

  // Identify top performers
  const topPerformers: WorkforceAnalytics["topPerformers"] = [];

  // Most tasks completed
  const mostTasks = [...agentMetrics].sort((a, b) => b.tasks.completed - a.tasks.completed)[0];
  if (mostTasks && mostTasks.tasks.completed > 0) {
    topPerformers.push({
      agentId: mostTasks.agentId,
      agentName: mostTasks.agentName,
      metric: "tasks_completed",
      value: mostTasks.tasks.completed,
    });
  }

  // Highest success rate
  const bestSuccess = [...agentMetrics]
    .filter((m) => m.tasks.total > 0)
    .sort((a, b) => b.tasks.successRate - a.tasks.successRate)[0];
  if (bestSuccess && bestSuccess.tasks.successRate > 0) {
    topPerformers.push({
      agentId: bestSuccess.agentId,
      agentName: bestSuccess.agentName,
      metric: "success_rate",
      value: bestSuccess.tasks.successRate,
    });
  }

  // Fastest average duration
  const fastest = [...agentMetrics]
    .filter((m) => m.performance.avgDurationMs > 0)
    .sort((a, b) => a.performance.avgDurationMs - b.performance.avgDurationMs)[0];
  if (fastest) {
    topPerformers.push({
      agentId: fastest.agentId,
      agentName: fastest.agentName,
      metric: "fastest_avg_duration",
      value: fastest.performance.avgDurationMs,
    });
  }

  // Identify underperformers
  const underperformers: WorkforceAnalytics["underperformers"] = [];

  // Low success rate
  const lowSuccess = agentMetrics.filter((m) => m.tasks.total >= 5 && m.tasks.successRate < 50);
  for (const agent of lowSuccess) {
    underperformers.push({
      agentId: agent.agentId,
      agentName: agent.agentName,
      metric: "success_rate",
      value: agent.tasks.successRate,
      reason: `Success rate ${agent.tasks.successRate}% is below 50% threshold`,
    });
  }

  // High failure rate
  const highFailure = agentMetrics.filter((m) => m.tasks.failed > m.tasks.completed && m.tasks.total >= 5);
  for (const agent of highFailure) {
    underperformers.push({
      agentId: agent.agentId,
      agentName: agent.agentName,
      metric: "failure_rate",
      value: agent.tasks.failed,
      reason: `More failures (${agent.tasks.failed}) than completions (${agent.tasks.completed})`,
    });
  }

  return {
    organizationId: ctx.organizationId,
    period: dateRange,
    summary,
    agents: agentMetrics,
    topPerformers,
    underperformers,
  };
}

// ─── Comparison & Benchmarking ──────────────────────────────────

/**
 * Compare two agents side-by-side.
 */
export async function compareAgents(
  userId: string,
  agentId1: string,
  agentId2: string,
  period: "24h" | "7d" | "30d" | "90d" | "all" = "30d",
) {
  const [metrics1, metrics2] = await Promise.all([
    getAgentMetrics(userId, agentId1, period),
    getAgentMetrics(userId, agentId2, period),
  ]);

  return {
    agent1: metrics1,
    agent2: metrics2,
    comparison: {
      tasksCompleted: {
        agent1: metrics1.tasks.completed,
        agent2: metrics2.tasks.completed,
        winner: metrics1.tasks.completed > metrics2.tasks.completed ? "agent1" : "agent2",
      },
      successRate: {
        agent1: metrics1.tasks.successRate,
        agent2: metrics2.tasks.successRate,
        winner: metrics1.tasks.successRate > metrics2.tasks.successRate ? "agent1" : "agent2",
      },
      avgDuration: {
        agent1: metrics1.performance.avgDurationMs,
        agent2: metrics2.performance.avgDurationMs,
        winner: metrics1.performance.avgDurationMs < metrics2.performance.avgDurationMs ? "agent1" : "agent2",
      },
      costEfficiency: {
        agent1: metrics1.cost.avgPerTask,
        agent2: metrics2.cost.avgPerTask,
        winner: metrics1.cost.avgPerTask < metrics2.cost.avgPerTask ? "agent1" : "agent2",
      },
    },
  };
}
