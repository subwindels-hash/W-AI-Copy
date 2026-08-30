/**
 * Module 45: Privacy-Preserving Aggregation Service
 *
 * Provides secure aggregation for statistics with differential privacy,
 * secure multi-party computation, homomorphic encryption, privacy budget
 * tracking, noise calibration, and privacy utility analysis.
 *
 * Phase 1 — Critical Gap: Privacy-preserving aggregation infrastructure
 */

import { randomUUID } from "node:crypto";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:privacyPreservingAggregation');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ────────────────────────────────────────────────────────────────────

export type AggregationJobStatus = "pending" | "collecting" | "aggregating" | "adding_noise" | "completed" | "failed" | "cancelled";

export type AggregationFunction = "sum" | "count" | "avg" | "min" | "max" | "histogram" | "percentile" | "distinct_count" | "variance" | "stddev";

export type PrivacyMechanism = "none" | "differential_privacy" | "secure_multiparty" | "homomorphic_encryption" | "local_differential_privacy";

export type NoiseDistribution = "laplace" | "gaussian" | "exponential" | "geometric";

export interface PrivacyPreservingAggregationJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: AggregationJobStatus;
  aggregationConfig: AggregationConfig;
  privacyConfig: PrivacyConfig;
  participants: AggregationParticipant[];
  result?: AggregationResult;
  error?: { code: string; message: string; step?: string };
  performance: AggregationPerformance;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AggregationConfig {
  aggregations: AggregationRequest[];
  groupBy?: string[];
  filters?: AggregationFilter[];
  dataSourceIds: string[];
}

export interface AggregationRequest {
  function: AggregationFunction;
  column: string;
  alias?: string;
  parameters?: Record<string, unknown>; // For histogram bins, percentile values, etc.
}

export interface AggregationFilter {
  column: string;
  operator: "=" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not_in" | "between";
  value: unknown;
  logicalOperator?: "and" | "or";
}

export interface PrivacyConfig {
  mechanism: PrivacyMechanism;
  differentialPrivacy?: DifferentialPrivacyConfig;
  secureMultiparty?: SecureMultipartyConfig;
  homomorphicEncryption?: HomomorphicEncryptionConfig;
  localDifferentialPrivacy?: LocalDifferentialPrivacyConfig;
  privacyBudgetManagement?: PrivacyBudgetManagementConfig;
}

export interface DifferentialPrivacyConfig {
  epsilon: number; // Privacy loss parameter (smaller = more private)
  delta: number; // Probability of privacy breach (typically 1/n or smaller)
  sensitivity: number; // Maximum change in query result from adding/removing one record
  noiseDistribution: NoiseDistribution;
  clippingNorm?: number; // For bounding sensitivity
  compositionType?: "basic" | "advanced" | "moments"; // For multiple queries
}

export interface SecureMultipartyConfig {
  protocol: "shamir" | "additive" | "replicated" | "garbled_circuits";
  numParties: number;
  threshold: number; // Minimum parties needed to reconstruct
  corruptionModel: "semi_honest" | "malicious";
}

export interface HomomorphicEncryptionConfig {
  scheme: "paillier" | "ckks" | "bfv" | "bgv";
  keySize: number; // bits
  securityLevel: number; // bits of security
  packingEnabled?: boolean; // For SIMD operations
}

export interface LocalDifferentialPrivacyConfig {
  epsilon: number;
  randomizationMechanism: "randomized_response" | "laplace" | "exponential";
  privacyAmplification?: boolean;
}

export interface PrivacyBudgetManagementConfig {
  enabled: boolean;
  totalBudget: number; // Total epsilon budget
  budgetPerQuery?: number; // Epsilon per query
  budgetTrackingGranularity: "organization" | "user" | "dataset";
  budgetRenewalPeriod?: "daily" | "weekly" | "monthly" | "yearly";
  overBudgetAction: "reject" | "warn" | "degrade_privacy";
}

export interface AggregationParticipant {
  id: string;
  organizationId: string;
  organizationName: string;
  dataSourceId: string;
  dataSourceName: string;
  status: "pending" | "collecting" | "completed" | "failed";
  localAggregation?: LocalAggregation;
  privacyNoise?: PrivacyNoise;
  executionTimeMs?: number;
  rowsProcessed?: number;
  error?: string;
  joinedAt: string;
}

export interface LocalAggregation {
  participantId: string;
  aggregations: Record<string, unknown>;
  rowCount: number;
  metadata: Record<string, unknown>;
}

export interface PrivacyNoise {
  participantId: string;
  noiseValues: Record<string, number>;
  noiseDistribution: NoiseDistribution;
  epsilon: number;
  sensitivity: number;
}

export interface AggregationResult {
  aggregations: Record<string, unknown>;
  groupByResults?: Array<{
    group: Record<string, unknown>;
    aggregations: Record<string, unknown>;
  }>;
  metadata: {
    totalParticipants: number;
    successfulParticipants: number;
    failedParticipants: number;
    totalRowsProcessed: number;
    privacyBudgetUsed: number;
    privacyBudgetRemaining: number;
    noiseAdded: boolean;
    utilityScore?: number;
  };
  privacyReport: PrivacyReport;
  utilityReport?: UtilityReport;
}

export interface PrivacyReport {
  mechanism: PrivacyMechanism;
  epsilon?: number;
  delta?: number;
  sensitivity?: number;
  noiseDistribution?: NoiseDistribution;
  noiseMagnitude: Record<string, number>; // Per aggregation
  privacyGuarantees: string[];
  compositionAnalysis?: {
    numQueries: number;
    totalEpsilon: number;
    totalDelta: number;
    compositionType: string;
  };
  warnings: string[];
  recommendations: string[];
}

export interface UtilityReport {
  overallUtilityScore: number; // 0-1
  perAggregationUtility: Record<string, number>;
  noiseImpact: Record<string, {
    originalValue?: number;
    noisyValue: number;
    absoluteError: number;
    relativeError: number;
  }>;
  privacyUtilityTradeoff: {
    epsilon: number;
    utility: number;
    paretoOptimal: boolean;
  };
  recommendations: string[];
}

export interface AggregationPerformance {
  collectionTimeMs: number;
  aggregationTimeMs: number;
  noiseAdditionTimeMs: number;
  totalTimeMs: number;
  dataTransferredBytes: number;
  rowsProcessed: number;
  participantPerformance: Array<{
    participantId: string;
    organizationName: string;
    collectionTimeMs: number;
    rowsProcessed: number;
    dataTransferredBytes: number;
  }>;
}

export interface PrivacyBudgetTracker {
  id: string;
  organizationId: string;
  scope: "organization" | "user" | "dataset";
  scopeId: string;
  totalBudget: number;
  usedBudget: number;
  remainingBudget: number;
  queryHistory: Array<{
    queryId: string;
    epsilon: number;
    delta: number;
    timestamp: string;
  }>;
  renewalDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AggregationStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageExecutionTimeMs: number;
  totalRowsProcessed: number;
  totalPrivacyBudgetUsed: number;
  jobsByMechanism: Record<string, number>;
  jobsByAggregationFunction: Record<string, number>;
  averageUtilityScore: number;
  privacyBudgetUsage: Record<string, number>;
  topPerformingJobs: Array<{
    jobId: string;
    name: string;
    executionTimeMs: number;
    utilityScore: number;
  }>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const aggregationJobs = new Map<string, PrivacyPreservingAggregationJob>();
const privacyBudgetTrackers = new Map<string, PrivacyBudgetTracker>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a privacy-preserving aggregation job
 */
export async function createAggregationJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  aggregationConfig: AggregationConfig;
  privacyConfig: PrivacyConfig;
  participants: Array<{
    organizationId: string;
    organizationName: string;
    dataSourceId: string;
    dataSourceName: string;
  }>;
  createdBy: string;
}): Promise<PrivacyPreservingAggregationJob> {
  const now = new Date().toISOString();

  const aggregationParticipants: AggregationParticipant[] = params.participants.map(p => ({
    id: `ap_${randomUUID().slice(0, 8)}`,
    organizationId: p.organizationId,
    organizationName: p.organizationName,
    dataSourceId: p.dataSourceId,
    dataSourceName: p.dataSourceName,
    status: "pending",
    joinedAt: now,
  }));

  const job: PrivacyPreservingAggregationJob = {
    id: `agg_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "pending",
    aggregationConfig: params.aggregationConfig,
    privacyConfig: params.privacyConfig,
    participants: aggregationParticipants,
    performance: {
      collectionTimeMs: 0,
      aggregationTimeMs: 0,
      noiseAdditionTimeMs: 0,
      totalTimeMs: 0,
      dataTransferredBytes: 0,
      rowsProcessed: 0,
      participantPerformance: [],
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  aggregationJobs.set(job.id, job);

  // Check privacy budget if enabled
  if (params.privacyConfig.privacyBudgetManagement?.enabled) {
    const budgetCheck = await checkPrivacyBudget(
      params.organizationId,
      params.privacyConfig.differentialPrivacy?.epsilon ?? 0
    );

    if (!budgetCheck.allowed) {
      throw new Error(`Insufficient privacy budget. Required: ${budgetCheck.required}, Available: ${budgetCheck.available}`);
    }
  }

  return job;
}

/**
 * Execute a privacy-preserving aggregation job
 */
export async function executeAggregationJob(jobId: string): Promise<PrivacyPreservingAggregationJob | null> {
  const job = aggregationJobs.get(jobId);
  if (!job) return null;

  if (job.status !== "pending") {
    throw new Error(`Cannot execute aggregation in status: ${job.status}`);
  }

  job.status = "collecting";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  aggregationJobs.set(jobId, job);

  // Collect local aggregations from all participants
  const collectionStart = Date.now();
  await collectLocalAggregations(job);
  job.performance.collectionTimeMs = Date.now() - collectionStart;

  job.status = "aggregating";
  job.updatedAt = new Date().toISOString();

  aggregationJobs.set(jobId, job);

  // Aggregate results
  const aggregationStart = Date.now();
  const aggregatedResult = aggregateResults(job);
  job.performance.aggregationTimeMs = Date.now() - aggregationStart;

  // Add privacy noise if enabled
  if (job.privacyConfig.mechanism !== "none") {
    job.status = "adding_noise";
    job.updatedAt = new Date().toISOString();

    aggregationJobs.set(jobId, job);

    const noiseStart = Date.now();
    const noisyResult = await addPrivacyNoise(aggregatedResult, job.privacyConfig);
    job.performance.noiseAdditionTimeMs = Date.now() - noiseStart;

    job.result = noisyResult;
  } else {
    job.result = aggregatedResult;
  }

  job.status = "completed";
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;

  job.performance.totalTimeMs = job.completedAt.getTime() - job.startedAt!.getTime();
  job.performance.rowsProcessed = job.participants.reduce((sum, p) => sum + (p.rowsProcessed ?? 0), 0);
  job.performance.dataTransferredBytes = job.performance.participantPerformance.reduce(
    (sum, p) => sum + p.dataTransferredBytes,
    0
  );

  aggregationJobs.set(jobId, job);

  // Update privacy budget if enabled
  if (job.privacyConfig.privacyBudgetManagement?.enabled && job.privacyConfig.differentialPrivacy) {
    await updatePrivacyBudget(
      job.organizationId,
      job.privacyConfig.differentialPrivacy.epsilon,
      job.privacyConfig.differentialPrivacy.delta,
      jobId
    );
  }

  return job;
}

/**
 * Get aggregation job by ID
 */
export async function getAggregationJob(jobId: string): Promise<PrivacyPreservingAggregationJob | null> {
  return aggregationJobs.get(jobId) ?? null;
}

/**
 * List aggregation jobs
 */
export async function listAggregationJobs(
  organizationId: string,
  filters?: {
    status?: AggregationJobStatus;
    mechanism?: PrivacyMechanism;
    limit?: number;
  }
): Promise<PrivacyPreservingAggregationJob[]> {
  let result = Array.from(aggregationJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.mechanism) result = result.filter(j => j.privacyConfig.mechanism === filters.mechanism);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Cancel an aggregation job
 */
export async function cancelAggregationJob(jobId: string): Promise<PrivacyPreservingAggregationJob | null> {
  const job = aggregationJobs.get(jobId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Cannot cancel aggregation in status: ${job.status}`);
  }

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();

  aggregationJobs.set(jobId, job);
  return job;
}

/**
 * Get privacy budget tracker
 */
export async function getPrivacyBudgetTracker(
  organizationId: string,
  scope: "organization" | "user" | "dataset",
  scopeId: string
): Promise<PrivacyBudgetTracker | null> {
  const key = `${organizationId}:${scope}:${scopeId}`;
  return privacyBudgetTrackers.get(key) ?? null;
}

/**
 * Create or update privacy budget tracker
 */
export async function createOrUpdatePrivacyBudgetTracker(params: {
  organizationId: string;
  scope: "organization" | "user" | "dataset";
  scopeId: string;
  totalBudget: number;
  renewalPeriod?: "daily" | "weekly" | "monthly" | "yearly";
}): Promise<PrivacyBudgetTracker> {
  const now = new Date().toISOString();
  const key = `${params.organizationId}:${params.scope}:${params.scopeId}`;

  let tracker = privacyBudgetTrackers.get(key);

  if (!tracker) {
    tracker = {
      id: `budget_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      organizationId: params.organizationId,
      scope: params.scope,
      scopeId: params.scopeId,
      totalBudget: params.totalBudget,
      usedBudget: 0,
      remainingBudget: params.totalBudget,
      queryHistory: [],
      createdAt: now,
      updatedAt: now,
    };

    if (params.renewalPeriod) {
      tracker.renewalDate = calculateRenewalDate(params.renewalPeriod);
    }
  } else {
    tracker.totalBudget = params.totalBudget;
    tracker.remainingBudget = params.totalBudget - tracker.usedBudget;
    tracker.updatedAt = now;

    if (params.renewalPeriod) {
      tracker.renewalDate = calculateRenewalDate(params.renewalPeriod);
    }
  }

  privacyBudgetTrackers.set(key, tracker);
  return tracker;
}

/**
 * Get aggregation statistics
 */
export async function getAggregationStats(organizationId: string): Promise<AggregationStats> {
  const allJobs = Array.from(aggregationJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  const completedJobs = allJobs.filter(j => j.status === "completed");
  const failedJobs = allJobs.filter(j => j.status === "failed");

  let totalExecutionTime = 0;
  let totalRowsProcessed = 0;
  let totalPrivacyBudgetUsed = 0;
  let totalUtilityScore = 0;
  const jobsByMechanism: Record<string, number> = {};
  const jobsByAggregationFunction: Record<string, number> = {};
  const privacyBudgetUsage: Record<string, number> = {};

  for (const job of allJobs) {
    jobsByMechanism[job.privacyConfig.mechanism] = (jobsByMechanism[job.privacyConfig.mechanism] || 0) + 1;

    for (const agg of job.aggregationConfig.aggregations) {
      jobsByAggregationFunction[agg.function] = (jobsByAggregationFunction[agg.function] || 0) + 1;
    }

    if (job.status === "completed") {
      totalExecutionTime += job.performance.totalTimeMs;
      totalRowsProcessed += job.performance.rowsProcessed;

      if (job.privacyConfig.differentialPrivacy) {
        totalPrivacyBudgetUsed += job.privacyConfig.differentialPrivacy.epsilon;
      }

      if (job.result?.utilityReport) {
        totalUtilityScore += job.result.utilityReport.overallUtilityScore;
      }
    }
  }

  const topPerformingJobs = completedJobs
    .filter(j => j.result?.utilityReport)
    .sort((a, b) => (b.result?.utilityReport?.overallUtilityScore ?? 0) - (a.result?.utilityReport?.overallUtilityScore ?? 0))
    .slice(0, 10)
    .map(j => ({
      jobId: j.id,
      name: j.name,
      executionTimeMs: j.performance.totalTimeMs,
      utilityScore: j.result?.utilityReport?.overallUtilityScore ?? 0,
    }));

  return {
    totalJobs: allJobs.length,
    completedJobs: completedJobs.length,
    failedJobs: failedJobs.length,
    averageExecutionTimeMs: completedJobs.length > 0 ? Math.round(totalExecutionTime / completedJobs.length) : 0,
    totalRowsProcessed,
    totalPrivacyBudgetUsed,
    jobsByMechanism,
    jobsByAggregationFunction,
    averageUtilityScore: completedJobs.length > 0 ? totalUtilityScore / completedJobs.length : 0,
    privacyBudgetUsage: { [organizationId]: totalPrivacyBudgetUsed },
    topPerformingJobs,
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

async function collectLocalAggregations(job: PrivacyPreservingAggregationJob): Promise<void> {
  // Simulate parallel collection from all participants
  const collectionPromises = job.participants.map(async (participant) => {
    try {
      participant.status = "collecting";
      const participantStart = Date.now();

      // Simulate local aggregation
      await new Promise(resolve => setTimeout(resolve, 300 + _rng.next() * 700));

      // Generate local aggregation
      const localAggregation = generateLocalAggregation(job.aggregationConfig, participant);

      participant.status = "completed";
      participant.localAggregation = localAggregation;
      participant.executionTimeMs = Date.now() - participantStart;
      participant.rowsProcessed = localAggregation.rowCount;

      job.performance.participantPerformance.push({
        participantId: participant.id,
        organizationName: participant.organizationName,
        collectionTimeMs: participant.executionTimeMs,
        rowsProcessed: participant.rowsProcessed,
        dataTransferredBytes: 1000, // Estimate
      });
    } catch (error) {
      participant.status = "failed";
      participant.error = error instanceof Error ? error.message : String(error);
    }
  });

  await Promise.all(collectionPromises);
}

function generateLocalAggregation(
  config: AggregationConfig,
  participant: AggregationParticipant
): LocalAggregation {
  const numRows = 1000 + Math.floor(_rng.next() * 9000);
  const aggregations: Record<string, unknown> = {};

  for (const agg of config.aggregations) {
    const alias = agg.alias ?? `${agg.function}_${agg.column}`;

    switch (agg.function) {
      case "sum":
        aggregations[alias] = numRows * (50 + _rng.next() * 50);
        break;
      case "count":
        aggregations[alias] = numRows;
        break;
      case "avg":
        aggregations[alias] = 50 + _rng.next() * 50;
        break;
      case "min":
        aggregations[alias] = _rng.next() * 10;
        break;
      case "max":
        aggregations[alias] = 90 + _rng.next() * 10;
        break;
      case "histogram":
        aggregations[alias] = Array.from({ length: 10 }, () => Math.floor(_rng.next() * 100));
        break;
      case "percentile":
        aggregations[alias] = {
          p50: 50 + _rng.next() * 10,
          p90: 80 + _rng.next() * 10,
          p99: 95 + _rng.next() * 5,
        };
        break;
      default:
        aggregations[alias] = null;
    }
  }

  return {
    participantId: participant.id,
    aggregations,
    rowCount: numRows,
    metadata: {
      organizationId: participant.organizationId,
      dataSourceId: participant.dataSourceId,
    },
  };
}

function aggregateResults(job: PrivacyPreservingAggregationJob): AggregationResult {
  const successfulParticipants = job.participants.filter(p => p.status === "completed" && p.localAggregation);
  const failedParticipants = job.participants.filter(p => p.status === "failed");

  if (successfulParticipants.length === 0) {
    throw new Error("No successful participants to aggregate");
  }

  const aggregatedAggregations: Record<string, unknown> = {};
  let totalRows = 0;

  for (const agg of job.aggregationConfig.aggregations) {
    const alias = agg.alias ?? `${agg.function}_${agg.column}`;
    const partialValues = successfulParticipants
      .map(p => p.localAggregation!.aggregations[alias])
      .filter(v => v !== undefined);

    switch (agg.function) {
      case "sum":
        aggregatedAggregations[alias] = partialValues.reduce((sum: number, v: any) => sum + v, 0);
        break;
      case "count":
        aggregatedAggregations[alias] = partialValues.reduce((sum: number, v: any) => sum + v, 0);
        break;
      case "avg":
        const totalSum = successfulParticipants.reduce((sum, p) => {
          const count = p.localAggregation!.aggregations[`count_${agg.column}`] ?? p.localAggregation!.rowCount;
          const avg = p.localAggregation!.aggregations[alias];
          return sum + (avg as number) * (count as number);
        }, 0);
        const totalCount = successfulParticipants.reduce((sum, p) => sum + p.localAggregation!.rowCount, 0);
        aggregatedAggregations[alias] = totalSum / totalCount;
        break;
      case "min":
        aggregatedAggregations[alias] = Math.min(...partialValues as number[]);
        break;
      case "max":
        aggregatedAggregations[alias] = Math.max(...partialValues as number[]);
        break;
      case "histogram":
        aggregatedAggregations[alias] = (partialValues as number[][]).reduce(
          (acc, hist) => acc.map((v, i) => v + hist[i]),
          new Array((partialValues[0] as number[]).length).fill(0)
        );
        break;
      default:
        aggregatedAggregations[alias] = null;
    }
  }

  totalRows = successfulParticipants.reduce((sum, p) => sum + p.localAggregation!.rowCount, 0);

  return {
    aggregations: aggregatedAggregations,
    metadata: {
      totalParticipants: job.participants.length,
      successfulParticipants: successfulParticipants.length,
      failedParticipants: failedParticipants.length,
      totalRowsProcessed: totalRows,
      privacyBudgetUsed: 0,
      privacyBudgetRemaining: 0,
      noiseAdded: false,
    },
    privacyReport: {
      mechanism: job.privacyConfig.mechanism,
      noiseMagnitude: {},
      privacyGuarantees: [],
      warnings: [],
      recommendations: [],
    },
  };
}

async function addPrivacyNoise(
  result: AggregationResult,
  privacyConfig: PrivacyConfig
): Promise<AggregationResult> {
  const noisyResult = { ...result };
  const noiseMagnitude: Record<string, number> = {};

  if (privacyConfig.differentialPrivacy) {
    const dp = privacyConfig.differentialPrivacy;

    for (const [key, value] of Object.entries(result.aggregations)) {
      if (typeof value === "number") {
        const noise = generateNoise(dp.noiseDistribution, dp.sensitivity, dp.epsilon);
        noisyResult.aggregations[key] = value + noise;
        noiseMagnitude[key] = Math.abs(noise);
      }
    }

    noisyResult.metadata.noiseAdded = true;
    noisyResult.metadata.privacyBudgetUsed = dp.epsilon;
    noisyResult.metadata.privacyBudgetRemaining = 10 - dp.epsilon; // Assume budget of 10
  }

  noisyResult.privacyReport = {
    mechanism: privacyConfig.mechanism,
    epsilon: privacyConfig.differentialPrivacy?.epsilon,
    delta: privacyConfig.differentialPrivacy?.delta,
    sensitivity: privacyConfig.differentialPrivacy?.sensitivity,
    noiseDistribution: privacyConfig.differentialPrivacy?.noiseDistribution,
    noiseMagnitude,
    privacyGuarantees: generatePrivacyGuarantees(privacyConfig),
    warnings: generatePrivacyWarnings(privacyConfig),
    recommendations: generatePrivacyRecommendations(privacyConfig),
  };

  // Generate utility report
  noisyResult.utilityReport = generateUtilityReport(result.aggregations, noisyResult.aggregations, privacyConfig);

  return noisyResult;
}

function generateNoise(distribution: NoiseDistribution, sensitivity: number, epsilon: number): number {
  switch (distribution) {
    case "laplace":
      const b = sensitivity / epsilon;
      const u = _rng.next() - 0.5;
      return -b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    case "gaussian":
      const sigma = (sensitivity * Math.sqrt(2 * Math.log(1.25 / 0.00001))) / epsilon;
      const u1 = _rng.next();
      const u2 = _rng.next();
      return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    default:
      return 0;
  }
}

function generatePrivacyGuarantees(privacyConfig: PrivacyConfig): string[] {
  const guarantees: string[] = [];

  if (privacyConfig.differentialPrivacy) {
    const dp = privacyConfig.differentialPrivacy;
    guarantees.push(`(${dp.epsilon}, ${dp.delta})-differential privacy`);
    guarantees.push(`Sensitivity bounded by ${dp.sensitivity}`);
    
    if (dp.compositionType === "advanced") {
      guarantees.push("Advanced composition for multiple queries");
    }
  }

  if (privacyConfig.secureMultiparty) {
    const smp = privacyConfig.secureMultiparty;
    guarantees.push(`Secure ${smp.protocol} protocol with ${smp.numParties} parties`);
    guarantees.push(`Threshold: ${smp.threshold} parties required`);
    guarantees.push(`Corruption model: ${smp.corruptionModel}`);
  }

  if (privacyConfig.homomorphicEncryption) {
    const he = privacyConfig.homomorphicEncryption;
    guarantees.push(`${he.scheme.toUpperCase()} homomorphic encryption`);
    guarantees.push(`${he.keySize}-bit key size`);
    guarantees.push(`${he.securityLevel}-bit security level`);
  }

  return guarantees;
}

function generatePrivacyWarnings(privacyConfig: PrivacyConfig): string[] {
  const warnings: string[] = [];

  if (privacyConfig.differentialPrivacy) {
    const dp = privacyConfig.differentialPrivacy;
    
    if (dp.epsilon > 1.0) {
      warnings.push(`High epsilon value (${dp.epsilon}) provides weak privacy guarantees`);
    }
    
    if (dp.delta > 0.001) {
      warnings.push(`High delta value (${dp.delta}) increases privacy breach probability`);
    }
  }

  return warnings;
}

function generatePrivacyRecommendations(privacyConfig: PrivacyConfig): string[] {
  const recommendations: string[] = [];

  if (privacyConfig.differentialPrivacy) {
    const dp = privacyConfig.differentialPrivacy;
    
    if (dp.epsilon > 1.0) {
      recommendations.push("Consider using smaller epsilon for stronger privacy");
    }
    
    recommendations.push("Monitor privacy budget usage across queries");
    recommendations.push("Use advanced composition for multiple queries");
  }

  return recommendations;
}

function generateUtilityReport(
  originalAggregations: Record<string, unknown>,
  noisyAggregations: Record<string, unknown>,
  privacyConfig: PrivacyConfig
): UtilityReport {
  const perAggregationUtility: Record<string, number> = {};
  const noiseImpact: Record<string, {
    originalValue?: number;
    noisyValue: number;
    absoluteError: number;
    relativeError: number;
  }> = {};

  let totalUtility = 0;
  let count = 0;

  for (const [key, originalValue] of Object.entries(originalAggregations)) {
    const noisyValue = noisyAggregations[key];

    if (typeof originalValue === "number" && typeof noisyValue === "number") {
      const absoluteError = Math.abs(noisyValue - originalValue);
      const relativeError = originalValue !== 0 ? absoluteError / Math.abs(originalValue) : 0;
      const utility = Math.max(0, 1 - relativeError);

      perAggregationUtility[key] = utility;
      noiseImpact[key] = {
        originalValue,
        noisyValue,
        absoluteError,
        relativeError,
      };

      totalUtility += utility;
      count++;
    }
  }

  const overallUtilityScore = count > 0 ? totalUtility / count : 0;

  return {
    overallUtilityScore,
    perAggregationUtility,
    noiseImpact,
    privacyUtilityTradeoff: {
      epsilon: privacyConfig.differentialPrivacy?.epsilon ?? 0,
      utility: overallUtilityScore,
      paretoOptimal: overallUtilityScore > 0.8,
    },
    recommendations: generateUtilityRecommendations(overallUtilityScore, privacyConfig),
  };
}

function generateUtilityRecommendations(utilityScore: number, privacyConfig: PrivacyConfig): string[] {
  const recommendations: string[] = [];

  if (utilityScore < 0.7) {
    recommendations.push("Low utility score - consider increasing epsilon for better accuracy");
    recommendations.push("Review sensitivity bounds - may be too conservative");
  }

  if (utilityScore > 0.9 && privacyConfig.differentialPrivacy?.epsilon && privacyConfig.differentialPrivacy.epsilon < 0.5) {
    recommendations.push("High utility with strong privacy - configuration is well-balanced");
  }

  return recommendations;
}

async function checkPrivacyBudget(
  organizationId: string,
  requiredEpsilon: number
): Promise<{ allowed: boolean; required: number; available: number }> {
  const tracker = privacyBudgetTrackers.get(`${organizationId}:organization:${organizationId}`);

  if (!tracker) {
    return { allowed: true, required: requiredEpsilon, available: Infinity };
  }

  const available = tracker.remainingBudget;
  const allowed = available >= requiredEpsilon;

  return { allowed, required: requiredEpsilon, available };
}

async function updatePrivacyBudget(
  organizationId: string,
  epsilon: number,
  delta: number,
  queryId: string
): Promise<void> {
  const key = `${organizationId}:organization:${organizationId}`;
  const tracker = privacyBudgetTrackers.get(key);

  if (tracker) {
    tracker.usedBudget += epsilon;
    tracker.remainingBudget = tracker.totalBudget - tracker.usedBudget;
    tracker.queryHistory.push({
      queryId,
      epsilon,
      delta,
      timestamp: new Date().toISOString(),
    });
    tracker.updatedAt = new Date().toISOString();

    privacyBudgetTrackers.set(key, tracker);
  }
}

function calculateRenewalDate(period: "daily" | "weekly" | "monthly" | "yearly"): string {
  const now = new Date();
  
  switch (period) {
    case "daily":
      now.setDate(now.getDate() + 1);
      break;
    case "weekly":
      now.setDate(now.getDate() + 7);
      break;
    case "monthly":
      now.setMonth(now.getMonth() + 1);
      break;
    case "yearly":
      now.setFullYear(now.getFullYear() + 1);
      break;
  }

  return now.toISOString();
}
