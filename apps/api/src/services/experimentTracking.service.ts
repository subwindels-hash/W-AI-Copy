/**
 * Module 39: Experiment Tracking Service
 *
 * Provides comprehensive experiment tracking including parameter logging,
 * metric tracking, artifact management, experiment comparison, lineage
 * tracking, and reproducibility features.
 *
 * Phase 1 — Critical Gap: ML experiment tracking infrastructure
 */

import { randomUUID, createHash } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExperimentStatus = "running" | "completed" | "failed" | "cancelled" | "paused";

export type MetricTrend = "higher_is_better" | "lower_is_better" | "none";

export type ArtifactType = "model" | "dataset" | "plot" | "table" | "text" | "image" | "video" | "audio" | "custom";

export interface Experiment {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: ExperimentStatus;
  tags: string[];
  projectId?: string;
  parentExperimentId?: string;
  datasetId?: string;
  datasetVersion?: string;
  modelId?: string;
  modelVersion?: string;
  framework?: string;
  environment?: Record<string, string>;
  parameters: Record<string, ParameterValue>;
  metrics: Record<string, MetricSeries>;
  artifacts: Artifact[];
  notes: ExperimentNote[];
  startTime: string;
  endTime?: string;
  durationMs?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParameterValue {
  value: unknown;
  type: "number" | "string" | "boolean" | "list" | "dict";
  description?: string;
}

export interface MetricSeries {
  name: string;
  values: MetricPoint[];
  trend: MetricTrend;
  summary?: MetricSummary;
}

export interface MetricPoint {
  value: number;
  step: number;
  timestamp: string;
}

export interface MetricSummary {
  last: number;
  min: number;
  max: number;
  avg: number;
  first: number;
}

export interface Artifact {
  id: string;
  name: string;
  type: ArtifactType;
  uri: string;
  sizeBytes: number;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ExperimentNote {
  id: string;
  content: string;
  createdBy: string;
  createdAt: string;
}

export interface ExperimentComparison {
  experimentIds: string[];
  parameters: Record<string, ComparisonValue[]>;
  metrics: Record<string, ComparisonValue[]>;
  bestExperimentId?: string;
  recommendation?: string;
}

export interface ComparisonValue {
  experimentId: string;
  experimentName: string;
  value: unknown;
  rank?: number;
}

export interface ExperimentLineage {
  experimentId: string;
  datasetId?: string;
  datasetVersion?: string;
  parentExperimentId?: string;
  childExperimentIds: string[];
  modelId?: string;
  modelVersion?: string;
}

export interface ExperimentStats {
  totalExperiments: number;
  experimentsByStatus: Record<string, number>;
  totalRuns: number;
  averageDurationMs: number;
  uniqueUsers: number;
  topTags: Record<string, number>;
  topFrameworks: Record<string, number>;
  totalArtifacts: number;
  totalArtifactsSizeBytes: number;
}

// ─── Redis Keys ───────────────────────────────────────────────────────────────

const EXPERIMENT_KEY = (id: string) => `mlops:experiment:${id}`;
const EXPERIMENTS_KEY = "mlops:experiments";
const EXPERIMENT_PROJECT_KEY = (projectId: string) => `mlops:project:${projectId}:experiments`;
const EXPERIMENT_TAGS_KEY = "mlops:experiment:tags";
const EXPERIMENT_STATS_KEY = "mlops:experiment:stats";

// ─── Service Implementation ───────────────────────────────────────────────────

export const ExperimentTrackingService = {
  /**
   * Create a new experiment
   */
  async create(input: {
    organizationId: string;
    name: string;
    description?: string;
    tags?: string[];
    projectId?: string;
    parentExperimentId?: string;
    datasetId?: string;
    datasetVersion?: string;
    modelId?: string;
    modelVersion?: string;
    framework?: string;
    environment?: Record<string, string>;
    parameters?: Record<string, unknown>;
    createdBy: string;
  }): Promise<Experiment> {
    const id = randomUUID();
    const now = new Date().toISOString();

    const experiment: Experiment = {
      id,
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      status: "running",
      tags: input.tags ?? [],
      projectId: input.projectId,
      parentExperimentId: input.parentExperimentId,
      datasetId: input.datasetId,
      datasetVersion: input.datasetVersion,
      modelId: input.modelId,
      modelVersion: input.modelVersion,
      framework: input.framework,
      environment: input.environment,
      parameters: this._convertParameters(input.parameters ?? {}),
      metrics: {},
      artifacts: [],
      notes: [],
      startTime: now,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };

    await redis.set(EXPERIMENT_KEY(id), JSON.stringify(experiment));
    await redis.sadd(EXPERIMENTS_KEY, id);

    if (input.projectId) {
      await redis.sadd(EXPERIMENT_PROJECT_KEY(input.projectId), id);
    }

    for (const tag of experiment.tags) {
      await redis.sadd(EXPERIMENT_TAGS_KEY, tag);
    }

    return experiment;
  },

  /**
   * Get experiment by ID
   */
  async get(id: string): Promise<Experiment | null> {
    const raw = await redis.get(EXPERIMENT_KEY(id));
    return raw ? JSON.parse(raw) as Experiment : null;
  },

  /**
   * List experiments with filters
   */
  async list(filters?: {
    organizationId?: string;
    projectId?: string;
    status?: ExperimentStatus;
    tags?: string[];
    createdBy?: string;
    limit?: number;
    offset?: number;
  }): Promise<Experiment[]> {
    let ids: string[];

    if (filters?.projectId) {
      ids = await redis.smembers(EXPERIMENT_PROJECT_KEY(filters.projectId));
    } else {
      ids = await redis.smembers(EXPERIMENTS_KEY);
    }

    const experiments: Experiment[] = [];
    for (const id of ids) {
      const exp = await this.get(id);
      if (!exp) continue;

      if (filters?.organizationId && exp.organizationId !== filters.organizationId) continue;
      if (filters?.status && exp.status !== filters.status) continue;
      if (filters?.tags && !filters.tags.every(tag => exp.tags.includes(tag))) continue;
      if (filters?.createdBy && exp.createdBy !== filters.createdBy) continue;

      experiments.push(exp);
    }

    // Sort by creation time (newest first)
    experiments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;
    return experiments.slice(offset, offset + limit);
  },

  /**
   * Update experiment status
   */
  async updateStatus(id: string, status: ExperimentStatus): Promise<Experiment | null> {
    const exp = await this.get(id);
    if (!exp) return null;

    exp.status = status;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      exp.endTime = new Date().toISOString();
      exp.durationMs = new Date(exp.endTime).getTime() - new Date(exp.startTime).getTime();
    }
    exp.updatedAt = new Date().toISOString();

    await redis.set(EXPERIMENT_KEY(id), JSON.stringify(exp));
    return exp;
  },

  /**
   * Log parameters
   */
  async logParameters(id: string, parameters: Record<string, unknown>): Promise<Experiment | null> {
    const exp = await this.get(id);
    if (!exp) return null;

    const converted = this._convertParameters(parameters);
    exp.parameters = { ...exp.parameters, ...converted };
    exp.updatedAt = new Date().toISOString();

    await redis.set(EXPERIMENT_KEY(id), JSON.stringify(exp));
    return exp;
  },

  /**
   * Log a single metric value
   */
  async logMetric(
    id: string,
    metricName: string,
    value: number,
    step?: number,
    trend: MetricTrend = "higher_is_better"
  ): Promise<Experiment | null> {
    const exp = await this.get(id);
    if (!exp) return null;

    const now = new Date().toISOString();
    const currentStep = step ?? (exp.metrics[metricName]?.values.length ?? 0);

    if (!exp.metrics[metricName]) {
      exp.metrics[metricName] = {
        name: metricName,
        values: [],
        trend,
      };
    }

    exp.metrics[metricName].values.push({
      value,
      step: currentStep,
      timestamp: now,
    });

    // Update summary
    exp.metrics[metricName].summary = this._calculateSummary(exp.metrics[metricName].values);

    exp.updatedAt = now;
    await redis.set(EXPERIMENT_KEY(id), JSON.stringify(exp));
    return exp;
  },

  /**
   * Log multiple metrics at once
   */
  async logMetrics(
    id: string,
    metrics: Record<string, number>,
    step?: number
  ): Promise<Experiment | null> {
    const exp = await this.get(id);
    if (!exp) return null;

    for (const [name, value] of Object.entries(metrics)) {
      await this.logMetric(id, name, value, step);
    }

    return this.get(id);
  },

  /**
   * Log an artifact
   */
  async logArtifact(
    id: string,
    input: {
      name: string;
      type: ArtifactType;
      uri: string;
      sizeBytes: number;
      mimeType?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Experiment | null> {
    const exp = await this.get(id);
    if (!exp) return null;

    const artifact: Artifact = {
      id: randomUUID(),
      name: input.name,
      type: input.type,
      uri: input.uri,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    };

    exp.artifacts.push(artifact);
    exp.updatedAt = new Date().toISOString();

    await redis.set(EXPERIMENT_KEY(id), JSON.stringify(exp));
    return exp;
  },

  /**
   * Add a note to experiment
   */
  async addNote(id: string, content: string, createdBy: string): Promise<Experiment | null> {
    const exp = await this.get(id);
    if (!exp) return null;

    const note: ExperimentNote = {
      id: randomUUID(),
      content,
      createdBy,
      createdAt: new Date().toISOString(),
    };

    exp.notes.push(note);
    exp.updatedAt = new Date().toISOString();

    await redis.set(EXPERIMENT_KEY(id), JSON.stringify(exp));
    return exp;
  },

  /**
   * Add tags to experiment
   */
  async addTags(id: string, tags: string[]): Promise<Experiment | null> {
    const exp = await this.get(id);
    if (!exp) return null;

    for (const tag of tags) {
      if (!exp.tags.includes(tag)) {
        exp.tags.push(tag);
        await redis.sadd(EXPERIMENT_TAGS_KEY, tag);
      }
    }

    exp.updatedAt = new Date().toISOString();
    await redis.set(EXPERIMENT_KEY(id), JSON.stringify(exp));
    return exp;
  },

  /**
   * Remove tags from experiment
   */
  async removeTags(id: string, tags: string[]): Promise<Experiment | null> {
    const exp = await this.get(id);
    if (!exp) return null;

    exp.tags = exp.tags.filter(tag => !tags.includes(tag));
    exp.updatedAt = new Date().toISOString();

    await redis.set(EXPERIMENT_KEY(id), JSON.stringify(exp));
    return exp;
  },

  /**
   * Compare multiple experiments
   */
  async compare(experimentIds: string[], metricName?: string): Promise<ExperimentComparison> {
    const experiments = await Promise.all(experimentIds.map(id => this.get(id)));
    const validExperiments = experiments.filter((e): e is Experiment => e !== null);

    const comparison: ExperimentComparison = {
      experimentIds: validExperiments.map(e => e.id),
      parameters: {},
      metrics: {},
    };

    // Collect all parameter names
    const paramNames = new Set<string>();
    for (const exp of validExperiments) {
      for (const name of Object.keys(exp.parameters)) {
        paramNames.add(name);
      }
    }

    // Build parameter comparison
    for (const name of paramNames) {
      comparison.parameters[name] = validExperiments.map(exp => ({
        experimentId: exp.id,
        experimentName: exp.name,
        value: exp.parameters[name]?.value,
      }));
    }

    // Collect all metric names
    const metricNames = new Set<string>();
    for (const exp of validExperiments) {
      for (const name of Object.keys(exp.metrics)) {
        metricNames.add(name);
      }
    }

    // Build metric comparison
    for (const name of metricNames) {
      const values: ComparisonValue[] = validExperiments
        .filter(exp => exp.metrics[name]?.summary)
        .map(exp => ({
          experimentId: exp.id,
          experimentName: exp.name,
          value: exp.metrics[name].summary!.last,
        }));

      // Sort and rank
      const trend = validExperiments.find(e => e.metrics[name])?.metrics[name]?.trend ?? "higher_is_better";
      values.sort((a, b) => {
        const diff = (b.value as number) - (a.value as number);
        return trend === "higher_is_better" ? diff : -diff;
      });

      values.forEach((v, i) => { v.rank = i + 1; });

      comparison.metrics[name] = values;
    }

    // Determine best experiment
    if (metricName && comparison.metrics[metricName]) {
      const best = comparison.metrics[metricName][0];
      if (best) {
        comparison.bestExperimentId = best.experimentId;
        comparison.recommendation = `Experiment "${best.experimentName}" achieved the best ${metricName} with value ${best.value}`;
      }
    }

    return comparison;
  },

  /**
   * Get experiment lineage
   */
  async getLineage(id: string): Promise<ExperimentLineage | null> {
    const exp = await this.get(id);
    if (!exp) return null;

    // Find child experiments
    const allIds = await redis.smembers(EXPERIMENTS_KEY);
    const childExperimentIds: string[] = [];

    for (const childId of allIds) {
      const child = await this.get(childId);
      if (child?.parentExperimentId === id) {
        childExperimentIds.push(childId);
      }
    }

    return {
      experimentId: id,
      datasetId: exp.datasetId,
      datasetVersion: exp.datasetVersion,
      parentExperimentId: exp.parentExperimentId,
      childExperimentIds,
      modelId: exp.modelId,
      modelVersion: exp.modelVersion,
    };
  },

  /**
   * Search experiments by name, description, or tags
   */
  async search(query: string, organizationId?: string): Promise<Experiment[]> {
    const ids = await redis.smembers(EXPERIMENTS_KEY);
    const results: Experiment[] = [];
    const q = query.toLowerCase();

    for (const id of ids) {
      const exp = await this.get(id);
      if (!exp) continue;

      if (organizationId && exp.organizationId !== organizationId) continue;

      const matchesName = exp.name.toLowerCase().includes(q);
      const matchesDescription = exp.description?.toLowerCase().includes(q) ?? false;
      const matchesTags = exp.tags.some(tag => tag.toLowerCase().includes(q));

      if (matchesName || matchesDescription || matchesTags) {
        results.push(exp);
      }
    }

    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /**
   * Delete an experiment
   */
  async delete(id: string): Promise<boolean> {
    const exp = await this.get(id);
    if (!exp) return false;

    await redis.del(EXPERIMENT_KEY(id));
    await redis.srem(EXPERIMENTS_KEY, id);

    if (exp.projectId) {
      await redis.srem(EXPERIMENT_PROJECT_KEY(exp.projectId), id);
    }

    return true;
  },

  /**
   * Get all unique tags
   */
  async getAllTags(): Promise<string[]> {
    return redis.smembers(EXPERIMENT_TAGS_KEY);
  },

  /**
   * Get experiment statistics
   */
  async getStats(organizationId?: string): Promise<ExperimentStats> {
    const ids = await redis.smembers(EXPERIMENTS_KEY);
    const experiments: Experiment[] = [];

    for (const id of ids) {
      const exp = await this.get(id);
      if (exp && (!organizationId || exp.organizationId === organizationId)) {
        experiments.push(exp);
      }
    }

    const stats: ExperimentStats = {
      totalExperiments: experiments.length,
      experimentsByStatus: {},
      totalRuns: experiments.length,
      averageDurationMs: 0,
      uniqueUsers: 0,
      topTags: {},
      topFrameworks: {},
      totalArtifacts: 0,
      totalArtifactsSizeBytes: 0,
    };

    const users = new Set<string>();
    let totalDuration = 0;
    let durationCount = 0;

    for (const exp of experiments) {
      // Status counts
      stats.experimentsByStatus[exp.status] = (stats.experimentsByStatus[exp.status] ?? 0) + 1;

      // Duration
      if (exp.durationMs) {
        totalDuration += exp.durationMs;
        durationCount++;
      }

      // Users
      users.add(exp.createdBy);

      // Tags
      for (const tag of exp.tags) {
        stats.topTags[tag] = (stats.topTags[tag] ?? 0) + 1;
      }

      // Frameworks
      if (exp.framework) {
        stats.topFrameworks[exp.framework] = (stats.topFrameworks[exp.framework] ?? 0) + 1;
      }

      // Artifacts
      stats.totalArtifacts += exp.artifacts.length;
      for (const artifact of exp.artifacts) {
        stats.totalArtifactsSizeBytes += artifact.sizeBytes;
      }
    }

    stats.averageDurationMs = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
    stats.uniqueUsers = users.size;

    return stats;
  },

  /**
   * Export experiment to JSON
   */
  async export(id: string): Promise<Record<string, unknown> | null> {
    const exp = await this.get(id);
    if (!exp) return null;

    return {
      experiment: exp,
      exportedAt: new Date().toISOString(),
      version: "1.0",
    };
  },

  // ─── Helper Methods ─────────────────────────────────────────────────────────

  _convertParameters(params: Record<string, unknown>): Record<string, ParameterValue> {
    const result: Record<string, ParameterValue> = {};

    for (const [key, value] of Object.entries(params)) {
      let type: ParameterValue["type"] = "string";
      if (typeof value === "number") type = "number";
      else if (typeof value === "boolean") type = "boolean";
      else if (Array.isArray(value)) type = "list";
      else if (typeof value === "object" && value !== null) type = "dict";

      result[key] = { value, type };
    }

    return result;
  },

  _calculateSummary(values: MetricPoint[]): MetricSummary {
    if (values.length === 0) {
      return { last: 0, min: 0, max: 0, avg: 0, first: 0 };
    }

    const nums = values.map(v => v.value);
    return {
      first: nums[0],
      last: nums[nums.length - 1],
      min: Math.min(...nums),
      max: Math.max(...nums),
      avg: nums.reduce((a, b) => a + b, 0) / nums.length,
    };
  },
};
