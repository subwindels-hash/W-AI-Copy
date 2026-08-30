/**
 * Module 89: AI Threat Intelligence Service
 *
 * Provides comprehensive AI threat intelligence capabilities including threat
 * intelligence gathering, vulnerability assessment, security scoring, security
 * incident response, threat hunting, threat correlation, and threat intelligence
 * sharing for AI model security.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ThreatIntelligenceJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: ThreatIntelligenceStatus;
  modelId: string;
  modelName: string;
  modelVersion: string;
  intelligenceType: ThreatIntelligenceType;
  config: ThreatIntelligenceConfig;
  results: ThreatIntelligenceResults;
  threatScore: ThreatScore;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type ThreatIntelligenceStatus =
  | 'planned'
  | 'gathering'
  | 'analyzing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ThreatIntelligenceType =
  | 'vulnerability-assessment'
  | 'threat-hunting'
  | 'threat-intelligence'
  | 'incident-response'
  | 'comprehensive';

export interface ThreatIntelligenceConfig {
  vulnerabilityAssessment?: VulnerabilityAssessmentConfig;
  threatHunting?: ThreatHuntingConfig;
  threatIntelligence?: ThreatIntelligenceGatheringConfig;
  incidentResponse?: IncidentResponseConfig;
  securityScoring?: SecurityScoringConfig;
}

export interface VulnerabilityAssessmentConfig {
  enabled: boolean;
  assessmentTypes: VulnerabilityAssessmentType[];
  automatedScanning: boolean;
  scanFrequency?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  customScans?: CustomVulnerabilityScan[];
}

export type VulnerabilityAssessmentType =
  | 'static-analysis'
  | 'dynamic-analysis'
  | 'penetration-testing'
  | 'fuzzing'
  | 'code-review'
  | 'dependency-scanning';

export interface CustomVulnerabilityScan {
  name: string;
  scanType: string;
  scanConfig: Record<string, any>;
  threshold?: number;
}

export interface ThreatHuntingConfig {
  enabled: boolean;
  huntingTechniques: ThreatHuntingTechnique[];
  automatedHunting: boolean;
  huntingFrequency?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  customHunts?: CustomThreatHunt[];
}

export type ThreatHuntingTechnique =
  | 'anomaly-detection'
  | 'behavioral-analysis'
  | 'signature-based'
  | 'heuristic-analysis'
  | 'machine-learning'
  | 'threat-intelligence-correlation';

export interface CustomThreatHunt {
  name: string;
  huntingType: string;
  huntingConfig: Record<string, any>;
  threshold?: number;
}

export interface ThreatIntelligenceGatheringConfig {
  enabled: boolean;
  intelligenceSources: ThreatIntelligenceSource[];
  automatedGathering: boolean;
  gatheringFrequency?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  customSources?: CustomThreatIntelligenceSource[];
}

export type ThreatIntelligenceSource =
  | 'cve-database'
  | 'threat-feeds'
  | 'security-advisories'
  | 'vulnerability-databases'
  | 'threat-intelligence-platforms'
  | 'open-source-intelligence';

export interface CustomThreatIntelligenceSource {
  name: string;
  sourceType: string;
  sourceConfig: Record<string, any>;
  updateFrequency?: string;
}

export interface IncidentResponseConfig {
  enabled: boolean;
  responseProcedures: IncidentResponseProcedure[];
  automatedResponse: boolean;
  escalationProcedures?: EscalationProcedure[];
  customProcedures?: CustomIncidentResponseProcedure[];
}

export interface IncidentResponseProcedure {
  procedureType: 'detection' | 'containment' | 'eradication' | 'recovery' | 'post-incident';
  procedureConfig: Record<string, any>;
  automated: boolean;
}

export interface EscalationProcedure {
  level: number;
  escalationCriteria: string;
  escalationTarget: string;
  notificationChannels: string[];
}

export interface CustomIncidentResponseProcedure {
  name: string;
  procedureType: string;
  procedureConfig: Record<string, any>;
}

export interface SecurityScoringConfig {
  enabled: boolean;
  scoringModel: SecurityScoringModel;
  customWeights?: Record<string, number>;
  scoringThresholds?: Record<string, number>;
}

export type SecurityScoringModel =
  | 'cvss'
  | 'custom'
  | 'weighted-average'
  | 'machine-learning';

export interface ThreatIntelligenceResults {
  vulnerabilityAssessmentResults?: VulnerabilityAssessmentResults;
  threatHuntingResults?: ThreatHuntingResults;
  threatIntelligenceResults?: ThreatIntelligenceGatheringResults;
  incidentResponseResults?: IncidentResponseResults;
  threats: Threat[];
  vulnerabilities: ThreatVulnerability[];
  recommendations: ThreatRecommendation[];
  metadata?: Record<string, any>;
}

export interface VulnerabilityAssessmentResults {
  assessmentTypes: VulnerabilityAssessmentType[];
  totalScans: number;
  passedScans: number;
  failedScans: number;
  passRate: number;
  vulnerabilities: ThreatVulnerability[];
  metadata?: Record<string, any>;
}

export interface ThreatHuntingResults {
  huntingTechniques: ThreatHuntingTechnique[];
  totalHunts: number;
  threatsDetected: number;
  falsePositives: number;
  detectionRate: number;
  threats: Threat[];
  metadata?: Record<string, any>;
}

export interface ThreatIntelligenceGatheringResults {
  intelligenceSources: ThreatIntelligenceSource[];
  totalIntelligence: number;
  relevantIntelligence: number;
  relevanceRate: number;
  intelligence: ThreatIntelligence[];
  metadata?: Record<string, any>;
}

export interface IncidentResponseResults {
  responseProcedures: IncidentResponseProcedure[];
  totalIncidents: number;
  respondedIncidents: number;
  responseRate: number;
  incidents: SecurityIncident[];
  metadata?: Record<string, any>;
}

export interface Threat {
  id: string;
  threatType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  mitigations: string[];
  indicators: ThreatIndicator[];
  ttps: string[]; // Tactics, Techniques, and Procedures
  metadata?: Record<string, any>;
}

export interface ThreatIndicator {
  indicatorType: string;
  indicatorValue: string;
  confidence: number;
  source: string;
  firstSeen?: string;
  lastSeen?: string;
}

export interface ThreatVulnerability {
  id: string;
  vulnerabilityType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  mitigations: string[];
  cve?: string;
  cvssScore?: number;
  cvssVector?: string;
  exploitAvailable: boolean;
  patchAvailable: boolean;
}

export interface ThreatIntelligence {
  id: string;
  intelligenceType: string;
  source: string;
  title: string;
  description: string;
  indicators: ThreatIndicator[];
  ttps: string[];
  relevance: number;
  confidence: number;
  publishedAt: string;
  updatedAt?: string;
}

export interface SecurityIncident {
  id: string;
  incidentType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  status: 'detected' | 'investigating' | 'contained' | 'eradicated' | 'recovered' | 'closed';
  detectedAt: string;
  respondedAt?: string;
  resolvedAt?: string;
  responseProcedures: IncidentResponseProcedure[];
  metadata?: Record<string, any>;
}

export interface ThreatRecommendation {
  id: string;
  type: 'vulnerability-mitigation' | 'threat-mitigation' | 'security-hardening' | 'incident-response';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  expectedImpact: string;
  implementationEffort: 'low' | 'medium' | 'high';
  confidence: number;
  references?: string[];
}

export interface ThreatScore {
  overallScore: number;
  vulnerabilityScore: number;
  threatScore: number;
  incidentScore: number;
  securityGrade: SecurityGrade;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export type SecurityGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface ThreatIntelligenceDashboard {
  organizationId: string;
  totalIntelligenceJobs: number;
  completedIntelligenceJobs: number;
  averageThreatScore: number;
  averageSecurityGrade: SecurityGrade;
  recentIntelligenceJobs: ThreatIntelligenceJob[];
  threatSummary: ThreatSummary;
  threatTrends: ThreatTrend[];
  securityGradeDistribution: SecurityGradeDistribution;
  topThreats: Threat[];
  topVulnerabilities: ThreatVulnerability[];
}

export interface ThreatSummary {
  totalThreats: number;
  criticalThreats: number;
  highThreats: number;
  mediumThreats: number;
  lowThreats: number;
  mitigatedThreats: number;
  mitigationRate: number;
  totalVulnerabilities: number;
  totalIncidents: number;
}

export interface ThreatTrend {
  date: string;
  jobCount: number;
  averageThreatScore: number;
  threatCount: number;
  mitigationRate: number;
}

export interface SecurityGradeDistribution {
  excellent: number; // A+, A
  good: number; // B
  acceptable: number; // C
  poor: number; // D, F
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const threatIntelligenceJobs = new Map<string, ThreatIntelligenceJob>();

// ─── Threat Intelligence Management ────────────────────────────────────────────

/**
 * Create a threat intelligence job
 */
export async function createThreatIntelligenceJob(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    modelId: string;
    modelName: string;
    modelVersion: string;
    intelligenceType: ThreatIntelligenceType;
    config: ThreatIntelligenceConfig;
    createdBy: string;
  }
): Promise<ThreatIntelligenceJob> {
  const id = `tijob_${randomUUID()}`;
  const now = new Date().toISOString();

  const job: ThreatIntelligenceJob = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    status: 'planned',
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    intelligenceType: params.intelligenceType,
    config: params.config,
    results: {
      threats: [],
      vulnerabilities: [],
      recommendations: [],
    },
    threatScore: {
      overallScore: 0,
      vulnerabilityScore: 0,
      threatScore: 0,
      incidentScore: 0,
      securityGrade: 'F',
      riskLevel: 'critical',
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  threatIntelligenceJobs.set(id, job);
  return job;
}

/**
 * Start threat intelligence job
 */
export async function startThreatIntelligenceJob(
  jobId: string
): Promise<ThreatIntelligenceJob | null> {
  const job = threatIntelligenceJobs.get(jobId);
  if (!job || job.status !== 'planned') return null;

  job.status = 'gathering';
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  threatIntelligenceJobs.set(jobId, job);
  return job;
}

/**
 * Complete threat intelligence job
 */
export async function completeThreatIntelligenceJob(
  jobId: string,
  results: {
    vulnerabilityAssessmentResults?: VulnerabilityAssessmentResults;
    threatHuntingResults?: ThreatHuntingResults;
    threatIntelligenceResults?: ThreatIntelligenceGatheringResults;
    incidentResponseResults?: IncidentResponseResults;
    threats: Threat[];
    vulnerabilities: ThreatVulnerability[];
    recommendations: ThreatRecommendation[];
  },
  threatScore: ThreatScore
): Promise<ThreatIntelligenceJob | null> {
  const job = threatIntelligenceJobs.get(jobId);
  if (!job || job.status !== 'gathering' && job.status !== 'analyzing') return null;

  job.results = {
    ...job.results,
    ...results,
  };

  job.threatScore = threatScore;
  job.status = 'completed';
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;

  threatIntelligenceJobs.set(jobId, job);
  return job;
}

/**
 * Analyze threat intelligence
 */
export async function analyzeThreatIntelligence(
  jobId: string,
  analysisResults: {
    vulnerabilityAssessmentResults?: VulnerabilityAssessmentResults;
    threatHuntingResults?: ThreatHuntingResults;
    threatIntelligenceResults?: ThreatIntelligenceGatheringResults;
    incidentResponseResults?: IncidentResponseResults;
  }
): Promise<ThreatIntelligenceJob | null> {
  const job = threatIntelligenceJobs.get(jobId);
  if (!job || job.status !== 'gathering' && job.status !== 'analyzing') return null;

  job.status = 'analyzing';
  job.updatedAt = new Date().toISOString();

  job.results = {
    ...job.results,
    ...analysisResults,
  };

  threatIntelligenceJobs.set(jobId, job);
  return job;
}

/**
 * Cancel threat intelligence job
 */
export async function cancelThreatIntelligenceJob(
  jobId: string
): Promise<ThreatIntelligenceJob | null> {
  const job = threatIntelligenceJobs.get(jobId);
  if (!job || job.status === 'completed' || job.status === 'cancelled') return null;

  job.status = 'cancelled';
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;

  threatIntelligenceJobs.set(jobId, job);
  return job;
}

/**
 * Get threat intelligence job by ID
 */
export async function getThreatIntelligenceJob(
  jobId: string
): Promise<ThreatIntelligenceJob | null> {
  return threatIntelligenceJobs.get(jobId) || null;
}

/**
 * List threat intelligence jobs for an organization
 */
export async function listThreatIntelligenceJobs(
  organizationId: string,
  filters?: { status?: ThreatIntelligenceStatus; intelligenceType?: ThreatIntelligenceType }
): Promise<ThreatIntelligenceJob[]> {
  let orgJobs = Array.from(threatIntelligenceJobs.values()).filter((j) => j.organizationId === organizationId);

  if (filters?.status) {
    orgJobs = orgJobs.filter((j) => j.status === filters.status);
  }

  if (filters?.intelligenceType) {
    orgJobs = orgJobs.filter((j) => j.intelligenceType === filters.intelligenceType);
  }

  return orgJobs;
}

/**
 * Get threat intelligence dashboard
 */
export async function getThreatIntelligenceDashboard(
  organizationId: string
): Promise<ThreatIntelligenceDashboard> {
  const orgJobs = await listThreatIntelligenceJobs(organizationId);

  const completedJobs = orgJobs.filter((j) => j.status === 'completed');

  const averageThreatScore = completedJobs.length > 0
    ? completedJobs.reduce((sum, j) => sum + j.threatScore.overallScore, 0) / completedJobs.length
    : 0;

  const gradeMap: Record<SecurityGrade, number> = { 'A+': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'F': 0 };
  const averageGradeValue = completedJobs.length > 0
    ? completedJobs.reduce((sum, j) => sum + gradeMap[j.threatScore.securityGrade], 0) / completedJobs.length
    : 0;
  
  const gradeValueMap: Record<number, SecurityGrade> = { 5: 'A+', 4: 'A', 3: 'B', 2: 'C', 1: 'D', 0: 'F' };
  const averageSecurityGrade = gradeValueMap[Math.round(averageGradeValue)] || 'F';

  const recentIntelligenceJobs = orgJobs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  // Calculate threat summary
  const allThreats = completedJobs.flatMap((j) => j.results.threats);
  const allVulnerabilities = completedJobs.flatMap((j) => j.results.vulnerabilities);
  const allIncidents = completedJobs.flatMap((j) => j.results.incidentResponseResults?.incidents || []);

  const criticalThreats = allThreats.filter((t) => t.severity === 'critical').length;
  const highThreats = allThreats.filter((t) => t.severity === 'high').length;
  const mediumThreats = allThreats.filter((t) => t.severity === 'medium').length;
  const lowThreats = allThreats.filter((t) => t.severity === 'low').length;
  const mitigatedThreats = allThreats.filter((t) => t.mitigations.length > 0).length;

  const threatSummary: ThreatSummary = {
    totalThreats: allThreats.length,
    criticalThreats,
    highThreats,
    mediumThreats,
    lowThreats,
    mitigatedThreats,
    mitigationRate: allThreats.length > 0 ? (mitigatedThreats / allThreats.length) * 100 : 0,
    totalVulnerabilities: allVulnerabilities.length,
    totalIncidents: allIncidents.length,
  };

  // Calculate threat trends (last 30 days)
  const threatTrends: ThreatTrend[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dayJobs = orgJobs.filter((j) => j.createdAt.startsWith(dateStr));
    const dayCompletedJobs = dayJobs.filter((j) => j.status === 'completed');

    const dayThreats = dayCompletedJobs.flatMap((j) => j.results.threats);
    const dayMitigated = dayThreats.filter((t) => t.mitigations.length > 0).length;

    threatTrends.push({
      date: dateStr,
      jobCount: dayJobs.length,
      averageThreatScore: dayCompletedJobs.length > 0
        ? dayCompletedJobs.reduce((sum, j) => sum + j.threatScore.overallScore, 0) / dayCompletedJobs.length
        : 0,
      threatCount: dayThreats.length,
      mitigationRate: dayThreats.length > 0 ? (dayMitigated / dayThreats.length) * 100 : 0,
    });
  }

  threatTrends.reverse();

  // Calculate security grade distribution
  const securityGradeDistribution: SecurityGradeDistribution = {
    excellent: 0,
    good: 0,
    acceptable: 0,
    poor: 0,
  };

  for (const job of completedJobs) {
    const grade = job.threatScore.securityGrade;
    if (grade === 'A+' || grade === 'A') securityGradeDistribution.excellent++;
    else if (grade === 'B') securityGradeDistribution.good++;
    else if (grade === 'C') securityGradeDistribution.acceptable++;
    else securityGradeDistribution.poor++;
  }

  // Get top threats and vulnerabilities
  const topThreats = allThreats
    .sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    })
    .slice(0, 10);

  const topVulnerabilities = allVulnerabilities
    .sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    })
    .slice(0, 10);

  return {
    organizationId,
    totalIntelligenceJobs: orgJobs.length,
    completedIntelligenceJobs: completedJobs.length,
    averageThreatScore,
    averageSecurityGrade,
    recentIntelligenceJobs,
    threatSummary,
    threatTrends,
    securityGradeDistribution,
    topThreats,
    topVulnerabilities,
  };
}
