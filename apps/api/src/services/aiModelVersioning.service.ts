/**
 * Module 73: AI Model Versioning Service
 *
 * Provides advanced model versioning capabilities including semantic versioning
 * enforcement, version compatibility tracking, version lineage and dependencies,
 * version rollback and promotion workflows, version comparison and diff, version
 * approval workflows, and version deprecation policies for comprehensive model
 * version management.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ModelVersion {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  version: string; // Semantic version (e.g., "1.2.3")
  stage: VersionStage;
  status: VersionStatus;
  artifact: VersionArtifact;
  compatibility: VersionCompatibility;
  lineage: VersionLineage;
  approval: VersionApproval;
  deprecation?: VersionDeprecation;
  releaseNotes?: ReleaseNotes;
  metadata: Record<string, any>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  deprecatedAt?: string;
  retiredAt?: string;
}

export type VersionStage =
  | 'development'
  | 'testing'
  | 'staging'
  | 'production'
  | 'canary'
  | 'shadow'
  | 'deprecated'
  | 'retired';

export type VersionStatus =
  | 'draft'
  | 'pending-review'
  | 'in-review'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'deprecated'
  | 'retired';

export interface VersionArtifact {
  uri: string;
  sizeBytes: number;
  hash: string;
  format: ArtifactFormat;
  framework?: string;
  dependencies?: Dependency[];
  signatures?: ArtifactSignature[];
}

export type ArtifactFormat =
  | 'onnx'
  | 'tensorflow'
  | 'pytorch'
  | 'scikit-learn'
  | 'xgboost'
  | 'custom'
  | 'unknown';

export interface Dependency {
  name: string;
  version: string;
  type: 'library' | 'framework' | 'model' | 'data';
  optional?: boolean;
}

export interface ArtifactSignature {
  algorithm: string;
  signature: string;
  publicKey?: string;
  signedBy: string;
  signedAt: string;
}

export interface VersionCompatibility {
  breakingChanges: BreakingChange[];
  backwardCompatible: boolean;
  forwardCompatible: boolean;
  compatibleVersions: string[];
  incompatibleVersions: string[];
  migrationGuide?: string;
}

export interface BreakingChange {
  type: 'api' | 'schema' | 'behavior' | 'performance' | 'data-format';
  description: string;
  affectedComponents: string[];
  migrationSteps?: string[];
}

export interface VersionLineage {
  parentVersionId?: string;
  parentVersion?: string;
  childVersionIds: string[];
  branch: string;
  commitHash?: string;
  trainingRunId?: string;
  experimentId?: string;
  tags: string[];
}

export interface VersionApproval {
  required: boolean;
  status: 'pending' | 'approved' | 'rejected';
  reviewers: Reviewer[];
  approvals: Approval[];
  rejections: Rejection[];
  workflow?: ApprovalWorkflow;
}

export interface Reviewer {
  userId: string;
  userName: string;
  role: string;
  required: boolean;
}

export interface Approval {
  reviewerId: string;
  reviewerName: string;
  approvedAt: string;
  comments?: string;
}

export interface Rejection {
  reviewerId: string;
  reviewerName: string;
  rejectedAt: string;
  reason: string;
  comments?: string;
}

export interface ApprovalWorkflow {
  id: string;
  name: string;
  stages: ApprovalStage[];
  currentStage: number;
}

export interface ApprovalStage {
  name: string;
  reviewers: string[];
  requiredApprovals: number;
  status: 'pending' | 'in-progress' | 'completed' | 'skipped';
}

export interface VersionDeprecation {
  deprecatedAt: string;
  deprecatedBy: string;
  reason: string;
  sunsetDate?: string;
  alternativeVersionId?: string;
  alternativeVersion?: string;
  migrationGuide?: string;
  affectedConsumers: string[];
}

export interface ReleaseNotes {
  summary: string;
  newFeatures: string[];
  improvements: string[];
  bugFixes: string[];
  breakingChanges: string[];
  knownIssues: string[];
  contributors: string[];
  links?: Record<string, string>;
}

export interface VersionComparison {
  id: string;
  version1Id: string;
  version2Id: string;
  version1: string;
  version2: string;
  differences: VersionDifference[];
  breakingChanges: BreakingChange[];
  compatibilityScore: number; // 0-100
  migrationEffort: 'low' | 'medium' | 'high';
  recommendations: string[];
  createdAt: string;
}

export interface VersionDifference {
  type: 'metadata' | 'artifact' | 'dependency' | 'performance' | 'configuration';
  field: string;
  version1Value: any;
  version2Value: any;
  impact: 'none' | 'low' | 'medium' | 'high';
}

export interface VersionPromotion {
  id: string;
  versionId: string;
  fromStage: VersionStage;
  toStage: VersionStage;
  promotedBy: string;
  promotedAt: string;
  reason?: string;
  approval?: Approval;
}

export interface VersionRollback {
  id: string;
  modelId: string;
  fromVersionId: string;
  toVersionId: string;
  fromVersion: string;
  toVersion: string;
  rolledBackBy: string;
  rolledBackAt: string;
  reason: string;
  approval?: Approval;
}

export interface VersioningDashboard {
  organizationId: string;
  totalModels: number;
  totalVersions: number;
  versionsByStage: Record<VersionStage, number>;
  versionsByStatus: Record<VersionStatus, number>;
  recentVersions: ModelVersion[];
  pendingApprovals: number;
  deprecatedVersions: number;
  breakingChanges: number;
  averageVersionsPerModel: number;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const versions = new Map<string, ModelVersion>();
const comparisons = new Map<string, VersionComparison>();
const promotions = new Map<string, VersionPromotion>();
const rollbacks = new Map<string, VersionRollback>();

// ─── Semantic Versioning Utilities ─────────────────────────────────────────────

/**
 * Parse semantic version
 */
function parseSemver(version: string): { major: number; minor: number; patch: number; prerelease?: string } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

/**
 * Compare semantic versions
 */
function compareSemver(v1: string, v2: string): number {
  const parsed1 = parseSemver(v1);
  const parsed2 = parseSemver(v2);
  if (!parsed1 || !parsed2) return 0;

  if (parsed1.major !== parsed2.major) return parsed1.major - parsed2.major;
  if (parsed1.minor !== parsed2.minor) return parsed1.minor - parsed2.minor;
  if (parsed1.patch !== parsed2.patch) return parsed1.patch - parsed2.patch;
  return 0;
}

/**
 * Check if version change is breaking (major version bump)
 */
function isBreakingChange(oldVersion: string, newVersion: string): boolean {
  const old = parseSemver(oldVersion);
  const newV = parseSemver(newVersion);
  if (!old || !newV) return false;
  return newV.major > old.major;
}

/**
 * Validate semantic version format
 */
function isValidSemver(version: string): boolean {
  return parseSemver(version) !== null;
}

// ─── Version Management ────────────────────────────────────────────────────────

/**
 * Create model version
 */
export async function createModelVersion(
  organizationId: string,
  params: {
    modelId: string;
    modelName: string;
    version: string;
    artifact: Omit<VersionArtifact, 'signatures'>;
    parentVersionId?: string;
    branch?: string;
    trainingRunId?: string;
    experimentId?: string;
    metadata?: Record<string, any>;
    createdBy: string;
  }
): Promise<ModelVersion> {
  // Validate semantic version
  if (!isValidSemver(params.version)) {
    throw new Error(`Invalid semantic version: ${params.version}. Expected format: MAJOR.MINOR.PATCH`);
  }

  const id = `version_${randomUUID()}`;
  const now = new Date().toISOString();

  // Check for duplicate version
  const existingVersions = Array.from(versions.values()).filter(
    (v) => v.organizationId === organizationId && v.modelId === params.modelId && v.version === params.version
  );
  if (existingVersions.length > 0) {
    throw new Error(`Version ${params.version} already exists for model ${params.modelId}`);
  }

  // Determine compatibility
  let compatibility: VersionCompatibility = {
    breakingChanges: [],
    backwardCompatible: true,
    forwardCompatible: true,
    compatibleVersions: [],
    incompatibleVersions: [],
  };

  if (params.parentVersionId) {
    const parentVersion = versions.get(params.parentVersionId);
    if (parentVersion) {
      const breaking = isBreakingChange(parentVersion.version, params.version);
      compatibility = {
        breakingChanges: breaking ? [{
          type: 'api',
          description: `Major version bump from ${parentVersion.version} to ${params.version}`,
          affectedComponents: ['api', 'schema'],
        }] : [],
        backwardCompatible: !breaking,
        forwardCompatible: false,
        compatibleVersions: breaking ? [] : [parentVersion.version],
        incompatibleVersions: breaking ? [parentVersion.version] : [],
      };
    }
  }

  const version: ModelVersion = {
    id,
    organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    version: params.version,
    stage: 'development',
    status: 'draft',
    artifact: {
      ...params.artifact,
      signatures: [],
    },
    compatibility,
    lineage: {
      parentVersionId: params.parentVersionId,
      parentVersion: params.parentVersionId ? versions.get(params.parentVersionId)?.version : undefined,
      childVersionIds: [],
      branch: params.branch || 'main',
      trainingRunId: params.trainingRunId,
      experimentId: params.experimentId,
      tags: [],
    },
    approval: {
      required: false,
      status: 'pending',
      reviewers: [],
      approvals: [],
      rejections: [],
    },
    metadata: params.metadata || {},
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  versions.set(id, version);

  // Update parent's child list
  if (params.parentVersionId) {
    const parent = versions.get(params.parentVersionId);
    if (parent) {
      parent.lineage.childVersionIds.push(id);
      parent.updatedAt = now;
      versions.set(params.parentVersionId, parent);
    }
  }

  return version;
}

/**
 * Update model version
 */
export async function updateModelVersion(
  versionId: string,
  updates: Partial<Omit<ModelVersion, 'id' | 'organizationId' | 'modelId' | 'version' | 'createdAt'>>
): Promise<ModelVersion | null> {
  const version = versions.get(versionId);
  if (!version) return null;

  const updated: ModelVersion = {
    ...version,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  versions.set(versionId, updated);
  return updated;
}

/**
 * Promote version to new stage
 */
export async function promoteVersion(
  versionId: string,
  toStage: VersionStage,
  promotedBy: string,
  reason?: string
): Promise<VersionPromotion | null> {
  const version = versions.get(versionId);
  if (!version) return null;

  const fromStage = version.stage;
  const now = new Date().toISOString();

  const promotion: VersionPromotion = {
    id: `promotion_${randomUUID()}`,
    versionId,
    fromStage,
    toStage,
    promotedBy,
    promotedAt: now,
    reason,
  };

  version.stage = toStage;
  version.updatedAt = now;

  if (toStage === 'production' || toStage === 'canary' || toStage === 'shadow') {
    version.status = 'published';
    version.publishedAt = now;
  }

  versions.set(versionId, version);
  promotions.set(promotion.id, promotion);

  return promotion;
}

/**
 * Rollback to previous version
 */
export async function rollbackVersion(
  modelId: string,
  fromVersionId: string,
  toVersionId: string,
  rolledBackBy: string,
  reason: string
): Promise<VersionRollback | null> {
  const fromVersion = versions.get(fromVersionId);
  const toVersion = versions.get(toVersionId);

  if (!fromVersion || !toVersion) return null;
  if (fromVersion.modelId !== modelId || toVersion.modelId !== modelId) return null;

  const now = new Date().toISOString();

  const rollback: VersionRollback = {
    id: `rollback_${randomUUID()}`,
    modelId,
    fromVersionId,
    toVersionId,
    fromVersion: fromVersion.version,
    toVersion: toVersion.version,
    rolledBackBy,
    rolledBackAt: now,
    reason,
  };

  // Promote the rollback target to production
  toVersion.stage = 'production';
  toVersion.status = 'published';
  toVersion.updatedAt = now;

  versions.set(toVersionId, toVersion);
  rollbacks.set(rollback.id, rollback);

  return rollback;
}

/**
 * Deprecate version
 */
export async function deprecateVersion(
  versionId: string,
  deprecatedBy: string,
  reason: string,
  options?: {
    sunsetDate?: string;
    alternativeVersionId?: string;
    migrationGuide?: string;
    affectedConsumers?: string[];
  }
): Promise<ModelVersion | null> {
  const version = versions.get(versionId);
  if (!version) return null;

  const now = new Date().toISOString();

  version.stage = 'deprecated';
  version.status = 'deprecated';
  version.deprecatedAt = now;
  version.deprecation = {
    deprecatedAt: now,
    deprecatedBy,
    reason,
    sunsetDate: options?.sunsetDate,
    alternativeVersionId: options?.alternativeVersionId,
    alternativeVersion: options?.alternativeVersionId ? versions.get(options.alternativeVersionId)?.version : undefined,
    migrationGuide: options?.migrationGuide,
    affectedConsumers: options?.affectedConsumers || [],
  };
  version.updatedAt = now;

  versions.set(versionId, version);
  return version;
}

/**
 * Compare two versions
 */
export async function compareVersions(
  version1Id: string,
  version2Id: string
): Promise<VersionComparison | null> {
  const version1 = versions.get(version1Id);
  const version2 = versions.get(version2Id);

  if (!version1 || !version2) return null;

  const differences: VersionDifference[] = [];

  // Compare metadata
  const allKeys = new Set([...Object.keys(version1.metadata), ...Object.keys(version2.metadata)]);
  for (const key of allKeys) {
    const v1Value = version1.metadata[key];
    const v2Value = version2.metadata[key];
    if (JSON.stringify(v1Value) !== JSON.stringify(v2Value)) {
      differences.push({
        type: 'metadata',
        field: key,
        version1Value: v1Value,
        version2Value: v2Value,
        impact: 'low',
      });
    }
  }

  // Compare artifact
  if (version1.artifact.sizeBytes !== version2.artifact.sizeBytes) {
    differences.push({
      type: 'artifact',
      field: 'sizeBytes',
      version1Value: version1.artifact.sizeBytes,
      version2Value: version2.artifact.sizeBytes,
      impact: 'low',
    });
  }

  if (version1.artifact.hash !== version2.artifact.hash) {
    differences.push({
      type: 'artifact',
      field: 'hash',
      version1Value: version1.artifact.hash,
      version2Value: version2.artifact.hash,
      impact: 'high',
    });
  }

  // Compare dependencies
  const deps1 = version1.artifact.dependencies || [];
  const deps2 = version2.artifact.dependencies || [];
  if (JSON.stringify(deps1) !== JSON.stringify(deps2)) {
    differences.push({
      type: 'dependency',
      field: 'dependencies',
      version1Value: deps1,
      version2Value: deps2,
      impact: 'medium',
    });
  }

  const breakingChanges = version2.compatibility.breakingChanges;
  const compatibilityScore = breakingChanges.length === 0 ? 100 : Math.max(0, 100 - breakingChanges.length * 20);
  const migrationEffort: VersionComparison['migrationEffort'] = breakingChanges.length === 0 ? 'low' : breakingChanges.length <= 2 ? 'medium' : 'high';

  const comparison: VersionComparison = {
    id: `comparison_${randomUUID()}`,
    version1Id,
    version2Id,
    version1: version1.version,
    version2: version2.version,
    differences,
    breakingChanges,
    compatibilityScore,
    migrationEffort,
    recommendations: breakingChanges.length > 0
      ? ['Review breaking changes carefully', 'Update dependent systems', 'Test thoroughly before deployment']
      : ['Safe to upgrade', 'No breaking changes detected'],
    createdAt: new Date().toISOString(),
  };

  comparisons.set(comparison.id, comparison);
  return comparison;
}

/**
 * Add release notes
 */
export async function addReleaseNotes(
  versionId: string,
  releaseNotes: ReleaseNotes
): Promise<ModelVersion | null> {
  const version = versions.get(versionId);
  if (!version) return null;

  version.releaseNotes = releaseNotes;
  version.updatedAt = new Date().toISOString();

  versions.set(versionId, version);
  return version;
}

/**
 * Submit for approval
 */
export async function submitForApproval(
  versionId: string,
  reviewers: Reviewer[]
): Promise<ModelVersion | null> {
  const version = versions.get(versionId);
  if (!version) return null;

  version.status = 'pending-review';
  version.approval.required = true;
  version.approval.status = 'pending';
  version.approval.reviewers = reviewers;
  version.updatedAt = new Date().toISOString();

  versions.set(versionId, version);
  return version;
}

/**
 * Approve version
 */
export async function approveVersion(
  versionId: string,
  reviewerId: string,
  reviewerName: string,
  comments?: string
): Promise<ModelVersion | null> {
  const version = versions.get(versionId);
  if (!version) return null;

  const approval: Approval = {
    reviewerId,
    reviewerName,
    approvedAt: new Date().toISOString(),
    comments,
  };

  version.approval.approvals.push(approval);

  // Check if all required reviewers have approved
  const requiredReviewers = version.approval.reviewers.filter((r) => r.required);
  const approvedByRequired = version.approval.approvals.filter((a) =>
    requiredReviewers.some((r) => r.userId === a.reviewerId)
  );

  if (approvedByRequired.length >= requiredReviewers.length) {
    version.approval.status = 'approved';
    version.status = 'approved';
  }

  version.updatedAt = approval.approvedAt;
  versions.set(versionId, version);

  return version;
}

/**
 * Reject version
 */
export async function rejectVersion(
  versionId: string,
  reviewerId: string,
  reviewerName: string,
  reason: string,
  comments?: string
): Promise<ModelVersion | null> {
  const version = versions.get(versionId);
  if (!version) return null;

  const rejection: Rejection = {
    reviewerId,
    reviewerName,
    rejectedAt: new Date().toISOString(),
    reason,
    comments,
  };

  version.approval.rejections.push(rejection);
  version.approval.status = 'rejected';
  version.status = 'rejected';
  version.updatedAt = rejection.rejectedAt;

  versions.set(versionId, version);
  return version;
}

/**
 * Get model version by ID
 */
export async function getModelVersion(versionId: string): Promise<ModelVersion | null> {
  return versions.get(versionId) || null;
}

/**
 * List model versions
 */
export async function listModelVersions(
  organizationId: string,
  filters?: {
    modelId?: string;
    stage?: VersionStage;
    status?: VersionStatus;
  }
): Promise<ModelVersion[]> {
  const allVersions = Array.from(versions.values()).filter(
    (v) => v.organizationId === organizationId
  );

  return allVersions.filter((v) => {
    if (filters?.modelId && v.modelId !== filters.modelId) return false;
    if (filters?.stage && v.stage !== filters.stage) return false;
    if (filters?.status && v.status !== filters.status) return false;
    return true;
  });
}

/**
 * Get versioning dashboard
 */
export async function getVersioningDashboard(organizationId: string): Promise<VersioningDashboard> {
  const allVersions = await listModelVersions(organizationId);

  const versionsByStage: Record<string, number> = {};
  const versionsByStatus: Record<string, number> = {};
  let deprecatedCount = 0;
  let breakingChangesCount = 0;
  const modelIds = new Set<string>();

  for (const version of allVersions) {
    modelIds.add(version.modelId);
    versionsByStage[version.stage] = (versionsByStage[version.stage] || 0) + 1;
    versionsByStatus[version.status] = (versionsByStatus[version.status] || 0) + 1;

    if (version.stage === 'deprecated') deprecatedCount++;
    breakingChangesCount += version.compatibility.breakingChanges.length;
  }

  const recentVersions = allVersions
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  const pendingApprovals = allVersions.filter((v) => v.approval.status === 'pending').length;

  return {
    organizationId,
    totalModels: modelIds.size,
    totalVersions: allVersions.length,
    versionsByStage: versionsByStage as Record<VersionStage, number>,
    versionsByStatus: versionsByStatus as Record<VersionStatus, number>,
    recentVersions,
    pendingApprovals,
    deprecatedVersions: deprecatedCount,
    breakingChanges: breakingChangesCount,
    averageVersionsPerModel: modelIds.size > 0 ? allVersions.length / modelIds.size : 0,
  };
}
