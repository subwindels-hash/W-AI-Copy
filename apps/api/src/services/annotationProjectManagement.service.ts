/**
 * Module 41: Annotation Project Management Service
 *
 * Manages data labeling projects, task distribution, annotator management,
 * workflow orchestration, and progress tracking for creating high-quality
 * training datasets.
 *
 * Phase 1 — Critical Gap: Data labeling project management infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProjectStatus = "draft" | "active" | "paused" | "completed" | "archived";

export type TaskStatus = "pending" | "assigned" | "in_progress" | "submitted" | "review" | "approved" | "rejected" | "reassigned";

export type DataType = "text" | "image" | "audio" | "video" | "tabular" | "document" | "mixed";

export type AnnotationType =
  | "classification"
  | "named_entity_recognition"
  | "sentiment"
  | "bounding_box"
  | "segmentation"
  | "keypoint"
  | "transcription"
  | "summarization"
  | "question_answering"
  | "ranking"
  | "custom";

export type AnnotatorRole = "admin" | "manager" | "annotator" | "reviewer" | "validator";

export interface AnnotationProject {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  dataType: DataType;
  annotationType: AnnotationType;
  labelSchema: LabelSchema;
  guidelines: string;
  config: ProjectConfig;
  statistics: ProjectStatistics;
  budget?: ProjectBudget;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface LabelSchema {
  labels: Label[];
  hierarchical?: boolean;
  multiLabel?: boolean;
  required?: boolean;
}

export interface Label {
  id: string;
  name: string;
  description?: string;
  color?: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectConfig {
  maxAnnotatorsPerTask?: number;
  minAnnotatorsPerTask?: number;
  reviewRequired: boolean;
  approvalRequired: boolean;
  autoAssignTasks: boolean;
  taskTimeout?: number; // hours
  qualityThreshold?: number; // 0-1
  enableActiveLearning?: boolean;
  customSettings?: Record<string, unknown>;
}

export interface ProjectStatistics {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  reviewTasks: number;
  approvedTasks: number;
  rejectedTasks: number;
  averageCompletionTimeMs?: number;
  annotatorCount: number;
  reviewerCount: number;
}

export interface ProjectBudget {
  totalBudget: number;
  spentBudget: number;
  currency: string;
  costPerTask?: number;
  costPerHour?: number;
}

export interface AnnotationTask {
  id: string;
  projectId: string;
  dataId: string;
  dataUrl: string;
  dataPreview?: string;
  status: TaskStatus;
  assignedTo?: string;
  assignedAt?: string;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  annotations: Annotation[];
  reviewComments?: ReviewComment[];
  metadata?: Record<string, unknown>;
  priority: number; // 0-100, higher = more urgent
  timeout?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Annotation {
  id: string;
  taskId: string;
  annotatorId: string;
  labelId?: string;
  labelName: string;
  value: unknown;
  confidence?: number;
  startTime?: string;
  endTime?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ReviewComment {
  id: string;
  reviewerId: string;
  comment: string;
  suggestion?: unknown;
  createdAt: string;
}

export interface Annotator {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  email: string;
  role: AnnotatorRole;
  skills: string[];
  languages: string[];
  status: "active" | "inactive" | "suspended";
  performance: AnnotatorPerformance;
  assignedProjects: string[];
  maxConcurrentTasks: number;
  createdAt: string;
  updatedAt: string;
}

export interface AnnotatorPerformance {
  totalTasks: number;
  completedTasks: number;
  approvedTasks: number;
  rejectedTasks: number;
  averageTimePerTask?: number;
  qualityScore?: number; // 0-1
  interAnnotatorAgreement?: number; // 0-1
  lastActiveAt?: string;
}

export interface TaskAssignment {
  id: string;
  taskId: string;
  annotatorId: string;
  assignedAt: string;
  dueAt?: string;
  status: "assigned" | "accepted" | "declined" | "timeout";
}

export interface ProjectStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalTasks: number;
  completedTasks: number;
  totalAnnotators: number;
  activeAnnotators: number;
  averageQualityScore: number;
  averageCompletionTimeMs: number;
  projectsByType: Record<string, number>;
  projectsByStatus: Record<string, number>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const projects = new Map<string, AnnotationProject>();
const tasks = new Map<string, AnnotationTask>();
const annotators = new Map<string, Annotator>();
const assignments = new Map<string, TaskAssignment>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create an annotation project
 */
export async function createProject(params: {
  organizationId: string;
  name: string;
  description: string;
  dataType: DataType;
  annotationType: AnnotationType;
  labelSchema: LabelSchema;
  guidelines: string;
  config?: Partial<ProjectConfig>;
  budget?: ProjectBudget;
  createdBy: string;
}): Promise<AnnotationProject> {
  const now = new Date().toISOString();

  const project: AnnotationProject = {
    id: `project_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "draft",
    dataType: params.dataType,
    annotationType: params.annotationType,
    labelSchema: params.labelSchema,
    guidelines: params.guidelines,
    config: {
      maxAnnotatorsPerTask: 1,
      minAnnotatorsPerTask: 1,
      reviewRequired: true,
      approvalRequired: false,
      autoAssignTasks: false,
      enableActiveLearning: false,
      ...params.config,
    },
    statistics: {
      totalTasks: 0,
      completedTasks: 0,
      pendingTasks: 0,
      inProgressTasks: 0,
      reviewTasks: 0,
      approvedTasks: 0,
      rejectedTasks: 0,
      annotatorCount: 0,
      reviewerCount: 0,
    },
    budget: params.budget,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  projects.set(project.id, project);
  return project;
}

/**
 * Get a project by ID
 */
export async function getProject(projectId: string): Promise<AnnotationProject | null> {
  return projects.get(projectId) ?? null;
}

/**
 * List projects for an organization
 */
export async function listProjects(
  organizationId: string,
  filters?: {
    status?: ProjectStatus;
    dataType?: DataType;
    annotationType?: AnnotationType;
    limit?: number;
  }
): Promise<AnnotationProject[]> {
  let result = Array.from(projects.values()).filter(
    p => p.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(p => p.status === filters.status);
  if (filters?.dataType) result = result.filter(p => p.dataType === filters.dataType);
  if (filters?.annotationType) result = result.filter(p => p.annotationType === filters.annotationType);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Update a project
 */
export async function updateProject(
  projectId: string,
  updates: Partial<Pick<AnnotationProject, "name" | "description" | "guidelines" | "config" | "budget">>,
  updatedBy: string
): Promise<AnnotationProject | null> {
  const project = projects.get(projectId);
  if (!project) return null;

  Object.assign(project, updates);
  project.updatedAt = new Date().toISOString();

  projects.set(projectId, project);
  return project;
}

/**
 * Start a project (change status from draft to active)
 */
export async function startProject(projectId: string): Promise<AnnotationProject | null> {
  const project = projects.get(projectId);
  if (!project) return null;

  if (project.status !== "draft") {
    throw new Error(`Cannot start project in status: ${project.status}`);
  }

  project.status = "active";
  project.startedAt = new Date().toISOString();
  project.updatedAt = project.startedAt;

  projects.set(projectId, project);
  return project;
}

/**
 * Pause a project
 */
export async function pauseProject(projectId: string): Promise<AnnotationProject | null> {
  const project = projects.get(projectId);
  if (!project) return null;

  if (project.status !== "active") {
    throw new Error(`Cannot pause project in status: ${project.status}`);
  }

  project.status = "paused";
  project.updatedAt = new Date().toISOString();

  projects.set(projectId, project);
  return project;
}

/**
 * Resume a paused project
 */
export async function resumeProject(projectId: string): Promise<AnnotationProject | null> {
  const project = projects.get(projectId);
  if (!project) return null;

  if (project.status !== "paused") {
    throw new Error(`Cannot resume project in status: ${project.status}`);
  }

  project.status = "active";
  project.updatedAt = new Date().toISOString();

  projects.set(projectId, project);
  return project;
}

/**
 * Complete a project
 */
export async function completeProject(projectId: string): Promise<AnnotationProject | null> {
  const project = projects.get(projectId);
  if (!project) return null;

  if (project.status !== "active" && project.status !== "paused") {
    throw new Error(`Cannot complete project in status: ${project.status}`);
  }

  project.status = "completed";
  project.completedAt = new Date().toISOString();
  project.updatedAt = project.completedAt;

  projects.set(projectId, project);
  return project;
}

/**
 * Create annotation tasks for a project
 */
export async function createTasks(
  projectId: string,
  taskData: Array<{
    dataId: string;
    dataUrl: string;
    dataPreview?: string;
    metadata?: Record<string, unknown>;
    priority?: number;
  }>
): Promise<AnnotationTask[]> {
  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const now = new Date().toISOString();
  const createdTasks: AnnotationTask[] = [];

  for (const data of taskData) {
    const task: AnnotationTask = {
      id: `task_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      projectId,
      dataId: data.dataId,
      dataUrl: data.dataUrl,
      dataPreview: data.dataPreview,
      status: "pending",
      annotations: [],
      metadata: data.metadata,
      priority: data.priority ?? 50,
      createdAt: now,
      updatedAt: now,
    };

    tasks.set(task.id, task);
    createdTasks.push(task);
  }

  // Update project statistics
  project.statistics.totalTasks += createdTasks.length;
  project.statistics.pendingTasks += createdTasks.length;
  project.updatedAt = now;

  projects.set(projectId, project);

  // Auto-assign if enabled
  if (project.config.autoAssignTasks) {
    for (const task of createdTasks) {
      await autoAssignTask(task.id);
    }
  }

  return createdTasks;
}

/**
 * Get a task by ID
 */
export async function getTask(taskId: string): Promise<AnnotationTask | null> {
  return tasks.get(taskId) ?? null;
}

/**
 * List tasks for a project
 */
export async function listTasks(
  projectId: string,
  filters?: {
    status?: TaskStatus;
    assignedTo?: string;
    limit?: number;
  }
): Promise<AnnotationTask[]> {
  let result = Array.from(tasks.values()).filter(t => t.projectId === projectId);

  if (filters?.status) result = result.filter(t => t.status === filters.status);
  if (filters?.assignedTo) result = result.filter(t => t.assignedTo === filters.assignedTo);

  return result
    .sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 100);
}

/**
 * Assign a task to an annotator
 */
export async function assignTask(
  taskId: string,
  annotatorId: string
): Promise<AnnotationTask | null> {
  const task = tasks.get(taskId);
  if (!task) return null;

  const annotator = annotators.get(annotatorId);
  if (!annotator) throw new Error(`Annotator ${annotatorId} not found`);

  if (annotator.status !== "active") {
    throw new Error(`Annotator ${annotatorId} is not active`);
  }

  const now = new Date().toISOString();
  task.assignedTo = annotatorId;
  task.assignedAt = now;
  task.status = "assigned";
  task.updatedAt = now;

  // Set timeout if configured
  const project = projects.get(task.projectId);
  if (project?.config.taskTimeout) {
    const timeoutDate = new Date(Date.now() + project.config.taskTimeout * 60 * 60 * 1000);
    task.timeout = timeoutDate.toISOString();
  }

  tasks.set(taskId, task);

  // Create assignment record
  const assignment: TaskAssignment = {
    id: `assign_${randomUUID().slice(0, 8)}`,
    taskId,
    annotatorId,
    assignedAt: now,
    dueAt: task.timeout,
    status: "assigned",
  };
  assignments.set(assignment.id, assignment);

  // Update project statistics
  if (project) {
    project.statistics.pendingTasks--;
    project.statistics.inProgressTasks++;
    project.updatedAt = now;
    projects.set(project.id, project);
  }

  return task;
}

/**
 * Auto-assign task to available annotator
 */
export async function autoAssignTask(taskId: string): Promise<AnnotationTask | null> {
  const task = tasks.get(taskId);
  if (!task) return null;

  const project = projects.get(task.projectId);
  if (!project) return null;

  // Find available annotators for this project
  const availableAnnotators = Array.from(annotators.values()).filter(a => {
    if (a.status !== "active") return false;
    if (!a.assignedProjects.includes(project.id)) return false;
    
    // Check if annotator has capacity
    const currentAssignments = Array.from(assignments.values()).filter(
      asgn => asgn.annotatorId === a.id && asgn.status === "assigned"
    );
    return currentAssignments.length < a.maxConcurrentTasks;
  });

  if (availableAnnotators.length === 0) {
    return null; // No available annotators
  }

  // Select annotator with least current assignments
  const annotator = availableAnnotators.sort((a, b) => {
    const aAssignments = Array.from(assignments.values()).filter(
      asgn => asgn.annotatorId === a.id && asgn.status === "assigned"
    ).length;
    const bAssignments = Array.from(assignments.values()).filter(
      asgn => asgn.annotatorId === b.id && asgn.status === "assigned"
    ).length;
    return aAssignments - bAssignments;
  })[0];

  return assignTask(taskId, annotator.id);
}

/**
 * Submit task annotations
 */
export async function submitTask(
  taskId: string,
  annotatorId: string,
  annotations: Array<{
    labelId?: string;
    labelName: string;
    value: unknown;
    confidence?: number;
    metadata?: Record<string, unknown>;
  }>
): Promise<AnnotationTask | null> {
  const task = tasks.get(taskId);
  if (!task) return null;

  if (task.assignedTo !== annotatorId) {
    throw new Error(`Task not assigned to annotator ${annotatorId}`);
  }

  const now = new Date().toISOString();

  // Create annotations
  const createdAnnotations: Annotation[] = annotations.map(ann => ({
    id: `ann_${randomUUID().slice(0, 8)}`,
    taskId,
    annotatorId,
    labelId: ann.labelId,
    labelName: ann.labelName,
    value: ann.value,
    confidence: ann.confidence,
    startTime: task.assignedAt,
    endTime: now,
    metadata: ann.metadata,
    createdAt: now,
  }));

  task.annotations = createdAnnotations;
  task.submittedAt = now;
  task.updatedAt = now;

  // Move to review if required
  const project = projects.get(task.projectId);
  if (project?.config.reviewRequired) {
    task.status = "review";
    if (project) {
      project.statistics.inProgressTasks--;
      project.statistics.reviewTasks++;
    }
  } else if (project?.config.approvalRequired) {
    task.status = "submitted";
    if (project) {
      project.statistics.inProgressTasks--;
      project.statistics.completedTasks++;
    }
  } else {
    task.status = "approved";
    task.approvedAt = now;
    if (project) {
      project.statistics.inProgressTasks--;
      project.statistics.approvedTasks++;
    }
  }

  tasks.set(taskId, task);

  // Update project statistics
  if (project) {
    project.updatedAt = now;
    projects.set(project.id, project);
  }

  // Update annotator performance
  const annotator = annotators.get(annotatorId);
  if (annotator) {
    annotator.performance.totalTasks++;
    annotator.performance.completedTasks++;
    annotator.performance.lastActiveAt = now;
    
    if (task.assignedAt) {
      const completionTime = new Date(now).getTime() - new Date(task.assignedAt).getTime();
      const totalTime = (annotator.performance.averageTimePerTask ?? 0) * (annotator.performance.completedTasks - 1) + completionTime;
      annotator.performance.averageTimePerTask = totalTime / annotator.performance.completedTasks;
    }
    
    annotator.updatedAt = now;
    annotators.set(annotatorId, annotator);
  }

  return task;
}

/**
 * Review task annotations
 */
export async function reviewTask(
  taskId: string,
  reviewerId: string,
  approved: boolean,
  comments?: string
): Promise<AnnotationTask | null> {
  const task = tasks.get(taskId);
  if (!task) return null;

  if (task.status !== "review") {
    throw new Error(`Task not in review status: ${task.status}`);
  }

  const now = new Date().toISOString();
  task.reviewedBy = reviewerId;
  task.reviewedAt = now;
  task.updatedAt = now;

  if (comments) {
    task.reviewComments = task.reviewComments ?? [];
    task.reviewComments.push({
      id: `comment_${randomUUID().slice(0, 8)}`,
      reviewerId,
      comment: comments,
      createdAt: now,
    });
  }

  const project = projects.get(task.projectId);

  if (approved) {
    if (project?.config.approvalRequired) {
      task.status = "submitted";
      if (project) {
        project.statistics.reviewTasks--;
        project.statistics.completedTasks++;
      }
    } else {
      task.status = "approved";
      task.approvedAt = now;
      task.approvedBy = reviewerId;
      if (project) {
        project.statistics.reviewTasks--;
        project.statistics.approvedTasks++;
      }

      // Update annotator performance
      if (task.assignedTo) {
        const annotator = annotators.get(task.assignedTo);
        if (annotator) {
          annotator.performance.approvedTasks++;
          annotator.updatedAt = now;
          annotators.set(task.assignedTo, annotator);
        }
      }
    }
  } else {
    task.status = "rejected";
    if (project) {
      project.statistics.reviewTasks--;
      project.statistics.rejectedTasks++;
    }

    // Update annotator performance
    if (task.assignedTo) {
      const annotator = annotators.get(task.assignedTo);
      if (annotator) {
        annotator.performance.rejectedTasks++;
        annotator.updatedAt = now;
        annotators.set(task.assignedTo, annotator);
      }
    }
  }

  tasks.set(taskId, task);

  if (project) {
    project.updatedAt = now;
    projects.set(project.id, project);
  }

  return task;
}

/**
 * Reassign a rejected task
 */
export async function reassignTask(
  taskId: string,
  newAnnotatorId?: string
): Promise<AnnotationTask | null> {
  const task = tasks.get(taskId);
  if (!task) return null;

  if (task.status !== "rejected") {
    throw new Error(`Cannot reassign task in status: ${task.status}`);
  }

  const now = new Date().toISOString();
  task.annotations = [];
  task.reviewComments = [];
  task.submittedAt = undefined;
  task.reviewedBy = undefined;
  task.reviewedAt = undefined;
  task.approvedBy = undefined;
  task.approvedAt = undefined;
  task.status = "pending";
  task.updatedAt = now;

  const project = projects.get(task.projectId);
  if (project) {
    project.statistics.rejectedTasks--;
    project.statistics.pendingTasks++;
    project.updatedAt = now;
    projects.set(project.id, project);
  }

  tasks.set(taskId, task);

  // Auto-assign to new annotator if specified
  if (newAnnotatorId) {
    return assignTask(taskId, newAnnotatorId);
  } else if (project?.config.autoAssignTasks) {
    return autoAssignTask(taskId);
  }

  return task;
}

/**
 * Register an annotator
 */
export async function registerAnnotator(params: {
  organizationId: string;
  userId: string;
  name: string;
  email: string;
  role?: AnnotatorRole;
  skills?: string[];
  languages?: string[];
  maxConcurrentTasks?: number;
}): Promise<Annotator> {
  const now = new Date().toISOString();

  const annotator: Annotator = {
    id: `annotator_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    userId: params.userId,
    name: params.name,
    email: params.email,
    role: params.role ?? "annotator",
    skills: params.skills ?? [],
    languages: params.languages ?? [],
    status: "active",
    performance: {
      totalTasks: 0,
      completedTasks: 0,
      approvedTasks: 0,
      rejectedTasks: 0,
    },
    assignedProjects: [],
    maxConcurrentTasks: params.maxConcurrentTasks ?? 5,
    createdAt: now,
    updatedAt: now,
  };

  annotators.set(annotator.id, annotator);
  return annotator;
}

/**
 * Get an annotator by ID
 */
export async function getAnnotator(annotatorId: string): Promise<Annotator | null> {
  return annotators.get(annotatorId) ?? null;
}

/**
 * List annotators for an organization
 */
export async function listAnnotators(
  organizationId: string,
  filters?: {
    role?: AnnotatorRole;
    status?: Annotator["status"];
    projectId?: string;
    limit?: number;
  }
): Promise<Annotator[]> {
  let result = Array.from(annotators.values()).filter(
    a => a.organizationId === organizationId
  );

  if (filters?.role) result = result.filter(a => a.role === filters.role);
  if (filters?.status) result = result.filter(a => a.status === filters.status);
  if (filters?.projectId) result = result.filter(a => a.assignedProjects.includes(filters.projectId!));

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Assign annotator to project
 */
export async function assignAnnotatorToProject(
  annotatorId: string,
  projectId: string
): Promise<Annotator | null> {
  const annotator = annotators.get(annotatorId);
  if (!annotator) return null;

  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  if (!annotator.assignedProjects.includes(projectId)) {
    annotator.assignedProjects.push(projectId);
    annotator.updatedAt = new Date().toISOString();
    annotators.set(annotatorId, annotator);

    // Update project statistics
    if (annotator.role === "annotator") {
      project.statistics.annotatorCount++;
    } else if (annotator.role === "reviewer") {
      project.statistics.reviewerCount++;
    }
    project.updatedAt = annotator.updatedAt;
    projects.set(projectId, project);
  }

  return annotator;
}

/**
 * Get project statistics
 */
export async function getProjectStats(organizationId: string): Promise<ProjectStats> {
  const orgProjects = Array.from(projects.values()).filter(
    p => p.organizationId === organizationId
  );
  const orgAnnotators = Array.from(annotators.values()).filter(
    a => a.organizationId === organizationId
  );

  const projectsByType: Record<string, number> = {};
  const projectsByStatus: Record<string, number> = {};
  let totalTasks = 0;
  let completedTasks = 0;
  let totalCompletionTime = 0;
  let completionTimeCount = 0;

  for (const project of orgProjects) {
    projectsByType[project.annotationType] = (projectsByType[project.annotationType] || 0) + 1;
    projectsByStatus[project.status] = (projectsByStatus[project.status] || 0) + 1;
    totalTasks += project.statistics.totalTasks;
    completedTasks += project.statistics.completedTasks;

    if (project.statistics.averageCompletionTimeMs) {
      totalCompletionTime += project.statistics.averageCompletionTimeMs * project.statistics.completedTasks;
      completionTimeCount += project.statistics.completedTasks;
    }
  }

  const activeAnnotators = orgAnnotators.filter(a => a.status === "active").length;
  const totalQualityScore = orgAnnotators.reduce(
    (sum, a) => sum + (a.performance.qualityScore ?? 0),
    0
  );
  const avgQualityScore = orgAnnotators.length > 0 ? totalQualityScore / orgAnnotators.length : 0;

  return {
    totalProjects: orgProjects.length,
    activeProjects: orgProjects.filter(p => p.status === "active").length,
    completedProjects: orgProjects.filter(p => p.status === "completed").length,
    totalTasks,
    completedTasks,
    totalAnnotators: orgAnnotators.length,
    activeAnnotators,
    averageQualityScore: Math.round(avgQualityScore * 100) / 100,
    averageCompletionTimeMs: completionTimeCount > 0 ? Math.round(totalCompletionTime / completionTimeCount) : 0,
    projectsByType,
    projectsByStatus,
  };
}

/**
 * Export project annotations
 */
export async function exportAnnotations(
  projectId: string,
  format: "json" | "csv" | "coco" | "yolo"
): Promise<Record<string, unknown>> {
  const project = projects.get(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const projectTasks = Array.from(tasks.values())
    .filter(t => t.projectId === projectId && t.status === "approved");

  if (format === "json") {
    return {
      project: {
        id: project.id,
        name: project.name,
        dataType: project.dataType,
        annotationType: project.annotationType,
      },
      tasks: projectTasks.map(t => ({
        id: t.id,
        dataId: t.dataId,
        dataUrl: t.dataUrl,
        annotations: t.annotations,
      })),
      exportedAt: new Date().toISOString(),
    };
  }

  // Other formats would be implemented similarly
  return { format, tasks: projectTasks.length };
}
