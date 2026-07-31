/**
 * Module 137: AI Model Auto-scaling Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides automatic scaling capabilities for AI models including predictive scaling,
 * reactive scaling, scheduled scaling, and intelligent resource management based on
 * real-time demand and performance metrics.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AutoScalingGroup {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: AutoScalingStatus;
  modelId: string;
  modelVersion: string;
  configuration: AutoScalingConfiguration;
  currentCapacity: CurrentCapacity;
  scalingHistory: ScalingEvent[];
  metrics: ScalingMetrics;
  policies: ScalingPolicy[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type AutoScalingStatus =
  | 'active'
  | 'paused'
  | 'scaling'
  | 'error'
  | 'disabled';

export interface AutoScalingConfiguration {
  minInstances: number;
  maxInstances: number;
  desiredInstances: number;
  cooldownPeriod: number; // seconds
  healthCheckGracePeriod: number; // seconds
  terminationPolicy: TerminationPolicy;
  availabilityZones: string[];
  instanceTypes: InstanceTypeConfig[];
}

export type TerminationPolicy =
  | 'oldest'
  | 'newest'
  | 'closest_to_next_hour'
  | 'default'
  | 'custom';

export interface InstanceTypeConfig {
  instanceType: string;
  weight: number;
  priority: number;
  spotEnabled: boolean;
  spotMaxPrice?: number;
}

export interface CurrentCapacity {
  instances: InstanceInfo[];
  totalInstances: number;
  healthyInstances: number;
  unhealthyInstances: number;
  pendingInstances: number;
  terminatingInstances: number;
  cpuUtilization: number;
  memoryUtilization: number;
  gpuUtilization?: number;
  requestRate: number;
  latency: number;
  collectedAt: string;
}

export interface InstanceInfo {
  instanceId: string;
  instanceType: string;
  availabilityZone: string;
  status: 'running' | 'pending' | 'terminating' | 'terminated' | 'stopped';
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  launchTime: string;
  cpuUtilization: number;
  memoryUtilization: number;
  gpuUtilization?: number;
  requestCount: number;
  isSpot: boolean;
}

export interface ScalingEvent {
  id: string;
  timestamp: string;
  type: ScalingEventType;
  trigger: ScalingTrigger;
  fromCapacity: number;
  toCapacity: number;
  reason: string;
  status: 'initiated' | 'in_progress' | 'completed' | 'failed';
  duration?: number; // seconds
  error?: string;
}

export type ScalingEventType =
  | 'scale_up'
  | 'scale_down'
  | 'scheduled_scale'
  | 'predictive_scale'
  | 'manual_scale'
  | 'health_check';

export interface ScalingTrigger {
  type: 'metric' | 'schedule' | 'predictive' | 'manual' | 'health';
  metricName?: string;
  metricValue?: number;
  threshold?: number;
  policyId?: string;
}

export interface ScalingMetrics {
  current: MetricSnapshot;
  history: MetricSnapshot[];
  predictions: MetricPrediction[];
  scalingEffectiveness: ScalingEffectiveness;
}

export interface MetricSnapshot {
  timestamp: string;
  cpuUtilization: number;
  memoryUtilization: number;
  gpuUtilization?: number;
  requestRate: number;
  latency: number;
  errorRate: number;
  concurrentUsers: number;
  instances: number;
}

export interface MetricPrediction {
  timestamp: string;
  predictedRequestRate: number;
  predictedInstances: number;
  confidence: number;
}

export interface ScalingEffectiveness {
  scaleUpSuccessRate: number;
  scaleDownSuccessRate: number;
  averageScaleUpTime: number;
  averageScaleDownTime: number;
  overProvisioningRate: number;
  underProvisioningRate: number;
  costEfficiency: number;
}

export interface ScalingPolicy {
  id: string;
  name: string;
  type: ScalingPolicyType;
  enabled: boolean;
  configuration: PolicyConfiguration;
  cooldown: number;
  lastTriggered?: string;
}

export type ScalingPolicyType =
  | 'target_tracking'
  | 'step_scaling'
  | 'simple_scaling'
  | 'predictive'
  | 'scheduled';

export interface PolicyConfiguration {
  // Target tracking
  targetValue?: number;
  metricName?: string;
  
  // Step scaling
  adjustmentType?: 'change_in_capacity' | 'exact_capacity' | 'percent_change_in_capacity';
  stepAdjustments?: StepAdjustment[];
  
  // Simple scaling
  scalingAdjustment?: number;
  threshold?: number;
  comparisonOperator?: 'gt' | 'gte' | 'lt' | 'lte';
  
  // Predictive
  predictionWindow?: number; // hours
  scaleFactor?: number;
  
  // Scheduled
  schedule?: string; // cron expression
  minSize?: number;
  maxSize?: number;
  desiredCapacity?: number;
}

export interface StepAdjustment {
  metricIntervalLowerBound?: number;
  metricIntervalUpperBound?: number;
  scalingAdjustment: number;
}

export interface ScalingRecommendation {
  id: string;
  type: 'scale_up' | 'scale_down' | 'configuration_change';
  priority: 'high' | 'medium' | 'low';
  reason: string;
  currentCapacity: number;
  recommendedCapacity: number;
  expectedImpact: string;
  confidence: number;
}

export interface ScalingAlert {
  id: string;
  type: 'scale_up_failed' | 'scale_down_failed' | 'capacity_limit' | 'health_check_failed' | 'cost_threshold';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metrics: Record<string, number>;
  triggeredAt: string;
  acknowledged: boolean;
  resolvedAt?: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const autoScalingGroups = new Map<string, AutoScalingGroup>();
const scalingAlerts = new Map<string, ScalingAlert[]>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function evaluateScalingPolicy(
  policy: ScalingPolicy,
  metrics: MetricSnapshot
): { shouldScale: boolean; adjustment: number; reason: string } {
  if (!policy.enabled) {
    return { shouldScale: false, adjustment: 0, reason: 'Policy disabled' };
  }

  const config = policy.configuration;

  switch (policy.type) {
    case 'target_tracking': {
      const targetValue = config.targetValue || 60;
      const metricName = config.metricName || 'cpuUtilization';
      const currentValue = (metrics as any)[metricName] || 0;
      
      const deviation = currentValue - targetValue;
      const threshold = 10; // 10% deviation threshold
      
      if (Math.abs(deviation) > threshold) {
        const adjustment = Math.ceil(deviation / 10); // 1 instance per 10% deviation
        return {
          shouldScale: true,
          adjustment,
          reason: `${metricName} at ${currentValue.toFixed(1)}%, target is ${targetValue}%`,
        };
      }
      break;
    }

    case 'step_scaling': {
      const metricValue = metrics.cpuUtilization;
      const adjustments = config.stepAdjustments || [];
      
      for (const step of adjustments) {
        const lowerBound = step.metricIntervalLowerBound ?? -Infinity;
        const upperBound = step.metricIntervalUpperBound ?? Infinity;
        
        if (metricValue >= lowerBound && metricValue < upperBound) {
          return {
            shouldScale: true,
            adjustment: step.scalingAdjustment,
            reason: `Metric in range [${lowerBound}, ${upperBound})`,
          };
        }
      }
      break;
    }

    case 'simple_scaling': {
      const metricValue = metrics.cpuUtilization;
      const threshold = config.threshold || 70;
      const comparison = config.comparisonOperator || 'gt';
      const adjustment = config.scalingAdjustment || 1;
      
      let conditionMet = false;
      switch (comparison) {
        case 'gt': conditionMet = metricValue > threshold; break;
        case 'gte': conditionMet = metricValue >= threshold; break;
        case 'lt': conditionMet = metricValue < threshold; break;
        case 'lte': conditionMet = metricValue <= threshold; break;
      }
      
      if (conditionMet) {
        return {
          shouldScale: true,
          adjustment: metricValue > threshold ? adjustment : -adjustment,
          reason: `${metricValue.toFixed(1)}% ${comparison} ${threshold}%`,
        };
      }
      break;
    }

    case 'predictive': {
      // Predictive scaling would use ML models
      // Simplified implementation
      const scaleFactor = config.scaleFactor || 1.2;
      const predictionWindow = config.predictionWindow || 1;
      
      // Simulate prediction
      const predictedLoad = metrics.requestRate * scaleFactor;
      const currentCapacity = metrics.instances;
      const requiredCapacity = Math.ceil(predictedLoad / 100); // 100 requests per instance
      
      if (requiredCapacity > currentCapacity) {
        return {
          shouldScale: true,
          adjustment: requiredCapacity - currentCapacity,
          reason: `Predicted load requires ${requiredCapacity} instances`,
        };
      }
      break;
    }

    case 'scheduled': {
      const schedule = config.schedule || '0 9 * * 1-5'; // 9 AM Monday-Friday
      const now = new Date();
      const hour = now.getHours();
      const day = now.getDay();
      
      // Simple schedule check (9 AM - 5 PM, Monday-Friday)
      if (hour >= 9 && hour < 17 && day >= 1 && day <= 5) {
        const desiredCapacity = config.desiredCapacity || 5;
        const currentCapacity = metrics.instances;
        
        if (currentCapacity !== desiredCapacity) {
          return {
            shouldScale: true,
            adjustment: desiredCapacity - currentCapacity,
            reason: `Scheduled scaling to ${desiredCapacity} instances`,
          };
        }
      }
      break;
    }
  }

  return { shouldScale: false, adjustment: 0, reason: 'No scaling needed' };
}

function checkCooldown(
  group: AutoScalingGroup,
  policyId: string
): boolean {
  const policy = group.policies.find(p => p.id === policyId);
  if (!policy) return true;

  if (!policy.lastTriggered) return true;

  const lastTriggered = new Date(policy.lastTriggered).getTime();
  const now = Date.now();
  const cooldownMs = (policy.cooldown || group.configuration.cooldownPeriod) * 1000;

  return now - lastTriggered >= cooldownMs;
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createAutoScalingGroup(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelVersion: string;
  configuration: AutoScalingConfiguration;
  policies?: Omit<ScalingPolicy, 'id'>[];
  createdBy: string;
}): AutoScalingGroup {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultPolicies: ScalingPolicy[] = [
    {
      id: randomUUID(),
      name: 'CPU Target Tracking',
      type: 'target_tracking',
      enabled: true,
      configuration: {
        targetValue: 60,
        metricName: 'cpuUtilization',
      },
      cooldown: 300,
    },
    {
      id: randomUUID(),
      name: 'Request Rate Scaling',
      type: 'step_scaling',
      enabled: true,
      configuration: {
        adjustmentType: 'change_in_capacity',
        stepAdjustments: [
          { metricIntervalLowerBound: 0, metricIntervalUpperBound: 100, scalingAdjustment: 1 },
          { metricIntervalLowerBound: 100, metricIntervalUpperBound: 500, scalingAdjustment: 2 },
          { metricIntervalLowerBound: 500, scalingAdjustment: 3 },
        ],
      },
      cooldown: 300,
    },
  ];

  const group: AutoScalingGroup = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'active',
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    configuration: params.configuration,
    currentCapacity: {
      instances: [],
      totalInstances: params.configuration.desiredInstances,
      healthyInstances: params.configuration.desiredInstances,
      unhealthyInstances: 0,
      pendingInstances: 0,
      terminatingInstances: 0,
      cpuUtilization: 50,
      memoryUtilization: 50,
      requestRate: 100,
      latency: 100,
      collectedAt: now,
    },
    scalingHistory: [],
    metrics: {
      current: {
        timestamp: now,
        cpuUtilization: 50,
        memoryUtilization: 50,
        requestRate: 100,
        latency: 100,
        errorRate: 1,
        concurrentUsers: 50,
        instances: params.configuration.desiredInstances,
      },
      history: [],
      predictions: [],
      scalingEffectiveness: {
        scaleUpSuccessRate: 100,
        scaleDownSuccessRate: 100,
        averageScaleUpTime: 120,
        averageScaleDownTime: 60,
        overProvisioningRate: 5,
        underProvisioningRate: 2,
        costEfficiency: 90,
      },
    },
    policies: params.policies?.map(p => ({ ...p, id: randomUUID() })) || defaultPolicies,
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  autoScalingGroups.set(id, group);
  scalingAlerts.set(id, []);

  return group;
}

export function getAutoScalingGroup(id: string): AutoScalingGroup | undefined {
  return autoScalingGroups.get(id);
}

export function listAutoScalingGroups(
  organizationId: string,
  filters?: { status?: AutoScalingStatus; modelId?: string }
): AutoScalingGroup[] {
  let result = Array.from(autoScalingGroups.values()).filter(
    g => g.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(g => g.status === filters.status);
  if (filters?.modelId) result = result.filter(g => g.modelId === filters.modelId);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateAutoScalingConfiguration(
  groupId: string,
  updates: Partial<AutoScalingConfiguration>
): AutoScalingGroup {
  const group = autoScalingGroups.get(groupId);
  if (!group) throw new Error(`Auto-scaling group ${groupId} not found`);

  Object.assign(group.configuration, updates);
  group.updatedAt = new Date().toISOString();

  return group;
}

export function addScalingPolicy(
  groupId: string,
  policy: Omit<ScalingPolicy, 'id'>
): AutoScalingGroup {
  const group = autoScalingGroups.get(groupId);
  if (!group) throw new Error(`Auto-scaling group ${groupId} not found`);

  const newPolicy: ScalingPolicy = {
    ...policy,
    id: randomUUID(),
  };

  group.policies.push(newPolicy);
  group.updatedAt = new Date().toISOString();

  return group;
}

export function updateScalingPolicy(
  groupId: string,
  policyId: string,
  updates: Partial<ScalingPolicy>
): AutoScalingGroup {
  const group = autoScalingGroups.get(groupId);
  if (!group) throw new Error(`Auto-scaling group ${groupId} not found`);

  const policy = group.policies.find(p => p.id === policyId);
  if (!policy) throw new Error(`Policy ${policyId} not found`);

  Object.assign(policy, updates);
  group.updatedAt = new Date().toISOString();

  return group;
}

export function removeScalingPolicy(groupId: string, policyId: string): AutoScalingGroup {
  const group = autoScalingGroups.get(groupId);
  if (!group) throw new Error(`Auto-scaling group ${groupId} not found`);

  group.policies = group.policies.filter(p => p.id !== policyId);
  group.updatedAt = new Date().toISOString();

  return group;
}

export function updateMetrics(
  groupId: string,
  metrics: Partial<MetricSnapshot>
): AutoScalingGroup {
  const group = autoScalingGroups.get(groupId);
  if (!group) throw new Error(`Auto-scaling group ${groupId} not found`);

  const now = new Date().toISOString();
  const currentMetrics = { ...group.metrics.current, ...metrics, timestamp: now };

  group.metrics.current = currentMetrics;
  group.metrics.history.push(currentMetrics);

  // Keep only last 1000 metrics
  if (group.metrics.history.length > 1000) {
    group.metrics.history = group.metrics.history.slice(-1000);
  }

  // Update current capacity
  group.currentCapacity.cpuUtilization = currentMetrics.cpuUtilization;
  group.currentCapacity.memoryUtilization = currentMetrics.memoryUtilization;
  group.currentCapacity.gpuUtilization = currentMetrics.gpuUtilization;
  group.currentCapacity.requestRate = currentMetrics.requestRate;
  group.currentCapacity.latency = currentMetrics.latency;
  group.currentCapacity.collectedAt = now;

  // Evaluate scaling policies
  if (group.status === 'active') {
    evaluateScaling(group);
  }

  group.updatedAt = now;
  return group;
}

function evaluateScaling(group: AutoScalingGroup): void {
  for (const policy of group.policies) {
    if (!policy.enabled) continue;

    // Check cooldown
    if (!checkCooldown(group, policy.id)) continue;

    const evaluation = evaluateScalingPolicy(policy, group.metrics.current);

    if (evaluation.shouldScale) {
      const newCapacity = Math.max(
        group.configuration.minInstances,
        Math.min(
          group.configuration.maxInstances,
          group.currentCapacity.totalInstances + evaluation.adjustment
        )
      );

      if (newCapacity !== group.currentCapacity.totalInstances) {
        triggerScaling(group, policy, newCapacity, evaluation.reason);
      }
    }
  }
}

function triggerScaling(
  group: AutoScalingGroup,
  policy: ScalingPolicy,
  newCapacity: number,
  reason: string
): void {
  const now = new Date().toISOString();
  const eventType: ScalingEventType = newCapacity > group.currentCapacity.totalInstances
    ? 'scale_up'
    : 'scale_down';

  const event: ScalingEvent = {
    id: randomUUID(),
    timestamp: now,
    type: eventType,
    trigger: {
      type: 'metric',
      policyId: policy.id,
    },
    fromCapacity: group.currentCapacity.totalInstances,
    toCapacity: newCapacity,
    reason,
    status: 'initiated',
  };

  group.scalingHistory.push(event);
  group.status = 'scaling';
  policy.lastTriggered = now;

  // Simulate scaling
  setTimeout(() => {
    completeScaling(group, event);
  }, 2000);
}

function completeScaling(group: AutoScalingGroup, event: ScalingEvent): void {
  const now = new Date().toISOString();

  event.status = 'completed';
  event.duration = (new Date(now).getTime() - new Date(event.timestamp).getTime()) / 1000;

  group.currentCapacity.totalInstances = event.toCapacity;
  group.currentCapacity.healthyInstances = event.toCapacity;
  group.status = 'active';
  group.updatedAt = now;

  // Update scaling effectiveness
  if (event.type === 'scale_up') {
    group.metrics.scalingEffectiveness.averageScaleUpTime = 
      (group.metrics.scalingEffectiveness.averageScaleUpTime + event.duration!) / 2;
  } else if (event.type === 'scale_down') {
    group.metrics.scalingEffectiveness.averageScaleDownTime = 
      (group.metrics.scalingEffectiveness.averageScaleDownTime + event.duration!) / 2;
  }
}

export function manualScale(
  groupId: string,
  desiredCapacity: number,
  reason: string
): ScalingEvent {
  const group = autoScalingGroups.get(groupId);
  if (!group) throw new Error(`Auto-scaling group ${groupId} not found`);

  if (desiredCapacity < group.configuration.minInstances || desiredCapacity > group.configuration.maxInstances) {
    throw new Error('Desired capacity outside allowed range');
  }

  const now = new Date().toISOString();
  const event: ScalingEvent = {
    id: randomUUID(),
    timestamp: now,
    type: 'manual_scale',
    trigger: { type: 'manual' },
    fromCapacity: group.currentCapacity.totalInstances,
    toCapacity: desiredCapacity,
    reason,
    status: 'initiated',
  };

  group.scalingHistory.push(event);
  group.status = 'scaling';

  setTimeout(() => {
    completeScaling(group, event);
  }, 2000);

  group.updatedAt = now;
  return event;
}

export function pauseAutoScaling(groupId: string): AutoScalingGroup {
  const group = autoScalingGroups.get(groupId);
  if (!group) throw new Error(`Auto-scaling group ${groupId} not found`);

  group.status = 'paused';
  group.updatedAt = new Date().toISOString();

  return group;
}

export function resumeAutoScaling(groupId: string): AutoScalingGroup {
  const group = autoScalingGroups.get(groupId);
  if (!group) throw new Error(`Auto-scaling group ${groupId} not found`);

  group.status = 'active';
  group.updatedAt = new Date().toISOString();

  return group;
}

export function getScalingHistory(
  groupId: string,
  filters?: { type?: ScalingEventType; limit?: number }
): ScalingEvent[] {
  const group = autoScalingGroups.get(groupId);
  if (!group) throw new Error(`Auto-scaling group ${groupId} not found`);

  let history = group.scalingHistory;

  if (filters?.type) {
    history = history.filter(e => e.type === filters.type);
  }

  history = history.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (filters?.limit) {
    history = history.slice(0, filters.limit);
  }

  return history;
}

export function getScalingRecommendations(groupId: string): ScalingRecommendation[] {
  const group = autoScalingGroups.get(groupId);
  if (!group) throw new Error(`Auto-scaling group ${groupId} not found`);

  const recommendations: ScalingRecommendation[] = [];
  const metrics = group.metrics.current;
  const capacity = group.currentCapacity;

  // Check for over-provisioning
  if (metrics.cpuUtilization < 30 && metrics.memoryUtilization < 30 && capacity.totalInstances > group.configuration.minInstances) {
    const recommendedCapacity = Math.max(
      group.configuration.minInstances,
      Math.ceil(capacity.totalInstances * 0.7)
    );

    recommendations.push({
      id: randomUUID(),
      type: 'scale_down',
      priority: 'medium',
      reason: 'Low resource utilization indicates over-provisioning',
      currentCapacity: capacity.totalInstances,
      recommendedCapacity,
      expectedImpact: `Save ${(capacity.totalInstances - recommendedCapacity) * 100}$/month`,
      confidence: 0.85,
    });
  }

  // Check for under-provisioning
  if (metrics.cpuUtilization > 80 || metrics.latency > 200) {
    const recommendedCapacity = Math.min(
      group.configuration.maxInstances,
      Math.ceil(capacity.totalInstances * 1.3)
    );

    recommendations.push({
      id: randomUUID(),
      type: 'scale_up',
      priority: 'high',
      reason: 'High resource utilization or latency indicates under-provisioning',
      currentCapacity: capacity.totalInstances,
      recommendedCapacity,
      expectedImpact: 'Improve performance and reduce latency',
      confidence: 0.9,
    });
  }

  // Check scaling policy effectiveness
  if (group.metrics.scalingEffectiveness.overProvisioningRate > 20) {
    recommendations.push({
      id: randomUUID(),
      type: 'configuration_change',
      priority: 'medium',
      reason: 'High over-provisioning rate detected',
      currentCapacity: capacity.totalInstances,
      recommendedCapacity: capacity.totalInstances,
      expectedImpact: 'Reduce costs by optimizing scaling policies',
      confidence: 0.8,
    });
  }

  return recommendations;
}

export function getScalingAlerts(groupId: string): ScalingAlert[] {
  return scalingAlerts.get(groupId) || [];
}

export function acknowledgeScalingAlert(groupId: string, alertId: string): ScalingAlert {
  const alerts = scalingAlerts.get(groupId) || [];
  const alert = alerts.find(a => a.id === alertId);
  if (!alert) throw new Error(`Alert ${alertId} not found`);

  alert.acknowledged = true;
  return alert;
}

export function getScalingMetrics(groupId: string): ScalingMetrics {
  const group = autoScalingGroups.get(groupId);
  if (!group) throw new Error(`Auto-scaling group ${groupId} not found`);

  return group.metrics;
}
