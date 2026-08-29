/**
 * Module 89: AI Security Hardening Service
 *
 * Provides comprehensive AI security hardening capabilities including input
 * sanitization, output filtering, model hardening techniques, security testing
 * automation, vulnerability assessment, security scoring, and security incident
 * response for AI model security hardening.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SecurityHardeningJob {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: SecurityHardeningStatus;
  modelId: string;
  modelName: string;
  modelVersion: string;
  hardeningType: SecurityHardeningType;
  config: SecurityHardeningConfig;
  results: SecurityHardeningResults;
  securityScore: SecurityScore;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type SecurityHardeningStatus =
  | 'planned'
  | 'hardening'
  | 'testing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SecurityHardeningType =
  | 'input-sanitization'
  | 'output-filtering'
  | 'model-hardening'
  | 'adversarial-defense'
  | 'comprehensive';

export interface SecurityHardeningConfig {
  inputSanitization?: InputSanitizationConfig;
  outputFiltering?: OutputFilteringConfig;
  modelHardening?: ModelHardeningConfig;
  adversarialDefense?: AdversarialDefenseConfig;
  securityTesting?: SecurityTestingConfig;
}

export interface InputSanitizationConfig {
  enabled: boolean;
  sanitizationRules: SanitizationRule[];
  maxLength?: number;
  allowedTypes?: string[];
  blockedPatterns?: string[];
  customValidators?: CustomValidator[];
}

export interface SanitizationRule {
  ruleType: 'regex' | 'whitelist' | 'blacklist' | 'custom';
  pattern?: string;
  allowedValues?: string[];
  blockedValues?: string[];
  customValidator?: string;
  action: 'sanitize' | 'reject' | 'log';
}

export interface CustomValidator {
  name: string;
  validatorType: 'regex' | 'schema' | 'custom';
  validatorConfig: Record<string, any>;
}

export interface OutputFilteringConfig {
  enabled: boolean;
  filteringRules: FilteringRule[];
  sensitiveDataPatterns?: string[];
  piiDetection?: boolean;
  contentFiltering?: ContentFilteringConfig;
}

export interface FilteringRule {
  ruleType: 'regex' | 'whitelist' | 'blacklist' | 'custom';
  pattern?: string;
  allowedValues?: string[];
  blockedValues?: string[];
  customFilter?: string;
  action: 'filter' | 'mask' | 'reject' | 'log';
}

export interface ContentFilteringConfig {
  enabled: boolean;
  categories: ContentCategory[];
  customCategories?: CustomContentCategory[];
}

export type ContentCategory =
  | 'hate-speech'
  | 'violence'
  | 'adult-content'
  | 'profanity'
  | 'political'
  | 'sensitive-topics';

export interface CustomContentCategory {
  name: string;
  patterns: string[];
  action: 'block' | 'mask' | 'warn';
}

export interface ModelHardeningConfig {
  enabled: boolean;
  techniques: ModelHardeningTechnique[];
  robustnessTarget?: number;
  securityLevel?: 'low' | 'medium' | 'high' | 'maximum';
}

export type ModelHardeningTechnique =
  | 'adversarial-training'
  | 'defensive-distillation'
  | 'input-transformation'
  | 'gradient-masking'
  | 'ensemble-methods'
  | 'certified-robustness'
  | 'randomization'
  | 'input-validation';

export interface AdversarialDefenseConfig {
  enabled: boolean;
  defenseTypes: AdversarialDefenseType[];
  detectionThreshold?: number;
  mitigationStrategy?: 'reject' | 'sanitize' | 'fallback';
}

export type AdversarialDefenseType =
  | 'adversarial-training'
  | 'defensive-distillation'
  | 'input-transformation'
  | 'gradient-masking'
  | 'ensemble'
  | 'certified'
  | 'detection';

export interface SecurityTestingConfig {
  enabled: boolean;
  testTypes: SecurityTestType[];
  automatedTesting: boolean;
  testFrequency?: 'hourly' | 'daily' | 'weekly' | 'monthly';
  customTests?: CustomSecurityTest[];
}

export type SecurityTestType =
  | 'input-validation'
  | 'output-validation'
  | 'adversarial-robustness'
  | 'stress-testing'
  | 'penetration-testing'
  | 'fuzzing';

export interface CustomSecurityTest {
  name: string;
  testType: string;
  testConfig: Record<string, any>;
  threshold?: number;
}

export interface SecurityHardeningResults {
  inputSanitizationResults?: InputSanitizationResults;
  outputFilteringResults?: OutputFilteringResults;
  modelHardeningResults?: ModelHardeningResults;
  adversarialDefenseResults?: AdversarialDefenseResults;
  securityTestingResults?: SecurityTestingResults;
  vulnerabilities: SecurityVulnerability[];
  recommendations: SecurityRecommendation[];
  metadata?: Record<string, any>;
}

export interface InputSanitizationResults {
  totalInputs: number;
  sanitizedInputs: number;
  rejectedInputs: number;
  sanitizationRate: number;
  sanitizationRules: SanitizationRuleResult[];
}

export interface SanitizationRuleResult {
  rule: SanitizationRule;
  appliedCount: number;
  successRate: number;
  failures: number;
}

export interface OutputFilteringResults {
  totalOutputs: number;
  filteredOutputs: number;
  blockedOutputs: number;
  filteringRate: number;
  filteringRules: FilteringRuleResult[];
}

export interface FilteringRuleResult {
  rule: FilteringRule;
  appliedCount: number;
  successRate: number;
  failures: number;
}

export interface ModelHardeningResults {
  techniquesApplied: ModelHardeningTechnique[];
  robustnessScore: number;
  adversarialRobustness: number;
  hardeningEffectiveness: number;
  metadata?: Record<string, any>;
}

export interface AdversarialDefenseResults {
  defenseTypes: AdversarialDefenseType[];
  detectionRate: number;
  mitigationRate: number;
  falsePositiveRate: number;
  defenseEffectiveness: number;
  metadata?: Record<string, any>;
}

export interface SecurityTestingResults {
  testTypes: SecurityTestType[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passRate: number;
  vulnerabilities: SecurityVulnerability[];
  metadata?: Record<string, any>;
}

export interface SecurityVulnerability {
  id: string;
  vulnerabilityType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  mitigations: string[];
  cve?: string;
  cvssScore?: number;
}

export interface SecurityRecommendation {
  id: string;
  type: 'input-sanitization' | 'output-filtering' | 'model-hardening' | 'adversarial-defense' | 'security-testing';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  expectedImpact: string;
  implementationEffort: 'low' | 'medium' | 'high';
  confidence: number;
  references?: string[];
}

export interface SecurityScore {
  overallScore: number;
  inputSanitizationScore: number;
  outputFilteringScore: number;
  modelHardeningScore: number;
  adversarialDefenseScore: number;
  securityTestingScore: number;
  securityGrade: SecurityGrade;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export type SecurityGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface SecurityHardeningDashboard {
  organizationId: string;
  totalHardeningJobs: number;
  completedHardeningJobs: number;
  averageSecurityScore: number;
  averageSecurityGrade: SecurityGrade;
  recentHardeningJobs: SecurityHardeningJob[];
  vulnerabilitySummary: VulnerabilitySummary;
  securityTrends: SecurityTrend[];
  securityGradeDistribution: SecurityGradeDistribution;
  topVulnerabilities: SecurityVulnerability[];
}

export interface VulnerabilitySummary {
  totalVulnerabilities: number;
  criticalVulnerabilities: number;
  highVulnerabilities: number;
  mediumVulnerabilities: number;
  lowVulnerabilities: number;
  mitigatedVulnerabilities: number;
  mitigationRate: number;
}

export interface SecurityTrend {
  date: string;
  jobCount: number;
  averageSecurityScore: number;
  vulnerabilityCount: number;
  mitigationRate: number;
}

export interface SecurityGradeDistribution {
  excellent: number; // A+, A
  good: number; // B
  acceptable: number; // C
  poor: number; // D, F
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const securityHardeningJobs = new Map<string, SecurityHardeningJob>();

// ─── Security Hardening Management ─────────────────────────────────────────────

/**
 * Create a security hardening job
 */
export async function createSecurityHardeningJob(
  organizationId: string,
  params: {
    name: string;
    description?: string;
    modelId: string;
    modelName: string;
    modelVersion: string;
    hardeningType: SecurityHardeningType;
    config: SecurityHardeningConfig;
    createdBy: string;
  }
): Promise<SecurityHardeningJob> {
  const id = `shjob_${randomUUID()}`;
  const now = new Date().toISOString();

  const job: SecurityHardeningJob = {
    id,
    organizationId,
    name: params.name,
    description: params.description,
    status: 'planned',
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    hardeningType: params.hardeningType,
    config: params.config,
    results: {
      vulnerabilities: [],
      recommendations: [],
    },
    securityScore: {
      overallScore: 0,
      inputSanitizationScore: 0,
      outputFilteringScore: 0,
      modelHardeningScore: 0,
      adversarialDefenseScore: 0,
      securityTestingScore: 0,
      securityGrade: 'F',
      riskLevel: 'critical',
    },
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  securityHardeningJobs.set(id, job);
  return job;
}

/**
 * Start security hardening job
 */
export async function startSecurityHardeningJob(
  jobId: string
): Promise<SecurityHardeningJob | null> {
  const job = securityHardeningJobs.get(jobId);
  if (!job || job.status !== 'planned') return null;

  job.status = 'hardening';
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  securityHardeningJobs.set(jobId, job);
  return job;
}

/**
 * Complete security hardening job
 */
export async function completeSecurityHardeningJob(
  jobId: string,
  results: {
    inputSanitizationResults?: InputSanitizationResults;
    outputFilteringResults?: OutputFilteringResults;
    modelHardeningResults?: ModelHardeningResults;
    adversarialDefenseResults?: AdversarialDefenseResults;
    securityTestingResults?: SecurityTestingResults;
    vulnerabilities: SecurityVulnerability[];
    recommendations: SecurityRecommendation[];
  },
  securityScore: SecurityScore
): Promise<SecurityHardeningJob | null> {
  const job = securityHardeningJobs.get(jobId);
  if (!job || job.status !== 'hardening' && job.status !== 'testing') return null;

  job.results = {
    ...job.results,
    ...results,
  };

  job.securityScore = securityScore;
  job.status = 'completed';
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;

  securityHardeningJobs.set(jobId, job);
  return job;
}

/**
 * Test security hardening
 */
export async function testSecurityHardening(
  jobId: string,
  testResults: {
    inputSanitizationResults?: InputSanitizationResults;
    outputFilteringResults?: OutputFilteringResults;
    modelHardeningResults?: ModelHardeningResults;
    adversarialDefenseResults?: AdversarialDefenseResults;
    securityTestingResults?: SecurityTestingResults;
  }
): Promise<SecurityHardeningJob | null> {
  const job = securityHardeningJobs.get(jobId);
  if (!job || job.status !== 'hardening' && job.status !== 'testing') return null;

  job.status = 'testing';
  job.updatedAt = new Date().toISOString();

  job.results = {
    ...job.results,
    ...testResults,
  };

  securityHardeningJobs.set(jobId, job);
  return job;
}

/**
 * Cancel security hardening job
 */
export async function cancelSecurityHardeningJob(
  jobId: string
): Promise<SecurityHardeningJob | null> {
  const job = securityHardeningJobs.get(jobId);
  if (!job || job.status === 'completed' || job.status === 'cancelled') return null;

  job.status = 'cancelled';
  job.completedAt = new Date().toISOString();
  job.updatedAt = job.completedAt;

  securityHardeningJobs.set(jobId, job);
  return job;
}

/**
 * Get security hardening job by ID
 */
export async function getSecurityHardeningJob(
  jobId: string
): Promise<SecurityHardeningJob | null> {
  return securityHardeningJobs.get(jobId) || null;
}

/**
 * List security hardening jobs for an organization
 */
export async function listSecurityHardeningJobs(
  organizationId: string,
  filters?: { status?: SecurityHardeningStatus; hardeningType?: SecurityHardeningType }
): Promise<SecurityHardeningJob[]> {
  let orgJobs = Array.from(securityHardeningJobs.values()).filter((j) => j.organizationId === organizationId);

  if (filters?.status) {
    orgJobs = orgJobs.filter((j) => j.status === filters.status);
  }

  if (filters?.hardeningType) {
    orgJobs = orgJobs.filter((j) => j.hardeningType === filters.hardeningType);
  }

  return orgJobs;
}

/**
 * Get security hardening dashboard
 */
export async function getSecurityHardeningDashboard(
  organizationId: string
): Promise<SecurityHardeningDashboard> {
  const orgJobs = await listSecurityHardeningJobs(organizationId);

  const completedJobs = orgJobs.filter((j) => j.status === 'completed');

  const averageSecurityScore = completedJobs.length > 0
    ? completedJobs.reduce((sum, j) => sum + j.securityScore.overallScore, 0) / completedJobs.length
    : 0;

  const gradeMap: Record<SecurityGrade, number> = { 'A+': 5, 'A': 4, 'B': 3, 'C': 2, 'D': 1, 'F': 0 };
  const averageGradeValue = completedJobs.length > 0
    ? completedJobs.reduce((sum, j) => sum + gradeMap[j.securityScore.securityGrade], 0) / completedJobs.length
    : 0;
  
  const gradeValueMap: Record<number, SecurityGrade> = { 5: 'A+', 4: 'A', 3: 'B', 2: 'C', 1: 'D', 0: 'F' };
  const averageSecurityGrade = gradeValueMap[Math.round(averageGradeValue)] || 'F';

  const recentHardeningJobs = orgJobs
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  // Calculate vulnerability summary
  const allVulnerabilities = completedJobs.flatMap((j) => j.results.vulnerabilities);
  const criticalVulnerabilities = allVulnerabilities.filter((v) => v.severity === 'critical').length;
  const highVulnerabilities = allVulnerabilities.filter((v) => v.severity === 'high').length;
  const mediumVulnerabilities = allVulnerabilities.filter((v) => v.severity === 'medium').length;
  const lowVulnerabilities = allVulnerabilities.filter((v) => v.severity === 'low').length;
  const mitigatedVulnerabilities = allVulnerabilities.filter((v) => v.mitigations.length > 0).length;

  const vulnerabilitySummary: VulnerabilitySummary = {
    totalVulnerabilities: allVulnerabilities.length,
    criticalVulnerabilities,
    highVulnerabilities,
    mediumVulnerabilities,
    lowVulnerabilities,
    mitigatedVulnerabilities,
    mitigationRate: allVulnerabilities.length > 0 ? (mitigatedVulnerabilities / allVulnerabilities.length) * 100 : 0,
  };

  // Calculate security trends (last 30 days)
  const securityTrends: SecurityTrend[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dayJobs = orgJobs.filter((j) => j.createdAt.startsWith(dateStr));
    const dayCompletedJobs = dayJobs.filter((j) => j.status === 'completed');

    const dayVulnerabilities = dayCompletedJobs.flatMap((j) => j.results.vulnerabilities);
    const dayMitigated = dayVulnerabilities.filter((v) => v.mitigations.length > 0).length;

    securityTrends.push({
      date: dateStr,
      jobCount: dayJobs.length,
      averageSecurityScore: dayCompletedJobs.length > 0
        ? dayCompletedJobs.reduce((sum, j) => sum + j.securityScore.overallScore, 0) / dayCompletedJobs.length
        : 0,
      vulnerabilityCount: dayVulnerabilities.length,
      mitigationRate: dayVulnerabilities.length > 0 ? (dayMitigated / dayVulnerabilities.length) * 100 : 0,
    });
  }

  securityTrends.reverse();

  // Calculate security grade distribution
  const securityGradeDistribution: SecurityGradeDistribution = {
    excellent: 0,
    good: 0,
    acceptable: 0,
    poor: 0,
  };

  for (const job of completedJobs) {
    const grade = job.securityScore.securityGrade;
    if (grade === 'A+' || grade === 'A') securityGradeDistribution.excellent++;
    else if (grade === 'B') securityGradeDistribution.good++;
    else if (grade === 'C') securityGradeDistribution.acceptable++;
    else securityGradeDistribution.poor++;
  }

  // Get top vulnerabilities
  const topVulnerabilities = allVulnerabilities
    .sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    })
    .slice(0, 10);

  return {
    organizationId,
    totalHardeningJobs: orgJobs.length,
    completedHardeningJobs: completedJobs.length,
    averageSecurityScore,
    averageSecurityGrade,
    recentHardeningJobs,
    vulnerabilitySummary,
    securityTrends,
    securityGradeDistribution,
    topVulnerabilities,
  };
}
