/**
 * Module 42: Model Quantization Service
 *
 * Provides comprehensive model quantization workflows including post-training
 * quantization (PTQ), quantization-aware training (QAT), calibration dataset
 * management, accuracy validation, and format conversion for efficient model
 * deployment.
 *
 * Phase 1 — Critical Gap: Model quantization infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:modelQuantization');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type QuantizationJobStatus = "pending" | "calibrating" | "quantizing" | "validating" | "completed" | "failed" | "cancelled";

export type QuantizationMethod = "post_training" | "quantization_aware_training" | "dynamic" | "static";

export type QuantizationPrecision = "int8" | "int16" | "float16" | "bfloat16" | "int4" | "mixed";

export type QuantizationScheme = "symmetric" | "asymmetric" | "per_tensor" | "per_channel";

export type ModelFramework = "pytorch" | "tensorflow" | "onnx" | "tflite" | "coreml" | "tensorrt";

export interface QuantizationJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: QuantizationJobStatus;
  sourceModel: SourceModel;
  quantizationConfig: QuantizationConfig;
  calibrationDataset?: CalibrationDataset;
  result?: QuantizationResult;
  error?: { code: string; message: string; step?: string };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface SourceModel {
  modelId: string;
  modelName: string;
  modelVersion: string;
  framework: ModelFramework;
  format: string;
  sizeBytes: number;
  downloadUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface QuantizationConfig {
  method: QuantizationMethod;
  precision: QuantizationPrecision;
  scheme: QuantizationScheme;
  targetLayers?: string[];
  excludeLayers?: string[];
  calibrationConfig?: {
    numSamples: number;
    batchSize: number;
    dataSource: "dataset" | "synthetic" | "representative";
  };
  qatConfig?: {
    epochs: number;
    learningRate: number;
    batchSize: number;
    validationFrequency: number;
  };
  optimizationGoals: {
    prioritizeSpeed: boolean;
    prioritizeSize: boolean;
    prioritizeAccuracy: boolean;
    maxAccuracyDrop?: number; // percentage
    targetCompressionRatio?: number;
  };
  outputFormats: ModelFramework[];
}

export interface CalibrationDataset {
  id: string;
  name: string;
  description?: string;
  numSamples: number;
  sampleShape: number[];
  dataType: string;
  storageUrl: string;
  statistics?: {
    mean?: number[];
    std?: number[];
    min?: number[];
    max?: number[];
  };
  createdAt: string;
}

export interface QuantizationResult {
  quantizedModelId: string;
  quantizedModelName: string;
  quantizedModelVersion: string;
  originalSizeBytes: number;
  quantizedSizeBytes: number;
  compressionRatio: number;
  sizeReductionPercent: number;
  originalAccuracy?: ModelAccuracy;
  quantizedAccuracy?: ModelAccuracy;
  accuracyDrop?: number; // percentage
  accuracyDropPercent?: number;
  performanceMetrics: PerformanceMetrics;
  quantizationDetails: QuantizationDetails;
  outputModels: OutputModel[];
  validationReport: ValidationReport;
  recommendations: string[];
}

export interface ModelAccuracy {
  overall: number;
  byClass?: Record<string, number>;
  metrics: Record<string, number>; // accuracy, precision, recall, f1, etc.
  dataset: string;
  evaluatedAt: string;
}

export interface PerformanceMetrics {
  inferenceLatencyMs: {
    original: number;
    quantized: number;
    speedup: number;
  };
  throughputPerSecond: {
    original: number;
    quantized: number;
    improvement: number;
  };
  memoryUsageMb: {
    original: number;
    quantized: number;
    reduction: number;
  };
  powerConsumptionW?: {
    original: number;
    quantized: number;
    reduction: number;
  };
}

export interface QuantizationDetails {
  method: QuantizationMethod;
  precision: QuantizationPrecision;
  scheme: QuantizationScheme;
  numQuantizedLayers: number;
  numTotalLayers: number;
  quantizedLayerPercent: number;
  calibrationSamplesUsed?: number;
  calibrationTimeMs?: number;
  quantizationTimeMs: number;
  totalProcessingTimeMs: number;
  layerWiseDetails?: LayerQuantizationDetail[];
}

export interface LayerQuantizationDetail {
  layerName: string;
  layerType: string;
  quantized: boolean;
  originalPrecision: string;
  quantizedPrecision: string;
  scale?: number;
  zeroPoint?: number;
  accuracyImpact?: number;
}

export interface OutputModel {
  format: ModelFramework;
  sizeBytes: number;
  downloadUrl: string;
  checksum: string;
  metadata?: Record<string, unknown>;
}

export interface ValidationReport {
  passed: boolean;
  accuracyValidation: {
    passed: boolean;
    originalAccuracy: number;
    quantizedAccuracy: number;
    drop: number;
    threshold: number;
  };
  performanceValidation: {
    passed: boolean;
    speedupAchieved: boolean;
    targetSpeedup?: number;
    actualSpeedup: number;
  };
  sizeValidation: {
    passed: boolean;
    compressionAchieved: boolean;
    targetCompression?: number;
    actualCompression: number;
  };
  warnings: string[];
  errors: string[];
}

export interface QuantizationStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageCompressionRatio: number;
  averageAccuracyDrop: number;
  averageSpeedup: number;
  jobsByMethod: Record<string, number>;
  jobsByPrecision: Record<string, number>;
  totalSizeSavedBytes: number;
  outputFormats: Record<string, number>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const quantizationJobs = new Map<string, QuantizationJob>();
const calibrationDatasets = new Map<string, CalibrationDataset>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a calibration dataset
 */
export async function createCalibrationDataset(params: {
  organizationId: string;
  name: string;
  description?: string;
  numSamples: number;
  sampleShape: number[];
  dataType: string;
  storageUrl: string;
  statistics?: CalibrationDataset["statistics"];
}): Promise<CalibrationDataset> {
  const now = new Date().toISOString();

  const dataset: CalibrationDataset = {
    id: `calib_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    name: params.name,
    description: params.description,
    numSamples: params.numSamples,
    sampleShape: params.sampleShape,
    dataType: params.dataType,
    storageUrl: params.storageUrl,
    statistics: params.statistics,
    createdAt: now,
  };

  calibrationDatasets.set(dataset.id, dataset);
  return dataset;
}

/**
 * Get calibration dataset by ID
 */
export async function getCalibrationDataset(datasetId: string): Promise<CalibrationDataset | null> {
  return calibrationDatasets.get(datasetId) ?? null;
}

/**
 * List calibration datasets
 */
export async function listCalibrationDatasets(
  organizationId: string,
  limit: number = 50
): Promise<CalibrationDataset[]> {
  return Array.from(calibrationDatasets.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/**
 * Create a quantization job
 */
export async function createQuantizationJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  sourceModel: SourceModel;
  quantizationConfig: QuantizationConfig;
  calibrationDatasetId?: string;
  createdBy: string;
}): Promise<QuantizationJob> {
  const now = new Date().toISOString();

  let calibrationDataset: CalibrationDataset | undefined;
  if (params.calibrationDatasetId) {
    calibrationDataset = calibrationDatasets.get(params.calibrationDatasetId) ?? undefined;
    if (!calibrationDataset) {
      throw new Error(`Calibration dataset ${params.calibrationDatasetId} not found`);
    }
  }

  const job: QuantizationJob = {
    id: `quant_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "pending",
    sourceModel: params.sourceModel,
    quantizationConfig: params.quantizationConfig,
    calibrationDataset,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  quantizationJobs.set(job.id, job);

  // Start quantization process
  setTimeout(() => executeQuantizationJob(job.id), 100);

  return job;
}

/**
 * Get quantization job by ID
 */
export async function getQuantizationJob(jobId: string): Promise<QuantizationJob | null> {
  return quantizationJobs.get(jobId) ?? null;
}

/**
 * List quantization jobs
 */
export async function listQuantizationJobs(
  organizationId: string,
  filters?: {
    status?: QuantizationJobStatus;
    method?: QuantizationMethod;
    precision?: QuantizationPrecision;
    limit?: number;
  }
): Promise<QuantizationJob[]> {
  let result = Array.from(quantizationJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.method) result = result.filter(j => j.quantizationConfig.method === filters.method);
  if (filters?.precision) result = result.filter(j => j.quantizationConfig.precision === filters.precision);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Cancel a quantization job
 */
export async function cancelQuantizationJob(jobId: string): Promise<QuantizationJob | null> {
  const job = quantizationJobs.get(jobId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Cannot cancel job in status: ${job.status}`);
  }

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();

  quantizationJobs.set(jobId, job);
  return job;
}

/**
 * Get quantization statistics
 */
export async function getQuantizationStats(organizationId: string): Promise<QuantizationStats> {
  const jobs = Array.from(quantizationJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  const completedJobs = jobs.filter(j => j.status === "completed");
  const failedJobs = jobs.filter(j => j.status === "failed");

  let totalCompressionRatio = 0;
  let totalAccuracyDrop = 0;
  let totalSpeedup = 0;
  let totalSizeSaved = 0;
  const jobsByMethod: Record<string, number> = {};
  const jobsByPrecision: Record<string, number> = {};
  const outputFormats: Record<string, number> = {};

  for (const job of completedJobs) {
    if (job.result) {
      totalCompressionRatio += job.result.compressionRatio;
      totalAccuracyDrop += job.result.accuracyDropPercent ?? 0;
      totalSpeedup += job.result.performanceMetrics.inferenceLatencyMs.speedup;
      totalSizeSaved += job.result.originalSizeBytes - job.result.quantizedSizeBytes;

      for (const output of job.result.outputModels) {
        outputFormats[output.format] = (outputFormats[output.format] || 0) + 1;
      }
    }

    jobsByMethod[job.quantizationConfig.method] = (jobsByMethod[job.quantizationConfig.method] || 0) + 1;
    jobsByPrecision[job.quantizationConfig.precision] = (jobsByPrecision[job.quantizationConfig.precision] || 0) + 1;
  }

  return {
    totalJobs: jobs.length,
    completedJobs: completedJobs.length,
    failedJobs: failedJobs.length,
    averageCompressionRatio: completedJobs.length > 0 ? totalCompressionRatio / completedJobs.length : 0,
    averageAccuracyDrop: completedJobs.length > 0 ? totalAccuracyDrop / completedJobs.length : 0,
    averageSpeedup: completedJobs.length > 0 ? totalSpeedup / completedJobs.length : 0,
    jobsByMethod,
    jobsByPrecision,
    totalSizeSavedBytes: totalSizeSaved,
    outputFormats,
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

async function executeQuantizationJob(jobId: string): Promise<void> {
  const job = quantizationJobs.get(jobId);
  if (!job) return;

  try {
    job.status = "calibrating";
    job.startedAt = new Date().toISOString();
    job.updatedAt = job.startedAt;
    quantizationJobs.set(jobId, job);

    // Simulate calibration
    const calibrationTimeMs = job.calibrationDataset ? 5000 + _rng.next() * 10000 : 0;
    await new Promise(resolve => setTimeout(resolve, Math.min(calibrationTimeMs, 100)));

    job.status = "quantizing";
    job.updatedAt = new Date().toISOString();
    quantizationJobs.set(jobId, job);

    // Simulate quantization
    const quantizationTimeMs = 10000 + _rng.next() * 20000;
    await new Promise(resolve => setTimeout(resolve, Math.min(quantizationTimeMs, 100)));

    job.status = "validating";
    job.updatedAt = new Date().toISOString();
    quantizationJobs.set(jobId, job);

    // Simulate validation
    await new Promise(resolve => setTimeout(resolve, 50));

    // Generate results
    const result = generateQuantizationResult(job);
    job.result = result;
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;

    quantizationJobs.set(jobId, job);
  } catch (error) {
    job.status = "failed";
    job.error = {
      code: "QUANTIZATION_ERROR",
      message: error instanceof Error ? error.message : String(error),
      step: job.status,
    };
    job.updatedAt = new Date().toISOString();
    quantizationJobs.set(jobId, job);
  }
}

function generateQuantizationResult(job: QuantizationJob): QuantizationResult {
  const config = job.quantizationConfig;
  const source = job.sourceModel;

  // Calculate compression based on precision
  const precisionCompression: Record<QuantizationPrecision, number> = {
    int4: 0.125,
    int8: 0.25,
    int16: 0.5,
    float16: 0.5,
    bfloat16: 0.5,
    mixed: 0.4,
  };

  const compressionRatio = precisionCompression[config.precision] ?? 0.5;
  const quantizedSizeBytes = Math.round(source.sizeBytes * compressionRatio);
  const sizeReductionPercent = ((source.sizeBytes - quantizedSizeBytes) / source.sizeBytes) * 100;

  // Calculate accuracy drop based on method and precision
  const baseAccuracyDrop: Record<QuantizationPrecision, number> = {
    int4: 5.0,
    int8: 1.5,
    int16: 0.5,
    float16: 0.3,
    bfloat16: 0.4,
    mixed: 1.0,
  };

  const methodMultiplier: Record<QuantizationMethod, number> = {
    post_training: 1.0,
    quantization_aware_training: 0.5,
    dynamic: 0.8,
    static: 1.0,
  };

  const accuracyDropPercent = (baseAccuracyDrop[config.precision] ?? 1.0) * (methodMultiplier[config.method] ?? 1.0);
  const accuracyDrop = accuracyDropPercent / 100;

  // Generate original accuracy (simulated)
  const originalAccuracy: ModelAccuracy = {
    overall: 0.92 + _rng.next() * 0.05,
    metrics: {
      accuracy: 0.92 + _rng.next() * 0.05,
      precision: 0.91 + _rng.next() * 0.05,
      recall: 0.90 + _rng.next() * 0.05,
      f1: 0.91 + _rng.next() * 0.05,
    },
    dataset: "validation_set",
    evaluatedAt: new Date().toISOString(),
  };

  // Generate quantized accuracy
  const quantizedAccuracy: ModelAccuracy = {
    overall: originalAccuracy.overall - accuracyDrop,
    metrics: {
      accuracy: originalAccuracy.metrics.accuracy - accuracyDrop,
      precision: originalAccuracy.metrics.precision - accuracyDrop * 0.8,
      recall: originalAccuracy.metrics.recall - accuracyDrop * 0.9,
      f1: originalAccuracy.metrics.f1 - accuracyDrop * 0.85,
    },
    dataset: "validation_set",
    evaluatedAt: new Date().toISOString(),
  };

  // Generate performance metrics
  const speedup = 1 / compressionRatio * 0.8; // Realistic speedup
  const performanceMetrics: PerformanceMetrics = {
    inferenceLatencyMs: {
      original: 50 + _rng.next() * 50,
      quantized: (50 + _rng.next() * 50) / speedup,
      speedup,
    },
    throughputPerSecond: {
      original: 20 + _rng.next() * 20,
      quantized: (20 + _rng.next() * 20) * speedup,
      improvement: speedup,
    },
    memoryUsageMb: {
      original: source.sizeBytes / 1024 / 1024 * 1.5,
      quantized: quantizedSizeBytes / 1024 / 1024 * 1.5,
      reduction: compressionRatio,
    },
  };

  // Generate quantization details
  const numTotalLayers = 50 + Math.floor(_rng.next() * 50);
  const numQuantizedLayers = Math.floor(numTotalLayers * 0.9); // 90% of layers quantized
  const quantizationDetails: QuantizationDetails = {
    method: config.method,
    precision: config.precision,
    scheme: config.scheme,
    numQuantizedLayers,
    numTotalLayers,
    quantizedLayerPercent: (numQuantizedLayers / numTotalLayers) * 100,
    calibrationSamplesUsed: job.calibrationDataset?.numSamples,
    calibrationTimeMs: job.calibrationDataset ? 5000 + _rng.next() * 10000 : undefined,
    quantizationTimeMs: 10000 + _rng.next() * 20000,
    totalProcessingTimeMs: 20000 + _rng.next() * 30000,
  };

  // Generate output models
  const outputModels: OutputModel[] = config.outputFormats.map(format => ({
    format,
    sizeBytes: quantizedSizeBytes,
    downloadUrl: `https://models.example.com/quantized/${randomUUID()}.${format}`,
    checksum: randomUUID(),
  }));

  // Generate validation report
  const maxAccuracyDrop = config.optimizationGoals.maxAccuracyDrop ?? 5.0;
  const validationReport: ValidationReport = {
    passed: accuracyDropPercent <= maxAccuracyDrop,
    accuracyValidation: {
      passed: accuracyDropPercent <= maxAccuracyDrop,
      originalAccuracy: originalAccuracy.overall,
      quantizedAccuracy: quantizedAccuracy.overall,
      drop: accuracyDropPercent,
      threshold: maxAccuracyDrop,
    },
    performanceValidation: {
      passed: speedup >= 1.5,
      speedupAchieved: speedup >= 1.5,
      actualSpeedup: speedup,
    },
    sizeValidation: {
      passed: compressionRatio <= 0.5,
      compressionAchieved: compressionRatio <= 0.5,
      actualCompression: compressionRatio,
    },
    warnings: [],
    errors: [],
  };

  if (accuracyDropPercent > maxAccuracyDrop * 0.8) {
    validationReport.warnings.push(`Accuracy drop (${accuracyDropPercent.toFixed(2)}%) is close to threshold (${maxAccuracyDrop}%)`);
  }

  // Generate recommendations
  const recommendations: string[] = [];
  if (accuracyDropPercent > 2.0) {
    recommendations.push("Consider using quantization-aware training (QAT) to reduce accuracy drop");
  }
  if (config.precision === "int8" && accuracyDropPercent > 1.5) {
    recommendations.push("Try INT16 or mixed precision for better accuracy");
  }
  if (speedup < 2.0) {
    recommendations.push("Consider more aggressive quantization or pruning for better speedup");
  }
  recommendations.push("Deploy quantized model to edge devices for real-world performance validation");
  recommendations.push("Monitor accuracy in production and recalibrate if needed");

  return {
    quantizedModelId: `quant_model_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    quantizedModelName: `${source.modelName}_quantized`,
    quantizedModelVersion: `${source.modelVersion}_q${config.precision}`,
    originalSizeBytes: source.sizeBytes,
    quantizedSizeBytes,
    compressionRatio,
    sizeReductionPercent,
    originalAccuracy,
    quantizedAccuracy,
    accuracyDrop,
    accuracyDropPercent,
    performanceMetrics,
    quantizationDetails,
    outputModels,
    validationReport,
    recommendations,
  };
}
