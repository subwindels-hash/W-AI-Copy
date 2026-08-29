/**
 * Module 65: AI Change Tracking Service
 *
 * Provides comprehensive change tracking for AI systems including change request
 * management, categorization, classification, history tracking, and audit trails
 * for model, data, configuration, and infrastructure changes.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AIChangeRequest {
  id: string;
  organizationId: string;
  changeKey: string;
  title: string;
  description: string;
  category: ChangeCategory;
  subcategory?: string;
  type: ChangeType;
  priority: ChangePriority;
  status: ChangeStatus;
  risk: ChangeRisk;
  affectedComponents: AffectedComponent[];
  changeDetails: ChangeDetails;
  requestor: ChangeUser;
  assignee?: ChangeUser;
  approvers: ChangeUser[];
  approvalStatus: ApprovalStatus;
  scheduledDate?: string;
  implementedDate?: string;
  rollbackPlan?: string;
  tags: string[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export type ChangeCategory =
  | 'model'
  | 'data'
  | 'configuration'
  | 'infrastructure'
  | 'policy'
  | 'integration'
  | 'security'
  | 'performance';

export type ChangeType =
  | 'model-retrain'
  | 'model-finetune'
  | 'model-architecture'
  | 'model-hyperparameter'
  | 'data-update'
  | 'data-schema'
  | 'data-pipeline'
  | 'config-update'
  | 'config-threshold'
  | 'config-policy'
  | 'infra-scaling'
  | 'infra-migration'
  | 'infra-upgrade'
  | 'security-patch'
  | 'bug-fix'
  | 'feature-addition'
  | 'deprecation';

export type ChangePriority = 'low' | 'medium' | 'high' | 'critical' | 'emergency';

export type ChangeStatus =
  | 'draft'
  | 'submitted'
  | 'under-review'
  | 'approved'
  | 'scheduled'
  | 'in-progress'
  | 'testing'
  | 'deployed'
  | 'monitoring'
  | 'completed'
  | 'rolled-back'
  | 'cancelled'
  | 'rejected';

export type ApprovalStatus =
  | 'pending'
  | 'in-review'
  | 'approved'
  | 'rejected'
  | 'deferred'
  | 'not-required';

export interface ChangeRisk {
  level: 'low' | 'medium' | 'high' | 'critical';
  score: number; // 0-100
  factors: RiskFactor[];
  mitigation: string;
}

export interface RiskFactor {
  category: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  likelihood: 'low' | 'medium' | 'high';
}

export interface AffectedComponent {
  type: 'model' | 'dataset' | 'pipeline' | 'service' | 'api' | 'configuration';
  id: string;
  name: string;
  version?: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
}

export interface ChangeDetails {
  modelChanges?: ModelChangeDetails;
  dataChanges?: DataChangeDetails;
  configChanges?: ConfigChangeDetails;
  infraChanges?: InfraChangeDetails;
}

export interface ModelChangeDetails {
  modelId: string;
  modelName: string;
  currentVersion: string;
  newVersion: string;
  changeType: 'retrain' | 'finetune' | 'architecture' | 'hyperparameter';
  trainingDataChanges?: string;
  performanceMetrics?: {
    before: Record<string, number>;
    expected: Record<string, number>;
  };
  validationResults?: string;
}

export interface DataChangeDetails {
  datasetId: string;
  datasetName: string;
  changeType: 'addition' | 'removal' | 'modification' | 'schema-change';
  recordsAffected: number;
  dataQualityImpact?: string;
  lineageImpact?: string[];
}

export interface ConfigChangeDetails {
  configType: string;
  configKey: string;
  currentValue: any;
  newValue: any;
  valueType: 'string' | 'number' | 'boolean' | 'json';
  impactDescription: string;
}

export interface InfraChangeDetails {
  componentType: 'compute' | 'storage' | 'network' | 'service';
  componentName: string;
  changeType: 'scale' | 'upgrade' | 'migration' | 'configuration';
  currentSpec: string;
  newSpec: string;
  downtimeExpected: boolean;
  estimatedDowntimeMinutes?: number;
}

export interface ChangeUser {
  userId: string;
  userName: string;
  email: string;
  role: string;
  team?: string;
}

export interface ChangeHistory {
  id: string;
  changeId: string;
  action: ChangeAction;
  previousStatus?: ChangeStatus;
  newStatus: ChangeStatus;
  userId: string;
  userName: string;
  comments?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export type ChangeAction =
  | 'created'
  | 'updated'
  | 'submitted'
  | 'reviewed'
  | 'approved'
  | 'rejected'
  | 'scheduled'
  | 'started'
  | 'completed'
  | 'rolled-back'
  | 'cancelled';

export interface ChangeCalendar {
  organizationId: string;
  date: string;
  changes: Array<{
    changeId: string;
    changeKey: string;
    title: string;
    category: ChangeCategory;
    priority: ChangePriority;
    status: ChangeStatus;
    scheduledTime?: string;
  }>;
  freezeWindows: FreezeWindow[];
}

export interface FreezeWindow {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  scope: 'all' | ChangeCategory[];
  exceptions: string[]; // Change IDs
  createdBy: string;
  createdAt: string;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const changes = new Map<string, AIChangeRequest>();
const changeHistory = new Map<string, ChangeHistory[]>();
const freezeWindows = new Map<string, FreezeWindow>();
const changeCounter = new Map<string, number>(); // organizationId -> counter

// ─── Change Request Management ─────────────────────────────────────────────────

/**
 * Create a new change request
 */
export async function createChangeRequest(
  organizationId: string,
  change: Omit<AIChangeRequest, 'id' | 'changeKey' | 'status' | 'approvalStatus' | 'createdAt' | 'updatedAt'>,
  requestor: ChangeUser
): Promise<AIChangeRequest> {
  const id = `change_${randomUUID()}`;
  const counter = (changeCounter.get(organizationId) || 0) + 1;
  changeCounter.set(organizationId, counter);

  const now = new Date().toISOString();

  const newChange: AIChangeRequest = {
    ...change,
    id,
    organizationId,
    changeKey: `AI-CHG-${String(counter).padStart(5, '0')}`,
    status: 'draft',
    approvalStatus: change.risk.level === 'low' ? 'not-required' : 'pending',
    requestor,
    createdAt: now,
    updatedAt: now,
  };

  changes.set(id, newChange);
  changeHistory.set(id, []);

  await addHistoryEntry(id, 'created', 'draft', requestor.userId, requestor.userName, 'Change request created');

  return newChange;
}

/**
 * Update change request
 */
export async function updateChangeRequest(
  changeId: string,
  updates: Partial<Omit<AIChangeRequest, 'id' | 'changeKey' | 'organizationId' | 'createdAt'>>,
  userId: string,
  userName: string
): Promise<AIChangeRequest | null> {
  const change = changes.get(changeId);
  if (!change) return null;

  const previousStatus = change.status;
  const updated: AIChangeRequest = {
    ...change,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  changes.set(changeId, updated);

  if (updates.status && updates.status !== previousStatus) {
    await addHistoryEntry(changeId, 'updated', previousStatus, userId, userName, `Status changed to ${updates.status}`, { previousStatus, newStatus: updates.status });
  }

  return updated;
}

/**
 * Submit change request for review
 */
export async function submitChangeRequest(
  changeId: string,
  userId: string,
  userName: string,
  comments?: string
): Promise<AIChangeRequest | null> {
  const change = changes.get(changeId);
  if (!change) return null;

  if (change.status !== 'draft') {
    throw new Error('Only draft changes can be submitted');
  }

  change.status = 'submitted';
  change.approvalStatus = change.risk.level === 'low' ? 'not-required' : 'pending';
  change.updatedAt = new Date().toISOString();

  changes.set(changeId, change);
  await addHistoryEntry(changeId, 'submitted', 'draft', userId, userName, comments || 'Change submitted for review');

  return change;
}

/**
 * Approve change request
 */
export async function approveChangeRequest(
  changeId: string,
  approver: ChangeUser,
  comments?: string
): Promise<AIChangeRequest | null> {
  const change = changes.get(changeId);
  if (!change) return null;

  if (change.status !== 'submitted' && change.status !== 'under-review') {
    throw new Error('Only submitted or under-review changes can be approved');
  }

  change.status = 'approved';
  change.approvalStatus = 'approved';
  change.approvers.push(approver);
  change.updatedAt = new Date().toISOString();

  changes.set(changeId, change);
  await addHistoryEntry(changeId, 'approved', change.status, approver.userId, approver.userName, comments || 'Change approved');

  return change;
}

/**
 * Reject change request
 */
export async function rejectChangeRequest(
  changeId: string,
  approver: ChangeUser,
  reason: string
): Promise<AIChangeRequest | null> {
  const change = changes.get(changeId);
  if (!change) return null;

  change.status = 'rejected';
  change.approvalStatus = 'rejected';
  change.approvers.push(approver);
  change.updatedAt = new Date().toISOString();

  changes.set(changeId, change);
  await addHistoryEntry(changeId, 'rejected', change.status, approver.userId, approver.userName, reason);

  return change;
}

/**
 * Schedule change implementation
 */
export async function scheduleChange(
  changeId: string,
  scheduledDate: string,
  userId: string,
  userName: string
): Promise<AIChangeRequest | null> {
  const change = changes.get(changeId);
  if (!change) return null;

  if (change.status !== 'approved') {
    throw new Error('Only approved changes can be scheduled');
  }

  // Check freeze windows
  const isFrozen = await isInFreezeWindow(change.organizationId, scheduledDate, change.category);
  if (isFrozen) {
    throw new Error('Cannot schedule change during freeze window');
  }

  change.status = 'scheduled';
  change.scheduledDate = scheduledDate;
  change.updatedAt = new Date().toISOString();

  changes.set(changeId, change);
  await addHistoryEntry(changeId, 'scheduled', 'approved', userId, userName, `Scheduled for ${scheduledDate}`);

  return change;
}

/**
 * Mark change as deployed
 */
export async function markAsDeployed(
  changeId: string,
  userId: string,
  userName: string,
  comments?: string
): Promise<AIChangeRequest | null> {
  const change = changes.get(changeId);
  if (!change) return null;

  change.status = 'deployed';
  change.implementedDate = new Date().toISOString();
  change.updatedAt = change.implementedDate;

  changes.set(changeId, change);
  await addHistoryEntry(changeId, 'completed', change.status, userId, userName, comments || 'Change deployed successfully');

  return change;
}

/**
 * Rollback change
 */
export async function rollbackChange(
  changeId: string,
  userId: string,
  userName: string,
  reason: string
): Promise<AIChangeRequest | null> {
  const change = changes.get(changeId);
  if (!change) return null;

  change.status = 'rolled-back';
  change.updatedAt = new Date().toISOString();

  changes.set(changeId, change);
  await addHistoryEntry(changeId, 'rolled-back', change.status, userId, userName, reason);

  return change;
}

/**
 * Get change request by ID
 */
export async function getChangeRequest(changeId: string): Promise<AIChangeRequest | null> {
  return changes.get(changeId) || null;
}

/**
 * List change requests for an organization
 */
export async function listChangeRequests(
  organizationId: string,
  filters?: {
    category?: ChangeCategory;
    status?: ChangeStatus;
    priority?: ChangePriority;
    dateRange?: { start: string; end: string };
  }
): Promise<AIChangeRequest[]> {
  const allChanges = Array.from(changes.values()).filter(
    (c) => c.organizationId === organizationId
  );

  return allChanges.filter((c) => {
    if (filters?.category && c.category !== filters.category) return false;
    if (filters?.status && c.status !== filters.status) return false;
    if (filters?.priority && c.priority !== filters.priority) return false;
    if (filters?.dateRange) {
      const changeDate = new Date(c.createdAt);
      const start = new Date(filters.dateRange.start);
      const end = new Date(filters.dateRange.end);
      if (changeDate < start || changeDate > end) return false;
    }
    return true;
  });
}

// ─── Change History ────────────────────────────────────────────────────────────

/**
 * Add history entry
 */
async function addHistoryEntry(
  changeId: string,
  action: ChangeAction,
  previousStatus: ChangeStatus,
  userId: string,
  userName: string,
  comments?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const change = changes.get(changeId);
  if (!change) return;

  const entry: ChangeHistory = {
    id: `history_${randomUUID()}`,
    changeId,
    action,
    previousStatus,
    newStatus: change.status,
    userId,
    userName,
    comments,
    metadata,
    timestamp: new Date().toISOString(),
  };

  const history = changeHistory.get(changeId) || [];
  history.push(entry);
  changeHistory.set(changeId, history);
}

/**
 * Get change history
 */
export async function getChangeHistory(changeId: string): Promise<ChangeHistory[]> {
  return changeHistory.get(changeId) || [];
}

// ─── Freeze Window Management ──────────────────────────────────────────────────

/**
 * Create freeze window
 */
export async function createFreezeWindow(
  organizationId: string,
  freeze: Omit<FreezeWindow, 'id' | 'createdAt'>
): Promise<FreezeWindow> {
  const id = `freeze_${randomUUID()}`;
  const now = new Date().toISOString();

  const newFreeze: FreezeWindow = {
    ...freeze,
    id,
    createdAt: now,
  };

  freezeWindows.set(id, newFreeze);
  return newFreeze;
}

/**
 * Check if date is in freeze window
 */
async function isInFreezeWindow(
  organizationId: string,
  date: string,
  category: ChangeCategory
): Promise<boolean> {
  const checkDate = new Date(date);
  const allFreezes = Array.from(freezeWindows.values());

  for (const freeze of allFreezes) {
    const start = new Date(freeze.startDate);
    const end = new Date(freeze.endDate);

    if (checkDate >= start && checkDate <= end) {
      if (freeze.scope === 'all') return true;
      if (Array.isArray(freeze.scope) && freeze.scope.includes(category)) return true;
    }
  }

  return false;
}

/**
 * List freeze windows
 */
export async function listFreezeWindows(organizationId: string): Promise<FreezeWindow[]> {
  return Array.from(freezeWindows.values());
}

// ─── Change Calendar ───────────────────────────────────────────────────────────

/**
 * Get change calendar for a date range
 */
export async function getChangeCalendar(
  organizationId: string,
  startDate: string,
  endDate: string
): Promise<ChangeCalendar[]> {
  const changes = await listChangeRequests(organizationId, {
    dateRange: { start: startDate, end: endDate },
  });

  const calendar: Map<string, ChangeCalendar> = new Map();

  // Group changes by date
  for (const change of changes) {
    const date = change.scheduledDate?.split('T')[0] || change.createdAt.split('T')[0];

    if (!calendar.has(date)) {
      calendar.set(date, {
        organizationId,
        date,
        changes: [],
        freezeWindows: [],
      });
    }

    calendar.get(date)!.changes.push({
      changeId: change.id,
      changeKey: change.changeKey,
      title: change.title,
      category: change.category,
      priority: change.priority,
      status: change.status,
      scheduledTime: change.scheduledDate,
    });
  }

  // Add freeze windows
  const freezes = await listFreezeWindows(organizationId);
  for (const freeze of freezes) {
    const start = new Date(freeze.startDate);
    const end = new Date(freeze.endDate);
    const current = new Date(start);

    while (current <= end) {
      const date = current.toISOString().split('T')[0];
      if (!calendar.has(date)) {
        calendar.set(date, {
          organizationId,
          date,
          changes: [],
          freezeWindows: [],
        });
      }
      calendar.get(date)!.freezeWindows.push(freeze);
      current.setDate(current.getDate() + 1);
    }
  }

  return Array.from(calendar.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Statistics ────────────────────────────────────────────────────────────────

/**
 * Get change management statistics
 */
export async function getChangeStats(organizationId: string): Promise<{
  totalChanges: number;
  changesByCategory: Record<ChangeCategory, number>;
  changesByStatus: Record<ChangeStatus, number>;
  changesByPriority: Record<ChangePriority, number>;
  averageImplementationTimeHours: number;
  successRate: number;
  rollbackRate: number;
  pendingApprovals: number;
}> {
  const orgChanges = await listChangeRequests(organizationId);

  const changesByCategory: Record<string, number> = {};
  const changesByStatus: Record<string, number> = {};
  const changesByPriority: Record<string, number> = {};
  let totalImplementationTime = 0;
  let implementationCount = 0;
  let successCount = 0;
  let rollbackCount = 0;
  let pendingApprovals = 0;

  for (const change of orgChanges) {
    changesByCategory[change.category] = (changesByCategory[change.category] || 0) + 1;
    changesByStatus[change.status] = (changesByStatus[change.status] || 0) + 1;
    changesByPriority[change.priority] = (changesByPriority[change.priority] || 0) + 1;

    if (change.implementedDate && change.scheduledDate) {
      const implTime = (new Date(change.implementedDate).getTime() - new Date(change.scheduledDate).getTime()) / (1000 * 60 * 60);
      totalImplementationTime += implTime;
      implementationCount++;
    }

    if (change.status === 'completed' || change.status === 'deployed') successCount++;
    if (change.status === 'rolled-back') rollbackCount++;
    if (change.approvalStatus === 'pending' || change.approvalStatus === 'in-review') pendingApprovals++;
  }

  return {
    totalChanges: orgChanges.length,
    changesByCategory: changesByCategory as Record<ChangeCategory, number>,
    changesByStatus: changesByStatus as Record<ChangeStatus, number>,
    changesByPriority: changesByPriority as Record<ChangePriority, number>,
    averageImplementationTimeHours: implementationCount > 0 ? Math.round((totalImplementationTime / implementationCount) * 100) / 100 : 0,
    successRate: orgChanges.length > 0 ? Math.round((successCount / orgChanges.length) * 10000) / 100 : 0,
    rollbackRate: orgChanges.length > 0 ? Math.round((rollbackCount / orgChanges.length) * 10000) / 100 : 0,
    pendingApprovals,
  };
}
