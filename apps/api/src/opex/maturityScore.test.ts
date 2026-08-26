/**
 * Operational maturity score — composite over measured opex signals.
 *
 * `continuous.maturityScore` was a structural zero. computeMaturityScore is a
 * pure weighted average over the signals that have real data; absent signals are
 * dropped from the denominator, and when nothing is measured it returns
 * { score: 0, measured: false }. No Redis/Prisma — runs anywhere.
 */
import { describe, it, expect } from "vitest";
import { computeMaturityScore, type MaturityInputs } from "./maturityScore.js";

const NONE: MaturityInputs = {
  reliabilityPct: 0, reliabilityPresent: false,
  safetyPassRatePct: 0, safetyPresent: false,
  humanApprovalPct: 0, humanApprovalPresent: false,
  governanceGatesCount: 0,
  regulationsTracked: 0,
  playbookAvgCompliancePct: 0, playbooksTotal: 0,
  explanationAvgConfidencePct: 0, explanationsAvailable: 0,
  safetyBenchmarkPassPct: 0, safetyBenchmarkCategories: 0,
};

describe("computeMaturityScore", () => {
  it("returns a structural 0 (measured=false) when nothing is measured", () => {
    expect(computeMaturityScore(NONE)).toEqual({ score: 0, measured: false, componentsUsed: 0 });
  });

  it("averages only the present signals (absent ones dropped from the denominator)", () => {
    // Only reliability present at 90 -> score is exactly 90, one component.
    const r = computeMaturityScore({ ...NONE, reliabilityPct: 90, reliabilityPresent: true });
    expect(r).toEqual({ score: 90, measured: true, componentsUsed: 1 });
  });

  it("weights reliability/safety/benchmarks higher than coverage signals", () => {
    // reliability(90,w3) + governance coverage(100,w1)
    // weighted = (90*3 + 100*1) / (3+1) = 370/4 = 92.5 -> 93
    const r = computeMaturityScore({ ...NONE, reliabilityPct: 90, reliabilityPresent: true, governanceGatesCount: 2 });
    expect(r.measured).toBe(true);
    expect(r.componentsUsed).toBe(2);
    expect(r.score).toBe(93);
  });

  it("treats coverage signals as binary readiness (present => 100)", () => {
    // Only a tracked regulation present -> full readiness for that one signal.
    const r = computeMaturityScore({ ...NONE, regulationsTracked: 5 });
    expect(r).toEqual({ score: 100, measured: true, componentsUsed: 1 });
  });

  it("clamps out-of-range component values into 0..100", () => {
    const r = computeMaturityScore({ ...NONE, reliabilityPct: 150, reliabilityPresent: true });
    expect(r.score).toBe(100);
  });

  it("produces a full composite across every signal", () => {
    const r = computeMaturityScore({
      reliabilityPct: 100, reliabilityPresent: true,
      safetyPassRatePct: 100, safetyPresent: true,
      humanApprovalPct: 100, humanApprovalPresent: true,
      governanceGatesCount: 1,
      regulationsTracked: 1,
      playbookAvgCompliancePct: 100, playbooksTotal: 1,
      explanationAvgConfidencePct: 100, explanationsAvailable: 1,
      safetyBenchmarkPassPct: 100, safetyBenchmarkCategories: 1,
    });
    expect(r.score).toBe(100);
    expect(r.componentsUsed).toBe(8);
  });
});
