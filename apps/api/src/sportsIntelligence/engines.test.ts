import { describe, it, expect } from "vitest";
import {
  assessDataQuality,
  assessRisk,
  calibrateProbability,
  computePerformance,
  expectedValue,
  impliedProbability,
  marketProbabilityFromMatrix,
  optimizeTicket,
  pairCorrelation,
  poissonPmf,
  qualityBand,
  rejectCandidate,
  scoreMatrix,
  settleSelection,
  settleTicket,
  ticketCorrelation,
} from "./engines.js";
import type { SiMatch, SiOdds, SiPrediction, SiTicket, SiTicketConfig } from "@windels/shared/sportsIntelligence";
import { SI_DEFAULT_TICKET_CONFIG } from "@windels/shared/sportsIntelligence";

const cfg: SiTicketConfig = {
  ...SI_DEFAULT_TICKET_CONFIG,
  updatedAt: "2026-08-25T00:00:00.000Z",
  updatedBy: "test",
};

const match = (over: Partial<SiMatch> = {}): SiMatch => ({
  id: "m1",
  organizationId: "org-a",
  providerId: "sandbox",
  providerMatchId: "fx-1",
  leagueId: "lg-1",
  leagueName: "Sandbox Premier",
  homeTeamId: "t1",
  homeTeamName: "Alpha",
  awayTeamId: "t2",
  awayTeamName: "Beta",
  kickoffAt: "2026-08-26T18:00:00.000Z",
  status: "SCHEDULED",
  venue: "Arena",
  homeForm: { played: 10, won: 6, drawn: 2, lost: 2, goalsFor: 18, goalsAgainst: 9, source: "t", observedAt: "2026-08-25T00:00:00.000Z" },
  awayForm: { played: 10, won: 4, drawn: 3, lost: 3, goalsFor: 13, goalsAgainst: 12, source: "t", observedAt: "2026-08-25T00:00:00.000Z" },
  homeXg: 1.7,
  awayXg: 1.1,
  homeLeaguePos: 2,
  awayLeaguePos: 8,
  restDaysHome: 6,
  restDaysAway: 4,
  injuries: [],
  lineupsAvailable: false,
  lineups: [],
  homeScore: null,
  awayScore: null,
  dataClass: "SANDBOX",
  lastSyncedAt: "2026-08-25T12:00:00.000Z",
  createdAt: "2026-08-25T12:00:00.000Z",
  updatedAt: "2026-08-25T12:00:00.000Z",
  ...over,
});

const odds = (over: Partial<SiOdds> = {}): SiOdds => ({
  id: "o1",
  organizationId: "org-a",
  matchId: "m1",
  providerId: "sandbox",
  market: "HOME_WIN",
  selection: "HOME",
  line: null,
  oddsDecimal: 1.70,
  openingOdds: 1.80,
  impliedProbability: 1 / 1.7,
  liquidity: 5000,
  suspended: false,
  observedAt: "2026-08-25T12:00:00.000Z",
  dataClass: "SANDBOX",
  createdAt: "2026-08-25T12:00:00.000Z",
  ...over,
});

const pred = (over: Partial<SiPrediction> = {}): SiPrediction => ({
  id: over.id ?? "p1",
  organizationId: "org-a",
  matchId: over.matchId ?? "m1",
  market: "HOME_WIN",
  selection: "HOME",
  line: null,
  oddsId: "o1",
  oddsDecimal: 1.70,
  oddsObservedAt: "2026-08-25T12:00:00.000Z",
  modelProbability: 0.82,
  calibratedProbability: 0.80,
  marketImpliedProbability: 0.588,
  expectedValue: 0.80 * 1.70 - 1,
  confidence: 0.88,
  risk: "LOW",
  riskScore: 10,
  correlationHint: "LOW",
  dataQuality: {
    score: 92, band: "EXCELLENT", freshnessScore: 90, providerReliabilityScore: 90,
    missingFields: [], checks: {}, assessedAt: "2026-08-25T12:00:00.000Z",
  },
  features: {
    version: "features-v1.0", recentPerformanceHome: 0.7, recentPerformanceAway: 0.5,
    homeStrength: 0.6, awayStrength: 0.4, scoringTrendHome: 1.8, scoringTrendAway: 1.3,
    defensiveTrendHome: 0.9, defensiveTrendAway: 1.2, goalAvgHome: 1.8, goalAvgAway: 1.3,
    xgTrendHome: 1.7, xgTrendAway: 1.1, restAdvantage: 2, leagueStrength: null, marketMovement: -0.05,
    computedAt: "2026-08-25T12:00:00.000Z",
  },
  versions: {
    modelName: "WINDELS Sports Model", modelVersion: "1.0", featureVersion: "features-v1.0",
    configVersion: "ticket-cfg-v1.0", inputDataVersion: "abc",
  },
  decision: "QUALIFIED",
  rejectionReasons: [],
  decisionFactors: ["test"],
  result: "PENDING",
  dataClass: "SANDBOX",
  createdAt: "2026-08-25T12:00:00.000Z",
  ...over,
});

describe("Sports engines — probability math", () => {
  it("poisson PMF sums close to 1", () => {
    let s = 0;
    for (let k = 0; k <= 12; k++) s += poissonPmf(k, 1.4);
    expect(s).toBeGreaterThan(0.99);
    expect(s).toBeLessThan(1.01);
  });

  it("score matrix home-win + draw + away-win ≈ 1", () => {
    const m = scoreMatrix(1.6, 1.1);
    const home = marketProbabilityFromMatrix(m, "HOME_WIN", "HOME", null)!;
    const draw = marketProbabilityFromMatrix(m, "DRAW", "DRAW", null)!;
    const away = marketProbabilityFromMatrix(m, "AWAY_WIN", "AWAY", null)!;
    expect(home + draw + away).toBeGreaterThan(0.98);
    expect(home).toBeGreaterThan(away);
  });

  it("over 1.5 is high when lambdas are large", () => {
    const m = scoreMatrix(1.8, 1.5);
    const over = marketProbabilityFromMatrix(m, "OVER_UNDER", "OVER 1.5", 1.5)!;
    expect(over).toBeGreaterThan(0.7);
  });

  it("implied probability and EV are exact", () => {
    expect(impliedProbability(2)).toBeCloseTo(0.5);
    expect(expectedValue(0.6, 2)).toBeCloseTo(0.2);
    expect(impliedProbability(1)).toBeNull();
    expect(expectedValue(0.5, 1)).toBeNull();
  });
});

describe("Sports engines — data quality", () => {
  it("excellent when most fields are present and odds are fresh", () => {
    const q = assessDataQuality({
      match: match(),
      odds: odds(),
      providerReliability: 90,
      now: new Date("2026-08-25T12:10:00.000Z"),
      staleOddsMinutes: 30,
    });
    expect(q.score).toBeGreaterThanOrEqual(75);
    expect(["EXCELLENT", "GOOD"]).toContain(q.band);
  });

  it("rejects when teams/odds/kickoff are missing", () => {
    const q = assessDataQuality({
      match: match({ homeTeamName: "", awayTeamName: "", kickoffAt: "", lastSyncedAt: "2000-01-01T00:00:00.000Z" }),
      odds: null,
      providerReliability: null,
      now: new Date("2026-08-25T12:00:00.000Z"),
      staleOddsMinutes: 30,
    });
    expect(q.band).toBe("REJECT");
    expect(q.missingFields).toContain("odds");
  });

  it("qualityBand thresholds match the spec", () => {
    expect(qualityBand(95)).toBe("EXCELLENT");
    expect(qualityBand(80)).toBe("GOOD");
    expect(qualityBand(65)).toBe("LIMITED");
    expect(qualityBand(40)).toBe("REJECT");
  });
});

describe("Sports engines — calibration, risk, correlation", () => {
  it("identity-calibrates without history", () => {
    const r = calibrateProbability(0.73, []);
    expect(r.calibratedFromHistory).toBe(false);
    expect(r.calibrated).toBeCloseTo(0.73);
  });

  it("mixes historical bucket hit-rate when n >= 8", () => {
    const r = calibrateProbability(0.72, [{ lo: 0.7, hi: 0.8, predicted: 0.75, observed: 0.60, n: 20 }]);
    expect(r.calibratedFromHistory).toBe(true);
    expect(r.calibrated).toBeLessThan(0.72);
    expect(r.calibrated).toBeGreaterThan(0.60);
  });

  it("rejects high-risk conservative candidates", () => {
    const q = assessDataQuality({
      match: match({ status: "CANCELLED" }),
      odds: odds({ oddsDecimal: 8 }),
      providerReliability: 40,
      now: new Date("2026-08-25T12:00:00.000Z"),
      staleOddsMinutes: 30,
    });
    const risk = assessRisk({
      calibrated: 0.4, confidence: 0.4, ev: -0.2, odds: 8, quality: q,
      matchStatus: "CANCELLED", correlation: "HIGH", selectionCount: 6, config: cfg,
    });
    expect(risk.level).toBe("REJECTED");
  });

  it("same-match selections are HIGH correlation", () => {
    expect(pairCorrelation(
      { matchId: "m1", market: "HOME_WIN", selection: "HOME", leagueName: "L" },
      { matchId: "m1", market: "OVER_UNDER", selection: "OVER 1.5", leagueName: "L" },
    )).toBe("HIGH");
    expect(ticketCorrelation([
      { matchId: "m1", market: "HOME_WIN", selection: "HOME", leagueName: "L" },
      { matchId: "m2", market: "AWAY_WIN", selection: "AWAY", leagueName: "M" },
    ])).toBe("LOW");
  });
});

describe("Sports engines — reject + ticket optimization", () => {
  it("rejects stale odds and suspended markets", () => {
    const q = assessDataQuality({
      match: match(),
      odds: odds({ observedAt: "2026-08-20T00:00:00.000Z", suspended: true }),
      providerReliability: 90,
      now: new Date("2026-08-25T12:00:00.000Z"),
      staleOddsMinutes: 30,
    });
    const reasons = rejectCandidate({
      quality: q,
      odds: odds({ observedAt: "2026-08-20T00:00:00.000Z", suspended: true }),
      ev: 0.1,
      risk: "LOW",
      correlation: "LOW",
      match: match(),
      calibratedFromHistory: true,
      config: cfg,
      moduleEnabled: true,
      ticketEngineEnabled: true,
      now: new Date("2026-08-25T12:00:00.000Z"),
    });
    expect(reasons).toContain("STALE_ODDS");
    expect(reasons).toContain("MARKET_SUSPENDED");
  });

  it("returns NO QUALIFIED TICKET when the pool is empty", () => {
    const r = optimizeTicket({ candidates: [], matchesById: new Map(), config: cfg });
    expect(r.qualified).toBe(false);
    expect(r.reason).toMatch(/NO QUALIFIED TICKET/);
  });

  it("does not combine two selections from the same match", () => {
    const a = pred({ id: "p1", matchId: "m1", oddsDecimal: 1.8, calibratedProbability: 0.75, expectedValue: 0.35 });
    const b = pred({ id: "p2", matchId: "m1", market: "OVER_UNDER", selection: "OVER 1.5", oddsDecimal: 1.3, calibratedProbability: 0.85, expectedValue: 0.10 });
    const c = pred({ id: "p3", matchId: "m2", oddsDecimal: 3.2, calibratedProbability: 0.78, expectedValue: 0.50 });
    const r = optimizeTicket({
      candidates: [a, b, c],
      matchesById: new Map([
        ["m1", match({ id: "m1" })],
        ["m2", match({ id: "m2", homeTeamName: "Gamma", awayTeamName: "Delta" })],
      ]),
      config: { ...cfg, targetOddsMin: 1.5, targetOddsMax: 20, maxSelections: 3, maxCorrelation: "LOW" },
    });
    expect(r.qualified).toBe(true);
    const matchIds = r.selected.map((s) => s.matchId);
    expect(new Set(matchIds).size).toBe(matchIds.length);
  });

  it("does not force a ticket just to reach target odds", () => {
    const weak = pred({
      id: "pw",
      oddsDecimal: 1.05,
      calibratedProbability: 0.51,
      expectedValue: -0.46,
      confidence: 0.4,
      decision: "REJECTED",
    });
    const r = optimizeTicket({
      candidates: [weak],
      matchesById: new Map([["m1", match()]]),
      config: { ...cfg, targetOddsMin: 5, targetOddsMax: 8 },
    });
    expect(r.qualified).toBe(false);
  });
});

describe("Sports engines — settlement + performance honesty", () => {
  it("settles over/under including push as VOID", () => {
    const p = pred({ market: "OVER_UNDER", selection: "OVER 2.5", line: 2.5 });
    expect(settleSelection(p, 2, 1)).toBe("WON");
    expect(settleSelection(p, 1, 1)).toBe("LOST");
    const whole = pred({ market: "OVER_UNDER", selection: "OVER 2", line: 2 });
    expect(settleSelection(whole, 1, 1)).toBe("VOID");
  });

  it("ticket is LOST if any selection loses", () => {
    const sels = [
      { result: "WON" as const, oddsDecimal: 1.5 },
      { result: "WON" as const, oddsDecimal: 1.6 },
      { result: "LOST" as const, oddsDecimal: 1.8 },
    ].map((s, i) => ({
      predictionId: `p${i}`, matchId: `m${i}`, leagueName: "L", matchLabel: "A vs B",
      market: "HOME_WIN" as const, selection: "HOME", line: null, oddsObservedAt: "",
      modelProbability: 0.7, calibratedProbability: 0.7, expectedValue: 0.1,
      confidence: 0.8, risk: "LOW" as const, status: "PENDING" as const, ...s,
    }));
    expect(settleTicket(sels, "REDUCE_ODDS").status).toBe("LOST");
  });

  it("ticket is WON only when every active selection wins", () => {
    const sels = [
      { result: "WON" as const, oddsDecimal: 1.5 },
      { result: "VOID" as const, oddsDecimal: 1.8 },
      { result: "WON" as const, oddsDecimal: 2.0 },
    ].map((s, i) => ({
      predictionId: `p${i}`, matchId: `m${i}`, leagueName: "L", matchLabel: "A vs B",
      market: "HOME_WIN" as const, selection: "HOME", line: null, oddsObservedAt: "",
      modelProbability: 0.7, calibratedProbability: 0.7, expectedValue: 0.1,
      confidence: 0.8, risk: "LOW" as const, status: "PENDING" as const, ...s,
    }));
    const r = settleTicket(sels, "REDUCE_ODDS");
    expect(r.status).toBe("WON");
    expect(r.totalOdds).toBeCloseTo(3.0);
  });

  it("performance is computed only from stored results (zeros when empty)", () => {
    const snap = computePerformance([], [], {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T00:00:00.000Z",
      dataClass: "SANDBOX",
    });
    expect(snap.totalTickets).toBe(0);
    expect(snap.winRate).toBeNull();
    expect(snap.roi).toBeNull();
    expect(snap.modelAccuracy).toBeNull();
  });

  it("does not mix data classes", () => {
    const t: SiTicket = {
      id: "t1", organizationId: "org-a", ticketCode: "WSI-1", createdAt: "2026-08-20T00:00:00.000Z",
      settledAt: "2026-08-21T00:00:00.000Z", versions: pred().versions, configSnapshot: cfg,
      totalOdds: 5, selectionCount: 2, combinedProbability: 0.4, confidence: 0.8, risk: "LOW",
      correlation: "LOW", dataQualityAvg: 90, status: "WON", approvalStatus: "APPROVED",
      approvedBy: "u", approvedAt: "2026-08-20T01:00:00.000Z", approvalReason: "ok",
      settlementStatus: "SETTLED", noQualifiedReason: null, selections: [], dataClass: "LIVE",
    };
    const snap = computePerformance([t], [], {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T00:00:00.000Z",
      dataClass: "SANDBOX",
    });
    expect(snap.totalTickets).toBe(0);
    expect(snap.won).toBe(0);
  });
});
