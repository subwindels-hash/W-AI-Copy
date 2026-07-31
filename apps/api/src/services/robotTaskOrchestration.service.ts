/**
 * Module 35: Robot Task Orchestration Service
 *
 * Provides task scheduling, multi-robot coordination, mission planning,
 * workflow execution, and real-time task management for robotic fleets.
 *
 * Phase 1 — Critical Gap: Robotic task orchestration and coordination infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus = "pending" | "assigned" | "in-progress" | "completed" | "failed" | "cancelled";

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type MissionStatus = "planned" | "active" | "paused" | "completed" | "failed" | "cancelled";

export type ActionType =
  | "move-to" | "pick" | "place" | "inspect" | "charge" | "wait"
  | "scan" | "weld" | "assemble" | "deliver" | "patrol" | "custom";

export interface RobotTask {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  requiredCapabilities: string[];
  assignedRobotId?: string;
  missionId?: string;
  actions: TaskAction[];
  currentActionIndex: number;
  dependencies: string[]; // Task IDs this task depends on
  estimatedDurationMs: number;
  actualDurationMs?: number;
  startTime?: string;
  endTime?: string;
  deadline?: string;
  retryCount: number;
  maxRetries: number;
  result?: Record<string, unknown>;
  error?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAction {
  id: string;
  type: ActionType;
  parameters: Record<string, unknown>;
  status: "pending" | "in-progress" | "completed" | "failed";
  startTime?: string;
  endTime?: string;
  result?: Record<string, unknown>;
  error?: string;
}

export interface RobotMission {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: MissionStatus;
  tasks: string[]; // Task IDs
  assignedRobots: string[]; // Robot IDs
  waypoints: MissionWaypoint[];
  currentWaypointIndex: number;
  startTime?: string;
  endTime?: string;
  estimatedCompletionTime?: string;
  progress: number; // 0-100
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MissionWaypoint {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  orientation?: { roll: number; pitch: number; yaw: number };
  actions: TaskAction[];
  arrivalCondition?: string;
  dwellTimeMs?: number;
}

export interface RobotCapability {
  robotId: string;
  capabilities: string[];
  maxPayload?: number; // kg
  maxSpeed?: number; // m/s
  batteryCapacity?: number; // Wh
  currentBattery?: number; // %
  available: boolean;
  currentTaskId?: string;
}

export interface TaskAssignment {
  taskId: string;
  robotId: string;
  score: number; // 0-100, higher is better match
  reasons: string[];
  assignedAt: string;
}

export interface WorkflowDefinition {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  variables: Record<string, unknown>;
  triggers: WorkflowTrigger[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: "task" | "condition" | "parallel" | "wait" | "loop";
  taskTemplate?: Partial<RobotTask>;
  condition?: string;
  branches?: { true: string; false: string };
  parallelSteps?: string[];
  waitDurationMs?: number;
  loopCount?: number;
  nextStepId?: string;
}

export interface WorkflowTrigger {
  type: "schedule" | "event" | "manual" | "api";
  schedule?: string; // cron expression
  event?: string;
  conditions?: Record<string, unknown>;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  currentStepId: string;
  variables: Record<string, unknown>;
  startTime: string;
  endTime?: string;
  logs: WorkflowLog[];
}

export interface WorkflowLog {
  timestamp: string;
  stepId: string;
  level: "info" | "warning" | "error";
  message: string;
  data?: Record<string, unknown>;
}

export interface FleetStatus {
  totalRobots: number;
  availableRobots: number;
  busyRobots: number;
  offlineRobots: number;
  totalTasks: number;
  pendingTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  activeMissions: number;
  averageTaskCompletionTimeMs: number;
  taskSuccessRate: number; // 0-100
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const tasks = new Map<string, RobotTask>();
const missions = new Map<string, RobotMission>();
const robotCapabilities = new Map<string, RobotCapability>();
const workflows = new Map<string, WorkflowDefinition>();
const workflowExecutions = new Map<string, WorkflowExecution>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a robot task
 */
export async function createTask(params: {
  organizationId: string;
  name: string;
  description?: string;
  priority?: TaskPriority;
  requiredCapabilities: string[];
  actions: Omit<TaskAction, "id" | "status">[];
  dependencies?: string[];
  estimatedDurationMs?: number;
  deadline?: string;
  maxRetries?: number;
  missionId?: string;
  createdBy: string;
}): Promise<RobotTask> {
  const now = new Date().toISOString();
  const task: RobotTask = {
    id: `task_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    status: "pending",
    priority: params.priority ?? "medium",
    requiredCapabilities: params.requiredCapabilities,
    missionId: params.missionId,
    actions: params.actions.map(a => ({
      ...a,
      id: `action_${randomUUID().slice(0, 8)}`,
      status: "pending",
    })),
    currentActionIndex: 0,
    dependencies: params.dependencies ?? [],
    estimatedDurationMs: params.estimatedDurationMs ?? 60000,
    retryCount: 0,
    maxRetries: params.maxRetries ?? 3,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  tasks.set(task.id, task);
  return task;
}

/**
 * Get a task by ID
 */
export async function getTask(taskId: string): Promise<RobotTask | null> {
  return tasks.get(taskId) ?? null;
}

/**
 * List tasks with filters
 */
export async function listTasks(
  organizationId: string,
  filters?: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assignedRobotId?: string;
    missionId?: string;
    limit?: number;
  }
): Promise<RobotTask[]> {
  let result = Array.from(tasks.values()).filter(t => t.organizationId === organizationId);

  if (filters?.status) result = result.filter(t => t.status === filters.status);
  if (filters?.priority) result = result.filter(t => t.priority === filters.priority);
  if (filters?.assignedRobotId) result = result.filter(t => t.assignedRobotId === filters.assignedRobotId);
  if (filters?.missionId) result = result.filter(t => t.missionId === filters.missionId);

  return result
    .sort((a, b) => {
      // Sort by priority then creation time
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt.localeCompare(b.createdAt);
    })
    .slice(0, filters?.limit ?? 100);
}

/**
 * Assign task to robot
 */
export async function assignTask(taskId: string, robotId: string): Promise<RobotTask | null> {
  const task = tasks.get(taskId);
  if (!task) return null;

  const now = new Date().toISOString();
  task.assignedRobotId = robotId;
  task.status = "assigned";
  task.updatedAt = now;
  tasks.set(taskId, task);

  // Update robot capability
  const capability = robotCapabilities.get(robotId);
  if (capability) {
    capability.available = false;
    capability.currentTaskId = taskId;
    robotCapabilities.set(robotId, capability);
  }

  return task;
}

/**
 * Start task execution
 */
export async function startTask(taskId: string): Promise<RobotTask | null> {
  const task = tasks.get(taskId);
  if (!task || !task.assignedRobotId) return null;

  const now = new Date().toISOString();
  task.status = "in-progress";
  task.startTime = now;
  task.updatedAt = now;

  // Start first action
  if (task.actions.length > 0) {
    task.actions[0].status = "in-progress";
    task.actions[0].startTime = now;
  }

  tasks.set(taskId, task);
  return task;
}

/**
 * Complete current action and advance to next
 */
export async function completeAction(
  taskId: string,
  actionIndex: number,
  result?: Record<string, unknown>
): Promise<RobotTask | null> {
  const task = tasks.get(taskId);
  if (!task || actionIndex >= task.actions.length) return null;

  const now = new Date().toISOString();
  task.actions[actionIndex].status = "completed";
  task.actions[actionIndex].endTime = now;
  task.actions[actionIndex].result = result;

  // Advance to next action
  task.currentActionIndex = actionIndex + 1;

  // Check if all actions completed
  if (task.currentActionIndex >= task.actions.length) {
    task.status = "completed";
    task.endTime = now;
    task.actualDurationMs = new Date(now).getTime() - new Date(task.startTime!).getTime();
  } else {
    // Start next action
    task.actions[task.currentActionIndex].status = "in-progress";
    task.actions[task.currentActionIndex].startTime = now;
  }

  task.updatedAt = now;
  tasks.set(taskId, task);

  // If task completed, free up robot
  if (task.status === "completed" && task.assignedRobotId) {
    const capability = robotCapabilities.get(task.assignedRobotId);
    if (capability) {
      capability.available = true;
      capability.currentTaskId = undefined;
      robotCapabilities.set(task.assignedRobotId, capability);
    }
  }

  return task;
}

/**
 * Fail task
 */
export async function failTask(taskId: string, error: string): Promise<RobotTask | null> {
  const task = tasks.get(taskId);
  if (!task) return null;

  const now = new Date().toISOString();
  task.status = "failed";
  task.endTime = now;
  task.error = error;
  task.retryCount++;
  task.updatedAt = now;

  // Fail current action
  if (task.currentActionIndex < task.actions.length) {
    task.actions[task.currentActionIndex].status = "failed";
    task.actions[task.currentActionIndex].endTime = now;
    task.actions[task.currentActionIndex].error = error;
  }

  tasks.set(taskId, task);

  // Free up robot
  if (task.assignedRobotId) {
    const capability = robotCapabilities.get(task.assignedRobotId);
    if (capability) {
      capability.available = true;
      capability.currentTaskId = undefined;
      robotCapabilities.set(task.assignedRobotId, capability);
    }
  }

  return task;
}

/**
 * Cancel task
 */
export async function cancelTask(taskId: string): Promise<RobotTask | null> {
  const task = tasks.get(taskId);
  if (!task) return null;

  const now = new Date().toISOString();
  task.status = "cancelled";
  task.endTime = now;
  task.updatedAt = now;

  tasks.set(taskId, task);

  // Free up robot
  if (task.assignedRobotId) {
    const capability = robotCapabilities.get(task.assignedRobotId);
    if (capability) {
      capability.available = true;
      capability.currentTaskId = undefined;
      robotCapabilities.set(task.assignedRobotId, capability);
    }
  }

  return task;
}

/**
 * Auto-assign pending tasks to available robots
 */
export async function autoAssignTasks(organizationId: string): Promise<TaskAssignment[]> {
  const pendingTasks = await listTasks(organizationId, { status: "pending" });
  const assignments: TaskAssignment[] = [];

  for (const task of pendingTasks) {
    // Check dependencies
    const dependenciesMet = task.dependencies.every(depId => {
      const dep = tasks.get(depId);
      return dep?.status === "completed";
    });

    if (!dependenciesMet) continue;

    // Find best robot
    const bestRobot = findBestRobotForTask(task);
    if (bestRobot) {
      await assignTask(task.id, bestRobot.robotId);
      assignments.push(bestRobot);
    }
  }

  return assignments;
}

/**
 * Register robot capabilities
 */
export async function registerRobotCapability(capability: RobotCapability): Promise<RobotCapability> {
  robotCapabilities.set(capability.robotId, capability);
  return capability;
}

/**
 * Get robot capabilities
 */
export async function getRobotCapability(robotId: string): Promise<RobotCapability | null> {
  return robotCapabilities.get(robotId) ?? null;
}

/**
 * Create a robot mission
 */
export async function createMission(params: {
  organizationId: string;
  name: string;
  description?: string;
  tasks: string[];
  assignedRobots: string[];
  waypoints?: Omit<MissionWaypoint, "id">[];
  createdBy: string;
}): Promise<RobotMission> {
  const now = new Date().toISOString();
  const mission: RobotMission = {
    id: `mission_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    status: "planned",
    tasks: params.tasks,
    assignedRobots: params.assignedRobots,
    waypoints: (params.waypoints ?? []).map(w => ({
      ...w,
      id: `wp_${randomUUID().slice(0, 8)}`,
    })),
    currentWaypointIndex: 0,
    progress: 0,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  missions.set(mission.id, mission);

  // Link tasks to mission
  for (const taskId of params.tasks) {
    const task = tasks.get(taskId);
    if (task) {
      task.missionId = mission.id;
      tasks.set(taskId, task);
    }
  }

  return mission;
}

/**
 * Start mission
 */
export async function startMission(missionId: string): Promise<RobotMission | null> {
  const mission = missions.get(missionId);
  if (!mission) return null;

  const now = new Date().toISOString();
  mission.status = "active";
  mission.startTime = now;
  mission.updatedAt = now;
  missions.set(missionId, mission);

  return mission;
}

/**
 * Update mission progress
 */
export async function updateMissionProgress(missionId: string): Promise<RobotMission | null> {
  const mission = missions.get(missionId);
  if (!mission) return null;

  // Calculate progress based on completed tasks
  const missionTasks = mission.tasks.map(id => tasks.get(id)).filter(Boolean) as RobotTask[];
  const completedTasks = missionTasks.filter(t => t.status === "completed").length;
  mission.progress = Math.round((completedTasks / missionTasks.length) * 100);

  // Check if mission completed
  if (mission.progress === 100) {
    mission.status = "completed";
    mission.endTime = new Date().toISOString();
  }

  mission.updatedAt = new Date().toISOString();
  missions.set(missionId, mission);

  return mission;
}

/**
 * Create workflow definition
 */
export async function createWorkflow(params: {
  organizationId: string;
  name: string;
  description?: string;
  steps: Omit<WorkflowStep, "id">[];
  variables?: Record<string, unknown>;
  triggers?: WorkflowTrigger[];
  createdBy: string;
}): Promise<WorkflowDefinition> {
  const now = new Date().toISOString();
  const workflow: WorkflowDefinition = {
    id: `workflow_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description ?? "",
    steps: params.steps.map(s => ({
      ...s,
      id: `step_${randomUUID().slice(0, 8)}`,
    })),
    variables: params.variables ?? {},
    triggers: params.triggers ?? [],
    isActive: true,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  workflows.set(workflow.id, workflow);
  return workflow;
}

/**
 * Execute workflow
 */
export async function executeWorkflow(
  workflowId: string,
  initialVariables?: Record<string, unknown>
): Promise<WorkflowExecution | null> {
  const workflow = workflows.get(workflowId);
  if (!workflow || !workflow.isActive) return null;

  const execution: WorkflowExecution = {
    id: `exec_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    workflowId,
    status: "running",
    currentStepId: workflow.steps[0]?.id ?? "",
    variables: { ...workflow.variables, ...initialVariables },
    startTime: new Date().toISOString(),
    logs: [],
  };

  workflowExecutions.set(execution.id, execution);

  // Start execution (simplified - in production would be async)
  await executeWorkflowStep(execution, workflow);

  return execution;
}

/**
 * Get fleet status
 */
export async function getFleetStatus(organizationId: string): Promise<FleetStatus> {
  const allRobots = Array.from(robotCapabilities.values());
  const allTasks = Array.from(tasks.values()).filter(t => t.organizationId === organizationId);
  const allMissions = Array.from(missions.values()).filter(m => m.organizationId === organizationId);

  const completedTasks = allTasks.filter(t => t.status === "completed");
  const avgCompletionTime =
    completedTasks.length > 0
      ? completedTasks.reduce((sum, t) => sum + (t.actualDurationMs ?? 0), 0) / completedTasks.length
      : 0;

  const successRate =
    allTasks.length > 0
      ? (completedTasks.length / allTasks.length) * 100
      : 100;

  return {
    totalRobots: allRobots.length,
    availableRobots: allRobots.filter(r => r.available).length,
    busyRobots: allRobots.filter(r => !r.available).length,
    offlineRobots: 0, // Would integrate with robotics service
    totalTasks: allTasks.length,
    pendingTasks: allTasks.filter(t => t.status === "pending").length,
    activeTasks: allTasks.filter(t => t.status === "in-progress").length,
    completedTasks: completedTasks.length,
    failedTasks: allTasks.filter(t => t.status === "failed").length,
    activeMissions: allMissions.filter(m => m.status === "active").length,
    averageTaskCompletionTimeMs: Math.round(avgCompletionTime),
    taskSuccessRate: Math.round(successRate),
  };
}

/**
 * Get task orchestration statistics
 */
export async function getTaskOrchestrationStats(organizationId: string): Promise<{
  totalTasks: number;
  tasksByStatus: Record<string, number>;
  tasksByPriority: Record<string, number>;
  totalMissions: number;
  missionsByStatus: Record<string, number>;
  totalWorkflows: number;
  totalWorkflowExecutions: number;
  averageTaskDurationMs: number;
  taskSuccessRate: number;
  robotUtilization: number; // 0-100
  topTaskTypes: Array<{ type: string; count: number }>;
}> {
  const allTasks = Array.from(tasks.values()).filter(t => t.organizationId === organizationId);
  const allMissions = Array.from(missions.values()).filter(m => m.organizationId === organizationId);
  const allWorkflows = Array.from(workflows.values()).filter(w => w.organizationId === organizationId);
  const allExecutions = Array.from(workflowExecutions.values());

  const tasksByStatus: Record<string, number> = {};
  const tasksByPriority: Record<string, number> = {};
  const taskTypes: Record<string, number> = {};

  for (const task of allTasks) {
    tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
    tasksByPriority[task.priority] = (tasksByPriority[task.priority] || 0) + 1;

    // Count action types
    for (const action of task.actions) {
      taskTypes[action.type] = (taskTypes[action.type] || 0) + 1;
    }
  }

  const missionsByStatus: Record<string, number> = {};
  for (const mission of allMissions) {
    missionsByStatus[mission.status] = (missionsByStatus[mission.status] || 0) + 1;
  }

  const completedTasks = allTasks.filter(t => t.status === "completed");
  const avgDuration =
    completedTasks.length > 0
      ? completedTasks.reduce((sum, t) => sum + (t.actualDurationMs ?? 0), 0) / completedTasks.length
      : 0;

  const successRate =
    allTasks.length > 0 ? (completedTasks.length / allTasks.length) * 100 : 100;

  const allRobots = Array.from(robotCapabilities.values());
  const utilization =
    allRobots.length > 0
      ? (allRobots.filter(r => !r.available).length / allRobots.length) * 100
      : 0;

  const topTaskTypes = Object.entries(taskTypes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([type, count]) => ({ type, count }));

  return {
    totalTasks: allTasks.length,
    tasksByStatus,
    tasksByPriority,
    totalMissions: allMissions.length,
    missionsByStatus,
    totalWorkflows: allWorkflows.length,
    totalWorkflowExecutions: allExecutions.length,
    averageTaskDurationMs: Math.round(avgDuration),
    taskSuccessRate: Math.round(successRate),
    robotUtilization: Math.round(utilization),
    topTaskTypes,
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function findBestRobotForTask(task: RobotTask): TaskAssignment | null {
  const availableRobots = Array.from(robotCapabilities.values()).filter(r => r.available);

  let bestRobot: RobotCapability | null = null;
  let bestScore = 0;
  const reasons: string[] = [];

  for (const robot of availableRobots) {
    let score = 0;
    const robotReasons: string[] = [];

    // Check capability match
    const hasAllCapabilities = task.requiredCapabilities.every(cap =>
      robot.capabilities.includes(cap)
    );

    if (!hasAllCapabilities) continue;

    score += 50; // Base score for capability match
    robotReasons.push("Has all required capabilities");

    // Battery level bonus
    if (robot.currentBattery !== undefined) {
      score += robot.currentBattery * 0.3;
      if (robot.currentBattery > 80) {
        robotReasons.push("High battery level");
      }
    }

    // Payload capacity bonus
    if (robot.maxPayload && task.requiredCapabilities.includes("heavy-lift")) {
      score += Math.min(20, robot.maxPayload / 10);
      robotReasons.push("Sufficient payload capacity");
    }

    if (score > bestScore) {
      bestScore = score;
      bestRobot = robot;
      reasons.length = 0;
      reasons.push(...robotReasons);
    }
  }

  if (!bestRobot) return null;

  return {
    taskId: task.id,
    robotId: bestRobot.robotId,
    score: Math.min(100, Math.round(bestScore)),
    reasons,
    assignedAt: new Date().toISOString(),
  };
}

async function executeWorkflowStep(
  execution: WorkflowExecution,
  workflow: WorkflowDefinition
): Promise<void> {
  const step = workflow.steps.find(s => s.id === execution.currentStepId);
  if (!step) {
    execution.status = "completed";
    execution.endTime = new Date().toISOString();
    workflowExecutions.set(execution.id, execution);
    return;
  }

  execution.logs.push({
    timestamp: new Date().toISOString(),
    stepId: step.id,
    level: "info",
    message: `Executing step: ${step.name}`,
  });

  // Simplified execution - in production would handle all step types
  if (step.type === "task" && step.taskTemplate) {
    // Create and execute task
    const task = await createTask({
      organizationId: workflow.organizationId,
      name: step.name,
      requiredCapabilities: step.taskTemplate.requiredCapabilities ?? [],
      actions: step.taskTemplate.actions ?? [],
      createdBy: "workflow",
    });

    execution.logs.push({
      timestamp: new Date().toISOString(),
      stepId: step.id,
      level: "info",
      message: `Created task: ${task.id}`,
    });
  }

  // Move to next step
  if (step.nextStepId) {
    execution.currentStepId = step.nextStepId;
    workflowExecutions.set(execution.id, execution);
    await executeWorkflowStep(execution, workflow);
  } else {
    execution.status = "completed";
    execution.endTime = new Date().toISOString();
    workflowExecutions.set(execution.id, execution);
  }
}
