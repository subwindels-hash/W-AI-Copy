/**
 * Module 64: AI Risk Mitigation Service
 *
 * Provides risk treatment strategy selection, treatment plan management, mitigation
 * action tracking, residual risk calculation, risk monitoring, and risk reporting
 * capabilities for AI systems.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type TreatmentStrategy = 'avoid' | 'mitigate' | 'transfer' | 'accept';

export interface RiskTreatment {
  id: string;
  organizationId: string;
  riskId: string;
  riskKey: string;
  riskTitle: string;
  strategy: TreatmentStrategy;
  rationale: string;
  treatmentPlan: TreatmentPlan;
  residualRisk: ResidualRisk;
  status: TreatmentStatus;
  effectiveness: TreatmentEffectiveness;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentPlan {
  id: string;
  name: string;
  description: string;
  objectives: string[];
  actions: MitigationAction[];
  timeline: {
    startDate: string;
    endDate: string;
    milestones: Milestone[];
  };
  resources: Resource[];
  budget: {
    estimated: number;
    actual: number;
    currency: string;
  };
  owner: {
    userId: string;
    userName: string;
    role: string;
  };
  stakeholders: string[];
}

export interface MitigationAction {
  id: string;
  name: string;
  description: string;
  type: ActionType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: ActionStatus;
  assignee: {
    userId: string;
    userName: string;
  };
  dueDate: string;
  completedAt?: string;
  progress: number; // 0-100
  dependencies: string[]; // Action IDs
  deliverables: Deliverable[];
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

export type ActionType =
  | 'technical-control'
  | 'process-improvement'
  | 'policy-update'
  | 'training'
  | 'monitoring'
  | 'documentation'
  | 'testing'
  | 'review'
  | 'insurance'
  | 'contractual';

export type ActionStatus =
  | 'planned'
  | 'in-progress'
  | 'blocked'
  | 'completed'
  | 'cancelled'
  | 'deferred';

export interface Milestone {
  id: string;
  name: string;
  description: string;
  targetDate: string;
  actualDate?: string;
  status: 'pending' | 'achieved' | 'missed';
  deliverables: string[];
}

export interface Resource {
  id: string;
  type: 'person' | 'team' | 'tool' | 'budget' | 'time';
  name: string;
  allocation: number; // Percentage or hours
  availability: string;
}

export interface Deliverable {
  id: string;
  name: string;
  description: string;
  type: 'document' | 'code' | 'configuration' | 'report' | 'certification';
  status: 'pending' | 'in-progress' | 'completed';
  url?: string;
  completedAt?: string;
}

export interface ResidualRisk {
  likelihood: number; // 1-5
  impact: number; // 1-5
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reductionPercent: number;
  acceptanceCriteria: string;
  acceptedBy?: string;
  acceptedAt?: string;
  reviewDate: string;
}

export type TreatmentStatus =
  | 'proposed'
  | 'under-review'
  | 'approved'
  | 'implementing'
  | 'monitoring'
  | 'completed'
  | 'rejected'
  | 'deferred';

export interface TreatmentEffectiveness {
  overallScore: number; // 0-100
  riskReduction: number; // Percentage
  actionsCompleted: number;
  actionsTotal: number;
  onTimePercent: number;
  budgetVariance: number; // Percentage
  lastReviewedAt?: string;
  nextReviewDate?: string;
  findings: string[];
  recommendations: string[];
}

export interface RiskMonitoring {
  id: string;
  organizationId: string;
  riskId: string;
  treatmentId: string;
  monitoringType: MonitoringType;
  frequency: MonitoringFrequency;
  metrics: MonitoringMetric[];
  alerts: MonitoringAlert[];
  lastCheckedAt?: string;
  nextCheckDate: string;
  status: 'active' | 'paused' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export type MonitoringType =
  | 'continuous'
  | 'periodic'
  | 'event-triggered'
  | 'threshold-based';

export type MonitoringFrequency =
  | 'real-time'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly';

export interface MonitoringMetric {
  id: string;
  name: string;
  description: string;
  type: 'quantitative' | 'qualitative';
  currentValue?: number | string;
  targetValue: number | string;
  threshold?: {
    warning: number;
    critical: number;
  };
  unit?: string;
  lastUpdated?: string;
}

export interface MonitoringAlert {
  id: string;
  metricId: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  triggeredAt: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

export interface RiskReview {
  id: string;
  organizationId: string;
  riskId: string;
  treatmentId?: string;
  reviewType: ReviewType;
  reviewerId: string;
  reviewerName: string;
  findings: ReviewFinding[];
  conclusions: string;
  recommendations: string[];
  decisions: ReviewDecision[];
  nextReviewDate: string;
  reviewedAt: string;
  createdAt: string;
}

export type ReviewType =
  | 'scheduled'
  | 'triggered'
  | 'post-incident'
  | 'post-mitigation'
  | 'regulatory';

export interface ReviewFinding {
  id: string;
  category: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: string;
  recommendation: string;
}

export interface ReviewDecision {
  id: string;
  type: 'continue' | 'modify' | 'escalate' | 'close' | 'accept';
  rationale: string;
  actions: string[];
  decidedBy: string;
  decidedAt: string;
}

export interface RiskDashboard {
  organizationId: string;
  summary: DashboardSummary;
  riskHeatmap: RiskHeatmap;
  treatmentProgress: TreatmentProgress[];
  upcomingReviews: RiskReview[];
  recentAlerts: MonitoringAlert[];
  trends: RiskTrend[];
}

export interface DashboardSummary {
  totalRisks: number;
  activeTreatments: number;
  completedTreatments: number;
  averageEffectiveness: number;
  totalBudget: number;
  spentBudget: number;
  overdueActions: number;
  criticalAlerts: number;
}

export interface RiskHeatmap {
  categories: string[];
  riskLevels: string[];
  data: HeatmapCell[];
}

export interface HeatmapCell {
  category: string;
  riskLevel: string;
  count: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface TreatmentProgress {
  treatmentId: string;
  riskTitle: string;
  strategy: TreatmentStrategy;
  progress: number; // 0-100
  actionsCompleted: number;
  actionsTotal: number;
  budgetUsed: number;
  budgetTotal: number;
  daysRemaining: number;
  status: TreatmentStatus;
}

export interface RiskTrend {
  period: string;
  totalRisks: number;
  averageRiskScore: number;
  treatmentsImplemented: number;
  riskReduction: number;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const treatments = new Map<string, RiskTreatment>();
const monitorings = new Map<string, RiskMonitoring>();
const reviews = new Map<string, RiskReview>();

// ─── Risk Treatment Management ─────────────────────────────────────────────────

/**
 * Create a risk treatment
 */
export async function createTreatment(
  organizationId: string,
  treatment: Omit<RiskTreatment, 'id' | 'effectiveness' | 'createdAt' | 'updatedAt'>
): Promise<RiskTreatment> {
  const id = `treatment_${randomUUID()}`;
  const now = new Date().toISOString();

  const newTreatment: RiskTreatment = {
    ...treatment,
    id,
    organizationId,
    effectiveness: {
      overallScore: 0,
      riskReduction: 0,
      actionsCompleted: 0,
      actionsTotal: treatment.treatmentPlan.actions.length,
      onTimePercent: 100,
      budgetVariance: 0,
      findings: [],
      recommendations: [],
    },
    createdAt: now,
    updatedAt: now,
  };

  treatments.set(id, newTreatment);
  return newTreatment;
}

/**
 * Update treatment
 */
export async function updateTreatment(
  treatmentId: string,
  updates: Partial<Omit<RiskTreatment, 'id' | 'organizationId' | 'createdAt'>>
): Promise<RiskTreatment | null> {
  const treatment = treatments.get(treatmentId);
  if (!treatment) return null;

  const updated: RiskTreatment = {
    ...treatment,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  treatments.set(treatmentId, updated);
  return updated;
}

/**
 * Get treatment by ID
 */
export async function getTreatment(treatmentId: string): Promise<RiskTreatment | null> {
  return treatments.get(treatmentId) || null;
}

/**
 * List treatments for an organization
 */
export async function listTreatments(
  organizationId: string,
  filters?: { riskId?: string; strategy?: TreatmentStrategy; status?: TreatmentStatus }
): Promise<RiskTreatment[]> {
  const allTreatments = Array.from(treatments.values()).filter(
    (t) => t.organizationId === organizationId
  );

  return allTreatments.filter((t) => {
    if (filters?.riskId && t.riskId !== filters.riskId) return false;
    if (filters?.strategy && t.strategy !== filters.strategy) return false;
    if (filters?.status && t.status !== filters.status) return false;
    return true;
  });
}

/**
 * Approve treatment
 */
export async function approveTreatment(
  treatmentId: string,
  approvedBy: string
): Promise<RiskTreatment | null> {
  const treatment = treatments.get(treatmentId);
  if (!treatment) return null;

  treatment.status = 'approved';
  treatment.approvedBy = approvedBy;
  treatment.approvedAt = new Date().toISOString();
  treatment.updatedAt = treatment.approvedAt;

  treatments.set(treatmentId, treatment);
  return treatment;
}

// ─── Mitigation Action Management ──────────────────────────────────────────────

/**
 * Add mitigation action to treatment plan
 */
export async function addMitigationAction(
  treatmentId: string,
  action: Omit<MitigationAction, 'id' | 'progress' | 'createdAt' | 'updatedAt'>
): Promise<MitigationAction | null> {
  const treatment = treatments.get(treatmentId);
  if (!treatment) return null;

  const id = `action_${randomUUID()}`;
  const now = new Date().toISOString();

  const newAction: MitigationAction = {
    ...action,
    id,
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  treatment.treatmentPlan.actions.push(newAction);
  treatment.effectiveness.actionsTotal = treatment.treatmentPlan.actions.length;
  treatment.updatedAt = now;

  treatments.set(treatmentId, treatment);
  return newAction;
}

/**
 * Update mitigation action
 */
export async function updateMitigationAction(
  treatmentId: string,
  actionId: string,
  updates: Partial<Omit<MitigationAction, 'id' | 'createdAt'>>
): Promise<MitigationAction | null> {
  const treatment = treatments.get(treatmentId);
  if (!treatment) return null;

  const actionIndex = treatment.treatmentPlan.actions.findIndex((a) => a.id === actionId);
  if (actionIndex === -1) return null;

  const action = treatment.treatmentPlan.actions[actionIndex];
  const updated: MitigationAction = {
    ...action,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  if (updates.status === 'completed' && !action.completedAt) {
    updated.completedAt = updated.updatedAt;
  }

  treatment.treatmentPlan.actions[actionIndex] = updated;

  // Update effectiveness metrics
  const completedActions = treatment.treatmentPlan.actions.filter((a) => a.status === 'completed').length;
  treatment.effectiveness.actionsCompleted = completedActions;
  treatment.effectiveness.overallScore = Math.round((completedActions / treatment.effectiveness.actionsTotal) * 100);

  treatment.updatedAt = updated.updatedAt;
  treatments.set(treatmentId, treatment);

  return updated;
}

// ─── Residual Risk Calculation ─────────────────────────────────────────────────

/**
 * Calculate residual risk after treatment
 */
export function calculateResidualRisk(
  originalLikelihood: number,
  originalImpact: number,
  treatmentStrategy: TreatmentStrategy,
  treatmentEffectiveness: number // 0-100
): ResidualRisk {
  let reductionFactor = 0;

  switch (treatmentStrategy) {
    case 'avoid':
      reductionFactor = 1.0; // Complete elimination
      break;
    case 'mitigate':
      reductionFactor = treatmentEffectiveness / 100;
      break;
    case 'transfer':
      reductionFactor = 0.7; // Typical insurance/contract coverage
      break;
    case 'accept':
      reductionFactor = 0; // No reduction
      break;
  }

  const residualLikelihood = Math.max(1, Math.round(originalLikelihood * (1 - reductionFactor)));
  const residualImpact = Math.max(1, Math.round(originalImpact * (1 - reductionFactor * 0.5))); // Impact reduces less
  const residualScore = residualLikelihood * residualImpact;

  const riskLevel = residualScore >= 20 ? 'critical' : residualScore >= 12 ? 'high' : residualScore >= 6 ? 'medium' : 'low';

  const originalScore = originalLikelihood * originalImpact;
  const reductionPercent = Math.round(((originalScore - residualScore) / originalScore) * 100);

  return {
    likelihood: residualLikelihood,
    impact: residualImpact,
    riskScore: residualScore,
    riskLevel,
    reductionPercent,
    acceptanceCriteria: '',
    reviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
  };
}

/**
 * Update residual risk for treatment
 */
export async function updateResidualRisk(
  treatmentId: string,
  residualRisk: Partial<ResidualRisk>
): Promise<RiskTreatment | null> {
  const treatment = treatments.get(treatmentId);
  if (!treatment) return null;

  treatment.residualRisk = {
    ...treatment.residualRisk,
    ...residualRisk,
  };

  treatment.effectiveness.riskReduction = treatment.residualRisk.reductionPercent;
  treatment.updatedAt = new Date().toISOString();

  treatments.set(treatmentId, treatment);
  return treatment;
}

// ─── Risk Monitoring ───────────────────────────────────────────────────────────

/**
 * Create risk monitoring
 */
export async function createMonitoring(
  organizationId: string,
  monitoring: Omit<RiskMonitoring, 'id' | 'createdAt' | 'updatedAt'>
): Promise<RiskMonitoring> {
  const id = `monitoring_${randomUUID()}`;
  const now = new Date().toISOString();

  const newMonitoring: RiskMonitoring = {
    ...monitoring,
    id,
    organizationId,
    createdAt: now,
    updatedAt: now,
  };

  monitorings.set(id, newMonitoring);
  return newMonitoring;
}

/**
 * Record monitoring metric
 */
export async function recordMonitoringMetric(
  monitoringId: string,
  metricId: string,
  value: number | string
): Promise<RiskMonitoring | null> {
  const monitoring = monitorings.get(monitoringId);
  if (!monitoring) return null;

  const metric = monitoring.metrics.find((m) => m.id === metricId);
  if (!metric) return null;

  metric.currentValue = value;
  metric.lastUpdated = new Date().toISOString();

  // Check thresholds and create alerts
  if (metric.threshold && typeof value === 'number') {
    if (value >= metric.threshold.critical) {
      const alert: MonitoringAlert = {
        id: `alert_${randomUUID()}`,
        metricId,
        severity: 'critical',
        message: `Metric ${metric.name} exceeded critical threshold: ${value}`,
        triggeredAt: metric.lastUpdated,
      };
      monitoring.alerts.push(alert);
    } else if (value >= metric.threshold.warning) {
      const alert: MonitoringAlert = {
        id: `alert_${randomUUID()}`,
        metricId,
        severity: 'warning',
        message: `Metric ${metric.name} exceeded warning threshold: ${value}`,
        triggeredAt: metric.lastUpdated,
      };
      monitoring.alerts.push(alert);
    }
  }

  monitoring.lastCheckedAt = metric.lastUpdated;
  monitoring.updatedAt = metric.lastUpdated;

  monitorings.set(monitoringId, monitoring);
  return monitoring;
}

/**
 * Get monitoring by ID
 */
export async function getMonitoring(monitoringId: string): Promise<RiskMonitoring | null> {
  return monitorings.get(monitoringId) || null;
}

/**
 * List monitorings for an organization
 */
export async function listMonitorings(
  organizationId: string,
  filters?: { riskId?: string; status?: RiskMonitoring['status'] }
): Promise<RiskMonitoring[]> {
  const allMonitorings = Array.from(monitorings.values()).filter(
    (m) => m.organizationId === organizationId
  );

  return allMonitorings.filter((m) => {
    if (filters?.riskId && m.riskId !== filters.riskId) return false;
    if (filters?.status && m.status !== filters.status) return false;
    return true;
  });
}

// ─── Risk Review ───────────────────────────────────────────────────────────────

/**
 * Create risk review
 */
export async function createReview(
  organizationId: string,
  review: Omit<RiskReview, 'id' | 'createdAt'>
): Promise<RiskReview> {
  const id = `review_${randomUUID()}`;
  const now = new Date().toISOString();

  const newReview: RiskReview = {
    ...review,
    id,
    organizationId,
    createdAt: now,
  };

  reviews.set(id, newReview);
  return newReview;
}

/**
 * Get review by ID
 */
export async function getReview(reviewId: string): Promise<RiskReview | null> {
  return reviews.get(reviewId) || null;
}

/**
 * List reviews for an organization
 */
export async function listReviews(
  organizationId: string,
  filters?: { riskId?: string; reviewType?: ReviewType }
): Promise<RiskReview[]> {
  const allReviews = Array.from(reviews.values()).filter(
    (r) => r.organizationId === organizationId
  );

  return allReviews.filter((r) => {
    if (filters?.riskId && r.riskId !== filters.riskId) return false;
    if (filters?.reviewType && r.reviewType !== filters.reviewType) return false;
    return true;
  });
}

// ─── Dashboard and Reporting ───────────────────────────────────────────────────

/**
 * Get risk dashboard
 */
export async function getRiskDashboard(organizationId: string): Promise<RiskDashboard> {
  const orgTreatments = await listTreatments(organizationId);
  const orgMonitorings = await listMonitorings(organizationId);
  const orgReviews = await listReviews(organizationId);

  const activeTreatments = orgTreatments.filter((t) => ['implementing', 'monitoring'].includes(t.status));
  const completedTreatments = orgTreatments.filter((t) => t.status === 'completed');

  const averageEffectiveness = orgTreatments.length > 0
    ? Math.round(orgTreatments.reduce((sum, t) => sum + t.effectiveness.overallScore, 0) / orgTreatments.length)
    : 0;

  const totalBudget = orgTreatments.reduce((sum, t) => sum + t.treatmentPlan.budget.estimated, 0);
  const spentBudget = orgTreatments.reduce((sum, t) => sum + t.treatmentPlan.budget.actual, 0);

  const overdueActions = orgTreatments.reduce((count, t) => {
    return count + t.treatmentPlan.actions.filter((a) => {
      return a.status !== 'completed' && new Date(a.dueDate) < new Date();
    }).length;
  }, 0);

  const criticalAlerts = orgMonitorings.reduce((count, m) => {
    return count + m.alerts.filter((a) => a.severity === 'critical' && !a.resolvedAt).length;
  }, 0);

  const treatmentProgress: TreatmentProgress[] = activeTreatments.map((t) => ({
    treatmentId: t.id,
    riskTitle: t.riskTitle,
    strategy: t.strategy,
    progress: t.effectiveness.overallScore,
    actionsCompleted: t.effectiveness.actionsCompleted,
    actionsTotal: t.effectiveness.actionsTotal,
    budgetUsed: t.treatmentPlan.budget.actual,
    budgetTotal: t.treatmentPlan.budget.estimated,
    daysRemaining: Math.ceil((new Date(t.treatmentPlan.timeline.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    status: t.status,
  }));

  const upcomingReviews = orgReviews
    .filter((r) => new Date(r.nextReviewDate) > new Date())
    .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate))
    .slice(0, 10);

  const recentAlerts = orgMonitorings
    .flatMap((m) => m.alerts)
    .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt))
    .slice(0, 10);

  return {
    organizationId,
    summary: {
      totalRisks: orgTreatments.length,
      activeTreatments: activeTreatments.length,
      completedTreatments: completedTreatments.length,
      averageEffectiveness,
      totalBudget,
      spentBudget,
      overdueActions,
      criticalAlerts,
    },
    riskHeatmap: generateRiskHeatmap(orgTreatments),
    treatmentProgress,
    upcomingReviews,
    recentAlerts,
    trends: [], // Would calculate from historical data
  };
}

/**
 * Generate risk heatmap
 */
function generateRiskHeatmap(treatments: RiskTreatment[]): RiskHeatmap {
  const categories = ['model-risk', 'data-risk', 'operational-risk', 'ethical-risk', 'regulatory-risk'];
  const riskLevels = ['low', 'medium', 'high', 'critical'];
  const data: HeatmapCell[] = [];

  for (const category of categories) {
    for (const riskLevel of riskLevels) {
      const count = treatments.filter((t) => {
        // Would need to join with risks table to get category
        return t.residualRisk.riskLevel === riskLevel;
      }).length;

      data.push({
        category,
        riskLevel,
        count,
        trend: 'stable',
      });
    }
  }

  return {
    categories,
    riskLevels,
    data,
  };
}

// ─── Statistics ────────────────────────────────────────────────────────────────

/**
 * Get risk mitigation statistics
 */
export async function getMitigationStats(organizationId: string): Promise<{
  totalTreatments: number;
  activeTreatments: number;
  completedTreatments: number;
  averageEffectiveness: number;
  averageRiskReduction: number;
  totalActions: number;
  completedActions: number;
  totalBudget: number;
  spentBudget: number;
  treatmentsByStrategy: Record<TreatmentStrategy, number>;
  overdueActions: number;
}> {
  const orgTreatments = await listTreatments(organizationId);

  let totalEffectiveness = 0;
  let totalRiskReduction = 0;
  let totalActions = 0;
  let completedActions = 0;
  let totalBudget = 0;
  let spentBudget = 0;
  let overdueActions = 0;
  const treatmentsByStrategy: Record<string, number> = {};

  for (const treatment of orgTreatments) {
    totalEffectiveness += treatment.effectiveness.overallScore;
    totalRiskReduction += treatment.effectiveness.riskReduction;
    totalActions += treatment.effectiveness.actionsTotal;
    completedActions += treatment.effectiveness.actionsCompleted;
    totalBudget += treatment.treatmentPlan.budget.estimated;
    spentBudget += treatment.treatmentPlan.budget.actual;
    treatmentsByStrategy[treatment.strategy] = (treatmentsByStrategy[treatment.strategy] || 0) + 1;

    overdueActions += treatment.treatmentPlan.actions.filter((a) => {
      return a.status !== 'completed' && new Date(a.dueDate) < new Date();
    }).length;
  }

  return {
    totalTreatments: orgTreatments.length,
    activeTreatments: orgTreatments.filter((t) => ['implementing', 'monitoring'].includes(t.status)).length,
    completedTreatments: orgTreatments.filter((t) => t.status === 'completed').length,
    averageEffectiveness: orgTreatments.length > 0 ? Math.round(totalEffectiveness / orgTreatments.length) : 0,
    averageRiskReduction: orgTreatments.length > 0 ? Math.round(totalRiskReduction / orgTreatments.length) : 0,
    totalActions,
    completedActions,
    totalBudget,
    spentBudget,
    treatmentsByStrategy: treatmentsByStrategy as Record<TreatmentStrategy, number>,
    overdueActions,
  };
}
