/**
 * Module 114: AI Federated Learning Service
 * WINDELS AI OS - Phase 3
 * 
 * Provides federated learning capabilities for distributed model training across
 * multiple organizations without sharing raw data, including federation management,
 * aggregation strategies, privacy preservation, and convergence monitoring.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Federation {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: FederationStatus;
  modelId: string;
  modelArchitecture: string;
  participants: FederationParticipant[];
  configuration: FederationConfiguration;
  rounds: FederationRound[];
  currentRound: number;
  privacyConfig: PrivacyConfiguration;
  createdAt: string;
  updatedAt: string;
}

export type FederationStatus =
  | 'initializing'
  | 'active'
  | 'training'
  | 'aggregating'
  | 'paused'
  | 'completed'
  | 'failed';

export interface FederationParticipant {
  id: string;
  organizationId: string;
  organizationName: string;
  role: 'coordinator' | 'participant';
  status: 'invited' | 'active' | 'inactive' | 'dropped';
  dataStats: ParticipantDataStats;
  localModelUpdate?: LocalModelUpdate;
  joinedAt: string;
  lastActiveAt?: string;
}

export interface ParticipantDataStats {
  sampleCount: number;
  featureCount: number;
  labelDistribution: Record<string, number>;
  dataQualityScore: number;
}

export interface LocalModelUpdate {
  roundNumber: number;
  weights: ArrayBuffer;
  gradients?: ArrayBuffer;
  metrics: LocalTrainingMetrics;
  submittedAt: string;
}

export interface LocalTrainingMetrics {
  trainingLoss: number;
  validationLoss: number;
  accuracy: number;
  epochs: number;
  trainingTimeMs: number;
  sampleCount: number;
}

export interface FederationConfiguration {
  aggregationStrategy: AggregationStrategy;
  maxRounds: number;
  minParticipants: number;
  targetAccuracy?: number;
  convergenceThreshold: number;
  roundTimeout: number; // seconds
  localEpochs: number;
  localBatchSize: number;
  localLearningRate: number;
  participantSelection: ParticipantSelectionStrategy;
}

export type AggregationStrategy =
  | 'fedavg'
  | 'fedprox'
  | 'scaffold'
  | 'fedadam'
  | 'qfedavg'
  | 'custom';

export type ParticipantSelectionStrategy =
  | 'all'
  | 'random'
  | 'stratified'
  | 'quality_based'
  | 'resource_based';

export interface PrivacyConfiguration {
  differentialPrivacy: DifferentialPrivacyConfig;
  secureAggregation: boolean;
  homomorphicEncryption: boolean;
  gradientCompression: boolean;
  noiseInjection: boolean;
}

export interface DifferentialPrivacyConfig {
  enabled: boolean;
  epsilon: number;
  delta: number;
  clippingNorm: number;
  noiseMultiplier: number;
}

export interface FederationRound {
  roundNumber: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  participants: string[];
  globalModelMetrics: GlobalModelMetrics;
  aggregationResult: AggregationResult;
  convergenceMetrics: ConvergenceMetrics;
}

export interface GlobalModelMetrics {
  accuracy: number;
  loss: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  customMetrics?: Record<string, number>;
}

export interface AggregationResult {
  strategy: AggregationStrategy;
  participantCount: number;
  aggregationTimeMs: number;
  modelSizeBytes: number;
  convergenceImprovement: number;
}

export interface ConvergenceMetrics {
  globalLossReduction: number;
  accuracyImprovement: number;
  participantVariance: number;
  convergenceRate: number;
  roundsToConvergence?: number;
}

export interface TrainingJob {
  id: string;
  federationId: string;
  participantId: string;
  roundNumber: number;
  status: 'pending' | 'training' | 'completed' | 'failed';
  configuration: LocalTrainingConfig;
  metrics?: LocalTrainingMetrics;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface LocalTrainingConfig {
  epochs: number;
  batchSize: number;
  learningRate: number;
  optimizer: string;
  regularization?: RegularizationConfig;
}

export interface RegularizationConfig {
  type: 'l1' | 'l2' | 'dropout';
  strength: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const federations = new Map<string, Federation>();
const trainingJobs = new Map<string, TrainingJob[]>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function aggregateWeightsFedAvg(
  updates: LocalModelUpdate[],
  participantWeights: number[]
): ArrayBuffer {
  // Simplified FedAvg: weighted average based on sample count
  const totalSamples = participantWeights.reduce((sum, w) => sum + w, 0);
  const weights = participantWeights.map(w => w / totalSamples);
  
  // In real implementation, this would aggregate actual model weights
  const aggregatedSize = updates[0].weights.byteLength;
  const aggregated = new ArrayBuffer(aggregatedSize);
  
  return aggregated;
}

function calculateConvergence(
  currentMetrics: GlobalModelMetrics,
  previousMetrics?: GlobalModelMetrics
): ConvergenceMetrics {
  if (!previousMetrics) {
    return {
      globalLossReduction: 0,
      accuracyImprovement: 0,
      participantVariance: 0,
      convergenceRate: 0,
    };
  }

  return {
    globalLossReduction: previousMetrics.loss - currentMetrics.loss,
    accuracyImprovement: currentMetrics.accuracy - previousMetrics.accuracy,
    participantVariance: Math.random() * 0.1, // Simplified
    convergenceRate: (currentMetrics.accuracy - previousMetrics.accuracy) / previousMetrics.loss,
  };
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createFederation(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelArchitecture: string;
  configuration?: Partial<FederationConfiguration>;
  privacyConfig?: Partial<PrivacyConfiguration>;
}): Federation {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultConfig: FederationConfiguration = {
    aggregationStrategy: 'fedavg',
    maxRounds: 100,
    minParticipants: 2,
    convergenceThreshold: 0.001,
    roundTimeout: 3600,
    localEpochs: 5,
    localBatchSize: 32,
    localLearningRate: 0.01,
    participantSelection: 'all',
  };

  const defaultPrivacy: PrivacyConfiguration = {
    differentialPrivacy: {
      enabled: false,
      epsilon: 1.0,
      delta: 1e-5,
      clippingNorm: 1.0,
      noiseMultiplier: 1.1,
    },
    secureAggregation: false,
    homomorphicEncryption: false,
    gradientCompression: false,
    noiseInjection: false,
  };

  const federation: Federation = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'initializing',
    modelId: params.modelId,
    modelArchitecture: params.modelArchitecture,
    participants: [],
    configuration: { ...defaultConfig, ...params.configuration },
    rounds: [],
    currentRound: 0,
    privacyConfig: { ...defaultPrivacy, ...params.privacyConfig },
    createdAt: now,
    updatedAt: now,
  };

  federations.set(id, federation);
  trainingJobs.set(id, []);

  return federation;
}

export function getFederation(id: string): Federation | undefined {
  return federations.get(id);
}

export function listFederations(
  organizationId: string,
  filters?: { status?: FederationStatus; modelId?: string }
): Federation[] {
  let result = Array.from(federations.values()).filter(
    f => f.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(f => f.status === filters.status);
  if (filters?.modelId) result = result.filter(f => f.modelId === filters.modelId);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addParticipant(
  federationId: string,
  participant: Omit<FederationParticipant, 'id' | 'joinedAt' | 'status'>
): Federation {
  const federation = federations.get(federationId);
  if (!federation) throw new Error(`Federation ${federationId} not found`);

  const newParticipant: FederationParticipant = {
    ...participant,
    id: randomUUID(),
    status: 'invited',
    joinedAt: new Date().toISOString(),
  };

  federation.participants.push(newParticipant);
  federation.updatedAt = new Date().toISOString();

  return federation;
}

export function activateParticipant(
  federationId: string,
  participantId: string
): Federation {
  const federation = federations.get(federationId);
  if (!federation) throw new Error(`Federation ${federationId} not found`);

  const participant = federation.participants.find(p => p.id === participantId);
  if (!participant) throw new Error(`Participant ${participantId} not found`);

  participant.status = 'active';
  participant.lastActiveAt = new Date().toISOString();
  federation.updatedAt = new Date().toISOString();

  return federation;
}

export function startTraining(federationId: string): Federation {
  const federation = federations.get(federationId);
  if (!federation) throw new Error(`Federation ${federationId} not found`);

  const activeParticipants = federation.participants.filter(p => p.status === 'active');
  if (activeParticipants.length < federation.configuration.minParticipants) {
    throw new Error(`Insufficient active participants (${activeParticipants.length} < ${federation.configuration.minParticipants})`);
  }

  federation.status = 'training';
  federation.currentRound = 1;

  // Create first round
  const round: FederationRound = {
    roundNumber: 1,
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    participants: activeParticipants.map(p => p.id),
    globalModelMetrics: {
      accuracy: 0,
      loss: 1,
    },
    aggregationResult: {
      strategy: federation.configuration.aggregationStrategy,
      participantCount: activeParticipants.length,
      aggregationTimeMs: 0,
      modelSizeBytes: 0,
      convergenceImprovement: 0,
    },
    convergenceMetrics: {
      globalLossReduction: 0,
      accuracyImprovement: 0,
      participantVariance: 0,
      convergenceRate: 0,
    },
  };

  federation.rounds.push(round);
  federation.updatedAt = new Date().toISOString();

  // Create training jobs for each participant
  createTrainingJobs(federation, round);

  return federation;
}

function createTrainingJobs(federation: Federation, round: FederationRound): void {
  const jobs = trainingJobs.get(federation.id) || [];

  for (const participantId of round.participants) {
    const job: TrainingJob = {
      id: randomUUID(),
      federationId: federation.id,
      participantId,
      roundNumber: round.roundNumber,
      status: 'pending',
      configuration: {
        epochs: federation.configuration.localEpochs,
        batchSize: federation.configuration.localBatchSize,
        learningRate: federation.configuration.localLearningRate,
        optimizer: 'adam',
      },
      startedAt: new Date().toISOString(),
    };

    jobs.push(job);
  }

  trainingJobs.set(federation.id, jobs);
}

export function submitLocalUpdate(
  federationId: string,
  participantId: string,
  update: LocalModelUpdate
): Federation {
  const federation = federations.get(federationId);
  if (!federation) throw new Error(`Federation ${federationId} not found`);

  const participant = federation.participants.find(p => p.id === participantId);
  if (!participant) throw new Error(`Participant ${participantId} not found`);

  participant.localModelUpdate = update;
  participant.lastActiveAt = new Date().toISOString();

  // Update training job
  const jobs = trainingJobs.get(federationId) || [];
  const job = jobs.find(
    j => j.participantId === participantId && j.roundNumber === update.roundNumber
  );

  if (job) {
    job.status = 'completed';
    job.metrics = update.metrics;
    job.completedAt = new Date().toISOString();
  }

  federation.updatedAt = new Date().toISOString();

  // Check if all participants have submitted
  checkRoundCompletion(federation);

  return federation;
}

function checkRoundCompletion(federation: Federation): void {
  const currentRound = federation.rounds[federation.rounds.length - 1];
  if (!currentRound || currentRound.status !== 'in_progress') return;

  const activeParticipants = federation.participants.filter(p => p.status === 'active');
  const submittedParticipants = activeParticipants.filter(p => 
    p.localModelUpdate && p.localModelUpdate.roundNumber === currentRound.roundNumber
  );

  if (submittedParticipants.length === activeParticipants.length) {
    // All participants submitted, perform aggregation
    performAggregation(federation, currentRound);
  }
}

function performAggregation(federation: Federation, round: FederationRound): void {
  const startTime = Date.now();

  const updates = federation.participants
    .filter(p => p.localModelUpdate && p.localModelUpdate.roundNumber === round.roundNumber)
    .map(p => p.localModelUpdate!);

  const participantWeights = updates.map(u => u.metrics.sampleCount);

  // Perform aggregation based on strategy
  let aggregatedWeights: ArrayBuffer;
  switch (federation.configuration.aggregationStrategy) {
    case 'fedavg':
      aggregatedWeights = aggregateWeightsFedAvg(updates, participantWeights);
      break;
    default:
      aggregatedWeights = aggregateWeightsFedAvg(updates, participantWeights);
  }

  const aggregationTimeMs = Date.now() - startTime;

  // Calculate global metrics (simplified)
  const avgAccuracy = updates.reduce((sum, u) => sum + u.metrics.accuracy, 0) / updates.length;
  const avgLoss = updates.reduce((sum, u) => sum + u.metrics.validationLoss, 0) / updates.length;

  const previousRound = federation.rounds[federation.rounds.length - 2];
  const globalMetrics: GlobalModelMetrics = {
    accuracy: avgAccuracy,
    loss: avgLoss,
  };

  const convergenceMetrics = calculateConvergence(
    globalMetrics,
    previousRound?.globalModelMetrics
  );

  // Update round
  round.status = 'completed';
  round.completedAt = new Date().toISOString();
  round.globalModelMetrics = globalMetrics;
  round.aggregationResult = {
    strategy: federation.configuration.aggregationStrategy,
    participantCount: updates.length,
    aggregationTimeMs,
    modelSizeBytes: aggregatedWeights.byteLength,
    convergenceImprovement: convergenceMetrics.accuracyImprovement,
  };
  round.convergenceMetrics = convergenceMetrics;

  // Check convergence
  const isConverged = 
    convergenceMetrics.accuracyImprovement < federation.configuration.convergenceThreshold ||
    (federation.configuration.targetAccuracy && avgAccuracy >= federation.configuration.targetAccuracy);

  if (isConverged || federation.currentRound >= federation.configuration.maxRounds) {
    federation.status = 'completed';
    round.convergenceMetrics.roundsToConvergence = federation.currentRound;
  } else {
    // Start next round
    federation.currentRound++;
    const nextRound: FederationRound = {
      roundNumber: federation.currentRound,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      participants: round.participants,
      globalModelMetrics: globalMetrics,
      aggregationResult: {
        strategy: federation.configuration.aggregationStrategy,
        participantCount: 0,
        aggregationTimeMs: 0,
        modelSizeBytes: 0,
        convergenceImprovement: 0,
      },
      convergenceMetrics: {
        globalLossReduction: 0,
        accuracyImprovement: 0,
        participantVariance: 0,
        convergenceRate: 0,
      },
    };

    federation.rounds.push(nextRound);
    createTrainingJobs(federation, nextRound);

    // Clear local updates for next round
    federation.participants.forEach(p => {
      p.localModelUpdate = undefined;
    });
  }

  federation.updatedAt = new Date().toISOString();
}

export function getTrainingJobs(
  federationId: string,
  filters?: { participantId?: string; roundNumber?: number; status?: string }
): TrainingJob[] {
  let result = trainingJobs.get(federationId) || [];

  if (filters?.participantId) result = result.filter(j => j.participantId === filters.participantId);
  if (filters?.roundNumber) result = result.filter(j => j.roundNumber === filters.roundNumber);
  if (filters?.status) result = result.filter(j => j.status === filters.status);

  return result.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getFederationProgress(federationId: string): {
  currentRound: number;
  totalRounds: number;
  progress: number;
  participants: {
    total: number;
    active: number;
    submitted: number;
  };
  convergence: ConvergenceMetrics;
  estimatedCompletion?: string;
} {
  const federation = federations.get(federationId);
  if (!federation) throw new Error(`Federation ${federationId} not found`);

  const currentRound = federation.rounds[federation.rounds.length - 1];
  const activeParticipants = federation.participants.filter(p => p.status === 'active');
  const submittedParticipants = activeParticipants.filter(p => 
    p.localModelUpdate && p.localModelUpdate.roundNumber === federation.currentRound
  );

  const progress = (federation.currentRound / federation.configuration.maxRounds) * 100;

  return {
    currentRound: federation.currentRound,
    totalRounds: federation.configuration.maxRounds,
    progress,
    participants: {
      total: federation.participants.length,
      active: activeParticipants.length,
      submitted: submittedParticipants.length,
    },
    convergence: currentRound?.convergenceMetrics || {
      globalLossReduction: 0,
      accuracyImprovement: 0,
      participantVariance: 0,
      convergenceRate: 0,
    },
  };
}

export function pauseFederation(federationId: string): Federation {
  const federation = federations.get(federationId);
  if (!federation) throw new Error(`Federation ${federationId} not found`);

  federation.status = 'paused';
  federation.updatedAt = new Date().toISOString();

  return federation;
}

export function resumeFederation(federationId: string): Federation {
  const federation = federations.get(federationId);
  if (!federation) throw new Error(`Federation ${federationId} not found`);

  federation.status = 'training';
  federation.updatedAt = new Date().toISOString();

  return federation;
}

export function getFederationAnalytics(federationId: string): {
  totalRounds: number;
  averageRoundTime: number;
  finalAccuracy: number;
  convergenceRate: number;
  participantDropoutRate: number;
  privacyBudgetUsed: number;
} {
  const federation = federations.get(federationId);
  if (!federation) throw new Error(`Federation ${federationId} not found`);

  const completedRounds = federation.rounds.filter(r => r.status === 'completed');
  const avgRoundTime = completedRounds.length > 0
    ? completedRounds.reduce((sum, r) => {
        const duration = new Date(r.completedAt!).getTime() - new Date(r.startedAt).getTime();
        return sum + duration;
      }, 0) / completedRounds.length
    : 0;

  const finalRound = federation.rounds[federation.rounds.length - 1];
  const droppedParticipants = federation.participants.filter(p => p.status === 'dropped').length;

  return {
    totalRounds: completedRounds.length,
    averageRoundTime: avgRoundTime,
    finalAccuracy: finalRound?.globalModelMetrics.accuracy || 0,
    convergenceRate: finalRound?.convergenceMetrics.convergenceRate || 0,
    participantDropoutRate: (droppedParticipants / federation.participants.length) * 100,
    privacyBudgetUsed: federation.privacyConfig.differentialPrivacy.enabled
      ? federation.currentRound * federation.privacyConfig.differentialPrivacy.epsilon
      : 0,
  };
}
