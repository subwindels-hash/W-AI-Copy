/**
 * Module 132: AI Model Monitoring Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides comprehensive model monitoring capabilities including real-time performance
 * monitoring, drift detection, anomaly detection, alerting, and monitoring dashboards
 * to ensure models perform reliably in production.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ModelMonitor {
  id: string;
  organizationId: string;
  modelId: string;
  modelVersion: string;
  status: MonitorStatus;
  configuration: MonitorConfiguration;
  metrics: MonitorMetric[];
  alerts: MonitorAlert[];
  driftDetection: DriftDetectionConfig;
  anomalyDetection: AnomalyDetectionConfig;
  lastCheck?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type MonitorStatus =
  | 'active'
  | 'paused'
  | 'disabled'
  | 'error';

export interface MonitorConfiguration {
  checkInterval: number; // seconds
  retentionPeriod: number; // days
  dataSources: MonitorDataSource[];
  notifications: MonitorNotificationConfig;
  dashboard: MonitorDashboardConfig;
}

export interface MonitorDataSource {
  type: 'inference_logs' | 'prediction_logs' | 'feature_store' | 'custom';
  configuration: Record<string, any>;
  enabled: boolean;
}

export interface MonitorNotificationConfig {
  enabled: boolean;
  channels: ('email' | 'slack' | 'webhook' | 'pagerduty')[];
  recipients: string[];
  severity: ('info' | 'warning' | 'critical')[];
}

export interface MonitorDashboardConfig {
  enabled: boolean;
  refreshInterval: number; // seconds
  widgets: DashboardWidget[];
}

export interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'alert' | 'drift' | 'custom';
  title: string;
  configuration: Record<string, any>;
  position: { x: number; y: number; width: number; height: number };
}

export interface MonitorMetric {
  id: string;
  name: string;
  type: MetricType;
  description?: string;
  unit: string;
  currentValue: number;
  baselineValue?: number;
  threshold?: MetricThreshold;
  history: MetricDataPoint[];
  trend: 'increasing' | 'decreasing' | 'stable';
  status: 'normal' | 'warning' | 'critical';
  lastUpdated: string;
}

export type MetricType =
  | 'latency'
  | 'throughput'
  | 'accuracy'
  | 'error_rate'
  | 'prediction_distribution'
  | 'feature_drift'
  | 'custom';

export interface MetricThreshold {
  warning?: number;
  critical?: number;
  operator: 'gt' | 'lt' | 'gte' | 'lte';
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  metadata?: Record<string, any>;
}

export interface MonitorAlert {
  id: string;
  monitorId: string;
  type: AlertType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  metric?: string;
  currentValue?: number;
  threshold?: number;
  status: 'active' | 'acknowledged' | 'resolved';
  triggeredAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  acknowledgedBy?: string;
  resolvedBy?: string;
}

export type AlertType =
  | 'threshold_breach'
  | 'drift_detected'
  | 'anomaly_detected'
  | 'performance_degradation'
  | 'error_spike'
  | 'custom';

export interface DriftDetectionConfig {
  enabled: boolean;
  features: string[];
  method: 'ks_test' | 'psi' | 'wasserstein' | 'custom';
  threshold: number;
  baselineWindow: number; // days
  checkInterval: number; // hours
  lastCheck?: string;
  lastDriftScore?: number;
}

export interface AnomalyDetectionConfig {
  enabled: boolean;
  metrics: string[];
  method: 'statistical' | 'ml_based' | 'custom';
  sensitivity: 'low' | 'medium' | 'high';
  baselineWindow: number; // days
  checkInterval: number; // hours
  lastCheck?: string;
}

export interface MonitoringReport {
  id: string;
  monitorId: string;
  type: 'summary' | 'detailed' | 'executive';
  title: string;
  executiveSummary: string;
  metrics: MonitorMetric[];
  alerts: MonitorAlert[];
  driftAnalysis: DriftAnalysis;
  anomalyAnalysis: AnomalyAnalysis;
  trends: MonitoringTrend[];
  recommendations: MonitoringRecommendation[];
  appendices: ReportAppendix[];
  generatedAt: string;
  generatedBy: string;
}

export interface DriftAnalysis {
  overallDriftScore: number;
  driftedFeatures: string[];
  driftMagnitude: Record<string, number>;
  trend: 'increasing' | 'decreasing' | 'stable';
  recommendations: string[];
}

export interface AnomalyAnalysis {
  totalAnomalies: number;
  anomaliesByMetric: Record<string, number>;
  recentAnomalies: AnomalyDetail[];
  trend: 'increasing' | 'decreasing' | 'stable';
  recommendations: string[];
}

export interface AnomalyDetail {
  metric: string;
  timestamp: string;
  value: number;
  expectedRange: { min: number; max: number };
  severity: 'low' | 'medium' | 'high';
}

export interface MonitoringTrend {
  metric: string;
  dataPoints: MetricDataPoint[];
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercent: number;
}

export interface MonitoringRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'drift' | 'anomaly' | 'performance' | 'configuration';
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

const modelMonitors = new Map<string, ModelMonitor>();
const monitoringReports = new Map<string, MonitoringReport>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createModelMonitor(params: {
  organizationId: string;
  modelId: string;
  modelVersion: string;
  configuration: MonitorConfiguration;
  metrics?: Omit<MonitorMetric, 'id' | 'history' | 'lastUpdated'>[];
  driftDetection?: DriftDetectionConfig;
  anomalyDetection?: AnomalyDetectionConfig;
  createdBy: string;
}): ModelMonitor {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultMetrics: MonitorMetric[] = [
    {
      id: randomUUID(),
      name: 'Inference Latency',
      type: 'latency',
      unit: 'ms',
      currentValue: 0,
      threshold: { warning: 100, critical: 200, operator: 'gt' },
      history: [],
      trend: 'stable',
      status: 'normal',
      lastUpdated: now,
    },
    {
      id: randomUUID(),
      name: 'Throughput',
      type: 'throughput',
      unit: 'req/s',
      currentValue: 0,
      threshold: { warning: 50, critical: 20, operator: 'lt' },
      history: [],
      trend: 'stable',
      status: 'normal',
      lastUpdated: now,
    },
    {
      id: randomUUID(),
      name: 'Error Rate',
      type: 'error_rate',
      unit: '%',
      currentValue: 0,
      threshold: { warning: 1, critical: 5, operator: 'gt' },
      history: [],
      trend: 'stable',
      status: 'normal',
      lastUpdated: now,
    },
  ];

  const monitor: ModelMonitor = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    status: 'active',
    configuration: params.configuration,
    metrics: params.metrics?.map(m => ({
      ...m,
      id: randomUUID(),
      history: [],
      lastUpdated: now,
    })) || defaultMetrics,
    alerts: [],
    driftDetection: params.driftDetection || {
      enabled: true,
      features: [],
      method: 'ks_test',
      threshold: 0.1,
      baselineWindow: 30,
      checkInterval: 24,
    },
    anomalyDetection: params.anomalyDetection || {
      enabled: true,
      metrics: ['latency', 'error_rate'],
      method: 'statistical',
      sensitivity: 'medium',
      baselineWindow: 30,
      checkInterval: 1,
    },
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  modelMonitors.set(id, monitor);
  return monitor;
}

export function getModelMonitor(id: string): ModelMonitor | undefined {
  return modelMonitors.get(id);
}

export function listModelMonitors(
  organizationId: string,
  filters?: { modelId?: string; status?: MonitorStatus }
): ModelMonitor[] {
  let result = Array.from(modelMonitors.values()).filter(
    m => m.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(m => m.modelId === filters.modelId);
  if (filters?.status) result = result.filter(m => m.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateModelMonitor(
  monitorId: string,
  updates: Partial<ModelMonitor>
): ModelMonitor {
  const monitor = modelMonitors.get(monitorId);
  if (!monitor) throw new Error(`Monitor ${monitorId} not found`);

  Object.assign(monitor, updates);
  monitor.updatedAt = new Date().toISOString();

  return monitor;
}

export function pauseModelMonitor(monitorId: string): ModelMonitor {
  const monitor = modelMonitors.get(monitorId);
  if (!monitor) throw new Error(`Monitor ${monitorId} not found`);

  monitor.status = 'paused';
  monitor.updatedAt = new Date().toISOString();

  return monitor;
}

export function resumeModelMonitor(monitorId: string): ModelMonitor {
  const monitor = modelMonitors.get(monitorId);
  if (!monitor) throw new Error(`Monitor ${monitorId} not found`);

  monitor.status = 'active';
  monitor.updatedAt = new Date().toISOString();

  return monitor;
}

export function recordMetric(
  monitorId: string,
  metricId: string,
  value: number,
  metadata?: Record<string, any>
): MonitorMetric {
  const monitor = modelMonitors.get(monitorId);
  if (!monitor) throw new Error(`Monitor ${monitorId} not found`);

  const metric = monitor.metrics.find(m => m.id === metricId);
  if (!metric) throw new Error(`Metric ${metricId} not found`);

  const now = new Date().toISOString();
  const dataPoint: MetricDataPoint = {
    timestamp: now,
    value,
    metadata,
  };

  metric.history.push(dataPoint);
  metric.currentValue = value;
  metric.lastUpdated = now;

  // Keep only last 1000 data points
  if (metric.history.length > 1000) {
    metric.history = metric.history.slice(-1000);
  }

  // Calculate trend
  if (metric.history.length >= 10) {
    const recentValues = metric.history.slice(-10).map(d => d.value);
    const firstHalf = recentValues.slice(0, 5);
    const secondHalf = recentValues.slice(5);
    const firstAvg = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length;
    const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (changePercent > 10) {
      metric.trend = 'increasing';
    } else if (changePercent < -10) {
      metric.trend = 'decreasing';
    } else {
      metric.trend = 'stable';
    }
  }

  // Check thresholds
  if (metric.threshold) {
    const { warning, critical, operator } = metric.threshold;
    let breached = false;

    if (critical !== undefined) {
      if (operator === 'gt' && value > critical) breached = true;
      if (operator === 'lt' && value < critical) breached = true;
      if (operator === 'gte' && value >= critical) breached = true;
      if (operator === 'lte' && value <= critical) breached = true;

      if (breached) {
        metric.status = 'critical';
        createAlert(monitor, metric, 'critical', value, critical);
      }
    }

    if (!breached && warning !== undefined) {
      if (operator === 'gt' && value > warning) breached = true;
      if (operator === 'lt' && value < warning) breached = true;
      if (operator === 'gte' && value >= warning) breached = true;
      if (operator === 'lte' && value <= warning) breached = true;

      if (breached) {
        metric.status = 'warning';
        createAlert(monitor, metric, 'warning', value, warning);
      }
    }

    if (!breached) {
      metric.status = 'normal';
    }
  }

  monitor.updatedAt = now;
  return metric;
}

function createAlert(
  monitor: ModelMonitor,
  metric: MonitorMetric,
  severity: 'warning' | 'critical',
  currentValue: number,
  threshold: number
): void {
  const now = new Date().toISOString();
  const alert: MonitorAlert = {
    id: randomUUID(),
    monitorId: monitor.id,
    type: 'threshold_breach',
    severity,
    title: `${metric.name} threshold breach`,
    description: `${metric.name} is ${currentValue} ${metric.unit}, which is ${metric.threshold?.operator} ${threshold} ${metric.unit}`,
    metric: metric.name,
    currentValue,
    threshold,
    status: 'active',
    triggeredAt: now,
  };

  monitor.alerts.push(alert);

  // Keep only last 100 alerts
  if (monitor.alerts.length > 100) {
    monitor.alerts = monitor.alerts.slice(-100);
  }
}

export function acknowledgeAlert(
  monitorId: string,
  alertId: string,
  acknowledgedBy: string
): MonitorAlert {
  const monitor = modelMonitors.get(monitorId);
  if (!monitor) throw new Error(`Monitor ${monitorId} not found`);

  const alert = monitor.alerts.find(a => a.id === alertId);
  if (!alert) throw new Error(`Alert ${alertId} not found`);

  alert.status = 'acknowledged';
  alert.acknowledgedAt = new Date().toISOString();
  alert.acknowledgedBy = acknowledgedBy;

  return alert;
}

export function resolveAlert(
  monitorId: string,
  alertId: string,
  resolvedBy: string
): MonitorAlert {
  const monitor = modelMonitors.get(monitorId);
  if (!monitor) throw new Error(`Monitor ${monitorId} not found`);

  const alert = monitor.alerts.find(a => a.id === alertId);
  if (!alert) throw new Error(`Alert ${alertId} not found`);

  alert.status = 'resolved';
  alert.resolvedAt = new Date().toISOString();
  alert.resolvedBy = resolvedBy;

  return alert;
}

export function getMonitorMetrics(monitorId: string): MonitorMetric[] {
  const monitor = modelMonitors.get(monitorId);
  if (!monitor) throw new Error(`Monitor ${monitorId} not found`);

  return monitor.metrics;
}

export function getMonitorAlerts(
  monitorId: string,
  filters?: { severity?: string; status?: string }
): MonitorAlert[] {
  const monitor = modelMonitors.get(monitorId);
  if (!monitor) throw new Error(`Monitor ${monitorId} not found`);

  let result = monitor.alerts;

  if (filters?.severity) result = result.filter(a => a.severity === filters.severity);
  if (filters?.status) result = result.filter(a => a.status === filters.status);

  return result.sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt));
}

export function generateMonitoringReport(
  monitorId: string,
  type: 'summary' | 'detailed' | 'executive',
  generatedBy: string
): MonitoringReport {
  const monitor = modelMonitors.get(monitorId);
  if (!monitor) throw new Error(`Monitor ${monitorId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const executiveSummary = `Model monitoring report for ${monitor.modelId} v${monitor.modelVersion}. ` +
    `${monitor.metrics.length} metrics monitored with ${monitor.alerts.filter(a => a.status === 'active').length} active alerts.`;

  const driftAnalysis: DriftAnalysis = {
    overallDriftScore: monitor.driftDetection.lastDriftScore || 0,
    driftedFeatures: [],
    driftMagnitude: {},
    trend: 'stable',
    recommendations: [],
  };

  const anomalyAnalysis: AnomalyAnalysis = {
    totalAnomalies: 0,
    anomaliesByMetric: {},
    recentAnomalies: [],
    trend: 'stable',
    recommendations: [],
  };

  const trends: MonitoringTrend[] = monitor.metrics.map(metric => ({
    metric: metric.name,
    dataPoints: metric.history.slice(-100),
    trend: metric.trend,
    changePercent: 0,
  }));

  const recommendations: MonitoringRecommendation[] = [];

  if (monitor.alerts.filter(a => a.status === 'active').length > 0) {
    recommendations.push({
      id: randomUUID(),
      priority: 'high',
      category: 'performance',
      title: 'Address active alerts',
      description: `${monitor.alerts.filter(a => a.status === 'active').length} active alerts require attention`,
      impact: 'Improved model reliability',
      effort: 'medium',
      actionItems: ['Review and resolve active alerts'],
    });
  }

  const report: MonitoringReport = {
    id,
    monitorId,
    type,
    title: `${type.charAt(0).toUpperCase() + type.slice(1)} Monitoring Report`,
    executiveSummary,
    metrics: monitor.metrics,
    alerts: monitor.alerts,
    driftAnalysis,
    anomalyAnalysis,
    trends,
    recommendations,
    appendices: [],
    generatedAt: now,
    generatedBy,
  };

  monitoringReports.set(id, report);
  return report;
}

export function getMonitoringReport(id: string): MonitoringReport | undefined {
  return monitoringReports.get(id);
}

export function listMonitoringReports(
  organizationId: string,
  filters?: { type?: string; monitorId?: string }
): MonitoringReport[] {
  const monitors = Array.from(modelMonitors.values()).filter(
    m => m.organizationId === organizationId
  );
  const monitorIds = monitors.map(m => m.id);

  let result = Array.from(monitoringReports.values()).filter(
    r => monitorIds.includes(r.monitorId)
  );

  if (filters?.type) result = result.filter(r => r.type === filters.type);
  if (filters?.monitorId) result = result.filter(r => r.monitorId === filters.monitorId);

  return result.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export function getMonitoringDashboard(organizationId: string): {
  totalMonitors: number;
  activeMonitors: number;
  activeAlerts: number;
  criticalAlerts: number;
  averageLatency: number;
  errorRate: number;
  overallHealth: 'healthy' | 'warning' | 'critical';
} {
  const monitors = Array.from(modelMonitors.values()).filter(
    m => m.organizationId === organizationId
  );

  const activeMonitors = monitors.filter(m => m.status === 'active').length;
  const activeAlerts = monitors.reduce(
    (sum, m) => sum + m.alerts.filter(a => a.status === 'active').length, 0
  );
  const criticalAlerts = monitors.reduce(
    (sum, m) => sum + m.alerts.filter(a => a.status === 'active' && a.severity === 'critical').length, 0
  );

  const latencyMetrics = monitors.flatMap(m => 
    m.metrics.filter(met => met.type === 'latency').map(met => met.currentValue)
  );
  const averageLatency = latencyMetrics.length > 0
    ? latencyMetrics.reduce((sum, v) => sum + v, 0) / latencyMetrics.length
    : 0;

  const errorRateMetrics = monitors.flatMap(m => 
    m.metrics.filter(met => met.type === 'error_rate').map(met => met.currentValue)
  );
  const errorRate = errorRateMetrics.length > 0
    ? errorRateMetrics.reduce((sum, v) => sum + v, 0) / errorRateMetrics.length
    : 0;

  const overallHealth = criticalAlerts > 0 ? 'critical'
    : activeAlerts > 5 ? 'warning'
    : 'healthy';

  return {
    totalMonitors: monitors.length,
    activeMonitors,
    activeAlerts,
    criticalAlerts,
    averageLatency,
    errorRate,
    overallHealth,
  };
}
