/**
 * Module 67: AI Scaling Strategy Service
 *
 * Provides AI-specific scaling strategy management including horizontal scaling,
 * vertical scaling, auto-scaling policies, scaling triggers, scaling cost optimization,
 * resource right-sizing, and reserved capacity planning.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AIScalingStrategy {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: ScalingType;
  scope: ScalingScope;
  policies: ScalingPolicy[];
  triggers: ScalingTrigger[];
  cooldown: ScalingCooldown;
  constraints: ScalingConstraints;
  costOptimization: CostOptimization;
  status: ScalingStrategyStatus;
  lastScalingEvent?: string;
  scalingHistory: ScalingEvent[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ScalingType = 'horizontal' | 'vertical' | 'auto' | 'scheduled' | 'predictive';

export type ScalingStrategyStatus = 'active' | 'paused' | 'disabled' | 'testing';

export interface ScalingScope {
  targetModels?: string[];
  targetDeployments?: string[];
  targetRegions?: string[];
  workloadTypes?: string[];
}

export interface ScalingPolicy {
  id: string;
  name: string;
  description: string;
  direction: 'scale-up' | 'scale-down';
  resourceType: ResourceType;
  action: ScalingAction;
  priority: number;
  enabled: boolean;
}

export type ResourceType =
  | 'gpu-count'
  | 'gpu-memory-gb'
  | 'cpu-cores'
  | 'memory-gb'
  | 'storage-gb'
  | 'inference-instances'
  | 'training-instances';

export interface ScalingAction {
  type: 'add' | 'remove' | 'set' | 'percentage';
  value: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface ScalingTrigger {
  id: string;
  name: string;
  description: string;
  metric: ScalingMetric;
  condition: ScalingCondition;
  cooldownSeconds: number;
  enabled: boolean;
  lastTriggeredAt?: string;
}

export interface ScalingMetric {
  type: MetricType;
  source: MetricSource;
  aggregation: MetricAggregation;
  windowSeconds: number;
}

export type MetricType =
  | 'gpu-utilization'
  | 'cpu-utilization'
  | 'memory-utilization'
  | 'queue-length'
  | 'inference-latency'
  | 'request-rate'
  | 'error-rate'
  | 'custom';

export type MetricSource =
  | 'monitoring-service'
  | 'load-balancer'
  | 'application'
  | 'custom';

export type MetricAggregation = 'average' | 'max' | 'min' | 'sum' | 'p50' | 'p90' | 'p95' | 'p99';

export interface ScalingCondition {
  operator: 'greater-than' | 'less-than' | 'equals' | 'between';
  threshold: number;
  upperThreshold?: number; // for 'between' operator
  durationSeconds: number; // must sustain for this duration
}

export interface ScalingCooldown {
  scaleUpSeconds: number;
  scaleDownSeconds: number;
  stabilizationSeconds: number;
  lastScaleUpAt?: string;
  lastScaleDownAt?: string;
}

export interface ScalingConstraints {
  minCapacity: CapacityConstraint[];
  maxCapacity: CapacityConstraint[];
  budgetLimit?: BudgetConstraint;
  timeWindows?: TimeWindowConstraint[];
  approvalRequired: boolean;
  approvalThreshold: number; // cost threshold for approval
}

export interface CapacityConstraint {
  resourceType: ResourceType;
  min: number;
  max: number;
}

export interface BudgetConstraint {
  monthlyLimit: number;
  currency: string;
  currentSpend: number;
  alertThreshold: number; // percentage
}

export interface TimeWindowConstraint {
  name: string;
  daysOfWeek: number[]; // 0-6 (Sunday-Saturday)
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  timezone: string;
  scalingAllowed: boolean;
}

export interface CostOptimization {
  rightSizing: RightSizingConfig;
  reservedCapacity: ReservedCapacityConfig;
  spotInstances: SpotInstanceConfig;
  scheduleScaling: ScheduleScalingConfig;
  estimatedSavings: number;
  currency: string;
}

export interface RightSizingConfig {
  enabled: boolean;
  analysisWindowDays: number;
  underutilizationThreshold: number; // percentage
  overutilizationThreshold: number; // percentage
  recommendations: RightSizingRecommendation[];
}

export interface RightSizingRecommendation {
  id: string;
  resourceType: ResourceType;
  currentSize: string;
  recommendedSize: string;
  currentCost: number;
  recommendedCost: number;
  savings: number;
  confidence: number;
  rationale: string;
}

export interface ReservedCapacityConfig {
  enabled: boolean;
  term: '1-year' | '3-year';
  paymentOption: 'all-upfront' | 'partial-upfront' | 'no-upfront';
  coverage: number; // percentage of workload to cover
  estimatedSavings: number;
  reservations: ReservedCapacityReservation[];
}

export interface ReservedCapacityReservation {
  id: string;
  resourceType: ResourceType;
  quantity: number;
  term: string;
  startDate: string;
  endDate: string;
  monthlyCost: number;
  utilizationPercent: number;
}

export interface SpotInstanceConfig {
  enabled: boolean;
  maxSpotPercent: number; // percentage of capacity that can be spot
  interruptionTolerance: 'low' | 'medium' | 'high';
  fallbackToOnDemand: boolean;
  estimatedSavings: number;
}

export interface ScheduleScalingConfig {
  enabled: boolean;
  schedules: ScalingSchedule[];
}

export interface ScalingSchedule {
  id: string;
  name: string;
  cron: string; // cron expression
  timezone: string;
  action: ScalingAction;
  resourceType: ResourceType;
  duration?: string; // ISO 8601 duration
  enabled: boolean;
}

export interface ScalingEvent {
  id: string;
  timestamp: string;
  trigger: string;
  direction: 'scale-up' | 'scale-down';
  resourceType: ResourceType;
  previousCapacity: number;
  newCapacity: number;
  reason: string;
  status: 'success' | 'failed' | 'pending';
  cost?: number;
  duration?: number; // seconds
  error?: string;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const scalingStrategies = new Map<string, AIScalingStrategy>();

// ─── Scaling Strategy Management ───────────────────────────────────────────────

/**
 * Create a scaling strategy
 */
export async function createScalingStrategy(
  organizationId: string,
  strategy: Omit<AIScalingStrategy, 'id' | 'scalingHistory' | 'createdAt' | 'updatedAt'>,
  createdBy: string
): Promise<AIScalingStrategy> {
  const id = `scaling_${randomUUID()}`;
  const now = new Date().toISOString();

  const newStrategy: AIScalingStrategy = {
    ...strategy,
    id,
    organizationId,
    scalingHistory: [],
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  scalingStrategies.set(id, newStrategy);
  return newStrategy;
}

/**
 * Update scaling strategy
 */
export async function updateScalingStrategy(
  strategyId: string,
  updates: Partial<Omit<AIScalingStrategy, 'id' | 'organizationId' | 'createdAt'>>
): Promise<AIScalingStrategy | null> {
  const strategy = scalingStrategies.get(strategyId);
  if (!strategy) return null;

  const updated: AIScalingStrategy = {
    ...strategy,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  scalingStrategies.set(strategyId, updated);
  return updated;
}

/**
 * Add scaling policy
 */
export async function addScalingPolicy(
  strategyId: string,
  policy: Omit<ScalingPolicy, 'id'>
): Promise<ScalingPolicy | null> {
  const strategy = scalingStrategies.get(strategyId);
  if (!strategy) return null;

  const newPolicy: ScalingPolicy = {
    ...policy,
    id: `policy_${randomUUID()}`,
  };

  strategy.policies.push(newPolicy);
  strategy.updatedAt = new Date().toISOString();

  scalingStrategies.set(strategyId, strategy);
  return newPolicy;
}

/**
 * Add scaling trigger
 */
export async function addScalingTrigger(
  strategyId: string,
  trigger: Omit<ScalingTrigger, 'id'>
): Promise<ScalingTrigger | null> {
  const strategy = scalingStrategies.get(strategyId);
  if (!strategy) return null;

  const newTrigger: ScalingTrigger = {
    ...trigger,
    id: `trigger_${randomUUID()}`,
  };

  strategy.triggers.push(newTrigger);
  strategy.updatedAt = new Date().toISOString();

  scalingStrategies.set(strategyId, strategy);
  return newTrigger;
}

/**
 * Evaluate scaling triggers
 */
export async function evaluateScalingTriggers(
  strategyId: string,
  currentMetrics: MetricValue[]
): Promise<ScalingDecision | null> {
  const strategy = scalingStrategies.get(strategyId);
  if (!strategy || strategy.status !== 'active') return null;

  const now = new Date();

  // Check cooldown
  if (strategy.cooldown.lastScaleUpAt) {
    const lastScaleUp = new Date(strategy.cooldown.lastScaleUpAt);
    const secondsSinceScaleUp = (now.getTime() - lastScaleUp.getTime()) / 1000;
    if (secondsSinceScaleUp < strategy.cooldown.scaleUpSeconds) {
      return null; // Still in cooldown
    }
  }

  if (strategy.cooldown.lastScaleDownAt) {
    const lastScaleDown = new Date(strategy.cooldown.lastScaleDownAt);
    const secondsSinceScaleDown = (now.getTime() - lastScaleDown.getTime()) / 1000;
    if (secondsSinceScaleDown < strategy.cooldown.scaleDownSeconds) {
      return null; // Still in cooldown
    }
  }

  // Evaluate triggers
  for (const trigger of strategy.triggers) {
    if (!trigger.enabled) continue;

    const metric = currentMetrics.find(
      (m) => m.type === trigger.metric.type && m.source === trigger.metric.source
    );

    if (!metric) continue;

    const conditionMet = evaluateCondition(metric.value, trigger.condition);

    if (conditionMet) {
      // Find matching policy
      const policy = strategy.policies.find(
        (p) => p.enabled && p.direction === (metric.value > trigger.condition.threshold ? 'scale-up' : 'scale-down')
      );

      if (policy) {
        return {
          shouldScale: true,
          trigger: trigger.name,
          policy: policy.name,
          direction: policy.direction,
          resourceType: policy.resourceType,
          action: policy.action,
          reason: `${trigger.name} triggered: ${metric.value} ${trigger.condition.operator} ${trigger.condition.threshold}`,
        };
      }
    }
  }

  return { shouldScale: false };
}

/**
 * Execute scaling action
 */
export async function executeScalingAction(
  strategyId: string,
  decision: ScalingDecision,
  currentCapacity: number
): Promise<ScalingEvent | null> {
  const strategy = scalingStrategies.get(strategyId);
  if (!strategy) return null;

  // Check constraints
  const constraint = strategy.constraints.minCapacity.find(
    (c) => c.resourceType === decision.resourceType
  );
  const maxConstraint = strategy.constraints.maxCapacity.find(
    (c) => c.resourceType === decision.resourceType
  );

  let newCapacity = currentCapacity;

  // Calculate new capacity based on action
  switch (decision.action.type) {
    case 'add':
      newCapacity = currentCapacity + decision.action.value;
      break;
    case 'remove':
      newCapacity = currentCapacity - decision.action.value;
      break;
    case 'set':
      newCapacity = decision.action.value;
      break;
    case 'percentage':
      const change = Math.round(currentCapacity * (decision.action.value / 100));
      newCapacity = decision.direction === 'scale-up' 
        ? currentCapacity + change 
        : currentCapacity - change;
      break;
  }

  // Apply min/max constraints
  if (constraint) {
    newCapacity = Math.max(constraint.min, newCapacity);
  }
  if (maxConstraint) {
    newCapacity = Math.min(maxConstraint.max, newCapacity);
  }

  // Apply step if defined
  if (decision.action.step) {
    newCapacity = Math.round(newCapacity / decision.action.step) * decision.action.step;
  }

  // Check if capacity actually changed
  if (newCapacity === currentCapacity) {
    return null;
  }

  // Check budget constraint
  if (strategy.constraints.budgetLimit) {
    const budget = strategy.constraints.budgetLimit;
    if (budget.currentSpend >= budget.monthlyLimit) {
      return null; // Budget exceeded
    }
  }

  // Create scaling event
  const event: ScalingEvent = {
    id: `event_${randomUUID()}`,
    timestamp: new Date().toISOString(),
    trigger: decision.trigger,
    direction: decision.direction,
    resourceType: decision.resourceType,
    previousCapacity: currentCapacity,
    newCapacity,
    reason: decision.reason,
    status: 'success',
  };

  // Update strategy
  strategy.scalingHistory.push(event);
  strategy.lastScalingEvent = event.timestamp;

  if (decision.direction === 'scale-up') {
    strategy.cooldown.lastScaleUpAt = event.timestamp;
  } else {
    strategy.cooldown.lastScaleDownAt = event.timestamp;
  }

  strategy.updatedAt = new Date().toISOString();
  scalingStrategies.set(strategyId, strategy);

  return event;
}

/**
 * Generate right-sizing recommendations
 */
export async function generateRightSizingRecommendations(
  strategyId: string,
  utilizationData: ResourceUtilizationData[]
): Promise<RightSizingRecommendation[] | null> {
  const strategy = scalingStrategies.get(strategyId);
  if (!strategy) return null;

  if (!strategy.costOptimization.rightSizing.enabled) {
    return [];
  }

  const recommendations: RightSizingRecommendation[] = [];
  const underThreshold = strategy.costOptimization.rightSizing.underutilizationThreshold;
  const overThreshold = strategy.costOptimization.rightSizing.overutilizationThreshold;

  for (const data of utilizationData) {
    const avgUtilization = data.utilizationPoints.reduce((sum, p) => sum + p, 0) / data.utilizationPoints.length;

    if (avgUtilization < underThreshold) {
      // Under-utilized - recommend scale down
      const recommendedSize = Math.max(1, Math.ceil(data.currentCapacity * (avgUtilization / 70)));
      const savings = (data.currentCapacity - recommendedSize) * data.costPerUnit;

      recommendations.push({
        id: `rs_${randomUUID()}`,
        resourceType: data.resourceType,
        currentSize: `${data.currentCapacity} ${data.unit}`,
        recommendedSize: `${recommendedSize} ${data.unit}`,
        currentCost: data.currentCapacity * data.costPerUnit,
        recommendedCost: recommendedSize * data.costPerUnit,
        savings,
        confidence: 0.85,
        rationale: `Average utilization is ${avgUtilization.toFixed(1)}%, which is below the ${underThreshold}% threshold. Consider reducing capacity to optimize costs.`,
      });
    } else if (avgUtilization > overThreshold) {
      // Over-utilized - recommend scale up
      const recommendedSize = Math.ceil(data.currentCapacity * (avgUtilization / 70));
      const additionalCost = (recommendedSize - data.currentCapacity) * data.costPerUnit;

      recommendations.push({
        id: `rs_${randomUUID()}`,
        resourceType: data.resourceType,
        currentSize: `${data.currentCapacity} ${data.unit}`,
        recommendedSize: `${recommendedSize} ${data.unit}`,
        currentCost: data.currentCapacity * data.costPerUnit,
        recommendedCost: recommendedSize * data.costPerUnit,
        savings: -additionalCost,
        confidence: 0.9,
        rationale: `Average utilization is ${avgUtilization.toFixed(1)}%, which is above the ${overThreshold}% threshold. Consider increasing capacity to prevent performance issues.`,
      });
    }
  }

  strategy.costOptimization.rightSizing.recommendations = recommendations;
  strategy.costOptimization.estimatedSavings = recommendations
    .filter((r) => r.savings > 0)
    .reduce((sum, r) => sum + r.savings, 0);

  strategy.updatedAt = new Date().toISOString();
  scalingStrategies.set(strategyId, strategy);

  return recommendations;
}

/**
 * Plan reserved capacity
 */
export async function planReservedCapacity(
  strategyId: string,
  baselineUsage: ResourceUsage[]
): Promise<ReservedCapacityConfig | null> {
  const strategy = scalingStrategies.get(strategyId);
  if (!strategy) return null;

  if (!strategy.costOptimization.reservedCapacity.enabled) {
    return null;
  }

  const reservations: ReservedCapacityReservation[] = [];
  const term = strategy.costOptimization.reservedCapacity.term;
  const coverage = strategy.costOptimization.reservedCapacity.coverage / 100;

  for (const usage of baselineUsage) {
    const reservedQuantity = Math.ceil(usage.averageUsage * coverage);
    const monthlyOnDemandCost = usage.averageUsage * usage.costPerUnit;
    
    // Reserved capacity discount (typical 30-60%)
    const discountRate = term === '3-year' ? 0.5 : 0.35;
    const monthlyReservedCost = monthlyOnDemandCost * (1 - discountRate);
    const savings = monthlyOnDemandCost - monthlyReservedCost;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + (term === '3-year' ? 3 : 1));

    reservations.push({
      id: `res_${randomUUID()}`,
      resourceType: usage.resourceType,
      quantity: reservedQuantity,
      term,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      monthlyCost: monthlyReservedCost,
      utilizationPercent: 100,
    });
  }

  const estimatedSavings = reservations.reduce((sum, r) => {
    const onDemandCost = r.quantity * baselineUsage.find(u => u.resourceType === r.resourceType)!.costPerUnit;
    return sum + (onDemandCost - r.monthlyCost) * 12;
  }, 0);

  strategy.costOptimization.reservedCapacity.reservations = reservations;
  strategy.costOptimization.reservedCapacity.estimatedSavings = estimatedSavings;
  strategy.costOptimization.estimatedSavings += estimatedSavings;

  strategy.updatedAt = new Date().toISOString();
  scalingStrategies.set(strategyId, strategy);

  return strategy.costOptimization.reservedCapacity;
}

/**
 * Get scaling strategy by ID
 */
export async function getScalingStrategy(strategyId: string): Promise<AIScalingStrategy | null> {
  return scalingStrategies.get(strategyId) || null;
}

/**
 * List scaling strategies for an organization
 */
export async function listScalingStrategies(
  organizationId: string,
  filters?: { status?: ScalingStrategyStatus; type?: ScalingType }
): Promise<AIScalingStrategy[]> {
  const allStrategies = Array.from(scalingStrategies.values()).filter(
    (s) => s.organizationId === organizationId
  );

  return allStrategies.filter((s) => {
    if (filters?.status && s.status !== filters.status) return false;
    if (filters?.type && s.type !== filters.type) return false;
    return true;
  });
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function evaluateCondition(value: number, condition: ScalingCondition): boolean {
  switch (condition.operator) {
    case 'greater-than':
      return value > condition.threshold;
    case 'less-than':
      return value < condition.threshold;
    case 'equals':
      return value === condition.threshold;
    case 'between':
      return value >= condition.threshold && value <= (condition.upperThreshold || condition.threshold);
    default:
      return false;
  }
}

// ─── Helper Types ──────────────────────────────────────────────────────────────

export interface MetricValue {
  type: MetricType;
  source: MetricSource;
  value: number;
  timestamp: string;
}

export interface ScalingDecision {
  shouldScale: boolean;
  trigger?: string;
  policy?: string;
  direction?: 'scale-up' | 'scale-down';
  resourceType?: ResourceType;
  action?: ScalingAction;
  reason?: string;
}

export interface ResourceUtilizationData {
  resourceType: ResourceType;
  currentCapacity: number;
  unit: string;
  costPerUnit: number;
  utilizationPoints: number[]; // percentage values
}

export interface ResourceUsage {
  resourceType: ResourceType;
  averageUsage: number;
  peakUsage: number;
  costPerUnit: number;
}
