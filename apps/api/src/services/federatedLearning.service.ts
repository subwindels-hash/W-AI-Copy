/**
 * Module 37: Federated Learning Coordination Service
 *
 * Provides coordination of distributed machine learning across edge devices,
 * including federated averaging, secure aggregation, privacy-preserving
 * mechanisms, client selection, and model update synchronization.
 *
 * Phase 1 — Critical Gap: Federated learning and distributed training infrastructure
 */

import { randomUUID, createHash } from "node:crypto";
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:federatedLearning');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type FederatedLearningStatus = "planned" | "running" | "paused" | "completed" | "failed" | "cancelled";

export type AggregationStrategy = "fedavg" | "fedprox" | "scaffold" | "fednova" | "secure-aggregation" | "custom";

export type PrivacyMechanism = "none" | "differential-privacy" | "secure-multiparty" | "homomorphic-encryption" | "trusted-execution";

export type ClientSelectionStrategy = "random" | "round-robin" | "resource-based" | "data-quality" | "stratified" | "custom";

export type RoundStatus = "pending" | "in-progress" | "aggregating" | "completed" | "failed";

export interface FederatedLearningJob {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: FederatedLearningStatus;
  baseModelId: string;
  baseModelName: string;
  baseModelVersion: string;
  globalModelId?: string;
  globalModelVersion: number;
  config: FederatedLearningConfig;
  currentRound: number;
  totalRounds: number;
  rounds: FederatedRound[];
  participants: FederatedParticipant[];
  metrics: FederatedLearningMetrics;
  privacyConfig: PrivacyConfig;
  createdBy: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FederatedLearningConfig {
  aggregationStrategy: AggregationStrategy;
  clientSelectionStrategy: ClientSelectionStrategy;
  minClientsPerRound: number;
  maxClientsPerRound: number;
  totalRounds: number;
  localEpochs: number;
  localBatchSize: number;
  localLearningRate: number;
  aggregationFrequency: number; // Aggregate every N rounds
  timeoutMs: number;
  earlyStopping?: {
    metric: string;
    patience: number;
    minDelta: number;
  };
  fedProxMu?: number; // For FedProx
}

export interface PrivacyConfig {
  mechanism: PrivacyMechanism;
  differentialPrivacy?: {
    epsilon: number;
    delta: number;
    noiseMultiplier: number;
    clippingNorm: number;
  };
  secureMultiparty?: {
    numParties: number;
    threshold: number;
    protocol: "shamir" | "additive" | "replicated";
  };
  homomorphicEncryption?: {
    scheme: "paillier" | "ckks" | "bfv";
    keySize: number;
  };
}

export interface FederatedRound {
  id: string;
  jobId: string;
  roundNumber: number;
  status: RoundStatus;
  selectedClients: string[];
  participatedClients: string[];
  clientUpdates: ClientUpdate[];
  aggregatedModel?: AggregatedModel;
  metrics: RoundMetrics;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface FederatedParticipant {
  id: string;
  nodeId: string;
  nodeName: string;
  organizationId: string;
  status: "active" | "inactive" | "failed" | "excluded";
  dataSamples: number;
  dataQuality: number; // 0-1
  availableResources: {
    cpuCores: number;
    memoryMb: number;
    storageGb: number;
    networkBandwidthMbps: number;
  };
  participationHistory: {
    totalRounds: number;
    successfulRounds: number;
    failedRounds: number;
    averageLatencyMs: number;
  };
  lastParticipatedAt?: string;
  excludedReason?: string;
  joinedAt: string;
}

export interface ClientUpdate {
  clientId: string;
  clientName: string;
  roundId: string;
  modelWeightsHash: string;
  modelSizeBytes: number;
  numSamples: number;
  localLoss: number;
  localAccuracy?: number;
  trainingTimeMs: number;
  uploadTimeMs: number;
  timestamp: string;
  privacyNoise?: number;
  metadata: Record<string, unknown>;
}

export interface AggregatedModel {
  id: string;
  roundId: string;
  version: number;
  weightsHash: string;
  modelSizeBytes: number;
  aggregationStrategy: AggregationStrategy;
  numClients: number;
  totalSamples: number;
  globalLoss: number;
  globalAccuracy?: number;
  improvement: number; // Compared to previous round
  downloadUrl: string;
  createdAt: string;
}

export interface RoundMetrics {
  numSelectedClients: number;
  numParticipatedClients: number;
  participationRate: number;
  averageLocalLoss: number;
  averageLocalAccuracy?: number;
  averageTrainingTimeMs: number;
  averageUploadTimeMs: number;
  totalRoundTimeMs: number;
  aggregationTimeMs: number;
  globalLoss: number;
  globalAccuracy?: number;
  improvementFromPrevious: number;
}

export interface FederatedLearningMetrics {
  totalRounds: number;
  completedRounds: number;
  failedRounds: number;
  averageRoundTimeMs: number;
  totalParticipants: number;
  activeParticipants: number;
  averageParticipationRate: number;
  globalLossProgression: Array<{ round: number; loss: number }>;
  globalAccuracyProgression?: Array<{ round: number; accuracy: number }>;
  convergenceRate: number;
  totalDataSamples: number;
  totalTrainingTimeMs: number;
  communicationCostMb: number;
}

export interface FederatedLearningStats {
  totalJobs: number;
  jobsByStatus: Record<string, number>;
  totalRounds: number;
  totalParticipants: number;
  averageRoundsPerJob: number;
  averageParticipationRate: number;
  aggregationStrategies: Record<string, number>;
  privacyMechanisms: Record<string, number>;
  averageConvergenceRate: number;
  totalDataSamples: number;
  totalCommunicationCostMb: number;
  topPerformingJobs: Array<{ jobId: string; name: string; finalAccuracy: number }>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const federatedJobs = new Map<string, FederatedLearningJob>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a federated learning job
 */
export async function createFederatedLearningJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  baseModelId: string;
  baseModelName: string;
  baseModelVersion: string;
  config: FederatedLearningConfig;
  privacyConfig?: PrivacyConfig;
  createdBy: string;
}): Promise<FederatedLearningJob> {
  const now = new Date().toISOString();

  const job: FederatedLearningJob = {
    id: `fl_job_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    status: "planned",
    baseModelId: params.baseModelId,
    baseModelName: params.baseModelName,
    baseModelVersion: params.baseModelVersion,
    globalModelVersion: 0,
    config: params.config,
    currentRound: 0,
    totalRounds: params.config.totalRounds,
    rounds: [],
    participants: [],
    metrics: {
      totalRounds: 0,
      completedRounds: 0,
      failedRounds: 0,
      averageRoundTimeMs: 0,
      totalParticipants: 0,
      activeParticipants: 0,
      averageParticipationRate: 0,
      globalLossProgression: [],
      globalAccuracyProgression: [],
      convergenceRate: 0,
      totalDataSamples: 0,
      totalTrainingTimeMs: 0,
      communicationCostMb: 0,
    },
    privacyConfig: params.privacyConfig ?? { mechanism: "none" },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  federatedJobs.set(job.id, job);
  return job;
}

/**
 * Add participant to federated learning job
 */
export async function addFederatedParticipant(
  jobId: string,
  participant: Omit<FederatedParticipant, "id" | "joinedAt" | "participationHistory">
): Promise<FederatedParticipant | null> {
  const job = federatedJobs.get(jobId);
  if (!job) return null;

  const fullParticipant: FederatedParticipant = {
    ...participant,
    id: `fl_participant_${randomUUID().slice(0, 8)}`,
    participationHistory: {
      totalRounds: 0,
      successfulRounds: 0,
      failedRounds: 0,
      averageLatencyMs: 0,
    },
    joinedAt: new Date().toISOString(),
  };

  job.participants.push(fullParticipant);
  job.metrics.totalParticipants = job.participants.length;
  job.metrics.activeParticipants = job.participants.filter(p => p.status === "active").length;
  job.metrics.totalDataSamples = job.participants.reduce((sum, p) => sum + p.dataSamples, 0);
  job.updatedAt = new Date().toISOString();

  federatedJobs.set(jobId, job);
  return fullParticipant;
}

/**
 * Start federated learning job
 */
export async function startFederatedLearningJob(jobId: string): Promise<FederatedLearningJob | null> {
  const job = federatedJobs.get(jobId);
  if (!job) return null;

  if (job.status !== "planned") {
    throw new Error(`Cannot start job in status: ${job.status}`);
  }

  if (job.participants.length < job.config.minClientsPerRound) {
    throw new Error(`Need at least ${job.config.minClientsPerRound} participants, got ${job.participants.length}`);
  }

  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  federatedJobs.set(jobId, job);

  // Start first round
  await startFederatedRound(jobId);

  return job;
}

/**
 * Start a federated learning round
 */
export async function startFederatedRound(jobId: string): Promise<FederatedRound | null> {
  const job = federatedJobs.get(jobId);
  if (!job || job.status !== "running") return null;

  job.currentRound++;
  if (job.currentRound > job.totalRounds) {
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.updatedAt = job.completedAt;
    federatedJobs.set(jobId, job);
    return null;
  }

  // Select clients for this round
  const selectedClients = selectClients(job);

  const round: FederatedRound = {
    id: `fl_round_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    jobId,
    roundNumber: job.currentRound,
    status: "in-progress",
    selectedClients,
    participatedClients: [],
    clientUpdates: [],
    metrics: {
      numSelectedClients: selectedClients.length,
      numParticipatedClients: 0,
      participationRate: 0,
      averageLocalLoss: 0,
      averageTrainingTimeMs: 0,
      averageUploadTimeMs: 0,
      totalRoundTimeMs: 0,
      aggregationTimeMs: 0,
      globalLoss: 0,
      improvementFromPrevious: 0,
    },
    startedAt: new Date().toISOString(),
  };

  job.rounds.push(round);
  job.updatedAt = round.startedAt;
  federatedJobs.set(jobId, job);

  // Simulate client training and updates
  setTimeout(() => simulateRoundCompletion(jobId, round.id), 2000);

  return round;
}

/**
 * Submit client update for a round
 */
export async function submitClientUpdate(
  jobId: string,
  roundId: string,
  update: Omit<ClientUpdate, "roundId" | "timestamp">
): Promise<ClientUpdate | null> {
  const job = federatedJobs.get(jobId);
  if (!job) return null;

  const round = job.rounds.find(r => r.id === roundId);
  if (!round || round.status !== "in-progress") return null;

  const fullUpdate: ClientUpdate = {
    ...update,
    roundId,
    timestamp: new Date().toISOString(),
  };

  round.clientUpdates.push(fullUpdate);
  round.participatedClients.push(update.clientId);

  // Update participant history
  const participant = job.participants.find(p => p.id === update.clientId);
  if (participant) {
    participant.participationHistory.totalRounds++;
    participant.participationHistory.successfulRounds++;
    participant.lastParticipatedAt = fullUpdate.timestamp;
    participant.participationHistory.averageLatencyMs =
      (participant.participationHistory.averageLatencyMs * (participant.participationHistory.totalRounds - 1) +
        update.trainingTimeMs + update.uploadTimeMs) /
      participant.participationHistory.totalRounds;
  }

  // Update round metrics
  round.metrics.numParticipatedClients = round.participatedClients.length;
  round.metrics.participationRate = round.metrics.numParticipatedClients / round.metrics.numSelectedClients;

  job.updatedAt = new Date().toISOString();
  federatedJobs.set(jobId, job);

  return fullUpdate;
}

/**
 * Aggregate client updates
 */
export async function aggregateRoundUpdates(
  jobId: string,
  roundId: string
): Promise<AggregatedModel | null> {
  const job = federatedJobs.get(jobId);
  if (!job) return null;

  const round = job.rounds.find(r => r.id === roundId);
  if (!round) return null;

  round.status = "aggregating";
  federatedJobs.set(jobId, job);

  // Simulate aggregation
  const totalSamples = round.clientUpdates.reduce((sum, u) => sum + u.numSamples, 0);
  const weightedLoss = round.clientUpdates.reduce((sum, u) => sum + u.localLoss * u.numSamples, 0) / totalSamples;
  const previousLoss = round.roundNumber > 1 ? job.rounds[round.roundNumber - 2]?.metrics.globalLoss ?? weightedLoss : weightedLoss;
  const improvement = previousLoss - weightedLoss;

  job.globalModelVersion++;

  const aggregatedModel: AggregatedModel = {
    id: `fl_model_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    roundId,
    version: job.globalModelVersion,
    weightsHash: createHash("sha256").update(`${jobId}-${roundId}-${Date.now()}`).digest("hex"),
    modelSizeBytes: 5000000, // 5MB simulated
    aggregationStrategy: job.config.aggregationStrategy,
    numClients: round.clientUpdates.length,
    totalSamples,
    globalLoss: weightedLoss,
    globalAccuracy: 0.8 + _rng.next() * 0.15,
    improvement,
    downloadUrl: `https://models.example.com/federated/${randomUUID()}`,
    createdAt: new Date().toISOString(),
  };

  round.aggregatedModel = aggregatedModel;
  round.status = "completed";
  round.completedAt = aggregatedModel.createdAt;

  // Update round metrics
  round.metrics.averageLocalLoss = round.clientUpdates.reduce((sum, u) => sum + u.localLoss, 0) / round.clientUpdates.length;
  round.metrics.averageTrainingTimeMs = round.clientUpdates.reduce((sum, u) => sum + u.trainingTimeMs, 0) / round.clientUpdates.length;
  round.metrics.averageUploadTimeMs = round.clientUpdates.reduce((sum, u) => sum + u.uploadTimeMs, 0) / round.clientUpdates.length;
  round.metrics.totalRoundTimeMs = new Date(round.completedAt).getTime() - new Date(round.startedAt).getTime();
  round.metrics.aggregationTimeMs = 500 + _rng.next() * 500;
  round.metrics.globalLoss = weightedLoss;
  round.metrics.globalAccuracy = aggregatedModel.globalAccuracy;
  round.metrics.improvementFromPrevious = improvement;

  // Update job metrics
  job.metrics.totalRounds = job.rounds.length;
  job.metrics.completedRounds = job.rounds.filter(r => r.status === "completed").length;
  job.metrics.failedRounds = job.rounds.filter(r => r.status === "failed").length;
  job.metrics.averageRoundTimeMs =
    job.rounds.reduce((sum, r) => sum + r.metrics.totalRoundTimeMs, 0) / job.rounds.length;
  job.metrics.averageParticipationRate =
    job.rounds.reduce((sum, r) => sum + r.metrics.participationRate, 0) / job.rounds.length;
  job.metrics.globalLossProgression.push({ round: round.roundNumber, loss: weightedLoss });
  if (aggregatedModel.globalAccuracy !== undefined) {
    job.metrics.globalAccuracyProgression!.push({ round: round.roundNumber, accuracy: aggregatedModel.globalAccuracy });
  }
  job.metrics.totalTrainingTimeMs += round.metrics.totalRoundTimeMs;
  job.metrics.communicationCostMb += (aggregatedModel.modelSizeBytes * round.clientUpdates.length) / 1024 / 1024;

  // Calculate convergence rate
  if (job.metrics.globalLossProgression.length >= 2) {
    const recentLosses = job.metrics.globalLossProgression.slice(-5);
    const lossDiff = recentLosses[0].loss - recentLosses[recentLosses.length - 1].loss;
    job.metrics.convergenceRate = lossDiff / recentLosses.length;
  }

  job.updatedAt = round.completedAt;
  federatedJobs.set(jobId, job);

  // Start next round
  setTimeout(() => startFederatedRound(jobId), 1000);

  return aggregatedModel;
}

/**
 * Get federated learning job by ID
 */
export async function getFederatedLearningJob(jobId: string): Promise<FederatedLearningJob | null> {
  return federatedJobs.get(jobId) ?? null;
}

/**
 * List federated learning jobs
 */
export async function listFederatedLearningJobs(
  organizationId: string,
  status?: FederatedLearningStatus
): Promise<FederatedLearningJob[]> {
  let result = Array.from(federatedJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (status) result = result.filter(j => j.status === status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Pause federated learning job
 */
export async function pauseFederatedLearningJob(jobId: string): Promise<FederatedLearningJob | null> {
  const job = federatedJobs.get(jobId);
  if (!job || job.status !== "running") return null;

  job.status = "paused";
  job.updatedAt = new Date().toISOString();
  federatedJobs.set(jobId, job);
  return job;
}

/**
 * Resume federated learning job
 */
export async function resumeFederatedLearningJob(jobId: string): Promise<FederatedLearningJob | null> {
  const job = federatedJobs.get(jobId);
  if (!job || job.status !== "paused") return null;

  job.status = "running";
  job.updatedAt = new Date().toISOString();
  federatedJobs.set(jobId, job);

  // Continue with next round
  await startFederatedRound(jobId);

  return job;
}

/**
 * Cancel federated learning job
 */
export async function cancelFederatedLearningJob(jobId: string): Promise<FederatedLearningJob | null> {
  const job = federatedJobs.get(jobId);
  if (!job) return null;

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();
  federatedJobs.set(jobId, job);
  return job;
}

/**
 * Exclude participant from federated learning
 */
export async function excludeParticipant(
  jobId: string,
  participantId: string,
  reason: string
): Promise<FederatedParticipant | null> {
  const job = federatedJobs.get(jobId);
  if (!job) return null;

  const participant = job.participants.find(p => p.id === participantId);
  if (!participant) return null;

  participant.status = "excluded";
  participant.excludedReason = reason;
  job.metrics.activeParticipants = job.participants.filter(p => p.status === "active").length;
  job.updatedAt = new Date().toISOString();

  federatedJobs.set(jobId, job);
  return participant;
}

/**
 * Get federated learning statistics
 */
export async function getFederatedLearningStats(organizationId: string): Promise<FederatedLearningStats> {
  const allJobs = Array.from(federatedJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  const jobsByStatus: Record<string, number> = {};
  const aggregationStrategies: Record<string, number> = {};
  const privacyMechanisms: Record<string, number> = {};
  let totalRounds = 0;
  let totalParticipants = 0;
  let totalParticipationRate = 0;
  let totalConvergenceRate = 0;
  let totalDataSamples = 0;
  let totalCommunicationCost = 0;

  for (const job of allJobs) {
    jobsByStatus[job.status] = (jobsByStatus[job.status] || 0) + 1;
    aggregationStrategies[job.config.aggregationStrategy] = (aggregationStrategies[job.config.aggregationStrategy] || 0) + 1;
    privacyMechanisms[job.privacyConfig.mechanism] = (privacyMechanisms[job.privacyConfig.mechanism] || 0) + 1;
    totalRounds += job.metrics.completedRounds;
    totalParticipants += job.participants.length;
    totalParticipationRate += job.metrics.averageParticipationRate;
    totalConvergenceRate += job.metrics.convergenceRate;
    totalDataSamples += job.metrics.totalDataSamples;
    totalCommunicationCost += job.metrics.communicationCostMb;
  }

  const topPerformingJobs = allJobs
    .filter(j => j.status === "completed" && j.metrics.globalAccuracyProgression!.length > 0)
    .map(j => ({
      jobId: j.id,
      name: j.name,
      finalAccuracy: j.metrics.globalAccuracyProgression![j.metrics.globalAccuracyProgression!.length - 1].accuracy,
    }))
    .sort((a, b) => b.finalAccuracy - a.finalAccuracy)
    .slice(0, 10);

  return {
    totalJobs: allJobs.length,
    jobsByStatus,
    totalRounds,
    totalParticipants,
    averageRoundsPerJob: allJobs.length > 0 ? Math.round(totalRounds / allJobs.length) : 0,
    averageParticipationRate: allJobs.length > 0
      ? Math.round((totalParticipationRate / allJobs.length) * 100) / 100
      : 0,
    aggregationStrategies,
    privacyMechanisms,
    averageConvergenceRate: allJobs.length > 0
      ? Math.round((totalConvergenceRate / allJobs.length) * 10000) / 10000
      : 0,
    totalDataSamples,
    totalCommunicationCostMb: Math.round(totalCommunicationCost * 100) / 100,
    topPerformingJobs,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function selectClients(job: FederatedLearningJob): string[] {
  const activeParticipants = job.participants.filter(p => p.status === "active");
  const numToSelect = Math.min(
    job.config.maxClientsPerRound,
    Math.max(job.config.minClientsPerRound, activeParticipants.length)
  );

  switch (job.config.clientSelectionStrategy) {
    case "random":
      return shuffleArray(activeParticipants).slice(0, numToSelect).map(p => p.id);
    case "round-robin":
      // Simplified round-robin
      const startIndex = job.currentRound % activeParticipants.length;
      return activeParticipants
        .slice(startIndex, startIndex + numToSelect)
        .concat(activeParticipants.slice(0, Math.max(0, numToSelect - (activeParticipants.length - startIndex))))
        .map(p => p.id);
    case "resource-based":
      return activeParticipants
        .sort((a, b) => b.availableResources.cpuCores - a.availableResources.cpuCores)
        .slice(0, numToSelect)
        .map(p => p.id);
    case "data-quality":
      return activeParticipants
        .sort((a, b) => b.dataQuality - a.dataQuality)
        .slice(0, numToSelect)
        .map(p => p.id);
    default:
      return shuffleArray(activeParticipants).slice(0, numToSelect).map(p => p.id);
  }
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(_rng.next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function simulateRoundCompletion(jobId: string, roundId: string): Promise<void> {
  const job = federatedJobs.get(jobId);
  if (!job) return;

  const round = job.rounds.find(r => r.id === roundId);
  if (!round || round.status !== "in-progress") return;

  // Simulate client updates
  for (const clientId of round.selectedClients) {
    const participant = job.participants.find(p => p.id === clientId);
    if (!participant || participant.status !== "active") continue;

    // 90% participation rate
    if (_rng.next() < 0.9) {
      await submitClientUpdate(jobId, roundId, {
        clientId,
        clientName: participant.nodeName,
        modelWeightsHash: createHash("sha256").update(`${clientId}-${roundId}-${Date.now()}`).digest("hex"),
        modelSizeBytes: 5000000,
        numSamples: participant.dataSamples,
        localLoss: 0.3 + _rng.next() * 0.4,
        localAccuracy: 0.7 + _rng.next() * 0.25,
        trainingTimeMs: 2000 + _rng.next() * 3000,
        uploadTimeMs: 500 + _rng.next() * 1000,
        metadata: {},
      });
    }
  }

  // Check if we have enough participants
  if (round.participatedClients.length >= job.config.minClientsPerRound) {
    await aggregateRoundUpdates(jobId, roundId);
  } else {
    round.status = "failed";
    round.error = `Insufficient participants: ${round.participatedClients.length} < ${job.config.minClientsPerRound}`;
    round.completedAt = new Date().toISOString();
    job.metrics.failedRounds++;
    job.updatedAt = round.completedAt;
    federatedJobs.set(jobId, job);

    // Try next round
    setTimeout(() => startFederatedRound(jobId), 1000);
  }
}
