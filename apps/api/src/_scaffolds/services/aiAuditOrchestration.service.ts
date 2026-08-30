/**
 * Module 51: AI Audit Orchestration Service
 *
 * Provides comprehensive AI audit orchestration capabilities including
 * audit scope definition, evidence collection, audit trail tracking,
 * audit findings and recommendations, audit reports and certifications.
 *
 * Phase 1 — Critical Gap: AI audit orchestration infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditJobStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

export type AuditType = "comprehensive" | "performance" | "bias" | "safety" | "robustness" | "explainability" | "compliance" | "custom";

export type AuditSeverity = "info" | "low" | "medium" | "high" | "critical";

export type AuditFindingStatus = "open" | "in_progress" | "resolved" | "accepted" | "deferred";

export type AuditReadinessLevel = "not_ready" | "partially_ready" | "mostly_ready" | "ready";

export interface AuditJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: AuditJobStatus;
  auditType: AuditType;
  scope: AuditScope;
  evidence: AuditEvidence[];
  findings: AuditFinding[];
  recommendations: AuditRecommendation[];
  report?: AuditReport;
  certification?: AuditCertification;
  readiness?: AuditReadiness;
  performance: AuditPerformance;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AuditScope {
  modelIds: string[];
  modelVersions?: string[];
  auditAreas: AuditType[];
  timeRange?: {
    start: string;
    end: string;
  };
  dataSources?: string[];
  stakeholders?: string[];
  regulatoryFrameworks?: string[];
  customCriteria?: Record<string, unknown>;
}

export interface AuditEvidence {
  id: string;
  type: "test_result" | "monitoring_data" | "performance_metric" | "bias_report" | "safety_test" | "explainability_report" | "compliance_check" | "audit_log" | "custom";
  title: string;
  description: string;
  source: string;
  data: Record<string, unknown>;
  collectedAt: string;
  collectedBy: string;
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  relevance: "low" | "medium" | "high";
}

export interface AuditFinding {
  id: string;
  type: "performance_issue" | "bias_detected" | "safety_concern" | "robustness_issue" | "explainability_gap" | "compliance_violation" | "best_practice" | "custom";
  severity: AuditSeverity;
  title: string;
  description: string;
  evidence: string[]; // Evidence IDs
  impact: string;
  affectedModels: string[];
  affectedStakeholders?: string[];
  status: AuditFindingStatus;
  remediationPlan?: string;
  remediationOwner?: string;
  remediationDueDate?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
}

export interface AuditRecommendation {
  id: string;
  type: "immediate" | "short_term" | "long_term" | "strategic";
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  rationale: string;
  expectedImpact: string;
  implementationEffort: "low" | "medium" | "high";
  relatedFindings: string[]; // Finding IDs
  status: "pending" | "in_progress" | "completed" | "deferred";
  assignedTo?: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
}

export interface AuditReport {
  id: string;
  auditJobId: string;
  generatedAt: string;
  generatedBy: string;
  executiveSummary: string;
  auditScope: AuditScope;
  methodology: string;
  findings: AuditFinding[];
  recommendations: AuditRecommendation[];
  evidenceSummary: {
    totalEvidence: number;
    verifiedEvidence: number;
    byType: Record<string, number>;
  };
  conclusions: string[];
  limitations: string[];
  appendices?: Array<{
    title: string;
    content: string;
  }>;
}

export interface AuditCertification {
  id: string;
  auditJobId: string;
  certificationType: "compliant" | "conditionally_compliant" | "non_compliant" | "certified" | "not_certified";
  certificationLevel: "full" | "partial" | "conditional";
  overallScore: number; // 0-100
  criteriaResults: Array<{
    criteria: string;
    passed: boolean;
    score: number;
    evidence: string[];
  }>;
  validUntil: string;
  certifyingAuthority: string;
  conditions?: string[];
  issuedAt: string;
}

export interface AuditReadiness {
  overallReadiness: AuditReadinessLevel;
  readinessScore: number; // 0-100
  criteria: Array<{
    criteria: string;
    ready: boolean;
    score: number;
    gaps: string[];
  }>;
  recommendations: string[];
  assessedAt: string;
}

export interface AuditPerformance {
  totalEvidenceCollected: number;
  totalFindings: number;
  totalRecommendations: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  resolvedFindings: number;
  openFindings: number;
  completedRecommendations: number;
  pendingRecommendations: number;
  auditDurationMs: number;
}

export interface AuditStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageAuditScore: number;
  certifiedModels: number;
  conditionallyCertifiedModels: number;
  nonCertifiedModels: number;
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  resolvedFindings: number;
  openFindings: number;
  totalRecommendations: number;
  completedRecommendations: number;
  jobsByType: Record<string, number>;
  jobsByReadiness: Record<string, number>;
  commonFindings: Array<{
    type: string;
    count: number;
  }>;
  averageAuditDuration: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const auditJobs = new Map<string, AuditJob>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create an audit job
 */
export async function createAuditJob(params: {
  organizationId: string;
  name: string;
  description?: string;
  auditType: AuditType;
  scope: AuditScope;
  createdBy: string;
}): Promise<AuditJob> {
  const now = new Date().toISOString();

  const job: AuditJob = {
    id: `audit_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: "pending",
    auditType: params.auditType,
    scope: params.scope,
    evidence: [],
    findings: [],
    recommendations: [],
    performance: {
      totalEvidenceCollected: 0,
      totalFindings: 0,
      totalRecommendations: 0,
      criticalFindings: 0,
      highFindings: 0,
      mediumFindings: 0,
      lowFindings: 0,
      resolvedFindings: 0,
      openFindings: 0,
      completedRecommendations: 0,
      pendingRecommendations: 0,
      auditDurationMs: 0,
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  auditJobs.set(job.id, job);
  return job;
}

/**
 * Start audit job
 */
export async function startAuditJob(jobId: string): Promise<AuditJob | null> {
  const job = auditJobs.get(jobId);
  if (!job) return null;

  if (job.status !== "pending") {
    throw new Error(`Cannot start job in status: ${job.status}`);
  }

  job.status = "in_progress";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  auditJobs.set(jobId, job);

  // Start audit process (simulated)
  await performAudit(jobId);

  return job;
}

/**
 * Complete audit job
 */
export async function completeAuditJob(jobId: string): Promise<AuditJob | null> {
  const job = auditJobs.get(jobId);
  if (!job) return null;

  if (job.status !== "in_progress") {
    throw new Error(`Cannot complete job in status: ${job.status}`);
  }

  // Generate audit report
  job.report = await generateAuditReport(jobId, job.createdBy);

  // Generate certification
  job.certification = await generateAuditCertification(jobId);

  // Assess audit readiness
  job.readiness = await assessAuditReadiness(jobId);

  job.status = "completed";
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;
  job.performance.auditDurationMs = new Date(job.completedAt).getTime() - new Date(job.startedAt!).getTime();

  auditJobs.set(jobId, job);
  return job;
}

/**
 * Cancel audit job
 */
export async function cancelAuditJob(jobId: string): Promise<AuditJob | null> {
  const job = auditJobs.get(jobId);
  if (!job) return null;

  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    throw new Error(`Cannot cancel job in status: ${job.status}`);
  }

  job.status = "cancelled";
  job.updatedAt = new Date().toISOString();

  auditJobs.set(jobId, job);
  return job;
}

/**
 * Get audit job by ID
 */
export async function getAuditJob(jobId: string): Promise<AuditJob | null> {
  return auditJobs.get(jobId) ?? null;
}

/**
 * List audit jobs
 */
export async function listAuditJobs(
  organizationId: string,
  filters?: {
    status?: AuditJobStatus;
    auditType?: AuditType;
    modelId?: string;
    readiness?: AuditReadinessLevel;
    limit?: number;
  }
): Promise<AuditJob[]> {
  let result = Array.from(auditJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(j => j.status === filters.status);
  if (filters?.auditType) result = result.filter(j => j.auditType === filters.auditType);
  if (filters?.modelId) result = result.filter(j => j.scope.modelIds.includes(filters.modelId!));
  if (filters?.readiness) result = result.filter(j => j.readiness?.overallReadiness === filters.readiness);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Add evidence to audit
 */
export async function addAuditEvidence(
  jobId: string,
  evidence: Omit<AuditEvidence, "id" | "collectedAt" | "verified">,
  collectedBy: string
): Promise<AuditEvidence | null> {
  const job = auditJobs.get(jobId);
  if (!job) return null;

  const auditEvidence: AuditEvidence = {
    ...evidence,
    id: `evidence_${randomUUID().slice(0, 8)}`,
    collectedAt: new Date().toISOString(),
    collectedBy,
    verified: false,
  };

  job.evidence.push(auditEvidence);
  job.performance.totalEvidenceCollected++;
  job.updatedAt = auditEvidence.collectedAt;

  auditJobs.set(jobId, job);
  return auditEvidence;
}

/**
 * Verify audit evidence
 */
export async function verifyAuditEvidence(
  jobId: string,
  evidenceId: string,
  verifiedBy: string
): Promise<AuditEvidence | null> {
  const job = auditJobs.get(jobId);
  if (!job) return null;

  const evidence = job.evidence.find(e => e.id === evidenceId);
  if (!evidence) return null;

  evidence.verified = true;
  evidence.verifiedBy = verifiedBy;
  evidence.verifiedAt = new Date().toISOString();

  job.updatedAt = evidence.verifiedAt;
  auditJobs.set(jobId, job);
  return evidence;
}

/**
 * Add audit finding
 */
export async function addAuditFinding(
  jobId: string,
  finding: Omit<AuditFinding, "id" | "status" | "createdAt">
): Promise<AuditFinding | null> {
  const job = auditJobs.get(jobId);
  if (!job) return null;

  const auditFinding: AuditFinding = {
    ...finding,
    id: `finding_${randomUUID().slice(0, 8)}`,
    status: "open",
    createdAt: new Date().toISOString(),
  };

  job.findings.push(auditFinding);
  job.performance.totalFindings++;
  job.performance.openFindings++;

  if (finding.severity === "critical") job.performance.criticalFindings++;
  if (finding.severity === "high") job.performance.highFindings++;
  if (finding.severity === "medium") job.performance.mediumFindings++;
  if (finding.severity === "low" || finding.severity === "info") job.performance.lowFindings++;

  job.updatedAt = auditFinding.createdAt;
  auditJobs.set(jobId, job);
  return auditFinding;
}

/**
 * Update finding status
 */
export async function updateFindingStatus(
  jobId: string,
  findingId: string,
  status: AuditFindingStatus,
  resolvedBy?: string
): Promise<AuditFinding | null> {
  const job = auditJobs.get(jobId);
  if (!job) return null;

  const finding = job.findings.find(f => f.id === findingId);
  if (!finding) return null;

  const previousStatus = finding.status;
  finding.status = status;

  if (status === "resolved") {
    finding.resolvedAt = new Date().toISOString();
    finding.resolvedBy = resolvedBy;
    job.performance.resolvedFindings++;
    if (previousStatus === "open") job.performance.openFindings--;
  }

  job.updatedAt = new Date().toISOString();
  auditJobs.set(jobId, job);
  return finding;
}

/**
 * Add audit recommendation
 */
export async function addAuditRecommendation(
  jobId: string,
  recommendation: Omit<AuditRecommendation, "id" | "status" | "createdAt">
): Promise<AuditRecommendation | null> {
  const job = auditJobs.get(jobId);
  if (!job) return null;

  const auditRecommendation: AuditRecommendation = {
    ...recommendation,
    id: `recommendation_${randomUUID().slice(0, 8)}`,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  job.recommendations.push(auditRecommendation);
  job.performance.totalRecommendations++;
  job.performance.pendingRecommendations++;

  job.updatedAt = auditRecommendation.createdAt;
  auditJobs.set(jobId, job);
  return auditRecommendation;
}

/**
 * Update recommendation status
 */
export async function updateRecommendationStatus(
  jobId: string,
  recommendationId: string,
  status: AuditRecommendation["status"]
): Promise<AuditRecommendation | null> {
  const job = auditJobs.get(jobId);
  if (!job) return null;

  const recommendation = job.recommendations.find(r => r.id === recommendationId);
  if (!recommendation) return null;

  recommendation.status = status;
  if (status === "completed") {
    recommendation.completedAt = new Date().toISOString();
    job.performance.completedRecommendations++;
    job.performance.pendingRecommendations--;
  }

  job.updatedAt = new Date().toISOString();
  auditJobs.set(jobId, job);
  return recommendation;
}

/**
 * Get audit statistics
 */
export async function getAuditStats(organizationId: string): Promise<AuditStats> {
  const allJobs = Array.from(auditJobs.values()).filter(
    j => j.organizationId === organizationId
  );

  const completedJobs = allJobs.filter(j => j.status === "completed");
  const failedJobs = allJobs.filter(j => j.status === "failed");

  let totalAuditScore = 0;
  let certifiedModels = 0;
  let conditionallyCertifiedModels = 0;
  let nonCertifiedModels = 0;
  let totalFindings = 0;
  let criticalFindings = 0;
  let highFindings = 0;
  let resolvedFindings = 0;
  let openFindings = 0;
  let totalRecommendations = 0;
  let completedRecommendations = 0;
  let totalAuditDuration = 0;
  const jobsByType: Record<string, number> = {};
  const jobsByReadiness: Record<string, number> = {};
  const findingCounts: Record<string, number> = {};

  for (const job of allJobs) {
    jobsByType[job.auditType] = (jobsByType[job.auditType] || 0) + 1;

    if (job.readiness) {
      jobsByReadiness[job.readiness.overallReadiness] = (jobsByReadiness[job.readiness.overallReadiness] || 0) + 1;
    }

    if (job.status === "completed") {
      if (job.certification) {
        totalAuditScore += job.certification.overallScore;

        if (job.certification.certificationType === "certified" || job.certification.certificationType === "compliant") {
          certifiedModels++;
        } else if (job.certification.certificationType === "conditionally_compliant") {
          conditionallyCertifiedModels++;
        } else {
          nonCertifiedModels++;
        }
      }

      totalFindings += job.performance.totalFindings;
      criticalFindings += job.performance.criticalFindings;
      highFindings += job.performance.highFindings;
      resolvedFindings += job.performance.resolvedFindings;
      openFindings += job.performance.openFindings;
      totalRecommendations += job.performance.totalRecommendations;
      completedRecommendations += job.performance.completedRecommendations;
      totalAuditDuration += job.performance.auditDurationMs;

      for (const finding of job.findings) {
        findingCounts[finding.type] = (findingCounts[finding.type] || 0) + 1;
      }
    }
  }

  const commonFindings = Object.entries(findingCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalJobs: allJobs.length,
    completedJobs: completedJobs.length,
    failedJobs: failedJobs.length,
    averageAuditScore: completedJobs.length > 0 ? totalAuditScore / completedJobs.length : 0,
    certifiedModels,
    conditionallyCertifiedModels,
    nonCertifiedModels,
    totalFindings,
    criticalFindings,
    highFindings,
    resolvedFindings,
    openFindings,
    totalRecommendations,
    completedRecommendations,
    jobsByType,
    jobsByReadiness,
    commonFindings,
    averageAuditDuration: completedJobs.length > 0 ? totalAuditDuration / completedJobs.length : 0,
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

async function performAudit(jobId: string): Promise<void> {
  const job = auditJobs.get(jobId);
  if (!job) return;

  // Simulate audit process (in production, this would collect real evidence)
  // Add sample evidence
  await addAuditEvidence(jobId, {
    type: "performance_metric",
    title: "Model Performance Metrics",
    description: "Accuracy, precision, recall, F1-score metrics",
    source: "AI Monitoring Service",
    data: {
      accuracy: 0.92,
      precision: 0.89,
      recall: 0.88,
      f1Score: 0.885,
    },
    collectedBy: "audit_system",
    relevance: "high",
  }, "audit_system");

  await addAuditEvidence(jobId, {
    type: "bias_report",
    title: "Bias and Fairness Report",
    description: "Demographic parity and equalized odds analysis",
    source: "AI Ethics Service",
    data: {
      demographicParity: 0.95,
      equalizedOdds: 0.92,
      protectedAttributes: ["race", "gender", "age"],
    },
    collectedBy: "audit_system",
    relevance: "high",
  }, "audit_system");

  // Add sample findings
  await addAuditFinding(jobId, {
    type: "performance_issue",
    severity: "medium",
    title: "Model accuracy below target",
    description: "Model accuracy is 92%, below the target of 95%",
    evidence: ["evidence_001"],
    impact: "Model may not meet business requirements",
    affectedModels: job.scope.modelIds,
    remediationPlan: "Retrain model with additional data and hyperparameter tuning",
    remediationOwner: "ml_team",
    remediationDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  await addAuditFinding(jobId, {
    type: "bias_detected",
    severity: "high",
    title: "Bias detected in age group",
    description: "Demographic parity for age group 18-25 is 0.75, below threshold of 0.80",
    evidence: ["evidence_002"],
    impact: "Model may discriminate against younger users",
    affectedModels: job.scope.modelIds,
    affectedStakeholders: ["young_users"],
    remediationPlan: "Apply bias mitigation techniques and retrain",
    remediationOwner: "ml_team",
    remediationDueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Add sample recommendations
  await addAuditRecommendation(jobId, {
    type: "immediate",
    priority: "high",
    title: "Address bias in age group",
    description: "Apply bias mitigation techniques to address demographic parity issue",
    rationale: "Bias detected in age group 18-25 may lead to discriminatory outcomes",
    expectedImpact: "Improve fairness and reduce discrimination risk",
    implementationEffort: "medium",
    relatedFindings: ["finding_002"],
    assignedTo: "ml_team",
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });

  await addAuditRecommendation(jobId, {
    type: "short_term",
    priority: "medium",
    title: "Improve model accuracy",
    description: "Retrain model with additional data and hyperparameter tuning",
    rationale: "Model accuracy is below target of 95%",
    expectedImpact: "Improve model performance and meet business requirements",
    implementationEffort: "medium",
    relatedFindings: ["finding_001"],
    assignedTo: "ml_team",
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Complete audit
  await completeAuditJob(jobId);
}

async function generateAuditReport(jobId: string, generatedBy: string): Promise<AuditReport> {
  const job = auditJobs.get(jobId);
  if (!job) throw new Error("Job not found");

  const evidenceSummary = {
    totalEvidence: job.evidence.length,
    verifiedEvidence: job.evidence.filter(e => e.verified).length,
    byType: {} as Record<string, number>,
  };

  for (const evidence of job.evidence) {
    evidenceSummary.byType[evidence.type] = (evidenceSummary.byType[evidence.type] || 0) + 1;
  }

  const executiveSummary = `AI audit for ${job.name} identified ${job.findings.length} findings, including ${job.performance.criticalFindings} critical and ${job.performance.highFindings} high severity findings. ${job.recommendations.length} recommendations provided for improvement.`;

  const methodology = `Comprehensive AI audit methodology including performance validation, bias and fairness assessment, safety testing, robustness evaluation, and explainability analysis.`;

  const conclusions = [
    `Model performance is ${job.findings.some(f => f.type === "performance_issue") ? "below target" : "meeting requirements"}`,
    `Bias and fairness assessment ${job.findings.some(f => f.type === "bias_detected") ? "identified issues" : "passed"}`,
    `Safety and robustness tests ${job.findings.some(f => f.type === "safety_concern" || f.type === "robustness_issue") ? "identified concerns" : "passed"}`,
  ];

  const limitations = [
    "Audit based on available evidence and test data",
    "Results may vary with different datasets and conditions",
  ];

  return {
    id: `report_${randomUUID().slice(0, 8)}`,
    auditJobId: jobId,
    generatedAt: new Date().toISOString(),
    generatedBy,
    executiveSummary,
    auditScope: job.scope,
    methodology,
    findings: job.findings,
    recommendations: job.recommendations,
    evidenceSummary,
    conclusions,
    limitations,
  };
}

async function generateAuditCertification(jobId: string): Promise<AuditCertification> {
  const job = auditJobs.get(jobId);
  if (!job) throw new Error("Job not found");

  const criticalFindings = job.findings.filter(f => f.severity === "critical").length;
  const highFindings = job.findings.filter(f => f.severity === "high").length;
  const resolvedFindings = job.findings.filter(f => f.status === "resolved").length;
  const totalFindings = job.findings.length;

  const overallScore = Math.max(0, 100 - (criticalFindings * 20) - (highFindings * 10) - ((totalFindings - resolvedFindings) * 5));

  const certificationType = criticalFindings > 0 ? "non_compliant" :
                            highFindings > 2 ? "conditionally_compliant" :
                            overallScore >= 80 ? "certified" :
                            overallScore >= 60 ? "conditionally_compliant" : "non_compliant";

  const certificationLevel = certificationType === "certified" ? "full" :
                             certificationType === "conditionally_compliant" ? "conditional" : "partial";

  const criteriaResults = [
    {
      criteria: "Performance Requirements",
      passed: !job.findings.some(f => f.type === "performance_issue" && f.severity === "critical"),
      score: job.findings.some(f => f.type === "performance_issue") ? 70 : 95,
      evidence: job.evidence.filter(e => e.type === "performance_metric").map(e => e.id),
    },
    {
      criteria: "Bias and Fairness",
      passed: !job.findings.some(f => f.type === "bias_detected" && f.severity === "critical"),
      score: job.findings.some(f => f.type === "bias_detected") ? 75 : 92,
      evidence: job.evidence.filter(e => e.type === "bias_report").map(e => e.id),
    },
    {
      criteria: "Safety and Robustness",
      passed: !job.findings.some(f => (f.type === "safety_concern" || f.type === "robustness_issue") && f.severity === "critical"),
      score: job.findings.some(f => f.type === "safety_concern" || f.type === "robustness_issue") ? 80 : 90,
      evidence: job.evidence.filter(e => e.type === "safety_test").map(e => e.id),
    },
  ];

  const conditions = [];
  if (certificationType === "conditionally_compliant") {
    conditions.push("Address all high-severity findings within 30 days");
    conditions.push("Provide evidence of remediation");
  }

  return {
    id: `certification_${randomUUID().slice(0, 8)}`,
    auditJobId: jobId,
    certificationType,
    certificationLevel,
    overallScore,
    criteriaResults,
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    certifyingAuthority: "WINDELS AI Audit System",
    conditions: conditions.length > 0 ? conditions : undefined,
    issuedAt: new Date().toISOString(),
  };
}

async function assessAuditReadiness(jobId: string): Promise<AuditReadiness> {
  const job = auditJobs.get(jobId);
  if (!job) throw new Error("Job not found");

  const criteria = [
    {
      criteria: "Evidence Collection",
      ready: job.evidence.length >= 5,
      score: Math.min(100, (job.evidence.length / 10) * 100),
      gaps: job.evidence.length < 5 ? ["Insufficient evidence collected"] : [],
    },
    {
      criteria: "Evidence Verification",
      ready: job.evidence.filter(e => e.verified).length >= job.evidence.length * 0.8,
      score: job.evidence.length > 0 ? (job.evidence.filter(e => e.verified).length / job.evidence.length) * 100 : 0,
      gaps: job.evidence.filter(e => !e.verified).length > job.evidence.length * 0.2 ? ["Insufficient evidence verified"] : [],
    },
    {
      criteria: "Findings Resolution",
      ready: job.performance.openFindings <= job.performance.totalFindings * 0.2,
      score: job.performance.totalFindings > 0 ? ((job.performance.totalFindings - job.performance.openFindings) / job.performance.totalFindings) * 100 : 100,
      gaps: job.performance.openFindings > job.performance.totalFindings * 0.2 ? ["Too many open findings"] : [],
    },
    {
      criteria: "Recommendations Implementation",
      ready: job.performance.completedRecommendations >= job.performance.totalRecommendations * 0.5,
      score: job.performance.totalRecommendations > 0 ? (job.performance.completedRecommendations / job.performance.totalRecommendations) * 100 : 100,
      gaps: job.performance.completedRecommendations < job.performance.totalRecommendations * 0.5 ? ["Insufficient recommendations implemented"] : [],
    },
  ];

  const overallScore = criteria.reduce((sum, c) => sum + c.score, 0) / criteria.length;
  const overallReadiness = overallScore >= 90 ? "ready" :
                           overallScore >= 75 ? "mostly_ready" :
                           overallScore >= 50 ? "partially_ready" : "not_ready";

  const recommendations = [];
  if (overallReadiness !== "ready") {
    recommendations.push("Address gaps identified in readiness criteria");
  }
  if (job.performance.openFindings > 0) {
    recommendations.push("Resolve open findings");
  }
  if (job.performance.pendingRecommendations > 0) {
    recommendations.push("Implement pending recommendations");
  }

  return {
    overallReadiness,
    readinessScore: overallScore,
    criteria,
    recommendations,
    assessedAt: new Date().toISOString(),
  };
}
