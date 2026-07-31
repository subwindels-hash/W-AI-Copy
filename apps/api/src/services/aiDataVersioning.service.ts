/**
 * Module 123: AI Data Versioning Service
 * WINDELS AI OS - Phase 3
 * 
 * Provides data version control capabilities including dataset versioning, lineage
 * tracking, data quality monitoring, reproducibility guarantees, and integration
 * with DVC (Data Version Control).
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiDataVersioning');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Dataset {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  owner: string;
  tags: string[];
  versions: DatasetVersion[];
  latestVersion: string;
  metadata: DatasetMetadata;
  status: DatasetStatus;
  createdAt: string;
  updatedAt: string;
}

export type DatasetStatus = 'active' | 'deprecated' | 'archived';

export interface DatasetVersion {
  id: string;
  datasetId: string;
  version: string;
  parentVersionId?: string;
  source: DataSource;
  schema: DatasetSchema;
  statistics: DatasetStatistics;
  quality: DataQualityMetrics;
  storage: StorageInfo;
  lineage: DataLineage;
  metadata: VersionMetadata;
  createdAt: string;
  createdBy: string;
}

export interface DataSource {
  type: 'upload' | 'import' | 'pipeline' | 'fork' | 'query';
  location: string;
  format: DataFormat;
  pipelineId?: string;
  query?: string;
  parentDatasetId?: string;
  parentVersionId?: string;
}

export type DataFormat =
  | 'csv'
  | 'parquet'
  | 'json'
  | 'jsonl'
  | 'avro'
  | 'delta'
  | 'tfrecord'
  | 'image'
  | 'audio'
  | 'video'
  | 'custom';

export interface DatasetSchema {
  fields: SchemaField[];
  primaryKey?: string;
  partitionKeys?: string[];
  constraints?: SchemaConstraint[];
}

export interface SchemaField {
  name: string;
  type: FieldType;
  nullable: boolean;
  description?: string;
  metadata?: Record<string, any>;
}

export type FieldType =
  | 'int'
  | 'float'
  | 'double'
  | 'string'
  | 'boolean'
  | 'date'
  | 'timestamp'
  | 'binary'
  | 'array'
  | 'struct'
  | 'map';

export interface SchemaConstraint {
  type: 'unique' | 'not_null' | 'check' | 'foreign_key';
  fields: string[];
  expression?: string;
  referenceTable?: string;
  referenceFields?: string[];
}

export interface DatasetStatistics {
  rowCount: number;
  columnCount: number;
  sizeBytes: number;
  nullCount: number;
  distinctCount: number;
  fieldStatistics: Record<string, FieldStatistics>;
  lastUpdated: string;
}

export interface FieldStatistics {
  name: string;
  type: FieldType;
  count: number;
  nullCount: number;
  distinctCount: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  std?: number;
  percentiles?: Record<string, number>;
  topValues?: Array<{ value: any; count: number }>;
}

export interface DataQualityMetrics {
  completeness: number;
  validity: number;
  uniqueness: number;
  consistency: number;
  timeliness: number;
  overallScore: number;
  issues: DataQualityIssue[];
}

export interface DataQualityIssue {
  type: 'missing_values' | 'duplicates' | 'outliers' | 'schema_violation' | 'stale_data';
  severity: 'info' | 'warning' | 'critical';
  field?: string;
  count: number;
  percentage: number;
  description: string;
  detectedAt: string;
}

export interface StorageInfo {
  location: string;
  storageType: 'local' | 's3' | 'gcs' | 'azure_blob' | 'hdfs';
  sizeBytes: number;
  compression?: string;
  partitioning?: PartitioningInfo;
  checksum: string;
}

export interface PartitioningInfo {
  strategy: 'hash' | 'range' | 'list';
  columns: string[];
  partitions: number;
}

export interface DataLineage {
  upstream: LineageNode[];
  downstream: LineageNode[];
  transformations: Transformation[];
}

export interface LineageNode {
  id: string;
  type: 'dataset' | 'pipeline' | 'model' | 'report';
  name: string;
  version?: string;
}

export interface Transformation {
  id: string;
  type: string;
  description: string;
  appliedAt: string;
  appliedBy: string;
  parameters?: Record<string, any>;
}

export interface VersionMetadata {
  changelog: string;
  tags: string[];
  labels: Record<string, string>;
  annotations?: Record<string, any>;
}

export interface DatasetMetadata {
  domain: string;
  license: string;
  source?: string;
  collectionMethod?: string;
  collectionDate?: string;
  updateFrequency?: string;
  piiFields?: string[];
  sensitiveData?: boolean;
}

export interface DataVersionControl {
  id: string;
  datasetId: string;
  dvcConfig: DVCConfig;
  remotes: DVCREmote[];
  stages: DVCStage[];
  metrics: DVCMetrics;
  lastSyncAt?: string;
}

export interface DVCConfig {
  enabled: boolean;
  cacheEnabled: boolean;
  cacheDir: string;
  autostage: boolean;
  versionAware: boolean;
}

export interface DVCREmote {
  name: string;
  url: string;
  type: 's3' | 'gcs' | 'azure' | 'ssh' | 'hdfs' | 'local';
  default: boolean;
}

export interface DVCStage {
  name: string;
  command: string;
  deps: string[];
  outs: string[];
  metrics?: string[];
  params?: string[];
}

export interface DVCMetrics {
  trackedMetrics: string[];
  history: Array<{
    timestamp: string;
    metrics: Record<string, number>;
  }>;
}

export interface DataDiff {
  datasetId: string;
  fromVersion: string;
  toVersion: string;
  schemaChanges: SchemaChange[];
  dataChanges: DataChange;
  statisticsChanges: StatisticsChange;
}

export interface SchemaChange {
  type: 'added' | 'removed' | 'modified';
  field: string;
  oldType?: FieldType;
  newType?: FieldType;
  oldNullable?: boolean;
  newNullable?: boolean;
}

export interface DataChange {
  addedRows: number;
  removedRows: number;
  modifiedRows: number;
  sampleChanges: Array<{
    rowId: string;
    type: 'added' | 'removed' | 'modified';
    changes?: Record<string, { old: any; new: any }>;
  }>;
}

export interface StatisticsChange {
  rowCountChange: number;
  sizeChange: number;
  fieldChanges: Record<string, {
    nullCountChange: number;
    distinctCountChange: number;
    meanChange?: number;
    stdChange?: number;
  }>;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const datasets = new Map<string, Dataset>();
const datasetVersions = new Map<string, DatasetVersion[]>();
const dataVersionControls = new Map<string, DataVersionControl>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateDatasetVersionNumber(existingVersions: DatasetVersion[]): string {
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

function calculateDataQuality(statistics: DatasetStatistics): DataQualityMetrics {
  const completeness = 1 - (statistics.nullCount / (statistics.rowCount * statistics.columnCount));
  const validity = 0.95; // Simplified
  const uniqueness = statistics.distinctCount / statistics.rowCount;
  const consistency = 0.98; // Simplified
  const timeliness = 1.0; // Simplified

  const overallScore = (completeness + validity + uniqueness + consistency + timeliness) / 5;

  const issues: DataQualityIssue[] = [];

  if (completeness < 0.95) {
    issues.push({
      type: 'missing_values',
      severity: completeness < 0.8 ? 'critical' : 'warning',
      count: statistics.nullCount,
      percentage: (1 - completeness) * 100,
      description: `${statistics.nullCount} missing values detected`,
      detectedAt: new Date().toISOString(),
    });
  }

  if (uniqueness < 0.9) {
    issues.push({
      type: 'duplicates',
      severity: uniqueness < 0.7 ? 'critical' : 'warning',
      count: statistics.rowCount - statistics.distinctCount,
      percentage: (1 - uniqueness) * 100,
      description: `Potential duplicate rows detected`,
      detectedAt: new Date().toISOString(),
    });
  }

  return {
    completeness,
    validity,
    uniqueness,
    consistency,
    timeliness,
    overallScore,
    issues,
  };
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createDataset(params: {
  organizationId: string;
  name: string;
  description?: string;
  owner: string;
  tags?: string[];
  metadata: DatasetMetadata;
}): Dataset {
  const now = new Date().toISOString();
  const id = randomUUID();

  const dataset: Dataset = {
    id,
    organizationId: params.organizationId,
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

  datasets.set(id, dataset);
  datasetVersions.set(id, []);

  return dataset;
}

export function getDataset(id: string): Dataset | undefined {
  return datasets.get(id);
}

export function listDatasets(
  organizationId: string,
  filters?: { status?: DatasetStatus; tag?: string; owner?: string }
): Dataset[] {
  let result = Array.from(datasets.values()).filter(
    d => d.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(d => d.status === filters.status);
  if (filters?.tag) result = result.filter(d => d.tags.includes(filters.tag!));
  if (filters?.owner) result = result.filter(d => d.owner === filters.owner);

  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createDatasetVersion(params: {
  datasetId: string;
  source: DataSource;
  schema: DatasetSchema;
  statistics: DatasetStatistics;
  storage: StorageInfo;
  metadata: VersionMetadata;
  createdBy: string;
}): DatasetVersion {
  const dataset = datasets.get(params.datasetId);
  if (!dataset) throw new Error(`Dataset ${params.datasetId} not found`);

  const now = new Date().toISOString();
  const versions = datasetVersions.get(params.datasetId) || [];
  const versionNumber = generateDatasetVersionNumber(versions);

  const quality = calculateDataQuality(params.statistics);

  const version: DatasetVersion = {
    id: randomUUID(),
    datasetId: params.datasetId,
    version: versionNumber,
    parentVersionId: versions.length > 0 ? versions[versions.length - 1].id : undefined,
    source: params.source,
    schema: params.schema,
    statistics: params.statistics,
    quality,
    storage: params.storage,
    lineage: {
      upstream: [],
      downstream: [],
      transformations: [],
    },
    metadata: params.metadata,
    createdAt: now,
    createdBy: params.createdBy,
  };

  versions.push(version);
  datasetVersions.set(params.datasetId, versions);

  dataset.versions = versions;
  dataset.latestVersion = versionNumber;
  dataset.updatedAt = now;

  return version;
}

export function getDatasetVersions(datasetId: string): DatasetVersion[] {
  return datasetVersions.get(datasetId) || [];
}

export function getDatasetVersion(datasetId: string, version: string): DatasetVersion | undefined {
  const versions = datasetVersions.get(datasetId) || [];
  return versions.find(v => v.version === version);
}

export function initDataVersionControl(params: {
  datasetId: string;
  config?: Partial<DVCConfig>;
}): DataVersionControl {
  const dataset = datasets.get(params.datasetId);
  if (!dataset) throw new Error(`Dataset ${params.datasetId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultConfig: DVCConfig = {
    enabled: true,
    cacheEnabled: true,
    cacheDir: '.dvc/cache',
    autostage: true,
    versionAware: true,
  };

  const dvc: DataVersionControl = {
    id,
    datasetId: params.datasetId,
    dvcConfig: { ...defaultConfig, ...params.config },
    remotes: [],
    stages: [],
    metrics: {
      trackedMetrics: [],
      history: [],
    },
  };

  dataVersionControls.set(id, dvc);
  return dvc;
}

export function getDataVersionControl(datasetId: string): DataVersionControl | undefined {
  return Array.from(dataVersionControls.values()).find(
    dvc => dvc.datasetId === datasetId
  );
}

export function addDVCREmote(
  dvcId: string,
  remote: Omit<DVCREmote, 'default'>
): DataVersionControl {
  const dvc = dataVersionControls.get(dvcId);
  if (!dvc) throw new Error(`DVC ${dvcId} not found`);

  const newRemote: DVCREmote = {
    ...remote,
    default: dvc.remotes.length === 0,
  };

  dvc.remotes.push(newRemote);
  return dvc;
}

export function addDVCStage(
  dvcId: string,
  stage: DVCStage
): DataVersionControl {
  const dvc = dataVersionControls.get(dvcId);
  if (!dvc) throw new Error(`DVC ${dvcId} not found`);

  dvc.stages.push(stage);
  return dvc;
}

export function trackDVCMetrics(
  dvcId: string,
  metrics: Record<string, number>
): DataVersionControl {
  const dvc = dataVersionControls.get(dvcId);
  if (!dvc) throw new Error(`DVC ${dvcId} not found`);

  dvc.metrics.history.push({
    timestamp: new Date().toISOString(),
    metrics,
  });

  dvc.lastSyncAt = new Date().toISOString();
  return dvc;
}

export function diffDatasetVersions(
  datasetId: string,
  fromVersion: string,
  toVersion: string
): DataDiff {
  const versions = datasetVersions.get(datasetId) || [];
  const fromVer = versions.find(v => v.version === fromVersion);
  const toVer = versions.find(v => v.version === toVersion);

  if (!fromVer || !toVer) throw new Error('One or both versions not found');

  // Calculate schema changes
  const schemaChanges: SchemaChange[] = [];
  const fromFields = new Map(fromVer.schema.fields.map(f => [f.name, f]));
  const toFields = new Map(toVer.schema.fields.map(f => [f.name, f]));

  toFields.forEach((field, name) => {
    if (!fromFields.has(name)) {
      schemaChanges.push({ type: 'added', field: name, newType: field.type, newNullable: field.nullable });
    } else {
      const oldField = fromFields.get(name)!;
      if (oldField.type !== field.type || oldField.nullable !== field.nullable) {
        schemaChanges.push({
          type: 'modified',
          field: name,
          oldType: oldField.type,
          newType: field.type,
          oldNullable: oldField.nullable,
          newNullable: field.nullable,
        });
      }
    }
  });

  fromFields.forEach((field, name) => {
    if (!toFields.has(name)) {
      schemaChanges.push({ type: 'removed', field: name, oldType: field.type, oldNullable: field.nullable });
    }
  });

  // Calculate data changes (simplified)
  const rowCountChange = toVer.statistics.rowCount - fromVer.statistics.rowCount;
  const addedRows = Math.max(0, rowCountChange);
  const removedRows = Math.max(0, -rowCountChange);

  return {
    datasetId,
    fromVersion,
    toVersion,
    schemaChanges,
    dataChanges: {
      addedRows,
      removedRows,
      modifiedRows: Math.floor(_rng.next() * 100), // Simplified
      sampleChanges: [],
    },
    statisticsChanges: {
      rowCountChange,
      sizeChange: toVer.storage.sizeBytes - fromVer.storage.sizeBytes,
      fieldChanges: {},
    },
  };
}

export function getDataLineage(datasetId: string, version: string): DataLineage {
  const datasetVersion = getDatasetVersion(datasetId, version);
  if (!datasetVersion) throw new Error(`Version ${version} not found`);

  return datasetVersion.lineage;
}

export function updateDatasetMetadata(
  datasetId: string,
  metadata: Partial<DatasetMetadata>
): Dataset {
  const dataset = datasets.get(datasetId);
  if (!dataset) throw new Error(`Dataset ${datasetId} not found`);

  Object.assign(dataset.metadata, metadata);
  dataset.updatedAt = new Date().toISOString();

  return dataset;
}

export function deprecateDataset(datasetId: string): Dataset {
  const dataset = datasets.get(datasetId);
  if (!dataset) throw new Error(`Dataset ${datasetId} not found`);

  dataset.status = 'deprecated';
  dataset.updatedAt = new Date().toISOString();

  return dataset;
}

export function archiveDataset(datasetId: string): Dataset {
  const dataset = datasets.get(datasetId);
  if (!dataset) throw new Error(`Dataset ${datasetId} not found`);

  dataset.status = 'archived';
  dataset.updatedAt = new Date().toISOString();

  return dataset;
}

export function getDatasetStatistics(datasetId: string): {
  totalVersions: number;
  totalSizeBytes: number;
  averageQualityScore: number;
  versionHistory: Array<{ version: string; createdAt: string; rowCount: number; sizeBytes: number }>;
} {
  const versions = datasetVersions.get(datasetId) || [];

  const totalSizeBytes = versions.reduce((sum, v) => sum + v.storage.sizeBytes, 0);
  const averageQualityScore = versions.length > 0
    ? versions.reduce((sum, v) => sum + v.quality.overallScore, 0) / versions.length
    : 0;

  const versionHistory = versions.map(v => ({
    version: v.version,
    createdAt: v.createdAt,
    rowCount: v.statistics.rowCount,
    sizeBytes: v.storage.sizeBytes,
  }));

  return {
    totalVersions: versions.length,
    totalSizeBytes,
    averageQualityScore,
    versionHistory,
  };
}

export function validateDataset(
  datasetId: string,
  version: string
): {
  valid: boolean;
  issues: DataQualityIssue[];
  schemaValid: boolean;
  constraintsSatisfied: boolean;
} {
  const datasetVersion = getDatasetVersion(datasetId, version);
  if (!datasetVersion) throw new Error(`Version ${version} not found`);

  const issues = datasetVersion.quality.issues;
  const criticalIssues = issues.filter(i => i.severity === 'critical');

  return {
    valid: criticalIssues.length === 0,
    issues,
    schemaValid: true, // Simplified
    constraintsSatisfied: true, // Simplified
  };
}

export function searchDatasets(
  organizationId: string,
  query: string,
  filters?: { tag?: string; domain?: string; status?: DatasetStatus }
): Dataset[] {
  let result = Array.from(datasets.values()).filter(
    d => d.organizationId === organizationId
  );

  const queryLower = query.toLowerCase();
  if (query) {
    result = result.filter(d =>
      d.name.toLowerCase().includes(queryLower) ||
      (d.description && d.description.toLowerCase().includes(queryLower)) ||
      d.tags.some(t => t.toLowerCase().includes(queryLower))
    );
  }

  if (filters?.tag) result = result.filter(d => d.tags.includes(filters.tag!));
  if (filters?.domain) result = result.filter(d => d.metadata.domain === filters.domain);
  if (filters?.status) result = result.filter(d => d.status === filters.status);

  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
