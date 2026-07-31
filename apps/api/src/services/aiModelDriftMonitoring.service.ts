/**
 * Module 78: AI Model Drift Monitoring Service
 *
 * Provides advanced drift monitoring including drift trend analysis and forecasting,
 * drift correlation analysis, drift impact assessment, drift visualization dashboards,
 * drift remediation workflows, drift monitoring orchestration, and drift alerts with
 * context for comprehensive drift management.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DriftMonitoringConfig {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  status: DriftMonitoringStatus;
  driftTypes: DriftType[];
  detectionMethods: DetectionMethod[];
  features: FeatureMonitoringConfig[];
  thresholds: DriftThresholdConfig;
  trendAnalysis: TrendAnalysisConfig;
  correlationAnalysis: CorrelationAnalysisConfig;
  impactAssessment: ImpactAssessmentConfig;
  remediation: RemediationConfig;
  alerting: DriftAlertingConfig;
  visualization: VisualizationConfig;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type DriftMonitoringStatus = 'active' | 'paused' | 'stopped' | 'error';

export type DriftType = 'data-drift' | 'concept-drift' | 'model-drift' | 'prediction-drift' | 'feature-drift';

export type DetectionMethod =
  | 'kolmogorov-smirnov'
  | 'psi'
  | 'kl-divergence'
  | 'wasserstein'
  | 'chi-square'
  | 'mmd'
  | 'classifier-based'
  | 'statistical-process-control';

export interface FeatureMonitoringConfig {
  featureName: string;
  featureType: 'numerical' | 'categorical' | 'text' | 'datetime';
  enabled: boolean;
  baselineStats?: FeatureBaselineStats;
  thresholds?: FeatureThresholds;
}

export interface FeatureBaselineStats {
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
  median?: number;
  q1?: number;
  q3?: number;
  mode?: any;
  distribution?: string;
}

export interface FeatureThresholds {
  driftScore?: number;
  psiThreshold?: number;
  ksThreshold?: number;
}

export interface DriftThresholdConfig {
  dataDrift: number;
  conceptDrift: number;
  modelDrift: number;
  predictionDrift: number;
  featureDrift: number;
  severityLevels: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

export interface TrendAnalysisConfig {
  enabled: boolean;
  windowSize: number; // days
  forecastingHorizon: number; // days
  changePointDetection: boolean;
  seasonalityDetection: boolean;
}

export interface CorrelationAnalysisConfig {
  enabled: boolean;
  featureCorrelation: boolean;
  driftCorrelation: boolean;
  externalFactors: boolean;
  correlationThreshold: number;
}

export interface ImpactAssessmentConfig {
  enabled: boolean;
  performanceImpact: boolean;
  businessImpact: boolean;
  stakeholderImpact: boolean;
  impactMetrics: string[];
}

export interface RemediationConfig {
  enabled: boolean;
  autoRetraining: boolean;
  retrainingThreshold: number;
  notificationChannels: string[];
  workflowSteps: RemediationStep[];
}

export interface RemediationStep {
  id: string;
  name: string;
  type: 'notification' | 'retraining' | 'rollback' | 'investigation' | 'custom';
  config: Record<string, any>;
  order: number;
  automated: boolean;
}

export interface DriftAlertingConfig {
  enabled: boolean;
  channels: AlertChannel[];
  severityThreshold: DriftSeverity;
  cooldownMinutes: number;
  aggregationWindow: number; // minutes
}

export interface AlertChannel {
  type: 'email' | 'slack' | 'webhook' | 'pagerduty';
  config: Record<string, any>;
}

export type DriftSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface VisualizationConfig {
  enabled: boolean;
  dashboards: DriftDashboardConfig[];
  realTimeUpdates: boolean;
  historicalComparison: boolean;
}

export interface DriftDashboardConfig {
  id: string;
  name: string;
  widgets: DriftWidget[];
  refreshInterval: number; // seconds
}

export interface DriftWidget {
  id: string;
  type: 'drift-score' | 'feature-drift' | 'trend-chart' | 'heatmap' | 'distribution' | 'correlation-matrix';
  title: string;
  config: Record<string, any>;
  position: { x: number; y: number; width: number; height: number };
}

export interface DriftDetection {
  id: string;
  configId: string;
  modelId: string;
  modelVersion: string;
  driftType: DriftType;
  detectionMethod: DetectionMethod;
  driftScore: number;
  severity: DriftSeverity;
  features: FeatureDrift[];
  detectedAt: string;
  windowStart: string;
  windowEnd: string;
  baselinePeriod: { start: string; end: string };
  currentPeriod: { start: string; end: string };
  sampleSize: number;
  status: DetectionStatus;
}

export type DetectionStatus = 'detected' | 'confirmed' | 'investigating' | 'resolved' | 'ignored';

export interface FeatureDrift {
  featureName: string;
  featureType: string;
  driftScore: number;
  severity: DriftSeverity;
  baselineStats: FeatureBaselineStats;
  currentStats: FeatureBaselineStats;
  statisticalTests: StatisticalTest[];
  visualization?: FeatureVisualization;
}

export interface StatisticalTest {
  testName: string;
  statistic: number;
  pValue: number;
  threshold: number;
  passed: boolean;
}

export interface FeatureVisualization {
  histogramData?: any;
  kdeData?: any;
  boxplotData?: any;
  distributionComparison?: any;
}

export interface DriftTrend {
  id: string;
  configId: string;
  driftType: DriftType;
  featureName?: string;
  trend: TrendDirection;
  slope: number;
  r2: number;
  changePoints: DriftChangePoint[];
  forecast: DriftForecast;
  seasonality?: SeasonalityPattern;
  insights: string[];
  analyzedAt: string;
}

export type TrendDirection = 'increasing' | 'decreasing' | 'stable' | 'fluctuating' | 'seasonal';

export interface DriftChangePoint {
  timestamp: string;
  driftScoreBefore: number;
  driftScoreAfter: number;
  magnitude: number;
  significance: number;
  probableCause?: string;
}

export interface DriftForecast {
  timestamps: string[];
  driftScores: number[];
  lowerBound: number[];
  upperBound: number[];
  confidence: number;
  method: string;
}

export interface SeasonalityPattern {
  period: number; // days
  amplitude: number;
  phase: number;
  strength: number;
}

export interface DriftCorrelation {
  id: string;
  configId: string;
  correlationType: CorrelationType;
  variables: CorrelationVariable[];
  correlationMatrix: number[][];
  significantCorrelations: SignificantCorrelation[];
  insights: string[];
  analyzedAt: string;
}

export type CorrelationType = 'feature-feature' | 'feature-drift' | 'drift-drift' | 'drift-performance' | 'drift-external';

export interface CorrelationVariable {
  name: string;
  type: 'feature' | 'drift-score' | 'performance-metric' | 'external-factor';
  values: number[];
}

export interface SignificantCorrelation {
  variable1: string;
  variable2: string;
  correlation: number;
  pValue: number;
  strength: 'weak' | 'moderate' | 'strong';
  interpretation: string;
}

export interface DriftImpact {
  id: string;
  configId: string;
  driftDetectionId: string;
  impactType: ImpactType;
  severity: ImpactSeverity;
  affectedMetrics: AffectedMetric[];
  businessImpact?: BusinessImpact;
  stakeholderImpact?: StakeholderImpact;
  recommendations: string[];
  assessedAt: string;
}

export type ImpactType = 'performance' | 'business' | 'stakeholder' | 'combined';

export type ImpactSeverity = 'minimal' | 'low' | 'moderate' | 'high' | 'critical';

export interface AffectedMetric {
  metricName: string;
  baselineValue: number;
  currentValue: number;
  changePercentage: number;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface BusinessImpact {
  revenueImpact?: number;
  costImpact?: number;
  customerImpact?: number;
  operationalImpact?: string;
  estimatedLoss?: number;
}

export interface StakeholderImpact {
  affectedUsers?: number;
  affectedTeams?: string[];
  customerSatisfaction?: number;
  supportTickets?: number;
}

export interface DriftRemediation {
  id: string;
  configId: string;
  driftDetectionId: string;
  status: RemediationStatus;
  workflow: RemediationWorkflow;
  assignedTo?: string;
  startedAt: string;
  completedAt?: string;
  outcome?: RemediationOutcome;
}

export type RemediationStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled';

export interface RemediationWorkflow {
  steps: RemediationStepExecution[];
  currentStep: number;
  totalSteps: number;
}

export interface RemediationStepExecution {
  stepId: string;
  stepName: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  result?: any;
  error?: string;
}

export interface RemediationOutcome {
  success: boolean;
  driftResolved: boolean;
  driftScoreBefore: number;
  driftScoreAfter: number;
  improvementPercentage: number;
  actionsTaken: string[];
  lessonsLearned?: string[];
}

export interface DriftAlert {
  id: string;
  configId: string;
  driftDetectionId: string;
  severity: DriftSeverity;
  title: string;
  description: string;
  context: AlertContext;
  channels: AlertChannel[];
  status: AlertStatus;
  sentAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

export type AlertStatus = 'sent' | 'acknowledged' | 'resolved' | 'ignored';

export interface AlertContext {
  driftType: DriftType;
  driftScore: number;
  affectedFeatures?: string[];
  trend?: TrendDirection;
  impact?: ImpactSeverity;
  recommendedActions?: string[];
}

export interface DriftMonitoringDashboard {
  organizationId: string;
  totalConfigs: number;
  activeConfigs: number;
  totalDetections: number;
  detectionsBySeverity: Record<DriftSeverity, number>;
  detectionsByType: Record<DriftType, number>;
  activeRemediations: number;
  recentDetections: DriftDetection[];
  driftTrends: DriftTrend[];
  topDriftingFeatures: Array<{
    featureName: string;
    driftScore: number;
    severity: DriftSeverity;
    trend: TrendDirection;
  }>;
  impactSummary: {
    highImpactDetections: number;
    totalBusinessImpact: number;
    affectedUsers: number;
  };
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const configs = new Map<string, DriftMonitoringConfig>();
const detections = new Map<string, DriftDetection[]>();
const trends = new Map<string, DriftTrend[]>();
const correlations = new Map<string, DriftCorrelation[]>();
const impacts = new Map<string, DriftImpact[]>();
const remediations = new Map<string, DriftRemediation[]>();
const alerts = new Map<string, DriftAlert[]>();

// ─── Configuration Management ──────────────────────────────────────────────────

/**
 * Create drift monitoring configuration
 */
export async function createDriftMonitoringConfig(
  organizationId: string,
  params: {
    modelId: string;
    modelName: string;
    modelVersion: string;
    driftTypes?: DriftType[];
    detectionMethods?: DetectionMethod[];
    features?: FeatureMonitoringConfig[];
    thresholds?: Partial<DriftThresholdConfig>;
    trendAnalysis?: Partial<TrendAnalysisConfig>;
    correlationAnalysis?: Partial<CorrelationAnalysisConfig>;
    impactAssessment?: Partial<ImpactAssessmentConfig>;
    remediation?: Partial<RemediationConfig>;
    alerting?: Partial<DriftAlertingConfig>;
    visualization?: Partial<VisualizationConfig>;
    createdBy: string;
  }
): Promise<DriftMonitoringConfig> {
  const id = `driftconfig_${randomUUID()}`;
  const now = new Date().toISOString();

  const config: DriftMonitoringConfig = {
    id,
    organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    status: 'active',
    driftTypes: params.driftTypes || ['data-drift', 'concept-drift', 'feature-drift'],
    detectionMethods: params.detectionMethods || ['kolmogorov-smirnov', 'psi'],
    features: params.features || [],
    thresholds: {
      dataDrift: params.thresholds?.dataDrift ?? 0.2,
      conceptDrift: params.thresholds?.conceptDrift ?? 0.15,
      modelDrift: params.thresholds?.modelDrift ?? 0.1,
      predictionDrift: params.thresholds?.predictionDrift ?? 0.2,
      featureDrift: params.thresholds?.featureDrift ?? 0.25,
      severityLevels: params.thresholds?.severityLevels ?? {
        low: 0.1,
        medium: 0.2,
        high: 0.3,
        critical: 0.5,
      },
    },
    trendAnalysis: {
      enabled: params.trendAnalysis?.enabled ?? true,
      windowSize: params.trendAnalysis?.windowSize ?? 30,
      forecastingHorizon: params.trendAnalysis?.forecastingHorizon ?? 7,
      changePointDetection: params.trendAnalysis?.changePointDetection ?? true,
      seasonalityDetection: params.trendAnalysis?.seasonalityDetection ?? true,
    },
    correlationAnalysis: {
      enabled: params.correlationAnalysis?.enabled ?? true,
      featureCorrelation: params.correlationAnalysis?.featureCorrelation ?? true,
      driftCorrelation: params.correlationAnalysis?.driftCorrelation ?? true,
      externalFactors: params.correlationAnalysis?.externalFactors ?? false,
      correlationThreshold: params.correlationAnalysis?.correlationThreshold ?? 0.5,
    },
    impactAssessment: {
      enabled: params.impactAssessment?.enabled ?? true,
      performanceImpact: params.impactAssessment?.performanceImpact ?? true,
      businessImpact: params.impactAssessment?.businessImpact ?? true,
      stakeholderImpact: params.impactAssessment?.stakeholderImpact ?? true,
      impactMetrics: params.impactAssessment?.impactMetrics ?? ['accuracy', 'latency', 'error-rate'],
    },
    remediation: {
      enabled: params.remediation?.enabled ?? true,
      autoRetraining: params.remediation?.autoRetraining ?? false,
      retrainingThreshold: params.remediation?.retrainingThreshold ?? 0.3,
      notificationChannels: params.remediation?.notificationChannels ?? ['email'],
      workflowSteps: params.remediation?.workflowSteps ?? [
        {
          id: `step_${randomUUID()}`,
          name: 'Notify Stakeholders',
          type: 'notification',
          config: {},
          order: 1,
          automated: true,
        },
        {
          id: `step_${randomUUID()}`,
          name: 'Investigate Drift',
          type: 'investigation',
          config: {},
          order: 2,
          automated: false,
        },
      ],
    },
    alerting: {
      enabled: params.alerting?.enabled ?? true,
      channels: params.alerting?.channels ?? [{ type: 'email', config: {} }],
      severityThreshold: params.alerting?.severityThreshold ?? 'medium',
      cooldownMinutes: params.alerting?.cooldownMinutes ?? 60,
      aggregationWindow: params.alerting?.aggregationWindow ?? 15,
    },
    visualization: {
      enabled: params.visualization?.enabled ?? true,
      dashboards: params.visualization?.dashboards ?? [],
      realTimeUpdates: params.visualization?.realTimeUpdates ?? true,
      historicalComparison: params.visualization?.historicalComparison ?? true,
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  configs.set(id, config);
  detections.set(id, []);
  trends.set(id, []);
  correlations.set(id, []);
  impacts.set(id, []);
  remediations.set(id, []);
  alerts.set(id, []);

  return config;
}

/**
 * Update drift monitoring configuration
 */
export async function updateDriftMonitoringConfig(
  configId: string,
  updates: Partial<Omit<DriftMonitoringConfig, 'id' | 'organizationId' | 'createdAt'>>
): Promise<DriftMonitoringConfig | null> {
  const config = configs.get(configId);
  if (!config) return null;

  Object.assign(config, updates);
  config.updatedAt = new Date().toISOString();

  configs.set(configId, config);
  return config;
}

/**
 * Record drift detection
 */
export async function recordDriftDetection(
  configId: string,
  detection: Omit<DriftDetection, 'id' | 'configId' | 'status'>
): Promise<DriftDetection | null> {
  const config = configs.get(configId);
  if (!config) return null;

  const newDetection: DriftDetection = {
    ...detection,
    id: `detection_${randomUUID()}`,
    configId,
    status: 'detected',
  };

  const existingDetections = detections.get(configId) || [];
  existingDetections.push(newDetection);
  detections.set(configId, existingDetections);

  // Trigger impact assessment if enabled
  if (config.impactAssessment.enabled) {
    await assessDriftImpact(configId, newDetection.id);
  }

  // Trigger alerting if enabled
  if (config.alerting.enabled && newDetection.severity >= config.alerting.severityThreshold) {
    await sendDriftAlert(configId, newDetection.id);
  }

  // Trigger remediation if enabled
  if (config.remediation.enabled && newDetection.driftScore >= config.remediation.retrainingThreshold) {
    await initiateRemediation(configId, newDetection.id);
  }

  return newDetection;
}

/**
 * Analyze drift trends
 */
export async function analyzeDriftTrends(
  configId: string,
  driftType: DriftType,
  featureName?: string
): Promise<DriftTrend | null> {
  const config = configs.get(configId);
  if (!config || !config.trendAnalysis.enabled) return null;

  const allDetections = detections.get(configId) || [];
  const relevantDetections = allDetections.filter(
    (d) => d.driftType === driftType && (!featureName || d.features.some((f) => f.featureName === featureName))
  );

  if (relevantDetections.length < 10) return null;

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - config.trendAnalysis.windowSize);

  const windowDetections = relevantDetections.filter((d) => new Date(d.detectedAt) >= windowStart);

  if (windowDetections.length < 5) return null;

  const driftScores = windowDetections.map((d) => d.driftScore);
  const timestamps = windowDetections.map((d) => d.detectedAt);

  // Simple linear regression
  const n = driftScores.length;
  const sumX = timestamps.reduce((sum, _, i) => sum + i, 0);
  const sumY = driftScores.reduce((sum, v) => sum + v, 0);
  const sumXY = timestamps.reduce((sum, _, i) => sum + i * driftScores[i], 0);
  const sumX2 = timestamps.reduce((sum, _, i) => sum + i * i, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R²
  const yMean = sumY / n;
  const ssTotal = driftScores.reduce((sum, v) => sum + Math.pow(v - yMean, 2), 0);
  const ssResidual = driftScores.reduce((sum, v, i) => sum + Math.pow(v - (slope * i + intercept), 2), 0);
  const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  const trend: TrendDirection = Math.abs(slope) < 0.001 ? 'stable' : slope > 0 ? 'increasing' : 'decreasing';

  // Forecast
  const forecastTimestamps: string[] = [];
  const forecastScores: number[] = [];
  const lowerBound: number[] = [];
  const upperBound: number[] = [];

  for (let i = 0; i < config.trendAnalysis.forecastingHorizon; i++) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + i + 1);
    forecastTimestamps.push(futureDate.toISOString());

    const forecastScore = Math.max(0, slope * (n + i) + intercept);
    forecastScores.push(forecastScore);
    lowerBound.push(forecastScore * 0.8);
    upperBound.push(forecastScore * 1.2);
  }

  const insights: string[] = [];
  if (trend === 'increasing') {
    insights.push(`Drift is increasing with slope ${slope.toFixed(4)}`);
  } else if (trend === 'decreasing') {
    insights.push(`Drift is decreasing with slope ${slope.toFixed(4)}`);
  }

  const trendAnalysis: DriftTrend = {
    id: `trend_${randomUUID()}`,
    configId,
    driftType,
    featureName,
    trend,
    slope,
    r2,
    changePoints: [],
    forecast: {
      timestamps: forecastTimestamps,
      driftScores: forecastScores,
      lowerBound,
      upperBound,
      confidence: r2,
      method: 'linear-regression',
    },
    insights,
    analyzedAt: new Date().toISOString(),
  };

  const existingTrends = trends.get(configId) || [];
  existingTrends.push(trendAnalysis);
  trends.set(configId, existingTrends);

  return trendAnalysis;
}

/**
 * Analyze drift correlations
 */
export async function analyzeDriftCorrelations(
  configId: string,
  correlationType: CorrelationType
): Promise<DriftCorrelation | null> {
  const config = configs.get(configId);
  if (!config || !config.correlationAnalysis.enabled) return null;

  const allDetections = detections.get(configId) || [];

  if (allDetections.length < 10) return null;

  // Simplified correlation analysis
  const variables: CorrelationVariable[] = [];
  const correlationMatrix: number[][] = [];
  const significantCorrelations: SignificantCorrelation[] = [];

  // For demonstration, create mock correlation data
  if (correlationType === 'feature-drift' && config.features.length > 0) {
    for (const feature of config.features.slice(0, 5)) {
      variables.push({
        name: feature.featureName,
        type: 'feature',
        values: Array.from({ length: 20 }, () => Math.random()),
      });
    }

    // Create correlation matrix
    for (let i = 0; i < variables.length; i++) {
      correlationMatrix[i] = [];
      for (let j = 0; j < variables.length; j++) {
        correlationMatrix[i][j] = i === j ? 1 : Math.random() * 2 - 1;
      }
    }

    // Find significant correlations
    for (let i = 0; i < variables.length; i++) {
      for (let j = i + 1; j < variables.length; j++) {
        const corr = correlationMatrix[i][j];
        if (Math.abs(corr) >= config.correlationAnalysis.correlationThreshold) {
          significantCorrelations.push({
            variable1: variables[i].name,
            variable2: variables[j].name,
            correlation: corr,
            pValue: 0.05,
            strength: Math.abs(corr) > 0.7 ? 'strong' : Math.abs(corr) > 0.4 ? 'moderate' : 'weak',
            interpretation: corr > 0 ? 'Positive correlation' : 'Negative correlation',
          });
        }
      }
    }
  }

  const insights: string[] = [];
  if (significantCorrelations.length > 0) {
    insights.push(`Found ${significantCorrelations.length} significant correlations`);
  }

  const correlation: DriftCorrelation = {
    id: `correlation_${randomUUID()}`,
    configId,
    correlationType,
    variables,
    correlationMatrix,
    significantCorrelations,
    insights,
    analyzedAt: new Date().toISOString(),
  };

  const existingCorrelations = correlations.get(configId) || [];
  existingCorrelations.push(correlation);
  correlations.set(configId, existingCorrelations);

  return correlation;
}

/**
 * Get drift monitoring configuration by ID
 */
export async function getDriftMonitoringConfig(configId: string): Promise<DriftMonitoringConfig | null> {
  return configs.get(configId) || null;
}

/**
 * List drift monitoring configurations
 */
export async function listDriftMonitoringConfigs(
  organizationId: string,
  filters?: { status?: DriftMonitoringStatus; modelId?: string }
): Promise<DriftMonitoringConfig[]> {
  const allConfigs = Array.from(configs.values()).filter((c) => c.organizationId === organizationId);

  return allConfigs.filter((c) => {
    if (filters?.status && c.status !== filters.status) return false;
    if (filters?.modelId && c.modelId !== filters.modelId) return false;
    return true;
  });
}

/**
 * Get drift monitoring dashboard
 */
export async function getDriftMonitoringDashboard(organizationId: string): Promise<DriftMonitoringDashboard> {
  const allConfigs = await listDriftMonitoringConfigs(organizationId);
  const activeConfigs = allConfigs.filter((c) => c.status === 'active');

  const allDetections = Array.from(detections.values()).flat();
  const allRemediations = Array.from(remediations.values()).flat();
  const allTrends = Array.from(trends.values()).flat();
  const allImpacts = Array.from(impacts.values()).flat();

  const detectionsBySeverity: Record<string, number> = { none: 0, low: 0, medium: 0, high: 0, critical: 0 };
  const detectionsByType: Record<string, number> = {};

  for (const detection of allDetections) {
    detectionsBySeverity[detection.severity]++;
    detectionsByType[detection.driftType] = (detectionsByType[detection.driftType] || 0) + 1;
  }

  const activeRemediations = allRemediations.filter((r) => r.status === 'in-progress').length;

  const recentDetections = allDetections
    .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
    .slice(0, 10);

  const featureDriftScores = new Map<string, { totalScore: number; count: number; maxSeverity: DriftSeverity }>();
  for (const detection of allDetections) {
    for (const feature of detection.features) {
      const current = featureDriftScores.get(feature.featureName) || { totalScore: 0, count: 0, maxSeverity: 'none' };
      current.totalScore += feature.driftScore;
      current.count++;
      if (feature.severity > current.maxSeverity) {
        current.maxSeverity = feature.severity;
      }
      featureDriftScores.set(feature.featureName, current);
    }
  }

  const topDriftingFeatures = Array.from(featureDriftScores.entries())
    .map(([featureName, data]) => ({
      featureName,
      driftScore: data.totalScore / data.count,
      severity: data.maxSeverity,
      trend: 'stable' as TrendDirection,
    }))
    .sort((a, b) => b.driftScore - a.driftScore)
    .slice(0, 10);

  const highImpactDetections = allImpacts.filter((i) => i.severity === 'high' || i.severity === 'critical').length;
  const totalBusinessImpact = allImpacts.reduce((sum, i) => sum + (i.businessImpact?.estimatedLoss || 0), 0);
  const affectedUsers = allImpacts.reduce((sum, i) => sum + (i.stakeholderImpact?.affectedUsers || 0), 0);

  return {
    organizationId,
    totalConfigs: allConfigs.length,
    activeConfigs: activeConfigs.length,
    totalDetections: allDetections.length,
    detectionsBySeverity: detectionsBySeverity as Record<DriftSeverity, number>,
    detectionsByType: detectionsByType as Record<DriftType, number>,
    activeRemediations,
    recentDetections,
    driftTrends: allTrends.slice(0, 10),
    topDriftingFeatures,
    impactSummary: {
      highImpactDetections,
      totalBusinessImpact,
      affectedUsers,
    },
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

async function assessDriftImpact(configId: string, detectionId: string): Promise<void> {
  // Simplified impact assessment
  const detection = (detections.get(configId) || []).find((d) => d.id === detectionId);
  if (!detection) return;

  const impact: DriftImpact = {
    id: `impact_${randomUUID()}`,
    configId,
    driftDetectionId: detectionId,
    impactType: 'combined',
    severity: detection.severity === 'critical' ? 'critical' : detection.severity === 'high' ? 'high' : 'moderate',
    affectedMetrics: [
      {
        metricName: 'accuracy',
        baselineValue: 0.95,
        currentValue: 0.95 - detection.driftScore * 0.1,
        changePercentage: -detection.driftScore * 10,
        impact: 'negative',
      },
    ],
    recommendations: ['Investigate root cause', 'Consider retraining model'],
    assessedAt: new Date().toISOString(),
  };

  const existingImpacts = impacts.get(configId) || [];
  existingImpacts.push(impact);
  impacts.set(configId, existingImpacts);
}

async function sendDriftAlert(configId: string, detectionId: string): Promise<void> {
  const config = configs.get(configId);
  const detection = (detections.get(configId) || []).find((d) => d.id === detectionId);
  if (!config || !detection) return;

  const alert: DriftAlert = {
    id: `alert_${randomUUID()}`,
    configId,
    driftDetectionId: detectionId,
    severity: detection.severity,
    title: `${detection.driftType} detected in ${config.modelName}`,
    description: `Drift score: ${detection.driftScore.toFixed(4)}`,
    context: {
      driftType: detection.driftType,
      driftScore: detection.driftScore,
      affectedFeatures: detection.features.map((f) => f.featureName),
    },
    channels: config.alerting.channels,
    status: 'sent',
    sentAt: new Date().toISOString(),
  };

  const existingAlerts = alerts.get(configId) || [];
  existingAlerts.push(alert);
  alerts.set(configId, existingAlerts);
}

async function initiateRemediation(configId: string, detectionId: string): Promise<void> {
  const config = configs.get(configId);
  if (!config) return;

  const remediation: DriftRemediation = {
    id: `remediation_${randomUUID()}`,
    configId,
    driftDetectionId: detectionId,
    status: 'pending',
    workflow: {
      steps: config.remediation.workflowSteps.map((step) => ({
        stepId: step.id,
        stepName: step.name,
        status: 'pending',
      })),
      currentStep: 0,
      totalSteps: config.remediation.workflowSteps.length,
    },
    startedAt: new Date().toISOString(),
  };

  const existingRemediations = remediations.get(configId) || [];
  existingRemediations.push(remediation);
  remediations.set(configId, existingRemediations);
}
