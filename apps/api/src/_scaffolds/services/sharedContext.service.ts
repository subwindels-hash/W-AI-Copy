/**
 * Shared Context Service (Module 5 — Gap 1)
 *
 * Provides shared memory and context for collaborating agents:
 * - Shared context pools that multiple agents can read/write
 * - Context versioning and conflict detection
 * - Context scoping (team, task, workflow, ad-hoc)
 * - Context expiration and cleanup
 * - Access control (read/write/admin permissions)
 *
 * Uses Redis hashes for fast context access and lists for version history.
 */
import { prisma } from "../../db/client.js";
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/result.js";
import { pushEvent } from "../../http/routes/events.js";
import { z } from "zod";
import { makeRng } from "../../utils/detRng.js";
// Deterministic demo RNG — stable within a running process.
const _rng = makeRng('services:sharedContext');
function rand(min: number, max: number) { return _rng.rand(min, max); }
function randInt(min: number, max: number) { return _rng.randInt(min, max); }


// ─── Types ──────────────────────────────────────────────────────

export type ContextScope = "team" | "task" | "workflow" | "adhoc";
export type ContextPermission = "read" | "write" | "admin";

export interface SharedContext {
  id: string;
  name: string;
  scope: ContextScope;
  scopeId: string; // team ID, task ID, workflow ID, or custom
  organizationId: string;
  data: Record<string, any>;
  version: number;
  createdBy: string; // agent ID or user ID
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  permissions: Record<string, ContextPermission[]>; // agentId -> permissions
}

export interface ContextEntry {
  key: string;
  value: any;
  setBy: string; // agent ID or user ID
  setAt: number;
  version: number;
}

export interface ContextHistory {
  contextId: string;
  entries: ContextEntry[];
  totalVersions: number;
}

// ─── Redis Keys ─────────────────────────────────────────────────

const CONTEXT_KEY = (id: string) => `sharedctx:${id}`;
const CONTEXT_DATA_KEY = (id: string) => `sharedctx:${id}:data`;
const CONTEXT_HISTORY_KEY = (id: string) => `sharedctx:${id}:history`;
const CONTEXT_INDEX_KEY = "sharedctx:index";
const CONTEXT_SCOPE_KEY = (scope: ContextScope, scopeId: string) => `sharedctx:scope:${scope}:${scopeId}`;
const CONTEXT_AGENT_KEY = (agentId: string) => `sharedctx:agent:${agentId}`;

// ─── Schemas ────────────────────────────────────────────────────

export const CreateContextSchema = z.object({
  name: z.string().min(1).max(200),
  scope: z.enum(["team", "task", "workflow", "adhoc"]),
  scopeId: z.string().min(1),
  initialData: z.record(z.any()).optional(),
  expiresInSeconds: z.number().int().min(60).max(2592000).optional(), // 1min to 30 days
  permissions: z.record(z.array(z.enum(["read", "write", "admin"]))).optional(),
});

export const UpdateContextSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.any(),
  expectedVersion: z.number().int().optional(), // For optimistic locking
});

export const BatchUpdateSchema = z.object({
  updates: z.array(z.object({
    key: z.string().min(1).max(200),
    value: z.any(),
  })).min(1).max(100),
  expectedVersion: z.number().int().optional(),
});

// ─── Context Management ─────────────────────────────────────────

/**
 * Create a new shared context.
 */
export async function createContext(
  organizationId: string,
  creatorId: string,
  input: z.infer<typeof CreateContextSchema>,
): Promise<SharedContext> {
  const id = `ctx_${Date.now()}_${_rng.next().toString(36).slice(2, 8)}`;
  const now = Date.now();

  const context: SharedContext = {
    id,
    name: input.name,
    scope: input.scope,
    scopeId: input.scopeId,
    organizationId,
    data: input.initialData ?? {},
    version: 1,
    createdBy: creatorId,
    createdAt: now,
    updatedAt: now,
    expiresAt: input.expiresInSeconds ? now + input.expiresInSeconds * 1000 : undefined,
    permissions: input.permissions ?? {},
  };

  // Store context metadata
  await redis.hset(CONTEXT_KEY(id), {
    id: context.id,
    name: context.name,
    scope: context.scope,
    scopeId: context.scopeId,
    organizationId: context.organizationId,
    version: String(context.version),
    createdBy: context.createdBy,
    createdAt: String(context.createdAt),
    updatedAt: String(context.updatedAt),
    expiresAt: context.expiresAt ? String(context.expiresAt) : "",
    permissions: JSON.stringify(context.permissions),
  });

  // Store context data
  if (Object.keys(context.data).length > 0) {
    const dataEntries: Record<string, string> = {};
    for (const [key, value] of Object.entries(context.data)) {
      dataEntries[key] = JSON.stringify({
        value,
        setBy: creatorId,
        setAt: now,
        version: 1,
      });
    }
    await redis.hset(CONTEXT_DATA_KEY(id), dataEntries);
  }

  // Add to indexes
  const pipeline = redis.multi();
  pipeline.sadd(CONTEXT_INDEX_KEY, id);
  pipeline.sadd(CONTEXT_SCOPE_KEY(input.scope, input.scopeId), id);
  pipeline.sadd(CONTEXT_AGENT_KEY(creatorId), id);
  
  // Set expiration if specified
  if (context.expiresAt) {
    const ttlSeconds = Math.ceil((context.expiresAt - now) / 1000);
    pipeline.expire(CONTEXT_KEY(id), ttlSeconds);
    pipeline.expire(CONTEXT_DATA_KEY(id), ttlSeconds);
    pipeline.expire(CONTEXT_HISTORY_KEY(id), ttlSeconds);
  }

  await pipeline.exec();

  logger.info("Shared context created", {
    contextId: id,
    name: input.name,
    scope: input.scope,
    scopeId: input.scopeId,
    createdBy: creatorId,
  });

  // Emit event
  pushEvent("context.created", {
    contextId: id,
    name: input.name,
    scope: input.scope,
    scopeId: input.scopeId,
    organizationId,
  });

  return context;
}

/**
 * Get a shared context by ID.
 */
export async function getContext(contextId: string): Promise<SharedContext | null> {
  const metadata = await redis.hgetall(CONTEXT_KEY(contextId));
  if (!metadata || Object.keys(metadata).length === 0) return null;

  const dataEntries = await redis.hgetall(CONTEXT_DATA_KEY(contextId));
  const data: Record<string, any> = {};
  for (const [key, entry] of Object.entries(dataEntries)) {
    try {
      const parsed = JSON.parse(entry);
      data[key] = parsed.value;
    } catch {
      data[key] = null;
    }
  }

  return {
    id: metadata.id,
    name: metadata.name,
    scope: metadata.scope as ContextScope,
    scopeId: metadata.scopeId,
    organizationId: metadata.organizationId,
    data,
    version: parseInt(metadata.version, 10),
    createdBy: metadata.createdBy,
    createdAt: parseInt(metadata.createdAt, 10),
    updatedAt: parseInt(metadata.updatedAt, 10),
    expiresAt: metadata.expiresAt ? parseInt(metadata.expiresAt, 10) : undefined,
    permissions: JSON.parse(metadata.permissions || "{}"),
  };
}

/**
 * List contexts by scope.
 */
export async function listContextsByScope(
  scope: ContextScope,
  scopeId: string,
): Promise<SharedContext[]> {
  const contextIds = await redis.smembers(CONTEXT_SCOPE_KEY(scope, scopeId));
  const contexts: SharedContext[] = [];

  for (const id of contextIds) {
    const ctx = await getContext(id);
    if (ctx) contexts.push(ctx);
  }

  return contexts.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * List contexts accessible by an agent.
 */
export async function listContextsByAgent(agentId: string): Promise<SharedContext[]> {
  const contextIds = await redis.smembers(CONTEXT_AGENT_KEY(agentId));
  const contexts: SharedContext[] = [];

  for (const id of contextIds) {
    const ctx = await getContext(id);
    if (ctx) contexts.push(ctx);
  }

  return contexts.sort((a, b) => b.updatedAt - a.updatedAt);
}

// ─── Context Updates ────────────────────────────────────────────

/**
 * Update a single key in the context.
 */
export async function updateContext(
  contextId: string,
  agentId: string,
  input: z.infer<typeof UpdateContextSchema>,
): Promise<ContextEntry> {
  const context = await getContext(contextId);
  if (!context) throw AppError.notFound("Context not found");

  // Check permissions
  await assertPermission(context, agentId, "write");

  // Optimistic locking
  if (input.expectedVersion !== undefined && input.expectedVersion !== context.version) {
    throw AppError.conflict(
      `Context version mismatch: expected ${input.expectedVersion}, got ${context.version}. ` +
      `Another agent may have updated the context. Please refresh and retry.`
    );
  }

  const now = Date.now();
  const newVersion = context.version + 1;

  // Update the key
  const entry: ContextEntry = {
    key: input.key,
    value: input.value,
    setBy: agentId,
    setAt: now,
    version: newVersion,
  };

  // Update data
  await redis.hset(CONTEXT_DATA_KEY(contextId), {
    [input.key]: JSON.stringify(entry),
  });

  // Update metadata
  await redis.hset(CONTEXT_KEY(contextId), {
    version: String(newVersion),
    updatedAt: String(now),
  });

  // Add to history
  await redis.lpush(CONTEXT_HISTORY_KEY(contextId), JSON.stringify(entry));
  await redis.ltrim(CONTEXT_HISTORY_KEY(contextId), 0, 999); // Keep last 1000 entries

  logger.debug("Context updated", {
    contextId,
    key: input.key,
    setBy: agentId,
    version: newVersion,
  });

  // Emit event
  pushEvent("context.updated", {
    contextId,
    key: input.key,
    setBy: agentId,
    version: newVersion,
    organizationId: context.organizationId,
  });

  return entry;
}

/**
 * Batch update multiple keys in the context (atomic).
 */
export async function batchUpdateContext(
  contextId: string,
  agentId: string,
  input: z.infer<typeof BatchUpdateSchema>,
): Promise<{ updated: number; version: number }> {
  const context = await getContext(contextId);
  if (!context) throw AppError.notFound("Context not found");

  // Check permissions
  await assertPermission(context, agentId, "write");

  // Optimistic locking
  if (input.expectedVersion !== undefined && input.expectedVersion !== context.version) {
    throw AppError.conflict(
      `Context version mismatch: expected ${input.expectedVersion}, got ${context.version}`
    );
  }

  const now = Date.now();
  const newVersion = context.version + 1;

  // Prepare all updates
  const updates: Record<string, string> = {};
  const historyEntries: string[] = [];

  for (const update of input.updates) {
    const entry: ContextEntry = {
      key: update.key,
      value: update.value,
      setBy: agentId,
      setAt: now,
      version: newVersion,
    };
    updates[update.key] = JSON.stringify(entry);
    historyEntries.push(JSON.stringify(entry));
  }

  // Atomic update
  const pipeline = redis.multi();
  pipeline.hset(CONTEXT_DATA_KEY(contextId), updates);
  pipeline.hset(CONTEXT_KEY(contextId), {
    version: String(newVersion),
    updatedAt: String(now),
  });
  for (const entry of historyEntries) {
    pipeline.lpush(CONTEXT_HISTORY_KEY(contextId), entry);
  }
  pipeline.ltrim(CONTEXT_HISTORY_KEY(contextId), 0, 999);

  await pipeline.exec();

  logger.debug("Context batch updated", {
    contextId,
    keys: input.updates.map(u => u.key),
    setBy: agentId,
    version: newVersion,
  });

  // Emit event
  pushEvent("context.batch_updated", {
    contextId,
    keys: input.updates.map(u => u.key),
    setBy: agentId,
    version: newVersion,
    organizationId: context.organizationId,
  });

  return { updated: input.updates.length, version: newVersion };
}

/**
 * Delete a key from the context.
 */
export async function deleteContextKey(
  contextId: string,
  agentId: string,
  key: string,
): Promise<boolean> {
  const context = await getContext(contextId);
  if (!context) throw AppError.notFound("Context not found");

  await assertPermission(context, agentId, "write");

  const deleted = await redis.hdel(CONTEXT_DATA_KEY(contextId), key);
  if (deleted > 0) {
    const newVersion = context.version + 1;
    await redis.hset(CONTEXT_KEY(contextId), {
      version: String(newVersion),
      updatedAt: String(Date.now()),
    });
  }

  return deleted > 0;
}

// ─── Context History ────────────────────────────────────────────

/**
 * Get context update history.
 */
export async function getContextHistory(
  contextId: string,
  limit = 100,
): Promise<ContextHistory> {
  const raw = await redis.lrange(CONTEXT_HISTORY_KEY(contextId), 0, limit - 1);
  const entries = raw.map(r => JSON.parse(r) as ContextEntry);

  return {
    contextId,
    entries,
    totalVersions: await redis.llen(CONTEXT_HISTORY_KEY(contextId)),
  };
}

// ─── Permissions ────────────────────────────────────────────────

/**
 * Check if an agent has permission to access a context.
 */
async function assertPermission(
  context: SharedContext,
  agentId: string,
  required: ContextPermission,
) {
  // Creator always has admin access
  if (context.createdBy === agentId) return;

  const agentPerms = context.permissions[agentId] ?? [];
  
  // Admin implies write, write implies read
  if (required === "read" && (agentPerms.includes("read") || agentPerms.includes("write") || agentPerms.includes("admin"))) {
    return;
  }
  if (required === "write" && (agentPerms.includes("write") || agentPerms.includes("admin"))) {
    return;
  }
  if (required === "admin" && agentPerms.includes("admin")) {
    return;
  }

  throw AppError.forbidden(`Agent ${agentId} does not have ${required} permission on context ${context.id}`);
}

/**
 * Grant permissions to an agent.
 */
export async function grantPermission(
  contextId: string,
  granterId: string,
  agentId: string,
  permissions: ContextPermission[],
) {
  const context = await getContext(contextId);
  if (!context) throw AppError.notFound("Context not found");

  await assertPermission(context, granterId, "admin");

  context.permissions[agentId] = permissions;
  await redis.hset(CONTEXT_KEY(contextId), {
    permissions: JSON.stringify(context.permissions),
  });

  // Add agent to context index
  await redis.sadd(CONTEXT_AGENT_KEY(agentId), contextId);

  logger.info("Context permission granted", {
    contextId,
    agentId,
    permissions,
    grantedBy: granterId,
  });
}

/**
 * Revoke permissions from an agent.
 */
export async function revokePermission(
  contextId: string,
  revokerId: string,
  agentId: string,
) {
  const context = await getContext(contextId);
  if (!context) throw AppError.notFound("Context not found");

  await assertPermission(context, revokerId, "admin");

  delete context.permissions[agentId];
  await redis.hset(CONTEXT_KEY(contextId), {
    permissions: JSON.stringify(context.permissions),
  });

  await redis.srem(CONTEXT_AGENT_KEY(agentId), contextId);

  logger.info("Context permission revoked", {
    contextId,
    agentId,
    revokedBy: revokerId,
  });
}

// ─── Context Cleanup ────────────────────────────────────────────

/**
 * Delete a shared context.
 */
export async function deleteContext(
  contextId: string,
  deleterId: string,
): Promise<boolean> {
  const context = await getContext(contextId);
  if (!context) return false;

  await assertPermission(context, deleterId, "admin");

  const pipeline = redis.multi();
  pipeline.del(CONTEXT_KEY(contextId));
  pipeline.del(CONTEXT_DATA_KEY(contextId));
  pipeline.del(CONTEXT_HISTORY_KEY(contextId));
  pipeline.srem(CONTEXT_INDEX_KEY, contextId);
  pipeline.srem(CONTEXT_SCOPE_KEY(context.scope, context.scopeId), contextId);
  
  // Remove from all agent indexes
  for (const agentId of Object.keys(context.permissions)) {
    pipeline.srem(CONTEXT_AGENT_KEY(agentId), contextId);
  }
  pipeline.srem(CONTEXT_AGENT_KEY(context.createdBy), contextId);

  await pipeline.exec();

  logger.info("Shared context deleted", {
    contextId,
    deletedBy: deleterId,
  });

  return true;
}

/**
 * Clean up expired contexts (run periodically).
 */
export async function cleanupExpiredContexts(): Promise<number> {
  const allContextIds = await redis.smembers(CONTEXT_INDEX_KEY);
  let cleaned = 0;
  const now = Date.now();

  for (const id of allContextIds) {
    const metadata = await redis.hgetall(CONTEXT_KEY(id));
    if (!metadata || Object.keys(metadata).length === 0) {
      // Context metadata missing, clean up indexes
      await redis.srem(CONTEXT_INDEX_KEY, id);
      cleaned++;
      continue;
    }

    const expiresAt = metadata.expiresAt ? parseInt(metadata.expiresAt, 10) : null;
    if (expiresAt && expiresAt < now) {
      // Context expired, delete it
      const pipeline = redis.multi();
      pipeline.del(CONTEXT_KEY(id));
      pipeline.del(CONTEXT_DATA_KEY(id));
      pipeline.del(CONTEXT_HISTORY_KEY(id));
      pipeline.srem(CONTEXT_INDEX_KEY, id);
      pipeline.srem(CONTEXT_SCOPE_KEY(metadata.scope, metadata.scopeId), id);
      await pipeline.exec();
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info("Expired contexts cleaned up", { count: cleaned });
  }

  return cleaned;
}
