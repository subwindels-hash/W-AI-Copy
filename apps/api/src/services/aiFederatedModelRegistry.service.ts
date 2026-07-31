/**
 * Module 99: AI Federated Model Registry Service
 * WINDELS AI OS - Phase 1
 * 
 * Cross-organization model registry for federations, providing federated model
 * discovery, access control, usage tracking, model federation metadata, and
 * cross-org model lifecycle management.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FederatedModel {
  id: string;
  federationId: string;
  providerOrganizationId: string;
  providerOrganizationName: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  description?: string;
  status: FederatedModelStatus;
  metadata: FederatedModelMetadata;
  accessControl: FederatedAccessControl;
  usageStats: FederatedUsageStats;
  complianceStatus: FederatedComplianceStatus;
  lifecycle: FederatedModelLifecycle;
  createdAt: string;
  updatedAt: string;
}

export type FederatedModelStatus = 'pending_review' | 'approved' | 'published' | 'deprecated' | 'withdrawn';

export interface FederatedModelMetadata {
  framework: string;
  architecture: string;
  parameters: number;
  modelSizeMB: number;
  inputSchema: any;
  outputSchema: any;
  tags: string[];
  categories: string[];
  documentation?: string;
  license: string;
  certifications: string[];
}

export interface FederatedAccessControl {
  visibility: 'federation' | 'select_members' | 'public';
  allowedOrganizations: string[];
  deniedOrganizations: string[];
  requireAgreement: boolean;
  approvalRequired: boolean;
  approvers: string[];
  accessRequests: AccessRequest[];
}

export interface AccessRequest {
  id: string;
  organizationId: string;
  organizationName: string;
  requestedBy: string;
  purpose: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface FederatedUsageStats {
  totalRequests: number;
  requestsLast30Days: number;
  uniqueConsumers: number;
  consumerOrganizations: string[];
  averageLatencyMs: number;
  errorRate: number;
  computeHours: number;
  revenueGenerated: number;
  lastAccessedAt?: string;
}

export interface FederatedComplianceStatus {
  overallStatus: 'compliant' | 'at_risk' | 'non_compliant';
  qualityChecks: QualityCheck[];
  privacyChecks: PrivacyCheck[];
  lastAuditDate?: string;
  nextAuditDate?: string;
  violations: ComplianceViolation[];
}

export interface QualityCheck {
  id: string;
  standard: string;
  status: 'passed' | 'failed' | 'pending';
  score: number;
  threshold: number;
  checkedAt: string;
  checkedBy: string;
}

export interface PrivacyCheck {
  id: string;
  rule: string;
  status: 'compliant' | 'violation' | 'warning';
  details?: string;
  checkedAt: string;
}

export interface ComplianceViolation {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface FederatedModelLifecycle {
  submittedAt: string;
  reviewedAt?: string;
  publishedAt?: string;
  deprecatedAt?: string;
  withdrawnAt?: string;
  versions: FederatedModelVersion[];
  currentVersion: string;
}

export interface FederatedModelVersion {
  version: string;
  publishedAt: string;
  deprecatedAt?: string;
  changes: string;
  compatibility: 'backward_compatible' | 'breaking_change';
}

export interface FederatedModelSearch {
  query?: string;
  federationId?: string;
  providerOrgId?: string;
  categories?: string[];
  tags?: string[];
  framework?: string;
  minAccuracy?: number;
  maxLatency?: number;
  status?: FederatedModelStatus;
  sortBy?: 'relevance' | 'popularity' | 'recent' | 'accuracy' | 'latency';
  limit?: number;
  offset?: number;
}

export interface FederatedModelSearchResult {
  models: FederatedModel[];
  total: number;
  facets: {
    categories: Array<{ name: string; count: number }>;
    frameworks: Array<{ name: string; count: number }>;
    providers: Array<{ name: string; count: number }>;
    statuses: Array<{ status: FederatedModelStatus; count: number }>;
  };
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const federatedModels = new Map<string, FederatedModel>();
const accessRequests = new Map<string, AccessRequest>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function registerFederatedModel(params: {
  federationId: string;
  providerOrganizationId: string;
  providerOrganizationName: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  description?: string;
  metadata: FederatedModelMetadata;
  accessControl?: Partial<FederatedAccessControl>;
}): FederatedModel {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultAccessControl: FederatedAccessControl = {
    visibility: 'federation',
    allowedOrganizations: [],
    deniedOrganizations: [],
    requireAgreement: true,
    approvalRequired: false,
    approvers: [],
    accessRequests: [],
  };

  const model: FederatedModel = {
    id,
    federationId: params.federationId,
    providerOrganizationId: params.providerOrganizationId,
    providerOrganizationName: params.providerOrganizationName,
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    description: params.description,
    status: 'pending_review',
    metadata: params.metadata,
    accessControl: { ...defaultAccessControl, ...params.accessControl },
    usageStats: {
      totalRequests: 0,
      requestsLast30Days: 0,
      uniqueConsumers: 0,
      consumerOrganizations: [],
      averageLatencyMs: 0,
      errorRate: 0,
      computeHours: 0,
      revenueGenerated: 0,
    },
    complianceStatus: {
      overallStatus: 'compliant',
      qualityChecks: [],
      privacyChecks: [],
      violations: [],
    },
    lifecycle: {
      submittedAt: now,
      versions: [
        {
          version: params.modelVersion,
          publishedAt: now,
          changes: 'Initial version',
          compatibility: 'backward_compatible',
        },
      ],
      currentVersion: params.modelVersion,
    },
    createdAt: now,
    updatedAt: now,
  };

  federatedModels.set(id, model);
  return model;
}

export function getFederatedModel(id: string): FederatedModel | undefined {
  return federatedModels.get(id);
}

export function listFederatedModels(federationId: string): FederatedModel[] {
  return Array.from(federatedModels.values()).filter(m => m.federationId === federationId);
}

export function searchFederatedModels(search: FederatedModelSearch): FederatedModelSearchResult {
  let models = Array.from(federatedModels.values());

  if (search.federationId) models = models.filter(m => m.federationId === search.federationId);
  if (search.providerOrgId) models = models.filter(m => m.providerOrganizationId === search.providerOrgId);
  if (search.categories && search.categories.length > 0) {
    models = models.filter(m => m.metadata.categories.some(c => search.categories!.includes(c)));
  }
  if (search.tags && search.tags.length > 0) {
    models = models.filter(m => m.metadata.tags.some(t => search.tags!.includes(t)));
  }
  if (search.framework) models = models.filter(m => m.metadata.framework === search.framework);
  if (search.status) models = models.filter(m => m.status === search.status);
  if (search.query) {
    const q = search.query.toLowerCase();
    models = models.filter(m =>
      m.modelName.toLowerCase().includes(q) ||
      (m.description && m.description.toLowerCase().includes(q))
    );
  }

  // Sort
  if (search.sortBy === 'popularity') {
    models.sort((a, b) => b.usageStats.totalRequests - a.usageStats.totalRequests);
  } else if (search.sortBy === 'recent') {
    models.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const total = models.length;
  const offset = search.offset || 0;
  const limit = search.limit || 20;
  models = models.slice(offset, offset + limit);

  // Facets
  const allModels = Array.from(federatedModels.values());
  const categories = new Map<string, number>();
  const frameworks = new Map<string, number>();
  const providers = new Map<string, number>();
  const statuses = new Map<FederatedModelStatus, number>();

  allModels.forEach(m => {
    m.metadata.categories.forEach(c => categories.set(c, (categories.get(c) || 0) + 1));
    frameworks.set(m.metadata.framework, (frameworks.get(m.metadata.framework) || 0) + 1);
    providers.set(m.providerOrganizationName, (providers.get(m.providerOrganizationName) || 0) + 1);
    statuses.set(m.status, (statuses.get(m.status) || 0) + 1);
  });

  return {
    models,
    total,
    facets: {
      categories: Array.from(categories.entries()).map(([name, count]) => ({ name, count })),
      frameworks: Array.from(frameworks.entries()).map(([name, count]) => ({ name, count })),
      providers: Array.from(providers.entries()).map(([name, count]) => ({ name, count })),
      statuses: Array.from(statuses.entries()).map(([status, count]) => ({ status, count })),
    },
  };
}

export function approveFederatedModel(modelId: string, approvedBy: string): FederatedModel {
  const model = federatedModels.get(modelId);
  if (!model) throw new Error(`Federated model ${modelId} not found`);

  model.status = 'approved';
  model.lifecycle.reviewedAt = new Date().toISOString();
  model.updatedAt = new Date().toISOString();
  return model;
}

export function publishFederatedModel(modelId: string): FederatedModel {
  const model = federatedModels.get(modelId);
  if (!model) throw new Error(`Federated model ${modelId} not found`);
  if (model.status !== 'approved') throw new Error(`Model ${modelId} is not approved`);

  model.status = 'published';
  model.lifecycle.publishedAt = new Date().toISOString();
  model.updatedAt = new Date().toISOString();
  return model;
}

export function deprecateFederatedModel(modelId: string, reason: string): FederatedModel {
  const model = federatedModels.get(modelId);
  if (!model) throw new Error(`Federated model ${modelId} not found`);

  model.status = 'deprecated';
  model.lifecycle.deprecatedAt = new Date().toISOString();
  model.updatedAt = new Date().toISOString();
  return model;
}

export function requestModelAccess(
  modelId: string,
  params: { organizationId: string; organizationName: string; requestedBy: string; purpose: string }
): AccessRequest {
  const model = federatedModels.get(modelId);
  if (!model) throw new Error(`Federated model ${modelId} not found`);

  const now = new Date().toISOString();
  const request: AccessRequest = {
    id: randomUUID(),
    organizationId: params.organizationId,
    organizationName: params.organizationName,
    requestedBy: params.requestedBy,
    purpose: params.purpose,
    status: 'pending',
    requestedAt: now,
  };

  model.accessControl.accessRequests.push(request);
  accessRequests.set(request.id, request);
  model.updatedAt = now;
  return request;
}

export function approveAccessRequest(modelId: string, requestId: string, reviewedBy: string): AccessRequest {
  const model = federatedModels.get(modelId);
  if (!model) throw new Error(`Federated model ${modelId} not found`);

  const request = model.accessControl.accessRequests.find(r => r.id === requestId);
  if (!request) throw new Error(`Access request ${requestId} not found`);

  const now = new Date().toISOString();
  request.status = 'approved';
  request.reviewedAt = now;
  request.reviewedBy = reviewedBy;

  model.accessControl.allowedOrganizations.push(request.organizationId);
  model.usageStats.uniqueConsumers += 1;
  model.usageStats.consumerOrganizations.push(request.organizationId);
  model.updatedAt = now;
  return request;
}

export function rejectAccessRequest(modelId: string, requestId: string, reviewedBy: string, reason?: string): AccessRequest {
  const model = federatedModels.get(modelId);
  if (!model) throw new Error(`Federated model ${modelId} not found`);

  const request = model.accessControl.accessRequests.find(r => r.id === requestId);
  if (!request) throw new Error(`Access request ${requestId} not found`);

  const now = new Date().toISOString();
  request.status = 'rejected';
  request.reviewedAt = now;
  request.reviewedBy = reviewedBy;
  model.updatedAt = now;
  return request;
}

export function recordFederatedModelUsage(
  modelId: string,
  usage: { requests: number; latencyMs: number; error: boolean; computeHours: number; revenue?: number }
): FederatedUsageStats {
  const model = federatedModels.get(modelId);
  if (!model) throw new Error(`Federated model ${modelId} not found`);

  model.usageStats.totalRequests += usage.requests;
  model.usageStats.requestsLast30Days += usage.requests;
  model.usageStats.averageLatencyMs =
    (model.usageStats.averageLatencyMs * (model.usageStats.totalRequests - usage.requests) + usage.latencyMs * usage.requests) /
    model.usageStats.totalRequests;
  if (usage.error) {
    model.usageStats.errorRate = (model.usageStats.errorRate * (model.usageStats.totalRequests - usage.requests) + usage.requests) / model.usageStats.totalRequests;
  }
  model.usageStats.computeHours += usage.computeHours;
  model.usageStats.revenueGenerated += usage.revenue || 0;
  model.usageStats.lastAccessedAt = new Date().toISOString();
  model.updatedAt = new Date().toISOString();
  return model.usageStats;
}

export function runComplianceCheck(modelId: string, checkedBy: string): FederatedComplianceStatus {
  const model = federatedModels.get(modelId);
  if (!model) throw new Error(`Federated model ${modelId} not found`);

  const now = new Date().toISOString();
  const qualityCheck: QualityCheck = {
    id: randomUUID(),
    standard: 'Federation Quality Standard',
    status: 'passed',
    score: 0.92,
    threshold: 0.85,
    checkedAt: now,
    checkedBy,
  };

  const privacyCheck: PrivacyCheck = {
    id: randomUUID(),
    rule: 'Data Privacy Rule',
    status: 'compliant',
    checkedAt: now,
  };

  model.complianceStatus.qualityChecks.push(qualityCheck);
  model.complianceStatus.privacyChecks.push(privacyCheck);
  model.complianceStatus.lastAuditDate = now;
  model.complianceStatus.nextAuditDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  model.updatedAt = now;
  return model.complianceStatus;
}

export function addModelVersion(
  modelId: string,
  params: { version: string; changes: string; compatibility: 'backward_compatible' | 'breaking_change' }
): FederatedModelVersion {
  const model = federatedModels.get(modelId);
  if (!model) throw new Error(`Federated model ${modelId} not found`);

  const now = new Date().toISOString();
  const version: FederatedModelVersion = {
    version: params.version,
    publishedAt: now,
    changes: params.changes,
    compatibility: params.compatibility,
  };

  model.lifecycle.versions.push(version);
  model.lifecycle.currentVersion = params.version;
  model.modelVersion = params.version;
  model.updatedAt = now;
  return version;
}
