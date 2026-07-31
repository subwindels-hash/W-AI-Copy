/**
 * Session 25 — AI Program Management shared types (Phase 24, Slices 205–210).
 */

// ─── Slice 205: Roadmap Planning Agent ──────────────────────────
export type RoadmapStatus = "draft" | "proposed" | "approved" | "in_progress" | "completed" | "at_risk" | "blocked";
export type InitiativePriority = "p0" | "p1" | "p2" | "p3";
export type Quarter = "Q1" | "Q2" | "Q3" | "Q4";

export interface Milestone {
  id: string;
  title: string;
  dueAt: string;
  status: "pending" | "in_progress" | "done" | "at_risk";
  progressPct: number;
}

export interface Initiative {
  id: string;
  roadmapId: string;
  title: string;
  description: string;
  quarter: Quarter;
  year: number;
  priority: InitiativePriority;
  owner: string;
  status: RoadmapStatus;
  progressPct: number;
  dependencies: string[];
  milestones: Milestone[];
  okrSummary?: string;
  aiConfidence: number;
}

export interface Roadmap {
  id: string;
  title: string;
  year: number;
  vision: string;
  themes: string[];
  status: RoadmapStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── Slice 206: Sprint Planning Agent ───────────────────────────
export type SprintStatus = "planned" | "active" | "completed" | "cancelled";
export type StoryPointSuggestionSource = "ai_historical" | "planning_poker" | "rule_of_thumb";
export type StoryStatus = "backlog" | "ready" | "in_progress" | "in_review" | "done" | "blocked";

export interface Story {
  id: string;
  sprintId: string | null;
  key: string;
  title: string;
  epic?: string;
  points: number;
  suggestedPoints?: number;
  suggestSource?: StoryPointSuggestionSource;
  status: StoryStatus;
  assignee?: string;
  tags: string[];
  acceptanceCriteria: string[];
}

export interface Sprint {
  id: string;
  name: string;
  number: number;
  startAt: string;
  endAt: string;
  status: SprintStatus;
  goal: string;
  capacityPoints: number;
  committedPoints: number;
  completedPoints: number;
  velocityProjected: number;
  aiSuggestedGoal?: string;
}

export interface SprintBurndown {
  sprintId: string;
  days: { date: string; remaining: number; ideal: number }[];
}

// ─── Slice 207: Requirements Intelligence ──────────────────────
export type ReqPriority = "must_have" | "should_have" | "could_have" | "wont_have";
export type ReqStatus = "captured" | "refining" | "ready" | "in_development" | "shipped" | "deferred";
export type FeedbackSentiment = "positive" | "neutral" | "negative";

export interface FeedbackCluster {
  id: string;
  theme: string;
  count: number;
  sentiment: FeedbackSentiment;
  sampleQuote?: string;
}

export interface Requirement {
  id: string;
  key: string;
  title: string;
  description: string;
  priority: ReqPriority;
  status: ReqStatus;
  source: "customer" | "internal" | "sales" | "support" | "ai_generated";
  epic?: string;
  tags: string[];
  coverage: {
            hasTests: boolean;
            hasDesign: boolean;
            hasAcceptance: boolean;
            linkedStories: number;
          };
  aiGaps: string[];
  createdAt: string;
}

export interface RequirementIntel {
  totalRequirements: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  coverageScore: number;
  feedbackClusters: FeedbackCluster[];
  topGaps: string[];
}

// ─── Slice 208: Architecture Review Agent ──────────────────────
export type ArchReviewStatus = "proposed" | "in_review" | "approved" | "rejected" | "needs_changes";
export type ArchFindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface ArchFinding {
  id: string;
  reviewId: string;
  area: string;
  severity: ArchFindingSeverity;
  title: string;
  recommendation: string;
  adrRef?: string;
}

export interface ArchReview {
  id: string;
  title: string;
  scope: string;
  requestedBy: string;
  status: ArchReviewStatus;
  findings: ArchFinding[];
  adrsConsulted: string[];
  aiScore: number;
  createdAt: string;
}

export interface ArchHotspot {
  area: string;
  churnScore: number;
  debtHours: number;
  recommendation: string;
}

// ─── Slice 209: Risk Management Agent ──────────────────────────
export type RiskLikelihood = 1 | 2 | 3 | 4 | 5;
export type RiskImpact = 1 | 2 | 3 | 4 | 5;
export type RiskStatus = "identified" | "assessed" | "mitigating" | "accepted" | "resolved" | "escalated";
export type RiskCategory = "technical" | "schedule" | "resource" | "security" | "compliance" | "market" | "operational";

export interface Mitigation {
  id: string;
  action: string;
  owner: string;
  dueAt?: string;
  status: "planned" | "in_progress" | "done";
}

export interface Risk {
  id: string;
  key: string;
  title: string;
  category: RiskCategory;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  status: RiskStatus;
  owner: string;
  description: string;
  mitigations: Mitigation[];
  createdAt: string;
}

export interface RiskMatrix {
  total: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  criticalCount: number;
  highCount: number;
  residualScore: number;
}

// ─── Slice 210: Executive Reporting Agent ──────────────────────
export type KPITrend = "up" | "down" | "flat";

export interface KPI {
  id: string;
  label: string;
  value: number;
  unit?: string;
  target?: number;
  trend: KPITrend;
  deltaPct?: number;
}

export interface OKR {
  id: string;
  objective: string;
  keyResults: { title: string; progressPct: number; status: "on_track" | "at_risk" | "off_track" }[];
}

export interface ExecReport {
  id: string;
  period: string;
  generatedAt: string;
  headline: string;
  summary: string;
  kpis: KPI[];
  okrs: OKR[];
  highlights: string[];
  watchItems: string[];
  aiNarrative: string;
}
