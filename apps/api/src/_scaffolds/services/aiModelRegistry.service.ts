/**
 * Module 122: AI Model Registry Service
 * WINDELS AI OS - Phase 3
 * 
 * Provides centralized model registry capabilities including model versioning,
 * metadata management, model discovery, lineage tracking, and model lifecycle
 * management across the organization.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiModelRegistry');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ModelRegistry {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: RegistryStatus;
  models: RegisteredModel[];
  tags: string[];
  accessControl: RegistryAccessControl;
  createdAt: string;
  updatedAt: string;
}

export type RegistryStatus = 'active' | 'archived' | 'readonly';

export interface RegisteredModel {
  id: string;
  registryId: string;
  name: string;
  description?: string;
  owner: string;
  tags: string[];
  versions: ModelVersion[];
  latestVersion: string;
  metadata: ModelMetadata;
  status: ModelStatus;
  createdAt: string;
  updatedAt: string;
}

export type ModelStatus = 'active' | 'deprecated' | 'archived' | 'experimental';

export interface ModelVersion {
  id: string;
  modelId: string;
  version: string;
  stage: ModelStage;
  source: VersionSource;
  artifacts: ModelArtifact[];
  metrics: VersionMetrics;
  metadata: VersionMetadata;
  dependencies: string[];
  createdAt: string;
  createdBy: string;
}

export type ModelStage =
  | 'development'
  | 'staging'
  | 'production'
  | 'archived';

export interface VersionSource {
  type: 'training' | 'import' | 'fork' | 'migration';
  trainingJobId?: string;
  parentVersionId?: string;
  sourceUri?: string;
}

export interface ModelArtifact {
  id: string;
  name: string;
  type: ArtifactType;
  uri: string;
  sizeBytes: number;
  checksum: string;
  metadata: Record<string, any>;
}

export type ArtifactType =
  | 'model_weights'
  | 'config'
  | 'tokenizer'
  | 'preprocessor'
  | 'postprocessor'
  | 'documentation'
  | 'example';

export interface VersionMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  latency?: number;
  throughput?: number;
  modelSize?: number;
  customMetrics?: Record<string, number>;
}

export interface ModelMetadata {
  framework: string;
  task: string;
  domain: string;
  license: string;
  dataset?: string;
  trainingDuration?: number;
  hardwareRequirements?: HardwareRequirements;
}

export interface HardwareRequirements {
  minMemoryMB: number;
  recommendedMemoryMB: number;
  gpuRequired: boolean;
  gpuMemoryMB?: number;
  cpuCores?: number;
}

export interface VersionMetadata {
  changelog: string;
  approvedBy?: string;
  approvedAt?: string;
  deploymentCount: number;
  lastDeployedAt?: string;
  lineage?: ModelLineage;
}

export interface ModelLineage {
  parentVersionId?: string;
  trainingJobId?: string;
  datasetVersionId?: string;
  experimentId?: string;
  upstreamModels: string[];
  downstreamModels: string[];
}

export interface RegistryAccessControl {
  visibility: 'public' | 'organization' | 'private';
  allowedUsers: string[];
  allowedTeams: string[];
  permissions: RegistryPermission[];
}

export interface RegistryPermission {
  userId: string;
  role: 'owner' | 'admin' | 'contributor' | 'viewer';
  grantedAt: string;
  grantedBy: string;
}

export interface ModelSearchResult {
  models: RegisteredModel[];
  total: number;
  facets: SearchFacets;
}

export interface SearchFacets {
  tags: Array<{ name: string; count: number }>;
  frameworks: Array<{ name: string; count: number }>;
  tasks: Array<{ name: string; count: number }>;
  stages: Array<{ stage: ModelStage; count: number }>;
}

export interface ModelComparison {
  models: Array<{
    modelId: string;
    modelName: string;
    version: string;
    metrics: VersionMetrics;
    metadata: ModelMetadata;
  }>;
  comparison: ComparisonResult;
}

export interface ComparisonResult {
  metricComparisons: Array<{
    metric: string;
    values: Array<{ modelId: string; value: number }>;
    best: string;
  }>;
  recommendations: string[];
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const modelRegistries = new Map<string, ModelRegistry>();
const registeredModels = new Map<string, RegisteredModel>();
const modelVersions = new Map<string, ModelVersion[]>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateVersionNumber(existingVersions: ModelVersion[]): string {
  if (existingVersions.length === 0) return '1.0.0';
  
  const latestVersion = existingVersions
    .map(v => v.version)
    .sort((a, b) => {
      const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
      const [bMajor, bMinor, bPatch] = b.split('.').map(Number);
      if (aMajor !== bMajor) return bMajor - aMajor;
      if (aMinor !== bMinor) return bMinor - aMinor;
      return bPatch - aPatch;
    })[0];
  
  const [major, minor, patch] = latestVersion.split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createModelRegistry(params: {
  organizationId: string;
  name: string;
  description?: string;
  accessControl?: Partial<RegistryAccessControl>;
}): ModelRegistry {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultAccessControl: RegistryAccessControl = {
    visibility: 'organization',
    allowedUsers: [],
    allowedTeams: [],
    permissions: [],
  };

  const registry: ModelRegistry = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'active',
    models: [],
    tags: [],
    accessControl: { ...defaultAccessControl, ...params.accessControl },
    createdAt: now,
    updatedAt: now,
  };

  modelRegistries.set(id, registry);
  return registry;
}

export function getModelRegistry(id: string): ModelRegistry | undefined {
  return modelRegistries.get(id);
}

export function listModelRegistries(
  organizationId: string,
  filters?: { status?: RegistryStatus }
): ModelRegistry[] {
  let result = Array.from(modelRegistries.values()).filter(
    r => r.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(r => r.status === filters.status);

  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function registerModel(params: {
  registryId: string;
  name: string;
  description?: string;
  owner: string;
  tags?: string[];
  metadata: ModelMetadata;
}): RegisteredModel {
  const registry = modelRegistries.get(params.registryId);
  if (!registry) throw new Error(`Model registry ${params.registryId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const model: RegisteredModel = {
    id,
    registryId: params.registryId,
    name: params.name,
    description: params.description,
    owner: params.owner,
    tags: params.tags || [],
    versions: [],
    latestVersion: '0.0.0',
    metadata: params.metadata,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  registeredModels.set(id, model);
  modelVersions.set(id, []);

  registry.models.push(model);
  registry.updatedAt = now;

  return model;
}

export function getRegisteredModel(id: string): RegisteredModel | undefined {
  return registeredModels.get(id);
}

export function listRegisteredModels(
  registryId: string,
  filters?: { status?: ModelStatus; tag?: string; owner?: string }
): RegisteredModel[] {
  let result = Array.from(registeredModels.values()).filter(
    m => m.registryId === registryId
  );

  if (filters?.status) result = result.filter(m => m.status === filters.status);
  if (filters?.tag) result = result.filter(m => m.tags.includes(filters.tag!));
  if (filters?.owner) result = result.filter(m => m.owner === filters.owner);

  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createModelVersion(params: {
  modelId: string;
  source: VersionSource;
  artifacts: Omit<ModelArtifact, 'id'>[];
  metrics: VersionMetrics;
  metadata: Omit<VersionMetadata, 'deploymentCount'>;
  createdBy: string;
}): ModelVersion {
  const model = registeredModels.get(params.modelId);
  if (!model) throw new Error(`Registered model ${params.modelId} not found`);

  const now = new Date().toISOString();
  const versions = modelVersions.get(params.modelId) || [];
  const versionNumber = generateVersionNumber(versions);

  const version: ModelVersion = {
    id: randomUUID(),
    modelId: params.modelId,
    version: versionNumber,
    stage: 'development',
    source: params.source,
    artifacts: params.artifacts.map(a => ({ ...a, id: randomUUID() })),
    metrics: params.metrics,
    metadata: { ...params.metadata, deploymentCount: 0 },
    dependencies: [],
    createdAt: now,
    createdBy: params.createdBy,
  };

  versions.push(version);
  modelVersions.set(params.modelId, versions);

  model.versions = versions;
  model.latestVersion = versionNumber;
  model.updatedAt = now;

  return version;
}

export function getModelVersions(modelId: string): ModelVersion[] {
  return modelVersions.get(modelId) || [];
}

export function getModelVersion(modelId: string, version: string): ModelVersion | undefined {
  const versions = modelVersions.get(modelId) || [];
  return versions.find(v => v.version === version);
}

export function transitionModelStage(
  modelId: string,
  version: string,
  targetStage: ModelStage,
  approvedBy?: string
): ModelVersion {
  const versions = modelVersions.get(modelId);
  if (!versions) throw new Error(`Model ${modelId} not found`);

  const modelVersion = versions.find(v => v.version === version);
  if (!modelVersion) throw new Error(`Version ${version} not found`);

  modelVersion.stage = targetStage;

  if (approvedBy) {
    modelVersion.metadata.approvedBy = approvedBy;
    modelVersion.metadata.approvedAt = new Date().toISOString();
  }

  return modelVersion;
}

export function searchModels(
  registryId: string,
  query: string,
  filters?: { tag?: string; framework?: string; task?: string; stage?: ModelStage }
): ModelSearchResult {
  let models = Array.from(registeredModels.values()).filter(
    m => m.registryId === registryId
  );

  // Search in name, description, and tags
  const queryLower = query.toLowerCase();
  if (query) {
    models = models.filter(m =>
      m.name.toLowerCase().includes(queryLower) ||
      (m.description && m.description.toLowerCase().includes(queryLower)) ||
      m.tags.some(t => t.toLowerCase().includes(queryLower))
    );
  }

  // Apply filters
  if (filters?.tag) models = models.filter(m => m.tags.includes(filters.tag!));
  if (filters?.framework) models = models.filter(m => m.metadata.framework === filters.framework);
  if (filters?.task) models = models.filter(m => m.metadata.task === filters.task);
  if (filters?.stage) {
    models = models.filter(m => {
      const versions = modelVersions.get(m.id) || [];
      return versions.some(v => v.stage === filters.stage);
    });
  }

  // Calculate facets
  const tagCounts = new Map<string, number>();
  const frameworkCounts = new Map<string, number>();
  const taskCounts = new Map<string, number>();
  const stageCounts = new Map<ModelStage, number>();

  models.forEach(model => {
    model.tags.forEach(tag => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
    frameworkCounts.set(model.metadata.framework, (frameworkCounts.get(model.metadata.framework) || 0) + 1);
    taskCounts.set(model.metadata.task, (taskCounts.get(model.metadata.task) || 0) + 1);

    const versions = modelVersions.get(model.id) || [];
    versions.forEach(v => {
      stageCounts.set(v.stage, (stageCounts.get(v.stage) || 0) + 1);
    });
  });

  return {
    models,
    total: models.length,
    facets: {
      tags: Array.from(tagCounts.entries()).map(([name, count]) => ({ name, count })),
      frameworks: Array.from(frameworkCounts.entries()).map(([name, count]) => ({ name, count })),
      tasks: Array.from(taskCounts.entries()).map(([name, count]) => ({ name, count })),
      stages: Array.from(stageCounts.entries()).map(([stage, count]) => ({ stage, count })),
    },
  };
}

export function compareModels(
  modelVersionIds: string[]
): ModelComparison {
  const models = modelVersionIds.map(id => {
    for (const [modelId, versions] of modelVersions.entries()) {
      const version = versions.find(v => v.id === id);
      if (version) {
        const model = registeredModels.get(modelId);
        return {
          modelId,
          modelName: model?.name || 'Unknown',
          version: version.version,
          metrics: version.metrics,
          metadata: model?.metadata || { framework: '', task: '', domain: '', license: '' },
        };
      }
    }
    throw new Error(`Model version ${id} not found`);
  });

  // Compare metrics
  const metricComparisons: Array<{
    metric: string;
    values: Array<{ modelId: string; value: number }>;
    best: string;
  }> = [];

  const allMetrics = new Set<string>();
  models.forEach(m => {
    Object.keys(m.metrics).forEach(key => {
      if (key !== 'customMetrics') allMetrics.add(key);
    });
  });

  allMetrics.forEach(metric => {
    const values = models
      .map(m => ({
        modelId: m.modelId,
        value: (m.metrics as any)[metric] || 0,
      }))
      .filter(v => v.value > 0);

    if (values.length > 0) {
      const best = values.reduce((a, b) => a.value > b.value ? a : b);
      metricComparisons.push({ metric, values, best: best.modelId });
    }
  });

  const recommendations: string[] = [];
  if (metricComparisons.length > 0) {
    const bestModel = metricComparisons[0].best;
    recommendations.push(`Model ${bestModel} shows best overall performance`);
  }

  return {
    models,
    comparison: {
      metricComparisons,
      recommendations,
    },
  };
}

export function getModelLineage(modelId: string, version: string): ModelLineage | undefined {
  const modelVersion = getModelVersion(modelId, version);
  return modelVersion?.metadata.lineage;
}

export function updateModelMetadata(
  modelId: string,
  metadata: Partial<ModelMetadata>
): RegisteredModel {
  const model = registeredModels.get(modelId);
  if (!model) throw new Error(`Model ${modelId} not found`);

  Object.assign(model.metadata, metadata);
  model.updatedAt = new Date().toISOString();

  return model;
}

export function deprecateModel(modelId: string): RegisteredModel {
  const model = registeredModels.get(modelId);
  if (!model) throw new Error(`Model ${modelId} not found`);

  model.status = 'deprecated';
  model.updatedAt = new Date().toISOString();

  return model;
}

export function archiveModel(modelId: string): RegisteredModel {
  const model = registeredModels.get(modelId);
  if (!model) throw new Error(`Model ${modelId} not found`);

  model.status = 'archived';
  model.updatedAt = new Date().toISOString();

  return model;
}

export function getModelStatistics(registryId: string): {
  totalModels: number;
  totalVersions: number;
  modelsByStage: Record<ModelStage, number>;
  modelsByFramework: Record<string, number>;
  recentActivity: Array<{ date: string; count: number }>;
} {
  const models = Array.from(registeredModels.values()).filter(
    m => m.registryId === registryId
  );

  let totalVersions = 0;
  const modelsByStage: Record<string, number> = {
    development: 0,
    staging: 0,
    production: 0,
    archived: 0,
  };
  const modelsByFramework: Record<string, number> = {};

  models.forEach(model => {
    const versions = modelVersions.get(model.id) || [];
    totalVersions += versions.length;

    versions.forEach(v => {
      modelsByStage[v.stage] = (modelsByStage[v.stage] || 0) + 1;
    });

    modelsByFramework[model.metadata.framework] = 
      (modelsByFramework[model.metadata.framework] || 0) + 1;
  });

  // Generate recent activity (simplified)
  const recentActivity = Array(7).fill(0).map((_, i) => ({
    date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    count: Math.floor(_rng.next() * 10),
  })).reverse();

  return {
    totalModels: models.length,
    totalVersions,
    modelsByStage: modelsByStage as Record<ModelStage, number>,
    modelsByFramework,
    recentActivity,
  };
}
