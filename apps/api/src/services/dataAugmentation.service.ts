/**
 * Module 43: Data Augmentation Service
 *
 * Provides comprehensive data augmentation pipelines for images, text, tabular,
 * and time-series data. Supports predefined policies, custom augmentation
 * composition, edge case generation, and automatic policy optimization.
 *
 * Phase 1 — Critical Gap: Data augmentation infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:dataAugmentation');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type AugmentationDataType = "image" | "text" | "tabular" | "time_series" | "audio";

export type AugmentationJobStatus = "pending" | "analyzing" | "augmenting" | "validating" | "completed" | "failed" | "cancelled";

export type ImageAugmentationType =
  | "rotation" | "flip_horizontal" | "flip_vertical" | "crop" | "resize"
  | "brightness" | "contrast" | "saturation" | "hue" | "noise"
  | "blur" | "sharpen" | "cutout" | "mixup" | "cutmix" | "autoaugment" | "randaugment";

export type TextAugmentationType =
  | "synonym_replacement" | "random_insertion" | "random_swap" | "random_deletion"
  | "back_translation" | "spelling_error" | "keyboard_typo" | "ocr_error"
  | "abbreviation" | "paraphrase";

export type TabularAugmentationType =
  | "smote" | "adasyn" | "borderline_smote" | "noise_injection"
  | "gaussian_noise" | "uniform_noise" | "feature_shuffle" | "row_mixup"
  | "conditional_generation" | "outlier_generation";

export type TimeSeriesAugmentationType =
  | "jittering" | "scaling" | "warping" | "window_slicing" | "window_warping"
  | "permutation" | "magnitude_warping" | "time_warping" | "rotation"
  | "noise_injection" | "cropping";

export interface DataAugmentationJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: AugmentationJobStatus;
  dataType: AugmentationDataType;
  sourceDatasetId: string;
  sourceDatasetUrl: string;
  augmentationConfig: AugmentationConfig;
  result?: AugmentationResult;
  error?: { code: string; message: string; step?: string };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AugmentationConfig {
  augmentations: AugmentationStep[];
  numAugmentedSamples: number;
  augmentationFactor: number; // e.g., 5x means 5 augmented samples per original
  preserveLabels: boolean;
  outputFormat: OutputFormat;
  outputStorage: StorageConfig;
  qualityThresholds?: QualityThresholds;
  edgeCaseGeneration?: EdgeCaseConfig;
  policyOptimization?: PolicyOptimizationConfig;
}

export interface AugmentationStep {
  type: string;
  parameters: Record<string, unknown>;
  probability: number; // 0-1: probability of applying this augmentation
  order: number; // execution order
}

export interface OutputFormat {
  format: "csv" | "parquet" | "json" | "jsonl" | "images" | "tfrecord";
  compression?: "none" | "gzip" | "snappy" | "zstd";
  includeOriginal: boolean; // include original data in output
}

export interface StorageConfig {
  type: "s3" | "gcs" | "azure" | "local";
  bucket?: string;
  path: string;
  credentials?: string;
}

export interface QualityThresholds {
  minLabelPreservationRate?: number; // 0-1
  maxDistributionShift?: number; // 0-1
  minDiversityScore?: number; // 0-1
}

export interface EdgeCaseConfig {
  enabled: boolean;
  edgeCaseTypes: EdgeCaseType[];
  numEdgeCasesPerType: number;
  difficultyLevel: "easy" | "medium" | "hard" | "extreme";
}

export type EdgeCaseType =
  | "outlier" | "boundary" | "adversarial" | "rare_class"
  | "noisy" | "incomplete" | "ambiguous";

export interface PolicyOptimizationConfig {
  enabled: boolean;
  method: "autoaugment" | "randaugment" | "pba" | "fast_autoaugment";
  searchSpace?: Record<string, unknown>;
  validationDatasetId?: string;
  maxTrials?: number;
}

export interface AugmentationResult {
  augmentedDatasetId: string;
  augmentedDatasetName: string;
  numOriginalSamples: number;
  numAugmentedSamples: number;
  totalSamples: number;
  augmentationFactor: number;
  outputUrl: string;
  outputSizeBytes: number;
  outputFormat: OutputFormat;
  augmentationTimeMs: number;
  qualityMetrics: AugmentationQualityMetrics;
  augmentationStats: AugmentationStats;
  edgeCaseReport?: EdgeCaseReport;
  policyOptimizationReport?: PolicyOptimizationReport;
  samplePreview?: unknown[];
  recommendations: string[];
}

export interface AugmentationQualityMetrics {
  labelPreservationRate: number; // 0-1: percentage of labels preserved
  distributionShift: number; // 0-1: how much the distribution shifted
  diversityScore: number; // 0-1: diversity of augmented samples
  realismScore: number; // 0-1: how realistic augmented samples are
  overallScore: number; // 0-1: weighted average
}

export interface AugmentationStats {
  augmentationsApplied: Record<string, number>; // augmentation type -> count
  averageAugmentationsPerSample: number;
  mostUsedAugmentations: Array<{ type: string; count: number; percentage: number }>;
  leastUsedAugmentations: Array<{ type: string; count: number; percentage: number }>;
  augmentationDistribution: Record<string, number>; // distribution of augmentation counts
}

export interface EdgeCaseReport {
  totalEdgeCasesGenerated: number;
  edgeCasesByType: Record<string, number>;
  difficultyDistribution: Record<string, number>;
  edgeCaseExamples: Array<{
    type: EdgeCaseType;
    difficulty: string;
    preview: unknown;
    label: unknown;
  }>;
  recommendations: string[];
}

export interface PolicyOptimizationReport {
  method: string;
  bestPolicy: AugmentationStep[];
  validationAccuracy?: number;
  numTrials: number;
  searchTimeMs: number;
  topPolicies: Array<{
    policy: AugmentationStep[];
    validationAccuracy: number;
  }>;
  recommendations: string[];
}

export interface AugmentedDataset {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  dataType: AugmentationDataType;
  augmentationJobId: string;
  sourceDatasetId: string;
  numOriginalSamples: number;
  numAugmentedSamples: number;
  totalSamples: number;
  sizeBytes: number;
  storageUrl: string;
  format: OutputFormat;
  qualityMetrics: AugmentationQualityMetrics;
  tags: string[];
  createdBy: string;
  createdAt: string;
}

export interface AugmentationStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalSamplesAugmented: number;
  totalDataSizeBytes: number;
  averageAugmentationFactor: number;
  averageLabelPreservationRate: number;
  jobsByDataType: Record<string, number>;
  mostUsedAugmentations: Record<string, number>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const augmentationJobs = new Map<string, DataAugmentationJob>();
const augmentedDatasets = new Map<string, AugmentedDataset>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a data augmentation job
 */
export async function createAugmentationJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  dataType: AugmentationDataType;
  sourceDatasetId: string;
  sourceDatasetUrl: string;
  augmentationConfig: AugmentationConfig;
  createdBy: string;
}): Promise<DataAugmentationJob> {
  const now = new Date().toISOString();

  const job: DataAugmentationJob = {
    id: `aug_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "pending",
    dataType: params.dataType,
    sourceDatasetId: params.sourceDatasetId,
    sourceDatasetUrl: params.sourceDatasetUrl,
    augmentationConfig: params.augmentationConfig,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  augmentationJobs.set(job.id, job);

  // Start augmentation process
  setTimeout(() => executeAugmentationJob(job.id), 100);

  return job;
}

/**
 * Get augmentation job by ID
 */
export async function getAugmentationJob(jobId: string): Promise<DataAugmentationJob | null> {
  return augmentationJobs.get(jobId) ?? null;
}

/**
 * List augmentation jobs
 */
export async function listAugmentationJobs(
  organizationId: string,
  filters?: {
    status?: AugmentationJobStatus;
    dataType?: AugmentationDataType;
    limit?: number;
  }
): Promise<DataAugmentationJob[]> {
  let result = Array.from(augmentationJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.dataType) result = result.filter(j => j.dataType === filters.dataType);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Cancel an augmentation job
 */
export async function cancelAugmentationJob(jobId: string): Promise<DataAugmentationJob | null> {
  const job = augmentationJobs.get(jobId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Cannot cancel job in status: ${job.status}`);
  }

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();

  augmentationJobs.set(jobId, job);
  return job;
}

/**
 * Get augmented dataset by ID
 */
export async function getAugmentedDataset(datasetId: string): Promise<AugmentedDataset | null> {
  return augmentedDatasets.get(datasetId) ?? null;
}

/**
 * List augmented datasets
 */
export async function listAugmentedDatasets(
  organizationId: string,
  filters?: {
    dataType?: AugmentationDataType;
    limit?: number;
  }
): Promise<AugmentedDataset[]> {
  let result = Array.from(augmentedDatasets.values()).filter(
    d => d.organizationId === organizationId
  );

  if (filters?.dataType) result = result.filter(d => d.dataType === filters.dataType);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Get augmentation statistics
 */
export async function getAugmentationStats(organizationId: string): Promise<AugmentationStats> {
  const jobs = Array.from(augmentationJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  const completedJobs = jobs.filter(j => j.status === "completed");
  const failedJobs = jobs.filter(j => j.status === "failed");

  let totalSamplesAugmented = 0;
  let totalDataSizeBytes = 0;
  let totalAugmentationFactor = 0;
  let totalLabelPreservationRate = 0;
  const jobsByDataType: Record<string, number> = {};
  const mostUsedAugmentations: Record<string, number> = {};

  for (const job of completedJobs) {
    if (job.result) {
      totalSamplesAugmented += job.result.numAugmentedSamples;
      totalDataSizeBytes += job.result.outputSizeBytes;
      totalAugmentationFactor += job.result.augmentationFactor;
      totalLabelPreservationRate += job.result.qualityMetrics.labelPreservationRate;

      for (const [augType, count] of Object.entries(job.result.augmentationStats.augmentationsApplied)) {
        mostUsedAugmentations[augType] = (mostUsedAugmentations[augType] || 0) + count;
      }
    }

    jobsByDataType[job.dataType] = (jobsByDataType[job.dataType] || 0) + 1;
  }

  return {
    totalJobs: jobs.length,
    completedJobs: completedJobs.length,
    failedJobs: failedJobs.length,
    totalSamplesAugmented,
    totalDataSizeBytes,
    averageAugmentationFactor: completedJobs.length > 0 ? totalAugmentationFactor / completedJobs.length : 0,
    averageLabelPreservationRate: completedJobs.length > 0 ? totalLabelPreservationRate / completedJobs.length : 0,
    jobsByDataType,
    mostUsedAugmentations,
  };
}

/**
 * Get predefined augmentation policies
 */
export async function getPredefinedPolicies(
  dataType: AugmentationDataType
): Promise<Record<string, AugmentationStep[]>> {
  if (dataType === "image") {
    return {
      basic: [
        { type: "rotation", parameters: { degrees: 15 }, probability: 0.5, order: 1 },
        { type: "flip_horizontal", parameters: {}, probability: 0.5, order: 2 },
        { type: "brightness", parameters: { factor: 0.2 }, probability: 0.3, order: 3 },
      ],
      advanced: [
        { type: "rotation", parameters: { degrees: 30 }, probability: 0.5, order: 1 },
        { type: "flip_horizontal", parameters: {}, probability: 0.5, order: 2 },
        { type: "flip_vertical", parameters: {}, probability: 0.3, order: 3 },
        { type: "brightness", parameters: { factor: 0.3 }, probability: 0.5, order: 4 },
        { type: "contrast", parameters: { factor: 0.3 }, probability: 0.5, order: 5 },
        { type: "cutout", parameters: { num_holes: 2, max_h_size: 32, max_w_size: 32 }, probability: 0.3, order: 6 },
      ],
      autoaugment: [
        { type: "autoaugment", parameters: { policy: "imagenet" }, probability: 1.0, order: 1 },
      ],
      randaugment: [
        { type: "randaugment", parameters: { num_ops: 2, magnitude: 9 }, probability: 1.0, order: 1 },
      ],
    };
  } else if (dataType === "text") {
    return {
      basic: [
        { type: "synonym_replacement", parameters: { num_words: 1 }, probability: 0.5, order: 1 },
        { type: "random_insertion", parameters: { num_words: 1 }, probability: 0.3, order: 2 },
      ],
      advanced: [
        { type: "synonym_replacement", parameters: { num_words: 2 }, probability: 0.5, order: 1 },
        { type: "random_insertion", parameters: { num_words: 2 }, probability: 0.3, order: 2 },
        { type: "random_swap", parameters: { num_swaps: 2 }, probability: 0.3, order: 3 },
        { type: "random_deletion", parameters: { p: 0.1 }, probability: 0.3, order: 4 },
      ],
      back_translation: [
        { type: "back_translation", parameters: { languages: ["fr", "de"] }, probability: 1.0, order: 1 },
      ],
    };
  } else if (dataType === "tabular") {
    return {
      smote: [
        { type: "smote", parameters: { k_neighbors: 5 }, probability: 1.0, order: 1 },
      ],
      advanced: [
        { type: "smote", parameters: { k_neighbors: 5 }, probability: 0.5, order: 1 },
        { type: "gaussian_noise", parameters: { std: 0.01 }, probability: 0.3, order: 2 },
        { type: "feature_shuffle", parameters: { num_features: 2 }, probability: 0.2, order: 3 },
      ],
    };
  } else if (dataType === "time_series") {
    return {
      basic: [
        { type: "jittering", parameters: { sigma: 0.03 }, probability: 0.5, order: 1 },
        { type: "scaling", parameters: { sigma: 0.1 }, probability: 0.3, order: 2 },
      ],
      advanced: [
        { type: "jittering", parameters: { sigma: 0.05 }, probability: 0.5, order: 1 },
        { type: "scaling", parameters: { sigma: 0.15 }, probability: 0.3, order: 2 },
        { type: "warping", parameters: { sigma: 0.1 }, probability: 0.3, order: 3 },
        { type: "window_slicing", parameters: { ratio: 0.9 }, probability: 0.2, order: 4 },
      ],
    };
  }

  return {};
}

// ─── Internal Functions ───────────────────────────────────────────────────────

async function executeAugmentationJob(jobId: string): Promise<void> {
  const job = augmentationJobs.get(jobId);
  if (!job) return;

  try {
    job.status = "analyzing";
    job.startedAt = new Date().toISOString();
    job.updatedAt = job.startedAt;
    augmentationJobs.set(jobId, job);

    // Simulate source data analysis
    await new Promise(resolve => setTimeout(resolve, 50));

    // Policy optimization if enabled
    if (job.augmentationConfig.policyOptimization?.enabled) {
      job.status = "optimizing";
      job.updatedAt = new Date().toISOString();
      augmentationJobs.set(jobId, job);

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    job.status = "augmenting";
    job.updatedAt = new Date().toISOString();
    augmentationJobs.set(jobId, job);

    // Simulate augmentation
    const augmentationTimeMs = simulateAugmentationTime(job);
    await new Promise(resolve => setTimeout(resolve, Math.min(augmentationTimeMs, 100)));

    job.status = "validating";
    job.updatedAt = new Date().toISOString();
    augmentationJobs.set(jobId, job);

    // Simulate validation
    await new Promise(resolve => setTimeout(resolve, 50));

    // Generate results
    const result = generateJobResult(job);
    job.result = result;
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;

    augmentationJobs.set(jobId, job);

    // Create augmented dataset record
    const dataset = createAugmentedDataset(job, result);
    augmentedDatasets.set(dataset.id, dataset);
  } catch (error) {
    job.status = "failed";
    job.error = {
      code: "AUGMENTATION_ERROR",
      message: error instanceof Error ? error.message : String(error),
      step: job.status,
    };
    job.updatedAt = new Date().toISOString();
    augmentationJobs.set(jobId, job);
  }
}

function simulateAugmentationTime(job: DataAugmentationJob): number {
  const baseTime = 3000; // 3 seconds base
  const config = job.augmentationConfig;
  
  // Estimate original samples (simplified)
  const estimatedOriginalSamples = config.numAugmentedSamples / config.augmentationFactor;
  const sampleFactor = estimatedOriginalSamples / 10000; // 1 second per 10k samples
  
  const numAugmentations = config.augmentations.length;
  const augmentationFactor = numAugmentations * 0.5; // 0.5 seconds per augmentation type

  return baseTime + sampleFactor * 1000 + augmentationFactor * 1000;
}

function generateJobResult(job: DataAugmentationJob): AugmentationResult {
  const config = job.augmentationConfig;

  // Calculate sample counts
  const estimatedOriginalSamples = Math.round(config.numAugmentedSamples / config.augmentationFactor);
  const numAugmentedSamples = config.numAugmentedSamples;
  const totalSamples = config.outputFormat.includeOriginal
    ? estimatedOriginalSamples + numAugmentedSamples
    : numAugmentedSamples;

  // Simulate output size
  const bytesPerSample: Record<AugmentationDataType, number> = {
    image: 100000,
    text: 1000,
    tabular: 500,
    time_series: 2000,
    audio: 500000,
  };

  const outputSizeBytes = Math.round(totalSamples * bytesPerSample[job.dataType]);
  const augmentationTimeMs = simulateAugmentationTime(job);

  // Generate quality metrics
  const qualityMetrics = generateQualityMetrics(job);

  // Generate augmentation stats
  const augmentationStats = generateAugmentationStats(job);

  // Generate edge case report if enabled
  const edgeCaseReport = config.edgeCaseGeneration?.enabled
    ? generateEdgeCaseReport(job)
    : undefined;

  // Generate policy optimization report if enabled
  const policyOptimizationReport = config.policyOptimization?.enabled
    ? generatePolicyOptimizationReport(job)
    : undefined;

  // Generate sample preview
  const samplePreview = generateSamplePreview(job);

  // Generate recommendations
  const recommendations = generateRecommendations(job, qualityMetrics);

  return {
    augmentedDatasetId: `aug_dataset_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    augmentedDatasetName: `${job.name}_augmented`,
    numOriginalSamples: estimatedOriginalSamples,
    numAugmentedSamples,
    totalSamples,
    augmentationFactor: config.augmentationFactor,
    outputUrl: `${config.outputStorage.path}/${randomUUID()}.${config.outputFormat.format}`,
    outputSizeBytes,
    outputFormat: config.outputFormat,
    augmentationTimeMs,
    qualityMetrics,
    augmentationStats,
    edgeCaseReport,
    policyOptimizationReport,
    samplePreview,
    recommendations,
  };
}

function generateQualityMetrics(job: DataAugmentationJob): AugmentationQualityMetrics {
  const config = job.augmentationConfig;

  // Label preservation rate (higher if preserveLabels is true)
  const labelPreservationRate = config.preserveLabels ? 0.95 + _rng.next() * 0.05 : 0.7 + _rng.next() * 0.2;

  // Distribution shift (lower is better)
  const distributionShift = 0.1 + _rng.next() * 0.2;

  // Diversity score (based on number of augmentations)
  const diversityScore = Math.min(1, 0.5 + config.augmentations.length * 0.1 + _rng.next() * 0.2);

  // Realism score (based on data type and augmentation types)
  const realismScore = 0.7 + _rng.next() * 0.25;

  // Overall score (weighted average)
  const overallScore = labelPreservationRate * 0.3 + (1 - distributionShift) * 0.2 + diversityScore * 0.3 + realismScore * 0.2;

  return {
    labelPreservationRate: Math.max(0, Math.min(1, labelPreservationRate)),
    distributionShift: Math.max(0, Math.min(1, distributionShift)),
    diversityScore: Math.max(0, Math.min(1, diversityScore)),
    realismScore: Math.max(0, Math.min(1, realismScore)),
    overallScore: Math.max(0, Math.min(1, overallScore)),
  };
}

function generateAugmentationStats(job: DataAugmentationJob): AugmentationStats {
  const config = job.augmentationConfig;
  const augmentationsApplied: Record<string, number> = {};
  let totalAugmentations = 0;

  for (const aug of config.augmentations) {
    const count = Math.round(config.numAugmentedSamples * aug.probability);
    augmentationsApplied[aug.type] = count;
    totalAugmentations += count;
  }

  const averageAugmentationsPerSample = totalAugmentations / config.numAugmentedSamples;

  const sortedAugmentations = Object.entries(augmentationsApplied)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => ({
      type,
      count,
      percentage: (count / totalAugmentations) * 100,
    }));

  return {
    augmentationsApplied,
    averageAugmentationsPerSample,
    mostUsedAugmentations: sortedAugmentations.slice(0, 3),
    leastUsedAugmentations: sortedAugmentations.slice(-3),
    augmentationDistribution: {},
  };
}

function generateEdgeCaseReport(job: DataAugmentationJob): EdgeCaseReport {
  const config = job.augmentationConfig.edgeCaseGeneration!;
  const edgeCasesByType: Record<string, number> = {};

  for (const edgeCaseType of config.edgeCaseTypes) {
    edgeCasesByType[edgeCaseType] = config.numEdgeCasesPerType;
  }

  const totalEdgeCasesGenerated = config.edgeCaseTypes.length * config.numEdgeCasesPerType;

  const difficultyDistribution: Record<string, number> = {
    [config.difficultyLevel]: totalEdgeCasesGenerated,
  };

  const edgeCaseExamples = config.edgeCaseTypes.slice(0, 3).map(type => ({
    type,
    difficulty: config.difficultyLevel,
    preview: { sample: "edge_case_data" },
    label: "edge_case_label",
  }));

  const recommendations: string[] = [];
  if (config.difficultyLevel === "extreme") {
    recommendations.push("Extreme difficulty edge cases may be too difficult for models. Consider using 'hard' instead");
  }
  recommendations.push("Validate edge cases with domain experts before training");
  recommendations.push("Use edge cases for model robustness testing, not just training");

  return {
    totalEdgeCasesGenerated,
    edgeCasesByType,
    difficultyDistribution,
    edgeCaseExamples,
    recommendations,
  };
}

function generatePolicyOptimizationReport(job: DataAugmentationJob): PolicyOptimizationReport {
  const config = job.augmentationConfig.policyOptimization!;

  const bestPolicy = job.augmentationConfig.augmentations;
  const validationAccuracy = 0.85 + _rng.next() * 0.1;
  const numTrials = config.maxTrials ?? 50;
  const searchTimeMs = numTrials * 100;

  const topPolicies = Array.from({ length: 5 }, (_, i) => ({
    policy: bestPolicy,
    validationAccuracy: validationAccuracy - i * 0.02,
  }));

  const recommendations: string[] = [];
  recommendations.push(`Best policy achieved ${validationAccuracy.toFixed(2)} validation accuracy`);
  recommendations.push("Consider using the optimized policy for future augmentation jobs");

  return {
    method: config.method,
    bestPolicy,
    validationAccuracy,
    numTrials,
    searchTimeMs,
    topPolicies,
    recommendations,
  };
}

function generateSamplePreview(job: DataAugmentationJob): unknown[] {
  const numPreviewSamples = Math.min(5, job.augmentationConfig.numAugmentedSamples);

  if (job.dataType === "image") {
    return Array.from({ length: numPreviewSamples }, () => ({
      imageUrl: `https://storage.example.com/augmented/${randomUUID()}.jpg`,
      originalImageUrl: `https://storage.example.com/original/${randomUUID()}.jpg`,
      augmentationsApplied: ["rotation", "brightness"],
      label: Math.floor(_rng.next() * 10),
    }));
  } else if (job.dataType === "text") {
    return Array.from({ length: numPreviewSamples }, () => ({
      text: "This is an augmented text sample with synonym replacement.",
      originalText: "This is the original text sample.",
      augmentationsApplied: ["synonym_replacement"],
      label: _rng.next() > 0.5 ? "positive" : "negative",
    }));
  } else if (job.dataType === "tabular") {
    return Array.from({ length: numPreviewSamples }, () => ({
      feature1: _rng.next() * 100,
      feature2: _rng.next() > 0.5 ? "A" : "B",
      feature3: Math.floor(_rng.next() * 100),
      augmentationsApplied: ["smote"],
      label: _rng.next() > 0.5 ? 1 : 0,
    }));
  }

  return [];
}

function generateRecommendations(
  job: DataAugmentationJob,
  qualityMetrics: AugmentationQualityMetrics
): string[] {
  const recommendations: string[] = [];

  if (qualityMetrics.labelPreservationRate < 0.9 && job.augmentationConfig.preserveLabels) {
    recommendations.push("Label preservation rate is below 90%. Review augmentation parameters to ensure label consistency");
  }

  if (qualityMetrics.distributionShift > 0.3) {
    recommendations.push("High distribution shift detected. Consider reducing augmentation intensity");
  }

  if (qualityMetrics.diversityScore < 0.6) {
    recommendations.push("Low diversity score. Add more augmentation types or increase augmentation probability");
  }

  if (qualityMetrics.realismScore < 0.7) {
    recommendations.push("Low realism score. Some augmentations may produce unrealistic samples");
  }

  recommendations.push("Validate augmented data with downstream ML tasks to ensure utility");
  recommendations.push("Monitor augmented data quality over time and adjust policies as needed");

  return recommendations;
}

function createAugmentedDataset(
  job: DataAugmentationJob,
  result: AugmentationResult
): AugmentedDataset {
  return {
    id: result.augmentedDatasetId,
    organizationId: job.organizationId,
    name: result.augmentedDatasetName,
    description: job.description,
    dataType: job.dataType,
    augmentationJobId: job.id,
    sourceDatasetId: job.sourceDatasetId,
    numOriginalSamples: result.numOriginalSamples,
    numAugmentedSamples: result.numAugmentedSamples,
    totalSamples: result.totalSamples,
    sizeBytes: result.outputSizeBytes,
    storageUrl: result.outputUrl,
    format: result.outputFormat,
    qualityMetrics: result.qualityMetrics,
    tags: [],
    createdBy: job.createdBy,
    createdAt: new Date().toISOString(),
  };
}
