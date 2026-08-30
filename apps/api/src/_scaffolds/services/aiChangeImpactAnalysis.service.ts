/**
 * Module 65: AI Change Impact Analysis Service
 *
 * Provides comprehensive impact analysis for AI changes including dependency mapping,
 * blast radius calculation, risk assessment, rollback planning, approval workflows,
 * and testing/validation requirements management.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ChangeImpactAnalysis {
  id: string;
  organizationId: string;
  changeId: string;
  changeKey: string;
  changeTitle: string;
  status: ImpactAnalysisStatus;
  summary: ImpactSummary;
  dependencies: DependencyAnalysis;
  blastRadius: BlastRadius;
  riskAssessment: ChangeRiskAssessment;
  rollbackPlan: RollbackPlan;
  testingRequirements: TestingRequirements;
  approvalWorkflow: ApprovalWorkflow;
  recommendations: string[];
  analystId: string;
  analystName: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type ImpactAnalysisStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'approved'
  | 'rejected'
  | 'deferred';

export interface ImpactSummary {
  overallImpact: 'low' | 'medium' | 'high' | 'critical';
  impactScore: number; // 0-100
  affectedSystems: number;
  affectedUsers: number;
  estimatedDowntimeMinutes: number;
  businessImpact: string;
  technicalImpact: string;
  userImpact: string;
}

export interface DependencyAnalysis {
  directDependencies: Dependency[];
  indirectDependencies: Dependency[];
  upstreamDependencies: Dependency[];
  downstreamDependencies: Dependency[];
  circularDependencies: string[];
  dependencyGraph: DependencyNode[];
}

export interface Dependency {
  id: string;
  type: 'model' | 'dataset' | 'pipeline' | 'service' | 'api' | 'database' | 'external';
  name: string;
  version?: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
  impactLevel: 'none' | 'low' | 'medium' | 'high';
  description: string;
}

export interface DependencyNode {
  id: string;
  name: string;
  type: string;
  level: number; // 0 = direct, 1 = indirect, etc.
  dependencies: string[]; // IDs of dependent nodes
  dependents: string[]; // IDs of nodes that depend on this
}

export interface BlastRadius {
  totalAffectedComponents: number;
  affectedModels: AffectedItem[];
  affectedServices: AffectedItem[];
  affectedUsers: AffectedUserGroup[];
  affectedDataFlows: AffectedItem[];
  geographicImpact: string[];
  businessUnits: string[];
  maxImpactLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface AffectedItem {
  id: string;
  name: string;
  type: string;
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  impactDescription: string;
  mitigationRequired: boolean;
}

export interface AffectedUserGroup {
  group: string;
  userCount: number;
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  impactDescription: string;
}

export interface ChangeRiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number; // 0-100
  riskCategories: RiskCategory[];
  probability: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high' | 'critical';
  riskMatrix: RiskMatrixPosition;
  mitigationStrategies: MitigationStrategy[];
  residualRisk: 'low' | 'medium' | 'high' | 'critical';
}

export interface RiskCategory {
  category: 'technical' | 'operational' | 'business' | 'compliance' | 'security' | 'performance';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  factors: string[];
  score: number;
}

export interface RiskMatrixPosition {
  likelihood: number; // 1-5
  impact: number; // 1-5
  position: string; // e.g., "High Likelihood, High Impact"
}

export interface MitigationStrategy {
  id: string;
  strategy: string;
  description: string;
  effectiveness: 'low' | 'medium' | 'high';
  implementationEffort: 'low' | 'medium' | 'high';
  cost: 'low' | 'medium' | 'high';
  recommended: boolean;
}

export interface RollbackPlan {
  rollbackStrategy: RollbackStrategy;
  rollbackSteps: RollbackStep[];
  estimatedRollbackTimeMinutes: number;
  dataRollbackRequired: boolean;
  dataRollbackPlan?: DataRollbackPlan;
  rollbackTesting: RollbackTesting;
  rollbackTriggers: string[];
  rollbackApprovers: string[];
}

export type RollbackStrategy =
  | 'full-rollback'
  | 'partial-rollback'
  | 'blue-green-swap'
  | 'canary-reversal'
  | 'feature-flag-disable'
  | 'configuration-revert';

export interface RollbackStep {
  id: string;
  order: number;
  action: string;
  description: string;
  responsible: string;
  estimatedTimeMinutes: number;
  verification: string;
  automated: boolean;
}

export interface DataRollbackPlan {
  backupStrategy: 'snapshot' | 'point-in-time' | 'manual';
  backupLocation: string;
  backupFrequency: string;
  restoreTimeMinutes: number;
  dataLossWindowMinutes: number;
  validationSteps: string[];
}

export interface RollbackTesting {
  tested: boolean;
  lastTestedDate?: string;
  testResults?: string;
  testFrequency: string;
  nextTestDate?: string;
}

export interface TestingRequirements {
  requiredTests: TestRequirement[];
  testCoverage: TestCoverage;
  validationCriteria: ValidationCriterion[];
  performanceTests: PerformanceTest[];
  regressionTests: RegressionTest[];
  userAcceptanceTests: UATRequirement[];
}

export interface TestRequirement {
  id: string;
  name: string;
  type: 'unit' | 'integration' | 'e2e' | 'performance' | 'security' | 'fairness' | 'drift';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  automated: boolean;
  estimatedTimeMinutes: number;
  status: 'pending' | 'passed' | 'failed' | 'skipped';
}

export interface TestCoverage {
  unitTestCoverage: number; // percentage
  integrationTestCoverage: number;
  e2eTestCoverage: number;
  overallCoverage: number;
  coverageTarget: number;
  coverageMet: boolean;
}

export interface ValidationCriterion {
  id: string;
  name: string;
  metric: string;
  threshold: number;
  currentValue?: number;
  status: 'pending' | 'passed' | 'failed';
  description: string;
}

export interface PerformanceTest {
  id: string;
  name: string;
  metric: string;
  baseline: number;
  threshold: number;
  currentValue?: number;
  status: 'pending' | 'passed' | 'failed';
}

export interface RegressionTest {
  id: string;
  name: string;
  testSuite: string;
  lastRunDate?: string;
  status: 'pending' | 'passed' | 'failed';
  failureReason?: string;
}

export interface UATRequirement {
  id: string;
  scenario: string;
  tester: string;
  status: 'pending' | 'in-progress' | 'passed' | 'failed';
  feedback?: string;
  completedDate?: string;
}

export interface ApprovalWorkflow {
  requiredApprovals: ApprovalRequirement[];
  currentApprovals: Approval[];
  approvalStatus: 'pending' | 'in-progress' | 'approved' | 'rejected';
  approvalPath: ApprovalPath;
  escalationPath: EscalationPath;
}

export interface ApprovalRequirement {
  id: string;
  role: string;
  team?: string;
  required: boolean;
  reason: string;
}

export interface Approval {
  id: string;
  approverId: string;
  approverName: string;
  approverRole: string;
  status: 'pending' | 'approved' | 'rejected' | 'deferred';
  comments?: string;
  approvedAt?: string;
}

export interface ApprovalPath {
  sequential: boolean;
  parallel: boolean;
  order: string[]; // Role or team names
}

export interface EscalationPath {
  timeoutHours: number;
  escalationLevels: EscalationLevel[];
}

export interface EscalationLevel {
  level: number;
  role: string;
  timeoutHours: number;
}

// ─── In-Memory Storage ─────────────────────────────────────────────────────────

const impactAnalyses = new Map<string, ChangeImpactAnalysis>();

// ─── Impact Analysis Management ────────────────────────────────────────────────

/**
 * Create impact analysis for a change
 */
export async function createImpactAnalysis(
  organizationId: string,
  changeId: string,
  changeKey: string,
  changeTitle: string,
  analystId: string,
  analystName: string
): Promise<ChangeImpactAnalysis> {
  const id = `impact_${randomUUID()}`;
  const now = new Date().toISOString();

  const analysis: ChangeImpactAnalysis = {
    id,
    organizationId,
    changeId,
    changeKey,
    changeTitle,
    status: 'pending',
    summary: {
      overallImpact: 'medium',
      impactScore: 50,
      affectedSystems: 0,
      affectedUsers: 0,
      estimatedDowntimeMinutes: 0,
      businessImpact: '',
      technicalImpact: '',
      userImpact: '',
    },
    dependencies: {
      directDependencies: [],
      indirectDependencies: [],
      upstreamDependencies: [],
      downstreamDependencies: [],
      circularDependencies: [],
      dependencyGraph: [],
    },
    blastRadius: {
      totalAffectedComponents: 0,
      affectedModels: [],
      affectedServices: [],
      affectedUsers: [],
      affectedDataFlows: [],
      geographicImpact: [],
      businessUnits: [],
      maxImpactLevel: 'low',
    },
    riskAssessment: {
      overallRisk: 'medium',
      riskScore: 50,
      riskCategories: [],
      probability: 'medium',
      impact: 'medium',
      riskMatrix: {
        likelihood: 3,
        impact: 3,
        position: 'Medium Likelihood, Medium Impact',
      },
      mitigationStrategies: [],
      residualRisk: 'medium',
    },
    rollbackPlan: {
      rollbackStrategy: 'full-rollback',
      rollbackSteps: [],
      estimatedRollbackTimeMinutes: 30,
      dataRollbackRequired: false,
      rollbackTesting: {
        tested: false,
        testFrequency: 'monthly',
      },
      rollbackTriggers: [],
      rollbackApprovers: [],
    },
    testingRequirements: {
      requiredTests: [],
      testCoverage: {
        unitTestCoverage: 0,
        integrationTestCoverage: 0,
        e2eTestCoverage: 0,
        overallCoverage: 0,
        coverageTarget: 80,
        coverageMet: false,
      },
      validationCriteria: [],
      performanceTests: [],
      regressionTests: [],
      userAcceptanceTests: [],
    },
    approvalWorkflow: {
      requiredApprovals: [],
      currentApprovals: [],
      approvalStatus: 'pending',
      approvalPath: {
        sequential: true,
        parallel: false,
        order: [],
      },
      escalationPath: {
        timeoutHours: 24,
        escalationLevels: [],
      },
    },
    recommendations: [],
    analystId,
    analystName,
    createdAt: now,
    updatedAt: now,
  };

  impactAnalyses.set(id, analysis);
  return analysis;
}

/**
 * Update impact analysis
 */
export async function updateImpactAnalysis(
  analysisId: string,
  updates: Partial<Omit<ChangeImpactAnalysis, 'id' | 'organizationId' | 'changeId' | 'createdAt'>>
): Promise<ChangeImpactAnalysis | null> {
  const analysis = impactAnalyses.get(analysisId);
  if (!analysis) return null;

  const updated: ChangeImpactAnalysis = {
    ...analysis,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  impactAnalyses.set(analysisId, updated);
  return updated;
}

/**
 * Analyze dependencies for a change
 */
export async function analyzeDependencies(
  analysisId: string,
  dependencies: {
    direct: Dependency[];
    indirect: Dependency[];
    upstream: Dependency[];
    downstream: Dependency[];
  }
): Promise<ChangeImpactAnalysis | null> {
  const analysis = impactAnalyses.get(analysisId);
  if (!analysis) return null;

  analysis.dependencies.directDependencies = dependencies.direct;
  analysis.dependencies.indirectDependencies = dependencies.indirect;
  analysis.dependencies.upstreamDependencies = dependencies.upstream;
  analysis.dependencies.downstreamDependencies = dependencies.downstream;

  // Build dependency graph
  const graph: DependencyNode[] = [];
  const allDeps = [...dependencies.direct, ...dependencies.indirect];

  for (const dep of allDeps) {
    graph.push({
      id: dep.id,
      name: dep.name,
      type: dep.type,
      level: dependencies.direct.includes(dep) ? 0 : 1,
      dependencies: [],
      dependents: [],
    });
  }

  analysis.dependencies.dependencyGraph = graph;
  analysis.updatedAt = new Date().toISOString();

  impactAnalyses.set(analysisId, analysis);
  return analysis;
}

/**
 * Calculate blast radius
 */
export async function calculateBlastRadius(
  analysisId: string,
  blastRadius: Partial<BlastRadius>
): Promise<ChangeImpactAnalysis | null> {
  const analysis = impactAnalyses.get(analysisId);
  if (!analysis) return null;

  analysis.blastRadius = {
    ...analysis.blastRadius,
    ...blastRadius,
  };

  // Update summary
  analysis.summary.affectedSystems = analysis.blastRadius.totalAffectedComponents;
  analysis.summary.affectedUsers = analysis.blastRadius.affectedUsers.reduce(
    (sum, group) => sum + group.userCount,
    0
  );

  analysis.updatedAt = new Date().toISOString();
  impactAnalyses.set(analysisId, analysis);

  return analysis;
}

/**
 * Assess risk for a change
 */
export async function assessRisk(
  analysisId: string,
  riskAssessment: Partial<ChangeRiskAssessment>
): Promise<ChangeImpactAnalysis | null> {
  const analysis = impactAnalyses.get(analysisId);
  if (!analysis) return null;

  analysis.riskAssessment = {
    ...analysis.riskAssessment,
    ...riskAssessment,
  };

  // Calculate risk matrix position
  const likelihoodMap: Record<string, number> = { low: 2, medium: 3, high: 4 };
  const impactMap: Record<string, number> = { low: 2, medium: 3, high: 4, critical: 5 };

  analysis.riskAssessment.riskMatrix = {
    likelihood: likelihoodMap[analysis.riskAssessment.probability] || 3,
    impact: impactMap[analysis.riskAssessment.impact] || 3,
    position: `${analysis.riskAssessment.probability} Likelihood, ${analysis.riskAssessment.impact} Impact`,
  };

  analysis.updatedAt = new Date().toISOString();
  impactAnalyses.set(analysisId, analysis);

  return analysis;
}

/**
 * Create rollback plan
 */
export async function createRollbackPlan(
  analysisId: string,
  rollbackPlan: Partial<RollbackPlan>
): Promise<ChangeImpactAnalysis | null> {
  const analysis = impactAnalyses.get(analysisId);
  if (!analysis) return null;

  analysis.rollbackPlan = {
    ...analysis.rollbackPlan,
    ...rollbackPlan,
  };

  analysis.updatedAt = new Date().toISOString();
  impactAnalyses.set(analysisId, analysis);

  return analysis;
}

/**
 * Add rollback step
 */
export async function addRollbackStep(
  analysisId: string,
  step: Omit<RollbackStep, 'id'>
): Promise<RollbackStep | null> {
  const analysis = impactAnalyses.get(analysisId);
  if (!analysis) return null;

  const newStep: RollbackStep = {
    ...step,
    id: `step_${randomUUID()}`,
  };

  analysis.rollbackPlan.rollbackSteps.push(newStep);
  analysis.rollbackPlan.rollbackSteps.sort((a, b) => a.order - b.order);

  // Calculate total rollback time
  analysis.rollbackPlan.estimatedRollbackTimeMinutes = analysis.rollbackPlan.rollbackSteps.reduce(
    (sum, s) => sum + s.estimatedTimeMinutes,
    0
  );

  analysis.updatedAt = new Date().toISOString();
  impactAnalyses.set(analysisId, analysis);

  return newStep;
}

/**
 * Define testing requirements
 */
export async function defineTestingRequirements(
  analysisId: string,
  testingRequirements: Partial<TestingRequirements>
): Promise<ChangeImpactAnalysis | null> {
  const analysis = impactAnalyses.get(analysisId);
  if (!analysis) return null;

  analysis.testingRequirements = {
    ...analysis.testingRequirements,
    ...testingRequirements,
  };

  analysis.updatedAt = new Date().toISOString();
  impactAnalyses.set(analysisId, analysis);

  return analysis;
}

/**
 * Add test requirement
 */
export async function addTestRequirement(
  analysisId: string,
  test: Omit<TestRequirement, 'id' | 'status'>
): Promise<TestRequirement | null> {
  const analysis = impactAnalyses.get(analysisId);
  if (!analysis) return null;

  const newTest: TestRequirement = {
    ...test,
    id: `test_${randomUUID()}`,
    status: 'pending',
  };

  analysis.testingRequirements.requiredTests.push(newTest);
  analysis.updatedAt = new Date().toISOString();
  impactAnalyses.set(analysisId, analysis);

  return newTest;
}

/**
 * Update test status
 */
export async function updateTestStatus(
  analysisId: string,
  testId: string,
  status: TestRequirement['status']
): Promise<TestRequirement | null> {
  const analysis = impactAnalyses.get(analysisId);
  if (!analysis) return null;

  const test = analysis.testingRequirements.requiredTests.find((t) => t.id === testId);
  if (!test) return null;

  test.status = status;
  analysis.updatedAt = new Date().toISOString();
  impactAnalyses.set(analysisId, analysis);

  return test;
}

/**
 * Setup approval workflow
 */
export async function setupApprovalWorkflow(
  analysisId: string,
  workflow: Partial<ApprovalWorkflow>
): Promise<ChangeImpactAnalysis | null> {
  const analysis = impactAnalyses.get(analysisId);
  if (!analysis) return null;

  analysis.approvalWorkflow = {
    ...analysis.approvalWorkflow,
    ...workflow,
  };

  analysis.updatedAt = new Date().toISOString();
  impactAnalyses.set(analysisId, analysis);

  return analysis;
}

/**
 * Add approval
 */
export async function addApproval(
  analysisId: string,
  approval: Omit<Approval, 'id'>
): Promise<Approval | null> {
  const analysis = impactAnalyses.get(analysisId);
  if (!analysis) return null;

  const newApproval: Approval = {
    ...approval,
    id: `approval_${randomUUID()}`,
  };

  analysis.approvalWorkflow.currentApprovals.push(newApproval);

  // Update approval status
  const requiredCount = analysis.approvalWorkflow.requiredApprovals.filter((r) => r.required).length;
  const approvedCount = analysis.approvalWorkflow.currentApprovals.filter((a) => a.status === 'approved').length;
  const rejectedCount = analysis.approvalWorkflow.currentApprovals.filter((a) => a.status === 'rejected').length;

  if (rejectedCount > 0) {
    analysis.approvalWorkflow.approvalStatus = 'rejected';
  } else if (approvedCount >= requiredCount) {
    analysis.approvalWorkflow.approvalStatus = 'approved';
  } else {
    analysis.approvalWorkflow.approvalStatus = 'in-progress';
  }

  analysis.updatedAt = new Date().toISOString();
  impactAnalyses.set(analysisId, analysis);

  return newApproval;
}

/**
 * Complete impact analysis
 */
export async function completeImpactAnalysis(
  analysisId: string,
  recommendations: string[]
): Promise<ChangeImpactAnalysis | null> {
  const analysis = impactAnalyses.get(analysisId);
  if (!analysis) return null;

  analysis.status = 'completed';
  analysis.recommendations = recommendations;
  analysis.completedAt = new Date().toISOString();
  analysis.updatedAt = analysis.completedAt;

  impactAnalyses.set(analysisId, analysis);
  return analysis;
}

/**
 * Get impact analysis by ID
 */
export async function getImpactAnalysis(analysisId: string): Promise<ChangeImpactAnalysis | null> {
  return impactAnalyses.get(analysisId) || null;
}

/**
 * Get impact analysis by change ID
 */
export async function getImpactAnalysisByChangeId(changeId: string): Promise<ChangeImpactAnalysis | null> {
  for (const analysis of impactAnalyses.values()) {
    if (analysis.changeId === changeId) {
      return analysis;
    }
  }
  return null;
}

/**
 * List impact analyses for an organization
 */
export async function listImpactAnalyses(
  organizationId: string,
  filters?: { status?: ImpactAnalysisStatus; riskLevel?: string }
): Promise<ChangeImpactAnalysis[]> {
  const allAnalyses = Array.from(impactAnalyses.values()).filter(
    (a) => a.organizationId === organizationId
  );

  return allAnalyses.filter((a) => {
    if (filters?.status && a.status !== filters.status) return false;
    if (filters?.riskLevel && a.riskAssessment.overallRisk !== filters.riskLevel) return false;
    return true;
  });
}

// ─── Statistics ────────────────────────────────────────────────────────────────

/**
 * Get impact analysis statistics
 */
export async function getImpactAnalysisStats(organizationId: string): Promise<{
  totalAnalyses: number;
  completedAnalyses: number;
  averageImpactScore: number;
  averageRiskScore: number;
  analysesByRiskLevel: Record<string, number>;
  analysesByImpactLevel: Record<string, number>;
  averageDependencies: number;
  averageRollbackTimeMinutes: number;
  approvalRate: number;
}> {
  const orgAnalyses = await listImpactAnalyses(organizationId);

  let totalImpactScore = 0;
  let totalRiskScore = 0;
  let totalDependencies = 0;
  let totalRollbackTime = 0;
  let approvedCount = 0;
  const analysesByRiskLevel: Record<string, number> = {};
  const analysesByImpactLevel: Record<string, number> = {};

  for (const analysis of orgAnalyses) {
    totalImpactScore += analysis.summary.impactScore;
    totalRiskScore += analysis.riskAssessment.riskScore;
    totalDependencies += analysis.dependencies.directDependencies.length + analysis.dependencies.indirectDependencies.length;
    totalRollbackTime += analysis.rollbackPlan.estimatedRollbackTimeMinutes;

    analysesByRiskLevel[analysis.riskAssessment.overallRisk] = (analysesByRiskLevel[analysis.riskAssessment.overallRisk] || 0) + 1;
    analysesByImpactLevel[analysis.summary.overallImpact] = (analysesByImpactLevel[analysis.summary.overallImpact] || 0) + 1;

    if (analysis.approvalWorkflow.approvalStatus === 'approved') approvedCount++;
  }

  const completedAnalyses = orgAnalyses.filter((a) => a.status === 'completed').length;

  return {
    totalAnalyses: orgAnalyses.length,
    completedAnalyses,
    averageImpactScore: orgAnalyses.length > 0 ? Math.round(totalImpactScore / orgAnalyses.length) : 0,
    averageRiskScore: orgAnalyses.length > 0 ? Math.round(totalRiskScore / orgAnalyses.length) : 0,
    analysesByRiskLevel,
    analysesByImpactLevel,
    averageDependencies: orgAnalyses.length > 0 ? Math.round(totalDependencies / orgAnalyses.length) : 0,
    averageRollbackTimeMinutes: orgAnalyses.length > 0 ? Math.round(totalRollbackTime / orgAnalyses.length) : 0,
    approvalRate: orgAnalyses.length > 0 ? Math.round((approvedCount / orgAnalyses.length) * 10000) / 100 : 0,
  };
}
