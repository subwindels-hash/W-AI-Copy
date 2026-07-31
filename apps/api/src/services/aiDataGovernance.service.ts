/**
 * Module 141: AI Data Governance Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides data governance capabilities for AI models including data quality management,
 * data lineage tracking, metadata management, data catalog, data classification,
 * and data lifecycle management.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DataAsset {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: DataAssetType;
  status: DataAssetStatus;
  classification: DataClassification;
  owner: string;
  steward?: string;
  location: DataLocation;
  schema: DataSchema;
  quality: DataQualityMetrics;
  lineage: DataLineage;
  metadata: Record<string, any>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type DataAssetType =
  | 'dataset'
  | 'table'
  | 'view'
  | 'stream'
  | 'file'
  | 'api'
  | 'model_input'
  | 'model_output';

export type DataAssetStatus =
  | 'draft'
  | 'active'
  | 'deprecated'
  | 'archived'
  | 'deleted';

export interface DataClassification {
  level: 'public' | 'internal' | 'confidential' | 'restricted';
  categories: string[];
  pii: boolean;
  phi: boolean;
  pci: boolean;
  sensitivity: 'low' | 'medium' | 'high' | 'critical';
  retentionPeriod: number; // days
  encryptionRequired: boolean;
}

export interface DataLocation {
  type: 'database' | 'data_lake' | 'data_warehouse' | 'file_system' | 'api' | 'stream';
  provider: 'aws' | 'gcp' | 'azure' | 'on_premise' | 'custom';
  region: string;
  path: string;
  format: string;
  size: number; // bytes
}

export interface DataSchema {
  fields: SchemaField[];
  version: string;
  format: 'avro' | 'parquet' | 'json' | 'csv' | 'protobuf' | 'custom';
  validationRules: ValidationRule[];
}

export interface SchemaField {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
  constraints?: FieldConstraint[];
  pii?: boolean;
  sensitive?: boolean;
}

export interface FieldConstraint {
  type: 'min' | 'max' | 'pattern' | 'enum' | 'unique' | 'foreign_key';
  value: any;
}

export interface ValidationRule {
  id: string;
  name: string;
  type: 'schema' | 'quality' | 'business' | 'custom';
  expression: string;
  severity: 'error' | 'warning' | 'info';
  enabled: boolean;
}

export interface DataQualityMetrics {
  overallScore: number;
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
  validity: number;
  uniqueness: number;
  issues: DataQualityIssue[];
  lastAssessment: string;
  trend: 'improving' | 'stable' | 'declining';
}

export interface DataQualityIssue {
  id: string;
  type: 'missing' | 'invalid' | 'duplicate' | 'outlier' | 'inconsistent';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  affectedRows: number;
  affectedPercentage: number;
  detectedAt: string;
  resolvedAt?: string;
}

export interface DataLineage {
  upstream: LineageNode[];
  downstream: LineageNode[];
  transformations: Transformation[];
  lastUpdated: string;
}

export interface LineageNode {
  id: string;
  name: string;
  type: string;
  timestamp: string;
}

export interface Transformation {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  inputs: string[];
  outputs: string[];
}

export interface DataQualityRule {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: QualityRuleType;
  expression: string;
  threshold: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  applicableAssets: string[];
  schedule: string; // cron expression
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type QualityRuleType =
  | 'completeness'
  | 'accuracy'
  | 'consistency'
  | 'timeliness'
  | 'validity'
  | 'uniqueness'
  | 'custom';

export interface DataQualityCheck {
  id: string;
  assetId: string;
  ruleId: string;
  status: 'passed' | 'failed' | 'warning';
  score: number;
  issues: DataQualityIssue[];
  executedAt: string;
  duration: number; // seconds
}

export interface DataCatalog {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  assets: string[];
  tags: string[];
  categories: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DataLifecyclePolicy {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  stages: LifecycleStage[];
  transitions: LifecycleTransition[];
  applicableAssets: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LifecycleStage {
  name: string;
  description: string;
  retentionPeriod: number; // days
  storageClass: 'hot' | 'warm' | 'cold' | 'archive';
  actions: LifecycleAction[];
}

export interface LifecycleAction {
  type: 'notify' | 'archive' | 'delete' | 'transform' | 'custom';
  trigger: 'time' | 'size' | 'access' | 'custom';
  configuration: Record<string, any>;
}

export interface LifecycleTransition {
  from: string;
  to: string;
  condition: string;
  automated: boolean;
}

export interface DataAccessLog {
  id: string;
  assetId: string;
  userId: string;
  action: 'read' | 'write' | 'delete' | 'share' | 'export';
  timestamp: string;
  ipAddress: string;
  location: string;
  success: boolean;
  reason?: string;
}

export interface DataGovernanceAlert {
  id: string;
  type: 'quality_issue' | 'policy_violation' | 'access_anomaly' | 'retention_warning';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  assetId?: string;
  triggeredAt: string;
  acknowledged: boolean;
  resolvedAt?: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const dataAssets = new Map<string, DataAsset>();
const dataQualityRules = new Map<string, DataQualityRule>();
const dataQualityChecks = new Map<string, DataQualityCheck[]>();
const dataCatalogs = new Map<string, DataCatalog>();
const dataLifecyclePolicies = new Map<string, DataLifecyclePolicy>();
const dataAccessLogs = new Map<string, DataAccessLog[]>();
const dataGovernanceAlerts = new Map<string, DataGovernanceAlert[]>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createDataAsset(params: {
  organizationId: string;
  name: string;
  description?: string;
  type: DataAssetType;
  classification: DataClassification;
  owner: string;
  steward?: string;
  location: DataLocation;
  schema: DataSchema;
  tags?: string[];
}): DataAsset {
  const now = new Date().toISOString();
  const id = randomUUID();

  const asset: DataAsset = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    type: params.type,
    status: 'active',
    classification: params.classification,
    owner: params.owner,
    steward: params.steward,
    location: params.location,
    schema: params.schema,
    quality: {
      overallScore: 100,
      completeness: 100,
      accuracy: 100,
      consistency: 100,
      timeliness: 100,
      validity: 100,
      uniqueness: 100,
      issues: [],
      lastAssessment: now,
      trend: 'stable',
    },
    lineage: {
      upstream: [],
      downstream: [],
      transformations: [],
      lastUpdated: now,
    },
    metadata: {},
    tags: params.tags || [],
    createdAt: now,
    updatedAt: now,
  };

  dataAssets.set(id, asset);
  dataQualityChecks.set(id, []);
  dataAccessLogs.set(id, []);
  dataGovernanceAlerts.set(id, []);

  return asset;
}

export function getDataAsset(id: string): DataAsset | undefined {
  return dataAssets.get(id);
}

export function listDataAssets(
  organizationId: string,
  filters?: { type?: DataAssetType; status?: DataAssetStatus; classification?: string; tag?: string }
): DataAsset[] {
  let result = Array.from(dataAssets.values()).filter(
    a => a.organizationId === organizationId
  );

  if (filters?.type) result = result.filter(a => a.type === filters.type);
  if (filters?.status) result = result.filter(a => a.status === filters.status);
  if (filters?.classification) result = result.filter(a => a.classification.level === filters.classification);
  if (filters?.tag) result = result.filter(a => a.tags.includes(filters.tag!));

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateDataAsset(
  assetId: string,
  updates: Partial<DataAsset>
): DataAsset {
  const asset = dataAssets.get(assetId);
  if (!asset) throw new Error(`Data asset ${assetId} not found`);

  Object.assign(asset, updates);
  asset.updatedAt = new Date().toISOString();

  return asset;
}

export function updateDataClassification(
  assetId: string,
  classification: DataClassification
): DataAsset {
  const asset = dataAssets.get(assetId);
  if (!asset) throw new Error(`Data asset ${assetId} not found`);

  asset.classification = classification;
  asset.updatedAt = new Date().toISOString();

  return asset;
}

export function addDataLineage(
  assetId: string,
  lineage: Partial<DataLineage>
): DataAsset {
  const asset = dataAssets.get(assetId);
  if (!asset) throw new Error(`Data asset ${assetId} not found`);

  if (lineage.upstream) {
    asset.lineage.upstream.push(...lineage.upstream);
  }
  if (lineage.downstream) {
    asset.lineage.downstream.push(...lineage.downstream);
  }
  if (lineage.transformations) {
    asset.lineage.transformations.push(...lineage.transformations);
  }

  asset.lineage.lastUpdated = new Date().toISOString();
  asset.updatedAt = new Date().toISOString();

  return asset;
}

export function createDataQualityRule(params: {
  organizationId: string;
  name: string;
  description?: string;
  type: QualityRuleType;
  expression: string;
  threshold: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  applicableAssets: string[];
  schedule: string;
}): DataQualityRule {
  const now = new Date().toISOString();
  const id = randomUUID();

  const rule: DataQualityRule = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    type: params.type,
    expression: params.expression,
    threshold: params.threshold,
    severity: params.severity,
    applicableAssets: params.applicableAssets,
    schedule: params.schedule,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  dataQualityRules.set(id, rule);
  return rule;
}

export function getDataQualityRule(id: string): DataQualityRule | undefined {
  return dataQualityRules.get(id);
}

export function listDataQualityRules(
  organizationId: string,
  filters?: { type?: QualityRuleType; enabled?: boolean }
): DataQualityRule[] {
  let result = Array.from(dataQualityRules.values()).filter(
    r => r.organizationId === organizationId
  );

  if (filters?.type) result = result.filter(r => r.type === filters.type);
  if (filters?.enabled !== undefined) result = result.filter(r => r.enabled === filters.enabled);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function runDataQualityCheck(assetId: string, ruleId: string): DataQualityCheck {
  const asset = dataAssets.get(assetId);
  if (!asset) throw new Error(`Data asset ${assetId} not found`);

  const rule = dataQualityRules.get(ruleId);
  if (!rule) throw new Error(`Data quality rule ${ruleId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  // Simulate quality check
  const score = 85 + Math.random() * 15;
  const passed = score >= rule.threshold;

  const issues: DataQualityIssue[] = [];
  if (!passed) {
    issues.push({
      id: randomUUID(),
      type: 'invalid',
      severity: rule.severity,
      description: `Quality check failed: ${rule.name}`,
      affectedRows: Math.floor(Math.random() * 100),
      affectedPercentage: Math.random() * 10,
      detectedAt: now,
    });
  }

  const check: DataQualityCheck = {
    id,
    assetId,
    ruleId,
    status: passed ? 'passed' : 'failed',
    score,
    issues,
    executedAt: now,
    duration: Math.random() * 60,
  };

  const assetChecks = dataQualityChecks.get(assetId) || [];
  assetChecks.push(check);
  dataQualityChecks.set(assetId, assetChecks);

  // Update asset quality metrics
  asset.quality.overallScore = (asset.quality.overallScore + score) / 2;
  asset.quality.lastAssessment = now;

  if (!passed) {
    asset.quality.issues.push(...issues);

    // Create alert
    const alerts = dataGovernanceAlerts.get(assetId) || [];
    alerts.push({
      id: randomUUID(),
      type: 'quality_issue',
      severity: rule.severity,
      title: `Data quality issue detected: ${rule.name}`,
      description: `Quality score ${score.toFixed(2)} below threshold ${rule.threshold}`,
      assetId,
      triggeredAt: now,
      acknowledged: false,
    });
    dataGovernanceAlerts.set(assetId, alerts);
  }

  return check;
}

export function getDataQualityChecks(
  assetId: string,
  filters?: { ruleId?: string; status?: string; limit?: number }
): DataQualityCheck[] {
  let result = dataQualityChecks.get(assetId) || [];

  if (filters?.ruleId) result = result.filter(c => c.ruleId === filters.ruleId);
  if (filters?.status) result = result.filter(c => c.status === filters.status);

  result = result.sort((a, b) => b.executedAt.localeCompare(a.executedAt));

  if (filters?.limit) {
    result = result.slice(0, filters.limit);
  }

  return result;
}

export function resolveDataQualityIssue(
  assetId: string,
  issueId: string
): DataAsset {
  const asset = dataAssets.get(assetId);
  if (!asset) throw new Error(`Data asset ${assetId} not found`);

  const issue = asset.quality.issues.find(i => i.id === issueId);
  if (!issue) throw new Error(`Quality issue ${issueId} not found`);

  issue.resolvedAt = new Date().toISOString();
  asset.updatedAt = new Date().toISOString();

  return asset;
}

export function createDataCatalog(params: {
  organizationId: string;
  name: string;
  description?: string;
  assets: string[];
  tags?: string[];
  categories?: string[];
}): DataCatalog {
  const now = new Date().toISOString();
  const id = randomUUID();

  const catalog: DataCatalog = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    assets: params.assets,
    tags: params.tags || [],
    categories: params.categories || [],
    createdAt: now,
    updatedAt: now,
  };

  dataCatalogs.set(id, catalog);
  return catalog;
}

export function getDataCatalog(id: string): DataCatalog | undefined {
  return dataCatalogs.get(id);
}

export function listDataCatalogs(
  organizationId: string,
  filters?: { tag?: string; category?: string }
): DataCatalog[] {
  let result = Array.from(dataCatalogs.values()).filter(
    c => c.organizationId === organizationId
  );

  if (filters?.tag) result = result.filter(c => c.tags.includes(filters.tag!));
  if (filters?.category) result = result.filter(c => c.categories.includes(filters.category!));

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addAssetToCatalog(catalogId: string, assetId: string): DataCatalog {
  const catalog = dataCatalogs.get(catalogId);
  if (!catalog) throw new Error(`Data catalog ${catalogId} not found`);

  if (!catalog.assets.includes(assetId)) {
    catalog.assets.push(assetId);
    catalog.updatedAt = new Date().toISOString();
  }

  return catalog;
}

export function removeAssetFromCatalog(catalogId: string, assetId: string): DataCatalog {
  const catalog = dataCatalogs.get(catalogId);
  if (!catalog) throw new Error(`Data catalog ${catalogId} not found`);

  catalog.assets = catalog.assets.filter(id => id !== assetId);
  catalog.updatedAt = new Date().toISOString();

  return catalog;
}

export function createDataLifecyclePolicy(params: {
  organizationId: string;
  name: string;
  description?: string;
  stages: LifecycleStage[];
  transitions: LifecycleTransition[];
  applicableAssets: string[];
}): DataLifecyclePolicy {
  const now = new Date().toISOString();
  const id = randomUUID();

  const policy: DataLifecyclePolicy = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    stages: params.stages,
    transitions: params.transitions,
    applicableAssets: params.applicableAssets,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  dataLifecyclePolicies.set(id, policy);
  return policy;
}

export function getDataLifecyclePolicy(id: string): DataLifecyclePolicy | undefined {
  return dataLifecyclePolicies.get(id);
}

export function listDataLifecyclePolicies(
  organizationId: string,
  filters?: { enabled?: boolean }
): DataLifecyclePolicy[] {
  let result = Array.from(dataLifecyclePolicies.values()).filter(
    p => p.organizationId === organizationId
  );

  if (filters?.enabled !== undefined) {
    result = result.filter(p => p.enabled === filters.enabled);
  }

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function logDataAccess(
  assetId: string,
  userId: string,
  action: 'read' | 'write' | 'delete' | 'share' | 'export',
  ipAddress: string,
  location: string,
  success: boolean,
  reason?: string
): DataAccessLog {
  const now = new Date().toISOString();
  const id = randomUUID();

  const log: DataAccessLog = {
    id,
    assetId,
    userId,
    action,
    timestamp: now,
    ipAddress,
    location,
    success,
    reason,
  };

  const assetLogs = dataAccessLogs.get(assetId) || [];
  assetLogs.push(log);
  dataAccessLogs.set(assetId, assetLogs);

  return log;
}

export function getDataAccessLogs(
  assetId: string,
  filters?: { userId?: string; action?: string; limit?: number }
): DataAccessLog[] {
  let result = dataAccessLogs.get(assetId) || [];

  if (filters?.userId) result = result.filter(l => l.userId === filters.userId);
  if (filters?.action) result = result.filter(l => l.action === filters.action);

  result = result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (filters?.limit) {
    result = result.slice(0, filters.limit);
  }

  return result;
}

export function getDataGovernanceAlerts(
  organizationId: string,
  filters?: { severity?: string; acknowledged?: boolean }
): DataGovernanceAlert[] {
  const assets = Array.from(dataAssets.values()).filter(
    a => a.organizationId === organizationId
  );
  const assetIds = assets.map(a => a.id);

  let result: DataGovernanceAlert[] = [];
  for (const assetId of assetIds) {
    const alerts = dataGovernanceAlerts.get(assetId) || [];
    result.push(...alerts);
  }

  if (filters?.severity) result = result.filter(a => a.severity === filters.severity);
  if (filters?.acknowledged !== undefined) result = result.filter(a => a.acknowledged === filters.acknowledged);

  return result.sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt));
}

export function acknowledgeDataGovernanceAlert(
  assetId: string,
  alertId: string
): DataGovernanceAlert {
  const alerts = dataGovernanceAlerts.get(assetId) || [];
  const alert = alerts.find(a => a.id === alertId);
  if (!alert) throw new Error(`Alert ${alertId} not found`);

  alert.acknowledged = true;
  return alert;
}

export function getDataGovernanceDashboard(organizationId: string): {
  totalAssets: number;
  activeAssets: number;
  averageQualityScore: number;
  qualityIssues: number;
  activeAlerts: number;
  classificationBreakdown: Record<string, number>;
} {
  const assets = Array.from(dataAssets.values()).filter(
    a => a.organizationId === organizationId
  );

  const activeAssets = assets.filter(a => a.status === 'active').length;
  const averageQualityScore = assets.length > 0
    ? assets.reduce((sum, a) => sum + a.quality.overallScore, 0) / assets.length
    : 0;

  const qualityIssues = assets.reduce(
    (sum, a) => sum + a.quality.issues.filter(i => !i.resolvedAt).length, 0
  );

  const assetIds = assets.map(a => a.id);
  let activeAlerts = 0;
  for (const assetId of assetIds) {
    const alerts = dataGovernanceAlerts.get(assetId) || [];
    activeAlerts += alerts.filter(a => !a.acknowledged).length;
  }

  const classificationBreakdown: Record<string, number> = {};
  for (const asset of assets) {
    const level = asset.classification.level;
    classificationBreakdown[level] = (classificationBreakdown[level] || 0) + 1;
  }

  return {
    totalAssets: assets.length,
    activeAssets,
    averageQualityScore,
    qualityIssues,
    activeAlerts,
    classificationBreakdown,
  };
}

export function searchDataAssets(
  organizationId: string,
  query: string,
  filters?: { type?: DataAssetType; classification?: string; tag?: string }
): DataAsset[] {
  let result = Array.from(dataAssets.values()).filter(
    a => a.organizationId === organizationId
  );

  // Search in name, description, and tags
  const queryLower = query.toLowerCase();
  result = result.filter(a =>
    a.name.toLowerCase().includes(queryLower) ||
    (a.description && a.description.toLowerCase().includes(queryLower)) ||
    a.tags.some(t => t.toLowerCase().includes(queryLower))
  );

  if (filters?.type) result = result.filter(a => a.type === filters.type);
  if (filters?.classification) result = result.filter(a => a.classification.level === filters.classification);
  if (filters?.tag) result = result.filter(a => a.tags.includes(filters.tag!));

  return result;
}
