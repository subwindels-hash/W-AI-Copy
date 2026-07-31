/**
 * Module 85: AI Model Compression Orchestration Service
 *
 * Provides unified model compression orchestration including compression pipeline
 * management, multi-technique compression coordination, compression strategy
 * selection, progressive compression with quality checkpoints, compression
 * rollback, and compression pipeline analytics.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CompressionPipeline {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: CompressionPipelineStatus;
  sourceModel: CompressionSourceModel;
  targetModel?: CompressionTargetModel;
  strategy: CompressionStrategy;
  stages: CompressionStage[];
  currentStage: number;
  qualityCheckpoints: QualityCheckpoint[];
  constraints: CompressionConstraints;
  metrics: CompressionPipelineMetrics;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type CompressionPipelineStatus =
  | 'planned'
  | 'initializing'
  | 'running'
  | 'paused'
  | 'checkpoint'
  | 'completed'
  | 'failed'
  | 'rolled-back'
  | 'cancelled';

export interface CompressionSourceModel {
  modelId: string;
  modelName: string;
  version: string;
  framework: string;
  format: string;
  sizeBytes: number;
  numParameters: number;
  numLayers: number;
  architecture: string;
  baselineMetrics: CompressionModelMetrics;
  metadata?: Record<string, any>;
}

export interface CompressionTargetModel {
  modelId: string;
  modelName: string;
  version: string;
  framework: string;
  format: string;
  sizeBytes: number;
  numParameters: number;
  compressionRatio: number;
  compressionTechniques: CompressionTechnique[];
  metrics: CompressionModelMetrics;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface CompressionModelMetrics {
  accuracy: number;
  loss: number;
  f1Score?: number;
  precision?: number;
  recall?: number;
  latencyMs: number;
  throughputPerSecond: number;
  memoryUsageMb: number;
  powerConsumptionW?: number;
  customMetrics?: Record<string, number>;
}

export type CompressionTechnique =
  | 'quantization'
  | 'pruning'
  | 'distillation'
  | 'weight-sharing'
  | 'low-rank-factorization'
  | 'knowledge-distillation'
  | 'structured-pruning'
  | 'unstructured-pruning'
  | 'mixed-precision'
  | 'neural-architecture-search';

export interface CompressionStrategy {
  name: string;
  description?: string;
  techniques: CompressionTechnique[];
  sequence: CompressionTechniqueSequence[];
  optimizationGoal: CompressionOptimizationGoal;
  targetConstraints: TargetConstraints;
  qualityThreshold: number;
  maxCompressionRatio: number;
  adaptiveCompression: boolean;
}

export interface CompressionTechniqueSequence {
  technique: CompressionTechnique;
  order: number;
  config: CompressionTechniqueConfig;
  dependencies: string[];
  parallel: boolean;
}

export interface CompressionTechniqueConfig {
  quantization?: QuantizationCompressionConfig;
  pruning?: PruningCompressionConfig;
  distillation?: DistillationCompressionConfig;
  custom?: Record<string, any>;
}

export interface QuantizationCompressionConfig {
  precision: 'int8' | 'int16' | 'float16' | 'bfloat16' | 'int4' | 'mixed';
  scheme: 'symmetric' | 'asymmetric' | 'per-tensor' | 'per-channel';
  calibrationSamples: number;
  quantizeLayers?: string[];
  excludeLayers?: string[];
}

export interface PruningCompressionConfig {
  method: 'magnitude' | 'gradient' | 'structured' | 'unstructured' | 'lottery-ticket';
  targetSparsity: number;
  granularity: 'weight' | 'neuron' | 'channel' | 'filter' | 'layer';
  fineTuneAfterPruning: boolean;
  fineTuneEpochs?: number;
  pruneLayers?: string[];
  excludeLayers?: string[];
}

export interface DistillationCompressionConfig {
  teacherModelId: string;
  teacherModelVersion: string;
  temperature: number;
  alpha: number;
  distillationEpochs: number;
  studentArchitecture?: string;
}

export type CompressionOptimizationGoal =
  | 'minimize-size'
  | 'minimize-latency'
  | 'maximize-accuracy'
  | 'balanced'
  | 'minimize-power'
  | 'custom';

export interface TargetConstraints {
  maxSizeBytes?: number;
  maxLatencyMs?: number;
  minAccuracy?: number;
  maxMemoryMb?: number;
  maxPowerW?: number;
  targetHardware?: TargetHardware;
  customConstraints?: Record<string, any>;
}

export interface TargetHardware {
  type: 'cpu' | 'gpu' | 'tpu' | 'edge' | 'mobile' | 'custom';
  architecture?: string;
  memoryMb?: number;
  computeCapability?: string;
  powerBudgetW?: number;
}

export interface CompressionStage {
  id: string;
  stageNumber: number;
  name: string;
  technique: CompressionTechnique;
  status: CompressionStageStatus;
  config: CompressionTechniqueConfig;
  jobId?: string;
  result?: CompressionStageResult;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export type CompressionStageStatus =
  | 'pending'
  | 'initializing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface CompressionStageResult {
  modelId: string;
  modelVersion: string;
  sizeBytes: number;
  numParameters: number;
  compressionRatio: number;
  metrics: CompressionModelMetrics;
  qualityDegradation: number;
  compressionTime: number;
  metadata?: Record<string, any>;
}

export interface QualityCheckpoint {
  id: string;
  stageNumber: number;
  checkpointNumber: number;
  metrics: CompressionModelMetrics;
  qualityScore: number;
  passed: boolean;
  threshold: number;
  createdAt: string;
  action: 'continue' | 'rollback' | 'adjust' | 'stop';
}

export interface CompressionConstraints {
  hardConstraints: HardConstraint[];
  softConstraints: SoftConstraint[];
  qualityThresholds: QualityThreshold[];
}

export interface HardConstraint {
  type: 'max-size' | 'max-latency' | 'min-accuracy' | 'max-memory' | 'max-power';
  value: number;
  unit: string;
  violationAction: 'fail' | 'rollback' | 'warn';
}

export interface SoftConstraint {
  type: 'target-size' | 'target-latency' | 'target-accuracy' | 'target-memory' | 'target-power';
  value: number;
  unit: string;
  weight: number;
  tolerance: number;
}

export interface QualityThreshold {
  metric: string;
  minValue: number;
  maxValue?: number;
  checkpointFrequency: number;
  action: 'continue' | 'rollback' | 'adjust' | 'stop';
}

export interface CompressionPipelineMetrics {
  totalStages: number;
  completedStages: number;
  overallCompressionRatio: number;
  overallQualityDegradation: number;
  totalCompressionTime: number;
  sizeReductionPercent: number;
  latencyChangePercent: number;
  accuracyChangePercent: number;
  memoryReductionPercent: number;
  powerReductionPercent?: number;
  qualityCheckpointsPassed: number;
  qualityCheckpointsFailed: number;
  rollbacks: number;
}

export interface CompressionRollback {
  id: string;
  pipelineId: string;
  fromStage: number;
  toStage: number;
  reason: string;
  rolledBackAt: string;
  rolledBackBy: string;
  modelVersionBefore: string;
  modelVersionAfter: string;
}

export interface CompressionPipelineTemplate {
  id: string;
  name: string;
  description: string;
  strategy: CompressionStrategy;
  useCases: string[];
  bestFor: string[];
  expectedCompressionRatio: number;
  expectedQualityDegradation: number;
  createdBy: string;
  createdAt: string;
}

export interface CompressionOrchestrationDashboard {
  organizationId: string;
  totalPipelines: number;
  activePipelines: number;
  completedPipelines: number;
  averageCompressionRatio: number;
  averageQualityDegradation: number;
  recentPipelines: CompressionPipeline[];
  topTechniques: TopTechnique[];
  compressionTrends: CompressionTrend[];
  qualityDistribution: QualityDistribution;
}

export interface TopTechnique {
  technique: CompressionTechnique;
  usageCount: number;
  averageCompressionRatio: number;
  averageQualityDegradation: number;
  successRate: number;
}

export interface CompressionTrend {
  date: string;
  pipelineCount: number;
  averageCompressionRatio: number;
  averageQualityDegradation: number;
  successRate: number;
}

export interface QualityDistribution {
  excellent: number; // <1% degradation
  good: number; // 1-3% degradation
  acceptable: number; // 3-5% degradation
  poor: number; // >5% degradation
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const compressionPipelines = new Map<string, CompressionPipeline>();
const compressionRollbacks = new Map<string, CompressionRollback[]>();
const compressionTemplates = new Map<string, CompressionPipelineTemplate>();

// ─── Compression Pipeline Management ───────────────────────────────────────────

/**
 * Create a compression pipeline
 */
export async function createCompressionPipeline(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    sourceModel: CompressionSourceModel;
    strategy: CompressionStrategy;
    constraints?: CompressionConstraints;
    createdBy: string;
  }
): Promise<CompressionPipeline> {
  const id = `comppipe_${randomUUID()}`;
  const now = new Date().toISOString();

  const stages: CompressionStage[] = params.strategy.sequence.map((seq, index) => ({
    id: `stage_${randomUUID()}`,
    stageNumber: index,
    name: `${seq.technique} Stage`,
    technique: seq.technique,
    status: 'pending',
    config: seq.config,
  }));

  const pipeline: CompressionPipeline = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    status: 'planned',
    sourceModel: params.sourceModel,
    strategy: params.strategy,
    stages,
    currentStage: 0,
    qualityCheckpoints: [],
    constraints: params.constraints || {
      hardConstraints: [],
      softConstraints: [],
      qualityThresholds: [
        {
          metric: 'accuracy',
          minValue: params.strategy.qualityThreshold,
          checkpointFrequency: 1,
          action: 'rollback',
        },
      ],
    },
    metrics: {
      totalStages: stages.length,
      completedStages: 0,
      overallCompressionRatio: 1.0,
      overallQualityDegradation: 0,
      totalCompressionTime: 0,
      sizeReductionPercent: 0,
      latencyChangePercent: 0,
      accuracyChangePercent: 0,
      memoryReductionPercent: 0,
      qualityCheckpointsPassed: 0,
      qualityCheckpointsFailed: 0,
      rollbacks: 0,
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  compressionPipelines.set(id, pipeline);
  compressionRollbacks.set(id, []);

  return pipeline;
}

/**
 * Start compression pipeline
 */
export async function startCompressionPipeline(
  pipelineId: string
): Promise<CompressionPipeline | null> {
  const pipeline = compressionPipelines.get(pipelineId);
  if (!pipeline || pipeline.status !== 'planned') return null;

  pipeline.status = 'initializing';
  pipeline.startedAt = new Date().toISOString();
  pipeline.updatedAt = pipeline.startedAt;

  // Validate constraints
  const validation = validateConstraints(pipeline);
  if (!validation.valid) {
    pipeline.status = 'failed';
    pipeline.updatedAt = new Date().toISOString();
    compressionPipelines.set(pipelineId, pipeline);
    return pipeline;
  }

  pipeline.status = 'running';
  pipeline.updatedAt = new Date().toISOString();

  compressionPipelines.set(pipelineId, pipeline);
  return pipeline;
}

/**
 * Execute compression stage
 */
export async function executeCompressionStage(
  pipelineId: string,
  stageId: string
): Promise<CompressionStage | null> {
  const pipeline = compressionPipelines.get(pipelineId);
  if (!pipeline || pipeline.status !== 'running') return null;

  const stage = pipeline.stages.find((s) => s.id === stageId);
  if (!stage || stage.status !== 'pending') return null;

  stage.status = 'initializing';
  stage.startedAt = new Date().toISOString();

  // Simulate compression execution
  stage.status = 'running';
  stage.jobId = `job_${randomUUID()}`;

  pipeline.updatedAt = stage.startedAt;
  compressionPipelines.set(pipelineId, pipeline);

  return stage;
}

/**
 * Complete compression stage
 */
export async function completeCompressionStage(
  pipelineId: string,
  stageId: string,
  result: CompressionStageResult
): Promise<CompressionStage | null> {
  const pipeline = compressionPipelines.get(pipelineId);
  if (!pipeline) return null;

  const stage = pipeline.stages.find((s) => s.id === stageId);
  if (!stage || stage.status !== 'running') return null;

  stage.result = result;
  stage.status = 'completed';
  stage.completedAt = new Date().toISOString();

  // Update pipeline metrics
  pipeline.metrics.completedStages++;
  pipeline.metrics.totalCompressionTime += result.compressionTime;
  pipeline.metrics.overallCompressionRatio = result.compressionRatio;
  pipeline.metrics.overallQualityDegradation = result.qualityDegradation;

  // Calculate size reduction
  pipeline.metrics.sizeReductionPercent = ((pipeline.sourceModel.sizeBytes - result.sizeBytes) / pipeline.sourceModel.sizeBytes) * 100;

  // Calculate accuracy change
  pipeline.metrics.accuracyChangePercent = ((result.metrics.accuracy - pipeline.sourceModel.baselineMetrics.accuracy) / pipeline.sourceModel.baselineMetrics.accuracy) * 100;

  // Calculate latency change
  pipeline.metrics.latencyChangePercent = ((result.metrics.latencyMs - pipeline.sourceModel.baselineMetrics.latencyMs) / pipeline.sourceModel.baselineMetrics.latencyMs) * 100;

  // Calculate memory reduction
  pipeline.metrics.memoryReductionPercent = ((pipeline.sourceModel.baselineMetrics.memoryUsageMb - result.metrics.memoryUsageMb) / pipeline.sourceModel.baselineMetrics.memoryUsageMb) * 100;

  // Create quality checkpoint
  const checkpoint = createQualityCheckpoint(pipeline, stage.stageNumber, result);
  pipeline.qualityCheckpoints.push(checkpoint);

  if (checkpoint.passed) {
    pipeline.metrics.qualityCheckpointsPassed++;
  } else {
    pipeline.metrics.qualityCheckpointsFailed++;
    if (checkpoint.action === 'rollback') {
      await rollbackToStage(pipelineId, stage.stageNumber - 1, 'Quality threshold not met', 'system');
      return stage;
    }
  }

  // Check if pipeline is complete
  if (pipeline.metrics.completedStages >= pipeline.metrics.totalStages) {
    pipeline.status = 'completed';
    pipeline.completedAt = stage.completedAt;

    // Create target model
    pipeline.targetModel = {
      modelId: result.modelId,
      modelName: `${pipeline.sourceModel.modelName}-compressed`,
      version: result.modelVersion,
      framework: pipeline.sourceModel.framework,
      format: pipeline.sourceModel.format,
      sizeBytes: result.sizeBytes,
      numParameters: result.numParameters,
      compressionRatio: result.compressionRatio,
      compressionTechniques: pipeline.stages.map((s) => s.technique),
      metrics: result.metrics,
      createdAt: result.modelId ? stage.completedAt! : new Date().toISOString(),
    };
  }

  pipeline.currentStage++;
  pipeline.updatedAt = stage.completedAt;

  compressionPipelines.set(pipelineId, pipeline);
  return stage;
}

/**
 * Pause compression pipeline
 */
export async function pauseCompressionPipeline(
  pipelineId: string
): Promise<CompressionPipeline | null> {
  const pipeline = compressionPipelines.get(pipelineId);
  if (!pipeline || pipeline.status !== 'running') return null;

  pipeline.status = 'paused';
  pipeline.updatedAt = new Date().toISOString();

  compressionPipelines.set(pipelineId, pipeline);
  return pipeline;
}

/**
 * Resume compression pipeline
 */
export async function resumeCompressionPipeline(
  pipelineId: string
): Promise<CompressionPipeline | null> {
  const pipeline = compressionPipelines.get(pipelineId);
  if (!pipeline || pipeline.status !== 'paused') return null;

  pipeline.status = 'running';
  pipeline.updatedAt = new Date().toISOString();

  compressionPipelines.set(pipelineId, pipeline);
  return pipeline;
}

/**
 * Cancel compression pipeline
 */
export async function cancelCompressionPipeline(
  pipelineId: string
): Promise<CompressionPipeline | null> {
  const pipeline = compressionPipelines.get(pipelineId);
  if (!pipeline || pipeline.status === 'completed' || pipeline.status === 'cancelled') return null;

  pipeline.status = 'cancelled';
  pipeline.completedAt = new Date().toISOString();
  pipeline.updatedAt = pipeline.completedAt;

  compressionPipelines.set(pipelineId, pipeline);
  return pipeline;
}

/**
 * Rollback to a specific stage
 */
export async function rollbackToStage(
  pipelineId: string,
  targetStage: number,
  reason: string,
  rolledBackBy: string
): Promise<CompressionRollback | null> {
  const pipeline = compressionPipelines.get(pipelineId);
  if (!pipeline) return null;

  const rollbackId = `rollback_${randomUUID()}`;
  const now = new Date().toISOString();

  const rollback: CompressionRollback = {
    id: rollbackId,
    pipelineId,
    fromStage: pipeline.currentStage,
    toStage: targetStage,
    reason,
    rolledBackAt: now,
    rolledBackBy,
    modelVersionBefore: pipeline.targetModel?.version || pipeline.sourceModel.version,
    modelVersionAfter: pipeline.sourceModel.version,
  };

  // Reset stages after target
  for (let i = targetStage + 1; i < pipeline.stages.length; i++) {
    pipeline.stages[i].status = 'pending';
    pipeline.stages[i].result = undefined;
    pipeline.stages[i].startedAt = undefined;
    pipeline.stages[i].completedAt = undefined;
  }

  pipeline.currentStage = targetStage;
  pipeline.metrics.completedStages = targetStage;
  pipeline.metrics.rollbacks++;
  pipeline.status = 'rolled-back';
  pipeline.updatedAt = now;

  const rollbacks = compressionRollbacks.get(pipelineId) || [];
  rollbacks.push(rollback);
  compressionRollbacks.set(pipelineId, rollbacks);

  compressionPipelines.set(pipelineId, pipeline);
  return rollback;
}

/**
 * Get compression pipeline by ID
 */
export async function getCompressionPipeline(
  pipelineId: string
): Promise<CompressionPipeline | null> {
  return compressionPipelines.get(pipelineId) || null;
}

/**
 * List compression pipelines for an organization
 */
export async function listCompressionPipelines(
  organizationId: string,
  filters?: { status?: CompressionPipelineStatus; technique?: CompressionTechnique }
): Promise<CompressionPipeline[]> {
  let orgPipelines = Array.from(compressionPipelines.values()).filter((p) => p.organizationId === organizationId);

  if (filters?.status) {
    orgPipelines = orgPipelines.filter((p) => p.status === filters.status);
  }

  if (filters?.technique) {
    orgPipelines = orgPipelines.filter((p) => p.strategy.techniques.includes(filters.technique!));
  }

  return orgPipelines;
}

/**
 * Get compression pipeline rollbacks
 */
export async function getCompressionRollbacks(
  pipelineId: string
): Promise<CompressionRollback[]> {
  return compressionRollbacks.get(pipelineId) || [];
}

/**
 * Create compression pipeline template
 */
export async function createCompressionPipelineTemplate(
  params: {
    name: string;
    description: string;
    strategy: CompressionStrategy;
    useCases: string[];
    bestFor: string[];
    expectedCompressionRatio: number;
    expectedQualityDegradation: number;
    createdBy: string;
  }
): Promise<CompressionPipelineTemplate> {
  const id = `template_${randomUUID()}`;
  const now = new Date().toISOString();

  const template: CompressionPipelineTemplate = {
    id,
    name: params.name,
    description: params.description,
    strategy: params.strategy,
    useCases: params.useCases,
    bestFor: params.bestFor,
    expectedCompressionRatio: params.expectedCompressionRatio,
    expectedQualityDegradation: params.expectedQualityDegradation,
    createdBy: params.createdBy,
    createdAt: now,
  };

  compressionTemplates.set(id, template);
  return template;
}

/**
 * Get compression pipeline template by ID
 */
export async function getCompressionPipelineTemplate(
  templateId: string
): Promise<CompressionPipelineTemplate | null> {
  return compressionTemplates.get(templateId) || null;
}

/**
 * List compression pipeline templates
 */
export async function listCompressionPipelineTemplates(): Promise<CompressionPipelineTemplate[]> {
  return Array.from(compressionTemplates.values());
}

/**
 * Get compression orchestration dashboard
 */
export async function getCompressionOrchestrationDashboard(
  organizationId: string
): Promise<CompressionOrchestrationDashboard> {
  const orgPipelines = await listCompressionPipelines(organizationId);

  const activePipelines = orgPipelines.filter((p) => p.status === 'running' || p.status === 'paused');
  const completedPipelines = orgPipelines.filter((p) => p.status === 'completed');

  const averageCompressionRatio = completedPipelines.length > 0
    ? completedPipelines.reduce((sum, p) => sum + p.metrics.overallCompressionRatio, 0) / completedPipelines.length
    : 1.0;

  const averageQualityDegradation = completedPipelines.length > 0
    ? completedPipelines.reduce((sum, p) => sum + p.metrics.overallQualityDegradation, 0) / completedPipelines.length
    : 0;

  const recentPipelines = orgPipelines
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  // Calculate top techniques
  const techniqueUsage = new Map<CompressionTechnique, {
    usageCount: number;
    totalCompressionRatio: number;
    totalQualityDegradation: number;
    successCount: number;
  }>();

  for (const pipeline of completedPipelines) {
    for (const technique of pipeline.strategy.techniques) {
      const usage = techniqueUsage.get(technique) || {
        usageCount: 0,
        totalCompressionRatio: 0,
        totalQualityDegradation: 0,
        successCount: 0,
      };

      usage.usageCount++;
      usage.totalCompressionRatio += pipeline.metrics.overallCompressionRatio;
      usage.totalQualityDegradation += pipeline.metrics.overallQualityDegradation;
      if (pipeline.status === 'completed') usage.successCount++;

      techniqueUsage.set(technique, usage);
    }
  }

  const topTechniques = Array.from(techniqueUsage.entries())
    .map(([technique, data]) => ({
      technique,
      usageCount: data.usageCount,
      averageCompressionRatio: data.totalCompressionRatio / data.usageCount,
      averageQualityDegradation: data.totalQualityDegradation / data.usageCount,
      successRate: data.successCount / data.usageCount,
    }))
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 10);

  // Calculate compression trends (last 30 days)
  const compressionTrends: CompressionTrend[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dayPipelines = orgPipelines.filter((p) => p.createdAt.startsWith(dateStr));
    const dayCompletedPipelines = dayPipelines.filter((p) => p.status === 'completed');

    compressionTrends.push({
      date: dateStr,
      pipelineCount: dayPipelines.length,
      averageCompressionRatio: dayCompletedPipelines.length > 0
        ? dayCompletedPipelines.reduce((sum, p) => sum + p.metrics.overallCompressionRatio, 0) / dayCompletedPipelines.length
        : 1.0,
      averageQualityDegradation: dayCompletedPipelines.length > 0
        ? dayCompletedPipelines.reduce((sum, p) => sum + p.metrics.overallQualityDegradation, 0) / dayCompletedPipelines.length
        : 0,
      successRate: dayPipelines.length > 0
        ? dayCompletedPipelines.length / dayPipelines.length
        : 0,
    });
  }

  compressionTrends.reverse();

  // Calculate quality distribution
  const qualityDistribution: QualityDistribution = {
    excellent: 0,
    good: 0,
    acceptable: 0,
    poor: 0,
  };

  for (const pipeline of completedPipelines) {
    const degradation = pipeline.metrics.overallQualityDegradation * 100;
    if (degradation < 1) qualityDistribution.excellent++;
    else if (degradation < 3) qualityDistribution.good++;
    else if (degradation < 5) qualityDistribution.acceptable++;
    else qualityDistribution.poor++;
  }

  return {
    organizationId,
    totalPipelines: orgPipelines.length,
    activePipelines: activePipelines.length,
    completedPipelines: completedPipelines.length,
    averageCompressionRatio,
    averageQualityDegradation,
    recentPipelines,
    topTechniques,
    compressionTrends,
    qualityDistribution,
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function validateConstraints(pipeline: CompressionPipeline): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const constraint of pipeline.constraints.hardConstraints) {
    switch (constraint.type) {
      case 'max-size':
        if (pipeline.targetModel && pipeline.targetModel.sizeBytes > constraint.value) {
          violations.push(`Model size ${pipeline.targetModel.sizeBytes} exceeds maximum ${constraint.value} ${constraint.unit}`);
        }
        break;
      case 'min-accuracy':
        if (pipeline.targetModel && pipeline.targetModel.metrics.accuracy < constraint.value) {
          violations.push(`Model accuracy ${pipeline.targetModel.metrics.accuracy} below minimum ${constraint.value}`);
        }
        break;
      case 'max-latency':
        if (pipeline.targetModel && pipeline.targetModel.metrics.latencyMs > constraint.value) {
          violations.push(`Model latency ${pipeline.targetModel.metrics.latencyMs}ms exceeds maximum ${constraint.value} ${constraint.unit}`);
        }
        break;
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

function createQualityCheckpoint(
  pipeline: CompressionPipeline,
  stageNumber: number,
  result: CompressionStageResult
): QualityCheckpoint {
  const qualityScore = result.metrics.accuracy / pipeline.sourceModel.baselineMetrics.accuracy;
  const threshold = pipeline.strategy.qualityThreshold;
  const passed = qualityScore >= threshold;

  let action: QualityCheckpoint['action'] = 'continue';
  if (!passed) {
    const thresholdConfig = pipeline.constraints.qualityThresholds.find((t) => t.metric === 'accuracy');
    action = thresholdConfig?.action || 'rollback';
  }

  return {
    id: `checkpoint_${randomUUID()}`,
    stageNumber,
    checkpointNumber: pipeline.qualityCheckpoints.length + 1,
    metrics: result.metrics,
    qualityScore,
    passed,
    threshold,
    createdAt: new Date().toISOString(),
    action,
  };
}
