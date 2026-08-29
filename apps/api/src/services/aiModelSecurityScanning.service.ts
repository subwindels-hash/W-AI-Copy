/**
 * Module 108: AI Model Security Scanning Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides comprehensive security scanning for AI models including vulnerability
 * detection, adversarial attack detection, model integrity verification, and
 * security compliance checking.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SecurityScan {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  scanType: ScanType;
  status: ScanStatus;
  configuration: ScanConfiguration;
  results?: ScanResults;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  createdAt: string;
  updatedAt: string;
  initiatedBy: string;
}

export type ScanType =
  | 'vulnerability_scan'
  | 'adversarial_scan'
  | 'integrity_check'
  | 'compliance_scan'
  | 'full_scan';

export type ScanStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ScanConfiguration {
  vulnerabilityChecks: VulnerabilityCheck[];
  adversarialTests: AdversarialTest[];
  integrityChecks: IntegrityCheck[];
  complianceStandards: string[];
  severityThreshold: 'low' | 'medium' | 'high' | 'critical';
  timeout: number; // seconds
  parallelExecution: boolean;
}

export interface VulnerabilityCheck {
  name: string;
  category: 'injection' | 'data_leakage' | 'model_extraction' | 'evasion' | 'poisoning';
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface AdversarialTest {
  name: string;
  attackType: 'fgsm' | 'pgd' | 'cw' | 'boundary' | 'hop_skip_jump';
  epsilon: number;
  iterations: number;
  enabled: boolean;
}

export interface IntegrityCheck {
  name: string;
  checkType: 'checksum' | 'signature' | 'weights_hash' | 'config_hash';
  expectedValue?: string;
  enabled: boolean;
}

export interface ScanResults {
  summary: ScanSummary;
  vulnerabilities: Vulnerability[];
  adversarialFindings: AdversarialFinding[];
  integrityIssues: IntegrityIssue[];
  complianceIssues: ComplianceIssue[];
  riskScore: number; // 0-100
  recommendations: SecurityRecommendation[];
}

export interface ScanSummary {
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  overallStatus: 'secure' | 'at_risk' | 'vulnerable';
}

export interface Vulnerability {
  id: string;
  name: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  location?: string;
  evidence?: string;
  cveId?: string;
  cvssScore?: number;
  remediation: string;
  references: string[];
  detectedAt: string;
}

export interface AdversarialFinding {
  id: string;
  attackType: string;
  successRate: number; // percentage of successful attacks
  averagePerturbation: number;
  maxPerturbation: number;
  vulnerableClasses?: string[];
  sampleInputs: AdversarialSample[];
  robustnessScore: number; // 0-100
  recommendations: string[];
}

export interface AdversarialSample {
  originalInput: any;
  adversarialInput: any;
  originalPrediction: string;
  adversarialPrediction: string;
  perturbationMagnitude: number;
  confidence: number;
}

export interface IntegrityIssue {
  id: string;
  checkType: string;
  expectedValue: string;
  actualValue: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  potentialCause: string;
  remediation: string;
}

export interface ComplianceIssue {
  id: string;
  standard: string;
  requirement: string;
  status: 'compliant' | 'non_compliant' | 'partial';
  description: string;
  evidence?: string;
  remediation: string;
  deadline?: string;
}

export interface SecurityRecommendation {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  implementation: string;
  estimatedEffort: 'low' | 'medium' | 'high';
  references: string[];
}

export interface SecurityPolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  rules: SecurityRule[];
  enforcementMode: 'block' | 'warn' | 'audit';
  applicableModels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SecurityRule {
  id: string;
  name: string;
  type: 'scan_required' | 'vulnerability_threshold' | 'compliance_required' | 'approval_required';
  condition: Record<string, any>;
  action: 'block' | 'warn' | 'require_approval' | 'notify';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface SecurityIncident {
  id: string;
  organizationId: string;
  modelId: string;
  type: IncidentType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'detected' | 'investigating' | 'contained' | 'resolved';
  description: string;
  detectedAt: string;
  resolvedAt?: string;
  affectedSystems: string[];
  impact: string;
  rootCause?: string;
  remediation: string;
  lessonsLearned?: string[];
}

export type IncidentType =
  | 'model_compromise'
  | 'data_breach'
  | 'adversarial_attack'
  | 'unauthorized_access'
  | 'policy_violation';

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const securityScans = new Map<string, SecurityScan>();
const securityPolicies = new Map<string, SecurityPolicy>();
const securityIncidents = new Map<string, SecurityIncident>();

// ─── Service Implementation ───────────────────────────────────────────────────

export function createSecurityScan(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  scanType: ScanType;
  configuration?: Partial<ScanConfiguration>;
  initiatedBy: string;
}): SecurityScan {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultConfig: ScanConfiguration = {
    vulnerabilityChecks: [
      { name: 'Model Injection', category: 'injection', enabled: true, severity: 'high' },
      { name: 'Data Leakage', category: 'data_leakage', enabled: true, severity: 'critical' },
      { name: 'Model Extraction', category: 'model_extraction', enabled: true, severity: 'high' },
      { name: 'Evasion Attacks', category: 'evasion', enabled: true, severity: 'medium' },
      { name: 'Data Poisoning', category: 'poisoning', enabled: true, severity: 'critical' },
    ],
    adversarialTests: [
      { name: 'FGSM Attack', attackType: 'fgsm', epsilon: 0.1, iterations: 1, enabled: true },
      { name: 'PGD Attack', attackType: 'pgd', epsilon: 0.3, iterations: 10, enabled: true },
      { name: 'CW Attack', attackType: 'cw', epsilon: 0.5, iterations: 100, enabled: true },
    ],
    integrityChecks: [
      { name: 'Model Weights Hash', checkType: 'weights_hash', enabled: true },
      { name: 'Config Hash', checkType: 'config_hash', enabled: true },
    ],
    complianceStandards: ['OWASP_ML_Top_10', 'NIST_AI_RMF'],
    severityThreshold: 'medium',
    timeout: 3600,
    parallelExecution: true,
  };

  const scan: SecurityScan = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    scanType: params.scanType,
    status: 'pending',
    configuration: { ...defaultConfig, ...params.configuration },
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    initiatedBy: params.initiatedBy,
  };

  securityScans.set(id, scan);
  return scan;
}

export function getSecurityScan(id: string): SecurityScan | undefined {
  return securityScans.get(id);
}

export function listSecurityScans(
  organizationId: string,
  filters?: { modelId?: string; scanType?: ScanType; status?: ScanStatus }
): SecurityScan[] {
  let result = Array.from(securityScans.values()).filter(
    s => s.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(s => s.modelId === filters.modelId);
  if (filters?.scanType) result = result.filter(s => s.scanType === filters.scanType);
  if (filters?.status) result = result.filter(s => s.status === filters.status);

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function startSecurityScan(scanId: string): SecurityScan {
  const scan = securityScans.get(scanId);
  if (!scan) throw new Error(`Security scan ${scanId} not found`);
  if (scan.status !== 'pending') throw new Error('Scan is not in pending status');

  scan.status = 'running';
  scan.updatedAt = new Date().toISOString();
  return scan;
}

export function completeSecurityScan(
  scanId: string,
  results: {
    vulnerabilities: Omit<Vulnerability, 'id' | 'detectedAt'>[];
    adversarialFindings: Omit<AdversarialFinding, 'id'>[];
    integrityIssues: Omit<IntegrityIssue, 'id'>[];
    complianceIssues: Omit<ComplianceIssue, 'id'>[];
  }
): SecurityScan {
  const scan = securityScans.get(scanId);
  if (!scan) throw new Error(`Security scan ${scanId} not found`);
  if (scan.status !== 'running') throw new Error('Scan is not running');

  const now = new Date().toISOString();

  const vulnerabilities: Vulnerability[] = results.vulnerabilities.map(v => ({
    ...v,
    id: randomUUID(),
    detectedAt: now,
  }));

  const adversarialFindings: AdversarialFinding[] = results.adversarialFindings.map(f => ({
    ...f,
    id: randomUUID(),
  }));

  const integrityIssues: IntegrityIssue[] = results.integrityIssues.map(i => ({
    ...i,
    id: randomUUID(),
  }));

  const complianceIssues: ComplianceIssue[] = results.complianceIssues.map(c => ({
    ...c,
    id: randomUUID(),
  }));

  const criticalFindings = vulnerabilities.filter(v => v.severity === 'critical').length;
  const highFindings = vulnerabilities.filter(v => v.severity === 'high').length;
  const mediumFindings = vulnerabilities.filter(v => v.severity === 'medium').length;
  const lowFindings = vulnerabilities.filter(v => v.severity === 'low').length;

  const totalChecks = vulnerabilities.length + adversarialFindings.length + 
                      integrityIssues.length + complianceIssues.length;
  const failedChecks = vulnerabilities.length + integrityIssues.length + 
                       complianceIssues.filter(c => c.status === 'non_compliant').length;

  const overallStatus = criticalFindings > 0 || highFindings > 2 ? 'vulnerable' :
                        highFindings > 0 || mediumFindings > 5 ? 'at_risk' : 'secure';

  const riskScore = Math.min(100, 
    criticalFindings * 25 + 
    highFindings * 15 + 
    mediumFindings * 5 + 
    lowFindings * 1 +
    integrityIssues.length * 20 +
    complianceIssues.filter(c => c.status === 'non_compliant').length * 10
  );

  const recommendations: SecurityRecommendation[] = [];

  if (criticalFindings > 0) {
    recommendations.push({
      id: randomUUID(),
      priority: 'critical',
      category: 'vulnerability',
      title: 'Address Critical Vulnerabilities Immediately',
      description: `${criticalFindings} critical vulnerabilities detected that require immediate attention`,
      implementation: 'Review and remediate all critical vulnerabilities before deployment',
      estimatedEffort: 'high',
      references: ['https://owasp.org/www-project-machine-learning-security-top-10/'],
    });
  }

  if (adversarialFindings.some(f => f.successRate > 50)) {
    recommendations.push({
      id: randomUUID(),
      priority: 'high',
      category: 'adversarial',
      title: 'Improve Model Robustness',
      description: 'Model is vulnerable to adversarial attacks with high success rate',
      implementation: 'Apply adversarial training, input validation, or defensive distillation',
      estimatedEffort: 'high',
      references: ['https://arxiv.org/abs/1412.6572'],
    });
  }

  if (integrityIssues.length > 0) {
    recommendations.push({
      id: randomUUID(),
      priority: 'critical',
      category: 'integrity',
      title: 'Verify Model Integrity',
      description: `${integrityIssues.length} integrity issues detected - model may be compromised`,
      implementation: 'Re-download model from trusted source and verify checksums',
      estimatedEffort: 'medium',
      references: [],
    });
  }

  scan.results = {
    summary: {
      totalChecks,
      passedChecks: totalChecks - failedChecks,
      failedChecks,
      criticalFindings,
      highFindings,
      mediumFindings,
      lowFindings,
      overallStatus,
    },
    vulnerabilities,
    adversarialFindings,
    integrityIssues,
    complianceIssues,
    riskScore,
    recommendations,
  };

  scan.status = 'completed';
  scan.completedAt = now;
  scan.duration = new Date(now).getTime() - new Date(scan.startedAt).getTime();
  scan.updatedAt = now;

  return scan;
}

export function cancelSecurityScan(scanId: string): SecurityScan {
  const scan = securityScans.get(scanId);
  if (!scan) throw new Error(`Security scan ${scanId} not found`);

  scan.status = 'cancelled';
  scan.updatedAt = new Date().toISOString();
  return scan;
}

export function createSecurityPolicy(params: {
  organizationId: string;
  name: string;
  description: string;
  rules: Omit<SecurityRule, 'id'>[];
  enforcementMode: 'block' | 'warn' | 'audit';
  applicableModels?: string[];
}): SecurityPolicy {
  const now = new Date().toISOString();
  const id = randomUUID();

  const policy: SecurityPolicy = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    rules: params.rules.map(r => ({ ...r, id: randomUUID() })),
    enforcementMode: params.enforcementMode,
    applicableModels: params.applicableModels || [],
    createdAt: now,
    updatedAt: now,
  };

  securityPolicies.set(id, policy);
  return policy;
}

export function getSecurityPolicy(id: string): SecurityPolicy | undefined {
  return securityPolicies.get(id);
}

export function listSecurityPolicies(organizationId: string): SecurityPolicy[] {
  return Array.from(securityPolicies.values())
    .filter(p => p.organizationId === organizationId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function updateSecurityPolicy(
  policyId: string,
  updates: Partial<SecurityPolicy>
): SecurityPolicy {
  const policy = securityPolicies.get(policyId);
  if (!policy) throw new Error(`Security policy ${policyId} not found`);

  Object.assign(policy, updates, { updatedAt: new Date().toISOString() });
  return policy;
}

export function evaluateSecurityPolicy(
  policyId: string,
  modelId: string,
  scanId?: string
): {
  compliant: boolean;
  violations: Array<{
    rule: SecurityRule;
    reason: string;
    action: string;
  }>;
} {
  const policy = securityPolicies.get(policyId);
  if (!policy) throw new Error(`Security policy ${policyId} not found`);

  const violations: Array<{
    rule: SecurityRule;
    reason: string;
    action: string;
  }> = [];

  for (const rule of policy.rules) {
    let violated = false;
    let reason = '';

    switch (rule.type) {
      case 'scan_required':
        if (!scanId) {
          violated = true;
          reason = 'Security scan is required before deployment';
        }
        break;
      case 'vulnerability_threshold':
        if (scanId) {
          const scan = securityScans.get(scanId);
          if (scan?.results) {
            const maxSeverity = rule.condition.maxSeverity || 'high';
            const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
            const threshold = severityOrder[maxSeverity as keyof typeof severityOrder];
            
            const highSeverityVulns = scan.results.vulnerabilities.filter(
              v => severityOrder[v.severity] >= threshold
            );
            
            if (highSeverityVulns.length > 0) {
              violated = true;
              reason = `${highSeverityVulns.length} vulnerabilities exceed severity threshold`;
            }
          }
        }
        break;
      case 'compliance_required':
        if (scanId) {
          const scan = securityScans.get(scanId);
          if (scan?.results) {
            const nonCompliant = scan.results.complianceIssues.filter(
              c => c.status === 'non_compliant'
            );
            if (nonCompliant.length > 0) {
              violated = true;
              reason = `${nonCompliant.length} compliance requirements not met`;
            }
          }
        }
        break;
    }

    if (violated) {
      violations.push({
        rule,
        reason,
        action: rule.action,
      });
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
  };
}

export function reportSecurityIncident(params: {
  organizationId: string;
  modelId: string;
  type: IncidentType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedSystems: string[];
  impact: string;
  remediation: string;
}): SecurityIncident {
  const now = new Date().toISOString();
  const id = randomUUID();

  const incident: SecurityIncident = {
    id,
    organizationId: params.organizationId,
    modelId: params.modelId,
    type: params.type,
    severity: params.severity,
    status: 'detected',
    description: params.description,
    detectedAt: now,
    affectedSystems: params.affectedSystems,
    impact: params.impact,
    remediation: params.remediation,
  };

  securityIncidents.set(id, incident);
  return incident;
}

export function getSecurityIncident(id: string): SecurityIncident | undefined {
  return securityIncidents.get(id);
}

export function listSecurityIncidents(
  organizationId: string,
  filters?: { modelId?: string; status?: SecurityIncident['status']; severity?: SecurityIncident['severity'] }
): SecurityIncident[] {
  let result = Array.from(securityIncidents.values()).filter(
    i => i.organizationId === organizationId
  );

  if (filters?.modelId) result = result.filter(i => i.modelId === filters.modelId);
  if (filters?.status) result = result.filter(i => i.status === filters.status);
  if (filters?.severity) result = result.filter(i => i.severity === filters.severity);

  return result.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}

export function updateSecurityIncident(
  incidentId: string,
  updates: Partial<SecurityIncident>
): SecurityIncident {
  const incident = securityIncidents.get(incidentId);
  if (!incident) throw new Error(`Security incident ${incidentId} not found`);

  Object.assign(incident, updates);
  
  if (updates.status === 'resolved' && !incident.resolvedAt) {
    incident.resolvedAt = new Date().toISOString();
  }

  return incident;
}

export function getSecurityScanResults(scanId: string): ScanResults | undefined {
  const scan = securityScans.get(scanId);
  if (!scan) throw new Error(`Security scan ${scanId} not found`);
  return scan.results;
}

export function getVulnerabilitiesBySeverity(
  scanId: string,
  severity: 'low' | 'medium' | 'high' | 'critical'
): Vulnerability[] {
  const scan = securityScans.get(scanId);
  if (!scan || !scan.results) throw new Error(`Security scan ${scanId} not found or incomplete`);

  return scan.results.vulnerabilities.filter(v => v.severity === severity);
}
