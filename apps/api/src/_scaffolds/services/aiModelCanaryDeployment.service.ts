/**
 * Module 132: AI Model Canary Deployment Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides canary deployment capabilities for AI models including gradual rollout,
 * automated monitoring, health checks, rollback automation, and traffic shifting
 * for safe production deployments.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CanaryDeployment {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: CanaryStatus;
  modelId: string;
  currentVersion: string;
  canaryVersion: string;
  rolloutStrategy: RolloutStrategy;
  healthChecks: HealthCheck[];
  metrics: CanaryMetrics;
  alerts: CanaryAlert[];
  rollbackPolicy: RollbackPolicy;
  progress: DeploymentProgress;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
}

export type CanaryStatus =
  | 'pending'
  | 'deploying'
  | 'monitoring'
  | 'promoting'
  | 'completed'
  | 'rolled_back'
  | 'failed';

export interface RolloutStrategy {
  type: 'linear' | 'exponential' | 'custom';
  steps: RolloutStep[];
  pauseBetweenSteps: number; // seconds
  automaticPromotion: boolean;
  promotionCriteria: PromotionCriteria;
}

export interface RolloutStep {
  stepNumber: number;
  trafficPercentage: number;
  duration: number; // seconds
  healthChecks: string[];
  automaticProgression: boolean;
}

export interface PromotionCriteria {
  minimumDuration: number; // seconds
  errorRateThreshold: number;
  latencyThreshold: number;
  successRateThreshold: number;
  customMetrics: CustomMetricThreshold[];
}

export interface CustomMetricThreshold {
  metricName: string;
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq';
  threshold: number;
}

export interface HealthCheck {
  id: string;
  name: string;
  type: 'http' | 'tcp' | 'grpc' | 'custom';
  endpoint: string;
  interval: number; // seconds
  timeout: number; // seconds
  healthyThreshold: number;
  unhealthyThreshold: number;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck?: string;
  consecutiveFailures: number;
}

export interface CanaryMetrics {
  errorRate: MetricHistory;
  latency: MetricHistory;
  throughput: MetricHistory;
  successRate: MetricHistory;
  customMetrics: Record<string, MetricHistory>;
}

export interface MetricHistory {
  current: number;
  baseline: number;
  history: MetricDataPoint[];
  trend: 'improving' | 'degrading' | 'stable';
  anomaly: boolean;
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  sampleSize: number;
}

export interface CanaryAlert {
  id: string;
  type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metric?: string;
  threshold?: number;
  actualValue?: number;
  triggeredAt: string;
  resolvedAt?: string;
  acknowledged: boolean;
}

export type AlertType =
  | 'error_rate_spike'
  | 'latency_increase'
  | 'throughput_drop'
  | 'health_check_failed'
  | 'anomaly_detected'
  | 'threshold_breached';

export interface RollbackPolicy {
  automatic: boolean;
  triggers: RollbackTrigger[];
  cooldownPeriod: number; // seconds
  maxRollbacks: number;
  currentRollbacks: number;
}

export interface RollbackTrigger {
  type: 'error_rate' | 'latency' | 'health_check' | 'custom_metric';
  threshold: number;
  duration: number; // seconds
  consecutiveFailures: number;
}

export interface DeploymentProgress {
  currentStep: number;
  totalSteps: number;
  currentTrafficPercentage: number;
  targetTrafficPercentage: number;
  timeInCurrentStep: number; // seconds
  estimatedCompletionTime?: string;
  pausedAt?: string;
  pauseReason?: string;
}

export interface CanaryAnalysis {
  id: string;
  deploymentId: string;
  comparisonPeriod: ComparisonPeriod;
  metrics: CanaryComparisonMetrics;
  anomalies: Anomaly[];
  recommendation: DeploymentRecommendation;
  confidence: number;
  analyzedAt: string;
}

export interface ComparisonPeriod {
  baselineStart: string;
  baselineEnd: string;
  canaryStart: string;
  canaryEnd: string;
}

export interface CanaryComparisonMetrics {
  errorRate: MetricComparison;
  latency: MetricComparison;
  throughput: MetricComparison;
  successRate: MetricComparison;
  customMetrics: Record<string, MetricComparison>;
}

export interface MetricComparison {
  baseline: number;
  canary: number;
  difference: number;
  percentChange: number;
  isSignificant: boolean;
  confidence: number;
}

export interface Anomaly {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  metric: string;
  description: string;
  detectedAt: string;
  impact: string;
}

export interface DeploymentRecommendation {
  action: 'promote' | 'rollback' | 'continue_monitoring' | 'investigate';
  confidence: number;
  reasoning: string[];
  risks: string[];
  nextSteps: string[];
}

export interface TrafficShift {
  id: string;
  deploymentId: string;
  fromPercentage: number;
  toPercentage: number;
  timestamp: string;
  triggeredBy: 'automatic' | 'manual';
  reason: string;
}

export interface RollbackExecution {
  id: string;
  deploymentId: string;
  trigger: RollbackTrigger;
  reason: string;
  timestamp: string;
  duration: number; // seconds
  success: boolean;
  restoredVersion: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const canaryDeployments = new Map<string, CanaryDeployment>();
const canaryAnalyses = new Map<string, CanaryAnalysis[]>();
const trafficShifts = new Map<string, TrafficShift[]>();
const rollbackExecutions = new Map<string, RollbackExecution[]>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createCanaryDeployment(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  currentVersion: string;
  canaryVersion: string;
  rolloutStrategy: RolloutStrategy;
  healthChecks: Omit<HealthCheck, 'id' | 'status' | 'consecutiveFailures'>[];
  rollbackPolicy: RollbackPolicy;
  createdBy: string;
}): CanaryDeployment {
  const now = new Date().toISOString();
  const id = randomUUID();

  const healthChecks: HealthCheck[] = params.healthChecks.map(hc => ({
    ...hc,
    id: randomUUID(),
    status: 'unknown',
    consecutiveFailures: 0,
  }));

  const deployment: CanaryDeployment = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'pending',
    modelId: params.modelId,
    currentVersion: params.currentVersion,
    canaryVersion: params.canaryVersion,
    rolloutStrategy: params.rolloutStrategy,
    healthChecks,
    metrics: {
      errorRate: { current: 0, baseline: 0, history: [], trend: 'stable', anomaly: false },
      latency: { current: 0, baseline: 0, history: [], trend: 'stable', anomaly: false },
      throughput: { current: 0, baseline: 0, history: [], trend: 'stable', anomaly: false },
      successRate: { current: 100, baseline: 100, history: [], trend: 'stable', anomaly: false },
      customMetrics: {},
    },
    alerts: [],
    rollbackPolicy: params.rollbackPolicy,
    progress: {
      currentStep: 0,
      totalSteps: params.rolloutStrategy.steps.length,
      currentTrafficPercentage: 0,
      targetTrafficPercentage: params.rolloutStrategy.steps[0]?.trafficPercentage || 0,
      timeInCurrentStep: 0,
    },
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  canaryDeployments.set(id, deployment);
  canaryAnalyses.set(id, []);
  trafficShifts.set(id, []);
  rollbackExecutions.set(id, []);

  return deployment;
}

export function getCanaryDeployment(id: string): CanaryDeployment | undefined {
  return canaryDeployments.get(id);
}

export function listCanaryDeployments(
  organizationId: string,
  filters?: { status?: CanaryStatus; modelId?: string }
): CanaryDeployment[] {
  let result = Array.from(canaryDeployments.values()).filter(
    d => d.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(d => d.status === filters.status);
  if (filters?.modelId) result = result.filter(d => d.modelId === filters.modelId);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function startCanaryDeployment(deploymentId: string): CanaryDeployment {
  const deployment = canaryDeployments.get(deploymentId);
  if (!deployment) throw new Error(`Canary deployment ${deploymentId} not found`);

  if (deployment.status !== 'pending') {
    throw new Error('Deployment can only be started from pending status');
  }

  deployment.status = 'deploying';
  deployment.startedAt = new Date().toISOString();
  deployment.updatedAt = new Date().toISOString();

  // Start first step
  progressToNextStep(deployment);

  return deployment;
}

function progressToNextStep(deployment: CanaryDeployment): void {
  const currentStep = deployment.rolloutStrategy.steps[deployment.progress.currentStep];
  if (!currentStep) {
    // All steps completed
    deployment.status = 'completed';
    deployment.completedAt = new Date().toISOString();
    return;
  }

  deployment.progress.currentTrafficPercentage = currentStep.trafficPercentage;
  deployment.progress.targetTrafficPercentage = currentStep.trafficPercentage;
  deployment.progress.timeInCurrentStep = 0;

  // Record traffic shift
  const shifts = trafficShifts.get(deployment.id) || [];
  shifts.push({
    id: randomUUID(),
    deploymentId: deployment.id,
    fromPercentage: deployment.progress.currentStep > 0
      ? deployment.rolloutStrategy.steps[deployment.progress.currentStep - 1].trafficPercentage
      : 0,
    toPercentage: currentStep.trafficPercentage,
    timestamp: new Date().toISOString(),
    triggeredBy: 'automatic',
    reason: `Progressing to step ${deployment.progress.currentStep + 1}`,
  });
  trafficShifts.set(deployment.id, shifts);

  deployment.status = 'monitoring';
  deployment.updatedAt = new Date().toISOString();
}

export function promoteCanaryDeployment(deploymentId: string): CanaryDeployment {
  const deployment = canaryDeployments.get(deploymentId);
  if (!deployment) throw new Error(`Canary deployment ${deploymentId} not found`);

  if (deployment.status !== 'monitoring') {
    throw new Error('Deployment can only be promoted when monitoring');
  }

  deployment.progress.currentStep++;
  
  if (deployment.progress.currentStep >= deployment.rolloutStrategy.steps.length) {
    deployment.status = 'promoting';
    deployment.progress.currentTrafficPercentage = 100;
    
    // Simulate promotion completion
    setTimeout(() => {
      deployment.status = 'completed';
      deployment.completedAt = new Date().toISOString();
      deployment.updatedAt = new Date().toISOString();
    }, 1000);
  } else {
    progressToNextStep(deployment);
  }

  return deployment;
}

export function rollbackCanaryDeployment(
  deploymentId: string,
  reason: string,
  trigger?: RollbackTrigger
): CanaryDeployment {
  const deployment = canaryDeployments.get(deploymentId);
  if (!deployment) throw new Error(`Canary deployment ${deploymentId} not found`);

  if (deployment.status === 'completed' || deployment.status === 'rolled_back') {
    throw new Error('Cannot rollback completed or already rolled back deployment');
  }

  const now = new Date().toISOString();

  // Record rollback execution
  const executions = rollbackExecutions.get(deploymentId) || [];
  executions.push({
    id: randomUUID(),
    deploymentId,
    trigger: trigger || {
      type: 'error_rate',
      threshold: 0,
      duration: 0,
      consecutiveFailures: 0,
    },
    reason,
    timestamp: now,
    duration: 0,
    success: true,
    restoredVersion: deployment.currentVersion,
  });
  rollbackExecutions.set(deploymentId, executions);

  // Record traffic shift
  const shifts = trafficShifts.get(deploymentId) || [];
  shifts.push({
    id: randomUUID(),
    deploymentId,
    fromPercentage: deployment.progress.currentTrafficPercentage,
    toPercentage: 0,
    timestamp: now,
    triggeredBy: trigger ? 'automatic' : 'manual',
    reason,
  });
  trafficShifts.set(deploymentId, shifts);

  deployment.status = 'rolled_back';
  deployment.progress.currentTrafficPercentage = 0;
  deployment.completedAt = now;
  deployment.updatedAt = now;

  deployment.rollbackPolicy.currentRollbacks++;

  return deployment;
}

export function pauseCanaryDeployment(deploymentId: string, reason: string): CanaryDeployment {
  const deployment = canaryDeployments.get(deploymentId);
  if (!deployment) throw new Error(`Canary deployment ${deploymentId} not found`);

  if (deployment.status !== 'monitoring') {
    throw new Error('Deployment can only be paused when monitoring');
  }

  deployment.status = 'pending';
  deployment.progress.pausedAt = new Date().toISOString();
  deployment.progress.pauseReason = reason;
  deployment.updatedAt = new Date().toISOString();

  return deployment;
}

export function resumeCanaryDeployment(deploymentId: string): CanaryDeployment {
  const deployment = canaryDeployments.get(deploymentId);
  if (!deployment) throw new Error(`Canary deployment ${deploymentId} not found`);

  if (deployment.status !== 'pending' || !deployment.progress.pausedAt) {
    throw new Error('Deployment can only be resumed when paused');
  }

  deployment.status = 'monitoring';
  deployment.progress.pausedAt = undefined;
  deployment.progress.pauseReason = undefined;
  deployment.updatedAt = new Date().toISOString();

  return deployment;
}

export function updateCanaryMetrics(
  deploymentId: string,
  metrics: {
    errorRate?: number;
    latency?: number;
    throughput?: number;
    successRate?: number;
    customMetrics?: Record<string, number>;
  }
): CanaryDeployment {
  const deployment = canaryDeployments.get(deploymentId);
  if (!deployment) throw new Error(`Canary deployment ${deploymentId} not found`);

  const now = new Date().toISOString();

  if (metrics.errorRate !== undefined) {
    deployment.metrics.errorRate.current = metrics.errorRate;
    deployment.metrics.errorRate.history.push({
      timestamp: now,
      value: metrics.errorRate,
      sampleSize: 100,
    });
    checkMetricAnomaly(deployment.metrics.errorRate);
    checkRollbackTrigger(deployment, 'error_rate', metrics.errorRate);
  }

  if (metrics.latency !== undefined) {
    deployment.metrics.latency.current = metrics.latency;
    deployment.metrics.latency.history.push({
      timestamp: now,
      value: metrics.latency,
      sampleSize: 100,
    });
    checkMetricAnomaly(deployment.metrics.latency);
    checkRollbackTrigger(deployment, 'latency', metrics.latency);
  }

  if (metrics.throughput !== undefined) {
    deployment.metrics.throughput.current = metrics.throughput;
    deployment.metrics.throughput.history.push({
      timestamp: now,
      value: metrics.throughput,
      sampleSize: 100,
    });
    checkMetricAnomaly(deployment.metrics.throughput);
  }

  if (metrics.successRate !== undefined) {
    deployment.metrics.successRate.current = metrics.successRate;
    deployment.metrics.successRate.history.push({
      timestamp: now,
      value: metrics.successRate,
      sampleSize: 100,
    });
    checkMetricAnomaly(deployment.metrics.successRate);
  }

  if (metrics.customMetrics) {
    for (const [name, value] of Object.entries(metrics.customMetrics)) {
      if (!deployment.metrics.customMetrics[name]) {
        deployment.metrics.customMetrics[name] = {
          current: 0,
          baseline: 0,
          history: [],
          trend: 'stable',
          anomaly: false,
        };
      }
      deployment.metrics.customMetrics[name].current = value;
      deployment.metrics.customMetrics[name].history.push({
        timestamp: now,
        value,
        sampleSize: 100,
      });
      checkMetricAnomaly(deployment.metrics.customMetrics[name]);
    }
  }

  // Check for automatic promotion
  if (deployment.rolloutStrategy.automaticPromotion && deployment.status === 'monitoring') {
    const canPromote = checkPromotionCriteria(deployment);
    if (canPromote) {
      promoteCanaryDeployment(deploymentId);
    }
  }

  deployment.updatedAt = now;
  return deployment;
}

function checkMetricAnomaly(metric: MetricHistory): void {
  if (metric.history.length < 10) return;

  const recentValues = metric.history.slice(-10).map(h => h.value);
  const mean = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
  const stdDev = Math.sqrt(
    recentValues.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / recentValues.length
  );

  const currentValue = metric.current;
  const zScore = stdDev > 0 ? Math.abs((currentValue - mean) / stdDev) : 0;

  metric.anomaly = zScore > 2;
  
  if (currentValue > mean) {
    metric.trend = 'degrading';
  } else if (currentValue < mean) {
    metric.trend = 'improving';
  } else {
    metric.trend = 'stable';
  }
}

function checkRollbackTrigger(
  deployment: CanaryDeployment,
  metricType: string,
  value: number
): void {
  if (!deployment.rollbackPolicy.automatic) return;

  for (const trigger of deployment.rollbackPolicy.triggers) {
    if (trigger.type === metricType && value > trigger.threshold) {
      // Check duration and consecutive failures
      const metric = metricType === 'error_rate' ? deployment.metrics.errorRate :
                     metricType === 'latency' ? deployment.metrics.latency : null;

      if (metric) {
        const recentHistory = metric.history.slice(-trigger.consecutiveFailures);
        const allExceedThreshold = recentHistory.every(h => h.value > trigger.threshold);

        if (allExceedThreshold && recentHistory.length >= trigger.consecutiveFailures) {
          rollbackCanaryDeployment(
            deployment.id,
            `Automatic rollback triggered: ${metricType} exceeded threshold`,
            trigger
          );
          return;
        }
      }
    }
  }
}

function checkPromotionCriteria(deployment: CanaryDeployment): boolean {
  const criteria = deployment.rolloutStrategy.promotionCriteria;
  const currentStep = deployment.rolloutStrategy.steps[deployment.progress.currentStep];

  if (!currentStep) return false;

  // Check minimum duration
  if (deployment.progress.timeInCurrentStep < criteria.minimumDuration) {
    return false;
  }

  // Check error rate
  if (deployment.metrics.errorRate.current > criteria.errorRateThreshold) {
    return false;
  }

  // Check latency
  if (deployment.metrics.latency.current > criteria.latencyThreshold) {
    return false;
  }

  // Check success rate
  if (deployment.metrics.successRate.current < criteria.successRateThreshold) {
    return false;
  }

  // Check custom metrics
  for (const customMetric of criteria.customMetrics) {
    const metric = deployment.metrics.customMetrics[customMetric.metricName];
    if (!metric) continue;

    const value = metric.current;
    const threshold = customMetric.threshold;

    let passes = false;
    switch (customMetric.operator) {
      case 'lt': passes = value < threshold; break;
      case 'lte': passes = value <= threshold; break;
      case 'gt': passes = value > threshold; break;
      case 'gte': passes = value >= threshold; break;
      case 'eq': passes = value === threshold; break;
    }

    if (!passes) return false;
  }

  return true;
}

export function updateHealthCheckStatus(
  deploymentId: string,
  healthCheckId: string,
  healthy: boolean
): CanaryDeployment {
  const deployment = canaryDeployments.get(deploymentId);
  if (!deployment) throw new Error(`Canary deployment ${deploymentId} not found`);

  const healthCheck = deployment.healthChecks.find(hc => hc.id === healthCheckId);
  if (!healthCheck) throw new Error('Health check not found');

  const now = new Date().toISOString();
  healthCheck.lastCheck = now;

  if (healthy) {
    healthCheck.status = 'healthy';
    healthCheck.consecutiveFailures = 0;
  } else {
    healthCheck.consecutiveFailures++;
    if (healthCheck.consecutiveFailures >= healthCheck.unhealthyThreshold) {
      healthCheck.status = 'unhealthy';
      
      // Trigger rollback if configured
      if (deployment.rollbackPolicy.automatic) {
        const healthCheckTrigger = deployment.rollbackPolicy.triggers.find(t => t.type === 'health_check');
        if (healthCheckTrigger && healthCheck.consecutiveFailures >= healthCheckTrigger.consecutiveFailures) {
          rollbackCanaryDeployment(
            deploymentId,
            `Health check ${healthCheck.name} failed`,
            healthCheckTrigger
          );
        }
      }
    }
  }

  deployment.updatedAt = now;
  return deployment;
}

export function analyzeCanaryDeployment(deploymentId: string): CanaryAnalysis {
  const deployment = canaryDeployments.get(deploymentId);
  if (!deployment) throw new Error(`Canary deployment ${deploymentId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const baselinePeriod = {
    start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    end: deployment.startedAt || now,
  };

  const canaryPeriod = {
    start: deployment.startedAt || now,
    end: now,
  };

  const metrics: CanaryComparisonMetrics = {
    errorRate: compareMetric(deployment.metrics.errorRate),
    latency: compareMetric(deployment.metrics.latency),
    throughput: compareMetric(deployment.metrics.throughput),
    successRate: compareMetric(deployment.metrics.successRate),
    customMetrics: {},
  };

  for (const [name, metric] of Object.entries(deployment.metrics.customMetrics)) {
    metrics.customMetrics[name] = compareMetric(metric);
  }

  const anomalies: Anomaly[] = [];
  if (deployment.metrics.errorRate.anomaly) {
    anomalies.push({
      id: randomUUID(),
      type: 'error_rate_anomaly',
      severity: 'high',
      metric: 'errorRate',
      description: 'Unusual error rate pattern detected',
      detectedAt: now,
      impact: 'May indicate issues with canary version',
    });
  }

  if (deployment.metrics.latency.anomaly) {
    anomalies.push({
      id: randomUUID(),
      type: 'latency_anomaly',
      severity: 'medium',
      metric: 'latency',
      description: 'Unusual latency pattern detected',
      detectedAt: now,
      impact: 'May indicate performance degradation',
    });
  }

  const errorRateImprovement = metrics.errorRate.percentChange;
  const latencyImprovement = metrics.latency.percentChange;
  const successRateImprovement = metrics.successRate.percentChange;

  let recommendation: DeploymentRecommendation;

  if (errorRateImprovement < -10 && latencyImprovement < 10 && successRateImprovement > -5) {
    recommendation = {
      action: 'promote',
      confidence: 0.9,
      reasoning: [
        'Error rate improved significantly',
        'Latency within acceptable range',
        'Success rate maintained',
      ],
      risks: ['Monitor closely after promotion'],
      nextSteps: ['Promote canary to full production'],
    };
  } else if (errorRateImprovement > 20 || latencyImprovement > 50) {
    recommendation = {
      action: 'rollback',
      confidence: 0.95,
      reasoning: [
        errorRateImprovement > 20 ? 'Error rate degraded significantly' : '',
        latencyImprovement > 50 ? 'Latency increased significantly' : '',
      ].filter(r => r),
      risks: ['Continued degradation may impact users'],
      nextSteps: ['Rollback to stable version', 'Investigate issues'],
    };
  } else {
    recommendation = {
      action: 'continue_monitoring',
      confidence: 0.7,
      reasoning: [
        'Metrics within acceptable range',
        'Need more data for confident decision',
      ],
      risks: ['Potential issues may emerge with more traffic'],
      nextSteps: ['Continue monitoring', 'Increase traffic gradually'],
    };
  }

  const analysis: CanaryAnalysis = {
    id,
    deploymentId,
    comparisonPeriod: {
      baselineStart: baselinePeriod.start,
      baselineEnd: baselinePeriod.end,
      canaryStart: canaryPeriod.start,
      canaryEnd: canaryPeriod.end,
    },
    metrics,
    anomalies,
    recommendation,
    confidence: recommendation.confidence,
    analyzedAt: now,
  };

  const analyses = canaryAnalyses.get(deploymentId) || [];
  analyses.push(analysis);
  canaryAnalyses.set(deploymentId, analyses);

  return analysis;
}

function compareMetric(metric: MetricHistory): MetricComparison {
  const baseline = metric.baseline;
  const canary = metric.current;
  const difference = canary - baseline;
  const percentChange = baseline > 0 ? (difference / baseline) * 100 : 0;

  return {
    baseline,
    canary,
    difference,
    percentChange,
    isSignificant: Math.abs(percentChange) > 10,
    confidence: 0.85,
  };
}

export function getCanaryAnalyses(deploymentId: string): CanaryAnalysis[] {
  return canaryAnalyses.get(deploymentId) || [];
}

export function getTrafficShifts(deploymentId: string): TrafficShift[] {
  return trafficShifts.get(deploymentId) || [];
}

export function getRollbackExecutions(deploymentId: string): RollbackExecution[] {
  return rollbackExecutions.get(deploymentId) || [];
}

export function acknowledgeAlert(deploymentId: string, alertId: string): CanaryDeployment {
  const deployment = canaryDeployments.get(deploymentId);
  if (!deployment) throw new Error(`Canary deployment ${deploymentId} not found`);

  const alert = deployment.alerts.find(a => a.id === alertId);
  if (!alert) throw new Error('Alert not found');

  alert.acknowledged = true;
  deployment.updatedAt = new Date().toISOString();

  return deployment;
}

export function resolveAlert(deploymentId: string, alertId: string): CanaryDeployment {
  const deployment = canaryDeployments.get(deploymentId);
  if (!deployment) throw new Error(`Canary deployment ${deploymentId} not found`);

  const alert = deployment.alerts.find(a => a.id === alertId);
  if (!alert) throw new Error('Alert not found');

  alert.resolvedAt = new Date().toISOString();
  deployment.updatedAt = new Date().toISOString();

  return deployment;
}
