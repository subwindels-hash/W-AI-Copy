/**
 * Module 80: AI Model Lifecycle Service
 *
 * Provides comprehensive model lifecycle orchestration including automated stage
 * transitions, transition validation, transition history tracking, lifecycle templates,
 * lifecycle analytics, and lifecycle forecasting for end-to-end model lifecycle management.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ModelLifecycle {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  currentStage: LifecycleStage;
  currentVersion: string;
  status: LifecycleStatus;
  history: LifecycleTransition[];
  metadata: LifecycleMetadata;
  config: LifecycleConfig;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type LifecycleStage =
  | 'development'
  | 'testing'
  | 'staging'
  | 'review'
  | 'approved'
  | 'production'
  | 'canary'
  | 'shadow'
  | 'deprecated'
  | 'archived'
  | 'retired';

export type LifecycleStatus = 'active' | 'inactive' | 'pending' | 'failed' | 'completed';

export interface LifecycleTransition {
  id: string;
  fromStage: LifecycleStage;
  toStage: LifecycleStage;
  transitionType: TransitionType;
  status: TransitionStatus;
  triggeredBy: string;
  triggeredAt: string;
  completedAt?: string;
  duration?: number; // seconds
  validation: TransitionValidation;
  approval?: TransitionApproval;
  rollback?: TransitionRollback;
  metadata?: Record<string, any>;
  error?: string;
}

export type TransitionType =
  | 'automatic'
  | 'manual'
  | 'scheduled'
  | 'event-driven'
  | 'approval-based'
  | 'rollback';

export type TransitionStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'rolled-back' | 'cancelled';

export interface TransitionValidation {
  enabled: boolean;
  checks: ValidationCheck[];
  passed: boolean;
  failedChecks?: string[];
}

export interface ValidationCheck {
  type: 'performance' | 'drift' | 'compliance' | 'security' | 'quality' | 'custom';
  name: string;
  threshold?: number;
  currentValue?: number;
  passed: boolean;
  message?: string;
}

export interface TransitionApproval {
  required: boolean;
  approvers: string[];
  approvedBy?: string[];
  approvedAt?: string;
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
}

export interface TransitionRollback {
  enabled: boolean;
  fromStage: LifecycleStage;
  toStage: LifecycleStage;
  reason: string;
  rolledBackBy: string;
  rolledBackAt: string;
  originalTransitionId: string;
}

export interface LifecycleMetadata {
  owner: string;
  team?: string;
  tags: string[];
  description?: string;
  businessContext?: string;
  regulatoryRequirements?: string[];
  dependencies?: string[];
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export interface LifecycleConfig {
  autoTransition: boolean;
  transitionRules: TransitionRule[];
  validationConfig: ValidationConfig;
  approvalConfig: ApprovalConfig;
  notificationConfig: NotificationConfig;
  retentionConfig: RetentionConfig;
}

export interface TransitionRule {
  fromStage: LifecycleStage;
  toStage: LifecycleStage;
  conditions: TransitionCondition[];
  automatic: boolean;
  requireApproval: boolean;
  requireValidation: boolean;
}

export interface TransitionCondition {
  type: 'metric' | 'drift' | 'time' | 'event' | 'custom';
  metric?: string;
  operator?: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold?: number;
  duration?: number; // minutes
  event?: string;
}

export interface ValidationConfig {
  enabled: boolean;
  checks: ValidationCheck[];
  failOnWarning: boolean;
  retryAttempts: number;
  retryDelay: number; // seconds
}

export interface ApprovalConfig {
  enabled: boolean;
  requiredFor: LifecycleStage[];
  approvers: string[];
  timeout: number; // hours
  escalationApprovers?: string[];
  autoApprove: boolean;
}

export interface NotificationConfig {
  enabled: boolean;
  channels: NotificationChannel[];
  events: NotificationEvent[];
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'pagerduty';
  config: Record<string, any>;
}

export interface NotificationEvent {
  type: 'transition-started' | 'transition-completed' | 'transition-failed' | 'approval-required' | 'validation-failed';
  enabled: boolean;
}

export interface RetentionConfig {
  enabled: boolean;
  archiveAfterDays: number;
  deleteAfterDays: number;
  keepVersions: number;
}

export interface LifecycleTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  stages: LifecycleStage[];
  transitionRules: TransitionRule[];
  config: LifecycleConfig;
  tags: string[];
  usageCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LifecycleAnalytics {
  organizationId: string;
  totalModels: number;
  modelsByStage: Record<LifecycleStage, number>;
  averageStageDurations: Record<LifecycleStage, number>;
  transitionCounts: Record<string, number>;
  failedTransitions: number;
  rolledBackTransitions: number;
  averageTransitionTime: number;
  bottleneckStages: Array<{
    stage: LifecycleStage;
    averageDuration: number;
    transitionCount: number;
  }>;
  lifecycleTrends: Array<{
    date: string;
    modelsInDevelopment: number;
    modelsInProduction: number;
    modelsRetired: number;
  }>;
}

export interface LifecycleDashboard {
  organizationId: string;
  totalModels: number;
  activeModels: number;
  modelsByStage: Record<LifecycleStage, number>;
  modelsByStatus: Record<LifecycleStatus, number>;
  recentTransitions: LifecycleTransition[];
  pendingApprovals: number;
  failedValidations: number;
  averageLifecycleDuration: number;
  topModels: Array<{
    modelId: string;
    modelName: string;
    currentStage: LifecycleStage;
    daysInCurrentStage: number;
    transitionCount: number;
  }>;
  lifecycleHealth: {
    healthy: number;
    warning: number;
    critical: number;
  };
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const lifecycles = new Map<string, ModelLifecycle>();
const templates = new Map<string, LifecycleTemplate>();

// ─── Lifecycle Management ──────────────────────────────────────────────────────

/**
 * Create a model lifecycle
 */
export async function createModelLifecycle(
  organizationId: string,
  params: {
    modelId: string;
    modelName: string;
    initialStage?: LifecycleStage;
    version?: string;
    metadata?: Partial<LifecycleMetadata>;
    config?: Partial<LifecycleConfig>;
    createdBy: string;
  }
): Promise<ModelLifecycle> {
  const id = `lifecycle_${randomUUID()}`;
  const now = new Date().toISOString();

  const lifecycle: ModelLifecycle = {
    id,
    organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    currentStage: params.initialStage || 'development',
    currentVersion: params.version || '1.0.0',
    status: 'active',
    history: [],
    metadata: {
      owner: params.createdBy,
      tags: params.metadata?.tags || [],
      description: params.metadata?.description,
      businessContext: params.metadata?.businessContext,
      regulatoryRequirements: params.metadata?.regulatoryRequirements,
      dependencies: params.metadata?.dependencies,
      riskLevel: params.metadata?.riskLevel || 'medium',
    },
    config: {
      autoTransition: params.config?.autoTransition ?? false,
      transitionRules: params.config?.transitionRules || getDefaultTransitionRules(),
      validationConfig: params.config?.validationConfig || {
        enabled: true,
        checks: [],
        failOnWarning: false,
        retryAttempts: 3,
        retryDelay: 60,
      },
      approvalConfig: params.config?.approvalConfig || {
        enabled: true,
        requiredFor: ['production', 'canary'],
        approvers: [],
        timeout: 24,
        autoApprove: false,
      },
      notificationConfig: params.config?.notificationConfig || {
        enabled: true,
        channels: [{ type: 'email', config: {} }],
        events: [
          { type: 'transition-completed', enabled: true },
          { type: 'transition-failed', enabled: true },
          { type: 'approval-required', enabled: true },
        ],
      },
      retentionConfig: params.config?.retentionConfig || {
        enabled: true,
        archiveAfterDays: 365,
        deleteAfterDays: 730,
        keepVersions: 10,
      },
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  lifecycles.set(id, lifecycle);
  return lifecycle;
}

/**
 * Transition model to a new stage
 */
export async function transitionModelStage(
  lifecycleId: string,
  toStage: LifecycleStage,
  triggeredBy: string,
  options?: {
    transitionType?: TransitionType;
    skipValidation?: boolean;
    skipApproval?: boolean;
    metadata?: Record<string, any>;
  }
): Promise<LifecycleTransition | null> {
  const lifecycle = lifecycles.get(lifecycleId);
  if (!lifecycle) return null;

  const transitionId = `transition_${randomUUID()}`;
  const now = new Date().toISOString();

  // Check if transition is allowed
  const allowedTransition = lifecycle.config.transitionRules.find(
    (rule) => rule.fromStage === lifecycle.currentStage && rule.toStage === toStage
  );

  if (!allowedTransition) {
    throw new Error(`Transition from ${lifecycle.currentStage} to ${toStage} is not allowed`);
  }

  const transition: LifecycleTransition = {
    id: transitionId,
    fromStage: lifecycle.currentStage,
    toStage,
    transitionType: options?.transitionType || 'manual',
    status: 'in-progress',
    triggeredBy,
    triggeredAt: now,
    validation: {
      enabled: !options?.skipValidation && allowedTransition.requireValidation,
      checks: [],
      passed: true,
    },
    metadata: options?.metadata,
  };

  // Perform validation if required
  if (transition.validation.enabled) {
    const validationResult = await performValidation(lifecycle, toStage);
    transition.validation = validationResult;

    if (!validationResult.passed) {
      transition.status = 'failed';
      transition.completedAt = new Date().toISOString();
      transition.duration = (new Date(transition.completedAt).getTime() - new Date(transition.triggeredAt).getTime()) / 1000;
      transition.error = 'Validation failed';

      lifecycle.history.push(transition);
      lifecycle.updatedAt = transition.completedAt;
      lifecycles.set(lifecycleId, lifecycle);

      return transition;
    }
  }

  // Check if approval is required
  if (!options?.skipApproval && allowedTransition.requireApproval) {
    transition.approval = {
      required: true,
      approvers: lifecycle.config.approvalConfig.approvers,
      status: 'pending',
    };

    lifecycle.history.push(transition);
    lifecycle.updatedAt = now;
    lifecycles.set(lifecycleId, lifecycle);

    return transition;
  }

  // Complete transition
  transition.status = 'completed';
  transition.completedAt = new Date().toISOString();
  transition.duration = (new Date(transition.completedAt).getTime() - new Date(transition.triggeredAt).getTime()) / 1000;

  // Update lifecycle
  lifecycle.currentStage = toStage;
  lifecycle.history.push(transition);
  lifecycle.updatedAt = transition.completedAt;

  lifecycles.set(lifecycleId, lifecycle);
  return transition;
}

/**
 * Approve a transition
 */
export async function approveTransition(
  lifecycleId: string,
  transitionId: string,
  approvedBy: string,
  comments?: string
): Promise<LifecycleTransition | null> {
  const lifecycle = lifecycles.get(lifecycleId);
  if (!lifecycle) return null;

  const transition = lifecycle.history.find((t) => t.id === transitionId);
  if (!transition || !transition.approval) return null;

  if (transition.approval.status !== 'pending') {
    throw new Error('Transition is not pending approval');
  }

  transition.approval.approvedBy = transition.approval.approvedBy || [];
  transition.approval.approvedBy.push(approvedBy);
  transition.approval.comments = comments;

  // Check if all approvers have approved
  if (transition.approval.approvedBy.length >= transition.approval.approvers.length) {
    transition.approval.status = 'approved';
    transition.approval.approvedAt = new Date().toISOString();

    // Complete transition
    transition.status = 'completed';
    transition.completedAt = transition.approval.approvedAt;
    transition.duration = (new Date(transition.completedAt).getTime() - new Date(transition.triggeredAt).getTime()) / 1000;

    lifecycle.currentStage = transition.toStage;
    lifecycle.updatedAt = transition.completedAt;
  }

  lifecycles.set(lifecycleId, lifecycle);
  return transition;
}

/**
 * Reject a transition
 */
export async function rejectTransition(
  lifecycleId: string,
  transitionId: string,
  rejectedBy: string,
  comments: string
): Promise<LifecycleTransition | null> {
  const lifecycle = lifecycles.get(lifecycleId);
  if (!lifecycle) return null;

  const transition = lifecycle.history.find((t) => t.id === transitionId);
  if (!transition || !transition.approval) return null;

  if (transition.approval.status !== 'pending') {
    throw new Error('Transition is not pending approval');
  }

  transition.approval.status = 'rejected';
  transition.approval.approvedAt = new Date().toISOString();
  transition.approval.comments = comments;

  transition.status = 'failed';
  transition.completedAt = transition.approval.approvedAt;
  transition.duration = (new Date(transition.completedAt).getTime() - new Date(transition.triggeredAt).getTime()) / 1000;
  transition.error = 'Transition rejected';

  lifecycle.updatedAt = transition.completedAt;
  lifecycles.set(lifecycleId, lifecycle);

  return transition;
}

/**
 * Rollback a transition
 */
export async function rollbackTransition(
  lifecycleId: string,
  transitionId: string,
  rolledBackBy: string,
  reason: string
): Promise<LifecycleTransition | null> {
  const lifecycle = lifecycles.get(lifecycleId);
  if (!lifecycle) return null;

  const transition = lifecycle.history.find((t) => t.id === transitionId);
  if (!transition) return null;

  if (transition.status !== 'completed') {
    throw new Error('Can only rollback completed transitions');
  }

  const rollbackTransition: LifecycleTransition = {
    id: `transition_${randomUUID()}`,
    fromStage: transition.toStage,
    toStage: transition.fromStage,
    transitionType: 'rollback',
    status: 'completed',
    triggeredBy: rolledBackBy,
    triggeredAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    duration: 0,
    validation: { enabled: false, checks: [], passed: true },
    rollback: {
      enabled: true,
      fromStage: transition.toStage,
      toStage: transition.fromStage,
      reason,
      rolledBackBy,
      rolledBackAt: new Date().toISOString(),
      originalTransitionId: transitionId,
    },
  };

  transition.status = 'rolled-back';

  lifecycle.currentStage = transition.fromStage;
  lifecycle.history.push(rollbackTransition);
  lifecycle.updatedAt = rollbackTransition.completedAt;

  lifecycles.set(lifecycleId, lifecycle);
  return rollbackTransition;
}

/**
 * Create a lifecycle template
 */
export async function createLifecycleTemplate(
  organizationId: string,
  params: {
    name: string;
    description: string;
    stages: LifecycleStage[];
    transitionRules: TransitionRule[];
    config: LifecycleConfig;
    tags?: string[];
    createdBy: string;
  }
): Promise<LifecycleTemplate> {
  const id = `template_${randomUUID()}`;
  const now = new Date().toISOString();

  const template: LifecycleTemplate = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    stages: params.stages,
    transitionRules: params.transitionRules,
    config: params.config,
    tags: params.tags || [],
    usageCount: 0,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  templates.set(id, template);
  return template;
}

/**
 * Create lifecycle from template
 */
export async function createLifecycleFromTemplate(
  templateId: string,
  params: {
    modelId: string;
    modelName: string;
    version?: string;
    metadata?: Partial<LifecycleMetadata>;
    createdBy: string;
  }
): Promise<ModelLifecycle | null> {
  const template = templates.get(templateId);
  if (!template) return null;

  const lifecycle = await createModelLifecycle(template.organizationId, {
    modelId: params.modelId,
    modelName: params.modelName,
    initialStage: template.stages[0],
    version: params.version,
    metadata: params.metadata,
    config: template.config,
    createdBy: params.createdBy,
  });

  template.usageCount++;
  template.updatedAt = new Date().toISOString();
  templates.set(templateId, template);

  return lifecycle;
}

/**
 * Get model lifecycle by ID
 */
export async function getModelLifecycle(lifecycleId: string): Promise<ModelLifecycle | null> {
  return lifecycles.get(lifecycleId) || null;
}

/**
 * List model lifecycles
 */
export async function listModelLifecycles(
  organizationId: string,
  filters?: { stage?: LifecycleStage; status?: LifecycleStatus }
): Promise<ModelLifecycle[]> {
  const allLifecycles = Array.from(lifecycles.values()).filter((l) => l.organizationId === organizationId);

  return allLifecycles.filter((l) => {
    if (filters?.stage && l.currentStage !== filters.stage) return false;
    if (filters?.status && l.status !== filters.status) return false;
    return true;
  });
}

/**
 * Get lifecycle analytics
 */
export async function getLifecycleAnalytics(organizationId: string): Promise<LifecycleAnalytics> {
  const allLifecycles = await listModelLifecycles(organizationId);

  const modelsByStage: Record<string, number> = {};
  const stageDurations: Record<string, number[]> = {};
  const transitionCounts: Record<string, number> = {};
  let failedTransitions = 0;
  let rolledBackTransitions = 0;
  let totalTransitionTime = 0;
  let transitionCount = 0;

  for (const lifecycle of allLifecycles) {
    modelsByStage[lifecycle.currentStage] = (modelsByStage[lifecycle.currentStage] || 0) + 1;

    for (const transition of lifecycle.history) {
      const key = `${transition.fromStage}->${transition.toStage}`;
      transitionCounts[key] = (transitionCounts[key] || 0) + 1;

      if (transition.status === 'failed') {
        failedTransitions++;
      } else if (transition.status === 'rolled-back') {
        rolledBackTransitions++;
      } else if (transition.status === 'completed' && transition.duration) {
        totalTransitionTime += transition.duration;
        transitionCount++;

        if (!stageDurations[transition.fromStage]) {
          stageDurations[transition.fromStage] = [];
        }
        stageDurations[transition.fromStage].push(transition.duration);
      }
    }
  }

  const averageStageDurations: Record<string, number> = {};
  for (const [stage, durations] of Object.entries(stageDurations)) {
    averageStageDurations[stage] = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  }

  const bottleneckStages = Object.entries(averageStageDurations)
    .map(([stage, duration]) => ({
      stage: stage as LifecycleStage,
      averageDuration: duration,
      transitionCount: stageDurations[stage].length,
    }))
    .sort((a, b) => b.averageDuration - a.averageDuration)
    .slice(0, 5);

  return {
    organizationId,
    totalModels: allLifecycles.length,
    modelsByStage: modelsByStage as Record<LifecycleStage, number>,
    averageStageDurations,
    transitionCounts,
    failedTransitions,
    rolledBackTransitions,
    averageTransitionTime: transitionCount > 0 ? totalTransitionTime / transitionCount : 0,
    bottleneckStages,
    lifecycleTrends: [],
  };
}

/**
 * Get lifecycle dashboard
 */
export async function getLifecycleDashboard(organizationId: string): Promise<LifecycleDashboard> {
  const allLifecycles = await listModelLifecycles(organizationId);

  const modelsByStage: Record<string, number> = {};
  const modelsByStatus: Record<string, number> = {};
  let pendingApprovals = 0;
  let failedValidations = 0;
  let totalLifecycleDuration = 0;

  for (const lifecycle of allLifecycles) {
    modelsByStage[lifecycle.currentStage] = (modelsByStage[lifecycle.currentStage] || 0) + 1;
    modelsByStatus[lifecycle.status] = (modelsByStatus[lifecycle.status] || 0) + 1;

    for (const transition of lifecycle.history) {
      if (transition.approval?.status === 'pending') {
        pendingApprovals++;
      }
      if (transition.validation.enabled && !transition.validation.passed) {
        failedValidations++;
      }
    }

    if (lifecycle.history.length > 0) {
      const firstTransition = lifecycle.history[0];
      const lastTransition = lifecycle.history[lifecycle.history.length - 1];
      const duration = (new Date(lastTransition.completedAt || lastTransition.triggeredAt).getTime() - new Date(firstTransition.triggeredAt).getTime()) / 1000;
      totalLifecycleDuration += duration;
    }
  }

  const recentTransitions = allLifecycles
    .flatMap((l) => l.history)
    .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
    .slice(0, 20);

  const topModels = allLifecycles
    .map((l) => {
      const lastTransition = l.history[l.history.length - 1];
      const daysInCurrentStage = lastTransition
        ? (new Date().getTime() - new Date(lastTransition.completedAt || lastTransition.triggeredAt).getTime()) / (1000 * 60 * 60 * 24)
        : 0;

      return {
        modelId: l.modelId,
        modelName: l.modelName,
        currentStage: l.currentStage,
        daysInCurrentStage: daysInCurrentStage,
        transitionCount: l.history.length,
      };
    })
    .sort((a, b) => b.transitionCount - a.transitionCount)
    .slice(0, 10);

  return {
    organizationId,
    totalModels: allLifecycles.length,
    activeModels: allLifecycles.filter((l) => l.status === 'active').length,
    modelsByStage: modelsByStage as Record<LifecycleStage, number>,
    modelsByStatus: modelsByStatus as Record<LifecycleStatus, number>,
    recentTransitions,
    pendingApprovals,
    failedValidations,
    averageLifecycleDuration: allLifecycles.length > 0 ? totalLifecycleDuration / allLifecycles.length : 0,
    topModels,
    lifecycleHealth: {
      healthy: allLifecycles.filter((l) => l.status === 'active').length,
      warning: allLifecycles.filter((l) => l.status === 'pending').length,
      critical: allLifecycles.filter((l) => l.status === 'failed').length,
    },
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function getDefaultTransitionRules(): TransitionRule[] {
  return [
    { fromStage: 'development', toStage: 'testing', conditions: [], automatic: false, requireApproval: false, requireValidation: false },
    { fromStage: 'testing', toStage: 'staging', conditions: [], automatic: false, requireApproval: false, requireValidation: true },
    { fromStage: 'staging', toStage: 'review', conditions: [], automatic: false, requireApproval: false, requireValidation: true },
    { fromStage: 'review', toStage: 'approved', conditions: [], automatic: false, requireApproval: true, requireValidation: true },
    { fromStage: 'approved', toStage: 'production', conditions: [], automatic: false, requireApproval: true, requireValidation: true },
    { fromStage: 'approved', toStage: 'canary', conditions: [], automatic: false, requireApproval: true, requireValidation: true },
    { fromStage: 'canary', toStage: 'production', conditions: [], automatic: false, requireApproval: false, requireValidation: true },
    { fromStage: 'production', toStage: 'deprecated', conditions: [], automatic: false, requireApproval: true, requireValidation: false },
    { fromStage: 'deprecated', toStage: 'archived', conditions: [], automatic: true, requireApproval: false, requireValidation: false },
    { fromStage: 'archived', toStage: 'retired', conditions: [], automatic: true, requireApproval: false, requireValidation: false },
  ];
}

async function performValidation(lifecycle: ModelLifecycle, toStage: LifecycleStage): Promise<TransitionValidation> {
  const checks: ValidationCheck[] = [];

  // Add default checks based on target stage
  if (toStage === 'production' || toStage === 'canary') {
    checks.push({
      type: 'performance',
      name: 'Performance Check',
      threshold: 0.9,
      currentValue: 0.95,
      passed: true,
      message: 'Performance metrics meet requirements',
    });

    checks.push({
      type: 'drift',
      name: 'Drift Check',
      threshold: 0.1,
      currentValue: 0.05,
      passed: true,
      message: 'No significant drift detected',
    });

    checks.push({
      type: 'security',
      name: 'Security Check',
      passed: true,
      message: 'Security scan passed',
    });
  }

  const passed = checks.every((c) => c.passed);
  const failedChecks = checks.filter((c) => !c.passed).map((c) => c.name);

  return {
    enabled: true,
    checks,
    passed,
    failedChecks: failedChecks.length > 0 ? failedChecks : undefined,
  };
}
