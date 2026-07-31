/**
 * Module 95: AI Model Deprecation Policy Service
 * WINDELS AI OS - Phase 1
 * 
 * Defines and enforces deprecation policies, schedules, notification timelines,
 * and client impact analysis for AI model deprecation management.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiModelDeprecationPolicy');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DeprecationPolicy {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: PolicyStatus;
  scope: PolicyScope;
  rules: DeprecationRule[];
  notificationSchedule: NotificationSchedule;
  enforcementConfig: EnforcementConfig;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type PolicyStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface PolicyScope {
  appliesTo: 'all_models' | 'specific_models' | 'model_categories' | 'frameworks';
  modelIds?: string[];
  categories?: string[];
  frameworks?: string[];
  excludeModelIds?: string[];
}

export interface DeprecationRule {
  id: string;
  name: string;
  condition: DeprecationCondition;
  action: DeprecationAction;
  priority: number;
  enabled: boolean;
}

export interface DeprecationCondition {
  type: ConditionType;
  threshold?: number;
  timeframe?: string;
  customExpression?: string;
}

export type ConditionType =
  | 'age_days'
  | 'usage_below_threshold'
  | 'no_recent_requests'
  | 'success_rate_below'
  | 'better_alternative_exists'
  | 'security_vulnerability'
  | 'framework_eol'
  | 'manual_trigger';

export interface DeprecationAction {
  type: ActionType;
  delay?: string;
  requireApproval?: boolean;
  approvalWorkflow?: string;
  notificationTargets?: NotificationTarget[];
  migrationGuidance?: MigrationGuidance;
}

export type ActionType =
  | 'mark_deprecated'
  | 'send_notification'
  | 'reduce_traffic'
  | 'block_new_requests'
  | 'archive_model'
  | 'retire_model';

export interface NotificationSchedule {
  enabled: boolean;
  notifications: NotificationConfig[];
}

export interface NotificationConfig {
  timing: NotificationTiming;
  channels: NotificationChannel[];
  recipients: NotificationTarget[];
  template: string;
}

export type NotificationTiming =
  | 'immediate'
  | 'days_before'
  | 'weeks_before'
  | 'months_before'
  | 'on_deprecation'
  | 'on_sunset';

export type NotificationChannel = 'email' | 'slack' | 'webhook' | 'dashboard' | 'api';

export interface NotificationTarget {
  type: 'user' | 'team' | 'service' | 'all_clients';
  identifier: string;
  name?: string;
}

export interface EnforcementConfig {
  autoEnforce: boolean;
  gracePeriodDays: number;
  maxExtensions: number;
  extensionApprovalRequired: boolean;
  sunsetAfterDeprecationDays: number;
  archiveAfterSunsetDays: number;
  retireAfterArchiveDays: number;
}

export interface MigrationGuidance {
  recommendedAlternative?: string;
  migrationGuide?: string;
  estimatedEffort?: 'low' | 'medium' | 'high';
  breakingChanges?: string[];
  contactPerson?: string;
}

export interface DeprecationSchedule {
  id: string;
  policyId: string;
  modelId: string;
  modelVersion: string;
  deprecationDate: string;
  sunsetDate: string;
  archiveDate: string;
  retireDate: string;
  status: ScheduleStatus;
  notificationsSent: NotificationRecord[];
  extensions: ExtensionRequest[];
  clientImpact: ClientImpactAnalysis;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleStatus =
  | 'scheduled'
  | 'deprecated'
  | 'sunset'
  | 'archived'
  | 'retired'
  | 'cancelled';

export interface NotificationRecord {
  id: string;
  timing: NotificationTiming;
  sentAt: string;
  channel: NotificationChannel;
  recipients: string[];
  status: 'sent' | 'failed' | 'pending';
  message: string;
}

export interface ExtensionRequest {
  id: string;
  requestedBy: string;
  reason: string;
  requestedDays: number;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface ClientImpactAnalysis {
  totalClients: number;
  affectedClients: number;
  highImpactClients: number;
  clientBreakdown: ClientImpact[];
  migrationProgress: MigrationProgress;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface ClientImpact {
  clientId: string;
  clientName: string;
  usageCount: number;
  lastUsedAt: string;
  impactLevel: 'low' | 'medium' | 'high';
  migrationStatus: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  contactPerson?: string;
}

export interface MigrationProgress {
  totalClients: number;
  migratedClients: number;
  inProgressClients: number;
  notStartedClients: number;
  blockedClients: number;
  completionPercent: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const deprecationPolicies = new Map<string, DeprecationPolicy>();
const deprecationSchedules = new Map<string, DeprecationSchedule>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function evaluateCondition(
  condition: DeprecationCondition,
  modelMetrics: any
): boolean {
  switch (condition.type) {
    case 'age_days':
      return modelMetrics.ageDays >= (condition.threshold || 365);
    case 'usage_below_threshold':
      return modelMetrics.requestsPerDay < (condition.threshold || 10);
    case 'no_recent_requests':
      return modelMetrics.daysSinceLastRequest >= (condition.threshold || 30);
    case 'success_rate_below':
      return modelMetrics.successRate < (condition.threshold || 0.9);
    case 'better_alternative_exists':
      return modelMetrics.hasBetterAlternative === true;
    case 'security_vulnerability':
      return modelMetrics.hasSecurityVulnerability === true;
    case 'framework_eol':
      return modelMetrics.frameworkEOL === true;
    case 'manual_trigger':
      return modelMetrics.manualDeprecation === true;
    default:
      return false;
  }
}

function calculateScheduleDates(
  deprecationDate: Date,
  enforcement: EnforcementConfig
): {
  sunsetDate: Date;
  archiveDate: Date;
  retireDate: Date;
} {
  const sunsetDate = new Date(deprecationDate);
  sunsetDate.setDate(sunsetDate.getDate() + enforcement.sunsetAfterDeprecationDays);
  
  const archiveDate = new Date(sunsetDate);
  archiveDate.setDate(archiveDate.getDate() + enforcement.archiveAfterSunsetDays);
  
  const retireDate = new Date(archiveDate);
  retireDate.setDate(retireDate.getDate() + enforcement.retireAfterArchiveDays);
  
  return { sunsetDate, archiveDate, retireDate };
}

function analyzeClientImpact(
  modelId: string,
  modelVersion: string
): ClientImpactAnalysis {
  // Simulate client impact analysis
  const totalClients = Math.floor(_rng.next() * 50) + 10;
  const affectedClients = Math.floor(totalClients * (0.3 + _rng.next() * 0.5));
  const highImpactClients = Math.floor(affectedClients * 0.2);
  
  const clientBreakdown: ClientImpact[] = [];
  for (let i = 0; i < affectedClients; i++) {
    const usageCount = Math.floor(_rng.next() * 10000);
    const impactLevel = usageCount > 5000 ? 'high' : usageCount > 1000 ? 'medium' : 'low';
    const migrationStatuses: Array<'not_started' | 'in_progress' | 'completed' | 'blocked'> = [
      'not_started', 'in_progress', 'completed', 'blocked'
    ];
    
    clientBreakdown.push({
      clientId: `client_${randomUUID()}`,
      clientName: `Client ${i + 1}`,
      usageCount,
      lastUsedAt: new Date(Date.now() - _rng.next() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      impactLevel,
      migrationStatus: migrationStatuses[Math.floor(_rng.next() * migrationStatuses.length)],
      contactPerson: _rng.next() > 0.5 ? `contact${i}@example.com` : undefined,
    });
  }
  
  const migratedClients = clientBreakdown.filter(c => c.migrationStatus === 'completed').length;
  const inProgressClients = clientBreakdown.filter(c => c.migrationStatus === 'in_progress').length;
  const notStartedClients = clientBreakdown.filter(c => c.migrationStatus === 'not_started').length;
  const blockedClients = clientBreakdown.filter(c => c.migrationStatus === 'blocked').length;
  
  const migrationProgress: MigrationProgress = {
    totalClients: affectedClients,
    migratedClients,
    inProgressClients,
    notStartedClients,
    blockedClients,
    completionPercent: (migratedClients / affectedClients) * 100,
  };
  
  const riskLevel = highImpactClients > 10 ? 'critical' :
                    highImpactClients > 5 ? 'high' :
                    affectedClients > 20 ? 'medium' : 'low';
  
  return {
    totalClients,
    affectedClients,
    highImpactClients,
    clientBreakdown,
    migrationProgress,
    riskLevel,
  };
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createDeprecationPolicy(params: {
  organizationId: string;
  name: string;
  description?: string;
  scope: PolicyScope;
  rules: Omit<DeprecationRule, 'id'>[];
  notificationSchedule: NotificationSchedule;
  enforcementConfig: EnforcementConfig;
  createdBy: string;
}): DeprecationPolicy {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  const rules: DeprecationRule[] = params.rules.map((rule, idx) => ({
    id: randomUUID(),
    name: rule.name,
    condition: rule.condition,
    action: rule.action,
    priority: rule.priority || idx,
    enabled: rule.enabled ?? true,
  }));
  
  const policy: DeprecationPolicy = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'draft',
    scope: params.scope,
    rules,
    notificationSchedule: params.notificationSchedule,
    enforcementConfig: params.enforcementConfig,
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };
  
  deprecationPolicies.set(id, policy);
  return policy;
}

export function getDeprecationPolicy(id: string): DeprecationPolicy | undefined {
  return deprecationPolicies.get(id);
}

export function listDeprecationPolicies(organizationId: string): DeprecationPolicy[] {
  return Array.from(deprecationPolicies.values()).filter(
    p => p.organizationId === organizationId
  );
}

export function activatePolicy(policyId: string): DeprecationPolicy {
  const policy = deprecationPolicies.get(policyId);
  if (!policy) {
    throw new Error(`Deprecation policy ${policyId} not found`);
  }
  
  if (policy.status !== 'draft') {
    throw new Error(`Policy ${policyId} is not in draft state`);
  }
  
  policy.status = 'active';
  policy.updatedAt = new Date().toISOString();
  
  return policy;
}

export function pausePolicy(policyId: string): DeprecationPolicy {
  const policy = deprecationPolicies.get(policyId);
  if (!policy) {
    throw new Error(`Deprecation policy ${policyId} not found`);
  }
  
  if (policy.status !== 'active') {
    throw new Error(`Policy ${policyId} is not active`);
  }
  
  policy.status = 'paused';
  policy.updatedAt = new Date().toISOString();
  
  return policy;
}

export function evaluateModelForDeprecation(
  policyId: string,
  modelId: string,
  modelVersion: string,
  modelMetrics: any
): {
  shouldDeprecate: boolean;
  matchedRules: DeprecationRule[];
  recommendedAction?: DeprecationAction;
} {
  const policy = deprecationPolicies.get(policyId);
  if (!policy) {
    throw new Error(`Deprecation policy ${policyId} not found`);
  }
  
  if (policy.status !== 'active') {
    return { shouldDeprecate: false, matchedRules: [] };
  }
  
  const matchedRules = policy.rules.filter(rule => {
    if (!rule.enabled) return false;
    return evaluateCondition(rule.condition, modelMetrics);
  });
  
  if (matchedRules.length === 0) {
    return { shouldDeprecate: false, matchedRules: [] };
  }
  
  // Sort by priority and get highest priority action
  matchedRules.sort((a, b) => a.priority - b.priority);
  const recommendedAction = matchedRules[0].action;
  
  return {
    shouldDeprecate: true,
    matchedRules,
    recommendedAction,
  };
}

export function scheduleDeprecation(params: {
  policyId: string;
  modelId: string;
  modelVersion: string;
  deprecationDate: string;
}): DeprecationSchedule {
  const policy = deprecationPolicies.get(params.policyId);
  if (!policy) {
    throw new Error(`Deprecation policy ${params.policyId} not found`);
  }
  
  const now = new Date().toISOString();
  const id = randomUUID();
  const deprecationDate = new Date(params.deprecationDate);
  
  const { sunsetDate, archiveDate, retireDate } = calculateScheduleDates(
    deprecationDate,
    policy.enforcementConfig
  );
  
  const clientImpact = analyzeClientImpact(params.modelId, params.modelVersion);
  
  const schedule: DeprecationSchedule = {
    id,
    policyId: params.policyId,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    deprecationDate: deprecationDate.toISOString(),
    sunsetDate: sunsetDate.toISOString(),
    archiveDate: archiveDate.toISOString(),
    retireDate: retireDate.toISOString(),
    status: 'scheduled',
    notificationsSent: [],
    extensions: [],
    clientImpact,
    createdAt: now,
    updatedAt: now,
  };
  
  deprecationSchedules.set(id, schedule);
  return schedule;
}

export function getDeprecationSchedule(id: string): DeprecationSchedule | undefined {
  return deprecationSchedules.get(id);
}

export function listDeprecationSchedules(organizationId: string): DeprecationSchedule[] {
  const policyIds = Array.from(deprecationPolicies.values())
    .filter(p => p.organizationId === organizationId)
    .map(p => p.id);
  
  return Array.from(deprecationSchedules.values()).filter(
    s => policyIds.includes(s.policyId)
  );
}

export function requestExtension(params: {
  scheduleId: string;
  requestedBy: string;
  reason: string;
  requestedDays: number;
}): ExtensionRequest {
  const schedule = deprecationSchedules.get(params.scheduleId);
  if (!schedule) {
    throw new Error(`Deprecation schedule ${params.scheduleId} not found`);
  }
  
  if (schedule.extensions.length >= 3) {
    throw new Error('Maximum extension requests reached');
  }
  
  const extension: ExtensionRequest = {
    id: randomUUID(),
    requestedBy: params.requestedBy,
    reason: params.reason,
    requestedDays: params.requestedDays,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  
  schedule.extensions.push(extension);
  schedule.updatedAt = new Date().toISOString();
  
  return extension;
}

export function approveExtension(
  scheduleId: string,
  extensionId: string,
  approvedBy: string
): ExtensionRequest {
  const schedule = deprecationSchedules.get(scheduleId);
  if (!schedule) {
    throw new Error(`Deprecation schedule ${scheduleId} not found`);
  }
  
  const extension = schedule.extensions.find(e => e.id === extensionId);
  if (!extension) {
    throw new Error(`Extension request ${extensionId} not found`);
  }
  
  if (extension.status !== 'pending') {
    throw new Error(`Extension ${extensionId} is not pending`);
  }
  
  extension.status = 'approved';
  extension.approvedBy = approvedBy;
  extension.approvedAt = new Date().toISOString();
  
  // Update schedule dates
  const deprecationDate = new Date(schedule.deprecationDate);
  deprecationDate.setDate(deprecationDate.getDate() + extension.requestedDays);
  schedule.deprecationDate = deprecationDate.toISOString();
  
  const policy = deprecationPolicies.get(schedule.policyId);
  if (policy) {
    const { sunsetDate, archiveDate, retireDate } = calculateScheduleDates(
      deprecationDate,
      policy.enforcementConfig
    );
    schedule.sunsetDate = sunsetDate.toISOString();
    schedule.archiveDate = archiveDate.toISOString();
    schedule.retireDate = retireDate.toISOString();
  }
  
  schedule.updatedAt = new Date().toISOString();
  
  return extension;
}

export function rejectExtension(
  scheduleId: string,
  extensionId: string,
  approvedBy: string
): ExtensionRequest {
  const schedule = deprecationSchedules.get(scheduleId);
  if (!schedule) {
    throw new Error(`Deprecation schedule ${scheduleId} not found`);
  }
  
  const extension = schedule.extensions.find(e => e.id === extensionId);
  if (!extension) {
    throw new Error(`Extension request ${extensionId} not found`);
  }
  
  if (extension.status !== 'pending') {
    throw new Error(`Extension ${extensionId} is not pending`);
  }
  
  extension.status = 'rejected';
  extension.approvedBy = approvedBy;
  extension.approvedAt = new Date().toISOString();
  
  schedule.updatedAt = new Date().toISOString();
  
  return extension;
}

export function sendDeprecationNotifications(scheduleId: string): NotificationRecord[] {
  const schedule = deprecationSchedules.get(scheduleId);
  if (!schedule) {
    throw new Error(`Deprecation schedule ${scheduleId} not found`);
  }
  
  const policy = deprecationPolicies.get(schedule.policyId);
  if (!policy) {
    throw new Error(`Deprecation policy ${schedule.policyId} not found`);
  }
  
  const now = new Date().toISOString();
  const notifications: NotificationRecord[] = [];
  
  for (const notifConfig of policy.notificationSchedule.notifications) {
    const notification: NotificationRecord = {
      id: randomUUID(),
      timing: notifConfig.timing,
      sentAt: now,
      channel: notifConfig.channels[0] || 'email',
      recipients: notifConfig.recipients.map(r => r.identifier),
      status: 'sent',
      message: `Model ${schedule.modelId} v${schedule.modelVersion} will be deprecated on ${schedule.deprecationDate}`,
    };
    
    notifications.push(notification);
    schedule.notificationsSent.push(notification);
  }
  
  schedule.updatedAt = now;
  
  return notifications;
}
