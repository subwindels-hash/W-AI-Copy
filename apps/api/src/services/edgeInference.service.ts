/**
 * Module 37: Edge Inference Service
 *
 * Provides on-device AI inference execution, model optimization (quantization,
 * pruning, distillation), inference performance monitoring, model format
 * conversion, and A/B testing for edge deployments.
 *
 * Phase 1 — Critical Gap: Edge inference and model optimization infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:edgeInference');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type EdgeModelFormat = "tflite" | "onnx" | "coreml" | "tensorrt" | "openvino" | "pytorch-mobile" | "custom";

export type OptimizationType = "quantization" | "pruning" | "distillation" | "compression" | "none";

export type QuantizationType = "int8" | "int16" | "float16" | "dynamic" | "static" | "qat";

export type InferenceStatus = "pending" | "running" | "completed" | "failed" | "timeout";

export type ABTestStatus = "planned" | "running" | "completed" | "cancelled";

export interface EdgeOptimizedModel {
  id: string;
  organizationId: string;
  sourceModelId: string;
  sourceModelName: string;
  sourceModelVersion: string;
  optimizedModelName: string;
  format: EdgeModelFormat;
  optimizationType: OptimizationType;
  optimizationConfig: OptimizationConfig;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  compressionRatio: number;
  originalAccuracy?: number;
  optimizedAccuracy?: number;
  accuracyDrop?: number;
  inferenceLatencyMs?: number;
  memoryUsageMb?: number;
  supportedDevices: string[];
  downloadUrl?: string;
  checksum?: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OptimizationConfig {
  quantization?: {
    type: QuantizationType;
    calibrationDataset?: string;
    numCalibrationSamples?: number;
  };
  pruning?: {
    targetSparsity: number;
    method: "magnitude" | "random" | "structured";
    fineTuneEpochs?: number;
  };
  distillation?: {
    teacherModelId: string;
    temperature: number;
    alpha: number;
    epochs: number;
  };
  compression?: {
    method: "weight-clustering" | "weight-sharing" | "huffman";
    numClusters?: number;
  };
}

export interface EdgeInferenceJob {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  nodeId: string;
  nodeName: string;
  status: InferenceStatus;
  input: EdgeInferenceInput;
  output?: EdgeInferenceOutput;
  performance: InferencePerformance;
  error?: { code: string; message: string };
  startedAt: string;
  completedAt?: string;
  metadata: Record<string, unknown>;
}

export interface EdgeInferenceInput {
  type: "image" | "text" | "audio" | "video" | "sensor" | "custom";
  data: unknown;
  shape?: number[];
  dtype?: string;
  preprocessing?: {
    resize?: { width: number; height: number };
    normalize?: { mean: number[]; std: number[] };
    augmentations?: string[];
  };
}

export interface EdgeInferenceOutput {
  predictions: Array<{
    label?: string;
    class?: number;
    confidence: number;
    boundingBox?: { x: number; y: number; width: number; height: number };
    keypoints?: Array<{ x: number; y: number; confidence: number }>;
    embedding?: number[];
    raw?: unknown;
  }>;
  processingTimeMs: number;
  modelVersion: string;
}

export interface InferencePerformance {
  latencyMs: number;
  throughputPerSecond: number;
  memoryUsageMb: number;
  cpuUsagePercent: number;
  gpuUsagePercent?: number;
  powerConsumptionW?: number;
  temperature?: number;
  queueDepth: number;
}

export interface EdgeABTest {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: ABTestStatus;
  variants: ABTestVariant[];
  trafficSplit: Record<string, number>; // variantId -> percentage
  metrics: ABTestMetrics;
  winner?: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ABTestVariant {
  id: string;
  name: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  trafficPercent: number;
  metrics: {
    inferenceCount: number;
    averageLatencyMs: number;
    accuracy?: number;
    errorRate: number;
  };
}

export interface ABTestMetrics {
  totalInferences: number;
  averageLatencyMs: number;
  overallAccuracy?: number;
  statisticalSignificance: number;
  confidenceLevel: number;
  recommendations: string[];
}

export interface EdgeInferenceStats {
  totalInferences: number;
  inferencesByModel: Record<string, number>;
  inferencesByNode: Record<string, number>;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  averageAccuracy: number;
  errorRate: number;
  totalOptimizedModels: number;
  averageCompressionRatio: number;
  averageAccuracyDrop: number;
  activeABTests: number;
  completedABTests: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const optimizedModels = new Map<string, EdgeOptimizedModel>();
const inferenceJobs = new Map<string, EdgeInferenceJob>();
const abTests = new Map<string, EdgeABTest>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Optimize a model for edge deployment
 */
export async function optimizeModelForEdge(params: {
  organizationId: string;
  sourceModelId: string;
  sourceModelName: string;
  sourceModelVersion: string;
  optimizedModelName: string;
  format: EdgeModelFormat;
  optimizationType: OptimizationType;
  optimizationConfig: OptimizationConfig;
  originalSizeBytes: number;
  originalAccuracy?: number;
  supportedDevices?: string[];
  metadata?: Record<string, unknown>;
  createdBy: string;
}): Promise<EdgeOptimizedModel> {
  const now = new Date().toISOString();

  // Simulate optimization
  const compressionRatio = calculateCompressionRatio(params.optimizationType, params.optimizationConfig);
  const optimizedSizeBytes = Math.round(params.originalSizeBytes * compressionRatio);
  const accuracyDrop = calculateAccuracyDrop(params.optimizationType, params.optimizationConfig);
  const optimizedAccuracy = params.originalAccuracy ? params.originalAccuracy - accuracyDrop : undefined;

  const model: EdgeOptimizedModel = {
    id: `edge_model_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    sourceModelId: params.sourceModelId,
    sourceModelName: params.sourceModelName,
    sourceModelVersion: params.sourceModelVersion,
    optimizedModelName: params.optimizedModelName,
    format: params.format,
    optimizationType: params.optimizationType,
    optimizationConfig: params.optimizationConfig,
    originalSizeBytes: params.originalSizeBytes,
    optimizedSizeBytes,
    compressionRatio,
    originalAccuracy: params.originalAccuracy,
    optimizedAccuracy,
    accuracyDrop,
    inferenceLatencyMs: estimateInferenceLatency(params.format, optimizedSizeBytes),
    memoryUsageMb: estimateMemoryUsage(optimizedSizeBytes),
    supportedDevices: params.supportedDevices ?? ["generic"],
    downloadUrl: `https://models.example.com/edge/${randomUUID()}.${params.format}`,
    checksum: randomUUID(),
    metadata: params.metadata ?? {},
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  optimizedModels.set(model.id, model);
  return model;
}

/**
 * Get optimized model by ID
 */
export async function getOptimizedModel(modelId: string): Promise<EdgeOptimizedModel | null> {
  return optimizedModels.get(modelId) ?? null;
}

/**
 * List optimized models for an organization
 */
export async function listOptimizedModels(
  organizationId: string,
  filters?: {
    format?: EdgeModelFormat;
    optimizationType?: OptimizationType;
    limit?: number;
  }
): Promise<EdgeOptimizedModel[]> {
  let result = Array.from(optimizedModels.values()).filter(
    m => m.organizationId === organizationId
  );

  if (filters?.format) result = result.filter(m => m.format === filters.format);
  if (filters?.optimizationType) result = result.filter(m => m.optimizationType === filters.optimizationType);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Execute inference on edge device
 */
export async function executeEdgeInference(params: {
  organizationId: string;
  modelId: string;
  nodeId: string;
  nodeName: string;
  input: EdgeInferenceInput;
  metadata?: Record<string, unknown>;
}): Promise<EdgeInferenceJob> {
  const model = optimizedModels.get(params.modelId);
  if (!model) throw new Error(`Model ${params.modelId} not found`);

  const now = new Date().toISOString();
  const startTime = Date.now();

  const job: EdgeInferenceJob = {
    id: `edge_infer_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: model.optimizedModelName,
    nodeId: params.nodeId,
    nodeName: params.nodeName,
    status: "running",
    input: params.input,
    performance: {
      latencyMs: 0,
      throughputPerSecond: 0,
      memoryUsageMb: model.memoryUsageMb ?? 0,
      cpuUsagePercent: 20 + _rng.next() * 30,
      gpuUsagePercent: model.format === "tensorrt" ? 40 + _rng.next() * 40 : undefined,
      queueDepth: Math.floor(_rng.next() * 5),
    },
    startedAt: now,
    metadata: params.metadata ?? {},
  };

  inferenceJobs.set(job.id, job);

  // Simulate inference
  const processingTimeMs = (model.inferenceLatencyMs ?? 50) + _rng.next() * 20;
  const predictions = generatePredictions(params.input.type);

  job.status = "completed";
  job.output = {
    predictions,
    processingTimeMs,
    modelVersion: model.sourceModelVersion,
  };
  job.performance.latencyMs = processingTimeMs;
  job.performance.throughputPerSecond = 1000 / processingTimeMs;
  job.completedAt = new Date().toISOString();

  inferenceJobs.set(job.id, job);
  return job;
}

/**
 * Get inference job by ID
 */
export async function getInferenceJob(jobId: string): Promise<EdgeInferenceJob | null> {
  return inferenceJobs.get(jobId) ?? null;
}

/**
 * List inference jobs
 */
export async function listInferenceJobs(
  organizationId: string,
  filters?: {
    modelId?: string;
    nodeId?: string;
    status?: InferenceStatus;
    limit?: number;
  }
): Promise<EdgeInferenceJob[]> {
  let result = Array.from(inferenceJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(j => j.modelId === filters.modelId);
  if (filters?.nodeId) result = result.filter(j => j.nodeId === filters.nodeId);
  if (filters?.status) result = result.filter(j => j.status === filters.status);

  return result
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Create A/B test for edge models
 */
export async function createEdgeABTest(params: {
  organizationId: string;
  name: string;
  description?: string;
  variants: Array<{
    name: string;
    modelId: string;
    modelName: string;
    modelVersion: string;
    trafficPercent: number;
  }>;
  createdBy: string;
}): Promise<EdgeABTest> {
  const now = new Date().toISOString();

  const totalTraffic = params.variants.reduce((sum, v) => sum + v.trafficPercent, 0);
  if (Math.abs(totalTraffic - 100) > 0.01) {
    throw new Error(`Traffic split must sum to 100%, got ${totalTraffic}%`);
  }

  const variants: ABTestVariant[] = params.variants.map(v => ({
    id: `variant_${randomUUID().slice(0, 8)}`,
    name: v.name,
    modelId: v.modelId,
    modelName: v.modelName,
    modelVersion: v.modelVersion,
    trafficPercent: v.trafficPercent,
    metrics: {
      inferenceCount: 0,
      averageLatencyMs: 0,
      errorRate: 0,
    },
  }));

  const trafficSplit: Record<string, number> = {};
  for (const variant of variants) {
    trafficSplit[variant.id] = variant.trafficPercent;
  }

  const abTest: EdgeABTest = {
    id: `ab_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    status: "planned",
    variants,
    trafficSplit,
    metrics: {
      totalInferences: 0,
      averageLatencyMs: 0,
      statisticalSignificance: 0,
      confidenceLevel: 0,
      recommendations: [],
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  abTests.set(abTest.id, abTest);
  return abTest;
}

/**
 * Start A/B test
 */
export async function startABTest(testId: string): Promise<EdgeABTest | null> {
  const test = abTests.get(testId);
  if (!test) return null;

  test.status = "running";
  test.startedAt = new Date().toISOString();
  test.updatedAt = test.startedAt;
  abTests.set(testId, test);
  return test;
}

/**
 * Record A/B test inference
 */
export async function recordABTestInference(
  testId: string,
  variantId: string,
  latencyMs: number,
  accuracy?: number,
  isError: boolean = false
): Promise<void> {
  const test = abTests.get(testId);
  if (!test || test.status !== "running") return;

  const variant = test.variants.find(v => v.id === variantId);
  if (!variant) return;

  // Update variant metrics
  variant.metrics.inferenceCount++;
  variant.metrics.averageLatencyMs =
    (variant.metrics.averageLatencyMs * (variant.metrics.inferenceCount - 1) + latencyMs) /
    variant.metrics.inferenceCount;
  if (accuracy !== undefined) {
    variant.metrics.accuracy =
      ((variant.metrics.accuracy ?? 0) * (variant.metrics.inferenceCount - 1) + accuracy) /
      variant.metrics.inferenceCount;
  }
  if (isError) {
    variant.metrics.errorRate =
      (variant.metrics.errorRate * (variant.metrics.inferenceCount - 1) + 1) /
      variant.metrics.inferenceCount;
  }

  // Update test metrics
  test.metrics.totalInferences++;
  test.metrics.averageLatencyMs =
    (test.metrics.averageLatencyMs * (test.metrics.totalInferences - 1) + latencyMs) /
    test.metrics.totalInferences;

  // Calculate statistical significance (simplified)
  if (test.metrics.totalInferences > 100) {
    test.metrics.statisticalSignificance = Math.min(1, test.metrics.totalInferences / 1000);
    test.metrics.confidenceLevel = test.metrics.statisticalSignificance * 95;
  }

  test.updatedAt = new Date().toISOString();
  abTests.set(testId, test);
}

/**
 * Complete A/B test and determine winner
 */
export async function completeABTest(testId: string): Promise<EdgeABTest | null> {
  const test = abTests.get(testId);
  if (!test) return null;

  test.status = "completed";
  test.completedAt = new Date().toISOString();

  // Determine winner based on latency and accuracy
  const sortedVariants = [...test.variants].sort((a, b) => {
    // Prioritize lower latency, then higher accuracy
    if (a.metrics.averageLatencyMs !== b.metrics.averageLatencyMs) {
      return a.metrics.averageLatencyMs - b.metrics.averageLatencyMs;
    }
    return (b.metrics.accuracy ?? 0) - (a.metrics.accuracy ?? 0);
  });

  test.winner = sortedVariants[0]?.id;

  // Generate recommendations
  test.metrics.recommendations = [];
  if (test.winner) {
    const winner = test.variants.find(v => v.id === test.winner);
    if (winner) {
      test.metrics.recommendations.push(
        `Deploy ${winner.name} (${winner.modelName} v${winner.modelVersion}) to production`
      );
      test.metrics.recommendations.push(
        `Expected latency improvement: ${Math.round(
          sortedVariants[sortedVariants.length - 1].metrics.averageLatencyMs -
          winner.metrics.averageLatencyMs
        )}ms`
      );
    }
  }

  test.updatedAt = test.completedAt;
  abTests.set(testId, test);
  return test;
}

/**
 * Get A/B test by ID
 */
export async function getABTest(testId: string): Promise<EdgeABTest | null> {
  return abTests.get(testId) ?? null;
}

/**
 * List A/B tests
 */
export async function listABTests(
  organizationId: string,
  status?: ABTestStatus
): Promise<EdgeABTest[]> {
  let result = Array.from(abTests.values()).filter(
    t => t.organizationId === organizationId
  );

  if (status) result = result.filter(t => t.status === status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Get edge inference statistics
 */
export async function getEdgeInferenceStats(organizationId: string): Promise<EdgeInferenceStats> {
  const allModels = Array.from(optimizedModels.values()).filter(
    m => m.organizationId === organizationId
  );
  const allJobs = Array.from(inferenceJobs.values()).filter(
    j => j.organizationId === organizationId
  );
  const allTests = Array.from(abTests.values()).filter(
    t => t.organizationId === organizationId
  );

  const inferencesByModel: Record<string, number> = {};
  const inferencesByNode: Record<string, number> = {};
  let totalLatency = 0;
  let totalAccuracy = 0;
  let accuracyCount = 0;
  let errorCount = 0;
  const latencies: number[] = [];

  for (const job of allJobs) {
    inferencesByModel[job.modelId] = (inferencesByModel[job.modelId] || 0) + 1;
    inferencesByNode[job.nodeId] = (inferencesByNode[job.nodeId] || 0) + 1;
    if (job.output) {
      totalLatency += job.output.processingTimeMs;
      latencies.push(job.output.processingTimeMs);
      const maxConfidence = Math.max(...job.output.predictions.map(p => p.confidence));
      totalAccuracy += maxConfidence;
      accuracyCount++;
    }
    if (job.status === "failed") errorCount++;
  }

  latencies.sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);
  const p99Index = Math.floor(latencies.length * 0.99);

  const totalCompressionRatio = allModels.reduce((sum, m) => sum + m.compressionRatio, 0);
  const totalAccuracyDrop = allModels
    .filter(m => m.accuracyDrop !== undefined)
    .reduce((sum, m) => sum + (m.accuracyDrop ?? 0), 0);
  const accuracyDropCount = allModels.filter(m => m.accuracyDrop !== undefined).length;

  return {
    totalInferences: allJobs.length,
    inferencesByModel,
    inferencesByNode,
    averageLatencyMs: allJobs.length > 0 ? Math.round(totalLatency / allJobs.length) : 0,
    p95LatencyMs: latencies[p95Index] ?? 0,
    p99LatencyMs: latencies[p99Index] ?? 0,
    averageAccuracy: accuracyCount > 0 ? Math.round((totalAccuracy / accuracyCount) * 100) / 100 : 0,
    errorRate: allJobs.length > 0 ? Math.round((errorCount / allJobs.length) * 10000) / 100 : 0,
    totalOptimizedModels: allModels.length,
    averageCompressionRatio: allModels.length > 0
      ? Math.round((totalCompressionRatio / allModels.length) * 100) / 100
      : 0,
    averageAccuracyDrop: accuracyDropCount > 0
      ? Math.round((totalAccuracyDrop / accuracyDropCount) * 10000) / 100
      : 0,
    activeABTests: allTests.filter(t => t.status === "running").length,
    completedABTests: allTests.filter(t => t.status === "completed").length,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calculateCompressionRatio(type: OptimizationType, config: OptimizationConfig): number {
  switch (type) {
    case "quantization":
      if (config.quantization?.type === "int8") return 0.25;
      if (config.quantization?.type === "int16") return 0.5;
      if (config.quantization?.type === "float16") return 0.5;
      return 0.6;
    case "pruning":
      return 1 - (config.pruning?.targetSparsity ?? 0.5);
    case "distillation":
      return 0.3;
    case "compression":
      return 0.7;
    default:
      return 1;
  }
}

function calculateAccuracyDrop(type: OptimizationType, config: OptimizationConfig): number {
  switch (type) {
    case "quantization":
      if (config.quantization?.type === "int8") return 0.02;
      return 0.01;
    case "pruning":
      return (config.pruning?.targetSparsity ?? 0.5) * 0.05;
    case "distillation":
      return 0.015;
    case "compression":
      return 0.005;
    default:
      return 0;
  }
}

function estimateInferenceLatency(format: EdgeModelFormat, sizeBytes: number): number {
  const baseLatency = 20;
  const sizeFactor = Math.log10(sizeBytes / 1000000) * 10;
  
  const formatMultiplier: Record<EdgeModelFormat, number> = {
    tflite: 1.0,
    onnx: 1.1,
    coreml: 0.9,
    tensorrt: 0.7,
    openvino: 0.8,
    "pytorch-mobile": 1.2,
    custom: 1.0,
  };

  return Math.max(5, baseLatency + sizeFactor * (formatMultiplier[format] ?? 1));
}

function estimateMemoryUsage(sizeBytes: number): number {
  return Math.round((sizeBytes / 1024 / 1024) * 1.5); // Model size + runtime overhead
}

function generatePredictions(inputType: string): EdgeInferenceOutput["predictions"] {
  if (inputType === "image") {
    return [
      {
        label: "object",
        class: 1,
        confidence: 0.85 + _rng.next() * 0.15,
        boundingBox: {
          x: 0.1 + _rng.next() * 0.3,
          y: 0.1 + _rng.next() * 0.3,
          width: 0.2 + _rng.next() * 0.3,
          height: 0.2 + _rng.next() * 0.3,
        },
      },
    ];
  }
  if (inputType === "text") {
    return [
      {
        label: "positive",
        class: 1,
        confidence: 0.7 + _rng.next() * 0.3,
      },
    ];
  }
  return [
    {
      label: "prediction",
      class: 0,
      confidence: 0.8 + _rng.next() * 0.2,
    },
  ];
}
