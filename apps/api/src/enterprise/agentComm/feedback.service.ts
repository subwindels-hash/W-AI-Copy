/**
 * FeedbackService — Slice 175.
 *
 * Collects explicit and implicit feedback signals (up/down votes, ratings,
 * corrections, rewards, comments) on agents/messages/reasoning/handoffs and
 * rolls them into rolling performance & reputation scores per agent.
 *
 * Scores are simple exponentially-weighted moving averages for MVP (alpha=0.2);
 * a future slice will plug in a proper ELO/reinforcement learner.
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import { AgentIdentityService } from "./agentIdentity.service.js";
import type { AgentFeedback, AgentPerformanceMetric, FeedbackKind } from "@windels/shared/agentComm";

const FEEDBACK_PREFIX = "agentComm:feedback:";
const FEEDBACK_INDEX = "agentComm:feedbacks";
const METRIC_PREFIX = "agentComm:metrics:";
const TASKS_DONE_PREFIX = "agentComm:tasksDone:";
const TASKS_FAIL_PREFIX = "agentComm:tasksFail:";
const LATENCY_PREFIX = "agentComm:latency:";
const EWMA_ALPHA = 0.2;

function fKey(id: string) { return FEEDBACK_PREFIX + id; }
function mKey(agentId: string, window: string) { return `${METRIC_PREFIX}${agentId}:${window}`; }
function now() { return new Date().toISOString(); }

function windowStart(window: AgentPerformanceMetric["window"]): string {
  const d = new Date();
  switch (window) {
    case "hour": d.setMinutes(0, 0, 0); break;
    case "day": d.setHours(0, 0, 0, 0); break;
    case "week": {
      const day = d.getDay();
      const diff = (day === 0 ? -6 : 1 - day);
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      break;
    }
    case "all": return new Date(0).toISOString();
  }
  return d.toISOString();
}

export const FeedbackService = {
  async record(fb: Omit<AgentFeedback, "id" | "createdAt">): Promise<AgentFeedback> {
    const id = randomUUID();
    const entry: AgentFeedback = { ...fb, id, createdAt: now() };
    try {
      const pipeline = redisCmd.multi();
      pipeline.set(fKey(id), JSON.stringify(entry));
      pipeline.sadd(FEEDBACK_INDEX, id);
      pipeline.rpush(`agentComm:feedbackByTarget:${fb.targetAgentId}`, id);
      await pipeline.exec();
    } catch (e) { logger.warn("feedback persist failed", { error: (e as Error).message }); }
    // Update EWMA performance/reputation scores on identity
    await this.applyScore(entry);
    return entry;
  },

  async applyScore(fb: AgentFeedback): Promise<void> {
    const identity = await AgentIdentityService.get(fb.targetAgentId);
    if (!identity) return;
    let signal = 0;
    switch (fb.kind) {
      case "upvote": signal = 1; break;
      case "downvote": signal = -1; break;
      case "correction": signal = -0.5; break;
      case "reward": signal = Math.max(-1, Math.min(1, fb.value ?? 0)); break;
      case "rating": signal = ((fb.value ?? 3) - 3) / 2; break; // 1..5 → -1..1
      case "comment": signal = 0; break;
    }
    // Normalize to 0..1
    const norm = (signal + 1) / 2;
    identity.reputationScore = identity.reputationScore * (1 - EWMA_ALPHA) + norm * EWMA_ALPHA;
    identity.performanceScore = identity.performanceScore * (1 - EWMA_ALPHA * 0.5) + norm * (EWMA_ALPHA * 0.5);
    identity.performanceScore = Math.max(0, Math.min(1, identity.performanceScore));
    identity.reputationScore = Math.max(0, Math.min(1, identity.reputationScore));
    await AgentIdentityService.put(identity);
  },

  async listForAgent(targetAgentId: string, limit = 50): Promise<AgentFeedback[]> {
    try {
      const ids = await redisCmd.lrange(`agentComm:feedbackByTarget:${targetAgentId}`, -limit, -1);
      const out: AgentFeedback[] = [];
      for (const id of ids) { const r = await redisCmd.get(fKey(id)); if (r) out.push(JSON.parse(r)); }
      return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch { return []; }
  },

  async list(filter?: { kind?: FeedbackKind; refType?: AgentFeedback["refType"]; limit?: number }): Promise<AgentFeedback[]> {
    let ids: string[] = [];
    try { ids = await redisCmd.smembers(FEEDBACK_INDEX); } catch { return []; }
    const limit = filter?.limit ?? 100;
    const out: AgentFeedback[] = [];
    for (const id of ids) {
      const r = await redisCmd.get(fKey(id)); if (!r) continue;
      const fb = JSON.parse(r) as AgentFeedback;
      if (filter?.kind && fb.kind !== filter.kind) continue;
      if (filter?.refType && fb.refType !== filter.refType) continue;
      out.push(fb);
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  // ── Task/latency bookkeeping (called by agentRuntime / workflows) ─
  async recordTaskCompleted(agentId: string, latencyMs: number, ok: boolean): Promise<void> {
    const win: AgentPerformanceMetric["window"] = "all";
    try {
      const key = mKey(agentId, win);
      const existing = await redisCmd.get(key);
      const metric: AgentPerformanceMetric = existing ? JSON.parse(existing) : {
        agentId, window: win, windowStart: windowStart(win),
        tasksCompleted: 0, tasksFailed: 0, avgLatencyMs: 0,
        approvalRate: 0.5, meanReward: 0,
        performanceScore: 0.5, reputationScore: 0.5, updatedAt: now(),
      };
      if (ok) metric.tasksCompleted++; else metric.tasksFailed++;
      metric.avgLatencyMs = (metric.avgLatencyMs + latencyMs) / 2;
      const identity = await AgentIdentityService.get(agentId);
      if (identity) { metric.performanceScore = identity.performanceScore; metric.reputationScore = identity.reputationScore; }
      metric.updatedAt = now();
      await redisCmd.set(key, JSON.stringify(metric));
    } catch {}
  },

  async getMetrics(agentId: string, window: AgentPerformanceMetric["window"] = "all"): Promise<AgentPerformanceMetric> {
    try {
      const r = await redisCmd.get(mKey(agentId, window));
      if (r) return JSON.parse(r) as AgentPerformanceMetric;
    } catch {}
    const identity = await AgentIdentityService.get(agentId);
    return {
      agentId, window, windowStart: windowStart(window),
      tasksCompleted: 0, tasksFailed: 0, avgLatencyMs: 0,
      approvalRate: 0.5, meanReward: 0,
      performanceScore: identity?.performanceScore ?? 0.5,
      reputationScore: identity?.reputationScore ?? 0.5,
      updatedAt: now(),
    };
  },

  async count(): Promise<number> {
    try { return await redisCmd.scard(FEEDBACK_INDEX); } catch { return 0; }
  },
};
