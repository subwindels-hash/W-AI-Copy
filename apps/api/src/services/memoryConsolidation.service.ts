/**
 * Memory Consolidation Service (Module 6 — Gap 2)
 *
 * Provides intelligent memory consolidation and deduplication:
 * - Detects similar/duplicate memories using semantic similarity
 * - Merges related memories into consolidated summaries
 * - Deduplicates near-identical memories
 * - Extracts key insights from memory clusters
 * - Maintains provenance (tracks which memories were merged)
 * - Periodic consolidation jobs for automatic cleanup
 *
 * Uses semantic search to find similar memories and AI to
 * generate consolidated summaries.
 */
import { prisma } from "../db/client.js";
import { redisCmd as redis } from "../db/redis.js";
import { aiRegistry } from "../ai/registry.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/result.js";
import {
  generateEmbedding,
  semanticSearch,
  deleteEmbedding,
  autoEmbedMemory,
} from "./vectorStorage.service.js";
import { z } from "zod";

// ─── Types ──────────────────────────────────────────────────────

export interface MemoryCluster {
  centroidMemoryId: string;
  memoryIds: string[];
  avgSimilarity: number;
  clusterType: "duplicate" | "related" | "thematic";
}

export interface ConsolidationResult {
  consolidatedMemoryId: string;
  mergedMemoryIds: string[];
  summary: string;
  clusterType: string;
  similarityScore: number;
  /** Net bytes of memory `content` reclaimed by this cluster (freed − added). */
  bytesFreed: number;
}

/** UTF-8 byte length of a string (real stored size, not JS char count). */
function byteLen(text: string): number {
  return Buffer.byteLength(text ?? "", "utf8");
}

export interface ConsolidationStats {
  totalMemories: number;
  clustersFound: number;
  duplicatesMerged: number;
  relatedMerged: number;
  memoriesDeleted: number;
  storageReduction: number; // bytes
}

// ─── Redis Keys ─────────────────────────────────────────────────

const CONSOLIDATION_JOB_KEY = "memconsol:jobs";
const CONSOLIDATION_HISTORY_KEY = (agentId: string) => `memconsol:history:${agentId}`;

// ─── Schemas ────────────────────────────────────────────────────

export const ConsolidationOptionsSchema = z.object({
  agentId: z.string().cuid(),
  similarityThreshold: z.number().min(0.5).max(0.99).default(0.85), // Higher = stricter
  minClusterSize: z.number().int().min(2).max(20).default(2),
  maxClusterSize: z.number().int().min(2).max(50).default(10),
  includeTypes: z.array(z.string()).optional(), // Only consolidate these types
  excludeTypes: z.array(z.string()).optional(), // Skip these types
  dryRun: z.boolean().default(false), // Preview without executing
});

// ─── Cluster Detection ──────────────────────────────────────────

/**
 * Find clusters of similar memories for an agent.
 */
export async function findMemoryClusters(
  agentId: string,
  options: {
    similarityThreshold?: number;
    minClusterSize?: number;
    maxClusterSize?: number;
    includeTypes?: string[];
    excludeTypes?: string[];
  } = {},
): Promise<MemoryCluster[]> {
  const {
    similarityThreshold = 0.85,
    minClusterSize = 2,
    maxClusterSize = 10,
    includeTypes,
    excludeTypes,
  } = options;

  // Fetch all memories for the agent
  const where: any = { agentId };
  if (includeTypes?.length) where.type = { in: includeTypes };
  if (excludeTypes?.length) where.type = { notIn: excludeTypes };

  const memories = await prisma.agentMemory.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 1000, // Limit to prevent OOM
  });

  if (memories.length < minClusterSize) {
    return [];
  }

  // Build similarity graph
  const clusters: MemoryCluster[] = [];
  const processed = new Set<string>();

  for (const memory of memories) {
    if (processed.has(memory.id)) continue;

    // Find similar memories
    const similar = await semanticSearch(
      await getMemoryEmbedding(memory.id),
      memory.agent?.organizationId ?? "",
      {
        agentId,
        topK: maxClusterSize * 2,
        minScore: similarityThreshold,
      },
    );

    // Filter to same agent and exclude self
    const clusterMembers = similar
      .filter(r => r.memoryId !== memory.id && !processed.has(r.memoryId))
      .slice(0, maxClusterSize - 1);

    if (clusterMembers.length + 1 >= minClusterSize) {
      const clusterMemoryIds = [memory.id, ...clusterMembers.map(r => r.memoryId)];
      const avgSimilarity = clusterMembers.reduce((sum, r) => sum + r.score, 0) / clusterMembers.length;

      // Classify cluster type
      let clusterType: MemoryCluster["clusterType"] = "thematic";
      if (avgSimilarity >= 0.95) {
        clusterType = "duplicate";
      } else if (avgSimilarity >= 0.85) {
        clusterType = "related";
      }

      clusters.push({
        centroidMemoryId: memory.id,
        memoryIds: clusterMemoryIds,
        avgSimilarity,
        clusterType,
      });

      // Mark all as processed
      clusterMemoryIds.forEach(id => processed.add(id));
    }
  }

  return clusters.sort((a, b) => b.avgSimilarity - a.avgSimilarity);
}

/**
 * Get embedding for a memory (generate if not exists).
 */
async function getMemoryEmbedding(memoryId: string): Promise<number[]> {
  const memory = await prisma.agentMemory.findUnique({
    where: { id: memoryId },
  });

  if (!memory) {
    throw AppError.notFound("Memory not found");
  }

  // Try to get existing embedding
  const { getEmbedding } = await import("./vectorStorage.service.js");
  const existing = await getEmbedding(memoryId);
  if (existing) {
    return existing.embedding;
  }

  // Generate new embedding
  const textToEmbed = `${memory.content} ${memory.tags.join(" ")}`;
  const { embedding } = await generateEmbedding(textToEmbed);
  return embedding;
}

// ─── Memory Consolidation ───────────────────────────────────────

/**
 * Consolidate a cluster of memories into a single summary.
 */
export async function consolidateCluster(
  cluster: MemoryCluster,
  agentId: string,
): Promise<ConsolidationResult | null> {
  // Fetch all memories in cluster
  const memories = await prisma.agentMemory.findMany({
    where: { id: { in: cluster.memoryIds } },
    include: { agent: true },
  });

  if (memories.length < 2) {
    return null;
  }

  // Generate consolidated summary using AI
  const summary = await generateConsolidatedSummary(memories, cluster.clusterType);

  // Calculate aggregate importance (max of cluster)
  const maxImportance = Math.max(...memories.map(m => m.importance));

  // Merge tags (union)
  const mergedTags = Array.from(new Set(memories.flatMap(m => m.tags)));

  // Create consolidated memory
  const consolidatedMemory = await prisma.agentMemory.create({
    data: {
      agentId,
      type: memories[0].type, // Use type of centroid
      content: summary,
      source: "consolidation",
      sourceRef: cluster.memoryIds.join(","),
      importance: maxImportance,
      tags: [...mergedTags, `consolidated:${cluster.clusterType}`],
      metadata: {
        consolidated: true,
        clusterType: cluster.clusterType,
        mergedCount: memories.length,
        mergedIds: cluster.memoryIds,
        avgSimilarity: cluster.avgSimilarity,
        originalMemories: memories.map(m => ({
          id: m.id,
          content: m.content.slice(0, 200), // Truncate for metadata
          createdAt: m.createdAt,
        })),
      },
    },
  });

  // Generate embedding for consolidated memory
  await autoEmbedMemory(consolidatedMemory.id);

  // Delete original memories (except centroid for provenance)
  const memoriesToDelete = cluster.memoryIds.filter(id => id !== cluster.centroidMemoryId);
  // Real storage reclaimed: the content bytes of every deleted memory, minus
  // the bytes of the new consolidated summary we just wrote. The retained
  // centroid is unchanged, so it nets to zero and is excluded.
  const bytesRemoved = memories
    .filter(m => memoriesToDelete.includes(m.id))
    .reduce((sum, m) => sum + byteLen(m.content), 0);
  const bytesFreed = bytesRemoved - byteLen(summary);
  for (const memoryId of memoriesToDelete) {
    await deleteEmbedding(memoryId);
    await prisma.agentMemory.delete({ where: { id: memoryId } });
  }

  // Update centroid memory to point to consolidated version
  await prisma.agentMemory.update({
    where: { id: cluster.centroidMemoryId },
    data: {
      metadata: {
        ...((memories.find(m => m.id === cluster.centroidMemoryId)?.metadata as any) ?? {}),
        supersededBy: consolidatedMemory.id,
        consolidatedInto: consolidatedMemory.id,
      },
    },
  });

  logger.info("Memory cluster consolidated", {
    agentId,
    clusterType: cluster.clusterType,
    mergedCount: memories.length,
    consolidatedMemoryId: consolidatedMemory.id,
    avgSimilarity: cluster.avgSimilarity,
  });

  return {
    consolidatedMemoryId: consolidatedMemory.id,
    mergedMemoryIds: cluster.memoryIds,
    summary,
    clusterType: cluster.clusterType,
    similarityScore: cluster.avgSimilarity,
    bytesFreed,
  };
}

/**
 * Generate a consolidated summary from multiple memories using AI.
 */
async function generateConsolidatedSummary(
  memories: any[],
  clusterType: string,
): Promise<string> {
  const memoryTexts = memories.map((m, i) => `Memory ${i + 1}: ${m.content}`).join("\n\n");

  let prompt: string;
  if (clusterType === "duplicate") {
    prompt = `The following memories are near-duplicates. Merge them into a single, concise memory that captures all unique information without redundancy:\n\n${memoryTexts}\n\nConsolidated memory:`;
  } else if (clusterType === "related") {
    prompt = `The following memories are related and cover similar topics. Synthesize them into a single comprehensive memory that captures the key insights:\n\n${memoryTexts}\n\nConsolidated memory:`;
  } else {
    prompt = `The following memories share a common theme. Create a summary that captures the main points and connections:\n\n${memoryTexts}\n\nThematic summary:`;
  }

  const result = await aiRegistry.complete(
    {
      messages: [
        {
          role: "system",
          content: "You are a memory consolidation assistant. Create clear, concise summaries that preserve all important information while eliminating redundancy.",
        },
        { role: "user", content: prompt },
      ],
      maxTokens: 500,
      temperature: 0.3,
    },
    { feature: "memory-consolidation" },
  );

  return result.content.trim();
}

// ─── Batch Consolidation ────────────────────────────────────────

/**
 * Run consolidation for an agent (find clusters and consolidate).
 */
export async function consolidateAgentMemories(
  agentId: string,
  options: z.infer<typeof ConsolidationOptionsSchema>,
): Promise<{
  stats: ConsolidationStats;
  results: ConsolidationResult[];
}> {
  const {
    similarityThreshold,
    minClusterSize,
    maxClusterSize,
    includeTypes,
    excludeTypes,
    dryRun,
  } = options;

  // Find clusters
  const clusters = await findMemoryClusters(agentId, {
    similarityThreshold,
    minClusterSize,
    maxClusterSize,
    includeTypes,
    excludeTypes,
  });

  if (dryRun) {
    // Return preview without executing
    return {
      stats: {
        totalMemories: await prisma.agentMemory.count({ where: { agentId } }),
        clustersFound: clusters.length,
        duplicatesMerged: clusters.filter(c => c.clusterType === "duplicate").length,
        relatedMerged: clusters.filter(c => c.clusterType === "related").length,
        memoriesDeleted: 0,
        storageReduction: 0,
      },
      results: [],
    };
  }

  // Consolidate each cluster
  const results: ConsolidationResult[] = [];
  let memoriesDeleted = 0;
  let storageReduction = 0;

  for (const cluster of clusters) {
    try {
      const result = await consolidateCluster(cluster, agentId);
      if (result) {
        results.push(result);
        memoriesDeleted += cluster.memoryIds.length - 1; // All except centroid
        storageReduction += Math.max(0, result.bytesFreed); // Real reclaimed content bytes
      }
    } catch (e) {
      logger.warn("Cluster consolidation failed", {
        agentId,
        clusterCentroid: cluster.centroidMemoryId,
        error: e,
      });
    }
  }

  const stats: ConsolidationStats = {
    totalMemories: await prisma.agentMemory.count({ where: { agentId } }),
    clustersFound: clusters.length,
    duplicatesMerged: results.filter(r => r.clusterType === "duplicate").length,
    relatedMerged: results.filter(r => r.clusterType === "related").length,
    memoriesDeleted,
    // Net UTF-8 content bytes reclaimed across all consolidated clusters.
    storageReduction,
  };

  // Record consolidation history
  await redis.lpush(
    CONSOLIDATION_HISTORY_KEY(agentId),
    JSON.stringify({ ...stats, timestamp: Date.now() }),
  );
  await redis.ltrim(CONSOLIDATION_HISTORY_KEY(agentId), 0, 99); // Keep last 100

  logger.info("Agent memory consolidation complete", {
    agentId,
    ...stats,
  });

  return { stats, results };
}

/**
 * Run consolidation for all agents (periodic job).
 */
export async function consolidateAllAgents(options?: {
  similarityThreshold?: number;
  minMemoriesForConsolidation?: number; // Only consolidate agents with this many memories
}): Promise<{
  agentsProcessed: number;
  totalClusters: number;
  totalMemoriesDeleted: number;
}> {
  const {
    similarityThreshold = 0.85,
    minMemoriesForConsolidation = 20,
  } = options ?? {};

  // Find agents with enough memories to warrant consolidation
  const agents = await prisma.agent.findMany({
    where: {
      memories: {
        some: {},
      },
    },
    select: {
      id: true,
      _count: {
        select: { memories: true },
      },
    },
  });

  const eligibleAgents = agents.filter(a => a._count.memories >= minMemoriesForConsolidation);

  let agentsProcessed = 0;
  let totalClusters = 0;
  let totalMemoriesDeleted = 0;

  for (const agent of eligibleAgents) {
    try {
      const { stats } = await consolidateAgentMemories(agent.id, {
        agentId: agent.id,
        similarityThreshold,
        minClusterSize: 2,
        maxClusterSize: 10,
        dryRun: false,
      });

      agentsProcessed++;
      totalClusters += stats.clustersFound;
      totalMemoriesDeleted += stats.memoriesDeleted;
    } catch (e) {
      logger.warn("Agent consolidation failed", { agentId: agent.id, error: e });
    }
  }

  logger.info("Bulk memory consolidation complete", {
    agentsProcessed,
    totalClusters,
    totalMemoriesDeleted,
  });

  return { agentsProcessed, totalClusters, totalMemoriesDeleted };
}

// ─── Deduplication ──────────────────────────────────────────────

/**
 * Quick deduplication check before creating a new memory.
 * Returns existing memory if a near-duplicate is found.
 */
export async function checkDuplicate(
  agentId: string,
  content: string,
  threshold = 0.95,
): Promise<{ isDuplicate: boolean; existingMemoryId?: string; similarity?: number }> {
  try {
    // Generate embedding for new content
    const { embedding } = await generateEmbedding(content);

    // Search for similar memories
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) return { isDuplicate: false };

    const similar = await semanticSearch(embedding, agent.organizationId, {
      agentId,
      topK: 5,
      minScore: threshold,
    });

    if (similar.length > 0 && similar[0].score >= threshold) {
      return {
        isDuplicate: true,
        existingMemoryId: similar[0].memoryId,
        similarity: similar[0].score,
      };
    }

    return { isDuplicate: false };
  } catch (e) {
    logger.warn("Duplicate check failed", { agentId, error: e });
    return { isDuplicate: false };
  }
}
