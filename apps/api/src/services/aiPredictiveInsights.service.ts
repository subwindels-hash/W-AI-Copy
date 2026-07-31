/**
 * Module 100: AI Predictive Insights Service
 * WINDELS AI OS - Phase 1 (Capstone)
 * 
 * Provides predictive analytics and automated anomaly detection across the AI platform,
 * including performance forecasting, cost prediction, resource capacity planning,
 * automated anomaly detection, and proactive alerting.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Prediction {
  id: string;
  organizationId: string;
  type: PredictionType;
  target: string;
  timeframe: string;
  forecast: ForecastPoint[];
  confidence: number;
  confidenceInterval: { lower: number; upper: number };
  trend: 'increasing' | 'decreasing' | 'stable' | 'seasonal';
  seasonality?: SeasonalPattern;
  generatedAt: string;
  expiresAt: string;
}

export type PredictionType =
  | 'performance'
  | 'cost'
  | 'resource_utilization'
  | 'model_accuracy'
  | 'inference_volume'
  | 'error_rate'
  | 'latency'
  | 'capacity';

export interface ForecastPoint {
  timestamp: string;
  value: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
}

export interface SeasonalPattern {
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  amplitude: number;
  phase: number;
  description: string;
}

export interface AnomalyDetection {
  id: string;
  organizationId: string;
  detectedAt: string;
  source: string;
  metric: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  currentValue: number;
  expectedValue: number;
  deviation: number;
  context: AnomalyContext;
  rootCause?: RootCauseAnalysis;
  status: 'active' | 'investigating' | 'resolved' | 'false_positive';
  resolution?: AnomalyResolution;
}

export type AnomalyType =
  | 'spike'
  | 'drop'
  | 'trend_change'
  | 'seasonal_deviation'
  | 'correlation_break'
  | 'distribution_shift'
  | 'pattern_break';

export type AnomalySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface AnomalyContext {
  affectedModels: string[];
  affectedModules: string[];
  relatedAnomalies: string[];
  recentChanges: RecentChange[];
  historicalPattern?: string;
}

export interface RecentChange {
  type: 'deployment' | 'configuration' | 'data' | 'infrastructure';
  description: string;
  timestamp: string;
  actor: string;
}

export interface RootCauseAnalysis {
  probableCause: string;
  confidence: number;
  evidence: Array<{ source: string; description: string; weight: number }>;
  contributingFactors: string[];
  recommendedActions: string[];
}

export interface AnomalyResolution {
  resolvedAt: string;
  resolvedBy: string;
  resolutionType: 'fixed' | 'mitigated' | 'ignored' | 'auto_resolved';
  description: string;
  duration: number;
}

export interface CapacityPlanning {
  id: string;
  organizationId: string;
  resourceType: 'compute' | 'memory' | 'storage' | 'bandwidth' | 'gpu';
  currentUsage: number;
  currentCapacity: number;
  utilizationPercent: number;
  forecast: CapacityForecast[];
  recommendations: CapacityRecommendation[];
  alerts: CapacityAlert[];
  generatedAt: string;
}

export interface CapacityForecast {
  date: string;
  predictedUsage: number;
  predictedUtilization: number;
  confidence: number;
}

export interface CapacityRecommendation {
  action: string;
  timeline: string;
  estimatedCost: number;
  estimatedSavings: number;
  priority: 'immediate' | 'short_term' | 'long_term';
  description: string;
}

export interface CapacityAlert {
  threshold: number;
  predictedDate: string;
  severity: 'warning' | 'critical';
  message: string;
}

export interface ProactiveAlert {
  id: string;
  organizationId: string;
  type: 'prediction' | 'anomaly' | 'capacity' | 'trend';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  predictedImpact: string;
  recommendedAction: string;
  affectedResources: string[];
  status: 'active' | 'acknowledged' | 'resolved';
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const predictions = new Map<string, Prediction>();
const anomalies = new Map<string, AnomalyDetection>();
const capacityPlans = new Map<string, CapacityPlanning>();
const proactiveAlerts = new Map<string, ProactiveAlert>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function generatePrediction(params: {
  organizationId: string;
  type: PredictionType;
  target: string;
  timeframe: string;
  historicalData: Array<{ timestamp: string; value: number }>;
}): Prediction {
  const now = new Date().toISOString();
  const id = randomUUID();

  // Simple linear trend + noise forecast
  const data = params.historicalData;
  const n = data.length;
  const values = data.map(d => d.value);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const trend = (values[n - 1] - values[0]) / n;
  const std = Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n);

  const forecastDays = params.timeframe === '7d' ? 7 : params.timeframe === '30d' ? 30 : 90;
  const forecast: ForecastPoint[] = Array.from({ length: forecastDays }, (_, i) => {
    const predictedValue = mean + trend * (n + i) + (Math.random() - 0.5) * std * 0.5;
    const confidence = Math.max(0.5, 1 - (i / forecastDays) * 0.5);
    const margin = std * (1 + i * 0.1);

    return {
      timestamp: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString(),
      value: predictedValue,
      confidence,
      lowerBound: predictedValue - margin,
      upperBound: predictedValue + margin,
    };
  });

  const trendDirection = trend > std * 0.1 ? 'increasing' : trend < -std * 0.1 ? 'decreasing' : 'stable';

  const prediction: Prediction = {
    id,
    organizationId: params.organizationId,
    type: params.type,
    target: params.target,
    timeframe: params.timeframe,
    forecast,
    confidence: 0.85,
    confidenceInterval: {
      lower: forecast[forecast.length - 1].lowerBound,
      upper: forecast[forecast.length - 1].upperBound,
    },
    trend: trendDirection,
    generatedAt: now,
    expiresAt: new Date(Date.now() + forecastDays * 24 * 60 * 60 * 1000).toISOString(),
  };

  predictions.set(id, prediction);
  return prediction;
}

export function getPrediction(id: string): Prediction | undefined {
  return predictions.get(id);
}

export function listPredictions(organizationId: string, type?: PredictionType): Prediction[] {
  let preds = Array.from(predictions.values()).filter(p => p.organizationId === organizationId);
  if (type) preds = preds.filter(p => p.type === type);
  return preds;
}

export function detectAnomaly(params: {
  organizationId: string;
  source: string;
  metric: string;
  currentValue: number;
  expectedValue: number;
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  context?: Partial<AnomalyContext>;
}): AnomalyDetection {
  const now = new Date().toISOString();
  const id = randomUUID();

  const deviation = Math.abs(params.currentValue - params.expectedValue) / params.expectedValue;

  const anomaly: AnomalyDetection = {
    id,
    organizationId: params.organizationId,
    detectedAt: now,
    source: params.source,
    metric: params.metric,
    type: params.type,
    severity: params.severity,
    description: params.description,
    currentValue: params.currentValue,
    expectedValue: params.expectedValue,
    deviation,
    context: {
      affectedModels: params.context?.affectedModels || [],
      affectedModules: params.context?.affectedModules || [],
      relatedAnomalies: params.context?.relatedAnomalies || [],
      recentChanges: params.context?.recentChanges || [],
    },
    status: 'active',
  };

  // Auto-generate root cause analysis
  if (deviation > 0.2) {
    anomaly.rootCause = {
      probableCause: `Significant deviation in ${params.metric} from ${params.source}`,
      confidence: 0.7,
      evidence: [
        { source: params.source, description: `${params.metric} deviated by ${(deviation * 100).toFixed(1)}%`, weight: 0.8 },
      ],
      contributingFactors: params.context?.recentChanges?.map(c => c.description) || [],
      recommendedActions: [
        `Investigate recent changes in ${params.source}`,
        `Review ${params.metric} configuration`,
        `Check for data quality issues`,
      ],
    };
  }

  anomalies.set(id, anomaly);

  // Create proactive alert for high-severity anomalies
  if (params.severity === 'high' || params.severity === 'critical') {
    createProactiveAlert({
      organizationId: params.organizationId,
      type: 'anomaly',
      severity: params.severity === 'critical' ? 'critical' : 'warning',
      title: `Anomaly Detected: ${params.metric}`,
      description: params.description,
      predictedImpact: `Potential impact on ${params.context?.affectedModels?.length || 0} models`,
      recommendedAction: anomaly.rootCause?.recommendedActions[0] || 'Investigate anomaly',
      affectedResources: params.context?.affectedModels || [],
    });
  }

  return anomaly;
}

export function getAnomaly(id: string): AnomalyDetection | undefined {
  return anomalies.get(id);
}

export function listAnomalies(
  organizationId: string,
  filters?: { severity?: AnomalySeverity; status?: string; source?: string }
): AnomalyDetection[] {
  let anoms = Array.from(anomalies.values()).filter(a => a.organizationId === organizationId);
  if (filters?.severity) anoms = anoms.filter(a => a.severity === filters.severity);
  if (filters?.status) anoms = anoms.filter(a => a.status === filters.status);
  if (filters?.source) anoms = anoms.filter(a => a.source === filters.source);
  return anoms.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

export function resolveAnomaly(
  anomalyId: string,
  resolvedBy: string,
  resolutionType: 'fixed' | 'mitigated' | 'ignored' | 'auto_resolved',
  description: string
): AnomalyDetection {
  const anomaly = anomalies.get(anomalyId);
  if (!anomaly) throw new Error(`Anomaly ${anomalyId} not found`);

  const now = new Date().toISOString();
  anomaly.status = 'resolved';
  anomaly.resolution = {
    resolvedAt: now,
    resolvedBy,
    resolutionType,
    description,
    duration: new Date(now).getTime() - new Date(anomaly.detectedAt).getTime(),
  };

  return anomaly;
}

export function generateCapacityPlan(params: {
  organizationId: string;
  resourceType: 'compute' | 'memory' | 'storage' | 'bandwidth' | 'gpu';
  currentUsage: number;
  currentCapacity: number;
  growthRate: number;
}): CapacityPlanning {
  const now = new Date().toISOString();
  const id = randomUUID();

  const utilizationPercent = (params.currentUsage / params.currentCapacity) * 100;

  const forecast: CapacityForecast[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const predictedUsage = params.currentUsage * Math.pow(1 + params.growthRate, month);
    const predictedUtilization = (predictedUsage / params.currentCapacity) * 100;

    return {
      date: new Date(Date.now() + month * 30 * 24 * 60 * 60 * 1000).toISOString(),
      predictedUsage,
      predictedUtilization: Math.min(100, predictedUtilization),
      confidence: Math.max(0.5, 1 - month * 0.05),
    };
  });

  const recommendations: CapacityRecommendation[] = [];
  const alerts: CapacityAlert[] = [];

  // Generate recommendations based on forecast
  const monthsTo80 = forecast.findIndex(f => f.predictedUtilization >= 80);
  const monthsTo90 = forecast.findIndex(f => f.predictedUtilization >= 90);
  const monthsTo100 = forecast.findIndex(f => f.predictedUtilization >= 100);

  if (monthsTo80 >= 0 && monthsTo80 <= 3) {
    recommendations.push({
      action: `Scale ${params.resourceType} capacity by 50%`,
      timeline: `${monthsTo80} months`,
      estimatedCost: params.currentCapacity * 0.5 * 10,
      estimatedSavings: 0,
      priority: 'short_term',
      description: `Projected to reach 80% utilization in ${monthsTo80} months`,
    });
    alerts.push({
      threshold: 80,
      predictedDate: forecast[monthsTo80].date,
      severity: 'warning',
      message: `${params.resourceType} will reach 80% utilization`,
    });
  }

  if (monthsTo100 >= 0 && monthsTo100 <= 6) {
    recommendations.push({
      action: `Double ${params.resourceType} capacity`,
      timeline: `${monthsTo100} months`,
      estimatedCost: params.currentCapacity * 10,
      estimatedSavings: 0,
      priority: 'immediate',
      description: `Will exhaust capacity in ${monthsTo100} months at current growth rate`,
    });
    alerts.push({
      threshold: 100,
      predictedDate: forecast[monthsTo100].date,
      severity: 'critical',
      message: `${params.resourceType} capacity will be exhausted`,
    });
  }

  const plan: CapacityPlanning = {
    id,
    organizationId: params.organizationId,
    resourceType: params.resourceType,
    currentUsage: params.currentUsage,
    currentCapacity: params.currentCapacity,
    utilizationPercent,
    forecast,
    recommendations,
    alerts,
    generatedAt: now,
  };

  capacityPlans.set(id, plan);
  return plan;
}

export function getCapacityPlan(id: string): CapacityPlanning | undefined {
  return capacityPlans.get(id);
}

export function listCapacityPlans(organizationId: string): CapacityPlanning[] {
  return Array.from(capacityPlans.values()).filter(p => p.organizationId === organizationId);
}

export function createProactiveAlert(params: {
  organizationId: string;
  type: 'prediction' | 'anomaly' | 'capacity' | 'trend';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  predictedImpact: string;
  recommendedAction: string;
  affectedResources: string[];
}): ProactiveAlert {
  const now = new Date().toISOString();
  const id = randomUUID();

  const alert: ProactiveAlert = {
    id,
    organizationId: params.organizationId,
    type: params.type,
    severity: params.severity,
    title: params.title,
    description: params.description,
    predictedImpact: params.predictedImpact,
    recommendedAction: params.recommendedAction,
    affectedResources: params.affectedResources,
    status: 'active',
    createdAt: now,
  };

  proactiveAlerts.set(id, alert);
  return alert;
}

export function acknowledgeAlert(alertId: string, acknowledgedBy: string): ProactiveAlert {
  const alert = proactiveAlerts.get(alertId);
  if (!alert) throw new Error(`Alert ${alertId} not found`);

  alert.status = 'acknowledged';
  alert.acknowledgedAt = new Date().toISOString();
  return alert;
}

export function resolveAlert(alertId: string, resolvedBy: string): ProactiveAlert {
  const alert = proactiveAlerts.get(alertId);
  if (!alert) throw new Error(`Alert ${alertId} not found`);

  alert.status = 'resolved';
  alert.resolvedAt = new Date().toISOString();
  return alert;
}

export function listProactiveAlerts(
  organizationId: string,
  filters?: { type?: string; severity?: string; status?: string }
): ProactiveAlert[] {
  let alerts = Array.from(proactiveAlerts.values()).filter(a => a.organizationId === organizationId);
  if (filters?.type) alerts = alerts.filter(a => a.type === filters.type);
  if (filters?.severity) alerts = alerts.filter(a => a.severity === filters.severity);
  if (filters?.status) alerts = alerts.filter(a => a.status === filters.status);
  return alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getPlatformHealthSummary(organizationId: string): {
  predictions: number;
  activeAnomalies: number;
  criticalAlerts: number;
  capacityWarnings: number;
  overallStatus: 'healthy' | 'warning' | 'critical';
} {
  const orgPredictions = listPredictions(organizationId);
  const orgAnomalies = listAnomalies(organizationId, { status: 'active' });
  const orgAlerts = listProactiveAlerts(organizationId, { status: 'active' });
  const orgCapacity = listCapacityPlans(organizationId);

  const criticalAlerts = orgAlerts.filter(a => a.severity === 'critical').length;
  const capacityWarnings = orgCapacity.filter(p => p.utilizationPercent > 80).length;

  const overallStatus = criticalAlerts > 0 || orgAnomalies.some(a => a.severity === 'critical')
    ? 'critical'
    : orgAnomalies.length > 5 || criticalAlerts > 2
    ? 'warning'
    : 'healthy';

  return {
    predictions: orgPredictions.length,
    activeAnomalies: orgAnomalies.length,
    criticalAlerts,
    capacityWarnings,
    overallStatus,
  };
}
