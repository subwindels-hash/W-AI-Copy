/**
 * Module 71: AI Decision Transparency Service
 *
 * Provides comprehensive decision transparency management including decision path
 * tracking, decision factor documentation, decision audit trails, explanation storage
 * and retrieval, explanation versioning, user-facing explanation generation, and
 * explanation feedback tracking for AI decision transparency and accountability.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AIDecision {
  id: string;
  organizationId: string;
  decisionKey: string;
  modelId: string;
  modelName: string;
  modelVersion: string;
  decisionType: DecisionType;
  input: DecisionInput;
  output: DecisionOutput;
  decisionPath: DecisionPath;
  factors: DecisionFactor[];
  explanations: DecisionExplanation[];
  audit: DecisionAudit;
  metadata: DecisionMetadata;
  status: DecisionStatus;
  createdAt: string;
  updatedAt: string;
}

export type DecisionType =
  | 'classification'
  | 'regression'
  | 'ranking'
  | 'recommendation'
  | 'approval'
  | 'risk-assessment'
  | 'anomaly-detection'
  | 'clustering';

export type DecisionStatus =
  | 'pending'
  | 'completed'
  | 'reviewed'
  | 'appealed'
  | 'overturned'
  | 'archived';

export interface DecisionInput {
  instanceId: string;
  features: Record<string, any>;
  context?: Record<string, any>;
  timestamp: string;
  source?: string;
}

export interface DecisionOutput {
  prediction: any;
  confidence: number;
  probabilities?: Record<string, number>;
  alternatives?: Array<{
    prediction: any;
    confidence: number;
    rank?: number;
  }>;
  timestamp: string;
}

export interface DecisionPath {
  steps: DecisionStep[];
  totalSteps: number;
  executionTimeMs: number;
  pathHash: string;
  version: string;
}

export interface DecisionStep {
  id: string;
  order: number;
  name: string;
  type: 'preprocessing' | 'feature-engineering' | 'model-inference' | 'postprocessing' | 'rule-application' | 'aggregation';
  input: any;
  output: any;
  duration: number;
  metadata?: Record<string, any>;
}

export interface DecisionFactor {
  id: string;
  name: string;
  category: FactorCategory;
  value: any;
  weight: number;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
  evidence?: string;
  confidence: number;
  source: string;
}

export type FactorCategory =
  | 'input-feature'
  | 'derived-feature'
  | 'business-rule'
  | 'model-weight'
  | 'external-data'
  | 'user-preference'
  | 'contextual';

export interface DecisionExplanation {
  id: string;
  explanationId: string; // Reference to ModelExplanation
  type: ExplanationAudienceType;
  content: ExplanationContent;
  generatedAt: string;
  feedback?: ExplanationFeedback;
}

export type ExplanationAudienceType =
  | 'technical'
  | 'business'
  | 'end-user'
  | 'regulator'
  | 'auditor';

export interface ExplanationContent {
  summary: string;
  detailed: string;
  visualization?: any;
  factors: Array<{
    name: string;
    impact: string;
    importance: number;
  }>;
  confidence: number;
  limitations: string[];
  nextSteps?: string[];
  language: string;
}

export interface ExplanationFeedback {
  id: string;
  userId: string;
  rating: number; // 1-5
  helpfulness: 'very-helpful' | 'helpful' | 'neutral' | 'not-helpful' | 'confusing';
  comments?: string;
  improvements?: string[];
  submittedAt: string;
}

export interface DecisionAudit {
  id: string;
  decisionId: string;
  events: AuditEvent[];
  reviewers: DecisionReviewer[];
  appeals: DecisionAppeal[];
  versionHistory: DecisionVersion[];
  complianceStatus: ComplianceStatus;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: AuditAction;
  details: Record<string, any>;
  reason?: string;
}

export type AuditAction =
  | 'decision-created'
  | 'decision_reviewed'
  | 'decision_approved'
  | 'decision_rejected'
  | 'decision_appealed'
  | 'decision_overturned'
  | 'explanation_generated'
  | 'explanation_updated'
  | 'feedback_received'
  | 'decision_archived';

export interface DecisionReviewer {
  id: string;
  userId: string;
  userName: string;
  role: string;
  reviewDate: string;
  decision: 'approved' | 'rejected' | 'requires-changes';
  comments?: string;
  conditions?: string[];
}

export interface DecisionAppeal {
  id: string;
  appellantId: string;
  appellantName: string;
  appellantType: 'user' | 'stakeholder' | 'third-party';
  reason: string;
  grounds: string[];
  submittedAt: string;
  status: 'pending' | 'under-review' | 'upheld' | 'overturned';
  reviewedBy?: string;
  reviewedAt?: string;
  outcome?: string;
}

export interface DecisionVersion {
  version: number;
  decisionId: string;
  changes: string[];
  changedBy: string;
  changedAt: string;
  reason: string;
  snapshot: Partial<AIDecision>;
}

export interface ComplianceStatus {
  regulations: ComplianceRegulation[];
  overallStatus: 'compliant' | 'partial' | 'non-compliant';
  lastAssessed: string;
  nextAssessment: string;
  issues: ComplianceIssue[];
}

export interface ComplianceRegulation {
  name: string;
  jurisdiction: string;
  status: 'compliant' | 'partial' | 'non-compliant';
  requirements: Array<{
    requirement: string;
    status: 'met' | 'partial' | 'not-met';
    evidence?: string;
  }>;
}

export interface ComplianceIssue {
  id: string;
  regulation: string;
  requirement: string;
  issue: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'mitigating' | 'resolved';
  mitigation?: string;
  resolvedAt?: string;
}

export interface ExplanationTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  audienceType: ExplanationAudienceType;
  decisionTypes: DecisionType[];
  template: TemplateStructure;
  variables: TemplateVariable[];
  language: string;
  version: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateStructure {
  summaryTemplate: string;
  detailedTemplate: string;
  factorsTemplate: string;
  sections: TemplateSection[];
}

export interface TemplateSection {
  id: string;
  title: string;
  order: number;
  content: string;
  required: boolean;
  variables: string[];
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'array' | 'object';
  description: string;
  required: boolean;
  defaultValue?: any;
  validation?: Record<string, any>;
}

export interface ExplanationCache {
  id: string;
  decisionId: string;
  explanationId: string;
  audienceType: ExplanationAudienceType;
  cacheKey: string;
  content: ExplanationContent;
  createdAt: string;
  expiresAt: string;
  hitCount: number;
  lastAccessedAt: string;
}

export interface TransparencyDashboard {
  organizationId: string;
  totalDecisions: number;
  decisionsByType: Record<DecisionType, number>;
  decisionsByStatus: Record<DecisionStatus, number>;
  averageConfidence: number;
  explanationCoverage: number; // percentage
  averageFeedbackRating: number;
  recentDecisions: AIDecision[];
  topFactors: Array<{
    factor: string;
    frequency: number;
    averageImpact: number;
  }>;
  complianceRate: number;
  appealRate: number;
  overturnRate: number;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const decisions = new Map<string, AIDecision>();
const templates = new Map<string, ExplanationTemplate>();
const cache = new Map<string, ExplanationCache>();
const decisionCounter = new Map<string, number>();

// ─── Decision Management ───────────────────────────────────────────────────────

/**
 * Record AI decision
 */
export async function recordAIDecision(
  organizationId: string,
  params: {
    modelId: string;
    modelName: string;
    modelVersion: string;
    decisionType: DecisionType;
    input: DecisionInput;
    output: DecisionOutput;
    decisionPath: DecisionPath;
    factors: Omit<DecisionFactor, 'id'>[];
    metadata?: Partial<DecisionMetadata>;
  }
): Promise<AIDecision> {
  const id = `dec_${randomUUID()}`;
  const counter = (decisionCounter.get(organizationId) || 0) + 1;
  decisionCounter.set(organizationId, counter);

  const now = new Date().toISOString();
  const decisionKey = `DEC-${now.slice(0, 10).replace(/-/g, '')}-${String(counter).padStart(6, '0')}`;

  const factors: DecisionFactor[] = params.factors.map((f) => ({
    ...f,
    id: `factor_${randomUUID()}`,
  }));

  const decision: AIDecision = {
    id,
    organizationId,
    decisionKey,
    modelId: params.modelId,
    modelName: params.modelName,
    modelVersion: params.modelVersion,
    decisionType: params.decisionType,
    input: params.input,
    output: params.output,
    decisionPath: params.decisionPath,
    factors,
    explanations: [],
    audit: {
      id: `audit_${randomUUID()}`,
      decisionId: id,
      events: [
        {
          id: `event_${randomUUID()}`,
          timestamp: now,
          actor: 'system',
          action: 'decision_created',
          details: {
            modelId: params.modelId,
            decisionType: params.decisionType,
            prediction: params.output.prediction,
          },
        },
      ],
      reviewers: [],
      appeals: [],
      versionHistory: [],
      complianceStatus: {
        regulations: [],
        overallStatus: 'compliant',
        lastAssessed: now,
        nextAssessment: now,
        issues: [],
      },
    },
    metadata: {
      environment: 'production',
      latencyMs: params.decisionPath.executionTimeMs,
      region: 'us-east-1',
      ...params.metadata,
    } as DecisionMetadata,
    status: 'completed',
    createdAt: now,
    updatedAt: now,
  };

  decisions.set(id, decision);
  return decision;
}

/**
 * Generate user-facing explanation
 */
export async function generateUserExplanation(
  decisionId: string,
  audienceType: ExplanationAudienceType,
  params: {
    explanationId: string;
    templateId?: string;
    language?: string;
    customizations?: Record<string, any>;
  }
): Promise<DecisionExplanation | null> {
  const decision = decisions.get(decisionId);
  if (!decision) return null;

  const id = `expl_${randomUUID()}`;
  const now = new Date().toISOString();

  // Get template or use default
  const template = params.templateId ? templates.get(params.templateId) : null;

  // Generate explanation content
  const content = generateExplanationContent(decision, audienceType, template, params.customizations);

  const explanation: DecisionExplanation = {
    id,
    explanationId: params.explanationId,
    type: audienceType,
    content,
    generatedAt: now,
  };

  decision.explanations.push(explanation);
  decision.updatedAt = now;

  // Add audit event
  decision.audit.events.push({
    id: `event_${randomUUID()}`,
    timestamp: now,
    actor: 'system',
    action: 'explanation_generated',
    details: {
      explanationId: id,
      audienceType,
      explanationId: params.explanationId,
    },
  });

  // Cache explanation
  const cacheKey = `${decisionId}_${audienceType}_${params.language || 'en'}`;
  cache.set(cacheKey, {
    id: `cache_${randomUUID()}`,
    decisionId,
    explanationId: id,
    audienceType,
    cacheKey,
    content,
    createdAt: now,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    hitCount: 1,
    lastAccessedAt: now,
  });

  decisions.set(decisionId, decision);
  return explanation;
}

/**
 * Submit explanation feedback
 */
export async function submitExplanationFeedback(
  decisionId: string,
  explanationId: string,
  feedback: Omit<ExplanationFeedback, 'id' | 'submittedAt'>
): Promise<ExplanationFeedback | null> {
  const decision = decisions.get(decisionId);
  if (!decision) return null;

  const explanation = decision.explanations.find((e) => e.id === explanationId);
  if (!explanation) return null;

  const newFeedback: ExplanationFeedback = {
    ...feedback,
    id: `feedback_${randomUUID()}`,
    submittedAt: new Date().toISOString(),
  };

  explanation.feedback = newFeedback;
  decision.updatedAt = newFeedback.submittedAt;

  // Add audit event
  decision.audit.events.push({
    id: `event_${randomUUID()}`,
    timestamp: newFeedback.submittedAt,
    actor: feedback.userId,
    action: 'feedback_received',
    details: {
      explanationId,
      rating: feedback.rating,
      helpfulness: feedback.helpfulness,
    },
  });

  decisions.set(decisionId, decision);
  return newFeedback;
}

/**
 * Review decision
 */
export async function reviewDecision(
  decisionId: string,
  reviewer: Omit<DecisionReviewer, 'id' | 'reviewDate'>
): Promise<DecisionReviewer | null> {
  const decision = decisions.get(decisionId);
  if (!decision) return null;

  const newReviewer: DecisionReviewer = {
    ...reviewer,
    id: `reviewer_${randomUUID()}`,
    reviewDate: new Date().toISOString(),
  };

  decision.audit.reviewers.push(newReviewer);
  decision.status = 'reviewed';
  decision.updatedAt = newReviewer.reviewDate;

  // Add audit event
  decision.audit.events.push({
    id: `event_${randomUUID()}`,
    timestamp: newReviewer.reviewDate,
    actor: reviewer.userId,
    action: reviewer.decision === 'approved' ? 'decision_approved' : reviewer.decision === 'rejected' ? 'decision_rejected' : 'decision_reviewed',
    details: {
      reviewerId: newReviewer.id,
      decision: reviewer.decision,
      comments: reviewer.comments,
    },
  });

  decisions.set(decisionId, decision);
  return newReviewer;
}

/**
 * Appeal decision
 */
export async function appealDecision(
  decisionId: string,
  appeal: Omit<DecisionAppeal, 'id' | 'submittedAt' | 'status'>
): Promise<DecisionAppeal | null> {
  const decision = decisions.get(decisionId);
  if (!decision) return null;

  const newAppeal: DecisionAppeal = {
    ...appeal,
    id: `appeal_${randomUUID()}`,
    submittedAt: new Date().toISOString(),
    status: 'pending',
  };

  decision.audit.appeals.push(newAppeal);
  decision.status = 'appealed';
  decision.updatedAt = newAppeal.submittedAt;

  // Add audit event
  decision.audit.events.push({
    id: `event_${randomUUID()}`,
    timestamp: newAppeal.submittedAt,
    actor: appeal.appellantId,
    action: 'decision_appealed',
    details: {
      appealId: newAppeal.id,
      reason: appeal.reason,
      grounds: appeal.grounds,
    },
  });

  decisions.set(decisionId, decision);
  return newAppeal;
}

/**
 * Resolve appeal
 */
export async function resolveAppeal(
  decisionId: string,
  appealId: string,
  resolution: {
    reviewedBy: string;
    outcome: 'upheld' | 'overturned';
    reason: string;
  }
): Promise<DecisionAppeal | null> {
  const decision = decisions.get(decisionId);
  if (!decision) return null;

  const appeal = decision.audit.appeals.find((a) => a.id === appealId);
  if (!appeal) return null;

  appeal.status = resolution.outcome;
  appeal.reviewedBy = resolution.reviewedBy;
  appeal.reviewedAt = new Date().toISOString();
  appeal.outcome = resolution.reason;

  if (resolution.outcome === 'overturned') {
    decision.status = 'overturned';
  }

  decision.updatedAt = appeal.reviewedAt;

  // Add audit event
  decision.audit.events.push({
    id: `event_${randomUUID()}`,
    timestamp: appeal.reviewedAt,
    actor: resolution.reviewedBy,
    action: resolution.outcome === 'overturned' ? 'decision_overturned' : 'decision_reviewed',
    details: {
      appealId,
      outcome: resolution.outcome,
      reason: resolution.reason,
    },
  });

  decisions.set(decisionId, decision);
  return appeal;
}

/**
 * Create explanation template
 */
export async function createExplanationTemplate(
  organizationId: string,
  template: Omit<ExplanationTemplate, 'id' | 'createdAt' | 'updatedAt'>,
  createdBy: string
): Promise<ExplanationTemplate> {
  const id = `template_${randomUUID()}`;
  const now = new Date().toISOString();

  const newTemplate: ExplanationTemplate = {
    ...template,
    id,
    organizationId,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  templates.set(id, newTemplate);
  return newTemplate;
}

/**
 * Get decision by ID
 */
export async function getAIDecision(decisionId: string): Promise<AIDecision | null> {
  return decisions.get(decisionId) || null;
}

/**
 * List decisions for an organization
 */
export async function listAIDecisions(
  organizationId: string,
  filters?: {
    modelId?: string;
    decisionType?: DecisionType;
    status?: DecisionStatus;
    startDate?: string;
    endDate?: string;
  }
): Promise<AIDecision[]> {
  const allDecisions = Array.from(decisions.values()).filter(
    (d) => d.organizationId === organizationId
  );

  return allDecisions.filter((d) => {
    if (filters?.modelId && d.modelId !== filters.modelId) return false;
    if (filters?.decisionType && d.decisionType !== filters.decisionType) return false;
    if (filters?.status && d.status !== filters.status) return false;
    if (filters?.startDate && d.createdAt < filters.startDate) return false;
    if (filters?.endDate && d.createdAt > filters.endDate) return false;
    return true;
  });
}

/**
 * Get transparency dashboard
 */
export async function getTransparencyDashboard(organizationId: string): Promise<TransparencyDashboard> {
  const allDecisions = await listAIDecisions(organizationId);

  const decisionsByType: Record<string, number> = {};
  const decisionsByStatus: Record<string, number> = {};
  const factorCounts = new Map<string, { frequency: number; totalImpact: number }>();

  let totalConfidence = 0;
  let totalExplanations = 0;
  let totalFeedbackRating = 0;
  let feedbackCount = 0;
  let appealedCount = 0;
  let overturnedCount = 0;

  for (const decision of allDecisions) {
    decisionsByType[decision.decisionType] = (decisionsByType[decision.decisionType] || 0) + 1;
    decisionsByStatus[decision.status] = (decisionsByStatus[decision.status] || 0) + 1;

    totalConfidence += decision.output.confidence;
    totalExplanations += decision.explanations.length;

    for (const explanation of decision.explanations) {
      if (explanation.feedback) {
        totalFeedbackRating += explanation.feedback.rating;
        feedbackCount++;
      }
    }

    for (const factor of decision.factors) {
      const current = factorCounts.get(factor.name) || { frequency: 0, totalImpact: 0 };
      factorCounts.set(factor.name, {
        frequency: current.frequency + 1,
        totalImpact: current.totalImpact + factor.weight,
      });
    }

    if (decision.status === 'appealed' || decision.audit.appeals.length > 0) {
      appealedCount++;
    }
    if (decision.status === 'overturned') {
      overturnedCount++;
    }
  }

  const topFactors = Array.from(factorCounts.entries())
    .map(([factor, data]) => ({
      factor,
      frequency: data.frequency,
      averageImpact: data.totalImpact / data.frequency,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);

  const explanationCoverage = allDecisions.length > 0
    ? (allDecisions.filter((d) => d.explanations.length > 0).length / allDecisions.length) * 100
    : 0;

  const compliantDecisions = allDecisions.filter((d) => d.audit.complianceStatus.overallStatus === 'compliant').length;
  const complianceRate = allDecisions.length > 0 ? (compliantDecisions / allDecisions.length) * 100 : 100;

  const appealRate = allDecisions.length > 0 ? (appealedCount / allDecisions.length) * 100 : 0;
  const overturnRate = appealedCount > 0 ? (overturnedCount / appealedCount) * 100 : 0;

  return {
    organizationId,
    totalDecisions: allDecisions.length,
    decisionsByType: decisionsByType as Record<DecisionType, number>,
    decisionsByStatus: decisionsByStatus as Record<DecisionStatus, number>,
    averageConfidence: allDecisions.length > 0 ? totalConfidence / allDecisions.length : 0,
    explanationCoverage: Math.round(explanationCoverage * 100) / 100,
    averageFeedbackRating: feedbackCount > 0 ? totalFeedbackRating / feedbackCount : 0,
    recentDecisions: allDecisions
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10),
    topFactors,
    complianceRate: Math.round(complianceRate * 100) / 100,
    appealRate: Math.round(appealRate * 100) / 100,
    overturnRate: Math.round(overturnRate * 100) / 100,
  };
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function generateExplanationContent(
  decision: AIDecision,
  audienceType: ExplanationAudienceType,
  template: ExplanationTemplate | null,
  customizations?: Record<string, any>
): ExplanationContent {
  const topFactors = decision.factors
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 5);

  let summary = '';
  let detailed = '';

  switch (audienceType) {
    case 'technical':
      summary = `Model ${decision.modelName} v${decision.modelVersion} made a ${decision.decisionType} decision with ${Math.round(decision.output.confidence * 100)}% confidence.`;
      detailed = `The decision was based on ${decision.factors.length} factors. Top contributing factors: ${topFactors.map(f => `${f.name} (${f.impact} impact, weight: ${f.weight.toFixed(3)})`).join(', ')}. The decision path included ${decision.decisionPath.totalSteps} steps and took ${decision.decisionPath.executionTimeMs}ms to execute.`;
      break;
    case 'business':
      summary = `The AI system made a ${decision.decisionType} decision with high confidence (${Math.round(decision.output.confidence * 100)}%).`;
      detailed = `Key business factors that influenced this decision: ${topFactors.filter(f => f.category === 'business-rule' || f.category === 'input-feature').map(f => f.description).join('; ')}. This decision aligns with our business objectives and compliance requirements.`;
      break;
    case 'end-user':
      summary = `We've made a decision based on the information you provided.`;
      detailed = `Your decision was influenced by: ${topFactors.slice(0, 3).map(f => f.description).join(', ')}. We're ${Math.round(decision.output.confidence * 100)}% confident in this decision. If you have questions or would like to appeal, please contact support.`;
      break;
    case 'regulator':
      summary = `AI decision made in compliance with applicable regulations.`;
      detailed = `This ${decision.decisionType} decision was made by model ${decision.modelName} v${decision.modelVersion} with ${Math.round(decision.output.confidence * 100)}% confidence. The decision is based on ${decision.factors.length} documented factors and follows a transparent ${decision.decisionPath.totalSteps}-step process. All decisions are auditable and explainable per regulatory requirements.`;
      break;
    case 'auditor':
      summary = `Auditable AI decision with complete transparency.`;
      detailed = `Decision ID: ${decision.decisionKey}. Model: ${decision.modelName} v${decision.modelVersion}. Type: ${decision.decisionType}. Confidence: ${Math.round(decision.output.confidence * 100)}%. Factors: ${decision.factors.length}. Decision path: ${decision.decisionPath.totalSteps} steps, ${decision.decisionPath.executionTimeMs}ms. Full audit trail available.`;
      break;
  }

  return {
    summary,
    detailed,
    factors: topFactors.map((f) => ({
      name: f.name,
      impact: f.impact,
      importance: Math.abs(f.weight),
    })),
    confidence: decision.output.confidence,
    limitations: [
      'Based on available data at decision time',
      'Model performance may vary with different input distributions',
      'External factors not captured in model may influence outcomes',
    ],
    nextSteps: audienceType === 'end-user' ? [
      'Contact support if you have questions',
      'Submit an appeal if you believe the decision is incorrect',
      'Provide feedback to help improve our explanations',
    ] : undefined,
    language: customizations?.language || 'en',
  };
}

export interface DecisionMetadata {
  environment: string;
  latencyMs: number;
  region: string;
  tags?: string[];
  notes?: string;
}
