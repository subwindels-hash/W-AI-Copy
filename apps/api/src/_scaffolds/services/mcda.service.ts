/**
 * Multi-Criteria Decision Analysis (MCDA) Service (Module 10 — Gap 2)
 *
 * Evaluate and rank decision options using multiple criteria:
 * - Score options against each criterion
 * - Apply criterion weights
 * - Compute total utility scores
 * - Rank options by total score
 * - Sensitivity analysis (how rankings change with weight changes)
 * - Pareto frontier identification (non-dominated options)
 *
 * Implements weighted sum model (WSM) and weighted product model (WPM).
 */
import { logger } from "../../config/logger.js";
import {
  getDecisionModel,
  updateDecisionModel,
  type DecisionModel,
  type DecisionOption,
  type DecisionCriterion,
} from "./decisionModel.service.js";

// ─── Types ──────────────────────────────────────────────────────

export interface EvaluationResult {
  decisionId: string;
  options: EvaluatedOption[];
  method: "weighted_sum" | "weighted_product";
  evaluatedAt: number;
}

export interface EvaluatedOption extends DecisionOption {
  scores: Record<string, number>; // criterionId → normalized score (0-1)
  weightedScores: Record<string, number>; // criterionId → weighted score
  totalScore: number; // Sum of weighted scores
  rank: number; // 1 = best
  isParetoOptimal: boolean;
}

export interface SensitivityAnalysis {
  decisionId: string;
  criterionId: string;
  originalWeight: number;
  weightVariations: Array<{
    weight: number;
    rankings: Array<{ optionId: string; optionName: string; rank: number; totalScore: number }>;
    rankChanges: number; // How many options changed rank
  }>;
}

// ─── Scoring Functions ──────────────────────────────────────────

/**
 * Score an option against a criterion.
 * For quantitative criteria, normalize to 0-1 scale.
 * For qualitative criteria, use provided score.
 */
function scoreOption(
  option: DecisionOption,
  criterion: DecisionCriterion,
  allOptions: DecisionOption[],
): number {
  if (criterion.type === "boolean") {
    const value = option.attributes[criterion.name];
    return value === true ? 1.0 : 0.0;
  }

  if (criterion.type === "quantitative") {
    const value = option.attributes[criterion.name];
    if (typeof value !== "number") return 0.5;

    // Normalize using min-max scaling
    const values = allOptions
      .map(o => o.attributes[criterion.name])
      .filter(v => typeof v === "number") as number[];

    if (values.length === 0) return 0.5;

    const min = Math.min(...values);
    const max = Math.max(...values);

    if (max === min) return 0.5; // All values same

    let normalized = (value - min) / (max - min);

    // Invert if minimizing
    if (criterion.direction === "minimize") {
      normalized = 1 - normalized;
    }

    return normalized;
  }

  // Qualitative: use provided score or default
  const score = option.attributes[`${criterion.name}_score`];
  if (typeof score === "number") {
    return Math.max(0, Math.min(1, score));
  }

  return 0.5; // Default
}

// ─── Evaluation Methods ─────────────────────────────────────────

/**
 * Evaluate options using Weighted Sum Model (WSM).
 * Total score = Σ(weight_i * score_i)
 */
export async function evaluateWeightedSum(
  decisionId: string,
): Promise<EvaluationResult> {
  const decision = await getDecisionModel(decisionId);
  if (!decision) {
    throw new Error(`Decision ${decisionId} not found`);
  }

  if (decision.options.length === 0) {
    throw new Error("Decision has no options to evaluate");
  }

  if (decision.criteria.length === 0) {
    throw new Error("Decision has no criteria defined");
  }

  const evaluatedOptions: EvaluatedOption[] = [];

  for (const option of decision.options) {
    const scores: Record<string, number> = {};
    const weightedScores: Record<string, number> = {};
    let totalScore = 0;

    for (const criterion of decision.criteria) {
      const score = scoreOption(option, criterion, decision.options);
      const weightedScore = score * criterion.weight;

      scores[criterion.id] = score;
      weightedScores[criterion.id] = weightedScore;
      totalScore += weightedScore;
    }

    evaluatedOptions.push({
      ...option,
      scores,
      weightedScores,
      totalScore,
      rank: 0, // Will be set after sorting
      isParetoOptimal: false, // Will be computed later
    });
  }

  // Rank options by total score (descending)
  evaluatedOptions.sort((a, b) => b.totalScore - a.totalScore);
  evaluatedOptions.forEach((opt, idx) => {
    opt.rank = idx + 1;
  });

  // Identify Pareto-optimal options
  identifyParetoOptimal(evaluatedOptions, decision.criteria);

  const result: EvaluationResult = {
    decisionId,
    options: evaluatedOptions,
    method: "weighted_sum",
    evaluatedAt: Date.now(),
  };

  // Update decision model with scores
  await updateDecisionModel(decisionId, {
    options: evaluatedOptions,
    status: "evaluating",
  });

  logger.info("Options evaluated using weighted sum", {
    decisionId,
    optionCount: evaluatedOptions.length,
    bestOption: evaluatedOptions[0]?.name,
    bestScore: evaluatedOptions[0]?.totalScore,
  });

  return result;
}

/**
 * Evaluate options using Weighted Product Model (WPM).
 * Total score = Π(score_i ^ weight_i)
 * Better for avoiding compensation between criteria.
 */
export async function evaluateWeightedProduct(
  decisionId: string,
): Promise<EvaluationResult> {
  const decision = await getDecisionModel(decisionId);
  if (!decision) {
    throw new Error(`Decision ${decisionId} not found`);
  }

  const evaluatedOptions: EvaluatedOption[] = [];

  for (const option of decision.options) {
    const scores: Record<string, number> = {};
    const weightedScores: Record<string, number> = {};
    let totalScore = 1;

    for (const criterion of decision.criteria) {
      const score = scoreOption(option, criterion, decision.options);
      // Avoid zero scores (would make product zero)
      const safeScore = Math.max(score, 0.001);
      const weightedScore = Math.pow(safeScore, criterion.weight);

      scores[criterion.id] = score;
      weightedScores[criterion.id] = weightedScore;
      totalScore *= weightedScore;
    }

    evaluatedOptions.push({
      ...option,
      scores,
      weightedScores,
      totalScore,
      rank: 0,
      isParetoOptimal: false,
    });
  }

  // Rank and identify Pareto optimal
  evaluatedOptions.sort((a, b) => b.totalScore - a.totalScore);
  evaluatedOptions.forEach((opt, idx) => {
    opt.rank = idx + 1;
  });
  identifyParetoOptimal(evaluatedOptions, decision.criteria);

  const result: EvaluationResult = {
    decisionId,
    options: evaluatedOptions,
    method: "weighted_product",
    evaluatedAt: Date.now(),
  };

  await updateDecisionModel(decisionId, {
    options: evaluatedOptions,
    status: "evaluating",
  });

  logger.info("Options evaluated using weighted product", {
    decisionId,
    optionCount: evaluatedOptions.length,
    bestOption: evaluatedOptions[0]?.name,
  });

  return result;
}

// ─── Pareto Optimality ──────────────────────────────────────────

/**
 * Identify Pareto-optimal options (non-dominated).
 * An option is Pareto-optimal if no other option is better in all criteria.
 */
function identifyParetoOptimal(
  options: EvaluatedOption[],
  criteria: DecisionCriterion[],
): void {
  for (const option of options) {
    let isDominated = false;

    for (const other of options) {
      if (other.id === option.id) continue;

      // Check if other dominates option
      let betterOrEqualInAll = true;
      let strictlyBetterInOne = false;

      for (const criterion of criteria) {
        const optionScore = option.scores[criterion.id];
        const otherScore = other.scores[criterion.id];

        if (otherScore < optionScore) {
          betterOrEqualInAll = false;
          break;
        }
        if (otherScore > optionScore) {
          strictlyBetterInOne = true;
        }
      }

      if (betterOrEqualInAll && strictlyBetterInOne) {
        isDominated = true;
        break;
      }
    }

    option.isParetoOptimal = !isDominated;
  }
}

// ─── Sensitivity Analysis ───────────────────────────────────────

/**
 * Perform sensitivity analysis on a criterion weight.
 * Shows how rankings change when weight varies.
 */
export async function performSensitivityAnalysis(
  decisionId: string,
  criterionId: string,
  variations = 10,
): Promise<SensitivityAnalysis> {
  const decision = await getDecisionModel(decisionId);
  if (!decision) {
    throw new Error(`Decision ${decisionId} not found`);
  }

  const criterion = decision.criteria.find(c => c.id === criterionId);
  if (!criterion) {
    throw new Error(`Criterion ${criterionId} not found`);
  }

  const originalWeight = criterion.weight;
  const weightVariations: SensitivityAnalysis["weightVariations"] = [];

  // Vary weight from 0 to 2x original (or 1.0 if original is 0)
  const maxWeight = Math.min(originalWeight * 2, 1.0);
  const step = maxWeight / variations;

  for (let i = 0; i <= variations; i++) {
    const testWeight = i * step;

    // Temporarily update weight
    const originalCriteria = decision.criteria.map(c => ({ ...c }));
    const testCriteria = decision.criteria.map(c => {
      if (c.id === criterionId) {
        return { ...c, weight: testWeight };
      }
      // Normalize other weights
      const otherTotal = decision.criteria
        .filter(cc => cc.id !== criterionId)
        .reduce((sum, cc) => sum + cc.weight, 0);
      const scale = otherTotal > 0 ? (1 - testWeight) / otherTotal : 0;
      return { ...c, weight: c.weight * scale };
    });

    // Re-evaluate with test weights
    const tempDecision = { ...decision, criteria: testCriteria };
    const evaluatedOptions: EvaluatedOption[] = [];

    for (const option of tempDecision.options) {
      let totalScore = 0;
      for (const crit of testCriteria) {
        const score = scoreOption(option, crit, tempDecision.options);
        totalScore += score * crit.weight;
      }
      evaluatedOptions.push({
        ...option,
        totalScore,
        rank: 0,
        isParetoOptimal: false,
        scores: {},
        weightedScores: {},
      });
    }

    evaluatedOptions.sort((a, b) => b.totalScore - a.totalScore);
    evaluatedOptions.forEach((opt, idx) => {
      opt.rank = idx + 1;
    });

    // Count rank changes from original
    const originalRanks = new Map(decision.options.map(o => [o.id, o.rank ?? 0]));
    let rankChanges = 0;
    for (const opt of evaluatedOptions) {
      if (opt.rank !== originalRanks.get(opt.id)) {
        rankChanges++;
      }
    }

    weightVariations.push({
      weight: testWeight,
      rankings: evaluatedOptions.map(o => ({
        optionId: o.id,
        optionName: o.name,
        rank: o.rank,
        totalScore: o.totalScore,
      })),
      rankChanges,
    });

    // Restore original criteria
    decision.criteria = originalCriteria;
  }

  const analysis: SensitivityAnalysis = {
    decisionId,
    criterionId,
    originalWeight,
    weightVariations,
  };

  logger.info("Sensitivity analysis completed", {
    decisionId,
    criterionId,
    criterionName: criterion.name,
    variations: weightVariations.length,
  });

  return analysis;
}

// ─── Decision Recommendation ────────────────────────────────────

/**
 * Get the recommended option based on evaluation.
 */
export async function getRecommendation(
  decisionId: string,
): Promise<{
  recommendedOption: EvaluatedOption;
  reasoning: string;
  confidence: number;
  alternatives: EvaluatedOption[];
}> {
  const decision = await getDecisionModel(decisionId);
  if (!decision) {
    throw new Error(`Decision ${decisionId} not found`);
  }

  const evaluated = decision.options as EvaluatedOption[];
  if (evaluated.length === 0) {
    throw new Error("No evaluated options found");
  }

  // Sort by rank
  const sorted = [...evaluated].sort((a, b) => a.rank - b.rank);
  const best = sorted[0];
  const second = sorted[1];

  // Compute confidence based on score difference
  const scoreDiff = second ? best.totalScore - second.totalScore : 1.0;
  const confidence = Math.min(scoreDiff / 0.2, 1.0); // 0.2 = 20% difference = 100% confidence

  const reasoning = second
    ? `${best.name} is recommended with a score of ${best.totalScore.toFixed(3)}, ` +
      `${((best.totalScore - second.totalScore) / second.totalScore * 100).toFixed(1)}% better than the next best option (${second.name}).`
    : `${best.name} is the only feasible option.`;

  logger.info("Recommendation generated", {
    decisionId,
    recommendedOption: best.name,
    confidence,
    scoreDifference: scoreDiff,
  });

  return {
    recommendedOption: best,
    reasoning,
    confidence,
    alternatives: sorted.slice(1, 4), // Top 3 alternatives
  };
}

/**
 * Compare two options side-by-side.
 */
export function compareOptions(
  option1: EvaluatedOption,
  option2: EvaluatedOption,
  criteria: DecisionCriterion[],
): {
  winner: "option1" | "option2" | "tie";
  criteriaComparison: Array<{
    criterionName: string;
    option1Score: number;
    option2Score: number;
    winner: "option1" | "option2" | "tie";
  }>;
  scoreDifference: number;
} {
  const criteriaComparison = criteria.map(criterion => {
    const score1 = option1.scores[criterion.id] ?? 0;
    const score2 = option2.scores[criterion.id] ?? 0;
    const diff = score1 - score2;

    return {
      criterionName: criterion.name,
      option1Score: score1,
      option2Score: score2,
      winner: Math.abs(diff) < 0.01 ? "tie" : diff > 0 ? "option1" : "option2",
    };
  });

  const option1Wins = criteriaComparison.filter(c => c.winner === "option1").length;
  const option2Wins = criteriaComparison.filter(c => c.winner === "option2").length;

  const winner = option1.totalScore > option2.totalScore ? "option1" :
                 option2.totalScore > option1.totalScore ? "option2" : "tie";

  return {
    winner,
    criteriaComparison,
    scoreDifference: option1.totalScore - option2.totalScore,
  };
}
