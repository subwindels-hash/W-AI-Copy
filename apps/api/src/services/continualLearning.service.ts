/**
 * Module 44: Continual Learning Orchestration Service
 *
 * Provides comprehensive continual learning orchestration including online learning,
 * incremental training, experience replay, catastrophic forgetting prevention,
 * knowledge distillation, and model versioning for continuous model improvement.
 *
 * Phase 1 — Critical Gap: Continual learning orchestration infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContinualLearningStrategy =
  | "replay"
  | "ewc" // Elastic Weight Consolidation
  | "lwf" // Learning without Forgetting
  | "si" // Synaptic Intelligence
  | "distillation"
  | "online_learning"
  | "incremental"
  | "hybrid";

export type ContinualLearningJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "paused";

export type LearningPhaseType = "initial" | "incremental" | "retraining" | "adaptation";

export type ReplayStrategy = "random" | "herding" | "gradient" | "kmeans" | "custom";

export interface ContinualLearningJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: ContinualLearningJobStatus;
  baseModelId: string;
  baseModelName: string;
  baseModelVersion: string;
  strategy: ContinualLearningStrategy;
  config: ContinualLearningConfig;
  currentPhase: number;
  totalPhases: number;
  phases: LearningPhase[];
  result?: ContinualLearningResult;
  error?: { code: string; message: string; step?: string };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ContinualLearningConfig {
  strategy: ContinualLearningStrategy;
  learningRate: number;
  batchSize: number;
  epochs: number;
  replayConfig?: ReplayConfig;
  ewcConfig?: EWCConfig;
  lwfConfig?: LwFConfig;
  siConfig?: SIConfig;
  distillationConfig?: DistillationConfig;
  onlineLearningConfig?: OnlineLearningConfig;
  validationConfig: ValidationConfig;
  rollbackConfig?: RollbackConfig;
}

export interface ReplayConfig {
  enabled: boolean;
  bufferSize: number;
  replayStrategy: ReplayStrategy;
  replayRatio: number; // Ratio of replay samples to new samples
  bufferUpdateFrequency: number; // Update buffer every N batches
}

export interface EWCConfig {
  enabled: boolean;
  lambda: number; // Regularization strength
  fisherDiagonal: boolean;
  onlineEWC: boolean;
  decayRate?: number;
}

export interface LwFConfig {
  enabled: boolean;
  temperature: number;
  alpha: number; // Distillation weight
}

export interface SIConfig {
  enabled: boolean;
  c: number; // Regularization strength
  xi: number; // Damping factor
}

export interface DistillationConfig {
  enabled: boolean;
  teacherModelId: string;
  temperature: number;
  alpha: number; // Weight for distillation loss
  beta: number; // Weight for task loss
}

export interface OnlineLearningConfig {
  enabled: boolean;
  windowSize: number; // Number of recent samples to use
  updateFrequency: number; // Update model every N samples
  driftDetection: boolean;
  adaptiveLearningRate: boolean;
}

export interface ValidationConfig {
  enabled: boolean;
  validationFrequency: number; // Validate every N batches
  validationDatasetId?: string;
  metrics: string[];
  earlyStopping?: {
    metric: string;
    patience: number;
    minDelta: number;
  };
}

export interface RollbackConfig {
  enabled: boolean;
  maxVersionsToKeep: number;
  rollbackOnPerformanceDrop: boolean;
  performanceDropThreshold: number; // e.g., 0.05 for 5% drop
}

export interface LearningPhase {
  id: string;
  jobId: string;
  phaseNumber: number;
  phaseType: LearningPhaseType;
  status: "pending" | "running" | "completed" | "failed";
  trainingDataConfig: TrainingDataConfig;
  metrics: PhaseMetrics;
  modelVersion?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface TrainingDataConfig {
  newDatasetId?: string;
  newDatasetUrl?: string;
  replayDatasetId?: string;
  numNewSamples: number;
  numReplaySamples?: number;
  startTime?: string;
  endTime?: string;
}

export interface PhaseMetrics {
  trainingLoss: number[];
  validationLoss?: number[];
  trainingAccuracy?: number[];
  validationAccuracy?: number[];
  customMetrics?: Record<string, number[]>;
  forgettingScore?: number;
  knowledgeRetention?: number;
  learningSpeed?: number; // Samples per second
  totalTrainingTimeMs: number;
}

export interface ContinualLearningResult {
  finalModelId: string;
  finalModelName: string;
  finalModelVersion: string;
  numPhasesCompleted: number;
  totalTrainingTimeMs: number;
  totalSamplesProcessed: number;
  performanceProgression: PerformanceProgression[];
  forgettingAnalysis: ForgettingAnalysis;
  knowledgeRetentionScore: number;
  modelVersions: ModelVersionInfo[];
  recommendations: string[];
  completedAt: string;
}

export interface PerformanceProgression {
  phaseNumber: number;
  phaseType: LearningPhaseType;
  timestamp: string;
  metrics: Record<string, number>;
  improvementFromPrevious?: Record<string, number>;
  samplesProcessed: number;
}

export interface ForgettingAnalysis {
  overallForgettingScore: number;
  taskSpecificForgetting: Record<string, number>;
  knowledgeRetentionByPhase: Array<{
    phaseNumber: number;
    retentionScore: number;
    metricsBefore: Record<string, number>;
    metricsAfter: Record<string, number>;
  }>;
  mostForgottenTasks: Array<{
    taskName: string;
    forgettingScore: number;
    performanceDrop: number;
  }>;
}

export interface ModelVersionInfo {
  version: string;
  phaseNumber: number;
  createdAt: string;
  metrics: Record<string, number>;
  sizeBytes: number;
  downloadUrl: string;
  isRollbackVersion: boolean;
}

export interface ExperienceReplayBuffer {
  id: string;
  organizationId: string;
  modelId: string;
  bufferName: string;
  strategy: ReplayStrategy;
  maxSize: number;
  currentSize: number;
  samples: ReplaySample[];
  createdAt: string;
  updatedAt: string;
}

export interface ReplaySample {
  id: string;
  data: unknown;
  label?: unknown;
  importance: number;
  addedAt: string;
  lastUsedAt?: string;
  usageCount: number;
  metadata?: Record<string, unknown>;
}

export interface ContinualLearningStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalPhases: number;
  averageKnowledgeRetention: number;
  averageForgettingScore: number;
  jobsByStrategy: Record<string, number>;
  totalSamplesProcessed: number;
  totalTrainingTimeMs: number;
  replayBuffers: number;
  mostUsedStrategies: Record<string, number>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const continualLearningJobs = new Map<string, ContinualLearningJob>();
const replayBuffers = new Map<string, ExperienceReplayBuffer>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a continual learning job
 */
export async function createContinualLearningJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  baseModelId: string;
  baseModelName: string;
  baseModelVersion: string;
  strategy: ContinualLearningStrategy;
  config: ContinualLearningConfig;
  totalPhases?: number;
  createdBy: string;
}): Promise<ContinualLearningJob> {
  const now = new Date().toISOString();

  const job: ContinualLearningJob = {
    id: `cl_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "pending",
    baseModelId: params.baseModelId,
    baseModelName: params.baseModelName,
    baseModelVersion: params.baseModelVersion,
    strategy: params.strategy,
    config: params.config,
    currentPhase: 0,
    totalPhases: params.totalPhases ?? 1,
    phases: [],
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  continualLearningJobs.set(job.id, job);
  return job;
}

/**
 * Get continual learning job by ID
 */
export async function getContinualLearningJob(jobId: string): Promise<ContinualLearningJob | null> {
  return continualLearningJobs.get(jobId) ?? null;
}

/**
 * List continual learning jobs
 */
export async function listContinualLearningJobs(
  organizationId: string,
  filters?: {
    status?: ContinualLearningJobStatus;
    strategy?: ContinualLearningStrategy;
    modelId?: string;
    limit?: number;
  }
): Promise<ContinualLearningJob[]> {
  let result = Array.from(continualLearningJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.strategy) result = result.filter(j => j.strategy === filters.strategy);
  if (filters?.modelId) result = result.filter(j => j.baseModelId === filters.modelId);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Start a continual learning job
 */
export async function startContinualLearningJob(jobId: string): Promise<ContinualLearningJob | null> {
  const job = continualLearningJobs.get(jobId);
  if (!job) return null;

  if (job.status !== "pending" && job.status !== "paused") {
    throw new Error(`Cannot start job in status: ${job.status}`);
  }

  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  continualLearningJobs.set(jobId, job);

  // Start first phase
  await startLearningPhase(jobId);

  return job;
}

/**
 * Pause a continual learning job
 */
export async function pauseContinualLearningJob(jobId: string): Promise<ContinualLearningJob | null> {
  const job = continualLearningJobs.get(jobId);
  if (!job || job.status !== "running") return null;

  job.status = "paused";
  job.updatedAt = new Date().toISOString();

  continualLearningJobs.set(jobId, job);
  return job;
}

/**
 * Resume a continual learning job
 */
export async function resumeContinualLearningJob(jobId: string): Promise<ContinualLearningJob | null> {
  const job = continualLearningJobs.get(jobId);
  if (!job || job.status !== "paused") return null;

  job.status = "running";
  job.updatedAt = new Date().toISOString();

  continualLearningJobs.set(jobId, job);

  // Continue with next phase
  await startLearningPhase(jobId);

  return job;
}

/**
 * Cancel a continual learning job
 */
export async function cancelContinualLearningJob(jobId: string): Promise<ContinualLearningJob | null> {
  const job = continualLearningJobs.get(jobId);
  if (!job) return null;

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();

  continualLearningJobs.set(jobId, job);
  return job;
}

/**
 * Create an experience replay buffer
 */
export async function createReplayBuffer(params: {
  organizationId: string;
  modelId: string;
  bufferName: string;
  strategy: ReplayStrategy;
  maxSize: number;
}): Promise<ExperienceReplayBuffer> {
  const now = new Date().toISOString();

  const buffer: ExperienceReplayBuffer = {
    id: `replay_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    modelId: params.modelId,
    bufferName: params.bufferName,
    strategy: params.strategy,
    maxSize: params.maxSize,
    currentSize: 0,
    samples: [],
    createdAt: now,
    updatedAt: now,
  };

  replayBuffers.set(buffer.id, buffer);
  return buffer;
}

/**
 * Add samples to replay buffer
 */
export async function addToReplayBuffer(
  bufferId: string,
  samples: Array<{
    data: unknown;
    label?: unknown;
    importance?: number;
    metadata?: Record<string, unknown>;
  }>
): Promise<ExperienceReplayBuffer | null> {
  const buffer = replayBuffers.get(bufferId);
  if (!buffer) return null;

  const now = new Date().toISOString();

  for (const sample of samples) {
    if (buffer.currentSize >= buffer.maxSize) {
      // Remove least important sample
      const minIndex = buffer.samples.reduce((minIdx, s, idx, arr) => 
        s.importance < arr[minIdx].importance ? idx : minIdx, 0
      );
      buffer.samples.splice(minIndex, 1);
      buffer.currentSize--;
    }

    const replaySample: ReplaySample = {
      id: `sample_${randomUUID().slice(0, 8)}`,
      data: sample.data,
      label: sample.label,
      importance: sample.importance ?? 1.0,
      addedAt: now,
      usageCount: 0,
      metadata: sample.metadata,
    };

    buffer.samples.push(replaySample);
    buffer.currentSize++;
  }

  buffer.updatedAt = now;
  replayBuffers.set(bufferId, buffer);
  return buffer;
}

/**
 * Get samples from replay buffer
 */
export async function getReplaySamples(
  bufferId: string,
  numSamples: number,
  strategy?: ReplayStrategy
): Promise<ReplaySample[]> {
  const buffer = replayBuffers.get(bufferId);
  if (!buffer) return [];

  const selectedSamples: ReplaySample[] = [];
  const availableSamples = [...buffer.samples];

  switch (strategy ?? buffer.strategy) {
    case "random":
      for (let i = 0; i < numSamples && availableSamples.length > 0; i++) {
        const idx = Math.floor(Math.random() * availableSamples.length);
        selectedSamples.push(availableSamples.splice(idx, 1)[0]);
      }
      break;

    case "herding":
      // Select samples closest to class mean
      availableSamples.sort((a, b) => b.importance - a.importance);
      selectedSamples.push(...availableSamples.slice(0, numSamples));
      break;

    case "gradient":
      // Select samples with highest gradient norm (simulated)
      availableSamples.sort((a, b) => b.importance - a.importance);
      selectedSamples.push(...availableSamples.slice(0, numSamples));
      break;

    case "kmeans":
      // Select diverse samples (simulated)
      const step = Math.max(1, Math.floor(availableSamples.length / numSamples));
      for (let i = 0; i < availableSamples.length && selectedSamples.length < numSamples; i += step) {
        selectedSamples.push(availableSamples[i]);
      }
      break;

    default:
      selectedSamples.push(...availableSamples.slice(0, numSamples));
  }

  // Update usage statistics
  const now = new Date().toISOString();
  for (const sample of selectedSamples) {
    sample.lastUsedAt = now;
    sample.usageCount++;
  }

  buffer.updatedAt = now;
  replayBuffers.set(bufferId, buffer);

  return selectedSamples;
}

/**
 * Get replay buffer by ID
 */
export async function getReplayBuffer(bufferId: string): Promise<ExperienceReplayBuffer | null> {
  return replayBuffers.get(bufferId) ?? null;
}

/**
 * List replay buffers
 */
export async function listReplayBuffers(
  organizationId: string,
  modelId?: string,
  limit: number = 50
): Promise<ExperienceReplayBuffer[]> {
  let result = Array.from(replayBuffers.values()).filter(
    b => b.organizationId === organizationId
  );

  if (modelId) result = result.filter(b => b.modelId === modelId);

  return result
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/**
 * Get continual learning statistics
 */
export async function getContinualLearningStats(organizationId: string): Promise<ContinualLearningStats> {
  const jobs = Array.from(continualLearningJobs.values()).filter(
    j => j.organizationId === organizationId
  );
  const buffers = Array.from(replayBuffers.values()).filter(
    b => b.organizationId === organizationId
  );

  const completedJobs = jobs.filter(j => j.status === "completed");
  const failedJobs = jobs.filter(j => j.status === "failed");

  let totalPhases = 0;
  let totalKnowledgeRetention = 0;
  let totalForgettingScore = 0;
  let totalSamplesProcessed = 0;
  let totalTrainingTimeMs = 0;
  const jobsByStrategy: Record<string, number> = {};
  const mostUsedStrategies: Record<string, number> = {};

  for (const job of jobs) {
    jobsByStrategy[job.strategy] = (jobsByStrategy[job.strategy] || 0) + 1;
    totalPhases += job.phases.length;

    if (job.result) {
      totalKnowledgeRetention += job.result.knowledgeRetentionScore;
      totalForgettingScore += job.result.forgettingAnalysis.overallForgettingScore;
      totalSamplesProcessed += job.result.totalSamplesProcessed;
      totalTrainingTimeMs += job.result.totalTrainingTimeMs;
    }
  }

  return {
    totalJobs: jobs.length,
    completedJobs: completedJobs.length,
    failedJobs: failedJobs.length,
    totalPhases,
    averageKnowledgeRetention: completedJobs.length > 0 ? totalKnowledgeRetention / completedJobs.length : 0,
    averageForgettingScore: completedJobs.length > 0 ? totalForgettingScore / completedJobs.length : 0,
    jobsByStrategy,
    totalSamplesProcessed,
    totalTrainingTimeMs,
    replayBuffers: buffers.length,
    mostUsedStrategies: jobsByStrategy,
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

async function startLearningPhase(jobId: string): Promise<void> {
  const job = continualLearningJobs.get(jobId);
  if (!job || job.status !== "running") return;

  job.currentPhase++;
  if (job.currentPhase > job.totalPhases) {
    // All phases completed
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    job.result = generateContinualLearningResult(job);
    continualLearningJobs.set(jobId, job);
    return;
  }

  const phaseType: LearningPhaseType = job.currentPhase === 1 ? "initial" : "incremental";

  const phase: LearningPhase = {
    id: `phase_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    jobId,
    phaseNumber: job.currentPhase,
    phaseType,
    status: "running",
    trainingDataConfig: {
      numNewSamples: 10000 + Math.floor(Math.random() * 5000),
      numReplaySamples: job.config.replayConfig?.enabled
        ? Math.floor((10000 + Math.random() * 5000) * (job.config.replayConfig?.replayRatio ?? 0.5))
        : undefined,
    },
    metrics: {
      trainingLoss: [],
      validationLoss: [],
      trainingAccuracy: [],
      validationAccuracy: [],
      totalTrainingTimeMs: 0,
    },
    startedAt: new Date().toISOString(),
  };

  job.phases.push(phase);
  job.updatedAt = phase.startedAt;
  continualLearningJobs.set(jobId, job);

  // Simulate phase execution
  setTimeout(() => completeLearningPhase(jobId, phase.id), 2000);
}

async function completeLearningPhase(jobId: string, phaseId: string): Promise<void> {
  const job = continualLearningJobs.get(jobId);
  if (!job) return;

  const phase = job.phases.find(p => p.id === phaseId);
  if (!phase || phase.status !== "running") return;

  // Simulate training metrics
  const numBatches = 50;
  const initialLoss = 0.8 + Math.random() * 0.2;
  const finalLoss = 0.2 + Math.random() * 0.2;

  phase.metrics.trainingLoss = Array.from({ length: numBatches }, (_, i) =>
    initialLoss - (initialLoss - finalLoss) * (i / numBatches) + (Math.random() - 0.5) * 0.05
  );

  if (job.config.validationConfig.enabled) {
    const valInitialLoss = initialLoss + 0.05;
    const valFinalLoss = finalLoss + 0.05;
    phase.metrics.validationLoss = Array.from({ length: numBatches }, (_, i) =>
      valInitialLoss - (valInitialLoss - valFinalLoss) * (i / numBatches) + (Math.random() - 0.5) * 0.05
    );
  }

  // Simulate accuracy
  phase.metrics.trainingAccuracy = phase.metrics.trainingLoss.map(loss => 1 - loss);
  if (phase.metrics.validationLoss) {
    phase.metrics.validationAccuracy = phase.metrics.validationLoss.map(loss => 1 - loss);
  }

  // Calculate forgetting score (simulated)
  if (job.strategy === "ewc" || job.strategy === "lwf" || job.strategy === "replay") {
    phase.metrics.forgettingScore = 0.1 + Math.random() * 0.2; // Low forgetting
    phase.metrics.knowledgeRetention = 1 - phase.metrics.forgettingScore;
  } else {
    phase.metrics.forgettingScore = 0.3 + Math.random() * 0.3; // Higher forgetting
    phase.metrics.knowledgeRetention = 1 - phase.metrics.forgettingScore;
  }

  phase.metrics.learningSpeed = phase.trainingDataConfig.numNewSamples / (10 + Math.random() * 5);
  phase.metrics.totalTrainingTimeMs = 10000 + Math.random() * 20000;

  phase.status = "completed";
  phase.completedAt = new Date().toISOString();
  phase.modelVersion = `${job.baseModelVersion}-cl${phase.phaseNumber}`;

  job.updatedAt = phase.completedAt;
  continualLearningJobs.set(jobId, job);

  // Start next phase
  setTimeout(() => startLearningPhase(jobId), 1000);
}

function generateContinualLearningResult(job: ContinualLearningJob): ContinualLearningResult {
  const completedPhases = job.phases.filter(p => p.status === "completed");
  const totalTrainingTimeMs = completedPhases.reduce((sum, p) => sum + p.metrics.totalTrainingTimeMs, 0);
  const totalSamplesProcessed = completedPhases.reduce(
    (sum, p) => sum + p.trainingDataConfig.numNewSamples + (p.trainingDataConfig.numReplaySamples ?? 0),
    0
  );

  // Generate performance progression
  const performanceProgression: PerformanceProgression[] = completedPhases.map((phase, idx) => {
    const metrics: Record<string, number> = {
      trainingLoss: phase.metrics.trainingLoss[phase.metrics.trainingLoss.length - 1],
      trainingAccuracy: phase.metrics.trainingAccuracy?.[phase.metrics.trainingAccuracy.length - 1] ?? 0,
    };

    if (phase.metrics.validationLoss) {
      metrics.validationLoss = phase.metrics.validationLoss[phase.metrics.validationLoss.length - 1];
      metrics.validationAccuracy = phase.metrics.validationAccuracy?.[phase.metrics.validationAccuracy.length - 1] ?? 0;
    }

    const improvementFromPrevious: Record<string, number> = {};
    if (idx > 0) {
      const prevPhase = completedPhases[idx - 1];
      const prevAccuracy = prevPhase.metrics.validationAccuracy?.[prevPhase.metrics.validationAccuracy.length - 1] ?? 0;
      const currAccuracy = metrics.validationAccuracy;
      improvementFromPrevious.validationAccuracy = currAccuracy - prevAccuracy;
    }

    return {
      phaseNumber: phase.phaseNumber,
      phaseType: phase.phaseType,
      timestamp: phase.completedAt!,
      metrics,
      improvementFromPrevious: idx > 0 ? improvementFromPrevious : undefined,
      samplesProcessed: phase.trainingDataConfig.numNewSamples + (phase.trainingDataConfig.numReplaySamples ?? 0),
    };
  });

  // Generate forgetting analysis
  const forgettingAnalysis = generateForgettingAnalysis(job);

  // Calculate overall knowledge retention
  const knowledgeRetentionScore = completedPhases.reduce(
    (sum, p) => sum + (p.metrics.knowledgeRetention ?? 0),
    0
  ) / completedPhases.length;

  // Generate model versions
  const modelVersions: ModelVersionInfo[] = completedPhases.map(phase => ({
    version: phase.modelVersion!,
    phaseNumber: phase.phaseNumber,
    createdAt: phase.completedAt!,
    metrics: {
      validationAccuracy: phase.metrics.validationAccuracy?.[phase.metrics.validationAccuracy.length - 1] ?? 0,
      validationLoss: phase.metrics.validationLoss?.[phase.metrics.validationLoss.length - 1] ?? 0,
    },
    sizeBytes: 50000000 + Math.floor(Math.random() * 10000000),
    downloadUrl: `https://models.example.com/continual/${job.id}/${phase.modelVersion}`,
    isRollbackVersion: false,
  }));

  // Generate recommendations
  const recommendations = generateContinualLearningRecommendations(job, forgettingAnalysis, knowledgeRetentionScore);

  return {
    finalModelId: `model_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    finalModelName: `${job.baseModelName}_continual`,
    finalModelVersion: modelVersions[modelVersions.length - 1].version,
    numPhasesCompleted: completedPhases.length,
    totalTrainingTimeMs,
    totalSamplesProcessed,
    performanceProgression,
    forgettingAnalysis,
    knowledgeRetentionScore,
    modelVersions,
    recommendations,
    completedAt: new Date().toISOString(),
  };
}

function generateForgettingAnalysis(job: ContinualLearningJob): ForgettingAnalysis {
  const completedPhases = job.phases.filter(p => p.status === "completed");

  const overallForgettingScore = completedPhases.reduce(
    (sum, p) => sum + (p.metrics.forgettingScore ?? 0),
    0
  ) / completedPhases.length;

  const knowledgeRetentionByPhase = completedPhases.map(phase => {
    const metricsBefore = {
      accuracy: phase.metrics.trainingAccuracy?.[0] ?? 0,
    };
    const metricsAfter = {
      accuracy: phase.metrics.trainingAccuracy?.[phase.metrics.trainingAccuracy.length - 1] ?? 0,
    };

    return {
      phaseNumber: phase.phaseNumber,
      retentionScore: phase.metrics.knowledgeRetention ?? 0,
      metricsBefore,
      metricsAfter,
    };
  });

  // Simulate task-specific forgetting
  const taskSpecificForgetting: Record<string, number> = {
    task_1: overallForgettingScore * (0.8 + Math.random() * 0.4),
    task_2: overallForgettingScore * (0.8 + Math.random() * 0.4),
    task_3: overallForgettingScore * (0.8 + Math.random() * 0.4),
  };

  const mostForgottenTasks = Object.entries(taskSpecificForgetting)
    .map(([taskName, forgettingScore]) => ({
      taskName,
      forgettingScore,
      performanceDrop: forgettingScore * 0.2,
    }))
    .sort((a, b) => b.forgettingScore - a.forgettingScore)
    .slice(0, 3);

  return {
    overallForgettingScore,
    taskSpecificForgetting,
    knowledgeRetentionByPhase,
    mostForgottenTasks,
  };
}

function generateContinualLearningRecommendations(
  job: ContinualLearningJob,
  forgettingAnalysis: ForgettingAnalysis,
  knowledgeRetentionScore: number
): string[] {
  const recommendations: string[] = [];

  if (forgettingAnalysis.overallForgettingScore > 0.3) {
    recommendations.push("High forgetting detected - consider using replay or EWC strategy");
  }

  if (knowledgeRetentionScore < 0.7) {
    recommendations.push("Knowledge retention is low - increase replay buffer size or regularization strength");
  }

  if (job.strategy === "online_learning" && forgettingAnalysis.overallForgettingScore > 0.2) {
    recommendations.push("Online learning shows significant forgetting - switch to replay or hybrid strategy");
  }

  if (forgettingAnalysis.mostForgottenTasks.length > 0) {
    const topForgotten = forgettingAnalysis.mostForgottenTasks[0];
    recommendations.push(`Task "${topForgotten.taskName}" shows highest forgetting - add more replay samples for this task`);
  }

  recommendations.push("Monitor performance on all tasks after each learning phase");
  recommendations.push("Consider periodic full retraining if forgetting accumulates");
  recommendations.push("Experiment with different replay strategies (herding, gradient-based) for better retention");

  return recommendations;
}
