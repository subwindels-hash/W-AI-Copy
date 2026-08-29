/**
 * Module 40: Model Cards & Documentation Service
 *
 * Creates and manages model cards, bias audits, fairness reports,
 * stakeholder documentation, and transparency reports for AI models.
 *
 * Phase 1 — Critical Gap: AI model documentation and transparency infrastructure
 */

import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModelCardStatus = "draft" | "review" | "published" | "deprecated" | "archived";

export type IntendedUse =
  | "classification"
  | "regression"
  | "generation"
  | "recommendation"
  | "detection"
  | "translation"
  | "summarization"
  | "clustering"
  | "custom";

export type ModelLimitation =
  | "bias"
  | "accuracy"
  | "generalization"
  | "robustness"
  | "fairness"
  | "privacy"
  | "security"
  | "interpretability"
  | "custom";

export type EthicalConsideration =
  | "bias"
  | "fairness"
  | "privacy"
  | "transparency"
  | "accountability"
  | "safety"
  | "environmental_impact"
  | "social_impact"
  | "custom";

export interface ModelCard {
  id: string;
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  status: ModelCardStatus;
  
  // Basic Information
  overview: {
    description: string;
    intendedUse: IntendedUse[];
    outOfScopeUse?: string[];
    targetUsers?: string[];
    useCases?: string[];
  };
  
  // Model Details
  modelDetails: {
    architecture?: string;
    framework?: string;
    algorithm?: string;
    inputFormat?: string;
    outputFormat?: string;
    modelSize?: string;
    inferenceLatency?: string;
    languages?: string[];
    version?: string;
    license?: string;
  };
  
  // Training Data
  trainingData: {
    datasets?: DatasetInfo[];
    dataCollectionMethod?: string;
    dataPreprocessing?: string;
    dataVolume?: string;
    dataTimeframe?: string;
    knownBiases?: string[];
    dataLimitations?: string[];
  };
  
  // Performance
  performance: {
    metrics?: PerformanceMetric[];
    evaluationDatasets?: DatasetInfo[];
    benchmarks?: BenchmarkResult[];
    performanceAcrossGroups?: GroupPerformance[];
  };
  
  // Limitations
  limitations: {
    technicalLimitations?: ModelLimitation[];
    knownFailureModes?: string[];
    edgeCases?: string[];
    constraints?: string[];
  };
  
  // Ethical Considerations
  ethicalConsiderations: {
    considerations?: EthicalConsideration[];
    biasAnalysis?: BiasAnalysis;
    fairnessMetrics?: FairnessMetric[];
    privacyMeasures?: string[];
    environmentalImpact?: string;
    socialImpact?: string;
    recommendations?: string[];
  };
  
  // Deployment
  deployment: {
    deploymentEnvironment?: string;
    monitoringPlan?: string;
    maintenanceSchedule?: string;
    updatePolicy?: string;
    deprecationPlan?: string;
  };
  
  // Governance
  governance: {
    owners?: string[];
    reviewers?: string[];
    approvers?: string[];
    approvalDate?: string;
    reviewFrequency?: string;
    complianceFrameworks?: string[];
    auditTrail?: string;
  };
  
  // Additional
  references?: string[];
  citations?: string[];
  contactInformation?: string;
  changelog?: ChangelogEntry[];
  
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  publishedBy?: string;
}

export interface DatasetInfo {
  name: string;
  description?: string;
  size?: string;
  source?: string;
  license?: string;
  timeframe?: string;
  demographics?: Record<string, unknown>;
  url?: string;
}

export interface PerformanceMetric {
  name: string;
  value: number;
  unit?: string;
  dataset?: string;
  confidence?: number;
  description?: string;
}

export interface BenchmarkResult {
  benchmark: string;
  score: number;
  rank?: number;
  comparisonModels?: Array<{ name: string; score: number }>;
  date?: string;
}

export interface GroupPerformance {
  groupName: string;
  groupAttribute: string;
  metric: string;
  value: number;
  sampleSize?: number;
  confidence?: number;
}

export interface BiasAnalysis {
  protectedAttributes?: string[];
  biasTypes?: string[];
  severity: "low" | "medium" | "high" | "critical";
  findings?: string[];
  mitigations?: string[];
  testedAt?: string;
  testedBy?: string;
}

export interface FairnessMetric {
  metric: string;
  value: number;
  threshold?: number;
  passed?: boolean;
  groupComparison?: Record<string, number>;
  description?: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  author: string;
  changes: string[];
  impact?: "low" | "medium" | "high";
}

export interface BiasAuditReport {
  id: string;
  organizationId: string;
  modelCardId: string;
  modelName: string;
  modelVersion: string;
  auditDate: string;
  auditor: string;
  
  // Scope
  scope: {
    protectedAttributes: string[];
    biasTypes: string[];
    datasets: string[];
    metrics: string[];
  };
  
  // Findings
  findings: BiasFinding[];
  
  // Overall Assessment
  overallSeverity: "low" | "medium" | "high" | "critical";
  overallScore: number; // 0-100
  passed: boolean;
  
  // Recommendations
  recommendations: string[];
  mitigations: string[];
  
  // Next Steps
  nextAuditDate?: string;
  followUpActions?: string[];
  
  status: "draft" | "completed" | "reviewed" | "approved";
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  
  createdAt: string;
  updatedAt: string;
}

export interface BiasFinding {
  id: string;
  attribute: string;
  biasType: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  evidence: string;
  affectedGroups: string[];
  metricValue?: number;
  threshold?: number;
  recommendation: string;
  status: "open" | "mitigated" | "accepted" | "deferred";
  mitigationPlan?: string;
  mitigatedAt?: string;
}

export interface FairnessReport {
  id: string;
  organizationId: string;
  modelCardId: string;
  modelName: string;
  modelVersion: string;
  reportDate: string;
  author: string;
  
  // Fairness Definition
  fairnessDefinition: {
    approach: string;
    metrics: string[];
    protectedAttributes: string[];
    thresholds: Record<string, number>;
  };
  
  // Results
  results: FairnessResult[];
  
  // Overall Assessment
  overallFairness: "fair" | "conditionally_fair" | "unfair";
  overallScore: number; // 0-100
  passed: boolean;
  
  // Analysis
  analysis: string;
  limitations: string[];
  recommendations: string[];
  
  status: "draft" | "completed" | "reviewed" | "approved";
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  
  createdAt: string;
  updatedAt: string;
}

export interface FairnessResult {
  metric: string;
  protectedAttribute: string;
  value: number;
  threshold: number;
  passed: boolean;
  groups: Record<string, number>;
  disparity: number;
  interpretation: string;
}

export interface TransparencyReport {
  id: string;
  organizationId: string;
  title: string;
  reportDate: string;
  author: string;
  
  // Summary
  executiveSummary: string;
  keyFindings: string[];
  
  // Models Covered
  models: Array<{
    modelCardId: string;
    modelName: string;
    modelVersion: string;
    status: string;
    riskLevel?: string;
  }>;
  
  // Compliance
  complianceStatus: {
    frameworks: string[];
    passed: number;
    failed: number;
    pending: number;
  };
  
  // Bias & Fairness
  biasAudits: {
    total: number;
    passed: number;
    failed: number;
    criticalFindings: number;
  };
  
  fairnessReports: {
    total: number;
    fair: number;
    conditionallyFair: number;
    unfair: number;
  };
  
  // Governance
  governanceMetrics: {
    policiesActive: number;
    violationsOpen: number;
    riskAssessments: number;
    averageRiskScore: number;
  };
  
  // Recommendations
  recommendations: string[];
  actionItems: string[];
  
  // Next Report
  nextReportDate?: string;
  
  status: "draft" | "published" | "archived";
  publishedAt?: string;
  publishedBy?: string;
  
  createdAt: string;
  updatedAt: string;
}

export interface DocumentationStats {
  totalModelCards: number;
  publishedModelCards: number;
  draftModelCards: number;
  totalBiasAudits: number;
  passedBiasAudits: number;
  failedBiasAudits: number;
  totalFairnessReports: number;
  fairModels: number;
  unfairModels: number;
  totalTransparencyReports: number;
  publishedTransparencyReports: number;
  averageDocumentationCompleteness: number;
  modelsWithoutCards: number;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const modelCards = new Map<string, ModelCard>();
const biasAudits = new Map<string, BiasAuditReport>();
const fairnessReports = new Map<string, FairnessReport>();
const transparencyReports = new Map<string, TransparencyReport>();

// ─── Service Implementation ───────────────────────────────────────────────────

/**
 * Create a model card
 */
export async function createModelCard(params: {
  organizationId: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  overview: ModelCard["overview"];
  modelDetails?: ModelCard["modelDetails"];
  trainingData?: ModelCard["trainingData"];
  performance?: ModelCard["performance"];
  limitations?: ModelCard["limitations"];
  ethicalConsiderations?: ModelCard["ethicalConsiderations"];
  deployment?: ModelCard["deployment"];
  governance?: ModelCard["governance"];
  references?: string[];
  citations?: string[];
  contactInformation?: string;
  createdBy: string;
}): Promise<ModelCard> {
  const now = new Date().toISOString();

  const modelCard: ModelCard = {
    id: `card_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    status: "draft",
    overview: params.overview,
    modelDetails: params.modelDetails ?? {},
    trainingData: params.trainingData ?? {},
    performance: params.performance ?? {},
    limitations: params.limitations ?? {},
    ethicalConsiderations: params.ethicalConsiderations ?? {},
    deployment: params.deployment ?? {},
    governance: params.governance ?? {},
    references: params.references ?? [],
    citations: params.citations ?? [],
    contactInformation: params.contactInformation,
    changelog: [
      {
        version: "1.0.0",
        date: now,
        author: params.createdBy,
        changes: ["Initial model card creation"],
        impact: "high",
      },
    ],
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  modelCards.set(modelCard.id, modelCard);
  return modelCard;
}

/**
 * Get a model card by ID
 */
export async function getModelCard(cardId: string): Promise<ModelCard | null> {
  return modelCards.get(cardId) ?? null;
}

/**
 * Get model card by model ID and version
 */
export async function getModelCardByModel(
  modelId: string,
  modelVersion?: string
): Promise<ModelCard | null> {
  const cards = Array.from(modelCards.values()).filter(c => c.modelId === modelId);
  if (modelVersion) {
    return cards.find(c => c.modelVersion === modelVersion) ?? null;
  }
  // Return latest version
  return cards.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/**
 * List model cards for an organization
 */
export async function listModelCards(
  organizationId: string,
  filters?: {
    status?: ModelCardStatus;
    modelId?: string;
    limit?: number;
  }
): Promise<ModelCard[]> {
  let result = Array.from(modelCards.values()).filter(
    c => c.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(c => c.status === filters.status);
  if (filters?.modelId) result = result.filter(c => c.modelId === filters.modelId);

  return result
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Update a model card
 */
export async function updateModelCard(
  cardId: string,
  updates: Partial<Omit<ModelCard, "id" | "organizationId" | "modelId" | "modelName" | "modelVersion" | "createdBy" | "createdAt">>,
  updatedBy: string
): Promise<ModelCard | null> {
  const card = modelCards.get(cardId);
  if (!card) return null;

  const now = new Date().toISOString();
  Object.assign(card, updates);
  card.updatedAt = now;

  // Add changelog entry
  card.changelog = card.changelog ?? [];
  card.changelog.push({
    version: `${card.changelog.length + 1}.0.0`,
    date: now,
    author: updatedBy,
    changes: Object.keys(updates),
    impact: "medium",
  });

  modelCards.set(cardId, card);
  return card;
}

/**
 * Publish a model card
 */
export async function publishModelCard(
  cardId: string,
  publishedBy: string
): Promise<ModelCard | null> {
  const card = modelCards.get(cardId);
  if (!card) return null;

  const now = new Date().toISOString();
  card.status = "published";
  card.publishedAt = now;
  card.publishedBy = publishedBy;
  card.updatedAt = now;

  modelCards.set(cardId, card);
  return card;
}

/**
 * Create a bias audit report
 */
export async function createBiasAuditReport(params: {
  organizationId: string;
  modelCardId: string;
  auditor: string;
  scope: BiasAuditReport["scope"];
  findings: Omit<BiasFinding, "id">[];
  recommendations: string[];
  mitigations: string[];
  nextAuditDate?: string;
  followUpActions?: string[];
}): Promise<BiasAuditReport> {
  const card = modelCards.get(params.modelCardId);
  if (!card) throw new Error(`Model card ${params.modelCardId} not found`);

  const now = new Date().toISOString();

  // Calculate overall severity and score
  const severityScores = { low: 25, medium: 50, high: 75, critical: 100 };
  const findings: BiasFinding[] = params.findings.map(f => ({
    ...f,
    id: `finding_${randomUUID().slice(0, 8)}`,
  }));

  const maxSeverity = findings.reduce(
    (max, f) => Math.max(max, severityScores[f.severity]),
    0
  );
  const overallSeverity = (
    maxSeverity >= 100 ? "critical" : maxSeverity >= 75 ? "high" : maxSeverity >= 50 ? "medium" : "low"
  ) as BiasAuditReport["overallSeverity"];

  const overallScore = findings.length > 0
    ? findings.reduce((sum, f) => sum + severityScores[f.severity], 0) / findings.length
    : 0;

  const passed = overallSeverity !== "critical" && overallSeverity !== "high";

  const report: BiasAuditReport = {
    id: `bias_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    modelCardId: params.modelCardId,
    modelName: card.modelName,
    modelVersion: card.modelVersion,
    auditDate: now,
    auditor: params.auditor,
    scope: params.scope,
    findings,
    overallSeverity,
    overallScore: Math.round(overallScore),
    passed,
    recommendations: params.recommendations,
    mitigations: params.mitigations,
    nextAuditDate: params.nextAuditDate,
    followUpActions: params.followUpActions,
    status: "completed",
    createdAt: now,
    updatedAt: now,
  };

  biasAudits.set(report.id, report);

  // Update model card with bias analysis
  card.ethicalConsiderations.biasAnalysis = {
    protectedAttributes: params.scope.protectedAttributes,
    biasTypes: params.scope.biasTypes,
    severity: overallSeverity,
    findings: findings.map(f => f.description),
    mitigations: params.mitigations,
    testedAt: now,
    testedBy: params.auditor,
  };
  card.updatedAt = now;
  modelCards.set(params.modelCardId, card);

  return report;
}

/**
 * Get bias audit report by ID
 */
export async function getBiasAuditReport(reportId: string): Promise<BiasAuditReport | null> {
  return biasAudits.get(reportId) ?? null;
}

/**
 * List bias audit reports
 */
export async function listBiasAuditReports(
  organizationId: string,
  filters?: {
    modelCardId?: string;
    severity?: BiasAuditReport["overallSeverity"];
    passed?: boolean;
    limit?: number;
  }
): Promise<BiasAuditReport[]> {
  let result = Array.from(biasAudits.values()).filter(
    r => r.organizationId === organizationId
  );

  if (filters?.modelCardId) result = result.filter(r => r.modelCardId === filters.modelCardId);
  if (filters?.severity) result = result.filter(r => r.overallSeverity === filters.severity);
  if (filters?.passed !== undefined) result = result.filter(r => r.passed === filters.passed);

  return result
    .sort((a, b) => b.auditDate.localeCompare(a.auditDate))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Create a fairness report
 */
export async function createFairnessReport(params: {
  organizationId: string;
  modelCardId: string;
  author: string;
  fairnessDefinition: FairnessReport["fairnessDefinition"];
  results: Omit<FairnessResult, "id">[];
  analysis: string;
  limitations: string[];
  recommendations: string[];
}): Promise<FairnessReport> {
  const card = modelCards.get(params.modelCardId);
  if (!card) throw new Error(`Model card ${params.modelCardId} not found`);

  const now = new Date().toISOString();

  const results: FairnessResult[] = params.results.map(r => ({ ...r }));
  const passedCount = results.filter(r => r.passed).length;
  const passRate = results.length > 0 ? passedCount / results.length : 0;

  const overallFairness: FairnessReport["overallFairness"] =
    passRate >= 0.9 ? "fair" : passRate >= 0.7 ? "conditionally_fair" : "unfair";

  const overallScore = Math.round(passRate * 100);
  const passed = overallFairness !== "unfair";

  const report: FairnessReport = {
    id: `fairness_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    modelCardId: params.modelCardId,
    modelName: card.modelName,
    modelVersion: card.modelVersion,
    reportDate: now,
    author: params.author,
    fairnessDefinition: params.fairnessDefinition,
    results,
    overallFairness,
    overallScore,
    passed,
    analysis: params.analysis,
    limitations: params.limitations,
    recommendations: params.recommendations,
    status: "completed",
    createdAt: now,
    updatedAt: now,
  };

  fairnessReports.set(report.id, report);

  // Update model card with fairness metrics
  card.ethicalConsiderations.fairnessMetrics = results.map(r => ({
    metric: r.metric,
    value: r.value,
    threshold: r.threshold,
    passed: r.passed,
    groupComparison: r.groups,
    description: r.interpretation,
  }));
  card.updatedAt = now;
  modelCards.set(params.modelCardId, card);

  return report;
}

/**
 * Get fairness report by ID
 */
export async function getFairnessReport(reportId: string): Promise<FairnessReport | null> {
  return fairnessReports.get(reportId) ?? null;
}

/**
 * List fairness reports
 */
export async function listFairnessReports(
  organizationId: string,
  filters?: {
    modelCardId?: string;
    fairness?: FairnessReport["overallFairness"];
    passed?: boolean;
    limit?: number;
  }
): Promise<FairnessReport[]> {
  let result = Array.from(fairnessReports.values()).filter(
    r => r.organizationId === organizationId
  );

  if (filters?.modelCardId) result = result.filter(r => r.modelCardId === filters.modelCardId);
  if (filters?.fairness) result = result.filter(r => r.overallFairness === filters.fairness);
  if (filters?.passed !== undefined) result = result.filter(r => r.passed === filters.passed);

  return result
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Create a transparency report
 */
export async function createTransparencyReport(params: {
  organizationId: string;
  title: string;
  author: string;
  executiveSummary: string;
  keyFindings: string[];
  models: TransparencyReport["models"];
  complianceStatus: TransparencyReport["complianceStatus"];
  biasAudits: TransparencyReport["biasAudits"];
  fairnessReports: TransparencyReport["fairnessReports"];
  governanceMetrics: TransparencyReport["governanceMetrics"];
  recommendations: string[];
  actionItems: string[];
  nextReportDate?: string;
}): Promise<TransparencyReport> {
  const now = new Date().toISOString();

  const report: TransparencyReport = {
    id: `transparency_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    organizationId: params.organizationId,
    title: params.title,
    reportDate: now,
    author: params.author,
    executiveSummary: params.executiveSummary,
    keyFindings: params.keyFindings,
    models: params.models,
    complianceStatus: params.complianceStatus,
    biasAudits: params.biasAudits,
    fairnessReports: params.fairnessReports,
    governanceMetrics: params.governanceMetrics,
    recommendations: params.recommendations,
    actionItems: params.actionItems,
    nextReportDate: params.nextReportDate,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };

  transparencyReports.set(report.id, report);
  return report;
}

/**
 * Get transparency report by ID
 */
export async function getTransparencyReport(reportId: string): Promise<TransparencyReport | null> {
  return transparencyReports.get(reportId) ?? null;
}

/**
 * List transparency reports
 */
export async function listTransparencyReports(
  organizationId: string,
  filters?: {
    status?: TransparencyReport["status"];
    limit?: number;
  }
): Promise<TransparencyReport[]> {
  let result = Array.from(transparencyReports.values()).filter(
    r => r.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(r => r.status === filters.status);

  return result
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
    .slice(0, filters?.limit ?? 50);
}

/**
 * Publish a transparency report
 */
export async function publishTransparencyReport(
  reportId: string,
  publishedBy: string
): Promise<TransparencyReport | null> {
  const report = transparencyReports.get(reportId);
  if (!report) return null;

  const now = new Date().toISOString();
  report.status = "published";
  report.publishedAt = now;
  report.publishedBy = publishedBy;
  report.updatedAt = now;

  transparencyReports.set(reportId, report);
  return report;
}

/**
 * Get documentation statistics
 */
export async function getDocumentationStats(organizationId: string): Promise<DocumentationStats> {
  const orgCards = Array.from(modelCards.values()).filter(c => c.organizationId === organizationId);
  const orgBiasAudits = Array.from(biasAudits.values()).filter(a => a.organizationId === organizationId);
  const orgFairnessReports = Array.from(fairnessReports.values()).filter(r => r.organizationId === organizationId);
  const orgTransparencyReports = Array.from(transparencyReports.values()).filter(r => r.organizationId === organizationId);

  // Calculate documentation completeness
  const completenessScores = orgCards.map(card => {
    let score = 0;
    if (card.overview.description) score += 10;
    if (card.modelDetails.architecture) score += 10;
    if (card.trainingData.datasets && card.trainingData.datasets.length > 0) score += 15;
    if (card.performance.metrics && card.performance.metrics.length > 0) score += 15;
    if (card.limitations.technicalLimitations && card.limitations.technicalLimitations.length > 0) score += 10;
    if (card.ethicalConsiderations.considerations && card.ethicalConsiderations.considerations.length > 0) score += 15;
    if (card.deployment.deploymentEnvironment) score += 10;
    if (card.governance.owners && card.governance.owners.length > 0) score += 15;
    return score;
  });

  const avgCompleteness = completenessScores.length > 0
    ? completenessScores.reduce((sum, s) => sum + s, 0) / completenessScores.length
    : 0;

  return {
    totalModelCards: orgCards.length,
    publishedModelCards: orgCards.filter(c => c.status === "published").length,
    draftModelCards: orgCards.filter(c => c.status === "draft").length,
    totalBiasAudits: orgBiasAudits.length,
    passedBiasAudits: orgBiasAudits.filter(a => a.passed).length,
    failedBiasAudits: orgBiasAudits.filter(a => !a.passed).length,
    totalFairnessReports: orgFairnessReports.length,
    fairModels: orgFairnessReports.filter(r => r.overallFairness === "fair").length,
    unfairModels: orgFairnessReports.filter(r => r.overallFairness === "unfair").length,
    totalTransparencyReports: orgTransparencyReports.length,
    publishedTransparencyReports: orgTransparencyReports.filter(r => r.status === "published").length,
    averageDocumentationCompleteness: Math.round(avgCompleteness),
    modelsWithoutCards: 0, // Would need to compare with actual models
  };
}
