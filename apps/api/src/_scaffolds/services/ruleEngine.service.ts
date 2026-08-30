/**
 * Rule Engine Service (Module 8 — Gap 2)
 *
 * Define and apply rules over the knowledge graph:
 * - Rule definition: if condition then action
 * - Forward chaining: data-driven rule application
 * - Backward chaining: goal-driven rule application
 * - Rule prioritization and conflict resolution
 * - Rule activation tracking
 *
 * Rules are stored in Redis and applied to the knowledge graph.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { KnowledgeGraphService } from "../../enterprise/knowledgeGraph/knowledgeGraph.service.js";
import type { KGEntity, KGRelation, RelationKind } from "@windels/shared/dataPlatform";

// ─── Custom action handler registry ─────────────────────────────
//
// A `custom` rule action references a named handler. The old stub returned
// `{ custom: true }` for any custom action without doing anything (a false
// success). Named handlers are now registered and looked up; an unknown handler
// FAILS CLOSED by throwing, so a rule can never report a phantom custom action.

export type CustomRuleActionHandler = (
  action: RuleAction,
  bindings: Map<string, string>,
) => Promise<unknown> | unknown;

const customRuleActionHandlers = new Map<string, CustomRuleActionHandler>();

/** Register a named custom rule-action handler. */
export function registerCustomRuleAction(name: string, fn: CustomRuleActionHandler): void {
  customRuleActionHandlers.set(name, fn);
}

/** Test-only / lifecycle helper to clear the registry. */
export function clearCustomRuleActions(): void {
  customRuleActionHandlers.clear();
}

// ─── Types ──────────────────────────────────────────────────────

export interface Rule {
  id: string;
  name: string;
  description: string;
  condition: RuleCondition;
  action: RuleAction;
  priority: number; // Higher = applied first
  enabled: boolean;
  createdAt: number;
  lastAppliedAt?: number;
  applicationCount: number;
}

export interface RuleCondition {
  type: "pattern" | "attribute" | "relation" | "and" | "or" | "not";
  // Pattern: match subgraph
  pattern?: Array<[string, RelationKind | "*", string]>;
  // Attribute: entity has attribute
  entityId?: string;
  attributeName?: string;
  attributeValue?: any;
  // Relation: entity has relation
  fromEntity?: string;
  toEntity?: string;
  relationKind?: RelationKind;
  // Logical operators
  conditions?: RuleCondition[];
}

export interface RuleAction {
  type: "add_relation" | "add_entity" | "update_attribute" | "log" | "custom";
  // Add relation
  from?: string; // Entity ID or variable
  to?: string; // Entity ID or variable
  relationKind?: RelationKind;
  // Add entity
  entityName?: string;
  entityKind?: string;
  // Update attribute (entityId may be a binding variable or a literal id)
  entityId?: string;
  attributeName?: string;
  attributeValue?: any;
  // Log
  message?: string;
  // Custom
  handler?: string; // Function name
}

export interface RuleActivation {
  ruleId: string;
  ruleName: string;
  bindings: Map<string, string>; // Variable -> entity ID
  timestamp: number;
  applied: boolean;
  result?: any;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const RULES_KEY = "rules:all";
const RULE_KEY = (id: string) => `rules:rule:${id}`;
const ACTIVATIONS_KEY = "rules:activations";

// ─── Rule Management ────────────────────────────────────────────

/**
 * Create a new rule.
 */
export async function createRule(input: {
  name: string;
  description: string;
  condition: RuleCondition;
  action: RuleAction;
  priority?: number;
}): Promise<Rule> {
  const rule: Rule = {
    id: `rule_${randomUUID().slice(0, 8)}`,
    name: input.name,
    description: input.description,
    condition: input.condition,
    action: input.action,
    priority: input.priority ?? 50,
    enabled: true,
    createdAt: Date.now(),
    applicationCount: 0,
  };

  await redis.hset(RULE_KEY(rule.id), {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    condition: JSON.stringify(rule.condition),
    action: JSON.stringify(rule.action),
    priority: String(rule.priority),
    enabled: String(rule.enabled),
    createdAt: String(rule.createdAt),
    applicationCount: String(rule.applicationCount),
  });

  await redis.sadd(RULES_KEY, rule.id);

  logger.info("Rule created", { ruleId: rule.id, name: rule.name });

  return rule;
}

/**
 * Get a rule by ID.
 */
export async function getRule(ruleId: string): Promise<Rule | null> {
  const data = await redis.hgetall(RULE_KEY(ruleId));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    condition: JSON.parse(data.condition),
    action: JSON.parse(data.action),
    priority: parseInt(data.priority, 10),
    enabled: data.enabled === "true",
    createdAt: parseInt(data.createdAt, 10),
    lastAppliedAt: data.lastAppliedAt ? parseInt(data.lastAppliedAt, 10) : undefined,
    applicationCount: parseInt(data.applicationCount, 10),
  };
}

/**
 * List all rules.
 */
export async function listRules(): Promise<Rule[]> {
  const ruleIds = await redis.smembers(RULES_KEY);
  const rules: Rule[] = [];

  for (const id of ruleIds) {
    const rule = await getRule(id);
    if (rule) rules.push(rule);
  }

  return rules.sort((a, b) => b.priority - a.priority);
}

/**
 * Update a rule.
 */
export async function updateRule(
  ruleId: string,
  updates: Partial<Pick<Rule, "name" | "description" | "condition" | "action" | "priority" | "enabled">>,
): Promise<Rule | null> {
  const rule = await getRule(ruleId);
  if (!rule) return null;

  const updated = { ...rule, ...updates };

  await redis.hset(RULE_KEY(ruleId), {
    name: updated.name,
    description: updated.description,
    condition: JSON.stringify(updated.condition),
    action: JSON.stringify(updated.action),
    priority: String(updated.priority),
    enabled: String(updated.enabled),
  });

  logger.info("Rule updated", { ruleId, name: updated.name });

  return updated;
}

/**
 * Delete a rule.
 */
export async function deleteRule(ruleId: string): Promise<boolean> {
  const exists = await redis.exists(RULE_KEY(ruleId));
  if (!exists) return false;

  await redis.del(RULE_KEY(ruleId));
  await redis.srem(RULES_KEY, ruleId);

  logger.info("Rule deleted", { ruleId });

  return true;
}

// ─── Condition Evaluation ───────────────────────────────────────

/**
 * Evaluate a rule condition against the knowledge graph.
 * Returns bindings (variable -> entity ID) if condition matches.
 */
async function evaluateCondition(
  condition: RuleCondition,
  bindings: Map<string, string> = new Map(),
): Promise<Map<string, string>[]> {
  switch (condition.type) {
    case "pattern": {
      if (!condition.pattern) return [];
      
      const { matchPattern } = await import("./inferenceEngine.service.js");
      const matches = await matchPattern(condition.pattern);
      
      return matches.map(match => {
        const newBindings = new Map(bindings);
        for (const [varName, entity] of match.entities.entries()) {
          newBindings.set(varName, entity.id);
        }
        return newBindings;
      });
    }

    case "attribute": {
      if (!condition.entityId || !condition.attributeName) return [];
      
      const entityId = bindings.get(condition.entityId) ?? condition.entityId;
      const entity = KnowledgeGraphService.get(entityId);
      
      if (!entity) return [];
      
      const attrs = entity.attributes as Record<string, any>;
      const value = attrs[condition.attributeName];
      
      if (condition.attributeValue !== undefined && value !== condition.attributeValue) {
        return [];
      }
      
      return [bindings];
    }

    case "relation": {
      const allRelations = KnowledgeGraphService.listRelations();
      const matches: Map<string, string>[] = [];
      
      for (const rel of allRelations) {
        let match = true;
        const newBindings = new Map(bindings);
        
        if (condition.fromEntity) {
          const fromId = bindings.get(condition.fromEntity) ?? condition.fromEntity;
          if (rel.from !== fromId) match = false;
        }
        
        if (condition.toEntity) {
          const toId = bindings.get(condition.toEntity) ?? condition.toEntity;
          if (rel.to !== toId) match = false;
        }
        
        if (condition.relationKind && rel.kind !== condition.relationKind) {
          match = false;
        }
        
        if (match) {
          if (condition.fromEntity?.startsWith("?")) {
            newBindings.set(condition.fromEntity, rel.from);
          }
          if (condition.toEntity?.startsWith("?")) {
            newBindings.set(condition.toEntity, rel.to);
          }
          matches.push(newBindings);
        }
      }
      
      return matches;
    }

    case "and": {
      if (!condition.conditions || condition.conditions.length === 0) return [bindings];
      
      let currentBindings = [bindings];
      
      for (const subCondition of condition.conditions) {
        const nextBindings: Map<string, string>[] = [];
        
        for (const binding of currentBindings) {
          const results = await evaluateCondition(subCondition, binding);
          nextBindings.push(...results);
        }
        
        currentBindings = nextBindings;
        if (currentBindings.length === 0) break;
      }
      
      return currentBindings;
    }

    case "or": {
      if (!condition.conditions || condition.conditions.length === 0) return [];
      
      const allBindings: Map<string, string>[] = [];
      
      for (const subCondition of condition.conditions) {
        const results = await evaluateCondition(subCondition, bindings);
        allBindings.push(...results);
      }
      
      return allBindings;
    }

    case "not": {
      if (!condition.conditions || condition.conditions.length === 0) return [bindings];
      
      for (const subCondition of condition.conditions) {
        const results = await evaluateCondition(subCondition, bindings);
        if (results.length > 0) return []; // If any sub-condition matches, NOT fails
      }
      
      return [bindings];
    }

    default:
      return [];
  }
}

// ─── Action Execution ───────────────────────────────────────────

/**
 * Execute a rule action with the given bindings.
 */
async function executeAction(
  action: RuleAction,
  bindings: Map<string, string>,
): Promise<any> {
  switch (action.type) {
    case "add_relation": {
      if (!action.from || !action.to || !action.relationKind) {
        throw new Error("add_relation requires from, to, and relationKind");
      }
      
      const fromId = bindings.get(action.from) ?? action.from;
      const toId = bindings.get(action.to) ?? action.to;
      
      const relation = await KnowledgeGraphService.addRelation({
        from: fromId,
        to: toId,
        kind: action.relationKind,
        attributes: {
          createdByRule: true,
        },
        provenance: {
          source: "rule-engine",
        },
      });
      
      return { relationId: relation?.id };
    }

    case "add_entity": {
      if (!action.entityName || !action.entityKind) {
        throw new Error("add_entity requires entityName and entityKind");
      }
      
      const entity = await KnowledgeGraphService.upsertEntity({
        kind: action.entityKind as any,
        name: action.entityName,
        attributes: {
          createdByRule: true,
        },
        provenance: {
          source: "rule-engine",
        },
      });
      
      return { entityId: entity.id };
    }

    case "update_attribute": {
      if (!action.entityId) {
        throw new Error("update_attribute requires entityId");
      }
      if (!action.attributeName) {
        throw new Error("update_attribute requires attributeName");
      }

      // Resolve the entity id from a binding variable when applicable, then set
      // the single attribute via upsert (which merges attributes for an
      // existing entity). Report honestly when the target does not exist rather
      // than claiming a phantom update.
      const entityId = bindings.get(action.entityId) ?? action.entityId;
      const existing = KnowledgeGraphService.get(entityId);
      if (!existing) {
        return { updated: false, reason: "entity_not_found", entityId };
      }

      await KnowledgeGraphService.upsertEntity({
        id: entityId,
        kind: existing.kind,
        name: existing.name,
        attributes: { [action.attributeName]: action.attributeValue ?? null, updatedByRule: true },
        provenance: { source: "rule-engine" },
      });

      return { updated: true, entityId, attributeName: action.attributeName };
    }

    case "log": {
      if (action.message) {
        logger.info("Rule action: log", { message: action.message, bindings: Object.fromEntries(bindings) });
      }
      return { logged: true };
    }

    case "custom": {
      // Fail closed: a custom action with no registered handler must not report
      // a phantom success. `action.handler` names the registered function.
      if (!action.handler) {
        throw new Error("custom action requires a handler name");
      }
      const fn = customRuleActionHandlers.get(action.handler);
      if (!fn) {
        throw new Error(`Unknown custom rule-action handler: ${action.handler}`);
      }
      return { custom: true, handler: action.handler, result: await fn(action, bindings) };
    }

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// ─── Forward Chaining ───────────────────────────────────────────

/**
 * Apply all enabled rules using forward chaining (data-driven).
 * Continues until no more rules fire or max iterations reached.
 */
export async function forwardChain(
  maxIterations = 10,
): Promise<{ activations: RuleActivation[]; iterations: number }> {
  const startTime = Date.now();
  const allActivations: RuleActivation[] = [];
  let iterations = 0;

  const rules = await listRules();
  const enabledRules = rules.filter(r => r.enabled);

  for (let i = 0; i < maxIterations; i++) {
    iterations++;
    let firedInIteration = 0;

    for (const rule of enabledRules) {
      try {
        // Evaluate condition
        const bindingSets = await evaluateCondition(rule.condition);

        for (const bindings of bindingSets) {
          // Execute action
          const result = await executeAction(rule.action, bindings);

          // Record activation
          const activation: RuleActivation = {
            ruleId: rule.id,
            ruleName: rule.name,
            bindings,
            timestamp: Date.now(),
            applied: true,
            result,
          };

          allActivations.push(activation);
          firedInIteration++;

          // Update rule stats
          await redis.hset(RULE_KEY(rule.id), {
            lastAppliedAt: String(Date.now()),
            applicationCount: String(rule.applicationCount + 1),
          });

          // Store activation
          await redis.lpush(
            ACTIVATIONS_KEY,
            JSON.stringify({
              ...activation,
              bindings: Object.fromEntries(activation.bindings),
            }),
          );
          await redis.ltrim(ACTIVATIONS_KEY, 0, 999); // Keep last 1000
        }
      } catch (e) {
        logger.warn("Rule application failed", { ruleId: rule.id, error: e });
      }
    }

    logger.debug("Forward chaining iteration", {
      iteration: i + 1,
      fired: firedInIteration,
    });

    // If no rules fired, we're done
    if (firedInIteration === 0) break;
  }

  logger.info("Forward chaining complete", {
    iterations,
    totalActivations: allActivations.length,
    durationMs: Date.now() - startTime,
  });

  return { activations: allActivations, iterations };
}

// ─── Backward Chaining ──────────────────────────────────────────

/**
 * Apply rules using backward chaining (goal-driven).
 * Tries to prove a goal by finding rules that could achieve it.
 */
export async function backwardChain(
  goal: RuleCondition,
  maxDepth = 5,
): Promise<{ proven: boolean; activations: RuleActivation[] }> {
  const activations: RuleActivation[] = [];

  async function prove(
    condition: RuleCondition,
    depth: number,
  ): Promise<boolean> {
    if (depth > maxDepth) return false;

    // Try to match condition directly
    const bindings = await evaluateCondition(condition);
    if (bindings.length > 0) return true;

    // Find rules that could achieve this condition
    const rules = await listRules();
    
    for (const rule of rules.filter(r => r.enabled)) {
      // Check if rule action could satisfy the condition
      // (simplified: just check if action type matches)
      if (rule.action.type === "add_relation" && condition.type === "relation") {
        // Try to apply rule
        const ruleBindings = await evaluateCondition(rule.condition);
        
        for (const binding of ruleBindings) {
          try {
            const result = await executeAction(rule.action, binding);
            
            activations.push({
              ruleId: rule.id,
              ruleName: rule.name,
              bindings: binding,
              timestamp: Date.now(),
              applied: true,
              result,
            });
            
            // Try to prove goal again
            const proven = await prove(condition, depth + 1);
            if (proven) return true;
          } catch (e) {
            logger.warn("Backward chaining: rule failed", { ruleId: rule.id, error: e });
          }
        }
      }
    }

    return false;
  }

  const proven = await prove(goal, 0);

  logger.info("Backward chaining complete", {
    proven,
    activations: activations.length,
  });

  return { proven, activations };
}

// ─── Rule Analytics ─────────────────────────────────────────────

/**
 * Get recent rule activations.
 */
export async function getRecentActivations(
  limit = 50,
): Promise<RuleActivation[]> {
  const raw = await redis.lrange(ACTIVATIONS_KEY, 0, limit - 1);
  return raw.map(r => {
    const parsed = JSON.parse(r);
    return {
      ...parsed,
      bindings: new Map(Object.entries(parsed.bindings)),
    };
  });
}

/**
 * Get rule statistics.
 */
export async function getRuleStats(): Promise<{
  totalRules: number;
  enabledRules: number;
  totalActivations: number;
  mostActiveRule?: { id: string; name: string; count: number };
}> {
  const rules = await listRules();
  const enabledRules = rules.filter(r => r.enabled);
  const totalActivations = rules.reduce((sum, r) => sum + r.applicationCount, 0);
  
  const mostActive = rules.reduce(
    (max, r) => (r.applicationCount > (max?.applicationCount ?? 0) ? r : max),
    null as Rule | null,
  );

  return {
    totalRules: rules.length,
    enabledRules: enabledRules.length,
    totalActivations,
    mostActiveRule: mostActive
      ? { id: mostActive.id, name: mostActive.name, count: mostActive.applicationCount }
      : undefined,
  };
}
