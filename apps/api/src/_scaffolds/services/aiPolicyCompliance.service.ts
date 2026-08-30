/**
 * Module 40: AI Policy & Compliance Service
 *
 * Manages AI governance policies, compliance frameworks (GDPR, CCPA, etc.),
 * audit trails, risk assessments, and ethical guidelines enforcement.
 *
 * Phase 1 — Critical Gap: AI governance and compliance infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiPolicyCompliance');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type PolicyStatus = "draft" | "active" | "deprecated" | "archived";

export type ComplianceFramework =
  | "gdpr"
  | "ccpa"
  | "hipaa"
  | "sox"
  | "pci-dss"
  | "iso-27001"
  | "nist-ai-rmf"
  | "eu-ai-act"
  | "custom";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type AuditAction =
  | "model_created"
  | "model_updated"
  | "model_deployed"
  | "model_retired"
  | "policy_violation"
  | "bias_detected"
  | "fairness_issue"
  | "data_breach"
  | "access_granted"
  | "access_revoked"
  | "compliance_check"
  | "risk_assessment"
  | "custom";

export interface AIGovernancePolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  category: "fairness" | "transparency" | "privacy" | "security" | "accountability" | "safety" | "custom";
  status: PolicyStatus;
  rules: PolicyRule[];
  complianceFrameworks: ComplianceFramework[];
  enforcementLevel: "advisory" | "mandatory" | "blocking";
  effectiveDate: string;
  expirationDate?: string;
  version: string;
  approvedBy?: string;
  approvedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  action: "warn" | "block" | "require_approval" | "log" | "notify";
  severity: RiskLevel;
  parameters?: Record<string, unknown>;
  enabled: boolean;
}

export interface ComplianceCheck {
  id: string;
  organizationId: string;
  policyId: string;
  policyName: string;
  framework: ComplianceFramework;
  status: "passed" | "failed" | "warning" | "pending";
  violations: ComplianceViolation[];
  checkedAt: string;
  checkedBy: string;
  nextCheckAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ComplianceViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: RiskLevel;
  description: string;
  affectedResource?: string;
  remediation?: string;
  status: "open" | "in_progress" | "resolved" | "accepted";
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  action: AuditAction;
  resourceType: "model" | "dataset" | "policy" | "user" | "system" | "custom";
  resourceId: string;
  resourceName?: string;
  actor: string;
  actorType: "user" | "system" | "api";
  timestamp: string;
  details: Record<string, unknown>;
  riskLevel?: RiskLevel;
  policyViolations?: string[];
  ipAddress?: string;
  userAgent?: string;
}

export interface RiskAssessment {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  modelId?: string;
  modelVersion?: string;
  overallRisk: RiskLevel;
  riskScore: number; // 0-100
  categories: RiskCategory[];
  mitigations: RiskMitigation[];
  assessedBy: string;
  assessedAt: string;
  nextReviewAt?: string;
  status: "draft" | "completed" | "approved" | "rejected";
  approvedBy?: string;
  approvedAt?: string;
}

export interface RiskCategory {
  name: string;
  riskLevel: RiskLevel;
  score: number;
  factors: string[];
  mitigations?: string[];
}

export interface RiskMitigation {
  id: string;
  description: string;
  riskCategory: string;
  effectiveness: "low" | "medium" | "high";
  status: "planned" | "in_progress" | "completed" | "deferred";
  owner?: string;
  dueDate?: string;
  completedAt?: string;
}

export interface GovernanceStats {
  totalPolicies: number;
  activePolicies: number;
  totalComplianceChecks: number;
  passedChecks: number;
  failedChecks: number;
  openViolations: number;
  criticalViolations: number;
  totalAudits: number;
  highRiskAudits: number;
  riskAssessments: number;
  averageRiskScore: number;
  complianceFrameworks: Record<string, number>;
  policyCategories: Record<string, number>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const policies = new Map<string, AIGovernancePolicy>();
const complianceChecks = new Map<string, ComplianceCheck>();
const auditLogs: AuditLog[] = [];
const riskAssessments = new Map<string, RiskAssessment>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create an AI governance policy
 */
export async function createPolicy(params: {
  organizationId: string;
  name: string;
  description: string;
  category: AIGovernancePolicy["category"];
  rules: Omit<PolicyRule, "id">[];
  complianceFrameworks?: ComplianceFramework[];
  enforcementLevel?: AIGovernancePolicy["enforcementLevel"];
  effectiveDate?: string;
  expirationDate?: string;
  createdBy: string;
}): Promise<AIGovernancePolicy> {
  const now = new Date().toISOString();

  const policy: AIGovernancePolicy = {
    id: `policy_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    category: params.category,
    status: "draft",
    rules: params.rules.map(r => ({
      ...r,
      id: `rule_${randomUUID().slice(0, 8)}`,
    })),
    complianceFrameworks: params.complianceFrameworks ?? [],
    enforcementLevel: params.enforcementLevel ?? "mandatory",
    effectiveDate: params.effectiveDate ?? now,
    expirationDate: params.expirationDate,
    version: "1.0.0",
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  policies.set(policy.id, policy);
  await logAudit({
    organizationId: params.organizationId,
    action: "policy_created",
    resourceType: "policy",
    resourceId: policy.id,
    resourceName: policy.name,
    actor: params.createdBy,
    actorType: "user",
    details: { category: policy.category, rules: policy.rules.length },
  });

  return policy;
}

/**
 * Get a policy by ID
 */
export async function getPolicy(policyId: string): Promise<AIGovernancePolicy | null> {
  return policies.get(policyId) ?? null;
}

/**
 * List policies for an organization
 */
export async function listPolicies(
  organizationId: string,
  filters?: {
    status?: PolicyStatus;
    category?: AIGovernancePolicy["category"];
    framework?: ComplianceFramework;
    limit?: number;
  }
): Promise<AIGovernancePolicy[]> {
  let result = Array.from(policies.values()).filter(
    p => p.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(p => p.status === filters.status);
  if (filters?.category) result = result.filter(p => p.category === filters.category);
  if (filters?.framework) result = result.filter(p => p.complianceFrameworks.includes(filters.framework!));

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Approve and activate a policy
 */
export async function approvePolicy(
  policyId: string,
  approvedBy: string
): Promise<AIGovernancePolicy | null> {
  const policy = policies.get(policyId);
  if (!policy) return null;

  const now = new Date().toISOString();
  policy.status = "active";
  policy.approvedBy = approvedBy;
  policy.approvedAt = now;
  policy.updatedAt = now;

  policies.set(policyId, policy);
  await logAudit({
    organizationId: policy.organizationId,
    action: "policy_updated",
    resourceType: "policy",
    resourceId: policy.id,
    resourceName: policy.name,
    actor: approvedBy,
    actorType: "user",
    details: { status: "active", approvedBy },
  });

  return policy;
}

/**
 * Update a policy
 */
export async function updatePolicy(
  policyId: string,
  updates: Partial<Pick<AIGovernancePolicy, "name" | "description" | "rules" | "enforcementLevel" | "expirationDate">>,
  updatedBy: string
): Promise<AIGovernancePolicy | null> {
  const policy = policies.get(policyId);
  if (!policy) return null;

  const now = new Date().toISOString();
  Object.assign(policy, updates);
  policy.updatedAt = now;

  // Increment version
  const versionParts = policy.version.split(".").map(Number);
  versionParts[2]++;
  policy.version = versionParts.join(".");

  policies.set(policyId, policy);
  await logAudit({
    organizationId: policy.organizationId,
    action: "policy_updated",
    resourceType: "policy",
    resourceId: policy.id,
    resourceName: policy.name,
    actor: updatedBy,
    actorType: "user",
    details: { updates: Object.keys(updates), version: policy.version },
  });

  return policy;
}

/**
 * Run compliance check against policies
 */
export async function runComplianceCheck(params: {
  organizationId: string;
  policyId: string;
  framework: ComplianceFramework;
  checkedBy: string;
  resourceId?: string;
  resourceName?: string;
  metadata?: Record<string, unknown>;
}): Promise<ComplianceCheck> {
  const policy = policies.get(params.policyId);
  if (!policy) throw new Error(`Policy ${params.policyId} not found`);

  const now = new Date().toISOString();
  const violations: ComplianceViolation[] = [];

  // Simulate compliance check
  for (const rule of policy.rules.filter(r => r.enabled)) {
    const violation = _rng.next() > 0.8; // 20% chance of violation
    if (violation) {
      violations.push({
        id: `violation_${randomUUID().slice(0, 8)}`,
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        description: `Violation of rule: ${rule.name}`,
        affectedResource: params.resourceId,
        remediation: `Review and address ${rule.name} requirements`,
        status: "open",
        detectedAt: now,
      });
    }
  }

  const status = violations.length === 0 ? "passed" : violations.some(v => v.severity === "critical") ? "failed" : "warning";

  const check: ComplianceCheck = {
    id: `check_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    policyId: params.policyId,
    policyName: policy.name,
    framework: params.framework,
    status,
    violations,
    checkedAt: now,
    checkedBy: params.checkedBy,
    nextCheckAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    metadata: params.metadata,
  };

  complianceChecks.set(check.id, check);

  await logAudit({
    organizationId: params.organizationId,
    action: "compliance_check",
    resourceType: "policy",
    resourceId: params.policyId,
    resourceName: policy.name,
    actor: params.checkedBy,
    actorType: "user",
    details: {
      framework: params.framework,
      status,
      violations: violations.length,
    },
    riskLevel: violations.some(v => v.severity === "critical") ? "critical" : violations.length > 0 ? "high" : "low",
  });

  return check;
}

/**
 * Get compliance check by ID
 */
export async function getComplianceCheck(checkId: string): Promise<ComplianceCheck | null> {
  return complianceChecks.get(checkId) ?? null;
}

/**
 * List compliance checks
 */
export async function listComplianceChecks(
  organizationId: string,
  filters?: {
    status?: ComplianceCheck["status"];
    framework?: ComplianceFramework;
    policyId?: string;
    limit?: number;
  }
): Promise<ComplianceCheck[]> {
  let result = Array.from(complianceChecks.values()).filter(
    c => c.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(c => c.status === filters.status);
  if (filters?.framework) result = result.filter(c => c.framework === filters.framework);
  if (filters?.policyId) result = result.filter(c => c.policyId === filters.policyId);

  return result
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Resolve a compliance violation
 */
export async function resolveViolation(
  checkId: string,
  violationId: string,
  resolvedBy: string
): Promise<ComplianceViolation | null> {
  const check = complianceChecks.get(checkId);
  if (!check) return null;

  const violation = check.violations.find(v => v.id === violationId);
  if (!violation) return null;

  violation.status = "resolved";
  violation.resolvedAt = new Date().toISOString();
  violation.resolvedBy = resolvedBy;

  complianceChecks.set(checkId, check);
  return violation;
}

/**
 * Log an audit event
 */
export async function logAudit(params: Omit<AuditLog, "id" | "timestamp">): Promise<AuditLog> {
  const audit: AuditLog = {
    id: `audit_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    timestamp: new Date().toISOString(),
    ...params,
  };

  auditLogs.push(audit);

  // Keep only last 10000 logs
  if (auditLogs.length > 10000) {
    auditLogs.splice(0, auditLogs.length - 10000);
  }

  return audit;
}

/**
 * Query audit logs
 */
export async function queryAuditLogs(
  organizationId: string,
  filters?: {
    action?: AuditAction;
    resourceType?: AuditLog["resourceType"];
    resourceId?: string;
    actor?: string;
    riskLevel?: RiskLevel;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }
): Promise<AuditLog[]> {
  let result = auditLogs.filter(a => a.organizationId === organizationId);

  if (filters?.action) result = result.filter(a => a.action === filters.action);
  if (filters?.resourceType) result = result.filter(a => a.resourceType === filters.resourceType);
  if (filters?.resourceId) result = result.filter(a => a.resourceId === filters.resourceId);
  if (filters?.actor) result = result.filter(a => a.actor === filters.actor);
  if (filters?.riskLevel) result = result.filter(a => a.riskLevel === filters.riskLevel);
  if (filters?.startTime) result = result.filter(a => a.timestamp >= filters.startTime!);
  if (filters?.endTime) result = result.filter(a => a.timestamp <= filters.endTime!);

  return result
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, filters?.limit ?? 100);
}

/**
 * Create a risk assessment
 */
export async function createRiskAssessment(params: {
  organizationId: string;
  name: string;
  description: string;
  modelId?: string;
  modelVersion?: string;
  categories: Omit<RiskCategory, "score">[];
  mitigations?: Omit<RiskMitigation, "id">[];
  assessedBy: string;
}): Promise<RiskAssessment> {
  const now = new Date().toISOString();

  // Calculate scores
  const categories: RiskCategory[] = params.categories.map(c => ({
    ...c,
    score: c.riskLevel === "critical" ? 90 : c.riskLevel === "high" ? 70 : c.riskLevel === "medium" ? 40 : 20,
  }));

  const overallScore = categories.reduce((sum, c) => sum + c.score, 0) / categories.length;
  const overallRisk: RiskLevel =
    overallScore >= 80 ? "critical" : overallScore >= 60 ? "high" : overallScore >= 40 ? "medium" : "low";

  const assessment: RiskAssessment = {
    id: `risk_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    overallRisk,
    riskScore: Math.round(overallScore),
    categories,
    mitigations: (params.mitigations ?? []).map(m => ({
      ...m,
      id: `mitigation_${randomUUID().slice(0, 8)}`,
    })),
    assessedBy: params.assessedBy,
    assessedAt: now,
    nextReviewAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
    status: "completed",
  };

  riskAssessments.set(assessment.id, assessment);

  await logAudit({
    organizationId: params.organizationId,
    action: "risk_assessment",
    resourceType: "model",
    resourceId: params.modelId ?? "general",
    resourceName: params.name,
    actor: params.assessedBy,
    actorType: "user",
    details: {
      overallRisk,
      riskScore: assessment.riskScore,
      categories: categories.length,
      mitigations: assessment.mitigations.length,
    },
    riskLevel: overallRisk,
  });

  return assessment;
}

/**
 * Get risk assessment by ID
 */
export async function getRiskAssessment(assessmentId: string): Promise<RiskAssessment | null> {
  return riskAssessments.get(assessmentId) ?? null;
}

/**
 * List risk assessments
 */
export async function listRiskAssessments(
  organizationId: string,
  filters?: {
    modelId?: string;
    riskLevel?: RiskLevel;
    status?: RiskAssessment["status"];
    limit?: number;
  }
): Promise<RiskAssessment[]> {
  let result = Array.from(riskAssessments.values()).filter(
    r => r.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(r => r.modelId === filters.modelId);
  if (filters?.riskLevel) result = result.filter(r => r.overallRisk === filters.riskLevel);
  if (filters?.status) result = result.filter(r => r.status === filters.status);

  return result
    .sort((a, b) => b.assessedAt.localeCompare(a.assessedAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Get governance statistics
 */
export async function getGovernanceStats(organizationId: string): Promise<GovernanceStats> {
  const orgPolicies = Array.from(policies.values()).filter(p => p.organizationId === organizationId);
  const orgChecks = Array.from(complianceChecks.values()).filter(c => c.organizationId === organizationId);
  const orgAudits = auditLogs.filter(a => a.organizationId === organizationId);
  const orgRisks = Array.from(riskAssessments.values()).filter(r => r.organizationId === organizationId);

  const complianceFrameworks: Record<string, number> = {};
  const policyCategories: Record<string, number> = {};
  let openViolations = 0;
  let criticalViolations = 0;

  for (const policy of orgPolicies) {
    policyCategories[policy.category] = (policyCategories[policy.category] || 0) + 1;
    for (const framework of policy.complianceFrameworks) {
      complianceFrameworks[framework] = (complianceFrameworks[framework] || 0) + 1;
    }
  }

  for (const check of orgChecks) {
    for (const violation of check.violations) {
      if (violation.status === "open") {
        openViolations++;
        if (violation.severity === "critical") criticalViolations++;
      }
    }
  }

  const highRiskAudits = orgAudits.filter(a => a.riskLevel === "high" || a.riskLevel === "critical").length;
  const avgRiskScore = orgRisks.length > 0
    ? orgRisks.reduce((sum, r) => sum + r.riskScore, 0) / orgRisks.length
    : 0;

  return {
    totalPolicies: orgPolicies.length,
    activePolicies: orgPolicies.filter(p => p.status === "active").length,
    totalComplianceChecks: orgChecks.length,
    passedChecks: orgChecks.filter(c => c.status === "passed").length,
    failedChecks: orgChecks.filter(c => c.status === "failed").length,
    openViolations,
    criticalViolations,
    totalAudits: orgAudits.length,
    highRiskAudits,
    riskAssessments: orgRisks.length,
    averageRiskScore: Math.round(avgRiskScore),
    complianceFrameworks,
    policyCategories,
  };
}
