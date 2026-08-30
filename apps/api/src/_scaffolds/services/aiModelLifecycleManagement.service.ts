/**
 * Module 134: AI Model Lifecycle Management Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides comprehensive model lifecycle management capabilities including lifecycle
 * stage management, transition workflows, lifecycle policies, retirement management,
 * and lifecycle reporting to manage models from creation to retirement.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ModelLifecycle {
  id: string;
  organizationId: string;
  modelId: string;
  currentStage: LifecycleStage;
  history: LifecycleEvent[];
  metadata: LifecycleMetadata;
  policies: LifecyclePolicy[];
  createdAt: string;
  updatedAt: string;
}

export type LifecycleStage =
  | 'development'
  | 'testing'
  | 'validation'
  | 'staging'
  | 'production'
  | 'deprecated'
  | 'archived'
  | 'retired';

export interface LifecycleEvent {
  id: string;
  fromStage?: LifecycleStage;
  toStage: LifecycleStage;
  timestamp: string;
  triggeredBy: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export interface LifecycleMetadata {
  createdDate: string;
  firstProductionDate?: string;
  lastUpdatedDate: string;
  retirementDate?: string;
  totalProductionTime?: number; // days
  versionHistory: string[];
  tags: string[];
}

export interface LifecyclePolicy {
  id: string;
  name: string;
  description?: string;
  stage: LifecycleStage;
  rules: LifecycleRule[];
  transitions: TransitionRule[];
  retention: RetentionPolicy;
  enabled: boolean;
}

export interface LifecycleRule {
  id: string;
  name: string;
  type: 'entry' | 'exit' | 'validation';
  condition: RuleCondition;
  action: RuleAction;
  required: boolean;
}

export interface RuleCondition {
  type: 'metric' | 'time' | 'approval' | 'custom';
  field?: string;
  operator?: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte';
  value?: any;
}

export interface RuleAction {
  type: 'block' | 'warn' | 'require_approval' | 'notify' | 'auto_transition';
  configuration: Record<string, any>;
  message?: string;
}

export interface TransitionRule {
  fromStage: LifecycleStage;
  toStage: LifecycleStage;
  conditions: RuleCondition[];
  requiredApprovals: number;
  automated: boolean;
  notifications: boolean;
}

export interface RetentionPolicy {
  stage: LifecycleStage;
  retentionDays: number;
  autoArchive: boolean;
  autoDelete: boolean;
  notifications: boolean;
}

export interface LifecycleTransition {
  id: string;
  lifecycleId: string;
  fromStage: LifecycleStage;
  toStage: LifecycleStage;
  status: TransitionStatus;
  triggeredBy: string;
  reason?: string;
  approvals: TransitionApproval[];
  validations: TransitionValidation[];
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, any>;
}

export type TransitionStatus =
  | 'pending'
  | 'in_progress'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'failed';

export interface TransitionApproval {
  id: string;
  approverId: string;
  approverName: string;
  decision: 'approved' | 'rejected' | 'pending';
  comments?: string;
  decidedAt?: string;
}

export interface TransitionValidation {
  id: string;
  name: string;
  type: string;
  status: 'passed' | 'failed' | 'pending';
  result?: any;
  validatedAt?: string;
}

export interface LifecycleReport {
  id: string;
  organizationId: string;
  type: 'summary' | 'detailed' | 'executive';
  title: string;
  executiveSummary: string;
  lifecycles: ModelLifecycle[];
  transitions: LifecycleTransition[];
  metrics: LifecycleMetrics;
  stageDistribution: StageDistribution;
  trends: LifecycleTrend[];
  recommendations: LifecycleRecommendation[];
  appendices: ReportAppendix[];
  generatedAt: string;
  generatedBy: string;
}

export interface LifecycleMetrics {
  totalModels: number;
  modelsByStage: Record<LifecycleStage, number>;
  averageTimeInStage: Record<LifecycleStage, number>;
  transitionCount: number;
  averageTransitionTime: number; // hours
  retirementRate: number; // % per month
}

export interface StageDistribution {
  development: number;
  testing: number;
  validation: number;
  staging: number;
  production: number;
  deprecated: number;
  archived: number;
  retired: number;
}

export interface LifecycleTrend {
  metric: string;
  dataPoints: TrendDataPoint[];
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercent: number;
}

export interface TrendDataPoint {
  timestamp: string;
  value: number;
}

export interface LifecycleRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'transition' | 'retirement' | 'optimization' | 'process';
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

const modelLifecycles = new Map<string, ModelLifecycle>();
const lifecycleTransitions = new Map<string, LifecycleTransition[]>();
const lifecyclePolicies = new Map<string, LifecyclePolicy>();
const lifecycleReports = new Map<string, LifecycleReport>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createModelLifecycle(params: {
  organizationId: string;
  modelId: string;
  initialStage?: LifecycleStage;
  metadata?: Partial<LifecycleMetadata>;
  policies?: LifecyclePolicy[];
}): ModelLifecycle {
  const now = new Date().toISOString();
  const id = randomUUID();

  const initialStage = params.initialStage || 'development';

  const lifecycle: ModelLifecycle = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    currentStage: initialStage,
    history: [
      {
        id: randomUUID(),
        toStage: initialStage,
        timestamp: now,
        triggeredBy: 'system',
        reason: 'Initial lifecycle creation',
      },
    ],
    metadata: {
      createdDate: now,
      lastUpdatedDate: now,
      versionHistory: [],
      tags: [],
      ...params.metadata,
    },
    policies: params.policies || [],
    createdAt: now,
    updatedAt: now,
  };

  modelLifecycles.set(id, lifecycle);
  lifecycleTransitions.set(id, []);

  return lifecycle;
}

export function getModelLifecycle(id: string): ModelLifecycle | undefined {
  return modelLifecycles.get(id);
}

export function getModelLifecycleByModelId(modelId: string): ModelLifecycle | undefined {
  return Array.from(modelLifecycles.values()).find(l => l.modelId === modelId);
}

export function listModelLifecycles(
  organizationId: string,
  filters?: { stage?: LifecycleStage; tag?: string }
): ModelLifecycle[] {
  let result = Array.from(modelLifecycles.values()).filter(
    l => l.organizationId === organizationId
  );

  if (filters?.stage) result = result.filter(l => l.currentStage === filters.stage);
  if (filters?.tag) result = result.filter(l => l.metadata.tags.includes(filters.tag!));

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function transitionModel(
  lifecycleId: string,
  toStage: LifecycleStage,
  triggeredBy: string,
  reason?: string
): LifecycleTransition {
  const lifecycle = modelLifecycles.get(lifecycleId);
  if (!lifecycle) throw new Error(`Lifecycle ${lifecycleId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const transition: LifecycleTransition = {
    id,
    lifecycleId,
    fromStage: lifecycle.currentStage,
    toStage,
    status: 'in_progress',
    triggeredBy,
    reason,
    approvals: [],
    validations: [],
    startedAt: now,
  };

  const transitions = lifecycleTransitions.get(lifecycleId) || [];
  transitions.push(transition);
  lifecycleTransitions.set(lifecycleId, transitions);

  // Check policies
  const applicablePolicies = lifecycle.policies.filter(
    p => p.stage === toStage && p.enabled
  );

  // Check transition rules
  const transitionRules = applicablePolicies.flatMap(p => p.transitions).filter(
    t => t.fromStage === lifecycle.currentStage && t.toStage === toStage
  );

  if (transitionRules.length > 0) {
    const rule = transitionRules[0];

    // Check if approvals are required
    if (rule.requiredApprovals > 0) {
      transition.status = 'pending';
      // Would create approval requests here
    }

    // Run validations
    for (const condition of rule.conditions) {
      const validation: TransitionValidation = {
        id: randomUUID(),
        name: `${condition.type} validation`,
        type: condition.type,
        status: 'passed', // Simulated
        validatedAt: now,
      };
      transition.validations.push(validation);
    }

    if (rule.automated && transition.validations.every(v => v.status === 'passed')) {
      // Auto-complete transition
      completeTransition(lifecycleId, transition.id);
    }
  } else {
    // No rules, complete immediately
    completeTransition(lifecycleId, transition.id);
  }

  return transition;
}

function completeTransition(lifecycleId: string, transitionId: string): void {
  const lifecycle = modelLifecycles.get(lifecycleId);
  if (!lifecycle) return;

  const transitions = lifecycleTransitions.get(lifecycleId) || [];
  const transition = transitions.find(t => t.id === transitionId);
  if (!transition) return;

  const now = new Date().toISOString();

  transition.status = 'completed';
  transition.completedAt = now;

  // Update lifecycle
  const fromStage = lifecycle.currentStage;
  lifecycle.currentStage = transition.toStage;
  lifecycle.history.push({
    id: randomUUID(),
    fromStage,
    toStage: transition.toStage,
    timestamp: now,
    triggeredBy: transition.triggeredBy,
    reason: transition.reason,
  });

  lifecycle.metadata.lastUpdatedDate = now;

  // Update stage-specific metadata
  if (transition.toStage === 'production' && !lifecycle.metadata.firstProductionDate) {
    lifecycle.metadata.firstProductionDate = now;
  }

  if (transition.toStage === 'retired') {
    lifecycle.metadata.retirementDate = now;
    if (lifecycle.metadata.firstProductionDate) {
      const productionTime = (new Date(now).getTime() - new Date(lifecycle.metadata.firstProductionDate).getTime()) / (1000 * 60 * 60 * 24);
      lifecycle.metadata.totalProductionTime = productionTime;
    }
  }

  lifecycle.updatedAt = now;
}

export function getLifecycleTransition(
  lifecycleId: string,
  transitionId: string
): LifecycleTransition | undefined {
  const transitions = lifecycleTransitions.get(lifecycleId) || [];
  return transitions.find(t => t.id === transitionId);
}

export function listLifecycleTransitions(
  lifecycleId: string,
  filters?: { status?: TransitionStatus }
): LifecycleTransition[] {
  let result = lifecycleTransitions.get(lifecycleId) || [];

  if (filters?.status) result = result.filter(t => t.status === filters.status);

  return result.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function approveTransition(
  lifecycleId: string,
  transitionId: string,
  approverId: string,
  approverName: string,
  comments?: string
): LifecycleTransition {
  const transitions = lifecycleTransitions.get(lifecycleId) || [];
  const transition = transitions.find(t => t.id === transitionId);
  if (!transition) throw new Error(`Transition ${transitionId} not found`);

  const approval: TransitionApproval = {
    id: randomUUID(),
    approverId,
    approverName,
    decision: 'approved',
    comments,
    decidedAt: new Date().toISOString(),
  };

  transition.approvals.push(approval);

  // Check if all approvals are complete
  const lifecycle = modelLifecycles.get(lifecycleId);
  if (lifecycle) {
    const transitionRules = lifecycle.policies
      .flatMap(p => p.transitions)
      .filter(t => t.fromStage === transition.fromStage && t.toStage === transition.toStage);

    if (transitionRules.length > 0) {
      const rule = transitionRules[0];
      const approvedCount = transition.approvals.filter(a => a.decision === 'approved').length;

      if (approvedCount >= rule.requiredApprovals) {
        transition.status = 'approved';
        completeTransition(lifecycleId, transitionId);
      }
    }
  }

  return transition;
}

export function rejectTransition(
  lifecycleId: string,
  transitionId: string,
  approverId: string,
  approverName: string,
  comments: string
): LifecycleTransition {
  const transitions = lifecycleTransitions.get(lifecycleId) || [];
  const transition = transitions.find(t => t.id === transitionId);
  if (!transition) throw new Error(`Transition ${transitionId} not found`);

  const approval: TransitionApproval = {
    id: randomUUID(),
    approverId,
    approverName,
    decision: 'rejected',
    comments,
    decidedAt: new Date().toISOString(),
  };

  transition.approvals.push(approval);
  transition.status = 'rejected';
  transition.completedAt = new Date().toISOString();

  return transition;
}

export function createLifecyclePolicy(params: {
  name: string;
  description?: string;
  stage: LifecycleStage;
  rules?: Omit<LifecycleRule, 'id'>[];
  transitions?: Omit<TransitionRule, 'id'>[];
  retention?: RetentionPolicy;
}): LifecyclePolicy {
  const id = randomUUID();

  const policy: LifecyclePolicy = {
    id,
    name: params.name,
    description: params.description,
    stage: params.stage,
    rules: params.rules?.map(r => ({ ...r, id: randomUUID() })) || [],
    transitions: params.transitions || [],
    retention: params.retention || {
      stage: params.stage,
      retentionDays: 365,
      autoArchive: false,
      autoDelete: false,
      notifications: true,
    },
    enabled: true,
  };

  lifecyclePolicies.set(id, policy);
  return policy;
}

export function getLifecyclePolicy(id: string): LifecyclePolicy | undefined {
  return lifecyclePolicies.get(id);
}

export function listLifecyclePolicies(
  filters?: { stage?: LifecycleStage; enabled?: boolean }
): LifecyclePolicy[] {
  let result = Array.from(lifecyclePolicies.values());

  if (filters?.stage) result = result.filter(p => p.stage === filters.stage);
  if (filters?.enabled !== undefined) result = result.filter(p => p.enabled === filters.enabled);

  return result;
}

export function generateLifecycleReport(
  organizationId: string,
  type: 'summary' | 'detailed' | 'executive',
  generatedBy: string
): LifecycleReport {
  const now = new Date().toISOString();
  const id = randomUUID();

  const lifecycles = Array.from(modelLifecycles.values()).filter(
    l => l.organizationId === organizationId
  );

  const allTransitions = lifecycles.flatMap(l => lifecycleTransitions.get(l.id) || []);

  const executiveSummary = `Lifecycle management report with ${lifecycles.length} models tracked. ` +
    `${allTransitions.length} transitions recorded.`;

  const modelsByStage: Record<LifecycleStage, number> = {
    development: 0,
    testing: 0,
    validation: 0,
    staging: 0,
    production: 0,
    deprecated: 0,
    archived: 0,
    retired: 0,
  };

  for (const lifecycle of lifecycles) {
    modelsByStage[lifecycle.currentStage]++;
  }

  const metrics: LifecycleMetrics = {
    totalModels: lifecycles.length,
    modelsByStage,
    averageTimeInStage: {
      development: 30,
      testing: 14,
      validation: 7,
      staging: 7,
      production: 365,
      deprecated: 90,
      archived: 365,
      retired: 0,
    },
    transitionCount: allTransitions.length,
    averageTransitionTime: 24, // hours
    retirementRate: 5, // % per month
  };

  const stageDistribution: StageDistribution = modelsByStage;

  const trends: LifecycleTrend[] = [
    {
      metric: 'Production Models',
      dataPoints: [
        { timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), value: modelsByStage.production - 2 },
        { timestamp: now, value: modelsByStage.production },
      ],
      trend: 'increasing',
      changePercent: 10,
    },
  ];

  const recommendations: LifecycleRecommendation[] = [];

  if (modelsByStage.deprecated > 0) {
    recommendations.push({
      id: randomUUID(),
      priority: 'medium',
      category: 'retirement',
      title: 'Retire deprecated models',
      description: `${modelsByStage.deprecated} models are deprecated and should be retired`,
      impact: 'Reduced maintenance overhead',
      effort: 'medium',
      actionItems: ['Review and retire deprecated models'],
    });
  }

  const report: LifecycleReport = {
    id,
    organizationId,
    type,
    title: `${type.charAt(0).toUpperCase() + type.slice(1)} Lifecycle Report`,
    executiveSummary,
    lifecycles,
    transitions: allTransitions,
    metrics,
    stageDistribution,
    trends,
    recommendations,
    appendices: [],
    generatedAt: now,
    generatedBy,
  };

  lifecycleReports.set(id, report);
  return report;
}

export function getLifecycleReport(id: string): LifecycleReport | undefined {
  return lifecycleReports.get(id);
}

export function listLifecycleReports(
  organizationId: string,
  filters?: { type?: string }
): LifecycleReport[] {
  let result = Array.from(lifecycleReports.values()).filter(
    r => r.organizationId === organizationId
  );

  if (filters?.type) result = result.filter(r => r.type === filters.type);

  return result.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export function getLifecycleDashboard(organizationId: string): {
  totalModels: number;
  modelsByStage: Record<LifecycleStage, number>;
  recentTransitions: number;
  averageTransitionTime: number;
  overallHealth: 'healthy' | 'warning' | 'critical';
} {
  const lifecycles = Array.from(modelLifecycles.values()).filter(
    l => l.organizationId === organizationId
  );

  const modelsByStage: Record<LifecycleStage, number> = {
    development: 0,
    testing: 0,
    validation: 0,
    staging: 0,
    production: 0,
    deprecated: 0,
    archived: 0,
    retired: 0,
  };

  for (const lifecycle of lifecycles) {
    modelsByStage[lifecycle.currentStage]++;
  }

  const allTransitions = lifecycles.flatMap(l => lifecycleTransitions.get(l.id) || []);
  const recentTransitions = allTransitions.filter(t => {
    const daysAgo = (Date.now() - new Date(t.startedAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysAgo <= 30;
  }).length;

  const overallHealth = modelsByStage.deprecated > 5 ? 'warning'
    : modelsByStage.production === 0 ? 'critical'
    : 'healthy';

  return {
    totalModels: lifecycles.length,
    modelsByStage,
    recentTransitions,
    averageTransitionTime: 24,
    overallHealth,
  };
}
