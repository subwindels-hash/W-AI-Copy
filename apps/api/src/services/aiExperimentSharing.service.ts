/**
 * Module 98: AI Experiment Sharing Service
 * WINDELS AI OS - Phase 1
 * 
 * Enables collaborative experiment management including experiment sharing with
 * teams, cross-experiment comparison, collaborative notebooks, experiment
 * discussions, and reproducibility verification for AI model development.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiExperimentSharing');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SharedExperiment {
  id: string;
  organizationId: string;
  experimentId: string;
  experimentName: string;
  ownerId: string;
  ownerName: string;
  sharingConfig: SharingConfig;
  experimentData: ExperimentData;
  discussions: ExperimentDiscussion[];
  comparisons: ExperimentComparison[];
  notebooks: CollaborativeNotebook[];
  reproducibility: ReproducibilityStatus;
  views: number;
  forks: number;
  createdAt: string;
  updatedAt: string;
}

export interface SharingConfig {
  visibility: 'private' | 'team' | 'organization' | 'public';
  allowedUsers: string[];
  allowedTeams: string[];
  allowComments: boolean;
  allowForking: boolean;
  allowDownload: boolean;
  requireApproval: boolean;
  expirationDate?: string;
}

export interface ExperimentData {
  modelId: string;
  modelName: string;
  framework: string;
  hyperparameters: Record<string, any>;
  metrics: ExperimentMetrics;
  artifacts: ExperimentArtifact[];
  environment: ExperimentEnvironment;
  dataset: DatasetInfo;
  tags: string[];
}

export interface ExperimentMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  loss?: number;
  trainingTime?: number;
  inferenceTime?: number;
  memoryUsage?: number;
  customMetrics: Record<string, number>;
}

export interface ExperimentArtifact {
  id: string;
  name: string;
  type: 'model' | 'checkpoint' | 'plot' | 'log' | 'config' | 'data';
  path: string;
  size: number;
  createdAt: string;
}

export interface ExperimentEnvironment {
  pythonVersion: string;
  frameworkVersion: string;
  cudaVersion?: string;
  gpuType?: string;
  cpuCores: number;
  memoryGB: number;
  dependencies: Record<string, string>;
}

export interface DatasetInfo {
  name: string;
  version: string;
  size: number;
  split: { train: number; validation: number; test: number };
  preprocessing: string[];
}

export interface ExperimentDiscussion {
  id: string;
  userId: string;
  userName: string;
  type: DiscussionType;
  title: string;
  content: string;
  status: 'open' | 'resolved' | 'closed';
  replies: DiscussionReply[];
  upvotes: number;
  createdAt: string;
  updatedAt: string;
}

export type DiscussionType = 'question' | 'observation' | 'suggestion' | 'issue' | 'insight';

export interface DiscussionReply {
  id: string;
  userId: string;
  userName: string;
  content: string;
  upvotes: number;
  createdAt: string;
}

export interface ExperimentComparison {
  id: string;
  name: string;
  createdBy: string;
  experimentIds: string[];
  comparisonType: ComparisonType;
  metrics: ComparisonMetric[];
  visualization: ComparisonVisualization;
  insights: ComparisonInsight[];
  createdAt: string;
}

export type ComparisonType = 'side_by_side' | 'trend' | 'ablation' | 'hyperparameter_sweep';

export interface ComparisonMetric {
  name: string;
  values: Array<{ experimentId: string; experimentName: string; value: number }>;
  bestExperimentId: string;
  difference: number;
}

export interface ComparisonVisualization {
  type: 'bar_chart' | 'line_chart' | 'scatter_plot' | 'heatmap' | 'radar_chart';
  data: any;
  config: Record<string, any>;
}

export interface ComparisonInsight {
  type: 'improvement' | 'regression' | 'tradeoff' | 'anomaly';
  description: string;
  affectedMetrics: string[];
  recommendation: string;
}

export interface CollaborativeNotebook {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  ownerName: string;
  cells: NotebookCell[];
  collaborators: NotebookCollaborator[];
  version: number;
  lastExecutedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotebookCell {
  id: string;
  type: 'code' | 'markdown' | 'visualization' | 'output';
  content: string;
  language?: string;
  output?: CellOutput;
  executionCount?: number;
  metadata: Record<string, any>;
  position: number;
}

export interface CellOutput {
  type: 'text' | 'image' | 'html' | 'error' | 'widget';
  data: any;
  metadata?: Record<string, any>;
}

export interface NotebookCollaborator {
  userId: string;
  userName: string;
  role: 'editor' | 'viewer' | 'commenter';
  joinedAt: string;
  lastActiveAt?: string;
}

export interface ReproducibilityStatus {
  verified: boolean;
  verificationDate?: string;
  verifiedBy?: string;
  environmentMatch: number;
  dependencyMatch: number;
  dataMatch: number;
  overallScore: number;
  issues: ReproducibilityIssue[];
}

export interface ReproducibilityIssue {
  type: 'environment' | 'dependency' | 'data' | 'code' | 'randomness';
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestion: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const sharedExperiments = new Map<string, SharedExperiment>();
const collaborativeNotebooks = new Map<string, CollaborativeNotebook>();
const experimentComparisons = new Map<string, ExperimentComparison>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function shareExperiment(params: {
  organizationId: string;
  experimentId: string;
  experimentName: string;
  ownerId: string;
  ownerName: string;
  experimentData: ExperimentData;
  sharingConfig?: Partial<SharingConfig>;
}): SharedExperiment {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultConfig: SharingConfig = {
    visibility: 'team',
    allowedUsers: [],
    allowedTeams: [],
    allowComments: true,
    allowForking: true,
    allowDownload: true,
    requireApproval: false,
  };

  const experiment: SharedExperiment = {
    id,
    organizationId: params.organizationId,
    experimentId: params.experimentId,
    experimentName: params.experimentName,
    ownerId: params.ownerId,
    ownerName: params.ownerName,
    sharingConfig: { ...defaultConfig, ...params.sharingConfig },
    experimentData: params.experimentData,
    discussions: [],
    comparisons: [],
    notebooks: [],
    reproducibility: {
      verified: false,
      environmentMatch: 0,
      dependencyMatch: 0,
      dataMatch: 0,
      overallScore: 0,
      issues: [],
    },
    views: 0,
    forks: 0,
    createdAt: now,
    updatedAt: now,
  };

  sharedExperiments.set(id, experiment);
  return experiment;
}

export function getSharedExperiment(id: string): SharedExperiment | undefined {
  const exp = sharedExperiments.get(id);
  if (exp) exp.views += 1;
  return exp;
}

export function listSharedExperiments(
  organizationId: string,
  filters?: { ownerId?: string; visibility?: string; tag?: string }
): SharedExperiment[] {
  let experiments = Array.from(sharedExperiments.values()).filter(
    e => e.organizationId === organizationId
  );

  if (filters?.ownerId) experiments = experiments.filter(e => e.ownerId === filters.ownerId);
  if (filters?.visibility) experiments = experiments.filter(e => e.sharingConfig.visibility === filters.visibility);
  if (filters?.tag) experiments = experiments.filter(e => e.experimentData.tags.includes(filters.tag!));

  return experiments;
}

export function addDiscussion(
  experimentId: string,
  params: {
    userId: string;
    userName: string;
    type: DiscussionType;
    title: string;
    content: string;
  }
): ExperimentDiscussion {
  const experiment = sharedExperiments.get(experimentId);
  if (!experiment) throw new Error(`Shared experiment ${experimentId} not found`);

  const now = new Date().toISOString();
  const discussion: ExperimentDiscussion = {
    id: randomUUID(),
    userId: params.userId,
    userName: params.userName,
    type: params.type,
    title: params.title,
    content: params.content,
    status: 'open',
    replies: [],
    upvotes: 0,
    createdAt: now,
    updatedAt: now,
  };

  experiment.discussions.push(discussion);
  experiment.updatedAt = now;
  return discussion;
}

export function replyToDiscussion(
  experimentId: string,
  discussionId: string,
  params: { userId: string; userName: string; content: string }
): DiscussionReply {
  const experiment = sharedExperiments.get(experimentId);
  if (!experiment) throw new Error(`Shared experiment ${experimentId} not found`);

  const discussion = experiment.discussions.find(d => d.id === discussionId);
  if (!discussion) throw new Error(`Discussion ${discussionId} not found`);

  const reply: DiscussionReply = {
    id: randomUUID(),
    userId: params.userId,
    userName: params.userName,
    content: params.content,
    upvotes: 0,
    createdAt: new Date().toISOString(),
  };

  discussion.replies.push(reply);
  discussion.updatedAt = new Date().toISOString();
  experiment.updatedAt = new Date().toISOString();
  return reply;
}

export function createExperimentComparison(params: {
  organizationId: string;
  name: string;
  createdBy: string;
  experimentIds: string[];
  comparisonType: ComparisonType;
}): ExperimentComparison {
  const now = new Date().toISOString();
  const id = randomUUID();

  const experiments = params.experimentIds
    .map(id => sharedExperiments.get(id))
    .filter((e): e is SharedExperiment => e !== undefined);

  // Collect all metric names
  const metricNames = new Set<string>();
  experiments.forEach(e => {
    Object.keys(e.experimentData.metrics).forEach(k => {
      if (k !== 'customMetrics') metricNames.add(k);
    });
    Object.keys(e.experimentData.metrics.customMetrics || {}).forEach(k => metricNames.add(k));
  });

  const metrics: ComparisonMetric[] = Array.from(metricNames).map(name => {
    const values = experiments.map(e => ({
      experimentId: e.id,
      experimentName: e.experimentName,
      value: (e.experimentData.metrics as any)[name] || e.experimentData.metrics.customMetrics?.[name] || 0,
    }));

    const best = values.reduce((a, b) => a.value > b.value ? a : b);
    const worst = values.reduce((a, b) => a.value < b.value ? a : b);

    return {
      name,
      values,
      bestExperimentId: best.experimentId,
      difference: best.value - worst.value,
    };
  });

  const insights: ComparisonInsight[] = [];
  metrics.forEach(m => {
    if (m.difference > 0.1) {
      insights.push({
        type: 'improvement',
        description: `Significant difference in ${m.name}: ${m.difference.toFixed(3)}`,
        affectedMetrics: [m.name],
        recommendation: `Investigate configuration differences affecting ${m.name}`,
      });
    }
  });

  const comparison: ExperimentComparison = {
    id,
    name: params.name,
    createdBy: params.createdBy,
    experimentIds: params.experimentIds,
    comparisonType: params.comparisonType,
    metrics,
    visualization: {
      type: 'bar_chart',
      data: metrics,
      config: { title: params.name, xLabel: 'Experiment', yLabel: 'Value' },
    },
    insights,
    createdAt: now,
  };

  experimentComparisons.set(id, comparison);

  // Link to experiments
  experiments.forEach(e => {
    e.comparisons.push(comparison);
  });

  return comparison;
}

export function createCollaborativeNotebook(params: {
  organizationId: string;
  experimentId: string;
  name: string;
  description?: string;
  ownerId: string;
  ownerName: string;
  cells?: Array<{ type: string; content: string; language?: string }>;
}): CollaborativeNotebook {
  const now = new Date().toISOString();
  const id = randomUUID();

  const cells: NotebookCell[] = (params.cells || [
    { type: 'markdown', content: `# ${params.name}\n\nExperiment analysis notebook` },
    { type: 'code', content: 'import numpy as np\nimport matplotlib.pyplot as plt', language: 'python' },
  ]).map((c, i) => ({
    id: randomUUID(),
    type: c.type as any,
    content: c.content,
    language: c.language,
    metadata: {},
    position: i,
  }));

  const notebook: CollaborativeNotebook = {
    id,
    name: params.name,
    description: params.description,
    ownerId: params.ownerId,
    ownerName: params.ownerName,
    cells,
    collaborators: [
      { userId: params.ownerId, userName: params.ownerName, role: 'editor', joinedAt: now },
    ],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  collaborativeNotebooks.set(id, notebook);

  // Link to experiment
  const experiment = sharedExperiments.get(params.experimentId);
  if (experiment) {
    experiment.notebooks.push(notebook);
  }

  return notebook;
}

export function addNotebookCell(
  notebookId: string,
  params: { type: string; content: string; language?: string; position?: number }
): NotebookCell {
  const notebook = collaborativeNotebooks.get(notebookId);
  if (!notebook) throw new Error(`Notebook ${notebookId} not found`);

  const position = params.position ?? notebook.cells.length;
  const cell: NotebookCell = {
    id: randomUUID(),
    type: params.type as any,
    content: params.content,
    language: params.language,
    metadata: {},
    position,
  };

  notebook.cells.splice(position, 0, cell);
  notebook.cells.forEach((c, i) => { c.position = i; });
  notebook.version += 1;
  notebook.updatedAt = new Date().toISOString();
  return cell;
}

export function executeNotebookCell(notebookId: string, cellId: string): CellOutput {
  const notebook = collaborativeNotebooks.get(notebookId);
  if (!notebook) throw new Error(`Notebook ${notebookId} not found`);

  const cell = notebook.cells.find(c => c.id === cellId);
  if (!cell) throw new Error(`Cell ${cellId} not found`);

  const output: CellOutput = {
    type: cell.type === 'code' ? 'text' : 'text',
    data: cell.type === 'code' ? `Executed: ${cell.content.substring(0, 50)}...` : '',
  };

  cell.output = output;
  cell.executionCount = (cell.executionCount || 0) + 1;
  notebook.lastExecutedAt = new Date().toISOString();
  notebook.updatedAt = new Date().toISOString();
  return output;
}

export function addNotebookCollaborator(
  notebookId: string,
  params: { userId: string; userName: string; role: 'editor' | 'viewer' | 'commenter' }
): NotebookCollaborator {
  const notebook = collaborativeNotebooks.get(notebookId);
  if (!notebook) throw new Error(`Notebook ${notebookId} not found`);

  const collaborator: NotebookCollaborator = {
    userId: params.userId,
    userName: params.userName,
    role: params.role,
    joinedAt: new Date().toISOString(),
  };

  notebook.collaborators.push(collaborator);
  notebook.updatedAt = new Date().toISOString();
  return collaborator;
}

export function verifyReproducibility(experimentId: string): ReproducibilityStatus {
  const experiment = sharedExperiments.get(experimentId);
  if (!experiment) throw new Error(`Shared experiment ${experimentId} not found`);

  const envMatch = 0.85 + _rng.next() * 0.15;
  const depMatch = 0.8 + _rng.next() * 0.2;
  const dataMatch = 0.9 + _rng.next() * 0.1;
  const overallScore = (envMatch + depMatch + dataMatch) / 3;

  const issues: ReproducibilityIssue[] = [];
  if (envMatch < 0.95) {
    issues.push({
      type: 'environment',
      severity: envMatch < 0.85 ? 'high' : 'medium',
      description: `Environment match is ${(envMatch * 100).toFixed(1)}%`,
      suggestion: 'Use containerized environment for exact reproducibility',
    });
  }
  if (depMatch < 0.95) {
    issues.push({
      type: 'dependency',
      severity: depMatch < 0.85 ? 'high' : 'low',
      description: `Dependency versions differ`,
      suggestion: 'Pin all dependency versions in requirements.txt',
    });
  }

  const status: ReproducibilityStatus = {
    verified: overallScore >= 0.9,
    verificationDate: new Date().toISOString(),
    verifiedBy: 'system',
    environmentMatch: envMatch * 100,
    dependencyMatch: depMatch * 100,
    dataMatch: dataMatch * 100,
    overallScore: overallScore * 100,
    issues,
  };

  experiment.reproducibility = status;
  experiment.updatedAt = new Date().toISOString();
  return status;
}

export function forkExperiment(experimentId: string, forkedBy: string, forkedByName: string): SharedExperiment {
  const original = sharedExperiments.get(experimentId);
  if (!original) throw new Error(`Shared experiment ${experimentId} not found`);
  if (!original.sharingConfig.allowForking) throw new Error('Forking not allowed for this experiment');

  const fork = shareExperiment({
    organizationId: original.organizationId,
    experimentId: `${original.experimentId}_fork`,
    experimentName: `${original.experimentName} (fork)`,
    ownerId: forkedBy,
    ownerName: forkedByName,
    experimentData: { ...original.experimentData },
    sharingConfig: { visibility: 'private' },
  });

  original.forks += 1;
  return fork;
}

export function getExperimentComparison(id: string): ExperimentComparison | undefined {
  return experimentComparisons.get(id);
}

export function getCollaborativeNotebook(id: string): CollaborativeNotebook | undefined {
  return collaborativeNotebooks.get(id);
}
