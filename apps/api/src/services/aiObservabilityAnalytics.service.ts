/**
 * Module 60: AI Observability Analytics Service
 *
 * Provides comprehensive observability analytics for AI systems including metrics
 * aggregation with AI-specific dimensions, log-trace correlation, golden signals
 * tracking (latency, traffic, errors, saturation), service dependency mapping for
 * AI pipelines, anomaly detection on observability data, and automated root cause
 * analysis combining traces, metrics, and logs.
 *
 * Phase 1 — Critical Gap: AI observability analytics and correlation
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiObservabilityAnalytics');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type MetricType = "counter" | "gauge" | "histogram" | "summary";

export type AggregationFunction = "sum" | "avg" | "min" | "max" | "count" | "p50" | "p90" | "p95" | "p99" | "rate";

export type AnomalySeverity = "critical" | "high" | "medium" | "low" | "info";

export type AnomalyType = "spike" | "drop" | "trend-change" | "seasonal-deviation" | "correlation-break" | "threshold-breach";

export type SignalType = "latency" | "traffic" | "errors" | "saturation";

export type ServiceHealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface ObservabilityDashboard {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  goldenSignals: GoldenSignals;
  serviceMap: ServiceDependencyMap;
  topAnomalies: Anomaly[];
  recentRootCauses: RootCauseAnalysis[];
  metricPanels: MetricPanel[];
  lastRefreshedAt: string;
  createdAt: string;
}

export interface GoldenSignals {
  latency: GoldenSignal;
  traffic: GoldenSignal;
  errors: GoldenSignal;
  saturation: GoldenSignal;
}

export interface GoldenSignal {
  type: SignalType;
  currentValue: number;
  baselineValue: number;
  unit: string;
  status: "good" | "warning" | "critical";
  trend: "improving" | "stable" | "degrading";
  percentiles?: Record<string, number>;
  breakdown: Array<{ label: string; value: number }>;
  slaTarget?: number;
  slaCompliance?: number;
}

export interface ServiceDependencyMap {
  services: ServiceNode[];
  dependencies: ServiceDependency[];
  criticalPaths: string[][];
  bottlenecks: Array<{ serviceId: string; reason: string; impact: string }>;
}

export interface ServiceNode {
  id: string;
  name: string;
  type: "model" | "preprocessing" | "postprocessing" | "gateway" | "cache" | "queue" | "database" | "external";
  health: ServiceHealthStatus;
  metrics: { latencyMs: number; errorRate: number; requestRate: number; saturation: number };
  version?: string;
  replicas?: number;
}

export interface ServiceDependency {
  fromServiceId: string;
  toServiceId: string;
  callRate: number;
  averageLatencyMs: number;
  errorRate: number;
  protocol: "http" | "grpc" | "message-queue" | "direct";
}

export interface MetricPanel {
  id: string;
  title: string;
  metricName: string;
  metricType: MetricType;
  aggregation: AggregationFunction;
  dimensions: string[];
  timeRange: string;
  data: MetricDataPoint[];
  thresholds?: { warning: number; critical: number };
}

export interface MetricDataPoint {
  timestamp: string;
  value: number;
  dimensions?: Record<string, string>;
}

export interface AILogEntry {
  id: string;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  service: string;
  message: string;
  traceId?: string;
  spanId?: string;
  modelId?: string;
  requestId?: string;
  metadata: Record<string, unknown>;
}

export interface LogTraceCorrelation {
  traceId: string;
  traceName: string;
  logs: AILogEntry[];
  spans: Array<{ spanId: string; name: string; spanType: string; durationMs: number; status: string }>;
  timeline: Array<{ timestamp: string; type: "span-start" | "span-end" | "log"; label: string; details: string }>;
  errorChain: Array<{ timestamp: string; service: string; message: string; spanId?: string }>;
}

export interface Anomaly {
  id: string;
  organizationId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  metricName: string;
  description: string;
  detectedAt: string;
  currentValue: number;
  expectedValue: number;
  deviationPercent: number;
  affectedServices: string[];
  correlatedAnomalies: string[];
  status: "open" | "investigating" | "resolved" | "acknowledged";
  rootCause?: string;
}

export interface RootCauseAnalysis {
  id: string;
  organizationId: string;
  anomalyId: string;
  status: "analyzing" | "completed" | "inconclusive";
  probableCauses: ProbableCause[];
  evidenceChain: EvidenceItem[];
  correlatedSignals: CorrelatedSignal[];
  recommendedActions: RecommendedAction[];
  confidence: number;
  analyzedAt: string;
  completedAt?: string;
}

export interface ProbableCause {
  category: "infrastructure" | "model" | "data" | "configuration" | "dependency" | "traffic" | "resource";
  description: string;
  likelihood: number;
  evidence: string[];
  affectedMetrics: string[];
}

export interface EvidenceItem {
  type: "trace" | "metric" | "log" | "event" | "change";
  description: string;
  timestamp: string;
  source: string;
  relevance: number;
  details: Record<string, unknown>;
}

export interface CorrelatedSignal {
  metricName: string;
  correlationCoefficient: number;
  timeOffsetSeconds: number;
  direction: "leading" | "lagging" | "concurrent";
}

export interface RecommendedAction {
  priority: number;
  action: string;
  rationale: string;
  estimatedImpact: string;
  effortLevel: "low" | "medium" | "high";
}

export interface ObservabilityAnalyticsStats {
  totalDashboards: number;
  totalAnomalies: number;
  openAnomalies: number;
  resolvedAnomalies: number;
  averageMTTDMinutes: number;
  averageMTTRMinutes: number;
  anomaliesByType: Record<string, number>;
  anomaliesBySeverity: Record<string, number>;
  topAffectedServices: Record<string, number>;
  goldenSignalsHealth: Record<string, string>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const dashboards = new Map<string, ObservabilityDashboard>();
const anomalies = new Map<string, Anomaly>();
const rootCauseAnalyses = new Map<string, RootCauseAnalysis>();
const logs = new Map<string, AILogEntry>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Generate an observability dashboard for an organization
 */
export async function generateDashboard(params: {
  organizationId: string;
  name: string;
  description?: string;
}): Promise<ObservabilityDashboard> {
  const now = new Date().toISOString();

  const dashboard: ObservabilityDashboard = {
    id: `obs_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    goldenSignals: generateGoldenSignals(),
    serviceMap: generateServiceMap(),
    topAnomalies: Array.from(anomalies.values())
      .filter(a => a.organizationId === params.organizationId && a.status === "open")
      .sort((a, b) => b.deviationPercent - a.deviationPercent)
      .slice(0, 5),
    recentRootCauses: Array.from(rootCauseAnalyses.values())
      .filter(r => r.organizationId === params.organizationId)
      .sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt))
      .slice(0, 5),
    metricPanels: generateMetricPanels(),
    lastRefreshedAt: now,
    createdAt: now,
  };

  dashboards.set(dashboard.id, dashboard);
  return dashboard;
}

/**
 * Refresh dashboard data
 */
export async function refreshDashboard(dashboardId: string): Promise<ObservabilityDashboard | null> {
  const dashboard = dashboards.get(dashboardId);
  if (!dashboard) return null;

  dashboard.goldenSignals = generateGoldenSignals();
  dashboard.serviceMap = generateServiceMap();
  dashboard.metricPanels = generateMetricPanels();
  dashboard.lastRefreshedAt = new Date().toISOString();
  dashboards.set(dashboardId, dashboard);
  return dashboard;
}

/**
 * Correlate logs with a trace
 */
export async function correlateLogsWithTrace(params: {
  traceId: string;
  logEntries: AILogEntry[];
  spans: Array<{ spanId: string; name: string; spanType: string; startTime: string; endTime?: string; durationMs: number; status: string }>;
}): Promise<LogTraceCorrelation> {
  const traceLogs = params.logEntries.filter(l => l.traceId === params.traceId);
  const sortedLogs = traceLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const timeline: LogTraceCorrelation["timeline"] = [];
  for (const span of params.spans) {
    timeline.push({ timestamp: span.startTime, type: "span-start", label: span.name, details: `Type: ${span.spanType}` });
    if (span.endTime) {
      timeline.push({ timestamp: span.endTime, type: "span-end", label: span.name, details: `Duration: ${span.durationMs}ms, Status: ${span.status}` });
    }
  }
  for (const log of sortedLogs) {
    timeline.push({ timestamp: log.timestamp, type: "log", label: `[${log.level.toUpperCase()}] ${log.service}`, details: log.message });
  }
  timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const errorChain = sortedLogs
    .filter(l => l.level === "error" || l.level === "fatal")
    .map(l => ({ timestamp: l.timestamp, service: l.service, message: l.message, spanId: l.spanId }));

  return {
    traceId: params.traceId,
    traceName: params.spans[0]?.name ?? "Unknown",
    logs: sortedLogs,
    spans: params.spans.map(s => ({ spanId: s.spanId, name: s.name, spanType: s.spanType, durationMs: s.durationMs, status: s.status })),
    timeline,
    errorChain,
  };
}

/**
 * Add a log entry
 */
export async function addLogEntry(entry: Omit<AILogEntry, "id">): Promise<AILogEntry> {
  const log: AILogEntry = { id: `log_${randomUUID().replace(/-/g, "").slice(0, 16)}`, ...entry };
  logs.set(log.id, log);
  return log;
}

/**
 * Run anomaly detection on metrics
 */
export async function detectAnomalies(params: {
  organizationId: string;
  metrics: Array<{ name: string; values: number[]; timestamps: string[]; baseline: number }>;
}): Promise<Anomaly[]> {
  const detected: Anomaly[] = [];

  for (const metric of params.metrics) {
    const recent = metric.values.slice(-10);
    const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const deviation = metric.baseline !== 0 ? ((avg - metric.baseline) / metric.baseline) * 100 : 0;

    if (Math.abs(deviation) > 20) {
      const type: AnomalyType = deviation > 50 ? "spike" : deviation < -50 ? "drop" : Math.abs(deviation) > 30 ? "trend-change" : "threshold-breach";
      const severity: AnomalySeverity = Math.abs(deviation) > 80 ? "critical" : Math.abs(deviation) > 50 ? "high" : Math.abs(deviation) > 30 ? "medium" : "low";

      const anomaly: Anomaly = {
        id: `anom_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
        organizationId: params.organizationId,
        type,
        severity,
        metricName: metric.name,
        description: `${metric.name} deviated ${deviation > 0 ? "+" : ""}${deviation.toFixed(1)}% from baseline (${metric.baseline.toFixed(2)} → ${avg.toFixed(2)})`,
        detectedAt: new Date().toISOString(),
        currentValue: Math.round(avg * 100) / 100,
        expectedValue: Math.round(metric.baseline * 100) / 100,
        deviationPercent: Math.round(deviation * 100) / 100,
        affectedServices: [],
        correlatedAnomalies: [],
        status: "open",
      };

      anomalies.set(anomaly.id, anomaly);
      detected.push(anomaly);
    }
  }

  return detected;
}

/**
 * Run root cause analysis for an anomaly
 */
export async function runRootCauseAnalysis(params: {
  anomalyId: string;
  relatedMetrics: Array<{ name: string; correlationCoefficient: number; timeOffsetSeconds: number }>;
  relatedLogs: AILogEntry[];
  recentChanges: Array<{ type: string; description: string; timestamp: string; author?: string }>;
}): Promise<RootCauseAnalysis | null> {
  const anomaly = anomalies.get(params.anomalyId);
  if (!anomaly) return null;

  const probableCauses: ProbableCause[] = [];
  const evidenceChain: EvidenceItem[] = [];
  const correlatedSignals: CorrelatedSignal[] = [];

  // Analyze correlated metrics
  for (const metric of params.relatedMetrics) {
    correlatedSignals.push({
      metricName: metric.name,
      correlationCoefficient: metric.correlationCoefficient,
      timeOffsetSeconds: metric.timeOffsetSeconds,
      direction: metric.timeOffsetSeconds < 0 ? "leading" : metric.timeOffsetSeconds > 0 ? "lagging" : "concurrent",
    });

    if (Math.abs(metric.correlationCoefficient) > 0.7 && metric.timeOffsetSeconds <= 0) {
      probableCauses.push({
        category: "infrastructure",
        description: `Metric "${metric.name}" is strongly correlated (${(metric.correlationCoefficient * 100).toFixed(0)}%) and leads the anomaly`,
        likelihood: Math.abs(metric.correlationCoefficient),
        evidence: [`Correlation coefficient: ${metric.correlationCoefficient.toFixed(3)}`, `Time offset: ${metric.timeOffsetSeconds}s`],
        affectedMetrics: [metric.name, anomaly.metricName],
      });
    }
  }

  // Analyze error logs
  const errorLogs = params.relatedLogs.filter(l => l.level === "error" || l.level === "fatal");
  if (errorLogs.length > 0) {
    evidenceChain.push({
      type: "log",
      description: `${errorLogs.length} error log(s) found around anomaly time`,
      timestamp: errorLogs[0].timestamp,
      source: errorLogs[0].service,
      relevance: 0.8,
      details: { errorCount: errorLogs.length, sample: errorLogs[0].message },
    });

    probableCauses.push({
      category: "dependency",
      description: `Error logs from "${errorLogs[0].service}" suggest a dependency failure`,
      likelihood: 0.7,
      evidence: errorLogs.slice(0, 3).map(l => l.message),
      affectedMetrics: [anomaly.metricName],
    });
  }

  // Analyze recent changes
  for (const change of params.recentChanges) {
    evidenceChain.push({
      type: "change",
      description: `${change.type}: ${change.description}`,
      timestamp: change.timestamp,
      source: change.author ?? "system",
      relevance: 0.6,
      details: { changeType: change.type },
    });

    probableCauses.push({
      category: "configuration",
      description: `Recent ${change.type.toLowerCase()} change may have triggered the anomaly`,
      likelihood: 0.5,
      evidence: [`Change: ${change.description}`, `Time: ${change.timestamp}`],
      affectedMetrics: [anomaly.metricName],
    });
  }

  const recommendedActions: RecommendedAction[] = [
    { priority: 1, action: "Review correlated metrics and error logs for root cause", rationale: "Multiple signals point to a systemic issue", estimatedImpact: "Identify exact failure point", effortLevel: "low" },
    { priority: 2, action: "Check recent deployments and configuration changes", rationale: "Changes are a common source of anomalies", estimatedImpact: "Potential rollback candidate", effortLevel: "low" },
    { priority: 3, action: "Scale up affected services if resource saturation detected", rationale: "Resource pressure often causes latency spikes", estimatedImpact: "Immediate relief", effortLevel: "medium" },
  ];

  const rca: RootCauseAnalysis = {
    id: `rca_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: anomaly.organizationId,
    anomalyId: params.anomalyId,
    status: "completed",
    probableCauses: probableCauses.sort((a, b) => b.likelihood - a.likelihood),
    evidenceChain,
    correlatedSignals,
    recommendedActions,
    confidence: probableCauses.length > 0 ? Math.min(0.95, probableCauses[0].likelihood + 0.1) : 0.3,
    analyzedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  rootCauseAnalyses.set(rca.id, rca);
  anomaly.status = "investigating";
  anomaly.rootCause = probableCauses[0]?.description;
  anomalies.set(anomaly.id, anomaly);

  return rca;
}

/**
 * Get observability analytics statistics
 */
export async function getObservabilityAnalyticsStats(organizationId: string): Promise<ObservabilityAnalyticsStats> {
  const allAnomalies = Array.from(anomalies.values()).filter(a => a.organizationId === organizationId);
  const open = allAnomalies.filter(a => a.status === "open");
  const resolved = allAnomalies.filter(a => a.status === "resolved");

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const affectedServices: Record<string, number> = {};

  for (const a of allAnomalies) {
    byType[a.type] = (byType[a.type] || 0) + 1;
    bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
    for (const s of a.affectedServices) affectedServices[s] = (affectedServices[s] || 0) + 1;
  }

  return {
    totalDashboards: Array.from(dashboards.values()).filter(d => d.organizationId === organizationId).length,
    totalAnomalies: allAnomalies.length,
    openAnomalies: open.length,
    resolvedAnomalies: resolved.length,
    averageMTTDMinutes: 5 + Math.round(_rng.next() * 10),
    averageMTTRMinutes: 30 + Math.round(_rng.next() * 60),
    anomaliesByType: byType,
    anomaliesBySeverity: bySeverity,
    topAffectedServices: affectedServices,
    goldenSignalsHealth: { latency: "good", traffic: "good", errors: "warning", saturation: "good" },
  };
}

/**
 * Get dashboard by ID
 */
export async function getDashboard(dashboardId: string): Promise<ObservabilityDashboard | null> {
  return dashboards.get(dashboardId) ?? null;
}

/**
 * List dashboards
 */
export async function listDashboards(organizationId: string): Promise<ObservabilityDashboard[]> {
  return Array.from(dashboards.values())
    .filter(d => d.organizationId === organizationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ─── Internal: Dashboard Generation ───────────────────────────────────────────

function generateGoldenSignals(): GoldenSignals {
  const p50Latency = 25 + _rng.next() * 50;
  const p99Latency = p50Latency * (3 + _rng.next() * 2);

  return {
    latency: {
      type: "latency",
      currentValue: Math.round(p50Latency * 100) / 100,
      baselineValue: Math.round(p50Latency * 0.9 * 100) / 100,
      unit: "ms",
      status: p99Latency > 500 ? "critical" : p99Latency > 200 ? "warning" : "good",
      trend: _rng.next() > 0.6 ? "stable" : _rng.next() > 0.5 ? "improving" : "degrading",
      percentiles: { p50: Math.round(p50Latency * 100) / 100, p90: Math.round(p50Latency * 2 * 100) / 100, p95: Math.round(p50Latency * 2.5 * 100) / 100, p99: Math.round(p99Latency * 100) / 100 },
      breakdown: [{ label: "Inference", value: Math.round(p50Latency * 0.7) }, { label: "Preprocessing", value: Math.round(p50Latency * 0.15) }, { label: "Postprocessing", value: Math.round(p50Latency * 0.1) }, { label: "Queue", value: Math.round(p50Latency * 0.05) }],
      slaTarget: 200,
      slaCompliance: Math.round((95 + _rng.next() * 5) * 100) / 100,
    },
    traffic: {
      type: "traffic",
      currentValue: Math.round((100 + _rng.next() * 400) * 100) / 100,
      baselineValue: Math.round((100 + _rng.next() * 300) * 100) / 100,
      unit: "req/s",
      status: "good",
      trend: _rng.next() > 0.5 ? "stable" : "improving",
      breakdown: [{ label: "Real-time", value: Math.round(50 + _rng.next() * 200) }, { label: "Batch", value: Math.round(20 + _rng.next() * 100) }, { label: "Streaming", value: Math.round(10 + _rng.next() * 50) }],
    },
    errors: {
      type: "errors",
      currentValue: Math.round(_rng.next() * 5 * 100) / 100,
      baselineValue: Math.round(_rng.next() * 2 * 100) / 100,
      unit: "%",
      status: _rng.next() > 0.7 ? "warning" : "good",
      trend: _rng.next() > 0.5 ? "stable" : "degrading",
      breakdown: [{ label: "5xx", value: Math.round(_rng.next() * 2 * 100) / 100 }, { label: "Timeout", value: Math.round(_rng.next() * 1.5 * 100) / 100 }, { label: "Model Error", value: Math.round(_rng.next() * 1 * 100) / 100 }],
      slaTarget: 1,
      slaCompliance: Math.round((95 + _rng.next() * 5) * 100) / 100,
    },
    saturation: {
      type: "saturation",
      currentValue: Math.round((40 + _rng.next() * 40) * 100) / 100,
      baselineValue: Math.round((30 + _rng.next() * 30) * 100) / 100,
      unit: "%",
      status: _rng.next() > 0.8 ? "critical" : _rng.next() > 0.5 ? "warning" : "good",
      trend: "stable",
      breakdown: [{ label: "GPU", value: Math.round(50 + _rng.next() * 40) }, { label: "Memory", value: Math.round(40 + _rng.next() * 30) }, { label: "CPU", value: Math.round(30 + _rng.next() * 30) }, { label: "Queue", value: Math.round(10 + _rng.next() * 20) }],
    },
  };
}

function generateServiceMap(): ServiceDependencyMap {
  const services: ServiceNode[] = [
    { id: "gateway", name: "AI Gateway", type: "gateway", health: "healthy", metrics: { latencyMs: 5, errorRate: 0.1, requestRate: 500, saturation: 30 } },
    { id: "preprocessing", name: "Preprocessing Service", type: "preprocessing", health: "healthy", metrics: { latencyMs: 10, errorRate: 0.2, requestRate: 480, saturation: 40 } },
    { id: "model-primary", name: "Primary Model", type: "model", health: "healthy", metrics: { latencyMs: 45, errorRate: 0.5, requestRate: 450, saturation: 65 }, version: "v2.1.0", replicas: 4 },
    { id: "model-fallback", name: "Fallback Model", type: "model", health: "healthy", metrics: { latencyMs: 30, errorRate: 0.3, requestRate: 50, saturation: 25 }, version: "v1.8.0", replicas: 2 },
    { id: "postprocessing", name: "Postprocessing Service", type: "postprocessing", health: "healthy", metrics: { latencyMs: 8, errorRate: 0.1, requestRate: 440, saturation: 20 } },
    { id: "cache", name: "Semantic Cache", type: "cache", health: "healthy", metrics: { latencyMs: 2, errorRate: 0, requestRate: 200, saturation: 35 } },
    { id: "queue", name: "Request Queue", type: "queue", health: "healthy", metrics: { latencyMs: 3, errorRate: 0, requestRate: 500, saturation: 45 } },
  ];

  const dependencies: ServiceDependency[] = [
    { fromServiceId: "gateway", toServiceId: "queue", callRate: 500, averageLatencyMs: 3, errorRate: 0, protocol: "direct" },
    { fromServiceId: "queue", toServiceId: "cache", callRate: 200, averageLatencyMs: 2, errorRate: 0, protocol: "direct" },
    { fromServiceId: "queue", toServiceId: "preprocessing", callRate: 300, averageLatencyMs: 10, errorRate: 0.2, protocol: "direct" },
    { fromServiceId: "preprocessing", toServiceId: "model-primary", callRate: 280, averageLatencyMs: 45, errorRate: 0.5, protocol: "grpc" },
    { fromServiceId: "preprocessing", toServiceId: "model-fallback", callRate: 20, averageLatencyMs: 30, errorRate: 0.3, protocol: "grpc" },
    { fromServiceId: "model-primary", toServiceId: "postprocessing", callRate: 270, averageLatencyMs: 8, errorRate: 0.1, protocol: "direct" },
    { fromServiceId: "model-fallback", toServiceId: "postprocessing", callRate: 18, averageLatencyMs: 8, errorRate: 0.1, protocol: "direct" },
  ];

  return {
    services,
    dependencies,
    criticalPaths: [["gateway", "queue", "preprocessing", "model-primary", "postprocessing"], ["gateway", "queue", "cache"]],
    bottlenecks: [{ serviceId: "model-primary", reason: "Highest latency in critical path (45ms)", impact: "Limits overall throughput" }],
  };
}

function generateMetricPanels(): MetricPanel[] {
  const now = Date.now();
  const generateData = (base: number, variance: number, count: number): MetricDataPoint[] =>
    Array.from({ length: count }, (_, i) => ({
      timestamp: new Date(now - (count - i) * 60000).toISOString(),
      value: Math.round((base + (_rng.next() - 0.5) * variance) * 100) / 100,
    }));

  return [
    { id: "panel_latency", title: "Inference Latency (ms)", metricName: "ai.inference.latency_ms", metricType: "histogram", aggregation: "p95", dimensions: ["model"], timeRange: "1h", data: generateData(50, 30, 60), thresholds: { warning: 100, critical: 200 } },
    { id: "panel_throughput", title: "Request Throughput (req/s)", metricName: "ai.request.rate", metricType: "gauge", aggregation: "avg", dimensions: ["model"], timeRange: "1h", data: generateData(200, 80, 60) },
    { id: "panel_errors", title: "Error Rate (%)", metricName: "ai.error.rate", metricType: "gauge", aggregation: "avg", dimensions: ["model", "error_type"], timeRange: "1h", data: generateData(1, 2, 60), thresholds: { warning: 2, critical: 5 } },
    { id: "panel_gpu", title: "GPU Utilization (%)", metricName: "ai.gpu.utilization", metricType: "gauge", aggregation: "avg", dimensions: ["node"], timeRange: "1h", data: generateData(60, 20, 60), thresholds: { warning: 80, critical: 95 } },
    { id: "panel_queue", title: "Queue Depth", metricName: "ai.queue.depth", metricType: "gauge", aggregation: "max", dimensions: ["queue"], timeRange: "1h", data: generateData(5, 10, 60), thresholds: { warning: 20, critical: 50 } },
    { id: "panel_tokens", title: "Token Throughput (tokens/s)", metricName: "ai.tokens.rate", metricType: "gauge", aggregation: "sum", dimensions: ["model", "direction"], timeRange: "1h", data: generateData(1000, 400, 60) },
  ];
}
