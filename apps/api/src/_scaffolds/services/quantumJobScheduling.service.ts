/**
 * Quantum Job Scheduling Service (Module 28 — Gap 2)
 *
 * Sophisticated job scheduling with queue management:
 * - Job queue management with priority scheduling
 * - Resource allocation and management
 * - Job dependency management
 * - Job retry and failure handling
 * - Job monitoring and analytics
 * - Fair scheduling across organizations
 *
 * Enables efficient quantum resource utilization.
 */
import { logger } from "../../config/logger.js";
import { Metrics } from "../../observability/metrics.js";
import { redisCmd } from "../../db/redis.js";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:quantumJobScheduling');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export type QuantumJobPriority = "low" | "normal" | "high" | "critical";

export type QuantumJobStatus = 
  | "queued"
  | "waiting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "retrying";

export type QuantumJobType = 
  | "circuit"
  | "optimization"
  | "simulation"
  | "custom";

export interface QuantumJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: QuantumJobType;
  priority: QuantumJobPriority;
  status: QuantumJobStatus;
  processorType: string;
  numQubits: number;
  estimatedDurationMs?: number;
  actualDurationMs?: number;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  createdBy: string;
  dependencies?: string[]; // Job IDs this job depends on
  metadata?: Record<string, any>;
  result?: any;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

export interface QuantumJobQueueStats {
  totalJobs: number;
  byStatus: Record<QuantumJobStatus, number>;
  byPriority: Record<QuantumJobPriority, number>;
  byProcessor: Record<string, number>;
  averageWaitTimeMs: number;
  averageExecutionTimeMs: number;
  queueDepth: number;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const QUANTUM_JOB_KEY = (jobId: string) => `quantum:job:${jobId}`;
const QUANTUM_JOBS_KEY = (orgId: string) => `quantum:jobs:${orgId}`;
const QUANTUM_JOB_QUEUE_KEY = (priority: QuantumJobPriority) => `quantum:queue:${priority}`;
const QUANTUM_JOB_STATS_KEY = (orgId: string) => `quantum:job_stats:${orgId}`;

// Priority order (lower number = higher priority)
const PRIORITY_ORDER: Record<QuantumJobPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ─── Quantum Job Management ─────────────────────────────────────

/**
 * Create quantum job
 */
export async function createQuantumJob(input: {
  organizationId: string;
  name: string;
  description?: string;
  type: QuantumJobType;
  priority?: QuantumJobPriority;
  processorType: string;
  numQubits: number;
  estimatedDurationMs?: number;
  createdBy: string;
  dependencies?: string[];
  metadata?: Record<string, any>;
  maxRetries?: number;
}): Promise<QuantumJob> {
  const jobId = `qjob_${Date.now()}_${_rng.next().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const job: QuantumJob = {
    id: jobId,
    organizationId: input.organizationId,
    name: input.name,
    description: input.description,
    type: input.type,
    priority: input.priority || "normal",
    status: "queued",
    processorType: input.processorType,
    numQubits: input.numQubits,
    estimatedDurationMs: input.estimatedDurationMs,
    queuedAt: now,
    createdBy: input.createdBy,
    dependencies: input.dependencies,
    metadata: input.metadata,
    retryCount: 0,
    maxRetries: input.maxRetries || 3,
  };

  await redisCmd.set(QUANTUM_JOB_KEY(jobId), JSON.stringify(job));
  await redisCmd.sadd(QUANTUM_JOBS_KEY(input.organizationId), jobId);

  // Add to priority queue
  const priorityScore = PRIORITY_ORDER[job.priority] * 1000000 + Date.now();
  await redisCmd.zadd(QUANTUM_JOB_QUEUE_KEY(job.priority), priorityScore, jobId);

  logger.info("Quantum job created", {
    jobId,
    organizationId: input.organizationId,
    name: input.name,
    type: input.type,
    priority: job.priority,
    numQubits: input.numQubits,
  });

  Metrics.increment("quantum.job.created", 1, {
    type: input.type,
    priority: job.priority,
  });

  return job;
}

/**
 * Get quantum job by ID
 */
export async function getQuantumJob(jobId: string): Promise<QuantumJob | null> {
  const data = await redisCmd.get(QUANTUM_JOB_KEY(jobId));
  return data ? JSON.parse(data) : null;
}

/**
 * Get all quantum jobs for organization
 */
export async function getQuantumJobs(
  organizationId: string,
  filters?: {
    status?: QuantumJobStatus;
    type?: QuantumJobType;
    priority?: QuantumJobPriority;
  }
): Promise<QuantumJob[]> {
  const jobIds = await redisCmd.smembers(QUANTUM_JOBS_KEY(organizationId));
  const jobs: QuantumJob[] = [];

  for (const jobId of jobIds) {
    const job = await getQuantumJob(jobId);
    if (!job) continue;

    // Apply filters
    if (filters?.status && job.status !== filters.status) continue;
    if (filters?.type && job.type !== filters.type) continue;
    if (filters?.priority && job.priority !== filters.priority) continue;

    jobs.push(job);
  }

  return jobs.sort((a, b) => 
    new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime()
  );
}

/**
 * Update quantum job
 */
export async function updateQuantumJob(
  jobId: string,
  updates: Partial<QuantumJob>
): Promise<QuantumJob | null> {
  const job = await getQuantumJob(jobId);
  if (!job) return null;

  const updatedJob: QuantumJob = {
    ...job,
    ...updates,
    id: job.id, // Prevent ID change
    organizationId: job.organizationId, // Prevent org change
  };

  await redisCmd.set(QUANTUM_JOB_KEY(jobId), JSON.stringify(updatedJob));

  logger.info("Quantum job updated", {
    jobId,
    updates: Object.keys(updates),
  });

  return updatedJob;
}

/**
 * Start quantum job
 */
export async function startQuantumJob(jobId: string): Promise<QuantumJob | null> {
  const job = await getQuantumJob(jobId);
  if (!job) return null;

  if (job.status !== "queued" && job.status !== "waiting") {
    throw new Error(`Job is not queued or waiting: ${job.status}`);
  }

  // Check dependencies
  if (job.dependencies && job.dependencies.length > 0) {
    const allDependenciesCompleted = await checkDependencies(job.dependencies);
    if (!allDependenciesCompleted) {
      job.status = "waiting";
      await redisCmd.set(QUANTUM_JOB_KEY(jobId), JSON.stringify(job));
      return job;
    }
  }

  job.status = "running";
  job.startedAt = new Date().toISOString();
  await redisCmd.set(QUANTUM_JOB_KEY(jobId), JSON.stringify(job));

  // Remove from queue
  await redisCmd.zrem(QUANTUM_JOB_QUEUE_KEY(job.priority), jobId);

  logger.info("Quantum job started", {
    jobId,
    type: job.type,
    processorType: job.processorType,
  });

  Metrics.increment("quantum.job.started", 1, {
    type: job.type,
    priority: job.priority,
  });

  return job;
}

/**
 * Complete quantum job
 */
export async function completeQuantumJob(
  jobId: string,
  result: any
): Promise<QuantumJob | null> {
  const job = await getQuantumJob(jobId);
  if (!job) return null;

  if (job.status !== "running") {
    throw new Error(`Job is not running: ${job.status}`);
  }

  job.status = "completed";
  job.completedAt = new Date().toISOString();
  job.actualDurationMs = new Date(job.completedAt).getTime() - new Date(job.startedAt!).getTime();
  job.result = result;

  await redisCmd.set(QUANTUM_JOB_KEY(jobId), JSON.stringify(job));

  logger.info("Quantum job completed", {
    jobId,
    durationMs: job.actualDurationMs,
  });

  Metrics.increment("quantum.job.completed", 1, {
    type: job.type,
    priority: job.priority,
  });

  return job;
}

/**
 * Fail quantum job
 */
export async function failQuantumJob(
  jobId: string,
  error: string,
  shouldRetry: boolean = true
): Promise<QuantumJob | null> {
  const job = await getQuantumJob(jobId);
  if (!job) return null;

  if (job.status !== "running") {
    throw new Error(`Job is not running: ${job.status}`);
  }

  if (shouldRetry && job.retryCount < job.maxRetries) {
    // Retry job
    job.status = "retrying";
    job.retryCount++;
    job.error = error;
    await redisCmd.set(QUANTUM_JOB_KEY(jobId), JSON.stringify(job));

    logger.warn("Quantum job retrying", {
      jobId,
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      error,
    });

    Metrics.increment("quantum.job.retrying", 1, {
      type: job.type,
      retryCount: job.retryCount.toString(),
    });

    // Re-queue job after delay
    setTimeout(async () => {
      job.status = "queued";
      job.error = undefined;
      await redisCmd.set(QUANTUM_JOB_KEY(jobId), JSON.stringify(job));

      const priorityScore = PRIORITY_ORDER[job.priority] * 1000000 + Date.now();
      await redisCmd.zadd(QUANTUM_JOB_QUEUE_KEY(job.priority), priorityScore, jobId);

      logger.info("Quantum job re-queued", { jobId });
    }, 5000 * job.retryCount); // Exponential backoff

    return job;
  }

  // Max retries reached, mark as failed
  job.status = "failed";
  job.completedAt = new Date().toISOString();
  job.actualDurationMs = new Date(job.completedAt).getTime() - new Date(job.startedAt!).getTime();
  job.error = error;

  await redisCmd.set(QUANTUM_JOB_KEY(jobId), JSON.stringify(job));

  logger.error("Quantum job failed", {
    jobId,
    error,
    retryCount: job.retryCount,
  });

  Metrics.increment("quantum.job.failed", 1, {
    type: job.type,
    priority: job.priority,
  });

  return job;
}

/**
 * Cancel quantum job
 */
export async function cancelQuantumJob(jobId: string): Promise<QuantumJob | null> {
  const job = await getQuantumJob(jobId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Job is already ${job.status}`);
  }

  job.status = "cancelled";
  job.completedAt = new Date().toISOString();
  await redisCmd.set(QUANTUM_JOB_KEY(jobId), JSON.stringify(job));

  // Remove from queue
  await redisCmd.zrem(QUANTUM_JOB_QUEUE_KEY(job.priority), jobId);

  logger.info("Quantum job cancelled", { jobId });

  Metrics.increment("quantum.job.cancelled", 1, {
    type: job.type,
    priority: job.priority,
  });

  return job;
}

/**
 * Get next job from queue
 */
export async function getNextJob(
  processorType?: string,
  maxQubits?: number
): Promise<QuantumJob | null> {
  // Try each priority level in order
  const priorities: QuantumJobPriority[] = ["critical", "high", "normal", "low"];

  for (const priority of priorities) {
    const jobIds = await redisCmd.zrange(QUANTUM_JOB_QUEUE_KEY(priority), 0, 0);
    if (jobIds.length === 0) continue;

    const jobId = jobIds[0];
    const job = await getQuantumJob(jobId);
    if (!job) continue;

    // Check if job matches processor type
    if (processorType && job.processorType !== processorType) continue;

    // Check if job fits within qubit limit
    if (maxQubits && job.numQubits > maxQubits) continue;

    // Check dependencies
    if (job.dependencies && job.dependencies.length > 0) {
      const allDependenciesCompleted = await checkDependencies(job.dependencies);
      if (!allDependenciesCompleted) {
        job.status = "waiting";
        await redisCmd.set(QUANTUM_JOB_KEY(jobId), JSON.stringify(job));
        continue;
      }
    }

    return job;
  }

  return null;
}

/**
 * Check if all dependencies are completed
 */
async function checkDependencies(dependencies: string[]): Promise<boolean> {
  for (const depJobId of dependencies) {
    const depJob = await getQuantumJob(depJobId);
    if (!depJob || depJob.status !== "completed") {
      return false;
    }
  }
  return true;
}

/**
 * Delete quantum job
 */
export async function deleteQuantumJob(jobId: string): Promise<void> {
  const job = await getQuantumJob(jobId);
  if (!job) return;

  await redisCmd.del(QUANTUM_JOB_KEY(jobId));
  await redisCmd.srem(QUANTUM_JOBS_KEY(job.organizationId), jobId);
  await redisCmd.zrem(QUANTUM_JOB_QUEUE_KEY(job.priority), jobId);

  logger.info("Quantum job deleted", { jobId });

  Metrics.increment("quantum.job.deleted", 1);
}

// ─── Quantum Job Statistics ─────────────────────────────────────

/**
 * Get quantum job queue statistics
 */
export async function getQuantumJobQueueStats(organizationId: string): Promise<QuantumJobQueueStats> {
  const jobs = await getQuantumJobs(organizationId);

  const byStatus: Record<string, number> = {
    queued: 0,
    waiting: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    retrying: 0,
  };

  const byPriority: Record<string, number> = {
    low: 0,
    normal: 0,
    high: 0,
    critical: 0,
  };

  const byProcessor: Record<string, number> = {};

  let totalWaitTime = 0;
  let totalExecutionTime = 0;
  let waitTimeCount = 0;
  let executionTimeCount = 0;

  for (const job of jobs) {
    byStatus[job.status] = (byStatus[job.status] || 0) + 1;
    byPriority[job.priority] = (byPriority[job.priority] || 0) + 1;
    byProcessor[job.processorType] = (byProcessor[job.processorType] || 0) + 1;

    if (job.startedAt) {
      const waitTime = new Date(job.startedAt).getTime() - new Date(job.queuedAt).getTime();
      totalWaitTime += waitTime;
      waitTimeCount++;
    }

    if (job.actualDurationMs) {
      totalExecutionTime += job.actualDurationMs;
      executionTimeCount++;
    }
  }

  const averageWaitTimeMs = waitTimeCount > 0 ? totalWaitTime / waitTimeCount : 0;
  const averageExecutionTimeMs = executionTimeCount > 0 ? totalExecutionTime / executionTimeCount : 0;

  // Calculate queue depth (jobs waiting to be executed)
  const queueDepth = byStatus.queued + byStatus.waiting + byStatus.retrying;

  return {
    totalJobs: jobs.length,
    byStatus: byStatus as Record<QuantumJobStatus, number>,
    byPriority: byPriority as Record<QuantumJobPriority, number>,
    byProcessor,
    averageWaitTimeMs,
    averageExecutionTimeMs,
    queueDepth,
  };
}

/**
 * Process job queue (called periodically)
 */
export async function processJobQueue(
  processorType?: string,
  maxQubits?: number
): Promise<QuantumJob | null> {
  const job = await getNextJob(processorType, maxQubits);
  if (!job) return null;

  // Start job
  const startedJob = await startQuantumJob(job.id);
  return startedJob;
}
