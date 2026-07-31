/**
 * Module 112: AI Model Lifecycle Metrics Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides comprehensive lifecycle metrics tracking for AI models including stage
 * transitions, time-in-stage, transition rates, bottlenecks, and lifecycle KPIs.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LifecycleTracker {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  currentStage: LifecycleStage;
  stageHistory: StageTransition[];
  metrics: LifecycleMetrics;
  milestones: Milestone[];
  createdAt: string;
  updatedAt: string;
}

export type LifecycleStage =
  | 'development'
  | 'training'
  | 'testing'
  | 'validation'
  | 'staging'
  | 'production'
  | 'monitoring'
  | 'deprecated'
  | 'archived'
  | 'retired';

export interface StageTransition {
  id: string;
  fromStage: LifecycleStage;
  toStage: LifecycleStage;
  transitionType: TransitionType;
  timestamp: string;
  duration: number; // milliseconds
  triggeredBy: string;
  reason?: string;
  metadata?: Record<string, any>;
}

export type TransitionType = 'automatic' | 'manual' | 'scheduled' | 'rollback' | 'emergency';

export interface LifecycleMetrics {
  totalLifecycleTime: number; // milliseconds
  timeInCurrentStage: number;
  averageStageDuration: number;
  transitionCount: number;
  rollbackCount: number;
  fastestTransition: StageTransition;
  slowestTransition: StageTransition;
  stageDurations: Record<LifecycleStage, number>;
  lastTransitionAt?: string;
}

export interface Milestone {
  id: string;
  name: string;
  description?: string;
  stage: LifecycleStage;
  achievedAt?: string;
  targetDate?: string;
  status: 'pending' | 'achieved' | 'missed';
  metadata?: Record<string, any>;
}

export interface LifecycleEvent {
  id: string;
  trackerId: string;
  modelId: string;
  eventType: LifecycleEventType;
  stage: LifecycleStage;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  timestamp: string;
  metadata?: Record<string, any>;
}

export type LifecycleEventType =
  | 'stage_entered'
  | 'stage_exited'
  | 'milestone_achieved'
  | 'milestone_missed'
  | 'transition_started'
  | 'transition_completed'
  | 'transition_failed'
  | 'rollback_initiated'
  | 'alert_triggered';

export interface LifecycleDashboard {
  id: string;
  organizationId: string;
  name: string;
  widgets: DashboardWidget[];
  filters: DashboardFilters;
  refreshInterval: number; // seconds
  createdAt: string;
  updatedAt: string;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  config: WidgetConfig;
  position: { x: number; y: number; width: number; height: number };
}

export type WidgetType =
  | 'stage_distribution'
  | 'transition_timeline'
  | 'time_in_stage'
  | 'transition_rate'
  | 'bottleneck_analysis'
  | 'milestone_tracker'
  | 'kpi_gauge'
  | 'trend_chart';

export interface WidgetConfig {
  metric?: string;
  stage?: LifecycleStage;
  timeRange?: string;
  groupBy?: string;
  filters?: Record<string, any>;
}

export interface DashboardFilters {
  stages?: LifecycleStage[];
  models?: string[];
  teams?: string[];
  timeRange?: { start: string; end: string };
}

export interface LifecycleKPI {
  name: string;
  value: number;
  target: number;
  unit: string;
  trend: 'improving' | 'declining' | 'stable';
  trendPercentage: number;
  status: 'on_track' | 'at_risk' | 'off_track';
}

export interface BottleneckAnalysis {
  stage: LifecycleStage;
  averageDuration: number;
  maxDuration: number;
  modelCount: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface TransitionAnalysis {
  fromStage: LifecycleStage;
  toStage: LifecycleStage;
  count: number;
  averageDuration: number;
  successRate: number;
  failureRate: number;
  commonFailureReasons: string[];
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const lifecycleTrackers = new Map<string, LifecycleTracker>();
const lifecycleEvents = new Map<string, LifecycleEvent[]>();
const lifecycleDashboards = new Map<string, LifecycleDashboard>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculateStageDurations(transitions: StageTransition[]): Record<LifecycleStage, number> {
  const durations: Record<string, number> = {};

  for (const transition of transitions) {
    const stage = transition.fromStage;
    durations[stage] = (durations[stage] || 0) + transition.duration;
  }

  return durations as Record<LifecycleStage, number>;
}

function findFastestSlowestTransitions(transitions: StageTransition[]): {
  fastest: StageTransition;
  slowest: StageTransition;
} {
  if (transitions.length === 0) {
    const dummy: StageTransition = {
      id: '',
      fromStage: 'development',
      toStage: 'development',
      transitionType: 'manual',
      timestamp: new Date().toISOString(),
      duration: 0,
      triggeredBy: 'system',
    };
    return { fastest: dummy, slowest: dummy };
  }

  const sorted = [...transitions].sort((a, b) => a.duration - b.duration);
  return {
    fastest: sorted[0],
    slowest: sorted[sorted.length - 1],
  };
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createLifecycleTracker(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  initialStage?: LifecycleStage;
}): LifecycleTracker {
  const now = new Date().toISOString();
  const id = randomUUID();

  const initialStage = params.initialStage || 'development';

  const tracker: LifecycleTracker = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    currentStage: initialStage,
    stageHistory: [],
    metrics: {
      totalLifecycleTime: 0,
      timeInCurrentStage: 0,
      averageStageDuration: 0,
      transitionCount: 0,
      rollbackCount: 0,
      fastestTransition: {
        id: '',
        fromStage: initialStage,
        toStage: initialStage,
        transitionType: 'manual',
        timestamp: now,
        duration: 0,
        triggeredBy: 'system',
      },
      slowestTransition: {
        id: '',
        fromStage: initialStage,
        toStage: initialStage,
        transitionType: 'manual',
        timestamp: now,
        duration: 0,
        triggeredBy: 'system',
      },
      stageDurations: {} as Record<LifecycleStage, number>,
    },
    milestones: [],
    createdAt: now,
    updatedAt: now,
  };

  lifecycleTrackers.set(id, tracker);
  lifecycleEvents.set(id, []);

  logLifecycleEvent({
    trackerId: id,
    modelId: params.modelId,
    eventType: 'stage_entered',
    stage: initialStage,
    description: `Model entered ${initialStage} stage`,
    severity: 'info',
  });

  return tracker;
}

export function getLifecycleTracker(id: string): LifecycleTracker | undefined {
  return lifecycleTrackers.get(id);
}

export function getLifecycleTrackerByModelId(modelId: string): LifecycleTracker | undefined {
  return Array.from(lifecycleTrackers.values()).find(t => t.modelId === modelId);
}

export function listLifecycleTrackers(
  organizationId: string,
  filters?: { stage?: LifecycleStage; modelId?: string }
): LifecycleTracker[] {
  let result = Array.from(lifecycleTrackers.values()).filter(
    t => t.organizationId === organizationId
  );

  if (filters?.stage) result = result.filter(t => t.currentStage === filters.stage);
  if (filters?.modelId) result = result.filter(t => t.modelId === filters.modelId);

  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function transitionStage(
  trackerId: string,
  toStage: LifecycleStage,
  params: {
    transitionType: TransitionType;
    triggeredBy: string;
    reason?: string;
    metadata?: Record<string, any>;
  }
): LifecycleTracker {
  const tracker = lifecycleTrackers.get(trackerId);
  if (!tracker) throw new Error(`Lifecycle tracker ${trackerId} not found`);

  const now = new Date().toISOString();
  const fromStage = tracker.currentStage;

  // Calculate duration in current stage
  const lastTransition = tracker.stageHistory[tracker.stageHistory.length - 1];
  const stageStartTime = lastTransition ? new Date(lastTransition.timestamp).getTime() : new Date(tracker.createdAt).getTime();
  const duration = Date.now() - stageStartTime;

  const transition: StageTransition = {
    id: randomUUID(),
    fromStage,
    toStage,
    transitionType: params.transitionType,
    timestamp: now,
    duration,
    triggeredBy: params.triggeredBy,
    reason: params.reason,
    metadata: params.metadata,
  };

  tracker.stageHistory.push(transition);
  tracker.currentStage = toStage;

  // Update metrics
  tracker.metrics.transitionCount++;
  tracker.metrics.totalLifecycleTime += duration;
  tracker.metrics.timeInCurrentStage = 0;
  tracker.metrics.lastTransitionAt = now;

  if (params.transitionType === 'rollback') {
    tracker.metrics.rollbackCount++;
  }

  // Recalculate stage durations
  tracker.metrics.stageDurations = calculateStageDurations(tracker.stageHistory);

  // Update average stage duration
  tracker.metrics.averageStageDuration = tracker.metrics.totalLifecycleTime / tracker.metrics.transitionCount;

  // Update fastest/slowest transitions
  const { fastest, slowest } = findFastestSlowestTransitions(tracker.stageHistory);
  tracker.metrics.fastestTransition = fastest;
  tracker.metrics.slowestTransition = slowest;

  tracker.updatedAt = now;

  // Log events
  logLifecycleEvent({
    trackerId,
    modelId: tracker.modelId,
    eventType: 'stage_exited',
    stage: fromStage,
    description: `Model exited ${fromStage} stage after ${duration}ms`,
    severity: 'info',
    metadata: { duration, toStage },
  });

  logLifecycleEvent({
    trackerId,
    modelId: tracker.modelId,
    eventType: 'stage_entered',
    stage: toStage,
    description: `Model entered ${toStage} stage`,
    severity: 'info',
    metadata: { fromStage, transitionType: params.transitionType },
  });

  if (params.transitionType === 'rollback') {
    logLifecycleEvent({
      trackerId,
      modelId: tracker.modelId,
      eventType: 'rollback_initiated',
      stage: toStage,
      description: `Rollback from ${fromStage} to ${toStage}`,
      severity: 'warning',
      metadata: { reason: params.reason },
    });
  }

  return tracker;
}

export function addMilestone(
  trackerId: string,
  milestone: Omit<Milestone, 'id' | 'status'>
): LifecycleTracker {
  const tracker = lifecycleTrackers.get(trackerId);
  if (!tracker) throw new Error(`Lifecycle tracker ${trackerId} not found`);

  const newMilestone: Milestone = {
    ...milestone,
    id: randomUUID(),
    status: 'pending',
  };

  tracker.milestones.push(newMilestone);
  tracker.updatedAt = new Date().toISOString();

  return tracker;
}

export function achieveMilestone(trackerId: string, milestoneId: string): LifecycleTracker {
  const tracker = lifecycleTrackers.get(trackerId);
  if (!tracker) throw new Error(`Lifecycle tracker ${trackerId} not found`);

  const milestone = tracker.milestones.find(m => m.id === milestoneId);
  if (!milestone) throw new Error(`Milestone ${milestoneId} not found`);

  const now = new Date().toISOString();
  milestone.status = 'achieved';
  milestone.achievedAt = now;

  logLifecycleEvent({
    trackerId,
    modelId: tracker.modelId,
    eventType: 'milestone_achieved',
    stage: tracker.currentStage,
    description: `Milestone "${milestone.name}" achieved`,
    severity: 'info',
    metadata: { milestoneId, milestoneName: milestone.name },
  });

  tracker.updatedAt = now;
  return tracker;
}

export function getLifecycleEvents(
  trackerId: string,
  filters?: { eventType?: LifecycleEventType; severity?: string; limit?: number }
): LifecycleEvent[] {
  let result = lifecycleEvents.get(trackerId) || [];

  if (filters?.eventType) result = result.filter(e => e.eventType === filters.eventType);
  if (filters?.severity) result = result.filter(e => e.severity === filters.severity);

  result = result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (filters?.limit) {
    result = result.slice(0, filters.limit);
  }

  return result;
}

function logLifecycleEvent(params: {
  trackerId: string;
  modelId: string;
  eventType: LifecycleEventType;
  stage: LifecycleStage;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  metadata?: Record<string, any>;
}): void {
  const event: LifecycleEvent = {
    id: randomUUID(),
    trackerId: params.trackerId,
    modelId: params.modelId,
    eventType: params.eventType,
    stage: params.stage,
    description: params.description,
    severity: params.severity,
    timestamp: new Date().toISOString(),
    metadata: params.metadata,
  };

  const events = lifecycleEvents.get(params.trackerId) || [];
  events.push(event);
  lifecycleEvents.set(params.trackerId, events);
}

export function createLifecycleDashboard(params: {
  organizationId: string;
  name: string;
  widgets: Omit<DashboardWidget, 'id'>[];
  filters?: DashboardFilters;
  refreshInterval?: number;
}): LifecycleDashboard {
  const now = new Date().toISOString();
  const id = randomUUID();

  const dashboard: LifecycleDashboard = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    widgets: params.widgets.map(w => ({ ...w, id: randomUUID() })),
    filters: params.filters || {},
    refreshInterval: params.refreshInterval || 60,
    createdAt: now,
    updatedAt: now,
  };

  lifecycleDashboards.set(id, dashboard);
  return dashboard;
}

export function getLifecycleDashboard(id: string): LifecycleDashboard | undefined {
  return lifecycleDashboards.get(id);
}

export function listLifecycleDashboards(organizationId: string): LifecycleDashboard[] {
  return Array.from(lifecycleDashboards.values())
    .filter(d => d.organizationId === organizationId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getStageDistribution(organizationId: string): Record<LifecycleStage, number> {
  const trackers = listLifecycleTrackers(organizationId);
  const distribution: Record<string, number> = {};

  for (const tracker of trackers) {
    distribution[tracker.currentStage] = (distribution[tracker.currentStage] || 0) + 1;
  }

  return distribution as Record<LifecycleStage, number>;
}

export function getTransitionAnalysis(
  organizationId: string,
  fromStage: LifecycleStage,
  toStage: LifecycleStage
): TransitionAnalysis {
  const trackers = listLifecycleTrackers(organizationId);
  const transitions: StageTransition[] = [];

  for (const tracker of trackers) {
    const relevantTransitions = tracker.stageHistory.filter(
      t => t.fromStage === fromStage && t.toStage === toStage
    );
    transitions.push(...relevantTransitions);
  }

  const count = transitions.length;
  const averageDuration = count > 0 ? transitions.reduce((sum, t) => sum + t.duration, 0) / count : 0;
  
  const failedTransitions = transitions.filter(t => t.transitionType === 'rollback');
  const failureRate = count > 0 ? (failedTransitions.length / count) * 100 : 0;
  const successRate = 100 - failureRate;

  const failureReasons = failedTransitions
    .map(t => t.reason)
    .filter((r): r is string => r !== undefined);

  const reasonCounts = new Map<string, number>();
  for (const reason of failureReasons) {
    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
  }

  const commonFailureReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason]) => reason);

  return {
    fromStage,
    toStage,
    count,
    averageDuration,
    successRate,
    failureRate,
    commonFailureReasons,
  };
}

export function getBottleneckAnalysis(organizationId: string): BottleneckAnalysis[] {
  const trackers = listLifecycleTrackers(organizationId);
  const stageStats = new Map<LifecycleStage, { durations: number[]; count: number }>();

  for (const tracker of trackers) {
    for (const [stage, duration] of Object.entries(tracker.metrics.stageDurations)) {
      const stats = stageStats.get(stage as LifecycleStage) || { durations: [], count: 0 };
      stats.durations.push(duration);
      stats.count++;
      stageStats.set(stage as LifecycleStage, stats);
    }
  }

  const analyses: BottleneckAnalysis[] = [];

  for (const [stage, stats] of stageStats.entries()) {
    const averageDuration = stats.durations.reduce((sum, d) => sum + d, 0) / stats.durations.length;
    const maxDuration = Math.max(...stats.durations);

    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (averageDuration > 7 * 24 * 60 * 60 * 1000) severity = 'critical'; // > 7 days
    else if (averageDuration > 3 * 24 * 60 * 60 * 1000) severity = 'high'; // > 3 days
    else if (averageDuration > 24 * 60 * 60 * 1000) severity = 'medium'; // > 1 day

    const recommendations: string[] = [];
    if (severity === 'critical' || severity === 'high') {
      recommendations.push(`Review and optimize ${stage} stage processes`);
      recommendations.push('Identify and remove blockers');
      recommendations.push('Consider automation for manual tasks');
    }

    analyses.push({
      stage,
      averageDuration,
      maxDuration,
      modelCount: stats.count,
      severity,
      recommendations,
    });
  }

  return analyses.sort((a, b) => b.averageDuration - a.averageDuration);
}

export function getLifecycleKPIs(organizationId: string): LifecycleKPI[] {
  const trackers = listLifecycleTrackers(organizationId);
  const kpis: LifecycleKPI[] = [];

  // Time to Production KPI
  const productionTrackers = trackers.filter(t => {
    return t.stageHistory.some(h => h.toStage === 'production');
  });

  if (productionTrackers.length > 0) {
    const timesToProd = productionTrackers.map(t => {
      const prodTransition = t.stageHistory.find(h => h.toStage === 'production');
      return prodTransition ? new Date(prodTransition.timestamp).getTime() - new Date(t.createdAt).getTime() : 0;
    }).filter(t => t > 0);

    const avgTimeToProd = timesToProd.reduce((sum, t) => sum + t, 0) / timesToProd.length;
    const targetTimeToProd = 30 * 24 * 60 * 60 * 1000; // 30 days

    kpis.push({
      name: 'Average Time to Production',
      value: avgTimeToProd,
      target: targetTimeToProd,
      unit: 'milliseconds',
      trend: avgTimeToProd < targetTimeToProd ? 'improving' : 'declining',
      trendPercentage: ((targetTimeToProd - avgTimeToProd) / targetTimeToProd) * 100,
      status: avgTimeToProd <= targetTimeToProd ? 'on_track' : avgTimeToProd <= targetTimeToProd * 1.2 ? 'at_risk' : 'off_track',
    });
  }

  // Rollback Rate KPI
  const totalTransitions = trackers.reduce((sum, t) => sum + t.metrics.transitionCount, 0);
  const totalRollbacks = trackers.reduce((sum, t) => sum + t.metrics.rollbackCount, 0);
  const rollbackRate = totalTransitions > 0 ? (totalRollbacks / totalTransitions) * 100 : 0;
  const targetRollbackRate = 5; // 5%

  kpis.push({
    name: 'Rollback Rate',
    value: rollbackRate,
    target: targetRollbackRate,
    unit: 'percent',
    trend: rollbackRate < targetRollbackRate ? 'improving' : 'declining',
    trendPercentage: ((targetRollbackRate - rollbackRate) / targetRollbackRate) * 100,
    status: rollbackRate <= targetRollbackRate ? 'on_track' : rollbackRate <= targetRollbackRate * 1.5 ? 'at_risk' : 'off_track',
  });

  // Models in Production KPI
  const prodCount = trackers.filter(t => t.currentStage === 'production').length;
  const totalCount = trackers.length;
  const prodPercentage = totalCount > 0 ? (prodCount / totalCount) * 100 : 0;
  const targetProdPercentage = 60; // 60%

  kpis.push({
    name: 'Models in Production',
    value: prodPercentage,
    target: targetProdPercentage,
    unit: 'percent',
    trend: prodPercentage >= targetProdPercentage ? 'improving' : 'declining',
    trendPercentage: ((prodPercentage - targetProdPercentage) / targetProdPercentage) * 100,
    status: prodPercentage >= targetProdPercentage ? 'on_track' : prodPercentage >= targetProdPercentage * 0.8 ? 'at_risk' : 'off_track',
  });

  return kpis;
}

export function getLifecycleTimeline(
  trackerId: string,
  timeRange?: { start: string; end: string }
): StageTransition[] {
  const tracker = lifecycleTrackers.get(trackerId);
  if (!tracker) throw new Error(`Lifecycle tracker ${trackerId} not found`);

  let transitions = tracker.stageHistory;

  if (timeRange) {
    transitions = transitions.filter(t => {
      const ts = new Date(t.timestamp).getTime();
      return ts >= new Date(timeRange.start).getTime() && ts <= new Date(timeRange.end).getTime();
    });
  }

  return transitions.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
