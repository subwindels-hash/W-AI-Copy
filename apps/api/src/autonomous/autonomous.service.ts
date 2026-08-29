/**
 * Session 72 / 106 — Autonomous Organization approval register.
 *
 * This module is approval-first, not an autonomous executor: proposals are
 * real records, every action requires a human decision, and no plan/budget/
 * executive data is invented when the corresponding ledger does not exist.
 *
 * Keys: aut:meta:i:<org>:ledger, aut:decision:i:<org>:<id>,
 * aut:decision:idx:<org>
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import { AppError } from "../utils/result.js";
import type {
  AutDecisionCreateInput,
  AutDecisionListQuery,
  AutDecisionResolveInput,
  AutonomousDashboard,
  BoardDecision,
} from "@windels/shared/autonomous";

type DecisionRecord = BoardDecision & { organizationId: string };
type Entity = "meta" | "decision";

const K = {
  item: (entity: Entity, org: string, id: string) => `aut:${entity}:i:${org}:${id}`,
  index: (entity: Entity, org: string) => `aut:${entity}:idx:${org}`,
  legacy: (org: string) => `aut:${org}:decisions`,
};

const parse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};
const uid = () => `decision-${randomUUID()}`;

async function readOwned<T extends { organizationId: string }>(entity: Entity, org: string, id: string): Promise<T | null> {
  const value = parse<T>(await redis.hget(K.item(entity, org, id), "_doc"));
  return value && value.organizationId === org ? value : null;
}

async function writeItem(entity: Entity, org: string, value: { id: string; organizationId: string; createdAt?: string; decidedAt?: string }): Promise<void> {
  await redis.hset(K.item(entity, org, value.id), "_doc", JSON.stringify(value));
  const stamp = value.decidedAt ?? value.createdAt ?? new Date().toISOString();
  await redis.zadd(K.index(entity, org), Date.parse(stamp) || Date.now(), value.id);
}

async function ids(entity: Entity, org: string): Promise<string[]> {
  return redis.zrange(K.index(entity, org), 0, -1);
}

async function migrateLegacy(org: string): Promise<void> {
  if ((await ids("decision", org)).length > 0) return;
  const legacy = parse<Array<Partial<DecisionRecord>>>(await redis.get(K.legacy(org)));
  if (!legacy?.length) return;
  for (const old of legacy) {
    const now = old.createdAt ?? new Date().toISOString();
    const record: DecisionRecord = {
      id: old.id ?? uid(), organizationId: org,
      title: old.title ?? "Untitled proposal", department: old.department ?? "unassigned",
      recommendation: old.recommendation ?? "No recommendation recorded", confidence: old.confidence ?? 0,
      riskLevel: old.riskLevel ?? "med", estimatedImpactUsd: old.estimatedImpactUsd ?? 0,
      status: old.status ?? "awaiting_human", humanApprover: old.humanApprover,
      reasoning: old.reasoning ?? "No reasoning recorded", createdAt: now,
      decidedAt: old.decidedAt, decisionNote: old.decisionNote,
    };
    await writeItem("decision", org, record);
  }
  await redis.del(K.legacy(org));
}

async function ensureOrg(org: string, logger?: Logger): Promise<void> {
  const meta = K.item("meta", org, "ledger");
  if (!(await redis.exists(meta))) {
    await writeItem("meta", org, { id: "ledger", organizationId: org, createdAt: new Date().toISOString() });
    logger?.info?.({ msg: "[autonomous] approval register initialized", organizationId: org });
  }
  await migrateLegacy(org);
}

export const AutonomousService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels"): Promise<void> {
    await ensureOrg(oid, logger);
  },

  async propose(oid: string, input: AutDecisionCreateInput): Promise<BoardDecision> {
    await ensureOrg(oid);
    const decision: DecisionRecord = { ...input, id: uid(), organizationId: oid, status: "awaiting_human", createdAt: new Date().toISOString() };
    await writeItem("decision", oid, decision);
    return decision;
  },

  async listDecisions(oid: string, filter: AutDecisionListQuery = { limit: 50 }): Promise<BoardDecision[]> {
    await ensureOrg(oid);
    const rows: DecisionRecord[] = [];
    for (const id of await ids("decision", oid)) {
      const row = await readOwned<DecisionRecord>("decision", oid, id);
      if (row) rows.push(row);
    }
    return rows
      .filter((row) => (!filter.status || row.status === filter.status) && (!filter.department || row.department === filter.department))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, filter.limit ?? 50);
  },

  async getDecision(oid: string, id: string): Promise<BoardDecision | null> {
    await ensureOrg(oid);
    return readOwned<DecisionRecord>("decision", oid, id);
  },

  async decide(oid: string, id: string, approverId: string, inputOrApproved: AutDecisionResolveInput | boolean, legacyNote?: string): Promise<BoardDecision> {
    const input: AutDecisionResolveInput = typeof inputOrApproved === "boolean"
      ? { approved: inputOrApproved, note: legacyNote }
      : inputOrApproved;
    await ensureOrg(oid);
    const current = await readOwned<DecisionRecord>("decision", oid, id);
    if (!current) throw AppError.notFound("Decision not found");
    if (current.status !== "awaiting_human") throw AppError.conflict("Decision has already been resolved");
    const decision: DecisionRecord = {
      ...current,
      status: input.approved ? "approved" : "rejected",
      humanApprover: approverId,
      decisionNote: input.note,
      decidedAt: new Date().toISOString(),
    };
    await writeItem("decision", oid, decision);
    return decision;
  },

  async deleteDecision(oid: string, id: string): Promise<boolean> {
    await ensureOrg(oid);
    const current = await readOwned<DecisionRecord>("decision", oid, id);
    if (!current) return false;
    if (current.status !== "awaiting_human") throw AppError.conflict("Resolved decisions cannot be deleted");
    await redis.del(K.item("decision", oid, id));
    await redis.zrem(K.index("decision", oid), id);
    return true;
  },

  /**
   * Approval-register rollup. No autonomous execution is performed and no
   * budgets, board seats or savings are invented without backing ledgers.
   */
  async dashboard(oid: string): Promise<AutonomousDashboard> {
    const decisions = await this.listDecisions(oid, { limit: 100 });
    const pending = decisions.filter((decision) => decision.status === "awaiting_human");
    const resolved = decisions.filter((decision) => decision.status !== "awaiting_human");
    const approved = decisions.filter((decision) => decision.status === "approved");
    const rejected = decisions.filter((decision) => decision.status === "rejected");
    const today = new Date().toISOString().slice(0, 10);
    const since = Date.now() - 30 * 86_400_000;
    const approvedRecent = approved.filter((decision) => Date.parse(decision.decidedAt ?? decision.createdAt) >= since);
    const byDept = new Map<string, { proposals: number; approved: number; impactUsd: number }>();
    for (const decision of decisions) {
      const summary = byDept.get(decision.department) ?? { proposals: 0, approved: 0, impactUsd: 0 };
      summary.proposals += 1;
      if (decision.status === "approved") { summary.approved += 1; summary.impactUsd += decision.estimatedImpactUsd || 0; }
      byDept.set(decision.department, summary);
    }
    const approvedImpactUsd = approvedRecent.reduce((sum, decision) => sum + (decision.estimatedImpactUsd || 0), 0);
    return {
      autonomyIndex: decisions.length ? Math.round((resolved.length / decisions.length) * 100) : 0,
      decisionsToday: decisions.filter((decision) => decision.createdAt.slice(0, 10) === today).length,
      humanOverrideRatePct: resolved.length ? Math.round((rejected.length / resolved.length) * 100) : 0,
      governanceCompliancePct: decisions.length ? 100 : 0,
      budgetsTotalUsd: 0, budgetsSpentYtdPct: 0,
      departmentsCount: byDept.size,
      boardSeats: 0, aiExecutives: 0,
      decisions: decisions.slice(0, 50),
      departments: [...byDept.entries()].map(([name, summary]) => ({
        id: `dept-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name, autonomyLevel: "recommend" as const,
        health: summary.proposals ? Math.round((summary.approved / summary.proposals) * 100) : 0,
        decisionsPending: decisions.filter((decision) => decision.department === name && decision.status === "awaiting_human").length,
        decisionsExecuted30d: summary.approved,
        budgetUsd: 0, spendYtdUsd: 0, headcount: 0, aiAgents: 0,
      })).sort((a, b) => b.decisionsExecuted30d - a.decisionsExecuted30d || a.name.localeCompare(b.name)),
      plans: [],
      guardrails: [{ id: "human-approval-required", policy: "No autonomous action is executed by this module. Every proposal requires an authenticated human decision.", violations30d: 0, blockedActions30d: pending.length }],
      openApprovals: pending.length,
      constitutionEnforced: decisions.length ? 1 : 0,
      autonomousSavings30dUsd: Math.round(approvedImpactUsd),
      impactKind: approvedRecent.length ? "approved_estimate" : "none",
    };
  },
};
