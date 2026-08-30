/**
 * Module 64: AI Risk Assessment Service
 *
 * Provides systematic AI risk identification, classification, scoring, and assessment
 * workflows. Supports AI-specific risk categories, regulatory risk level classification
 * (EU AI Act), risk scoring models, and risk prioritization.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AIRisk {
  id: string;
  organizationId: string;
  riskKey: string;
  title: string;
  description: string;
  category: AIRiskCategory;
  subcategory?: string;
  likelihood: LikelihoodLevel;
  impact: ImpactLevel;
  riskScore: number;
  riskLevel: AIRiskLevel;
  regulatoryLevel: RegulatoryRiskLevel;
  status: RiskStatus;
  affectedModels: AffectedModel[];
  affectedSystems: string[];
  stakeholders: string[];
  assessmentId?: string;
  identifiedBy: string;
  identifiedAt: string;
  lastReviewedAt?: string;
  nextReviewDate?: string;
  metadata?: Record<string, any>;
}

export type AIRiskCategory =
  | 'model-risk'
  | 'data-risk'
  | 'operational-risk'
  | 'ethical-risk'
  | 'regulatory-risk'
  | 'security-risk'
  | 'business-risk'
  | 'technical-risk'
  | 'reputational-risk'
  | 'financial-risk';

export type LikelihoodLevel = 1 | 2 | 3 | 4 | 5; // 1=Rare, 2=Unlikely, 3=Possible, 4=Likely, 5=Almost Certain

export type ImpactLevel = 1 | 2 | 3 | 4 | 5; // 1=Negligible, 2=Minor, 3=Moderate, 4=Major, 5=Catastrophic

export type AIRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type RegulatoryRiskLevel = 'minimal' | 'limited' | 'high' | 'unacceptable'; // EU AI Act

export type RiskStatus =
  | 'identified'
  | 'assessed'
  | 'prioritized'
  | 'treatment-planned'
  | 'mitigating'
  | 'monitoring'
  | 'resolved'
  | 'accepted'
  | 'closed';

export interface AffectedModel {
  modelId: string;
  modelName: string;
  modelVersion?: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
}

export interface RiskAssessment {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  type: AssessmentType;
  scope: AssessmentScope;
  status: AssessmentStatus;
  methodology: AssessmentMethodology;
  risks: string[]; // Risk IDs
  riskMatrix: RiskMatrix;
  summary: AssessmentSummary;
  assessorId: string;
  assessorName: string;
  reviewers: Reviewer[];
  startedAt: string;
  completedAt?: string;
  nextReviewDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type AssessmentType =
  | 'initial-assessment'
  | 'periodic-review'
  | 'change-triggered'
  | 'incident-triggered'
  | 'regulatory-review'
  | 'pre-deployment'
  | 'post-deployment';

export interface AssessmentScope {
  modelIds?: string[];
  systemIds?: string[];
  businessUnits?: string[];
  processes?: string[];
  dataDomains?: string[];
  timeRange?: { start: string; end: string };
}

export type AssessmentStatus =
  | 'planning'
  | 'in-progress'
  | 'review'
  | 'completed'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export interface AssessmentMethodology {
  name: string;
  version: string;
  description: string;
  scoringModel: 'qualitative' | 'quantitative' | 'hybrid';
  riskCategories: AIRiskCategory[];
  assessmentCriteria: AssessmentCriterion[];
  questionnaires?: Questionnaire[];
}

export interface AssessmentCriterion {
  id: string;
  category: AIRiskCategory;
  name: string;
  description: string;
  weight: number;
  scoringGuide: string;
}

export interface Questionnaire {
  id: string;
  name: string;
  description: string;
  category: AIRiskCategory;
  questions: Question[];
}

export interface Question {
  id: string;
  text: string;
  type: 'yes-no' | 'multiple-choice' | 'scale' | 'text';
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  weight: number;
  riskIndicator: 'increases' | 'decreases' | 'neutral';
}

export interface RiskMatrix {
  rows: number;
  cols: number;
  cells: RiskMatrixCell[];
  legend: RiskMatrixLegend;
}

export interface RiskMatrixCell {
  likelihood: LikelihoodLevel;
  impact: ImpactLevel;
  riskLevel: AIRiskLevel;
  riskCount: number;
  risks: string[]; // Risk IDs
}

export interface RiskMatrixLegend {
  low: { min: number; max: number; color: string };
  medium: { min: number; max: number; color: string };
  high: { min: number; max: number; color: string };
  critical: { min: number; max: number; color: string };
}

export interface AssessmentSummary {
  totalRisks: number;
  risksByLevel: Record<AIRiskLevel, number>;
  risksByCategory: Record<AIRiskCategory, number>;
  risksByStatus: Record<RiskStatus, number>;
  topRisks: string[]; // Risk IDs
  averageRiskScore: number;
  riskTrend: 'increasing' | 'stable' | 'decreasing';
  keyFindings: string[];
  recommendations: string[];
}

export interface Reviewer {
  userId: string;
  userName: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected' | 'comments';
  comments?: string;
  reviewedAt?: string;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const risks = new Map<string, AIRisk>();
const assessments = new Map<string, RiskAssessment>();
const riskCounter = new Map<string, number>(); // organizationId -> counter

// ─── Risk Management ───────────────────────────────────────────────────────────

/**
 * Create a new AI risk
 */
export async function createRisk(
  organizationId: string,
  risk: Omit<AIRisk, 'id' | 'riskKey' | 'riskScore' | 'riskLevel' | 'identifiedAt'>,
  identifiedBy: string
): Promise<AIRisk> {
  const id = `risk_${randomUUID()}`;
  const counter = (riskCounter.get(organizationId) || 0) + 1;
  riskCounter.set(organizationId, counter);

  const riskScore = calculateRiskScore(risk.likelihood, risk.impact);
  const riskLevel = calculateRiskLevel(riskScore);
  const now = new Date().toISOString();

  const newRisk: AIRisk = {
    ...risk,
    id,
    organizationId,
    riskKey: `AI-RSK-${String(counter).padStart(4, '0')}`,
    riskScore,
    riskLevel,
    identifiedBy,
    identifiedAt: now,
  };

  risks.set(id, newRisk);
  return newRisk;
}

/**
 * Update an existing risk
 */
export async function updateRisk(
  riskId: string,
  updates: Partial<Omit<AIRisk, 'id' | 'riskKey' | 'organizationId' | 'identifiedAt' | 'identifiedBy'>>
): Promise<AIRisk | null> {
  const risk = risks.get(riskId);
  if (!risk) return null;

  // Recalculate risk score if likelihood or impact changed
  if (updates.likelihood || updates.impact) {
    const likelihood = updates.likelihood || risk.likelihood;
    const impact = updates.impact || risk.impact;
    updates.riskScore = calculateRiskScore(likelihood, impact);
    updates.riskLevel = calculateRiskLevel(updates.riskScore);
  }

  const updated: AIRisk = {
    ...risk,
    ...updates,
  };

  risks.set(riskId, updated);
  return updated;
}

/**
 * Get risk by ID
 */
export async function getRisk(riskId: string): Promise<AIRisk | null> {
  return risks.get(riskId) || null;
}

/**
 * List risks for an organization
 */
export async function listRisks(
  organizationId: string,
  filters?: {
    category?: AIRiskCategory;
    riskLevel?: AIRiskLevel;
    status?: RiskStatus;
    modelId?: string;
  }
): Promise<AIRisk[]> {
  const allRisks = Array.from(risks.values()).filter(
    (r) => r.organizationId === organizationId
  );

  return allRisks.filter((r) => {
    if (filters?.category && r.category !== filters.category) return false;
    if (filters?.riskLevel && r.riskLevel !== filters.riskLevel) return false;
    if (filters?.status && r.status !== filters.status) return false;
    if (filters?.modelId && !r.affectedModels.some((m) => m.modelId === filters.modelId)) return false;
    return true;
  });
}

/**
 * Delete a risk
 */
export async function deleteRisk(riskId: string): Promise<boolean> {
  return risks.delete(riskId);
}

// ─── Risk Assessment Management ────────────────────────────────────────────────

/**
 * Create a risk assessment
 */
export async function createAssessment(
  organizationId: string,
  assessment: Omit<RiskAssessment, 'id' | 'risks' | 'riskMatrix' | 'summary' | 'createdAt' | 'updatedAt'>
): Promise<RiskAssessment> {
  const id = `assessment_${randomUUID()}`;
  const now = new Date().toISOString();

  const newAssessment: RiskAssessment = {
    ...assessment,
    id,
    organizationId,
    risks: [],
    riskMatrix: generateEmptyRiskMatrix(),
    summary: {
      totalRisks: 0,
      risksByLevel: { low: 0, medium: 0, high: 0, critical: 0 },
      risksByCategory: {} as Record<AIRiskCategory, number>,
      risksByStatus: {} as Record<RiskStatus, number>,
      topRisks: [],
      averageRiskScore: 0,
      riskTrend: 'stable',
      keyFindings: [],
      recommendations: [],
    },
    createdAt: now,
    updatedAt: now,
  };

  assessments.set(id, newAssessment);
  return newAssessment;
}

/**
 * Add risk to assessment
 */
export async function addRiskToAssessment(
  assessmentId: string,
  riskId: string
): Promise<RiskAssessment | null> {
  const assessment = assessments.get(assessmentId);
  const risk = risks.get(riskId);

  if (!assessment || !risk) return null;

  if (!assessment.risks.includes(riskId)) {
    assessment.risks.push(riskId);
    risk.assessmentId = assessmentId;
    risks.set(riskId, risk);
  }

  // Update risk matrix and summary
  assessment.riskMatrix = generateRiskMatrix(assessment.risks);
  assessment.summary = generateAssessmentSummary(assessment.risks);
  assessment.updatedAt = new Date().toISOString();

  assessments.set(assessmentId, assessment);
  return assessment;
}

/**
 * Update assessment
 */
export async function updateAssessment(
  assessmentId: string,
  updates: Partial<Omit<RiskAssessment, 'id' | 'organizationId' | 'createdAt'>>
): Promise<RiskAssessment | null> {
  const assessment = assessments.get(assessmentId);
  if (!assessment) return null;

  const updated: RiskAssessment = {
    ...assessment,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  assessments.set(assessmentId, updated);
  return updated;
}

/**
 * Get assessment by ID
 */
export async function getAssessment(assessmentId: string): Promise<RiskAssessment | null> {
  return assessments.get(assessmentId) || null;
}

/**
 * List assessments for an organization
 */
export async function listAssessments(
  organizationId: string,
  filters?: { type?: AssessmentType; status?: AssessmentStatus }
): Promise<RiskAssessment[]> {
  const allAssessments = Array.from(assessments.values()).filter(
    (a) => a.organizationId === organizationId
  );

  return allAssessments.filter((a) => {
    if (filters?.type && a.type !== filters.type) return false;
    if (filters?.status && a.status !== filters.status) return false;
    return true;
  });
}

// ─── Risk Scoring and Classification ───────────────────────────────────────────

/**
 * Calculate risk score (likelihood × impact)
 */
function calculateRiskScore(likelihood: LikelihoodLevel, impact: ImpactLevel): number {
  return likelihood * impact;
}

/**
 * Calculate risk level from score
 */
function calculateRiskLevel(score: number): AIRiskLevel {
  if (score >= 20) return 'critical';
  if (score >= 12) return 'high';
  if (score >= 6) return 'medium';
  return 'low';
}

/**
 * Map risk level to regulatory level (EU AI Act)
 */
export function mapToRegulatoryLevel(riskLevel: AIRiskLevel, category: AIRiskCategory): RegulatoryRiskLevel {
  // High-risk AI systems per EU AI Act
  const highRiskCategories: AIRiskCategory[] = [
    'ethical-risk',
    'regulatory-risk',
    'security-risk',
  ];

  if (riskLevel === 'critical') return 'unacceptable';
  if (riskLevel === 'high' && highRiskCategories.includes(category)) return 'high';
  if (riskLevel === 'high' || riskLevel === 'medium') return 'limited';
  return 'minimal';
}

// ─── Risk Matrix Generation ────────────────────────────────────────────────────

/**
 * Generate empty risk matrix
 */
function generateEmptyRiskMatrix(): RiskMatrix {
  const cells: RiskMatrixCell[] = [];

  for (let likelihood = 1; likelihood <= 5; likelihood++) {
    for (let impact = 1; impact <= 5; impact++) {
      const score = likelihood * impact;
      cells.push({
        likelihood: likelihood as LikelihoodLevel,
        impact: impact as ImpactLevel,
        riskLevel: calculateRiskLevel(score),
        riskCount: 0,
        risks: [],
      });
    }
  }

  return {
    rows: 5,
    cols: 5,
    cells,
    legend: {
      low: { min: 1, max: 5, color: '#10b981' },
      medium: { min: 6, max: 11, color: '#f59e0b' },
      high: { min: 12, max: 19, color: '#ef4444' },
      critical: { min: 20, max: 25, color: '#7c2d12' },
    },
  };
}

/**
 * Generate risk matrix with risks
 */
function generateRiskMatrix(riskIds: string[]): RiskMatrix {
  const matrix = generateEmptyRiskMatrix();

  for (const riskId of riskIds) {
    const risk = risks.get(riskId);
    if (!risk) continue;

    const cell = matrix.cells.find(
      (c) => c.likelihood === risk.likelihood && c.impact === risk.impact
    );

    if (cell) {
      cell.riskCount++;
      cell.risks.push(riskId);
    }
  }

  return matrix;
}

/**
 * Generate assessment summary
 */
function generateAssessmentSummary(riskIds: string[]): AssessmentSummary {
  const riskList = riskIds.map((id) => risks.get(id)).filter((r): r is AIRisk => r !== undefined);

  const risksByLevel: Record<AIRiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const risksByCategory: Record<string, number> = {};
  const risksByStatus: Record<string, number> = {};

  let totalScore = 0;

  for (const risk of riskList) {
    risksByLevel[risk.riskLevel]++;
    risksByCategory[risk.category] = (risksByCategory[risk.category] || 0) + 1;
    risksByStatus[risk.status] = (risksByStatus[risk.status] || 0) + 1;
    totalScore += risk.riskScore;
  }

  const topRisks = riskList
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5)
    .map((r) => r.id);

  return {
    totalRisks: riskList.length,
    risksByLevel,
    risksByCategory: risksByCategory as Record<AIRiskCategory, number>,
    risksByStatus: risksByStatus as Record<RiskStatus, number>,
    topRisks,
    averageRiskScore: riskList.length > 0 ? Math.round((totalScore / riskList.length) * 100) / 100 : 0,
    riskTrend: 'stable', // Would calculate from historical data
    keyFindings: [],
    recommendations: [],
  };
}

// ─── Built-in Questionnaires ───────────────────────────────────────────────────

/**
 * Get built-in risk assessment questionnaires
 */
export function getBuiltInQuestionnaires(): Questionnaire[] {
  return [
    {
      id: 'questionnaire_model_risk',
      name: 'Model Risk Assessment',
      description: 'Assess risks related to AI model development and performance',
      category: 'model-risk',
      questions: [
        {
          id: 'q1',
          text: 'Has the model been validated on representative test data?',
          type: 'yes-no',
          weight: 1.0,
          riskIndicator: 'decreases',
        },
        {
          id: 'q2',
          text: 'Is there a process for monitoring model drift?',
          type: 'yes-no',
          weight: 0.8,
          riskIndicator: 'decreases',
        },
        {
          id: 'q3',
          text: 'How would you rate the model\'s explainability?',
          type: 'scale',
          scaleMin: 1,
          scaleMax: 5,
          weight: 0.9,
          riskIndicator: 'decreases',
        },
      ],
    },
    {
      id: 'questionnaire_data_risk',
      name: 'Data Risk Assessment',
      description: 'Assess risks related to data quality, privacy, and governance',
      category: 'data-risk',
      questions: [
        {
          id: 'q1',
          text: 'Does the training data contain personally identifiable information (PII)?',
          type: 'yes-no',
          weight: 1.0,
          riskIndicator: 'increases',
        },
        {
          id: 'q2',
          text: 'Is there a data quality validation process?',
          type: 'yes-no',
          weight: 0.8,
          riskIndicator: 'decreases',
        },
        {
          id: 'q3',
          text: 'How diverse and representative is the training data?',
          type: 'scale',
          scaleMin: 1,
          scaleMax: 5,
          weight: 0.9,
          riskIndicator: 'decreases',
        },
      ],
    },
    {
      id: 'questionnaire_operational_risk',
      name: 'Operational Risk Assessment',
      description: 'Assess risks related to AI system operations and deployment',
      category: 'operational-risk',
      questions: [
        {
          id: 'q1',
          text: 'Is there a rollback plan if the AI system fails?',
          type: 'yes-no',
          weight: 1.0,
          riskIndicator: 'decreases',
        },
        {
          id: 'q2',
          text: 'Are there monitoring and alerting systems in place?',
          type: 'yes-no',
          weight: 0.8,
          riskIndicator: 'decreases',
        },
        {
          id: 'q3',
          text: 'How would you rate the system\'s reliability?',
          type: 'scale',
          scaleMin: 1,
          scaleMax: 5,
          weight: 0.9,
          riskIndicator: 'decreases',
        },
      ],
    },
  ];
}

// ─── Statistics ────────────────────────────────────────────────────────────────

/**
 * Get risk management statistics
 */
export async function getRiskStats(organizationId: string): Promise<{
  totalRisks: number;
  risksByLevel: Record<AIRiskLevel, number>;
  risksByCategory: Record<AIRiskCategory, number>;
  risksByStatus: Record<RiskStatus, number>;
  averageRiskScore: number;
  totalAssessments: number;
  completedAssessments: number;
}> {
  const orgRisks = await listRisks(organizationId);
  const orgAssessments = await listAssessments(organizationId);

  const risksByLevel: Record<AIRiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const risksByCategory: Record<string, number> = {};
  const risksByStatus: Record<string, number> = {};
  let totalScore = 0;

  for (const risk of orgRisks) {
    risksByLevel[risk.riskLevel]++;
    risksByCategory[risk.category] = (risksByCategory[risk.category] || 0) + 1;
    risksByStatus[risk.status] = (risksByStatus[risk.status] || 0) + 1;
    totalScore += risk.riskScore;
  }

  return {
    totalRisks: orgRisks.length,
    risksByLevel,
    risksByCategory: risksByCategory as Record<AIRiskCategory, number>,
    risksByStatus: risksByStatus as Record<RiskStatus, number>,
    averageRiskScore: orgRisks.length > 0 ? Math.round((totalScore / orgRisks.length) * 100) / 100 : 0,
    totalAssessments: orgAssessments.length,
    completedAssessments: orgAssessments.filter((a) => a.status === 'completed' || a.status === 'approved').length,
  };
}
