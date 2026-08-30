/**
 * Module 57: AI Performance Regression Detection Service
 *
 * Provides automated performance regression detection for AI models and systems including
 * statistical regression detection across benchmark runs, trend analysis and degradation
 * pattern recognition, regression severity classification, change attribution and
 * bisection support, and regression alerting with notification integration.
 *
 * Phase 1 — Critical Gap: Automated AI performance regression detection and analysis
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiPerformanceRegression');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type RegressionSeverity = "critical" | "major" | "minor" | "info";

export type RegressionStatus = "detected" | "investigating" | "confirmed" | "resolved" | "false-positive" | "acknowledged";

export type RegressionType = "latency-regression" | "throughput-regression" | "memory-regression" | "accuracy-regression" | "stability-regression" | "cold-start-regression" | "scalability-regression";

export type TrendDirection = "improving" | "stable" | "degrading" | "oscillating" | "step-change";

export type DetectionMethod = "threshold" | "statistical" | "trend-analysis" | "anomaly-detection" | "moving-average" | "cusum" | "mann-kendall";

export interface RegressionDetectionConfig {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  enabled: boolean;
  targetModel: RegressionTarget;
  monitoredMetrics: MonitoredMetric[];
  detectionMethods: DetectionMethodConfig[];
  baselineConfig: BaselineConfig;
  alertConfig: AlertConfig;
  schedule: string;
  lastRunAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegressionTarget {
  modelId: string;
  modelName: string;
  modelVersion?: string;
  endpoint?: string;
  benchmarkSuiteId?: string;
}

export interface MonitoredMetric {
  id: string;
  name: string;
  metricPath: string;
  unit: string;
  higherIsBetter: boolean;
  baselineValue?: number;
  thresholds: { warning: number; critical: number };
  weight: number;
}

export interface DetectionMethodConfig {
  method: DetectionMethod;
  enabled: boolean;
  config: Record<string, unknown>;
  sensitivity: "low" | "medium" | "high";
}

export interface BaselineConfig {
  type: "fixed" | "rolling" | "best-ever" | "previous-release" | "custom";
  windowSize?: number;
  fixedValues?: Record<string, number>;
  benchmarkSuiteId?: string;
  updatedAt?: string;
}

export interface AlertConfig {
  enabled: boolean;
  channels: Array<"email" | "slack" | "webhook" | "pagerduty">;
  minSeverity: RegressionSeverity;
  cooldownMinutes: number;
  escalationAfterMinutes: number;
  recipients: string[];
}

export interface PerformanceRegression {
  id: string;
  organizationId: string;
  configId: string;
  type: RegressionType;
  severity: RegressionSeverity;
  status: RegressionStatus;
  targetModel: RegressionTarget;
  metric: RegressionMetric;
  detectionInfo: DetectionInfo;
  trendAnalysis: TrendAnalysis;
  attribution: RegressionAttribution;
  impactAssessment: ImpactAssessment;
  resolution?: RegressionResolution;
  relatedRegressions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RegressionMetric {
  name: string;
  metricPath: string;
  unit: string;
  baselineValue: number;
  currentValue: number;
  changeAbsolute: number;
  changePercent: number;
  higherIsBetter: boolean;
}

export interface DetectionInfo {
  method: DetectionMethod;
  detectedAt: string;
  confidenceScore: number;
  statisticalDetails: {
    pValue?: number;
    zScore?: number;
    effectSize?: number;
    controlLimits?: { upper: number; lower: number };
    windowSize: number;
    sampleCount: number;
  };
  falsePositiveLikelihood: number;
  previousDetections: number;
}

export interface TrendAnalysis {
  direction: TrendDirection;
  trendStrength: number;
  dataPoints: Array<{ timestamp: string; value: number; expected: number }>;
  movingAverage: number[];
  predictedNextValues: Array<{ timestamp: string; predicted: number; lowerBound: number; upperBound: number }>;
  seasonalityDetected: boolean;
  seasonalityPeriod?: number;
  changePointDetected: boolean;
  changePointTimestamp?: string;
}

export interface RegressionAttribution {
  probableCauses: ProbableCause[];
  recentChanges: RecentChange[];
  bisectionResult?: BisectionResult;
  correlatedEvents: CorrelatedEvent[];
  confidence: number;
}

export interface ProbableCause {
  category: "model-change" | "infrastructure-change" | "data-drift" | "dependency-update" | "configuration-change" | "traffic-pattern" | "resource-contention" | "external-factor";
  description: string;
  likelihood: number;
  evidence: string[];
}

export interface RecentChange {
  id: string;
  type: "deployment" | "config" | "infrastructure" | "dependency" | "data" | "model";
  description: string;
  timestamp: string;
  author?: string;
  correlationScore: number;
}

export interface BisectionResult {
  startCommit?: string;
  endCommit?: string;
  firstBadCommit?: string;
  stepsPerformed: number;
  totalStepsNeeded: number;
  status: "in-progress" | "completed" | "inconclusive";
  testedPoints: Array<{ commit: string; passed: boolean; value: number }>;
}

export interface CorrelatedEvent {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  correlationScore: number;
  source: string;
}

export interface ImpactAssessment {
  affectedUsers: number;
  affectedRequestsPerMinute: number;
  estimatedCostImpactPerHour: number;
  slaViolationRisk: number;
  cascadingEffects: string[];
  businessImpactDescription: string;
}

export interface RegressionResolution {
  resolvedAt: string;
  resolvedBy: string;
  resolutionType: "fix-deployed" | "rollback" | "config-revert" | "infrastructure-change" | "false-positive" | "accepted-risk";
  description: string;
  fixCommitId?: string;
  timeToDetect: number;
  timeToResolve: number;
  lessonsLearned?: string;
}

export interface RegressionDetectionRun {
  id: string;
  configId: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  metricsAnalyzed: number;
  regressionsDetected: number;
  falsePositivesIdentified: number;
  newRegressions: string[];
  resolvedRegressions: string[];
}

export interface RegressionStats {
  totalRegressions: number;
  openRegressions: number;
  resolvedRegressions: number;
  averageTimeToDetectMinutes: number;
  averageTimeToResolveMinutes: number;
  regressionsBySeverity: Record<string, number>;
  regressionsByType: Record<string, number>;
  regressionsByStatus: Record<string, number>;
  topProbableCauses: Record<string, number>;
  falsePositiveRate: number;
  trendOverTime: Array<{ period: string; count: number }>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const configs = new Map<string, RegressionDetectionConfig>();
const regressions = new Map<string, PerformanceRegression>();
const detectionRuns = new Map<string, RegressionDetectionRun>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a regression detection configuration
 */
export async function createRegressionDetectionConfig(params: {
  organizationId: string;
  name: string;
  description?: string;
  targetModel: RegressionTarget;
  monitoredMetrics: Omit<MonitoredMetric, "id">[];
  detectionMethods: DetectionMethodConfig[];
  baselineConfig: BaselineConfig;
  alertConfig: AlertConfig;
  schedule?: string;
  createdBy: string;
}): Promise<RegressionDetectionConfig> {
  const now = new Date().toISOString();

  const config: RegressionDetectionConfig = {
    id: `rdc_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    enabled: true,
    targetModel: params.targetModel,
    monitoredMetrics: params.monitoredMetrics.map(m => ({ ...m, id: `mm_${randomUUID().replace(/-/g, "").slice(0, 12)}` })),
    detectionMethods: params.detectionMethods,
    baselineConfig: params.baselineConfig,
    alertConfig: params.alertConfig,
    schedule: params.schedule ?? "*/15 * * * *",
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  configs.set(config.id, config);
  return config;
}

/**
 * Run regression detection for a configuration
 */
export async function runRegressionDetection(configId: string): Promise<RegressionDetectionRun | null> {
  const config = configs.get(configId);
  if (!config || !config.enabled) return null;

  const run: RegressionDetectionRun = {
    id: `rdr_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    configId,
    status: "running",
    startedAt: new Date().toISOString(),
    metricsAnalyzed: 0,
    regressionsDetected: 0,
    falsePositivesIdentified: 0,
    newRegressions: [],
    resolvedRegressions: [],
  };

  detectionRuns.set(run.id, run);

  setTimeout(() => executeRegressionDetection(config, run), 100);
  return run;
}

/**
 * Get regression by ID
 */
export async function getRegression(regressionId: string): Promise<PerformanceRegression | null> {
  return regressions.get(regressionId) ?? null;
}

/**
 * List regressions for an organization
 */
export async function listRegressions(
  organizationId: string,
  filters?: { severity?: RegressionSeverity; status?: RegressionStatus; type?: RegressionType; limit?: number },
): Promise<PerformanceRegression[]> {
  let result = Array.from(regressions.values()).filter(r => r.organizationId === organizationId);
  if (filters?.severity) result = result.filter(r => r.severity === filters.severity);
  if (filters?.status) result = result.filter(r => r.status === filters.status);
  if (filters?.type) result = result.filter(r => r.type === filters.type);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, filters?.limit ?? 50);
}

/**
 * Update regression status
 */
export async function updateRegressionStatus(params: {
  regressionId: string;
  status: RegressionStatus;
  resolvedBy?: string;
  resolutionType?: RegressionResolution["resolutionType"];
  description?: string;
}): Promise<PerformanceRegression | null> {
  const reg = regressions.get(params.regressionId);
  if (!reg) return null;

  reg.status = params.status;
  reg.updatedAt = new Date().toISOString();

  if (params.status === "resolved" && params.resolvedBy) {
    reg.resolution = {
      resolvedAt: reg.updatedAt,
      resolvedBy: params.resolvedBy,
      resolutionType: params.resolutionType ?? "fix-deployed",
      description: params.description ?? "",
      timeToDetect: 0,
      timeToResolve: Math.round((new Date(reg.updatedAt).getTime() - new Date(reg.createdAt).getTime()) / 60000),
    };
  }

  regressions.set(params.regressionId, reg);
  return reg;
}

/**
 * Run bisection to identify the exact change causing a regression
 */
export async function runRegressionBisection(params: {
  regressionId: string;
  startCommit: string;
  endCommit: string;
  testConfig: { metricPath: string; threshold: number; higherIsBetter: boolean };
}): Promise<BisectionResult | null> {
  const reg = regressions.get(params.regressionId);
  if (!reg) return null;

  const totalSteps = Math.ceil(Math.log2(10)); // Simulating ~10 commits
  const testedPoints: BisectionResult["testedPoints"] = [];

  // Simulate bisection steps
  for (let step = 0; step < Math.min(totalSteps, 4); step++) {
    const passed = step < 2;
    testedPoints.push({
      commit: `commit_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
      passed,
      value: passed ? params.testConfig.threshold * 0.95 : params.testConfig.threshold * 1.15,
    });
  }

  const result: BisectionResult = {
    startCommit: params.startCommit,
    endCommit: params.endCommit,
    firstBadCommit: `commit_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
    stepsPerformed: testedPoints.length,
    totalStepsNeeded: totalSteps,
    status: testedPoints.length >= totalSteps ? "completed" : "in-progress",
    testedPoints,
  };

  reg.attribution.bisectionResult = result;
  reg.updatedAt = new Date().toISOString();
  regressions.set(params.regressionId, reg);
  return result;
}

/**
 * Get regression detection statistics
 */
export async function getRegressionStats(organizationId: string): Promise<RegressionStats> {
  const all = Array.from(regressions.values()).filter(r => r.organizationId === organizationId);
  const open = all.filter(r => ["detected", "investigating", "confirmed"].includes(r.status));
  const resolved = all.filter(r => r.status === "resolved");

  let totalTTD = 0;
  let totalTTR = 0;
  let falsePositives = 0;
  const bySeverity: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const topCauses: Record<string, number> = {};

  for (const r of all) {
    bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
    byType[r.type] = (byType[r.type] || 0) + 1;
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (r.status === "false-positive") falsePositives++;
    if (r.resolution) {
      totalTTR += r.resolution.timeToResolve;
      totalTTD += r.resolution.timeToDetect;
    }
    for (const cause of r.attribution.probableCauses) {
      topCauses[cause.category] = (topCauses[cause.category] || 0) + 1;
    }
  }

  return {
    totalRegressions: all.length,
    openRegressions: open.length,
    resolvedRegressions: resolved.length,
    averageTimeToDetectMinutes: resolved.length > 0 ? Math.round(totalTTD / resolved.length) : 0,
    averageTimeToResolveMinutes: resolved.length > 0 ? Math.round(totalTTR / resolved.length) : 0,
    regressionsBySeverity: bySeverity,
    regressionsByType: byType,
    regressionsByStatus: byStatus,
    topProbableCauses: topCauses,
    falsePositiveRate: all.length > 0 ? Math.round((falsePositives / all.length) * 10000) / 100 : 0,
    trendOverTime: generateTrendOverTime(all),
  };
}

/**
 * Get detection run by ID
 */
export async function getDetectionRun(runId: string): Promise<RegressionDetectionRun | null> {
  return detectionRuns.get(runId) ?? null;
}

// ─── Internal: Regression Detection ───────────────────────────────────────────

async function executeRegressionDetection(config: RegressionDetectionConfig, run: RegressionDetectionRun): Promise<void> {
  try {
    run.metricsAnalyzed = config.monitoredMetrics.length;
    let detectedCount = 0;

    for (const metric of config.monitoredMetrics) {
      const enabledMethods = config.detectionMethods.filter(m => m.enabled);
      for (const methodConfig of enabledMethods) {
        const regression = detectRegression(config, metric, methodConfig);
        if (regression) {
          regressions.set(regression.id, regression);
          run.newRegressions.push(regression.id);
          detectedCount++;
        }
      }
    }

    // Check for resolved regressions
    const openRegressions = Array.from(regressions.values()).filter(
      r => r.organizationId === config.organizationId && r.configId === config.id && ["detected", "investigating", "confirmed"].includes(r.status),
    );
    for (const reg of openRegressions) {
      const metric = config.monitoredMetrics.find(m => m.metricPath === reg.metric.metricPath);
      if (metric) {
        const currentValue = generateCurrentValue(metric, config.baselineConfig);
        const isResolved = metric.higherIsBetter ? currentValue >= metric.baselineValue! * 0.95 : currentValue <= metric.baselineValue! * 1.05;
        if (isResolved) {
          reg.status = "resolved";
          reg.resolution = {
            resolvedAt: new Date().toISOString(),
            resolvedBy: "auto-detection",
            resolutionType: "fix-deployed",
            description: "Metric returned to baseline range",
            timeToDetect: 0,
            timeToResolve: Math.round((Date.now() - new Date(reg.createdAt).getTime()) / 60000),
          };
          regressions.set(reg.id, reg);
          run.resolvedRegressions.push(reg.id);
        }
      }
    }

    run.regressionsDetected = detectedCount;
    run.status = "completed";
    run.completedAt = new Date().toISOString();
    detectionRuns.set(run.id, run);

    config.lastRunAt = run.completedAt;
    config.updatedAt = run.completedAt;
    configs.set(config.id, config);
  } catch (error) {
    run.status = "failed";
    run.completedAt = new Date().toISOString();
    detectionRuns.set(run.id, run);
  }
}

function detectRegression(config: RegressionDetectionConfig, metric: MonitoredMetric, methodConfig: DetectionMethodConfig): PerformanceRegression | null {
  const baseline = metric.baselineValue ?? 100;
  const currentValue = generateCurrentValue(metric, config.baselineConfig);
  const changeAbsolute = currentValue - baseline;
  const changePercent = (changeAbsolute / baseline) * 100;

  // For higherIsBetter metrics, negative change is regression
  // For !higherIsBetter metrics, positive change is regression
  const isRegression = metric.higherIsBetter ? changePercent < -metric.thresholds.warning : changePercent > metric.thresholds.warning;
  if (!isRegression) return null;

  const isCritical = metric.higherIsBetter ? changePercent < -metric.thresholds.critical : changePercent > metric.thresholds.critical;

  // Generate detection info based on method
  const confidence = 0.6 + _rng.next() * 0.35;
  const pValue = _rng.next() * 0.05;
  const zScore = 2 + _rng.next() * 3;

  // Determine severity
  const severity: RegressionSeverity = isCritical ? "critical" : Math.abs(changePercent) > metric.thresholds.warning * 1.5 ? "major" : Math.abs(changePercent) > metric.thresholds.warning ? "minor" : "info";

  // Determine regression type
  const typeMap: Record<string, RegressionType> = {
    latency: "latency-regression",
    throughput: "throughput-regression",
    memory: "memory-regression",
    accuracy: "accuracy-regression",
    stability: "stability-regression",
    cold_start: "cold-start-regression",
    scalability: "scalability-regression",
  };
  const typeKey = metric.name.toLowerCase().split("_")[0].split(" ")[0];
  const type: RegressionType = typeMap[typeKey] ?? "latency-regression";

  // Generate trend data
  const dataPoints: TrendAnalysis["dataPoints"] = [];
  for (let i = 20; i >= 0; i--) {
    const ts = new Date(Date.now() - i * 3600000).toISOString();
    const drift = i < 5 ? changeAbsolute * (1 - i / 5) : 0;
    const value = baseline + drift + (_rng.next() - 0.5) * baseline * 0.05;
    dataPoints.push({ timestamp: ts, value: Math.round(value * 100) / 100, expected: baseline });
  }

  const regression: PerformanceRegression = {
    id: `reg_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: config.organizationId,
    configId: config.id,
    type,
    severity,
    status: "detected",
    targetModel: config.targetModel,
    metric: {
      name: metric.name,
      metricPath: metric.metricPath,
      unit: metric.unit,
      baselineValue: baseline,
      currentValue: Math.round(currentValue * 100) / 100,
      changeAbsolute: Math.round(changeAbsolute * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      higherIsBetter: metric.higherIsBetter,
    },
    detectionInfo: {
      method: methodConfig.method,
      detectedAt: new Date().toISOString(),
      confidenceScore: Math.round(confidence * 100) / 100,
      statisticalDetails: {
        pValue: Math.round(pValue * 10000) / 10000,
        zScore: Math.round(zScore * 100) / 100,
        effectSize: Math.round(Math.abs(changePercent) / 100 * 100) / 100,
        controlLimits: { upper: baseline * 1.1, lower: baseline * 0.9 },
        windowSize: 20,
        sampleCount: 21,
      },
      falsePositiveLikelihood: Math.round((1 - confidence) * 100) / 100,
      previousDetections: Math.floor(_rng.next() * 3),
    },
    trendAnalysis: {
      direction: isCritical ? "degrading" : Math.abs(changePercent) > 5 ? "degrading" : "step-change",
      trendStrength: Math.min(1, Math.abs(changePercent) / 20),
      dataPoints,
      movingAverage: dataPoints.slice(-5).map(d => d.value),
      predictedNextValues: [
        { timestamp: new Date(Date.now() + 3600000).toISOString(), predicted: Math.round(currentValue * 1.02 * 100) / 100, lowerBound: Math.round(currentValue * 0.98 * 100) / 100, upperBound: Math.round(currentValue * 1.06 * 100) / 100 },
        { timestamp: new Date(Date.now() + 7200000).toISOString(), predicted: Math.round(currentValue * 1.04 * 100) / 100, lowerBound: Math.round(currentValue * 0.96 * 100) / 100, upperBound: Math.round(currentValue * 1.12 * 100) / 100 },
      ],
      seasonalityDetected: _rng.next() > 0.7,
      seasonalityPeriod: _rng.next() > 0.7 ? 24 : undefined,
      changePointDetected: true,
      changePointTimestamp: new Date(Date.now() - 3 * 3600000).toISOString(),
    },
    attribution: generateAttribution(type, changePercent),
    impactAssessment: generateImpactAssessment(severity, type, changePercent),
    relatedRegressions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return regression;
}

function generateCurrentValue(metric: MonitoredMetric, baselineConfig: BaselineConfig): number {
  const baseline = metric.baselineValue ?? 100;
  const drift = (_rng.next() - 0.3) * baseline * 0.25;
  return baseline + drift;
}

function generateAttribution(type: RegressionType, changePercent: number): RegressionAttribution {
  const causes: ProbableCause[] = [];
  const changes: RecentChange[] = [];
  const events: CorrelatedEvent[] = [];

  const causeOptions: Array<{ category: ProbableCause["category"]; description: string; evidence: string[] }> = [
    { category: "model-change", description: "Recent model version update may have introduced performance regression", evidence: ["Model version changed within last 24h", "New model weights deployed", "Inference graph modified"] },
    { category: "infrastructure-change", description: "Infrastructure scaling or configuration change affecting performance", evidence: ["GPU instance type changed", "Auto-scaling policy modified", "Network configuration updated"] },
    { category: "data-drift", description: "Input data distribution shift causing degraded model performance", evidence: ["Input feature statistics changed", "Prediction distribution shifted", "Data quality metrics declined"] },
    { category: "configuration-change", description: "Runtime configuration change affecting inference performance", evidence: ["Batch size configuration modified", "Timeout settings changed", "Thread pool size adjusted"] },
    { category: "resource-contention", description: "Resource contention from co-located workloads or services", evidence: ["CPU throttling detected", "Memory pressure increased", "I/O wait times elevated"] },
  ];

  const selectedCauses = causeOptions.slice(0, 2 + Math.floor(_rng.next() * 2));
  for (const c of selectedCauses) {
    causes.push({ category: c.category, description: c.description, likelihood: 0.3 + _rng.next() * 0.5, evidence: c.evidence });
  }

  // Generate recent changes
  const changeTypes: RecentChange["type"][] = ["deployment", "config", "infrastructure", "model"];
  for (let i = 0; i < 2 + Math.floor(_rng.next() * 3); i++) {
    changes.push({
      id: `chg_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: changeTypes[Math.floor(_rng.next() * changeTypes.length)],
      description: `Recent ${changeTypes[i % changeTypes.length]} change detected`,
      timestamp: new Date(Date.now() - Math.floor(_rng.next() * 24) * 3600000).toISOString(),
      author: ["alice", "bob", "ci-pipeline", "auto-scaler"][Math.floor(_rng.next() * 4)],
      correlationScore: Math.round(_rng.next() * 100) / 100,
    });
  }

  // Generate correlated events
  events.push({
    id: `evt_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    type: "deployment",
    description: "Model deployment completed",
    timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
    correlationScore: 0.7 + _rng.next() * 0.25,
    source: "deployment-service",
  });

  return {
    probableCauses: causes.sort((a, b) => b.likelihood - a.likelihood),
    recentChanges: changes.sort((a, b) => b.correlationScore - a.correlationScore),
    correlatedEvents: events,
    confidence: 0.5 + _rng.next() * 0.4,
  };
}

function generateImpactAssessment(severity: RegressionSeverity, type: RegressionType, changePercent: number): ImpactAssessment {
  const severityFactor = { critical: 4, major: 2.5, minor: 1, info: 0.5 };
  const factor = severityFactor[severity];

  return {
    affectedUsers: Math.round(100 * factor * (1 + _rng.next())),
    affectedRequestsPerMinute: Math.round(50 * factor * (1 + _rng.next())),
    estimatedCostImpactPerHour: Math.round(10 * factor * (1 + _rng.next()) * 100) / 100,
    slaViolationRisk: severity === "critical" ? 0.9 + _rng.next() * 0.1 : severity === "major" ? 0.5 + _rng.next() * 0.3 : 0.1 + _rng.next() * 0.3,
    cascadingEffects: type === "latency-regression" ? ["Increased queue depth", "Timeout errors for downstream services", "SLA breach risk"] : type === "throughput-regression" ? ["Request queuing", "User-facing delays", "Auto-scaling trigger"] : ["Resource waste", "Cost increase"],
    businessImpactDescription: severity === "critical" ? "Critical performance degradation affecting core user experience" : severity === "major" ? "Significant performance impact requiring immediate attention" : "Minor performance degradation within acceptable limits",
  };
}

function generateTrendOverTime(all: PerformanceRegression[]): RegressionStats["trendOverTime"] {
  const periods: Record<string, number> = {};
  for (const r of all) {
    const date = new Date(r.createdAt);
    const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    periods[period] = (periods[period] || 0) + 1;
  }
  return Object.entries(periods).sort().map(([period, count]) => ({ period, count }));
}
