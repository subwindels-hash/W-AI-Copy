/**
 * EscalationService — Slice 176.
 *
 * Policy-based task escalation. Policies define conditions (low confidence,
 * high cost, high priority, PII classification, retries exceeded) and
 * actions (notify manager, request human approval, reroute, pause, fail,
 * invoke governance). When escalate() is called, the first matching policy
 * fires and an Escalation record is created in an open state awaiting
 * approval/denial.
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../../db/redis.js";
import { logger } from "../../observability/logger.js";
import { Metrics } from "../../observability/metrics.js";
import { AgentIdentityService } from "./agentIdentity.service.js";
import { CommProtocolService } from "./commProtocol.service.js";
import type {
  EscalationPolicy, EscalationPolicyAction, Escalation, EscalationStatus,
  CommPriority,
} from "@windels/shared/agentComm";

const POLICY_KEY = "agentComm:policies";
const POLICY_PREFIX = "agentComm:policy:";
const ESC_KEY = "agentComm:escalations";
const ESC_PREFIX = "agentComm:esc:";

function pKey(id: string) { return POLICY_PREFIX + id; }
function eKey(id: string) { return ESC_PREFIX + id; }
function now() { return new Date().toISOString(); }

function priorityRank(p: CommPriority): number {
  return ({ low: 0, normal: 1, high: 2, urgent: 3 } as const)[p];
}

export const EscalationService = {
  async createPolicy(p: Omit<EscalationPolicy, "id" | "createdAt" | "updatedAt">): Promise<EscalationPolicy> {
    const id = randomUUID();
    const policy: EscalationPolicy = { ...p, id, createdAt: now(), updatedAt: now() };
    try {
      const pipe = redisCmd.multi();
      pipe.set(pKey(id), JSON.stringify(policy));
      pipe.sadd(POLICY_KEY, id);
      await pipe.exec();
    } catch (e) { logger.warn("escalation policy save failed", { error: (e as Error).message }); }
    return policy;
  },

  async listPolicies(): Promise<EscalationPolicy[]> {
    let ids: string[] = [];
    try { ids = await redisCmd.smembers(POLICY_KEY); } catch { return []; }
    const out: EscalationPolicy[] = [];
    for (const id of ids) { const r = await redisCmd.get(pKey(id)); if (r) out.push(JSON.parse(r)); }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },

  async getPolicy(id: string): Promise<EscalationPolicy | null> {
    try { const r = await redisCmd.get(pKey(id)); return r ? JSON.parse(r) as EscalationPolicy : null; } catch { return null; }
  },

  async updatePolicy(id: string, patch: Partial<Omit<EscalationPolicy, "id" | "createdAt">>): Promise<EscalationPolicy | null> {
    const p = await this.getPolicy(id); if (!p) return null;
    Object.assign(p, patch, { updatedAt: now() });
    try { await redisCmd.set(pKey(id), JSON.stringify(p)); } catch {}
    return p;
  },

  async deletePolicy(id: string): Promise<boolean> {
    try { await redisCmd.del(pKey(id)); await redisCmd.srem(POLICY_KEY, id); return true; } catch { return false; }
  },

  async togglePolicy(id: string, enabled: boolean): Promise<EscalationPolicy | null> {
    return this.updatePolicy(id, { enabled });
  },

  /** Evaluate all enabled policies against an escalation context. */
  async evaluate(ctx: {
    fromAgentId: string;
    confidence?: number;
    estimatedCostMicros?: number;
    retries?: number;
    priority?: CommPriority;
    dataClassifications?: Array<"public" | "internal" | "confidential" | "restricted" | "pii">;
    taskId?: string;
    correlationId?: string;
    reason?: string;
  }): Promise<Escalation | null> {
    const policies = (await this.listPolicies()).filter((p) => p.enabled);
    const identity = await AgentIdentityService.get(ctx.fromAgentId);
    const department = identity?.department ?? "General";
    for (const policy of policies) {
      if (policy.scope !== "*" && policy.scope !== department && policy.scope !== ctx.fromAgentId) continue;
      const c = policy.conditions;
      if (c.minConfidence != null && (ctx.confidence ?? 1) >= c.minConfidence) continue;
      if (c.maxCostMicros != null && (ctx.estimatedCostMicros ?? 0) < c.maxCostMicros) continue;
      if (c.maxRetries != null && (ctx.retries ?? 0) < c.maxRetries) continue;
      if (c.priorityAtLeast != null && priorityRank(ctx.priority ?? "normal") < priorityRank(c.priorityAtLeast)) continue;
      if (c.dataClassifications?.length) {
        const hit = ctx.dataClassifications?.some((d) => c.dataClassifications!.includes(d));
        if (!hit) continue;
      }
      // Matched — fire escalation
      return this.fire(policy, ctx);
    }
    return null;
  },

  async fire(policy: EscalationPolicy, ctx: {
    fromAgentId: string; taskId?: string; correlationId?: string;
    reason?: string; confidence?: number; estimatedCostMicros?: number;
    retries?: number; priority?: CommPriority; dataClassifications?: string[];
  }): Promise<Escalation> {
    const id = randomUUID();
    // Default route: manager, else policy.routeTo, else "system"
    const identity = await AgentIdentityService.get(ctx.fromAgentId);
    const toId = policy.routeTo ?? identity?.managerId ?? "system";
    const esc: Escalation = {
      id, policyId: policy.id, taskId: ctx.taskId,
      correlationId: ctx.correlationId, fromAgentId: ctx.fromAgentId, toId,
      reason: ctx.reason ?? `Policy "${policy.name}" matched.`,
      status: "open", context: ctx as Record<string, unknown>, createdAt: now(),
    };
    try {
      const pipe = redisCmd.multi();
      pipe.set(eKey(id), JSON.stringify(esc));
      pipe.sadd(ESC_KEY, id);
      await pipe.exec();
    } catch {}
    Metrics.increment("agent_comm.escalations", 1, { action: policy.actions[0] ?? "notify_manager" });
    // Send a protocol message to the approver
    try {
      await CommProtocolService.send({
        from: ctx.fromAgentId, to: toId, type: "escalation",
        subject: `Escalation required: ${policy.name}`,
        payload: { escalationId: id, policyId: policy.id, actions: policy.actions, reason: esc.reason, context: esc.context },
        priority: "high", correlationId: ctx.correlationId, requiresAck: true,
        metadata: { policyName: policy.name },
      });
    } catch (e) { logger.warn("escalation notification failed", { error: (e as Error).message }); }
    return esc;
  },

  async list(filter?: { status?: EscalationStatus; toId?: string; fromAgentId?: string }): Promise<Escalation[]> {
    let ids: string[] = [];
    try { ids = await redisCmd.smembers(ESC_KEY); } catch { return []; }
    const out: Escalation[] = [];
    for (const id of ids) {
      const r = await redisCmd.get(eKey(id)); if (!r) continue;
      const e = JSON.parse(r) as Escalation;
      if (filter?.status && e.status !== filter.status) continue;
      if (filter?.toId && e.toId !== filter.toId) continue;
      if (filter?.fromAgentId && e.fromAgentId !== filter.fromAgentId) continue;
      out.push(e);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async get(id: string): Promise<Escalation | null> {
    try { const r = await redisCmd.get(eKey(id)); return r ? JSON.parse(r) as Escalation : null; } catch { return null; }
  },

  async decide(id: string, approved: boolean, deciderId: string, note?: string): Promise<Escalation | null> {
    const e = await this.get(id); if (!e || e.status !== "open") return null;
    e.status = approved ? "approved" : "denied";
    e.decidedBy = deciderId; e.decidedAt = now();
    if (note) e.decisionNote = note;
    try { await redisCmd.set(eKey(id), JSON.stringify(e)); } catch {}
    // Notify requesting agent of decision
    try {
      await CommProtocolService.send({
        from: deciderId, to: e.fromAgentId, type: "escalation",
        subject: `Escalation ${approved ? "approved" : "denied"}: ${e.reason.slice(0, 60)}`,
        payload: { escalationId: id, approved, note },
        priority: "high", correlationId: e.correlationId, metadata: { decision: approved ? "approved" : "denied" },
      });
    } catch {}
    return e;
  },

  async acknowledge(id: string, deciderId: string): Promise<Escalation | null> {
    const e = await this.get(id); if (!e || e.status !== "open") return null;
    e.status = "acknowledged"; e.decidedBy = deciderId; e.decidedAt = now();
    try { await redisCmd.set(eKey(id), JSON.stringify(e)); } catch {}
    return e;
  },

  async countOpen(): Promise<number> {
    return (await this.list({ status: "open" })).length;
  },

  async countPolicies(): Promise<number> {
    try { return await redisCmd.scard(POLICY_KEY); } catch { return 0; }
  },
};
