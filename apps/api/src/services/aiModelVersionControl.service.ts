/**
 * Module 171: AI Model Version Control Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides advanced version control capabilities for AI models including branching,
 * merging, version history, version comparison, and version tagging.
 */

import { randomUUID } from 'crypto';

export interface ModelVersion {
  id: string;
  organizationId: string;
  modelId: string;
  versionNumber: string;
  branch: string;
  parentVersion?: string;
  commitMessage: string;
  author: VersionAuthor;
  status: VersionStatus;
  tags: string[];
  metadata: Record<string, any>;
  createdAt: string;
  publishedAt?: string;
}

export type VersionStatus = 'draft' | 'published' | 'deprecated' | 'archived';

export interface VersionAuthor {
  userId: string;
  userName: string;
  email?: string;
}

export interface Branch {
  id: string;
  organizationId: string;
  modelId: string;
  name: string;
  parentBranch?: string;
  headVersion: string;
  status: BranchStatus;
  createdBy: string;
  createdAt: string;
  mergedAt?: string;
}

export type BranchStatus = 'active' | 'merged' | 'deleted';

export interface VersionTag {
  id: string;
  versionId: string;
  tagName: string;
  description?: string;
  createdBy: string;
  createdAt: string;
}

export interface VersionDiff {
  fromVersion: string;
  toVersion: string;
  changes: VersionChange[];
  summary: DiffSummary;
}

export interface VersionChange {
  type: 'added' | 'modified' | 'deleted';
  path: string;
  oldValue?: any;
  newValue?: any;
  size?: number;
}

export interface DiffSummary {
  totalChanges: number;
  additions: number;
  modifications: number;
  deletions: number;
  totalSizeChange: number;
}

export interface MergeRequest {
  id: string;
  organizationId: string;
  modelId: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description?: string;
  status: MergeStatus;
  createdBy: string;
  reviewers: string[];
  approvals: MergeApproval[];
  conflicts: MergeConflict[];
  createdAt: string;
  mergedAt?: string;
}

export type MergeStatus = 'open' | 'approved' | 'merged' | 'rejected' | 'conflicts';

export interface MergeApproval {
  userId: string;
  userName: string;
  approved: boolean;
  comments?: string;
  approvedAt: string;
}

export interface MergeConflict {
  path: string;
  type: 'content' | 'structure';
  description: string;
  resolved: boolean;
  resolution?: string;
}

const modelVersions = new Map<string, ModelVersion>();
const branches = new Map<string, Branch>();
const versionTags = new Map<string, VersionTag>();
const mergeRequests = new Map<string, MergeRequest>();

export function createModelVersion(params: {
  organizationId: string;
  modelId: string;
  versionNumber: string;
  branch: string;
  parentVersion?: string;
  commitMessage: string;
  author: VersionAuthor;
  metadata?: Record<string, any>;
}): ModelVersion {
  const now = new Date().toISOString();
  const version: ModelVersion = {
    id: randomUUID(),
    organizationId: params.organizationId,
    modelId: params.modelId,
    versionNumber: params.versionNumber,
    branch: params.branch,
    parentVersion: params.parentVersion,
    commitMessage: params.commitMessage,
    author: params.author,
    status: 'draft',
    tags: [],
    metadata: params.metadata || {},
    createdAt: now,
  };
  modelVersions.set(version.id, version);
  return version;
}

export function getModelVersion(id: string): ModelVersion | undefined {
  return modelVersions.get(id);
}

export function listModelVersions(
  organizationId: string,
  modelId: string,
  filters?: { branch?: string; status?: VersionStatus }
): ModelVersion[] {
  let versions = Array.from(modelVersions.values()).filter(
    v => v.organizationId === organizationId && v.modelId === modelId
  );

  if (filters?.branch) versions = versions.filter(v => v.branch === filters.branch);
  if (filters?.status) versions = versions.filter(v => v.status === filters.status);

  return versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function publishVersion(versionId: string): ModelVersion {
  const version = modelVersions.get(versionId);
  if (!version) throw new Error(`Version ${versionId} not found`);
  version.status = 'published';
  version.publishedAt = new Date().toISOString();
  return version;
}

export function createBranch(params: {
  organizationId: string;
  modelId: string;
  name: string;
  parentBranch?: string;
  headVersion: string;
  createdBy: string;
}): Branch {
  const now = new Date().toISOString();
  const branch: Branch = {
    id: randomUUID(),
    organizationId: params.organizationId,
    modelId: params.modelId,
    name: params.name,
    parentBranch: params.parentBranch,
    headVersion: params.headVersion,
    status: 'active',
    createdBy: params.createdBy,
    createdAt: now,
  };
  branches.set(branch.id, branch);
  return branch;
}

export function getBranch(id: string): Branch | undefined {
  return branches.get(id);
}

export function listBranches(
  organizationId: string,
  modelId: string,
  filters?: { status?: BranchStatus }
): Branch[] {
  let branchList = Array.from(branches.values()).filter(
    b => b.organizationId === organizationId && b.modelId === modelId
  );

  if (filters?.status) branchList = branchList.filter(b => b.status === filters.status);

  return branchList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function mergeBranch(branchId: string, targetBranch: string): Branch {
  const branch = branches.get(branchId);
  if (!branch) throw new Error(`Branch ${branchId} not found`);
  if (branch.status !== 'active') throw new Error('Branch is not active');

  branch.status = 'merged';
  branch.mergedAt = new Date().toISOString();
  return branch;
}

export function tagVersion(params: {
  versionId: string;
  tagName: string;
  description?: string;
  createdBy: string;
}): VersionTag {
  const version = modelVersions.get(params.versionId);
  if (!version) throw new Error(`Version ${params.versionId} not found`);

  const now = new Date().toISOString();
  const tag: VersionTag = {
    id: randomUUID(),
    versionId: params.versionId,
    tagName: params.tagName,
    description: params.description,
    createdBy: params.createdBy,
    createdAt: now,
  };

  versionTags.set(tag.id, tag);
  version.tags.push(params.tagName);
  return tag;
}

export function getVersionTags(versionId: string): VersionTag[] {
  return Array.from(versionTags.values()).filter(t => t.versionId === versionId);
}

export function compareVersions(fromVersionId: string, toVersionId: string): VersionDiff {
  const fromVersion = modelVersions.get(fromVersionId);
  const toVersion = modelVersions.get(toVersionId);
  if (!fromVersion || !toVersion) throw new Error('One or both versions not found');

  // Simulate diff calculation
  const changes: VersionChange[] = [
    { type: 'modified', path: 'model.weights', size: 1024 },
    { type: 'modified', path: 'model.config', size: 256 },
  ];

  const summary: DiffSummary = {
    totalChanges: changes.length,
    additions: changes.filter(c => c.type === 'added').length,
    modifications: changes.filter(c => c.type === 'modified').length,
    deletions: changes.filter(c => c.type === 'deleted').length,
    totalSizeChange: changes.reduce((sum, c) => sum + (c.size || 0), 0),
  };

  return {
    fromVersion: fromVersion.versionNumber,
    toVersion: toVersion.versionNumber,
    changes,
    summary,
  };
}

export function createMergeRequest(params: {
  organizationId: string;
  modelId: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description?: string;
  createdBy: string;
  reviewers?: string[];
}): MergeRequest {
  const now = new Date().toISOString();
  const mergeRequest: MergeRequest = {
    id: randomUUID(),
    organizationId: params.organizationId,
    modelId: params.modelId,
    sourceBranch: params.sourceBranch,
    targetBranch: params.targetBranch,
    title: params.title,
    description: params.description,
    status: 'open',
    createdBy: params.createdBy,
    reviewers: params.reviewers || [],
    approvals: [],
    conflicts: [],
    createdAt: now,
  };
  mergeRequests.set(mergeRequest.id, mergeRequest);
  return mergeRequest;
}

export function getMergeRequest(id: string): MergeRequest | undefined {
  return mergeRequests.get(id);
}

export function listMergeRequests(
  organizationId: string,
  modelId: string,
  filters?: { status?: MergeStatus }
): MergeRequest[] {
  let requests = Array.from(mergeRequests.values()).filter(
    mr => mr.organizationId === organizationId && mr.modelId === modelId
  );

  if (filters?.status) requests = requests.filter(mr => mr.status === filters.status);

  return requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function approveMergeRequest(
  mergeRequestId: string,
  userId: string,
  userName: string,
  approved: boolean,
  comments?: string
): MergeApproval {
  const mergeRequest = mergeRequests.get(mergeRequestId);
  if (!mergeRequest) throw new Error(`Merge request ${mergeRequestId} not found`);

  const now = new Date().toISOString();
  const approval: MergeApproval = {
    userId,
    userName,
    approved,
    comments,
    approvedAt: now,
  };

  mergeRequest.approvals.push(approval);

  // Check if all reviewers have approved
  if (mergeRequest.reviewers.length > 0) {
    const allApproved = mergeRequest.reviewers.every(reviewerId =>
      mergeRequest.approvals.some(a => a.userId === reviewerId && a.approved)
    );
    if (allApproved) {
      mergeRequest.status = 'approved';
    }
  }

  return approval;
}

export function mergeMergeRequest(mergeRequestId: string): MergeRequest {
  const mergeRequest = mergeRequests.get(mergeRequestId);
  if (!mergeRequest) throw new Error(`Merge request ${mergeRequestId} not found`);
  if (mergeRequest.status !== 'approved') throw new Error('Merge request is not approved');

  mergeRequest.status = 'merged';
  mergeRequest.mergedAt = new Date().toISOString();

  // Update branch status
  const sourceBranch = Array.from(branches.values()).find(
    b => b.name === mergeRequest.sourceBranch && b.modelId === mergeRequest.modelId
  );
  if (sourceBranch) {
    sourceBranch.status = 'merged';
    sourceBranch.mergedAt = mergeRequest.mergedAt;
  }

  return mergeRequest;
}

export function getVersionHistory(
  organizationId: string,
  modelId: string,
  limit?: number
): ModelVersion[] {
  const versions = Array.from(modelVersions.values())
    .filter(v => v.organizationId === organizationId && v.modelId === modelId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return limit ? versions.slice(0, limit) : versions;
}
