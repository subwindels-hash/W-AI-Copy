/** Session 72 / 106 — Enterprise Autonomous Organization Framework */

import { z } from "zod";

export const AUTONOMY_LEVELS = ["assist", "advise", "recommend", "execute_pending", "fully_autonomous"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];
export const AUT_DECISION_RISKS = ["low", "med", "high", "critical"] as const;
export type AutDecisionRisk = (typeof AUT_DECISION_RISKS)[number];
export const AUT_DECISION_STATUSES = ["drafted", "awaiting_human", "approved", "rejected", "executing", "executed"] as const;
export type AutDecisionStatus = (typeof AUT_DECISION_STATUSES)[number];

export interface BoardDecision {
  id: string;
  title: string;
  /** Free-form: proposals arrive from any department, not a fixed list. */
  department: string;
  recommendation: string;
  confidence: number; // 0..1
  riskLevel: AutDecisionRisk;
  estimatedImpactUsd: number;
  status: AutDecisionStatus;
  humanApprover?: string;
  reasoning: string;
  createdAt: string;
  /** Set when a human resolves the proposal. */
  decidedAt?: string;
  decisionNote?: string;
}

export interface Department {
  id: string;
  name: string;
  autonomyLevel: AutonomyLevel;
  health: number;
  decisionsPending: number;
  decisionsExecuted30d: number;
  budgetUsd: number;
  spendYtdUsd: number;
  headcount: number;
  aiAgents: number;
}

export interface StrategicPlan {
  id: string;
  horizon: "quarter" | "year" | "3year" | "5year";
  objective: string;
  keyResults: Array<{ text: string; progress: number }>;
  owner: string;
  confidence: number;
  status: "draft" | "active" | "completed";
}

export interface GovernanceGuardrail {
  id: string;
  policy: string;
  violations30d: number;
  blockedActions30d: number;
  lastViolationAt?: string;
}

export interface AutonomousDashboard {
  autonomyIndex: number; // 0..100 — human review rate in approval-first mode
  decisionsToday: number;
  humanOverrideRatePct: number;
  governanceCompliancePct: number;
  budgetsTotalUsd: number;
  budgetsSpentYtdPct: number;
  departmentsCount: number;
  boardSeats: number;
  aiExecutives: number;
  decisions: BoardDecision[];
  departments: Department[];
  plans: StrategicPlan[];
  guardrails: GovernanceGuardrail[];
  openApprovals: number;
  constitutionEnforced: number;
  /** Approved estimated impact, not realized savings. */
  autonomousSavings30dUsd: number;
  impactKind: "approved_estimate" | "none";
}

export const AutDecisionCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  department: z.string().trim().min(1).max(64),
  recommendation: z.string().trim().min(1).max(10000),
  confidence: z.number().min(0).max(1),
  riskLevel: z.enum(AUT_DECISION_RISKS),
  estimatedImpactUsd: z.number().finite(),
  reasoning: z.string().trim().min(1).max(20000),
});
export type AutDecisionCreateInput = z.infer<typeof AutDecisionCreateSchema>;

export const AutDecisionResolveSchema = z.object({
  approved: z.boolean(),
  note: z.string().trim().max(2000).optional(),
});
export type AutDecisionResolveInput = z.infer<typeof AutDecisionResolveSchema>;

export const AutDecisionIdSchema = z.object({ id: z.string().min(1).max(100) });
export const AutDecisionListQuerySchema = z.object({
  status: z.enum(AUT_DECISION_STATUSES).optional(),
  department: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AutDecisionListQuery = z.infer<typeof AutDecisionListQuerySchema>;
