/**
 * WINDELS Sports Intelligence & AI Ticket Engine.
 *
 * Shared contracts for the Sports Intelligence module. Types here are the
 * single source of truth for the API, engines, HTTP routes and web client.
 *
 * Safety: the system never guarantees winnings, never fabricates fixtures,
 * odds, injuries, lineups or results, and may return NO QUALIFIED TICKET.
 */

import { z } from "zod";

// ─── Operating modes ────────────────────────────────────────────────────

export const SI_OPERATING_MODES = ["SANDBOX", "PAPER", "PRODUCTION"] as const;
export type SiOperatingMode = (typeof SI_OPERATING_MODES)[number];

export const SI_DATA_CLASSES = ["SANDBOX", "LIVE", "HISTORICAL"] as const;
export type SiDataClass = (typeof SI_DATA_CLASSES)[number];

export const SI_PROVIDER_STATUSES = [
  "ONLINE",
  "DEGRADED",
  "OFFLINE",
  "RATE_LIMITED",
  "AUTHENTICATION_ERROR",
  "DATA_ERROR",
  "NOT_CONFIGURED",
] as const;
export type SiProviderStatus = (typeof SI_PROVIDER_STATUSES)[number];

export const SI_MATCH_STATUSES = [
  "SCHEDULED",
  "LIVE",
  "HT",
  "FT",
  "POSTPONED",
  "CANCELLED",
  "SUSPENDED",
  "ABANDONED",
  "UNKNOWN",
] as const;
export type SiMatchStatus = (typeof SI_MATCH_STATUSES)[number];

export const SI_QUALITY_BANDS = ["EXCELLENT", "GOOD", "LIMITED", "REJECT"] as const;
export type SiQualityBand = (typeof SI_QUALITY_BANDS)[number];

export const SI_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "REJECTED"] as const;
export type SiRiskLevel = (typeof SI_RISK_LEVELS)[number];

export const SI_CORRELATION_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type SiCorrelationLevel = (typeof SI_CORRELATION_LEVELS)[number];

export const SI_DECISIONS = [
  "QUALIFIED",
  "REJECTED",
  "INSUFFICIENT_DATA",
  "NO_EDGE",
  "HIGH_RISK",
] as const;
export type SiDecision = (typeof SI_DECISIONS)[number];

export const SI_REJECTION_REASONS = [
  "INSUFFICIENT_DATA",
  "LOW_DATA_QUALITY",
  "STALE_ODDS",
  "LOW_MODEL_EDGE",
  "HIGH_RISK",
  "HIGH_CORRELATION",
  "MODEL_DISAGREEMENT",
  "PROVIDER_FAILURE",
  "MARKET_SUSPENDED",
  "MATCH_STATUS_INVALID",
  "INSUFFICIENT_LIQUIDITY",
  "MODEL_NOT_CALIBRATED",
  "OUTSIDE_CONFIGURATION",
  "MODULE_DISABLED",
  "TICKET_ENGINE_DISABLED",
] as const;
export type SiRejectionReason = (typeof SI_REJECTION_REASONS)[number];

export const SI_TICKET_STATUSES = [
  "PENDING",
  "AWAITING_APPROVAL",
  "APPROVED",
  "REJECTED_APPROVAL",
  "WON",
  "LOST",
  "VOID",
  "CANCELLED",
  "SUSPENDED",
  "NO_QUALIFIED_TICKET",
] as const;
export type SiTicketStatus = (typeof SI_TICKET_STATUSES)[number];

export const SI_SELECTION_RESULTS = ["PENDING", "WON", "LOST", "VOID", "CANCELLED"] as const;
export type SiSelectionResult = (typeof SI_SELECTION_RESULTS)[number];

export const SI_APPROVAL_MODES = [
  "VIEW_ONLY",
  "AI_ANALYSIS",
  "AI_TICKET_GENERATION",
  "USER_APPROVAL_REQUIRED",
  "AUTOMATED_EXECUTION",
] as const;
export type SiApprovalMode = (typeof SI_APPROVAL_MODES)[number];

export const SI_MARKETS = [
  "MATCH_WINNER",
  "HOME_WIN",
  "DRAW",
  "AWAY_WIN",
  "OVER_UNDER",
  "BTTS",
  "DOUBLE_CHANCE",
] as const;
export type SiMarket = (typeof SI_MARKETS)[number];

export const SI_JOB_KINDS = [
  "FIXTURE_SYNC",
  "ODDS_SYNC",
  "MATCH_STATUS_SYNC",
  "PREDICTION_GENERATION",
  "DATA_QUALITY",
  "TICKET_CANDIDATES",
  "RESULT_SYNC",
  "RESULT_VERIFICATION",
  "TICKET_SETTLEMENT",
  "PERFORMANCE",
  "MODEL_MONITORING",
  "PROVIDER_HEALTH",
  "DATA_CLEANUP",
] as const;
export type SiJobKind = (typeof SI_JOB_KINDS)[number];

export const SI_JOB_STATUSES = ["RUNNING", "SUCCEEDED", "FAILED", "SKIPPED"] as const;
export type SiJobStatus = (typeof SI_JOB_STATUSES)[number];

export const SI_CURRENT_MODEL = {
  name: "WINDELS Sports Model",
  version: "1.0",
  featureVersion: "features-v1.0",
  configVersion: "ticket-cfg-v1.0",
} as const;

export const SI_QUALITY_THRESHOLDS = {
  excellent: 90,
  good: 75,
  limited: 60,
} as const;

// ─── Provenance ─────────────────────────────────────────────────────────

export interface SiFieldProvenance {
  value: unknown;
  source: string | null;
  observedAt: string | null;
  available: boolean;
}

export interface SiVersionStamp {
  modelName: string;
  modelVersion: string;
  featureVersion: string;
  configVersion: string;
  inputDataVersion: string;
}

// ─── Domain records ─────────────────────────────────────────────────────

export interface SiLeague {
  id: string;
  organizationId: string;
  providerId: string;
  providerLeagueId: string;
  name: string;
  country: string | null;
  sport: string;
  dataClass: SiDataClass;
  createdAt: string;
  updatedAt: string;
}

export interface SiTeam {
  id: string;
  organizationId: string;
  providerId: string;
  providerTeamId: string;
  name: string;
  shortName: string | null;
  leagueId: string | null;
  dataClass: SiDataClass;
  createdAt: string;
  updatedAt: string;
}

export interface SiTeamForm {
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  source: string | null;
  observedAt: string | null;
}

export interface SiMatch {
  id: string;
  organizationId: string;
  providerId: string;
  providerMatchId: string;
  leagueId: string;
  leagueName: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  kickoffAt: string;
  status: SiMatchStatus;
  venue: string | null;
  homeForm: SiTeamForm | null;
  awayForm: SiTeamForm | null;
  homeXg: number | null;
  awayXg: number | null;
  homeLeaguePos: number | null;
  awayLeaguePos: number | null;
  restDaysHome: number | null;
  restDaysAway: number | null;
  injuries: SiInjuryNote[];
  lineupsAvailable: boolean;
  lineups: SiLineupNote[];
  homeScore: number | null;
  awayScore: number | null;
  dataClass: SiDataClass;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SiInjuryNote {
  teamId: string;
  player: string;
  status: string;
  source: string;
  observedAt: string;
}

export interface SiLineupNote {
  teamId: string;
  formation: string | null;
  confirmed: boolean;
  source: string;
  observedAt: string;
}

export interface SiOdds {
  id: string;
  organizationId: string;
  matchId: string;
  providerId: string;
  market: SiMarket;
  selection: string;
  line: number | null;
  oddsDecimal: number;
  openingOdds: number | null;
  impliedProbability: number;
  liquidity: number | null;
  suspended: boolean;
  observedAt: string;
  dataClass: SiDataClass;
  createdAt: string;
}

export interface SiDataQuality {
  score: number;
  band: SiQualityBand;
  freshnessScore: number;
  providerReliabilityScore: number;
  missingFields: string[];
  checks: Record<string, boolean>;
  assessedAt: string;
}

export interface SiFeatures {
  version: string;
  recentPerformanceHome: number | null;
  recentPerformanceAway: number | null;
  homeStrength: number | null;
  awayStrength: number | null;
  scoringTrendHome: number | null;
  scoringTrendAway: number | null;
  defensiveTrendHome: number | null;
  defensiveTrendAway: number | null;
  goalAvgHome: number | null;
  goalAvgAway: number | null;
  xgTrendHome: number | null;
  xgTrendAway: number | null;
  restAdvantage: number | null;
  leagueStrength: number | null;
  marketMovement: number | null;
  computedAt: string;
}

export interface SiPrediction {
  id: string;
  organizationId: string;
  matchId: string;
  market: SiMarket;
  selection: string;
  line: number | null;
  oddsId: string | null;
  oddsDecimal: number | null;
  oddsObservedAt: string | null;
  modelProbability: number;
  calibratedProbability: number;
  marketImpliedProbability: number | null;
  expectedValue: number | null;
  confidence: number;
  risk: SiRiskLevel;
  riskScore: number;
  correlationHint: SiCorrelationLevel;
  dataQuality: SiDataQuality;
  features: SiFeatures;
  versions: SiVersionStamp;
  decision: SiDecision;
  rejectionReasons: SiRejectionReason[];
  decisionFactors: string[];
  result: SiSelectionResult;
  dataClass: SiDataClass;
  createdAt: string;
}

export interface SiTicketSelection {
  predictionId: string;
  matchId: string;
  leagueName: string;
  matchLabel: string;
  market: SiMarket;
  selection: string;
  line: number | null;
  oddsDecimal: number;
  oddsObservedAt: string;
  modelProbability: number;
  calibratedProbability: number;
  expectedValue: number | null;
  confidence: number;
  risk: SiRiskLevel;
  result: SiSelectionResult;
  status: SiTicketStatus;
}

export interface SiTicket {
  id: string;
  organizationId: string;
  ticketCode: string;
  createdAt: string;
  settledAt: string | null;
  versions: SiVersionStamp;
  configSnapshot: SiTicketConfig;
  totalOdds: number | null;
  selectionCount: number;
  combinedProbability: number | null;
  confidence: number | null;
  risk: SiRiskLevel | null;
  correlation: SiCorrelationLevel | null;
  dataQualityAvg: number | null;
  status: SiTicketStatus;
  approvalStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
  approvedBy: string | null;
  approvedAt: string | null;
  approvalReason: string | null;
  settlementStatus: "UNSETTLED" | "SETTLED" | "OVERRIDDEN";
  noQualifiedReason: string | null;
  selections: SiTicketSelection[];
  dataClass: SiDataClass;
}

export interface SiTicketConfig {
  enabled: boolean;
  ticketEngineEnabled: boolean;
  mode: SiOperatingMode;
  targetOddsMin: number;
  targetOddsMax: number;
  maxSelections: number;
  minConfidence: number;
  riskLevel: "conservative" | "balanced" | "aggressive";
  allowedMarkets: SiMarket[];
  allowedLeagues: string[];
  minExpectedValue: number;
  maxCorrelation: SiCorrelationLevel;
  minDataQuality: number;
  minLiquidity: number;
  maxExposure: number;
  approvalMode: SiApprovalMode;
  automatedExecution: boolean;
  staleOddsMinutes: number;
  voidRule: "IGNORE" | "REDUCE_ODDS" | "VOID_TICKET";
  modelName: string;
  modelVersion: string;
  updatedAt: string;
  updatedBy: string | null;
}

export const SI_DEFAULT_TICKET_CONFIG: Omit<SiTicketConfig, "updatedAt" | "updatedBy"> = {
  enabled: true,
  ticketEngineEnabled: true,
  mode: "PAPER",
  targetOddsMin: 5,
  targetOddsMax: 8,
  maxSelections: 5,
  minConfidence: 0.75,
  riskLevel: "conservative",
  allowedMarkets: ["HOME_WIN", "AWAY_WIN", "OVER_UNDER", "BTTS", "DRAW"],
  allowedLeagues: [],
  minExpectedValue: 0.02,
  maxCorrelation: "LOW",
  minDataQuality: 80,
  minLiquidity: 0,
  maxExposure: 1,
  approvalMode: "USER_APPROVAL_REQUIRED",
  automatedExecution: false,
  staleOddsMinutes: 30,
  voidRule: "REDUCE_ODDS",
  modelName: SI_CURRENT_MODEL.name,
  modelVersion: SI_CURRENT_MODEL.version,
};

export interface SiResult {
  id: string;
  organizationId: string;
  matchId: string;
  providerId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: SiMatchStatus;
  verified: boolean;
  verifiedAt: string | null;
  verificationSource: string | null;
  raw: Record<string, unknown>;
  dataClass: SiDataClass;
  observedAt: string;
  createdAt: string;
}

export interface SiProviderHealth {
  providerId: string;
  name: string;
  status: SiProviderStatus;
  available: boolean;
  responseTimeMs: number | null;
  errorRate: number | null;
  rateLimited: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFixtureSyncAt: string | null;
  lastOddsSyncAt: string | null;
  lastResultSyncAt: string | null;
  dataFreshnessMinutes: number | null;
  recordsReceived: number;
  invalidRecords: number;
  missingFields: number;
  lastError: string | null;
}

export interface SiModelVersion {
  name: string;
  version: string;
  featureVersion: string;
  createdAt: string;
  notes: string;
  active: boolean;
}

export interface SiModelMetrics {
  modelName: string;
  modelVersion: string;
  sampleSize: number;
  accuracy: number | null;
  winRate: number | null;
  calibrationError: number | null;
  roi: number | null;
  expectedValueAccuracy: number | null;
  drawdown: number | null;
  byLeague: Record<string, { n: number; wins: number; accuracy: number | null }>;
  byMarket: Record<string, { n: number; wins: number; accuracy: number | null }>;
  computedAt: string;
  dataClass: SiDataClass;
}

export interface SiDriftAlert {
  id: string;
  modelName: string;
  modelVersion: string;
  kind: "PERFORMANCE" | "CALIBRATION" | "DISTRIBUTION" | "LEAGUE" | "MARKET";
  message: string;
  requiresReview: boolean;
  createdAt: string;
}

export interface SiJobRun {
  id: string;
  organizationId: string;
  kind: SiJobKind;
  status: SiJobStatus;
  startedAt: string;
  endedAt: string | null;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  errors: string[];
  providerId: string | null;
  executionId: string;
}

export interface SiAuditEntry {
  id: string;
  organizationId: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
}

export interface SiPerformanceSnapshot {
  from: string;
  to: string;
  dataClass: SiDataClass;
  totalPredictions: number;
  totalTickets: number;
  won: number;
  lost: number;
  voided: number;
  noQualified: number;
  winRate: number | null;
  averageOdds: number | null;
  averageConfidence: number | null;
  averageProbability: number | null;
  expectedValue: number | null;
  roi: number | null;
  profitLossUnits: number | null;
  maxDrawdown: number | null;
  modelAccuracy: number | null;
  calibrationError: number | null;
  byMarket: Record<string, { n: number; won: number; lost: number; winRate: number | null }>;
  byLeague: Record<string, { n: number; won: number; lost: number; winRate: number | null }>;
  byModel: Record<string, { n: number; won: number; lost: number; winRate: number | null }>;
  byDate: Array<{ date: string; won: number; lost: number; tickets: number }>;
}

export interface SiBacktestRun {
  id: string;
  organizationId: string;
  createdAt: string;
  createdBy: string | null;
  params: SiBacktestParams;
  result: SiPerformanceSnapshot;
  label: "HISTORICAL_SIMULATION";
}

export interface SiBacktestParams {
  from: string;
  to: string;
  leagueId?: string;
  market?: SiMarket;
  modelVersion?: string;
  minConfidence?: number;
  riskLevel?: SiTicketConfig["riskLevel"];
  oddsMin?: number;
  oddsMax?: number;
  minDataQuality?: number;
}

export interface SiDashboard {
  mode: SiOperatingMode;
  moduleEnabled: boolean;
  ticketEngineEnabled: boolean;
  dataClass: SiDataClass;
  disclaimer: string;
  system: {
    providers: SiProviderHealth[];
    lastSyncAt: string | null;
    dataFreshnessMinutes: number | null;
    aiStatus: "READY" | "DEGRADED" | "DISABLED" | "NO_DATA";
  };
  today: {
    upcomingMatches: number;
    liveMatches: number;
    qualifiedPredictions: number;
    rejectedPredictions: number;
    averageDataQuality: number | null;
    averageConfidence: number | null;
    riskDistribution: Record<SiRiskLevel, number>;
  };
  ticketEngine: {
    config: SiTicketConfig;
    latestTicket: SiTicket | null;
  };
  performance: SiPerformanceSnapshot;
}

export interface SiDecisionReport {
  prediction: SiPrediction;
  match: SiMatch | null;
  why: string[];
  rejectedAlternatives: Array<{ selection: string; reason: string }>;
}

// ─── Input schemas ──────────────────────────────────────────────────────

export const SiTicketConfigPatchSchema = z.object({
  enabled: z.boolean().optional(),
  ticketEngineEnabled: z.boolean().optional(),
  mode: z.enum(SI_OPERATING_MODES).optional(),
  targetOddsMin: z.number().min(1.01).max(1000).optional(),
  targetOddsMax: z.number().min(1.01).max(10000).optional(),
  maxSelections: z.number().int().min(1).max(12).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  riskLevel: z.enum(["conservative", "balanced", "aggressive"]).optional(),
  allowedMarkets: z.array(z.enum(SI_MARKETS)).max(20).optional(),
  allowedLeagues: z.array(z.string().max(80)).max(80).optional(),
  minExpectedValue: z.number().min(-1).max(10).optional(),
  maxCorrelation: z.enum(SI_CORRELATION_LEVELS).optional(),
  minDataQuality: z.number().min(0).max(100).optional(),
  minLiquidity: z.number().min(0).optional(),
  maxExposure: z.number().min(0).optional(),
  approvalMode: z.enum(SI_APPROVAL_MODES).optional(),
  automatedExecution: z.literal(false).optional(),
  staleOddsMinutes: z.number().int().min(1).max(24 * 60).optional(),
  voidRule: z.enum(["IGNORE", "REDUCE_ODDS", "VOID_TICKET"]).optional(),
  reason: z.string().trim().min(3).max(400).optional(),
});
export type SiTicketConfigPatch = z.infer<typeof SiTicketConfigPatchSchema>;

export const SiApproveTicketSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().trim().min(2).max(400),
});
export type SiApproveTicketInput = z.infer<typeof SiApproveTicketSchema>;

export const SiOverrideSettlementSchema = z.object({
  status: z.enum(["WON", "LOST", "VOID", "CANCELLED"]),
  reason: z.string().trim().min(4).max(400),
});
export type SiOverrideSettlementInput = z.infer<typeof SiOverrideSettlementSchema>;

export const SiBacktestParamsSchema = z.object({
  from: z.string().min(8).max(40),
  to: z.string().min(8).max(40),
  leagueId: z.string().max(80).optional(),
  market: z.enum(SI_MARKETS).optional(),
  modelVersion: z.string().max(40).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  riskLevel: z.enum(["conservative", "balanced", "aggressive"]).optional(),
  oddsMin: z.number().min(1).optional(),
  oddsMax: z.number().min(1).optional(),
  minDataQuality: z.number().min(0).max(100).optional(),
});

export const SiGenerateTicketSchema = z.object({
  force: z.boolean().optional(),
});

export const SiDateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  range: z.enum(["today", "7d", "30d", "90d", "custom"]).optional(),
});

export const SI_DISCLAIMER =
  "WINDELS Sports Intelligence does not guarantee winnings or profits. Predictions are probabilistic estimates from available verified data. Positive expected value is not a guaranteed win. When information is insufficient the system returns NO QUALIFIED TICKET.";
