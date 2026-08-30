/**
 * Module 76: AI Workflow Management Service
 *
 * Provides ML pipeline workflow management including DAG-based pipeline definition,
 * ML-specific task types, pipeline versioning and templates, pipeline parameterization,
 * pipeline validation, visualization data generation, and pipeline import/export for
 * comprehensive ML workflow orchestration.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MLPipeline {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  version: string;
  status: PipelineStatus;
  tasks: MLTask[];
  dependencies: TaskDependency[];
  parameters: PipelineParameter[];
  resources: ResourceRequirements;
  schedule?: PipelineSchedule;
  triggers: PipelineTrigger[];
  metadata: PipelineMetadata;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export type PipelineStatus = 'draft' | 'active' | 'paused' | 'archived' | 'deprecated';

export interface MLTask {
  id: string;
  name: string;
  type: TaskType;
  description?: string;
  config: TaskConfig;
  inputs: TaskInput[];
  outputs: TaskOutput[];
  resources: TaskResourceRequirements;
  retryPolicy: RetryPolicy;
  timeout?: number; // seconds
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
}

export type TaskType =
  | 'data-ingestion'
  | 'data-preprocessing'
  | 'feature-engineering'
  | 'feature-selection'
  | 'model-training'
  | 'model-evaluation'
  | 'model-validation'
  | 'model-deployment'
  | 'model-monitoring'
  | 'data-validation'
  | 'hyperparameter-tuning'
  | 'model-registry'
  | 'notification'
  | 'custom';

export interface TaskConfig {
  script?: string;
  command?: string;
  image?: string;
  environment?: Record<string, string>;
  parameters?: Record<string, any>;
  artifacts?: ArtifactConfig[];
  cache?: CacheConfig;
}

export interface ArtifactConfig {
  name: string;
  path: string;
  type: 'model' | 'data' | 'plot' | 'report' | 'custom';
  optional?: boolean;
}

export interface CacheConfig {
  enabled: boolean;
  key?: string;
  ttl?: number; // seconds
}

export interface TaskInput {
  name: string;
  source: InputSource;
  type: 'data' | 'model' | 'parameter' | 'artifact';
  required: boolean;
  default?: any;
}

export type InputSource =
  | { type: 'task-output'; taskId: string; outputName: string }
  | { type: 'pipeline-parameter'; parameterName: string }
  | { type: 'external'; uri: string }
  | { type: 'constant'; value: any };

export interface TaskOutput {
  name: string;
  type: 'data' | 'model' | 'metric' | 'artifact';
  path?: string;
  description?: string;
}

export interface TaskResourceRequirements {
  cpu?: string; // e.g., "2", "500m"
  memory?: string; // e.g., "4Gi", "512Mi"
  gpu?: number;
  gpuType?: string;
  ephemeralStorage?: string;
}

export interface RetryPolicy {
  maxRetries: number;
  retryDelay: number; // seconds
  backoffMultiplier: number;
  retryOn: string[]; // Error types to retry on
}

export interface TaskDependency {
  fromTaskId: string;
  toTaskId: string;
  type: 'data' | 'control' | 'conditional';
  condition?: string; // For conditional dependencies
}

export interface PipelineParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'list' | 'dict';
  description?: string;
  default?: any;
  required: boolean;
  validation?: ParameterValidation;
}

export interface ParameterValidation {
  min?: number;
  max?: number;
  pattern?: string;
  enum?: any[];
}

export interface ResourceRequirements {
  totalCPU?: string;
  totalMemory?: string;
  totalGPU?: number;
  maxParallelTasks?: number;
}

export interface PipelineSchedule {
  type: 'cron' | 'interval' | 'event';
  cron?: string;
  interval?: number; // seconds
  eventType?: string;
  enabled: boolean;
  timezone?: string;
}

export interface PipelineTrigger {
  type: 'manual' | 'schedule' | 'event' | 'webhook' | 'api' | 'data-arrival' | 'model-drift';
  config: Record<string, any>;
  enabled: boolean;
}

export interface PipelineMetadata {
  framework?: string;
  mlLibrary?: string;
  pythonVersion?: string;
  entryPoint?: string;
  repository?: string;
  branch?: string;
  commitHash?: string;
}

export interface PipelineTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  category: TemplateCategory;
  pipeline: Omit<MLPipeline, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'createdBy'>;
  parameters: PipelineParameter[];
  tags: string[];
  usageCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type TemplateCategory =
  | 'classification'
  | 'regression'
  | 'clustering'
  | 'time-series'
  | 'nlp'
  | 'computer-vision'
  | 'recommendation'
  | 'general';

export interface PipelineValidation {
  pipelineId: string;
  validatedAt: string;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

export interface ValidationError {
  type: 'syntax' | 'dependency' | 'resource' | 'parameter' | 'configuration';
  taskId?: string;
  message: string;
  details?: string;
}

export interface ValidationWarning {
  type: 'performance' | 'best-practice' | 'compatibility' | 'security';
  taskId?: string;
  message: string;
  details?: string;
}

export interface PipelineVisualization {
  pipelineId: string;
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
  layout: LayoutInfo;
}

export interface VisualizationNode {
  id: string;
  taskId: string;
  label: string;
  type: TaskType;
  x: number;
  y: number;
  width: number;
  height: number;
  status?: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  metadata?: Record<string, any>;
}

export interface VisualizationEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  type: 'data' | 'control' | 'conditional';
  animated?: boolean;
}

export interface LayoutInfo {
  algorithm: 'hierarchical' | 'force-directed' | 'grid' | 'manual';
  direction: 'TB' | 'LR' | 'BT' | 'RL';
  spacing: number;
}

export interface WorkflowDashboard {
  organizationId: string;
  totalPipelines: number;
  activePipelines: number;
  pipelinesByStatus: Record<PipelineStatus, number>;
  pipelinesByType: Record<TaskType, number>;
  recentPipelines: MLPipeline[];
  templates: PipelineTemplate[];
  topTags: Array<{ tag: string; count: number }>;
  validationSummary: {
    validPipelines: number;
    invalidPipelines: number;
    commonErrors: Array<{ type: string; count: number }>;
  };
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const pipelines = new Map<string, MLPipeline>();
const templates = new Map<string, PipelineTemplate>();
const validations = new Map<string, PipelineValidation>();
const visualizations = new Map<string, PipelineVisualization>();

// ─── Pipeline Management ───────────────────────────────────────────────────────

/**
 * Create an ML pipeline
 */
export async function createMLPipeline(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    version?: string;
    tasks: Omit<MLTask, 'id'>[];
    dependencies?: Omit<TaskDependency, 'fromTaskId' | 'toTaskId'>[];
    parameters?: PipelineParameter[];
    resources?: ResourceRequirements;
    schedule?: PipelineSchedule;
    triggers?: PipelineTrigger[];
    metadata?: PipelineMetadata;
    tags?: string[];
    createdBy: string;
  }
): Promise<MLPipeline> {
  const id = `pipeline_${randomUUID()}`;
  const now = new Date().toISOString();

  // Create tasks with IDs
  const tasks: MLTask[] = params.tasks.map((t) => ({
    ...t,
    id: `task_${randomUUID()}`,
  }));

  // Create dependencies with task IDs
  const dependencies: TaskDependency[] = (params.dependencies || []).map((d, idx) => ({
    ...d,
    fromTaskId: tasks[idx % tasks.length]?.id || '',
    toTaskId: tasks[(idx + 1) % tasks.length]?.id || '',
  }));

  const pipeline: MLPipeline = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    version: params.version || '1.0.0',
    status: 'draft',
    tasks,
    dependencies,
    parameters: params.parameters || [],
    resources: params.resources || {},
    schedule: params.schedule,
    triggers: params.triggers || [{ type: 'manual', config: {}, enabled: true }],
    metadata: params.metadata || {},
    tags: params.tags || [],
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  pipelines.set(id, pipeline);
  return pipeline;
}

/**
 * Update an ML pipeline
 */
export async function updateMLPipeline(
  pipelineId: string,
  updates: Partial<Omit<MLPipeline, 'id' | 'organizationId' | 'createdAt' | 'createdBy'>>
): Promise<MLPipeline | null> {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return null;

  const updated: MLPipeline = {
    ...pipeline,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  pipelines.set(pipelineId, updated);
  return updated;
}

/**
 * Publish a pipeline
 */
export async function publishPipeline(pipelineId: string): Promise<MLPipeline | null> {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) return null;

  // Validate before publishing
  const validation = await validatePipeline(pipelineId);
  if (!validation.isValid) {
    throw new Error('Cannot publish invalid pipeline. Fix validation errors first.');
  }

  pipeline.status = 'active';
  pipeline.publishedAt = new Date().toISOString();
  pipeline.updatedAt = pipeline.publishedAt;

  pipelines.set(pipelineId, pipeline);
  return pipeline;
}

/**
 * Validate a pipeline
 */
export async function validatePipeline(pipelineId: string): Promise<PipelineValidation> {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) {
    throw new Error(`Pipeline ${pipelineId} not found`);
  }

  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const suggestions: string[] = [];

  // Check for cycles in dependencies
  if (hasCycle(pipeline.tasks, pipeline.dependencies)) {
    errors.push({
      type: 'dependency',
      message: 'Pipeline has circular dependencies',
      details: 'Remove circular dependencies to make pipeline executable',
    });
  }

  // Check task inputs
  for (const task of pipeline.tasks) {
    for (const input of task.inputs) {
      if (input.source.type === 'task-output') {
        const sourceTask = pipeline.tasks.find((t) => t.id === input.source.taskId);
        if (!sourceTask) {
          errors.push({
            type: 'dependency',
            taskId: task.id,
            message: `Task ${task.name} depends on non-existent task`,
          });
        } else {
          const outputExists = sourceTask.outputs.some((o) => o.name === input.source.outputName);
          if (!outputExists) {
            errors.push({
              type: 'dependency',
              taskId: task.id,
              message: `Task ${task.name} depends on non-existent output ${input.source.outputName}`,
            });
          }
        }
      }
    }

    // Check resource requirements
    if (!task.resources.cpu && !task.resources.memory) {
      warnings.push({
        type: 'best-practice',
        taskId: task.id,
        message: `Task ${task.name} has no resource requirements specified`,
        details: 'Specify resource requirements for better scheduling',
      });
    }

    // Check retry policy
    if (task.retryPolicy.maxRetries === 0) {
      warnings.push({
        type: 'best-practice',
        taskId: task.id,
        message: `Task ${task.name} has no retry policy`,
        details: 'Consider adding retry policy for resilience',
      });
    }
  }

  // Check parameters
  for (const param of pipeline.parameters) {
    if (param.required && param.default === undefined) {
      suggestions.push(`Parameter ${param.name} is required but has no default value`);
    }
  }

  const validation: PipelineValidation = {
    pipelineId,
    validatedAt: new Date().toISOString(),
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };

  validations.set(pipelineId, validation);
  return validation;
}

/**
 * Generate pipeline visualization
 */
export async function generatePipelineVisualization(
  pipelineId: string,
  layout: LayoutInfo = { algorithm: 'hierarchical', direction: 'TB', spacing: 100 }
): Promise<PipelineVisualization> {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) {
    throw new Error(`Pipeline ${pipelineId} not found`);
  }

  // Generate node positions using topological sort
  const sortedTaskIds = topologicalSort(pipeline.tasks, pipeline.dependencies);
  const nodes: VisualizationNode[] = [];
  const edges: VisualizationEdge[] = [];

  // Simple hierarchical layout
  const levels = new Map<string, number>();
  for (let i = 0; i < sortedTaskIds.length; i++) {
    levels.set(sortedTaskIds[i], i);
  }

  for (const task of pipeline.tasks) {
    const level = levels.get(task.id) || 0;
    nodes.push({
      id: `node_${task.id}`,
      taskId: task.id,
      label: task.name,
      type: task.type,
      x: level * 200,
      y: 100,
      width: 150,
      height: 60,
    });
  }

  for (const dep of pipeline.dependencies) {
    edges.push({
      id: `edge_${dep.fromTaskId}_${dep.toTaskId}`,
      from: `node_${dep.fromTaskId}`,
      to: `node_${dep.toTaskId}`,
      type: dep.type,
    });
  }

  const visualization: PipelineVisualization = {
    pipelineId,
    nodes,
    edges,
    layout,
  };

  visualizations.set(pipelineId, visualization);
  return visualization;
}

/**
 * Create a pipeline template
 */
export async function createPipelineTemplate(
  organizationId: string,
  params: {
    name: string;
    description: string;
    category: TemplateCategory;
    pipeline: Omit<MLPipeline, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'createdBy'>;
    parameters?: PipelineParameter[];
    tags?: string[];
    createdBy: string;
  }
): Promise<PipelineTemplate> {
  const id = `template_${randomUUID()}`;
  const now = new Date().toISOString();

  const template: PipelineTemplate = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    category: params.category,
    pipeline: params.pipeline,
    parameters: params.parameters || [],
    tags: params.tags || [],
    usageCount: 0,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  templates.set(id, template);
  return template;
}

/**
 * Create pipeline from template
 */
export async function createPipelineFromTemplate(
  templateId: string,
  organizationId: string,
  params: {
    name: string;
    description?: string;
    parameterValues?: Record<string, any>;
    createdBy: string;
  }
): Promise<MLPipeline> {
  const template = templates.get(templateId);
  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }

  // Apply parameter values
  const pipeline = { ...template.pipeline };
  if (params.parameterValues) {
    for (const [key, value] of Object.entries(params.parameterValues)) {
      // Replace parameter references in task configs
      for (const task of pipeline.tasks) {
        if (task.config.parameters) {
          for (const [paramKey, paramValue] of Object.entries(task.config.parameters)) {
            if (typeof paramValue === 'string' && paramValue === `{{${key}}}`) {
              task.config.parameters[paramKey] = value;
            }
          }
        }
      }
    }
  }

  const newPipeline = await createMLPipeline(organizationId, {
    ...pipeline,
    name: params.name,
    description: params.description,
    createdBy: params.createdBy,
  });

  // Increment template usage
  template.usageCount++;
  template.updatedAt = new Date().toISOString();
  templates.set(templateId, template);

  return newPipeline;
}

/**
 * Get pipeline by ID
 */
export async function getMLPipeline(pipelineId: string): Promise<MLPipeline | null> {
  return pipelines.get(pipelineId) || null;
}

/**
 * List pipelines
 */
export async function listMLPipelines(
  organizationId: string,
  filters?: { status?: PipelineStatus; tags?: string[] }
): Promise<MLPipeline[]> {
  const allPipelines = Array.from(pipelines.values()).filter(
    (p) => p.organizationId === organizationId
  );

  return allPipelines.filter((p) => {
    if (filters?.status && p.status !== filters.status) return false;
    if (filters?.tags && !filters.tags.some((tag) => p.tags.includes(tag))) return false;
    return true;
  });
}

/**
 * Get workflow dashboard
 */
export async function getWorkflowDashboard(organizationId: string): Promise<WorkflowDashboard> {
  const allPipelines = await listMLPipelines(organizationId);
  const allTemplates = Array.from(templates.values()).filter((t) => t.organizationId === organizationId);

  const pipelinesByStatus: Record<string, number> = {};
  const pipelinesByType: Record<string, number> = {};
  const tagCounts = new Map<string, number>();

  for (const pipeline of allPipelines) {
    pipelinesByStatus[pipeline.status] = (pipelinesByStatus[pipeline.status] || 0) + 1;

    for (const task of pipeline.tasks) {
      pipelinesByType[task.type] = (pipelinesByType[task.type] || 0) + 1;
    }

    for (const tag of pipeline.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const recentPipelines = allPipelines
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  const allValidations = Array.from(validations.values());
  const validPipelines = allValidations.filter((v) => v.isValid).length;
  const invalidPipelines = allValidations.filter((v) => !v.isValid).length;

  const errorCounts = new Map<string, number>();
  for (const validation of allValidations) {
    for (const error of validation.errors) {
      errorCounts.set(error.type, (errorCounts.get(error.type) || 0) + 1);
    }
  }

  const commonErrors = Array.from(errorCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    organizationId,
    totalPipelines: allPipelines.length,
    activePipelines: allPipelines.filter((p) => p.status === 'active').length,
    pipelinesByStatus: pipelinesByStatus as Record<PipelineStatus, number>,
    pipelinesByType: pipelinesByType as Record<TaskType, number>,
    recentPipelines,
    templates: allTemplates,
    topTags: Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    validationSummary: {
      validPipelines,
      invalidPipelines,
      commonErrors,
    },
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function hasCycle(tasks: MLTask[], dependencies: TaskDependency[]): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(taskId: string): boolean {
    if (recursionStack.has(taskId)) return true;
    if (visited.has(taskId)) return false;

    visited.add(taskId);
    recursionStack.add(taskId);

    const outgoingDeps = dependencies.filter((d) => d.fromTaskId === taskId);
    for (const dep of outgoingDeps) {
      if (dfs(dep.toTaskId)) return true;
    }

    recursionStack.delete(taskId);
    return false;
  }

  for (const task of tasks) {
    if (dfs(task.id)) return true;
  }

  return false;
}

function topologicalSort(tasks: MLTask[], dependencies: TaskDependency[]): string[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const task of tasks) {
    inDegree.set(task.id, 0);
    adjList.set(task.id, []);
  }

  for (const dep of dependencies) {
    inDegree.set(dep.toTaskId, (inDegree.get(dep.toTaskId) || 0) + 1);
    adjList.get(dep.fromTaskId)?.push(dep.toTaskId);
  }

  const queue: string[] = [];
  for (const [taskId, degree] of inDegree) {
    if (degree === 0) queue.push(taskId);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const taskId = queue.shift()!;
    sorted.push(taskId);

    for (const neighbor of adjList.get(taskId) || []) {
      inDegree.set(neighbor, (inDegree.get(neighbor) || 1) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  return sorted;
}
