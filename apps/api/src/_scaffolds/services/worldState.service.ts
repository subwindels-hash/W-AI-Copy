/**
 * World State Service (Module 9 — Gap 1)
 *
 * Represent and track the state of the world over time:
 * - State snapshots: capture world state at a point in time
 * - State properties: define what can change (entity attributes, relation existence)
 * - State history: track how state changes over time
 * - State queries: query current state, historical state, state differences
 *
 * Uses the knowledge graph (Module 7) as the underlying state representation.
 * State is a snapshot of entities, relationships, and their attributes at a time.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { KnowledgeGraphService } from "../../enterprise/knowledgeGraph/knowledgeGraph.service.js";
import type { KGEntity, KGRelation } from "@windels/shared/dataPlatform";

// ─── Types ──────────────────────────────────────────────────────

export interface WorldState {
  id: string;
  timestamp: number;
  label?: string;
  entities: EntityState[];
  relations: RelationState[];
  metadata: Record<string, any>;
}

export interface EntityState {
  id: string;
  kind: string;
  name: string;
  attributes: Record<string, any>;
  tags: string[];
}

export interface RelationState {
  id: string;
  from: string; // Entity ID
  to: string; // Entity ID
  kind: string;
  weight: number;
  attributes: Record<string, any>;
}

export interface StateDiff {
  fromStateId: string;
  toStateId: string;
  addedEntities: EntityState[];
  removedEntities: EntityState[];
  modifiedEntities: Array<{
    id: string;
    changes: Record<string, { from: any; to: any }>;
  }>;
  addedRelations: RelationState[];
  removedRelations: RelationState[];
}

// ─── Redis Keys ─────────────────────────────────────────────────

const STATES_KEY = "world:states";
const STATE_KEY = (id: string) => `world:state:${id}`;
const LATEST_STATE_KEY = "world:state:latest";
const STATE_HISTORY_KEY = "world:state:history";

// ─── State Capture ──────────────────────────────────────────────

/**
 * Capture the current world state as a snapshot.
 */
export async function captureState(
  label?: string,
  metadata?: Record<string, any>,
): Promise<WorldState> {
  const startTime = Date.now();

  // Get all entities and relations from knowledge graph
  const allEntities = KnowledgeGraphService.query({});
  const allRelations = KnowledgeGraphService.listRelations();

  // Convert to state representation
  const entities: EntityState[] = allEntities.map(e => ({
    id: e.id,
    kind: e.kind,
    name: e.name,
    attributes: e.attributes as Record<string, any>,
    tags: e.tags,
  }));

  const relations: RelationState[] = allRelations.map(r => ({
    id: r.id,
    from: r.from,
    to: r.to,
    kind: r.kind,
    weight: r.weight,
    attributes: r.attributes as Record<string, any>,
  }));

  const state: WorldState = {
    id: `state_${randomUUID().slice(0, 8)}`,
    timestamp: Date.now(),
    label,
    entities,
    relations,
    metadata: metadata ?? {},
  };

  // Store state
  await redis.hset(STATE_KEY(state.id), {
    id: state.id,
    timestamp: String(state.timestamp),
    label: state.label ?? "",
    entities: JSON.stringify(state.entities),
    relations: JSON.stringify(state.relations),
    metadata: JSON.stringify(state.metadata),
  });

  // Add to states index
  await redis.zadd(STATES_KEY, state.timestamp, state.id);

  // Update latest state pointer
  await redis.set(LATEST_STATE_KEY, state.id);

  // Add to history
  await redis.lpush(STATE_HISTORY_KEY, JSON.stringify({
    stateId: state.id,
    timestamp: state.timestamp,
    label: state.label,
    entityCount: state.entities.length,
    relationCount: state.relations.length,
  }));
  await redis.ltrim(STATE_HISTORY_KEY, 0, 999); // Keep last 1000

  const durationMs = Date.now() - startTime;
  logger.info("World state captured", {
    stateId: state.id,
    entityCount: state.entities.length,
    relationCount: state.relations.length,
    durationMs,
  });

  return state;
}

/**
 * Get a state by ID.
 */
export async function getState(stateId: string): Promise<WorldState | null> {
  const data = await redis.hgetall(STATE_KEY(stateId));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    id: data.id,
    timestamp: parseInt(data.timestamp, 10),
    label: data.label || undefined,
    entities: JSON.parse(data.entities || "[]"),
    relations: JSON.parse(data.relations || "[]"),
    metadata: JSON.parse(data.metadata || "{}"),
  };
}

/**
 * Get the latest state.
 */
export async function getLatestState(): Promise<WorldState | null> {
  const latestId = await redis.get(LATEST_STATE_KEY);
  if (!latestId) return null;
  return getState(latestId);
}

/**
 * Get state at or before a specific timestamp.
 */
export async function getStateAt(timestamp: number): Promise<WorldState | null> {
  // Find the most recent state at or before the timestamp:
  // ZREVRANGEBYSCORE key max min LIMIT 0 1 (scores are state timestamps).
  const stateIds = await redis.zrevrangebyscore(STATES_KEY, timestamp, "-inf", "LIMIT", 0, 1);
  
  if (stateIds.length === 0) return null;
  
  return getState(stateIds[0]);
}

/**
 * List recent states.
 */
export async function listStates(
  limit = 50,
): Promise<Array<{ id: string; timestamp: number; label?: string; entityCount: number; relationCount: number }>> {
  const raw = await redis.lrange(STATE_HISTORY_KEY, 0, limit - 1);
  return raw.map(r => JSON.parse(r));
}

// ─── State Comparison ───────────────────────────────────────────

/**
 * Compute the difference between two states.
 */
export async function diffStates(
  fromStateId: string,
  toStateId: string,
): Promise<StateDiff> {
  const fromState = await getState(fromStateId);
  const toState = await getState(toStateId);

  if (!fromState || !toState) {
    throw new Error("One or both states not found");
  }

  // Build maps for fast lookup
  const fromEntityMap = new Map(fromState.entities.map(e => [e.id, e]));
  const toEntityMap = new Map(toState.entities.map(e => [e.id, e]));
  const fromRelationMap = new Map(fromState.relations.map(r => [r.id, r]));
  const toRelationMap = new Map(toState.relations.map(r => [r.id, r]));

  // Find added/removed entities
  const addedEntities = toState.entities.filter(e => !fromEntityMap.has(e.id));
  const removedEntities = fromState.entities.filter(e => !toEntityMap.has(e.id));

  // Find modified entities
  const modifiedEntities: StateDiff["modifiedEntities"] = [];
  for (const [id, toEntity] of toEntityMap.entries()) {
    const fromEntity = fromEntityMap.get(id);
    if (!fromEntity) continue;

    const changes: Record<string, { from: any; to: any }> = {};

    // Compare attributes
    const allKeys = new Set([
      ...Object.keys(fromEntity.attributes),
      ...Object.keys(toEntity.attributes),
    ]);

    for (const key of allKeys) {
      const fromVal = fromEntity.attributes[key];
      const toVal = toEntity.attributes[key];
      
      if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
        changes[key] = { from: fromVal, to: toVal };
      }
    }

    if (Object.keys(changes).length > 0) {
      modifiedEntities.push({ id, changes });
    }
  }

  // Find added/removed relations
  const addedRelations = toState.relations.filter(r => !fromRelationMap.has(r.id));
  const removedRelations = fromState.relations.filter(r => !toRelationMap.has(r.id));

  const diff: StateDiff = {
    fromStateId,
    toStateId,
    addedEntities,
    removedEntities,
    modifiedEntities,
    addedRelations,
    removedRelations,
  };

  logger.info("State diff computed", {
    fromStateId,
    toStateId,
    addedEntities: addedEntities.length,
    removedEntities: removedEntities.length,
    modifiedEntities: modifiedEntities.length,
    addedRelations: addedRelations.length,
    removedRelations: removedRelations.length,
  });

  return diff;
}

// ─── State Queries ──────────────────────────────────────────────

/**
 * Query entities in a state.
 */
export function queryStateEntities(
  state: WorldState,
  filter?: {
    kind?: string;
    name?: string;
    tags?: string[];
    attributeFilter?: Record<string, any>;
  },
): EntityState[] {
  let entities = state.entities;

  if (filter?.kind) {
    entities = entities.filter(e => e.kind === filter.kind);
  }

  if (filter?.name) {
    entities = entities.filter(e => e.name.toLowerCase().includes(filter.name!.toLowerCase()));
  }

  if (filter?.tags?.length) {
    entities = entities.filter(e => 
      filter.tags!.every(tag => e.tags.includes(tag))
    );
  }

  if (filter?.attributeFilter) {
    entities = entities.filter(e => {
      for (const [key, value] of Object.entries(filter.attributeFilter!)) {
        if (e.attributes[key] !== value) return false;
      }
      return true;
    });
  }

  return entities;
}

/**
 * Query relations in a state.
 */
export function queryStateRelations(
  state: WorldState,
  filter?: {
    kind?: string;
    from?: string;
    to?: string;
    attributeFilter?: Record<string, any>;
  },
): RelationState[] {
  let relations = state.relations;

  if (filter?.kind) {
    relations = relations.filter(r => r.kind === filter.kind);
  }

  if (filter?.from) {
    relations = relations.filter(r => r.from === filter.from);
  }

  if (filter?.to) {
    relations = relations.filter(r => r.to === filter.to);
  }

  if (filter?.attributeFilter) {
    relations = relations.filter(r => {
      for (const [key, value] of Object.entries(filter.attributeFilter!)) {
        if (r.attributes[key] !== value) return false;
      }
      return true;
    });
  }

  return relations;
}

/**
 * Get entity by ID from a state.
 */
export function getStateEntity(state: WorldState, entityId: string): EntityState | undefined {
  return state.entities.find(e => e.id === entityId);
}

/**
 * Get relation by ID from a state.
 */
export function getStateRelation(state: WorldState, relationId: string): RelationState | undefined {
  return state.relations.find(r => r.id === relationId);
}

// ─── State Analytics ────────────────────────────────────────────

/**
 * Get state statistics.
 */
export async function getStateStats(): Promise<{
  totalStates: number;
  latestState?: { id: string; timestamp: number; entityCount: number; relationCount: number };
  avgEntityCount: number;
  avgRelationCount: number;
}> {
  const history = await listStates(100);
  
  if (history.length === 0) {
    return {
      totalStates: 0,
      avgEntityCount: 0,
      avgRelationCount: 0,
    };
  }

  const totalEntities = history.reduce((sum, h) => sum + h.entityCount, 0);
  const totalRelations = history.reduce((sum, h) => sum + h.relationCount, 0);

  return {
    totalStates: history.length,
    latestState: history[0],
    avgEntityCount: Math.round(totalEntities / history.length),
    avgRelationCount: Math.round(totalRelations / history.length),
  };
}

/**
 * Delete old states (keep last N).
 */
export async function cleanupOldStates(keepLast = 100): Promise<number> {
  const allStateIds = await redis.zrange(STATES_KEY, 0, -1);
  
  if (allStateIds.length <= keepLast) {
    return 0;
  }

  const toDelete = allStateIds.slice(0, allStateIds.length - keepLast);
  
  for (const stateId of toDelete) {
    await redis.del(STATE_KEY(stateId));
    await redis.zrem(STATES_KEY, stateId);
  }

  logger.info("Old states cleaned up", { deleted: toDelete.length, kept: keepLast });

  return toDelete.length;
}
