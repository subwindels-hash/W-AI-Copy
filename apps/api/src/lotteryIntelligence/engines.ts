/**
 * Lottery Intelligence engines — combinations, frequency, gaps, profiles,
 * diversification and prize matching.
 *
 * Every valid combination has the same mathematical chance of being drawn.
 * Scores measure statistical fit / diversity against a chosen window.
 */

import { randomInt } from "node:crypto";
import type {
  LiCombinationProfile,
  LiDistributionSnapshot,
  LiDraw,
  LiGeneratedLine,
  LiGenerationMode,
  LiLotteryRules,
  LiNumberStat,
  LiPairStat,
  LiPrizeTier,
} from "@windels/shared/lotteryIntelligence";
import { EUROMILLIONS_PRIZE_TIERS, LI_CURRENT_MODEL } from "@windels/shared/lotteryIntelligence";

export function combinations(n: number, k: number): number {
  if (k < 0 || n < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let acc = 1;
  for (let i = 1; i <= kk; i++) {
    acc = (acc * (n - kk + i)) / i;
  }
  return Math.round(acc);
}

export function sortUnique(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}

export function validateLine(
  main: number[],
  bonus: number[],
  rules: LiLotteryRules,
): string[] {
  const errors: string[] = [];
  const m = sortUnique(main);
  const b = sortUnique(bonus);
  if (main.length !== rules.mainCount) errors.push(`Expected ${rules.mainCount} main numbers`);
  if (m.length !== main.length) errors.push("Duplicate main numbers");
  if (bonus.length !== rules.bonusCount) errors.push(`Expected ${rules.bonusCount} ${rules.bonusLabel}`);
  if (b.length !== bonus.length) errors.push(`Duplicate ${rules.bonusLabel}`);
  for (const n of m) {
    if (n < rules.mainMin || n > rules.mainMax) errors.push(`Main number ${n} outside ${rules.mainMin}–${rules.mainMax}`);
  }
  for (const n of b) {
    if (n < rules.bonusMin || n > rules.bonusMax) errors.push(`${rules.bonusLabel} ${n} outside ${rules.bonusMin}–${rules.bonusMax}`);
  }
  return errors;
}

export function validateDrawPayload(input: {
  providerDrawId?: string;
  drawDate?: string;
  mainNumbers?: number[];
  bonusNumbers?: number[];
}, rules: LiLotteryRules): string[] {
  const errors: string[] = [];
  if (!input.providerDrawId || !String(input.providerDrawId).trim()) errors.push("Missing draw ID");
  if (!input.drawDate || Number.isNaN(Date.parse(input.drawDate))) errors.push("Invalid draw date");
  errors.push(...validateLine(input.mainNumbers ?? [], input.bonusNumbers ?? [], rules));
  return errors;
}

export function enumerateCombinations(pool: number[], k: number): number[][] {
  const src = sortUnique(pool);
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < src.length; i++) {
      acc.push(src[i]!);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

export function systemLineCount(mainPool: number[], bonusPool: number[], rules: LiLotteryRules): {
  mainCombinations: number;
  bonusCombinations: number;
  totalLines: number;
} {
  const mainCombinations = combinations(sortUnique(mainPool).length, rules.mainCount);
  const bonusCombinations = combinations(sortUnique(bonusPool).length, rules.bonusCount);
  return { mainCombinations, bonusCombinations, totalLines: mainCombinations * bonusCombinations };
}

export function expandSystem(
  mainPool: number[],
  bonusPool: number[],
  rules: LiLotteryRules,
  limit: number,
): { lines: Array<{ mainNumbers: number[]; bonusNumbers: number[] }>; truncated: boolean } {
  const mains = enumerateCombinations(mainPool, rules.mainCount);
  const bonuses = enumerateCombinations(bonusPool, rules.bonusCount);
  const lines: Array<{ mainNumbers: number[]; bonusNumbers: number[] }> = [];
  let truncated = false;
  outer: for (const m of mains) {
    for (const b of bonuses) {
      if (lines.length >= limit) {
        truncated = true;
        break outer;
      }
      lines.push({ mainNumbers: m, bonusNumbers: b });
    }
  }
  return { lines, truncated };
}

export function pickWindow(draws: LiDraw[], lastN?: number, from?: string, to?: string): LiDraw[] {
  let rows = draws.filter((d) => d.validationStatus === "VALID");
  if (from) {
    const t = Date.parse(from);
    rows = rows.filter((d) => Date.parse(d.drawDate) >= t);
  }
  if (to) {
    const t = Date.parse(to);
    rows = rows.filter((d) => Date.parse(d.drawDate) <= t);
  }
  rows = [...rows].sort((a, b) => a.drawDate.localeCompare(b.drawDate));
  if (lastN && lastN > 0) rows = rows.slice(-lastN);
  return rows;
}

export function numberStats(
  draws: LiDraw[],
  kind: "MAIN" | "BONUS",
  min: number,
  max: number,
  recentN: number,
): LiNumberStat[] {
  const ordered = [...draws].sort((a, b) => a.drawDate.localeCompare(b.drawDate));
  const recent = ordered.slice(-recentN);
  const out: LiNumberStat[] = [];
  for (let n = min; n <= max; n++) {
    const idxs: number[] = [];
    ordered.forEach((d, i) => {
      const bag = kind === "MAIN" ? d.mainNumbers : d.bonusNumbers;
      if (bag.includes(n)) idxs.push(i);
    });
    const gaps: number[] = [];
    for (let i = 1; i < idxs.length; i++) gaps.push(idxs[i]! - idxs[i - 1]!);
    const lastIdx = idxs.length ? idxs[idxs.length - 1]! : null;
    const recentAppearances = recent.filter((d) => (kind === "MAIN" ? d.mainNumbers : d.bonusNumbers).includes(n)).length;
    const histPct = ordered.length ? idxs.length / ordered.length : 0;
    const recPct = recent.length ? recentAppearances / recent.length : 0;
    let trend: LiNumberStat["frequencyTrend"] = "UNKNOWN";
    if (ordered.length >= 10 && recent.length >= 5) {
      if (recPct > histPct + 0.04) trend = "UP";
      else if (recPct < histPct - 0.04) trend = "DOWN";
      else trend = "FLAT";
    }
    out.push({
      number: n,
      kind,
      appearances: idxs.length,
      appearancePct: histPct,
      lastAppearance: lastIdx === null ? null : ordered[lastIdx]!.drawDate,
      drawsSince: lastIdx === null ? (ordered.length || null) : ordered.length - 1 - lastIdx,
      averageGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
      minGap: gaps.length ? Math.min(...gaps) : null,
      maxGap: gaps.length ? Math.max(...gaps) : null,
      recentAppearances,
      recentPct: recPct,
      frequencyTrend: trend,
    });
  }
  return out;
}

export function pairStats(draws: LiDraw[], kind: "MAIN" | "BONUS", recentN: number): LiPairStat[] {
  const ordered = [...draws].sort((a, b) => a.drawDate.localeCompare(b.drawDate));
  const recent = ordered.slice(-recentN);
  const map = new Map<string, { a: number; b: number; idxs: number[] }>();
  ordered.forEach((d, i) => {
    const bag = sortUnique(kind === "MAIN" ? d.mainNumbers : d.bonusNumbers);
    for (let x = 0; x < bag.length; x++) {
      for (let y = x + 1; y < bag.length; y++) {
        const key = `${bag[x]}-${bag[y]}`;
        const cur = map.get(key) ?? { a: bag[x]!, b: bag[y]!, idxs: [] };
        cur.idxs.push(i);
        map.set(key, cur);
      }
    }
  });
  const out: LiPairStat[] = [];
  for (const p of map.values()) {
    const gaps: number[] = [];
    for (let i = 1; i < p.idxs.length; i++) gaps.push(p.idxs[i]! - p.idxs[i - 1]!);
    const last = p.idxs[p.idxs.length - 1]!;
    out.push({
      a: p.a,
      b: p.b,
      kind,
      appearances: p.idxs.length,
      lastAppearance: ordered[last]?.drawDate ?? null,
      averageGap: gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null,
      recentAppearances: recent.filter((d) => {
        const bag = kind === "MAIN" ? d.mainNumbers : d.bonusNumbers;
        return bag.includes(p.a) && bag.includes(p.b);
      }).length,
    });
  }
  return out.sort((a, b) => b.appearances - a.appearances || a.a - b.a || a.b - b.b);
}

export function consecutiveGroups(nums: number[]): number[][] {
  const s = sortUnique(nums);
  const groups: number[][] = [];
  let cur: number[] = [];
  for (const n of s) {
    if (!cur.length || n === cur[cur.length - 1]! + 1) cur.push(n);
    else {
      if (cur.length >= 2) groups.push(cur);
      cur = [n];
    }
  }
  if (cur.length >= 2) groups.push(cur);
  return groups;
}

export function distribution(draws: LiDraw[], rules: LiLotteryRules): LiDistributionSnapshot {
  const oddEven: Record<string, number> = {};
  const lowHigh: Record<string, number> = {};
  const sums: number[] = [];
  const spreads: number[] = [];
  let consecutiveDraws = 0;
  for (const d of draws) {
    const m = sortUnique(d.mainNumbers);
    const odd = m.filter((n) => n % 2 === 1).length;
    const even = m.length - odd;
    const low = m.filter((n) => n <= rules.lowHighSplit).length;
    const high = m.length - low;
    const keyOE = `${odd} odd / ${even} even`;
    const keyLH = `${low} low / ${high} high`;
    oddEven[keyOE] = (oddEven[keyOE] ?? 0) + 1;
    lowHigh[keyLH] = (lowHigh[keyLH] ?? 0) + 1;
    if (m.length) {
      sums.push(m.reduce((a, b) => a + b, 0));
      spreads.push(m[m.length - 1]! - m[0]!);
    }
    if (consecutiveGroups(m).length) consecutiveDraws += 1;
  }
  const sortedSums = [...sums].sort((a, b) => a - b);
  const mid = Math.floor(sortedSums.length / 2);
  const median = sortedSums.length
    ? (sortedSums.length % 2 ? sortedSums[mid]! : (sortedSums[mid - 1]! + sortedSums[mid]!) / 2)
    : null;
  return {
    windowDraws: draws.length,
    oddEven,
    lowHigh,
    sum: {
      min: sums.length ? Math.min(...sums) : null,
      max: sums.length ? Math.max(...sums) : null,
      average: sums.length ? sums.reduce((a, b) => a + b, 0) / sums.length : null,
      median,
    },
    spread: {
      min: spreads.length ? Math.min(...spreads) : null,
      max: spreads.length ? Math.max(...spreads) : null,
      average: spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : null,
    },
    consecutiveDraws,
    consecutivePct: draws.length ? consecutiveDraws / draws.length : null,
  };
}

export function profileCombination(
  main: number[],
  bonus: number[],
  rules: LiLotteryRules,
  stats: LiNumberStat[],
  dist: LiDistributionSnapshot | null,
): LiCombinationProfile {
  const m = sortUnique(main);
  const odd = m.filter((n) => n % 2 === 1).length;
  const even = m.length - odd;
  const low = m.filter((n) => n <= rules.lowHighSplit).length;
  const high = m.length - low;
  const sum = m.reduce((a, b) => a + b, 0);
  const spread = m.length ? m[m.length - 1]! - m[0]! : 0;
  const groups = consecutiveGroups(m);
  const byNum = new Map(stats.filter((s) => s.kind === "MAIN").map((s) => [s.number, s]));
  let hot = 0, cold = 0, mid = 0;
  const gaps: number[] = [];
  for (const n of m) {
    const st = byNum.get(n);
    if (!st || stats.length === 0) continue;
    const avg = stats.filter((s) => s.kind === "MAIN").reduce((a, s) => a + s.appearancePct, 0) / Math.max(1, rules.mainMax - rules.mainMin + 1);
    if (st.appearancePct > avg * 1.15) hot += 1;
    else if (st.appearancePct < avg * 0.85) cold += 1;
    else mid += 1;
    if (st.drawsSince !== null) gaps.push(st.drawsSince);
  }
  const flags: string[] = [];
  if (groups.length) flags.push("has_consecutive");
  if (m.filter((n) => n <= 31).length >= Math.max(4, rules.mainCount - 1)) flags.push("birthday_heavy");
  if (odd === m.length || even === m.length) flags.push("all_same_parity");
  if (low === m.length || high === m.length) flags.push("all_same_half");
  if (m.length >= 4 && m[m.length - 1]! - m[0]! <= 10) flags.push("tight_cluster");

  let fit = 50;
  let assessment: LiCombinationProfile["assessment"] = "INSUFFICIENT_DATA";
  if (dist && dist.windowDraws >= 5) {
    assessment = "BALANCED";
    const typicalOdd = odd === 2 || odd === 3;
    const typicalLow = low === 2 || low === 3;
    if (typicalOdd) fit += 12; else fit -= 10;
    if (typicalLow) fit += 12; else fit -= 8;
    if (dist.sum.average !== null) {
      const delta = Math.abs(sum - dist.sum.average);
      fit += delta < 15 ? 12 : delta < 30 ? 4 : -10;
    }
    if (dist.spread.average !== null) {
      const delta = Math.abs(spread - dist.spread.average);
      fit += delta < 8 ? 8 : -4;
    }
    if (groups.length >= 2 || (groups[0]?.length ?? 0) >= 3) {
      fit -= 12;
      assessment = "SEQUENTIAL";
    }
    if (flags.includes("birthday_heavy")) {
      fit -= 8;
      assessment = "BIRTHDAY_HEAVY";
    }
    if (flags.includes("all_same_parity") || flags.includes("all_same_half") || flags.includes("tight_cluster")) {
      assessment = "CONCENTRATED";
    }
    if (fit < 40 && assessment === "BALANCED") assessment = "UNUSUAL";
  }
  fit = Math.max(0, Math.min(100, Math.round(fit)));

  return {
    mainNumbers: m,
    bonusNumbers: sortUnique(bonus),
    odd,
    even,
    low,
    high,
    sum,
    spread,
    consecutiveGroups: groups,
    frequencyProfile: { hot, cold, mid },
    gapProfile: { averageDrawsSince: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null },
    patternFlags: flags,
    statisticalFitScore: fit,
    diversityScore: null,
    assessment,
  };
}

export function overlapScore(a: number[], b: number[]): number {
  const sb = new Set(b);
  return a.filter((n) => sb.has(n)).length;
}

export function diversityAmong(lines: Array<{ mainNumbers: number[]; bonusNumbers: number[] }>): number {
  if (lines.length < 2) return 100;
  let pair = 0;
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const om = overlapScore(lines[i]!.mainNumbers, lines[j]!.mainNumbers);
      const ob = overlapScore(lines[i]!.bonusNumbers, lines[j]!.bonusNumbers);
      const mainN = Math.max(1, lines[i]!.mainNumbers.length);
      const bonusN = Math.max(1, lines[i]!.bonusNumbers.length);
      acc += 1 - (om / mainN) * 0.75 - (ob / bonusN) * 0.25;
      pair += 1;
    }
  }
  return Math.round((acc / pair) * 100);
}

export function prizeTier(mainHits: number, bonusHits: number, rules?: LiLotteryRules): LiPrizeTier {
  const key = `${mainHits}+${bonusHits}`;
  const tiers = rules?.prizeTiers ?? EUROMILLIONS_PRIZE_TIERS;
  return (tiers as readonly string[]).includes(key) ? (key as LiPrizeTier) : "NONE";
}

export function matchLine(lineMain: number[], lineBonus: number[], draw: LiDraw, rules?: LiLotteryRules): {
  main: number;
  bonus: number;
  tier: LiPrizeTier;
} {
  const main = lineMain.filter((n) => draw.mainNumbers.includes(n)).length;
  const bonus = lineBonus.filter((n) => draw.bonusNumbers.includes(n)).length;
  return { main, bonus, tier: prizeTier(main, bonus, rules) };
}

function availablePool(min: number, max: number, locked: number[], excluded: number[]): number[] {
  const lock = new Set(locked);
  const ex = new Set(excluded);
  const out: number[] = [];
  for (let n = min; n <= max; n++) {
    if (!lock.has(n) && !ex.has(n)) out.push(n);
  }
  return out;
}

function sampleK(pool: number[], k: number): number[] {
  if (k > pool.length) throw new Error("INSUFFICIENT_POOL");
  const copy = [...pool];
  const picked: number[] = [];
  for (let i = 0; i < k; i++) {
    const idx = randomInt(copy.length);
    picked.push(copy.splice(idx, 1)[0]!);
  }
  return sortUnique(picked);
}

function weightedSample(pool: number[], k: number, weight: (n: number) => number): number[] {
  const remaining = [...pool];
  const picked: number[] = [];
  for (let i = 0; i < k; i++) {
    const weights = remaining.map((n) => Math.max(0.0001, weight(n)));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = (randomInt(1_000_000) / 1_000_000) * total;
    let chosen = 0;
    for (let j = 0; j < remaining.length; j++) {
      r -= weights[j]!;
      if (r <= 0) { chosen = j; break; }
      chosen = j;
    }
    picked.push(remaining.splice(chosen, 1)[0]!);
  }
  return sortUnique(picked);
}

export function generateLines(input: {
  rules: LiLotteryRules;
  mode: LiGenerationMode;
  count: number;
  lockedMain: number[];
  excludedMain: number[];
  lockedBonus: number[];
  excludedBonus: number[];
  stats: LiNumberStat[];
  dist: LiDistributionSnapshot | null;
  inputDataVersion: string;
}): LiGeneratedLine[] {
  const rules = input.rules;
  const lockM = sortUnique(input.lockedMain);
  const lockB = sortUnique(input.lockedBonus);
  if (lockM.length > rules.mainCount) throw Object.assign(new Error("Too many locked main numbers"), { code: "INVALID_CONSTRAINT" });
  if (lockB.length > rules.bonusCount) throw Object.assign(new Error("Too many locked bonus numbers"), { code: "INVALID_CONSTRAINT" });
  const poolM = availablePool(rules.mainMin, rules.mainMax, lockM, input.excludedMain);
  const poolB = availablePool(rules.bonusMin, rules.bonusMax, lockB, input.excludedBonus);
  const needM = rules.mainCount - lockM.length;
  const needB = rules.bonusCount - lockB.length;
  if (poolM.length < needM || poolB.length < needB) {
    throw Object.assign(new Error("Locked/excluded numbers leave an insufficient pool"), { code: "INSUFFICIENT_POOL" });
  }

  const freq = new Map(input.stats.filter((s) => s.kind === "MAIN").map((s) => [s.number, s.appearancePct]));
  const bonusFreq = new Map(input.stats.filter((s) => s.kind === "BONUS").map((s) => [s.number, s.appearancePct]));
  const lines: LiGeneratedLine[] = [];
  const attemptsCap = input.count * 40 + 20;

  for (let attempt = 0; attempt < attemptsCap && lines.length < input.count; attempt++) {
    let extraM: number[];
    let extraB: number[];
    if (input.mode === "HISTORICAL") {
      extraM = weightedSample(poolM, needM, (n) => (freq.get(n) ?? 0.02) + 0.005);
      extraB = weightedSample(poolB, needB, (n) => (bonusFreq.get(n) ?? 0.08) + 0.01);
    } else if (input.mode === "ANTI_POPULAR") {
      extraM = weightedSample(poolM, needM, (n) => (n > 31 ? 1.6 : 0.7));
      extraB = sampleK(poolB, needB);
    } else {
      extraM = sampleK(poolM, needM);
      extraB = sampleK(poolB, needB);
    }
    const main = sortUnique([...lockM, ...extraM]);
    const bonus = sortUnique([...lockB, ...extraB]);
    const errors = validateLine(main, bonus, rules);
    if (errors.length) continue;

    if (input.mode === "BALANCED" || input.mode === "AI_ANALYSIS") {
      const odd = main.filter((n) => n % 2 === 1).length;
      const low = main.filter((n) => n <= rules.lowHighSplit).length;
      if (odd < 2 || odd > 3) continue;
      if (low < 2 || low > 3) continue;
      if (consecutiveGroups(main).some((g) => g.length >= 3)) continue;
    }
    if (input.mode === "ANTI_POPULAR") {
      if (consecutiveGroups(main).length) continue;
      if (main.filter((n) => n <= 31).length >= 4) continue;
    }
    if (input.mode === "DIVERSIFIED" || input.mode === "AI_ANALYSIS") {
      const tooClose = lines.some((l) => overlapScore(l.mainNumbers, main) >= 4);
      if (tooClose) continue;
    }
    if (lines.some((l) => sameLine(l.mainNumbers, main, l.bonusNumbers, bonus))) continue;

    const profile = profileCombination(main, bonus, rules, input.stats, input.dist);
    const why = explainGeneration(input.mode, profile, lockM, input.excludedMain);
    const existing = lines.map((l) => ({ mainNumbers: l.mainNumbers, bonusNumbers: l.bonusNumbers }));
    profile.diversityScore = diversityAmong([...existing, { mainNumbers: main, bonusNumbers: bonus }]);
    lines.push({
      id: `li-ln-${lines.length + 1}`,
      mainNumbers: main,
      bonusNumbers: bonus,
      profile,
      mode: input.mode,
      why,
      versions: {
        modelName: LI_CURRENT_MODEL.name,
        modelVersion: LI_CURRENT_MODEL.version,
        strategyVersion: LI_CURRENT_MODEL.strategyVersion,
        statsVersion: LI_CURRENT_MODEL.statsVersion,
        rulesVersion: rules.version,
        inputDataVersion: input.inputDataVersion,
      },
    });
  }

  if (lines.length < input.count && (input.mode === "BALANCED" || input.mode === "DIVERSIFIED" || input.mode === "ANTI_POPULAR" || input.mode === "AI_ANALYSIS")) {
    const fallback = generateLines({ ...input, mode: "RANDOM", count: input.count - lines.length });
    for (const f of fallback) {
      if (lines.length >= input.count) break;
      if (lines.some((l) => sameLine(l.mainNumbers, f.mainNumbers, l.bonusNumbers, f.bonusNumbers))) continue;
      lines.push({ ...f, mode: input.mode, why: [...f.why, "Fell back to a random valid line after constraint filtering."] });
    }
  }

  const div = diversityAmong(lines.map((l) => ({ mainNumbers: l.mainNumbers, bonusNumbers: l.bonusNumbers })));
  for (const l of lines) l.profile.diversityScore = div;
  return lines;
}

function sameLine(a: number[], b: number[], sa: number[], sb: number[]): boolean {
  return a.join(",") === b.join(",") && sa.join(",") === sb.join(",");
}

export function explainGeneration(
  mode: LiGenerationMode,
  profile: LiCombinationProfile,
  locked: number[],
  excluded: number[],
): string[] {
  const why = [
    `Generation method: ${mode}. This is combination analysis, not a claim that these numbers are more likely to be drawn.`,
    `Odd/even ${profile.odd}/${profile.even}, low/high ${profile.low}/${profile.high}, sum ${profile.sum}, spread ${profile.spread}.`,
    `Statistical-fit score ${profile.statisticalFitScore}/100 measures resemblance to the selected historical distribution — not win chance.`,
    `Assessment: ${profile.assessment}.`,
  ];
  if (locked.length) why.push(`Locked main numbers respected: ${locked.join(", ")}.`);
  if (excluded.length) why.push(`Excluded main numbers respected: ${excluded.join(", ")}.`);
  if (profile.patternFlags.length) why.push(`Pattern flags: ${profile.patternFlags.join(", ")}.`);
  if (mode === "RANDOM") why.push("Numbers were sampled uniformly from the legal range using a CSPRNG.");
  if (mode === "HISTORICAL") why.push("Sampling was frequency-weighted. Historical frequency does not change the next-draw probability.");
  if (mode === "ANTI_POPULAR") why.push("Avoided common human patterns (sequences, birthday-heavy 1–31). This may reduce prize-sharing if a line wins; it does not raise the chance of being drawn.");
  if (mode === "DIVERSIFIED") why.push("Lines were filtered to reduce overlap with each other (diversity, not prediction).");
  return why;
}

export function hotCold(stats: LiNumberStat[], take = 6): { hot: number[]; cold: number[] } {
  const sorted = [...stats].sort((a, b) => b.appearancePct - a.appearancePct || a.number - b.number);
  return {
    hot: sorted.slice(0, take).map((s) => s.number),
    cold: [...sorted].reverse().slice(0, take).map((s) => s.number),
  };
}

export function datasetVersion(draws: LiDraw[]): string {
  if (!draws.length) return "empty";
  const last = [...draws].sort((a, b) => a.drawDate.localeCompare(b.drawDate)).slice(-1)[0]!;
  return `${draws.length}:${last.providerDrawId}:${last.drawDate}`;
}
