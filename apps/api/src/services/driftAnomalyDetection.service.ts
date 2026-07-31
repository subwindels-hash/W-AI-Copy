/**
 * Module 50: Drift & Anomaly Detection Service
 *
 * Provides comprehensive drift and anomaly detection capabilities including
 * production drift detection, prediction anomaly detection, statistical
 * process control, automated alerting, drift visualization, and remediation tracking.
 *
 * Phase 1 — Critical Gap: Drift and anomaly detection infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DriftDetectionJobStatus = "pending" | "monitoring" | "paused" | "stopped" | "failed";

export type DriftType = "data_drift" | "concept_drift" | "model_drift" | "prediction_drift";

export type DriftSeverity = "none" | "low" | "medium" | "high" | "critical";

export type AnomalyType = "point_anomaly" | "contextual_anomaly" | "collective_anomaly";

export type DetectionMethod =
  | "ks_test"
  | "psi"
  | "mmd"
  | "classifier_based"
  | "isolation_forest"
  | "one_class_svm"
  | "autoencoder"
  | "statistical_process_control"
  | "cusum";

export interface DriftDetectionJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: DriftDetectionJobStatus;
  modelId: string;
  modelName: string;
  modelVersion: string;
  config: DriftDetectionConfig;
  driftResults: DriftResult[];
  anomalyResults: AnomalyResult[];
  alerts: DriftAlert[];
  performance: DriftDetectionPerformance;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  stoppedAt?: string;
}

export interface DriftDetectionConfig {
  driftDetection: {
    enabled: boolean;
    types: DriftType[];
    methods: DetectionMethod[];
    baselineWindow: number; // Number of samples for baseline
    currentWindow: number; // Number of samples for current window
    detectionFrequency: number; // Seconds between detections
    thresholds: {
      dataDrift?: number;
      conceptDrift?: number;
      modelDrift?: number;
      predictionDrift?: number;
    };
  };
  anomalyDetection: {
    enabled: boolean;
    methods: DetectionMethod[];
    sensitivity: "low" | "medium" | "high";
    contaminationRate: number; // Expected anomaly rate (0-1)
    detectionFrequency: number; // Seconds between detections
    thresholds: {
      anomalyScore?: number;
      zScore?: number;
    };
  };
  featureDrift: {
    enabled: boolean;
    features?: string[]; // Specific features to monitor (all if undefined)
    methods: DetectionMethod[];
    thresholds: Record<string, number>; // Per-feature thresholds
  };
  alerting: {
    enabled: boolean;
    channels: Array<{
      type: "email" | "slack" | "webhook" | "pagerduty";
      config: Record<string, unknown>;
    }>;
    cooldownMinutes: number;
    severityThreshold: DriftSeverity; // Minimum severity to alert
  };
  remediation: {
    autoRetraining: boolean;
    retrainingThreshold: DriftSeverity;
    notifyStakeholders: boolean;
    stakeholders?: string[];
  };
}

export interface DriftResult {
  id: string;
  type: DriftType;
  method: DetectionMethod;
  severity: DriftSeverity;
  score: number; // 0-1 (higher = more drift)
  pValue?: number;
  threshold: number;
  detected: boolean;
  features?: string[]; // Features that drifted
  featureDriftScores?: Record<string, number>; // Per-feature drift scores
  baselineStats: DriftStatistics;
  currentStats: DriftStatistics;
  impact?: DriftImpact;
  detectedAt: string;
}

export interface DriftStatistics {
  sampleSize: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  percentiles: Record<string, number>;
  distribution?: Array<{ value: number; frequency: number }>;
}

export interface DriftImpact {
  performanceImpact: number; // -1 to 1 (negative = degradation)
  accuracyDrop?: number;
  latencyImpact?: number;
  affectedPredictions: number;
  businessImpact: "low" | "medium" | "high" | "critical";
  recommendation: string;
}

export interface AnomalyResult {
  id: string;
  type: AnomalyType;
  method: DetectionMethod;
  severity: "low" | "medium" | "high" | "critical";
  score: number; // Anomaly score (higher = more anomalous)
  threshold: number;
  detected: boolean;
  prediction: unknown;
  expectedRange?: { min: number; max: number };
  features?: Record<string, unknown>;
  context?: Record<string, unknown>;
  explanation?: string;
  detectedAt: string;
}

export interface DriftAlert {
  id: string;
  type: "drift_detected" | "anomaly_detected" | "severe_drift" | "performance_impact";
  severity: DriftSeverity;
  driftType?: DriftType;
  anomalyType?: AnomalyType;
  score: number;
  threshold: number;
  message: string;
  affectedFeatures?: string[];
  impact?: DriftImpact;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  remediationActions?: RemediationAction[];
  createdAt: string;
}

export interface RemediationAction {
  id: string;
  type: "retrain" | "rollback" | "investigate" | "notify" | "custom";
  status: "pending" | "in_progress" | "completed" | "failed";
  description: string;
  assignedTo?: string;
  startedAt?: string;
  completedAt?: string;
  outcome?: string;
}

export interface DriftDetectionPerformance {
  totalDetections: number;
  driftDetections: number;
  anomalyDetections: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  averageDetectionLatencyMs: number;
  alertsTriggered: number;
  alertsAcknowledged: number;
  alertsResolved: number;
  remediationActions: number;
  successfulRemediations: number;
}

export interface DriftHistory {
  id: string;
  jobId: string;
  timestamp: string;
  driftScore: number;
  severity: DriftSeverity;
  type: DriftType;
  features?: string[];
  detected: boolean;
}

export interface DriftForecast {
  jobId: string;
  forecastHorizon: number; // Hours
  predictedDriftScore: number;
  predictedSeverity: DriftSeverity;
  confidence: number;
  trend: "increasing" | "stable" | "decreasing";
  recommendations: string[];
}

export interface DriftDetectionStats {
  totalJobs: number;
  activeJobs: number;
  pausedJobs: number;
  stoppedJobs: number;
  failedJobs: number;
  totalDriftDetections: number;
  totalAnomalyDetections: number;
  averageDriftScore: number;
  driftByType: Record<string, number>;
  driftBySeverity: Record<string, number>;
  anomalyByType: Record<string, number>;
  totalAlerts: number;
  averagePrecision: number;
  averageRecall: number;
  totalRemediationActions: number;
  successfulRemediations: number;
  commonDriftFeatures: Array<{
    feature: string;
    count: number;
  }>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const driftDetectionJobs = new Map<string, DriftDetectionJob>();
const driftHistory = new Map<string, DriftHistory[]>();

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
    driftResults: [],
    anomalyResults: [],
    alerts: [],
    performance: {
      totalDetections: 0,
      driftDetections: 0,
      anomalyDetections: 0,
      falsePositives: 0,
      falseNegatives: 0,
      precision: 0,
      recall: 0,
      averageDetectionLatencyMs: 0,
      alertsTriggered: 0,
      alertsAcknowledged: 0,
      alertsResolved: 0,
      remediationActions: 0,
      successfulRemediations: 0,
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  driftDetectionJobs.set(job.id, job);
  driftHistory.set(job.id, []);
  return job;
}

/**
 * Start drift detection job
 */
export async function startDriftDetectionJob(jobId: string): Promise<DriftDetectionJob | null> {
  const job = driftDetectionJobs.get(jobId);
  if (!job) return null;

  if (job.status !== "pending" && job.status !== "paused" && job.status !== "stopped") {
    throw new Error(`Cannot start job in status: ${job.status}`);
  }

  job.status = "monitoring";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  driftDetectionJobs.set(jobId, job);

  // Start detection loop (simulated)
  startDetectionLoop(jobId);

  return job;
}

/**
 * Pause drift detection job
 */
export async function pauseDriftDetectionJob(jobId: string): Promise<DriftDetectionJob | null> {
  const job = driftDetectionJobs.get(jobId);
  if (!job || job.status !== "monitoring") return null;

  job.status = "paused";
  job.updatedAt = new Date().toISOString();

  driftDetectionJobs.set(jobId, job);
  return job;
}

/**
 * Stop drift detection job
 */
export async function stopDriftDetectionJob(jobId: string): Promise<DriftDetectionJob | null> {
  const job = driftDetectionJobs.get(jobId);
  if (!job) return null;

  if (job.status === "stopped" || job.status === "failed") {
    throw new Error(`Cannot stop job in status: ${job.status}`);
  }

  job.status = "stopped";
  job.stoppedAt = new Date().toISOString();
  job.updatedAt = job.stoppedAt;

  driftDetectionJobs.set(jobId, job);
  return job;
}

/**
 * Get drift detection job by ID
 */
export async function getDriftDetectionJob(jobId: string): Promise<DriftDetectionJob | null> {
  return driftDetectionJobs.get(jobId) ?? null;
}

/**
 * List drift detection jobs
 */
export async function listDriftDetectionJobs(
  organizationId: string,
  filters?: {
    status?: DriftDetectionJobStatus;
    modelId?: string;
    driftType?: DriftType;
    severity?: DriftSeverity;
    limit?: number;
  }
): Promise<DriftDetectionJob[]> {
  let result = Array.from(driftDetectionJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.modelId) result = result.filter(j => j.modelId === filters.modelId);
  if (filters?.driftType) result = result.filter(j => j.driftResults.some(d => d.type === filters.driftType));
  if (filters?.severity) result = result.filter(j => j.driftResults.some(d => d.severity === filters.severity));

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Record data for drift detection
 */
export async function recordDataForDriftDetection(
  jobId: string,
  data: {
    features: Record<string, unknown>;
    prediction?: unknown;
    groundTruth?: unknown;
    timestamp?: string;
  }
): Promise<void> {
  const job = driftDetectionJobs.get(jobId);
  if (!job || job.status !== "monitoring") return;

  // In production, this would accumulate data and trigger detection
  // For simulation, we'll trigger detection periodically
  job.performance.totalDetections++;
  job.updatedAt = new Date().toISOString();

  driftDetectionJobs.set(jobId, job);
}

/**
 * Acknowledge drift alert
 */
export async function acknowledgeDriftAlert(
  jobId: string,
  alertId: string,
  acknowledgedBy: string
): Promise<DriftAlert | null> {
  const job = driftDetectionJobs.get(jobId);
  if (!job) return null;

  const alert = job.alerts.find(a => a.id === alertId);
  if (!alert) return null;

  alert.acknowledged = true;
  alert.acknowledgedBy = acknowledgedBy;
  alert.acknowledgedAt = new Date().toISOString();

  job.performance.alertsAcknowledged++;
  job.updatedAt = alert.acknowledgedAt;

  driftDetectionJobs.set(jobId, job);
  return alert;
}

/**
 * Resolve drift alert
 */
export async function resolveDriftAlert(
  jobId: string,
  alertId: string
): Promise<DriftAlert | null> {
  const job = driftDetectionJobs.get(jobId);
  if (!job) return null;

  const alert = job.alerts.find(a => a.id === alertId);
  if (!alert) return null;

  alert.resolvedAt = new Date().toISOString();
  job.performance.alertsResolved++;
  job.updatedAt = alert.resolvedAt;

  driftDetectionJobs.set(jobId, job);
  return alert;
}

/**
 * Add remediation action to alert
 */
export async function addRemediationAction(
  jobId: string,
  alertId: string,
  action: Omit<RemediationAction, "id" | "status" | "startedAt" | "completedAt">
): Promise<RemediationAction | null> {
  const job = driftDetectionJobs.get(jobId);
  if (!job) return null;

  const alert = job.alerts.find(a => a.id === alertId);
  if (!alert) return null;

  const remediationAction: RemediationAction = {
    ...action,
    id: `remediation_${randomUUID().slice(0, 8)}`,
    status: "pending",
  };

  if (!alert.remediationActions) {
    alert.remediationActions = [];
  }
  alert.remediationActions.push(remediationAction);

  job.performance.remediationActions++;
  job.updatedAt = new Date().toISOString();

  driftDetectionJobs.set(jobId, job);
  return remediationAction;
}

/**
 * Update remediation action status
 */
export async function updateRemediationActionStatus(
  jobId: string,
  alertId: string,
  actionId: string,
  status: RemediationAction["status"],
  outcome?: string
): Promise<RemediationAction | null> {
  const job = driftDetectionJobs.get(jobId);
  if (!job) return null;

  const alert = job.alerts.find(a => a.id === alertId);
  if (!alert || !alert.remediationActions) return null;

  const action = alert.remediationActions.find(a => a.id === actionId);
  if (!action) return null;

  action.status = status;
  if (status === "in_progress" && !action.startedAt) {
    action.startedAt = new Date().toISOString();
  }
  if (status === "completed" || status === "failed") {
    action.completedAt = new Date().toISOString();
    action.outcome = outcome;
    
    if (status === "completed") {
      job.performance.successfulRemediations++;
    }
  }

  job.updatedAt = new Date().toISOString();
  driftDetectionJobs.set(jobId, job);
  return action;
}

/**
 * Get drift history
 */
export async function getDriftHistory(
  jobId: string,
  limit: number = 100
): Promise<DriftHistory[]> {
  const history = driftHistory.get(jobId) ?? [];
  return history.slice(0, limit);
}

/**
 * Forecast drift
 */
export async function forecastDrift(
  jobId: string,
  forecastHorizon: number = 24 // Hours
): Promise<DriftForecast | null> {
  const job = driftDetectionJobs.get(jobId);
  if (!job) return null;

  const history = driftHistory.get(jobId) ?? [];
  if (history.length < 10) return null;

  // Simple linear trend forecasting
  const recentDriftScores = history.slice(-20).map(h => h.driftScore);
  const trend = recentDriftScores[recentDriftScores.length - 1] > recentDriftScores[0] 
    ? "increasing" 
    : recentDriftScores[recentDriftScores.length - 1] < recentDriftScores[0]
    ? "decreasing"
    : "stable";

  const avgDriftScore = recentDriftScores.reduce((a, b) => a + b, 0) / recentDriftScores.length;
  const trendSlope = (recentDriftScores[recentDriftScores.length - 1] - recentDriftScores[0]) / recentDriftScores.length;
  const predictedDriftScore = Math.min(1, Math.max(0, avgDriftScore + trendSlope * forecastHorizon));

  const predictedSeverity = predictedDriftScore > 0.8 ? "critical" :
                            predictedDriftScore > 0.6 ? "high" :
                            predictedDriftScore > 0.4 ? "medium" :
                            predictedDriftScore > 0.2 ? "low" : "none";

  const confidence = Math.max(0.5, 1 - (forecastHorizon / 168)); // Lower confidence for longer forecasts

  const recommendations = [];
  if (trend === "increasing" && predictedSeverity !== "none") {
    recommendations.push("Drift is increasing. Consider proactive retraining.");
  }
  if (predictedSeverity === "high" || predictedSeverity === "critical") {
    recommendations.push("Severe drift predicted. Schedule immediate investigation.");
  }
  if (trend === "stable" && predictedDriftScore > 0.3) {
    recommendations.push("Stable drift detected. Monitor closely.");
  }

  return {
    jobId,
    forecastHorizon,
    predictedDriftScore,
    predictedSeverity,
    confidence,
    trend,
    recommendations,
  };
}

/**
 * Get drift detection statistics
 */
export async function getDriftDetectionStats(organizationId: string): Promise<DriftDetectionStats> {
  const allJobs = Array.from(driftDetectionJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  const activeJobs = allJobs.filter(j => j.status === "monitoring");
  const pausedJobs = allJobs.filter(j => j.status === "paused");
  const stoppedJobs = allJobs.filter(j => j.status === "stopped");
  const failedJobs = allJobs.filter(j => j.status === "failed");

  let totalDriftDetections = 0;
  let totalAnomalyDetections = 0;
  let totalDriftScore = 0;
  let totalAlerts = 0;
  let totalPrecision = 0;
  let totalRecall = 0;
  let totalRemediationActions = 0;
  let successfulRemediations = 0;
  const driftByType: Record<string, number> = {};
  const driftBySeverity: Record<string, number> = {};
  const anomalyByType: Record<string, number> = {};
  const featureCounts: Record<string, number> = {};

  for (const job of allJobs) {
    totalDriftDetections += job.performance.driftDetections;
    totalAnomalyDetections += job.performance.anomalyDetections;
    totalAlerts += job.performance.alertsTriggered;
    totalPrecision += job.performance.precision;
    totalRecall += job.performance.recall;
    totalRemediationActions += job.performance.remediationActions;
    successfulRemediations += job.performance.successfulRemediations;

    for (const drift of job.driftResults) {
      driftByType[drift.type] = (driftByType[drift.type] || 0) + 1;
      driftBySeverity[drift.severity] = (driftBySeverity[drift.severity] || 0) + 1;
      totalDriftScore += drift.score;

      if (drift.features) {
        for (const feature of drift.features) {
          featureCounts[feature] = (featureCounts[feature] || 0) + 1;
        }
      }
    }

    for (const anomaly of job.anomalyResults) {
      anomalyByType[anomaly.type] = (anomalyByType[anomaly.type] || 0) + 1;
    }
  }

  const commonDriftFeatures = Object.entries(featureCounts)
    .map(([feature, count]) => ({ feature, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const monitoredJobs = activeJobs.length + pausedJobs.length;

  return {
    totalJobs: allJobs.length,
    activeJobs: activeJobs.length,
    pausedJobs: pausedJobs.length,
    stoppedJobs: stoppedJobs.length,
    failedJobs: failedJobs.length,
    totalDriftDetections,
    totalAnomalyDetections,
    averageDriftScore: totalDriftDetections > 0 ? totalDriftScore / totalDriftDetections : 0,
    driftByType,
    driftBySeverity,
    anomalyByType,
    totalAlerts,
    averagePrecision: monitoredJobs > 0 ? totalPrecision / monitoredJobs : 0,
    averageRecall: monitoredJobs > 0 ? totalRecall / monitoredJobs : 0,
    totalRemediationActions,
    successfulRemediations,
    commonDriftFeatures,
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

function startDetectionLoop(jobId: string): void {
  const job = driftDetectionJobs.get(jobId);
  if (!job) return;

  // Simulate detection loop (in production, this would be a real loop)
  const driftInterval = setInterval(() => {
    const currentJob = driftDetectionJobs.get(jobId);
    if (!currentJob || currentJob.status !== "monitoring") {
      clearInterval(driftInterval);
      return;
    }

    if (currentJob.config.driftDetection.enabled) {
      performDriftDetection(jobId);
    }
  }, currentJob.config.driftDetection.detectionFrequency * 1000);

  const anomalyInterval = setInterval(() => {
    const currentJob = driftDetectionJobs.get(jobId);
    if (!currentJob || currentJob.status !== "monitoring") {
      clearInterval(anomalyInterval);
      return;
    }

    if (currentJob.config.anomalyDetection.enabled) {
      performAnomalyDetection(jobId);
    }
  }, currentJob.config.anomalyDetection.detectionFrequency * 1000);
}

function performDriftDetection(jobId: string): void {
  const job = driftDetectionJobs.get(jobId);
  if (!job) return;

  // Simulate drift detection
  const driftScore = Math.random();
  const threshold = job.config.driftDetection.thresholds.dataDrift ?? 0.5;
  const detected = driftScore > threshold;

  const severity = driftScore > 0.8 ? "critical" :
                   driftScore > 0.6 ? "high" :
                   driftScore > 0.4 ? "medium" :
                   driftScore > 0.2 ? "low" : "none";

  const driftResult: DriftResult = {
    id: `drift_result_${randomUUID().slice(0, 8)}`,
    type: "data_drift",
    method: "ks_test",
    severity,
    score: driftScore,
    pValue: 1 - driftScore,
    threshold,
    detected,
    baselineStats: {
      sampleSize: job.config.driftDetection.baselineWindow,
      mean: 0.5,
      std: 0.1,
      min: 0,
      max: 1,
      percentiles: { p50: 0.5, p95: 0.8 },
    },
    currentStats: {
      sampleSize: job.config.driftDetection.currentWindow,
      mean: 0.5 + driftScore * 0.3,
      std: 0.1 + driftScore * 0.1,
      min: 0,
      max: 1,
      percentiles: { p50: 0.5 + driftScore * 0.3, p95: 0.8 + driftScore * 0.2 },
    },
    detectedAt: new Date().toISOString(),
  };

  if (detected) {
    driftResult.features = ["feature_1", "feature_2"];
    driftResult.featureDriftScores = { feature_1: driftScore, feature_2: driftScore * 0.8 };
    driftResult.impact = {
      performanceImpact: -driftScore * 0.5,
      accuracyDrop: driftScore * 0.1,
      affectedPredictions: Math.floor(driftScore * 1000),
      businessImpact: severity === "critical" ? "critical" : severity === "high" ? "high" : "medium",
      recommendation: "Retrain model with recent data",
    };
  }

  job.driftResults.push(driftResult);
  job.performance.driftDetections++;

  // Add to history
  const history = driftHistory.get(jobId) ?? [];
  history.push({
    id: `history_${randomUUID().slice(0, 8)}`,
    jobId,
    timestamp: driftResult.detectedAt,
    driftScore,
    severity,
    type: driftResult.type,
    features: driftResult.features,
    detected,
  });
  driftHistory.set(jobId, history.slice(-1000)); // Keep last 1000

  // Trigger alert if needed
  if (detected && job.config.alerting.enabled) {
    const severityOrder: Record<DriftSeverity, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
    const thresholdOrder = severityOrder[job.config.alerting.severityThreshold];
    
    if (severityOrder[severity] >= thresholdOrder) {
      triggerDriftAlert(job, driftResult);
    }
  }

  job.updatedAt = new Date().toISOString();
  driftDetectionJobs.set(jobId, job);
}

function performAnomalyDetection(jobId: string): void {
  const job = driftDetectionJobs.get(jobId);
  if (!job) return;

  // Simulate anomaly detection
  const anomalyScore = Math.random();
  const threshold = job.config.anomalyDetection.thresholds.anomalyScore ?? 0.7;
  const detected = anomalyScore > threshold;

  if (detected) {
    const severity = anomalyScore > 0.9 ? "critical" :
                     anomalyScore > 0.8 ? "high" :
                     anomalyScore > 0.7 ? "medium" : "low";

    const anomalyResult: AnomalyResult = {
      id: `anomaly_result_${randomUUID().slice(0, 8)}`,
      type: "point_anomaly",
      method: "isolation_forest",
      severity,
      score: anomalyScore,
      threshold,
      detected,
      prediction: Math.random(),
      expectedRange: { min: 0, max: 1 },
      detectedAt: new Date().toISOString(),
    };

    job.anomalyResults.push(anomalyResult);
    job.performance.anomalyDetections++;

    // Trigger alert if needed
    if (job.config.alerting.enabled) {
      triggerAnomalyAlert(job, anomalyResult);
    }
  }

  job.updatedAt = new Date().toISOString();
  driftDetectionJobs.set(jobId, job);
}

function triggerDriftAlert(job: DriftDetectionJob, driftResult: DriftResult): void {
  // Check cooldown
  const recentAlert = job.alerts.find(a => 
    a.type === "drift_detected" &&
    a.driftType === driftResult.type &&
    new Date(a.createdAt).getTime() > Date.now() - job.config.alerting.cooldownMinutes * 60 * 1000
  );

  if (recentAlert) return;

  const alert: DriftAlert = {
    id: `alert_${randomUUID().slice(0, 8)}`,
    type: "drift_detected",
    severity: driftResult.severity,
    driftType: driftResult.type,
    score: driftResult.score,
    threshold: driftResult.threshold,
    message: `${driftResult.type} detected with score ${driftResult.score.toFixed(3)} (threshold: ${driftResult.threshold})`,
    affectedFeatures: driftResult.features,
    impact: driftResult.impact,
    acknowledged: false,
    createdAt: new Date().toISOString(),
  };

  job.alerts.push(alert);
  job.performance.alertsTriggered++;
}

function triggerAnomalyAlert(job: DriftDetectionJob, anomalyResult: AnomalyResult): void {
  // Check cooldown
  const recentAlert = job.alerts.find(a => 
    a.type === "anomaly_detected" &&
    new Date(a.createdAt).getTime() > Date.now() - job.config.alerting.cooldownMinutes * 60 * 1000
  );

  if (recentAlert) return;

  const alert: DriftAlert = {
    id: `alert_${randomUUID().slice(0, 8)}`,
    type: "anomaly_detected",
    severity: anomalyResult.severity,
    anomalyType: anomalyResult.type,
    score: anomalyResult.score,
    threshold: anomalyResult.threshold,
    message: `${anomalyResult.type} detected with score ${anomalyResult.score.toFixed(3)} (threshold: ${anomalyResult.threshold})`,
    acknowledged: false,
    createdAt: new Date().toISOString(),
  };

  job.alerts.push(alert);
  job.performance.alertsTriggered++;
}
