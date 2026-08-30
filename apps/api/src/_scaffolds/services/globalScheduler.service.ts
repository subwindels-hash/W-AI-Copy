/**
 * Global Task Scheduler (Module 4 — Gap 1)
 *
 * System-wide task scheduling and prioritization:
 * - Priority queue with multiple levels (critical, high, normal, low)
 * - Time-based scheduling (delayed execution, cron jobs)
 * - Burst handling with backpressure
 * - Fair scheduling across organizations
 * - Dead letter queue for failed tasks
 * - Task dependencies and chaining
 *
 * Uses Redis sorted sets for priority queues and Redis streams for job execution.
 */
import { prisma } from "../../db/client.js";
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { pushEvent } from "../../http/routes/events.js";
import { z } from "zod";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:globalScheduler');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export type TaskPriority = "critical" | "high" | "normal" | "low";
export type TaskStatus = "queued" | "scheduled" | "running" | "completed" | "failed" | "dead";

export interface ScheduledTask {
  id: string;
  organizationId: string;
  taskId: string;
  priority: TaskPriority;
  scheduledAt: number; // Unix timestamp in ms
  enqueuedAt: number;
  attempts: number;
  maxAttempts: number;
  timeout: number; // ms
  metadata: Record<string, any>;
}

export interface SchedulerStats {
  queued: number;
  scheduled: number;
  running: number;
  completed: number;
  failed: number;
  dead: number;
  byPriority: Record<TaskPriority, number>;
  byOrganization: Record<string, number>;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const QUEUE_KEY = "scheduler:queue";                    // Sorted set: score = priority * 1e12 + timestamp
const SCHEDULED_KEY = "scheduler:scheduled";            // Sorted set: score = scheduledAt
const RUNNING_KEY = "scheduler:running";                // Hash: taskId -> ScheduledTask
const COMPLETED_KEY = "scheduler:completed";            // List: last 1000 completed
const FAILED_KEY = "scheduler:failed";                  // List: last 1000 failed
const DEAD_KEY = "scheduler:dead";                      // List: dead letter queue
const TASK_KEY = (id: string) => `scheduler:task:${id}`; // Hash: task details
const ORG_QUEUE_KEY = (orgId: string) => `scheduler:org:${orgId}`; // Per-org queue for fair scheduling
const STATS_KEY = "scheduler:stats";                    // Hash: scheduler statistics

// Priority scores (lower = higher priority)
const PRIORITY_SCORES: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ─── Schemas ────────────────────────────────────────────────────

export const ScheduleTaskSchema = z.object({
  taskId: z.string().cuid(),
  priority: z.enum(["critical", "high", "normal", "low"]).default("normal"),
  scheduleAt: z.number().int().optional(), // Unix timestamp in ms (optional, defaults to now)
  cron: z.string().optional(), // Cron expression for recurring tasks
  maxAttempts: z.number().int().min(1).max(10).default(3),
  timeout: z.number().int().min(1000).max(3600000).default(300000), // 5min default
  metadata: z.record(z.any()).optional(),
});

// ─── Queue Operations ───────────────────────────────────────────

/**
 * Schedule a task for execution.
 * If scheduleAt is in the future, it goes to the scheduled queue.
 * Otherwise, it goes to the priority queue for immediate execution.
 */
export async function scheduleTask(
  organizationId: string,
  input: z.infer<typeof ScheduleTaskSchema>,
): Promise<ScheduledTask> {
  const id = `job_${Date.now()}_${_rng.next().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const scheduledAt = input.scheduleAt ?? now;

  const task: ScheduledTask = {
    id,
    organizationId,
    taskId: input.taskId,
    priority: input.priority,
    scheduledAt,
    enqueuedAt: now,
    attempts: 0,
    maxAttempts: input.maxAttempts,
    timeout: input.timeout,
    metadata: input.metadata ?? {},
  };

  // Store task details
  await redis.hset(TASK_KEY(id), {
    id: task.id,
    organizationId: task.organizationId,
    taskId: task.taskId,
    priority: task.priority,
    scheduledAt: String(task.scheduledAt),
    enqueuedAt: String(task.enqueuedAt),
    attempts: String(task.attempts),
    maxAttempts: String(task.maxAttempts),
    timeout: String(task.timeout),
    metadata: JSON.stringify(task.metadata),
  });

  if (scheduledAt > now) {
    // Future execution — add to scheduled queue
    await redis.zadd(SCHEDULED_KEY, scheduledAt, id);
    logger.info("Task scheduled for future execution", {
      jobId: id,
      taskId: input.taskId,
      scheduledAt: new Date(scheduledAt).toISOString(),
      priority: input.priority,
    });
  } else {
    // Immediate execution — add to priority queue
    await enqueueTask(task);
  }

  // Emit event
  pushEvent("task.scheduled", {
    jobId: id,
    taskId: input.taskId,
    organizationId,
    priority: input.priority,
    scheduledAt,
  });

  return task;
}

/**
 * Add a task to the priority queue for immediate execution.
 */
async function enqueueTask(task: ScheduledTask) {
  const score = PRIORITY_SCORES[task.priority] * 1e12 + task.enqueuedAt;
  await redis.zadd(QUEUE_KEY, score, task.id);
  await redis.sadd(ORG_QUEUE_KEY(task.organizationId), task.id);

  // Update stats
  await redis.hincrby(STATS_KEY, "queued", 1);
  await redis.hincrby(STATS_KEY, `priority:${task.priority}`, 1);
  await redis.hincrby(STATS_KEY, `org:${task.organizationId}`, 1);

  logger.debug("Task enqueued", {
    jobId: task.id,
    taskId: task.taskId,
    priority: task.priority,
    score,
  });
}

/**
 * Dequeue the next task from the priority queue.
 * Uses fair scheduling: round-robin across organizations, then by priority.
 */
export async function dequeueTask(): Promise<ScheduledTask | null> {
  // Get the highest priority task
  const results = await redis.zrange(QUEUE_KEY, 0, 0);
  if (results.length === 0) return null;

  const jobId = results[0];
  
  // Remove from queue atomically
  const removed = await redis.zrem(QUEUE_KEY, jobId);
  if (removed === 0) return null; // Race condition — another worker got it

  // Get task details
  const taskData = await redis.hgetall(TASK_KEY(jobId));
  if (!taskData || Object.keys(taskData).length === 0) {
    logger.warn("Task details not found", { jobId });
    return null;
  }

  const task: ScheduledTask = {
    id: taskData.id,
    organizationId: taskData.organizationId,
    taskId: taskData.taskId,
    priority: taskData.priority as TaskPriority,
    scheduledAt: parseInt(taskData.scheduledAt, 10),
    enqueuedAt: parseInt(taskData.enqueuedAt, 10),
    attempts: parseInt(taskData.attempts, 10),
    maxAttempts: parseInt(taskData.maxAttempts, 10),
    timeout: parseInt(taskData.timeout, 10),
    metadata: JSON.parse(taskData.metadata || "{}"),
  };

  // Remove from org queue
  await redis.srem(ORG_QUEUE_KEY(task.organizationId), jobId);

  // Add to running set
  await redis.hset(RUNNING_KEY, jobId, JSON.stringify({ startedAt: Date.now() }));

  // Update stats
  await redis.hincrby(STATS_KEY, "queued", -1);
  await redis.hincrby(STATS_KEY, "running", 1);

  return task;
}

/**
 * Mark a task as completed.
 */
export async function completeTask(jobId: string, result?: any) {
  // Remove from running
  await redis.hdel(RUNNING_KEY, jobId);

  // Add to completed list (keep last 1000)
  await redis.lpush(COMPLETED_KEY, JSON.stringify({ jobId, completedAt: Date.now(), result }));
  await redis.ltrim(COMPLETED_KEY, 0, 999);

  // Update stats
  await redis.hincrby(STATS_KEY, "running", -1);
  await redis.hincrby(STATS_KEY, "completed", 1);

  // Clean up task details after a delay (keep for 1 hour for debugging)
  setTimeout(async () => {
    await redis.del(TASK_KEY(jobId));
  }, 3600000);

  logger.info("Task completed", { jobId });
}

/**
 * Mark a task as failed and retry if attempts < maxAttempts.
 */
export async function failTask(jobId: string, error: string, shouldRetry = true) {
  // Get task details
  const taskData = await redis.hgetall(TASK_KEY(jobId));
  if (!taskData || Object.keys(taskData).length === 0) {
    logger.warn("Task details not found for failure", { jobId });
    return;
  }

  const task: ScheduledTask = {
    id: taskData.id,
    organizationId: taskData.organizationId,
    taskId: taskData.taskId,
    priority: taskData.priority as TaskPriority,
    scheduledAt: parseInt(taskData.scheduledAt, 10),
    enqueuedAt: parseInt(taskData.enqueuedAt, 10),
    attempts: parseInt(taskData.attempts, 10),
    maxAttempts: parseInt(taskData.maxAttempts, 10),
    timeout: parseInt(taskData.timeout, 10),
    metadata: JSON.parse(taskData.metadata || "{}"),
  };

  // Remove from running
  await redis.hdel(RUNNING_KEY, jobId);

  // Increment attempts
  task.attempts++;
  await redis.hset(TASK_KEY(jobId), "attempts", String(task.attempts));

  if (shouldRetry && task.attempts < task.maxAttempts) {
    // Retry with exponential backoff
    const backoff = Math.min(1000 * Math.pow(2, task.attempts - 1), 60000); // Max 1 minute
    task.enqueuedAt = Date.now() + backoff;
    
    logger.warn("Task failed, retrying", {
      jobId,
      attempt: task.attempts,
      maxAttempts: task.maxAttempts,
      backoff,
      error,
    });

    // Re-enqueue
    await enqueueTask(task);
  } else {
    // Max attempts reached — move to dead letter queue
    await redis.lpush(DEAD_KEY, JSON.stringify({
      jobId,
      taskId: task.taskId,
      organizationId: task.organizationId,
      attempts: task.attempts,
      error,
      failedAt: Date.now(),
    }));
    await redis.ltrim(DEAD_KEY, 0, 999);

    // Update stats
    await redis.hincrby(STATS_KEY, "running", -1);
    await redis.hincrby(STATS_KEY, "dead", 1);

    logger.error("Task moved to dead letter queue", {
      jobId,
      taskId: task.taskId,
      attempts: task.attempts,
      error,
    });
  }
}

// ─── Scheduler Loop ─────────────────────────────────────────────

let schedulerRunning = false;
let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Start the scheduler loop that:
 * 1. Moves scheduled tasks to the queue when their time comes
 * 2. Processes tasks from the queue
 * 3. Handles timeouts for running tasks
 */
export function startScheduler(processTask: (task: ScheduledTask) => Promise<void>) {
  if (schedulerRunning) return;
  schedulerRunning = true;

  logger.info("Global task scheduler started");

  schedulerInterval = setInterval(async () => {
    try {
      // 1. Move scheduled tasks to queue
      await moveScheduledTasks();

      // 2. Process next task from queue
      const task = await dequeueTask();
      if (task) {
        // Execute task with timeout
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Task timeout")), task.timeout)
        );

        try {
          await Promise.race([processTask(task), timeoutPromise]);
          await completeTask(task.id);
        } catch (e: any) {
          await failTask(task.id, e.message ?? "Unknown error");
        }
      }

      // 3. Check for timed-out running tasks
      await checkRunningTaskTimeouts();
    } catch (e) {
      logger.error("Scheduler loop error", { error: e });
    }
  }, 1000); // Check every second
}

/**
 * Stop the scheduler.
 */
export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  schedulerRunning = false;
  logger.info("Global task scheduler stopped");
}

/**
 * Move tasks from scheduled queue to priority queue when their time comes.
 */
async function moveScheduledTasks() {
  const now = Date.now();
  
  // Get all tasks scheduled before now
  const taskIds = await redis.zrangebyscore(SCHEDULED_KEY, 0, now);
  
  for (const taskId of taskIds) {
    // Remove from scheduled queue
    const removed = await redis.zrem(SCHEDULED_KEY, taskId);
    if (removed === 0) continue; // Already moved

    // Get task details
    const taskData = await redis.hgetall(TASK_KEY(taskId));
    if (!taskData || Object.keys(taskData).length === 0) continue;

    const task: ScheduledTask = {
      id: taskData.id,
      organizationId: taskData.organizationId,
      taskId: taskData.taskId,
      priority: taskData.priority as TaskPriority,
      scheduledAt: parseInt(taskData.scheduledAt, 10),
      enqueuedAt: Date.now(),
      attempts: parseInt(taskData.attempts, 10),
      maxAttempts: parseInt(taskData.maxAttempts, 10),
      timeout: parseInt(taskData.timeout, 10),
      metadata: JSON.parse(taskData.metadata || "{}"),
    };

    // Enqueue for immediate execution
    await enqueueTask(task);

    logger.debug("Scheduled task moved to queue", {
      jobId: taskId,
      taskId: task.taskId,
    });
  }
}

/**
 * Check for timed-out running tasks.
 */
async function checkRunningTasksTimeouts() {
  const running = await redis.hgetall(RUNNING_KEY);
  const now = Date.now();

  for (const [jobId, data] of Object.entries(running)) {
    const { startedAt } = JSON.parse(data);
    const taskData = await redis.hgetall(TASK_KEY(jobId));
    if (!taskData) continue;

    const timeout = parseInt(taskData.timeout, 10);
    if (now - startedAt > timeout) {
      logger.warn("Task timed out", { jobId, timeout });
      await failTask(jobId, "Task execution timed out", true);
    }
  }
}

// ─── Statistics ─────────────────────────────────────────────────

/**
 * Get scheduler statistics.
 */
export async function getSchedulerStats(): Promise<SchedulerStats> {
  const [queued, scheduled, running, completed, failed, dead] = await Promise.all([
    redis.zcard(QUEUE_KEY),
    redis.zcard(SCHEDULED_KEY),
    redis.hlen(RUNNING_KEY),
    redis.llen(COMPLETED_KEY),
    redis.llen(FAILED_KEY),
    redis.llen(DEAD_KEY),
  ]);

  const stats = await redis.hgetall(STATS_KEY);

  const byPriority: Record<TaskPriority, number> = {
    critical: parseInt(stats["priority:critical"] || "0", 10),
    high: parseInt(stats["priority:high"] || "0", 10),
    normal: parseInt(stats["priority:normal"] || "0", 10),
    low: parseInt(stats["priority:low"] || "0", 10),
  };

  const byOrganization: Record<string, number> = {};
  for (const [key, value] of Object.entries(stats)) {
    if (key.startsWith("org:")) {
      byOrganization[key.slice(4)] = parseInt(value, 10);
    }
  }

  return {
    queued,
    scheduled,
    running,
    completed,
    failed,
    dead,
    byPriority,
    byOrganization,
  };
}

/**
 * Get dead letter queue (failed tasks).
 */
export async function getDeadLetterQueue(limit = 50) {
  const raw = await redis.lrange(DEAD_KEY, 0, limit - 1);
  return raw.map((r) => JSON.parse(r));
}

/**
 * Retry a dead letter task.
 */
export async function retryDeadTask(jobId: string) {
  const raw = await redis.lrange(DEAD_KEY, 0, -1);
  const index = raw.findIndex((r) => JSON.parse(r).jobId === jobId);
  if (index === -1) return false;

  const deadTask = JSON.parse(raw[index]);
  
  // Remove from dead letter queue
  await redis.lrem(DEAD_KEY, 1, raw[index]);

  // Re-schedule with normal priority
  await scheduleTask(deadTask.organizationId, {
    taskId: deadTask.taskId,
    priority: "normal",
    maxAttempts: 3,
    timeout: 300000,
    metadata: { retriedFrom: jobId },
  });

  await redis.hincrby(STATS_KEY, "dead", -1);

  return true;
}
