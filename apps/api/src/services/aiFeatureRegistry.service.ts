/**
 * Module 74: AI Feature Registry Service
 *
 * Provides centralized feature catalog management including feature definitions,
 * metadata, versioning, lineage tracking, discovery and search, tags and
 * categorization, ownership and governance, approval workflows, and documentation
 * management for comprehensive feature registry operations.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Feature {
  id: string;
  organizationId: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  status: FeatureStatus;
  dataType: FeatureDataType;
  valueType: FeatureValueType;
  entity: FeatureEntity;
  transformation: FeatureTransformation;
  metadata: FeatureMetadata;
  governance: FeatureGovernance;
  statistics?: FeatureStatistics;
  lineage: FeatureLineage;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  deprecatedAt?: string;
}

export type FeatureStatus =
  | 'draft'
  | 'pending-review'
  | 'approved'
  | 'published'
  | 'deprecated'
  | 'archived';

export type FeatureDataType =
  | 'numerical'
  | 'categorical'
  | 'text'
  | 'datetime'
  | 'boolean'
  | 'array'
  | 'embedding'
  | 'image'
  | 'audio'
  | 'video';

export type FeatureValueType =
  | 'continuous'
  | 'discrete'
  | 'binary'
  | 'ordinal'
  | 'nominal'
  | 'vector'
  | 'tensor';

export interface FeatureEntity {
  name: string;
  type: 'user' | 'item' | 'session' | 'transaction' | 'location' | 'device' | 'custom';
  joinKeys: string[];
  description?: string;
}

export interface FeatureTransformation {
  type: TransformationType;
  sourceColumns: string[];
  transformation: string; // Code or expression
  parameters?: Record<string, any>;
  dependencies?: string[]; // Other feature IDs
  pipelineId?: string;
}

export type TransformationType =
  | 'identity'
  | 'aggregation'
  | 'window'
  | 'embedding'
  | 'encoding'
  | 'scaling'
  | 'polynomial'
  | 'interaction'
  | 'datetime'
  | 'text'
  | 'custom';

export interface FeatureMetadata {
  owner: string;
  team?: string;
  domain?: string;
  useCases: string[];
  projects: string[];
  models: string[];
  freshness?: string; // e.g., "real-time", "hourly", "daily"
  latency?: string; // e.g., "<10ms", "<100ms"
  cost?: {
    compute: number;
    storage: number;
  };
  documentation?: {
    usage: string;
    examples?: string[];
    limitations?: string[];
    references?: string[];
  };
}

export interface FeatureGovernance {
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  pii: boolean;
  compliance: string[]; // e.g., ["GDPR", "CCPA", "HIPAA"]
  accessControl: {
    readRoles: string[];
    writeRoles: string[];
    adminRoles: string[];
  };
  approval: FeatureApproval;
  audit: AuditInfo;
}

export interface FeatureApproval {
  required: boolean;
  status: 'not-required' | 'pending' | 'approved' | 'rejected';
  reviewers: string[];
  approvedBy?: string;
  approvedAt?: string;
  comments?: string;
}

export interface AuditInfo {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  changeHistory: ChangeRecord[];
}

export interface ChangeRecord {
  timestamp: string;
  user: string;
  action: 'created' | 'updated' | 'published' | 'deprecated' | 'archived';
  changes: Record<string, { old?: any; new?: any }>;
  reason?: string;
}

export interface FeatureStatistics {
  count: number;
  nullCount: number;
  nullPercentage: number;
  uniqueCount: number;
  mean?: number;
  std?: number;
  min?: number;
  max?: number;
  median?: number;
  percentiles?: Record<string, number>;
  distribution?: {
    type: 'normal' | 'uniform' | 'skewed' | 'bimodal';
    skewness?: number;
    kurtosis?: number;
  };
  topValues?: Array<{ value: any; count: number; percentage: number }>;
  lastUpdated: string;
}

export interface FeatureLineage {
  sources: LineageSource[];
  transformations: TransformationStep[];
  downstream: string[]; // Feature IDs that depend on this
  upstream: string[]; // Feature IDs this depends on
}

export interface LineageSource {
  type: 'table' | 'view' | 'api' | 'stream' | 'feature';
  id: string;
  name: string;
  columns?: string[];
}

export interface TransformationStep {
  order: number;
  type: string;
  description: string;
  code?: string;
  parameters?: Record<string, any>;
}

export interface FeatureGroup {
  id: string;
  organizationId: string;
  name: string;
  displayName: string;
  description: string;
  entity: FeatureEntity;
  features: string[]; // Feature IDs
  version: string;
  status: 'draft' | 'published' | 'deprecated';
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureSearchResult {
  features: Feature[];
  total: number;
  facets: FeatureFacets;
}

export interface FeatureFacets {
  dataTypes: Array<{ type: FeatureDataType; count: number }>;
  statuses: Array<{ status: FeatureStatus; count: number }>;
  entities: Array<{ entity: string; count: number }>;
  tags: Array<{ tag: string; count: number }>;
  domains: Array<{ domain: string; count: number }>;
  owners: Array<{ owner: string; count: number }>;
}

export interface FeatureCatalog {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  featureGroups: string[]; // FeatureGroup IDs
  features: string[]; // Feature IDs
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureStoreDashboard {
  organizationId: string;
  totalFeatures: number;
  totalFeatureGroups: number;
  featuresByStatus: Record<FeatureStatus, number>;
  featuresByDataType: Record<FeatureDataType, number>;
  featuresByEntity: Record<string, number>;
  topFeatures: Array<{ featureId: string; name: string; usageCount: number }>;
  recentFeatures: Feature[];
  featureQuality: {
    averageCompleteness: number;
    averageFreshness: number;
    featuresWithIssues: number;
  };
  governance: {
    pendingApprovals: number;
    piiFeatures: number;
    complianceCoverage: number;
  };
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const features = new Map<string, Feature>();
const featureGroups = new Map<string, FeatureGroup>();
const catalogs = new Map<string, FeatureCatalog>();

// ─── Feature Management ────────────────────────────────────────────────────────

/**
 * Create a feature
 */
export async function createFeature(
  organizationId: string,
  params: {
    name: string;
    displayName: string;
    description: string;
    dataType: FeatureDataType;
    valueType: FeatureValueType;
    entity: FeatureEntity;
    transformation: FeatureTransformation;
    metadata: Omit<FeatureMetadata, 'owner'> & { owner: string };
    governance: Omit<FeatureGovernance, 'approval' | 'audit'>;
    tags?: string[];
    createdBy: string;
  }
): Promise<Feature> {
  const id = `feature_${randomUUID()}`;
  const now = new Date().toISOString();

  const feature: Feature = {
    id,
    organizationId,
    name: params.name,
    displayName: params.displayName,
    description: params.description,
    version: '1.0.0',
    status: 'draft',
    dataType: params.dataType,
    valueType: params.valueType,
    entity: params.entity,
    transformation: params.transformation,
    metadata: params.metadata,
    governance: {
      ...params.governance,
      approval: {
        required: params.governance.sensitivity !== 'public',
        status: 'not-required',
        reviewers: [],
      },
      audit: {
        createdAt: now,
        createdBy: params.createdBy,
        updatedAt: now,
        updatedBy: params.createdBy,
        changeHistory: [
          {
            timestamp: now,
            user: params.createdBy,
            action: 'created',
            changes: {},
          },
        ],
      },
    },
    lineage: {
      sources: [],
      transformations: [],
      downstream: [],
      upstream: params.transformation.dependencies || [],
    },
    tags: params.tags || [],
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  features.set(id, feature);

  // Update upstream features' downstream list
  for (const upstreamId of feature.lineage.upstream) {
    const upstream = features.get(upstreamId);
    if (upstream) {
      upstream.lineage.downstream.push(id);
      upstream.updatedAt = now;
      features.set(upstreamId, upstream);
    }
  }

  return feature;
}

/**
 * Update a feature
 */
export async function updateFeature(
  featureId: string,
  updates: Partial<Omit<Feature, 'id' | 'organizationId' | 'createdAt' | 'createdBy'>>,
  updatedBy: string,
  reason?: string
): Promise<Feature | null> {
  const feature = features.get(featureId);
  if (!feature) return null;

  const now = new Date().toISOString();
  const changes: Record<string, { old?: any; new?: any }> = {};

  // Track changes
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'governance' || key === 'metadata' || key === 'transformation') continue;
    const oldValue = (feature as any)[key];
    if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
      changes[key] = { old: oldValue, new: value };
    }
  }

  // Apply updates
  Object.assign(feature, updates);
  feature.updatedAt = now;
  feature.governance.audit.updatedAt = now;
  feature.governance.audit.updatedBy = updatedBy;
  feature.governance.audit.changeHistory.push({
    timestamp: now,
    user: updatedBy,
    action: 'updated',
    changes,
    reason,
  });

  features.set(featureId, feature);
  return feature;
}

/**
 * Publish a feature
 */
export async function publishFeature(
  featureId: string,
  publishedBy: string
): Promise<Feature | null> {
  const feature = features.get(featureId);
  if (!feature) return null;

  if (feature.governance.approval.required && feature.governance.approval.status !== 'approved') {
    throw new Error('Feature must be approved before publishing');
  }

  const now = new Date().toISOString();
  feature.status = 'published';
  feature.publishedAt = now;
  feature.updatedAt = now;
  feature.governance.audit.changeHistory.push({
    timestamp: now,
    user: publishedBy,
    action: 'published',
    changes: { status: { old: feature.status, new: 'published' } },
  });

  features.set(featureId, feature);
  return feature;
}

/**
 * Deprecate a feature
 */
export async function deprecatedFeature(
  featureId: string,
  deprecatedBy: string,
  reason: string
): Promise<Feature | null> {
  const feature = features.get(featureId);
  if (!feature) return null;

  const now = new Date().toISOString();
  feature.status = 'deprecated';
  feature.deprecatedAt = now;
  feature.updatedAt = now;
  feature.governance.audit.changeHistory.push({
    timestamp: now,
    user: deprecatedBy,
    action: 'deprecated',
    changes: { status: { old: feature.status, new: 'deprecated' } },
    reason,
  });

  features.set(featureId, feature);
  return feature;
}

/**
 * Submit feature for approval
 */
export async function submitForApproval(
  featureId: string,
  reviewers: string[],
  submittedBy: string
): Promise<Feature | null> {
  const feature = features.get(featureId);
  if (!feature) return null;

  const now = new Date().toISOString();
  feature.status = 'pending-review';
  feature.governance.approval.status = 'pending';
  feature.governance.approval.reviewers = reviewers;
  feature.updatedAt = now;
  feature.governance.audit.changeHistory.push({
    timestamp: now,
    user: submittedBy,
    action: 'updated',
    changes: { status: { old: feature.status, new: 'pending-review' } },
  });

  features.set(featureId, feature);
  return feature;
}

/**
 * Approve a feature
 */
export async function approveFeature(
  featureId: string,
  approvedBy: string,
  comments?: string
): Promise<Feature | null> {
  const feature = features.get(featureId);
  if (!feature) return null;

  const now = new Date().toISOString();
  feature.governance.approval.status = 'approved';
  feature.governance.approval.approvedBy = approvedBy;
  feature.governance.approval.approvedAt = now;
  feature.governance.approval.comments = comments;
  feature.status = 'approved';
  feature.updatedAt = now;
  feature.governance.audit.changeHistory.push({
    timestamp: now,
    user: approvedBy,
    action: 'updated',
    changes: { 'governance.approval.status': { old: 'pending', new: 'approved' } },
  });

  features.set(featureId, feature);
  return feature;
}

/**
 * Reject a feature
 */
export async function rejectFeature(
  featureId: string,
  rejectedBy: string,
  comments: string
): Promise<Feature | null> {
  const feature = features.get(featureId);
  if (!feature) return null;

  const now = new Date().toISOString();
  feature.governance.approval.status = 'rejected';
  feature.governance.approval.approvedBy = rejectedBy;
  feature.governance.approval.approvedAt = now;
  feature.governance.approval.comments = comments;
  feature.status = 'draft';
  feature.updatedAt = now;
  feature.governance.audit.changeHistory.push({
    timestamp: now,
    user: rejectedBy,
    action: 'updated',
    changes: { 'governance.approval.status': { old: 'pending', new: 'rejected' } },
  });

  features.set(featureId, feature);
  return feature;
}

/**
 * Update feature statistics
 */
export async function updateFeatureStatistics(
  featureId: string,
  statistics: FeatureStatistics
): Promise<Feature | null> {
  const feature = features.get(featureId);
  if (!feature) return null;

  feature.statistics = statistics;
  feature.updatedAt = new Date().toISOString();

  features.set(featureId, feature);
  return feature;
}

/**
 * Search features
 */
export async function searchFeatures(
  organizationId: string,
  query?: {
    text?: string;
    dataType?: FeatureDataType;
    status?: FeatureStatus;
    entity?: string;
    tags?: string[];
    domain?: string;
    owner?: string;
    limit?: number;
    offset?: number;
  }
): Promise<FeatureSearchResult> {
  let results = Array.from(features.values()).filter(
    (f) => f.organizationId === organizationId
  );

  // Apply filters
  if (query?.text) {
    const text = query.text.toLowerCase();
    results = results.filter(
      (f) =>
        f.name.toLowerCase().includes(text) ||
        f.displayName.toLowerCase().includes(text) ||
        f.description.toLowerCase().includes(text)
    );
  }

  if (query?.dataType) {
    results = results.filter((f) => f.dataType === query.dataType);
  }

  if (query?.status) {
    results = results.filter((f) => f.status === query.status);
  }

  if (query?.entity) {
    results = results.filter((f) => f.entity.name === query.entity);
  }

  if (query?.tags && query.tags.length > 0) {
    results = results.filter((f) => query.tags!.some((tag) => f.tags.includes(tag)));
  }

  if (query?.domain) {
    results = results.filter((f) => f.metadata.domain === query.domain);
  }

  if (query?.owner) {
    results = results.filter((f) => f.metadata.owner === query.owner);
  }

  const total = results.length;

  // Calculate facets
  const facets: FeatureFacets = {
    dataTypes: [],
    statuses: [],
    entities: [],
    tags: [],
    domains: [],
    owners: [],
  };

  const dataTypeCounts = new Map<FeatureDataType, number>();
  const statusCounts = new Map<FeatureStatus, number>();
  const entityCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const domainCounts = new Map<string, number>();
  const ownerCounts = new Map<string, number>();

  for (const feature of results) {
    dataTypeCounts.set(feature.dataType, (dataTypeCounts.get(feature.dataType) || 0) + 1);
    statusCounts.set(feature.status, (statusCounts.get(feature.status) || 0) + 1);
    entityCounts.set(feature.entity.name, (entityCounts.get(feature.entity.name) || 0) + 1);
    feature.tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
    if (feature.metadata.domain) {
      domainCounts.set(feature.metadata.domain, (domainCounts.get(feature.metadata.domain) || 0) + 1);
    }
    ownerCounts.set(feature.metadata.owner, (ownerCounts.get(feature.metadata.owner) || 0) + 1);
  }

  facets.dataTypes = Array.from(dataTypeCounts.entries()).map(([type, count]) => ({ type, count }));
  facets.statuses = Array.from(statusCounts.entries()).map(([status, count]) => ({ status, count }));
  facets.entities = Array.from(entityCounts.entries()).map(([entity, count]) => ({ entity, count }));
  facets.tags = Array.from(tagCounts.entries()).map(([tag, count]) => ({ tag, count }));
  facets.domains = Array.from(domainCounts.entries()).map(([domain, count]) => ({ domain, count }));
  facets.owners = Array.from(ownerCounts.entries()).map(([owner, count]) => ({ owner, count }));

  // Apply pagination
  const limit = query?.limit || 50;
  const offset = query?.offset || 0;
  results = results.slice(offset, offset + limit);

  return {
    features: results,
    total,
    facets,
  };
}

/**
 * Get feature by ID
 */
export async function getFeature(featureId: string): Promise<Feature | null> {
  return features.get(featureId) || null;
}

/**
 * List features
 */
export async function listFeatures(
  organizationId: string,
  filters?: {
    status?: FeatureStatus;
    dataType?: FeatureDataType;
    entity?: string;
  }
): Promise<Feature[]> {
  const allFeatures = Array.from(features.values()).filter(
    (f) => f.organizationId === organizationId
  );

  return allFeatures.filter((f) => {
    if (filters?.status && f.status !== filters.status) return false;
    if (filters?.dataType && f.dataType !== filters.dataType) return false;
    if (filters?.entity && f.entity.name !== filters.entity) return false;
    return true;
  });
}

// ─── Feature Group Management ──────────────────────────────────────────────────

/**
 * Create a feature group
 */
export async function createFeatureGroup(
  organizationId: string,
  params: {
    name: string;
    displayName: string;
    description: string;
    entity: FeatureEntity;
    features: string[];
    tags?: string[];
    createdBy: string;
  }
): Promise<FeatureGroup> {
  const id = `fg_${randomUUID()}`;
  const now = new Date().toISOString();

  const group: FeatureGroup = {
    id,
    organizationId,
    name: params.name,
    displayName: params.displayName,
    description: params.description,
    entity: params.entity,
    features: params.features,
    version: '1.0.0',
    status: 'draft',
    tags: params.tags || [],
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  featureGroups.set(id, group);
  return group;
}

/**
 * Get feature group by ID
 */
export async function getFeatureGroup(groupId: string): Promise<FeatureGroup | null> {
  return featureGroups.get(groupId) || null;
}

/**
 * List feature groups
 */
export async function listFeatureGroups(organizationId: string): Promise<FeatureGroup[]> {
  return Array.from(featureGroups.values()).filter((g) => g.organizationId === organizationId);
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

/**
 * Get feature store dashboard
 */
export async function getFeatureStoreDashboard(organizationId: string): Promise<FeatureStoreDashboard> {
  const allFeatures = await listFeatures(organizationId);
  const allGroups = await listFeatureGroups(organizationId);

  const featuresByStatus: Record<string, number> = {};
  const featuresByDataType: Record<string, number> = {};
  const featuresByEntity: Record<string, number> = {};
  let totalCompleteness = 0;
  let totalFreshness = 0;
  let featuresWithIssues = 0;
  let pendingApprovals = 0;
  let piiFeatures = 0;
  let complianceFeatures = 0;

  for (const feature of allFeatures) {
    featuresByStatus[feature.status] = (featuresByStatus[feature.status] || 0) + 1;
    featuresByDataType[feature.dataType] = (featuresByDataType[feature.dataType] || 0) + 1;
    featuresByEntity[feature.entity.name] = (featuresByEntity[feature.entity.name] || 0) + 1;

    if (feature.statistics) {
      totalCompleteness += 100 - feature.statistics.nullPercentage;
      if (feature.statistics.nullPercentage > 10) {
        featuresWithIssues++;
      }
    }

    if (feature.governance.approval.status === 'pending') {
      pendingApprovals++;
    }

    if (feature.governance.pii) {
      piiFeatures++;
    }

    if (feature.governance.compliance.length > 0) {
      complianceFeatures++;
    }
  }

  const recentFeatures = allFeatures
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  return {
    organizationId,
    totalFeatures: allFeatures.length,
    totalFeatureGroups: allGroups.length,
    featuresByStatus: featuresByStatus as Record<FeatureStatus, number>,
    featuresByDataType: featuresByDataType as Record<FeatureDataType, number>,
    featuresByEntity,
    topFeatures: [], // Would be populated with usage data
    recentFeatures,
    featureQuality: {
      averageCompleteness: allFeatures.length > 0 ? totalCompleteness / allFeatures.length : 0,
      averageFreshness: allFeatures.length > 0 ? totalFreshness / allFeatures.length : 0,
      featuresWithIssues,
    },
    governance: {
      pendingApprovals,
      piiFeatures,
      complianceCoverage: allFeatures.length > 0 ? (complianceFeatures / allFeatures.length) * 100 : 0,
    },
  };
}
