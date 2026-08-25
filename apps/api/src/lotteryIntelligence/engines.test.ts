import { describe, it, expect } from "vitest";
import {
  combinations,
  consecutiveGroups,
  distribution,
  diversityAmong,
  generateLines,
  matchLine,
  numberStats,
  pickWindow,
  prizeTier,
  profileCombination,
  systemLineCount,
  validateDrawPayload,
  validateLine,
} from "./engines.js";
import { EUROMILLIONS_RULES } from "@windels/shared/lotteryIntelligence";
import type { LiDraw } from "@windels/shared/lotteryIntelligence";

const rules = EUROMILLIONS_RULES;

const draw = (over: Partial<LiDraw> = {}): LiDraw => ({
  id: over.id ?? "d1",
  organizationId: "org-a",
  lotteryId: "euromillions",
  providerId: "sandbox",
  providerDrawId: over.providerDrawId ?? "sbx-1",
  drawDate: over.drawDate ?? "2026-03-01T20:00:00.000Z",
  mainNumbers: over.mainNumbers ?? [1, 2, 3, 4, 5],
  bonusNumbers: over.bonusNumbers ?? [1, 2],
  jackpotMinor: null,
  currency: null,
  rollover: null,
  winners: null,
  prizeTable: null,
  source: "sandbox",
  sourceTimestamp: "2026-03-01T21:00:00.000Z",
  retrievedAt: "2026-03-01T21:00:00.000Z",
  verified: true,
  verifiedAt: "2026-03-01T21:00:00.000Z",
  validationStatus: "VALID",
  validationErrors: [],
  dataClass: "SANDBOX",
  stale: false,
  createdAt: "2026-03-01T21:00:00.000Z",
  updatedAt: "2026-03-01T21:00:00.000Z",
  ...over,
});

describe("EuroMillions rule engine", () => {
  it("validates 5 from 1–50 and 2 from 1–12", () => {
    expect(validateLine([7, 18, 24, 36, 49], [3, 11], rules)).toEqual([]);
    expect(validateLine([7, 18, 24, 36], [3, 11], rules).join(" ")).toMatch(/Expected 5/);
    expect(validateLine([7, 18, 24, 36, 51], [3, 11], rules).join(" ")).toMatch(/outside/);
    expect(validateLine([7, 18, 24, 36, 7], [3, 11], rules).join(" ")).toMatch(/Duplicate main/);
    expect(validateLine([7, 18, 24, 36, 49], [3, 13], rules).join(" ")).toMatch(/Lucky Stars/);
    expect(validateLine([7, 18, 24, 36, 49], [3, 3], rules).join(" ")).toMatch(/Duplicate/);
  });

  it("rejects official-looking payloads that fail validation", () => {
    const err = validateDrawPayload({ providerDrawId: "", drawDate: "nope", mainNumbers: [1], bonusNumbers: [] }, rules);
    expect(err.some((e) => /draw ID/i.test(e))).toBe(true);
    expect(err.some((e) => /date/i.test(e))).toBe(true);
  });
});

describe("System builder mathematics", () => {
  it("computes C(n,k) exactly — never hard-coded", () => {
    expect(combinations(50, 5)).toBe(2_118_760);
    expect(combinations(12, 2)).toBe(66);
    expect(combinations(5, 5)).toBe(1);
    expect(combinations(4, 5)).toBe(0);
  });

  it("multiplies main and star combinations", () => {
    const r = systemLineCount([1, 2, 3, 4, 5, 6, 7], [1, 2, 3], rules);
    expect(r.mainCombinations).toBe(combinations(7, 5));
    expect(r.bonusCombinations).toBe(combinations(3, 2));
    expect(r.totalLines).toBe(21 * 3);
  });
});

describe("Number intelligence & distribution", () => {
  it("counts appearances and gaps from stored draws only", () => {
    const draws = [
      draw({ id: "a", drawDate: "2026-01-01T00:00:00.000Z", mainNumbers: [1, 2, 3, 4, 5] }),
      draw({ id: "b", drawDate: "2026-01-02T00:00:00.000Z", mainNumbers: [1, 6, 7, 8, 9] }),
      draw({ id: "c", drawDate: "2026-01-03T00:00:00.000Z", mainNumbers: [10, 11, 12, 13, 14] }),
    ];
    const stats = numberStats(draws, "MAIN", 1, 14, 2);
    const one = stats.find((s) => s.number === 1)!;
    expect(one.appearances).toBe(2);
    expect(one.drawsSince).toBe(1);
    const ten = stats.find((s) => s.number === 10)!;
    expect(ten.appearances).toBe(1);
    expect(ten.drawsSince).toBe(0);
  });

  it("does not invent draws outside the requested window", () => {
    const draws = [
      draw({ id: "a", drawDate: "2026-01-01T00:00:00.000Z" }),
      draw({ id: "b", drawDate: "2026-06-01T00:00:00.000Z" }),
    ];
    expect(pickWindow(draws, 1)).toHaveLength(1);
    expect(pickWindow(draws, undefined, "2026-05-01T00:00:00.000Z")).toHaveLength(1);
  });

  it("computes odd/even, sum, spread and consecutives", () => {
    const d = distribution([
      draw({ mainNumbers: [1, 2, 3, 10, 20] }),
      draw({ mainNumbers: [2, 4, 6, 8, 10] }),
    ], rules);
    expect(d.windowDraws).toBe(2);
    expect(d.consecutiveDraws).toBe(1);
    expect(d.sum.min).toBe(30);
    expect(consecutiveGroups([21, 22, 30])).toEqual([[21, 22]]);
  });
});

describe("Combination analysis & generator honesty", () => {
  it("labels the score as statistical fit, not win chance", () => {
    const p = profileCombination([7, 18, 24, 36, 49], [3, 11], rules, [], null);
    expect(p.statisticalFitScore).toBeGreaterThanOrEqual(0);
    expect(p.assessment).toBe("INSUFFICIENT_DATA");
    expect(p.sum).toBe(134);
    expect(p.odd + p.even).toBe(5);
  });

  it("generates valid unique EuroMillions lines and respects locks/excludes", () => {
    const lines = generateLines({
      rules, mode: "RANDOM", count: 5,
      lockedMain: [7, 24], excludedMain: [1, 2, 3],
      lockedBonus: [3], excludedBonus: [1],
      stats: [], dist: null, inputDataVersion: "empty",
    });
    expect(lines.length).toBe(5);
    for (const l of lines) {
      expect(validateLine(l.mainNumbers, l.bonusNumbers, rules)).toEqual([]);
      expect(l.mainNumbers).toContain(7);
      expect(l.mainNumbers).toContain(24);
      expect(l.mainNumbers.some((n) => [1, 2, 3].includes(n))).toBe(false);
      expect(l.bonusNumbers).toContain(3);
      expect(l.why.some((w) => /not a claim|not a win|same mathematical/i.test(w) || /statistical-fit/i.test(w))).toBe(true);
    }
    const keys = new Set(lines.map((l) => l.mainNumbers.join("-") + "|" + l.bonusNumbers.join("-")));
    expect(keys.size).toBe(5);
  });

  it("diversified lines reduce overlap versus dumping clones", () => {
    const lines = generateLines({
      rules, mode: "DIVERSIFIED", count: 8,
      lockedMain: [], excludedMain: [], lockedBonus: [], excludedBonus: [],
      stats: [], dist: null, inputDataVersion: "empty",
    });
    const score = diversityAmong(lines.map((l) => ({ mainNumbers: l.mainNumbers, bonusNumbers: l.bonusNumbers })));
    expect(score).toBeGreaterThan(40);
  });
});

describe("Result matching", () => {
  it("maps prize tiers from official 5+2 rules", () => {
    expect(prizeTier(5, 2)).toBe("5+2");
    expect(prizeTier(2, 0)).toBe("2+0");
    expect(prizeTier(1, 0)).toBe("NONE");
    const hit = matchLine([7, 18, 24, 36, 49], [3, 11], draw({ mainNumbers: [7, 18, 1, 2, 3], bonusNumbers: [3, 4] }));
    expect(hit.main).toBe(2);
    expect(hit.bonus).toBe(1);
    expect(hit.tier).toBe("2+1");
  });
});
