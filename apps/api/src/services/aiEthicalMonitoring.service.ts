/**
 * Module 70: AI Ethical Monitoring Service
 *
 * Provides continuous ethical monitoring including ethical compliance monitoring,
 * ethical drift detection, real-time ethical violation alerting, ethical trend
 * analysis, automated ethical review triggers, ethical performance dashboards,
 * and stakeholder feedback integration.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface EthicalMonitoringConfig {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  targetId: string; // model ID, system ID, etc.
  targetType: 'model' | 'system' | 'deployment' | 'project';
  status: MonitoringStatus;
  principles: MonitoredPrinciple[];
  metrics: EthicalMetric[];
  thresholds: EthicalThreshold[];
  alerts: AlertConfig[];
  schedule: MonitoringSchedule;
  dataSources: DataSource[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastMonitoredAt?: string;
}

export type MonitoringStatus = 'active' | 'paused' | 'inactive' | 'error';

export interface MonitoredPrinciple {
  principle: string;
  enabled: boolean;
  weight: number; // 0-1
  metrics: string[]; // metric IDs
  baseline?: number; // 0-100
}

export interface EthicalMetric {
  id: string;
  name: string;
  description: string;
  category: MetricCategory;
  type: MetricType;
  unit: string;
  calculation: MetricCalculation;
  dataPoints: MetricDataPoint[];
  baseline?: number;
  target?: number;
  status: MetricStatus;
}

export type MetricCategory =
  | 'fairness'
  | 'transparency'
  | 'accountability'
  | 'privacy'
  | 'safety'
  | 'human-oversight'
  | 'societal-impact'
  | 'environmental-impact';

export type MetricType =
  | 'continuous'
  | 'categorical'
  | 'ratio'
  | 'percentage'
  | 'score';

export interface MetricCalculation {
  method: 'statistical' | 'survey' | 'audit' | 'automated' | 'hybrid';
  formula?: string;
  parameters?: Record<string, any>;
  frequency: 'real-time' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  dataSources: string[];
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  confidence?: number; // 0-1
  sampleSize?: number;
  metadata?: Record<string, any>;
}

export type MetricStatus = 'normal' | 'warning' | 'critical' | 'unknown';

export interface EthicalThreshold {
  id: string;
  metricId: string;
  type: ThresholdType;
  value: number;
  severity: ThresholdSeverity;
  description: string;
  enabled: boolean;
  lastTriggered?: string;
  triggerCount: number;
}

export type ThresholdType =
  | 'absolute'
  | 'percentage-change'
  | 'standard-deviation'
  | 'trend'
  | 'drift';

export type ThresholdSeverity = 'info' | 'warning' | 'critical';

export interface AlertConfig {
  id: string;
  name: string;
  description: string;
  thresholdIds: string[];
  channels: AlertChannel[];
  recipients: string[];
  escalation: EscalationConfig;
  cooldown: number; // minutes
  enabled: boolean;
  lastTriggered?: string;
  triggerCount: number;
}

export interface AlertChannel {
  type: 'email' | 'slack' | 'sms' | 'webhook' | 'dashboard';
  configuration: Record<string, any>;
}

export interface EscalationConfig {
  enabled: boolean;
  levels: EscalationLevel[];
  autoEscalate: boolean;
}

export interface EscalationLevel {
  level: number;
  delay: number; // minutes
  recipients: string[];
  channels: AlertChannel[];
}

export interface MonitoringSchedule {
  type: 'continuous' | 'scheduled' | 'event-driven';
  cronExpression?: string;
  frequency?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  timezone: string;
  enabled: boolean;
}

export interface DataSource {
  id: string;
  name: string;
  type: 'api' | 'database' | 'log' | 'survey' | 'audit' | 'external';
  configuration: Record<string, any>;
  refreshFrequency: string;
  lastRefreshed?: string;
  status: 'active' | 'error' | 'inactive';
}

export interface EthicalViolation {
  id: string;
  configId: string;
  targetId: string;
  targetType: string;
  principle: string;
  metric: string;
  severity: ViolationSeverity;
  type: ViolationType;
  description: string;
  evidence: ViolationEvidence[];
  impact: ViolationImpact;
  status: ViolationStatus;
  detectedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  reviewTriggered?: string; // review ID
  notifications: ViolationNotification[];
}

export type ViolationSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ViolationType =
  | 'threshold-exceeded'
  | 'drift-detected'
  | 'trend-violation'
  | 'fairness-violation'
  | 'transparency-violation'
  | 'privacy-violation'
  | 'safety-violation'
  | 'accountability-violation';

export interface ViolationEvidence {
  type: 'metric-value' | 'data-sample' | 'log-entry' | 'user-feedback' | 'audit-finding';
  description: string;
  data: any;
  timestamp: string;
  source: string;
}

export interface ViolationImpact {
  affectedStakeholders: string[];
  scope: 'individual' | 'group' | 'system-wide' | 'societal';
  magnitude: 'low' | 'medium' | 'high';
  duration: 'temporary' | 'ongoing' | 'permanent';
  reversibility: 'reversible' | 'partially-reversible' | 'irreversible';
}

export type ViolationStatus =
  | 'detected'
  | 'acknowledged'
  | 'investigating'
  | 'mitigating'
  | 'resolved'
  | 'accepted'
  | 'escalated';

export interface ViolationNotification {
  id: string;
  channel: string;
  recipient: string;
  sentAt: string;
  status: 'sent' | 'delivered' | 'failed' | 'read';
  escalated: boolean;
}

export interface EthicalDrift {
  id: string;
  configId: string;
  targetId: string;
  metric: string;
  driftType: DriftType;
  magnitude: number;
  direction: 'positive' | 'negative';
  baselineValue: number;
  currentValue: number;
  detectedAt: string;
  windowSize: number; // number of data points
  statisticalSignificance: number; // p-value
  trend: DriftTrend;
  alerts: string[]; // alert IDs
  status: DriftStatus;
}

export type DriftType =
  | 'sudden'
  | 'gradual'
  | 'incremental'
  | 'seasonal'
  | 'concept-drift';

export interface DriftTrend {
  direction: 'increasing' | 'decreasing' | 'stable';
  rate: number; // change per time unit
  confidence: number; // 0-1
  predictedValues?: Array<{
    timestamp: string;
    value: number;
    confidence: number;
  }>;
}

export type DriftStatus = 'detected' | 'confirmed' | 'investigating' | 'resolved' | 'accepted';

export interface EthicalTrend {
  id: string;
  configId: string;
  metric: string;
  period: TrendPeriod;
  dataPoints: TrendDataPoint[];
  analysis: TrendAnalysis;
  insights: string[];
  recommendations: string[];
  generatedAt: string;
}

export type TrendPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface TrendDataPoint {
  timestamp: string;
  value: number;
  confidence?: number;
  annotations?: string[];
}

export interface TrendAnalysis {
  direction: 'improving' | 'declining' | 'stable' | 'cyclical';
  magnitude: number;
  statisticalSignificance: number;
  seasonality?: SeasonalityPattern;
  anomalies: TrendAnomaly[];
  forecast?: TrendForecast;
}

export interface SeasonalityPattern {
  detected: boolean;
  period: number; // days
  amplitude: number;
  phase: number;
}

export interface TrendAnomaly {
  timestamp: string;
  value: number;
  expectedValue: number;
  deviation: number;
  type: 'spike' | 'drop' | 'outlier';
  explanation?: string;
}

export interface TrendForecast {
  horizon: number; // days
  predictions: Array<{
    timestamp: string;
    value: number;
    lowerBound: number;
    upperBound: number;
    confidence: number;
  }>;
  method: string;
}

export interface StakeholderFeedback {
  id: string;
  configId: string;
  targetId: string;
  stakeholderType: string;
  stakeholderId?: string;
  feedbackType: FeedbackType;
  category: string;
  sentiment: Sentiment;
  content: string;
  rating?: number; // 1-5
  ethicalConcerns: string[];
  evidence?: string[];
  status: FeedbackStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  response?: string;
  actions?: string[];
}

export type FeedbackType =
  | 'complaint'
  | 'suggestion'
  | 'concern'
  | 'praise'
  | 'question'
  | 'incident-report';

export type Sentiment = 'positive' | 'negative' | 'neutral' | 'mixed';

export type FeedbackStatus =
  | 'submitted'
  | 'under-review'
  | 'acknowledged'
  | 'addressed'
  | 'closed'
  | 'rejected';

export interface EthicalPerformanceDashboard {
  organizationId: string;
  totalConfigs: number;
  activeConfigs: number;
  overallEthicalScore: number; // 0-100
  principleScores: PrincipleScore[];
  activeViolations: number;
  criticalViolations: number;
  activeDrifts: number;
  recentViolations: EthicalViolation[];
  recentDrifts: EthicalDrift[];
  trends: EthicalTrend[];
  stakeholderFeedback: FeedbackSummary;
  complianceRate: number; // percentage
  alertHistory: AlertHistory[];
}

export interface PrincipleScore {
  principle: string;
  score: number; // 0-100
  trend: 'improving' | 'declining' | 'stable';
  status: 'good' | 'warning' | 'critical';
  metrics: number; // number of metrics
}

export interface FeedbackSummary {
  totalFeedback: number;
  positiveFeedback: number;
  negativeFeedback: number;
  neutralFeedback: number;
  averageRating: number;
  topConcerns: Array<{
    concern: string;
    count: number;
  }>;
  responseRate: number; // percentage
}

export interface AlertHistory {
  alertId: string;
  alertName: string;
  triggeredAt: string;
  severity: ThresholdSeverity;
  status: 'triggered' | 'acknowledged' | 'resolved' | 'escalated';
  violations: string[]; // violation IDs
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const configs = new Map<string, EthicalMonitoringConfig>();
const violations = new Map<string, EthicalViolation>();
const drifts = new Map<string, EthicalDrift>();
const trends = new Map<string, EthicalTrend>();
const feedback = new Map<string, StakeholderFeedback>();

// ─── Monitoring Configuration Management ───────────────────────────────────────

/**
 * Create ethical monitoring config
 */
export async function createEthicalMonitoringConfig(
  organizationId: string,
  config: Omit<EthicalMonitoringConfig, 'id' | 'createdAt' | 'updatedAt'>,
  createdBy: string
): Promise<EthicalMonitoringConfig> {
  const id = `config_${randomUUID()}`;
  const now = new Date().toISOString();

  const newConfig: EthicalMonitoringConfig = {
    ...config,
    id,
    organizationId,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  configs.set(id, newConfig);
  return newConfig;
}

/**
 * Update ethical monitoring config
 */
export async function updateEthicalMonitoringConfig(
  configId: string,
  updates: Partial<Omit<EthicalMonitoringConfig, 'id' | 'organizationId' | 'createdAt'>>
): Promise<EthicalMonitoringConfig | null> {
  const config = configs.get(configId);
  if (!config) return null;

  const updated: EthicalMonitoringConfig = {
    ...config,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  configs.set(configId, updated);
  return updated;
}

/**
 * Add ethical metric
 */
export async function addEthicalMetric(
  configId: string,
  metric: Omit<EthicalMetric, 'id' | 'dataPoints' | 'status'>
): Promise<EthicalMetric | null> {
  const config = configs.get(configId);
  if (!config) return null;

  const newMetric: EthicalMetric = {
    ...metric,
    id: `metric_${randomUUID()}`,
    dataPoints: [],
    status: 'unknown',
  };

  config.metrics.push(newMetric);
  config.updatedAt = new Date().toISOString();

  configs.set(configId, config);
  return newMetric;
}

/**
 * Add ethical threshold
 */
export async function addEthicalThreshold(
  configId: string,
  threshold: Omit<EthicalThreshold, 'id' | 'lastTriggered' | 'triggerCount'>
): Promise<EthicalThreshold | null> {
  const config = configs.get(configId);
  if (!config) return null;

  const newThreshold: EthicalThreshold = {
    ...threshold,
    id: `threshold_${randomUUID()}`,
    triggerCount: 0,
  };

  config.thresholds.push(newThreshold);
  config.updatedAt = new Date().toISOString();

  configs.set(configId, config);
  return newThreshold;
}

/**
 * Record metric data point
 */
export async function recordMetricDataPoint(
  configId: string,
  metricId: string,
  dataPoint: Omit<MetricDataPoint, 'timestamp'>
): Promise<MetricDataPoint | null> {
  const config = configs.get(configId);
  if (!config) return null;

  const metric = config.metrics.find((m) => m.id === metricId);
  if (!metric) return null;

  const newDataPoint: MetricDataPoint = {
    ...dataPoint,
    timestamp: new Date().toISOString(),
  };

  metric.dataPoints.push(newDataPoint);

  // Keep only last 1000 data points
  if (metric.dataPoints.length > 1000) {
    metric.dataPoints = metric.dataPoints.slice(-1000);
  }

  config.lastMonitoredAt = newDataPoint.timestamp;
  config.updatedAt = newDataPoint.timestamp;

  // Check thresholds
  await checkThresholds(config, metric, newDataPoint);

  configs.set(configId, config);
  return newDataPoint;
}

/**
 * Check thresholds and trigger alerts
 */
async function checkThresholds(
  config: EthicalMonitoringConfig,
  metric: EthicalMetric,
  dataPoint: MetricDataPoint
): Promise<void> {
  const relevantThresholds = config.thresholds.filter(
    (t) => t.metricId === metric.id && t.enabled
  );

  for (const threshold of relevantThresholds) {
    const violated = await evaluateThreshold(threshold, metric, dataPoint);

    if (violated) {
      threshold.lastTriggered = dataPoint.timestamp;
      threshold.triggerCount++;

      // Create violation
      await createEthicalViolation(config, metric, threshold, dataPoint);

      // Trigger alerts
      await triggerAlerts(config, threshold, dataPoint);
    }
  }
}

/**
 * Evaluate threshold
 */
async function evaluateThreshold(
  threshold: EthicalThreshold,
  metric: EthicalMetric,
  dataPoint: MetricDataPoint
): Promise<boolean> {
  switch (threshold.type) {
    case 'absolute':
      return dataPoint.value > threshold.value;
    case 'percentage-change':
      if (metric.dataPoints.length < 2) return false;
      const previousValue = metric.dataPoints[metric.dataPoints.length - 2].value;
      const percentChange = ((dataPoint.value - previousValue) / previousValue) * 100;
      return Math.abs(percentChange) > threshold.value;
    case 'standard-deviation':
      const values = metric.dataPoints.slice(-30).map((dp) => dp.value);
      const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);
      return Math.abs(dataPoint.value - mean) > threshold.value * stdDev;
    case 'trend':
      // Simplified trend detection
      if (metric.dataPoints.length < 10) return false;
      const recentValues = metric.dataPoints.slice(-10).map((dp) => dp.value);
      const trend = recentValues[recentValues.length - 1] - recentValues[0];
      return Math.abs(trend) > threshold.value;
    case 'drift':
      return await detectDrift(metric, threshold.value);
    default:
      return false;
  }
}

/**
 * Detect drift
 */
async function detectDrift(metric: EthicalMetric, threshold: number): Promise<boolean> {
  if (metric.dataPoints.length < 50) return false;

  const baseline = metric.dataPoints.slice(-50, -25).map((dp) => dp.value);
  const recent = metric.dataPoints.slice(-25).map((dp) => dp.value);

  const baselineMean = baseline.reduce((sum, v) => sum + v, 0) / baseline.length;
  const recentMean = recent.reduce((sum, v) => sum + v, 0) / recent.length;

  const drift = Math.abs(recentMean - baselineMean) / baselineMean;
  return drift > threshold;
}

/**
 * Create ethical violation
 */
async function createEthicalViolation(
  config: EthicalMonitoringConfig,
  metric: EthicalMetric,
  threshold: EthicalThreshold,
  dataPoint: MetricDataPoint
): Promise<EthicalViolation> {
  const violationId = `violation_${randomUUID()}`;

  const violation: EthicalViolation = {
    id: violationId,
    configId: config.id,
    targetId: config.targetId,
    targetType: config.targetType,
    principle: metric.category,
    metric: metric.name,
    severity: threshold.severity === 'critical' ? 'critical' : threshold.severity === 'warning' ? 'high' : 'medium',
    type: 'threshold-exceeded',
    description: `Metric "${metric.name}" exceeded threshold: ${dataPoint.value} > ${threshold.value}`,
    evidence: [
      {
        type: 'metric-value',
        description: `Current value: ${dataPoint.value}`,
        data: dataPoint,
        timestamp: dataPoint.timestamp,
        source: 'monitoring',
      },
    ],
    impact: {
      affectedStakeholders: [],
      scope: 'system-wide',
      magnitude: threshold.severity === 'critical' ? 'high' : 'medium',
      duration: 'ongoing',
      reversibility: 'reversible',
    },
    status: 'detected',
    detectedAt: dataPoint.timestamp,
    notifications: [],
  };

  violations.set(violationId, violation);
  return violation;
}

/**
 * Trigger alerts
 */
async function triggerAlerts(
  config: EthicalMonitoringConfig,
  threshold: EthicalThreshold,
  dataPoint: MetricDataPoint
): Promise<void> {
  const relevantAlerts = config.alerts.filter(
    (a) => a.thresholdIds.includes(threshold.id) && a.enabled
  );

  for (const alert of relevantAlerts) {
    // Check cooldown
    if (alert.lastTriggered) {
      const lastTriggered = new Date(alert.lastTriggered).getTime();
      const now = Date.now();
      const cooldownMs = alert.cooldown * 60 * 1000;
      if (now - lastTriggered < cooldownMs) {
        continue;
      }
    }

    alert.lastTriggered = dataPoint.timestamp;
    alert.triggerCount++;

    // Send notifications (simulated)
    for (const recipient of alert.recipients) {
      for (const channel of alert.channels) {
        console.log(`[ALERT] ${alert.name} sent to ${recipient} via ${channel.type}`);
      }
    }
  }
}

/**
 * Get ethical monitoring config by ID
 */
export async function getEthicalMonitoringConfig(configId: string): Promise<EthicalMonitoringConfig | null> {
  return configs.get(configId) || null;
}

/**
 * List ethical monitoring configs for an organization
 */
export async function listEthicalMonitoringConfigs(
  organizationId: string,
  filters?: { status?: MonitoringStatus; targetType?: string }
): Promise<EthicalMonitoringConfig[]> {
  const allConfigs = Array.from(configs.values()).filter(
    (c) => c.organizationId === organizationId
  );

  return allConfigs.filter((c) => {
    if (filters?.status && c.status !== filters.status) return false;
    if (filters?.targetType && c.targetType !== filters.targetType) return false;
    return true;
  });
}

// ─── Violation Management ──────────────────────────────────────────────────────

/**
 * Acknowledge ethical violation
 */
export async function acknowledgeEthicalViolation(
  violationId: string,
  acknowledgedBy: string
): Promise<EthicalViolation | null> {
  const violation = violations.get(violationId);
  if (!violation) return null;

  violation.status = 'acknowledged';
  violation.acknowledgedAt = new Date().toISOString();
  violation.acknowledgedBy = acknowledgedBy;

  violations.set(violationId, violation);
  return violation;
}

/**
 * Resolve ethical violation
 */
export async function resolveEthicalViolation(
  violationId: string,
  resolvedBy: string,
  resolution: string
): Promise<EthicalViolation | null> {
  const violation = violations.get(violationId);
  if (!violation) return null;

  violation.status = 'resolved';
  violation.resolvedAt = new Date().toISOString();
  violation.resolvedBy = resolvedBy;
  violation.resolution = resolution;

  violations.set(violationId, violation);
  return violation;
}

/**
 * Get ethical violation by ID
 */
export async function getEthicalViolation(violationId: string): Promise<EthicalViolation | null> {
  return violations.get(violationId) || null;
}

/**
 * List ethical violations
 */
export async function listEthicalViolations(
  filters?: { configId?: string; severity?: ViolationSeverity; status?: ViolationStatus }
): Promise<EthicalViolation[]> {
  const allViolations = Array.from(violations.values());

  return allViolations.filter((v) => {
    if (filters?.configId && v.configId !== filters.configId) return false;
    if (filters?.severity && v.severity !== filters.severity) return false;
    if (filters?.status && v.status !== filters.status) return false;
    return true;
  });
}

// ─── Drift Detection ───────────────────────────────────────────────────────────

/**
 * Detect ethical drift
 */
export async function detectEthicalDrift(
  configId: string,
  metricId: string,
  windowSize: number = 50
): Promise<EthicalDrift | null> {
  const config = configs.get(configId);
  if (!config) return null;

  const metric = config.metrics.find((m) => m.id === metricId);
  if (!metric || metric.dataPoints.length < windowSize * 2) return null;

  const baseline = metric.dataPoints.slice(-windowSize * 2, -windowSize).map((dp) => dp.value);
  const recent = metric.dataPoints.slice(-windowSize).map((dp) => dp.value);

  const baselineMean = baseline.reduce((sum, v) => sum + v, 0) / baseline.length;
  const recentMean = recent.reduce((sum, v) => sum + v, 0) / recent.length;

  const magnitude = Math.abs(recentMean - baselineMean) / baselineMean;
  const direction = recentMean > baselineMean ? 'positive' : 'negative';

  // Simplified statistical significance (would use proper statistical test in production)
  const statisticalSignificance = magnitude > 0.1 ? 0.95 : 0.5;

  if (magnitude < 0.05) return null; // No significant drift

  const driftId = `drift_${randomUUID()}`;
  const drift: EthicalDrift = {
    id: driftId,
    configId,
    targetId: config.targetId,
    metric: metric.name,
    driftType: magnitude > 0.2 ? 'sudden' : 'gradual',
    magnitude,
    direction,
    baselineValue: baselineMean,
    currentValue: recentMean,
    detectedAt: new Date().toISOString(),
    windowSize,
    statisticalSignificance,
    trend: {
      direction: direction === 'positive' ? 'increasing' : 'decreasing',
      rate: (recentMean - baselineMean) / windowSize,
      confidence: statisticalSignificance,
    },
    alerts: [],
    status: 'detected',
  };

  drifts.set(driftId, drift);
  return drift;
}

/**
 * Get ethical drift by ID
 */
export async function getEthicalDrift(driftId: string): Promise<EthicalDrift | null> {
  return drifts.get(driftId) || null;
}

/**
 * List ethical drifts
 */
export async function listEthicalDrifts(
  filters?: { configId?: string; status?: DriftStatus }
): Promise<EthicalDrift[]> {
  const allDrifts = Array.from(drifts.values());

  return allDrifts.filter((d) => {
    if (filters?.configId && d.configId !== filters.configId) return false;
    if (filters?.status && d.status !== filters.status) return false;
    return true;
  });
}

// ─── Trend Analysis ────────────────────────────────────────────────────────────

/**
 * Analyze ethical trends
 */
export async function analyzeEthicalTrends(
  configId: string,
  metricId: string,
  period: TrendPeriod
): Promise<EthicalTrend | null> {
  const config = configs.get(configId);
  if (!config) return null;

  const metric = config.metrics.find((m) => m.id === metricId);
  if (!metric || metric.dataPoints.length < 10) return null;

  // Aggregate data points by period
  const aggregatedPoints = aggregateDataPoints(metric.dataPoints, period);

  // Analyze trend
  const values = aggregatedPoints.map((dp) => dp.value);
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  const change = lastValue - firstValue;
  const percentChange = (change / firstValue) * 100;

  const direction: EthicalTrend['analysis']['direction'] =
    Math.abs(percentChange) < 5 ? 'stable' : percentChange > 0 ? 'improving' : 'declining';

  const trendId = `trend_${randomUUID()}`;
  const trend: EthicalTrend = {
    id: trendId,
    configId,
    metric: metric.name,
    period,
    dataPoints: aggregatedPoints,
    analysis: {
      direction,
      magnitude: Math.abs(percentChange),
      statisticalSignificance: 0.95,
      anomalies: detectAnomalies(aggregatedPoints),
    },
    insights: generateInsights(direction, percentChange),
    recommendations: generateRecommendations(direction, percentChange),
    generatedAt: new Date().toISOString(),
  };

  trends.set(trendId, trend);
  return trend;
}

/**
 * Aggregate data points by period
 */
function aggregateDataPoints(dataPoints: MetricDataPoint[], period: TrendPeriod): TrendDataPoint[] {
  const grouped = new Map<string, number[]>();

  for (const dp of dataPoints) {
    const date = new Date(dp.timestamp);
    let key: string;

    switch (period) {
      case 'daily':
        key = date.toISOString().slice(0, 10);
        break;
      case 'weekly':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().slice(0, 10);
        break;
      case 'monthly':
        key = date.toISOString().slice(0, 7);
        break;
      case 'quarterly':
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        key = `${date.getFullYear()}-Q${quarter}`;
        break;
      case 'yearly':
        key = date.getFullYear().toString();
        break;
    }

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(dp.value);
  }

  const aggregated: TrendDataPoint[] = [];
  for (const [timestamp, values] of grouped.entries()) {
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    aggregated.push({
      timestamp,
      value: avg,
      confidence: 1 - (Math.max(...values) - Math.min(...values)) / avg,
    });
  }

  return aggregated.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Detect anomalies in trend data
 */
function detectAnomalies(dataPoints: TrendDataPoint[]): TrendAnomaly[] {
  const anomalies: TrendAnomaly[] = [];
  const values = dataPoints.map((dp) => dp.value);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length);

  for (const dp of dataPoints) {
    const zScore = Math.abs(dp.value - mean) / stdDev;
    if (zScore > 2) {
      anomalies.push({
        timestamp: dp.timestamp,
        value: dp.value,
        expectedValue: mean,
        deviation: zScore,
        type: dp.value > mean ? 'spike' : 'drop',
      });
    }
  }

  return anomalies;
}

/**
 * Generate insights from trend analysis
 */
function generateInsights(direction: string, percentChange: number): string[] {
  const insights: string[] = [];

  if (direction === 'improving') {
    insights.push(`Ethical performance is improving with a ${percentChange.toFixed(1)}% positive trend.`);
  } else if (direction === 'declining') {
    insights.push(`Ethical performance is declining with a ${Math.abs(percentChange).toFixed(1)}% negative trend.`);
    insights.push('Immediate attention may be required to address the decline.');
  } else {
    insights.push('Ethical performance is stable with no significant changes.');
  }

  return insights;
}

/**
 * Generate recommendations from trend analysis
 */
function generateRecommendations(direction: string, percentChange: number): string[] {
  const recommendations: string[] = [];

  if (direction === 'declining' && Math.abs(percentChange) > 10) {
    recommendations.push('Conduct a comprehensive ethical review to identify root causes.');
    recommendations.push('Implement corrective actions to address the decline.');
  } else if (direction === 'improving') {
    recommendations.push('Continue current practices that are driving improvement.');
    recommendations.push('Document successful strategies for future reference.');
  } else {
    recommendations.push('Monitor for any changes in trend direction.');
  }

  return recommendations;
}

// ─── Stakeholder Feedback ──────────────────────────────────────────────────────

/**
 * Submit stakeholder feedback
 */
export async function submitStakeholderFeedback(
  feedbackData: Omit<StakeholderFeedback, 'id' | 'status' | 'submittedAt'>
): Promise<StakeholderFeedback> {
  const id = `feedback_${randomUUID()}`;
  const now = new Date().toISOString();

  const newFeedback: StakeholderFeedback = {
    ...feedbackData,
    id,
    status: 'submitted',
    submittedAt: now,
  };

  feedback.set(id, newFeedback);
  return newFeedback;
}

/**
 * Review stakeholder feedback
 */
export async function reviewStakeholderFeedback(
  feedbackId: string,
  reviewedBy: string,
  response?: string,
  actions?: string[]
): Promise<StakeholderFeedback | null> {
  const fb = feedback.get(feedbackId);
  if (!fb) return null;

  fb.status = 'under-review';
  fb.reviewedAt = new Date().toISOString();
  fb.reviewedBy = reviewedBy;
  if (response) fb.response = response;
  if (actions) fb.actions = actions;

  feedback.set(feedbackId, fb);
  return fb;
}

/**
 * Get stakeholder feedback by ID
 */
export async function getStakeholderFeedback(feedbackId: string): Promise<StakeholderFeedback | null> {
  return feedback.get(feedbackId) || null;
}

/**
 * List stakeholder feedback
 */
export async function listStakeholderFeedback(
  filters?: { configId?: string; feedbackType?: FeedbackType; status?: FeedbackStatus }
): Promise<StakeholderFeedback[]> {
  const allFeedback = Array.from(feedback.values());

  return allFeedback.filter((f) => {
    if (filters?.configId && f.configId !== filters.configId) return false;
    if (filters?.feedbackType && f.feedbackType !== filters.feedbackType) return false;
    if (filters?.status && f.status !== filters.status) return false;
    return true;
  });
}

// ─── Ethical Performance Dashboard ─────────────────────────────────────────────

/**
 * Get ethical performance dashboard
 */
export async function getEthicalPerformanceDashboard(
  organizationId: string
): Promise<EthicalPerformanceDashboard> {
  const allConfigs = await listEthicalMonitoringConfigs(organizationId);
  const activeConfigs = allConfigs.filter((c) => c.status === 'active');

  // Calculate overall ethical score
  const principleScores = calculatePrincipleScores(activeConfigs);
  const overallEthicalScore = principleScores.reduce((sum, p) => sum + p.score, 0) / principleScores.length;

  // Count violations
  const allViolations = await listEthicalViolations();
  const orgViolations = allViolations.filter((v) =>
    activeConfigs.some((c) => c.id === v.configId)
  );
  const activeViolations = orgViolations.filter((v) => !['resolved', 'accepted'].includes(v.status)).length;
  const criticalViolations = orgViolations.filter((v) => v.severity === 'critical').length;

  // Count drifts
  const allDrifts = await listEthicalDrifts();
  const orgDrifts = allDrifts.filter((d) =>
    activeConfigs.some((c) => c.id === d.configId)
  );
  const activeDrifts = orgDrifts.filter((d) => !['resolved', 'accepted'].includes(d.status)).length;

  // Recent violations and drifts
  const recentViolations = orgViolations
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, 10);

  const recentDrifts = orgDrifts
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, 5);

  // Trends
  const allTrends = Array.from(trends.values()).filter((t) =>
    activeConfigs.some((c) => c.id === t.configId)
  );

  // Stakeholder feedback summary
  const allFeedback = await listStakeholderFeedback();
  const orgFeedback = allFeedback.filter((f) =>
    activeConfigs.some((c) => c.id === f.configId)
  );

  const feedbackSummary: FeedbackSummary = {
    totalFeedback: orgFeedback.length,
    positiveFeedback: orgFeedback.filter((f) => f.sentiment === 'positive').length,
    negativeFeedback: orgFeedback.filter((f) => f.sentiment === 'negative').length,
    neutralFeedback: orgFeedback.filter((f) => f.sentiment === 'neutral').length,
    averageRating: orgFeedback.filter((f) => f.rating).reduce((sum, f) => sum + (f.rating || 0), 0) / orgFeedback.filter((f) => f.rating).length || 0,
    topConcerns: calculateTopConcerns(orgFeedback),
    responseRate: orgFeedback.filter((f) => f.response).length / orgFeedback.length * 100 || 0,
  };

  // Compliance rate
  const totalMetrics = activeConfigs.reduce((sum, c) => sum + c.metrics.length, 0);
  const compliantMetrics = activeConfigs.reduce((sum, c) => {
    return sum + c.metrics.filter((m) => m.status === 'normal').length;
  }, 0);
  const complianceRate = totalMetrics > 0 ? (compliantMetrics / totalMetrics) * 100 : 100;

  return {
    organizationId,
    totalConfigs: allConfigs.length,
    activeConfigs: activeConfigs.length,
    overallEthicalScore: Math.round(overallEthicalScore),
    principleScores,
    activeViolations,
    criticalViolations,
    activeDrifts,
    recentViolations,
    recentDrifts,
    trends: allTrends.slice(0, 10),
    stakeholderFeedback: feedbackSummary,
    complianceRate: Math.round(complianceRate),
    alertHistory: [],
  };
}

/**
 * Calculate principle scores
 */
function calculatePrincipleScores(configs: EthicalMonitoringConfig[]): PrincipleScore[] {
  const principleMap = new Map<string, { scores: number[]; metrics: number }>();

  for (const config of configs) {
    for (const metric of config.metrics) {
      const principle = metric.category;
      if (!principleMap.has(principle)) {
        principleMap.set(principle, { scores: [], metrics: 0 });
      }

      const data = principleMap.get(principle)!;
      data.metrics++;

      // Calculate score based on metric status and data points
      let score = 50; // default
      if (metric.status === 'normal') {
        score = 90;
      } else if (metric.status === 'warning') {
        score = 60;
      } else if (metric.status === 'critical') {
        score = 30;
      }

      data.scores.push(score);
    }
  }

  const principleScores: PrincipleScore[] = [];
  for (const [principle, data] of principleMap.entries()) {
    const avgScore = data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length;
    principleScores.push({
      principle,
      score: Math.round(avgScore),
      trend: 'stable', // Would calculate from historical data
      status: avgScore >= 80 ? 'good' : avgScore >= 60 ? 'warning' : 'critical',
      metrics: data.metrics,
    });
  }

  return principleScores;
}

/**
 * Calculate top concerns from feedback
 */
function calculateTopConcerns(feedback: StakeholderFeedback[]): Array<{ concern: string; count: number }> {
  const concernMap = new Map<string, number>();

  for (const fb of feedback) {
    for (const concern of fb.ethicalConcerns) {
      concernMap.set(concern, (concernMap.get(concern) || 0) + 1);
    }
  }

  return Array.from(concernMap.entries())
    .map(([concern, count]) => ({ concern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
