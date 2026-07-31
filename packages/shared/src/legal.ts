/**
 * Session 66 — Enterprise Legal Intelligence Suite.
 * Litigation intel, regulatory monitoring, compliance automation, legal
 * research, policy drafting, CLM, risk analysis, legal KG.
 */

export const LEGAL_AREAS = ["litigation","regulatory","compliance","research","policy","contracts","risk","kg"] as const;
export type LegalArea = typeof LEGAL_AREAS[number];

export interface LegalMatter {
  id: string;
  title: string;
  kind: "litigation"|"contract"|"regulatory"|"ip"|"employment"|"compliance"|"advisory";
  status: "open"|"active"|"review"|"closed"|"escalated";
  riskScore: number; // 0..100
  owner?: string;
  dueDate?: string;
  openedAt: string;
  updatedAt: string;
  summary?: string;
}

export interface RegulatoryUpdate {
  id: string;
  jurisdiction: string;
  title: string;
  topic: string;
  effectiveAt?: string;
  impact: "low"|"medium"|"high"|"critical";
  summary: string;
  acknowledged: boolean;
  publishedAt: string;
}

export interface Contract {
  id: string;
  title: string;
  counterparty: string;
  type: "nda"|"msa"|"sow"|"employment"|"vendor"|"lease"|"license"|"other";
  status: "draft"|"negotiating"|"review"|"signed"|"expired"|"terminated";
  valueUsd?: number;
  startDate?: string;
  endDate?: string;
  riskFlags: string[];
  clausesCount: number;
  owner?: string;
  version: number;
  updatedAt: string;
}

export interface LegalResearchItem {
  id: string;
  query: string;
  sources: number;
  citations: string[];
  summary: string;
  createdAt: string;
}

export interface LegalComplianceCheck {
  id: string;
  framework: string;
  control: string;
  status: "pass"|"gap"|"fail";
  evidence?: string;
  lastCheckedAt: string;
}

export interface LegalDashboard {
  mattersOpen: number;
  mattersAtRisk: number;
  contractsActive: number;
  contractsExpiring90d: number;
  regulatoryUpdates7d: number;
  openResearchTasks: number;
  compliancePassRate: number;
  riskAvg: number;
  mattersByStatus: Record<string, number>;
  recentMatters: LegalMatter[];
  recentUpdates: RegulatoryUpdate[];
  recentContracts: Contract[];
  upcomingDeadlines: Array<{ id: string; title: string; dueDate: string; kind: string }>;
  topRisks: Array<{ topic: string; score: number }>;
}
