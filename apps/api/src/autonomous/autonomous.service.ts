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
  async dashboard(oid: string): Promise<AutonomousDashboard> { await this.ensureBootstrapped(undefined, oid); const decisions = await read(oid); const pending = decisions.filter((d) => d.status === "awaiting_human"); return { autonomyIndex: 0, decisionsToday: decisions.filter((d) => d.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length, humanOverrideRatePct: 0, governanceCompliancePct: 100, budgetsTotalUsd: 0, budgetsSpentYtdPct: 0, departmentsCount: 0, boardSeats: 0, aiExecutives: 0, decisions, departments: [], plans: [], guardrails: [{ id: "human-approval-required", policy: "No autonomous action is executed by this module. Every proposal requires an authenticated human decision.", violations30d: 0, blockedActions30d: 0 }], openApprovals: pending.length, constitutionEnforced: 1, autonomousSavings30dUsd: 0 } as AutonomousDashboard; },
};
