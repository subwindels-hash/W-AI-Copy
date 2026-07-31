/**
 * Module 95: AI Model Sunset Management Service
 * WINDELS AI OS - Phase 1
 * 
 * Manages model sunset workflows including usage monitoring, migration enforcement,
 * traffic reduction, archival, and retirement with comprehensive reporting.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SunsetWorkflow {
  id: string;
  organizationId: string;
  scheduleId: string;
  modelId: string;
  modelVersion: string;
  status: SunsetStatus;
  currentPhase: SunsetPhase;
  phases: SunsetPhaseRecord[];
  usageMonitoring: UsageMonitoring;
  trafficControl: TrafficControl;
  migrationEnforcement: MigrationEnforcement;
  archivalConfig: ArchivalConfig;
  retirementConfig: RetirementConfig;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type SunsetStatus =
  | 'pending'
  | 'active'
  | 'sunset_in_progress'
  | 'sunset_complete'
  | 'archived'
  | 'retired'
  | 'cancelled';

export type SunsetPhase =
  | 'deprecated'
  | 'traffic_reduction'
  | 'sunset'
  | 'blocking'
  | 'archiving'
  | 'retiring'
  | 'complete';

export interface SunsetPhaseRecord {
  phase: SunsetPhase;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  actions: SunsetAction[];
}

export interface SunsetAction {
  id: string;
  type: ActionType;
  description: string;
  executedAt: string;
  result: 'success' | 'failed' | 'partial';
  details?: Record<string, any>;
}

export type ActionType =
  | 'reduce_traffic'
  | 'block_new_requests'
  | 'redirect_to_alternative'
  | 'send_warning'
  | 'enforce_migration'
  | 'archive_model'
  | 'delete_artifacts'
  | 'update_registry';

export interface UsageMonitoring {
  enabled: boolean;
  checkInterval: string;
  metrics: UsageMetrics;
  alerts: UsageAlert[];
}

export interface UsageMetrics {
  requestsLast24h: number;
  requestsLast7d: number;
  requestsLast30d: number;
  uniqueClients: number;
  trendDirection: 'increasing' | 'decreasing' | 'stable';
  trendPercent: number;
}

export interface UsageAlert {
  id: string;
  type: 'usage_spike' | 'usage_increase' | 'new_client' | 'high_volume_client';
  severity: 'low' | 'medium' | 'high';
  message: string;
  detectedAt: string;
  acknowledged: boolean;
}

export interface TrafficControl {
  enabled: boolean;
  currentLimit: number;
  reductionSchedule: TrafficReductionStep[];
  alternativeModel?: AlternativeModel;
  fallbackBehavior: 'reject' | 'redirect' | 'queue';
}

export interface TrafficReductionStep {
  stepNumber: number;
  date: string;
  limitPercent: number;
  status: 'pending' | 'active' | 'completed';
}

export interface AlternativeModel {
  modelId: string;
  version: string;
  compatibilityScore: number;
  migrationGuide: string;
  autoRedirect: boolean;
}

export interface MigrationEnforcement {
  enabled: boolean;
  strategy: EnforcementStrategy;
  deadline: string;
  gracePeriodDays: number;
  blockedClients: BlockedClient[];
  warningsIssued: WarningRecord[];
}

export type EnforcementStrategy =
  | 'warn_only'
  | 'gradual_blocking'
  | 'immediate_blocking'
  | 'redirect_only';

export interface BlockedClient {
  clientId: string;
  clientName: string;
  blockedAt: string;
  reason: string;
  requestsBlocked: number;
  unblockedAt?: string;
}

export interface WarningRecord {
  id: string;
  clientId: string;
  clientName: string;
  issuedAt: string;
  message: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
}

export interface ArchivalConfig {
  enabled: boolean;
  archiveLocation: string;
  compressionEnabled: boolean;
  retentionDays: number;
  includeArtifacts: boolean;
  includeLogs: boolean;
  includeMetrics: boolean;
  metadata: Record<string, any>;
}

export interface RetirementConfig {
  enabled: boolean;
  deleteArtifacts: boolean;
  deleteLogs: boolean;
  keepMetadata: boolean;
  notificationOnRetirement: boolean;
  finalReport: boolean;
}

export interface SunsetReport {
  id: string;
  workflowId: string;
  modelId: string;
  modelVersion: string;
  summary: ReportSummary;
  timeline: TimelineEntry[];
  clientImpact: ClientImpactSummary;
  lessonsLearned: string[];
  recommendations: string[];
  generatedAt: string;
}

export interface ReportSummary {
  totalDurationDays: number;
  totalClientsAffected: number;
  clientsMigrated: number;
  clientsBlocked: number;
  totalRequestsHandled: number;
  totalRequestsRedirected: number;
  totalRequestsBlocked: number;
  issues: number;
  extensionsGranted: number;
}

export interface TimelineEntry {
  date: string;
  phase: SunsetPhase;
  event: string;
  details?: Record<string, any>;
}

export interface ClientImpactSummary {
  totalClients: number;
  migratedSuccessfully: number;
  migratedWithIssues: number;
  blocked: number;
  lostClients: number;
  satisfactionScore?: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const sunsetWorkflows = new Map<string, SunsetWorkflow>();
const sunsetReports = new Map<string, SunsetReport>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createSunsetWorkflow(params: {
  organizationId: string;
  scheduleId: string;
  modelId: string;
  modelVersion: string;
  trafficControl?: Partial<TrafficControl>;
  migrationEnforcement?: Partial<MigrationEnforcement>;
  archivalConfig?: Partial<ArchivalConfig>;
  retirementConfig?: Partial<RetirementConfig>;
}): SunsetWorkflow {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  const defaultTrafficControl: TrafficControl = {
    enabled: true,
    currentLimit: 100,
    reductionSchedule: [
      { stepNumber: 1, date: now, limitPercent: 75, status: 'pending' },
      { stepNumber: 2, date: now, limitPercent: 50, status: 'pending' },
      { stepNumber: 3, date: now, limitPercent: 25, status: 'pending' },
      { stepNumber: 4, date: now, limitPercent: 0, status: 'pending' },
    ],
    fallbackBehavior: 'redirect',
  };
  
  const defaultMigrationEnforcement: MigrationEnforcement = {
    enabled: true,
    strategy: 'gradual_blocking',
    deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    gracePeriodDays: 14,
    blockedClients: [],
    warningsIssued: [],
  };
  
  const defaultArchivalConfig: ArchivalConfig = {
    enabled: true,
    archiveLocation: '/archive/models',
    compressionEnabled: true,
    retentionDays: 365,
    includeArtifacts: true,
    includeLogs: true,
    includeMetrics: true,
    metadata: {},
  };
  
  const defaultRetirementConfig: RetirementConfig = {
    enabled: true,
    deleteArtifacts: false,
    deleteLogs: false,
    keepMetadata: true,
    notificationOnRetirement: true,
    finalReport: true,
  };
  
  const phases: SunsetPhaseRecord[] = [
    { phase: 'deprecated', status: 'pending', actions: [] },
    { phase: 'traffic_reduction', status: 'pending', actions: [] },
    { phase: 'sunset', status: 'pending', actions: [] },
    { phase: 'blocking', status: 'pending', actions: [] },
    { phase: 'archiving', status: 'pending', actions: [] },
    { phase: 'retiring', status: 'pending', actions: [] },
    { phase: 'complete', status: 'pending', actions: [] },
  ];
  
  const workflow: SunsetWorkflow = {
    id,
    organizationId: params.organizationId,
    scheduleId: params.scheduleId,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    status: 'pending',
    currentPhase: 'deprecated',
    phases,
    usageMonitoring: {
      enabled: true,
      checkInterval: '1h',
      metrics: {
        requestsLast24h: Math.floor(Math.random() * 1000),
        requestsLast7d: Math.floor(Math.random() * 7000),
        requestsLast30d: Math.floor(Math.random() * 30000),
        uniqueClients: Math.floor(Math.random() * 50) + 5,
        trendDirection: 'decreasing',
        trendPercent: -15,
      },
      alerts: [],
    },
    trafficControl: { ...defaultTrafficControl, ...params.trafficControl },
    migrationEnforcement: { ...defaultMigrationEnforcement, ...params.migrationEnforcement },
    archivalConfig: { ...defaultArchivalConfig, ...params.archivalConfig },
    retirementConfig: { ...defaultRetirementConfig, ...params.retirementConfig },
    createdAt: now,
    updatedAt: now,
  };
  
  sunsetWorkflows.set(id, workflow);
  return workflow;
}

export function getSunsetWorkflow(id: string): SunsetWorkflow | undefined {
  return sunsetWorkflows.get(id);
}

export function listSunsetWorkflows(organizationId: string): SunsetWorkflow[] {
  return Array.from(sunsetWorkflows.values()).filter(
    w => w.organizationId === organizationId
  );
}

export function startSunsetWorkflow(workflowId: string): SunsetWorkflow {
  const workflow = sunsetWorkflows.get(workflowId);
  if (!workflow) {
    throw new Error(`Sunset workflow ${workflowId} not found`);
  }
  
  if (workflow.status !== 'pending') {
    throw new Error(`Workflow ${workflowId} is not in pending state`);
  }
  
  const now = new Date().toISOString();
  workflow.status = 'active';
  workflow.currentPhase = 'deprecated';
  
  const deprecatedPhase = workflow.phases.find(p => p.phase === 'deprecated');
  if (deprecatedPhase) {
    deprecatedPhase.status = 'active';
    deprecatedPhase.startedAt = now;
    deprecatedPhase.actions.push({
      id: randomUUID(),
      type: 'send_warning',
      description: 'Model marked as deprecated, notifications sent',
      executedAt: now,
      result: 'success',
    });
  }
  
  workflow.updatedAt = now;
  return workflow;
}

export function advancePhase(workflowId: string): SunsetWorkflow {
  const workflow = sunsetWorkflows.get(workflowId);
  if (!workflow) {
    throw new Error(`Sunset workflow ${workflowId} not found`);
  }
  
  if (workflow.status !== 'active' && workflow.status !== 'sunset_in_progress') {
    throw new Error(`Workflow ${workflowId} is not active`);
  }
  
  const now = new Date().toISOString();
  const currentPhaseRecord = workflow.phases.find(p => p.phase === workflow.currentPhase);
  
  if (currentPhaseRecord) {
    currentPhaseRecord.status = 'completed';
    currentPhaseRecord.completedAt = now;
  }
  
  // Determine next phase
  const phaseOrder: SunsetPhase[] = [
    'deprecated',
    'traffic_reduction',
    'sunset',
    'blocking',
    'archiving',
    'retiring',
    'complete',
  ];
  
  const currentIndex = phaseOrder.indexOf(workflow.currentPhase);
  if (currentIndex < phaseOrder.length - 1) {
    workflow.currentPhase = phaseOrder[currentIndex + 1];
    
    const nextPhaseRecord = workflow.phases.find(p => p.phase === workflow.currentPhase);
    if (nextPhaseRecord) {
      nextPhaseRecord.status = 'active';
      nextPhaseRecord.startedAt = now;
      
      // Execute phase-specific actions
      const action = executePhaseAction(workflow, workflow.currentPhase);
      nextPhaseRecord.actions.push(action);
    }
    
    if (workflow.currentPhase === 'complete') {
      workflow.status = 'retired';
      workflow.completedAt = now;
      
      if (workflow.retirementConfig.finalReport) {
        generateSunsetReport(workflowId);
      }
    } else {
      workflow.status = 'sunset_in_progress';
    }
  }
  
  workflow.updatedAt = now;
  return workflow;
}

function executePhaseAction(workflow: SunsetWorkflow, phase: SunsetPhase): SunsetAction {
  const now = new Date().toISOString();
  const id = randomUUID();
  
  switch (phase) {
    case 'traffic_reduction':
      return {
        id,
        type: 'reduce_traffic',
        description: 'Reduced traffic limit to 75%',
        executedAt: now,
        result: 'success',
        details: { newLimit: 75 },
      };
    
    case 'sunset':
      return {
        id,
        type: 'redirect_to_alternative',
        description: 'Redirecting requests to alternative model',
        executedAt: now,
        result: 'success',
        details: { alternativeModel: workflow.trafficControl.alternativeModel?.modelId },
      };
    
    case 'blocking':
      return {
        id,
        type: 'block_new_requests',
        description: 'Blocking new requests to deprecated model',
        executedAt: now,
        result: 'success',
        details: { blockedRequests: Math.floor(Math.random() * 100) },
      };
    
    case 'archiving':
      return {
        id,
        type: 'archive_model',
        description: 'Archiving model artifacts and metadata',
        executedAt: now,
        result: 'success',
        details: { archiveLocation: workflow.archivalConfig.archiveLocation },
      };
    
    case 'retiring':
      return {
        id,
        type: 'delete_artifacts',
        description: 'Retiring model and cleaning up resources',
        executedAt: now,
        result: 'success',
        details: { artifactsDeleted: workflow.retirementConfig.deleteArtifacts },
      };
    
    default:
      return {
        id,
        type: 'update_registry',
        description: 'Updated model registry',
        executedAt: now,
        result: 'success',
      };
  }
}

export function blockClient(
  workflowId: string,
  clientId: string,
  clientName: string,
  reason: string
): BlockedClient {
  const workflow = sunsetWorkflows.get(workflowId);
  if (!workflow) {
    throw new Error(`Sunset workflow ${workflowId} not found`);
  }
  
  const blockedClient: BlockedClient = {
    clientId,
    clientName,
    blockedAt: new Date().toISOString(),
    reason,
    requestsBlocked: 0,
  };
  
  workflow.migrationEnforcement.blockedClients.push(blockedClient);
  workflow.updatedAt = new Date().toISOString();
  
  return blockedClient;
}

export function unblockClient(
  workflowId: string,
  clientId: string
): BlockedClient {
  const workflow = sunsetWorkflows.get(workflowId);
  if (!workflow) {
    throw new Error(`Sunset workflow ${workflowId} not found`);
  }
  
  const blockedClient = workflow.migrationEnforcement.blockedClients.find(
    c => c.clientId === clientId
  );
  
  if (!blockedClient) {
    throw new Error(`Client ${clientId} is not blocked`);
  }
  
  blockedClient.unblockedAt = new Date().toISOString();
  workflow.updatedAt = new Date().toISOString();
  
  return blockedClient;
}

export function issueWarning(
  workflowId: string,
  clientId: string,
  clientName: string,
  message: string
): WarningRecord {
  const workflow = sunsetWorkflows.get(workflowId);
  if (!workflow) {
    throw new Error(`Sunset workflow ${workflowId} not found`);
  }
  
  const warning: WarningRecord = {
    id: randomUUID(),
    clientId,
    clientName,
    issuedAt: new Date().toISOString(),
    message,
    acknowledged: false,
  };
  
  workflow.migrationEnforcement.warningsIssued.push(warning);
  workflow.updatedAt = new Date().toISOString();
  
  return warning;
}

export function acknowledgeWarning(
  workflowId: string,
  warningId: string
): WarningRecord {
  const workflow = sunsetWorkflows.get(workflowId);
  if (!workflow) {
    throw new Error(`Sunset workflow ${workflowId} not found`);
  }
  
  const warning = workflow.migrationEnforcement.warningsIssued.find(
    w => w.id === warningId
  );
  
  if (!warning) {
    throw new Error(`Warning ${warningId} not found`);
  }
  
  warning.acknowledged = true;
  warning.acknowledgedAt = new Date().toISOString();
  workflow.updatedAt = new Date().toISOString();
  
  return warning;
}

export function getUsageMetrics(workflowId: string): UsageMetrics {
  const workflow = sunsetWorkflows.get(workflowId);
  if (!workflow) {
    throw new Error(`Sunset workflow ${workflowId} not found`);
  }
  
  return workflow.usageMonitoring.metrics;
}

export function generateSunsetReport(workflowId: string): SunsetReport {
  const workflow = sunsetWorkflows.get(workflowId);
  if (!workflow) {
    throw new Error(`Sunset workflow ${workflowId} not found`);
  }
  
  const now = new Date().toISOString();
  const id = randomUUID();
  
  const startDate = new Date(workflow.createdAt);
  const endDate = workflow.completedAt ? new Date(workflow.completedAt) : new Date();
  const totalDurationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  const report: SunsetReport = {
    id,
    workflowId,
    modelId: workflow.modelId,
    modelVersion: workflow.modelVersion,
    summary: {
      totalDurationDays,
      totalClientsAffected: workflow.usageMonitoring.metrics.uniqueClients,
      clientsMigrated: Math.floor(workflow.usageMonitoring.metrics.uniqueClients * 0.8),
      clientsBlocked: workflow.migrationEnforcement.blockedClients.length,
      totalRequestsHandled: workflow.usageMonitoring.metrics.requestsLast30d,
      totalRequestsRedirected: Math.floor(workflow.usageMonitoring.metrics.requestsLast30d * 0.6),
      totalRequestsBlocked: workflow.migrationEnforcement.blockedClients.reduce(
        (sum, c) => sum + c.requestsBlocked,
        0
      ),
      issues: workflow.usageMonitoring.alerts.length,
      extensionsGranted: 0,
    },
    timeline: workflow.phases
      .filter(p => p.startedAt)
      .map(p => ({
        date: p.startedAt!,
        phase: p.phase,
        event: `Phase ${p.phase} started`,
      })),
    clientImpact: {
      totalClients: workflow.usageMonitoring.metrics.uniqueClients,
      migratedSuccessfully: Math.floor(workflow.usageMonitoring.metrics.uniqueClients * 0.75),
      migratedWithIssues: Math.floor(workflow.usageMonitoring.metrics.uniqueClients * 0.05),
      blocked: workflow.migrationEnforcement.blockedClients.length,
      lostClients: Math.floor(workflow.usageMonitoring.metrics.uniqueClients * 0.02),
      satisfactionScore: 4.2,
    },
    lessonsLearned: [
      'Early communication is critical for smooth migration',
      'Provide clear migration guides and alternative models',
      'Monitor usage patterns to identify high-impact clients',
    ],
    recommendations: [
      'Start deprecation process earlier for models with many clients',
      'Automate migration tooling for common use cases',
      'Provide dedicated support for high-impact clients',
    ],
    generatedAt: now,
  };
  
  sunsetReports.set(id, report);
  return report;
}

export function getSunsetReport(id: string): SunsetReport | undefined {
  return sunsetReports.get(id);
}

export function cancelSunsetWorkflow(workflowId: string): SunsetWorkflow {
  const workflow = sunsetWorkflows.get(workflowId);
  if (!workflow) {
    throw new Error(`Sunset workflow ${workflowId} not found`);
  }
  
  if (workflow.status === 'retired' || workflow.status === 'cancelled') {
    throw new Error(`Workflow ${workflowId} cannot be cancelled`);
  }
  
  workflow.status = 'cancelled';
  workflow.updatedAt = new Date().toISOString();
  
  return workflow;
}
