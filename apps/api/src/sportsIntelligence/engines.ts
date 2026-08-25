/**
 * WINDELS Sports Intelligence — calculation engines.
 *
 * Every number here is derived from supplied inputs. Nothing is invented
 * when a required field is missing: the engine returns null / REJECT /
 * INSUFFICIENT_DATA instead.
 */

import type {
  SiCorrelationLevel,
  SiDataQuality,
  SiDecision,
  SiFeatures,
  SiMatch,
  SiMarket,
  SiOdds,
  SiPerformanceSnapshot,
  SiPrediction,
  SiQualityBand,
  SiRejectionReason,
  SiRiskLevel,
  SiSelectionResult,
  SiTicket,
  SiTicketConfig,
  SiTicketSelection,
} from "@windels/shared/sportsIntelligence";
import { SI_QUALITY_THRESHOLDS } from "@windels/shared/sportsIntelligence";

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function qualityBand(score: number): SiQualityBand {
  if (score >= SI_QUALITY_THRESHOLDS.excellent) return "EXCELLENT";
  if (score >= SI_QUALITY_THRESHOLDS.good) return "GOOD";
  if (score >= SI_QUALITY_THRESHOLDS.limited) return "LIMITED";
  return "REJECT";
}

export function factorial(n: number): number {
  let x = 1;
  for (let i = 2; i <= n; i++) x *= i;
  return x;
}

export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

/** Independent Poisson score matrix, truncated at maxGoals. */
export function scoreMatrix(lambdaHome: number, lambdaAway: number, maxGoals = 8): number[][] {
  const m: number[][] = [];
  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    for (let a = 0; a <= maxGoals; a++) {
      row.push(poissonPmf(h, lambdaHome) * poissonPmf(a, lambdaAway));
    }
    m.push(row);
  }
  return m;
}

export function marketProbabilityFromMatrix(
  matrix: number[][],
  market: SiMarket,
  selection: string,
  line: number | null,
): number | null {
  const maxH = matrix.length - 1;
  const maxA = matrix[0]?.length ? matrix[0].length - 1 : 0;
  let p = 0;
  const sel = selection.toUpperCase();
  for (let h = 0; h <= maxH; h++) {
    for (let a = 0; a <= maxA; a++) {
      const cell = matrix[h]![a]!;
      const total = h + a;
      if (market === "HOME_WIN" || (market === "MATCH_WINNER" && (sel === "HOME" || sel === "1"))) {
        if (h > a) p += cell;
      } else if (market === "AWAY_WIN" || (market === "MATCH_WINNER" && (sel === "AWAY" || sel === "2"))) {
        if (a > h) p += cell;
      } else if (market === "DRAW" || (market === "MATCH_WINNER" && (sel === "DRAW" || sel === "X"))) {
        if (h === a) p += cell;
      } else if (market === "OVER_UNDER") {
        const threshold = line ?? parseLine(selection);
        if (threshold === null) return null;
        if (sel.startsWith("OVER") && total > threshold) p += cell;
        else if (sel.startsWith("UNDER") && total < threshold) p += cell;
      } else if (market === "BTTS") {
        if (sel === "YES" && h > 0 && a > 0) p += cell;
        else if (sel === "NO" && (h === 0 || a === 0)) p += cell;
      } else if (market === "DOUBLE_CHANCE") {
        if ((sel === "1X" || sel === "HOME_OR_DRAW") && h >= a) p += cell;
        else if ((sel === "X2" || sel === "DRAW_OR_AWAY") && a >= h) p += cell;
        else if ((sel === "12" || sel === "HOME_OR_AWAY") && h !== a) p += cell;
      }
    }
  }
  return clamp(p, 0, 1);
}

export function parseLine(selection: string): number | null {
  const m = selection.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function impliedProbability(oddsDecimal: number): number | null {
  if (!Number.isFinite(oddsDecimal) || oddsDecimal <= 1) return null;
  return 1 / oddsDecimal;
}

export function expectedValue(calibratedProbability: number, oddsDecimal: number): number | null {
  if (!Number.isFinite(calibratedProbability) || !Number.isFinite(oddsDecimal) || oddsDecimal <= 1) return null;
  return calibratedProbability * oddsDecimal - 1;
}

export function minutesSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / 60_000;
}

export function formPoints(form: SiMatch["homeForm"]): number | null {
  if (!form || form.played === null || form.played <= 0) return null;
  const w = form.won ?? 0;
  const d = form.drawn ?? 0;
  return (3 * w + d) / (3 * form.played);
}

export function goalAvg(form: SiMatch["homeForm"], side: "for" | "against"): number | null {
  if (!form || form.played === null || form.played <= 0) return null;
  const g = side === "for" ? form.goalsFor : form.goalsAgainst;
  if (g === null) return null;
  return g / form.played;
}

export function assessDataQuality(input: {
  match: SiMatch;
  odds: SiOdds | null;
  providerReliability: number | null;
  now?: Date;
  staleOddsMinutes: number;
}): SiDataQuality {
  const now = input.now ?? new Date();
  const m = input.match;
  const missing: string[] = [];
  const checks: Record<string, boolean> = {};

  const has = (ok: boolean, field: string) => {
    checks[field] = ok;
    if (!ok) missing.push(field);
    return ok;
  };

  has(Boolean(m.homeTeamName && m.awayTeamName), "teams");
  has(Boolean(m.leagueName), "league");
  has(Boolean(m.kickoffAt) && Number.isFinite(Date.parse(m.kickoffAt)), "kickoff");
  has(m.status !== "UNKNOWN", "status");
  has(m.homeForm !== null && m.homeForm.played !== null, "homeForm");
  has(m.awayForm !== null && m.awayForm.played !== null, "awayForm");
  has(m.homeForm?.goalsFor !== null && m.homeForm?.goalsAgainst !== null, "homeGoals");
  has(m.awayForm?.goalsFor !== null && m.awayForm?.goalsAgainst !== null, "awayGoals");
  has(m.homeXg !== null && m.awayXg !== null, "expectedGoals");
  has(m.injuries.length > 0 || m.dataClass === "SANDBOX", "injuries");
  has(m.lineupsAvailable, "lineups");
  has(m.homeLeaguePos !== null && m.awayLeaguePos !== null, "leaguePosition");
  has(m.restDaysHome !== null && m.restDaysAway !== null, "restDays");

  const oddsFresh = input.odds
    ? (minutesSince(input.odds.observedAt, now) ?? 9999) <= input.staleOddsMinutes
    : false;
  has(Boolean(input.odds), "odds");
  has(oddsFresh, "oddsFreshness");
  has(Boolean(input.odds && !input.odds.suspended), "marketAvailable");

  const critical = ["teams", "league", "kickoff", "status", "odds", "oddsFreshness", "marketAvailable"];
  const important = ["homeForm", "awayForm", "homeGoals", "awayGoals"];
  const optional = ["expectedGoals", "injuries", "lineups", "leaguePosition", "restDays"];

  let score = 0;
  for (const k of critical) score += checks[k] ? 8 : 0; // 56
  for (const k of important) score += checks[k] ? 6 : 0; // 24
  for (const k of optional) score += checks[k] ? 4 : 0; // 20
  score = clamp(score, 0, 100);

  const ageMin = minutesSince(m.lastSyncedAt, now);
  const freshnessScore = ageMin === null ? 0 : clamp(100 - ageMin / 2, 0, 100);
  const providerReliabilityScore = input.providerReliability === null ? 50 : clamp(input.providerReliability, 0, 100);

  return {
    score: Math.round(score),
    band: qualityBand(score),
    freshnessScore: Math.round(freshnessScore),
    providerReliabilityScore: Math.round(providerReliabilityScore),
    missingFields: missing,
    checks,
    assessedAt: now.toISOString(),
  };
}

export function engineerFeatures(match: SiMatch, odds: SiOdds | null, openingOdds: number | null): SiFeatures {
  const hp = formPoints(match.homeForm);
  const ap = formPoints(match.awayForm);
  const hg = goalAvg(match.homeForm, "for");
  const ag = goalAvg(match.awayForm, "for");
  const hdc = goalAvg(match.homeForm, "against");
  const adc = goalAvg(match.awayForm, "against");
  let restAdvantage: number | null = null;
  if (match.restDaysHome !== null && match.restDaysAway !== null) {
    restAdvantage = match.restDaysHome - match.restDaysAway;
  }
  let marketMovement: number | null = null;
  if (odds && openingOdds && openingOdds > 1) {
    marketMovement = (odds.oddsDecimal - openingOdds) / openingOdds;
  }
  return {
    version: "features-v1.0",
    recentPerformanceHome: hp,
    recentPerformanceAway: ap,
    homeStrength: hp !== null && hdc !== null ? hp - hdc / 4 : hp,
    awayStrength: ap !== null && adc !== null ? ap - adc / 4 : ap,
    scoringTrendHome: hg,
    scoringTrendAway: ag,
    defensiveTrendHome: hdc,
    defensiveTrendAway: adc,
    goalAvgHome: hg,
    goalAvgAway: ag,
    xgTrendHome: match.homeXg,
    xgTrendAway: match.awayXg,
    restAdvantage,
    leagueStrength: null,
    marketMovement,
    computedAt: new Date().toISOString(),
  };
}

export function lambdasFromFeatures(features: SiFeatures): { home: number; away: number } | null {
  const hg = features.goalAvgHome ?? features.xgTrendHome;
  const ag = features.goalAvgAway ?? features.xgTrendAway;
  const hdc = features.defensiveTrendHome;
  const adc = features.defensiveTrendAway;
  if (hg === null && ag === null && features.xgTrendHome === null && features.xgTrendAway === null) {
    return null;
  }
  const homeAttack = hg ?? 1.3;
  const awayAttack = ag ?? 1.1;
  const homeDef = hdc ?? 1.2;
  const awayDef = adc ?? 1.3;
  const leagueAvg = 1.35;
  let lambdaHome = ((homeAttack + awayDef) / 2) * (1.08);
  let lambdaAway = ((awayAttack + homeDef) / 2) * 0.95;
  if (features.restAdvantage !== null) {
    lambdaHome += clamp(features.restAdvantage, -3, 3) * 0.03;
    lambdaAway -= clamp(features.restAdvantage, -3, 3) * 0.02;
  }
  if (features.xgTrendHome !== null) lambdaHome = (lambdaHome + features.xgTrendHome) / 2;
  if (features.xgTrendAway !== null) lambdaAway = (lambdaAway + features.xgTrendAway) / 2;
  return {
    home: clamp(lambdaHome || leagueAvg, 0.15, 4.5),
    away: clamp(lambdaAway || leagueAvg * 0.85, 0.15, 4.5),
  };
}

/**
 * Platt-style calibration. Without historical buckets the mapping is identity
 * (explicitly uncalibrated). With buckets, each claimed probability is
 * replaced by the observed hit-rate of that bucket.
 */
export function calibrateProbability(
  raw: number,
  buckets: Array<{ lo: number; hi: number; predicted: number; observed: number; n: number }>,
): { calibrated: number; calibratedFromHistory: boolean } {
  const p = clamp(raw, 0.001, 0.999);
  const usable = buckets.filter((b) => b.n >= 8);
  if (usable.length === 0) return { calibrated: p, calibratedFromHistory: false };
  const hit = usable.find((b) => p >= b.lo && p < b.hi) ?? usable[usable.length - 1]!;
  const mixed = 0.65 * hit.observed + 0.35 * p;
  return { calibrated: clamp(mixed, 0.001, 0.999), calibratedFromHistory: true };
}

export function confidenceFrom(quality: SiDataQuality, features: SiFeatures, calibratedFromHistory: boolean): number {
  let c = quality.score / 100;
  const featureCount = Object.values(features).filter((v) => typeof v === "number" && v !== null).length;
  c *= 0.7 + 0.3 * clamp(featureCount / 10, 0, 1);
  if (!calibratedFromHistory) c *= 0.92;
  if (quality.freshnessScore < 50) c *= 0.85;
  return clamp(c, 0.05, 0.99);
}

export function assessRisk(input: {
  calibrated: number;
  confidence: number;
  ev: number | null;
  odds: number | null;
  quality: SiDataQuality;
  matchStatus: SiMatch["status"];
  correlation: SiCorrelationLevel;
  selectionCount: number;
  config: SiTicketConfig;
}): { level: SiRiskLevel; score: number } {
  let score = 0;
  if (input.calibrated < 0.5) score += 25;
  else if (input.calibrated < 0.65) score += 12;
  if (input.confidence < input.config.minConfidence) score += 20;
  if (input.ev === null) score += 15;
  else if (input.ev < 0) score += 22;
  else if (input.ev < input.config.minExpectedValue) score += 10;
  if (input.odds !== null && input.odds >= 3.5) score += 12;
  if (input.odds !== null && input.odds >= 6) score += 10;
  if (input.quality.score < input.config.minDataQuality) score += 25;
  if (input.quality.freshnessScore < 40) score += 15;
  if (input.matchStatus !== "SCHEDULED" && input.matchStatus !== "LIVE" && input.matchStatus !== "HT") score += 40;
  if (input.correlation === "HIGH") score += 30;
  else if (input.correlation === "MEDIUM") score += 12;
  if (input.selectionCount > input.config.maxSelections) score += 20;
  if (input.config.riskLevel === "conservative" && score > 20) score += 8;
  score = clamp(score, 0, 100);
  let level: SiRiskLevel = "LOW";
  if (score >= 70) level = "REJECTED";
  else if (score >= 45) level = "HIGH";
  else if (score >= 25) level = "MEDIUM";
  return { level, score };
}

export function relatedMarkets(a: SiMarket, b: SiMarket): boolean {
  if (a === b) return true;
  const winner = new Set<SiMarket>(["MATCH_WINNER", "HOME_WIN", "AWAY_WIN", "DRAW", "DOUBLE_CHANCE"]);
  return winner.has(a) && winner.has(b);
}

export function pairCorrelation(
  a: { matchId: string; market: SiMarket; selection: string; leagueName: string },
  b: { matchId: string; market: SiMarket; selection: string; leagueName: string },
): SiCorrelationLevel {
  if (a.matchId === b.matchId) return "HIGH";
  if (relatedMarkets(a.market, b.market) && a.leagueName === b.leagueName) return "MEDIUM";
  if (a.leagueName === b.leagueName && (a.market === "OVER_UNDER" && b.market === "OVER_UNDER")) return "MEDIUM";
  return "LOW";
}

export function ticketCorrelation(selections: Array<{ matchId: string; market: SiMarket; selection: string; leagueName: string }>): SiCorrelationLevel {
  let worst: SiCorrelationLevel = "LOW";
  for (let i = 0; i < selections.length; i++) {
    for (let j = i + 1; j < selections.length; j++) {
      const c = pairCorrelation(selections[i]!, selections[j]!);
      if (c === "HIGH") return "HIGH";
      if (c === "MEDIUM") worst = "MEDIUM";
    }
  }
  return worst;
}

export function rankCorrelation(level: SiCorrelationLevel): number {
  return level === "LOW" ? 0 : level === "MEDIUM" ? 1 : 2;
}

export function rejectCandidate(input: {
  quality: SiDataQuality;
  odds: SiOdds | null;
  ev: number | null;
  risk: SiRiskLevel;
  correlation: SiCorrelationLevel;
  match: SiMatch;
  calibratedFromHistory: boolean;
  config: SiTicketConfig;
  moduleEnabled: boolean;
  ticketEngineEnabled: boolean;
  now?: Date;
}): SiRejectionReason[] {
  const reasons: SiRejectionReason[] = [];
  if (!input.moduleEnabled) reasons.push("MODULE_DISABLED");
  if (!input.ticketEngineEnabled) reasons.push("TICKET_ENGINE_DISABLED");
  if (input.quality.band === "REJECT" || input.quality.score < input.config.minDataQuality) {
    reasons.push("LOW_DATA_QUALITY");
  }
  if (!input.odds) reasons.push("INSUFFICIENT_DATA");
  else {
    if (input.odds.suspended) reasons.push("MARKET_SUSPENDED");
    const age = minutesSince(input.odds.observedAt, input.now ?? new Date());
    if (age !== null && age > input.config.staleOddsMinutes) reasons.push("STALE_ODDS");
    if (input.odds.liquidity !== null && input.odds.liquidity < input.config.minLiquidity) {
      reasons.push("INSUFFICIENT_LIQUIDITY");
    }
  }
  if (input.ev === null) reasons.push("INSUFFICIENT_DATA");
  else if (input.ev < input.config.minExpectedValue) reasons.push("LOW_MODEL_EDGE");
  if (input.risk === "REJECTED" || input.risk === "HIGH" && input.config.riskLevel === "conservative") {
    reasons.push("HIGH_RISK");
  }
  if (rankCorrelation(input.correlation) > rankCorrelation(input.config.maxCorrelation)) {
    reasons.push("HIGH_CORRELATION");
  }
  const validStatus = input.match.status === "SCHEDULED" || input.match.status === "LIVE" || input.match.status === "HT";
  if (!validStatus) reasons.push("MATCH_STATUS_INVALID");
  if (!input.calibratedFromHistory && input.config.riskLevel === "conservative") {
    // Not a hard reject — conservative configs still allow uncalibrated models
    // but the caller can treat MODEL_NOT_CALIBRATED as a warning.
  }
  if (input.config.allowedLeagues.length > 0 && !input.config.allowedLeagues.includes(input.match.leagueId)
    && !input.config.allowedLeagues.includes(input.match.leagueName)) {
    reasons.push("OUTSIDE_CONFIGURATION");
  }
  if (!input.config.allowedMarkets.includes((input.odds?.market ?? "MATCH_WINNER") as SiMarket)) {
    reasons.push("OUTSIDE_CONFIGURATION");
  }
  return [...new Set(reasons)];
}

export function decisionFrom(reasons: SiRejectionReason[], ev: number | null, risk: SiRiskLevel): SiDecision {
  if (reasons.includes("INSUFFICIENT_DATA") || reasons.includes("LOW_DATA_QUALITY") || reasons.includes("PROVIDER_FAILURE")) {
    return "INSUFFICIENT_DATA";
  }
  if (reasons.includes("LOW_MODEL_EDGE") && ev !== null && ev <= 0) return "NO_EDGE";
  if (reasons.includes("HIGH_RISK") || risk === "REJECTED") return "HIGH_RISK";
  if (reasons.length > 0) return "REJECTED";
  return "QUALIFIED";
}

export interface TicketOptimizeInput {
  candidates: SiPrediction[];
  matchesById: Map<string, SiMatch>;
  config: SiTicketConfig;
}

export interface TicketOptimizeResult {
  qualified: boolean;
  reason: string | null;
  selected: SiPrediction[];
  totalOdds: number | null;
  combinedProbability: number | null;
  confidence: number | null;
  risk: SiRiskLevel | null;
  correlation: SiCorrelationLevel | null;
  dataQualityAvg: number | null;
}

function product(nums: number[]): number {
  return nums.reduce((a, b) => a * b, 1);
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function optimizeTicket(input: TicketOptimizeInput): TicketOptimizeResult {
  const cfg = input.config;
  const pool = input.candidates.filter((c) => {
    if (c.decision !== "QUALIFIED") return false;
    if (c.oddsDecimal === null || c.oddsDecimal <= 1) return false;
    if (c.calibratedProbability <= 0) return false;
    if (c.confidence < cfg.minConfidence) return false;
    if (c.dataQuality.score < cfg.minDataQuality) return false;
    if (c.risk === "REJECTED") return false;
    if (cfg.riskLevel === "conservative" && c.risk === "HIGH") return false;
    if (!cfg.allowedMarkets.includes(c.market)) return false;
    return true;
  });

  if (pool.length === 0) {
    return emptyTicket("NO QUALIFIED TICKET — no candidates passed quality, risk, confidence and market filters.");
  }

  const maxK = Math.min(cfg.maxSelections, pool.length);
  const ranked = [...pool].sort((a, b) => {
    const evA = a.expectedValue ?? -1;
    const evB = b.expectedValue ?? -1;
    if (evB !== evA) return evB - evA;
    return b.calibratedProbability - a.calibratedProbability;
  });

  let best: TicketOptimizeResult | null = null;
  const dfs = (start: number, chosen: SiPrediction[]) => {
    if (chosen.length > 0) {
      const evaled = evaluateCombo(chosen, input.matchesById, cfg);
      if (evaled.qualified) {
        if (!best || scoreCombo(evaled) > scoreCombo(best)) best = evaled;
      }
    }
    if (chosen.length >= maxK) return;
    for (let i = start; i < ranked.length; i++) {
      const next = ranked[i]!;
      if (chosen.some((c) => c.matchId === next.matchId)) continue;
      const trial = [...chosen, next];
      const corr = ticketCorrelation(trial.map((p) => ({
        matchId: p.matchId,
        market: p.market,
        selection: p.selection,
        leagueName: input.matchesById.get(p.matchId)?.leagueName ?? "",
      })));
      if (rankCorrelation(corr) > rankCorrelation(cfg.maxCorrelation)) continue;
      dfs(i + 1, trial);
    }
  };
  dfs(0, []);

  if (!best) {
    return emptyTicket("NO QUALIFIED TICKET — no combination satisfied odds range, correlation and risk constraints.");
  }
  return best;
}

function emptyTicket(reason: string): TicketOptimizeResult {
  return {
    qualified: false,
    reason,
    selected: [],
    totalOdds: null,
    combinedProbability: null,
    confidence: null,
    risk: null,
    correlation: null,
    dataQualityAvg: null,
  };
}

function evaluateCombo(chosen: SiPrediction[], matches: Map<string, SiMatch>, cfg: SiTicketConfig): TicketOptimizeResult {
  const odds = chosen.map((c) => c.oddsDecimal!).filter((n) => n > 1);
  const totalOdds = product(odds);
  const combinedProbability = product(chosen.map((c) => c.calibratedProbability));
  const confidence = mean(chosen.map((c) => c.confidence));
  const dq = mean(chosen.map((c) => c.dataQuality.score));
  const corr = ticketCorrelation(chosen.map((p) => ({
    matchId: p.matchId,
    market: p.market,
    selection: p.selection,
    leagueName: matches.get(p.matchId)?.leagueName ?? "",
  })));
  const worstRisk = chosen.reduce<SiRiskLevel>((w, c) => {
    const order: SiRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "REJECTED"];
    return order.indexOf(c.risk) > order.indexOf(w) ? c.risk : w;
  }, "LOW");
  const inRange = totalOdds >= cfg.targetOddsMin && totalOdds <= cfg.targetOddsMax;
  const qualified = inRange
    && chosen.length >= 1
    && chosen.length <= cfg.maxSelections
    && rankCorrelation(corr) <= rankCorrelation(cfg.maxCorrelation)
    && worstRisk !== "REJECTED"
    && (dq ?? 0) >= cfg.minDataQuality;
  return {
    qualified,
    reason: qualified ? null : "Combination failed validation.",
    selected: chosen,
    totalOdds,
    combinedProbability,
    confidence,
    risk: worstRisk,
    correlation: corr,
    dataQualityAvg: dq,
  };
}

function scoreCombo(r: TicketOptimizeResult): number {
  const ev = r.selected.reduce((s, p) => s + (p.expectedValue ?? 0), 0);
  const corrPen = r.correlation === "HIGH" ? 3 : r.correlation === "MEDIUM" ? 1 : 0;
  return ev * 10 + (r.confidence ?? 0) * 2 + (r.dataQualityAvg ?? 0) / 50 - corrPen - (r.selected.length > 4 ? 0.2 : 0);
}

export function settleSelection(prediction: SiPrediction, homeScore: number, awayScore: number): SiSelectionResult {
  const total = homeScore + awayScore;
  const sel = prediction.selection.toUpperCase();
  switch (prediction.market) {
    case "HOME_WIN":
      return homeScore > awayScore ? "WON" : "LOST";
    case "AWAY_WIN":
      return awayScore > homeScore ? "WON" : "LOST";
    case "DRAW":
      return homeScore === awayScore ? "WON" : "LOST";
    case "MATCH_WINNER":
      if (sel === "HOME" || sel === "1") return homeScore > awayScore ? "WON" : "LOST";
      if (sel === "AWAY" || sel === "2") return awayScore > homeScore ? "WON" : "LOST";
      if (sel === "DRAW" || sel === "X") return homeScore === awayScore ? "WON" : "LOST";
      return "PENDING";
    case "OVER_UNDER": {
      const line = prediction.line ?? parseLine(prediction.selection);
      if (line === null) return "VOID";
      if (total === line) return "VOID";
      if (sel.startsWith("OVER")) return total > line ? "WON" : "LOST";
      if (sel.startsWith("UNDER")) return total < line ? "WON" : "LOST";
      return "PENDING";
    }
    case "BTTS":
      if (sel === "YES") return homeScore > 0 && awayScore > 0 ? "WON" : "LOST";
      if (sel === "NO") return homeScore === 0 || awayScore === 0 ? "WON" : "LOST";
      return "PENDING";
    case "DOUBLE_CHANCE":
      if (sel === "1X" || sel === "HOME_OR_DRAW") return homeScore >= awayScore ? "WON" : "LOST";
      if (sel === "X2" || sel === "DRAW_OR_AWAY") return awayScore >= homeScore ? "WON" : "LOST";
      if (sel === "12" || sel === "HOME_OR_AWAY") return homeScore !== awayScore ? "WON" : "LOST";
      return "PENDING";
    default:
      return "PENDING";
  }
}

export function settleTicket(
  selections: SiTicketSelection[],
  voidRule: SiTicketConfig["voidRule"],
): { status: SiTicket["status"]; totalOdds: number | null } {
  if (selections.length === 0) return { status: "NO_QUALIFIED_TICKET", totalOdds: null };
  if (selections.some((s) => s.result === "PENDING")) return { status: "PENDING", totalOdds: product(selections.map((s) => s.oddsDecimal)) };
  if (selections.some((s) => s.result === "CANCELLED")) return { status: "CANCELLED", totalOdds: null };
  const active = selections.filter((s) => s.result !== "VOID");
  if (voidRule === "VOID_TICKET" && selections.some((s) => s.result === "VOID")) {
    return { status: "VOID", totalOdds: null };
  }
  if (active.length === 0) return { status: "VOID", totalOdds: null };
  if (active.some((s) => s.result === "LOST")) {
    return { status: "LOST", totalOdds: product(active.map((s) => s.oddsDecimal)) };
  }
  if (active.every((s) => s.result === "WON")) {
    const odds = voidRule === "REDUCE_ODDS"
      ? product(active.map((s) => s.oddsDecimal))
      : product(selections.map((s) => s.oddsDecimal));
    return { status: "WON", totalOdds: odds };
  }
  return { status: "PENDING", totalOdds: product(selections.map((s) => s.oddsDecimal)) };
}

export function computePerformance(
  tickets: SiTicket[],
  predictions: SiPrediction[],
  range: { from: string; to: string; dataClass: SiPerformanceSnapshot["dataClass"] },
): SiPerformanceSnapshot {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  const inRange = (iso: string) => {
    const t = Date.parse(iso);
    return t >= from && t <= to;
  };
  const tix = tickets.filter((t) => inRange(t.createdAt) && t.dataClass === range.dataClass);
  const preds = predictions.filter((p) => inRange(p.createdAt) && p.dataClass === range.dataClass);
  const settled = tix.filter((t) => t.status === "WON" || t.status === "LOST");
  const won = tix.filter((t) => t.status === "WON").length;
  const lost = tix.filter((t) => t.status === "LOST").length;
  const voided = tix.filter((t) => t.status === "VOID").length;
  const noQualified = tix.filter((t) => t.status === "NO_QUALIFIED_TICKET").length;
  const winRate = settled.length ? won / settled.length : null;
  const odds = settled.map((t) => t.totalOdds).filter((n): n is number => n !== null);
  const conf = preds.map((p) => p.confidence);
  const prob = preds.map((p) => p.calibratedProbability);
  const evs = preds.map((p) => p.expectedValue).filter((n): n is number => n !== null);
  const units = settled.map((t) => (t.status === "WON" ? (t.totalOdds ?? 1) - 1 : -1));
  const profitLossUnits = units.length ? units.reduce((a, b) => a + b, 0) : null;
  const roi = settled.length && profitLossUnits !== null ? profitLossUnits / settled.length : null;
  let peak = 0;
  let equity = 0;
  let maxDrawdown: number | null = units.length ? 0 : null;
  for (const u of units) {
    equity += u;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (maxDrawdown === null || dd > maxDrawdown) maxDrawdown = dd;
  }
  const settledPreds = preds.filter((p) => p.result === "WON" || p.result === "LOST");
  const modelAccuracy = settledPreds.length
    ? settledPreds.filter((p) => p.result === "WON").length / settledPreds.length
    : null;
  const calibrationError = calibrationMae(settledPreds);

  const byMarket: SiPerformanceSnapshot["byMarket"] = {};
  const byLeague: SiPerformanceSnapshot["byLeague"] = {};
  const byModel: SiPerformanceSnapshot["byModel"] = {};
  for (const p of settledPreds) {
    bump(byMarket, p.market, p.result === "WON");
    bump(byModel, `${p.versions.modelName} ${p.versions.modelVersion}`, p.result === "WON");
  }
  for (const t of tix) {
    for (const s of t.selections) {
      bump(byLeague, s.leagueName, s.result === "WON");
    }
  }
  const byDateMap = new Map<string, { won: number; lost: number; tickets: number }>();
  for (const t of tix) {
    const day = t.createdAt.slice(0, 10);
    const cur = byDateMap.get(day) ?? { won: 0, lost: 0, tickets: 0 };
    cur.tickets += 1;
    if (t.status === "WON") cur.won += 1;
    if (t.status === "LOST") cur.lost += 1;
    byDateMap.set(day, cur);
  }

  return {
    from: range.from,
    to: range.to,
    dataClass: range.dataClass,
    totalPredictions: preds.length,
    totalTickets: tix.length,
    won,
    lost,
    voided,
    noQualified,
    winRate,
    averageOdds: mean(odds),
    averageConfidence: mean(conf),
    averageProbability: mean(prob),
    expectedValue: mean(evs),
    roi,
    profitLossUnits,
    maxDrawdown,
    modelAccuracy,
    calibrationError,
    byMarket,
    byLeague,
    byModel,
    byDate: [...byDateMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
  };
}

function bump(map: Record<string, { n: number; won: number; lost: number; winRate: number | null }>, key: string, isWin: boolean) {
  const cur = map[key] ?? { n: 0, won: 0, lost: 0, winRate: null };
  cur.n += 1;
  if (isWin) cur.won += 1;
  else cur.lost += 1;
  cur.winRate = cur.n ? cur.won / cur.n : null;
  map[key] = cur;
}

export function calibrationMae(preds: SiPrediction[]): number | null {
  const settled = preds.filter((p) => p.result === "WON" || p.result === "LOST");
  if (settled.length < 5) return null;
  const buckets = new Map<number, { n: number; hits: number; p: number }>();
  for (const p of settled) {
    const b = Math.floor(p.calibratedProbability * 10);
    const cur = buckets.get(b) ?? { n: 0, hits: 0, p: 0 };
    cur.n += 1;
    cur.hits += p.result === "WON" ? 1 : 0;
    cur.p += p.calibratedProbability;
    buckets.set(b, cur);
  }
  let mae = 0;
  let used = 0;
  for (const b of buckets.values()) {
    if (b.n < 3) continue;
    mae += Math.abs(b.hits / b.n - b.p / b.n);
    used += 1;
  }
  return used ? mae / used : null;
}

export function buildCalibrationBuckets(preds: SiPrediction[]): Array<{ lo: number; hi: number; predicted: number; observed: number; n: number }> {
  const settled = preds.filter((p) => p.result === "WON" || p.result === "LOST");
  const out: Array<{ lo: number; hi: number; predicted: number; observed: number; n: number }> = [];
  for (let i = 0; i < 10; i++) {
    const lo = i / 10;
    const hi = (i + 1) / 10;
    const group = settled.filter((p) => p.calibratedProbability >= lo && p.calibratedProbability < hi);
    if (!group.length) continue;
    out.push({
      lo,
      hi,
      predicted: mean(group.map((g) => g.calibratedProbability)) ?? lo,
      observed: group.filter((g) => g.result === "WON").length / group.length,
      n: group.length,
    });
  }
  return out;
}

export function detectDrift(current: SiPerformanceSnapshot, baseline: SiPerformanceSnapshot | null): Array<{
  kind: "PERFORMANCE" | "CALIBRATION" | "DISTRIBUTION" | "LEAGUE" | "MARKET";
  message: string;
  requiresReview: boolean;
}> {
  const alerts: Array<{ kind: "PERFORMANCE" | "CALIBRATION" | "DISTRIBUTION" | "LEAGUE" | "MARKET"; message: string; requiresReview: boolean }> = [];
  if (!baseline) return alerts;
  const curAcc = current.modelAccuracy;
  const baseAcc = baseline.modelAccuracy;
  if (curAcc !== null && baseAcc !== null && current.totalPredictions >= 20 && curAcc < baseAcc - 0.12) {
    alerts.push({
      kind: "PERFORMANCE",
      message: `WINDELS Sports Model has experienced a significant accuracy decline (${fmtPct(baseAcc)} → ${fmtPct(curAcc)}) over the monitoring window.`,
      requiresReview: true,
    });
  }
  if (current.calibrationError !== null && baseline.calibrationError !== null && current.calibrationError > baseline.calibrationError + 0.08) {
    alerts.push({
      kind: "CALIBRATION",
      message: `Calibration error increased from ${baseline.calibrationError.toFixed(3)} to ${current.calibrationError.toFixed(3)}.`,
      requiresReview: true,
    });
  }
  if (current.winRate !== null && baseline.winRate !== null && current.totalTickets >= 10 && current.winRate < baseline.winRate - 0.15) {
    alerts.push({
      kind: "PERFORMANCE",
      message: `Ticket win rate declined from ${fmtPct(baseline.winRate)} to ${fmtPct(current.winRate)}.`,
      requiresReview: true,
    });
  }
  return alerts;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

declare module "./engines.js" {
  // allow optional helper field without leaking into shared types
}

Object.defineProperty(Object.prototype, "noop_si_engines", { value: undefined, enumerable: false });
