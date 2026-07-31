/**
 * Module 78: AI Model Performance Monitoring Service
 *
 * Provides comprehensive model performance monitoring including performance dashboards,
 * trend analysis, degradation detection, benchmarking, performance reporting with
 * insights, custom metric aggregation, and performance alerts with ML context for
 * production model monitoring.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PerformanceMonitoringConfig {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  status: MonitoringStatus;
  metrics: MetricConfig[];
  dashboards: DashboardConfig[];
  alerts: PerformanceAlertRule[];
  benchmarks: BenchmarkConfig[];
  reporting: ReportingConfig;
  dataRetention: DataRetentionConfig;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type MonitoringStatus = 'active' | 'paused' | 'stopped' | 'error';

export interface MetricConfig {
  id: string;
  name: string;
  type: MetricType;
  category: MetricCategory;
  aggregation: AggregationType;
  thresholds?: MetricThresholds;
  baseline?: number;
  unit?: string;
  enabled: boolean;
}

export type MetricType =
  | 'accuracy'
  | 'precision'
  | 'recall'
  | 'f1-score'
  | 'auc-roc'
  | 'mse'
  | 'mae'
  | 'r2'
  | 'latency'
  | 'throughput'
  | 'error-rate'
  | 'prediction-distribution'
  | 'feature-importance'
  | 'custom';

export type MetricCategory = 'performance' | 'latency' | 'throughput' | 'quality' | 'business' | 'custom';

export type AggregationType = 'mean' | 'median' | 'p50' | 'p90' | 'p95' | 'p99' | 'min' | 'max' | 'sum' | 'count';

export interface MetricThresholds {
  warning?: number;
  critical?: number;
  direction: 'above' | 'below' | 'both';
}

export interface DashboardConfig {
  id: string;
  name: string;
  description?: string;
  layout: DashboardLayout;
  widgets: DashboardWidget[];
  refreshInterval: number; // seconds
  isDefault: boolean;
}

export interface DashboardLayout {
  type: 'grid' | 'flex' | 'custom';
  columns: number;
  rows: number;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  metricIds: string[];
  position: { x: number; y: number; width: number; height: number };
  config: Record<string, any>;
}

export type WidgetType =
  | 'line-chart'
  | 'bar-chart'
  | 'gauge'
  | 'stat'
  | 'table'
  | 'heatmap'
  | 'histogram'
  | 'scatter-plot'
  | 'text';

export interface PerformanceAlertRule {
  id: string;
  name: string;
  description?: string;
  metricId: string;
  condition: AlertCondition;
  severity: AlertSeverity;
  notificationChannels: NotificationChannel[];
  cooldownMinutes: number;
  enabled: boolean;
}

export interface AlertCondition {
  type: 'threshold' | 'trend' | 'anomaly' | 'degradation';
  threshold?: number;
  operator?: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  trendWindow?: number; // minutes
  trendDirection?: 'increasing' | 'decreasing';
  anomalySensitivity?: 'low' | 'medium' | 'high';
  degradationPercentage?: number;
}

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'pagerduty';
  config: Record<string, any>;
}

export interface BenchmarkConfig {
  id: string;
  name: string;
  baselineModelId?: string;
  baselineModelVersion?: string;
  metrics: string[];
  comparisonType: 'absolute' | 'relative' | 'statistical';
  threshold?: number;
}

export interface ReportingConfig {
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  recipients: string[];
  format: 'pdf' | 'html' | 'json';
  includeVisualizations: boolean;
  includeInsights: boolean;
}

export interface DataRetentionConfig {
  rawDataDays: number;
  aggregatedDataDays: number;
  metricDataDays: number;
}

export interface PerformanceMetrics {
  timestamp: string;
  modelId: string;
  modelVersion: string;
  metrics: Record<string, MetricValue>;
  sampleSize: number;
  windowStart: string;
  windowEnd: string;
}

export interface MetricValue {
  value: number;
  count: number;
  min?: number;
  max?: number;
  p50?: number;
  p90?: number;
  p95?: number;
  p99?: number;
  std?: number;
}

export interface PerformanceTrend {
  metricId: string;
  metricName: string;
  trend: TrendDirection;
  slope: number;
  r2: number;
  changePoints: ChangePoint[];
  forecast: TrendForecast;
  insights: string[];
}

export type TrendDirection = 'increasing' | 'decreasing' | 'stable' | 'fluctuating';

export interface ChangePoint {
  timestamp: string;
  valueBefore: number;
  valueAfter: number;
  magnitude: number;
  significance: number;
}

export interface TrendForecast {
  timestamps: string[];
  values: number[];
  lowerBound: number[];
  upperBound: number[];
  confidence: number;
}

export interface PerformanceDegradation {
  id: string;
  modelId: string;
  modelVersion: string;
  metricId: string;
  metricName: string;
  detectedAt: string;
  severity: DegradationSeverity;
  baselineValue: number;
  currentValue: number;
  degradationPercentage: number;
  duration: number; // minutes
  status: DegradationStatus;
  rootCause?: string;
  impact?: string;
  remediation?: string;
}

export type DegradationSeverity = 'minor' | 'moderate' | 'severe' | 'critical';

export type DegradationStatus = 'detected' | 'investigating' | 'mitigating' | 'resolved' | 'ignored';

export interface PerformanceReport {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  reportType: ReportType;
  period: { start: string; end: string };
  summary: ReportSummary;
  metrics: ReportMetric[];
  trends: PerformanceTrend[];
  degradations: PerformanceDegradation[];
  insights: ReportInsight[];
  recommendations: string[];
  visualizations: ReportVisualization[];
  generatedAt: string;
  generatedBy: string;
}

export type ReportType = 'summary' | 'detailed' | 'comparison' | 'trend' | 'custom';

export interface ReportSummary {
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  healthScore: number; // 0-100
  totalPredictions: number;
  averageLatency: number;
  errorRate: number;
  keyFindings: string[];
}

export interface ReportMetric {
  metricId: string;
  metricName: string;
  category: MetricCategory;
  currentValue: number;
  baselineValue?: number;
  change?: number;
  changePercentage?: number;
  status: 'good' | 'warning' | 'critical';
}

export interface ReportInsight {
  type: 'trend' | 'anomaly' | 'degradation' | 'improvement' | 'recommendation';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  metrics?: string[];
  timestamp?: string;
}

export interface ReportVisualization {
  id: string;
  type: string;
  title: string;
  data: any;
  config: Record<string, any>;
}

export interface PerformanceDashboard {
  organizationId: string;
  totalConfigs: number;
  activeConfigs: number;
  totalModels: number;
  averageHealthScore: number;
  modelsByHealth: Record<string, number>;
  totalDegradations: number;
  activeDegradations: number;
  recentAlerts: Array<{
    alertId: string;
    modelName: string;
    metric: string;
    severity: AlertSeverity;
    timestamp: string;
  }>;
  topPerformingModels: Array<{
    modelId: string;
    modelName: string;
    healthScore: number;
    predictions: number;
  }>;
  worstPerformingModels: Array<{
    modelId: string;
    modelName: string;
    healthScore: number;
    degradations: number;
  }>;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const configs = new Map<string, PerformanceMonitoringConfig>();
const metrics = new Map<string, PerformanceMetrics[]>();
const degradations = new Map<string, PerformanceDegradation[]>();
const reports = new Map<string, PerformanceReport>();

// ─── Configuration Management ──────────────────────────────────────────────────

/**
 * Create performance monitoring configuration
 */
export async function createPerformanceMonitoringConfig(
  organizationId: string,
  params: {
    modelId: string;
    modelName: string;
    modelVersion: string;
    metrics?: MetricConfig[];
    dashboards?: DashboardConfig[];
    alerts?: PerformanceAlertRule[];
    benchmarks?: BenchmarkConfig[];
    reporting?: ReportingConfig;
    dataRetention?: DataRetentionConfig;
    createdBy: string;
  }
): Promise<PerformanceMonitoringConfig> {
  const id = `perfconfig_${randomUUID()}`;
  const now = new Date().toISOString();

  const defaultMetrics: MetricConfig[] = [
    {
      id: `metric_${randomUUID()}`,
      name: 'accuracy',
      type: 'accuracy',
      category: 'performance',
      aggregation: 'mean',
      thresholds: { warning: 0.9, critical: 0.85, direction: 'below' },
      enabled: true,
    },
    {
      id: `metric_${randomUUID()}`,
      name: 'latency-p95',
      type: 'latency',
      category: 'latency',
      aggregation: 'p95',
      thresholds: { warning: 100, critical: 200, direction: 'above' },
      unit: 'ms',
      enabled: true,
    },
    {
      id: `metric_${randomUUID()}`,
      name: 'error-rate',
      type: 'error-rate',
      category: 'quality',
      aggregation: 'mean',
      thresholds: { warning: 0.01, critical: 0.05, direction: 'above' },
      enabled: true,
    },
  ];

  const defaultDashboard: DashboardConfig = {
    id: `dashboard_${randomUUID()}`,
    name: 'Model Performance Overview',
    layout: { type: 'grid', columns: 12, rows: 8 },
    widgets: [
      {
        id: `widget_${randomUUID()}`,
        type: 'stat',
        title: 'Accuracy',
        metricIds: [defaultMetrics[0].id],
        position: { x: 0, y: 0, width: 3, height: 2 },
        config: { format: 'percentage' },
      },
      {
        id: `widget_${randomUUID()}`,
        type: 'line-chart',
        title: 'Latency Trend',
        metricIds: [defaultMetrics[1].id],
        position: { x: 3, y: 0, width: 6, height: 4 },
        config: { timeRange: '24h' },
      },
      {
        id: `widget_${randomUUID()}`,
        type: 'gauge',
        title: 'Error Rate',
        metricIds: [defaultMetrics[2].id],
        position: { x: 9, y: 0, width: 3, height: 2 },
        config: { format: 'percentage', max: 0.1 },
      },
    ],
    refreshInterval: 60,
    isDefault: true,
  };

  const config: PerformanceMonitoringConfig = {
    id,
    organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    status: 'active',
    metrics: params.metrics || defaultMetrics,
    dashboards: params.dashboards || [defaultDashboard],
    alerts: params.alerts || [],
    benchmarks: params.benchmarks || [],
    reporting: params.reporting || {
      enabled: false,
      frequency: 'daily',
      recipients: [],
      format: 'pdf',
      includeVisualizations: true,
      includeInsights: true,
    },
    dataRetention: params.dataRetention || {
      rawDataDays: 30,
      aggregatedDataDays: 365,
      metricDataDays: 730,
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  configs.set(id, config);
  metrics.set(id, []);
  degradations.set(id, []);

  return config;
}

/**
 * Update performance monitoring configuration
 */
export async function updatePerformanceMonitoringConfig(
  configId: string,
  updates: Partial<Omit<PerformanceMonitoringConfig, 'id' | 'organizationId' | 'createdAt'>>
): Promise<PerformanceMonitoringConfig | null> {
  const config = configs.get(configId);
  if (!config) return null;

  Object.assign(config, updates);
  config.updatedAt = new Date().toISOString();

  configs.set(configId, config);
  return config;
}

/**
 * Record performance metrics
 */
export async function recordPerformanceMetrics(
  configId: string,
  metricsData: {
    metrics: Record<string, number>;
    sampleSize: number;
    windowStart: string;
    windowEnd: string;
  }
): Promise<PerformanceMetrics | null> {
  const config = configs.get(configId);
  if (!config) return null;

  const metricValues: Record<string, MetricValue> = {};

  for (const [metricName, value] of Object.entries(metricsData.metrics)) {
    metricValues[metricName] = {
      value,
      count: metricsData.sampleSize,
    };
  }

  const performanceMetrics: PerformanceMetrics = {
    timestamp: new Date().toISOString(),
    modelId: config.modelId,
    modelVersion: config.modelVersion,
    metrics: metricValues,
    sampleSize: metricsData.sampleSize,
    windowStart: metricsData.windowStart,
    windowEnd: metricsData.windowEnd,
  };

  const existingMetrics = metrics.get(configId) || [];
  existingMetrics.push(performanceMetrics);
  metrics.set(configId, existingMetrics);

  // Check for degradations
  await checkForDegradations(configId, performanceMetrics);

  return performanceMetrics;
}

/**
 * Analyze performance trends
 */
export async function analyzePerformanceTrends(
  configId: string,
  metricId: string,
  windowDays: number = 30
): Promise<PerformanceTrend | null> {
  const config = configs.get(configId);
  if (!config) return null;

  const metricConfig = config.metrics.find((m) => m.id === metricId);
  if (!metricConfig) return null;

  const allMetrics = metrics.get(configId) || [];
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);

  const windowMetrics = allMetrics.filter(
    (m) => new Date(m.timestamp) >= windowStart && m.metrics[metricConfig.name]
  );

  if (windowMetrics.length < 10) {
    return null; // Not enough data
  }

  const values = windowMetrics.map((m) => m.metrics[metricConfig.name].value);
  const timestamps = windowMetrics.map((m) => m.timestamp);

  // Simple linear regression for trend
  const n = values.length;
  const sumX = timestamps.reduce((sum, _, i) => sum + i, 0);
  const sumY = values.reduce((sum, v) => sum + v, 0);
  const sumXY = timestamps.reduce((sum, _, i) => sum + i * values[i], 0);
  const sumX2 = timestamps.reduce((sum, _, i) => sum + i * i, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R²
  const yMean = sumY / n;
  const ssTotal = values.reduce((sum, v) => sum + Math.pow(v - yMean, 2), 0);
  const ssResidual = values.reduce((sum, v, i) => sum + Math.pow(v - (slope * i + intercept), 2), 0);
  const r2 = 1 - ssResidual / ssTotal;

  const trend: TrendDirection = Math.abs(slope) < 0.01 ? 'stable' : slope > 0 ? 'increasing' : 'decreasing';

  // Simple forecast
  const forecastTimestamps: string[] = [];
  const forecastValues: number[] = [];
  const lowerBound: number[] = [];
  const upperBound: number[] = [];

  for (let i = 0; i < 7; i++) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + i + 1);
    forecastTimestamps.push(futureDate.toISOString());

    const forecastValue = slope * (n + i) + intercept;
    forecastValues.push(forecastValue);
    lowerBound.push(forecastValue * 0.9);
    upperBound.push(forecastValue * 1.1);
  }

  const insights: string[] = [];
  if (trend === 'increasing' && metricConfig.thresholds?.direction === 'below') {
    insights.push(`${metricConfig.name} is increasing, which may indicate degradation`);
  } else if (trend === 'decreasing' && metricConfig.thresholds?.direction === 'below') {
    insights.push(`${metricConfig.name} is decreasing, which indicates improvement`);
  }

  return {
    metricId,
    metricName: metricConfig.name,
    trend,
    slope,
    r2,
    changePoints: [],
    forecast: {
      timestamps: forecastTimestamps,
      values: forecastValues,
      lowerBound,
      upperBound,
      confidence: r2,
    },
    insights,
  };
}

/**
 * Generate performance report
 */
export async function generatePerformanceReport(
  configId: string,
  params: {
    reportType: ReportType;
    period: { start: string; end: string };
    generatedBy: string;
  }
): Promise<PerformanceReport | null> {
  const config = configs.get(configId);
  if (!config) return null;

  const allMetrics = metrics.get(configId) || [];
  const periodMetrics = allMetrics.filter(
    (m) => new Date(m.timestamp) >= new Date(params.period.start) && new Date(m.timestamp) <= new Date(params.period.end)
  );

  const totalPredictions = periodMetrics.reduce((sum, m) => sum + m.sampleSize, 0);
  const avgLatency = periodMetrics.reduce((sum, m) => sum + (m.metrics['latency-p95']?.value || 0), 0) / periodMetrics.length;
  const avgErrorRate = periodMetrics.reduce((sum, m) => sum + (m.metrics['error-rate']?.value || 0), 0) / periodMetrics.length;
  const avgAccuracy = periodMetrics.reduce((sum, m) => sum + (m.metrics['accuracy']?.value || 0), 0) / periodMetrics.length;

  const healthScore = Math.max(0, Math.min(100, avgAccuracy * 100 - avgErrorRate * 1000 - Math.max(0, avgLatency - 100) / 10));
  const overallHealth = healthScore >= 90 ? 'excellent' : healthScore >= 75 ? 'good' : healthScore >= 60 ? 'fair' : healthScore >= 40 ? 'poor' : 'critical';

  const reportMetrics: ReportMetric[] = config.metrics.map((m) => {
    const values = periodMetrics.map((pm) => pm.metrics[m.name]?.value || 0);
    const currentValue = values.reduce((sum, v) => sum + v, 0) / values.length;
    const status = m.thresholds ? (currentValue < (m.thresholds.critical || Infinity) ? 'critical' : currentValue < (m.thresholds.warning || Infinity) ? 'warning' : 'good') : 'good';

    return {
      metricId: m.id,
      metricName: m.name,
      category: m.category,
      currentValue,
      baselineValue: m.baseline,
      change: m.baseline ? currentValue - m.baseline : undefined,
      changePercentage: m.baseline ? ((currentValue - m.baseline) / m.baseline) * 100 : undefined,
      status: status as any,
    };
  });

  const insights: ReportInsight[] = [];
  if (avgAccuracy < 0.9) {
    insights.push({
      type: 'degradation',
      title: 'Low Accuracy',
      description: `Model accuracy (${(avgAccuracy * 100).toFixed(2)}%) is below 90% threshold`,
      severity: 'warning',
      metrics: ['accuracy'],
    });
  }

  if (avgErrorRate > 0.01) {
    insights.push({
      type: 'anomaly',
      title: 'High Error Rate',
      description: `Error rate (${(avgErrorRate * 100).toFixed(2)}%) exceeds 1% threshold`,
      severity: 'critical',
      metrics: ['error-rate'],
    });
  }

  const recommendations: string[] = [];
  if (avgAccuracy < 0.9) {
    recommendations.push('Consider retraining the model with more recent data');
  }
  if (avgLatency > 100) {
    recommendations.push('Optimize model inference latency');
  }

  const report: PerformanceReport = {
    id: `report_${randomUUID()}`,
    organizationId: config.organizationId,
    modelId: config.modelId,
    modelName: config.modelName,
    modelVersion: config.modelVersion,
    reportType: params.reportType,
    period: params.period,
    summary: {
      overallHealth: overallHealth as any,
      healthScore,
      totalPredictions,
      averageLatency: avgLatency,
      errorRate: avgErrorRate,
      keyFindings: insights.map((i) => i.title),
    },
    metrics: reportMetrics,
    trends: [],
    degradations: degradations.get(configId) || [],
    insights,
    recommendations,
    visualizations: [],
    generatedAt: new Date().toISOString(),
    generatedBy: params.generatedBy,
  };

  reports.set(report.id, report);
  return report;
}

/**
 * Get performance monitoring configuration by ID
 */
export async function getPerformanceMonitoringConfig(configId: string): Promise<PerformanceMonitoringConfig | null> {
  return configs.get(configId) || null;
}

/**
 * List performance monitoring configurations
 */
export async function listPerformanceMonitoringConfigs(
  organizationId: string,
  filters?: { status?: MonitoringStatus; modelId?: string }
): Promise<PerformanceMonitoringConfig[]> {
  const allConfigs = Array.from(configs.values()).filter((c) => c.organizationId === organizationId);

  return allConfigs.filter((c) => {
    if (filters?.status && c.status !== filters.status) return false;
    if (filters?.modelId && c.modelId !== filters.modelId) return false;
    return true;
  });
}

/**
 * Get performance dashboard
 */
export async function getPerformanceDashboard(organizationId: string): Promise<PerformanceDashboard> {
  const allConfigs = await listPerformanceMonitoringConfigs(organizationId);

  const totalModels = new Set(allConfigs.map((c) => c.modelId)).size;
  const activeConfigs = allConfigs.filter((c) => c.status === 'active');

  let totalHealthScore = 0;
  const modelsByHealth: Record<string, number> = { excellent: 0, good: 0, fair: 0, poor: 0, critical: 0 };

  for (const config of activeConfigs) {
    const allMetrics = metrics.get(config.id) || [];
    if (allMetrics.length > 0) {
      const recentMetrics = allMetrics.slice(-10);
      const avgAccuracy = recentMetrics.reduce((sum, m) => sum + (m.metrics['accuracy']?.value || 0), 0) / recentMetrics.length;
      const healthScore = avgAccuracy * 100;
      totalHealthScore += healthScore;

      const health = healthScore >= 90 ? 'excellent' : healthScore >= 75 ? 'good' : healthScore >= 60 ? 'fair' : healthScore >= 40 ? 'poor' : 'critical';
      modelsByHealth[health]++;
    }
  }

  const allDegradations = Array.from(degradations.values()).flat();
  const activeDegradations = allDegradations.filter((d) => d.status === 'detected' || d.status === 'investigating' || d.status === 'mitigating');

  return {
    organizationId,
    totalConfigs: allConfigs.length,
    activeConfigs: activeConfigs.length,
    totalModels,
    averageHealthScore: activeConfigs.length > 0 ? totalHealthScore / activeConfigs.length : 0,
    modelsByHealth,
    totalDegradations: allDegradations.length,
    activeDegradations: activeDegradations.length,
    recentAlerts: [],
    topPerformingModels: [],
    worstPerformingModels: [],
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

async function checkForDegradations(configId: string, currentMetrics: PerformanceMetrics): Promise<void> {
  const config = configs.get(configId);
  if (!config) return;

  const allMetrics = metrics.get(configId) || [];
  const recentMetrics = allMetrics.slice(-20, -1); // Exclude current

  if (recentMetrics.length < 10) return;

  for (const metricConfig of config.metrics) {
    if (!metricConfig.thresholds) continue;

    const currentValue = currentMetrics.metrics[metricConfig.name]?.value || 0;
    const baselineValue = recentMetrics.reduce((sum, m) => sum + (m.metrics[metricConfig.name]?.value || 0), 0) / recentMetrics.length;

    const degradationPercentage = Math.abs((currentValue - baselineValue) / baselineValue) * 100;

    if (degradationPercentage > 10) {
      const degradation: PerformanceDegradation = {
        id: `degradation_${randomUUID()}`,
        modelId: config.modelId,
        modelVersion: config.modelVersion,
        metricId: metricConfig.id,
        metricName: metricConfig.name,
        detectedAt: new Date().toISOString(),
        severity: degradationPercentage > 30 ? 'severe' : degradationPercentage > 20 ? 'moderate' : 'minor',
        baselineValue,
        currentValue,
        degradationPercentage,
        duration: 0,
        status: 'detected',
      };

      const existingDegradations = degradations.get(configId) || [];
      existingDegradations.push(degradation);
      degradations.set(configId, existingDegradations);
    }
  }
}
