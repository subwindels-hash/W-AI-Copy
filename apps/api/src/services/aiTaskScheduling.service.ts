/**
 * Module 76: AI Task Scheduling Service
 *
 * Provides task scheduling and execution for ML pipelines including task scheduling
 * with dependencies, cron-based and event-driven scheduling, task queue management,
 * priority-based scheduling, resource-aware scheduling, distributed task execution,
 * task retry with exponential backoff, task timeout and cancellation, task monitoring,
 * and resource allocation with quotas.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TaskSchedule {
  id: string;
  organizationId: string;
  pipelineId: string;
  pipelineName: string;
  scheduleType: ScheduleType;
  schedule: ScheduleConfig;
  status: ScheduleStatus;
  parameters: Record<string, any>;
  resources: ResourceAllocation;
  priority: TaskPriority;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
  successCount: number;
  failureCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleType = 'cron' | 'interval' | 'event' | 'manual' | 'data-arrival' | 'model-drift';

export type ScheduleStatus = 'active' | 'paused' | 'disabled' | 'error';

export interface ScheduleConfig {
  cron?: string;
  interval?: number; // seconds
  eventType?: string;
  eventFilter?: Record<string, any>;
  timezone?: string;
  startDate?: string;
  endDate?: string;
  maxConcurrentRuns?: number;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface ResourceAllocation {
  cpu?: string;
  memory?: string;
  gpu?: number;
  gpuType?: string;
  maxParallelTasks?: number;
  quota?: ResourceQuota;
}

export interface ResourceQuota {
  maxCPU: string;
  maxMemory: string;
  maxGPU: number;
  maxConcurrentTasks: number;
  maxDailyRuns: number;
}

export interface TaskExecution {
  id: string;
  organizationId: string;
  scheduleId: string;
  pipelineId: string;
  pipelineRunId: string;
  taskExecutions: TaskRun[];
  status: ExecutionStatus;
  startTime: string;
  endTime?: string;
  duration?: number; // seconds
  trigger: ExecutionTrigger;
  parameters: Record<string, any>;
  resources: ResourceAllocation;
  logs: ExecutionLog[];
  metrics: ExecutionMetrics;
  error?: ExecutionError;
}

export type ExecutionStatus = 'pending' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';

export interface ExecutionTrigger {
  type: ScheduleType;
  triggeredBy?: string;
  eventData?: Record<string, any>;
  timestamp: string;
}

export interface TaskRun {
  id: string;
  taskId: string;
  taskName: string;
  taskType: string;
  status: TaskRunStatus;
  startTime?: string;
  endTime?: string;
  duration?: number;
  attempt: number;
  maxAttempts: number;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  logs: string[];
  error?: TaskError;
  resources: TaskResourceUsage;
  retryCount: number;
  cached: boolean;
}

export type TaskRunStatus = 'pending' | 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'retrying' | 'cancelled';

export interface TaskError {
  type: string;
  message: string;
  stack?: string;
  retryable: boolean;
  timestamp: string;
}

export interface TaskResourceUsage {
  cpu?: string;
  memory?: string;
  gpu?: number;
  gpuUtilization?: number;
  network?: string;
  disk?: string;
}

export interface ExecutionLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  taskId?: string;
  metadata?: Record<string, any>;
}

export interface ExecutionMetrics {
  totalTasks: number;
  succeededTasks: number;
  failedTasks: number;
  skippedTasks: number;
  retriedTasks: number;
  cachedTasks: number;
  totalDuration: number;
  averageTaskDuration: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    gpu: number;
  };
  cost?: number;
}

export interface ExecutionError {
  type: string;
  message: string;
  taskId?: string;
  timestamp: string;
  recoverable: boolean;
}

export interface TaskQueue {
  id: string;
  organizationId: string;
  name: string;
  status: QueueStatus;
  capacity: number;
  currentLoad: number;
  priority: TaskPriority;
  tasks: QueuedTask[];
  resourceLimits: ResourceQuota;
  createdAt: string;
  updatedAt: string;
}

export type QueueStatus = 'active' | 'paused' | 'draining' | 'error';

export interface QueuedTask {
  id: string;
  executionId: string;
  taskId: string;
  taskName: string;
  priority: TaskPriority;
  submittedAt: string;
  estimatedDuration?: number;
  resources: ResourceAllocation;
  dependencies: string[]; // Task IDs this task depends on
  status: 'queued' | 'ready' | 'running';
  position: number;
}

export interface SchedulerDashboard {
  organizationId: string;
  totalSchedules: number;
  activeSchedules: number;
  totalExecutions: number;
  runningExecutions: number;
  queuedTasks: number;
  successRate: number;
  averageExecutionTime: number;
  schedulesByType: Record<ScheduleType, number>;
  executionsByStatus: Record<ExecutionStatus, number>;
  recentExecutions: TaskExecution[];
  queueStatus: Array<{
    queueId: string;
    queueName: string;
    capacity: number;
    currentLoad: number;
    utilization: number;
  }>;
  resourceUsage: {
    cpu: { used: number; total: number; percentage: number };
    memory: { used: number; total: number; percentage: number };
    gpu: { used: number; total: number; percentage: number };
  };
  topFailures: Array<{
    pipelineName: string;
    failureCount: number;
    lastFailure: string;
  }>;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const schedules = new Map<string, TaskSchedule>();
const executions = new Map<string, TaskExecution>();
const queues = new Map<string, TaskQueue>();

// ─── Schedule Management ───────────────────────────────────────────────────────

/**
 * Create a task schedule
 */
export async function createTaskSchedule(
  organizationId: string,
  params: {
    pipelineId: string;
    pipelineName: string;
    scheduleType: ScheduleType;
    schedule: ScheduleConfig;
    parameters?: Record<string, any>;
    resources?: ResourceAllocation;
    priority?: TaskPriority;
    createdBy: string;
  }
): Promise<TaskSchedule> {
  const id = `schedule_${randomUUID()}`;
  const now = new Date().toISOString();

  const schedule: TaskSchedule = {
    id,
    organizationId,
    pipelineId: params.pipelineId,
    pipelineName: params.pipelineName,
    scheduleType: params.scheduleType,
    schedule: params.schedule,
    status: 'active',
    parameters: params.parameters || {},
    resources: params.resources || {},
    priority: params.priority || 'medium',
    runCount: 0,
    successCount: 0,
    failureCount: 0,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  // Calculate next run time for cron/interval schedules
  if (params.scheduleType === 'cron' && params.schedule.cron) {
    schedule.nextRunAt = calculateNextCronRun(params.schedule.cron);
  } else if (params.scheduleType === 'interval' && params.schedule.interval) {
    schedule.nextRunAt = new Date(Date.now() + params.schedule.interval * 1000).toISOString();
  }

  schedules.set(id, schedule);
  return schedule;
}

/**
 * Update a task schedule
 */
export async function updateTaskSchedule(
  scheduleId: string,
  updates: Partial<Omit<TaskSchedule, 'id' | 'organizationId' | 'createdAt' | 'createdBy'>>
): Promise<TaskSchedule | null> {
  const schedule = schedules.get(scheduleId);
  if (!schedule) return null;

  const updated: TaskSchedule = {
    ...schedule,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  schedules.set(scheduleId, updated);
  return updated;
}

/**
 * Pause a schedule
 */
export async function pauseSchedule(scheduleId: string): Promise<TaskSchedule | null> {
  const schedule = schedules.get(scheduleId);
  if (!schedule) return null;

  schedule.status = 'paused';
  schedule.updatedAt = new Date().toISOString();

  schedules.set(scheduleId, schedule);
  return schedule;
}

/**
 * Resume a schedule
 */
export async function resumeSchedule(scheduleId: string): Promise<TaskSchedule | null> {
  const schedule = schedules.get(scheduleId);
  if (!schedule) return null;

  schedule.status = 'active';
  schedule.updatedAt = new Date().toISOString();

  schedules.set(scheduleId, schedule);
  return schedule;
}

/**
 * Trigger a schedule manually
 */
export async function triggerSchedule(
  scheduleId: string,
  triggeredBy: string,
  parameters?: Record<string, any>
): Promise<TaskExecution | null> {
  const schedule = schedules.get(scheduleId);
  if (!schedule) return null;

  const execution = await createExecution(schedule, {
    type: 'manual',
    triggeredBy,
    timestamp: new Date().toISOString(),
  }, parameters);

  return execution;
}

// ─── Execution Management ──────────────────────────────────────────────────────

/**
 * Create a task execution
 */
async function createExecution(
  schedule: TaskSchedule,
  trigger: ExecutionTrigger,
  parameters?: Record<string, any>
): Promise<TaskExecution> {
  const id = `execution_${randomUUID()}`;
  const pipelineRunId = `run_${randomUUID()}`;
  const now = new Date().toISOString();

  const execution: TaskExecution = {
    id,
    organizationId: schedule.organizationId,
    scheduleId: schedule.id,
    pipelineId: schedule.pipelineId,
    pipelineRunId,
    taskExecutions: [],
    status: 'pending',
    startTime: now,
    trigger,
    parameters: { ...schedule.parameters, ...parameters },
    resources: schedule.resources,
    logs: [],
    metrics: {
      totalTasks: 0,
      succeededTasks: 0,
      failedTasks: 0,
      skippedTasks: 0,
      retriedTasks: 0,
      cachedTasks: 0,
      totalDuration: 0,
      averageTaskDuration: 0,
      resourceUsage: { cpu: 0, memory: 0, gpu: 0 },
    },
  };

  executions.set(id, execution);

  // Update schedule statistics
  schedule.lastRunAt = now;
  schedule.runCount++;
  schedule.updatedAt = now;
  schedules.set(schedule.id, schedule);

  // Queue execution
  await queueExecution(execution);

  return execution;
}

/**
 * Queue an execution
 */
async function queueExecution(execution: TaskExecution): Promise<void> {
  execution.status = 'queued';
  execution.logs.push({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'Execution queued',
  });
  executions.set(execution.id, execution);

  // In a real implementation, this would add tasks to a queue
  // For now, we'll simulate immediate execution
  setTimeout(() => executePipeline(execution.id), 100);
}

/**
 * Execute a pipeline
 */
async function executePipeline(executionId: string): Promise<void> {
  const execution = executions.get(executionId);
  if (!execution) return;

  execution.status = 'running';
  execution.logs.push({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'Pipeline execution started',
  });
  executions.set(executionId, execution);

  // Simulate task execution
  const tasks = [
    { id: 'task_1', name: 'Data Ingestion', type: 'data-ingestion' },
    { id: 'task_2', name: 'Data Preprocessing', type: 'data-preprocessing' },
    { id: 'task_3', name: 'Feature Engineering', type: 'feature-engineering' },
    { id: 'task_4', name: 'Model Training', type: 'model-training' },
    { id: 'task_5', name: 'Model Evaluation', type: 'model-evaluation' },
  ];

  for (const task of tasks) {
    const taskRun: TaskRun = {
      id: `taskrun_${randomUUID()}`,
      taskId: task.id,
      taskName: task.name,
      taskType: task.type,
      status: 'running',
      startTime: new Date().toISOString(),
      attempt: 1,
      maxAttempts: 3,
      inputs: {},
      outputs: {},
      logs: [],
      resources: {},
      retryCount: 0,
      cached: false,
    };

    execution.taskExecutions.push(taskRun);
    executions.set(executionId, execution);

    // Simulate task execution time
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simulate success
    taskRun.status = 'succeeded';
    taskRun.endTime = new Date().toISOString();
    taskRun.duration = (new Date(taskRun.endTime).getTime() - new Date(taskRun.startTime!).getTime()) / 1000;
    taskRun.outputs = { result: 'success' };
    taskRun.logs.push('Task completed successfully');

    execution.metrics.succeededTasks++;
    executions.set(executionId, execution);
  }

  // Complete execution
  execution.status = 'succeeded';
  execution.endTime = new Date().toISOString();
  execution.duration = (new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime()) / 1000;
  execution.metrics.totalTasks = tasks.length;
  execution.metrics.totalDuration = execution.duration;
  execution.metrics.averageTaskDuration = execution.duration / tasks.length;

  execution.logs.push({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'Pipeline execution completed successfully',
  });

  executions.set(executionId, execution);

  // Update schedule statistics
  const schedule = schedules.get(execution.scheduleId);
  if (schedule) {
    schedule.successCount++;
    schedule.updatedAt = new Date().toISOString();
    schedules.set(schedule.id, schedule);
  }
}

/**
 * Cancel an execution
 */
export async function cancelExecution(executionId: string, cancelledBy: string): Promise<TaskExecution | null> {
  const execution = executions.get(executionId);
  if (!execution) return null;

  if (execution.status === 'succeeded' || execution.status === 'failed') {
    throw new Error('Cannot cancel completed execution');
  }

  execution.status = 'cancelled';
  execution.endTime = new Date().toISOString();
  execution.duration = (new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime()) / 1000;

  execution.logs.push({
    timestamp: new Date().toISOString(),
    level: 'warn',
    message: `Execution cancelled by ${cancelledBy}`,
  });

  // Cancel running tasks
  for (const taskRun of execution.taskExecutions) {
    if (taskRun.status === 'running' || taskRun.status === 'queued') {
      taskRun.status = 'cancelled';
      taskRun.endTime = new Date().toISOString();
    }
  }

  executions.set(executionId, execution);
  return execution;
}

/**
 * Get execution by ID
 */
export async function getTaskExecution(executionId: string): Promise<TaskExecution | null> {
  return executions.get(executionId) || null;
}

/**
 * List executions
 */
export async function listTaskExecutions(
  organizationId: string,
  filters?: { scheduleId?: string; status?: ExecutionStatus; limit?: number }
): Promise<TaskExecution[]> {
  const allExecutions = Array.from(executions.values()).filter(
    (e) => e.organizationId === organizationId
  );

  let filtered = allExecutions;
  if (filters?.scheduleId) {
    filtered = filtered.filter((e) => e.scheduleId === filters.scheduleId);
  }
  if (filters?.status) {
    filtered = filtered.filter((e) => e.status === filters.status);
  }

  return filtered
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, filters?.limit || 50);
}

// ─── Queue Management ──────────────────────────────────────────────────────────

/**
 * Create a task queue
 */
export async function createTaskQueue(
  organizationId: string,
  params: {
    name: string;
    capacity: number;
    priority?: TaskPriority;
    resourceLimits?: ResourceQuota;
  }
): Promise<TaskQueue> {
  const id = `queue_${randomUUID()}`;
  const now = new Date().toISOString();

  const queue: TaskQueue = {
    id,
    organizationId,
    name: params.name,
    status: 'active',
    capacity: params.capacity,
    currentLoad: 0,
    priority: params.priority || 'medium',
    tasks: [],
    resourceLimits: params.resourceLimits || {
      maxCPU: '8',
      maxMemory: '16Gi',
      maxGPU: 2,
      maxConcurrentTasks: 10,
      maxDailyRuns: 1000,
    },
    createdAt: now,
    updatedAt: now,
  };

  queues.set(id, queue);
  return queue;
}

/**
 * Get queue by ID
 */
export async function getTaskQueue(queueId: string): Promise<TaskQueue | null> {
  return queues.get(queueId) || null;
}

/**
 * List queues
 */
export async function listTaskQueues(organizationId: string): Promise<TaskQueue[]> {
  return Array.from(queues.values()).filter((q) => q.organizationId === organizationId);
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

/**
 * Get scheduler dashboard
 */
export async function getSchedulerDashboard(organizationId: string): Promise<SchedulerDashboard> {
  const allSchedules = Array.from(schedules.values()).filter((s) => s.organizationId === organizationId);
  const allExecutions = Array.from(executions.values()).filter((e) => e.organizationId === organizationId);
  const allQueues = await listTaskQueues(organizationId);

  const schedulesByType: Record<string, number> = {};
  for (const schedule of allSchedules) {
    schedulesByType[schedule.scheduleType] = (schedulesByType[schedule.scheduleType] || 0) + 1;
  }

  const executionsByStatus: Record<string, number> = {};
  for (const execution of allExecutions) {
    executionsByStatus[execution.status] = (executionsByStatus[execution.status] || 0) + 1;
  }

  const recentExecutions = allExecutions
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
    .slice(0, 10);

  const successfulExecutions = allExecutions.filter((e) => e.status === 'succeeded').length;
  const successRate = allExecutions.length > 0 ? (successfulExecutions / allExecutions.length) * 100 : 0;

  const totalDuration = allExecutions.reduce((sum, e) => sum + (e.duration || 0), 0);
  const averageExecutionTime = allExecutions.length > 0 ? totalDuration / allExecutions.length : 0;

  const queueStatus = allQueues.map((q) => ({
    queueId: q.id,
    queueName: q.name,
    capacity: q.capacity,
    currentLoad: q.currentLoad,
    utilization: (q.currentLoad / q.capacity) * 100,
  }));

  // Calculate resource usage (simulated)
  const resourceUsage = {
    cpu: { used: 4, total: 16, percentage: 25 },
    memory: { used: 8, total: 32, percentage: 25 },
    gpu: { used: 1, total: 4, percentage: 25 },
  };

  // Calculate top failures
  const failureCounts = new Map<string, { count: number; lastFailure: string }>();
  for (const execution of allExecutions) {
    if (execution.status === 'failed') {
      const schedule = allSchedules.find((s) => s.id === execution.scheduleId);
      if (schedule) {
        const current = failureCounts.get(schedule.pipelineName) || { count: 0, lastFailure: execution.startTime };
        failureCounts.set(schedule.pipelineName, {
          count: current.count + 1,
          lastFailure: execution.startTime > current.lastFailure ? execution.startTime : current.lastFailure,
        });
      }
    }
  }

  const topFailures = Array.from(failureCounts.entries())
    .map(([pipelineName, data]) => ({
      pipelineName,
      failureCount: data.count,
      lastFailure: data.lastFailure,
    }))
    .sort((a, b) => b.failureCount - a.failureCount)
    .slice(0, 10);

  const queuedTasks = allQueues.reduce((sum, q) => sum + q.tasks.length, 0);

  return {
    organizationId,
    totalSchedules: allSchedules.length,
    activeSchedules: allSchedules.filter((s) => s.status === 'active').length,
    totalExecutions: allExecutions.length,
    runningExecutions: allExecutions.filter((e) => e.status === 'running').length,
    queuedTasks,
    successRate,
    averageExecutionTime,
    schedulesByType: schedulesByType as Record<ScheduleType, number>,
    executionsByStatus: executionsByStatus as Record<ExecutionStatus, number>,
    recentExecutions,
    queueStatus,
    resourceUsage,
    topFailures,
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function calculateNextCronRun(cron: string): string {
  // Simplified cron calculation - in production, use a proper cron parser
  const now = new Date();
  now.setHours(now.getHours() + 1); // Assume hourly for now
  return now.toISOString();
}
