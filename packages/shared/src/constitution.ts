// Session 48 — Constitution Studio (V8.4 §3)
// Enterprise AI constitution: every AI Employee/Workforce inherits the approved constitution.
// Backs the Session 44.11 stub (voiceOwnership policy).

import { z } from "zod";

export const CONSTITUTION_DOMAINS = [
  "corporate_ethics",
  "decision_boundaries",
  "risk_appetite",
  "brand_standards",
  "communication_style",
  "regulatory_compliance",
  "industry_rules",
  "regional_policies",
  "escalation_requirements",
  "human_approval_rules",
  "ai_decision_limits",
] as const;
export type ConstitutionDomain = (typeof CONSTITUTION_DOMAINS)[number];

export const CONSTITUTION_POLICY_STATUSES = ["draft", "review", "approved", "archived"] as const;
export type ConstitutionPolicyStatus = (typeof CONSTITUTION_POLICY_STATUSES)[number];

export interface ConstitutionPolicy {
  id: string;
  organizationId: string;
  domain: ConstitutionDomain;
  title: string;
  statement: string;
  enforcementLevel: "advisory" | "required" | "hard_block";
  status: ConstitutionPolicyStatus;
  version: number;
  approvedBy?: string;
  approvedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Constitution {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: "draft" | "active" | "superseded";
  version: number;
  policyIds: string[];
  effectiveFrom?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConstitutionViolation {
  id: string;
  organizationId: string;
  constitutionId: string;
  policyId: string;
  domain: ConstitutionDomain;
  source: string; // agent id / employee id / request id
  summary: string;
  severity: "low" | "medium" | "high" | "critical";
  action: "logged" | "warned" | "blocked";
  at: string;
}

export interface ConstitutionDashboard {
  activeConstitutionId?: string;
  activeVersion: number;
  totalPolicies: number;
  approvedPolicies: number;
  policiesByDomain: Record<ConstitutionDomain, number>;
  violations24h: number;
  violationsBySeverity: { low: number; medium: number; high: number; critical: number };
  blockedActions24h: number;
  coveredWorkforces: number;
  lastApprovedAt?: string;
}

export const upsertPolicySchema = z.object({
  domain: z.enum(CONSTITUTION_DOMAINS),
  title: z.string().min(2).max(200),
  statement: z.string().min(10).max(4000),
  enforcementLevel: z.enum(["advisory", "required", "hard_block"]).default("required"),
  status: z.enum(CONSTITUTION_POLICY_STATUSES).default("draft"),
});

export const publishConstitutionSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  policyIds: z.array(z.string()).min(1),
});

export const checkRequestSchema = z.object({
  source: z.string(),
  promptOrAction: z.string().min(1),
  context: z.record(z.string(), z.unknown()).optional(),
});

export interface CheckResult {
  allowed: boolean;
  violations: Array<{
    policyId: string;
    domain: ConstitutionDomain;
    severity: ConstitutionViolation["severity"];
    reason: string;
    action: ConstitutionViolation["action"];
  }>;
  constitutionVersion: number;
}
