/**
 * Module 63: AI Policy Enforcement Service
 *
 * Manages AI governance policies, model approval workflows, usage restrictions,
 * and ethical guidelines enforcement. Provides policy violation tracking and
 * automated policy checks for AI model deployments and usage.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AIPolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  type: PolicyType;
  rules: PolicyRule[];
  enforcementMode: 'block' | 'warn' | 'audit';
  status: 'active' | 'inactive' | 'draft';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type PolicyType =
  | 'usage-restriction'
  | 'ethical-guideline'
  | 'data-privacy'
  | 'model-approval'
  | 'deployment-restriction'
  | 'output-filtering';

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  condition: PolicyCondition;
  action: PolicyAction;
  priority: number;
}

export interface PolicyCondition {
  type: 'model-type' | 'user-role' | 'data-classification' | 'risk-level' | 'usage-pattern' | 'output-content';
  operator: 'equals' | 'contains' | 'in' | 'not-in' | 'greater-than' | 'less-than';
  value: any;
  metadata?: Record<string, any>;
}

export interface PolicyAction {
  type: 'allow' | 'deny' | 'require-approval' | 'log' | 'notify' | 'redact' | 'throttle';
  config?: Record<string, any>;
}

export interface ModelApprovalWorkflow {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  currentStage: ApprovalStage;
  stages: ApprovalStageConfig[];
  history: ApprovalHistoryEntry[];
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export type ApprovalStage =
  | 'development'
  | 'testing'
  | 'security-review'
  | 'ethics-review'
  | 'compliance-review'
  | 'approval'
  | 'deployment';

export interface ApprovalStageConfig {
  stage: ApprovalStage;
  requiredApprovers: string[];
  requiredChecks: string[];
  autoAdvance: boolean;
  timeoutHours?: number;
}

export interface ApprovalHistoryEntry {
  id: string;
  stage: ApprovalStage;
  action: 'submitted' | 'approved' | 'rejected' | 'commented' | 'advanced';
  userId: string;
  userName: string;
  comments?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface PolicyViolation {
  id: string;
  organizationId: string;
  policyId: string;
  policyName: string;
  ruleId: string;
  violationType: 'model-usage' | 'data-access' | 'output-generation' | 'deployment';
  severity: 'low' | 'medium' | 'high' | 'critical';
  context: {
    modelId?: string;
    userId?: string;
    sessionId?: string;
    input?: string;
    output?: string;
    metadata?: Record<string, any>;
  };
  action: 'blocked' | 'warned' | 'logged' | 'escalated';
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
  createdAt: string;
}

export interface PolicyCheckResult {
  policyId: string;
  policyName: string;
  passed: boolean;
  violations: PolicyViolation[];
  warnings: string[];
  recommendations: string[];
  timestamp: string;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const policies = new Map<string, AIPolicy>();
const approvalWorkflows = new Map<string, ModelApprovalWorkflow>();
const policyViolations = new Map<string, PolicyViolation>();

// ─── Policy Management ─────────────────────────────────────────────────────────

/**
 * Create a new AI policy
 */
export async function createPolicy(
  organizationId: string,
  policy: Omit<AIPolicy, 'id' | 'createdAt' | 'updatedAt'>,
  userId: string
): Promise<AIPolicy> {
  const id = `policy_${randomUUID()}`;
  const now = new Date().toISOString();

  const newPolicy: AIPolicy = {
    ...policy,
    id,
    organizationId,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  };

  policies.set(id, newPolicy);
  return newPolicy;
}

/**
 * Update an existing policy
 */
export async function updatePolicy(
  policyId: string,
  updates: Partial<Omit<AIPolicy, 'id' | 'createdAt' | 'createdBy'>>
): Promise<AIPolicy | null> {
  const policy = policies.get(policyId);
  if (!policy) return null;

  const updated: AIPolicy = {
    ...policy,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  policies.set(policyId, updated);
  return updated;
}

/**
 * Get policy by ID
 */
export async function getPolicy(policyId: string): Promise<AIPolicy | null> {
  return policies.get(policyId) || null;
}

/**
 * List policies for an organization
 */
export async function listPolicies(
  organizationId: string,
  filters?: { type?: PolicyType; status?: AIPolicy['status'] }
): Promise<AIPolicy[]> {
  const allPolicies = Array.from(policies.values()).filter(
    (p) => p.organizationId === organizationId
  );

  return allPolicies.filter((p) => {
    if (filters?.type && p.type !== filters.type) return false;
    if (filters?.status && p.status !== filters.status) return false;
    return true;
  });
}

/**
 * Delete a policy
 */
export async function deletePolicy(policyId: string): Promise<boolean> {
  return policies.delete(policyId);
}

// ─── Model Approval Workflows ──────────────────────────────────────────────────

/**
 * Create a model approval workflow
 */
export async function createApprovalWorkflow(
  organizationId: string,
  modelId: string,
  modelName: string,
  stages: ApprovalStageConfig[]
): Promise<ModelApprovalWorkflow> {
  const id = `workflow_${randomUUID()}`;
  const now = new Date().toISOString();

  const workflow: ModelApprovalWorkflow = {
    id,
    organizationId,
    modelId,
    modelName,
    currentStage: stages[0]?.stage || 'development',
    stages,
    history: [
      {
        id: `history_${randomUUID()}`,
        stage: stages[0]?.stage || 'development',
        action: 'submitted',
        userId: 'system',
        userName: 'System',
        comments: 'Model submitted for approval',
        timestamp: now,
      },
    ],
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  approvalWorkflows.set(id, workflow);
  return workflow;
}

/**
 * Advance workflow to next stage
 */
export async function advanceWorkflow(
  workflowId: string,
  userId: string,
  userName: string,
  comments?: string
): Promise<ModelApprovalWorkflow | null> {
  const workflow = approvalWorkflows.get(workflowId);
  if (!workflow) return null;

  const currentStageIndex = workflow.stages.findIndex(
    (s) => s.stage === workflow.currentStage
  );

  if (currentStageIndex === -1 || currentStageIndex >= workflow.stages.length - 1) {
    // Already at final stage
    workflow.status = 'approved';
    workflow.updatedAt = new Date().toISOString();
    approvalWorkflows.set(workflowId, workflow);
    return workflow;
  }

  const nextStage = workflow.stages[currentStageIndex + 1];

  workflow.currentStage = nextStage.stage;
  workflow.history.push({
    id: `history_${randomUUID()}`,
    stage: workflow.currentStage,
    action: 'advanced',
    userId,
    userName,
    comments,
    timestamp: new Date().toISOString(),
  });

  workflow.updatedAt = new Date().toISOString();
  approvalWorkflows.set(workflowId, workflow);

  return workflow;
}

/**
 * Approve current stage
 */
export async function approveStage(
  workflowId: string,
  userId: string,
  userName: string,
  comments?: string
): Promise<ModelApprovalWorkflow | null> {
  const workflow = approvalWorkflows.get(workflowId);
  if (!workflow) return null;

  workflow.history.push({
    id: `history_${randomUUID()}`,
    stage: workflow.currentStage,
    action: 'approved',
    userId,
    userName,
    comments,
    timestamp: new Date().toISOString(),
  });

  // Check if all required approvers have approved
  const currentStageConfig = workflow.stages.find(
    (s) => s.stage === workflow.currentStage
  );

  if (currentStageConfig?.autoAdvance) {
    return advanceWorkflow(workflowId, userId, userName, 'Auto-advanced after approval');
  }

  workflow.updatedAt = new Date().toISOString();
  approvalWorkflows.set(workflowId, workflow);

  return workflow;
}

/**
 * Reject workflow
 */
export async function rejectWorkflow(
  workflowId: string,
  userId: string,
  userName: string,
  comments: string
): Promise<ModelApprovalWorkflow | null> {
  const workflow = approvalWorkflows.get(workflowId);
  if (!workflow) return null;

  workflow.status = 'rejected';
  workflow.history.push({
    id: `history_${randomUUID()}`,
    stage: workflow.currentStage,
    action: 'rejected',
    userId,
    userName,
    comments,
    timestamp: new Date().toISOString(),
  });

  workflow.updatedAt = new Date().toISOString();
  approvalWorkflows.set(workflowId, workflow);

  return workflow;
}

/**
 * Get workflow by ID
 */
export async function getWorkflow(workflowId: string): Promise<ModelApprovalWorkflow | null> {
  return approvalWorkflows.get(workflowId) || null;
}

/**
 * List workflows for an organization
 */
export async function listWorkflows(
  organizationId: string,
  filters?: { status?: ModelApprovalWorkflow['status']; modelId?: string }
): Promise<ModelApprovalWorkflow[]> {
  const allWorkflows = Array.from(approvalWorkflows.values()).filter(
    (w) => w.organizationId === organizationId
  );

  return allWorkflows.filter((w) => {
    if (filters?.status && w.status !== filters.status) return false;
    if (filters?.modelId && w.modelId !== filters.modelId) return false;
    return true;
  });
}

// ─── Policy Enforcement ────────────────────────────────────────────────────────

/**
 * Check if an action complies with policies
 */
export async function checkPolicyCompliance(
  organizationId: string,
  context: {
    modelId?: string;
    userId?: string;
    userRole?: string;
    dataClassification?: string;
    riskLevel?: string;
    input?: string;
    output?: string;
    action: string;
  }
): Promise<PolicyCheckResult[]> {
  const activePolicies = await listPolicies(organizationId, { status: 'active' });
  const results: PolicyCheckResult[] = [];

  for (const policy of activePolicies) {
    const violations: PolicyViolation[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    for (const rule of policy.rules) {
      const conditionMet = evaluateCondition(rule.condition, context);

      if (conditionMet) {
        if (rule.action.type === 'deny' && policy.enforcementMode === 'block') {
          const violation = createViolation(
            organizationId,
            policy,
            rule,
            context,
            'blocked'
          );
          violations.push(violation);
        } else if (rule.action.type === 'deny' && policy.enforcementMode === 'warn') {
          warnings.push(`Policy violation: ${rule.name} - ${rule.description}`);
          const violation = createViolation(
            organizationId,
            policy,
            rule,
            context,
            'warned'
          );
          violations.push(violation);
        } else if (rule.action.type === 'log') {
          const violation = createViolation(
            organizationId,
            policy,
            rule,
            context,
            'logged'
          );
          violations.push(violation);
        }
      }
    }

    results.push({
      policyId: policy.id,
      policyName: policy.name,
      passed: violations.filter((v) => v.action === 'blocked').length === 0,
      violations,
      warnings,
      recommendations,
      timestamp: new Date().toISOString(),
    });
  }

  return results;
}

/**
 * Evaluate a policy condition against context
 */
function evaluateCondition(
  condition: PolicyCondition,
  context: any
): boolean {
  const contextValue = getContextValue(condition.type, context);

  switch (condition.operator) {
    case 'equals':
      return contextValue === condition.value;
    case 'contains':
      return String(contextValue).includes(String(condition.value));
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(contextValue);
    case 'not-in':
      return Array.isArray(condition.value) && !condition.value.includes(contextValue);
    case 'greater-than':
      return Number(contextValue) > Number(condition.value);
    case 'less-than':
      return Number(contextValue) < Number(condition.value);
    default:
      return false;
  }
}

/**
 * Get context value based on condition type
 */
function getContextValue(type: PolicyCondition['type'], context: any): any {
  switch (type) {
    case 'model-type':
      return context.modelType;
    case 'user-role':
      return context.userRole;
    case 'data-classification':
      return context.dataClassification;
    case 'risk-level':
      return context.riskLevel;
    case 'usage-pattern':
      return context.usagePattern;
    case 'output-content':
      return context.output;
    default:
      return undefined;
  }
}

/**
 * Create a policy violation record
 */
function createViolation(
  organizationId: string,
  policy: AIPolicy,
  rule: PolicyRule,
  context: any,
  action: PolicyViolation['action']
): PolicyViolation {
  const id = `violation_${randomUUID()}`;
  const now = new Date().toISOString();

  const violation: PolicyViolation = {
    id,
    organizationId,
    policyId: policy.id,
    policyName: policy.name,
    ruleId: rule.id,
    violationType: determineViolationType(policy.type),
    severity: determineSeverity(policy.enforcementMode, rule.action.type),
    context: {
      modelId: context.modelId,
      userId: context.userId,
      sessionId: context.sessionId,
      input: context.input,
      output: context.output,
      metadata: context.metadata,
    },
    action,
    resolved: false,
    createdAt: now,
  };

  policyViolations.set(id, violation);
  return violation;
}

/**
 * Determine violation type based on policy type
 */
function determineViolationType(policyType: PolicyType): PolicyViolation['violationType'] {
  switch (policyType) {
    case 'usage-restriction':
    case 'deployment-restriction':
      return 'model-usage';
    case 'data-privacy':
      return 'data-access';
    case 'output-filtering':
      return 'output-generation';
    default:
      return 'deployment';
  }
}

/**
 * Determine severity based on enforcement mode and action
 */
function determineSeverity(
  enforcementMode: AIPolicy['enforcementMode'],
  actionType: PolicyAction['type']
): PolicyViolation['severity'] {
  if (enforcementMode === 'block' && actionType === 'deny') return 'critical';
  if (enforcementMode === 'warn' && actionType === 'deny') return 'high';
  if (actionType === 'notify') return 'medium';
  return 'low';
}

// ─── Violation Management ──────────────────────────────────────────────────────

/**
 * Get violation by ID
 */
export async function getViolation(violationId: string): Promise<PolicyViolation | null> {
  return policyViolations.get(violationId) || null;
}

/**
 * List violations for an organization
 */
export async function listViolations(
  organizationId: string,
  filters?: {
    policyId?: string;
    severity?: PolicyViolation['severity'];
    resolved?: boolean;
  }
): Promise<PolicyViolation[]> {
  const allViolations = Array.from(policyViolations.values()).filter(
    (v) => v.organizationId === organizationId
  );

  return allViolations.filter((v) => {
    if (filters?.policyId && v.policyId !== filters.policyId) return false;
    if (filters?.severity && v.severity !== filters.severity) return false;
    if (filters?.resolved !== undefined && v.resolved !== filters.resolved) return false;
    return true;
  });
}

/**
 * Resolve a violation
 */
export async function resolveViolation(
  violationId: string,
  userId: string,
  resolutionNotes: string
): Promise<PolicyViolation | null> {
  const violation = policyViolations.get(violationId);
  if (!violation) return null;

  violation.resolved = true;
  violation.resolvedAt = new Date().toISOString();
  violation.resolvedBy = userId;
  violation.resolutionNotes = resolutionNotes;

  policyViolations.set(violationId, violation);
  return violation;
}

// ─── Statistics ────────────────────────────────────────────────────────────────

/**
 * Get governance statistics for an organization
 */
export async function getGovernanceStats(organizationId: string): Promise<{
  totalPolicies: number;
  activePolicies: number;
  totalWorkflows: number;
  pendingWorkflows: number;
  approvedWorkflows: number;
  rejectedWorkflows: number;
  totalViolations: number;
  unresolvedViolations: number;
  violationsBySeverity: Record<PolicyViolation['severity'], number>;
}> {
  const orgPolicies = await listPolicies(organizationId);
  const orgWorkflows = await listWorkflows(organizationId);
  const orgViolations = await listViolations(organizationId);

  const violationsBySeverity = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  orgViolations.forEach((v) => {
    violationsBySeverity[v.severity]++;
  });

  return {
    totalPolicies: orgPolicies.length,
    activePolicies: orgPolicies.filter((p) => p.status === 'active').length,
    totalWorkflows: orgWorkflows.length,
    pendingWorkflows: orgWorkflows.filter((w) => w.status === 'pending').length,
    approvedWorkflows: orgWorkflows.filter((w) => w.status === 'approved').length,
    rejectedWorkflows: orgWorkflows.filter((w) => w.status === 'rejected').length,
    totalViolations: orgViolations.length,
    unresolvedViolations: orgViolations.filter((v) => !v.resolved).length,
    violationsBySeverity,
  };
}
