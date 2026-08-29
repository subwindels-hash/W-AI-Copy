/**
 * Module 140: AI Model Compliance Audit Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides compliance audit capabilities for AI models including regulatory compliance
 * checking, audit trail management, compliance reporting, policy enforcement, and
 * continuous compliance monitoring.
 */

import { randomUUID } from 'crypto';
import { makeRng } from "../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:aiModelComplianceAudit');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ComplianceFramework {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: FrameworkType;
  version: string;
  status: FrameworkStatus;
  requirements: ComplianceRequirement[];
  controls: ComplianceControl[];
  mappings: RegulatoryMapping[];
  createdAt: string;
  updatedAt: string;
}

export type FrameworkType =
  | 'gdpr'
  | 'hipaa'
  | 'sox'
  | 'pci_dss'
  | 'iso_27001'
  | 'nist'
  | 'custom';

export type FrameworkStatus =
  | 'draft'
  | 'active'
  | 'deprecated'
  | 'archived';

export interface ComplianceRequirement {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  applicable: boolean;
  evidence: EvidenceRequirement[];
  validationRules: ValidationRule[];
}

export interface EvidenceRequirement {
  type: 'document' | 'configuration' | 'log' | 'test_result' | 'policy' | 'procedure';
  description: string;
  required: boolean;
  format?: string;
}

export interface ValidationRule {
  type: 'regex' | 'threshold' | 'existence' | 'custom';
  expression?: string;
  threshold?: number;
  operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  customValidator?: string;
}

export interface ComplianceControl {
  id: string;
  code: string;
  name: string;
  description: string;
  type: 'preventive' | 'detective' | 'corrective';
  implementation: string;
  automated: boolean;
  frequency: 'continuous' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';
  responsible: string;
}

export interface RegulatoryMapping {
  regulation: string;
  section: string;
  requirement: string;
  mapping: string;
}

export interface ComplianceAudit {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: AuditStatus;
  modelId: string;
  modelVersion: string;
  frameworkId: string;
  scope: AuditScope;
  findings: AuditFinding[];
  evidence: AuditEvidence[];
  results?: AuditResults;
  scheduledDate?: string;
  startDate?: string;
  endDate?: string;
  auditors: Auditor[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export type AuditStatus =
  | 'planned'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AuditScope {
  type: 'full' | 'partial' | 'focused';
  requirements?: string[];
  controls?: string[];
  timeRange?: { start: string; end: string };
  systems?: string[];
  data?: string[];
}

export interface AuditFinding {
  id: string;
  requirementId: string;
  type: 'compliant' | 'non_compliant' | 'partial' | 'not_applicable';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  evidence: string[];
  recommendation?: string;
  remediationPlan?: RemediationPlan;
  status: 'open' | 'in_progress' | 'resolved' | 'accepted';
  identifiedAt: string;
  resolvedAt?: string;
}

export interface RemediationPlan {
  actions: RemediationAction[];
  responsible: string;
  deadline: string;
  estimatedEffort: 'low' | 'medium' | 'high';
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface RemediationAction {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt?: string;
  notes?: string;
}

export interface AuditEvidence {
  id: string;
  requirementId: string;
  type: string;
  title: string;
  description: string;
  location: string;
  collectedAt: string;
  collectedBy: string;
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  metadata: Record<string, any>;
}

export interface AuditResults {
  overallCompliance: number; // percentage
  compliantCount: number;
  nonCompliantCount: number;
  partialCount: number;
  notApplicableCount: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  recommendations: string[];
  executiveSummary: string;
  completedAt: string;
}

export interface Auditor {
  id: string;
  name: string;
  email: string;
  role: 'lead' | 'auditor' | 'reviewer' | 'observer';
  certifications?: string[];
  assignedRequirements?: string[];
}

export interface ComplianceReport {
  id: string;
  auditId: string;
  type: ReportType;
  title: string;
  executiveSummary: string;
  scope: AuditScope;
  findings: AuditFinding[];
  statistics: ComplianceStatistics;
  recommendations: string[];
  appendices: ReportAppendix[];
  generatedAt: string;
  generatedBy: string;
}

export type ReportType =
  | 'executive'
  | 'detailed'
  | 'technical'
  | 'regulatory'
  | 'remediation';

export interface ComplianceStatistics {
  totalRequirements: number;
  compliant: number;
  nonCompliant: number;
  partial: number;
  notApplicable: number;
  complianceRate: number;
  trend: 'improving' | 'stable' | 'declining';
  riskScore: number;
}

export interface ReportAppendix {
  title: string;
  content: string;
  data?: any;
}

export interface ComplianceAlert {
  id: string;
  type: 'non_compliance' | 'policy_violation' | 'control_failure' | 'deadline_approaching';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  modelId: string;
  requirementId?: string;
  triggeredAt: string;
  acknowledged: boolean;
  resolvedAt?: string;
}

export interface ContinuousMonitoring {
  id: string;
  organizationId: string;
  modelId: string;
  frameworkId: string;
  status: 'active' | 'paused' | 'disabled';
  checks: MonitoringCheck[];
  lastCheckAt?: string;
  nextCheckAt?: string;
  alerts: ComplianceAlert[];
}

export interface MonitoringCheck {
  id: string;
  requirementId: string;
  control: string;
  frequency: string;
  lastCheck?: string;
  lastResult?: 'pass' | 'fail' | 'warning';
  nextCheck?: string;
  automated: boolean;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const complianceFrameworks = new Map<string, ComplianceFramework>();
const complianceAudits = new Map<string, ComplianceAudit>();
const complianceReports = new Map<string, ComplianceReport>();
const continuousMonitoring = new Map<string, ContinuousMonitoring>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createComplianceFramework(params: {
  organizationId: string;
  name: string;
  description?: string;
  type: FrameworkType;
  version: string;
  requirements: Omit<ComplianceRequirement, 'id'>[];
  controls: Omit<ComplianceControl, 'id'>[];
  mappings?: Omit<RegulatoryMapping, 'id'>[];
}): ComplianceFramework {
  const now = new Date().toISOString();
  const id = randomUUID();

  const framework: ComplianceFramework = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    type: params.type,
    version: params.version,
    status: 'active',
    requirements: params.requirements.map(r => ({ ...r, id: randomUUID() })),
    controls: params.controls.map(c => ({ ...c, id: randomUUID() })),
    mappings: params.mappings?.map(m => ({ ...m })) || [],
    createdAt: now,
    updatedAt: now,
  };

  complianceFrameworks.set(id, framework);
  return framework;
}

export function getComplianceFramework(id: string): ComplianceFramework | undefined {
  return complianceFrameworks.get(id);
}

export function listComplianceFrameworks(
  organizationId: string,
  filters?: { type?: FrameworkType; status?: FrameworkStatus }
): ComplianceFramework[] {
  let result = Array.from(complianceFrameworks.values()).filter(
    f => f.organizationId === organizationId
  );

  if (filters?.type) result = result.filter(f => f.type === filters.type);
  if (filters?.status) result = result.filter(f => f.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createComplianceAudit(params: {
  organizationId: string;
  name: string;
  description?: string;
  modelId: string;
  modelVersion: string;
  frameworkId: string;
  scope: AuditScope;
  auditors: Omit<Auditor, 'id'>[];
  scheduledDate?: string;
  createdBy: string;
}): ComplianceAudit {
  const now = new Date().toISOString();
  const id = randomUUID();

  const audit: ComplianceAudit = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'planned',
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    frameworkId: params.frameworkId,
    scope: params.scope,
    findings: [],
    evidence: [],
    scheduledDate: params.scheduledDate,
    auditors: params.auditors.map(a => ({ ...a, id: randomUUID() })),
    createdAt: now,
    updatedAt: now,
    createdBy: params.createdBy,
  };

  complianceAudits.set(id, audit);
  return audit;
}

export function getComplianceAudit(id: string): ComplianceAudit | undefined {
  return complianceAudits.get(id);
}

export function listComplianceAudits(
  organizationId: string,
  filters?: { status?: AuditStatus; modelId?: string; frameworkId?: string }
): ComplianceAudit[] {
  let result = Array.from(complianceAudits.values()).filter(
    a => a.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(a => a.status === filters.status);
  if (filters?.modelId) result = result.filter(a => a.modelId === filters.modelId);
  if (filters?.frameworkId) result = result.filter(a => a.frameworkId === filters.frameworkId);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function startComplianceAudit(auditId: string): ComplianceAudit {
  const audit = complianceAudits.get(auditId);
  if (!audit) throw new Error(`Compliance audit ${auditId} not found`);

  if (audit.status !== 'planned') {
    throw new Error('Audit must be in planned status to start');
  }

  audit.status = 'in_progress';
  audit.startDate = new Date().toISOString();
  audit.updatedAt = new Date().toISOString();

  return audit;
}

export function addAuditFinding(
  auditId: string,
  finding: Omit<AuditFinding, 'id' | 'identifiedAt' | 'status'>
): ComplianceAudit {
  const audit = complianceAudits.get(auditId);
  if (!audit) throw new Error(`Compliance audit ${auditId} not found`);

  const newFinding: AuditFinding = {
    ...finding,
    id: randomUUID(),
    status: 'open',
    identifiedAt: new Date().toISOString(),
  };

  audit.findings.push(newFinding);
  audit.updatedAt = new Date().toISOString();

  return audit;
}

export function updateAuditFinding(
  auditId: string,
  findingId: string,
  updates: Partial<AuditFinding>
): ComplianceAudit {
  const audit = complianceAudits.get(auditId);
  if (!audit) throw new Error(`Compliance audit ${auditId} not found`);

  const finding = audit.findings.find(f => f.id === findingId);
  if (!finding) throw new Error(`Finding ${findingId} not found`);

  Object.assign(finding, updates);

  if (finding.status === 'resolved' && !finding.resolvedAt) {
    finding.resolvedAt = new Date().toISOString();
  }

  audit.updatedAt = new Date().toISOString();
  return audit;
}

export function addAuditEvidence(
  auditId: string,
  evidence: Omit<AuditEvidence, 'id' | 'collectedAt' | 'verified'>
): ComplianceAudit {
  const audit = complianceAudits.get(auditId);
  if (!audit) throw new Error(`Compliance audit ${auditId} not found`);

  const newEvidence: AuditEvidence = {
    ...evidence,
    id: randomUUID(),
    collectedAt: new Date().toISOString(),
    verified: false,
  };

  audit.evidence.push(newEvidence);
  audit.updatedAt = new Date().toISOString();

  return audit;
}

export function verifyEvidence(
  auditId: string,
  evidenceId: string,
  verifiedBy: string
): ComplianceAudit {
  const audit = complianceAudits.get(auditId);
  if (!audit) throw new Error(`Compliance audit ${auditId} not found`);

  const evidence = audit.evidence.find(e => e.id === evidenceId);
  if (!evidence) throw new Error(`Evidence ${evidenceId} not found`);

  evidence.verified = true;
  evidence.verifiedAt = new Date().toISOString();
  evidence.verifiedBy = verifiedBy;

  audit.updatedAt = new Date().toISOString();
  return audit;
}

export function completeComplianceAudit(auditId: string): ComplianceAudit {
  const audit = complianceAudits.get(auditId);
  if (!audit) throw new Error(`Compliance audit ${auditId} not found`);

  if (audit.status !== 'in_progress' && audit.status !== 'review') {
    throw new Error('Audit must be in progress or review to complete');
  }

  const now = new Date().toISOString();

  const compliant = audit.findings.filter(f => f.type === 'compliant').length;
  const nonCompliant = audit.findings.filter(f => f.type === 'non_compliant').length;
  const partial = audit.findings.filter(f => f.type === 'partial').length;
  const notApplicable = audit.findings.filter(f => f.type === 'not_applicable').length;

  const total = audit.findings.length - notApplicable;
  const overallCompliance = total > 0 ? ((compliant + partial * 0.5) / total) * 100 : 0;

  const criticalFindings = audit.findings.filter(f => f.severity === 'critical').length;
  const highFindings = audit.findings.filter(f => f.severity === 'high').length;
  const mediumFindings = audit.findings.filter(f => f.severity === 'medium').length;
  const lowFindings = audit.findings.filter(f => f.severity === 'low').length;

  const recommendations: string[] = [];
  if (nonCompliant > 0) {
    recommendations.push(`Address ${nonCompliant} non-compliant findings`);
  }
  if (criticalFindings > 0) {
    recommendations.push(`Prioritize ${criticalFindings} critical findings`);
  }
  if (partial > 0) {
    recommendations.push(`Improve ${partial} partially compliant areas`);
  }

  audit.results = {
    overallCompliance,
    compliantCount: compliant,
    nonCompliantCount: nonCompliant,
    partialCount: partial,
    notApplicableCount: notApplicable,
    criticalFindings,
    highFindings,
    mediumFindings,
    lowFindings,
    recommendations,
    executiveSummary: `Compliance audit completed with ${overallCompliance.toFixed(1)}% compliance rate. ` +
      `${compliant} compliant, ${nonCompliant} non-compliant, ${partial} partial findings.`,
    completedAt: now,
  };

  audit.status = 'completed';
  audit.endDate = now;
  audit.updatedAt = now;

  return audit;
}

export function generateComplianceReport(
  auditId: string,
  type: ReportType,
  generatedBy: string
): ComplianceReport {
  const audit = complianceAudits.get(auditId);
  if (!audit) throw new Error(`Compliance audit ${auditId} not found`);

  if (!audit.results) {
    throw new Error('Audit must be completed before generating report');
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  const statistics: ComplianceStatistics = {
    totalRequirements: audit.findings.length,
    compliant: audit.results.compliantCount,
    nonCompliant: audit.results.nonCompliantCount,
    partial: audit.results.partialCount,
    notApplicable: audit.results.notApplicableCount,
    complianceRate: audit.results.overallCompliance,
    trend: 'stable',
    riskScore: audit.results.criticalFindings * 10 + audit.results.highFindings * 5,
  };

  const report: ComplianceReport = {
    id,
    auditId,
    type,
    title: `${type.charAt(0).toUpperCase() + type.slice(1)} Compliance Report - ${audit.name}`,
    executiveSummary: audit.results.executiveSummary,
    scope: audit.scope,
    findings: audit.findings,
    statistics,
    recommendations: audit.results.recommendations,
    appendices: [],
    generatedAt: now,
    generatedBy,
  };

  complianceReports.set(id, report);
  return report;
}

export function getComplianceReport(id: string): ComplianceReport | undefined {
  return complianceReports.get(id);
}

export function listComplianceReports(
  organizationId: string,
  filters?: { type?: ReportType; auditId?: string }
): ComplianceReport[] {
  const audits = Array.from(complianceAudits.values()).filter(
    a => a.organizationId === organizationId
  );
  const auditIds = audits.map(a => a.id);

  let result = Array.from(complianceReports.values()).filter(
    r => auditIds.includes(r.auditId)
  );

  if (filters?.type) result = result.filter(r => r.type === filters.type);
  if (filters?.auditId) result = result.filter(r => r.auditId === filters.auditId);

  return result.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export function setupContinuousMonitoring(params: {
  organizationId: string;
  modelId: string;
  frameworkId: string;
  checks: Omit<MonitoringCheck, 'id'>[];
}): ContinuousMonitoring {
  const now = new Date().toISOString();
  const id = randomUUID();

  const monitoring: ContinuousMonitoring = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    frameworkId: params.frameworkId,
    status: 'active',
    checks: params.checks.map(c => ({ ...c, id: randomUUID() })),
    lastCheckAt: now,
    alerts: [],
  };

  continuousMonitoring.set(id, monitoring);
  return monitoring;
}

export function getContinuousMonitoring(id: string): ContinuousMonitoring | undefined {
  return continuousMonitoring.get(id);
}

export function listContinuousMonitoring(
  organizationId: string,
  filters?: { modelId?: string; status?: string }
): ContinuousMonitoring[] {
  let result = Array.from(continuousMonitoring.values()).filter(
    m => m.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(m => m.modelId === filters.modelId);
  if (filters?.status) result = result.filter(m => m.status === filters.status);

  return result;
}

export function runComplianceCheck(monitoringId: string): ComplianceAlert[] {
  const monitoring = continuousMonitoring.get(monitoringId);
  if (!monitoring) throw new Error(`Continuous monitoring ${monitoringId} not found`);

  const now = new Date().toISOString();
  const alerts: ComplianceAlert[] = [];

  // Simulate compliance checks
  for (const check of monitoring.checks) {
    const passed = _rng.next() > 0.1; // 90% pass rate

    check.lastCheck = now;
    check.lastResult = passed ? 'pass' : 'fail';

    if (!passed) {
      const alert: ComplianceAlert = {
        id: randomUUID(),
        type: 'non_compliance',
        severity: 'medium',
        title: `Compliance check failed: ${check.control}`,
        description: `Automated compliance check for ${check.control} failed`,
        modelId: monitoring.modelId,
        requirementId: check.requirementId,
        triggeredAt: now,
        acknowledged: false,
      };

      alerts.push(alert);
      monitoring.alerts.push(alert);
    }
  }

  monitoring.lastCheckAt = now;
  return alerts;
}

export function acknowledgeComplianceAlert(
  monitoringId: string,
  alertId: string
): ContinuousMonitoring {
  const monitoring = continuousMonitoring.get(monitoringId);
  if (!monitoring) throw new Error(`Continuous monitoring ${monitoringId} not found`);

  const alert = monitoring.alerts.find(a => a.id === alertId);
  if (!alert) throw new Error(`Alert ${alertId} not found`);

  alert.acknowledged = true;
  return monitoring;
}

export function getComplianceDashboard(organizationId: string): {
  totalFrameworks: number;
  activeAudits: number;
  completedAudits: number;
  overallCompliance: number;
  criticalFindings: number;
  activeAlerts: number;
  trend: 'improving' | 'stable' | 'declining';
} {
  const frameworks = Array.from(complianceFrameworks.values()).filter(
    f => f.organizationId === organizationId
  );

  const audits = Array.from(complianceAudits.values()).filter(
    a => a.organizationId === organizationId
  );

  const completedAudits = audits.filter(a => a.status === 'completed');
  const activeAudits = audits.filter(a => a.status === 'in_progress');

  const overallCompliance = completedAudits.length > 0
    ? completedAudits.reduce((sum, a) => sum + (a.results?.overallCompliance || 0), 0) / completedAudits.length
    : 0;

  const criticalFindings = completedAudits.reduce(
    (sum, a) => sum + (a.results?.criticalFindings || 0), 0
  );

  const monitorings = Array.from(continuousMonitoring.values()).filter(
    m => m.organizationId === organizationId
  );

  const activeAlerts = monitorings.reduce(
    (sum, m) => sum + m.alerts.filter(a => !a.acknowledged).length, 0
  );

  return {
    totalFrameworks: frameworks.length,
    activeAudits: activeAudits.length,
    completedAudits: completedAudits.length,
    overallCompliance,
    criticalFindings,
    activeAlerts,
    trend: 'stable',
  };
}
