/**
 * Module 84: AI Federated Model Training Service
 *
 * Provides advanced federated model training coordination including cross-silo
 * federated learning, multi-stage training workflows, adaptive training strategies,
 * trust management between organizations, and federated training orchestration
 * for distributed AI model training.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiFederatedModelTraining');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FederatedTrainingJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: FederatedTrainingStatus;
  trainingType: FederatedTrainingType;
  baseModel: FederatedModel;
  globalModel?: FederatedModel;
  config: FederatedTrainingConfig;
  participants: FederatedParticipant[];
  stages: FederatedTrainingStage[];
  currentStage: number;
  rounds: FederatedTrainingRound[];
  currentRound: number;
  metrics: FederatedTrainingMetrics;
  trustConfig: TrustConfiguration;
  privacyConfig: FederatedPrivacyConfig;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type FederatedTrainingStatus =
  | 'planned'
  | 'initializing'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type FederatedTrainingType =
  | 'cross-device'
  | 'cross-silo'
  | 'hybrid'
  | 'peer-to-peer'
  | 'hierarchical';

export interface FederatedModel {
  modelId: string;
  modelName: string;
  version: string;
  architecture: string;
  parameters: number;
  sizeBytes: number;
  checksum: string;
  metadata?: Record<string, any>;
}

export interface FederatedTrainingConfig {
  aggregationStrategy: AggregationStrategy;
  clientSelectionStrategy: ClientSelectionStrategy;
  minParticipantsPerRound: number;
  maxParticipantsPerRound: number;
  totalRounds: number;
  localEpochs: number;
  localBatchSize: number;
  localLearningRate: number;
  aggregationFrequency: number;
  timeoutMs: number;
  earlyStopping?: EarlyStoppingConfig;
  adaptiveConfig?: AdaptiveConfig;
  multiStageConfig?: MultiStageConfig;
}

export type AggregationStrategy =
  | 'fedavg'
  | 'fedprox'
  | 'scaffold'
  | 'fednova'
  | 'fedopt'
  | 'knowledge-distillation'
  | 'ensemble-merge'
  | 'weighted-merge'
  | 'secure-aggregation'
  | 'custom';

export type ClientSelectionStrategy =
  | 'random'
  | 'round-robin'
  | 'resource-based'
  | 'data-quality'
  | 'stratified'
  | 'reputation-based'
  | 'contribution-based'
  | 'custom';

export interface EarlyStoppingConfig {
  metric: string;
  patience: number;
  minDelta: number;
  mode: 'min' | 'max';
}

export interface AdaptiveConfig {
  enabled: boolean;
  adaptationFrequency: number;
  adaptationMetrics: string[];
  adaptationStrategy: 'learning-rate' | 'batch-size' | 'participant-count' | 'custom';
  adaptationRules: AdaptationRule[];
}

export interface AdaptationRule {
  condition: string;
  action: string;
  parameters: Record<string, any>;
}

export interface MultiStageConfig {
  enabled: boolean;
  stages: StageConfig[];
  stageTransitionConditions: StageTransitionCondition[];
}

export interface StageConfig {
  name: string;
  description?: string;
  rounds: number;
  participantSelectionStrategy: ClientSelectionStrategy;
  aggregationStrategy: AggregationStrategy;
  localConfig: {
    epochs: number;
    batchSize: number;
    learningRate: number;
  };
}

export interface StageTransitionCondition {
  fromStage: number;
  toStage: number;
  condition: string;
  metric?: string;
  threshold?: number;
}

export interface FederatedParticipant {
  id: string;
  organizationId: string;
  name: string;
  type: ParticipantType;
  status: ParticipantStatus;
  capabilities: ParticipantCapabilities;
  trust: TrustScore;
  contribution: ContributionScore;
  resources: ParticipantResources;
  dataInfo: ParticipantDataInfo;
  joinedAt: string;
  lastActiveAt?: string;
  metadata?: Record<string, any>;
}

export type ParticipantType =
  | 'organization'
  | 'institution'
  | 'device'
  | 'edge-node'
  | 'data-center'
  | 'cloud-instance';

export type ParticipantStatus =
  | 'invited'
  | 'active'
  | 'inactive'
  | 'suspended'
  | 'removed';

export interface ParticipantCapabilities {
  computeCapacity: ComputeCapacity;
  networkCapacity: NetworkCapacity;
  storageCapacity: StorageCapacity;
  supportedFrameworks: string[];
  supportedModels: string[];
}

export interface ComputeCapacity {
  cpuCores: number;
  memoryGb: number;
  gpuCount: number;
  gpuMemoryGb: number;
  gpuType?: string;
  flops: number;
}

export interface NetworkCapacity {
  bandwidthMbps: number;
  latencyMs: number;
  reliabilityPercent: number;
}

export interface StorageCapacity {
  totalGb: number;
  availableGb: number;
  readSpeedMbps: number;
  writeSpeedMbps: number;
}

export interface TrustScore {
  overall: number; // 0-100
  identity: number;
  reliability: number;
  security: number;
  privacy: number;
  reputation: number;
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  certificates: TrustCertificate[];
}

export interface TrustCertificate {
  id: string;
  type: 'identity' | 'security' | 'compliance' | 'custom';
  issuer: string;
  issuedAt: string;
  expiresAt?: string;
  verified: boolean;
  metadata?: Record<string, any>;
}

export interface ContributionScore {
  overall: number; // 0-100
  dataQuality: number;
  dataQuantity: number;
  modelQuality: number;
  reliability: number;
  responsiveness: number;
  totalContributions: number;
  successfulContributions: number;
  averageContributionTime: number;
}

export interface ParticipantResources {
  allocated: ResourceAllocation;
  used: ResourceAllocation;
  available: ResourceAllocation;
}

export interface ResourceAllocation {
  cpuCores: number;
  memoryGb: number;
  gpuCount: number;
  bandwidthMbps: number;
}

export interface ParticipantDataInfo {
  totalSamples: number;
  dataTypes: string[];
  dataQuality: number; // 0-100
  dataDistribution: DataDistribution;
  privacyLevel: PrivacyLevel;
}

export interface DataDistribution {
  type: 'uniform' | 'skewed' | 'non-iid' | 'custom';
  labels: Record<string, number>;
  features: Record<string, number>;
  customMetrics?: Record<string, number>;
}

export type PrivacyLevel = 'public' | 'internal' | 'confidential' | 'restricted';

export interface FederatedTrainingStage {
  id: string;
  stageNumber: number;
  name: string;
  description?: string;
  status: StageStatus;
  config: StageConfig;
  rounds: FederatedTrainingRound[];
  metrics: StageMetrics;
  startedAt?: string;
  completedAt?: string;
}

export type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface StageMetrics {
  totalRounds: number;
  completedRounds: number;
  averageRoundTime: number;
  averageAccuracy: number;
  averageLoss: number;
  participantCount: number;
  dataProcessed: number;
}

export interface FederatedTrainingRound {
  id: string;
  jobId: string;
  stageId?: string;
  roundNumber: number;
  status: RoundStatus;
  selectedParticipants: string[];
  participatedParticipants: string[];
  participantUpdates: ParticipantUpdate[];
  aggregatedModel?: FederatedModel;
  metrics: RoundMetrics;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export type RoundStatus =
  | 'pending'
  | 'selecting-participants'
  | 'distributing-model'
  | 'local-training'
  | 'collecting-updates'
  | 'aggregating'
  | 'validating'
  | 'completed'
  | 'failed';

export interface ParticipantUpdate {
  participantId: string;
  participantName: string;
  modelUpdate: ModelUpdate;
  metrics: ParticipantMetrics;
  submittedAt: string;
  validated: boolean;
  validationScore?: number;
}

export interface ModelUpdate {
  updateType: 'weights' | 'gradients' | 'knowledge' | 'ensemble';
  data: any;
  sizeBytes: number;
  checksum: string;
  encrypted: boolean;
  metadata?: Record<string, any>;
}

export interface ParticipantMetrics {
  localAccuracy: number;
  localLoss: number;
  trainingTime: number;
  dataSamples: number;
  computeTime: number;
  networkTime: number;
  resourceUsage: ResourceUsage;
}

export interface ResourceUsage {
  cpuPercent: number;
  memoryPercent: number;
  gpuPercent: number;
  networkBytes: number;
}

export interface RoundMetrics {
  totalParticipants: number;
  participatedParticipants: number;
  participationRate: number;
  averageAccuracy: number;
  averageLoss: number;
  aggregationTime: number;
  roundTime: number;
  globalModelAccuracy?: number;
  globalModelLoss?: number;
  convergenceRate?: number;
}

export interface FederatedTrainingMetrics {
  totalRounds: number;
  completedRounds: number;
  averageRoundTime: number;
  averageParticipationRate: number;
  globalModelAccuracy: number;
  globalModelLoss: number;
  convergenceRate: number;
  totalParticipants: number;
  activeParticipants: number;
  totalDataProcessed: number;
  totalComputeTime: number;
  totalNetworkTime: number;
  privacyBudgetUsed?: number;
  privacyBudgetRemaining?: number;
}

export interface TrustConfiguration {
  enabled: boolean;
  minTrustScore: number;
  trustVerificationRequired: boolean;
  trustCertificates: string[];
  trustEvaluationFrequency: number;
  trustRevocationThreshold: number;
  mutualTrustRequired: boolean;
}

export interface FederatedPrivacyConfig {
  mechanism: FederatedPrivacyMechanism;
  differentialPrivacy?: DifferentialPrivacyConfig;
  secureAggregation?: SecureAggregationConfig;
  homomorphicEncryption?: HomomorphicEncryptionConfig;
  trustedExecution?: TrustedExecutionConfig;
  privacyBudget: PrivacyBudget;
}

export type FederatedPrivacyMechanism =
  | 'none'
  | 'differential-privacy'
  | 'secure-aggregation'
  | 'homomorphic-encryption'
  | 'trusted-execution'
  | 'hybrid';

export interface DifferentialPrivacyConfig {
  epsilon: number;
  delta: number;
  noiseMultiplier: number;
  clippingNorm: number;
  accountantType: 'rdp' | 'gdp' | 'prv';
  privacyBudgetPerRound: number;
}

export interface SecureAggregationConfig {
  protocol: 'shamir' | 'additive' | 'replicated' | 'pairwise';
  threshold: number;
  numParties: number;
  keyExchangeProtocol: string;
}

export interface HomomorphicEncryptionConfig {
  scheme: 'paillier' | 'ckks' | 'bfv' | 'tfhe';
  keySize: number;
  precisionBits?: number;
  multiplicativeDepth?: number;
}

export interface TrustedExecutionConfig {
  teeType: 'sgx' | 'sev' | 'trustzone' | 'keystone';
  attestationRequired: boolean;
  remoteAttestation: boolean;
  enclaveSize: number;
}

export interface PrivacyBudget {
  totalBudget: number;
  usedBudget: number;
  remainingBudget: number;
  budgetPerRound: number;
  budgetTracking: boolean;
}

export interface FederatedTrainingDashboard {
  organizationId: string;
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  totalParticipants: number;
  activeParticipants: number;
  averageAccuracy: number;
  averageParticipationRate: number;
  recentJobs: FederatedTrainingJob[];
  topParticipants: TopParticipant[];
  trainingTrends: TrainingTrend[];
  trustDistribution: TrustDistribution;
  privacyUsage: PrivacyUsage;
}

export interface TopParticipant {
  participantId: string;
  participantName: string;
  organizationId: string;
  totalContributions: number;
  averageAccuracy: number;
  trustScore: number;
  contributionScore: number;
}

export interface TrainingTrend {
  date: string;
  jobCount: number;
  averageAccuracy: number;
  averageLoss: number;
  participantCount: number;
}

export interface TrustDistribution {
  highTrust: number; // 80-100
  mediumTrust: number; // 50-79
  lowTrust: number; // 0-49
  verified: number;
  unverified: number;
}

export interface PrivacyUsage {
  totalBudgetUsed: number;
  totalBudgetRemaining: number;
  averageBudgetPerJob: number;
  jobsWithPrivacy: number;
  privacyMechanisms: Record<FederatedPrivacyMechanism, number>;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const federatedJobs = new Map<string, FederatedTrainingJob>();
const participants = new Map<string, FederatedParticipant[]>();

// ─── Federated Training Job Management ─────────────────────────────────────────

/**
 * Create a federated training job
 */
export async function createFederatedTrainingJob(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    trainingType: FederatedTrainingType;
    baseModel: FederatedModel;
    config: FederatedTrainingConfig;
    trustConfig?: TrustConfiguration;
    privacyConfig?: FederatedPrivacyConfig;
    createdBy: string;
  }
): Promise<FederatedTrainingJob> {
  const id = `fedjob_${randomUUID()}`;
  const now = new Date().toISOString();

  const job: FederatedTrainingJob = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    status: 'planned',
    trainingType: params.trainingType,
    baseModel: params.baseModel,
    config: params.config,
    participants: [],
    stages: [],
    currentStage: 0,
    rounds: [],
    currentRound: 0,
    metrics: {
      totalRounds: params.config.totalRounds,
      completedRounds: 0,
      averageRoundTime: 0,
      averageParticipationRate: 0,
      globalModelAccuracy: 0,
      globalModelLoss: 0,
      convergenceRate: 0,
      totalParticipants: 0,
      activeParticipants: 0,
      totalDataProcessed: 0,
      totalComputeTime: 0,
      totalNetworkTime: 0,
    },
    trustConfig: params.trustConfig || {
      enabled: false,
      minTrustScore: 0,
      trustVerificationRequired: false,
      trustCertificates: [],
      trustEvaluationFrequency: 0,
      trustRevocationThreshold: 0,
      mutualTrustRequired: false,
    },
    privacyConfig: params.privacyConfig || {
      mechanism: 'none',
      privacyBudget: {
        totalBudget: 0,
        usedBudget: 0,
        remainingBudget: 0,
        budgetPerRound: 0,
        budgetTracking: false,
      },
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  // Initialize stages if multi-stage is enabled
  if (params.config.multiStageConfig?.enabled) {
    job.stages = params.config.multiStageConfig.stages.map((stageConfig, index) => ({
      id: `stage_${randomUUID()}`,
      stageNumber: index,
      name: stageConfig.name,
      description: stageConfig.description,
      status: 'pending',
      config: stageConfig,
      rounds: [],
      metrics: {
        totalRounds: stageConfig.rounds,
        completedRounds: 0,
        averageRoundTime: 0,
        averageAccuracy: 0,
        averageLoss: 0,
        participantCount: 0,
        dataProcessed: 0,
      },
    }));
  }

  federatedJobs.set(id, job);
  return job;
}

/**
 * Add participant to federated training job
 */
export async function addParticipant(
  jobId: string,
  participant: Omit<FederatedParticipant, 'joinedAt' | 'lastActiveAt'>
): Promise<FederatedParticipant | null> {
  const job = federatedJobs.get(jobId);
  if (!job) return null;

  const newParticipant: FederatedParticipant = {
    ...participant,
    joinedAt: new Date().toISOString(),
  };

  job.participants.push(newParticipant);
  job.metrics.totalParticipants++;
  job.metrics.activeParticipants++;
  job.updatedAt = newParticipant.joinedAt;

  // Add to participants map
  const orgParticipants = participants.get(participant.organizationId) || [];
  orgParticipants.push(newParticipant);
  participants.set(participant.organizationId, orgParticipants);

  federatedJobs.set(jobId, job);
  return newParticipant;
}

/**
 * Remove participant from federated training job
 */
export async function removeParticipant(
  jobId: string,
  participantId: string
): Promise<boolean> {
  const job = federatedJobs.get(jobId);
  if (!job) return false;

  const participantIndex = job.participants.findIndex((p) => p.id === participantId);
  if (participantIndex === -1) return false;

  const participant = job.participants[participantIndex];
  participant.status = 'removed';
  job.metrics.activeParticipants--;
  job.updatedAt = new Date().toISOString();

  federatedJobs.set(jobId, job);
  return true;
}

/**
 * Start federated training job
 */
export async function startFederatedTrainingJob(
  jobId: string
): Promise<FederatedTrainingJob | null> {
  const job = federatedJobs.get(jobId);
  if (!job || job.status !== 'planned') return null;

  job.status = 'initializing';
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  // Check minimum participants
  if (job.participants.length < job.config.minParticipantsPerRound) {
    job.status = 'failed';
    job.updatedAt = new Date().toISOString();
    federatedJobs.set(jobId, job);
    return job;
  }

  job.status = 'running';
  job.updatedAt = new Date().toISOString();

  federatedJobs.set(jobId, job);
  return job;
}

/**
 * Execute federated training round
 */
export async function executeFederatedRound(
  jobId: string
): Promise<FederatedTrainingRound | null> {
  const job = federatedJobs.get(jobId);
  if (!job || job.status !== 'running') return null;

  const roundId = `round_${randomUUID()}`;
  const now = new Date().toISOString();

  // Select participants
  const selectedParticipants = selectParticipants(job);

  const round: FederatedTrainingRound = {
    id: roundId,
    jobId,
    stageId: job.stages.length > 0 ? job.stages[job.currentStage].id : undefined,
    roundNumber: job.currentRound + 1,
    status: 'selecting-participants',
    selectedParticipants: selectedParticipants.map((p) => p.id),
    participatedParticipants: [],
    participantUpdates: [],
    metrics: {
      totalParticipants: selectedParticipants.length,
      participatedParticipants: 0,
      participationRate: 0,
      averageAccuracy: 0,
      averageLoss: 0,
      aggregationTime: 0,
      roundTime: 0,
    },
    startedAt: now,
  };

  job.rounds.push(round);
  job.currentRound++;
  job.updatedAt = now;

  federatedJobs.set(jobId, job);
  return round;
}

/**
 * Complete federated training round
 */
export async function completeFederatedRound(
  jobId: string,
  roundId: string,
  aggregatedModel: FederatedModel,
  metrics: RoundMetrics
): Promise<FederatedTrainingRound | null> {
  const job = federatedJobs.get(jobId);
  if (!job) return null;

  const round = job.rounds.find((r) => r.id === roundId);
  if (!round) return null;

  round.aggregatedModel = aggregatedModel;
  round.metrics = metrics;
  round.status = 'completed';
  round.completedAt = new Date().toISOString();
  round.metrics.roundTime = new Date(round.completedAt).getTime() - new Date(round.startedAt).getTime();

  // Update job metrics
  job.metrics.completedRounds++;
  job.metrics.averageRoundTime = job.rounds.reduce((sum, r) => sum + r.metrics.roundTime, 0) / job.metrics.completedRounds;
  job.metrics.averageParticipationRate = job.rounds.reduce((sum, r) => sum + r.metrics.participationRate, 0) / job.metrics.completedRounds;
  job.metrics.globalModelAccuracy = metrics.globalModelAccuracy || 0;
  job.metrics.globalModelLoss = metrics.globalModelLoss || 0;

  // Update stage metrics if applicable
  if (round.stageId) {
    const stage = job.stages.find((s) => s.id === round.stageId);
    if (stage) {
      stage.completedRounds++;
      stage.metrics.completedRounds++;
      stage.metrics.averageRoundTime = stage.rounds.reduce((sum, r) => sum + r.metrics.roundTime, 0) / stage.metrics.completedRounds;
      stage.metrics.averageAccuracy = metrics.globalModelAccuracy || 0;
      stage.metrics.averageLoss = metrics.globalModelLoss || 0;
    }
  }

  job.updatedAt = round.completedAt;

  // Check if job is complete
  if (job.currentRound >= job.config.totalRounds) {
    job.status = 'completed';
    job.completedAt = round.completedAt;
    job.globalModel = aggregatedModel;
  }

  federatedJobs.set(jobId, job);
  return round;
}

/**
 * Pause federated training job
 */
export async function pauseFederatedTrainingJob(
  jobId: string
): Promise<FederatedTrainingJob | null> {
  const job = federatedJobs.get(jobId);
  if (!job || job.status !== 'running') return null;

  job.status = 'paused';
  job.updatedAt = new Date().toISOString();

  federatedJobs.set(jobId, job);
  return job;
}

/**
 * Resume federated training job
 */
export async function resumeFederatedTrainingJob(
  jobId: string
): Promise<FederatedTrainingJob | null> {
  const job = federatedJobs.get(jobId);
  if (!job || job.status !== 'paused') return null;

  job.status = 'running';
  job.updatedAt = new Date().toISOString();

  federatedJobs.set(jobId, job);
  return job;
}

/**
 * Cancel federated training job
 */
export async function cancelFederatedTrainingJob(
  jobId: string
): Promise<FederatedTrainingJob | null> {
  const job = federatedJobs.get(jobId);
  if (!job || job.status === 'completed' || job.status === 'cancelled') return null;

  job.status = 'cancelled';
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;

  federatedJobs.set(jobId, job);
  return job;
}

/**
 * Get federated training job by ID
 */
export async function getFederatedTrainingJob(
  jobId: string
): Promise<FederatedTrainingJob | null> {
  return federatedJobs.get(jobId) || null;
}

/**
 * List federated training jobs for an organization
 */
export async function listFederatedTrainingJobs(
  organizationId: string,
  filters?: { status?: FederatedTrainingStatus; trainingType?: FederatedTrainingType }
): Promise<FederatedTrainingJob[]> {
  let orgJobs = Array.from(federatedJobs.values()).filter((j) => j.organizationId === organizationId);

  if (filters?.status) {
    orgJobs = orgJobs.filter((j) => j.status === filters.status);
  }

  if (filters?.trainingType) {
    orgJobs = orgJobs.filter((j) => j.trainingType === filters.trainingType);
  }

  return orgJobs;
}

/**
 * Get federated training dashboard
 */
export async function getFederatedTrainingDashboard(
  organizationId: string
): Promise<FederatedTrainingDashboard> {
  const orgJobs = await listFederatedTrainingJobs(organizationId);
  const allParticipants = orgJobs.flatMap((j) => j.participants);

  const activeJobs = orgJobs.filter((j) => j.status === 'running');
  const completedJobs = orgJobs.filter((j) => j.status === 'completed');

  const averageAccuracy = completedJobs.length > 0
    ? completedJobs.reduce((sum, j) => sum + j.metrics.globalModelAccuracy, 0) / completedJobs.length
    : 0;

  const averageParticipationRate = orgJobs.length > 0
    ? orgJobs.reduce((sum, j) => sum + j.metrics.averageParticipationRate, 0) / orgJobs.length
    : 0;

  const recentJobs = orgJobs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  // Calculate top participants
  const participantContributions = new Map<string, {
    participantName: string;
    organizationId: string;
    totalContributions: number;
    totalAccuracy: number;
    trustScore: number;
    contributionScore: number;
  }>();

  for (const job of orgJobs) {
    for (const round of job.rounds) {
      for (const update of round.participantUpdates) {
        const participant = participantContributions.get(update.participantId) || {
          participantName: update.participantName,
          organizationId: '',
          totalContributions: 0,
          totalAccuracy: 0,
          trustScore: 0,
          contributionScore: 0,
        };

        participant.totalContributions++;
        participant.totalAccuracy += update.metrics.localAccuracy;

        participantContributions.set(update.participantId, participant);
      }
    }
  }

  const topParticipants = Array.from(participantContributions.entries())
    .map(([participantId, data]) => ({
      participantId,
      participantName: data.participantName,
      organizationId: data.organizationId,
      totalContributions: data.totalContributions,
      averageAccuracy: data.totalContributions > 0 ? data.totalAccuracy / data.totalContributions : 0,
      trustScore: data.trustScore,
      contributionScore: data.contributionScore,
    }))
    .sort((a, b) => b.totalContributions - a.totalContributions)
    .slice(0, 10);

  // Calculate training trends (last 30 days)
  const trainingTrends: TrainingTrend[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dayJobs = orgJobs.filter((j) => j.createdAt.startsWith(dateStr));
    const dayCompletedJobs = dayJobs.filter((j) => j.status === 'completed');

    trainingTrends.push({
      date: dateStr,
      jobCount: dayJobs.length,
      averageAccuracy: dayCompletedJobs.length > 0
        ? dayCompletedJobs.reduce((sum, j) => sum + j.metrics.globalModelAccuracy, 0) / dayCompletedJobs.length
        : 0,
      averageLoss: dayCompletedJobs.length > 0
        ? dayCompletedJobs.reduce((sum, j) => sum + j.metrics.globalModelLoss, 0) / dayCompletedJobs.length
        : 0,
      participantCount: dayJobs.reduce((sum, j) => sum + j.metrics.totalParticipants, 0),
    });
  }

  trainingTrends.reverse();

  // Calculate trust distribution
  const trustDistribution: TrustDistribution = {
    highTrust: 0,
    mediumTrust: 0,
    lowTrust: 0,
    verified: 0,
    unverified: 0,
  };

  for (const participant of allParticipants) {
    if (participant.trust.overall >= 80) trustDistribution.highTrust++;
    else if (participant.trust.overall >= 50) trustDistribution.mediumTrust++;
    else trustDistribution.lowTrust++;

    if (participant.trust.verified) trustDistribution.verified++;
    else trustDistribution.unverified++;
  }

  // Calculate privacy usage
  const privacyUsage: PrivacyUsage = {
    totalBudgetUsed: 0,
    totalBudgetRemaining: 0,
    averageBudgetPerJob: 0,
    jobsWithPrivacy: 0,
    privacyMechanisms: {
      'none': 0,
      'differential-privacy': 0,
      'secure-aggregation': 0,
      'homomorphic-encryption': 0,
      'trusted-execution': 0,
      'hybrid': 0,
    },
  };

  for (const job of orgJobs) {
    if (job.privacyConfig.mechanism !== 'none') {
      privacyUsage.jobsWithPrivacy++;
      privacyUsage.totalBudgetUsed += job.privacyConfig.privacyBudget.usedBudget;
      privacyUsage.totalBudgetRemaining += job.privacyConfig.privacyBudget.remainingBudget;
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
    totalParticipants: allParticipants.length,
    activeParticipants: allParticipants.filter((p) => p.status === 'active').length,
    averageAccuracy,
    averageParticipationRate,
    recentJobs,
    topParticipants,
    trainingTrends,
    trustDistribution,
    privacyUsage,
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function selectParticipants(job: FederatedTrainingJob): FederatedParticipant[] {
  const activeParticipants = job.participants.filter((p) => p.status === 'active');

  switch (job.config.clientSelectionStrategy) {
    case 'random':
      return selectRandom(activeParticipants, job.config.maxParticipantsPerRound);

    case 'round-robin':
      return selectRoundRobin(job, activeParticipants, job.config.maxParticipantsPerRound);

    case 'resource-based':
      return selectByResource(activeParticipants, job.config.maxParticipantsPerRound);

    case 'data-quality':
      return selectByDataQuality(activeParticipants, job.config.maxParticipantsPerRound);

    case 'reputation-based':
      return selectByReputation(activeParticipants, job.config.maxParticipantsPerRound);

    case 'contribution-based':
      return selectByContribution(activeParticipants, job.config.maxParticipantsPerRound);

    default:
      return selectRandom(activeParticipants, job.config.maxParticipantsPerRound);
  }
}

function selectRandom(participants: FederatedParticipant[], count: number): FederatedParticipant[] {
  const shuffled = [...participants].sort(() => _rng.next() - 0.5);
  return shuffled.slice(0, count);
}

function selectRoundRobin(
  job: FederatedTrainingJob,
  participants: FederatedParticipant[],
  count: number
): FederatedParticipant[] {
  const startIndex = (job.currentRound * count) % participants.length;
  const selected: FederatedParticipant[] = [];

  for (let i = 0; i < count && i < participants.length; i++) {
    const index = (startIndex + i) % participants.length;
    selected.push(participants[index]);
  }

  return selected;
}

function selectByResource(participants: FederatedParticipant[], count: number): FederatedParticipant[] {
  return participants
    .sort((a, b) => {
      const aScore = a.resources.available.cpuCores + a.resources.available.memoryGb / 10;
      const bScore = b.resources.available.cpuCores + b.resources.available.memoryGb / 10;
      return bScore - aScore;
    })
    .slice(0, count);
}

function selectByDataQuality(participants: FederatedParticipant[], count: number): FederatedParticipant[] {
  return participants
    .sort((a, b) => b.dataInfo.dataQuality - a.dataInfo.dataQuality)
    .slice(0, count);
}

function selectByReputation(participants: FederatedParticipant[], count: number): FederatedParticipant[] {
  return participants
    .sort((a, b) => b.trust.reputation - a.trust.reputation)
    .slice(0, count);
}

function selectByContribution(participants: FederatedParticipant[], count: number): FederatedParticipant[] {
  return participants
    .sort((a, b) => b.contribution.overall - a.contribution.overall)
    .slice(0, count);
}
