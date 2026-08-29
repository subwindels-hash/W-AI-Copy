/**
 * Module 107: AI Model Metrics Collection Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides comprehensive metrics collection and aggregation for AI models including
 * performance metrics, business metrics, custom metrics, and real-time aggregation
 * with configurable retention and alerting.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MetricsCollector {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  status: CollectorStatus;
  configuration: CollectorConfiguration;
  metrics: MetricDefinition[];
  aggregations: AggregationRule[];
  retention: RetentionPolicy;
  createdAt: string;
  updatedAt: string;
}

export type CollectorStatus = 'active' | 'paused' | 'disabled' | 'error';

export interface CollectorConfiguration {
  collectionInterval: number; // seconds
  batchSize: number;
  bufferTimeout: number; // seconds
  compressionEnabled: boolean;
  samplingRate: number; // 0-1
  tags: Record<string, string>;
}

export interface MetricDefinition {
  id: string;
  name: string;
  type: MetricType;
  unit: string;
  description: string;
  dimensions: string[];
  labels: Record<string, string>;
  enabled: boolean;
}

export type MetricType =
  | 'counter'
  | 'gauge'
  | 'histogram'
  | 'summary'
  | 'distribution';

export interface AggregationRule {
  id: string;
  metricName: string;
  function: AggregationFunction;
  interval: number; // seconds
  dimensions: string[];
  retention: number; // days
  enabled: boolean;
}

export type AggregationFunction =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'p50'
  | 'p90'
  | 'p95'
  | 'p99';

export interface RetentionPolicy {
  raw: number; // days
  aggregated: number; // days
  downsampled: number; // days
}

export interface MetricDataPoint {
  timestamp: string;
  metricName: string;
  value: number;
  dimensions: Record<string, string>;
  labels: Record<string, string>;
}

export interface MetricQuery {
  metricName: string;
  startTime: string;
  endTime: string;
  dimensions?: Record<string, string>;
  aggregation?: AggregationFunction;
  interval?: number; // seconds
  groupBy?: string[];
}

export interface MetricQueryResult {
  metricName: string;
  dimensions: Record<string, string>;
  dataPoints: Array<{
    timestamp: string;
    value: number;
  }>;
  statistics?: {
    min: number;
    max: number;
    avg: number;
    sum: number;
    count: number;
  };
}

export interface MetricAlert {
  id: string;
  collectorId: string;
  metricName: string;
  condition: AlertCondition;
  status: AlertStatus;
  triggeredAt?: string;
  resolvedAt?: string;
  notifications: AlertNotification[];
  createdAt: string;
}

export interface AlertCondition {
  operator: 'greater_than' | 'less_than' | 'equals' | 'not_equals';
  threshold: number;
  duration: number; // seconds
  evaluationPeriod: number; // seconds
}

export type AlertStatus = 'ok' | 'alerting' | 'insufficient_data' | 'resolved';

export interface AlertNotification {
  channel: 'email' | 'slack' | 'webhook' | 'pagerduty';
  recipients: string[];
  sentAt: string;
  status: 'sent' | 'failed';
}

export interface MetricDashboard {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  timeRange: TimeRange;
  refreshInterval: number; // seconds
  createdAt: string;
  updatedAt: string;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  queries: MetricQuery[];
  position: { x: number; y: number; width: number; height: number };
  visualization: VisualizationConfig;
}

export type WidgetType = 'line_chart' | 'bar_chart' | 'gauge' | 'stat' | 'table' | 'heatmap';

export interface TimeRange {
  type: 'relative' | 'absolute';
  relative?: '1h' | '6h' | '24h' | '7d' | '30d';
  absolute?: { start: string; end: string };
}

export interface VisualizationConfig {
  chartType?: 'line' | 'area' | 'bar' | 'stacked';
  yAxis?: { min?: number; max?: number; label?: string };
  xAxis?: { label?: string };
  legend?: boolean;
  colors?: string[];
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const metricsCollectors = new Map<string, MetricsCollector>();
const metricDataPoints = new Map<string, MetricDataPoint[]>();
const metricAlerts = new Map<string, MetricAlert[]>();
const metricDashboards = new Map<string, MetricDashboard>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createMetricsCollector(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  configuration?: Partial<CollectorConfiguration>;
  metrics?: Omit<MetricDefinition, 'id'>[];
}): MetricsCollector {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultMetrics: MetricDefinition[] = [
    {
      id: randomUUID(),
      name: 'inference_latency_ms',
      type: 'histogram',
      unit: 'milliseconds',
      description: 'Model inference latency',
      dimensions: ['model_version', 'endpoint'],
      labels: {},
      enabled: true,
    },
    {
      id: randomUUID(),
      name: 'requests_per_second',
      type: 'gauge',
      unit: 'requests/second',
      description: 'Request throughput',
      dimensions: ['model_version', 'endpoint'],
      labels: {},
      enabled: true,
    },
    {
      id: randomUUID(),
      name: 'error_rate',
      type: 'gauge',
      unit: 'percent',
      description: 'Error rate percentage',
      dimensions: ['model_version', 'error_type'],
      labels: {},
      enabled: true,
    },
    {
      id: randomUUID(),
      name: 'cpu_utilization',
      type: 'gauge',
      unit: 'percent',
      description: 'CPU utilization',
      dimensions: ['instance_id'],
      labels: {},
      enabled: true,
    },
    {
      id: randomUUID(),
      name: 'memory_usage_mb',
      type: 'gauge',
      unit: 'megabytes',
      description: 'Memory usage',
      dimensions: ['instance_id'],
      labels: {},
      enabled: true,
    },
  ];

  const defaultAggregations: AggregationRule[] = [
    {
      id: randomUUID(),
      metricName: 'inference_latency_ms',
      function: 'p95',
      interval: 60,
      dimensions: ['model_version'],
      retention: 30,
      enabled: true,
    },
    {
      id: randomUUID(),
      metricName: 'requests_per_second',
      function: 'avg',
      interval: 60,
      dimensions: ['model_version'],
      retention: 30,
      enabled: true,
    },
  ];

  const collector: MetricsCollector = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    status: 'active',
    configuration: {
      collectionInterval: 10,
      batchSize: 100,
      bufferTimeout: 30,
      compressionEnabled: true,
      samplingRate: 1.0,
      tags: {},
      ...params.configuration,
    },
    metrics: params.metrics?.map(m => ({ ...m, id: randomUUID() })) || defaultMetrics,
    aggregations: defaultAggregations,
    retention: {
      raw: 7,
      aggregated: 90,
      downsampled: 365,
    },
    createdAt: now,
    updatedAt: now,
  };

  metricsCollectors.set(id, collector);
  metricDataPoints.set(id, []);
  metricAlerts.set(id, []);

  return collector;
}

export function getMetricsCollector(id: string): MetricsCollector | undefined {
  return metricsCollectors.get(id);
}

export function listMetricsCollectors(
  organizationId: string,
  filters?: { modelId?: string; status?: CollectorStatus }
): MetricsCollector[] {
  let result = Array.from(metricsCollectors.values()).filter(
    c => c.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(c => c.modelId === filters.modelId);
  if (filters?.status) result = result.filter(c => c.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function pauseMetricsCollector(collectorId: string): MetricsCollector {
  const collector = metricsCollectors.get(collectorId);
  if (!collector) throw new Error(`Collector ${collectorId} not found`);

  collector.status = 'paused';
  collector.updatedAt = new Date().toISOString();
  return collector;
}

export function resumeMetricsCollector(collectorId: string): MetricsCollector {
  const collector = metricsCollectors.get(collectorId);
  if (!collector) throw new Error(`Collector ${collectorId} not found`);

  collector.status = 'active';
  collector.updatedAt = new Date().toISOString();
  return collector;
}

export function recordMetric(
  collectorId: string,
  metricName: string,
  value: number,
  dimensions?: Record<string, string>,
  labels?: Record<string, string>
): MetricDataPoint {
  const collector = metricsCollectors.get(collectorId);
  if (!collector) throw new Error(`Collector ${collectorId} not found`);

  const metric = collector.metrics.find(m => m.name === metricName);
  if (!metric) throw new Error(`Metric ${metricName} not defined`);
  if (!metric.enabled) throw new Error(`Metric ${metricName} is disabled`);

  const dataPoint: MetricDataPoint = {
    timestamp: new Date().toISOString(),
    metricName,
    value,
    dimensions: dimensions || {},
    labels: labels || {},
  };

  const points = metricDataPoints.get(collectorId) || [];
  points.push(dataPoint);

  // Keep only recent points (based on retention policy)
  const retentionMs = collector.retention.raw * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - retentionMs;
  const filtered = points.filter(p => new Date(p.timestamp).getTime() > cutoff);
  metricDataPoints.set(collectorId, filtered);

  // Check alerts
  checkMetricAlerts(collectorId, metricName, value);

  return dataPoint;
}

export function recordBatchMetrics(
  collectorId: string,
  metrics: Array<{
    metricName: string;
    value: number;
    dimensions?: Record<string, string>;
    labels?: Record<string, string>;
  }>
): MetricDataPoint[] {
  return metrics.map(m => 
    recordMetric(collectorId, m.metricName, m.value, m.dimensions, m.labels)
  );
}

function checkMetricAlerts(collectorId: string, metricName: string, value: number): void {
  const alerts = metricAlerts.get(collectorId) || [];
  const relevantAlerts = alerts.filter(a => a.metricName === metricName);

  for (const alert of relevantAlerts) {
    const conditionMet = evaluateCondition(alert.condition, value);

    if (conditionMet && alert.status === 'ok') {
      alert.status = 'alerting';
      alert.triggeredAt = new Date().toISOString();
      // Would send notifications here
    } else if (!conditionMet && alert.status === 'alerting') {
      alert.status = 'resolved';
      alert.resolvedAt = new Date().toISOString();
    }
  }
}

function evaluateCondition(condition: AlertCondition, value: number): boolean {
  switch (condition.operator) {
    case 'greater_than':
      return value > condition.threshold;
    case 'less_than':
      return value < condition.threshold;
    case 'equals':
      return value === condition.threshold;
    case 'not_equals':
      return value !== condition.threshold;
    default:
      return false;
  }
}

export function queryMetrics(
  collectorId: string,
  query: MetricQuery
): MetricQueryResult {
  const collector = metricsCollectors.get(collectorId);
  if (!collector) throw new Error(`Collector ${collectorId} not found`);

  const points = metricDataPoints.get(collectorId) || [];
  const startTime = new Date(query.startTime).getTime();
  const endTime = new Date(query.endTime).getTime();

  let filtered = points.filter(p => {
    const ts = new Date(p.timestamp).getTime();
    if (ts < startTime || ts > endTime) return false;
    if (p.metricName !== query.metricName) return false;
    
    if (query.dimensions) {
      for (const [key, value] of Object.entries(query.dimensions)) {
        if (p.dimensions[key] !== value) return false;
      }
    }
    
    return true;
  });

  // Apply aggregation if specified
  if (query.aggregation && query.interval) {
    filtered = aggregateDataPoints(filtered, query.aggregation, query.interval);
  }

  // Calculate statistics
  const values = filtered.map(p => p.value);
  const statistics = values.length > 0 ? {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    sum: values.reduce((a, b) => a + b, 0),
    count: values.length,
  } : undefined;

  return {
    metricName: query.metricName,
    dimensions: query.dimensions || {},
    dataPoints: filtered.map(p => ({
      timestamp: p.timestamp,
      value: p.value,
    })),
    statistics,
  };
}

function aggregateDataPoints(
  points: MetricDataPoint[],
  aggregation: AggregationFunction,
  interval: number
): MetricDataPoint[] {
  const buckets = new Map<number, number[]>();

  for (const point of points) {
    const ts = new Date(point.timestamp).getTime();
    const bucketKey = Math.floor(ts / (interval * 1000)) * (interval * 1000);
    
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    buckets.get(bucketKey)!.push(point.value);
  }

  const aggregated: MetricDataPoint[] = [];
  for (const [bucketKey, values] of buckets.entries()) {
    let value: number;

    switch (aggregation) {
      case 'sum':
        value = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        value = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'min':
        value = Math.min(...values);
        break;
      case 'max':
        value = Math.max(...values);
        break;
      case 'count':
        value = values.length;
        break;
      case 'p50':
      case 'p90':
      case 'p95':
      case 'p99':
        const sorted = [...values].sort((a, b) => a - b);
        const percentile = aggregation === 'p50' ? 0.5 :
                          aggregation === 'p90' ? 0.9 :
                          aggregation === 'p95' ? 0.95 : 0.99;
        const index = Math.floor(sorted.length * percentile);
        value = sorted[index];
        break;
      default:
        value = values.reduce((a, b) => a + b, 0) / values.length;
    }

    aggregated.push({
      timestamp: new Date(bucketKey).toISOString(),
      metricName: points[0].metricName,
      value,
      dimensions: points[0].dimensions,
      labels: points[0].labels,
    });
  }

  return aggregated.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export function createMetricAlert(params: {
  collectorId: string;
  metricName: string;
  condition: AlertCondition;
  notifications: Array<{
    channel: 'email' | 'slack' | 'webhook' | 'pagerduty';
    recipients: string[];
  }>;
}): MetricAlert {
  const collector = metricsCollectors.get(params.collectorId);
  if (!collector) throw new Error(`Collector ${params.collectorId} not found`);

  const now = new Date().toISOString();
  const alert: MetricAlert = {
    id: randomUUID(),
    collectorId: params.collectorId,
    metricName: params.metricName,
    condition: params.condition,
    status: 'ok',
    notifications: params.notifications.map(n => ({
      ...n,
      sentAt: now,
      status: 'sent',
    })),
    createdAt: now,
  };

  const alerts = metricAlerts.get(params.collectorId) || [];
  alerts.push(alert);
  metricAlerts.set(params.collectorId, alerts);

  return alert;
}

export function getMetricAlerts(
  collectorId: string,
  filters?: { status?: AlertStatus }
): MetricAlert[] {
  let alerts = metricAlerts.get(collectorId) || [];

  if (filters?.status) {
    alerts = alerts.filter(a => a.status === filters.status);
  }

  return alerts;
}

export function createMetricDashboard(params: {
  organizationId: string;
  name: string;
  description?: string;
  widgets: Omit<DashboardWidget, 'id'>[];
  timeRange?: TimeRange;
  refreshInterval?: number;
}): MetricDashboard {
  const now = new Date().toISOString();
  const id = randomUUID();

  const dashboard: MetricDashboard = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    widgets: params.widgets.map(w => ({ ...w, id: randomUUID() })),
    timeRange: params.timeRange || { type: 'relative', relative: '1h' },
    refreshInterval: params.refreshInterval || 30,
    createdAt: now,
    updatedAt: now,
  };

  metricDashboards.set(id, dashboard);
  return dashboard;
}

export function getMetricDashboard(id: string): MetricDashboard | undefined {
  return metricDashboards.get(id);
}

export function listMetricDashboards(organizationId: string): MetricDashboard[] {
  return Array.from(metricDashboards.values())
    .filter(d => d.organizationId === organizationId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function updateMetricDashboard(
  dashboardId: string,
  updates: Partial<MetricDashboard>
): MetricDashboard {
  const dashboard = metricDashboards.get(dashboardId);
  if (!dashboard) throw new Error(`Dashboard ${dashboardId} not found`);

  Object.assign(dashboard, updates, { updatedAt: new Date().toISOString() });
  return dashboard;
}

export function addMetricDefinition(
  collectorId: string,
  metric: Omit<MetricDefinition, 'id'>
): MetricDefinition {
  const collector = metricsCollectors.get(collectorId);
  if (!collector) throw new Error(`Collector ${collectorId} not found`);

  const newMetric: MetricDefinition = {
    ...metric,
    id: randomUUID(),
  };

  collector.metrics.push(newMetric);
  collector.updatedAt = new Date().toISOString();

  return newMetric;
}

export function addAggregationRule(
  collectorId: string,
  rule: Omit<AggregationRule, 'id'>
): AggregationRule {
  const collector = metricsCollectors.get(collectorId);
  if (!collector) throw new Error(`Collector ${collectorId} not found`);

  const newRule: AggregationRule = {
    ...rule,
    id: randomUUID(),
  };

  collector.aggregations.push(newRule);
  collector.updatedAt = new Date().toISOString();

  return newRule;
}
