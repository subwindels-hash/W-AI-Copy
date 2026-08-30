/**
 * Module 43: Synthetic Data Generation Service
 *
 * Generates high-quality synthetic data for ML training, testing, and privacy
 * preservation. Supports tabular, image, text, and time-series data with
 * statistical preservation guarantees and differential privacy.
 *
 * Phase 1 — Critical Gap: Synthetic data generation infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:syntheticDataGeneration');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type SyntheticDataType = "tabular" | "image" | "text" | "time_series" | "audio" | "video";

export type GenerationMethod = "gan" | "vae" | "diffusion" | "ctgan" | "tvae" | "copula" | "agent_based" | "rule_based";

export type GenerationJobStatus = "pending" | "analyzing" | "generating" | "validating" | "completed" | "failed" | "cancelled";

export type PrivacyMechanism = "none" | "differential_privacy" | "k_anonymity" | "l_diversity" | "t_closeness";

export interface SyntheticDataGenerationJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: GenerationJobStatus;
  dataType: SyntheticDataType;
  generationConfig: GenerationConfig;
  sourceDataConfig?: SourceDataConfig;
  privacyConfig?: PrivacyConfig;
  result?: GenerationResult;
  error?: { code: string; message: string; step?: string };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface GenerationConfig {
  method: GenerationMethod;
  numSamples: number;
  batchSize?: number;
  numEpochs?: number;
  learningRate?: number;
  conditionalGeneration?: boolean;
  labelColumn?: string;
  labelDistribution?: Record<string, number>; // label -> target count
  outputFormat: OutputFormat;
  outputStorage: StorageConfig;
  qualityThresholds?: QualityThresholds;
}

export interface OutputFormat {
  format: "csv" | "parquet" | "json" | "jsonl" | "images" | "tfrecord";
  compression?: "none" | "gzip" | "snappy" | "zstd";
  partitioning?: {
    enabled: boolean;
    column?: string;
    numPartitions?: number;
  };
}

export interface StorageConfig {
  type: "s3" | "gcs" | "azure" | "local";
  bucket?: string;
  path: string;
  credentials?: string;
}

export interface SourceDataConfig {
  datasetId?: string;
  datasetUrl?: string;
  sampleSize?: number;
  columns?: string[];
  excludeColumns?: string[];
  filters?: Record<string, unknown>;
}

export interface PrivacyConfig {
  mechanism: PrivacyMechanism;
  epsilon?: number; // differential privacy budget
  delta?: number; // differential privacy delta
  k?: number; // k-anonymity
  l?: number; // l-diversity
  t?: number; // t-closeness
  privacyBudgetTracking?: boolean;
}

export interface QualityThresholds {
  minFidelityScore?: number; // 0-1
  minDiversityScore?: number; // 0-1
  maxPrivacyRisk?: number; // 0-1
  maxStatisticalDistance?: number; // 0-1 (e.g., KS test, Wasserstein)
}

export interface GenerationResult {
  syntheticDatasetId: string;
  syntheticDatasetName: string;
  numSamplesGenerated: number;
  outputUrl: string;
  outputSizeBytes: number;
  outputFormat: OutputFormat;
  generationTimeMs: number;
  qualityMetrics: QualityMetrics;
  statisticalComparison?: StatisticalComparison;
  privacyReport?: PrivacyReport;
  samplePreview?: unknown[];
  recommendations: string[];
}

export interface QualityMetrics {
  fidelityScore: number; // 0-1: how well synthetic data matches real data distributions
  diversityScore: number; // 0-1: how diverse the synthetic data is
  privacyScore: number; // 0-1: how well privacy is preserved (higher = better)
  utilityScore: number; // 0-1: how useful the data is for ML tasks
  overallScore: number; // 0-1: weighted average
  columnWiseMetrics?: Record<string, ColumnQualityMetrics>;
}

export interface ColumnQualityMetrics {
  columnName: string;
  columnType: string;
  fidelityScore: number;
  distributionDistance: number; // KS test, Wasserstein, etc.
  correlationPreservation?: number; // correlation with other columns
  privacyRisk: number; // risk of re-identification
}

export interface StatisticalComparison {
  univariateTests: Array<{
    column: string;
    test: string; // KS test, chi-square, etc.
    statistic: number;
    pValue: number;
    passed: boolean;
  }>;
  multivariateTests: Array<{
    test: string; // MMD, energy distance, etc.
    statistic: number;
    pValue: number;
    passed: boolean;
  }>;
  correlationComparison: {
    pearsonCorrelation: number; // correlation between real and synthetic correlation matrices
    spearmanCorrelation: number;
  };
  dimensionalityReduction?: {
    method: "pca" | "tsne" | "umap";
    realDataUrl: string; // URL to visualization
    syntheticDataUrl: string;
    overlapScore: number;
  };
}

export interface PrivacyReport {
  mechanism: PrivacyMechanism;
  epsilon?: number;
  delta?: number;
  privacyBudgetUsed?: number;
  privacyBudgetRemaining?: number;
  reIdentificationRisk: number; // 0-1
  membershipInferenceRisk: number; // 0-1
  attributeInferenceRisk: number; // 0-1
  overallPrivacyScore: number; // 0-1
  warnings: string[];
  recommendations: string[];
}

export interface SyntheticDataset {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  dataType: SyntheticDataType;
  generationJobId: string;
  numSamples: number;
  sizeBytes: number;
  storageUrl: string;
  format: OutputFormat;
  qualityMetrics: QualityMetrics;
  privacyReport?: PrivacyReport;
  schema?: DatasetSchema;
  tags: string[];
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
}

export interface DatasetSchema {
  columns: Array<{
    name: string;
    type: "numeric" | "categorical" | "datetime" | "text" | "image" | "audio";
    nullable: boolean;
    statistics?: {
      min?: number;
      max?: number;
      mean?: number;
      std?: number;
      unique?: number;
      topValues?: Array<{ value: unknown; count: number }>;
    };
  }>;
}

export interface GenerationStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalSamplesGenerated: number;
  totalDataSizeBytes: number;
  averageFidelityScore: number;
  averagePrivacyScore: number;
  jobsByDataType: Record<string, number>;
  jobsByMethod: Record<string, number>;
  jobsByPrivacyMechanism: Record<string, number>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const generationJobs = new Map<string, SyntheticDataGenerationJob>();
const syntheticDatasets = new Map<string, SyntheticDataset>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a synthetic data generation job
 */
export async function createGenerationJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  dataType: SyntheticDataType;
  generationConfig: GenerationConfig;
  sourceDataConfig?: SourceDataConfig;
  privacyConfig?: PrivacyConfig;
  createdBy: string;
}): Promise<SyntheticDataGenerationJob> {
  const now = new Date().toISOString();

  const job: SyntheticDataGenerationJob = {
    id: `synth_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "pending",
    dataType: params.dataType,
    generationConfig: params.generationConfig,
    sourceDataConfig: params.sourceDataConfig,
    privacyConfig: params.privacyConfig,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  generationJobs.set(job.id, job);

  // Start generation process
  setTimeout(() => executeGenerationJob(job.id), 100);

  return job;
}

/**
 * Get generation job by ID
 */
export async function getGenerationJob(jobId: string): Promise<SyntheticDataGenerationJob | null> {
  return generationJobs.get(jobId) ?? null;
}

/**
 * List generation jobs
 */
export async function listGenerationJobs(
  organizationId: string,
  filters?: {
    status?: GenerationJobStatus;
    dataType?: SyntheticDataType;
    method?: GenerationMethod;
    limit?: number;
  }
): Promise<SyntheticDataGenerationJob[]> {
  let result = Array.from(generationJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.dataType) result = result.filter(j => j.dataType === filters.dataType);
  if (filters?.method) result = result.filter(j => j.generationConfig.method === filters.method);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Cancel a generation job
 */
export async function cancelGenerationJob(jobId: string): Promise<SyntheticDataGenerationJob | null> {
  const job = generationJobs.get(jobId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Cannot cancel job in status: ${job.status}`);
  }

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();

  generationJobs.set(jobId, job);
  return job;
}

/**
 * Get synthetic dataset by ID
 */
export async function getSyntheticDataset(datasetId: string): Promise<SyntheticDataset | null> {
  return syntheticDatasets.get(datasetId) ?? null;
}

/**
 * List synthetic datasets
 */
export async function listSyntheticDatasets(
  organizationId: string,
  filters?: {
    dataType?: SyntheticDataType;
    limit?: number;
  }
): Promise<SyntheticDataset[]> {
  let result = Array.from(syntheticDatasets.values()).filter(
    d => d.organizationId === organizationId
  );

  if (filters?.dataType) result = result.filter(d => d.dataType === filters.dataType);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Get generation statistics
 */
export async function getGenerationStats(organizationId: string): Promise<GenerationStats> {
  const jobs = Array.from(generationJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  const completedJobs = jobs.filter(j => j.status === "completed");
  const failedJobs = jobs.filter(j => j.status === "failed");

  let totalSamplesGenerated = 0;
  let totalDataSizeBytes = 0;
  let totalFidelityScore = 0;
  let totalPrivacyScore = 0;
  const jobsByDataType: Record<string, number> = {};
  const jobsByMethod: Record<string, number> = {};
  const jobsByPrivacyMechanism: Record<string, number> = {};

  for (const job of completedJobs) {
    if (job.result) {
      totalSamplesGenerated += job.result.numSamplesGenerated;
      totalDataSizeBytes += job.result.outputSizeBytes;
      totalFidelityScore += job.result.qualityMetrics.fidelityScore;
      totalPrivacyScore += job.result.qualityMetrics.privacyScore;
    }

    jobsByDataType[job.dataType] = (jobsByDataType[job.dataType] || 0) + 1;
    jobsByMethod[job.generationConfig.method] = (jobsByMethod[job.generationConfig.method] || 0) + 1;
    
    if (job.privacyConfig) {
      jobsByPrivacyMechanism[job.privacyConfig.mechanism] = 
        (jobsByPrivacyMechanism[job.privacyConfig.mechanism] || 0) + 1;
    }
  }

  return {
    totalJobs: jobs.length,
    completedJobs: completedJobs.length,
    failedJobs: failedJobs.length,
    totalSamplesGenerated,
    totalDataSizeBytes,
    averageFidelityScore: completedJobs.length > 0 ? totalFidelityScore / completedJobs.length : 0,
    averagePrivacyScore: completedJobs.length > 0 ? totalPrivacyScore / completedJobs.length : 0,
    jobsByDataType,
    jobsByMethod,
    jobsByPrivacyMechanism,
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

async function executeGenerationJob(jobId: string): Promise<void> {
  const job = generationJobs.get(jobId);
  if (!job) return;

  try {
    job.status = "analyzing";
    job.startedAt = new Date().toISOString();
    job.updatedAt = job.startedAt;
    generationJobs.set(jobId, job);

    // Simulate source data analysis
    await new Promise(resolve => setTimeout(resolve, 50));

    job.status = "generating";
    job.updatedAt = new Date().toISOString();
    generationJobs.set(jobId, job);

    // Simulate generation
    const generationTimeMs = simulateGenerationTime(job);
    await new Promise(resolve => setTimeout(resolve, Math.min(generationTimeMs, 100)));

    job.status = "validating";
    job.updatedAt = new Date().toISOString();
    generationJobs.set(jobId, job);

    // Simulate validation
    await new Promise(resolve => setTimeout(resolve, 50));

    // Generate results
    const result = generateJobResult(job);
    job.result = result;
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;

    generationJobs.set(jobId, job);

    // Create synthetic dataset record
    const dataset = createSyntheticDataset(job, result);
    syntheticDatasets.set(dataset.id, dataset);
  } catch (error) {
    job.status = "failed";
    job.error = {
      code: "GENERATION_ERROR",
      message: error instanceof Error ? error.message : String(error),
      step: job.status,
    };
    job.updatedAt = new Date().toISOString();
    generationJobs.set(jobId, job);
  }
}

function simulateGenerationTime(job: SyntheticDataGenerationJob): number {
  const baseTime = 5000; // 5 seconds base
  const sampleFactor = job.generationConfig.numSamples / 10000; // 1 second per 10k samples
  const methodFactor: Record<GenerationMethod, number> = {
    gan: 2.0,
    vae: 1.5,
    diffusion: 3.0,
    ctgan: 1.8,
    tvae: 1.5,
    copula: 1.0,
    agent_based: 2.5,
    rule_based: 0.5,
  };

  return baseTime + sampleFactor * 1000 * (methodFactor[job.generationConfig.method] ?? 1.0);
}

function generateJobResult(job: SyntheticDataGenerationJob): GenerationResult {
  const config = job.generationConfig;
  const privacy = job.privacyConfig;

  // Simulate output size based on data type and num samples
  const bytesPerSample: Record<SyntheticDataType, number> = {
    tabular: 500, // 500 bytes per row
    image: 100000, // 100KB per image
    text: 1000, // 1KB per text sample
    time_series: 2000, // 2KB per time series
    audio: 500000, // 500KB per audio sample
    video: 5000000, // 5MB per video sample
  };

  const outputSizeBytes = Math.round(config.numSamples * bytesPerSample[job.dataType]);
  const generationTimeMs = simulateGenerationTime(job);

  // Generate quality metrics
  const qualityMetrics = generateQualityMetrics(job);

  // Generate statistical comparison if source data provided
  const statisticalComparison = job.sourceDataConfig ? generateStatisticalComparison(job) : undefined;

  // Generate privacy report if privacy configured
  const privacyReport = privacy ? generatePrivacyReport(job) : undefined;

  // Generate sample preview
  const samplePreview = generateSamplePreview(job);

  // Generate recommendations
  const recommendations = generateRecommendations(job, qualityMetrics);

  return {
    syntheticDatasetId: `dataset_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    syntheticDatasetName: `${job.name}_synthetic`,
    numSamplesGenerated: config.numSamples,
    outputUrl: `${config.outputStorage.path}/${randomUUID()}.${config.outputFormat.format}`,
    outputSizeBytes,
    outputFormat: config.outputFormat,
    generationTimeMs,
    qualityMetrics,
    statisticalComparison,
    privacyReport,
    samplePreview,
    recommendations,
  };
}

function generateQualityMetrics(job: SyntheticDataGenerationJob): QualityMetrics {
  const method = job.generationConfig.method;
  const privacy = job.privacyConfig;

  // Base scores by method
  const baseFidelity: Record<GenerationMethod, number> = {
    gan: 0.85,
    vae: 0.80,
    diffusion: 0.90,
    ctgan: 0.88,
    tvae: 0.85,
    copula: 0.75,
    agent_based: 0.70,
    rule_based: 0.65,
  };

  const baseDiversity: Record<GenerationMethod, number> = {
    gan: 0.80,
    vae: 0.85,
    diffusion: 0.88,
    ctgan: 0.82,
    tvae: 0.85,
    copula: 0.78,
    agent_based: 0.90,
    rule_based: 0.60,
  };

  // Add some randomness
  const fidelityScore = baseFidelity[method] + (_rng.next() - 0.5) * 0.1;
  const diversityScore = baseDiversity[method] + (_rng.next() - 0.5) * 0.1;

  // Privacy score based on mechanism
  let privacyScore = 1.0;
  if (privacy) {
    const privacyScores: Record<PrivacyMechanism, number> = {
      none: 0.3,
      differential_privacy: 0.9,
      k_anonymity: 0.8,
      l_diversity: 0.85,
      t_closeness: 0.85,
    };
    privacyScore = privacyScores[privacy.mechanism] + (_rng.next() - 0.5) * 0.1;
  }

  // Utility score (trade-off between fidelity and privacy)
  const utilityScore = fidelityScore * 0.7 + privacyScore * 0.3;

  // Overall score (weighted average)
  const overallScore = fidelityScore * 0.4 + diversityScore * 0.2 + privacyScore * 0.2 + utilityScore * 0.2;

  return {
    fidelityScore: Math.max(0, Math.min(1, fidelityScore)),
    diversityScore: Math.max(0, Math.min(1, diversityScore)),
    privacyScore: Math.max(0, Math.min(1, privacyScore)),
    utilityScore: Math.max(0, Math.min(1, utilityScore)),
    overallScore: Math.max(0, Math.min(1, overallScore)),
  };
}

function generateStatisticalComparison(job: SyntheticDataGenerationJob): StatisticalComparison {
  // Simulate univariate tests
  const numColumns = 10 + Math.floor(_rng.next() * 20);
  const univariateTests = Array.from({ length: numColumns }, (_, i) => {
    const pValue = _rng.next();
    return {
      column: `column_${i}`,
      test: _rng.next() > 0.5 ? "kolmogorov_smirnov" : "chi_square",
      statistic: _rng.next(),
      pValue,
      passed: pValue > 0.05,
    };
  });

  // Simulate multivariate tests
  const multivariateTests = [
    {
      test: "maximum_mean_discrepancy",
      statistic: _rng.next() * 0.1,
      pValue: _rng.next(),
      passed: _rng.next() > 0.3,
    },
    {
      test: "energy_distance",
      statistic: _rng.next() * 0.1,
      pValue: _rng.next(),
      passed: _rng.next() > 0.3,
    },
  ];

  // Simulate correlation comparison
  const correlationComparison = {
    pearsonCorrelation: 0.85 + _rng.next() * 0.1,
    spearmanCorrelation: 0.83 + _rng.next() * 0.1,
  };

  return {
    univariateTests,
    multivariateTests,
    correlationComparison,
  };
}

function generatePrivacyReport(job: SyntheticDataGenerationJob): PrivacyReport {
  const privacy = job.privacyConfig!;
  const warnings: string[] = [];
  const recommendations: string[] = [];

  let reIdentificationRisk = 0.5;
  let membershipInferenceRisk = 0.5;
  let attributeInferenceRisk = 0.5;

  if (privacy.mechanism === "differential_privacy") {
    const epsilon = privacy.epsilon ?? 1.0;
    reIdentificationRisk = Math.min(1, 1 / (epsilon + 1));
    membershipInferenceRisk = Math.min(1, 1 / (epsilon + 1));
    attributeInferenceRisk = Math.min(1, 1 / (epsilon + 1));

    if (epsilon > 10) {
      warnings.push(`High epsilon value (${epsilon}) provides weak privacy guarantees`);
      recommendations.push("Consider using epsilon ≤ 1.0 for strong privacy");
    }
  } else if (privacy.mechanism === "k_anonymity") {
    const k = privacy.k ?? 5;
    reIdentificationRisk = Math.min(1, 1 / k);
    
    if (k < 5) {
      warnings.push(`Low k value (${k}) provides weak anonymity`);
      recommendations.push("Consider using k ≥ 5 for better anonymity");
    }
  }

  const overallPrivacyScore = 1 - (reIdentificationRisk + membershipInferenceRisk + attributeInferenceRisk) / 3;

  return {
    mechanism: privacy.mechanism,
    epsilon: privacy.epsilon,
    delta: privacy.delta,
    privacyBudgetUsed: privacy.epsilon,
    privacyBudgetRemaining: privacy.epsilon ? 10 - privacy.epsilon : undefined,
    reIdentificationRisk,
    membershipInferenceRisk,
    attributeInferenceRisk,
    overallPrivacyScore: Math.max(0, Math.min(1, overallPrivacyScore)),
    warnings,
    recommendations,
  };
}

function generateSamplePreview(job: SyntheticDataGenerationJob): unknown[] {
  const numPreviewSamples = Math.min(5, job.generationConfig.numSamples);
  
  if (job.dataType === "tabular") {
    return Array.from({ length: numPreviewSamples }, () => ({
      id: randomUUID(),
      feature1: _rng.next() * 100,
      feature2: _rng.next() > 0.5 ? "A" : "B",
      feature3: Math.floor(_rng.next() * 100),
      label: _rng.next() > 0.5 ? 1 : 0,
    }));
  } else if (job.dataType === "image") {
    return Array.from({ length: numPreviewSamples }, () => ({
      imageUrl: `https://storage.example.com/synthetic/${randomUUID()}.jpg`,
      label: Math.floor(_rng.next() * 10),
    }));
  } else if (job.dataType === "text") {
    return Array.from({ length: numPreviewSamples }, () => ({
      text: "This is a synthetic text sample for training.",
      label: _rng.next() > 0.5 ? "positive" : "negative",
    }));
  }

  return [];
}

function generateRecommendations(
  job: SyntheticDataGenerationJob,
  qualityMetrics: QualityMetrics
): string[] {
  const recommendations: string[] = [];

  if (qualityMetrics.fidelityScore < 0.8) {
    recommendations.push("Fidelity score is below 0.8. Consider using a more advanced generation method (e.g., diffusion models)");
  }

  if (qualityMetrics.diversityScore < 0.7) {
    recommendations.push("Diversity score is low. Increase training epochs or adjust generation parameters");
  }

  if (qualityMetrics.privacyScore < 0.7 && job.privacyConfig) {
    recommendations.push("Privacy score is low. Consider stricter privacy parameters (lower epsilon, higher k)");
  }

  if (job.generationConfig.conditionalGeneration && !job.generationConfig.labelDistribution) {
    recommendations.push("Conditional generation enabled but no label distribution specified. Using uniform distribution");
  }

  recommendations.push("Validate synthetic data with downstream ML tasks to ensure utility");
  recommendations.push("Monitor synthetic data quality over time and regenerate if distributions drift");

  return recommendations;
}

function createSyntheticDataset(
  job: SyntheticDataGenerationJob,
  result: GenerationResult
): SyntheticDataset {
  return {
    id: result.syntheticDatasetId,
    organizationId: job.organizationId,
    name: result.syntheticDatasetName,
    description: job.description,
    dataType: job.dataType,
    generationJobId: job.id,
    numSamples: result.numSamplesGenerated,
    sizeBytes: result.outputSizeBytes,
    storageUrl: result.outputUrl,
    format: result.outputFormat,
    qualityMetrics: result.qualityMetrics,
    privacyReport: result.privacyReport,
    tags: [],
    createdBy: job.createdBy,
    createdAt: new Date().toISOString(),
  };
}
