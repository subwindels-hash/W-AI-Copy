/**
 * WINDELS Lottery Intelligence.
 *
 * Shared contracts for lottery analysis, combination generation, system
 * building and historical backtesting. EuroMillions is the first lottery;
 * others plug in through LiLotteryRules.
 *
 * Honesty: lottery draws are random. Historical frequency does not change
 * the mathematical probability of the next independent draw. Scores are
 * statistical-fit / diversity measures, never win probabilities.
 */

import { z } from "zod";

export const LI_OPERATING_MODES = ["SANDBOX", "PAPER", "PRODUCTION"] as const;
export type LiOperatingMode = (typeof LI_OPERATING_MODES)[number];

export const LI_DATA_CLASSES = ["SANDBOX", "OFFICIAL", "UNVERIFIED"] as const;
export type LiDataClass = (typeof LI_DATA_CLASSES)[number];

export const LI_PROVIDER_STATUSES = [
  "ONLINE",
  "DEGRADED",
  "OFFLINE",
  "DATA_ERROR",
  "NOT_CONFIGURED",
] as const;
export type LiProviderStatus = (typeof LI_PROVIDER_STATUSES)[number];

export const LI_GENERATION_MODES = [
  "RANDOM",
  "BALANCED",
  "HISTORICAL",
  "DIVERSIFIED",
  "ANTI_POPULAR",
  "AI_ANALYSIS",
] as const;
export type LiGenerationMode = (typeof LI_GENERATION_MODES)[number];

export const LI_JOB_KINDS = [
  "DRAW_SYNC",
  "HISTORICAL_SYNC",
  "RESULT_VERIFICATION",
  "STATISTICS",
  "FREQUENCY",
  "GAPS",
  "TICKET_CHECK",
  "STRATEGY_PERF",
  "PROVIDER_HEALTH",
  "DATA_CLEANUP",
] as const;
export type LiJobKind = (typeof LI_JOB_KINDS)[number];

export const LI_JOB_STATUSES = ["RUNNING", "SUCCEEDED", "FAILED", "SKIPPED"] as const;
export type LiJobStatus = (typeof LI_JOB_STATUSES)[number];

export const LI_TICKET_STATUSES = ["DRAFT", "SAVED", "CHECKED", "ARCHIVED"] as const;
export type LiTicketStatus = (typeof LI_TICKET_STATUSES)[number];

export const LI_CURRENT_MODEL = {
  name: "WINDELS Lottery Model",
  version: "1.0",
  strategyVersion: "strategies-v1.0",
  statsVersion: "stats-v1.0",
} as const;

export const LI_DISCLAIMER =
  "Lottery draws are random. Historical statistics and AI-generated combinations cannot guarantee future results or increase the mathematical probability of a specific valid combination being drawn. A statistical-fit score is not a win probability.";

export const EUROMILLIONS_PRIZE_TIERS = [
  "5+2",
  "5+1",
  "5+0",
  "4+2",
  "4+1",
  "3+2",
  "4+0",
  "2+2",
  "3+1",
  "3+0",
  "1+2",
  "2+1",
  "2+0",
] as const;

export const POWERBALL_PRIZE_TIERS = [
  "5+1",
  "5+0",
  "4+1",
  "4+0",
  "3+1",
  "3+0",
  "2+1",
  "1+1",
  "0+1",
] as const;

export type LiPrizeTier =
  | (typeof EUROMILLIONS_PRIZE_TIERS)[number]
  | (typeof POWERBALL_PRIZE_TIERS)[number]
  | "NONE";

export interface LiLotteryRules {
  lotteryId: string;
  name: string;
  mainMin: number;
  mainMax: number;
  mainCount: number;
  bonusMin: number;
  bonusCount: number;
  bonusMax: number;
  bonusLabel: string;
  prizeTiers: readonly string[];
  drawWeekdays: number[];
  nextDrawHint: string;
  linePriceMinor: number | null;
  currency: string | null;
  lowHighSplit: number;
  version: string;
  updatedAt: string;
}

export const EUROMILLIONS_RULES: LiLotteryRules = {
  lotteryId: "euromillions",
  name: "EuroMillions",
  mainMin: 1,
  mainMax: 50,
  mainCount: 5,
  bonusMin: 1,
  bonusMax: 12,
  bonusCount: 2,
  bonusLabel: "Lucky Stars",
  prizeTiers: EUROMILLIONS_PRIZE_TIERS,
  drawWeekdays: [2, 5],
  nextDrawHint: "EuroMillions draws are typically Tuesday and Friday evenings. Confirm locally — this is not an official countdown feed.",
  linePriceMinor: null,
  currency: null,
  lowHighSplit: 25,
  version: "rules-v1.0",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

/** US Powerball — second catalogued lottery. 5 from 1–69 + 1 Powerball from 1–26. */
export const POWERBALL_RULES: LiLotteryRules = {
  lotteryId: "powerball",
  name: "Powerball",
  mainMin: 1,
  mainMax: 69,
  mainCount: 5,
  bonusMin: 1,
  bonusMax: 26,
  bonusCount: 1,
  bonusLabel: "Powerball",
  prizeTiers: POWERBALL_PRIZE_TIERS,
  drawWeekdays: [1, 3, 6],
  nextDrawHint: "US Powerball draws are typically Monday, Wednesday and Saturday evenings (US time). Confirm locally — this is not an official countdown feed.",
  linePriceMinor: null,
  currency: null,
  lowHighSplit: 34,
  version: "rules-v1.0",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

export const LI_LOTTERY_CATALOG: LiLotteryRules[] = [EUROMILLIONS_RULES, POWERBALL_RULES];

export function getLotteryRules(lotteryId: string): LiLotteryRules | null {
  const key = lotteryId.trim().toLowerCase();
  return LI_LOTTERY_CATALOG.find((r) => r.lotteryId === key) ?? null;
}

export function requireLotteryRules(lotteryId: string): LiLotteryRules {
  const found = getLotteryRules(lotteryId);
  if (!found) {
    const err: Error & { code?: string; status?: number } = new Error(
      `Lottery '${lotteryId}' is not in the WINDELS catalog`,
    );
    err.code = "LOTTERY_NOT_SUPPORTED";
    err.status = 400;
    throw err;
  }
  return found;
}

export interface LiDraw {
  id: string;
  organizationId: string;
  lotteryId: string;
  providerId: string;
  providerDrawId: string;
  drawDate: string;
  mainNumbers: number[];
  bonusNumbers: number[];
  jackpotMinor: number | null;
  currency: string | null;
  rollover: boolean | null;
  winners: number | null;
  prizeTable: Record<string, { winners: number | null; amountMinor: number | null }> | null;
  source: string;
  sourceTimestamp: string | null;
  retrievedAt: string;
  verified: boolean;
  verifiedAt: string | null;
  validationStatus: "VALID" | "DATA_VALIDATION_FAILED";
  validationErrors: string[];
  dataClass: LiDataClass;
  stale: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LiNumberStat {
  number: number;
  kind: "MAIN" | "BONUS";
  appearances: number;
  appearancePct: number;
  lastAppearance: string | null;
  drawsSince: number | null;
  averageGap: number | null;
  minGap: number | null;
  maxGap: number | null;
  recentAppearances: number;
  recentPct: number;
  frequencyTrend: "UP" | "DOWN" | "FLAT" | "UNKNOWN";
}

export interface LiDistributionSnapshot {
  windowDraws: number;
  oddEven: Record<string, number>;
  lowHigh: Record<string, number>;
  sum: { min: number | null; max: number | null; average: number | null; median: number | null };
  spread: { min: number | null; max: number | null; average: number | null };
  consecutiveDraws: number;
  consecutivePct: number | null;
}

export interface LiPairStat {
  a: number;
  b: number;
  kind: "MAIN" | "BONUS";
  appearances: number;
  lastAppearance: string | null;
  averageGap: number | null;
  recentAppearances: number;
}

export interface LiCombinationProfile {
  mainNumbers: number[];
  bonusNumbers: number[];
  odd: number;
  even: number;
  low: number;
  high: number;
  sum: number;
  spread: number;
  consecutiveGroups: number[][];
  frequencyProfile: { hot: number; cold: number; mid: number };
  gapProfile: { averageDrawsSince: number | null };
  patternFlags: string[];
  statisticalFitScore: number;
  diversityScore: number | null;
  assessment: "BALANCED" | "CONCENTRATED" | "SEQUENTIAL" | "BIRTHDAY_HEAVY" | "UNUSUAL" | "INSUFFICIENT_DATA";
}

export interface LiGeneratedLine {
  id: string;
  mainNumbers: number[];
  bonusNumbers: number[];
  profile: LiCombinationProfile;
  mode: LiGenerationMode;
  why: string[];
  versions: LiVersionStamp;
}

export interface LiVersionStamp {
  modelName: string;
  modelVersion: string;
  strategyVersion: string;
  statsVersion: string;
  rulesVersion: string;
  inputDataVersion: string;
}

export interface LiTicketLine {
  id: string;
  mainNumbers: number[];
  bonusNumbers: number[];
  mode: LiGenerationMode;
  profile: LiCombinationProfile;
  matchMain: number | null;
  matchBonus: number | null;
  prizeTier: LiPrizeTier | null;
}

export interface LiTicket {
  id: string;
  organizationId: string;
  userId: string;
  lotteryId: string;
  name: string;
  createdAt: string;
  drawDate: string | null;
  drawId: string | null;
  lines: LiTicketLine[];
  generationMode: LiGenerationMode;
  lockedMain: number[];
  excludedMain: number[];
  lockedBonus: number[];
  excludedBonus: number[];
  versions: LiVersionStamp;
  status: LiTicketStatus;
  dataClass: LiDataClass;
  checkedAt: string | null;
}

export interface LiSystemPlan {
  lotteryId: string;
  mainPool: number[];
  bonusPool: number[];
  mainCombinations: number;
  bonusCombinations: number;
  totalLines: number;
  estimatedCostMinor: number | null;
  currency: string | null;
  truncated: boolean;
  lines: Array<{ mainNumbers: number[]; bonusNumbers: number[] }>;
}

export interface LiBacktestParams {
  lotteryId: string;
  strategy: LiGenerationMode;
  linesPerDraw: number;
  from?: string;
  to?: string;
  lastN?: number;
  lockedMain?: number[];
  excludedMain?: number[];
  lockedBonus?: number[];
  excludedBonus?: number[];
}

export interface LiBacktestResult {
  id: string;
  organizationId: string;
  createdAt: string;
  createdBy: string | null;
  params: LiBacktestParams;
  label: "HISTORICAL_SIMULATION";
  drawsEvaluated: number;
  linesGenerated: number;
  matches: Record<string, number>;
  prizeTiers: Record<string, number>;
  simulatedCostMinor: number | null;
  simulatedWinningsMinor: number | null;
  simulatedReturn: number | null;
  drawResults: Array<{
    drawId: string;
    drawDate: string;
    bestMain: number;
    bestBonus: number;
    bestTier: LiPrizeTier;
  }>;
  randomBaseline: {
    matches: Record<string, number>;
    prizeTiers: Record<string, number>;
  } | null;
  versions: LiVersionStamp;
  dataClass: LiDataClass;
}

export interface LiProviderHealth {
  providerId: string;
  name: string;
  status: LiProviderStatus;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDrawRetrieved: string | null;
  responseTimeMs: number | null;
  errorCount: number;
  validationFailures: number;
  dataFreshnessHours: number | null;
  lastError: string | null;
}

export interface LiJobRun {
  id: string;
  organizationId: string;
  kind: LiJobKind;
  status: LiJobStatus;
  startedAt: string;
  endedAt: string | null;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  errors: string[];
  providerId: string | null;
  executionId: string;
}

export interface LiAuditEntry {
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

export interface LiConfig {
  enabled: boolean;
  euromillionsEnabled: boolean;
  powerballEnabled: boolean;
  mode: LiOperatingMode;
  staleHours: number;
  maxSystemLines: number;
  maxGenerateLines: number;
  defaultWindow: number;
  linePriceMinor: number | null;
  currency: string | null;
  modelName: string;
  modelVersion: string;
  updatedAt: string;
  updatedBy: string | null;
}

export const LI_DEFAULT_CONFIG: Omit<LiConfig, "updatedAt" | "updatedBy"> = {
  enabled: true,
  euromillionsEnabled: true,
  powerballEnabled: true,
  mode: "PAPER",
  staleHours: 80,
  maxSystemLines: 500,
  maxGenerateLines: 50,
  defaultWindow: 50,
  linePriceMinor: null,
  currency: null,
  modelName: LI_CURRENT_MODEL.name,
  modelVersion: LI_CURRENT_MODEL.version,
};

export interface LiPerformance {
  dataClass: LiDataClass;
  savedTickets: number;
  totalLines: number;
  drawsTracked: number;
  checkedTickets: number;
  prizeTiers: Record<string, number>;
  averageDiversity: number | null;
  mainUsage: Record<string, number>;
  bonusUsage: Record<string, number>;
  backtests: number;
}

export interface LiDashboard {
  mode: LiOperatingMode;
  moduleEnabled: boolean;
  lotteryEnabled: boolean;
  lotteryId: string;
  lotteries: LiLotteryRules[];
  dataClass: LiDataClass;
  disclaimer: string;
  rules: LiLotteryRules;
  nextDrawHint: string;
  lastDraw: LiDraw | null;
  jackpotMinor: number | null;
  currency: string | null;
  stale: boolean;
  hotMain: number[];
  coldMain: number[];
  recentMain: number[];
  longestGaps: Array<{ number: number; drawsSince: number | null }>;
  hotBonus: number[];
  coldBonus: number[];
  recentBonus: number[];
  providers: LiProviderHealth[];
  performance: LiPerformance;
}

export const LiConfigPatchSchema = z.object({
  enabled: z.boolean().optional(),
  euromillionsEnabled: z.boolean().optional(),
  powerballEnabled: z.boolean().optional(),
  mode: z.enum(LI_OPERATING_MODES).optional(),
  staleHours: z.number().int().min(1).max(24 * 30).optional(),
  maxSystemLines: z.number().int().min(1).max(5000).optional(),
  maxGenerateLines: z.number().int().min(1).max(200).optional(),
  defaultWindow: z.number().int().min(5).max(1000).optional(),
  linePriceMinor: z.number().int().min(0).nullable().optional(),
  currency: z.string().max(8).nullable().optional(),
  reason: z.string().trim().min(3).max(400).optional(),
});
export type LiConfigPatch = z.infer<typeof LiConfigPatchSchema>;

export const LiGenerateSchema = z.object({
  lotteryId: z.string().default("euromillions"),
  mode: z.enum(LI_GENERATION_MODES).default("BALANCED"),
  count: z.number().int().min(1).max(200).default(1),
  window: z.number().int().min(5).max(1000).optional(),
  lockedMain: z.array(z.number().int()).max(5).default([]),
  excludedMain: z.array(z.number().int()).max(49).default([]),
  lockedBonus: z.array(z.number().int()).max(2).default([]),
  excludedBonus: z.array(z.number().int()).max(11).default([]),
});
export type LiGenerateInput = z.infer<typeof LiGenerateSchema>;

export const LiAnalyzeSchema = z.object({
  lotteryId: z.string().default("euromillions"),
  mainNumbers: z.array(z.number().int()).min(5).max(5),
  bonusNumbers: z.array(z.number().int()).min(2).max(2),
  window: z.number().int().min(5).max(1000).optional(),
});
export type LiAnalyzeInput = z.infer<typeof LiAnalyzeSchema>;

export const LiSystemSchema = z.object({
  lotteryId: z.string().default("euromillions"),
  mainPool: z.array(z.number().int()).min(5).max(20),
  bonusPool: z.array(z.number().int()).min(2).max(12),
  expand: z.boolean().optional(),
});
export type LiSystemInput = z.infer<typeof LiSystemSchema>;

export const LiTicketCreateSchema = z.object({
  lotteryId: z.string().default("euromillions"),
  name: z.string().trim().min(1).max(120),
  drawDate: z.string().max(40).nullable().optional(),
  generationMode: z.enum(LI_GENERATION_MODES).default("BALANCED"),
  lockedMain: z.array(z.number().int()).max(5).default([]),
  excludedMain: z.array(z.number().int()).max(49).default([]),
  lockedBonus: z.array(z.number().int()).max(2).default([]),
  excludedBonus: z.array(z.number().int()).max(11).default([]),
  lines: z.array(z.object({
    mainNumbers: z.array(z.number().int()).min(5).max(5),
    bonusNumbers: z.array(z.number().int()).min(2).max(2),
    mode: z.enum(LI_GENERATION_MODES).optional(),
  })).min(1).max(200),
});
export type LiTicketCreateInput = z.infer<typeof LiTicketCreateSchema>;

export const LiBacktestParamsSchema = z.object({
  lotteryId: z.string().default("euromillions"),
  strategy: z.enum(LI_GENERATION_MODES).default("BALANCED"),
  linesPerDraw: z.number().int().min(1).max(20).default(1),
  from: z.string().optional(),
  to: z.string().optional(),
  lastN: z.number().int().min(5).max(500).optional(),
  lockedMain: z.array(z.number().int()).max(5).optional(),
  excludedMain: z.array(z.number().int()).max(49).optional(),
  lockedBonus: z.array(z.number().int()).max(2).optional(),
  excludedBonus: z.array(z.number().int()).max(11).optional(),
});

export const LiWindowSchema = z.object({
  lotteryId: z.string().optional(),
  window: z.enum(["all", "10", "25", "50", "100", "250", "custom"]).optional(),
  lastN: z.number().int().min(1).max(2000).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});
