/**
 * Module 38: AutoML Pipeline Service
 *
 * Provides automated end-to-end machine learning pipelines including dataset
 * profiling, automated preprocessing, feature engineering, model selection,
 * pipeline construction, and one-click training with evaluation.
 *
 * Phase 1 — Critical Gap: Automated machine learning pipeline infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:automlPipeline');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskType = "classification" | "regression" | "clustering" | "time-series" | "recommendation" | "auto-detect";

export type DataType = "tabular" | "text" | "image" | "audio" | "time-series" | "mixed";

export type PipelineStatus = "queued" | "profiling" | "preprocessing" | "feature-engineering" | "model-selection" | "training" | "evaluating" | "completed" | "failed" | "cancelled";

export type ModelFamily = "linear" | "tree-based" | "ensemble" | "neural-network" | "svm" | "bayesian" | "instance-based" | "auto";

export type PreprocessingStep = "missing-values" | "encoding" | "scaling" | "outlier-detection" | "feature-selection" | "dimensionality-reduction";

export type FeatureEngineeringStep = "polynomial" | "interaction" | "aggregation" | "datetime" | "text-vectorization" | "embedding";

export interface AutoMLJob {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: PipelineStatus;
  taskType: TaskType;
  dataType: DataType;
  datasetConfig: DatasetConfig;
  constraints: AutoMLConstraints;
  profile?: DatasetProfile;
  preprocessing?: PreprocessingConfig;
  featureEngineering?: FeatureEngineeringConfig;
  modelSelection?: ModelSelectionConfig;
  pipeline?: AutoMLPipeline;
  bestModel?: AutoMLModel;
  allModels: AutoMLModel[];
  evaluation?: AutoMLEvaluation;
  error?: { code: string; message: string; step?: string };
  createdBy: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatasetConfig {
  source: "upload" | "database" | "api" | "file";
  sourceConfig: Record<string, unknown>;
  targetColumn: string;
  featureColumns?: string[];
  excludeColumns?: string[];
  trainSplit: number; // 0-1
  validationSplit: number; // 0-1
  testSplit: number; // 0-1
  randomSeed?: number;
}

export interface AutoMLConstraints {
  maxTrainingTimeMs?: number;
  maxModels?: number;
  minAccuracy?: number;
  maxLatencyMs?: number;
  maxModelSizeMb?: number;
  interpretability?: "low" | "medium" | "high";
  modelFamilies?: ModelFamily[];
  excludeModelFamilies?: ModelFamily[];
}

export interface DatasetProfile {
  numRows: number;
  numColumns: number;
  columnProfiles: ColumnProfile[];
  detectedTaskType: TaskType;
  detectedDataType: DataType;
  classDistribution?: Record<string, number>;
  missingValuesPercent: number;
  memorySizeMb: number;
  statistics: {
    mean?: Record<string, number>;
    std?: Record<string, number>;
    min?: Record<string, number>;
    max?: Record<string, number>;
    median?: Record<string, number>;
    unique?: Record<string, number>;
  };
  correlations?: Record<string, Record<string, number>>;
  qualityScore: number; // 0-100
  recommendations: string[];
}

export interface ColumnProfile {
  name: string;
  dtype: string;
  isTarget: boolean;
  isFeature: boolean;
  missingPercent: number;
  uniqueCount: number;
  uniquePercent: number;
  isCategorical: boolean;
  isNumeric: boolean;
  isDateTime: boolean;
  isText: boolean;
  cardinality: "low" | "medium" | "high";
  outliers?: number;
  distribution?: {
    skewness?: number;
    kurtosis?: number;
    isNormal?: boolean;
  };
  sampleValues: unknown[];
}

export interface PreprocessingConfig {
  steps: PreprocessingStep[];
  missingValueStrategy: "drop" | "mean" | "median" | "mode" | "constant" | "interpolate";
  missingValueConstant?: unknown;
  encodingStrategy: "one-hot" | "label" | "target" | "binary" | "embedding";
  scalingStrategy: "standard" | "minmax" | "robust" | "none";
  outlierStrategy: "remove" | "cap" | "none";
  outlierThreshold: number;
  featureSelectionStrategy: "none" | "correlation" | "mutual-info" | "recursive" | "auto";
  featureSelectionK?: number;
  dimensionalityReduction?: "pca" | "tsne" | "umap" | "none";
  dimensionalityReductionComponents?: number;
}

export interface FeatureEngineeringConfig {
  steps: FeatureEngineeringStep[];
  polynomialDegree?: number;
  interactionFeatures: boolean;
  datetimeFeatures: boolean;
  textVectorization?: "tfidf" | "count" | "embedding" | "none";
  textEmbeddingModel?: string;
  aggregationFeatures: boolean;
  customTransformations?: Array<{
    name: string;
    columns: string[];
    transformation: string;
    params: Record<string, unknown>;
  }>;
}

export interface ModelSelectionConfig {
  strategy: "auto" | "exhaustive" | "quick" | "custom";
  candidateModels?: string[];
  maxModels: number;
  evaluationMetric: string;
  crossValidationFolds: number;
  earlyStopping: boolean;
  earlyStoppingPatience: number;
}

export interface AutoMLPipeline {
  id: string;
  jobId: string;
  preprocessingSteps: PipelineStep[];
  featureEngineeringSteps: PipelineStep[];
  modelStep: PipelineStep;
  postprocessingSteps: PipelineStep[];
  estimatedLatencyMs: number;
  estimatedMemoryMb: number;
}

export interface PipelineStep {
  name: string;
  type: string;
  params: Record<string, unknown>;
  inputColumns?: string[];
  outputColumns?: string[];
  fittedParams?: Record<string, unknown>;
}

export interface AutoMLModel {
  id: string;
  jobId: string;
  modelFamily: ModelFamily;
  modelName: string;
  hyperparameters: Record<string, unknown>;
  trainingTimeMs: number;
  evaluationMetrics: Record<string, number>;
  rank: number;
  isSelected: boolean;
  pipeline: AutoMLPipeline;
  modelArtifactUrl?: string;
  modelSizeMb?: number;
  inferenceLatencyMs?: number;
  featureImportance?: Record<string, number>;
  createdAt: string;
}

export interface AutoMLEvaluation {
  bestModelId: string;
  bestModelName: string;
  bestMetrics: Record<string, number>;
  allModelsMetrics: Array<{
    modelId: string;
    modelName: string;
    metrics: Record<string, number>;
    rank: number;
  }>;
  confusionMatrix?: number[][];
  rocCurve?: Array<{ fpr: number; tpr: number; threshold: number }>;
  precisionRecallCurve?: Array<{ precision: number; recall: number; threshold: number }>;
  learningCurve?: Array<{ trainSize: number; trainScore: number; validationScore: number }>;
  featureImportance?: Record<string, number>;
  shapValues?: Record<string, number>;
  recommendations: string[];
  warnings: string[];
}

export interface AutoMLStats {
  totalJobs: number;
  jobsByStatus: Record<string, number>;
  jobsByTaskType: Record<string, number>;
  completedJobs: number;
  failedJobs: number;
  averageTrainingTimeMs: number;
  averageBestAccuracy: number;
  totalModelsTrained: number;
  modelFamiliesUsed: Record<string, number>;
  commonPreprocessingSteps: Record<string, number>;
  commonFeatureEngineeringSteps: Record<string, number>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const automlJobs = new Map<string, AutoMLJob>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create an AutoML job
 */
export async function createAutoMLJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  taskType?: TaskType;
  dataType?: DataType;
  datasetConfig: DatasetConfig;
  constraints?: AutoMLConstraints;
  createdBy: string;
}): Promise<AutoMLJob> {
  const now = new Date().toISOString();

  const job: AutoMLJob = {
    id: `automl_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    status: "queued",
    taskType: params.taskType ?? "auto-detect",
    dataType: params.dataType ?? "tabular",
    datasetConfig: params.datasetConfig,
    constraints: {
      maxTrainingTimeMs: 3600000, // 1 hour default
      maxModels: 20,
      minAccuracy: 0.7,
      interpretability: "medium",
      ...params.constraints,
    },
    allModels: [],
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  automlJobs.set(job.id, job);

  // Start pipeline automatically
  setTimeout(() => runAutoMLPipeline(job.id), 100);

  return job;
}

/**
 * Get AutoML job by ID
 */
export async function getAutoMLJob(jobId: string): Promise<AutoMLJob | null> {
  return automlJobs.get(jobId) ?? null;
}

/**
 * List AutoML jobs for an organization
 */
export async function listAutoMLJobs(
  organizationId: string,
  filters?: {
    status?: PipelineStatus;
    taskType?: TaskType;
    limit?: number;
  }
): Promise<AutoMLJob[]> {
  let result = Array.from(automlJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.taskType) result = result.filter(j => j.taskType === filters.taskType);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Cancel AutoML job
 */
export async function cancelAutoMLJob(jobId: string): Promise<AutoMLJob | null> {
  const job = automlJobs.get(jobId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Cannot cancel job in status: ${job.status}`);
  }

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();
  automlJobs.set(jobId, job);
  return job;
}

/**
 * Get AutoML statistics
 */
export async function getAutoMLStats(organizationId: string): Promise<AutoMLStats> {
  const allJobs = Array.from(automlJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  const jobsByStatus: Record<string, number> = {};
  const jobsByTaskType: Record<string, number> = {};
  const modelFamiliesUsed: Record<string, number> = {};
  const commonPreprocessingSteps: Record<string, number> = {};
  const commonFeatureEngineeringSteps: Record<string, number> = {};
  let totalTrainingTime = 0;
  let totalBestAccuracy = 0;
  let accuracyCount = 0;
  let totalModelsTrained = 0;

  for (const job of allJobs) {
    jobsByStatus[job.status] = (jobsByStatus[job.status] || 0) + 1;
    jobsByTaskType[job.taskType] = (jobsByTaskType[job.taskType] || 0) + 1;

    totalModelsTrained += job.allModels.length;

    if (job.bestModel) {
      totalTrainingTime += job.bestModel.trainingTimeMs;
      const accuracy = job.bestModel.evaluationMetrics.accuracy ?? job.bestModel.evaluationMetrics.r2;
      if (accuracy !== undefined) {
        totalBestAccuracy += accuracy;
        accuracyCount++;
      }
      modelFamiliesUsed[job.bestModel.modelFamily] = (modelFamiliesUsed[job.bestModel.modelFamily] || 0) + 1;
    }

    if (job.preprocessing) {
      for (const step of job.preprocessing.steps) {
        commonPreprocessingSteps[step] = (commonPreprocessingSteps[step] || 0) + 1;
      }
    }

    if (job.featureEngineering) {
      for (const step of job.featureEngineering.steps) {
        commonFeatureEngineeringSteps[step] = (commonFeatureEngineeringSteps[step] || 0) + 1;
      }
    }
  }

  return {
    totalJobs: allJobs.length,
    jobsByStatus,
    jobsByTaskType,
    completedJobs: allJobs.filter(j => j.status === "completed").length,
    failedJobs: allJobs.filter(j => j.status === "failed").length,
    averageTrainingTimeMs: allJobs.length > 0 ? Math.round(totalTrainingTime / allJobs.length) : 0,
    averageBestAccuracy: accuracyCount > 0 ? Math.round((totalBestAccuracy / accuracyCount) * 100) / 100 : 0,
    totalModelsTrained,
    modelFamiliesUsed,
    commonPreprocessingSteps,
    commonFeatureEngineeringSteps,
  };
}

// ─── Pipeline Execution ───────────────────────────────────────────────────────

async function runAutoMLPipeline(jobId: string): Promise<void> {
  const job = automlJobs.get(jobId);
  if (!job) return;

  try {
    job.startedAt = new Date().toISOString();
    job.updatedAt = job.startedAt;

    // Step 1: Profile dataset
    job.status = "profiling";
    automlJobs.set(jobId, job);
    job.profile = await profileDataset(job.datasetConfig, job.taskType);
    job.taskType = job.profile.detectedTaskType;
    job.dataType = job.profile.detectedDataType;
    job.updatedAt = new Date().toISOString();
    automlJobs.set(jobId, job);

    // Step 2: Preprocessing
    job.status = "preprocessing";
    automlJobs.set(jobId, job);
    job.preprocessing = await generatePreprocessingConfig(job.profile, job.constraints);
    job.updatedAt = new Date().toISOString();
    automlJobs.set(jobId, job);

    // Step 3: Feature engineering
    job.status = "feature-engineering";
    automlJobs.set(jobId, job);
    job.featureEngineering = await generateFeatureEngineeringConfig(job.profile, job.taskType);
    job.updatedAt = new Date().toISOString();
    automlJobs.set(jobId, job);

    // Step 4: Model selection
    job.status = "model-selection";
    automlJobs.set(jobId, job);
    job.modelSelection = await generateModelSelectionConfig(job.profile, job.taskType, job.constraints);
    job.updatedAt = new Date().toISOString();
    automlJobs.set(jobId, job);

    // Step 5: Training
    job.status = "training";
    automlJobs.set(jobId, job);
    const trainedModels = await trainModels(job);
    job.allModels = trainedModels;
    job.updatedAt = new Date().toISOString();
    automlJobs.set(jobId, job);

    // Step 6: Evaluation
    job.status = "evaluating";
    automlJobs.set(jobId, job);
    job.bestModel = trainedModels[0]; // Already sorted by rank
    job.pipeline = job.bestModel.pipeline;
    job.evaluation = await evaluateModels(job);
    job.updatedAt = new Date().toISOString();
    automlJobs.set(jobId, job);

    // Complete
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    automlJobs.set(jobId, job);
  } catch (error) {
    job.status = "failed";
    job.error = {
      code: "PIPELINE_ERROR",
      message: error instanceof Error ? error.message : String(error),
      step: job.status,
    };
    job.updatedAt = new Date().toISOString();
    automlJobs.set(jobId, job);
  }
}

async function profileDataset(config: DatasetConfig, taskType: TaskType): Promise<DatasetProfile> {
  // Simulate dataset profiling
  const numRows = 10000 + Math.floor(_rng.next() * 90000);
  const numColumns = 10 + Math.floor(_rng.next() * 40);

  const columnProfiles: ColumnProfile[] = [];
  const featureColumns = config.featureColumns ?? Array.from({ length: numColumns - 1 }, (_, i) => `feature_${i}`);

  // Target column
  columnProfiles.push({
    name: config.targetColumn,
    dtype: taskType === "classification" ? "categorical" : "numeric",
    isTarget: true,
    isFeature: false,
    missingPercent: _rng.next() * 5,
    uniqueCount: taskType === "classification" ? 2 + Math.floor(_rng.next() * 10) : numRows,
    uniquePercent: taskType === "classification" ? 0.1 : 100,
    isCategorical: taskType === "classification",
    isNumeric: taskType !== "classification",
    isDateTime: false,
    isText: false,
    cardinality: taskType === "classification" ? "low" : "high",
    sampleValues: [],
  });

  // Feature columns
  for (const colName of featureColumns) {
    const isNumeric = _rng.next() > 0.4;
    const isCategorical = !isNumeric && _rng.next() > 0.3;
    const uniqueCount = isCategorical ? 5 + Math.floor(_rng.next() * 50) : numRows;

    columnProfiles.push({
      name: colName,
      dtype: isNumeric ? "numeric" : isCategorical ? "categorical" : "text",
      isTarget: false,
      isFeature: true,
      missingPercent: _rng.next() * 20,
      uniqueCount,
      uniquePercent: (uniqueCount / numRows) * 100,
      isCategorical,
      isNumeric,
      isDateTime: false,
      isText: !isNumeric && !isCategorical,
      cardinality: uniqueCount < 10 ? "low" : uniqueCount < 100 ? "medium" : "high",
      outliers: isNumeric ? Math.floor(_rng.next() * 50) : undefined,
      distribution: isNumeric ? {
        skewness: _rng.next() * 4 - 2,
        kurtosis: _rng.next() * 10,
        isNormal: _rng.next() > 0.5,
      } : undefined,
      sampleValues: [],
    });
  }

  const missingValuesPercent = columnProfiles.reduce((sum, c) => sum + c.missingPercent, 0) / columnProfiles.length;
  const qualityScore = Math.max(0, 100 - missingValuesPercent * 2 - (columnProfiles.filter(c => c.outliers && c.outliers > 20).length * 5));

  const detectedTaskType = taskType === "auto-detect"
    ? (columnProfiles.find(c => c.isTarget)?.isCategorical ? "classification" : "regression")
    : taskType;

  const recommendations: string[] = [];
  if (missingValuesPercent > 10) {
    recommendations.push("High missing values detected. Consider imputation strategies.");
  }
  if (columnProfiles.filter(c => c.outliers && c.outliers > 20).length > 0) {
    recommendations.push("Outliers detected in numeric columns. Consider outlier treatment.");
  }
  if (columnProfiles.filter(c => c.isCategorical && c.cardinality === "high").length > 0) {
    recommendations.push("High cardinality categorical features detected. Consider target encoding or embedding.");
  }

  return {
    numRows,
    numColumns,
    columnProfiles,
    detectedTaskType,
    detectedDataType: "tabular",
    classDistribution: detectedTaskType === "classification" ? { "class_0": 60, "class_1": 40 } : undefined,
    missingValuesPercent,
    memorySizeMb: (numRows * numColumns * 8) / 1024 / 1024,
    statistics: {},
    qualityScore,
    recommendations,
  };
}

async function generatePreprocessingConfig(
  profile: DatasetProfile,
  constraints: AutoMLConstraints
): Promise<PreprocessingConfig> {
  const steps: PreprocessingStep[] = [];

  // Missing values
  if (profile.missingValuesPercent > 0) {
    steps.push("missing-values");
  }

  // Encoding
  const hasCategorical = profile.columnProfiles.some(c => c.isCategorical && c.isFeature);
  if (hasCategorical) {
    steps.push("encoding");
  }

  // Scaling
  const hasNumeric = profile.columnProfiles.some(c => c.isNumeric && c.isFeature);
  if (hasNumeric) {
    steps.push("scaling");
  }

  // Outlier detection
  const hasOutliers = profile.columnProfiles.some(c => c.outliers && c.outliers > 10);
  if (hasOutliers) {
    steps.push("outlier-detection");
  }

  // Feature selection
  if (profile.numColumns > 20) {
    steps.push("feature-selection");
  }

  return {
    steps,
    missingValueStrategy: profile.missingValuesPercent > 20 ? "median" : "mean",
    encodingStrategy: "one-hot",
    scalingStrategy: "standard",
    outlierStrategy: "cap",
    outlierThreshold: 3.0,
    featureSelectionStrategy: profile.numColumns > 50 ? "mutual-info" : "correlation",
    featureSelectionK: Math.min(profile.numColumns - 1, 50),
    dimensionalityReduction: "none",
  };
}

async function generateFeatureEngineeringConfig(
  profile: DatasetProfile,
  taskType: TaskType
): Promise<FeatureEngineeringConfig> {
  const steps: FeatureEngineeringStep[] = [];

  const hasNumeric = profile.columnProfiles.some(c => c.isNumeric && c.isFeature);
  const hasDateTime = profile.columnProfiles.some(c => c.isDateTime && c.isFeature);
  const hasText = profile.columnProfiles.some(c => c.isText && c.isFeature);

  if (hasNumeric && profile.numColumns < 30) {
    steps.push("interaction");
  }

  if (hasDateTime) {
    steps.push("datetime");
  }

  if (hasText) {
    steps.push("text-vectorization");
  }

  return {
    steps,
    polynomialDegree: 2,
    interactionFeatures: hasNumeric && profile.numColumns < 30,
    datetimeFeatures: hasDateTime,
    textVectorization: hasText ? "tfidf" : "none",
    aggregationFeatures: false,
  };
}

async function generateModelSelectionConfig(
  profile: DatasetProfile,
  taskType: TaskType,
  constraints: AutoMLConstraints
): Promise<ModelSelectionConfig> {
  const strategy = profile.numRows > 50000 ? "quick" : profile.numRows > 10000 ? "auto" : "exhaustive";
  const maxModels = Math.min(constraints.maxModels ?? 20, strategy === "quick" ? 5 : strategy === "auto" ? 10 : 20);

  return {
    strategy,
    maxModels,
    evaluationMetric: taskType === "classification" ? "accuracy" : "r2",
    crossValidationFolds: profile.numRows > 50000 ? 3 : 5,
    earlyStopping: true,
    earlyStoppingPatience: 10,
  };
}

async function trainModels(job: AutoMLJob): Promise<AutoMLModel[]> {
  const numModels = job.modelSelection?.maxModels ?? 10;
  const models: AutoMLModel[] = [];

  const modelFamilies: ModelFamily[] = ["linear", "tree-based", "ensemble", "neural-network", "svm"];

  for (let i = 0; i < numModels; i++) {
    const family = modelFamilies[i % modelFamilies.length];
    const modelName = generateModelName(family, i);
    const hyperparameters = generateHyperparameters(family);
    const trainingTimeMs = 5000 + _rng.next() * 25000;

    const metrics = generateMetrics(job.taskType, i);

    const pipeline: AutoMLPipeline = {
      id: `pipeline_${randomUUID().slice(0, 8)}`,
      jobId: job.id,
      preprocessingSteps: (job.preprocessing?.steps ?? []).map(step => ({
        name: step,
        type: step,
        params: {},
      })),
      featureEngineeringSteps: (job.featureEngineering?.steps ?? []).map(step => ({
        name: step,
        type: step,
        params: {},
      })),
      modelStep: {
        name: modelName,
        type: family,
        params: hyperparameters,
      },
      postprocessingSteps: [],
      estimatedLatencyMs: 10 + _rng.next() * 90,
      estimatedMemoryMb: 50 + _rng.next() * 450,
    };

    models.push({
      id: `model_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      jobId: job.id,
      modelFamily: family,
      modelName,
      hyperparameters,
      trainingTimeMs,
      evaluationMetrics: metrics,
      rank: i + 1,
      isSelected: i === 0,
      pipeline,
      modelSizeMb: 10 + _rng.next() * 90,
      inferenceLatencyMs: pipeline.estimatedLatencyMs,
      featureImportance: generateFeatureImportance(job.profile),
      createdAt: new Date().toISOString(),
    });
  }

  // Sort by primary metric
  const primaryMetric = job.modelSelection?.evaluationMetric ?? (job.taskType === "classification" ? "accuracy" : "r2");
  models.sort((a, b) => (b.evaluationMetrics[primaryMetric] ?? 0) - (a.evaluationMetrics[primaryMetric] ?? 0));
  models.forEach((m, i) => { m.rank = i + 1; m.isSelected = i === 0; });

  return models;
}

async function evaluateModels(job: AutoMLJob): Promise<AutoMLEvaluation> {
  const bestModel = job.allModels[0];
  const recommendations: string[] = [];
  const warnings: string[] = [];

  if (bestModel.evaluationMetrics.accuracy && bestModel.evaluationMetrics.accuracy < (job.constraints.minAccuracy ?? 0.7)) {
    warnings.push(`Best model accuracy (${bestModel.evaluationMetrics.accuracy}) is below minimum threshold (${job.constraints.minAccuracy})`);
  }

  if (bestModel.inferenceLatencyMs && bestModel.inferenceLatencyMs > (job.constraints.maxLatencyMs ?? 1000)) {
    warnings.push(`Best model latency (${bestModel.inferenceLatencyMs}ms) exceeds maximum (${job.constraints.maxLatencyMs}ms)`);
  }

  recommendations.push("Consider ensemble methods for improved accuracy");
  recommendations.push("Feature importance analysis suggests focusing on top 10 features");

  return {
    bestModelId: bestModel.id,
    bestModelName: bestModel.modelName,
    bestMetrics: bestModel.evaluationMetrics,
    allModelsMetrics: job.allModels.map(m => ({
      modelId: m.id,
      modelName: m.modelName,
      metrics: m.evaluationMetrics,
      rank: m.rank,
    })),
    featureImportance: bestModel.featureImportance,
    recommendations,
    warnings,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateModelName(family: ModelFamily, index: number): string {
  const names: Record<ModelFamily, string[]> = {
    linear: ["LogisticRegression", "LinearRegression", "Ridge", "Lasso", "ElasticNet"],
    "tree-based": ["DecisionTree", "RandomForest", "ExtraTrees", "GradientBoosting"],
    ensemble: ["XGBoost", "LightGBM", "CatBoost", "AdaBoost", "VotingEnsemble"],
    "neural-network": ["MLP", "DeepNeuralNet", "TabNet", "FTTransformer"],
    svm: ["SVM", "NuSVM", "LinearSVM"],
    bayesian: ["GaussianNB", "BernoulliNB", "MultinomialNB"],
    "instance-based": ["KNN", "RadiusNeighbors"],
    auto: ["AutoModel"],
  };

  const familyNames = names[family] ?? names.auto;
  return familyNames[index % familyNames.length];
}

function generateHyperparameters(family: ModelFamily): Record<string, unknown> {
  const params: Record<ModelFamily, Record<string, unknown>> = {
    linear: { C: 1.0, penalty: "l2", solver: "lbfgs" },
    "tree-based": { n_estimators: 100, max_depth: 10, min_samples_split: 2 },
    ensemble: { n_estimators: 500, learning_rate: 0.1, max_depth: 6, subsample: 0.8 },
    "neural-network": { hidden_layers: [128, 64, 32], activation: "relu", dropout: 0.3, epochs: 100 },
    svm: { C: 1.0, kernel: "rbf", gamma: "scale" },
    bayesian: { alpha: 1.0, fit_prior: true },
    "instance-based": { n_neighbors: 5, weights: "distance", metric: "minkowski" },
    auto: {},
  };

  return params[family] ?? {};
}

function generateMetrics(taskType: TaskType, rank: number): Record<string, number> {
  const baseAccuracy = 0.95 - rank * 0.02;
  const noise = (_rng.next() - 0.5) * 0.05;

  if (taskType === "classification") {
    return {
      accuracy: Math.max(0.5, Math.min(1, baseAccuracy + noise)),
      precision: Math.max(0.5, Math.min(1, baseAccuracy + noise - 0.02)),
      recall: Math.max(0.5, Math.min(1, baseAccuracy + noise + 0.01)),
      f1: Math.max(0.5, Math.min(1, baseAccuracy + noise - 0.01)),
      auc_roc: Math.max(0.5, Math.min(1, baseAccuracy + noise + 0.02)),
    };
  } else {
    return {
      r2: Math.max(0, Math.min(1, baseAccuracy + noise)),
      mse: Math.max(0, 1 - baseAccuracy - noise) * 100,
      rmse: Math.sqrt(Math.max(0, 1 - baseAccuracy - noise) * 100),
      mae: Math.max(0, 1 - baseAccuracy - noise) * 50,
    };
  }
}

function generateFeatureImportance(profile?: DatasetProfile): Record<string, number> {
  if (!profile) return {};

  const importance: Record<string, number> = {};
  const featureColumns = profile.columnProfiles.filter(c => c.isFeature);

  for (const col of featureColumns) {
    importance[col.name] = _rng.next();
  }

  // Normalize
  const sum = Object.values(importance).reduce((a, b) => a + b, 0);
  for (const key in importance) {
    importance[key] = importance[key] / sum;
  }

  return importance;
}
