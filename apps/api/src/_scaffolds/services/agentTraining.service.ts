/**
 * Agent Training & Evaluation Service (Module 3 — Gap 5)
 *
 * Provides a framework for improving agents over time:
 * - Feedback collection: store task evaluations (good/bad/neutral + comments)
 * - Training data: export successful task results as training examples
 * - Evaluation metrics: quality scores, user satisfaction, error rates
 * - Improvement suggestions: identify weak areas based on failures
 * - Integration: links to AgentMemory for learning from feedback
 */
import { prisma } from "../../db/client.js";
import { redisCmd } from "../../db/redis.js";
import { AppError } from "../../utils/result.js";
import { resolveUserContext } from "../../services/workspace.service.js";
import { logger } from "../../config/logger.js";
import { z } from "zod";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:agentTraining');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Schemas ────────────────────────────────────────────────────

export const SubmitFeedbackSchema = z.object({
  taskId: z.string().cuid(),
  rating: z.enum(["good", "neutral", "bad"]),
  comment: z.string().max(2000).optional(),
  tags: z.array(z.string().max(64)).max(10).optional(),
});

export const EvaluationSchema = z.object({
  agentId: z.string().cuid(),
  criteria: z.string().min(1).max(100),
  score: z.number().min(0).max(100),
  notes: z.string().max(1000).optional(),
});

// ─── Feedback Storage ───────────────────────────────────────────

const FEEDBACK_KEY = (agentId: string) => `agent:feedback:${agentId}`;

/**
 * Submit feedback on a completed task.
 * This is the primary way users rate agent performance.
 */
export async function submitFeedback(
  userId: string,
  input: z.infer<typeof SubmitFeedbackSchema>,
) {
  const ctx = await resolveUserContext(userId);

  // Verify task exists and belongs to org
  const task = await prisma.task.findFirst({
    where: {
      id: input.taskId,
      organizationId: ctx.organizationId,
      status: "DONE",
    },
    include: { agent: true },
  });

  if (!task) throw AppError.notFound("Completed task not found");
  if (!task.agentId) throw AppError.badRequest("Task was not executed by an agent");

  // Store feedback in Redis (for fast analytics)
  const feedbackEntry = {
    id: `fb_${Date.now()}_${_rng.next().toString(36).slice(2)}`,
    taskId: input.taskId,
    agentId: task.agentId,
    userId,
    rating: input.rating,
    comment: input.comment,
    tags: input.tags ?? [],
    createdAt: new Date().toISOString(),
  };

  try {
    await redisCmd.lpush(FEEDBACK_KEY(task.agentId), JSON.stringify(feedbackEntry));
    await redisCmd.ltrim(FEEDBACK_KEY(task.agentId), 0, 499); // Keep last 500
  } catch {}

  // Store as agent memory for learning
  if (input.rating === "good" && input.comment) {
    await prisma.agentMemory.create({
      data: {
        agentId: task.agentId,
        type: "FEEDBACK",
        content: `Positive feedback on "${task.title}": ${input.comment}`,
        source: "feedback",
        sourceRef: input.taskId,
        importance: 0.8,
        tags: ["positive-feedback", ...(input.tags ?? [])],
      },
    });
  } else if (input.rating === "bad" && input.comment) {
    await prisma.agentMemory.create({
      data: {
        agentId: task.agentId,
        type: "FEEDBACK",
        content: `Negative feedback on "${task.title}": ${input.comment}. Improve in this area.`,
        source: "feedback",
        sourceRef: input.taskId,
        importance: 0.9,
        tags: ["negative-feedback", "improvement-needed", ...(input.tags ?? [])],
      },
    });
  }

  // Record event
  await prisma.agentEvent.create({
    data: {
      agentId: task.agentId,
      type: "FEEDBACK",
      message: `Received ${input.rating} feedback on task "${task.title}"`,
      metadata: {
        taskId: input.taskId,
        rating: input.rating,
        comment: input.comment,
        userId,
      },
    },
  });

  logger.info("Feedback submitted", {
    agentId: task.agentId,
    taskId: input.taskId,
    rating: input.rating,
    userId,
  });

  return feedbackEntry;
}

// ─── Feedback Analytics ─────────────────────────────────────────

/**
 * Get feedback analytics for an agent.
 */
export async function getFeedbackAnalytics(agentId: string) {
  let feedbacks: any[] = [];
  try {
    const raw = await redisCmd.lrange(FEEDBACK_KEY(agentId), 0, -1);
    feedbacks = raw.map((r) => JSON.parse(r));
  } catch {}

  const total = feedbacks.length;
  const good = feedbacks.filter((f) => f.rating === "good").length;
  const neutral = feedbacks.filter((f) => f.rating === "neutral").length;
  const bad = feedbacks.filter((f) => f.rating === "bad").length;

  // Satisfaction score: (good * 100 + neutral * 50 + bad * 0) / total
  const satisfactionScore = total > 0
    ? Math.round((good * 100 + neutral * 50) / total)
    : null;

  // Recent trends (last 10 feedbacks)
  const recent = feedbacks.slice(0, 10);
  const recentGood = recent.filter((f) => f.rating === "good").length;
  const recentBad = recent.filter((f) => f.rating === "bad").length;
  const trend = recentGood > recentBad ? "improving" : recentBad > recentGood ? "declining" : "stable";

  // Common tags in negative feedback
  const negativeTags: Record<string, number> = {};
  for (const f of feedbacks.filter((f) => f.rating === "bad")) {
    for (const tag of f.tags ?? []) {
      negativeTags[tag] = (negativeTags[tag] ?? 0) + 1;
    }
  }

  return {
    agentId,
    total,
    good,
    neutral,
    bad,
    satisfactionScore,
    trend,
    recentFeedback: recent.slice(0, 5),
    commonNegativeTags: Object.entries(negativeTags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count })),
  };
}

// ─── Training Data Export ───────────────────────────────────────

/**
 * Export successful task results as training examples.
 * These can be used for fine-tuning or few-shot prompting.
 */
export async function exportTrainingData(
  userId: string,
  agentId: string,
  options?: {
    limit?: number;
    minRating?: "good" | "neutral";
    includeFeedback?: boolean;
  },
) {
  const ctx = await resolveUserContext(userId);
  const { limit = 50, includeFeedback = true } = options ?? {};

  // Verify agent belongs to org
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, organizationId: ctx.organizationId },
  });
  if (!agent) throw AppError.notFound("Agent not found");

  // Get completed tasks with good feedback
  const tasks = await prisma.task.findMany({
    where: {
      agentId,
      status: "DONE",
      description: { not: null },
    },
    orderBy: { completedAt: "desc" },
    take: limit * 2, // Over-fetch to filter by feedback
    select: {
      id: true,
      title: true,
      description: true,
      completedAt: true,
      metadata: true,
    },
  });

  // Get feedback for these tasks
  let feedbacks: any[] = [];
  if (includeFeedback) {
    try {
      const raw = await redisCmd.lrange(FEEDBACK_KEY(agentId), 0, -1);
      feedbacks = raw.map((r) => JSON.parse(r));
    } catch {}
  }

  const feedbackMap = new Map(feedbacks.map((f) => [f.taskId, f]));

  // Build training examples
  const examples = [];
  for (const task of tasks) {
    if (examples.length >= limit) break;

    const feedback = feedbackMap.get(task.id);

    // Filter by rating if specified
    if (options?.minRating && feedback) {
      if (options.minRating === "good" && feedback.rating !== "good") continue;
      if (options.minRating === "neutral" && feedback.rating === "bad") continue;
    }

    // Extract the agent's result from the description
    const resultMatch = task.description?.match(/\*\*Agent result:\*\*\n([\s\S]*)/);
    const agentResult = resultMatch ? resultMatch[1].trim() : task.description;

    examples.push({
      id: task.id,
      input: {
        task: task.title,
        context: task.description?.split("**Agent result:**")[0]?.trim() ?? "",
      },
      output: agentResult,
      metadata: {
        completedAt: task.completedAt,
        feedback: feedback
          ? { rating: feedback.rating, comment: feedback.comment }
          : null,
      },
    });
  }

  return {
    agentId,
    agentName: agent.name,
    totalExamples: examples.length,
    examples,
  };
}

// ─── Evaluation Framework ───────────────────────────────────────

/**
 * Submit an evaluation for an agent on a specific criterion.
 */
export async function submitEvaluation(
  userId: string,
  input: z.infer<typeof EvaluationSchema>,
) {
  const ctx = await resolveUserContext(userId);

  // Verify agent belongs to org
  const agent = await prisma.agent.findFirst({
    where: { id: input.agentId, organizationId: ctx.organizationId },
  });
  if (!agent) throw AppError.notFound("Agent not found");

  // Store evaluation as an agent event
  await prisma.agentEvent.create({
    data: {
      agentId: input.agentId,
      type: "TASK_COMPLETED", // Reuse event type for evaluations
      message: `Evaluation: ${input.criteria} = ${input.score}/100`,
      metadata: {
        evaluation: true,
        criteria: input.criteria,
        score: input.score,
        notes: input.notes,
        evaluatorId: userId,
      },
    },
  });

  // Store in Redis for fast aggregation
  try {
    const key = `agent:evaluations:${input.agentId}`;
    await redisCmd.lpush(
      key,
      JSON.stringify({
        criteria: input.criteria,
        score: input.score,
        notes: input.notes,
        evaluatorId: userId,
        createdAt: new Date().toISOString(),
      }),
    );
    await redisCmd.ltrim(key, 0, 199); // Keep last 200
  } catch {}

  logger.info("Agent evaluation submitted", {
    agentId: input.agentId,
    criteria: input.criteria,
    score: input.score,
  });

  return { success: true };
}

/**
 * Get evaluation summary for an agent.
 */
export async function getEvaluationSummary(agentId: string) {
  let evaluations: any[] = [];
  try {
    const raw = await redisCmd.lrange(`agent:evaluations:${agentId}`, 0, -1);
    evaluations = raw.map((r) => JSON.parse(r));
  } catch {}

  // Group by criteria
  const byCriteria: Record<string, { scores: number[]; latest: any }> = {};
  for (const eval_ of evaluations) {
    if (!byCriteria[eval_.criteria]) {
      byCriteria[eval_.criteria] = { scores: [], latest: eval_ };
    }
    byCriteria[eval_.criteria].scores.push(eval_.score);
    if (eval_.createdAt > byCriteria[eval_.criteria].latest.createdAt) {
      byCriteria[eval_.criteria].latest = eval_;
    }
  }

  // Calculate averages
  const summary = Object.entries(byCriteria).map(([criteria, data]) => ({
    criteria,
    avgScore: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
    minScore: Math.min(...data.scores),
    maxScore: Math.max(...data.scores),
    evaluationCount: data.scores.length,
    latestScore: data.latest.score,
    latestNotes: data.latest.notes,
    trend: data.scores.length >= 2
      ? data.scores[data.scores.length - 1] > data.scores[0]
        ? "improving"
        : data.scores[data.scores.length - 1] < data.scores[0]
          ? "declining"
          : "stable"
      : "insufficient_data",
  }));

  return {
    agentId,
    totalEvaluations: evaluations.length,
    criteria: summary,
    overallAvgScore: evaluations.length > 0
      ? Math.round(evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length)
      : null,
  };
}

// ─── Improvement Suggestions ────────────────────────────────────

/**
 * Generate improvement suggestions for an agent based on:
 * - Negative feedback patterns
 * - Low evaluation scores
 * - High failure rates
 * - Slow task completion
 */
export async function getImprovementSuggestions(
  userId: string,
  agentId: string,
): Promise<Array<{
  category: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
  evidence: string;
}>> {
  const ctx = await resolveUserContext(userId);
  const suggestions: Array<{
    category: string;
    suggestion: string;
    priority: "high" | "medium" | "low";
    evidence: string;
  }> = [];

  // Get feedback analytics
  const feedback = await getFeedbackAnalytics(agentId);

  // Check satisfaction score
  if (feedback.satisfactionScore !== null && feedback.satisfactionScore < 60) {
    suggestions.push({
      category: "User Satisfaction",
      suggestion: "Review negative feedback comments and adjust system prompt to address common complaints",
      priority: "high",
      evidence: `Satisfaction score is ${feedback.satisfactionScore}% (below 60% threshold)`,
    });
  }

  // Check declining trend
  if (feedback.trend === "declining") {
    suggestions.push({
      category: "Performance Trend",
      suggestion: "Investigate recent task failures and consider retraining or updating knowledge base",
      priority: "high",
      evidence: "Feedback trend is declining (more recent bad ratings than good)",
    });
  }

  // Check common negative tags
  for (const { tag, count } of feedback.commonNegativeTags.slice(0, 3)) {
    suggestions.push({
      category: "Recurring Issues",
      suggestion: `Address recurring issue tagged "${tag}" — consider adding specific instructions or knowledge`,
      priority: count >= 5 ? "high" : "medium",
      evidence: `Tag "${tag}" appears in ${count} negative feedback entries`,
    });
  }

  // Check evaluation scores
  const evalSummary = await getEvaluationSummary(agentId);
  for (const criterion of evalSummary.criteria) {
    if (criterion.avgScore < 60) {
      suggestions.push({
        category: "Evaluation",
        suggestion: `Improve performance on "${criterion.criteria}" — review training data and system prompt`,
        priority: criterion.avgScore < 40 ? "high" : "medium",
        evidence: `Average score for "${criterion.criteria}" is ${criterion.avgScore}/100`,
      });
    }
  }

  // Check task failure rate (from analytics)
  try {
    const { getAgentMetrics } = await import("./agentAnalytics.service.js");
    const metrics = await getAgentMetrics(userId, agentId, "30d");
    if (metrics.tasks.total >= 10 && metrics.tasks.successRate < 70) {
      suggestions.push({
        category: "Task Success Rate",
        suggestion: "Review failed tasks to identify common error patterns and add error handling to system prompt",
        priority: metrics.tasks.successRate < 50 ? "high" : "medium",
        evidence: `Task success rate is ${metrics.tasks.successRate}% over last 30 days`,
      });
    }
    if (metrics.performance.avgDurationMs > 60000 && metrics.tasks.completed >= 5) {
      suggestions.push({
        category: "Performance Speed",
        suggestion: "Consider optimizing system prompt for conciseness or using a faster model",
        priority: "low",
        evidence: `Average task duration is ${Math.round(metrics.performance.avgDurationMs / 1000)}s`,
      });
    }
  } catch {}

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}
