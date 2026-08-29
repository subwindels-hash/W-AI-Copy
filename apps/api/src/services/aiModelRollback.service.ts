/**
 * Module 105: AI Model Rollback Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides rollback capabilities for AI models including automatic rollback triggers,
 * canary deployments, gradual rollouts, rollback history, and deployment strategies
 * for safe model updates.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Deployment {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  strategy: DeploymentStrategy;
  status: DeploymentStatus;
  currentVersion: string;
  targetVersion: string;
  previousVersion?: string;
  rolloutConfig: RolloutConfiguration;
  progress: DeploymentProgress;
  rollbackConfig: RollbackConfiguration;
  healthChecks: HealthCheck[];
  metrics: DeploymentMetrics;
  startedAt: string;
  completedAt?: string;
  rolledBackAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type DeploymentStrategy =
  | 'immediate'
  | 'canary'
  | 'blue_green'
  | 'rolling_update'
  | 'shadow';

export type DeploymentStatus =
  | 'pending'
  | 'deploying'
  | 'canary_testing'
  | 'rolling_out'
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'cancelled';

export interface RolloutConfiguration {
  canaryPercentage?: number; // 0-100
  canaryDuration?: number; // minutes
  rolloutSteps?: RolloutStep[];
  pauseBetweenSteps?: number; // minutes
  automaticPromotion: boolean;
  promotionCriteria?: PromotionCriteria;
}

export interface RolloutStep {
  stepNumber: number;
  percentage: number;
  duration?: number; // minutes
  pauseRequired: boolean;
  healthCheckRequired: boolean;
}

export interface PromotionCriteria {
  minSuccessRate?: number;
  maxErrorRate?: number;
  maxLatencyMs?: number;
  minUptime?: number; // percentage
  customMetrics?: Array<{
    metric: string;
    threshold: number;
    operator: 'greater_than' | 'less_than' | 'equals';
  }>;
}

export interface RollbackConfiguration {
  automaticRollback: boolean;
  rollbackTriggers: RollbackTrigger[];
  rollbackVersion?: string; // specific version to rollback to
  cooldownPeriod: number; // minutes before allowing another deployment
  maxRollbacks: number;
  notifyOnRollback: boolean;
  notificationChannels: string[];
}

export interface RollbackTrigger {
  type: 'error_rate' | 'latency' | 'availability' | 'custom_metric' | 'health_check' | 'manual';
  threshold: number;
  operator: 'greater_than' | 'less_than' | 'equals';
  duration: number; // seconds to sustain condition before triggering
  severity: 'warning' | 'critical';
}

export interface HealthCheck {
  id: string;
  type: 'http' | 'tcp' | 'grpc' | 'custom';
  endpoint?: string;
  interval: number; // seconds
  timeout: number; // seconds
  healthyThreshold: number;
  unhealthyThreshold: number;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck?: string;
  failureCount: number;
}

export interface DeploymentProgress {
  currentStep: number;
  totalSteps: number;
  currentPercentage: number;
  targetPercentage: number;
  paused: boolean;
  pauseReason?: string;
  estimatedCompletion?: string;
}

export interface DeploymentMetrics {
  requestsTotal: number;
  requestsCanary: number;
  requestsBaseline: number;
  errorRateCanary: number;
  errorRateBaseline: number;
  latencyP50Canary?: number;
  latencyP50Baseline?: number;
  latencyP95Canary?: number;
  latencyP95Baseline?: number;
  successRateCanary: number;
  successRateBaseline: number;
}

export interface RollbackRecord {
  id: string;
  deploymentId: string;
  organizationId: string;
  modelId: string;
  fromVersion: string;
  toVersion: string;
  reason: RollbackReason;
  trigger: RollbackTrigger;
  status: 'initiated' | 'in_progress' | 'completed' | 'failed';
  initiatedAt: string;
  completedAt?: string;
  duration?: number; // seconds
  initiatedBy: string;
  impact?: RollbackImpact;
}

export interface RollbackReason {
  type: 'automatic' | 'manual' | 'scheduled';
  description: string;
  metrics?: Record<string, number>;
  healthCheckFailures?: string[];
}

export interface RollbackImpact {
  affectedRequests: number;
  downtimeSeconds: number;
  dataLoss: boolean;
  serviceDegradation: boolean;
}

export interface CanaryAnalysis {
  deploymentId: string;
  canaryVersion: string;
  baselineVersion: string;
  duration: number; // minutes
  metrics: CanaryMetricComparison[];
  overallScore: number; // 0-100
  recommendation: 'promote' | 'rollback' | 'extend';
  confidence: number; // 0-1
  issues: string[];
}

export interface CanaryMetricComparison {
  metric: string;
  canaryValue: number;
  baselineValue: number;
  difference: number;
  percentChange: number;
  withinThreshold: boolean;
  critical: boolean;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const deployments = new Map<string, Deployment>();
const rollbackRecords = new Map<string, RollbackRecord[]>();
const canaryAnalyses = new Map<string, CanaryAnalysis[]>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createDeployment(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  strategy: DeploymentStrategy;
  targetVersion: string;
  currentVersion?: string;
  rolloutConfig?: RolloutConfiguration;
  rollbackConfig?: RollbackConfiguration;
  healthChecks?: Omit<HealthCheck, 'id' | 'status' | 'failureCount'>[];
  createdBy: string;
}): Deployment {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultRolloutConfig: RolloutConfiguration = {
    canaryPercentage: 10,
    canaryDuration: 30,
    automaticPromotion: true,
    rolloutSteps: [
      { stepNumber: 1, percentage: 10, duration: 30, pauseRequired: false, healthCheckRequired: true },
      { stepNumber: 2, percentage: 25, duration: 30, pauseRequired: false, healthCheckRequired: true },
      { stepNumber: 3, percentage: 50, duration: 30, pauseRequired: false, healthCheckRequired: true },
      { stepNumber: 4, percentage: 100, duration: 0, pauseRequired: false, healthCheckRequired: false },
    ],
  };

  const defaultRollbackConfig: RollbackConfiguration = {
    automaticRollback: true,
    rollbackTriggers: [
      { type: 'error_rate', threshold: 5, operator: 'greater_than', duration: 300, severity: 'critical' },
      { type: 'latency', threshold: 1000, operator: 'greater_than', duration: 300, severity: 'warning' },
      { type: 'availability', threshold: 95, operator: 'less_than', duration: 60, severity: 'critical' },
    ],
    cooldownPeriod: 60,
    maxRollbacks: 3,
    notifyOnRollback: true,
    notificationChannels: ['email', 'slack'],
  };

  const healthChecks: HealthCheck[] = (params.healthChecks || []).map(hc => ({
    ...hc,
    id: randomUUID(),
    status: 'unknown',
    failureCount: 0,
  }));

  const deployment: Deployment = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    strategy: params.strategy,
    status: 'pending',
    currentVersion: params.currentVersion || 'none',
    targetVersion: params.targetVersion,
    previousVersion: params.currentVersion,
    rolloutConfig: params.rolloutConfig || defaultRolloutConfig,
    progress: {
      currentStep: 0,
      totalSteps: params.strategy === 'immediate' ? 1 : 
                 params.rolloutConfig?.rolloutSteps?.length || 4,
      currentPercentage: 0,
      targetPercentage: 100,
      paused: false,
    },
    rollbackConfig: params.rollbackConfig || defaultRollbackConfig,
    healthChecks,
    metrics: {
      requestsTotal: 0,
      requestsCanary: 0,
      requestsBaseline: 0,
      errorRateCanary: 0,
      errorRateBaseline: 0,
      successRateCanary: 100,
      successRateBaseline: 100,
    },
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  deployments.set(id, deployment);
  rollbackRecords.set(id, []);
  canaryAnalyses.set(id, []);

  return deployment;
}

export function getDeployment(id: string): Deployment | undefined {
  return deployments.get(id);
}

export function listDeployments(
  organizationId: string,
  filters?: { modelId?: string; status?: DeploymentStatus; strategy?: DeploymentStrategy }
): Deployment[] {
  let result = Array.from(deployments.values()).filter(
    d => d.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(d => d.modelId === filters.modelId);
  if (filters?.status) result = result.filter(d => d.status === filters.status);
  if (filters?.strategy) result = result.filter(d => d.strategy === filters.strategy);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function startDeployment(deploymentId: string): Deployment {
  const deployment = deployments.get(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);
  if (deployment.status !== 'pending') throw new Error('Deployment is not in pending status');

  deployment.status = deployment.strategy === 'canary' ? 'canary_testing' : 
                       deployment.strategy === 'rolling_update' ? 'rolling_out' : 
                       'deploying';
  deployment.progress.currentStep = 1;
  deployment.progress.currentPercentage = deployment.strategy === 'immediate' ? 100 : 
                                          deployment.rolloutConfig.canaryPercentage || 10;
  deployment.updatedAt = new Date().toISOString();

  return deployment;
}

export function promoteDeployment(deploymentId: string): Deployment {
  const deployment = deployments.get(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  if (deployment.status !== 'canary_testing' && deployment.status !== 'rolling_out') {
    throw new Error('Deployment is not in a promotable state');
  }

  const nextStep = deployment.progress.currentStep + 1;
  const rolloutSteps = deployment.rolloutConfig.rolloutSteps || [];
  const nextStepConfig = rolloutSteps[nextStep - 1];

  if (!nextStepConfig || nextStep > deployment.progress.totalSteps) {
    // Final promotion
    deployment.status = 'completed';
    deployment.progress.currentPercentage = 100;
    deployment.progress.currentStep = deployment.progress.totalSteps;
    deployment.completedAt = new Date().toISOString();
    deployment.currentVersion = deployment.targetVersion;
  } else {
    deployment.progress.currentStep = nextStep;
    deployment.progress.currentPercentage = nextStepConfig.percentage;
    
    if (nextStepConfig.pauseRequired) {
      deployment.progress.paused = true;
      deployment.progress.pauseReason = 'Manual promotion required';
    }
  }

  deployment.updatedAt = new Date().toISOString();
  return deployment;
}

export function pauseDeployment(deploymentId: string, reason: string): Deployment {
  const deployment = deployments.get(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  deployment.progress.paused = true;
  deployment.progress.pauseReason = reason;
  deployment.updatedAt = new Date().toISOString();

  return deployment;
}

export function resumeDeployment(deploymentId: string): Deployment {
  const deployment = deployments.get(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  deployment.progress.paused = false;
  deployment.progress.pauseReason = undefined;
  deployment.updatedAt = new Date().toISOString();

  return deployment;
}

export function rollbackDeployment(
  deploymentId: string,
  reason: RollbackReason,
  initiatedBy: string
): RollbackRecord {
  const deployment = deployments.get(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  if (deployment.status === 'rolled_back' || deployment.status === 'completed') {
    throw new Error('Cannot rollback a completed or already rolled back deployment');
  }

  const now = new Date().toISOString();
  const rollbackVersion = deployment.rollbackConfig.rollbackVersion || deployment.previousVersion;

  if (!rollbackVersion || rollbackVersion === 'none') {
    throw new Error('No rollback version available');
  }

  const rollbackRecord: RollbackRecord = {
    id: randomUUID(),
    deploymentId,
    organizationId: deployment.organizationId,
    modelId: deployment.modelId,
    fromVersion: deployment.targetVersion,
    toVersion: rollbackVersion,
    reason,
    trigger: reason.type === 'automatic' ? 
      deployment.rollbackConfig.rollbackTriggers[0] : 
      { type: 'manual', threshold: 0, operator: 'equals', duration: 0, severity: 'critical' },
    status: 'completed',
    initiatedAt: now,
    completedAt: now,
    duration: 0,
    initiatedBy,
    impact: {
      affectedRequests: deployment.metrics.requestsCanary,
      downtimeSeconds: 0,
      dataLoss: false,
      serviceDegradation: false,
    },
  };

  const records = rollbackRecords.get(deploymentId) || [];
  records.push(rollbackRecord);
  rollbackRecords.set(deploymentId, records);

  deployment.status = 'rolled_back';
  deployment.rolledBackAt = now;
  deployment.currentVersion = rollbackVersion;
  deployment.progress.currentPercentage = 0;
  deployment.updatedAt = now;

  return rollbackRecord;
}

export function cancelDeployment(deploymentId: string): Deployment {
  const deployment = deployments.get(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  if (deployment.status === 'completed' || deployment.status === 'rolled_back') {
    throw new Error('Cannot cancel a completed or rolled back deployment');
  }

  deployment.status = 'cancelled';
  deployment.updatedAt = new Date().toISOString();

  return deployment;
}

export function updateDeploymentMetrics(
  deploymentId: string,
  metrics: Partial<DeploymentMetrics>
): Deployment {
  const deployment = deployments.get(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  deployment.metrics = { ...deployment.metrics, ...metrics };
  deployment.updatedAt = new Date().toISOString();

  // Check rollback triggers
  if (deployment.rollbackConfig.automaticRollback && 
      (deployment.status === 'canary_testing' || deployment.status === 'rolling_out')) {
    checkRollbackTriggers(deployment);
  }

  return deployment;
}

function checkRollbackTriggers(deployment: Deployment): void {
  for (const trigger of deployment.rollbackConfig.rollbackTriggers) {
    let shouldRollback = false;
    let currentValue = 0;

    switch (trigger.type) {
      case 'error_rate':
        currentValue = deployment.metrics.errorRateCanary;
        shouldRollback = trigger.operator === 'greater_than' ? 
          currentValue > trigger.threshold : currentValue < trigger.threshold;
        break;
      case 'latency':
        currentValue = deployment.metrics.latencyP95Canary || 0;
        shouldRollback = trigger.operator === 'greater_than' ? 
          currentValue > trigger.threshold : currentValue < trigger.threshold;
        break;
      case 'availability':
        currentValue = deployment.metrics.successRateCanary;
        shouldRollback = trigger.operator === 'less_than' ? 
          currentValue < trigger.threshold : currentValue > trigger.threshold;
        break;
    }

    if (shouldRollback && trigger.severity === 'critical') {
      rollbackDeployment(
        deployment.id,
        {
          type: 'automatic',
          description: `Automatic rollback triggered by ${trigger.type} threshold`,
          metrics: { [trigger.type]: currentValue },
        },
        'system'
      );
      break;
    }
  }
}

export function updateHealthCheck(
  deploymentId: string,
  healthCheckId: string,
  status: 'healthy' | 'unhealthy'
): HealthCheck {
  const deployment = deployments.get(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  const healthCheck = deployment.healthChecks.find(hc => hc.id === healthCheckId);
  if (!healthCheck) throw new Error(`Health check ${healthCheckId} not found`);

  healthCheck.status = status;
  healthCheck.lastCheck = new Date().toISOString();

  if (status === 'unhealthy') {
    healthCheck.failureCount += 1;
    if (healthCheck.failureCount >= healthCheck.unhealthyThreshold) {
      // Trigger rollback if configured
      if (deployment.rollbackConfig.automaticRollback) {
        rollbackDeployment(
          deploymentId,
          {
            type: 'automatic',
            description: `Health check ${healthCheck.type} failed ${healthCheck.failureCount} times`,
            healthCheckFailures: [healthCheck.type],
          },
          'system'
        );
      }
    }
  } else {
    healthCheck.failureCount = 0;
  }

  deployment.updatedAt = new Date().toISOString();
  return healthCheck;
}

export function analyzeCanary(deploymentId: string): CanaryAnalysis {
  const deployment = deployments.get(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  if (deployment.strategy !== 'canary') {
    throw new Error('Deployment is not a canary deployment');
  }

  const metrics: CanaryMetricComparison[] = [
    {
      metric: 'error_rate',
      canaryValue: deployment.metrics.errorRateCanary,
      baselineValue: deployment.metrics.errorRateBaseline,
      difference: deployment.metrics.errorRateCanary - deployment.metrics.errorRateBaseline,
      percentChange: deployment.metrics.errorRateBaseline > 0 ?
        ((deployment.metrics.errorRateCanary - deployment.metrics.errorRateBaseline) / 
         deployment.metrics.errorRateBaseline) * 100 : 0,
      withinThreshold: Math.abs(deployment.metrics.errorRateCanary - deployment.metrics.errorRateBaseline) < 1,
      critical: true,
    },
    {
      metric: 'success_rate',
      canaryValue: deployment.metrics.successRateCanary,
      baselineValue: deployment.metrics.successRateBaseline,
      difference: deployment.metrics.successRateCanary - deployment.metrics.successRateBaseline,
      percentChange: deployment.metrics.successRateBaseline > 0 ?
        ((deployment.metrics.successRateCanary - deployment.metrics.successRateBaseline) / 
         deployment.metrics.successRateBaseline) * 100 : 0,
      withinThreshold: deployment.metrics.successRateCanary >= 99,
      critical: true,
    },
  ];

  if (deployment.metrics.latencyP50Canary && deployment.metrics.latencyP50Baseline) {
    metrics.push({
      metric: 'latency_p50',
      canaryValue: deployment.metrics.latencyP50Canary,
      baselineValue: deployment.metrics.latencyP50Baseline,
      difference: deployment.metrics.latencyP50Canary - deployment.metrics.latencyP50Baseline,
      percentChange: ((deployment.metrics.latencyP50Canary - deployment.metrics.latencyP50Baseline) / 
                      deployment.metrics.latencyP50Baseline) * 100,
      withinThreshold: deployment.metrics.latencyP50Canary <= deployment.metrics.latencyP50Baseline * 1.1,
      critical: false,
    });
  }

  const criticalMetrics = metrics.filter(m => m.critical);
  const allCriticalWithinThreshold = criticalMetrics.every(m => m.withinThreshold);
  const overallScore = metrics.reduce((sum, m) => sum + (m.withinThreshold ? 100 : 50), 0) / metrics.length;

  let recommendation: 'promote' | 'rollback' | 'extend' = 'extend';
  if (allCriticalWithinThreshold && overallScore >= 80) {
    recommendation = 'promote';
  } else if (!allCriticalWithinThreshold || overallScore < 60) {
    recommendation = 'rollback';
  }

  const issues: string[] = [];
  metrics.forEach(m => {
    if (!m.withinThreshold) {
      issues.push(`${m.metric} is outside acceptable threshold (${m.percentChange.toFixed(2)}% change)`);
    }
  });

  const analysis: CanaryAnalysis = {
    deploymentId,
    canaryVersion: deployment.targetVersion,
    baselineVersion: deployment.currentVersion,
    duration: deployment.rolloutConfig.canaryDuration || 30,
    metrics,
    overallScore,
    recommendation,
    confidence: allCriticalWithinThreshold ? 0.9 : 0.6,
    issues,
  };

  const analyses = canaryAnalyses.get(deploymentId) || [];
  analyses.push(analysis);
  canaryAnalyses.set(deploymentId, analyses);

  return analysis;
}

export function getRollbackHistory(
  deploymentId: string
): RollbackRecord[] {
  return rollbackRecords.get(deploymentId) || [];
}

export function getCanaryAnalyses(
  deploymentId: string
): CanaryAnalysis[] {
  return canaryAnalyses.get(deploymentId) || [];
}

export function getDeploymentProgress(
  deploymentId: string
): DeploymentProgress {
  const deployment = deployments.get(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  return deployment.progress;
}

export function getDeploymentMetrics(
  deploymentId: string
): DeploymentMetrics {
  const deployment = deployments.get(deploymentId);
  if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);

  return deployment.metrics;
}
