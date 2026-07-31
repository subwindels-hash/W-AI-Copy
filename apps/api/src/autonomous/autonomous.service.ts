import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import type { AutonomousDashboard } from "@windels/shared";
import { AppError } from "../utils/result.js";

const K = { meta: (oid: string) => `aut:${oid}:meta`, decisions: (oid: string) => `aut:${oid}:decisions` };
type Decision = { id: string; title: string; department: string; recommendation: string; confidence: number; riskLevel: "low" | "med" | "high" | "critical"; estimatedImpactUsd: number; reasoning: string; status: "awaiting_human" | "approved" | "rejected"; createdAt: string; decidedAt?: string; humanApprover?: string; decisionNote?: string };
async function read(oid: string): Promise<Decision[]> { const raw = await redis.get(K.decisions(oid)); try { return raw ? JSON.parse(raw) : []; } catch { return []; } }
async function save(oid: string, items: Decision[]) { await redis.set(K.decisions(oid), JSON.stringify(items)); }

export const AutonomousService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels") { if (!(await redis.exists(K.meta(oid)))) { await redis.set(K.meta(oid), "1"); logger?.info({ msg: "[autonomous] approval register initialized", organizationId: oid }); } },
  async propose(oid: string, input: Omit<Decision, "id" | "status" | "createdAt">) { await this.ensureBootstrapped(undefined, oid); const decisions = await read(oid); const decision: Decision = { ...input, id: `decision-${randomUUID()}`, status: "awaiting_human", createdAt: new Date().toISOString() }; decisions.push(decision); await save(oid, decisions); return decision; },
  async decide(oid: string, id: string, approverId: string, approved: boolean, note?: string) { const decisions = await read(oid); const index = decisions.findIndex((d) => d.id === id); if (index < 0) throw AppError.notFound("Decision not found"); const current = decisions[index]!; if (current.status !== "awaiting_human") throw AppError.conflict("Decision has already been resolved"); const decision = { ...current, status: approved ? "approved" as const : "rejected" as const, humanApprover: approverId, decisionNote: note, decidedAt: new Date().toISOString() }; decisions[index] = decision; await save(oid, decisions); return decision; },
  /**
   * Approval register rollup.
   *
   * This module never executes autonomously — every proposal requires a human
   * decision — so `autonomyIndex` is deliberately the *human* review rate, not
   * a measure of independence. Figures with no backing store (budgets, board
   * seats, AI executives) stay 0.
   */
  async dashboard(oid: string): Promise<AutonomousDashboard> {
    await this.ensureBootstrapped(undefined, oid);
    const decisions = await read(oid);
    const pending = decisions.filter((d) => d.status === "awaiting_human");
    const resolved = decisions.filter((d) => d.status !== "awaiting_human");
    const approved = decisions.filter((d) => d.status === "approved");
    const rejected = decisions.filter((d) => d.status === "rejected");
    const today = new Date().toISOString().slice(0, 10);

    // Departments and impact are aggregated from the proposals themselves.
    const byDept = new Map<string, { proposals: number; approved: number; impactUsd: number }>();
    for (const d of decisions) {
      const e = byDept.get(d.department) ?? { proposals: 0, approved: 0, impactUsd: 0 };
      e.proposals += 1;
      if (d.status === "approved") { e.approved += 1; e.impactUsd += d.estimatedImpactUsd || 0; }
      byDept.set(d.department, e);
    }
    const approvedImpactUsd = approved.reduce((n, d) => n + (d.estimatedImpactUsd || 0), 0);

    return {
      // Share of proposals a human has actually reviewed.
      autonomyIndex: decisions.length ? Math.round((resolved.length / decisions.length) * 100) : 0,
      decisionsToday: decisions.filter((d) => d.createdAt.slice(0, 10) === today).length,
      // Rejection rate is the real "override" signal in an approval-first model.
      humanOverrideRatePct: resolved.length ? Math.round((rejected.length / resolved.length) * 100) : 0,
      governanceCompliancePct: 100,
      budgetsTotalUsd: 0, budgetsSpentYtdPct: 0,
      departmentsCount: byDept.size,
      boardSeats: 0, aiExecutives: 0,
      decisions: decisions.slice(-50).reverse(),
      // Department rows are derived from the proposals themselves. autonomyLevel
      // is fixed at "recommend": this module only ever recommends, never executes.
      departments: [...byDept.entries()].map(([name, e]) => ({
        id: `dept-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name,
        autonomyLevel: "recommend" as const,
        health: e.proposals ? Math.round((e.approved / e.proposals) * 100) : 0,
        decisionsPending: decisions.filter((d) => d.department === name && d.status === "awaiting_human").length,
        decisionsExecuted30d: e.approved,
        budgetUsd: 0,
        spendYtdUsd: 0,
        headcount: 0,
        aiAgents: 0,
      })).sort((a, b) => b.decisionsExecuted30d - a.decisionsExecuted30d),
      plans: [],
      guardrails: [{
        id: "human-approval-required",
        policy: "No autonomous action is executed by this module. Every proposal requires an authenticated human decision.",
        violations30d: 0,
        blockedActions30d: pending.length,
      }],
      openApprovals: pending.length,
      constitutionEnforced: 1,
      // Only approved proposals carry realised impact.
      autonomousSavings30dUsd: Math.round(approvedImpactUsd),
    } satisfies AutonomousDashboard;
  },
};
