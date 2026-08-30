/**
 * Memory-to-Graph Pipeline (Module 7 — Gap 7)
 *
 * Automatic knowledge graph construction from AgentMemory:
 * - Pipeline to extract entities and relationships from memories
 * - Incremental processing (only process new/updated memories)
 * - Batch processing for efficiency
 * - Deduplication and conflict resolution
 * - Graph enrichment (link memories to entities)
 * - Periodic synchronization jobs
 *
 * Integrates Entity Extraction and Relationship Extraction services
 * to automatically populate the knowledge graph from agent memories.
 */
import { prisma } from "../../db/client.js";
import { redisCmd as redis } from "../../db/redis.js";
import { logger } from "../../config/logger.js";
import { KnowledgeGraphService } from "../../enterprise/knowledgeGraph/knowledgeGraph.service.js";
import { extractEntities } from "./entityExtraction.service.js";
import { extractAndAddRelationships, extractKnowledgeFromText } from "./relationshipExtraction.service.js";
import { z } from "zod";

// ─── Types ──────────────────────────────────────────────────────

export interface PipelineStats {
  memoriesProcessed: number;
  entitiesExtracted: number;
  entitiesAdded: number;
  relationshipsExtracted: number;
  relationshipsAdded: number;
  errors: number;
  durationMs: number;
}

export interface ProcessingOptions {
  agentId?: string;
  organizationId?: string;
  since?: Date; // Only process memories created/updated after this date
  minImportance?: number; // Minimum importance threshold
  limit?: number; // Max memories to process
  batchSize?: number; // Process in batches of this size
  dryRun?: boolean; // Preview without executing
}

// ─── Redis Keys ─────────────────────────────────────────────────

const PIPELINE_STATE_KEY = "mem2graph:state";
const PIPELINE_HISTORY_KEY = "mem2graph:history";
const MEMORY_PROCESSED_KEY = (memoryId: string) => `mem2graph:processed:${memoryId}`;

// ─── Pipeline State Management ──────────────────────────────────

/**
 * Get the last processed timestamp for incremental processing.
 */
async function getLastProcessedTime(): Promise<Date | null> {
  const state = await redis.hgetall(PIPELINE_STATE_KEY);
  if (!state || !state.lastProcessedAt) return null;
  return new Date(parseInt(state.lastProcessedAt, 10));
}

/**
 * Update the last processed timestamp.
 */
async function updateLastProcessedTime(timestamp: Date) {
  await redis.hset(PIPELINE_STATE_KEY, {
    lastProcessedAt: String(timestamp.getTime()),
    lastRunAt: String(Date.now()),
  });
}

/**
 * Check if a memory has already been processed.
 */
async function isMemoryProcessed(memoryId: string): Promise<boolean> {
  const processed = await redis.get(MEMORY_PROCESSED_KEY(memoryId));
  return processed === "1";
}

/**
 * Mark a memory as processed.
 */
async function markMemoryProcessed(memoryId: string) {
  await redis.set(MEMORY_PROCESSED_KEY(memoryId), "1", "EX", 86400 * 30); // 30 days
}

// ─── Core Pipeline ──────────────────────────────────────────────

/**
 * Process a single memory: extract entities and relationships, add to graph.
 */
export async function processMemory(
  memoryId: string,
  options?: { force?: boolean },
): Promise<{
  entitiesAdded: number;
  relationshipsAdded: number;
  skipped: boolean;
}> {
  // Check if already processed
  if (!options?.force && await isMemoryProcessed(memoryId)) {
    return { entitiesAdded: 0, relationshipsAdded: 0, skipped: true };
  }

  const memory = await prisma.agentMemory.findUnique({
    where: { id: memoryId },
  });

  if (!memory) {
    throw new Error(`Memory not found: ${memoryId}`);
  }

  // Extract knowledge (entities + relationships)
  const result = await extractKnowledgeFromText(memory.content, {
    sourceId: memoryId,
    sourceType: "memory",
  });

  // Link memory to extracted entities in metadata
  if (result.entities.length > 0) {
    const entityNames = result.entities.map(e => e.name);
    await prisma.agentMemory.update({
      where: { id: memoryId },
      data: {
        metadata: {
          ...(memory.metadata as any),
          extractedEntities: entityNames,
          extractedAt: Date.now(),
        },
      },
    });
  }

  // Mark as processed
  await markMemoryProcessed(memoryId);

  logger.debug("Memory processed", {
    memoryId,
    entitiesAdded: result.entitiesAdded,
    relationshipsAdded: result.relationshipsAdded,
  });

  return {
    entitiesAdded: result.entitiesAdded,
    relationshipsAdded: result.relationshipsAdded,
    skipped: false,
  };
}

/**
 * Run the memory-to-graph pipeline for an agent.
 */
export async function runPipelineForAgent(
  agentId: string,
  options?: Omit<ProcessingOptions, "agentId">,
): Promise<PipelineStats> {
  const startTime = Date.now();
  const {
    since,
    minImportance = 0.5,
    limit = 100,
    batchSize = 10,
    dryRun = false,
  } = options ?? {};

  // Build query for memories to process
  const where: any = {
    agentId,
    importance: { gte: minImportance },
  };

  if (since) {
    where.OR = [
      { createdAt: { gte: since } },
      { updatedAt: { gte: since } },
    ];
  }

  const memories = await prisma.agentMemory.findMany({
    where,
    orderBy: { importance: "desc" },
    take: limit,
  });

  if (dryRun) {
    return {
      memoriesProcessed: memories.length,
      entitiesExtracted: 0,
      entitiesAdded: 0,
      relationshipsExtracted: 0,
      relationshipsAdded: 0,
      errors: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // Process memories in batches
  let entitiesAdded = 0;
  let relationshipsAdded = 0;
  let errors = 0;
  let processed = 0;

  for (let i = 0; i < memories.length; i += batchSize) {
    const batch = memories.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (memory) => {
        try {
          const result = await processMemory(memory.id);
          if (!result.skipped) {
            entitiesAdded += result.entitiesAdded;
            relationshipsAdded += result.relationshipsAdded;
            processed++;
          }
        } catch (e) {
          logger.warn("Pipeline: memory processing failed", {
            memoryId: memory.id,
            error: e,
          });
          errors++;
        }
      })
    );

    // Small delay between batches to avoid overwhelming AI providers
    if (i + batchSize < memories.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  const stats: PipelineStats = {
    memoriesProcessed: processed,
    entitiesExtracted: entitiesAdded, // Approximate
    entitiesAdded,
    relationshipsExtracted: relationshipsAdded, // Approximate
    relationshipsAdded,
    errors,
    durationMs: Date.now() - startTime,
  };

  // Record in history
  await redis.lpush(
    PIPELINE_HISTORY_KEY,
    JSON.stringify({ ...stats, agentId, timestamp: Date.now() }),
  );
  await redis.ltrim(PIPELINE_HISTORY_KEY, 0, 999); // Keep last 1000 runs

  // Update last processed time
  await updateLastProcessedTime(new Date());

  logger.info("Agent pipeline complete", { agentId, ...stats });

  return stats;
}

/**
 * Run the pipeline for all agents in an organization.
 */
export async function runPipelineForOrganization(
  organizationId: string,
  options?: Omit<ProcessingOptions, "organizationId">,
): Promise<{
  agentsProcessed: number;
  totalStats: PipelineStats;
}> {
  const agents = await prisma.agent.findMany({
    where: { organizationId },
    select: { id: true },
  });

  const totalStats: PipelineStats = {
    memoriesProcessed: 0,
    entitiesExtracted: 0,
    entitiesAdded: 0,
    relationshipsExtracted: 0,
    relationshipsAdded: 0,
    errors: 0,
    durationMs: 0,
  };

  let agentsProcessed = 0;

  for (const agent of agents) {
    try {
      const stats = await runPipelineForAgent(agent.id, options);
      totalStats.memoriesProcessed += stats.memoriesProcessed;
      totalStats.entitiesExtracted += stats.entitiesExtracted;
      totalStats.entitiesAdded += stats.entitiesAdded;
      totalStats.relationshipsExtracted += stats.relationshipsExtracted;
      totalStats.relationshipsAdded += stats.relationshipsAdded;
      totalStats.errors += stats.errors;
      totalStats.durationMs += stats.durationMs;
      agentsProcessed++;
    } catch (e) {
      logger.warn("Pipeline: agent failed", { agentId: agent.id, error: e });
      totalStats.errors++;
    }
  }

  logger.info("Organization pipeline complete", {
    organizationId,
    agentsProcessed,
    ...totalStats,
  });

  return { agentsProcessed, totalStats };
}

/**
 * Run incremental pipeline: process only new/updated memories since last run.
 */
export async function runIncrementalPipeline(
  organizationId: string,
): Promise<PipelineStats> {
  const lastProcessed = await getLastProcessedTime();
  const since = lastProcessed ?? new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h

  const { totalStats } = await runPipelineForOrganization(organizationId, {
    since,
    minImportance: 0.6, // Higher threshold for incremental
    limit: 50, // Smaller limit for incremental
  });

  return totalStats;
}

/**
 * Reprocess all memories for an agent (force re-extraction).
 */
export async function reprocessAgent(
  agentId: string,
  options?: { limit?: number },
): Promise<PipelineStats> {
  const { limit = 200 } = options ?? {};

  // Clear processed flags for this agent's memories
  const memories = await prisma.agentMemory.findMany({
    where: { agentId },
    select: { id: true },
    take: limit,
  });

  for (const memory of memories) {
    await redis.del(MEMORY_PROCESSED_KEY(memory.id));
  }

  // Run pipeline with force
  const startTime = Date.now();
  let entitiesAdded = 0;
  let relationshipsAdded = 0;
  let errors = 0;

  for (const memory of memories) {
    try {
      const result = await processMemory(memory.id, { force: true });
      entitiesAdded += result.entitiesAdded;
      relationshipsAdded += result.relationshipsAdded;
    } catch (e) {
      errors++;
    }
  }

  return {
    memoriesProcessed: memories.length,
    entitiesExtracted: entitiesAdded,
    entitiesAdded,
    relationshipsExtracted: relationshipsAdded,
    relationshipsAdded,
    errors,
    durationMs: Date.now() - startTime,
  };
}

// ─── Graph Enrichment ───────────────────────────────────────────

/**
 * Enrich the knowledge graph by linking entities to their source memories.
 */
export async function enrichGraphWithMemoryLinks(
  organizationId: string,
): Promise<{ entitiesEnriched: number }> {
  // Get all entities extracted from memories
  const entities = KnowledgeGraphService.query({
    tags: ["source:memory"],
    limit: 1000,
  });

  let entitiesEnriched = 0;

  for (const entity of entities) {
    const sourceMemoryId = entity.attributes?.extractedFrom as string;
    if (!sourceMemoryId) continue;

    // Verify memory still exists
    const memory = await prisma.agentMemory.findUnique({
      where: { id: sourceMemoryId },
    });

    if (!memory) continue;

    // Update entity with memory link
    await KnowledgeGraphService.upsertEntity({
      id: entity.id,
      kind: entity.kind,
      name: entity.name,
      attributes: {
        ...entity.attributes,
        memoryLink: {
          id: memory.id,
          agentId: memory.agentId,
          type: memory.type,
          importance: memory.importance,
        },
      },
      provenance: entity.provenance,
    });

    entitiesEnriched++;
  }

  logger.info("Graph enriched with memory links", { entitiesEnriched });

  return { entitiesEnriched };
}

// ─── Pipeline Analytics ─────────────────────────────────────────

/**
 * Get pipeline execution history.
 */
export async function getPipelineHistory(
  limit = 50,
): Promise<Array<PipelineStats & { agentId?: string; timestamp: number }>> {
  const raw = await redis.lrange(PIPELINE_HISTORY_KEY, 0, limit - 1);
  return raw.map(r => JSON.parse(r));
}

/**
 * Get pipeline statistics summary.
 */
export async function getPipelineStats(): Promise<{
  lastRunAt: Date | null;
  totalRuns: number;
  totalMemoriesProcessed: number;
  totalEntitiesAdded: number;
  totalRelationshipsAdded: number;
}> {
  const state = await redis.hgetall(PIPELINE_STATE_KEY);
  const history = await getPipelineHistory(1000);

  return {
    lastRunAt: state.lastRunAt ? new Date(parseInt(state.lastRunAt, 10)) : null,
    totalRuns: history.length,
    totalMemoriesProcessed: history.reduce((sum, h) => sum + h.memoriesProcessed, 0),
    totalEntitiesAdded: history.reduce((sum, h) => sum + h.entitiesAdded, 0),
    totalRelationshipsAdded: history.reduce((sum, h) => sum + h.relationshipsAdded, 0),
  };
}
