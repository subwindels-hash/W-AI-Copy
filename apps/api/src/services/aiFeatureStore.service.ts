/**
 * Module 142: AI Feature Store Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides feature store capabilities for AI models including feature management,
 * feature versioning, online/offline feature serving, feature monitoring, and
 * feature sharing across teams and projects.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FeatureGroup {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: FeatureGroupStatus;
  project: string;
  owner: string;
  features: Feature[];
  entity: EntityDefinition;
  source: FeatureSource;
  transformation?: FeatureTransformation;
  statistics: FeatureStatistics;
  createdAt: string;
  updatedAt: string;
}

export type FeatureGroupStatus =
  | 'draft'
  | 'active'
  | 'deprecated'
  | 'archived';

export interface Feature {
  id: string;
  name: string;
  type: FeatureType;
  description?: string;
  tags: string[];
  owner: string;
  transformation?: string;
  statistics: FeatureStatistics;
  createdAt: string;
  updatedAt: string;
}

export type FeatureType =
  | 'numerical'
  | 'categorical'
  | 'text'
  | 'embedding'
  | 'array'
  | 'timestamp'
  | 'boolean';

export interface EntityDefinition {
  name: string;
  type: string;
  joinKeys: string[];
}

export interface FeatureSource {
  type: 'batch' | 'stream' | 'api' | 'database';
  location: string;
  format: string;
  schedule?: string;
  timestampField?: string;
}

export interface FeatureTransformation {
  type: 'sql' | 'python' | 'builtin';
  code: string;
  dependencies?: string[];
}

export interface FeatureStatistics {
  count: number;
  nullCount: number;
  distinctCount: number;
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
  distribution?: DistributionBucket[];
  lastUpdated: string;
}

export interface DistributionBucket {
  lower: number;
  upper: number;
  count: number;
}

export interface FeatureView {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  featureGroups: string[];
  features: string[];
  entity: EntityDefinition;
  onlineEnabled: boolean;
  offlineEnabled: boolean;
  ttl: number; // seconds
  createdAt: string;
  updatedAt: string;
}

export interface FeatureService {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  featureViews: string[];
  status: 'active' | 'inactive';
  endpoint: string;
  authentication: boolean;
  rateLimit?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OnlineFeatureRequest {
  entityKeys: Record<string, any>;
  featureView: string;
  features?: string[];
}

export interface OnlineFeatureResponse {
  entityKeys: Record<string, any>;
  features: Record<string, any>;
  metadata: {
    timestamp: string;
    source: string;
    latency: number;
  };
}

export interface OfflineFeatureRequest {
  entityKeys: Record<string, any>[];
  featureView: string;
  features?: string[];
  startTime?: string;
  endTime?: string;
}

export interface OfflineFeatureResponse {
  data: Record<string, any>[];
  metadata: {
    count: number;
    timestamp: string;
    source: string;
  };
}

export interface FeatureMonitoring {
  id: string;
  featureId: string;
  featureGroupId: string;
  checks: FeatureCheck[];
  alerts: FeatureAlert[];
  driftDetection: DriftDetectionConfig;
  lastCheckAt?: string;
  status: 'active' | 'paused' | 'disabled';
}

export interface FeatureCheck {
  id: string;
  type: 'distribution' | 'outlier' | 'missing' | 'drift' | 'custom';
  threshold: number;
  lastValue?: number;
  lastCheck?: string;
  status: 'pass' | 'fail' | 'warning';
}

export interface FeatureAlert {
  id: string;
  type: 'drift' | 'outlier' | 'missing' | 'quality';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  detectedAt: string;
  acknowledged: boolean;
  resolvedAt?: string;
}

export interface DriftDetectionConfig {
  enabled: boolean;
  method: 'ks_test' | 'psi' | 'wasserstein' | 'custom';
  threshold: number;
  baselineWindow: number; // days
  comparisonWindow: number; // days
}

export interface FeatureLineage {
  featureId: string;
  upstream: LineageNode[];
  downstream: LineageNode[];
  transformations: TransformationNode[];
}

export interface LineageNode {
  id: string;
  name: string;
  type: 'source' | 'feature_group' | 'feature_view' | 'model';
  timestamp: string;
}

export interface TransformationNode {
  id: string;
  type: string;
  code: string;
  inputs: string[];
  outputs: string[];
  timestamp: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const featureGroups = new Map<string, FeatureGroup>();
const featureViews = new Map<string, FeatureView>();
const featureServices = new Map<string, FeatureService>();
const featureMonitoring = new Map<string, FeatureMonitoring>();
const onlineStore = new Map<string, Map<string, Record<string, any>>>();
const offlineStore = new Map<string, Record<string, any>[]>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createFeatureGroup(params: {
  organizationId: string;
  name: string;
  description?: string;
  project: string;
  owner: string;
  features: Omit<Feature, 'id' | 'statistics' | 'createdAt' | 'updatedAt'>[];
  entity: EntityDefinition;
  source: FeatureSource;
  transformation?: FeatureTransformation;
}): FeatureGroup {
  const now = new Date().toISOString();
  const id = randomUUID();

  const features: Feature[] = params.features.map(f => ({
    ...f,
    id: randomUUID(),
    statistics: {
      count: 0,
      nullCount: 0,
      distinctCount: 0,
      lastUpdated: now,
    },
    createdAt: now,
    updatedAt: now,
  }));

  const featureGroup: FeatureGroup = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'active',
    project: params.project,
    owner: params.owner,
    features,
    entity: params.entity,
    source: params.source,
    transformation: params.transformation,
    statistics: {
      count: 0,
      nullCount: 0,
      distinctCount: 0,
      lastUpdated: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  featureGroups.set(id, featureGroup);
  return featureGroup;
}

export function getFeatureGroup(id: string): FeatureGroup | undefined {
  return featureGroups.get(id);
}

export function listFeatureGroups(
  organizationId: string,
  filters?: { project?: string; status?: FeatureGroupStatus; tag?: string }
): FeatureGroup[] {
  let result = Array.from(featureGroups.values()).filter(
    fg => fg.organizationId === organizationId
  );

  if (filters?.project) result = result.filter(fg => fg.project === filters.project);
  if (filters?.status) result = result.filter(fg => fg.status === filters.status);
  if (filters?.tag) {
    result = result.filter(fg => 
      fg.features.some(f => f.tags.includes(filters.tag!))
    );
  }

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateFeatureGroup(
  featureGroupId: string,
  updates: Partial<FeatureGroup>
): FeatureGroup {
  const featureGroup = featureGroups.get(featureGroupId);
  if (!featureGroup) throw new Error(`Feature group ${featureGroupId} not found`);

  Object.assign(featureGroup, updates);
  featureGroup.updatedAt = new Date().toISOString();

  return featureGroup;
}

export function addFeature(
  featureGroupId: string,
  feature: Omit<Feature, 'id' | 'statistics' | 'createdAt' | 'updatedAt'>
): FeatureGroup {
  const featureGroup = featureGroups.get(featureGroupId);
  if (!featureGroup) throw new Error(`Feature group ${featureGroupId} not found`);

  const now = new Date().toISOString();
  const newFeature: Feature = {
    ...feature,
    id: randomUUID(),
    statistics: {
      count: 0,
      nullCount: 0,
      distinctCount: 0,
      lastUpdated: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  featureGroup.features.push(newFeature);
  featureGroup.updatedAt = now;

  return featureGroup;
}

export function updateFeatureStatistics(
  featureGroupId: string,
  featureId: string,
  statistics: Partial<FeatureStatistics>
): FeatureGroup {
  const featureGroup = featureGroups.get(featureGroupId);
  if (!featureGroup) throw new Error(`Feature group ${featureGroupId} not found`);

  const feature = featureGroup.features.find(f => f.id === featureId);
  if (!feature) throw new Error(`Feature ${featureId} not found`);

  Object.assign(feature.statistics, statistics);
  feature.statistics.lastUpdated = new Date().toISOString();
  feature.updatedAt = new Date().toISOString();

  return featureGroup;
}

export function createFeatureView(params: {
  organizationId: string;
  name: string;
  description?: string;
  featureGroups: string[];
  features: string[];
  entity: EntityDefinition;
  onlineEnabled?: boolean;
  offlineEnabled?: boolean;
  ttl?: number;
}): FeatureView {
  const now = new Date().toISOString();
  const id = randomUUID();

  const featureView: FeatureView = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    featureGroups: params.featureGroups,
    features: params.features,
    entity: params.entity,
    onlineEnabled: params.onlineEnabled ?? true,
    offlineEnabled: params.offlineEnabled ?? true,
    ttl: params.ttl ?? 3600,
    createdAt: now,
    updatedAt: now,
  };

  featureViews.set(id, featureView);
  return featureView;
}

export function getFeatureView(id: string): FeatureView | undefined {
  return featureViews.get(id);
}

export function listFeatureViews(
  organizationId: string,
  filters?: { featureGroup?: string; onlineEnabled?: boolean }
): FeatureView[] {
  let result = Array.from(featureViews.values()).filter(
    fv => fv.organizationId === organizationId
  );

  if (filters?.featureGroup) {
    result = result.filter(fv => fv.featureGroups.includes(filters.featureGroup!));
  }
  if (filters?.onlineEnabled !== undefined) {
    result = result.filter(fv => fv.onlineEnabled === filters.onlineEnabled);
  }

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createFeatureService(params: {
  organizationId: string;
  name: string;
  description?: string;
  featureViews: string[];
  authentication?: boolean;
  rateLimit?: number;
}): FeatureService {
  const now = new Date().toISOString();
  const id = randomUUID();

  const featureService: FeatureService = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    featureViews: params.featureViews,
    status: 'active',
    endpoint: `https://features.windels.ai/${id}`,
    authentication: params.authentication ?? true,
    rateLimit: params.rateLimit,
    createdAt: now,
    updatedAt: now,
  };

  featureServices.set(id, featureService);
  return featureService;
}

export function getFeatureService(id: string): FeatureService | undefined {
  return featureServices.get(id);
}

export function listFeatureServices(
  organizationId: string,
  filters?: { status?: string }
): FeatureService[] {
  let result = Array.from(featureServices.values()).filter(
    fs => fs.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(fs => fs.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getOnlineFeatures(request: OnlineFeatureRequest): OnlineFeatureResponse {
  const featureView = Array.from(featureViews.values()).find(
    fv => fv.name === request.featureView
  );
  if (!featureView) throw new Error(`Feature view ${request.featureView} not found`);

  if (!featureView.onlineEnabled) {
    throw new Error('Feature view is not enabled for online serving');
  }

  const startTime = Date.now();

  // Simulate online feature retrieval
  const entityKey = JSON.stringify(request.entityKeys);
  const viewStore = onlineStore.get(request.featureView) || new Map();
  const features = viewStore.get(entityKey) || {};

  // Filter features if specified
  let resultFeatures = features;
  if (request.features && request.features.length > 0) {
    resultFeatures = {};
    for (const featureName of request.features) {
      if (features[featureName] !== undefined) {
        resultFeatures[featureName] = features[featureName];
      }
    }
  }

  const latency = Date.now() - startTime;

  return {
    entityKeys: request.entityKeys,
    features: resultFeatures,
    metadata: {
      timestamp: new Date().toISOString(),
      source: 'online_store',
      latency,
    },
  };
}

export function getOfflineFeatures(request: OfflineFeatureRequest): OfflineFeatureResponse {
  const featureView = Array.from(featureViews.values()).find(
    fv => fv.name === request.featureView
  );
  if (!featureView) throw new Error(`Feature view ${request.featureView} not found`);

  if (!featureView.offlineEnabled) {
    throw new Error('Feature view is not enabled for offline serving');
  }

  // Simulate offline feature retrieval
  const allData = offlineStore.get(request.featureView) || [];

  // Filter by entity keys
  let filteredData = allData;
  if (request.entityKeys && request.entityKeys.length > 0) {
    const entityKeySet = new Set(request.entityKeys.map(k => JSON.stringify(k)));
    filteredData = allData.filter(row => {
      const rowKey = JSON.stringify(
        Object.fromEntries(
          featureView.entity.joinKeys.map(key => [key, row[key]])
        )
      );
      return entityKeySet.has(rowKey);
    });
  }

  // Filter by time range
  if (request.startTime || request.endTime) {
    filteredData = filteredData.filter(row => {
      const timestamp = new Date(row.timestamp).getTime();
      if (request.startTime && timestamp < new Date(request.startTime).getTime()) {
        return false;
      }
      if (request.endTime && timestamp > new Date(request.endTime).getTime()) {
        return false;
      }
      return true;
    });
  }

  // Filter features if specified
  if (request.features && request.features.length > 0) {
    filteredData = filteredData.map(row => {
      const filteredRow: Record<string, any> = {};
      for (const key of featureView.entity.joinKeys) {
        filteredRow[key] = row[key];
      }
      for (const feature of request.features!) {
        if (row[feature] !== undefined) {
          filteredRow[feature] = row[feature];
        }
      }
      return filteredRow;
    });
  }

  return {
    data: filteredData,
    metadata: {
      count: filteredData.length,
      timestamp: new Date().toISOString(),
      source: 'offline_store',
    },
  };
}

export function ingestOnlineFeatures(
  featureViewName: string,
  entityKeys: Record<string, any>,
  features: Record<string, any>
): void {
  const entityKey = JSON.stringify(entityKeys);
  
  if (!onlineStore.has(featureViewName)) {
    onlineStore.set(featureViewName, new Map());
  }

  const viewStore = onlineStore.get(featureViewName)!;
  const existingFeatures = viewStore.get(entityKey) || {};
  
  viewStore.set(entityKey, { ...existingFeatures, ...features });
}

export function ingestOfflineFeatures(
  featureViewName: string,
  data: Record<string, any>[]
): void {
  const existingData = offlineStore.get(featureViewName) || [];
  offlineStore.set(featureViewName, [...existingData, ...data]);
}

export function setupFeatureMonitoring(params: {
  featureId: string;
  featureGroupId: string;
  checks: Omit<FeatureCheck, 'id'>[];
  driftDetection?: DriftDetectionConfig;
}): FeatureMonitoring {
  const now = new Date().toISOString();
  const id = randomUUID();

  const monitoring: FeatureMonitoring = {
    id,
    featureId: params.featureId,
    featureGroupId: params.featureGroupId,
    checks: params.checks.map(c => ({ ...c, id: randomUUID() })),
    alerts: [],
    driftDetection: params.driftDetection || {
      enabled: false,
      method: 'ks_test',
      threshold: 0.1,
      baselineWindow: 30,
      comparisonWindow: 7,
    },
    lastCheckAt: now,
    status: 'active',
  };

  featureMonitoring.set(id, monitoring);
  return monitoring;
}

export function getFeatureMonitoring(id: string): FeatureMonitoring | undefined {
  return featureMonitoring.get(id);
}

export function runFeatureChecks(monitoringId: string): FeatureAlert[] {
  const monitoring = featureMonitoring.get(monitoringId);
  if (!monitoring) throw new Error(`Feature monitoring ${monitoringId} not found`);

  const now = new Date().toISOString();
  const alerts: FeatureAlert[] = [];

  for (const check of monitoring.checks) {
    // Simulate check execution
    const value = Math.random() * 100;
    const passed = value < check.threshold;

    check.lastValue = value;
    check.lastCheck = now;
    check.status = passed ? 'pass' : 'fail';

    if (!passed) {
      const alert: FeatureAlert = {
        id: randomUUID(),
        type: 'quality',
        severity: 'medium',
        message: `Feature check failed: ${check.type}`,
        detectedAt: now,
        acknowledged: false,
      };

      alerts.push(alert);
      monitoring.alerts.push(alert);
    }
  }

  monitoring.lastCheckAt = now;
  return alerts;
}

export function getFeatureLineage(featureId: string): FeatureLineage {
  // Find feature in feature groups
  let featureGroup: FeatureGroup | undefined;
  let feature: Feature | undefined;

  for (const fg of featureGroups.values()) {
    feature = fg.features.find(f => f.id === featureId);
    if (feature) {
      featureGroup = fg;
      break;
    }
  }

  if (!feature || !featureGroup) {
    throw new Error(`Feature ${featureId} not found`);
  }

  // Find feature views that use this feature
  const downstreamViews = Array.from(featureViews.values()).filter(
    fv => fv.features.includes(feature!.name)
  );

  const lineage: FeatureLineage = {
    featureId,
    upstream: [
      {
        id: featureGroup.source.location,
        name: featureGroup.source.location,
        type: 'source',
        timestamp: featureGroup.createdAt,
      },
    ],
    downstream: downstreamViews.map(fv => ({
      id: fv.id,
      name: fv.name,
      type: 'feature_view',
      timestamp: fv.createdAt,
    })),
    transformations: featureGroup.transformation
      ? [
          {
            id: randomUUID(),
            type: featureGroup.transformation.type,
            code: featureGroup.transformation.code,
            inputs: [featureGroup.source.location],
            outputs: [feature.name],
            timestamp: featureGroup.createdAt,
          },
        ]
      : [],
  };

  return lineage;
}

export function getFeatureStoreDashboard(organizationId: string): {
  totalFeatureGroups: number;
  totalFeatures: number;
  totalFeatureViews: number;
  totalFeatureServices: number;
  activeMonitoring: number;
  activeAlerts: number;
} {
  const groups = Array.from(featureGroups.values()).filter(
    fg => fg.organizationId === organizationId
  );

  const totalFeatures = groups.reduce((sum, fg) => sum + fg.features.length, 0);

  const views = Array.from(featureViews.values()).filter(
    fv => fv.organizationId === organizationId
  );

  const services = Array.from(featureServices.values()).filter(
    fs => fs.organizationId === organizationId
  );

  const activeMonitoring = Array.from(featureMonitoring.values()).filter(
    m => m.status === 'active'
  ).length;

  const activeAlerts = Array.from(featureMonitoring.values()).reduce(
    (sum, m) => sum + m.alerts.filter(a => !a.acknowledged).length, 0
  );

  return {
    totalFeatureGroups: groups.length,
    totalFeatures,
    totalFeatureViews: views.length,
    totalFeatureServices: services.length,
    activeMonitoring,
    activeAlerts,
  };
}
