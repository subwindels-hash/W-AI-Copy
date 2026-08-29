/**
 * Module 110: AI Model Sharing & Access Control Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides model sharing and access control capabilities including share links,
 * access policies, permission management, usage tracking, and audit logging
 * for secure model sharing across teams and organizations.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ShareLink {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  shareType: ShareType;
  status: ShareStatus;
  accessLevel: AccessLevel;
  configuration: ShareConfiguration;
  analytics: ShareAnalytics;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
}

export type ShareType = 'public' | 'organization' | 'team' | 'individual' | 'temporary';

export type ShareStatus = 'active' | 'expired' | 'revoked' | 'suspended';

export type AccessLevel = 'view' | 'download' | 'use' | 'modify' | 'admin';

export interface ShareConfiguration {
  token?: string;
  allowedEmails?: string[];
  allowedDomains?: string[];
  allowedTeams?: string[];
  maxUses?: number;
  requireAuthentication: boolean;
  requireApproval: boolean;
  watermarkEnabled: boolean;
  downloadEnabled: boolean;
  apiAccessEnabled: boolean;
  customMessage?: string;
}

export interface ShareAnalytics {
  totalViews: number;
  totalDownloads: number;
  totalApiCalls: number;
  uniqueUsers: number;
  lastAccessedAt?: string;
  accessHistory: AccessEvent[];
}

export interface AccessEvent {
  timestamp: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  ipAddress: string;
  action: 'view' | 'download' | 'api_call' | 'share';
  userAgent?: string;
  metadata?: Record<string, any>;
}

export interface AccessPolicy {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: PolicyType;
  rules: AccessRule[];
  priority: number;
  enabled: boolean;
  applicableModels: string[];
  createdAt: string;
  updatedAt: string;
}

export type PolicyType = 'allow' | 'deny' | 'require_approval' | 'conditional';

export interface AccessRule {
  id: string;
  condition: RuleCondition;
  action: RuleAction;
  description?: string;
}

export interface RuleCondition {
  type: 'user_role' | 'user_team' | 'user_email' | 'ip_range' | 'time_window' | 'model_tag' | 'custom';
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'matches';
  value: any;
}

export interface RuleAction {
  type: 'allow' | 'deny' | 'require_mfa' | 'require_approval' | 'limit_access';
  accessLevel?: AccessLevel;
  approvalRequired?: boolean;
  approvers?: string[];
  timeLimit?: number; // hours
  usageLimit?: number;
}

export interface AccessGrant {
  id: string;
  organizationId: string;
  modelId: string;
  granteeType: 'user' | 'team' | 'organization' | 'public';
  granteeId: string;
  granteeName: string;
  accessLevel: AccessLevel;
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  conditions?: AccessCondition[];
  usage: AccessUsage;
}

export interface AccessCondition {
  type: 'time_window' | 'ip_restriction' | 'geo_restriction' | 'usage_limit';
  value: any;
}

export interface AccessUsage {
  totalAccesses: number;
  lastAccessedAt?: string;
  apiCalls: number;
  downloads: number;
}

export interface AccessRequest {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  requestedAccessLevel: AccessLevel;
  reason: string;
  status: RequestStatus;
  approvers: string[];
  approvals: Approval[];
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface Approval {
  approverId: string;
  approverName: string;
  decision: 'approved' | 'rejected';
  comments?: string;
  decidedAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  modelId?: string;
  userId: string;
  userName: string;
  action: AuditAction;
  resource: string;
  resourceId: string;
  details: Record<string, any>;
  ipAddress: string;
  timestamp: string;
}

export type AuditAction =
  | 'access_granted'
  | 'access_revoked'
  | 'access_requested'
  | 'access_approved'
  | 'access_denied'
  | 'share_created'
  | 'share_revoked'
  | 'policy_created'
  | 'policy_updated'
  | 'model_accessed'
  | 'model_downloaded';

export interface AccessReport {
  modelId: string;
  modelName: string;
  period: string;
  totalAccesses: number;
  uniqueUsers: number;
  accessByLevel: Record<AccessLevel, number>;
  topUsers: Array<{ userId: string; userName: string; accessCount: number }>;
  accessTrend: Array<{ date: string; count: number }>;
  securityEvents: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const shareLinks = new Map<string, ShareLink>();
const accessPolicies = new Map<string, AccessPolicy>();
const accessGrants = new Map<string, AccessGrant[]>();
const accessRequests = new Map<string, AccessRequest>();
const auditLogs = new Map<string, AuditLog[]>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateShareToken(): string {
  return randomUUID().replace(/-/g, '').substring(0, 16);
}

function evaluateCondition(condition: RuleCondition, context: Record<string, any>): boolean {
  const contextValue = context[condition.type];

  switch (condition.operator) {
    case 'equals':
      return contextValue === condition.value;
    case 'not_equals':
      return contextValue !== condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(contextValue);
    case 'not_in':
      return Array.isArray(condition.value) && !condition.value.includes(contextValue);
    case 'contains':
      return typeof contextValue === 'string' && contextValue.includes(condition.value);
    case 'matches':
      return typeof contextValue === 'string' && new RegExp(condition.value).test(contextValue);
    default:
      return false;
  }
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createShareLink(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  shareType: ShareType;
  accessLevel: AccessLevel;
  configuration?: Partial<ShareConfiguration>;
  expiresAt?: string;
  createdBy: string;
}): ShareLink {
  const now = new Date().toISOString();
  const id = randomUUID();

  const shareLink: ShareLink = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    shareType: params.shareType,
    status: 'active',
    accessLevel: params.accessLevel,
    configuration: {
      token: generateShareToken(),
      requireAuthentication: params.shareType !== 'public',
      requireApproval: false,
      watermarkEnabled: false,
      downloadEnabled: params.accessLevel !== 'view',
      apiAccessEnabled: params.accessLevel === 'use' || params.accessLevel === 'admin',
      ...params.configuration,
    },
    analytics: {
      totalViews: 0,
      totalDownloads: 0,
      totalApiCalls: 0,
      uniqueUsers: 0,
      accessHistory: [],
    },
    createdBy: params.createdBy,
    createdAt: now,
    expiresAt: params.expiresAt,
  };

  shareLinks.set(id, shareLink);

  logAudit({
    organizationId: params.organizationId,
    modelId: params.modelId,
    userId: params.createdBy,
    userName: 'System',
    action: 'share_created',
    resource: 'share_link',
    resourceId: id,
    details: { shareType: params.shareType, accessLevel: params.accessLevel },
    ipAddress: '0.0.0.0',
  });

  return shareLink;
}

export function getShareLink(id: string): ShareLink | undefined {
  return shareLinks.get(id);
}

export function getShareLinkByToken(token: string): ShareLink | undefined {
  return Array.from(shareLinks.values()).find(s => s.configuration.token === token);
}

export function listShareLinks(
  organizationId: string,
  filters?: { modelId?: string; status?: ShareStatus; shareType?: ShareType }
): ShareLink[] {
  let result = Array.from(shareLinks.values()).filter(
    s => s.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(s => s.modelId === filters.modelId);
  if (filters?.status) result = result.filter(s => s.status === filters.status);
  if (filters?.shareType) result = result.filter(s => s.shareType === filters.shareType);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function revokeShareLink(shareLinkId: string, revokedBy: string): ShareLink {
  const shareLink = shareLinks.get(shareLinkId);
  if (!shareLink) throw new Error(`Share link ${shareLinkId} not found`);

  shareLink.status = 'revoked';
  shareLink.revokedAt = new Date().toISOString();

  logAudit({
    organizationId: shareLink.organizationId,
    modelId: shareLink.modelId,
    userId: revokedBy,
    userName: 'System',
    action: 'share_revoked',
    resource: 'share_link',
    resourceId: shareLinkId,
    details: {},
    ipAddress: '0.0.0.0',
  });

  return shareLink;
}

export function trackShareAccess(
  shareLinkId: string,
  event: Omit<AccessEvent, 'timestamp'>
): ShareLink {
  const shareLink = shareLinks.get(shareLinkId);
  if (!shareLink) throw new Error(`Share link ${shareLinkId} not found`);

  const now = new Date().toISOString();

  const accessEvent: AccessEvent = {
    ...event,
    timestamp: now,
  };

  shareLink.analytics.accessHistory.push(accessEvent);
  shareLink.analytics.lastAccessedAt = now;

  switch (event.action) {
    case 'view':
      shareLink.analytics.totalViews++;
      break;
    case 'download':
      shareLink.analytics.totalDownloads++;
      break;
    case 'api_call':
      shareLink.analytics.totalApiCalls++;
      break;
  }

  // Track unique users
  const uniqueUserIds = new Set(
    shareLink.analytics.accessHistory
      .filter(e => e.userId)
      .map(e => e.userId)
  );
  shareLink.analytics.uniqueUsers = uniqueUserIds.size;

  // Check usage limits
  if (shareLink.configuration.maxUses) {
    const totalUses = shareLink.analytics.totalViews + 
                      shareLink.analytics.totalDownloads + 
                      shareLink.analytics.totalApiCalls;
    if (totalUses >= shareLink.configuration.maxUses) {
      shareLink.status = 'expired';
    }
  }

  return shareLink;
}

export function createAccessPolicy(params: {
  organizationId: string;
  name: string;
  description?: string;
  type: PolicyType;
  rules: Omit<AccessRule, 'id'>[];
  priority?: number;
  applicableModels?: string[];
}): AccessPolicy {
  const now = new Date().toISOString();
  const id = randomUUID();

  const policy: AccessPolicy = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    type: params.type,
    rules: params.rules.map(r => ({ ...r, id: randomUUID() })),
    priority: params.priority || 100,
    enabled: true,
    applicableModels: params.applicableModels || [],
    createdAt: now,
    updatedAt: now,
  };

  accessPolicies.set(id, policy);

  logAudit({
    organizationId: params.organizationId,
    userId: 'system',
    userName: 'System',
    action: 'policy_created',
    resource: 'access_policy',
    resourceId: id,
    details: { policyName: params.name, policyType: params.type },
    ipAddress: '0.0.0.0',
  });

  return policy;
}

export function getAccessPolicy(id: string): AccessPolicy | undefined {
  return accessPolicies.get(id);
}

export function listAccessPolicies(
  organizationId: string,
  filters?: { type?: PolicyType; enabled?: boolean }
): AccessPolicy[] {
  let result = Array.from(accessPolicies.values()).filter(
    p => p.organizationId === organizationId
  );

  if (filters?.type) result = result.filter(p => p.type === filters.type);
  if (filters?.enabled !== undefined) result = result.filter(p => p.enabled === filters.enabled);

  return result.sort((a, b) => a.priority - b.priority);
}

export function updateAccessPolicy(
  policyId: string,
  updates: Partial<AccessPolicy>
): AccessPolicy {
  const policy = accessPolicies.get(policyId);
  if (!policy) throw new Error(`Access policy ${policyId} not found`);

  Object.assign(policy, updates, { updatedAt: new Date().toISOString() });

  logAudit({
    organizationId: policy.organizationId,
    userId: 'system',
    userName: 'System',
    action: 'policy_updated',
    resource: 'access_policy',
    resourceId: policyId,
    details: { updates: Object.keys(updates) },
    ipAddress: '0.0.0.0',
  });

  return policy;
}

export function evaluateAccess(
  organizationId: string,
  modelId: string,
  userId: string,
  context: Record<string, any>
): {
  allowed: boolean;
  accessLevel?: AccessLevel;
  requiresApproval: boolean;
  applicablePolicies: string[];
  reason?: string;
} {
  const policies = Array.from(accessPolicies.values())
    .filter(p => p.organizationId === organizationId && p.enabled)
    .filter(p => p.applicableModels.length === 0 || p.applicableModels.includes(modelId))
    .sort((a, b) => a.priority - b.priority);

  const applicablePolicies: string[] = [];
  let allowed = false;
  let accessLevel: AccessLevel = 'view';
  let requiresApproval = false;

  for (const policy of policies) {
    for (const rule of policy.rules) {
      if (evaluateCondition(rule.condition, context)) {
        applicablePolicies.push(policy.id);

        switch (rule.action.type) {
          case 'allow':
            allowed = true;
            if (rule.action.accessLevel) {
              accessLevel = rule.action.accessLevel;
            }
            break;
          case 'deny':
            return {
              allowed: false,
              requiresApproval: false,
              applicablePolicies,
              reason: `Access denied by policy: ${policy.name}`,
            };
          case 'require_approval':
            requiresApproval = true;
            break;
          case 'limit_access':
            if (rule.action.accessLevel) {
              accessLevel = rule.action.accessLevel;
            }
            break;
        }
      }
    }
  }

  return {
    allowed,
    accessLevel,
    requiresApproval,
    applicablePolicies,
  };
}

export function grantAccess(params: {
  organizationId: string;
  modelId: string;
  granteeType: 'user' | 'team' | 'organization' | 'public';
  granteeId: string;
  granteeName: string;
  accessLevel: AccessLevel;
  grantedBy: string;
  expiresAt?: string;
  conditions?: AccessCondition[];
}): AccessGrant {
  const now = new Date().toISOString();
  const id = randomUUID();

  const grant: AccessGrant = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    granteeType: params.granteeType,
    granteeId: params.granteeId,
    granteeName: params.granteeName,
    accessLevel: params.accessLevel,
    grantedBy: params.grantedBy,
    grantedAt: now,
    expiresAt: params.expiresAt,
    conditions: params.conditions,
    usage: {
      totalAccesses: 0,
      apiCalls: 0,
      downloads: 0,
    },
  };

  const grants = accessGrants.get(params.modelId) || [];
  grants.push(grant);
  accessGrants.set(params.modelId, grants);

  logAudit({
    organizationId: params.organizationId,
    modelId: params.modelId,
    userId: params.grantedBy,
    userName: 'System',
    action: 'access_granted',
    resource: 'access_grant',
    resourceId: id,
    details: { granteeType: params.granteeType, accessLevel: params.accessLevel },
    ipAddress: '0.0.0.0',
  });

  return grant;
}

export function getAccessGrants(
  modelId: string,
  filters?: { granteeType?: string; granteeId?: string }
): AccessGrant[] {
  let result = accessGrants.get(modelId) || [];

  if (filters?.granteeType) result = result.filter(g => g.granteeType === filters.granteeType);
  if (filters?.granteeId) result = result.filter(g => g.granteeId === filters.granteeId);

  return result.filter(g => !g.revokedAt);
}

export function revokeAccess(grantId: string, modelId: string, revokedBy: string): AccessGrant {
  const grants = accessGrants.get(modelId) || [];
  const grant = grants.find(g => g.id === grantId);
  if (!grant) throw new Error(`Access grant ${grantId} not found`);

  grant.revokedAt = new Date().toISOString();

  logAudit({
    organizationId: grant.organizationId,
    modelId,
    userId: revokedBy,
    userName: 'System',
    action: 'access_revoked',
    resource: 'access_grant',
    resourceId: grantId,
    details: { granteeType: grant.granteeType },
    ipAddress: '0.0.0.0',
  });

  return grant;
}

export function requestAccess(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  requestedAccessLevel: AccessLevel;
  reason: string;
  approvers: string[];
}): AccessRequest {
  const now = new Date().toISOString();
  const id = randomUUID();

  const request: AccessRequest = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    requesterId: params.requesterId,
    requesterName: params.requesterName,
    requesterEmail: params.requesterEmail,
    requestedAccessLevel: params.requestedAccessLevel,
    reason: params.reason,
    status: 'pending',
    approvers: params.approvers,
    approvals: [],
    submittedAt: now,
  };

  accessRequests.set(id, request);

  logAudit({
    organizationId: params.organizationId,
    modelId: params.modelId,
    userId: params.requesterId,
    userName: params.requesterName,
    action: 'access_requested',
    resource: 'access_request',
    resourceId: id,
    details: { requestedAccessLevel: params.requestedAccessLevel },
    ipAddress: '0.0.0.0',
  });

  return request;
}

export function getAccessRequest(id: string): AccessRequest | undefined {
  return accessRequests.get(id);
}

export function listAccessRequests(
  organizationId: string,
  filters?: { modelId?: string; status?: RequestStatus; requesterId?: string }
): AccessRequest[] {
  let result = Array.from(accessRequests.values()).filter(
    r => r.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(r => r.modelId === filters.modelId);
  if (filters?.status) result = result.filter(r => r.status === filters.status);
  if (filters?.requesterId) result = result.filter(r => r.requesterId === filters.requesterId);

  return result.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function approveAccessRequest(
  requestId: string,
  approverId: string,
  approverName: string,
  decision: 'approved' | 'rejected',
  comments?: string
): AccessRequest {
  const request = accessRequests.get(requestId);
  if (!request) throw new Error(`Access request ${requestId} not found`);

  const now = new Date().toISOString();

  request.approvals.push({
    approverId,
    approverName,
    decision,
    comments,
    decidedAt: now,
  });

  // Check if all approvers have decided
  const allDecided = request.approvals.length === request.approvers.length;
  const allApproved = request.approvals.every(a => a.decision === 'approved');

  if (allDecided) {
    request.status = allApproved ? 'approved' : 'rejected';
    request.reviewedAt = now;
    request.reviewedBy = approverId;

    if (allApproved) {
      grantAccess({
        organizationId: request.organizationId,
        modelId: request.modelId,
        granteeType: 'user',
        granteeId: request.requesterId,
        granteeName: request.requesterName,
        accessLevel: request.requestedAccessLevel,
        grantedBy: approverId,
      });

      logAudit({
        organizationId: request.organizationId,
        modelId: request.modelId,
        userId: approverId,
        userName: approverName,
        action: 'access_approved',
        resource: 'access_request',
        resourceId: requestId,
        details: { decision },
        ipAddress: '0.0.0.0',
      });
    } else {
      logAudit({
        organizationId: request.organizationId,
        modelId: request.modelId,
        userId: approverId,
        userName: approverName,
        action: 'access_denied',
        resource: 'access_request',
        resourceId: requestId,
        details: { decision },
        ipAddress: '0.0.0.0',
      });
    }
  }

  return request;
}

function logAudit(params: {
  organizationId: string;
  modelId?: string;
  userId: string;
  userName: string;
  action: AuditAction;
  resource: string;
  resourceId: string;
  details: Record<string, any>;
  ipAddress: string;
}): void {
  const now = new Date().toISOString();
  const id = randomUUID();

  const log: AuditLog = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    userId: params.userId,
    userName: params.userName,
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId,
    details: params.details,
    ipAddress: params.ipAddress,
    timestamp: now,
  };

  const logs = auditLogs.get(params.organizationId) || [];
  logs.push(log);
  auditLogs.set(params.organizationId, logs);
}

export function getAuditLogs(
  organizationId: string,
  filters?: {
    modelId?: string;
    userId?: string;
    action?: AuditAction;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }
): AuditLog[] {
  let result = auditLogs.get(organizationId) || [];

  if (filters?.modelId) result = result.filter(l => l.modelId === filters.modelId);
  if (filters?.userId) result = result.filter(l => l.userId === filters.userId);
  if (filters?.action) result = result.filter(l => l.action === filters.action);
  if (filters?.startTime) result = result.filter(l => l.timestamp >= filters.startTime!);
  if (filters?.endTime) result = result.filter(l => l.timestamp <= filters.endTime!);

  result = result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  if (filters?.limit) {
    result = result.slice(0, filters.limit);
  }

  return result;
}

export function generateAccessReport(
  organizationId: string,
  modelId: string,
  period: string
): AccessReport {
  const logs = getAuditLogs(organizationId, {
    modelId,
    action: 'model_accessed',
    startTime: period,
  });

  const userAccessMap = new Map<string, { userName: string; count: number }>();
  const dailyAccessMap = new Map<string, number>();

  for (const log of logs) {
    const userEntry = userAccessMap.get(log.userId) || { userName: log.userName, count: 0 };
    userEntry.count++;
    userAccessMap.set(log.userId, userEntry);

    const date = log.timestamp.split('T')[0];
    dailyAccessMap.set(date, (dailyAccessMap.get(date) || 0) + 1);
  }

  const topUsers = Array.from(userAccessMap.entries())
    .map(([userId, data]) => ({ userId, userName: data.userName, accessCount: data.count }))
    .sort((a, b) => b.accessCount - a.accessCount)
    .slice(0, 10);

  const accessTrend = Array.from(dailyAccessMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const securityEvents = getAuditLogs(organizationId, {
    modelId,
    startTime: period,
  }).filter(l => l.action === 'access_denied').length;

  return {
    modelId,
    modelName: 'Model', // Would fetch from model service
    period,
    totalAccesses: logs.length,
    uniqueUsers: userAccessMap.size,
    accessByLevel: { view: 0, download: 0, use: 0, modify: 0, admin: 0 },
    topUsers,
    accessTrend,
    securityEvents,
  };
}

export function trackModelAccess(
  organizationId: string,
  modelId: string,
  userId: string,
  userName: string,
  ipAddress: string,
  action: 'view' | 'download' | 'api_call'
): void {
  logAudit({
    organizationId,
    modelId,
    userId,
    userName,
    action: 'model_accessed',
    resource: 'model',
    resourceId: modelId,
    details: { action },
    ipAddress,
  });

  // Update grant usage
  const grants = accessGrants.get(modelId) || [];
  const userGrant = grants.find(g => g.granteeId === userId && !g.revokedAt);
  if (userGrant) {
    userGrant.usage.totalAccesses++;
    userGrant.usage.lastAccessedAt = new Date().toISOString();
    if (action === 'api_call') userGrant.usage.apiCalls++;
    if (action === 'download') userGrant.usage.downloads++;
  }
}
