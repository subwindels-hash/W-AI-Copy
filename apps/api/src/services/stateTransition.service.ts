/**
 * State Transition Service (Module 9 — Gap 2)
 *
 * Model how actions cause state changes:
 * - Action definitions: what actions are possible
 * - Preconditions: what must be true for action to execute
 * - Effects: what changes when action executes
 * - Transition execution: apply action to state → new state
 * - Action sequences: plan and execute multiple actions
 *
 * Uses the world state (Gap 1) and knowledge graph (Module 7).
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { KnowledgeGraphService } from "../enterprise/knowledgeGraph/knowledgeGraph.service.js";
import {
  captureState,
  getState,
  type WorldState,
  type EntityState,
  type RelationState,
} from "./worldState.service.js";
import type { RelationKind } from "@windels/shared/dataPlatform";

// ─── Types ──────────────────────────────────────────────────────

export interface Action {
  id: string;
  name: string;
  description: string;
  parameters: ActionParameter[];
  preconditions: Condition[];
  effects: Effect[];
  createdAt: number;
}

export interface ActionParameter {
  name: string;
  type: "entity" | "relation" | "string" | "number" | "boolean";
  required: boolean;
  description?: string;
}

export interface Condition {
  type: "entity_exists" | "relation_exists" | "attribute_equals" | "attribute_greater" | "attribute_less" | "custom";
  // Entity/relation existence
  entityId?: string; // Can be parameter reference like "?agent"
  fromEntity?: string;
  toEntity?: string;
  relationKind?: string;
  // Attribute checks
  attribute?: string;
  value?: any;
  // Custom
  evaluator?: string; // Function name
}

export interface Effect {
  type: "add_entity" | "remove_entity" | "update_attribute" | "add_relation" | "remove_relation" | "custom";
  // Entity operations
  entityId?: string;
  entityKind?: string;
  entityName?: string;
  // Attribute operations
  attribute?: string;
  value?: any;
  // Relation operations
  fromEntity?: string;
  toEntity?: string;
  relationKind?: RelationKind;
  // Custom
  handler?: string; // Function name
}

export interface ActionInstance {
  actionId: string;
  parameters: Record<string, any>; // Parameter name → value
}

export interface TransitionResult {
  success: boolean;
  fromStateId: string;
  toStateId?: string;
  action: ActionInstance;
  preconditionsMet: boolean;
  failedPreconditions?: Condition[];
  effectsApplied?: Effect[];
  error?: string;
  timestamp: number;
}

export interface ActionSequence {
  id: string;
  actions: ActionInstance[];
  executedAt: number;
  results: TransitionResult[];
  finalStateId?: string;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const ACTIONS_KEY = "transitions:actions";
const ACTION_KEY = (id: string) => `transitions:action:${id}`;
const TRANSITIONS_KEY = "transitions:history";

// ─── Action Management ──────────────────────────────────────────

/**
 * Define a new action.
 */
export async function defineAction(input: {
  name: string;
  description: string;
  parameters: ActionParameter[];
  preconditions: Condition[];
  effects: Effect[];
}): Promise<Action> {
  const action: Action = {
    id: `action_${randomUUID().slice(0, 8)}`,
    name: input.name,
    description: input.description,
    parameters: input.parameters,
    preconditions: input.preconditions,
    effects: input.effects,
    createdAt: Date.now(),
  };

  await redis.hset(ACTION_KEY(action.id), {
    id: action.id,
    name: action.name,
    description: action.description,
    parameters: JSON.stringify(action.parameters),
    preconditions: JSON.stringify(action.preconditions),
    effects: JSON.stringify(action.effects),
    createdAt: String(action.createdAt),
  });

  await redis.sadd(ACTIONS_KEY, action.id);

  logger.info("Action defined", { actionId: action.id, name: action.name });

  return action;
}

/**
 * Get an action by ID.
 */
export async function getAction(actionId: string): Promise<Action | null> {
  const data = await redis.hgetall(ACTION_KEY(actionId));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    parameters: JSON.parse(data.parameters || "[]"),
    preconditions: JSON.parse(data.preconditions || "[]"),
    effects: JSON.parse(data.effects || "[]"),
    createdAt: parseInt(data.createdAt, 10),
  };
}

/**
 * List all actions.
 */
export async function listActions(): Promise<Action[]> {
  const actionIds = await redis.smembers(ACTIONS_KEY);
  const actions: Action[] = [];

  for (const id of actionIds) {
    const action = await getAction(id);
    if (action) actions.push(action);
  }

  return actions.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Condition Evaluation ───────────────────────────────────────

/**
 * Resolve parameter references in a string (e.g., "?agent" → actual entity ID).
 */
function resolveParam(value: string | undefined, params: Record<string, any>): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("?")) {
    const paramName = value.slice(1);
    return params[paramName];
  }
  return value;
}

/**
 * Evaluate a condition against a state.
 */
function evaluateCondition(
  condition: Condition,
  state: WorldState,
  params: Record<string, any>,
): boolean {
  switch (condition.type) {
    case "entity_exists": {
      const entityId = resolveParam(condition.entityId, params);
      if (!entityId) return false;
      return state.entities.some(e => e.id === entityId);
    }

    case "relation_exists": {
      const fromEntity = resolveParam(condition.fromEntity, params);
      const toEntity = resolveParam(condition.toEntity, params);
      if (!fromEntity || !toEntity) return false;

      return state.relations.some(r =>
        r.from === fromEntity &&
        r.to === toEntity &&
        (!condition.relationKind || r.kind === condition.relationKind)
      );
    }

    case "attribute_equals": {
      const entityId = resolveParam(condition.entityId, params);
      if (!entityId || !condition.attribute) return false;

      const entity = state.entities.find(e => e.id === entityId);
      if (!entity) return false;

      return entity.attributes[condition.attribute] === condition.value;
    }

    case "attribute_greater": {
      const entityId = resolveParam(condition.entityId, params);
      if (!entityId || !condition.attribute) return false;

      const entity = state.entities.find(e => e.id === entityId);
      if (!entity) return false;

      const val = entity.attributes[condition.attribute];
      return typeof val === "number" && val > (condition.value as number);
    }

    case "attribute_less": {
      const entityId = resolveParam(condition.entityId, params);
      if (!entityId || !condition.attribute) return false;

      const entity = state.entities.find(e => e.id === entityId);
      if (!entity) return false;

      const val = entity.attributes[condition.attribute];
      return typeof val === "number" && val < (condition.value as number);
    }

    case "custom": {
      // TODO: Implement custom evaluators
      return true;
    }

    default:
      return false;
  }
}

/**
 * Check if all preconditions are met.
 */
function checkPreconditions(
  action: Action,
  state: WorldState,
  params: Record<string, any>,
): { met: boolean; failed: Condition[] } {
  const failed: Condition[] = [];

  for (const condition of action.preconditions) {
    if (!evaluateCondition(condition, state, params)) {
      failed.push(condition);
    }
  }

  return {
    met: failed.length === 0,
    failed,
  };
}

// ─── Effect Application ─────────────────────────────────────────

/**
 * Apply an effect to create a new state.
 */
function applyEffect(
  effect: Effect,
  state: WorldState,
  params: Record<string, any>,
): WorldState {
  // Clone state
  const newState: WorldState = {
    ...state,
    id: `state_${randomUUID().slice(0, 8)}`,
    timestamp: Date.now(),
    entities: [...state.entities],
    relations: [...state.relations],
  };

  switch (effect.type) {
    case "add_entity": {
      const entityId = resolveParam(effect.entityId, params) ?? `entity_${randomUUID().slice(0, 8)}`;
      const entityName = resolveParam(effect.entityName, params) ?? "New Entity";

      const newEntity: EntityState = {
        id: entityId,
        kind: effect.entityKind ?? "concept",
        name: entityName,
        attributes: {},
        tags: [],
      };

      newState.entities.push(newEntity);
      break;
    }

    case "remove_entity": {
      const entityId = resolveParam(effect.entityId, params);
      if (!entityId) break;

      newState.entities = newState.entities.filter(e => e.id !== entityId);
      newState.relations = newState.relations.filter(r => r.from !== entityId && r.to !== entityId);
      break;
    }

    case "update_attribute": {
      const entityId = resolveParam(effect.entityId, params);
      if (!entityId || !effect.attribute) break;

      const entityIndex = newState.entities.findIndex(e => e.id === entityId);
      if (entityIndex === -1) break;

      const value = resolveParam(effect.value?.toString(), params) ?? effect.value;
      newState.entities[entityIndex] = {
        ...newState.entities[entityIndex],
        attributes: {
          ...newState.entities[entityIndex].attributes,
          [effect.attribute]: value,
        },
      };
      break;
    }

    case "add_relation": {
      const fromEntity = resolveParam(effect.fromEntity, params);
      const toEntity = resolveParam(effect.toEntity, params);
      if (!fromEntity || !toEntity || !effect.relationKind) break;

      const newRelation: RelationState = {
        id: `relation_${randomUUID().slice(0, 8)}`,
        from: fromEntity,
        to: toEntity,
        kind: effect.relationKind,
        weight: 1.0,
        attributes: {},
      };

      newState.relations.push(newRelation);
      break;
    }

    case "remove_relation": {
      const fromEntity = resolveParam(effect.fromEntity, params);
      const toEntity = resolveParam(effect.toEntity, params);
      if (!fromEntity || !toEntity) break;

      newState.relations = newState.relations.filter(r =>
        !(r.from === fromEntity &&
          r.to === toEntity &&
          (!effect.relationKind || r.kind === effect.relationKind))
      );
      break;
    }

    case "custom": {
      // TODO: Implement custom handlers
      break;
    }
  }

  return newState;
}

// ─── Transition Execution ───────────────────────────────────────

/**
 * Execute an action on a state.
 */
export async function executeTransition(
  fromStateId: string,
  actionInstance: ActionInstance,
): Promise<TransitionResult> {
  const startTime = Date.now();

  // Get action definition
  const action = await getAction(actionInstance.actionId);
  if (!action) {
    return {
      success: false,
      fromStateId,
      action: actionInstance,
      preconditionsMet: false,
      error: "Action not found",
      timestamp: Date.now(),
    };
  }

  // Get current state
  const fromState = await getState(fromStateId);
  if (!fromState) {
    return {
      success: false,
      fromStateId,
      action: actionInstance,
      preconditionsMet: false,
      error: "State not found",
      timestamp: Date.now(),
    };
  }

  // Check preconditions
  const { met, failed } = checkPreconditions(action, fromState, actionInstance.parameters);

  if (!met) {
    logger.warn("Action preconditions not met", {
      actionId: action.id,
      actionName: action.name,
      failedPreconditions: failed.length,
    });

    return {
      success: false,
      fromStateId,
      action: actionInstance,
      preconditionsMet: false,
      failedPreconditions: failed,
      timestamp: Date.now(),
    };
  }

  // Apply effects
  let currentState = fromState;
  const appliedEffects: Effect[] = [];

  for (const effect of action.effects) {
    currentState = applyEffect(effect, currentState, actionInstance.parameters);
    appliedEffects.push(effect);
  }

  // Capture new state
  const toState = await captureState(
    `After ${action.name}`,
    {
      fromStateId,
      actionId: action.id,
      actionName: action.name,
      parameters: actionInstance.parameters,
    },
  );

  const result: TransitionResult = {
    success: true,
    fromStateId,
    toStateId: toState.id,
    action: actionInstance,
    preconditionsMet: true,
    effectsApplied: appliedEffects,
    timestamp: Date.now(),
  };

  // Store transition in history
  await redis.lpush(TRANSITIONS_KEY, JSON.stringify(result));
  await redis.ltrim(TRANSITIONS_KEY, 0, 999); // Keep last 1000

  logger.info("Transition executed", {
    actionId: action.id,
    actionName: action.name,
    fromStateId,
    toStateId: toState.id,
    effectsApplied: appliedEffects.length,
    durationMs: Date.now() - startTime,
  });

  return result;
}

/**
 * Execute a sequence of actions.
 */
export async function executeActionSequence(
  fromStateId: string,
  actions: ActionInstance[],
): Promise<ActionSequence> {
  const sequence: ActionSequence = {
    id: `seq_${randomUUID().slice(0, 8)}`,
    actions,
    executedAt: Date.now(),
    results: [],
  };

  let currentStateId = fromStateId;

  for (const action of actions) {
    const result = await executeTransition(currentStateId, action);
    sequence.results.push(result);

    if (!result.success || !result.toStateId) {
      logger.warn("Action sequence failed", {
        sequenceId: sequence.id,
        failedAction: action.actionId,
        error: result.error,
      });
      break;
    }

    currentStateId = result.toStateId;
  }

  sequence.finalStateId = currentStateId;

  logger.info("Action sequence executed", {
    sequenceId: sequence.id,
    actionCount: actions.length,
    successfulActions: sequence.results.filter(r => r.success).length,
    finalStateId: sequence.finalStateId,
  });

  return sequence;
}

// ─── Action Discovery ───────────────────────────────────────────

/**
 * Find all actions that can be executed in a state.
 */
export async function findApplicableActions(
  stateId: string,
  params?: Record<string, any>,
): Promise<Array<{ action: Action; parameters: Record<string, any> }>> {
  const state = await getState(stateId);
  if (!state) return [];

  const allActions = await listActions();
  const applicable: Array<{ action: Action; parameters: Record<string, any> }> = [];

  for (const action of allActions) {
    // Try with provided params or empty params
    const testParams = params ?? {};
    const { met } = checkPreconditions(action, state, testParams);

    if (met) {
      applicable.push({ action, parameters: testParams });
    }
  }

  return applicable;
}

/**
 * Get transition history.
 */
export async function getTransitionHistory(
  limit = 50,
): Promise<TransitionResult[]> {
  const raw = await redis.lrange(TRANSITIONS_KEY, 0, limit - 1);
  return raw.map(r => JSON.parse(r));
}
