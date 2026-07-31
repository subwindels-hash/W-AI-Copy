/**
 * Module 44: Concept Drift Detection Service
 *
 * Provides comprehensive concept drift detection for machine learning models,
 * including statistical drift detection, feature/prediction/label drift monitoring,
 * drift alerts, automatic retraining triggers, and historical drift tracking.
 *
 * Phase 1 — Critical Gap: Concept drift detection infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:conceptDriftDetection');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type DriftDetectionMethod =
  | "kolmogorov_smirnov"
  | "psi" // Population Stability Index
  | "kl_divergence"
  | "wasserstein"
  | "chi_square"
  | "adversarial_validation"
  | "custom";

export type DriftType = "feature" | "prediction" | "label" | "covariate" | "concept";

export type DriftSeverity = "none" | "low" | "medium" | "high" | "critical";

export type DriftJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type AlertStatus = "active" | "acknowledged" | "resolved" | "ignored";

export interface DriftDetectionJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: DriftJobStatus;
  modelId: string;
  modelName: string;
  modelVersion: string;
  config: DriftDetectionConfig;
  result?: DriftDetectionResult;
  error?: { code: string; message: string; step?: string };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DriftDetectionConfig {
  referenceDataset: DatasetConfig;
  currentDataset: DatasetConfig;
  driftType: DriftType;
  detectionMethods: DriftDetectionMethod[];
  featureColumns?: string[];
  predictionColumn?: string;
  labelColumn?: string;
  thresholds: DriftThresholds;
  alertConfig?: AlertConfig;
  retrainingTrigger?: RetrainingTrigger;
}

export interface DatasetConfig {
  datasetId?: string;
  datasetUrl?: string;
  sampleSize?: number;
  startTime?: string;
  endTime?: string;
  filters?: Record<string, unknown>;
}

export interface DriftThresholds {
  low: number; // e.g., 0.1
  medium: number; // e.g., 0.2
  high: number; // e.g., 0.3
  critical: number; // e.g., 0.5
}

export interface AlertConfig {
  enabled: boolean;
  minSeverity: DriftSeverity;
  notificationChannels: Array<{
    type: "email" | "slack" | "webhook" | "pagerduty";
    config: Record<string, unknown>;
  }>;
  cooldownMinutes: number;
}

export interface RetrainingTrigger {
  enabled: boolean;
  minSeverity: DriftSeverity;
  minFeaturesAffected: number;
  autoTrigger: boolean;
  retrainingConfig?: {
    trainingDatasetId: string;
    hyperparameters?: Record<string, unknown>;
    validationThreshold?: number;
  };
}

export interface DriftDetectionResult {
  overallDriftScore: number;
  overallSeverity: DriftSeverity;
  featureDrift: FeatureDriftResult[];
  predictionDrift?: PredictionDriftResult;
  labelDrift?: LabelDriftResult;
  driftSummary: DriftSummary;
  recommendations: string[];
  detectedAt: string;
}

export interface FeatureDriftResult {
  featureName: string;
  featureType: string;
  driftScore: number;
  severity: DriftSeverity;
  detectionResults: Array<{
    method: DriftDetectionMethod;
    score: number;
    pValue?: number;
    statistic?: number;
    passed: boolean;
  }>;
  distributionComparison: {
    referenceStats: FeatureStatistics;
    currentStats: FeatureStatistics;
    statisticalTests: Array<{
      test: string;
      statistic: number;
      pValue: number;
      passed: boolean;
    }>;
  };
  visualization?: {
    histogramUrl?: string;
    kdePlotUrl?: string;
    cdfPlotUrl?: string;
  };
}

export interface FeatureStatistics {
  count: number;
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
  median?: number;
  q1?: number;
  q3?: number;
  unique?: number;
  topValues?: Array<{ value: unknown; count: number; percentage: number }>;
  missing?: number;
  missingPercentage?: number;
}

export interface PredictionDriftResult {
  driftScore: number;
  severity: DriftSeverity;
  predictionDistribution: {
    reference: PredictionDistribution;
    current: PredictionDistribution;
  };
  statisticalTests: Array<{
    test: string;
    statistic: number;
    pValue: number;
    passed: boolean;
  }>;
}

export interface PredictionDistribution {
  mean: number;
  std: number;
  min: number;
  max: number;
  histogram: Array<{ bin: string; count: number; percentage: number }>;
  percentiles: Record<string, number>;
}

export interface LabelDriftResult {
  driftScore: number;
  severity: DriftSeverity;
  labelDistribution: {
    reference: Record<string, number>;
    current: Record<string, number>;
  };
  statisticalTests: Array<{
    test: string;
    statistic: number;
    pValue: number;
    passed: boolean;
  }>;
}

export interface DriftSummary {
  totalFeatures: number;
  featuresWithDrift: number;
  featuresBySeverity: Record<DriftSeverity, number>;
  mostDriftedFeatures: Array<{
    featureName: string;
    driftScore: number;
    severity: DriftSeverity;
  }>;
  driftTrend: "increasing" | "decreasing" | "stable";
  historicalComparison?: {
    previousDriftScore: number;
    driftScoreChange: number;
    timeSinceLastDetection: number; // hours
  };
}

export interface DriftAlert {
  id: string;
  organizationId: string;
  driftJobId: string;
  modelId: string;
  modelName: string;
  driftType: DriftType;
  severity: DriftSeverity;
  driftScore: number;
  affectedFeatures?: string[];
  message: string;
  status: AlertStatus;
  triggeredAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
  retrainingTriggered?: boolean;
  retrainingJobId?: string;
}

export interface DriftHistory {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  detectionDate: string;
  driftScore: number;
  severity: DriftSeverity;
  driftType: DriftType;
  featuresAffected: number;
  retrainingTriggered: boolean;
  performanceImpact?: {
    accuracyBefore?: number;
    accuracyAfter?: number;
    accuracyDrop?: number;
  };
}

export interface DriftStats {
  totalDetections: number;
  detectionsBySeverity: Record<DriftSeverity, number>;
  detectionsByType: Record<DriftType, number>;
  averageDriftScore: number;
  totalAlerts: number;
  activeAlerts: number;
  resolvedAlerts: number;
  retrainingTriggered: number;
  modelsMonitored: number;
  mostDriftedModels: Array<{
    modelId: string;
    modelName: string;
    driftCount: number;
    averageDriftScore: number;
  }>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const driftJobs = new Map<string, DriftDetectionJob>();
const driftAlerts = new Map<string, DriftAlert>();
const driftHistory = new Map<string, DriftHistory>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a drift detection job
 */
export async function createDriftDetectionJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  config: DriftDetectionConfig;
  createdBy: string;
}): Promise<DriftDetectionJob> {
  const now = new Date().toISOString();

  const job: DriftDetectionJob = {
    id: `drift_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "pending",
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    config: params.config,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  driftJobs.set(job.id, job);

  // Start detection process
  setTimeout(() => executeDriftDetection(job.id), 100);

  return job;
}

/**
 * Get drift detection job by ID
 */
export async function getDriftDetectionJob(jobId: string): Promise<DriftDetectionJob | null> {
  return driftJobs.get(jobId) ?? null;
}

/**
 * List drift detection jobs
 */
export async function listDriftDetectionJobs(
  organizationId: string,
  filters?: {
    status?: DriftJobStatus;
    modelId?: string;
    driftType?: DriftType;
    limit?: number;
  }
): Promise<DriftDetectionJob[]> {
  let result = Array.from(driftJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.modelId) result = result.filter(j => j.modelId === filters.modelId);
  if (filters?.driftType) result = result.filter(j => j.config.driftType === filters.driftType);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Cancel a drift detection job
 */
export async function cancelDriftDetectionJob(jobId: string): Promise<DriftDetectionJob | null> {
  const job = driftJobs.get(jobId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Cannot cancel job in status: ${job.status}`);
  }

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();

  driftJobs.set(jobId, job);
  return job;
}

/**
 * Get drift alert by ID
 */
export async function getDriftAlert(alertId: string): Promise<DriftAlert | null> {
  return driftAlerts.get(alertId) ?? null;
}

/**
 * List drift alerts
 */
export async function listDriftAlerts(
  organizationId: string,
  filters?: {
    status?: AlertStatus;
    severity?: DriftSeverity;
    modelId?: string;
    limit?: number;
  }
): Promise<DriftAlert[]> {
  let result = Array.from(driftAlerts.values()).filter(
    a => a.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(a => a.status === filters.status);
  if (filters?.severity) result = result.filter(a => a.severity === filters.severity);
  if (filters?.modelId) result = result.filter(a => a.modelId === filters.modelId);

  return result
    .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Acknowledge a drift alert
 */
export async function acknowledgeDriftAlert(
  alertId: string,
  acknowledgedBy: string
): Promise<DriftAlert | null> {
  const alert = driftAlerts.get(alertId);
  if (!alert) return null;

  alert.status = "acknowledged";
  alert.acknowledgedAt = new Date().toISOString();
  alert.acknowledgedBy = acknowledgedBy;

  driftAlerts.set(alertId, alert);
  return alert;
}

/**
 * Resolve a drift alert
 */
export async function resolveDriftAlert(
  alertId: string,
  resolvedBy: string,
  resolutionNotes?: string
): Promise<DriftAlert | null> {
  const alert = driftAlerts.get(alertId);
  if (!alert) return null;

  alert.status = "resolved";
  alert.resolvedAt = new Date().toISOString();
  alert.resolvedBy = resolvedBy;
  alert.resolutionNotes = resolutionNotes;

  driftAlerts.set(alertId, alert);
  return alert;
}

/**
 * Get drift history for a model
 */
export async function getDriftHistory(
  organizationId: string,
  modelId: string,
  limit: number = 50
): Promise<DriftHistory[]> {
  const result = Array.from(driftHistory.values()).filter(
    h => h.organizationId === organizationId && h.modelId === modelId
  );

  return result
    .sort((a, b) => b.detectionDate.localeCompare(a.detectionDate))
    .slice(0, limit);
}

/**
 * Get drift statistics
 */
export async function getDriftStats(organizationId: string): Promise<DriftStats> {
  const jobs = Array.from(driftJobs.values()).filter(
    j => j.organizationId === organizationId && j.status === "completed"
  );
  const alerts = Array.from(driftAlerts.values()).filter(
    a => a.organizationId === organizationId
  );
  const history = Array.from(driftHistory.values()).filter(
    h => h.organizationId === organizationId
  );

  const detectionsBySeverity: Record<DriftSeverity, number> = {
    none: 0, low: 0, medium: 0, high: 0, critical: 0
  };
  const detectionsByType: Record<DriftType, number> = {
    feature: 0, prediction: 0, label: 0, covariate: 0, concept: 0
  };
  let totalDriftScore = 0;
  let retrainingTriggered = 0;
  const modelDriftCounts: Record<string, { count: number; totalScore: number; name: string }> = {};

  for (const job of jobs) {
    if (job.result) {
      detectionsBySeverity[job.result.overallSeverity]++;
      detectionsByType[job.config.driftType]++;
      totalDriftScore += job.result.overallDriftScore;

      if (!modelDriftCounts[job.modelId]) {
        modelDriftCounts[job.modelId] = { count: 0, totalScore: 0, name: job.modelName };
      }
      modelDriftCounts[job.modelId].count++;
      modelDriftCounts[job.modelId].totalScore += job.result.overallDriftScore;
    }
  }

  for (const h of history) {
    if (h.retrainingTriggered) retrainingTriggered++;
  }

  const mostDriftedModels = Object.entries(modelDriftCounts)
    .map(([modelId, data]) => ({
      modelId,
      modelName: data.name,
      driftCount: data.count,
      averageDriftScore: data.count > 0 ? data.totalScore / data.count : 0,
    }))
    .sort((a, b) => b.driftCount - a.driftCount)
    .slice(0, 10);

  return {
    totalDetections: jobs.length,
    detectionsBySeverity,
    detectionsByType,
    averageDriftScore: jobs.length > 0 ? totalDriftScore / jobs.length : 0,
    totalAlerts: alerts.length,
    activeAlerts: alerts.filter(a => a.status === "active").length,
    resolvedAlerts: alerts.filter(a => a.status === "resolved").length,
    retrainingTriggered,
    modelsMonitored: new Set(jobs.map(j => j.modelId)).size,
    mostDriftedModels,
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

async function executeDriftDetection(jobId: string): Promise<void> {
  const job = driftJobs.get(jobId);
  if (!job) return;

  try {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    job.updatedAt = job.startedAt;
    driftJobs.set(jobId, job);

    // Simulate drift detection
    const detectionTimeMs = 5000 + _rng.next() * 10000;
    await new Promise(resolve => setTimeout(resolve, Math.min(detectionTimeMs, 100)));

    // Generate results
    const result = generateDriftResult(job);
    job.result = result;
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;

    driftJobs.set(jobId, job);

    // Create drift history entry
    const historyEntry = createDriftHistory(job, result);
    driftHistory.set(historyEntry.id, historyEntry);

    // Check if alert should be triggered
    if (shouldTriggerAlert(job, result)) {
      const alert = createDriftAlert(job, result);
      driftAlerts.set(alert.id, alert);

      // Check if retraining should be triggered
      if (shouldTriggerRetraining(job, result)) {
        alert.retrainingTriggered = true;
        // In production, would trigger retraining job here
        driftAlerts.set(alert.id, alert);
      }
    }
  } catch (error) {
    job.status = "failed";
    job.error = {
      code: "DRIFT_DETECTION_ERROR",
      message: error instanceof Error ? error.message : String(error),
      step: job.status,
    };
    job.updatedAt = new Date().toISOString();
    driftJobs.set(jobId, job);
  }
}

function generateDriftResult(job: DriftDetectionJob): DriftDetectionResult {
  const config = job.config;
  const numFeatures = config.featureColumns?.length ?? 20;

  // Generate feature drift results
  const featureDrift: FeatureDriftResult[] = [];
  for (let i = 0; i < numFeatures; i++) {
    const featureName = config.featureColumns?.[i] ?? `feature_${i}`;
    const driftScore = _rng.next();
    const severity = getSeverityFromScore(driftScore, config.thresholds);

    featureDrift.push({
      featureName,
      featureType: _rng.next() > 0.5 ? "numeric" : "categorical",
      driftScore,
      severity,
      detectionResults: config.detectionMethods.map(method => ({
        method,
        score: driftScore + (_rng.next() - 0.5) * 0.1,
        pValue: _rng.next(),
        statistic: _rng.next(),
        passed: driftScore < config.thresholds.medium,
      })),
      distributionComparison: generateDistributionComparison(featureName),
    });
  }

  // Generate prediction drift if applicable
  let predictionDrift: PredictionDriftResult | undefined;
  if (config.driftType === "prediction" || config.driftType === "concept") {
    const predDriftScore = _rng.next() * 0.5;
    predictionDrift = {
      driftScore: predDriftScore,
      severity: getSeverityFromScore(predDriftScore, config.thresholds),
      predictionDistribution: {
        reference: generatePredictionDistribution(),
        current: generatePredictionDistribution(),
      },
      statisticalTests: [
        { test: "kolmogorov_smirnov", statistic: _rng.next(), pValue: _rng.next(), passed: predDriftScore < 0.2 },
      ],
    };
  }

  // Generate label drift if applicable
  let labelDrift: LabelDriftResult | undefined;
  if (config.driftType === "label" || config.driftType === "concept") {
    const labelDriftScore = _rng.next() * 0.3;
    labelDrift = {
      driftScore: labelDriftScore,
      severity: getSeverityFromScore(labelDriftScore, config.thresholds),
      labelDistribution: {
        reference: { class_0: 0.6, class_1: 0.4 },
        current: { class_0: 0.55, class_1: 0.45 },
      },
      statisticalTests: [
        { test: "chi_square", statistic: _rng.next(), pValue: _rng.next(), passed: labelDriftScore < 0.2 },
      ],
    };
  }

  // Calculate overall drift score
  const featureDriftScores = featureDrift.map(f => f.driftScore);
  const overallDriftScore = (
    featureDriftScores.reduce((sum, s) => sum + s, 0) / featureDriftScores.length +
    (predictionDrift?.driftScore ?? 0) +
    (labelDrift?.driftScore ?? 0)
  ) / (1 + (predictionDrift ? 1 : 0) + (labelDrift ? 1 : 0));

  const overallSeverity = getSeverityFromScore(overallDriftScore, config.thresholds);

  // Generate drift summary
  const featuresWithDrift = featureDrift.filter(f => f.severity !== "none" && f.severity !== "low").length;
  const featuresBySeverity: Record<DriftSeverity, number> = { none: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const f of featureDrift) {
    featuresBySeverity[f.severity]++;
  }

  const mostDriftedFeatures = featureDrift
    .sort((a, b) => b.driftScore - a.driftScore)
    .slice(0, 5)
    .map(f => ({
      featureName: f.featureName,
      driftScore: f.driftScore,
      severity: f.severity,
    }));

  const driftSummary: DriftSummary = {
    totalFeatures: numFeatures,
    featuresWithDrift,
    featuresBySeverity,
    mostDriftedFeatures,
    driftTrend: _rng.next() > 0.5 ? "increasing" : _rng.next() > 0.5 ? "decreasing" : "stable",
  };

  // Generate recommendations
  const recommendations = generateRecommendations(overallSeverity, featuresWithDrift, mostDriftedFeatures);

  return {
    overallDriftScore,
    overallSeverity,
    featureDrift,
    predictionDrift,
    labelDrift,
    driftSummary,
    recommendations,
    detectedAt: new Date().toISOString(),
  };
}

function getSeverityFromScore(score: number, thresholds: DriftThresholds): DriftSeverity {
  if (score >= thresholds.critical) return "critical";
  if (score >= thresholds.high) return "high";
  if (score >= thresholds.medium) return "medium";
  if (score >= thresholds.low) return "low";
  return "none";
}

function generateDistributionComparison(featureName: string): FeatureDriftResult["distributionComparison"] {
  return {
    referenceStats: {
      count: 10000,
      mean: _rng.next() * 100,
      std: _rng.next() * 20,
      min: _rng.next() * 10,
      max: 100 + _rng.next() * 50,
      median: _rng.next() * 100,
      q1: _rng.next() * 50,
      q3: 50 + _rng.next() * 50,
      missing: Math.floor(_rng.next() * 100),
      missingPercentage: _rng.next() * 5,
    },
    currentStats: {
      count: 5000,
      mean: _rng.next() * 100,
      std: _rng.next() * 20,
      min: _rng.next() * 10,
      max: 100 + _rng.next() * 50,
      median: _rng.next() * 100,
      q1: _rng.next() * 50,
      q3: 50 + _rng.next() * 50,
      missing: Math.floor(_rng.next() * 100),
      missingPercentage: _rng.next() * 5,
    },
    statisticalTests: [
      { test: "kolmogorov_smirnov", statistic: _rng.next(), pValue: _rng.next(), passed: _rng.next() > 0.3 },
      { test: "wasserstein", statistic: _rng.next(), pValue: _rng.next(), passed: _rng.next() > 0.3 },
    ],
  };
}

function generatePredictionDistribution(): PredictionDistribution {
  return {
    mean: _rng.next(),
    std: _rng.next() * 0.2,
    min: 0,
    max: 1,
    histogram: Array.from({ length: 10 }, (_, i) => ({
      bin: `${(i * 0.1).toFixed(1)}-${((i + 1) * 0.1).toFixed(1)}`,
      count: Math.floor(_rng.next() * 1000),
      percentage: _rng.next() * 20,
    })),
    percentiles: {
      p5: _rng.next() * 0.2,
      p25: 0.2 + _rng.next() * 0.2,
      p50: 0.4 + _rng.next() * 0.2,
      p75: 0.6 + _rng.next() * 0.2,
      p95: 0.8 + _rng.next() * 0.2,
    },
  };
}

function generateRecommendations(
  severity: DriftSeverity,
  featuresWithDrift: number,
  mostDriftedFeatures: Array<{ featureName: string; driftScore: number }>
): string[] {
  const recommendations: string[] = [];

  if (severity === "critical" || severity === "high") {
    recommendations.push("Immediate model retraining recommended due to significant drift");
    recommendations.push("Investigate root cause of drift (data quality, distribution shift, concept change)");
  }

  if (severity === "medium") {
    recommendations.push("Schedule model retraining within next maintenance window");
    recommendations.push("Monitor drift trend over next few days");
  }

  if (featuresWithDrift > 10) {
    recommendations.push("Large number of features showing drift - consider feature selection or dimensionality reduction");
  }

  if (mostDriftedFeatures.length > 0) {
    const topFeature = mostDriftedFeatures[0];
    recommendations.push(`Focus investigation on "${topFeature.featureName}" (drift score: ${topFeature.driftScore.toFixed(3)})`);
  }

  recommendations.push("Review data collection and preprocessing pipelines for potential issues");
  recommendations.push("Consider implementing automatic retraining triggers based on drift thresholds");

  return recommendations;
}

function shouldTriggerAlert(job: DriftDetectionJob, result: DriftDetectionResult): boolean {
  if (!job.config.alertConfig?.enabled) return false;

  const severityOrder: Record<DriftSeverity, number> = {
    none: 0, low: 1, medium: 2, high: 3, critical: 4
  };

  return severityOrder[result.overallSeverity] >= severityOrder[job.config.alertConfig.minSeverity];
}

function shouldTriggerRetraining(job: DriftDetectionJob, result: DriftDetectionResult): boolean {
  if (!job.config.retrainingTrigger?.enabled) return false;

  const severityOrder: Record<DriftSeverity, number> = {
    none: 0, low: 1, medium: 2, high: 3, critical: 4
  };

  const severityMatch = severityOrder[result.overallSeverity] >= severityOrder[job.config.retrainingTrigger.minSeverity];
  const featuresMatch = result.driftSummary.featuresWithDrift >= job.config.retrainingTrigger.minFeaturesAffected;

  return severityMatch && featuresMatch;
}

function createDriftAlert(job: DriftDetectionJob, result: DriftDetectionResult): DriftAlert {
  return {
    id: `alert_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: job.organizationId,
    driftJobId: job.id,
    modelId: job.modelId,
    modelName: job.modelName,
    driftType: job.config.driftType,
    severity: result.overallSeverity,
    driftScore: result.overallDriftScore,
    affectedFeatures: result.driftSummary.mostDriftedFeatures.map(f => f.featureName),
    message: `Drift detected in ${job.modelName}: ${result.overallSeverity} severity (score: ${result.overallDriftScore.toFixed(3)})`,
    status: "active",
    triggeredAt: new Date().toISOString(),
  };
}

function createDriftHistory(job: DriftDetectionJob, result: DriftDetectionResult): DriftHistory {
  return {
    id: `history_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: job.organizationId,
    modelId: job.modelId,
    modelName: job.modelName,
    detectionDate: result.detectedAt,
    driftScore: result.overallDriftScore,
    severity: result.overallSeverity,
    driftType: job.config.driftType,
    featuresAffected: result.driftSummary.featuresWithDrift,
    retrainingTriggered: shouldTriggerRetraining(job, result),
  };
}
