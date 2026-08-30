/**
 * Module 133: AI Model Governance Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides comprehensive model governance capabilities including policy management,
 * approval workflows, compliance tracking, audit trails, and governance reporting
 * to ensure models comply with organizational and regulatory requirements.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiModelGovernance');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface GovernancePolicy {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: PolicyType;
  status: PolicyStatus;
  rules: GovernanceRule[];
  scope: PolicyScope;
  enforcement: PolicyEnforcement;
  version: string;
  effectiveDate: string;
  expirationDate?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type PolicyType =
  | 'model_development'
  | 'model_deployment'
  | 'data_usage'
  | 'privacy'
  | 'fairness'
  | 'security'
  | 'compliance'
  | 'custom';

export type PolicyStatus =
  | 'draft'
  | 'active'
  | 'deprecated'
  | 'archived';

export interface GovernanceRule {
  id: string;
  name: string;
  description?: string;
  condition: RuleCondition;
  action: RuleAction;
  severity: 'info' | 'warning' | 'error' | 'critical';
  enabled: boolean;
}

export interface RuleCondition {
  type: 'metric' | 'attribute' | 'custom';
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'not_in';
  value: any;
  logicalOperator?: 'and' | 'or';
}

export interface RuleAction {
  type: 'block' | 'warn' | 'require_approval' | 'notify' | 'custom';
  configuration: Record<string, any>;
  message?: string;
}

export interface PolicyScope {
  modelTypes?: string[];
  modelTags?: string[];
  environments?: string[];
  teams?: string[];
  users?: string[];
}

export interface PolicyEnforcement {
  mode: 'strict' | 'advisory' | 'disabled';
  autoRemediation: boolean;
  notifications: boolean;
  audit: boolean;
}

export interface ApprovalWorkflow {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: WorkflowType;
  status: WorkflowStatus;
  stages: ApprovalStage[];
  configuration: WorkflowConfiguration;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type WorkflowType =
  | 'model_deployment'
  | 'model_update'
  | 'policy_exception'
  | 'data_access'
  | 'custom';

export type WorkflowStatus =
  | 'active'
  | 'paused'
  | 'disabled';

export interface ApprovalStage {
  id: string;
  name: string;
  order: number;
  approvers: Approver[];
  requiredApprovals: number;
  timeout: number; // hours
  autoApprove: boolean;
  escalationPolicy?: EscalationPolicy;
}

export interface Approver {
  type: 'user' | 'role' | 'team';
  id: string;
  name: string;
}

export interface EscalationPolicy {
  enabled: boolean;
  timeout: number; // hours
  escalateTo: Approver[];
}

export interface WorkflowConfiguration {
  parallelApprovals: boolean;
  allowDelegation: boolean;
  requireComments: boolean;
  notifications: boolean;
}

export interface ApprovalRequest {
  id: string;
  workflowId: string;
  type: WorkflowType;
  status: RequestStatus;
  requesterId: string;
  requesterName: string;
  resourceId: string;
  resourceName: string;
  currentStage: number;
  stages: StageApproval[];
  submittedAt: string;
  completedAt?: string;
  decision?: 'approved' | 'rejected';
  comments: ApprovalComment[];
}

export type RequestStatus =
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface StageApproval {
  stageId: string;
  stageName: string;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  approvals: IndividualApproval[];
  startedAt: string;
  completedAt?: string;
}

export interface IndividualApproval {
  approverId: string;
  approverName: string;
  decision: 'approved' | 'rejected' | 'pending';
  comments?: string;
  decidedAt?: string;
}

export interface ApprovalComment {
  id: string;
  userId: string;
  userName: string;
  comment: string;
  timestamp: string;
}

export interface ComplianceCheck {
  id: string;
  organizationId: string;
  modelId: string;
  modelVersion: string;
  policyId: string;
  status: 'compliant' | 'non_compliant' | 'warning';
  checks: PolicyCheckResult[];
  score: number;
  violations: PolicyViolation[];
  checkedAt: string;
  nextCheckAt?: string;
}

export interface PolicyCheckResult {
  ruleId: string;
  ruleName: string;
  status: 'passed' | 'failed' | 'warning';
  message?: string;
  details?: any;
}

export interface PolicyViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  description: string;
  remediation?: string;
  detectedAt: string;
  resolvedAt?: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  type: AuditType;
  action: string;
  resourceId: string;
  resourceName: string;
  userId: string;
  userName: string;
  timestamp: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export type AuditType =
  | 'model'
  | 'policy'
  | 'approval'
  | 'compliance'
  | 'user'
  | 'system';

export interface GovernanceReport {
  id: string;
  organizationId: string;
  type: 'summary' | 'detailed' | 'compliance' | 'executive';
  title: string;
  executiveSummary: string;
  policies: GovernancePolicy[];
  complianceChecks: ComplianceCheck[];
  violations: PolicyViolation[];
  auditLogs: AuditLog[];
  metrics: GovernanceMetrics;
  recommendations: GovernanceRecommendation[];
  appendices: ReportAppendix[];
  generatedAt: string;
  generatedBy: string;
}

export interface GovernanceMetrics {
  totalPolicies: number;
  activePolicies: number;
  complianceRate: number;
  totalViolations: number;
  criticalViolations: number;
  averageResolutionTime: number; // hours
  pendingApprovals: number;
  averageApprovalTime: number; // hours
}

export interface GovernanceRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'policy' | 'compliance' | 'process' | 'training';
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  actionItems: string[];
}

export interface ReportAppendix {
  title: string;
  content: string;
  data?: any;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const governancePolicies = new Map<string, GovernancePolicy>();
const approvalWorkflows = new Map<string, ApprovalWorkflow>();
const approvalRequests = new Map<string, ApprovalRequest>();
const complianceChecks = new Map<string, ComplianceCheck[]>();
const auditLogs = new Map<string, AuditLog[]>();
const governanceReports = new Map<string, GovernanceReport>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createGovernancePolicy(params: {
  organizationId: string;
  name: string;
  description?: string;
  type: PolicyType;
  rules: Omit<GovernanceRule, 'id'>[];
  scope?: PolicyScope;
  enforcement?: PolicyEnforcement;
  effectiveDate: string;
  expirationDate?: string;
  createdBy: string;
}): GovernancePolicy {
  const now = new Date().toISOString();
  const id = randomUUID();

  const policy: GovernancePolicy = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    type: params.type,
    status: 'active',
    rules: params.rules.map(r => ({ ...r, id: randomUUID() })),
    scope: params.scope || {},
    enforcement: params.enforcement || {
      mode: 'strict',
      autoRemediation: false,
      notifications: true,
      audit: true,
    },
    version: '1.0',
    effectiveDate: params.effectiveDate,
    expirationDate: params.expirationDate,
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  governancePolicies.set(id, policy);

  // Create audit log
  createAuditLog({
    organizationId: params.organizationId,
    type: 'policy',
    action: 'created',
    resourceId: id,
    resourceName: params.name,
    userId: params.createdBy,
    userName: 'User',
    details: { policyType: params.type },
  });

  return policy;
}

export function getGovernancePolicy(id: string): GovernancePolicy | undefined {
  return governancePolicies.get(id);
}

export function listGovernancePolicies(
  organizationId: string,
  filters?: { type?: PolicyType; status?: PolicyStatus }
): GovernancePolicy[] {
  let result = Array.from(governancePolicies.values()).filter(
    p => p.organizationId === organizationId
  );

  if (filters?.type) result = result.filter(p => p.type === filters.type);
  if (filters?.status) result = result.filter(p => p.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateGovernancePolicy(
  policyId: string,
  updates: Partial<GovernancePolicy>,
  updatedBy: string
): GovernancePolicy {
  const policy = governancePolicies.get(policyId);
  if (!policy) throw new Error(`Policy ${policyId} not found`);

  Object.assign(policy, updates);
  policy.updatedAt = new Date().toISOString();

  // Create audit log
  createAuditLog({
    organizationId: policy.organizationId,
    type: 'policy',
    action: 'updated',
    resourceId: policyId,
    resourceName: policy.name,
    userId: updatedBy,
    userName: 'User',
    details: { updates: Object.keys(updates) },
  });

  return policy;
}

export function createApprovalWorkflow(params: {
  organizationId: string;
  name: string;
  description?: string;
  type: WorkflowType;
  stages: Omit<ApprovalStage, 'id'>[];
  configuration?: WorkflowConfiguration;
  createdBy: string;
}): ApprovalWorkflow {
  const now = new Date().toISOString();
  const id = randomUUID();

  const workflow: ApprovalWorkflow = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    type: params.type,
    status: 'active',
    stages: params.stages.map(s => ({ ...s, id: randomUUID() })),
    configuration: params.configuration || {
      parallelApprovals: false,
      allowDelegation: true,
      requireComments: false,
      notifications: true,
    },
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  approvalWorkflows.set(id, workflow);
  return workflow;
}

export function getApprovalWorkflow(id: string): ApprovalWorkflow | undefined {
  return approvalWorkflows.get(id);
}

export function listApprovalWorkflows(
  organizationId: string,
  filters?: { type?: WorkflowType; status?: WorkflowStatus }
): ApprovalWorkflow[] {
  let result = Array.from(approvalWorkflows.values()).filter(
    w => w.organizationId === organizationId
  );

  if (filters?.type) result = result.filter(w => w.type === filters.type);
  if (filters?.status) result = result.filter(w => w.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function submitApprovalRequest(params: {
  workflowId: string;
  requesterId: string;
  requesterName: string;
  resourceId: string;
  resourceName: string;
}): ApprovalRequest {
  const workflow = approvalWorkflows.get(params.workflowId);
  if (!workflow) throw new Error(`Workflow ${params.workflowId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const stages: StageApproval[] = workflow.stages.map(stage => ({
    stageId: stage.id,
    stageName: stage.name,
    status: 'pending',
    approvals: stage.approvers.map(approver => ({
      approverId: approver.id,
      approverName: approver.name,
      decision: 'pending',
    })),
    startedAt: now,
  }));

  const request: ApprovalRequest = {
    id,
    workflowId: params.workflowId,
    type: workflow.type,
    status: 'in_review',
    requesterId: params.requesterId,
    requesterName: params.requesterName,
    resourceId: params.resourceId,
    resourceName: params.resourceName,
    currentStage: 0,
    stages,
    submittedAt: now,
    comments: [],
  };

  approvalRequests.set(id, request);

  // Create audit log
  createAuditLog({
    organizationId: workflow.organizationId,
    type: 'approval',
    action: 'submitted',
    resourceId: params.resourceId,
    resourceName: params.resourceName,
    userId: params.requesterId,
    userName: params.requesterName,
    details: { workflowId: params.workflowId, requestId: id },
  });

  return request;
}

export function approveRequest(
  requestId: string,
  approverId: string,
  approverName: string,
  comments?: string
): ApprovalRequest {
  const request = approvalRequests.get(requestId);
  if (!request) throw new Error(`Request ${requestId} not found`);

  const currentStage = request.stages[request.currentStage];
  if (!currentStage) throw new Error('No current stage');

  const approval = currentStage.approvals.find(a => a.approverId === approverId);
  if (!approval) throw new Error('Approver not found in current stage');

  approval.decision = 'approved';
  approval.comments = comments;
  approval.decidedAt = new Date().toISOString();

  if (comments) {
    request.comments.push({
      id: randomUUID(),
      userId: approverId,
      userName: approverName,
      comment: comments,
      timestamp: new Date().toISOString(),
    });
  }

  // Check if stage is complete
  const approvedCount = currentStage.approvals.filter(a => a.decision === 'approved').length;
  const workflow = approvalWorkflows.get(request.workflowId);
  const stage = workflow?.stages.find(s => s.id === currentStage.stageId);

  if (stage && approvedCount >= stage.requiredApprovals) {
    currentStage.status = 'approved';
    currentStage.completedAt = new Date().toISOString();

    // Move to next stage
    if (request.currentStage < request.stages.length - 1) {
      request.currentStage++;
      request.stages[request.currentStage].status = 'pending';
      request.stages[request.currentStage].startedAt = new Date().toISOString();
    } else {
      // All stages complete
      request.status = 'approved';
      request.completedAt = new Date().toISOString();
      request.decision = 'approved';
    }
  }

  // Create audit log
  createAuditLog({
    organizationId: 'org-123',
    type: 'approval',
    action: 'approved',
    resourceId: request.resourceId,
    resourceName: request.resourceName,
    userId: approverId,
    userName: approverName,
    details: { requestId, stage: request.currentStage },
  });

  return request;
}

export function rejectRequest(
  requestId: string,
  approverId: string,
  approverName: string,
  comments: string
): ApprovalRequest {
  const request = approvalRequests.get(requestId);
  if (!request) throw new Error(`Request ${requestId} not found`);

  const currentStage = request.stages[request.currentStage];
  if (!currentStage) throw new Error('No current stage');

  const approval = currentStage.approvals.find(a => a.approverId === approverId);
  if (!approval) throw new Error('Approver not found in current stage');

  approval.decision = 'rejected';
  approval.comments = comments;
  approval.decidedAt = new Date().toISOString();

  currentStage.status = 'rejected';
  currentStage.completedAt = new Date().toISOString();

  request.status = 'rejected';
  request.completedAt = new Date().toISOString();
  request.decision = 'rejected';

  request.comments.push({
    id: randomUUID(),
    userId: approverId,
    userName: approverName,
    comment: comments,
    timestamp: new Date().toISOString(),
  });

  // Create audit log
  createAuditLog({
    organizationId: 'org-123',
    type: 'approval',
    action: 'rejected',
    resourceId: request.resourceId,
    resourceName: request.resourceName,
    userId: approverId,
    userName: approverName,
    details: { requestId, comments },
  });

  return request;
}

export function getApprovalRequest(id: string): ApprovalRequest | undefined {
  return approvalRequests.get(id);
}

export function listApprovalRequests(
  organizationId: string,
  filters?: { status?: RequestStatus; type?: WorkflowType }
): ApprovalRequest[] {
  let result = Array.from(approvalRequests.values());

  if (filters?.status) result = result.filter(r => r.status === filters.status);
  if (filters?.type) result = result.filter(r => r.type === filters.type);

  return result.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function checkCompliance(
  modelId: string,
  modelVersion: string,
  policyIds: string[]
): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];

  for (const policyId of policyIds) {
    const policy = governancePolicies.get(policyId);
    if (!policy) continue;

    const now = new Date().toISOString();
    const checkResults: PolicyCheckResult[] = [];
    const violations: PolicyViolation[] = [];

    for (const rule of policy.rules) {
      if (!rule.enabled) continue;

      // Simulate rule check
      const passed = _rng.next() > 0.2; // 80% pass rate
      const status = passed ? 'passed' : (rule.severity === 'warning' ? 'warning' : 'failed');

      checkResults.push({
        ruleId: rule.id,
        ruleName: rule.name,
        status,
        message: passed ? 'Rule passed' : `Rule failed: ${rule.action.message || 'Violation detected'}`,
      });

      if (!passed) {
        violations.push({
          id: randomUUID(),
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          description: rule.action.message || 'Policy violation detected',
          remediation: 'Review and fix the violation',
          detectedAt: now,
        });
      }
    }

    const passedCount = checkResults.filter(r => r.status === 'passed').length;
    const score = (passedCount / checkResults.length) * 100;

    const overallStatus = violations.some(v => v.severity === 'critical' || v.severity === 'error')
      ? 'non_compliant'
      : violations.some(v => v.severity === 'warning')
      ? 'warning'
      : 'compliant';

    checks.push({
      id: randomUUID(),
      organizationId: policy.organizationId,
      modelId,
      modelVersion,
      policyId,
      status: overallStatus,
      checks: checkResults,
      score,
      violations,
      checkedAt: now,
    });
  }

  const modelChecks = complianceChecks.get(modelId) || [];
  modelChecks.push(...checks);
  complianceChecks.set(modelId, modelChecks);

  return checks;
}

export function getComplianceChecks(
  modelId: string,
  filters?: { policyId?: string; status?: string }
): ComplianceCheck[] {
  let result = complianceChecks.get(modelId) || [];

  if (filters?.policyId) result = result.filter(c => c.policyId === filters.policyId);
  if (filters?.status) result = result.filter(c => c.status === filters.status);

  return result.sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
}

function createAuditLog(params: {
  organizationId: string;
  type: AuditType;
  action: string;
  resourceId: string;
  resourceName: string;
  userId: string;
  userName: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}): void {
  const now = new Date().toISOString();
  const log: AuditLog = {
    id: randomUUID(),
    ...params,
    timestamp: now,
  };

  const logs = auditLogs.get(params.organizationId) || [];
  logs.push(log);

  // Keep only last 1000 logs
  if (logs.length > 1000) {
    auditLogs.set(params.organizationId, logs.slice(-1000));
  } else {
    auditLogs.set(params.organizationId, logs);
  }
}

export function getAuditLogs(
  organizationId: string,
  filters?: { type?: AuditType; action?: string; userId?: string; limit?: number }
): AuditLog[] {
  let result = auditLogs.get(organizationId) || [];

  if (filters?.type) result = result.filter(l => l.type === filters.type);
  if (filters?.action) result = result.filter(l => l.action === filters.action);
  if (filters?.userId) result = result.filter(l => l.userId === filters.userId);

  result = result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (filters?.limit) {
    result = result.slice(0, filters.limit);
  }

  return result;
}

export function generateGovernanceReport(
  organizationId: string,
  type: 'summary' | 'detailed' | 'compliance' | 'executive',
  generatedBy: string
): GovernanceReport {
  const now = new Date().toISOString();
  const id = randomUUID();

  const policies = Array.from(governancePolicies.values()).filter(
    p => p.organizationId === organizationId
  );

  const allChecks = Array.from(complianceChecks.values()).flat().filter(
    c => c.organizationId === organizationId
  );

  const allViolations = allChecks.flatMap(c => c.violations);
  const logs = auditLogs.get(organizationId) || [];

  const executiveSummary = `Governance report with ${policies.length} policies and ${allChecks.length} compliance checks. ` +
    `${allViolations.length} violations detected.`;

  const metrics: GovernanceMetrics = {
    totalPolicies: policies.length,
    activePolicies: policies.filter(p => p.status === 'active').length,
    complianceRate: allChecks.length > 0
      ? (allChecks.filter(c => c.status === 'compliant').length / allChecks.length) * 100
      : 0,
    totalViolations: allViolations.length,
    criticalViolations: allViolations.filter(v => v.severity === 'critical').length,
    averageResolutionTime: 24, // Simulated
    pendingApprovals: Array.from(approvalRequests.values()).filter(r => r.status === 'in_review').length,
    averageApprovalTime: 48, // Simulated
  };

  const recommendations: GovernanceRecommendation[] = [];

  if (metrics.complianceRate < 90) {
    recommendations.push({
      id: randomUUID(),
      priority: 'high',
      category: 'compliance',
      title: 'Improve compliance rate',
      description: `Current compliance rate is ${metrics.complianceRate.toFixed(1)}%`,
      impact: 'Improved regulatory compliance',
      effort: 'medium',
      actionItems: ['Review and fix policy violations'],
    });
  }

  if (metrics.criticalViolations > 0) {
    recommendations.push({
      id: randomUUID(),
      priority: 'critical',
      category: 'compliance',
      title: 'Address critical violations',
      description: `${metrics.criticalViolations} critical violations require immediate attention`,
      impact: 'Reduced risk and improved compliance',
      effort: 'high',
      actionItems: ['Resolve critical violations immediately'],
    });
  }

  const report: GovernanceReport = {
    id,
    organizationId,
    type,
    title: `${type.charAt(0).toUpperCase() + type.slice(1)} Governance Report`,
    executiveSummary,
    policies,
    complianceChecks: allChecks,
    violations: allViolations,
    auditLogs: logs.slice(-100),
    metrics,
    recommendations,
    appendices: [],
    generatedAt: now,
    generatedBy,
  };

  governanceReports.set(id, report);
  return report;
}

export function getGovernanceReport(id: string): GovernanceReport | undefined {
  return governanceReports.get(id);
}

export function listGovernanceReports(
  organizationId: string,
  filters?: { type?: string }
): GovernanceReport[] {
  let result = Array.from(governanceReports.values()).filter(
    r => r.organizationId === organizationId
  );

  if (filters?.type) result = result.filter(r => r.type === filters.type);

  return result.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export function getGovernanceDashboard(organizationId: string): {
  totalPolicies: number;
  activePolicies: number;
  complianceRate: number;
  totalViolations: number;
  criticalViolations: number;
  pendingApprovals: number;
  overallHealth: 'healthy' | 'warning' | 'critical';
} {
  const policies = Array.from(governancePolicies.values()).filter(
    p => p.organizationId === organizationId
  );

  const allChecks = Array.from(complianceChecks.values()).flat().filter(
    c => c.organizationId === organizationId
  );

  const allViolations = allChecks.flatMap(c => c.violations);

  const complianceRate = allChecks.length > 0
    ? (allChecks.filter(c => c.status === 'compliant').length / allChecks.length) * 100
    : 100;

  const criticalViolations = allViolations.filter(v => v.severity === 'critical').length;
  const pendingApprovals = Array.from(approvalRequests.values()).filter(r => r.status === 'in_review').length;

  const overallHealth = criticalViolations > 0 ? 'critical'
    : complianceRate < 80 ? 'warning'
    : 'healthy';

  return {
    totalPolicies: policies.length,
    activePolicies: policies.filter(p => p.status === 'active').length,
    complianceRate,
    totalViolations: allViolations.length,
    criticalViolations,
    pendingApprovals,
    overallHealth,
  };
}
