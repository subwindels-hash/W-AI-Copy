/**
 * Module 79: AI Retraining Trigger Service
 *
 * Provides intelligent retraining trigger management including performance-based triggers,
 * drift-based triggers, schedule-based triggers, event-based triggers, trigger
 * prioritization, trigger deduplication, trigger cooldown management, and trigger
 * history tracking for automated model retraining decisions.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RetrainingTriggerRule {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelName: string;
  status: TriggerRuleStatus;
  triggerType: TriggerType;
  conditions: TriggerCondition[];
  priority: TriggerPriority;
  cooldown: CooldownConfig;
  actions: TriggerAction[];
  schedule?: ScheduleConfig;
  eventSubscription?: EventSubscriptionConfig;
  metadata?: Record<string, any>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastTriggeredAt?: string;
  triggerCount: number;
}

export type TriggerRuleStatus = 'active' | 'inactive' | 'paused' | 'error';

export type TriggerType =
  | 'performance-degradation'
  | 'drift-detection'
  | 'schedule'
  | 'event'
  | 'data-quality'
  | 'model-age'
  | 'custom';

export type TriggerPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TriggerCondition {
  id: string;
  type: ConditionType;
  metric?: string;
  operator: Operator;
  threshold: number;
  windowSize?: number; // minutes
  aggregation?: AggregationType;
  comparison?: ComparisonType;
  baselineValue?: number;
  severity?: Severity;
  logicOperator?: 'AND' | 'OR';
}

export type ConditionType =
  | 'metric-threshold'
  | 'metric-trend'
  | 'drift-score'
  | 'data-quality-score'
  | 'model-age'
  | 'prediction-distribution'
  | 'error-rate'
  | 'latency'
  | 'custom';

export type Operator = 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'between' | 'outside';

export type AggregationType = 'mean' | 'median' | 'p50' | 'p90' | 'p95' | 'p99' | 'min' | 'max' | 'sum' | 'count';

export type ComparisonType = 'absolute' | 'relative' | 'percentage' | 'baseline';

export type Severity = 'info' | 'warning' | 'error' | 'critical';

export interface CooldownConfig {
  enabled: boolean;
  duration: number; // minutes
  maxTriggersPerDay: number;
  resetOnSuccess: boolean;
}

export interface TriggerAction {
  type: ActionType;
  config: Record<string, any>;
  order: number;
}

export type ActionType =
  | 'start-retraining'
  | 'send-notification'
  | 'create-ticket'
  | 'pause-model'
  | 'rollback-model'
  | 'log-event'
  | 'custom-webhook';

export interface ScheduleConfig {
  type: 'cron' | 'interval' | 'fixed-time';
  cronExpression?: string;
  intervalMinutes?: number;
  fixedTime?: string; // ISO time
  timezone?: string;
  startDate?: string;
  endDate?: string;
  enabled: boolean;
}

export interface EventSubscriptionConfig {
  eventTypes: string[];
  filters?: Record<string, any>;
  source?: string;
  enabled: boolean;
}

export interface TriggerExecution {
  id: string;
  organizationId: string;
  triggerRuleId: string;
  triggerRuleName: string;
  modelId: string;
  modelName: string;
  triggerType: TriggerType;
  priority: TriggerPriority;
  status: ExecutionStatus;
  conditions: TriggerCondition[];
  evaluatedAt: string;
  triggeredAt?: string;
  actions: TriggerActionExecution[];
  context: TriggerContext;
  deduplicated: boolean;
  cooldownActive: boolean;
  error?: string;
}

export type ExecutionStatus = 'evaluated' | 'triggered' | 'executed' | 'failed' | 'skipped' | 'cooldown' | 'deduplicated';

export interface TriggerActionExecution {
  actionType: ActionType;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

export interface TriggerContext {
  currentValue?: number;
  baselineValue?: number;
  threshold?: number;
  metricValues?: Record<string, number>;
  driftScore?: number;
  dataQualityScore?: number;
  modelAge?: number; // days
  additionalContext?: Record<string, any>;
}

export interface TriggerHistory {
  id: string;
  organizationId: string;
  triggerRuleId: string;
  triggerRuleName: string;
  modelId: string;
  modelName: string;
  triggerType: TriggerType;
  executionId: string;
  status: ExecutionStatus;
  evaluatedAt: string;
  triggeredAt?: string;
  context: TriggerContext;
  actions: TriggerActionExecution[];
}

export interface TriggerAnalytics {
  organizationId: string;
  totalRules: number;
  activeRules: number;
  totalExecutions: number;
  triggeredExecutions: number;
  triggerRate: number;
  averageTimeBetweenTriggers: number; // minutes
  topTriggeredModels: Array<{
    modelId: string;
    modelName: string;
    triggerCount: number;
    lastTriggered: string;
  }>;
  triggersByType: Record<TriggerType, number>;
  triggersByPriority: Record<TriggerPriority, number>;
  cooldownPreventedTriggers: number;
  deduplicatedTriggers: number;
  recentExecutions: TriggerExecution[];
}

export interface TriggerDashboard {
  organizationId: string;
  totalRules: number;
  activeRules: number;
  totalExecutions: number;
  triggeredToday: number;
  triggerRate: number;
  rulesByStatus: Record<TriggerRuleStatus, number>;
  rulesByType: Record<TriggerType, number>;
  recentTriggers: TriggerExecution[];
  topModels: Array<{
    modelId: string;
    modelName: string;
    ruleCount: number;
    triggerCount: number;
  }>;
  triggerTrends: Array<{
    date: string;
    evaluated: number;
    triggered: number;
    executed: number;
  }>;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const triggerRules = new Map<string, RetrainingTriggerRule>();
const triggerExecutions = new Map<string, TriggerExecution[]>();
const triggerHistory = new Map<string, TriggerHistory[]>();
const cooldownTracker = new Map<string, { lastTriggered: string; count: number }>();

// ─── Trigger Rule Management ───────────────────────────────────────────────────

/**
 * Create a retraining trigger rule
 */
export async function createRetrainingTriggerRule(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    modelId: string;
    modelName: string;
    triggerType: TriggerType;
    conditions: Omit<TriggerCondition, 'id'>[];
    priority?: TriggerPriority;
    cooldown?: Partial<CooldownConfig>;
    actions: Omit<TriggerAction, 'order'>[];
    schedule?: ScheduleConfig;
    eventSubscription?: EventSubscriptionConfig;
    metadata?: Record<string, any>;
    createdBy: string;
  }
): Promise<RetrainingTriggerRule> {
  const id = `trigger_${randomUUID()}`;
  const now = new Date().toISOString();

  const conditions: TriggerCondition[] = params.conditions.map((c, idx) => ({
    ...c,
    id: `condition_${randomUUID()}`,
    logicOperator: idx < params.conditions.length - 1 ? 'AND' : undefined,
  }));

  const actions: TriggerAction[] = params.actions.map((a, idx) => ({
    ...a,
    order: idx + 1,
  }));

  const rule: RetrainingTriggerRule = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    modelId: params.modelId,
    modelName: params.modelName,
    status: 'active',
    triggerType: params.triggerType,
    conditions,
    priority: params.priority || 'medium',
    cooldown: {
      enabled: params.cooldown?.enabled ?? true,
      duration: params.cooldown?.duration ?? 60,
      maxTriggersPerDay: params.cooldown?.maxTriggersPerDay ?? 5,
      resetOnSuccess: params.cooldown?.resetOnSuccess ?? true,
    },
    actions,
    schedule: params.schedule,
    eventSubscription: params.eventSubscription,
    metadata: params.metadata,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
    triggerCount: 0,
  };

  triggerRules.set(id, rule);
  triggerExecutions.set(id, []);
  triggerHistory.set(id, []);

  return rule;
}

/**
 * Update a retraining trigger rule
 */
export async function updateRetrainingTriggerRule(
  ruleId: string,
  updates: Partial<Omit<RetrainingTriggerRule, 'id' | 'organizationId' | 'createdAt'>>
): Promise<RetrainingTriggerRule | null> {
  const rule = triggerRules.get(ruleId);
  if (!rule) return null;

  Object.assign(rule, updates);
  rule.updatedAt = new Date().toISOString();

  triggerRules.set(ruleId, rule);
  return rule;
}

/**
 * Pause a retraining trigger rule
 */
export async function pauseRetrainingTriggerRule(ruleId: string): Promise<RetrainingTriggerRule | null> {
  const rule = triggerRules.get(ruleId);
  if (!rule) return null;

  rule.status = 'paused';
  rule.updatedAt = new Date().toISOString();

  triggerRules.set(ruleId, rule);
  return rule;
}

/**
 * Resume a retraining trigger rule
 */
export async function resumeRetrainingTriggerRule(ruleId: string): Promise<RetrainingTriggerRule | null> {
  const rule = triggerRules.get(ruleId);
  if (!rule) return null;

  rule.status = 'active';
  rule.updatedAt = new Date().toISOString();

  triggerRules.set(ruleId, rule);
  return rule;
}

/**
 * Delete a retraining trigger rule
 */
export async function deleteRetrainingTriggerRule(ruleId: string): Promise<boolean> {
  const rule = triggerRules.get(ruleId);
  if (!rule) return false;

  triggerRules.delete(ruleId);
  triggerExecutions.delete(ruleId);
  triggerHistory.delete(ruleId);
  cooldownTracker.delete(ruleId);

  return true;
}

/**
 * Evaluate trigger rules for a model
 */
export async function evaluateTriggerRules(
  modelId: string,
  context: {
    currentMetrics?: Record<string, number>;
    driftScore?: number;
    dataQualityScore?: number;
    modelAge?: number;
    additionalContext?: Record<string, any>;
  }
): Promise<TriggerExecution[]> {
  const rules = Array.from(triggerRules.values()).filter(
    (r) => r.modelId === modelId && r.status === 'active'
  );

  const executions: TriggerExecution[] = [];

  for (const rule of rules) {
    const execution = await evaluateTriggerRule(rule, context);
    executions.push(execution);
  }

  return executions;
}

/**
 * Evaluate a single trigger rule
 */
async function evaluateTriggerRule(
  rule: RetrainingTriggerRule,
  context: {
    currentMetrics?: Record<string, number>;
    driftScore?: number;
    dataQualityScore?: number;
    modelAge?: number;
    additionalContext?: Record<string, any>;
  }
): Promise<TriggerExecution> {
  const executionId = `execution_${randomUUID()}`;
  const now = new Date().toISOString();

  // Check cooldown
  const cooldownActive = isCooldownActive(rule);
  if (cooldownActive) {
    const execution: TriggerExecution = {
      id: executionId,
      organizationId: rule.organizationId,
      triggerRuleId: rule.id,
      triggerRuleName: rule.name,
      modelId: rule.modelId,
      modelName: rule.modelName,
      triggerType: rule.triggerType,
      priority: rule.priority,
      status: 'cooldown',
      conditions: rule.conditions,
      evaluatedAt: now,
      actions: [],
      context: buildTriggerContext(rule, context),
      deduplicated: false,
      cooldownActive: true,
    };

    const executions = triggerExecutions.get(rule.id) || [];
    executions.push(execution);
    triggerExecutions.set(rule.id, executions);

    return execution;
  }

  // Evaluate conditions
  const conditionsMet = evaluateConditions(rule.conditions, context);

  if (!conditionsMet) {
    const execution: TriggerExecution = {
      id: executionId,
      organizationId: rule.organizationId,
      triggerRuleId: rule.id,
      triggerRuleName: rule.name,
      modelId: rule.modelId,
      modelName: rule.modelName,
      triggerType: rule.triggerType,
      priority: rule.priority,
      status: 'evaluated',
      conditions: rule.conditions,
      evaluatedAt: now,
      actions: [],
      context: buildTriggerContext(rule, context),
      deduplicated: false,
      cooldownActive: false,
    };

    const executions = triggerExecutions.get(rule.id) || [];
    executions.push(execution);
    triggerExecutions.set(rule.id, executions);

    return execution;
  }

  // Check for deduplication
  const deduplicated = isDuplicateTrigger(rule, context);
  if (deduplicated) {
    const execution: TriggerExecution = {
      id: executionId,
      organizationId: rule.organizationId,
      triggerRuleId: rule.id,
      triggerRuleName: rule.name,
      modelId: rule.modelId,
      modelName: rule.modelName,
      triggerType: rule.triggerType,
      priority: rule.priority,
      status: 'deduplicated',
      conditions: rule.conditions,
      evaluatedAt: now,
      actions: [],
      context: buildTriggerContext(rule, context),
      deduplicated: true,
      cooldownActive: false,
    };

    const executions = triggerExecutions.get(rule.id) || [];
    executions.push(execution);
    triggerExecutions.set(rule.id, executions);

    return execution;
  }

  // Trigger actions
  const actionExecutions: TriggerActionExecution[] = [];
  for (const action of rule.actions) {
    const actionExecution: TriggerActionExecution = {
      actionType: action.type,
      status: 'completed',
      startedAt: now,
      completedAt: now,
      result: { success: true },
    };
    actionExecutions.push(actionExecution);
  }

  const execution: TriggerExecution = {
    id: executionId,
    organizationId: rule.organizationId,
    triggerRuleId: rule.id,
    triggerRuleName: rule.name,
    modelId: rule.modelId,
    modelName: rule.modelName,
    triggerType: rule.triggerType,
    priority: rule.priority,
    status: 'triggered',
    conditions: rule.conditions,
    evaluatedAt: now,
    triggeredAt: now,
    actions: actionExecutions,
    context: buildTriggerContext(rule, context),
    deduplicated: false,
    cooldownActive: false,
  };

  // Update rule
  rule.lastTriggeredAt = now;
  rule.triggerCount++;
  rule.updatedAt = now;
  triggerRules.set(rule.id, rule);

  // Update cooldown tracker
  cooldownTracker.set(rule.id, { lastTriggered: now, count: (cooldownTracker.get(rule.id)?.count || 0) + 1 });

  // Add to executions
  const executions = triggerExecutions.get(rule.id) || [];
  executions.push(execution);
  triggerExecutions.set(rule.id, executions);

  // Add to history
  const history: TriggerHistory = {
    id: `history_${randomUUID()}`,
    organizationId: rule.organizationId,
    triggerRuleId: rule.id,
    triggerRuleName: rule.name,
    modelId: rule.modelId,
    modelName: rule.modelName,
    triggerType: rule.triggerType,
    executionId: execution.id,
    status: execution.status,
    evaluatedAt: execution.evaluatedAt,
    triggeredAt: execution.triggeredAt,
    context: execution.context,
    actions: execution.actions,
  };

  const historyList = triggerHistory.get(rule.id) || [];
  historyList.push(history);
  triggerHistory.set(rule.id, historyList);

  return execution;
}

/**
 * Get trigger rule by ID
 */
export async function getRetrainingTriggerRule(ruleId: string): Promise<RetrainingTriggerRule | null> {
  return triggerRules.get(ruleId) || null;
}

/**
 * List retraining trigger rules
 */
export async function listRetrainingTriggerRules(
  organizationId: string,
  filters?: { status?: TriggerRuleStatus; modelId?: string; triggerType?: TriggerType }
): Promise<RetrainingTriggerRule[]> {
  const allRules = Array.from(triggerRules.values()).filter((r) => r.organizationId === organizationId);

  return allRules.filter((r) => {
    if (filters?.status && r.status !== filters.status) return false;
    if (filters?.modelId && r.modelId !== filters.modelId) return false;
    if (filters?.triggerType && r.triggerType !== filters.triggerType) return false;
    return true;
  });
}

/**
 * Get trigger analytics
 */
export async function getTriggerAnalytics(organizationId: string): Promise<TriggerAnalytics> {
  const allRules = await listRetrainingTriggerRules(organizationId);
  const allExecutions = Array.from(triggerExecutions.values()).flat();
  const allHistory = Array.from(triggerHistory.values()).flat();

  const activeRules = allRules.filter((r) => r.status === 'active');
  const triggeredExecutions = allExecutions.filter((e) => e.status === 'triggered');

  const modelTriggerCounts = new Map<string, { modelName: string; count: number; lastTriggered: string }>();
  for (const execution of triggeredExecutions) {
    const current = modelTriggerCounts.get(execution.modelId) || {
      modelName: execution.modelName,
      count: 0,
      lastTriggered: execution.triggeredAt || execution.evaluatedAt,
    };
    current.count++;
    if (execution.triggeredAt && execution.triggeredAt > current.lastTriggered) {
      current.lastTriggered = execution.triggeredAt;
    }
    modelTriggerCounts.set(execution.modelId, current);
  }

  const triggersByType: Record<string, number> = {};
  const triggersByPriority: Record<string, number> = {};
  for (const execution of triggeredExecutions) {
    triggersByType[execution.triggerType] = (triggersByType[execution.triggerType] || 0) + 1;
    triggersByPriority[execution.priority] = (triggersByPriority[execution.priority] || 0) + 1;
  }

  const cooldownPrevented = allExecutions.filter((e) => e.status === 'cooldown').length;
  const deduplicated = allExecutions.filter((e) => e.status === 'deduplicated').length;

  const recentExecutions = allExecutions
    .sort((a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime())
    .slice(0, 20);

  // Calculate average time between triggers
  let totalTimeBetween = 0;
  let triggerPairs = 0;
  for (const rule of allRules) {
    const ruleExecutions = allExecutions
      .filter((e) => e.triggerRuleId === rule.id && e.status === 'triggered')
      .sort((a, b) => new Date(a.triggeredAt || a.evaluatedAt).getTime() - new Date(b.triggeredAt || b.evaluatedAt).getTime());

    for (let i = 1; i < ruleExecutions.length; i++) {
      const timeDiff = new Date(ruleExecutions[i].triggeredAt || ruleExecutions[i].evaluatedAt).getTime() -
                       new Date(ruleExecutions[i-1].triggeredAt || ruleExecutions[i-1].evaluatedAt).getTime();
      totalTimeBetween += timeDiff;
      triggerPairs++;
    }
  }

  return {
    organizationId,
    totalRules: allRules.length,
    activeRules: activeRules.length,
    totalExecutions: allExecutions.length,
    triggeredExecutions: triggeredExecutions.length,
    triggerRate: allExecutions.length > 0 ? (triggeredExecutions.length / allExecutions.length) * 100 : 0,
    averageTimeBetweenTriggers: triggerPairs > 0 ? (totalTimeBetween / triggerPairs) / 60000 : 0,
    topTriggeredModels: Array.from(modelTriggerCounts.entries())
      .map(([modelId, data]) => ({
        modelId,
        modelName: data.modelName,
        triggerCount: data.count,
        lastTriggered: data.lastTriggered,
      }))
      .sort((a, b) => b.triggerCount - a.triggerCount)
      .slice(0, 10),
    triggersByType: triggersByType as Record<TriggerType, number>,
    triggersByPriority: triggersByPriority as Record<TriggerPriority, number>,
    cooldownPreventedTriggers: cooldownPrevented,
    deduplicatedTriggers: deduplicated,
    recentExecutions,
  };
}

/**
 * Get trigger dashboard
 */
export async function getTriggerDashboard(organizationId: string): Promise<TriggerDashboard> {
  const allRules = await listRetrainingTriggerRules(organizationId);
  const allExecutions = Array.from(triggerExecutions.values()).flat();

  const rulesByStatus: Record<string, number> = {};
  const rulesByType: Record<string, number> = {};
  for (const rule of allRules) {
    rulesByStatus[rule.status] = (rulesByStatus[rule.status] || 0) + 1;
    rulesByType[rule.triggerType] = (rulesByType[rule.triggerType] || 0) + 1;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const triggeredToday = allExecutions.filter(
    (e) => e.status === 'triggered' && new Date(e.triggeredAt || e.evaluatedAt) >= today
  ).length;

  const triggeredExecutions = allExecutions.filter((e) => e.status === 'triggered');
  const triggerRate = allExecutions.length > 0 ? (triggeredExecutions.length / allExecutions.length) * 100 : 0;

  const recentTriggers = allExecutions
    .filter((e) => e.status === 'triggered')
    .sort((a, b) => new Date(b.triggeredAt || b.evaluatedAt).getTime() - new Date(a.triggeredAt || a.evaluatedAt).getTime())
    .slice(0, 10);

  const modelStats = new Map<string, { modelName: string; ruleCount: number; triggerCount: number }>();
  for (const rule of allRules) {
    const current = modelStats.get(rule.modelId) || { modelName: rule.modelName, ruleCount: 0, triggerCount: 0 };
    current.ruleCount++;
    modelStats.set(rule.modelId, current);
  }

  for (const execution of triggeredExecutions) {
    const current = modelStats.get(execution.modelId);
    if (current) {
      current.triggerCount++;
      modelStats.set(execution.modelId, current);
    }
  }

  const topModels = Array.from(modelStats.entries())
    .map(([modelId, stats]) => ({
      modelId,
      modelName: stats.modelName,
      ruleCount: stats.ruleCount,
      triggerCount: stats.triggerCount,
    }))
    .sort((a, b) => b.triggerCount - a.triggerCount)
    .slice(0, 10);

  // Generate trigger trends (last 7 days)
  const triggerTrends: Array<{
    date: string;
    evaluated: number;
    triggered: number;
    executed: number;
  }> = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const dayExecutions = allExecutions.filter((e) => {
      const evalDate = new Date(e.evaluatedAt);
      return evalDate >= date && evalDate < nextDate;
    });

    triggerTrends.push({
      date: date.toISOString().split('T')[0],
      evaluated: dayExecutions.length,
      triggered: dayExecutions.filter((e) => e.status === 'triggered').length,
      executed: dayExecutions.filter((e) => e.status === 'executed').length,
    });
  }

  return {
    organizationId,
    totalRules: allRules.length,
    activeRules: allRules.filter((r) => r.status === 'active').length,
    totalExecutions: allExecutions.length,
    triggeredToday,
    triggerRate,
    rulesByStatus: rulesByStatus as Record<TriggerRuleStatus, number>,
    rulesByType: rulesByType as Record<TriggerType, number>,
    recentTriggers,
    topModels,
    triggerTrends,
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function isCooldownActive(rule: RetrainingTriggerRule): boolean {
  if (!rule.cooldown.enabled) return false;

  const tracker = cooldownTracker.get(rule.id);
  if (!tracker) return false;

  const now = new Date();
  const lastTriggered = new Date(tracker.lastTriggered);
  const minutesSinceLastTrigger = (now.getTime() - lastTriggered.getTime()) / 60000;

  if (minutesSinceLastTrigger < rule.cooldown.duration) {
    return true;
  }

  // Check max triggers per day
  if (rule.cooldown.maxTriggersPerDay > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTriggers = tracker.count; // Simplified - in production, track per day

    if (todayTriggers >= rule.cooldown.maxTriggersPerDay) {
      return true;
    }
  }

  return false;
}

function evaluateConditions(
  conditions: TriggerCondition[],
  context: {
    currentMetrics?: Record<string, number>;
    driftScore?: number;
    dataQualityScore?: number;
    modelAge?: number;
    additionalContext?: Record<string, any>;
  }
): boolean {
  let result = true;
  let logicOperator: 'AND' | 'OR' = 'AND';

  for (let i = 0; i < conditions.length; i++) {
    const condition = conditions[i];
    const conditionMet = evaluateCondition(condition, context);

    if (i === 0) {
      result = conditionMet;
    } else {
      if (logicOperator === 'AND') {
        result = result && conditionMet;
      } else {
        result = result || conditionMet;
      }
    }

    logicOperator = condition.logicOperator || 'AND';
  }

  return result;
}

function evaluateCondition(
  condition: TriggerCondition,
  context: {
    currentMetrics?: Record<string, number>;
    driftScore?: number;
    dataQualityScore?: number;
    modelAge?: number;
    additionalContext?: Record<string, any>;
  }
): boolean {
  let currentValue: number | undefined;

  switch (condition.type) {
    case 'metric-threshold':
    case 'metric-trend':
      currentValue = condition.metric ? context.currentMetrics?.[condition.metric] : undefined;
      break;
    case 'drift-score':
      currentValue = context.driftScore;
      break;
    case 'data-quality-score':
      currentValue = context.dataQualityScore;
      break;
    case 'model-age':
      currentValue = context.modelAge;
      break;
    default:
      return false;
  }

  if (currentValue === undefined) return false;

  switch (condition.operator) {
    case 'gt':
      return currentValue > condition.threshold;
    case 'lt':
      return currentValue < condition.threshold;
    case 'eq':
      return currentValue === condition.threshold;
    case 'gte':
      return currentValue >= condition.threshold;
    case 'lte':
      return currentValue <= condition.threshold;
    case 'between':
      return currentValue >= condition.threshold && currentValue <= (condition.baselineValue || condition.threshold);
    case 'outside':
      return currentValue < condition.threshold || currentValue > (condition.baselineValue || condition.threshold);
    default:
      return false;
  }
}

function buildTriggerContext(
  rule: RetrainingTriggerRule,
  context: {
    currentMetrics?: Record<string, number>;
    driftScore?: number;
    dataQualityScore?: number;
    modelAge?: number;
    additionalContext?: Record<string, any>;
  }
): TriggerContext {
  const triggerContext: TriggerContext = {
    metricValues: context.currentMetrics,
    driftScore: context.driftScore,
    dataQualityScore: context.dataQualityScore,
    modelAge: context.modelAge,
    additionalContext: context.additionalContext,
  };

  // Set current value based on first condition
  if (rule.conditions.length > 0) {
    const firstCondition = rule.conditions[0];
    switch (firstCondition.type) {
      case 'metric-threshold':
      case 'metric-trend':
        triggerContext.currentValue = firstCondition.metric ? context.currentMetrics?.[firstCondition.metric] : undefined;
        triggerContext.threshold = firstCondition.threshold;
        break;
      case 'drift-score':
        triggerContext.currentValue = context.driftScore;
        triggerContext.threshold = firstCondition.threshold;
        break;
      case 'data-quality-score':
        triggerContext.currentValue = context.dataQualityScore;
        triggerContext.threshold = firstCondition.threshold;
        break;
      case 'model-age':
        triggerContext.currentValue = context.modelAge;
        triggerContext.threshold = firstCondition.threshold;
        break;
    }
  }

  return triggerContext;
}

function isDuplicateTrigger(
  rule: RetrainingTriggerRule,
  context: {
    currentMetrics?: Record<string, number>;
    driftScore?: number;
    dataQualityScore?: number;
    modelAge?: number;
    additionalContext?: Record<string, any>;
  }
): boolean {
  // Check if similar trigger was executed recently (within last hour)
  const history = triggerHistory.get(rule.id) || [];
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  const recentTriggers = history.filter((h) => new Date(h.evaluatedAt) >= oneHourAgo);

  // Check if any recent trigger had similar context
  for (const recent of recentTriggers) {
    const contextSimilarity = calculateContextSimilarity(recent.context, buildTriggerContext(rule, context));
    if (contextSimilarity > 0.9) {
      return true;
    }
  }

  return false;
}

function calculateContextSimilarity(ctx1: TriggerContext, ctx2: TriggerContext): number {
  let similarity = 0;
  let count = 0;

  if (ctx1.currentValue !== undefined && ctx2.currentValue !== undefined) {
    const diff = Math.abs(ctx1.currentValue - ctx2.currentValue);
    const maxVal = Math.max(Math.abs(ctx1.currentValue), Math.abs(ctx2.currentValue));
    similarity += maxVal > 0 ? 1 - (diff / maxVal) : 1;
    count++;
  }

  if (ctx1.driftScore !== undefined && ctx2.driftScore !== undefined) {
    const diff = Math.abs(ctx1.driftScore - ctx2.driftScore);
    similarity += 1 - diff;
    count++;
  }

  if (ctx1.dataQualityScore !== undefined && ctx2.dataQualityScore !== undefined) {
    const diff = Math.abs(ctx1.dataQualityScore - ctx2.dataQualityScore);
    similarity += 1 - diff;
    count++;
  }

  return count > 0 ? similarity / count : 1;
}
