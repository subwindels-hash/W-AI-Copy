/**
 * Decision Model Service (Module 10 — Gap 1)
 *
 * Represent decisions with structured models:
 * - Decision definition: what decision needs to be made
 * - Options: alternative choices available
 * - Criteria: evaluation dimensions with weights
 * - Constraints: hard requirements that must be met
 * - Objectives: what to maximize/minimize
 * - Context: current state and relevant information
 *
 * Stores decision models in knowledge graph for reasoning and reuse.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { KnowledgeGraphService } from "../../enterprise/knowledgeGraph/knowledgeGraph.service.js";

// ─── Types ──────────────────────────────────────────────────────

export interface DecisionModel {
  id: string;
  name: string;
  description: string;
  category: DecisionCategory;
  options: DecisionOption[];
  criteria: DecisionCriterion[];
  constraints: DecisionConstraint[];
  objectives: DecisionObjective[];
  context: Record<string, any>;
  status: DecisionStatus;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  decidedAt?: number;
  selectedOptionId?: string;
}

export type DecisionCategory =
  | "resource_allocation"
  | "scheduling"
  | "selection"
  | "planning"
  | "optimization"
  | "risk_management"
  | "strategic"
  | "operational";

export type DecisionStatus = "draft" | "evaluating" | "decided" | "executing" | "completed" | "cancelled";

export interface DecisionOption {
  id: string;
  name: string;
  description: string;
  attributes: Record<string, any>;
  feasible: boolean;
  scores?: Record<string, number>; // criterionId → score
  totalScore?: number;
  rank?: number;
}

export interface DecisionCriterion {
  id: string;
  name: string;
  description: string;
  weight: number; // 0-1, normalized
  type: "quantitative" | "qualitative" | "boolean";
  direction: "maximize" | "minimize";
  scale?: { min: number; max: number }; // For quantitative criteria
}

export interface DecisionConstraint {
  id: string;
  name: string;
  description: string;
  type: "hard" | "soft";
  evaluator: string; // Function name or expression
  threshold?: number; // For soft constraints
  penalty?: number; // Penalty for violating soft constraint
}

export interface DecisionObjective {
  id: string;
  name: string;
  description: string;
  type: "maximize" | "minimize" | "target";
  metric: string; // What to measure
  target?: number; // For target objectives
  priority: number; // 1 = highest priority
}

// ─── Redis Keys ─────────────────────────────────────────────────

const DECISIONS_KEY = "decisions:all";
const DECISION_KEY = (id: string) => `decisions:decision:${id}`;
const DECISION_HISTORY_KEY = "decisions:history";

// ─── Decision Model Management ──────────────────────────────────

/**
 * Create a new decision model.
 */
export async function createDecisionModel(input: {
  name: string;
  description: string;
  category: DecisionCategory;
  options: Array<Omit<DecisionOption, "id" | "scores" | "totalScore" | "rank">>;
  criteria: Array<Omit<DecisionCriterion, "id">>;
  constraints?: Array<Omit<DecisionConstraint, "id">>;
  objectives?: Array<Omit<DecisionObjective, "id">>;
  context?: Record<string, any>;
  createdBy: string;
}): Promise<DecisionModel> {
  const now = Date.now();
  const decisionId = `decision_${randomUUID().slice(0, 8)}`;

  const options: DecisionOption[] = input.options.map(opt => ({
    ...opt,
    id: `option_${randomUUID().slice(0, 8)}`,
    feasible: true,
  }));

  const criteria: DecisionCriterion[] = input.criteria.map(crit => ({
    ...crit,
    id: `criterion_${randomUUID().slice(0, 8)}`,
  }));

  const constraints: DecisionConstraint[] = (input.constraints ?? []).map(con => ({
    ...con,
    id: `constraint_${randomUUID().slice(0, 8)}`,
  }));

  const objectives: DecisionObjective[] = (input.objectives ?? []).map(obj => ({
    ...obj,
    id: `objective_${randomUUID().slice(0, 8)}`,
  }));

  const decision: DecisionModel = {
    id: decisionId,
    name: input.name,
    description: input.description,
    category: input.category,
    options,
    criteria,
    constraints,
    objectives,
    context: input.context ?? {},
    status: "draft",
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  // Store decision
  await redis.hset(DECISION_KEY(decisionId), {
    id: decision.id,
    name: decision.name,
    description: decision.description,
    category: decision.category,
    options: JSON.stringify(decision.options),
    criteria: JSON.stringify(decision.criteria),
    constraints: JSON.stringify(decision.constraints),
    objectives: JSON.stringify(decision.objectives),
    context: JSON.stringify(decision.context),
    status: decision.status,
    createdBy: decision.createdBy,
    createdAt: String(decision.createdAt),
    updatedAt: String(decision.updatedAt),
    decidedAt: decision.decidedAt ? String(decision.decidedAt) : "",
    selectedOptionId: decision.selectedOptionId ?? "",
  });

  await redis.sadd(DECISIONS_KEY, decisionId);

  // Add to knowledge graph
  await KnowledgeGraphService.upsertEntity({
    kind: "concept",
    name: decision.name,
    attributes: {
      type: "decision_model",
      category: decision.category,
      optionCount: decision.options.length,
      criterionCount: decision.criteria.length,
    },
    tags: ["decision", decision.category],
    provenance: {
      source: "decision-model-service",
      sourceId: decisionId,
    },
  });

  logger.info("Decision model created", {
    decisionId,
    name: decision.name,
    optionCount: decision.options.length,
    criterionCount: decision.criteria.length,
  });

  return decision;
}

/**
 * Get a decision model by ID.
 */
export async function getDecisionModel(decisionId: string): Promise<DecisionModel | null> {
  const data = await redis.hgetall(DECISION_KEY(decisionId));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    category: data.category as DecisionCategory,
    options: JSON.parse(data.options || "[]"),
    criteria: JSON.parse(data.criteria || "[]"),
    constraints: JSON.parse(data.constraints || "[]"),
    objectives: JSON.parse(data.objectives || "[]"),
    context: JSON.parse(data.context || "{}"),
    status: data.status as DecisionStatus,
    createdBy: data.createdBy,
    createdAt: parseInt(data.createdAt, 10),
    updatedAt: parseInt(data.updatedAt, 10),
    decidedAt: data.decidedAt ? parseInt(data.decidedAt, 10) : undefined,
    selectedOptionId: data.selectedOptionId || undefined,
  };
}

/**
 * List decision models.
 */
export async function listDecisionModels(
  filter?: { category?: DecisionCategory; status?: DecisionStatus },
): Promise<DecisionModel[]> {
  const decisionIds = await redis.smembers(DECISIONS_KEY);
  const decisions: DecisionModel[] = [];

  for (const id of decisionIds) {
    const decision = await getDecisionModel(id);
    if (!decision) continue;

    if (filter?.category && decision.category !== filter.category) continue;
    if (filter?.status && decision.status !== filter.status) continue;

    decisions.push(decision);
  }

  return decisions.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Update a decision model.
 */
export async function updateDecisionModel(
  decisionId: string,
  updates: Partial<Pick<DecisionModel, "name" | "description" | "options" | "criteria" | "constraints" | "objectives" | "context" | "status">>,
): Promise<DecisionModel | null> {
  const decision = await getDecisionModel(decisionId);
  if (!decision) return null;

  const updated = {
    ...decision,
    ...updates,
    updatedAt: Date.now(),
  };

  await redis.hset(DECISION_KEY(decisionId), {
    name: updated.name,
    description: updated.description,
    options: JSON.stringify(updated.options),
    criteria: JSON.stringify(updated.criteria),
    constraints: JSON.stringify(updated.constraints),
    objectives: JSON.stringify(updated.objectives),
    context: JSON.stringify(updated.context),
    status: updated.status,
    updatedAt: String(updated.updatedAt),
  });

  logger.info("Decision model updated", { decisionId, status: updated.status });

  return updated;
}

/**
 * Add an option to a decision model.
 */
export async function addOption(
  decisionId: string,
  option: Omit<DecisionOption, "id" | "scores" | "totalScore" | "rank">,
): Promise<DecisionOption | null> {
  const decision = await getDecisionModel(decisionId);
  if (!decision) return null;

  const newOption: DecisionOption = {
    ...option,
    id: `option_${randomUUID().slice(0, 8)}`,
    feasible: true,
  };

  decision.options.push(newOption);
  await updateDecisionModel(decisionId, { options: decision.options });

  return newOption;
}

/**
 * Add a criterion to a decision model.
 */
export async function addCriterion(
  decisionId: string,
  criterion: Omit<DecisionCriterion, "id">,
): Promise<DecisionCriterion | null> {
  const decision = await getDecisionModel(decisionId);
  if (!decision) return null;

  const newCriterion: DecisionCriterion = {
    ...criterion,
    id: `criterion_${randomUUID().slice(0, 8)}`,
  };

  decision.criteria.push(newCriterion);
  await updateDecisionModel(decisionId, { criteria: decision.criteria });

  return newCriterion;
}

/**
 * Normalize criterion weights to sum to 1.
 */
export async function normalizeCriterionWeights(decisionId: string): Promise<DecisionModel | null> {
  const decision = await getDecisionModel(decisionId);
  if (!decision) return null;

  const totalWeight = decision.criteria.reduce((sum, c) => sum + c.weight, 0);
  
  if (totalWeight === 0) {
    // Equal weights
    const equalWeight = 1 / decision.criteria.length;
    decision.criteria.forEach(c => c.weight = equalWeight);
  } else {
    // Normalize
    decision.criteria.forEach(c => c.weight = c.weight / totalWeight);
  }

  await updateDecisionModel(decisionId, { criteria: decision.criteria });

  logger.info("Criterion weights normalized", {
    decisionId,
    criterionCount: decision.criteria.length,
  });

  return decision;
}

/**
 * Mark a decision as decided with selected option.
 */
export async function markDecided(
  decisionId: string,
  selectedOptionId: string,
): Promise<DecisionModel | null> {
  const decision = await getDecisionModel(decisionId);
  if (!decision) return null;

  const option = decision.options.find(o => o.id === selectedOptionId);
  if (!option) {
    throw new Error(`Option ${selectedOptionId} not found in decision ${decisionId}`);
  }

  decision.status = "decided";
  decision.selectedOptionId = selectedOptionId;
  decision.decidedAt = Date.now();

  await redis.hset(DECISION_KEY(decisionId), {
    status: decision.status,
    selectedOptionId,
    decidedAt: String(decision.decidedAt),
    updatedAt: String(Date.now()),
  });

  // Add to history
  await redis.lpush(DECISION_HISTORY_KEY, JSON.stringify({
    decisionId,
    decisionName: decision.name,
    selectedOptionId,
    selectedOptionName: option.name,
    decidedAt: decision.decidedAt,
  }));
  await redis.ltrim(DECISION_HISTORY_KEY, 0, 999);

  logger.info("Decision marked as decided", {
    decisionId,
    selectedOptionId,
    selectedOptionName: option.name,
  });

  return decision;
}

/**
 * Delete a decision model.
 */
export async function deleteDecisionModel(decisionId: string): Promise<boolean> {
  const exists = await redis.exists(DECISION_KEY(decisionId));
  if (!exists) return false;

  await redis.del(DECISION_KEY(decisionId));
  await redis.srem(DECISIONS_KEY, decisionId);

  logger.info("Decision model deleted", { decisionId });

  return true;
}

/**
 * Get decision history.
 */
export async function getDecisionHistory(limit = 50): Promise<Array<{
  decisionId: string;
  decisionName: string;
  selectedOptionId: string;
  selectedOptionName: string;
  decidedAt: number;
}>> {
  const raw = await redis.lrange(DECISION_HISTORY_KEY, 0, limit - 1);
  return raw.map(r => JSON.parse(r));
}

/**
 * Get decision statistics.
 */
export async function getDecisionStats(): Promise<{
  totalDecisions: number;
  byCategory: Record<DecisionCategory, number>;
  byStatus: Record<DecisionStatus, number>;
  decidedCount: number;
}> {
  const decisions = await listDecisionModels();

  const byCategory = {} as Record<DecisionCategory, number>;
  const byStatus = {} as Record<DecisionStatus, number>;
  let decidedCount = 0;

  for (const decision of decisions) {
    byCategory[decision.category] = (byCategory[decision.category] ?? 0) + 1;
    byStatus[decision.status] = (byStatus[decision.status] ?? 0) + 1;
    if (decision.status === "decided" || decision.status === "completed") {
      decidedCount++;
    }
  }

  return {
    totalDecisions: decisions.length,
    byCategory,
    byStatus,
    decidedCount,
  };
}
