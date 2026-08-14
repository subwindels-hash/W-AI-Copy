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

/**
 * S163 — machine-checkable rule attached to a policy.
 *
 * A policy `statement` is prose written for humans; nothing can enforce it. To
 * make a policy actually do something, it carries an optional structured rule
 * that `checkRequest` evaluates. A policy with no rule is *unenforceable* — it
 * documents an intention and is reported as such on the dashboard, rather than
 * appearing to be an active control.
 *
 * - `keyword`         — trips when the prompt/action contains any listed term.
 * - `monetary_threshold` — trips when `context.amountUsd` exceeds `maxUsd`.
 * - `requires_human`  — trips when `context.actionKind` is one of `actionKinds`
 *                       and `context.humanApproved` is not true.
 */
export const CONSTITUTION_RULE_KINDS = ["keyword", "monetary_threshold", "requires_human"] as const;
export type ConstitutionRuleKind = (typeof CONSTITUTION_RULE_KINDS)[number];

export type ConstitutionRule =
  | { kind: "keyword"; keywords: string[] }
  | { kind: "monetary_threshold"; maxUsd: number }
  | { kind: "requires_human"; actionKinds: string[] };

export interface ConstitutionPolicy {
  id: string;
  organizationId: string;
  domain: ConstitutionDomain;
  title: string;
  statement: string;
  enforcementLevel: "advisory" | "required" | "hard_block";
  status: ConstitutionPolicyStatus;
  version: number;
  /**
   * S163 — optional machine-checkable rule. Absent means the policy is prose
   * only and cannot be enforced; see `ConstitutionDashboard.unenforceablePolicies`.
   */
  rule?: ConstitutionRule;
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
  /**
   * S163 — `null` when no constitution has been published. Previously `0`,
   * which renders as a version number and is indistinguishable from a real one.
   */
  activeVersion: number | null;
  /** S163 — whether this organization's gate is enforcing or unconfigured. */
  posture: ConstitutionCheckPosture;
  totalPolicies: number;
  approvedPolicies: number;
  /**
   * S163 — approved policies carrying no machine-checkable `rule`. These are
   * documented intentions, not active controls.
   */
  unenforceablePolicies: number;
  policiesByDomain: Record<ConstitutionDomain, number>;
  violations24h: number;
  violationsBySeverity: { low: number; medium: number; high: number; critical: number };
  blockedActions24h: number;
  /**
   * S163 — `null`: nothing in the platform writes workforce coverage. Was a
   * hardcoded `0` read from a metrics field that is only ever initialised.
   */
  coveredWorkforces: number | null;
  lastApprovedAt?: string;
}

/** S163 — machine-checkable rule payload accepted on a policy. */
export const constitutionRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("keyword"), keywords: z.array(z.string().min(1)).min(1).max(50) }),
  z.object({ kind: z.literal("monetary_threshold"), maxUsd: z.number().nonnegative() }),
  z.object({ kind: z.literal("requires_human"), actionKinds: z.array(z.string().min(1)).min(1).max(50) }),
]);

export const upsertPolicySchema = z.object({
  domain: z.enum(CONSTITUTION_DOMAINS),
  title: z.string().min(2).max(200),
  statement: z.string().min(10).max(4000),
  enforcementLevel: z.enum(["advisory", "required", "hard_block"]).default("required"),
  status: z.enum(CONSTITUTION_POLICY_STATUSES).default("draft"),
  rule: constitutionRuleSchema.optional(),
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

/**
 * S163 — the posture a check was made under.
 *
 * - `enforced`     — the organization has an active constitution; the verdict
 *                    reflects its policies.
 * - `unconfigured` — the organization has published no constitution. The gate
 *                    fails **closed**: `allowed` is false and the caller must
 *                    treat the request as unreviewed, not as approved.
 * - `fail_open`    — no constitution, but `WINDELS_CONSTITUTION_FAIL_OPEN=true`
 *                    was set, so the request is allowed unchecked. Surfaced
 *                    explicitly so a permissive deployment is visible in the
 *                    payload rather than inferred from silence.
 */
export const CONSTITUTION_CHECK_POSTURES = ["enforced", "unconfigured", "fail_open"] as const;
export type ConstitutionCheckPosture = (typeof CONSTITUTION_CHECK_POSTURES)[number];

export interface CheckResult {
  allowed: boolean;
  violations: Array<{
    /**
     * S163 — `null` when a blocklist term matched a domain this organization
     * has no policy for. Previously the domain name was substituted here,
     * which reads as a policy id that does not exist.
     */
    policyId: string | null;
    domain: ConstitutionDomain;
    severity: ConstitutionViolation["severity"];
    reason: string;
    action: ConstitutionViolation["action"];
    /** S163 — true when no policy covers this domain; the match still blocks. */
    unmatchedDomain?: boolean;
  }>;
  /** S163 — `null` when no constitution is published (was a misleading `0`). */
  constitutionVersion: number | null;
  /** S163 — the basis of this verdict. */
  posture: ConstitutionCheckPosture;
  /** S163 — true when the caller must configure a constitution before relying on this gate. */
  requiresConfiguration: boolean;
  /** S163 — which rule kinds actually ran, so a caller can see what was checked. */
  evaluated: ConstitutionRuleKind[];
  /** S163 — human-readable explanation, always present for non-`enforced` postures. */
  reason?: string;
}
