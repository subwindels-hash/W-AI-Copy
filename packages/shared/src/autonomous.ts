/** Session 72 — Enterprise Autonomous Organization Framework */
export interface BoardDecision {
  id: string;
  title: string;
  /** Free-form: proposals arrive from any department, not a fixed list. */
  department: string;
  recommendation: string;
  confidence: number; // 0..1
  /** "critical" is accepted — the register must be able to record the worst case. */
  riskLevel: "low"|"med"|"high"|"critical";
  estimatedImpactUsd: number;
  status: "drafted"|"awaiting_human"|"approved"|"rejected"|"executing"|"executed";
  humanApprover?: string;
  reasoning: string;
  createdAt: string;
  /** Set when a human resolves the proposal. */
  decidedAt?: string;
  decisionNote?: string;
}

export interface Department {
  id: string;
  name: string;
  autonomyLevel: "assist"|"advise"|"recommend"|"execute_pending"|"fully_autonomous";
  health: number;
  decisionsPending: number;
  decisionsExecuted30d: number;
  budgetUsd: number;
  spendYtdUsd: number;
  headcount: number;
  aiAgents: number;
}

export interface StrategicPlan {
  id: string;
  horizon: "quarter"|"year"|"3year"|"5year";
  objective: string;
  keyResults: Array<{ text: string; progress: number }>;
  owner: string;
  confidence: number;
  status: "draft"|"active"|"completed";
}

export interface GovernanceGuardrail {
  id: string;
  policy: string;
  violations30d: number;
  blockedActions30d: number;
  lastViolationAt?: string;
}

export interface AutonomousDashboard {
  autonomyIndex: number; // 0..100
  decisionsToday: number;
  humanOverrideRatePct: number;
  governanceCompliancePct: number;
  budgetsTotalUsd: number;
  budgetsSpentYtdPct: number;
  departmentsCount: number;
  boardSeats: number;
  aiExecutives: number;
  decisions: BoardDecision[];
  departments: Department[];
  plans: StrategicPlan[];
  guardrails: GovernanceGuardrail[];
  openApprovals: number;
  constitutionEnforced: number;
  autonomousSavings30dUsd: number;
}
