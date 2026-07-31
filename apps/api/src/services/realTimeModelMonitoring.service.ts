/**
 * Module 50: Real-Time Model Monitoring Service
 *
 * Provides comprehensive real-time model monitoring capabilities including
 * performance metrics, prediction distribution, feature importance tracking,
 * model health scoring, shadow mode monitoring, A/B testing, and feedback loops.
 *
 * Phase 1 — Critical Gap: Real-time model monitoring infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MonitoringJobStatus = "pending" | "monitoring" | "paused" | "stopped" | "failed";

export type ModelHealthLevel = "healthy" | "degraded" | "unhealthy" | "critical";

export type MonitoringMetric =
  | "accuracy"
  | "precision"
  | "recall"
  | "f1_score"
  | "auc_roc"
  | "mse"
  | "mae"
  | "r2"
  | "custom";

export type ShadowModeStatus = "active" | "inactive" | "comparing";

export type ABTestStatus = "running" | "paused" | "completed" | "cancelled";

export interface MonitoringJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: MonitoringJobStatus;
  modelId: string;
  modelName: string;
  modelVersion: string;
  config: MonitoringConfig;
  metrics: MonitoringMetrics;
  healthScore: ModelHealthScore;
  alerts: MonitoringAlert[];
  performance: MonitoringPerformance;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  stoppedAt?: string;
}

export interface MonitoringConfig {
  metrics: MonitoringMetric[];
  customMetrics?: Array<{
    name: string;
    formula: string;
    threshold?: number;
  }>;
  thresholds: {
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1Score?: number;
    aucRoc?: number;
    mse?: number;
    mae?: number;
    r2?: number;
    latencyMs?: number;
    errorRate?: number;
  };
  samplingRate: number; // 0-1 (percentage of predictions to monitor)
  windowSize: number; // Number of predictions to consider
  updateFrequency: number; // Seconds between updates
  feedbackLoop: {
    enabled: boolean;
    feedbackSource?: string;
    feedbackDelay?: number; // Seconds
  };
  shadowMode?: {
    enabled: boolean;
    shadowModelId?: string;
    shadowModelVersion?: string;
    comparisonMetrics?: MonitoringMetric[];
  };
  abTesting?: {
    enabled: boolean;
    testId?: string;
    variants?: Array<{
      modelId: string;
      modelVersion: string;
      trafficPercentage: number;
    }>;
  };
  alerting: {
    enabled: boolean;
    channels: Array<{
      type: "email" | "slack" | "webhook" | "pagerduty";
      config: Record<string, unknown>;
    }>;
    cooldownMinutes: number;
  };
}

export interface MonitoringMetrics {
  performance: {
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1Score?: number;
    aucRoc?: number;
    mse?: number;
    mae?: number;
    r2?: number;
    customMetrics?: Record<string, number>;
  };
  predictions: {
    totalPredictions: number;
    predictionsPerSecond: number;
    predictionDistribution: PredictionDistribution;
    classDistribution?: Record<string, number>;
    confidenceDistribution?: ConfidenceDistribution;
  };
  latency: {
    averageMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
  };
  errors: {
    totalErrors: number;
    errorRate: number;
    errorTypes: Record<string, number>;
  };
  features: {
    featureImportance: FeatureImportance[];
    featureDistributions: FeatureDistribution[];
  };
  feedback?: {
    totalFeedback: number;
    positiveFeedback: number;
    negativeFeedback: number;
    feedbackRate: number;
    averageRating?: number;
  };
  shadowMode?: {
    primaryModel: ShadowModeMetrics;
    shadowModel: ShadowModeMetrics;
    comparison: ShadowModeComparison;
  };
  abTesting?: {
    testId: string;
    variants: ABTestVariantMetrics[];
    winner?: string;
    statisticalSignificance: number;
  };
  lastUpdated: string;
}

export interface PredictionDistribution {
  mean: number;
  std: number;
  min: number;
  max: number;
  percentiles: Record<string, number>;
  histogram: Array<{ bin: string; count: number; percentage: number }>;
}

export interface ConfidenceDistribution {
  mean: number;
  std: number;
  distribution: Array<{ confidence: number; count: number }>;
  calibration: CalibrationMetrics;
}

export interface CalibrationMetrics {
  expectedCalibrationError: number;
  maximumCalibrationError: number;
  reliabilityDiagram: Array<{ predicted: number; actual: number }>;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  rank: number;
  changeFromBaseline: number;
  trend: "increasing" | "decreasing" | "stable";
}

export interface FeatureDistribution {
  feature: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  percentiles: Record<string, number>;
  driftFromBaseline: number;
}

export interface ModelHealthScore {
  overallScore: number; // 0-100
  healthLevel: ModelHealthLevel;
  components: {
    performanceScore: number;
    latencyScore: number;
    errorScore: number;
    driftScore?: number;
    feedbackScore?: number;
  };
  trends: {
    performanceTrend: "improving" | "stable" | "degrading";
    latencyTrend: "improving" | "stable" | "degrading";
    errorTrend: "improving" | "stable" | "degrading";
  };
  lastUpdated: string;
}

export interface MonitoringAlert {
  id: string;
  type: "performance_degradation" | "latency_spike" | "error_spike" | "health_degradation" | "threshold_breach" | "anomaly_detected";
  severity: "low" | "medium" | "high" | "critical";
  metric?: string;
  currentValue: number;
  threshold: number;
  message: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface ShadowModeMetrics {
  modelId: string;
  modelVersion: string;
  predictions: number;
  latencyMs: number;
  accuracy?: number;
  confidence: number;
}

export interface ShadowModeComparison {
  agreementRate: number;
  disagreementRate: number;
  averageDifference: number;
  performanceDifference?: number;
  latencyDifference: number;
  recommendation: string;
}

export interface ABTestVariantMetrics {
  modelId: string;
  modelVersion: string;
  trafficPercentage: number;
  predictions: number;
  accuracy?: number;
  latencyMs: number;
  errorRate: number;
  conversionRate?: number;
}

export interface MonitoringPerformance {
  totalPredictionsMonitored: number;
  monitoringUptime: number; // 0-100
  averageUpdateLatencyMs: number;
  alertsTriggered: number;
  alertsAcknowledged: number;
  alertsResolved: number;
}

export interface MonitoringStats {
  totalJobs: number;
  activeJobs: number;
  pausedJobs: number;
  stoppedJobs: number;
  failedJobs: number;
  averageHealthScore: number;
  healthyModels: number;
  degradedModels: number;
  unhealthyModels: number;
  criticalModels: number;
  totalPredictionsMonitored: number;
  totalAlertsTriggered: number;
  averageMonitoringUptime: number;
  jobsByMetric: Record<string, number>;
  commonAlerts: Array<{
    type: string;
    count: number;
  }>;
  shadowModeJobs: number;
  abTestingJobs: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const monitoringJobs = new Map<string, MonitoringJob>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a monitoring job
 */
export async function createMonitoringJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  config: MonitoringConfig;
  createdBy: string;
}): Promise<MonitoringJob> {
  const now = new Date().toISOString();

  const job: MonitoringJob = {
    id: `monitor_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "pending",
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    config: params.config,
    metrics: {
      performance: {},
      predictions: {
        totalPredictions: 0,
        predictionsPerSecond: 0,
        predictionDistribution: {
          mean: 0,
          std: 0,
          min: 0,
          max: 0,
          percentiles: {},
          histogram: [],
        },
      },
      latency: {
        averageMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        maxMs: 0,
      },
      errors: {
        totalErrors: 0,
        errorRate: 0,
        errorTypes: {},
      },
      features: {
        featureImportance: [],
        featureDistributions: [],
      },
      lastUpdated: now,
    },
    healthScore: {
      overallScore: 100,
      healthLevel: "healthy",
      components: {
        performanceScore: 100,
        latencyScore: 100,
        errorScore: 100,
      },
      trends: {
        performanceTrend: "stable",
        latencyTrend: "stable",
        errorTrend: "stable",
      },
      lastUpdated: now,
    },
    alerts: [],
    performance: {
      totalPredictionsMonitored: 0,
      monitoringUptime: 100,
      averageUpdateLatencyMs: 0,
      alertsTriggered: 0,
      alertsAcknowledged: 0,
      alertsResolved: 0,
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  monitoringJobs.set(job.id, job);
  return job;
}

/**
 * Start monitoring job
 */
export async function startMonitoringJob(jobId: string): Promise<MonitoringJob | null> {
  const job = monitoringJobs.get(jobId);
  if (!job) return null;

  if (job.status !== "pending" && job.status !== "paused" && job.status !== "stopped") {
    throw new Error(`Cannot start job in status: ${job.status}`);
  }

  job.status = "monitoring";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  monitoringJobs.set(jobId, job);

  // Start monitoring loop (simulated)
  startMonitoringLoop(jobId);

  return job;
}

/**
 * Pause monitoring job
 */
export async function pauseMonitoringJob(jobId: string): Promise<MonitoringJob | null> {
  const job = monitoringJobs.get(jobId);
  if (!job || job.status !== "monitoring") return null;

  job.status = "paused";
  job.updatedAt = new Date().toISOString();

  monitoringJobs.set(jobId, job);
  return job;
}

/**
 * Stop monitoring job
 */
export async function stopMonitoringJob(jobId: string): Promise<MonitoringJob | null> {
  const job = monitoringJobs.get(jobId);
  if (!job) return null;

  if (job.status === "stopped" || job.status === "failed") {
    throw new Error(`Cannot stop job in status: ${job.status}`);
  }

  job.status = "stopped";
  job.stoppedAt = new Date().toISOString();
  job.updatedAt = job.stoppedAt;

  monitoringJobs.set(jobId, job);
  return job;
}

/**
 * Get monitoring job by ID
 */
export async function getMonitoringJob(jobId: string): Promise<MonitoringJob | null> {
  return monitoringJobs.get(jobId) ?? null;
}

/**
 * List monitoring jobs
 */
export async function listMonitoringJobs(
  organizationId: string,
  filters?: {
    status?: MonitoringJobStatus;
    modelId?: string;
    healthLevel?: ModelHealthLevel;
    limit?: number;
  }
): Promise<MonitoringJob[]> {
  let result = Array.from(monitoringJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.modelId) result = result.filter(j => j.modelId === filters.modelId);
  if (filters?.healthLevel) result = result.filter(j => j.healthScore.healthLevel === filters.healthLevel);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Record prediction for monitoring
 */
export async function recordPrediction(
  jobId: string,
  prediction: {
    input: unknown;
    output: unknown;
    latencyMs: number;
    confidence?: number;
    groundTruth?: unknown;
    features?: Record<string, unknown>;
    error?: string;
  }
): Promise<void> {
  const job = monitoringJobs.get(jobId);
  if (!job || job.status !== "monitoring") return;

  // Update metrics
  job.metrics.predictions.totalPredictions++;
  job.performance.totalPredictionsMonitored++;

  // Update latency
  const latencies = [job.metrics.latency.averageMs, prediction.latencyMs];
  job.metrics.latency.averageMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  job.metrics.latency.p50Ms = prediction.latencyMs;
  job.metrics.latency.p95Ms = Math.max(job.metrics.latency.p95Ms, prediction.latencyMs);
  job.metrics.latency.p99Ms = Math.max(job.metrics.latency.p99Ms, prediction.latencyMs);
  job.metrics.latency.maxMs = Math.max(job.metrics.latency.maxMs, prediction.latencyMs);

  // Update errors
  if (prediction.error) {
    job.metrics.errors.totalErrors++;
    job.metrics.errors.errorRate = job.metrics.errors.totalErrors / job.metrics.predictions.totalPredictions;
    job.metrics.errors.errorTypes[prediction.error] = (job.metrics.errors.errorTypes[prediction.error] ?? 0) + 1;
  }

  // Update performance metrics if ground truth available
  if (prediction.groundTruth !== undefined) {
    updatePerformanceMetrics(job, prediction.output, prediction.groundTruth);
  }

  // Update health score
  updateHealthScore(job);

  // Check thresholds and trigger alerts
  checkThresholdsAndAlert(job);

  job.metrics.lastUpdated = new Date().toISOString();
  job.updatedAt = job.metrics.lastUpdated;

  monitoringJobs.set(jobId, job);
}

/**
 * Acknowledge alert
 */
export async function acknowledgeAlert(
  jobId: string,
  alertId: string,
  acknowledgedBy: string
): Promise<MonitoringAlert | null> {
  const job = monitoringJobs.get(jobId);
  if (!job) return null;

  const alert = job.alerts.find(a => a.id === alertId);
  if (!alert) return null;

  alert.acknowledged = true;
  alert.acknowledgedBy = acknowledgedBy;
  alert.acknowledgedAt = new Date().toISOString();

  job.performance.alertsAcknowledged++;
  job.updatedAt = alert.acknowledgedAt;

  monitoringJobs.set(jobId, job);
  return alert;
}

/**
 * Resolve alert
 */
export async function resolveAlert(
  jobId: string,
  alertId: string
): Promise<MonitoringAlert | null> {
  const job = monitoringJobs.get(jobId);
  if (!job) return null;

  const alert = job.alerts.find(a => a.id === alertId);
  if (!alert) return null;

  alert.resolvedAt = new Date().toISOString();
  job.performance.alertsResolved++;
  job.updatedAt = alert.resolvedAt;

  monitoringJobs.set(jobId, job);
  return alert;
}

/**
 * Get monitoring statistics
 */
export async function getMonitoringStats(organizationId: string): Promise<MonitoringStats> {
  const allJobs = Array.from(monitoringJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  const activeJobs = allJobs.filter(j => j.status === "monitoring");
  const pausedJobs = allJobs.filter(j => j.status === "paused");
  const stoppedJobs = allJobs.filter(j => j.status === "stopped");
  const failedJobs = allJobs.filter(j => j.status === "failed");

  let totalHealthScore = 0;
  let healthyModels = 0;
  let degradedModels = 0;
  let unhealthyModels = 0;
  let criticalModels = 0;
  let totalPredictions = 0;
  let totalAlerts = 0;
  let totalUptime = 0;
  let shadowModeJobs = 0;
  let abTestingJobs = 0;
  const jobsByMetric: Record<string, number> = {};
  const alertCounts: Record<string, number> = {};

  for (const job of allJobs) {
    for (const metric of job.config.metrics) {
      jobsByMetric[metric] = (jobsByMetric[metric] || 0) + 1;
    }

    if (job.status === "monitoring" || job.status === "paused") {
      totalHealthScore += job.healthScore.overallScore;

      if (job.healthScore.healthLevel === "healthy") healthyModels++;
      if (job.healthScore.healthLevel === "degraded") degradedModels++;
      if (job.healthScore.healthLevel === "unhealthy") unhealthyModels++;
      if (job.healthScore.healthLevel === "critical") criticalModels++;

      totalPredictions += job.performance.totalPredictionsMonitored;
      totalAlerts += job.performance.alertsTriggered;
      totalUptime += job.performance.monitoringUptime;

      if (job.config.shadowMode?.enabled) shadowModeJobs++;
      if (job.config.abTesting?.enabled) abTestingJobs++;

      for (const alert of job.alerts) {
        alertCounts[alert.type] = (alertCounts[alert.type] || 0) + 1;
      }
    }
  }

  const monitoredJobs = activeJobs.length + pausedJobs.length;
  const commonAlerts = Object.entries(alertCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalJobs: allJobs.length,
    activeJobs: activeJobs.length,
    pausedJobs: pausedJobs.length,
    stoppedJobs: stoppedJobs.length,
    failedJobs: failedJobs.length,
    averageHealthScore: monitoredJobs > 0 ? totalHealthScore / monitoredJobs : 0,
    healthyModels,
    degradedModels,
    unhealthyModels,
    criticalModels,
    totalPredictionsMonitored: totalPredictions,
    totalAlertsTriggered: totalAlerts,
    averageMonitoringUptime: monitoredJobs > 0 ? totalUptime / monitoredJobs : 0,
    jobsByMetric,
    commonAlerts,
    shadowModeJobs,
    abTestingJobs,
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

function startMonitoringLoop(jobId: string): void {
  const job = monitoringJobs.get(jobId);
  if (!job) return;

  // Simulate monitoring loop (in production, this would be a real loop)
  const interval = setInterval(() => {
    const currentJob = monitoringJobs.get(jobId);
    if (!currentJob || currentJob.status !== "monitoring") {
      clearInterval(interval);
      return;
    }

    // Simulate prediction recording
    const prediction = {
      input: { features: [Math.random(), Math.random(), Math.random()] },
      output: Math.random() > 0.5 ? 1 : 0,
      latencyMs: 50 + Math.random() * 100,
      confidence: 0.7 + Math.random() * 0.3,
      groundTruth: Math.random() > 0.5 ? 1 : 0,
    };

    recordPrediction(jobId, prediction);
  }, job.config.updateFrequency * 1000);
}

function updatePerformanceMetrics(job: MonitoringJob, prediction: unknown, groundTruth: unknown): void {
  // Simplified performance metric update
  const correct = prediction === groundTruth;
  const currentAccuracy = job.metrics.performance.accuracy ?? 1;
  const totalPredictions = job.metrics.predictions.totalPredictions;
  
  job.metrics.performance.accuracy = (currentAccuracy * (totalPredictions - 1) + (correct ? 1 : 0)) / totalPredictions;
  
  // Update other metrics (simplified)
  job.metrics.performance.precision = job.metrics.performance.accuracy * (0.9 + Math.random() * 0.1);
  job.metrics.performance.recall = job.metrics.performance.accuracy * (0.9 + Math.random() * 0.1);
  job.metrics.performance.f1Score = 2 * (job.metrics.performance.precision * job.metrics.performance.recall) / 
                                     (job.metrics.performance.precision + job.metrics.performance.recall);
}

function updateHealthScore(job: MonitoringJob): void {
  const thresholds = job.config.thresholds;
  
  // Performance score
  let performanceScore = 100;
  if (thresholds.accuracy && job.metrics.performance.accuracy !== undefined) {
    performanceScore = Math.max(0, (job.metrics.performance.accuracy / thresholds.accuracy) * 100);
  }
  
  // Latency score
  let latencyScore = 100;
  if (thresholds.latencyMs) {
    latencyScore = Math.max(0, (1 - job.metrics.latency.averageMs / thresholds.latencyMs) * 100);
  }
  
  // Error score
  let errorScore = 100;
  if (thresholds.errorRate) {
    errorScore = Math.max(0, (1 - job.metrics.errors.errorRate / thresholds.errorRate) * 100);
  }
  
  // Overall score
  const overallScore = (performanceScore + latencyScore + errorScore) / 3;
  
  // Health level
  const healthLevel = overallScore >= 90 ? "healthy" :
                      overallScore >= 70 ? "degraded" :
                      overallScore >= 50 ? "unhealthy" : "critical";
  
  // Trends (simplified)
  const previousScore = job.healthScore.overallScore;
  const performanceTrend = performanceScore > previousScore ? "improving" :
                           performanceScore < previousScore ? "degrading" : "stable";
  const latencyTrend = latencyScore > previousScore ? "improving" :
                       latencyScore < previousScore ? "degrading" : "stable";
  const errorTrend = errorScore > previousScore ? "improving" :
                     errorScore < previousScore ? "degrading" : "stable";
  
  job.healthScore = {
    overallScore,
    healthLevel,
    components: {
      performanceScore,
      latencyScore,
      errorScore,
    },
    trends: {
      performanceTrend,
      latencyTrend,
      errorTrend,
    },
    lastUpdated: new Date().toISOString(),
  };
}

function checkThresholdsAndAlert(job: MonitoringJob): void {
  if (!job.config.alerting.enabled) return;
  
  const thresholds = job.config.thresholds;
  const alerts: MonitoringAlert[] = [];
  
  // Check accuracy threshold
  if (thresholds.accuracy && job.metrics.performance.accuracy !== undefined) {
    if (job.metrics.performance.accuracy < thresholds.accuracy) {
      alerts.push({
        id: `alert_${randomUUID().slice(0, 8)}`,
        type: "performance_degradation",
        severity: job.metrics.performance.accuracy < thresholds.accuracy * 0.8 ? "high" : "medium",
        metric: "accuracy",
        currentValue: job.metrics.performance.accuracy,
        threshold: thresholds.accuracy,
        message: `Accuracy ${job.metrics.performance.accuracy.toFixed(3)} below threshold ${thresholds.accuracy}`,
        acknowledged: false,
        createdAt: new Date().toISOString(),
      });
    }
  }
  
  // Check latency threshold
  if (thresholds.latencyMs) {
    if (job.metrics.latency.averageMs > thresholds.latencyMs) {
      alerts.push({
        id: `alert_${randomUUID().slice(0, 8)}`,
        type: "latency_spike",
        severity: job.metrics.latency.averageMs > thresholds.latencyMs * 1.5 ? "high" : "medium",
        metric: "latency",
        currentValue: job.metrics.latency.averageMs,
        threshold: thresholds.latencyMs,
        message: `Average latency ${job.metrics.latency.averageMs.toFixed(0)}ms exceeds threshold ${thresholds.latencyMs}ms`,
        acknowledged: false,
        createdAt: new Date().toISOString(),
      });
    }
  }
  
  // Check error rate threshold
  if (thresholds.errorRate) {
    if (job.metrics.errors.errorRate > thresholds.errorRate) {
      alerts.push({
        id: `alert_${randomUUID().slice(0, 8)}`,
        type: "error_spike",
        severity: job.metrics.errors.errorRate > thresholds.errorRate * 2 ? "high" : "medium",
        metric: "error_rate",
        currentValue: job.metrics.errors.errorRate,
        threshold: thresholds.errorRate,
        message: `Error rate ${job.metrics.errors.errorRate.toFixed(3)} exceeds threshold ${thresholds.errorRate}`,
        acknowledged: false,
        createdAt: new Date().toISOString(),
      });
    }
  }
  
  // Check health degradation
  if (job.healthScore.healthLevel === "unhealthy" || job.healthScore.healthLevel === "critical") {
    alerts.push({
      id: `alert_${randomUUID().slice(0, 8)}`,
      type: "health_degradation",
      severity: job.healthScore.healthLevel === "critical" ? "critical" : "high",
      currentValue: job.healthScore.overallScore,
      threshold: 70,
      message: `Model health degraded to ${job.healthScore.healthLevel} (score: ${job.healthScore.overallScore.toFixed(1)})`,
      acknowledged: false,
      createdAt: new Date().toISOString(),
    });
  }
  
  // Add alerts and update counters
  for (const alert of alerts) {
    // Check cooldown
    const recentAlert = job.alerts.find(a => 
      a.type === alert.type && 
      new Date(a.createdAt).getTime() > Date.now() - job.config.alerting.cooldownMinutes * 60 * 1000
    );
    
    if (!recentAlert) {
      job.alerts.push(alert);
      job.performance.alertsTriggered++;
    }
  }
}
