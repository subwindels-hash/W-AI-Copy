/**
 * Module 84: AI Model Aggregation Service
 *
 * Provides advanced model aggregation and merging strategies including knowledge
 * distillation, ensemble methods, weighted merging, secure aggregation, and
 * privacy-preserving aggregation techniques for federated learning and model
 * consolidation.
 */

import { randomUUID, createHash } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ModelAggregationJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: AggregationJobStatus;
  aggregationType: AggregationType;
  sourceModels: SourceModel[];
  targetModel?: AggregatedModel;
  config: AggregationConfig;
  strategy: AggregationStrategy;
  privacyConfig: AggregationPrivacyConfig;
  validationConfig: AggregationValidationConfig;
  metrics: AggregationMetrics;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type AggregationJobStatus =
  | 'planned'
  | 'initializing'
  | 'aggregating'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AggregationType =
  | 'federated-averaging'
  | 'knowledge-distillation'
  | 'ensemble-merge'
  | 'weighted-merge'
  | 'secure-aggregation'
  | 'differential-private'
  | 'incremental'
  | 'hierarchical'
  | 'custom';

export interface SourceModel {
  id: string;
  modelId: string;
  modelName: string;
  version: string;
  participantId?: string;
  participantName?: string;
  weight: number;
  quality: ModelQuality;
  metadata?: Record<string, any>;
}

export interface ModelQuality {
  accuracy: number;
  loss: number;
  f1Score?: number;
  precision?: number;
  recall?: number;
  customMetrics?: Record<string, number>;
  dataSamples: number;
  trainingTime: number;
}

export interface AggregatedModel {
  id: string;
  modelId: string;
  modelName: string;
  version: string;
  architecture: string;
  parameters: number;
  sizeBytes: number;
  checksum: string;
  quality: AggregatedModelQuality;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface AggregatedModelQuality {
  accuracy: number;
  loss: number;
  f1Score?: number;
  precision?: number;
  recall?: number;
  customMetrics?: Record<string, number>;
  improvementOverBaseline: number;
  qualityPerSource: SourceQualityContribution[];
}

export interface SourceQualityContribution {
  sourceModelId: string;
  sourceModelName: string;
  weight: number;
  qualityContribution: number;
  correlation: number;
}

export interface AggregationConfig {
  outputModelName: string;
  outputModelVersion: string;
  aggregationRounds: number;
  convergenceThreshold: number;
  maxIterations: number;
  earlyStopping?: EarlyStoppingConfig;
  validationSplit: number;
  batchSize: number;
  learningRate?: number;
  momentum?: number;
  customConfig?: Record<string, any>;
}

export interface EarlyStoppingConfig {
  enabled: boolean;
  patience: number;
  minDelta: number;
  metric: string;
  mode: 'min' | 'max';
}

export type AggregationStrategy =
  | 'fedavg'
  | 'fedprox'
  | 'scaffold'
  | 'fednova'
  | 'fedopt'
  | 'knowledge-distillation'
  | 'ensemble-voting'
  | 'ensemble-stacking'
  | 'weighted-average'
  | 'geometric-mean'
  | 'harmonic-mean'
  | 'secure-sum'
  | 'secure-average'
  | 'differential-private-avg'
  | 'custom';

export interface AggregationPrivacyConfig {
  enabled: boolean;
  mechanism: PrivacyMechanism;
  differentialPrivacy?: DifferentialPrivacyConfig;
  secureAggregation?: SecureAggregationConfig;
  homomorphicEncryption?: HomomorphicEncryptionConfig;
  noiseInjection?: NoiseInjectionConfig;
}

export type PrivacyMechanism =
  | 'none'
  | 'differential-privacy'
  | 'secure-aggregation'
  | 'homomorphic-encryption'
  | 'noise-injection'
  | 'hybrid';

export interface DifferentialPrivacyConfig {
  epsilon: number;
  delta: number;
  noiseMultiplier: number;
  clippingNorm: number;
  sensitivity: number;
  mechanism: 'laplace' | 'gaussian' | 'exponential';
}

export interface SecureAggregationConfig {
  protocol: 'shamir-secret-sharing' | 'additive-sharing' | 'pairwise-masking';
  threshold: number;
  numParties: number;
  keySize: number;
}

export interface HomomorphicEncryptionConfig {
  scheme: 'paillier' | 'ckks' | 'bfv';
  keySize: number;
  precisionBits?: number;
  multiplicativeDepth?: number;
}

export interface NoiseInjectionConfig {
  noiseType: 'gaussian' | 'laplace' | 'uniform';
  scale: number;
  seed?: number;
  perLayer: boolean;
}

export interface AggregationValidationConfig {
  enabled: boolean;
  validationDataset?: string;
  validationMetrics: string[];
  minQualityThreshold: number;
  regressionThreshold: number;
  fairnessMetrics?: FairnessValidationConfig;
  robustnessMetrics?: RobustnessValidationConfig;
}

export interface FairnessValidationConfig {
  enabled: boolean;
  protectedAttributes: string[];
  fairnessMetrics: string[];
  threshold: number;
}

export interface RobustnessValidationConfig {
  enabled: boolean;
  perturbationTypes: string[];
  perturbationMagnitude: number;
  robustnessThreshold: number;
}

export interface AggregationMetrics {
  totalRounds: number;
  completedRounds: number;
  averageRoundTime: number;
  convergenceRate: number;
  finalAccuracy: number;
  finalLoss: number;
  improvementOverBaseline: number;
  privacyBudgetUsed?: number;
  privacyBudgetRemaining?: number;
  qualityPerRound: RoundQuality[];
}

export interface RoundQuality {
  round: number;
  accuracy: number;
  loss: number;
  f1Score?: number;
  customMetrics?: Record<string, number>;
  timestamp: string;
}

export interface AggregationRound {
  id: string;
  jobId: string;
  roundNumber: number;
  status: AggregationRoundStatus;
  sourceModels: SourceModel[];
  aggregatedModel?: AggregatedModel;
  strategy: AggregationStrategy;
  metrics: AggregationRoundMetrics;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export type AggregationRoundStatus =
  | 'pending'
  | 'collecting-models'
  | 'aggregating'
  | 'validating'
  | 'completed'
  | 'failed';

export interface AggregationRoundMetrics {
  totalModels: number;
  participatedModels: number;
  aggregationTime: number;
  validationTime: number;
  roundTime: number;
  accuracy: number;
  loss: number;
  improvement: number;
  privacyBudgetUsed?: number;
}

export interface AggregationDashboard {
  organizationId: string;
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  totalAggregations: number;
  averageAccuracy: number;
  averageImprovement: number;
  recentJobs: ModelAggregationJob[];
  topStrategies: TopStrategy[];
  aggregationTrends: AggregationTrend[];
  privacyUsage: AggregationPrivacyUsage;
}

export interface TopStrategy {
  strategy: AggregationStrategy;
  usageCount: number;
  averageAccuracy: number;
  averageImprovement: number;
}

export interface AggregationTrend {
  date: string;
  jobCount: number;
  averageAccuracy: number;
  averageImprovement: number;
  privacyUsage: number;
}

export interface AggregationPrivacyUsage {
  totalBudgetUsed: number;
  totalBudgetRemaining: number;
  averageBudgetPerJob: number;
  jobsWithPrivacy: number;
  privacyMechanisms: Record<PrivacyMechanism, number>;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const aggregationJobs = new Map<string, ModelAggregationJob>();
const aggregationRounds = new Map<string, AggregationRound[]>();

// ─── Aggregation Job Management ────────────────────────────────────────────────

/**
 * Create a model aggregation job
 */
export async function createModelAggregationJob(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    aggregationType: AggregationType;
    sourceModels: SourceModel[];
    config: AggregationConfig;
    strategy: AggregationStrategy;
    privacyConfig?: AggregationPrivacyConfig;
    validationConfig?: AggregationValidationConfig;
    createdBy: string;
  }
): Promise<ModelAggregationJob> {
  const id = `aggjob_${randomUUID()}`;
  const now = new Date().toISOString();

  const job: ModelAggregationJob = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    status: 'planned',
    aggregationType: params.aggregationType,
    sourceModels: params.sourceModels,
    config: params.config,
    strategy: params.strategy,
    privacyConfig: params.privacyConfig || {
      enabled: false,
      mechanism: 'none',
    },
    validationConfig: params.validationConfig || {
      enabled: false,
      validationMetrics: ['accuracy', 'loss'],
      minQualityThreshold: 0,
      regressionThreshold: 0,
    },
    metrics: {
      totalRounds: params.config.aggregationRounds,
      completedRounds: 0,
      averageRoundTime: 0,
      convergenceRate: 0,
      finalAccuracy: 0,
      finalLoss: 0,
      improvementOverBaseline: 0,
      qualityPerRound: [],
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  aggregationJobs.set(id, job);
  aggregationRounds.set(id, []);

  return job;
}

/**
 * Start model aggregation job
 */
export async function startModelAggregationJob(
  jobId: string
): Promise<ModelAggregationJob | null> {
  const job = aggregationJobs.get(jobId);
  if (!job || job.status !== 'planned') return null;

  job.status = 'initializing';
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  // Validate source models
  if (job.sourceModels.length < 2) {
    job.status = 'failed';
    job.updatedAt = new Date().toISOString();
    aggregationJobs.set(jobId, job);
    return job;
  }

  job.status = 'aggregating';
  job.updatedAt = new Date().toISOString();

  aggregationJobs.set(jobId, job);
  return job;
}

/**
 * Execute aggregation round
 */
export async function executeAggregationRound(
  jobId: string
): Promise<AggregationRound | null> {
  const job = aggregationJobs.get(jobId);
  if (!job || job.status !== 'aggregating') return null;

  const roundId = `agground_${randomUUID()}`;
  const now = new Date().toISOString();

  const round: AggregationRound = {
    id: roundId,
    jobId,
    roundNumber: job.metrics.completedRounds + 1,
    status: 'collecting-models',
    sourceModels: job.sourceModels,
    strategy: job.strategy,
    metrics: {
      totalModels: job.sourceModels.length,
      participatedModels: 0,
      aggregationTime: 0,
      validationTime: 0,
      roundTime: 0,
      accuracy: 0,
      loss: 0,
      improvement: 0,
    },
    startedAt: now,
  };

  const jobRounds = aggregationRounds.get(jobId) || [];
  jobRounds.push(round);
  aggregationRounds.set(jobId, jobRounds);

  return round;
}

/**
 * Perform federated averaging aggregation
 */
export async function performFedAvgAggregation(
  jobId: string,
  roundId: string,
  modelUpdates: ModelUpdate[]
): Promise<AggregatedModel | null> {
  const job = aggregationJobs.get(jobId);
  if (!job) return null;

  const jobRounds = aggregationRounds.get(jobId) || [];
  const round = jobRounds.find((r) => r.id === roundId);
  if (!round) return null;

  round.status = 'aggregating';
  const startTime = Date.now();

  // Simulate federated averaging
  const totalWeight = modelUpdates.reduce((sum, update) => sum + update.weight, 0);
  const aggregatedAccuracy = modelUpdates.reduce((sum, update) => {
    return sum + (update.quality.accuracy * update.weight / totalWeight);
  }, 0);

  const aggregatedLoss = modelUpdates.reduce((sum, update) => {
    return sum + (update.quality.loss * update.weight / totalWeight);
  }, 0);

  const aggregatedModel: AggregatedModel = {
    id: `aggmodel_${randomUUID()}`,
    modelId: `model_${randomUUID()}`,
    modelName: job.config.outputModelName,
    version: job.config.outputModelVersion,
    architecture: 'aggregated',
    parameters: 0,
    sizeBytes: 0,
    checksum: createHash('sha256').update(JSON.stringify(modelUpdates)).digest('hex'),
    quality: {
      accuracy: aggregatedAccuracy,
      loss: aggregatedLoss,
      improvementOverBaseline: 0,
      qualityPerSource: modelUpdates.map((update) => ({
        sourceModelId: update.modelId,
        sourceModelName: update.modelName,
        weight: update.weight,
        qualityContribution: update.quality.accuracy * update.weight / totalWeight,
        correlation: 0,
      })),
    },
    createdAt: new Date().toISOString(),
  };

  round.aggregatedModel = aggregatedModel;
  round.metrics.aggregationTime = Date.now() - startTime;
  round.metrics.accuracy = aggregatedAccuracy;
  round.metrics.loss = aggregatedLoss;
  round.metrics.participatedModels = modelUpdates.length;

  aggregationRounds.set(jobId, jobRounds);
  return aggregatedModel;
}

/**
 * Perform knowledge distillation aggregation
 */
export async function performKnowledgeDistillation(
  jobId: string,
  roundId: string,
  teacherModels: ModelUpdate[],
  studentModel: ModelUpdate,
  temperature: number = 3.0
): Promise<AggregatedModel | null> {
  const job = aggregationJobs.get(jobId);
  if (!job) return null;

  const jobRounds = aggregationRounds.get(jobId) || [];
  const round = jobRounds.find((r) => r.id === roundId);
  if (!round) return null;

  round.status = 'aggregating';
  const startTime = Date.now();

  // Simulate knowledge distillation
  const teacherAccuracy = teacherModels.reduce((sum, model) => sum + model.quality.accuracy, 0) / teacherModels.length;
  const studentAccuracy = studentModel.quality.accuracy;

  // Distillation typically improves student model
  const distilledAccuracy = Math.min(1.0, studentAccuracy + (teacherAccuracy - studentAccuracy) * 0.7);

  const aggregatedModel: AggregatedModel = {
    id: `aggmodel_${randomUUID()}`,
    modelId: `model_${randomUUID()}`,
    modelName: job.config.outputModelName,
    version: job.config.outputModelVersion,
    architecture: studentModel.architecture || 'distilled',
    parameters: studentModel.parameters || 0,
    sizeBytes: studentModel.sizeBytes || 0,
    checksum: createHash('sha256').update(JSON.stringify({ teacherModels, studentModel })).digest('hex'),
    quality: {
      accuracy: distilledAccuracy,
      loss: studentModel.quality.loss * 0.8,
      improvementOverBaseline: distilledAccuracy - studentAccuracy,
      qualityPerSource: teacherModels.map((model) => ({
        sourceModelId: model.modelId,
        sourceModelName: model.modelName,
        weight: 1 / teacherModels.length,
        qualityContribution: model.quality.accuracy / teacherModels.length,
        correlation: 0,
      })),
    },
    createdAt: new Date().toISOString(),
  };

  round.aggregatedModel = aggregatedModel;
  round.metrics.aggregationTime = Date.now() - startTime;
  round.metrics.accuracy = distilledAccuracy;
  round.metrics.loss = aggregatedModel.quality.loss;
  round.metrics.participatedModels = teacherModels.length + 1;
  round.metrics.improvement = distilledAccuracy - studentAccuracy;

  aggregationRounds.set(jobId, jobRounds);
  return aggregatedModel;
}

/**
 * Perform ensemble merging aggregation
 */
export async function performEnsembleMerge(
  jobId: string,
  roundId: string,
  ensembleModels: ModelUpdate[],
  ensembleStrategy: 'voting' | 'stacking' | 'averaging' = 'voting'
): Promise<AggregatedModel | null> {
  const job = aggregationJobs.get(jobId);
  if (!job) return null;

  const jobRounds = aggregationRounds.get(jobId) || [];
  const round = jobRounds.find((r) => r.id === roundId);
  if (!round) return null;

  round.status = 'aggregating';
  const startTime = Date.now();

  // Simulate ensemble merging
  let ensembleAccuracy: number;

  switch (ensembleStrategy) {
    case 'voting':
      // Majority voting typically improves accuracy
      ensembleAccuracy = Math.min(1.0, ensembleModels.reduce((sum, model) => sum + model.quality.accuracy, 0) / ensembleModels.length + 0.05);
      break;
    case 'stacking':
      // Stacking can achieve higher accuracy
      ensembleAccuracy = Math.min(1.0, Math.max(...ensembleModels.map((m) => m.quality.accuracy)) + 0.03);
      break;
    case 'averaging':
      // Simple averaging
      ensembleAccuracy = ensembleModels.reduce((sum, model) => sum + model.quality.accuracy, 0) / ensembleModels.length;
      break;
    default:
      ensembleAccuracy = ensembleModels.reduce((sum, model) => sum + model.quality.accuracy, 0) / ensembleModels.length;
  }

  const aggregatedModel: AggregatedModel = {
    id: `aggmodel_${randomUUID()}`,
    modelId: `model_${randomUUID()}`,
    modelName: job.config.outputModelName,
    version: job.config.outputModelVersion,
    architecture: `ensemble-${ensembleStrategy}`,
    parameters: ensembleModels.reduce((sum, model) => sum + (model.parameters || 0), 0),
    sizeBytes: ensembleModels.reduce((sum, model) => sum + (model.sizeBytes || 0), 0),
    checksum: createHash('sha256').update(JSON.stringify(ensembleModels)).digest('hex'),
    quality: {
      accuracy: ensembleAccuracy,
      loss: ensembleModels.reduce((sum, model) => sum + model.quality.loss, 0) / ensembleModels.length,
      improvementOverBaseline: ensembleAccuracy - Math.max(...ensembleModels.map((m) => m.quality.accuracy)),
      qualityPerSource: ensembleModels.map((model) => ({
        sourceModelId: model.modelId,
        sourceModelName: model.modelName,
        weight: 1 / ensembleModels.length,
        qualityContribution: model.quality.accuracy / ensembleModels.length,
        correlation: 0,
      })),
    },
    createdAt: new Date().toISOString(),
  };

  round.aggregatedModel = aggregatedModel;
  round.metrics.aggregationTime = Date.now() - startTime;
  round.metrics.accuracy = ensembleAccuracy;
  round.metrics.loss = aggregatedModel.quality.loss;
  round.metrics.participatedModels = ensembleModels.length;
  round.metrics.improvement = aggregatedModel.quality.improvementOverBaseline;

  aggregationRounds.set(jobId, jobRounds);
  return aggregatedModel;
}

/**
 * Perform weighted merge aggregation
 */
export async function performWeightedMerge(
  jobId: string,
  roundId: string,
  modelUpdates: ModelUpdate[],
  weights?: number[]
): Promise<AggregatedModel | null> {
  const job = aggregationJobs.get(jobId);
  if (!job) return null;

  const jobRounds = aggregationRounds.get(jobId) || [];
  const round = jobRounds.find((r) => r.id === roundId);
  if (!round) return null;

  round.status = 'aggregating';
  const startTime = Date.now();

  // Use provided weights or calculate based on quality
  const modelWeights = weights || modelUpdates.map((model) => model.quality.accuracy);
  const totalWeight = modelWeights.reduce((sum, w) => sum + w, 0);
  const normalizedWeights = modelWeights.map((w) => w / totalWeight);

  const weightedAccuracy = modelUpdates.reduce((sum, model, index) => {
    return sum + (model.quality.accuracy * normalizedWeights[index]);
  }, 0);

  const weightedLoss = modelUpdates.reduce((sum, model, index) => {
    return sum + (model.quality.loss * normalizedWeights[index]);
  }, 0);

  const aggregatedModel: AggregatedModel = {
    id: `aggmodel_${randomUUID()}`,
    modelId: `model_${randomUUID()}`,
    modelName: job.config.outputModelName,
    version: job.config.outputModelVersion,
    architecture: 'weighted-merge',
    parameters: modelUpdates.reduce((sum, model, index) => sum + (model.parameters || 0) * normalizedWeights[index], 0),
    sizeBytes: modelUpdates.reduce((sum, model, index) => sum + (model.sizeBytes || 0) * normalizedWeights[index], 0),
    checksum: createHash('sha256').update(JSON.stringify({ modelUpdates, normalizedWeights })).digest('hex'),
    quality: {
      accuracy: weightedAccuracy,
      loss: weightedLoss,
      improvementOverBaseline: weightedAccuracy - Math.max(...modelUpdates.map((m) => m.quality.accuracy)),
      qualityPerSource: modelUpdates.map((model, index) => ({
        sourceModelId: model.modelId,
        sourceModelName: model.modelName,
        weight: normalizedWeights[index],
        qualityContribution: model.quality.accuracy * normalizedWeights[index],
        correlation: 0,
      })),
    },
    createdAt: new Date().toISOString(),
  };

  round.aggregatedModel = aggregatedModel;
  round.metrics.aggregationTime = Date.now() - startTime;
  round.metrics.accuracy = weightedAccuracy;
  round.metrics.loss = weightedLoss;
  round.metrics.participatedModels = modelUpdates.length;
  round.metrics.improvement = aggregatedModel.quality.improvementOverBaseline;

  aggregationRounds.set(jobId, jobRounds);
  return aggregatedModel;
}

/**
 * Perform secure aggregation with differential privacy
 */
export async function performSecureAggregation(
  jobId: string,
  roundId: string,
  modelUpdates: ModelUpdate[],
  privacyConfig: DifferentialPrivacyConfig
): Promise<AggregatedModel | null> {
  const job = aggregationJobs.get(jobId);
  if (!job) return null;

  const jobRounds = aggregationRounds.get(jobId) || [];
  const round = jobRounds.find((r) => r.id === roundId);
  if (!round) return null;

  round.status = 'aggregating';
  const startTime = Date.now();

  // Simulate secure aggregation with differential privacy
  const totalWeight = modelUpdates.reduce((sum, update) => sum + update.weight, 0);
  let aggregatedAccuracy = modelUpdates.reduce((sum, update) => {
    return sum + (update.quality.accuracy * update.weight / totalWeight);
  }, 0);

  // Add noise for differential privacy
  const noiseScale = privacyConfig.sensitivity * privacyConfig.noiseMultiplier / privacyConfig.epsilon;
  const noise = (Math.random() - 0.5) * 2 * noiseScale;
  aggregatedAccuracy = Math.max(0, Math.min(1, aggregatedAccuracy + noise));

  const aggregatedModel: AggregatedModel = {
    id: `aggmodel_${randomUUID()}`,
    modelId: `model_${randomUUID()}`,
    modelName: job.config.outputModelName,
    version: job.config.outputModelVersion,
    architecture: 'secure-aggregated',
    parameters: 0,
    sizeBytes: 0,
    checksum: createHash('sha256').update(JSON.stringify(modelUpdates)).digest('hex'),
    quality: {
      accuracy: aggregatedAccuracy,
      loss: modelUpdates.reduce((sum, update) => {
        return sum + (update.quality.loss * update.weight / totalWeight);
      }, 0),
      improvementOverBaseline: 0,
      qualityPerSource: modelUpdates.map((update) => ({
        sourceModelId: update.modelId,
        sourceModelName: update.modelName,
        weight: update.weight,
        qualityContribution: update.quality.accuracy * update.weight / totalWeight,
        correlation: 0,
      })),
    },
    createdAt: new Date().toISOString(),
  };

  round.aggregatedModel = aggregatedModel;
  round.metrics.aggregationTime = Date.now() - startTime;
  round.metrics.accuracy = aggregatedAccuracy;
  round.metrics.loss = aggregatedModel.quality.loss;
  round.metrics.participatedModels = modelUpdates.length;
  round.metrics.privacyBudgetUsed = privacyConfig.epsilon;

  job.metrics.privacyBudgetUsed = (job.metrics.privacyBudgetUsed || 0) + privacyConfig.epsilon;

  aggregationRounds.set(jobId, jobRounds);
  aggregationJobs.set(jobId, job);

  return aggregatedModel;
}

/**
 * Complete aggregation round
 */
export async function completeAggregationRound(
  jobId: string,
  roundId: string,
  validationMetrics?: Record<string, number>
): Promise<AggregationRound | null> {
  const job = aggregationJobs.get(jobId);
  if (!job) return null;

  const jobRounds = aggregationRounds.get(jobId) || [];
  const round = jobRounds.find((r) => r.id === roundId);
  if (!round || !round.aggregatedModel) return null;

  round.status = 'completed';
  round.completedAt = new Date().toISOString();
  round.metrics.roundTime = new Date(round.completedAt).getTime() - new Date(round.startedAt).getTime();

  if (validationMetrics) {
    round.metrics.validationTime = round.metrics.roundTime - round.metrics.aggregationTime;
    if (validationMetrics.accuracy) {
      round.metrics.accuracy = validationMetrics.accuracy;
      round.aggregatedModel.quality.accuracy = validationMetrics.accuracy;
    }
    if (validationMetrics.loss) {
      round.metrics.loss = validationMetrics.loss;
      round.aggregatedModel.quality.loss = validationMetrics.loss;
    }
  }

  // Update job metrics
  job.metrics.completedRounds++;
  job.metrics.averageRoundTime = jobRounds.reduce((sum, r) => sum + r.metrics.roundTime, 0) / job.metrics.completedRounds;
  job.metrics.finalAccuracy = round.metrics.accuracy;
  job.metrics.finalLoss = round.metrics.loss;
  job.metrics.qualityPerRound.push({
    round: round.roundNumber,
    accuracy: round.metrics.accuracy,
    loss: round.metrics.loss,
    timestamp: round.completedAt,
  });

  // Check convergence
  if (job.metrics.completedRounds > 1) {
    const prevRound = jobRounds[job.metrics.completedRounds - 2];
    const improvement = round.metrics.accuracy - prevRound.metrics.accuracy;
    job.metrics.convergenceRate = improvement;

    if (Math.abs(improvement) < job.config.convergenceThreshold) {
      job.status = 'completed';
      job.completedAt = round.completedAt;
      job.targetModel = round.aggregatedModel;
    }
  }

  if (job.metrics.completedRounds >= job.config.maxIterations) {
    job.status = 'completed';
    job.completedAt = round.completedAt;
    job.targetModel = round.aggregatedModel;
  }

  job.updatedAt = round.completedAt;

  aggregationRounds.set(jobId, jobRounds);
  aggregationJobs.set(jobId, job);

  return round;
}

/**
 * Cancel model aggregation job
 */
export async function cancelModelAggregationJob(
  jobId: string
): Promise<ModelAggregationJob | null> {
  const job = aggregationJobs.get(jobId);
  if (!job || job.status === 'completed' || job.status === 'cancelled') return null;

  job.status = 'cancelled';
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;

  aggregationJobs.set(jobId, job);
  return job;
}

/**
 * Get model aggregation job by ID
 */
export async function getModelAggregationJob(
  jobId: string
): Promise<ModelAggregationJob | null> {
  return aggregationJobs.get(jobId) || null;
}

/**
 * List model aggregation jobs for an organization
 */
export async function listModelAggregationJobs(
  organizationId: string,
  filters?: { status?: AggregationJobStatus; aggregationType?: AggregationType }
): Promise<ModelAggregationJob[]> {
  let orgJobs = Array.from(aggregationJobs.values()).filter((j) => j.organizationId === organizationId);

  if (filters?.status) {
    orgJobs = orgJobs.filter((j) => j.status === filters.status);
  }

  if (filters?.aggregationType) {
    orgJobs = orgJobs.filter((j) => j.aggregationType === filters.aggregationType);
  }

  return orgJobs;
}

/**
 * Get aggregation rounds for a job
 */
export async function getAggregationRounds(
  jobId: string
): Promise<AggregationRound[]> {
  return aggregationRounds.get(jobId) || [];
}

/**
 * Get aggregation dashboard
 */
export async function getAggregationDashboard(
  organizationId: string
): Promise<AggregationDashboard> {
  const orgJobs = await listModelAggregationJobs(organizationId);

  const activeJobs = orgJobs.filter((j) => j.status === 'aggregating' || j.status === 'validating');
  const completedJobs = orgJobs.filter((j) => j.status === 'completed');

  const totalAggregations = orgJobs.reduce((sum, j) => sum + j.metrics.completedRounds, 0);

  const averageAccuracy = completedJobs.length > 0
    ? completedJobs.reduce((sum, j) => sum + j.metrics.finalAccuracy, 0) / completedJobs.length
    : 0;

  const averageImprovement = completedJobs.length > 0
    ? completedJobs.reduce((sum, j) => sum + j.metrics.improvementOverBaseline, 0) / completedJobs.length
    : 0;

  const recentJobs = orgJobs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  // Calculate top strategies
  const strategyUsage = new Map<AggregationStrategy, {
    usageCount: number;
    totalAccuracy: number;
    totalImprovement: number;
  }>();

  for (const job of completedJobs) {
    const strategy = strategyUsage.get(job.strategy) || {
      usageCount: 0,
      totalAccuracy: 0,
      totalImprovement: 0,
    };

    strategy.usageCount++;
    strategy.totalAccuracy += job.metrics.finalAccuracy;
    strategy.totalImprovement += job.metrics.improvementOverBaseline;

    strategyUsage.set(job.strategy, strategy);
  }

  const topStrategies = Array.from(strategyUsage.entries())
    .map(([strategy, data]) => ({
      strategy,
      usageCount: data.usageCount,
      averageAccuracy: data.totalAccuracy / data.usageCount,
      averageImprovement: data.totalImprovement / data.usageCount,
    }))
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 10);

  // Calculate aggregation trends (last 30 days)
  const aggregationTrends: AggregationTrend[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dayJobs = orgJobs.filter((j) => j.createdAt.startsWith(dateStr));
    const dayCompletedJobs = dayJobs.filter((j) => j.status === 'completed');

    aggregationTrends.push({
      date: dateStr,
      jobCount: dayJobs.length,
      averageAccuracy: dayCompletedJobs.length > 0
        ? dayCompletedJobs.reduce((sum, j) => sum + j.metrics.finalAccuracy, 0) / dayCompletedJobs.length
        : 0,
      averageImprovement: dayCompletedJobs.length > 0
        ? dayCompletedJobs.reduce((sum, j) => sum + j.metrics.improvementOverBaseline, 0) / dayCompletedJobs.length
        : 0,
      privacyUsage: dayJobs.reduce((sum, j) => sum + (j.metrics.privacyBudgetUsed || 0), 0),
    });
  }

  aggregationTrends.reverse();

  // Calculate privacy usage
  const privacyUsage: AggregationPrivacyUsage = {
    totalBudgetUsed: 0,
    totalBudgetRemaining: 0,
    averageBudgetPerJob: 0,
    jobsWithPrivacy: 0,
    privacyMechanisms: {
      'none': 0,
      'differential-privacy': 0,
      'secure-aggregation': 0,
      'homomorphic-encryption': 0,
      'noise-injection': 0,
      'hybrid': 0,
    },
  };

  for (const job of orgJobs) {
    if (job.privacyConfig.enabled) {
      privacyUsage.jobsWithPrivacy++;
      privacyUsage.totalBudgetUsed += job.metrics.privacyBudgetUsed || 0;
      privacyUsage.privacyMechanisms[job.privacyConfig.mechanism]++;
    }
  }

  privacyUsage.averageBudgetPerJob = privacyUsage.jobsWithPrivacy > 0
    ? privacyUsage.totalBudgetUsed / privacyUsage.jobsWithPrivacy
    : 0;

  return {
    organizationId,
    totalJobs: orgJobs.length,
    activeJobs: activeJobs.length,
    completedJobs: completedJobs.length,
    totalAggregations,
    averageAccuracy,
    averageImprovement,
    recentJobs,
    topStrategies,
    aggregationTrends,
    privacyUsage,
  };
}

// ─── Helper Types ──────────────────────────────────────────────────────────────

interface ModelUpdate {
  modelId: string;
  modelName: string;
  version: string;
  architecture?: string;
  parameters?: number;
  sizeBytes?: number;
  weight: number;
  quality: ModelQuality;
}
