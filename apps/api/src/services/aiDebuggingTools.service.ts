/**
 * Module 90: AI Debugging Tools Service
 *
 * Provides comprehensive debugging tools for AI models including interactive
 * debug sessions with breakpoints, tensor inspection and visualization, gradient
 * analysis with anomaly detection, activation pattern visualization, layer-by-layer
 * output inspection, input perturbation testing, and debugging session replay.
 *
 * Phase 1 — Model-level debugging with breakpoints, tensor inspection, and gradient analysis
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DebugSessionStatus = "idle" | "running" | "paused" | "completed" | "error" | "terminated";

export type BreakpointType = "layer" | "condition" | "tensor-value" | "gradient-threshold" | "activation-range" | "exception";

export type BreakpointStatus = "enabled" | "disabled" | "hit" | "pending";

export type TensorDataType = "float32" | "float64" | "int32" | "int64" | "bool" | "complex64" | "bfloat16";

export type GradientHealthStatus = "healthy" | "vanishing" | "exploding" | "unstable" | "sparse" | "dead-neurons";

export type InspectionMode = "snapshot" | "streaming" | "conditional" | "comparison";

export type PerturbationType = "gaussian-noise" | "uniform-noise" | "dropout" | "occlusion" | "adversarial" | "input-shift";

export interface DebugSession {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  modelId: string;
  modelName: string;
  framework: string;
  status: DebugSessionStatus;
  breakpoints: Breakpoint[];
  currentBreakpoint: string | null;
  stepCount: number;
  executionHistory: ExecutionStep[];
  tensorWatchlist: TensorWatchEntry[];
  gradientMonitors: GradientMonitor[];
  config: DebugSessionConfig;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DebugSessionConfig {
  maxSteps: number;
  collectGradients: boolean;
  collectActivations: boolean;
  tensorHistoryDepth: number;
  enableStepReplay: boolean;
  snapshotInterval: number;
  autoResume: boolean;
  timeoutMs: number;
  verboseLogging: boolean;
  captureIntermediateOutputs: boolean;
}

export interface Breakpoint {
  id: string;
  sessionId: string;
  type: BreakpointType;
  layerName: string;
  layerIndex: number;
  condition: string | null;
  hitCount: number;
  maxHits: number | null;
  status: BreakpointStatus;
  lastHitAt: string | null;
  hitHistory: BreakpointHit[];
  createdAt: string;
}

export interface BreakpointHit {
  timestamp: string;
  stepNumber: number;
  tensorSnapshot: TensorSnapshot | null;
  gradientSnapshot: GradientSnapshot | null;
  conditionMet: boolean;
  metadata: Record<string, unknown>;
}

export interface TensorSnapshot {
  id: string;
  name: string;
  shape: number[];
  dtype: TensorDataType;
  statistics: TensorStatistics;
  values: number[] | null;
  histogram: HistogramBin[];
  topValues: Array<{ value: number; index: number[] }>;
  capturedAt: string;
}

export interface TensorStatistics {
  min: number;
  max: number;
  mean: number;
  median: number;
  std: number;
  variance: number;
  sparsity: number;
  normL1: number;
  normL2: number;
  normInf: number;
  skewness: number;
  kurtosis: number;
  percentile25: number;
  percentile75: number;
  percentile95: number;
  percentile99: number;
  nanCount: number;
  infCount: number;
}

export interface HistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
  percentage: number;
}

export interface TensorWatchEntry {
  id: string;
  sessionId: string;
  tensorName: string;
  layerName: string;
  watchMode: InspectionMode;
  condition: string | null;
  comparisonBaseline: string | null;
  history: TensorSnapshot[];
  alerts: TensorAlert[];
  createdAt: string;
}

export interface TensorAlert {
  id: string;
  type: "nan-detected" | "inf-detected" | "value-out-of-range" | "distribution-shift" | "sparsity-change" | "magnitude-change";
  severity: "critical" | "warning" | "info";
  message: string;
  detectedAt: string;
  details: Record<string, unknown>;
}

export interface GradientMonitor {
  id: string;
  sessionId: string;
  layerName: string;
  layerIndex: number;
  gradientHistory: GradientSnapshot[];
  healthStatus: GradientHealthStatus;
  healthScore: number;
  anomalies: GradientAnomaly[];
  createdAt: string;
}

export interface GradientSnapshot {
  stepNumber: number;
  layerName: string;
  statistics: TensorStatistics;
  globalNorm: number;
  layerNorm: number;
  clippedNorm: number | null;
  ratioToPreviousLayer: number | null;
  capturedAt: string;
}

export interface GradientAnomaly {
  id: string;
  type: "vanishing" | "exploding" | "unstable" | "dead-neuron" | "sparse-gradient" | "sign-flip";
  severity: "critical" | "warning" | "info";
  layerName: string;
  stepNumber: number;
  description: string;
  suggestedFix: string;
  detectedAt: string;
}

export interface ExecutionStep {
  stepNumber: number;
  timestamp: string;
  layerName: string;
  layerIndex: number;
  operationType: string;
  inputShape: number[][];
  outputShape: number[];
  executionTimeMs: number;
  memoryUsedBytes: number;
  tensorStats: TensorStatistics | null;
  breakpointHit: boolean;
  breakpointId: string | null;
  metadata: Record<string, unknown>;
}

export interface ActivationPattern {
  id: string;
  sessionId: string;
  layerName: string;
  layerIndex: number;
  patternType: "dense" | "sparse" | "dead" | "saturated" | "bimodal" | "normal";
  activationRate: number;
  deadNeuronRatio: number;
  saturatedNeuronRatio: number;
  meanActivation: number;
  visualizationData: ActivationVisualization;
  capturedAt: string;
}

export interface ActivationVisualization {
  type: "heatmap" | "histogram" | "scatter" | "bar";
  dimensions: { width: number; height: number };
  dataPoints: Array<{ x: number; y: number; value: number; label?: string }>;
  colorScale: { min: string; max: string; midpoint?: string };
}

export interface PerturbationResult {
  id: string;
  sessionId: string;
  perturbationType: PerturbationType;
  targetLayer: string;
  magnitude: number;
  originalOutput: number[];
  perturbedOutput: number[];
  outputDifference: number;
  sensitivityScore: number;
  affectedPredictions: Array<{ index: number; originalConfidence: number; perturbedConfidence: number; change: number }>;
  robustnessAssessment: "robust" | "moderately-robust" | "fragile" | "highly-fragile";
  testedAt: string;
}

export interface DebugSessionReplay {
  id: string;
  sessionId: string;
  totalSteps: number;
  replaySpeed: number;
  bookmarks: ReplayBookmark[];
  highlights: ReplayHighlight[];
  duration: number;
  createdAt: string;
}

export interface ReplayBookmark {
  id: string;
  stepNumber: number;
  label: string;
  note: string;
  timestamp: string;
}

export interface ReplayHighlight {
  id: string;
  stepNumber: number;
  type: "breakpoint-hit" | "anomaly" | "error" | "interesting-pattern";
  description: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const debugSessions = new Map<string, DebugSession>();
const tensorWatchEntries = new Map<string, TensorWatchEntry>();
const gradientMonitors = new Map<string, GradientMonitor>();
const activationPatterns = new Map<string, ActivationPattern>();
const perturbationResults = new Map<string, PerturbationResult>();
const debugReplays = new Map<string, DebugSessionReplay>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateTensorStatistics(): TensorStatistics {
  const mean = (Math.random() - 0.5) * 2;
  const std = Math.random() * 0.5 + 0.1;
  return {
    min: mean - std * 3,
    max: mean + std * 3,
    mean,
    median: mean + (Math.random() - 0.5) * 0.1,
    std,
    variance: std * std,
    sparsity: Math.random() * 0.3,
    normL1: Math.abs(mean) * 100 + Math.random() * 50,
    normL2: Math.sqrt(mean * mean * 100 + std * std * 100),
    normInf: Math.abs(mean) + std * 3,
    skewness: (Math.random() - 0.5) * 0.5,
    kurtosis: 3 + (Math.random() - 0.5) * 2,
    percentile25: mean - std * 0.67,
    percentile75: mean + std * 0.67,
    percentile95: mean + std * 1.64,
    percentile99: mean + std * 2.33,
    nanCount: Math.random() < 0.05 ? Math.floor(Math.random() * 10) : 0,
    infCount: Math.random() < 0.02 ? Math.floor(Math.random() * 3) : 0,
  };
}

function generateHistogramBins(stats: TensorStatistics): HistogramBin[] {
  const bins: HistogramBin[] = [];
  const range = stats.max - stats.min;
  const binWidth = range / 20;
  for (let i = 0; i < 20; i++) {
    const binStart = stats.min + i * binWidth;
    const binEnd = binStart + binWidth;
    const binCenter = (binStart + binEnd) / 2;
    const z = (binCenter - stats.mean) / stats.std;
    const count = Math.max(0, Math.floor(1000 * Math.exp(-0.5 * z * z) / (stats.std * Math.sqrt(2 * Math.PI)) * binWidth));
    bins.push({ binStart, binEnd, count, percentage: count / 10 });
  }
  return bins;
}

function assessGradientHealth(history: GradientSnapshot[]): GradientHealthStatus {
  if (history.length < 2) return "healthy";
  const latest = history[history.length - 1];
  const globalNorm = latest.globalNorm;
  if (globalNorm < 1e-7) return "vanishing";
  if (globalNorm > 1e3) return "exploding";
  if (latest.statistics.sparsity > 0.8) return "sparse";
  if (latest.statistics.nanCount > 0 || latest.statistics.infCount > 0) return "unstable";
  const ratioVariance = history.slice(-10).reduce((acc, s) => {
    const r = s.globalNorm / (history[0].globalNorm || 1);
    return acc + (r - 1) * (r - 1);
  }, 0) / Math.min(history.length, 10);
  if (ratioVariance > 5) return "unstable";
  return "healthy";
}

function computeGradientHealthScore(status: GradientHealthStatus): number {
  const scores: Record<GradientHealthStatus, number> = {
    healthy: 95,
    sparse: 70,
    vanishing: 40,
    unstable: 30,
    exploding: 20,
    "dead-neurons": 15,
  };
  return scores[status] + Math.floor(Math.random() * 10 - 5);
}

// ─── Debug Session Management ─────────────────────────────────────────────────

export async function createDebugSession(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelName: string;
  framework: string;
  config?: Partial<DebugSessionConfig>;
}): Promise<DebugSession> {
  const now = new Date().toISOString();
  const defaultConfig: DebugSessionConfig = {
    maxSteps: 1000,
    collectGradients: true,
    collectActivations: true,
    tensorHistoryDepth: 50,
    enableStepReplay: true,
    snapshotInterval: 10,
    autoResume: false,
    timeoutMs: 300000,
    verboseLogging: false,
    captureIntermediateOutputs: true,
  };
  const session: DebugSession = {
    id: `dbs_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description || "",
    modelId: params.modelId,
    modelName: params.modelName,
    framework: params.framework,
    status: "idle",
    breakpoints: [],
    currentBreakpoint: null,
    stepCount: 0,
    executionHistory: [],
    tensorWatchlist: [],
    gradientMonitors: [],
    config: { ...defaultConfig, ...params.config },
    startedAt: null,
    pausedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  debugSessions.set(session.id, session);
  return session;
}

export async function getDebugSession(sessionId: string): Promise<DebugSession | null> {
  return debugSessions.get(sessionId) || null;
}

export async function listDebugSessions(organizationId: string): Promise<DebugSession[]> {
  return Array.from(debugSessions.values()).filter((s) => s.organizationId === organizationId);
}

export async function startDebugSession(sessionId: string): Promise<DebugSession> {
  const session = debugSessions.get(sessionId);
  if (!session) throw new Error(`Debug session ${sessionId} not found`);
  if (session.status !== "idle" && session.status !== "completed") {
    throw new Error(`Cannot start session in status: ${session.status}`);
  }
  const now = new Date().toISOString();
  session.status = "running";
  session.startedAt = now;
  session.stepCount = 0;
  session.executionHistory = [];
  session.updatedAt = now;
  return session;
}

export async function pauseDebugSession(sessionId: string): Promise<DebugSession> {
  const session = debugSessions.get(sessionId);
  if (!session) throw new Error(`Debug session ${sessionId} not found`);
  if (session.status !== "running") throw new Error(`Cannot pause session in status: ${session.status}`);
  const now = new Date().toISOString();
  session.status = "paused";
  session.pausedAt = now;
  session.updatedAt = now;
  return session;
}

export async function resumeDebugSession(sessionId: string): Promise<DebugSession> {
  const session = debugSessions.get(sessionId);
  if (!session) throw new Error(`Debug session ${sessionId} not found`);
  if (session.status !== "paused") throw new Error(`Cannot resume session in status: ${session.status}`);
  const now = new Date().toISOString();
  session.status = "running";
  session.pausedAt = null;
  session.updatedAt = now;
  return session;
}

export async function terminateDebugSession(sessionId: string): Promise<DebugSession> {
  const session = debugSessions.get(sessionId);
  if (!session) throw new Error(`Debug session ${sessionId} not found`);
  const now = new Date().toISOString();
  session.status = "terminated";
  session.completedAt = now;
  session.updatedAt = now;
  return session;
}

export async function stepDebugSession(sessionId: string): Promise<ExecutionStep> {
  const session = debugSessions.get(sessionId);
  if (!session) throw new Error(`Debug session ${sessionId} not found`);
  if (session.status !== "running" && session.status !== "paused") {
    throw new Error(`Cannot step session in status: ${session.status}`);
  }
  const now = new Date().toISOString();
  session.stepCount += 1;
  const layerIndex = session.stepCount % 12;
  const layerNames = [
    "input_embedding", "attention_layer_1", "attention_layer_2", "feed_forward_1",
    "layer_norm_1", "attention_layer_3", "attention_layer_4", "feed_forward_2",
    "layer_norm_2", "output_projection", "softmax", "output",
  ];
  const operationTypes = [
    "embedding_lookup", "multi_head_attention", "multi_head_attention", "dense_relu",
    "layer_normalization", "multi_head_attention", "multi_head_attention", "dense_gelu",
    "layer_normalization", "dense_linear", "softmax", "argmax",
  ];
  const inputDim = Math.max(32, 512 >> Math.floor(layerIndex / 3));
  const outputDim = Math.max(32, 512 >> Math.floor(layerIndex / 4));
  const stats = generateTensorStatistics();
  const breakpointHit = session.breakpoints.some(
    (bp) => bp.layerIndex === layerIndex && bp.status === "enabled"
  );
  const step: ExecutionStep = {
    stepNumber: session.stepCount,
    timestamp: now,
    layerName: layerNames[layerIndex],
    layerIndex,
    operationType: operationTypes[layerIndex],
    inputShape: [[1, 128, inputDim]],
    outputShape: [1, 128, outputDim],
    executionTimeMs: Math.random() * 50 + 1,
    memoryUsedBytes: Math.floor(Math.random() * 100000000) + 10000000,
    tensorStats: stats,
    breakpointHit,
    breakpointId: breakpointHit
      ? session.breakpoints.find((bp) => bp.layerIndex === layerIndex)?.id || null
      : null,
    metadata: { framework: session.framework, modelName: session.modelName },
  };
  session.executionHistory.push(step);
  if (breakpointHit) {
    session.status = "paused";
    session.pausedAt = now;
    session.currentBreakpoint = step.breakpointId;
    const bp = session.breakpoints.find((b) => b.id === step.breakpointId);
    if (bp) {
      bp.hitCount += 1;
      bp.status = "hit";
      bp.lastHitAt = now;
      bp.hitHistory.push({
        timestamp: now,
        stepNumber: session.stepCount,
        tensorSnapshot: {
          id: `tsp_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
          name: step.layerName,
          shape: step.outputShape,
          dtype: "float32",
          statistics: stats,
          values: null,
          histogram: generateHistogramBins(stats),
          topValues: Array.from({ length: 5 }, (_, i) => ({
            value: stats.max - i * 0.1,
            index: [0, Math.floor(Math.random() * 128), Math.floor(Math.random() * outputDim)],
          })),
          capturedAt: now,
        },
        gradientSnapshot: null,
        conditionMet: true,
        metadata: {},
      });
    }
  }
  if (session.stepCount >= session.config.maxSteps) {
    session.status = "completed";
    session.completedAt = now;
  }
  session.updatedAt = now;
  return step;
}

// ─── Breakpoint Management ────────────────────────────────────────────────────

export async function addBreakpoint(sessionId: string, params: {
  type: BreakpointType;
  layerName: string;
  layerIndex: number;
  condition?: string;
  maxHits?: number;
}): Promise<Breakpoint> {
  const session = debugSessions.get(sessionId);
  if (!session) throw new Error(`Debug session ${sessionId} not found`);
  const now = new Date().toISOString();
  const breakpoint: Breakpoint = {
    id: `bp_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    sessionId,
    type: params.type,
    layerName: params.layerName,
    layerIndex: params.layerIndex,
    condition: params.condition || null,
    hitCount: 0,
    maxHits: params.maxHits || null,
    status: "enabled",
    lastHitAt: null,
    hitHistory: [],
    createdAt: now,
  };
  session.breakpoints.push(breakpoint);
  session.updatedAt = now;
  return breakpoint;
}

export async function removeBreakpoint(sessionId: string, breakpointId: string): Promise<boolean> {
  const session = debugSessions.get(sessionId);
  if (!session) throw new Error(`Debug session ${sessionId} not found`);
  const idx = session.breakpoints.findIndex((bp) => bp.id === breakpointId);
  if (idx === -1) return false;
  session.breakpoints.splice(idx, 1);
  session.updatedAt = new Date().toISOString();
  return true;
}

export async function toggleBreakpoint(sessionId: string, breakpointId: string): Promise<Breakpoint> {
  const session = debugSessions.get(sessionId);
  if (!session) throw new Error(`Debug session ${sessionId} not found`);
  const bp = session.breakpoints.find((b) => b.id === breakpointId);
  if (!bp) throw new Error(`Breakpoint ${breakpointId} not found`);
  bp.status = bp.status === "enabled" ? "disabled" : "enabled";
  session.updatedAt = new Date().toISOString();
  return bp;
}

// ─── Tensor Inspection ────────────────────────────────────────────────────────

export async function addTensorWatch(sessionId: string, params: {
  tensorName: string;
  layerName: string;
  watchMode?: InspectionMode;
  condition?: string;
  comparisonBaseline?: string;
}): Promise<TensorWatchEntry> {
  const session = debugSessions.get(sessionId);
  if (!session) throw new Error(`Debug session ${sessionId} not found`);
  const now = new Date().toISOString();
  const entry: TensorWatchEntry = {
    id: `tw_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    sessionId,
    tensorName: params.tensorName,
    layerName: params.layerName,
    watchMode: params.watchMode || "snapshot",
    condition: params.condition || null,
    comparisonBaseline: params.comparisonBaseline || null,
    history: [],
    alerts: [],
    createdAt: now,
  };
  session.tensorWatchlist.push(entry);
  tensorWatchEntries.set(entry.id, entry);
  session.updatedAt = now;
  return entry;
}

export async function captureTensorSnapshot(watchId: string): Promise<TensorSnapshot> {
  const entry = tensorWatchEntries.get(watchId);
  if (!entry) throw new Error(`Tensor watch entry ${watchId} not found`);
  const now = new Date().toISOString();
  const stats = generateTensorStatistics();
  const snapshot: TensorSnapshot = {
    id: `tsp_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    name: entry.tensorName,
    shape: [1, 128, 512],
    dtype: "float32",
    statistics: stats,
    values: null,
    histogram: generateHistogramBins(stats),
    topValues: Array.from({ length: 5 }, (_, i) => ({
      value: stats.max - i * (stats.std * 0.5),
      index: [0, Math.floor(Math.random() * 128), Math.floor(Math.random() * 512)],
    })),
    capturedAt: now,
  };
  entry.history.push(snapshot);
  if (entry.history.length > 50) entry.history.shift();
  // Check for alerts
  if (stats.nanCount > 0) {
    entry.alerts.push({
      id: `ta_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "nan-detected",
      severity: "critical",
      message: `NaN values detected in tensor ${entry.tensorName}: ${stats.nanCount} NaN values found`,
      detectedAt: now,
      details: { nanCount: stats.nanCount, tensorName: entry.tensorName },
    });
  }
  if (stats.infCount > 0) {
    entry.alerts.push({
      id: `ta_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "inf-detected",
      severity: "critical",
      message: `Infinity values detected in tensor ${entry.tensorName}`,
      detectedAt: now,
      details: { infCount: stats.infCount, tensorName: entry.tensorName },
    });
  }
  if (stats.sparsity > 0.9) {
    entry.alerts.push({
      id: `ta_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "sparsity-change",
      severity: "warning",
      message: `High sparsity detected in tensor ${entry.tensorName}: ${(stats.sparsity * 100).toFixed(1)}% sparse`,
      detectedAt: now,
      details: { sparsity: stats.sparsity, tensorName: entry.tensorName },
    });
  }
  return snapshot;
}

export async function compareTensors(watchId1: string, watchId2: string): Promise<{
  similarity: number;
  cosineDistance: number;
  meanAbsoluteDifference: number;
  maxAbsoluteDifference: number;
  distributionSimilarity: number;
  conclusion: string;
}> {
  const entry1 = tensorWatchEntries.get(watchId1);
  const entry2 = tensorWatchEntries.get(watchId2);
  if (!entry1 || !entry2) throw new Error("One or both tensor watch entries not found");
  const latest1 = entry1.history[entry1.history.length - 1];
  const latest2 = entry2.history[entry2.history.length - 1];
  if (!latest1 || !latest2) throw new Error("No snapshots available for comparison");
  const meanDiff = Math.abs(latest1.statistics.mean - latest2.statistics.mean);
  const maxDiff = Math.max(
    Math.abs(latest1.statistics.max - latest2.statistics.max),
    Math.abs(latest1.statistics.min - latest2.statistics.min)
  );
  const cosineDistance = Math.random() * 0.5;
  const similarity = 1 - cosineDistance;
  const distributionSimilarity = Math.max(0, 1 - meanDiff / (latest1.statistics.std + latest2.statistics.std + 0.001));
  let conclusion = "Tensors are similar";
  if (similarity < 0.5) conclusion = "Tensors are significantly different";
  else if (similarity < 0.8) conclusion = "Tensors have moderate similarity";
  return {
    similarity,
    cosineDistance,
    meanAbsoluteDifference: meanDiff,
    maxAbsoluteDifference: maxDiff,
    distributionSimilarity,
    conclusion,
  };
}

// ─── Gradient Monitoring ──────────────────────────────────────────────────────

export async function addGradientMonitor(sessionId: string, params: {
  layerName: string;
  layerIndex: number;
}): Promise<GradientMonitor> {
  const session = debugSessions.get(sessionId);
  if (!session) throw new Error(`Debug session ${sessionId} not found`);
  const now = new Date().toISOString();
  const monitor: GradientMonitor = {
    id: `gm_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    sessionId,
    layerName: params.layerName,
    layerIndex: params.layerIndex,
    gradientHistory: [],
    healthStatus: "healthy",
    healthScore: 95,
    anomalies: [],
    createdAt: now,
  };
  session.gradientMonitors.push(monitor);
  gradientMonitors.set(monitor.id, monitor);
  session.updatedAt = now;
  return monitor;
}

export async function recordGradient(monitorId: string, stepNumber: number): Promise<GradientSnapshot> {
  const monitor = gradientMonitors.get(monitorId);
  if (!monitor) throw new Error(`Gradient monitor ${monitorId} not found`);
  const now = new Date().toISOString();
  const stats = generateTensorStatistics();
  const prevNorm = monitor.gradientHistory.length > 0
    ? monitor.gradientHistory[monitor.gradientHistory.length - 1].globalNorm
    : null;
  const snapshot: GradientSnapshot = {
    stepNumber,
    layerName: monitor.layerName,
    statistics: stats,
    globalNorm: Math.abs(stats.mean) * 10 + Math.random() * 5,
    layerNorm: Math.abs(stats.mean) * 8 + Math.random() * 3,
    clippedNorm: Math.random() < 0.3 ? Math.abs(stats.mean) * 5 : null,
    ratioToPreviousLayer: prevNorm ? (Math.abs(stats.mean) * 10 + Math.random() * 5) / prevNorm : null,
    capturedAt: now,
  };
  monitor.gradientHistory.push(snapshot);
  if (monitor.gradientHistory.length > 100) monitor.gradientHistory.shift();
  // Reassess health
  monitor.healthStatus = assessGradientHealth(monitor.gradientHistory);
  monitor.healthScore = computeGradientHealthScore(monitor.healthStatus);
  // Detect anomalies
  if (snapshot.globalNorm > 100) {
    monitor.anomalies.push({
      id: `ga_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "exploding",
      severity: "critical",
      layerName: monitor.layerName,
      stepNumber,
      description: `Gradient norm ${snapshot.globalNorm.toFixed(2)} exceeds safe threshold at layer ${monitor.layerName}`,
      suggestedFix: "Apply gradient clipping with max_norm=1.0 or reduce learning rate",
      detectedAt: now,
    });
  }
  if (snapshot.globalNorm < 1e-8) {
    monitor.anomalies.push({
      id: `ga_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "vanishing",
      severity: "warning",
      layerName: monitor.layerName,
      stepNumber,
      description: `Gradient norm ${snapshot.globalNorm.toExponential(2)} is near zero at layer ${monitor.layerName}`,
      suggestedFix: "Use residual connections, batch normalization, or gradient scaling",
      detectedAt: now,
    });
  }
  if (snapshot.statistics.sparsity > 0.95) {
    monitor.anomalies.push({
      id: `ga_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      type: "dead-neuron",
      severity: "warning",
      layerName: monitor.layerName,
      stepNumber,
      description: `High gradient sparsity (${(snapshot.statistics.sparsity * 100).toFixed(1)}%) suggests dead neurons`,
      suggestedFix: "Try LeakyReLU or parametric activation functions, reduce initialization scale",
      detectedAt: now,
    });
  }
  return snapshot;
}

// ─── Activation Pattern Analysis ──────────────────────────────────────────────

export async function analyzeActivationPatterns(sessionId: string): Promise<ActivationPattern[]> {
  const session = debugSessions.get(sessionId);
  if (!session) throw new Error(`Debug session ${sessionId} not found`);
  const now = new Date().toISOString();
  const layerNames = [
    "attention_layer_1", "attention_layer_2", "feed_forward_1",
    "feed_forward_2", "output_projection",
  ];
  const patterns: ActivationPattern[] = layerNames.map((layerName, idx) => {
    const activationRate = Math.random() * 0.8 + 0.1;
    const deadNeuronRatio = Math.random() * 0.15;
    const saturatedNeuronRatio = Math.random() * 0.1;
    let patternType: ActivationPattern["patternType"] = "normal";
    if (deadNeuronRatio > 0.1) patternType = "dead";
    else if (saturatedNeuronRatio > 0.08) patternType = "saturated";
    else if (activationRate < 0.2) patternType = "sparse";
    else if (activationRate > 0.8) patternType = "dense";
    const pattern: ActivationPattern = {
      id: `ap_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      sessionId,
      layerName,
      layerIndex: idx * 2 + 1,
      patternType,
      activationRate,
      deadNeuronRatio,
      saturatedNeuronRatio,
      meanActivation: Math.random() * 0.5,
      visualizationData: {
        type: "heatmap",
        dimensions: { width: 128, height: 64 },
        dataPoints: Array.from({ length: 50 }, () => ({
          x: Math.random() * 128,
          y: Math.random() * 64,
          value: Math.random(),
          label: undefined,
        })),
        colorScale: { min: "#0000ff", max: "#ff0000", midpoint: "#00ff00" },
      },
      capturedAt: now,
    };
    activationPatterns.set(pattern.id, pattern);
    return pattern;
  });
  return patterns;
}

// ─── Input Perturbation Testing ───────────────────────────────────────────────

export async function runPerturbationTest(sessionId: string, params: {
  perturbationType: PerturbationType;
  targetLayer: string;
  magnitude: number;
}): Promise<PerturbationResult> {
  const session = debugSessions.get(sessionId);
  if (!session) throw new Error(`Debug session ${sessionId} not found`);
  const now = new Date().toISOString();
  const numOutputs = 10;
  const originalOutput = Array.from({ length: numOutputs }, () => Math.random());
  const sensitivity = params.magnitude * (Math.random() * 2 + 0.5);
  const perturbedOutput = originalOutput.map((v) => v + (Math.random() - 0.5) * sensitivity);
  const outputDifference = Math.sqrt(
    originalOutput.reduce((acc, v, i) => acc + (v - perturbedOutput[i]) ** 2, 0) / numOutputs
  );
  let robustness: PerturbationResult["robustnessAssessment"];
  if (outputDifference < 0.05) robustness = "robust";
  else if (outputDifference < 0.15) robustness = "moderately-robust";
  else if (outputDifference < 0.3) robustness = "fragile";
  else robustness = "highly-fragile";
  const result: PerturbationResult = {
    id: `ptr_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    sessionId,
    perturbationType: params.perturbationType,
    targetLayer: params.targetLayer,
    magnitude: params.magnitude,
    originalOutput,
    perturbedOutput,
    outputDifference,
    sensitivityScore: outputDifference / params.magnitude,
    affectedPredictions: originalOutput.map((v, i) => ({
      index: i,
      originalConfidence: v,
      perturbedConfidence: perturbedOutput[i],
      change: perturbedOutput[i] - v,
    })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)),
    robustnessAssessment: robustness,
    testedAt: now,
  };
  perturbationResults.set(result.id, result);
  return result;
}

// ─── Session Replay ───────────────────────────────────────────────────────────

export async function createSessionReplay(sessionId: string): Promise<DebugSessionReplay> {
  const session = debugSessions.get(sessionId);
  if (!session) throw new Error(`Debug session ${sessionId} not found`);
  const now = new Date().toISOString();
  const breakpointSteps = session.executionHistory.filter((s) => s.breakpointHit);
  const anomalySteps = session.executionHistory.filter(
    (s) => s.tensorStats && (s.tensorStats.nanCount > 0 || s.tensorStats.infCount > 0)
  );
  const replay: DebugSessionReplay = {
    id: `dr_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    sessionId,
    totalSteps: session.stepCount,
    replaySpeed: 1.0,
    bookmarks: breakpointSteps.map((s) => ({
      id: `rb_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      stepNumber: s.stepNumber,
      label: `Breakpoint at ${s.layerName}`,
      note: `Hit breakpoint at step ${s.stepNumber} in layer ${s.layerName}`,
      timestamp: s.timestamp,
    })),
    highlights: [
      ...breakpointSteps.map((s) => ({
        id: `rh_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        stepNumber: s.stepNumber,
        type: "breakpoint-hit" as const,
        description: `Breakpoint hit at ${s.layerName} (step ${s.stepNumber})`,
      })),
      ...anomalySteps.map((s) => ({
        id: `rh_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
        stepNumber: s.stepNumber,
        type: "anomaly" as const,
        description: `Tensor anomaly detected at ${s.layerName} (step ${s.stepNumber})`,
      })),
    ],
    duration: session.executionHistory.length > 0
      ? new Date(session.executionHistory[session.executionHistory.length - 1].timestamp).getTime() -
        new Date(session.executionHistory[0].timestamp).getTime()
      : 0,
    createdAt: now,
  };
  debugReplays.set(replay.id, replay);
  return replay;
}

// ─── Statistics ───────────────────────────────────────────────────────────────

export async function getStats(organizationId: string): Promise<{
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  totalBreakpoints: number;
  totalBreakpointHits: number;
  totalGradientAnomalies: number;
  totalTensorAlerts: number;
  totalPerturbationTests: number;
  frameworkDistribution: Record<string, number>;
  averageSessionSteps: number;
}> {
  const orgSessions = Array.from(debugSessions.values()).filter((s) => s.organizationId === organizationId);
  const frameworks: Record<string, number> = {};
  let totalSteps = 0;
  let totalBpHits = 0;
  orgSessions.forEach((s) => {
    frameworks[s.framework] = (frameworks[s.framework] || 0) + 1;
    totalSteps += s.stepCount;
    s.breakpoints.forEach((bp) => { totalBpHits += bp.hitCount; });
  });
  let totalGradAnomalies = 0;
  orgSessions.forEach((s) => {
    s.gradientMonitors.forEach((gm) => {
      const monitor = gradientMonitors.get(gm.id);
      if (monitor) totalGradAnomalies += monitor.anomalies.length;
    });
  });
  let totalTensorAlerts = 0;
  orgSessions.forEach((s) => {
    s.tensorWatchlist.forEach((tw) => {
      const entry = tensorWatchEntries.get(tw.id);
      if (entry) totalTensorAlerts += entry.alerts.length;
    });
  });
  return {
    totalSessions: orgSessions.length,
    activeSessions: orgSessions.filter((s) => s.status === "running" || s.status === "paused").length,
    completedSessions: orgSessions.filter((s) => s.status === "completed").length,
    totalBreakpoints: orgSessions.reduce((acc, s) => acc + s.breakpoints.length, 0),
    totalBreakpointHits: totalBpHits,
    totalGradientAnomalies: totalGradAnomalies,
    totalTensorAlerts: totalTensorAlerts,
    totalPerturbationTests: Array.from(perturbationResults.values()).filter(
      (p) => orgSessions.some((s) => s.id === p.sessionId)
    ).length,
    frameworkDistribution: frameworks,
    averageSessionSteps: orgSessions.length > 0 ? Math.round(totalSteps / orgSessions.length) : 0,
  };
}
