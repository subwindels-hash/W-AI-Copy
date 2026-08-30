/**
 * Module 63: AI Compliance Automation Service
 *
 * Provides automated compliance checking for AI regulations including EU AI Act,
 * NIST AI Risk Management Framework, and ISO 42001. Generates regulatory reports,
 * manages compliance audit trails, and tracks compliance status across frameworks.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ComplianceFramework {
  id: string;
  name: string;
  version: string;
  description: string;
  jurisdiction: string;
  requirements: ComplianceRequirement[];
  effectiveDate: string;
  lastUpdated: string;
}

export interface ComplianceRequirement {
  id: string;
  code: string;
  title: string;
  description: string;
  category: RequirementCategory;
  riskLevel: 'minimal' | 'limited' | 'high' | 'unacceptable';
  controls: ComplianceControl[];
  evidence: EvidenceRequirement[];
  mandatory: boolean;
}

export type RequirementCategory =
  | 'transparency'
  | 'fairness'
  | 'accountability'
  | 'privacy'
  | 'security'
  | 'robustness'
  | 'human-oversight'
  | 'documentation'
  | 'risk-management';

export interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  implementation: string;
  automated: boolean;
  checkType: 'automated' | 'manual' | 'hybrid';
}

export interface EvidenceRequirement {
  id: string;
  type: 'document' | 'log' | 'test-result' | 'certification' | 'audit-trail';
  description: string;
  retentionPeriod: number; // days
  format?: string;
}

export interface ComplianceAssessment {
  id: string;
  organizationId: string;
  frameworkId: string;
  frameworkName: string;
  modelId?: string;
  modelName?: string;
  status: 'in-progress' | 'completed' | 'failed' | 'expired';
  overallScore: number; // 0-100
  complianceLevel: 'compliant' | 'partially-compliant' | 'non-compliant' | 'not-assessed';
  requirementResults: RequirementAssessment[];
  gaps: ComplianceGap[];
  recommendations: string[];
  assessorId: string;
  assessorName: string;
  startedAt: string;
  completedAt?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface RequirementAssessment {
  requirementId: string;
  requirementCode: string;
  requirementTitle: string;
  status: 'compliant' | 'partially-compliant' | 'non-compliant' | 'not-applicable' | 'not-assessed';
  score: number; // 0-100
  evidence: EvidenceItem[];
  findings: string[];
  controls: ControlAssessment[];
  lastAssessed: string;
  notes?: string;
}

export interface ControlAssessment {
  controlId: string;
  controlName: string;
  status: 'implemented' | 'partially-implemented' | 'not-implemented' | 'not-applicable';
  automated: boolean;
  lastChecked?: string;
  evidence?: string;
}

export interface EvidenceItem {
  id: string;
  type: EvidenceRequirement['type'];
  title: string;
  description: string;
  url?: string;
  content?: string;
  uploadedBy: string;
  uploadedAt: string;
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface ComplianceGap {
  id: string;
  requirementId: string;
  requirementCode: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: string;
  remediationPlan: string;
  estimatedEffort: string;
  targetDate?: string;
  status: 'open' | 'in-progress' | 'resolved' | 'accepted-risk';
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceReport {
  id: string;
  organizationId: string;
  reportType: 'regulatory' | 'internal' | 'audit' | 'executive-summary';
  frameworkId: string;
  frameworkName: string;
  title: string;
  period: { start: string; end: string };
  executiveSummary: string;
  complianceScore: number;
  complianceLevel: ComplianceAssessment['complianceLevel'];
  keyFindings: ReportFinding[];
  recommendations: string[];
  appendices: ReportAppendix[];
  generatedBy: string;
  generatedAt: string;
  format: 'pdf' | 'html' | 'json';
}

export interface ReportFinding {
  id: string;
  category: RequirementCategory;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  evidence: string[];
}

export interface ReportAppendix {
  id: string;
  title: string;
  content: string;
  type: 'data' | 'evidence' | 'methodology' | 'references';
}

export interface ComplianceAuditLog {
  id: string;
  organizationId: string;
  action: ComplianceAuditAction;
  resourceType: 'assessment' | 'requirement' | 'evidence' | 'gap' | 'report' | 'framework';
  resourceId: string;
  resourceName: string;
  userId: string;
  userName: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  timestamp: string;
}

export type ComplianceAuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'assessed'
  | 'verified'
  | 'exported'
  | 'approved'
  | 'rejected';

export interface ComplianceDashboard {
  organizationId: string;
  frameworks: FrameworkCompliance[];
  overallCompliance: number;
  trend: 'improving' | 'stable' | 'declining';
  criticalGaps: number;
  upcomingDeadlines: Deadline[];
  recentActivities: ComplianceAuditLog[];
}

export interface FrameworkCompliance {
  frameworkId: string;
  frameworkName: string;
  complianceScore: number;
  complianceLevel: ComplianceAssessment['complianceLevel'];
  totalRequirements: number;
  compliantRequirements: number;
  lastAssessed: string;
  nextAssessment: string;
}

export interface Deadline {
  id: string;
  title: string;
  frameworkId: string;
  frameworkName: string;
  dueDate: string;
  daysRemaining: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const frameworks = new Map<string, ComplianceFramework>();
const assessments = new Map<string, ComplianceAssessment>();
const reports = new Map<string, ComplianceReport>();
const auditLogs = new Map<string, ComplianceAuditLog>();

// ─── Framework Management ──────────────────────────────────────────────────────

/**
 * Initialize built-in compliance frameworks
 */
export async function initializeFrameworks(): Promise<void> {
  // EU AI Act
  const euAIAct: ComplianceFramework = {
    id: 'framework_eu_ai_act',
    name: 'EU AI Act',
    version: '2024.1',
    description: 'European Union Artificial Intelligence Act - Comprehensive regulatory framework for AI systems',
    jurisdiction: 'European Union',
    effectiveDate: '2024-08-01',
    lastUpdated: new Date().toISOString(),
    requirements: [
      {
        id: 'req_eu_001',
        code: 'EU-AI-001',
        title: 'Risk Classification',
        description: 'AI systems must be classified according to risk level (minimal, limited, high, unacceptable)',
        category: 'risk-management',
        riskLevel: 'high',
        mandatory: true,
        controls: [
          {
            id: 'ctrl_eu_001_1',
            name: 'Risk Assessment Process',
            description: 'Implement systematic risk assessment for all AI systems',
            implementation: 'Use standardized risk classification matrix',
            automated: false,
            checkType: 'manual',
          },
        ],
        evidence: [
          {
            id: 'ev_eu_001_1',
            type: 'document',
            description: 'Risk classification documentation',
            retentionPeriod: 3650, // 10 years
          },
        ],
      },
      {
        id: 'req_eu_002',
        code: 'EU-AI-002',
        title: 'Transparency Requirements',
        description: 'Users must be informed when interacting with AI systems',
        category: 'transparency',
        riskLevel: 'limited',
        mandatory: true,
        controls: [
          {
            id: 'ctrl_eu_002_1',
            name: 'AI Disclosure',
            description: 'Clearly disclose AI system usage to users',
            implementation: 'Display AI disclosure banner or notification',
            automated: true,
            checkType: 'automated',
          },
        ],
        evidence: [
          {
            id: 'ev_eu_002_1',
            type: 'document',
            description: 'User interface screenshots showing AI disclosure',
            retentionPeriod: 1825, // 5 years
          },
        ],
      },
      {
        id: 'req_eu_003',
        code: 'EU-AI-003',
        title: 'Human Oversight',
        description: 'High-risk AI systems must have appropriate human oversight mechanisms',
        category: 'human-oversight',
        riskLevel: 'high',
        mandatory: true,
        controls: [
          {
            id: 'ctrl_eu_003_1',
            name: 'Human-in-the-Loop',
            description: 'Implement human review for critical decisions',
            implementation: 'Require human approval for high-impact AI decisions',
            automated: false,
            checkType: 'hybrid',
          },
        ],
        evidence: [
          {
            id: 'ev_eu_003_1',
            type: 'log',
            description: 'Audit logs of human oversight activities',
            retentionPeriod: 3650,
          },
        ],
      },
    ],
  };

  // NIST AI RMF
  const nistAIRMF: ComplianceFramework = {
    id: 'framework_nist_ai_rmf',
    name: 'NIST AI Risk Management Framework',
    version: '1.0',
    description: 'National Institute of Standards and Technology AI Risk Management Framework',
    jurisdiction: 'United States',
    effectiveDate: '2023-01-26',
    lastUpdated: new Date().toISOString(),
    requirements: [
      {
        id: 'req_nist_001',
        code: 'NIST-GOVERN-1.1',
        title: 'AI Risk Governance',
        description: 'Establish governance structures for AI risk management',
        category: 'accountability',
        riskLevel: 'high',
        mandatory: true,
        controls: [
          {
            id: 'ctrl_nist_001_1',
            name: 'Governance Policy',
            description: 'Document AI governance policies and procedures',
            implementation: 'Create and maintain AI governance documentation',
            automated: false,
            checkType: 'manual',
          },
        ],
        evidence: [
          {
            id: 'ev_nist_001_1',
            type: 'document',
            description: 'AI governance policy document',
            retentionPeriod: 2555, // 7 years
          },
        ],
      },
      {
        id: 'req_nist_002',
        code: 'NIST-MAP-1.1',
        title: 'AI Context Mapping',
        description: 'Map the context and intended use of AI systems',
        category: 'risk-management',
        riskLevel: 'high',
        mandatory: true,
        controls: [
          {
            id: 'ctrl_nist_002_1',
            name: 'Context Documentation',
            description: 'Document AI system context, stakeholders, and use cases',
            implementation: 'Maintain context documentation for each AI system',
            automated: false,
            checkType: 'manual',
          },
        ],
        evidence: [
          {
            id: 'ev_nist_002_1',
            type: 'document',
            description: 'AI system context documentation',
            retentionPeriod: 2555,
          },
        ],
      },
    ],
  };

  // ISO 42001
  const iso42001: ComplianceFramework = {
    id: 'framework_iso_42001',
    name: 'ISO/IEC 42001',
    version: '2023',
    description: 'ISO/IEC 42001 - Artificial Intelligence Management System',
    jurisdiction: 'International',
    effectiveDate: '2023-12-01',
    lastUpdated: new Date().toISOString(),
    requirements: [
      {
        id: 'req_iso_001',
        code: 'ISO-42001-4.1',
        title: 'Understanding the Organization and Context',
        description: 'Determine external and internal issues relevant to AI management system',
        category: 'risk-management',
        riskLevel: 'high',
        mandatory: true,
        controls: [
          {
            id: 'ctrl_iso_001_1',
            name: 'Context Analysis',
            description: 'Conduct analysis of organizational context for AI',
            implementation: 'Document internal and external factors affecting AI systems',
            automated: false,
            checkType: 'manual',
          },
        ],
        evidence: [
          {
            id: 'ev_iso_001_1',
            type: 'document',
            description: 'Organizational context analysis document',
            retentionPeriod: 2190, // 6 years
          },
        ],
      },
      {
        id: 'req_iso_002',
        code: 'ISO-42001-6.1',
        title: 'Actions to Address Risks and Opportunities',
        description: 'Plan actions to address AI risks and opportunities',
        category: 'risk-management',
        riskLevel: 'high',
        mandatory: true,
        controls: [
          {
            id: 'ctrl_iso_002_1',
            name: 'Risk Treatment Plan',
            description: 'Develop and implement risk treatment plans',
            implementation: 'Create risk register and treatment plans',
            automated: false,
            checkType: 'manual',
          },
        ],
        evidence: [
          {
            id: 'ev_iso_002_1',
            type: 'document',
            description: 'AI risk treatment plan',
            retentionPeriod: 2190,
          },
        ],
      },
    ],
  };

  frameworks.set(euAIAct.id, euAIAct);
  frameworks.set(nistAIRMF.id, nistAIRMF);
  frameworks.set(iso42001.id, iso42001);
}

/**
 * Get framework by ID
 */
export async function getFramework(frameworkId: string): Promise<ComplianceFramework | null> {
  return frameworks.get(frameworkId) || null;
}

/**
 * List all frameworks
 */
export async function listFrameworks(): Promise<ComplianceFramework[]> {
  return Array.from(frameworks.values());
}

// ─── Compliance Assessment ─────────────────────────────────────────────────────

/**
 * Create a compliance assessment
 */
export async function createAssessment(
  organizationId: string,
  frameworkId: string,
  modelId: string | undefined,
  modelName: string | undefined,
  assessorId: string,
  assessorName: string
): Promise<ComplianceAssessment> {
  const framework = frameworks.get(frameworkId);
  if (!framework) {
    throw new Error(`Framework ${frameworkId} not found`);
  }

  const id = `assessment_${randomUUID()}`;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year

  const requirementResults: RequirementAssessment[] = framework.requirements.map((req) => ({
    requirementId: req.id,
    requirementCode: req.code,
    requirementTitle: req.title,
    status: 'not-assessed',
    score: 0,
    evidence: [],
    findings: [],
    controls: req.controls.map((ctrl) => ({
      controlId: ctrl.id,
      controlName: ctrl.name,
      status: 'not-implemented',
      automated: ctrl.automated,
    })),
    lastAssessed: now,
  }));

  const assessment: ComplianceAssessment = {
    id,
    organizationId,
    frameworkId,
    frameworkName: framework.name,
    modelId,
    modelName,
    status: 'in-progress',
    overallScore: 0,
    complianceLevel: 'not-assessed',
    requirementResults,
    gaps: [],
    recommendations: [],
    assessorId,
    assessorName,
    startedAt: now,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };

  assessments.set(id, assessment);
  await logAudit(organizationId, 'created', 'assessment', id, assessment.frameworkName, assessorId, assessorName);

  return assessment;
}

/**
 * Update requirement assessment
 */
export async function updateRequirementAssessment(
  assessmentId: string,
  requirementId: string,
  updates: {
    status: RequirementAssessment['status'];
    score: number;
    findings?: string[];
    evidence?: EvidenceItem[];
    notes?: string;
  },
  userId: string,
  userName: string
): Promise<ComplianceAssessment | null> {
  const assessment = assessments.get(assessmentId);
  if (!assessment) return null;

  const reqIndex = assessment.requirementResults.findIndex((r) => r.requirementId === requirementId);
  if (reqIndex === -1) return null;

  assessment.requirementResults[reqIndex] = {
    ...assessment.requirementResults[reqIndex],
    ...updates,
    lastAssessed: new Date().toISOString(),
  };

  // Recalculate overall score
  const assessedReqs = assessment.requirementResults.filter((r) => r.status !== 'not-assessed' && r.status !== 'not-applicable');
  if (assessedReqs.length > 0) {
    assessment.overallScore = Math.round(
      assessedReqs.reduce((sum, r) => sum + r.score, 0) / assessedReqs.length
    );
  }

  // Determine compliance level
  if (assessment.overallScore >= 90) {
    assessment.complianceLevel = 'compliant';
  } else if (assessment.overallScore >= 70) {
    assessment.complianceLevel = 'partially-compliant';
  } else if (assessedReqs.length > 0) {
    assessment.complianceLevel = 'non-compliant';
  }

  assessment.updatedAt = new Date().toISOString();
  assessments.set(assessmentId, assessment);

  await logAudit(organizationIdFromAssessment(assessment), 'assessed', 'requirement', requirementId, assessment.requirementResults[reqIndex].requirementTitle, userId, userName, updates);

  return assessment;
}

/**
 * Complete assessment
 */
export async function completeAssessment(
  assessmentId: string,
  recommendations: string[],
  userId: string,
  userName: string
): Promise<ComplianceAssessment | null> {
  const assessment = assessments.get(assessmentId);
  if (!assessment) return null;

  assessment.status = 'completed';
  assessment.completedAt = new Date().toISOString();
  assessment.recommendations = recommendations;
  assessment.updatedAt = new Date().toISOString();

  assessments.set(assessmentId, assessment);
  await logAudit(organizationIdFromAssessment(assessment), 'updated', 'assessment', assessmentId, assessment.frameworkName, userId, userName, { status: 'completed' });

  return assessment;
}

/**
 * Get assessment by ID
 */
export async function getAssessment(assessmentId: string): Promise<ComplianceAssessment | null> {
  return assessments.get(assessmentId) || null;
}

/**
 * List assessments for an organization
 */
export async function listAssessments(
  organizationId: string,
  filters?: {
    frameworkId?: string;
    modelId?: string;
    status?: ComplianceAssessment['status'];
  }
): Promise<ComplianceAssessment[]> {
  const allAssessments = Array.from(assessments.values()).filter(
    (a) => a.organizationId === organizationId
  );

  return allAssessments.filter((a) => {
    if (filters?.frameworkId && a.frameworkId !== filters.frameworkId) return false;
    if (filters?.modelId && a.modelId !== filters.modelId) return false;
    if (filters?.status && a.status !== filters.status) return false;
    return true;
  });
}

// ─── Gap Management ────────────────────────────────────────────────────────────

/**
 * Add compliance gap
 */
export async function addComplianceGap(
  assessmentId: string,
  gap: Omit<ComplianceGap, 'id' | 'createdAt' | 'updatedAt'>,
  userId: string,
  userName: string
): Promise<ComplianceGap | null> {
  const assessment = assessments.get(assessmentId);
  if (!assessment) return null;

  const id = `gap_${randomUUID()}`;
  const now = new Date().toISOString();

  const newGap: ComplianceGap = {
    ...gap,
    id,
    createdAt: now,
    updatedAt: now,
  };

  assessment.gaps.push(newGap);
  assessment.updatedAt = now;
  assessments.set(assessmentId, assessment);

  await logAudit(organizationIdFromAssessment(assessment), 'created', 'gap', id, gap.title, userId, userName);

  return newGap;
}

/**
 * Update compliance gap
 */
export async function updateComplianceGap(
  assessmentId: string,
  gapId: string,
  updates: Partial<Omit<ComplianceGap, 'id' | 'createdAt'>>,
  userId: string,
  userName: string
): Promise<ComplianceGap | null> {
  const assessment = assessments.get(assessmentId);
  if (!assessment) return null;

  const gapIndex = assessment.gaps.findIndex((g) => g.id === gapId);
  if (gapIndex === -1) return null;

  assessment.gaps[gapIndex] = {
    ...assessment.gaps[gapIndex],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  assessment.updatedAt = new Date().toISOString();
  assessments.set(assessmentId, assessment);

  await logAudit(organizationIdFromAssessment(assessment), 'updated', 'gap', gapId, assessment.gaps[gapIndex].title, userId, userName, updates);

  return assessment.gaps[gapIndex];
}

// ─── Report Generation ─────────────────────────────────────────────────────────

/**
 * Generate compliance report
 */
export async function generateComplianceReport(
  organizationId: string,
  assessmentId: string,
  reportType: ComplianceReport['reportType'],
  generatedBy: string,
  format: ComplianceReport['format'] = 'json'
): Promise<ComplianceReport | null> {
  const assessment = assessments.get(assessmentId);
  if (!assessment) return null;

  const id = `report_${randomUUID()}`;
  const now = new Date().toISOString();

  const keyFindings: ReportFinding[] = assessment.requirementResults
    .filter((r) => r.status === 'non-compliant' || r.status === 'partially-compliant')
    .map((r) => ({
      id: `finding_${randomUUID()}`,
      category: 'risk-management', // Would need to map from requirement
      severity: r.score < 50 ? 'high' : 'medium',
      title: r.requirementTitle,
      description: r.findings.join('; '),
      impact: 'Potential regulatory non-compliance',
      recommendation: 'Address identified gaps and implement required controls',
      evidence: r.evidence.map((e) => e.title),
    }));

  const report: ComplianceReport = {
    id,
    organizationId,
    reportType,
    frameworkId: assessment.frameworkId,
    frameworkName: assessment.frameworkName,
    title: `${assessment.frameworkName} Compliance Report - ${assessment.modelName || 'Organization'}`,
    period: {
      start: assessment.startedAt,
      end: assessment.completedAt || now,
    },
    executiveSummary: generateExecutiveSummary(assessment),
    complianceScore: assessment.overallScore,
    complianceLevel: assessment.complianceLevel,
    keyFindings,
    recommendations: assessment.recommendations,
    appendices: [],
    generatedBy,
    generatedAt: now,
    format,
  };

  reports.set(id, report);
  await logAudit(organizationId, 'created', 'report', id, report.title, generatedBy, generatedBy);

  return report;
}

/**
 * Generate executive summary text
 */
function generateExecutiveSummary(assessment: ComplianceAssessment): string {
  const compliantCount = assessment.requirementResults.filter((r) => r.status === 'compliant').length;
  const totalCount = assessment.requirementResults.filter((r) => r.status !== 'not-applicable').length;
  const gapCount = assessment.gaps.filter((g) => g.status === 'open').length;

  return `This compliance assessment evaluated ${assessment.modelName || 'the organization'} against ${assessment.frameworkName}. ` +
    `The overall compliance score is ${assessment.overallScore}% with a compliance level of ${assessment.complianceLevel}. ` +
    `${compliantCount} out of ${totalCount} requirements are fully compliant. ` +
    `${gapCount} compliance gaps have been identified and require remediation. ` +
    `Key recommendations include addressing high-severity gaps and implementing missing controls.`;
}

/**
 * Get report by ID
 */
export async function getReport(reportId: string): Promise<ComplianceReport | null> {
  return reports.get(reportId) || null;
}

/**
 * List reports for an organization
 */
export async function listReports(
  organizationId: string,
  filters?: { frameworkId?: string; reportType?: ComplianceReport['reportType'] }
): Promise<ComplianceReport[]> {
  const allReports = Array.from(reports.values()).filter(
    (r) => r.organizationId === organizationId
  );

  return allReports.filter((r) => {
    if (filters?.frameworkId && r.frameworkId !== filters.frameworkId) return false;
    if (filters?.reportType && r.reportType !== filters.reportType) return false;
    return true;
  });
}

// ─── Audit Trail ───────────────────────────────────────────────────────────────

/**
 * Log audit event
 */
async function logAudit(
  organizationId: string,
  action: ComplianceAuditAction,
  resourceType: ComplianceAuditLog['resourceType'],
  resourceId: string,
  resourceName: string,
  userId: string,
  userName: string,
  changes?: Record<string, any>
): Promise<void> {
  const id = `audit_${randomUUID()}`;
  const log: ComplianceAuditLog = {
    id,
    organizationId,
    action,
    resourceType,
    resourceId,
    resourceName,
    userId,
    userName,
    changes,
    timestamp: new Date().toISOString(),
  };

  auditLogs.set(id, log);
}

/**
 * Get audit logs for an organization
 */
export async function getAuditLogs(
  organizationId: string,
  filters?: {
    resourceType?: ComplianceAuditLog['resourceType'];
    action?: ComplianceAuditAction;
    startDate?: string;
    endDate?: string;
  }
): Promise<ComplianceAuditLog[]> {
  const allLogs = Array.from(auditLogs.values()).filter(
    (l) => l.organizationId === organizationId
  );

  return allLogs.filter((l) => {
    if (filters?.resourceType && l.resourceType !== filters.resourceType) return false;
    if (filters?.action && l.action !== filters.action) return false;
    if (filters?.startDate && l.timestamp < filters.startDate) return false;
    if (filters?.endDate && l.timestamp > filters.endDate) return false;
    return true;
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

/**
 * Get compliance dashboard
 */
export async function getComplianceDashboard(organizationId: string): Promise<ComplianceDashboard> {
  const orgAssessments = await listAssessments(organizationId);
  const orgLogs = await getAuditLogs(organizationId);

  const frameworkCompliance: FrameworkCompliance[] = [];
  const frameworkMap = new Map<string, ComplianceAssessment[]>();

  orgAssessments.forEach((a) => {
    if (!frameworkMap.has(a.frameworkId)) {
      frameworkMap.set(a.frameworkId, []);
    }
    frameworkMap.get(a.frameworkId)!.push(a);
  });

  frameworkMap.forEach((assessments, frameworkId) => {
    const latest = assessments.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const framework = frameworks.get(frameworkId);

    if (framework) {
      frameworkCompliance.push({
        frameworkId,
        frameworkName: framework.name,
        complianceScore: latest.overallScore,
        complianceLevel: latest.complianceLevel,
        totalRequirements: latest.requirementResults.length,
        compliantRequirements: latest.requirementResults.filter((r) => r.status === 'compliant').length,
        lastAssessed: latest.updatedAt,
        nextAssessment: latest.expiresAt,
      });
    }
  });

  const overallCompliance = frameworkCompliance.length > 0
    ? Math.round(frameworkCompliance.reduce((sum, f) => sum + f.complianceScore, 0) / frameworkCompliance.length)
    : 0;

  const criticalGaps = orgAssessments.reduce((sum, a) => {
    return sum + a.gaps.filter((g) => g.severity === 'critical' && g.status === 'open').length;
  }, 0);

  const upcomingDeadlines: Deadline[] = frameworkCompliance.map((f) => ({
    id: `deadline_${f.frameworkId}`,
    title: `${f.frameworkName} Reassessment`,
    frameworkId: f.frameworkId,
    frameworkName: f.frameworkName,
    dueDate: f.nextAssessment,
    daysRemaining: Math.ceil((new Date(f.nextAssessment).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    priority: 'medium',
  }));

  return {
    organizationId,
    frameworks: frameworkCompliance,
    overallCompliance,
    trend: 'stable', // Would calculate from historical data
    criticalGaps,
    upcomingDeadlines: upcomingDeadlines.sort((a, b) => a.daysRemaining - b.daysRemaining),
    recentActivities: orgLogs.slice(0, 10),
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function organizationIdFromAssessment(assessment: ComplianceAssessment): string {
  return assessment.organizationId;
}

// Initialize frameworks on module load
initializeFrameworks().catch(console.error);
