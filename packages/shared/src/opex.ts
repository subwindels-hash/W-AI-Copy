/** Session 73 — Operational Excellence & Responsible AI (V9.2)
 * Safety & assurance, regulatory intelligence, human+AI collaboration,
 * operational playbooks, explainability, trust analytics, governance orchestration,
 * continuous operational excellence. Extends Session 56.3 Trust Center (no fork).
 */

export const SAFETY_CATEGORIES = [
  "alignment","jailbreak","prompt_injection","hallucination","bias","drift",
  "toxicity","pii","harm","fairness","adv_example","autonomous_safety",
] as const;
export type SafetyCategory = typeof SAFETY_CATEGORIES[number];

export interface SafetyAlert {
  id: string; category: SafetyCategory; severity: "info"|"warning"|"critical";
  source: string; message: string; model?: string; at: string; status: "open"|"investigating"|"mitigated"|"accepted";
}

export interface Regulation {
  id: string; name: string; jurisdiction: string; category: "privacy"|"security"|"finance"|"health"|"ai_act"|"environmental"|"tax"|"cyber"|"procurement";
  effectiveDate?: string; status: "proposed"|"enacted"|"enforcing"|"updated";
  summary: string; impactAreas: string[]; gapCount: number; gapResolved: number;
}

export interface Playbook {
  id: string; name: string; category: "cyber"|"dr"|"procurement"|"escalation"|"hr"|"construction"|"manufacturing"|"healthcare"|"legal"|"finance"|"sales"|"marketing"|"gov"|"emergency"|"ops";
  version: string; steps: number; simulations: number; status: "draft"|"approved"|"active"|"retired";
  lastRun?: string; compliance: "verified"|"gaps"|"unknown";
}

export interface Explanation {
  id: string; decisionId: string; decisionSummary: string;
  confidence: number; evidenceCount: number; knowledgeSources: string[];
  memoryTouches: number; toolCalls: number; policyChecks: string[];
  risks: string[]; humanApprover?: string;
}

export interface TrustScores {
  trust: number; alignment: number; safety: number; compliance: number;
  transparency: number; explainability: number; reliability: number;
  hallucinationRisk: number; evidenceQuality: number; dataFreshnessHours: number;
  humanApprovalRate: number; operationalStability: number;
}

export interface GovernanceGate {
  id: string; name: string; level: "l1_auto"|"l2_manager"|"l3_director"|"l4_exec"|"l5_board";
  pending: number; approved24h: number; rejected24h: number; avgDecisionMin: number;
}

export interface OpexKpi { label: string; value: number; target: number; unit?: string; trend: "up"|"down"|"flat"; }

export interface OpexDashboard {
  trust: TrustScores;
  safety: { passRate: number; alertsOpen: number; alertsCritical: number; mitigations24h: number; auditsCompleted: number; benchmarks: Record<SafetyCategory, { pass: boolean; score: number }>; };
  regulations: { tracked: number; changed30d: number; openGaps: number; upcoming: number; };
  playbooks: { total: number; active: number; simulating: number; avgCompliancePct: number; };
  explanations: { available24h: number; avgEvidence: number; avgConfidence: number; challenged: number; challengedUpheld: number; };
  governance: { gates: GovernanceGate[]; pendingTotal: number; emergencyShutdowns: number; overrides24h: number; };
  continuous: { kpis: OpexKpi[]; bottlenecks: Array<{ area: string; impact: "low"|"med"|"high"; recommendation: string }>; maturityScore: number; };
  recentAlerts: SafetyAlert[];
  recentRegulations: Regulation[];
  recentExplanations: Explanation[];
  collaborationSessionsActive: number;
  decisionsRequiringHuman: number;
}
