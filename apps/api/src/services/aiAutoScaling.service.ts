/**
 * Module 58: AI Auto-Scaling Service
 *
 * Provides AI-workload-specific auto-scaling including reactive, predictive, and
 * scheduled scaling policies, GPU/TPU-aware scaling decisions, model-specific
 * scaling profiles, scaling constraints with cooldown management, and comprehensive
 * scaling event history and analytics.
 *
 * Phase 1 — Critical Gap: AI-workload-specific auto-scaling infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScalingPolicyType = "reactive" | "predictive" | "scheduled" | "hybrid";

export type ScalingDirection = "scale-up" | "scale-down" | "none";

export type ScalingMetricType = "gpu-utilization" | "queue-depth" | "inference-latency" | "batch-saturation" | "memory-usage" | "request-rate" | "error-rate" | "cpu-utilization" | "custom";

export type ScalingEventStatus = "triggered" | "in-progress" | "completed" | "failed" | "cancelled" | "cooldown";

export type ScalingStrategy = "add-replicas" | "remove-replicas" | "resize-instance" | "add-gpu" | "remove-gpu" | "switch-instance-type";

export type ScalingPolicyStatus = "active" | "paused" | "disabled" | "error";

export interface AutoScalingPolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: ScalingPolicyStatus;
  policyType: ScalingPolicyType;
  targetModel: ScalingTarget;
  scalingRules: ScalingRule[];
  constraints: ScalingConstraints;
  predictiveConfig?: PredictiveScalingConfig;
  scheduleConfig?: ScheduledScalingConfig;
  cooldownConfig: CooldownConfig;
  scalingHistory: ScalingEvent[];
  currentReplicas: number;
  desiredReplicas: number;
  lastScalingAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScalingTarget {
  modelId: string;
  modelName: string;
  deploymentId: string;
  namespace?: string;
  clusterName?: string;
  minReplicas: number;
  maxReplicas: number;
  currentReplicas: number;
  instanceType: string;
  gpuPerReplica: number;
  memoryPerReplicaMb: number;
}

export interface ScalingRule {
  id: string;
  name: string;
  metric: ScalingMetricType;
  metricPath?: string;
  operator: "gt" | "gte" | "lt" | "lte" | "eq" | "between";
  threshold: number;
  upperThreshold?: number;
  windowSeconds: number;
  direction: ScalingDirection;
  action: ScalingAction;
  priority: number;
  enabled: boolean;
}

export interface ScalingAction {
  strategy: ScalingStrategy;
  replicaChange?: number;
  replicaMultiplier?: number;
  targetInstanceType?: string;
  targetGpuCount?: number;
  minChange?: number;
  maxChange?: number;
}

export interface ScalingConstraints {
  minReplicas: number;
  maxReplicas: number;
  maxScaleUpPerAction: number;
  maxScaleDownPerAction: number;
  budgetLimitMonthly?: number;
  maintenanceWindows?: Array<{ start: string; end: string; days: number[] }>;
  excludedPeriods?: Array<{ start: string; end: string; reason: string }>;
  requireApproval: boolean;
  approvalThreshold: number;
}

export interface PredictiveScalingConfig {
  enabled: boolean;
  lookbackHours: number;
  predictionHorizonMinutes: number;
  model: "arima" | "prophet" | "lstm" | "exponential-smoothing";
  confidence: number;
  scaleUpBuffer: number;
  scaleDownBuffer: number;
  seasonalityPatterns: Array<{ period: string; multiplier: number }>;
  trafficPatterns?: TrafficPattern[];
}

export interface TrafficPattern {
  name: string;
  pattern: "daily" | "weekly" | "monthly" | "custom";
  peakHours: number[];
  peakMultiplier: number;
  offPeakMultiplier: number;
}

export interface ScheduledScalingConfig {
  schedules: ScalingSchedule[];
}

export interface ScalingSchedule {
  id: string;
  name: string;
  cron: string;
  targetReplicas: number;
  duration: string;
  enabled: boolean;
  description?: string;
}

export interface CooldownConfig {
  scaleUpCooldownSeconds: number;
  scaleDownCooldownSeconds: number;
  stabilizationWindowSeconds: number;
  progressiveCooldown: boolean;
  maxCooldownMultiplier: number;
}

export interface ScalingEvent {
  id: string;
  policyId: string;
  type: ScalingDirection;
  status: ScalingEventStatus;
  trigger: ScalingTrigger;
  action: ScalingAction;
  previousReplicas: number;
  targetReplicas: number;
  actualReplicas?: number;
  metrics: Record<string, number>;
  duration?: number;
  error?: string;
  triggeredAt: string;
  completedAt?: string;
}

export interface ScalingTrigger {
  ruleId: string;
  ruleName: string;
  metric: ScalingMetricType;
  currentValue: number;
  threshold: number;
  predictionValue?: number;
  scheduleId?: string;
}

export interface ScalingMetrics {
  currentReplicas: number;
  desiredReplicas: number;
  gpuUtilization: number;
  queueDepth: number;
  inferenceLatencyMs: number;
  batchSaturation: number;
  memoryUsageMb: number;
  requestRate: number;
  errorRate: number;
  cpuUtilization: number;
  capacityUtilization: number;
  scalingEventsLast24h: number;
  lastScalingAt?: string;
}

export interface AutoScalingStats {
  totalPolicies: number;
  activePolicies: number;
  totalScalingEvents: number;
  scaleUpEvents: number;
  scaleDownEvents: number;
  averageScaleUpTime: number;
  averageScaleDownTime: number;
  totalReplicasManaged: number;
  estimatedMonthlyCost: number;
  scalingEventsByType: Record<string, number>;
  topScalingModels: Array<{ modelId: string; modelName: string; eventCount: number }>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const policies = new Map<string, AutoScalingPolicy>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create an auto-scaling policy
 */
export async function createAutoScalingPolicy(params: {
  organizationId: string;
  name: string;
  description?: string;
  policyType: ScalingPolicyType;
  targetModel: ScalingTarget;
  scalingRules: Omit<ScalingRule, "id">[];
  constraints: ScalingConstraints;
  predictiveConfig?: PredictiveScalingConfig;
  scheduleConfig?: ScheduledScalingConfig;
  cooldownConfig?: CooldownConfig;
  createdBy: string;
}): Promise<AutoScalingPolicy> {
  const now = new Date().toISOString();

  const policy: AutoScalingPolicy = {
    id: `asp_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    status: "active",
    policyType: params.policyType,
    targetModel: params.targetModel,
    scalingRules: params.scalingRules.map(r => ({ ...r, id: `sr_${randomUUID().replace(/-/g, "").slice(0, 12)}` })),
    constraints: params.constraints,
    predictiveConfig: params.predictiveConfig,
    scheduleConfig: params.scheduleConfig,
    cooldownConfig: params.cooldownConfig ?? {
      scaleUpCooldownSeconds: 300,
      scaleDownCooldownSeconds: 600,
      stabilizationWindowSeconds: 120,
      progressiveCooldown: false,
      maxCooldownMultiplier: 2,
    },
    scalingHistory: [],
    currentReplicas: params.targetModel.currentReplicas,
    desiredReplicas: params.targetModel.currentReplicas,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  policies.set(policy.id, policy);
  return policy;
}

/**
 * Evaluate scaling policy and trigger scaling if needed
 */
export async function evaluateScalingPolicy(policyId: string, currentMetrics: ScalingMetrics): Promise<ScalingEvent | null> {
  const policy = policies.get(policyId);
  if (!policy || policy.status !== "active") return null;

  // Check cooldown
  if (isInCooldown(policy)) {
    return null;
  }

  // Evaluate rules
  const triggeredRule = evaluateRules(policy, currentMetrics);
  if (!triggeredRule) return null;

  // Calculate scaling action
  const action = calculateScalingAction(policy, triggeredRule, currentMetrics);
  if (!action) return null;

  // Check constraints
  const targetReplicas = calculateTargetReplicas(policy, action);
  if (targetReplicas === policy.currentReplicas) return null;

  // Create scaling event
  const event: ScalingEvent = {
    id: `se_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    policyId: policy.id,
    type: targetReplicas > policy.currentReplicas ? "scale-up" : "scale-down",
    status: "triggered",
    trigger: {
      ruleId: triggeredRule.id,
      ruleName: triggeredRule.name,
      metric: triggeredRule.metric,
      currentValue: getMetricValue(currentMetrics, triggeredRule.metric),
      threshold: triggeredRule.threshold,
    },
    action,
    previousReplicas: policy.currentReplicas,
    targetReplicas,
    metrics: {
      gpuUtilization: currentMetrics.gpuUtilization,
      queueDepth: currentMetrics.queueDepth,
      inferenceLatencyMs: currentMetrics.inferenceLatencyMs,
      requestRate: currentMetrics.requestRate,
    },
    triggeredAt: new Date().toISOString(),
  };

  // Apply scaling
  policy.scalingHistory.push(event);
  policy.desiredReplicas = targetReplicas;
  policy.lastScalingAt = event.triggeredAt;
  policy.updatedAt = event.triggeredAt;

  // Simulate scaling completion
  setTimeout(() => {
    event.status = "completed";
    event.actualReplicas = targetReplicas;
    event.completedAt = new Date().toISOString();
    event.duration = new Date(event.completedAt).getTime() - new Date(event.triggeredAt).getTime();
    policy.currentReplicas = targetReplicas;
    policies.set(policyId, policy);
  }, 100);

  policies.set(policyId, policy);
  return event;
}

/**
 * Get auto-scaling policy by ID
 */
export async function getAutoScalingPolicy(policyId: string): Promise<AutoScalingPolicy | null> {
  return policies.get(policyId) ?? null;
}

/**
 * List auto-scaling policies
 */
export async function listAutoScalingPolicies(
  organizationId: string,
  filters?: { status?: ScalingPolicyStatus; policyType?: ScalingPolicyType; limit?: number },
): Promise<AutoScalingPolicy[]> {
  let result = Array.from(policies.values()).filter(p => p.organizationId === organizationId);
  if (filters?.status) result = result.filter(p => p.status === filters.status);
  if (filters?.policyType) result = result.filter(p => p.policyType === filters.policyType);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, filters?.limit ?? 50);
}

/**
 * Pause an auto-scaling policy
 */
export async function pauseAutoScalingPolicy(policyId: string): Promise<AutoScalingPolicy | null> {
  const policy = policies.get(policyId);
  if (!policy) return null;
  policy.status = "paused";
  policy.updatedAt = new Date().toISOString();
  policies.set(policyId, policy);
  return policy;
}

/**
 * Resume an auto-scaling policy
 */
export async function resumeAutoScalingPolicy(policyId: string): Promise<AutoScalingPolicy | null> {
  const policy = policies.get(policyId);
  if (!policy) return null;
  policy.status = "active";
  policy.updatedAt = new Date().toISOString();
  policies.set(policyId, policy);
  return policy;
}

/**
 * Get auto-scaling statistics
 */
export async function getAutoScalingStats(organizationId: string): Promise<AutoScalingStats> {
  const all = Array.from(policies.values()).filter(p => p.organizationId === organizationId);
  const active = all.filter(p => p.status === "active");

  let totalEvents = 0;
  let scaleUpEvents = 0;
  let scaleDownEvents = 0;
  let totalScaleUpTime = 0;
  let totalScaleDownTime = 0;
  let totalReplicas = 0;
  let estimatedCost = 0;
  const eventsByType: Record<string, number> = {};
  const modelEvents: Record<string, { modelName: string; count: number }> = {};

  for (const policy of all) {
    totalReplicas += policy.currentReplicas;
    estimatedCost += policy.currentReplicas * (policy.targetModel.gpuPerReplica > 0 ? 500 : 100);

    for (const event of policy.scalingHistory) {
      totalEvents++;
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      if (event.type === "scale-up") {
        scaleUpEvents++;
        if (event.duration) totalScaleUpTime += event.duration;
      } else {
        scaleDownEvents++;
        if (event.duration) totalScaleDownTime += event.duration;
      }

      const modelKey = policy.targetModel.modelId;
      if (!modelEvents[modelKey]) {
        modelEvents[modelKey] = { modelName: policy.targetModel.modelName, count: 0 };
      }
      modelEvents[modelKey].count++;
    }
  }

  return {
    totalPolicies: all.length,
    activePolicies: active.length,
    totalScalingEvents: totalEvents,
    scaleUpEvents,
    scaleDownEvents,
    averageScaleUpTime: scaleUpEvents > 0 ? Math.round(totalScaleUpTime / scaleUpEvents) : 0,
    averageScaleDownTime: scaleDownEvents > 0 ? Math.round(totalScaleDownTime / scaleDownEvents) : 0,
    totalReplicasManaged: totalReplicas,
    estimatedMonthlyCost: Math.round(estimatedCost * 100) / 100,
    scalingEventsByType: eventsByType,
    topScalingModels: Object.entries(modelEvents)
      .map(([modelId, data]) => ({ modelId, modelName: data.modelName, eventCount: data.count }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 5),
  };
}

// ─── Internal: Scaling Logic ──────────────────────────────────────────────────

function isInCooldown(policy: AutoScalingPolicy): boolean {
  if (!policy.lastScalingAt) return false;

  const lastScaling = new Date(policy.lastScalingAt).getTime();
  const now = Date.now();
  const cooldownSeconds = policy.scalingHistory[policy.scalingHistory.length - 1]?.type === "scale-up"
    ? policy.cooldownConfig.scaleUpCooldownSeconds
    : policy.cooldownConfig.scaleDownCooldownSeconds;

  return (now - lastScaling) < cooldownSeconds * 1000;
}

function evaluateRules(policy: AutoScalingPolicy, metrics: ScalingMetrics): ScalingRule | null {
  const enabledRules = policy.scalingRules.filter(r => r.enabled).sort((a, b) => b.priority - a.priority);

  for (const rule of enabledRules) {
    const value = getMetricValue(metrics, rule.metric);
    const triggered = evaluateThreshold(value, rule);
    if (triggered) return rule;
  }

  return null;
}

function evaluateThreshold(value: number, rule: ScalingRule): boolean {
  switch (rule.operator) {
    case "gt": return value > rule.threshold;
    case "gte": return value >= rule.threshold;
    case "lt": return value < rule.threshold;
    case "lte": return value <= rule.threshold;
    case "eq": return value === rule.threshold;
    case "between": return value >= rule.threshold && value <= (rule.upperThreshold ?? rule.threshold);
    default: return false;
  }
}

function getMetricValue(metrics: ScalingMetrics, metricType: ScalingMetricType): number {
  const metricMap: Record<ScalingMetricType, number> = {
    "gpu-utilization": metrics.gpuUtilization,
    "queue-depth": metrics.queueDepth,
    "inference-latency": metrics.inferenceLatencyMs,
    "batch-saturation": metrics.batchSaturation,
    "memory-usage": metrics.memoryUsageMb,
    "request-rate": metrics.requestRate,
    "error-rate": metrics.errorRate,
    "cpu-utilization": metrics.cpuUtilization,
    "custom": 0,
  };
  return metricMap[metricType] ?? 0;
}

function calculateScalingAction(policy: AutoScalingPolicy, rule: ScalingRule, metrics: ScalingMetrics): ScalingAction | null {
  const action = { ...rule.action };

  // Apply predictive scaling if enabled
  if (policy.policyType === "predictive" && policy.predictiveConfig?.enabled) {
    const predictedLoad = predictFutureLoad(policy, metrics);
    if (predictedLoad > metrics.requestRate * 1.2) {
      action.replicaMultiplier = (action.replicaMultiplier ?? 1.5) * policy.predictiveConfig.scaleUpBuffer;
    }
  }

  return action;
}

function calculateTargetReplicas(policy: AutoScalingPolicy, action: ScalingAction): number {
  let target = policy.currentReplicas;

  if (action.replicaChange) {
    target = policy.currentReplicas + action.replicaChange;
  } else if (action.replicaMultiplier) {
    target = Math.ceil(policy.currentReplicas * action.replicaMultiplier);
  }

  // Apply constraints
  const maxChange = action.strategy === "add-replicas" ? policy.constraints.maxScaleUpPerAction : policy.constraints.maxScaleDownPerAction;
  const change = Math.abs(target - policy.currentReplicas);
  if (change > maxChange) {
    target = policy.currentReplicas + Math.sign(target - policy.currentReplicas) * maxChange;
  }

  // Apply min/max replicas
  target = Math.max(policy.constraints.minReplicas, Math.min(policy.constraints.maxReplicas, target));

  return target;
}

function predictFutureLoad(policy: AutoScalingPolicy, currentMetrics: ScalingMetrics): number {
  // Simplified prediction based on current trend
  const config = policy.predictiveConfig!;
  const trend = currentMetrics.requestRate * 0.1; // 10% growth assumption
  return currentMetrics.requestRate + trend * (config.predictionHorizonMinutes / 60);
}
