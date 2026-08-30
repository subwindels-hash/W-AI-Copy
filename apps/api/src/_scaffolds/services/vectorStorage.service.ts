/**
 * Vector Storage Service (Module 6 — Gap 1)
 *
 * Provides semantic search over memories using vector embeddings:
 * - Persists embeddings in Redis (MVP) or pgvector (production)
 * - Cosine similarity search for semantic recall
 * - Hybrid search (semantic + lexical + filters)
 * - Embedding generation via AI provider registry
 * - Batch embedding for efficiency
 *
 * Uses Redis hashes for embedding storage and implements
 * brute-force cosine similarity for MVP. Can be swapped to
 * pgvector or dedicated vector DB for production scale.
 */
import { prisma } from "../../db/client.js";
import { redisCmd as redis } from "../../db/redis.js";
import { aiRegistry } from "../../services/ai/registry.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/result.js";

// ─── Types ──────────────────────────────────────────────────────

export interface VectorEmbedding {
  id: string;
  memoryId: string;
  agentId?: string;
  organizationId: string;
  embedding: number[]; // Vector representation
  model: string; // Embedding model used
  dimensions: number;
  createdAt: number;
}

export interface SemanticSearchResult {
  memoryId: string;
  score: number; // Cosine similarity (0-1, higher = more similar)
  embedding: VectorEmbedding;
}

export interface HybridSearchOptions {
  agentId?: string;
  organizationId: string;
  query: string;
  topK?: number;
  minScore?: number; // Minimum similarity threshold (0-1)
  filters?: {
    types?: string[];
    tags?: string[];
    minImportance?: number;
    since?: Date;
    until?: Date;
  };
  lexicalWeight?: number; // 0-1, how much to weight keyword match vs semantic (default 0.3)
}

// ─── Redis Keys ─────────────────────────────────────────────────

const EMBEDDING_KEY = (id: string) => `vec:embed:${id}`;
const EMBEDDING_MEMORY_KEY = (memoryId: string) => `vec:memory:${memoryId}`;
const EMBEDDING_AGENT_KEY = (agentId: string) => `vec:agent:${agentId}`;
const EMBEDDING_ORG_KEY = (orgId: string) => `vec:org:${orgId}`;
const EMBEDDING_INDEX_KEY = "vec:embeddings";

// ─── Embedding Generation ───────────────────────────────────────

/**
 * Generate embedding for text using AI provider.
 */
export async function generateEmbedding(
  text: string,
  model?: string,
): Promise<{ embedding: number[]; model: string; dimensions: number }> {
  const result = await aiRegistry.embed({
    input: text,
    model,
  });

  if (!result.embeddings || result.embeddings.length === 0) {
    throw AppError.internal("Failed to generate embedding");
  }

  return {
    embedding: result.embeddings[0],
    model: result.model,
    dimensions: result.embeddings[0].length,
  };
}

/**
 * Generate embeddings for multiple texts (batch).
 */
export async function generateEmbeddings(
  texts: string[],
  model?: string,
): Promise<Array<{ embedding: number[]; model: string; dimensions: number }>> {
  const result = await aiRegistry.embed({
    input: texts,
    model,
  });

  if (!result.embeddings || result.embeddings.length !== texts.length) {
    throw AppError.internal("Failed to generate batch embeddings");
  }

  return result.embeddings.map((emb) => ({
    embedding: emb,
    model: result.model,
    dimensions: emb.length,
  }));
}

// ─── Vector Storage ─────────────────────────────────────────────

/**
 * Store an embedding for a memory.
 */
export async function storeEmbedding(
  memoryId: string,
  agentId: string | undefined,
  organizationId: string,
  embedding: number[],
  model: string,
): Promise<VectorEmbedding> {
  const id = `emb_${memoryId}`;
  const now = Date.now();

  const vectorEmbedding: VectorEmbedding = {
    id,
    memoryId,
    agentId,
    organizationId,
    embedding,
    model,
    dimensions: embedding.length,
    createdAt: now,
  };

  // Store embedding
  await redis.hset(EMBEDDING_KEY(id), {
    id,
    memoryId,
    agentId: agentId ?? "",
    organizationId,
    embedding: JSON.stringify(embedding),
    model,
    dimensions: String(embedding.length),
    createdAt: String(now),
  });

  // Add to indexes
  const pipeline = redis.multi();
  pipeline.sadd(EMBEDDING_INDEX_KEY, id);
  pipeline.set(EMBEDDING_MEMORY_KEY(memoryId), id);
  if (agentId) {
    pipeline.sadd(EMBEDDING_AGENT_KEY(agentId), id);
  }
  pipeline.sadd(EMBEDDING_ORG_KEY(organizationId), id);
  await pipeline.exec();

  logger.debug("Embedding stored", {
    embeddingId: id,
    memoryId,
    agentId,
    dimensions: embedding.length,
    model,
  });

  return vectorEmbedding;
}

/**
 * Get embedding for a memory.
 */
export async function getEmbedding(memoryId: string): Promise<VectorEmbedding | null> {
  const embeddingId = await redis.get(EMBEDDING_MEMORY_KEY(memoryId));
  if (!embeddingId) return null;

  const data = await redis.hgetall(EMBEDDING_KEY(embeddingId));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    id: data.id,
    memoryId: data.memoryId,
    agentId: data.agentId || undefined,
    organizationId: data.organizationId,
    embedding: JSON.parse(data.embedding),
    model: data.model,
    dimensions: parseInt(data.dimensions, 10),
    createdAt: parseInt(data.createdAt, 10),
  };
}

/**
 * Delete embedding for a memory.
 */
export async function deleteEmbedding(memoryId: string): Promise<boolean> {
  const embeddingId = await redis.get(EMBEDDING_MEMORY_KEY(memoryId));
  if (!embeddingId) return false;

  const data = await redis.hgetall(EMBEDDING_KEY(embeddingId));
  if (!data || Object.keys(data).length === 0) return false;

  const pipeline = redis.multi();
  pipeline.del(EMBEDDING_KEY(embeddingId));
  pipeline.del(EMBEDDING_MEMORY_KEY(memoryId));
  pipeline.srem(EMBEDDING_INDEX_KEY, embeddingId);
  if (data.agentId) {
    pipeline.srem(EMBEDDING_AGENT_KEY(data.agentId), embeddingId);
  }
  pipeline.srem(EMBEDDING_ORG_KEY(data.organizationId), embeddingId);
  await pipeline.exec();

  return true;
}

// ─── Semantic Search ────────────────────────────────────────────

/**
 * Calculate cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Search for semantically similar memories.
 */
export async function semanticSearch(
  queryEmbedding: number[],
  organizationId: string,
  options?: {
    agentId?: string;
    topK?: number;
    minScore?: number;
  },
): Promise<SemanticSearchResult[]> {
  const topK = options?.topK ?? 10;
  const minScore = options?.minScore ?? 0.0;

  // Get all embedding IDs for the organization (or agent)
  let embeddingIds: string[];
  if (options?.agentId) {
    embeddingIds = await redis.smembers(EMBEDDING_AGENT_KEY(options.agentId));
  } else {
    embeddingIds = await redis.smembers(EMBEDDING_ORG_KEY(organizationId));
  }

  // Calculate similarity for each embedding
  const results: SemanticSearchResult[] = [];

  for (const embeddingId of embeddingIds) {
    const data = await redis.hgetall(EMBEDDING_KEY(embeddingId));
    if (!data || Object.keys(data).length === 0) continue;

    const embedding = JSON.parse(data.embedding) as number[];
    const score = cosineSimilarity(queryEmbedding, embedding);

    if (score >= minScore) {
      results.push({
        memoryId: data.memoryId,
        score,
        embedding: {
          id: data.id,
          memoryId: data.memoryId,
          agentId: data.agentId || undefined,
          organizationId: data.organizationId,
          embedding,
          model: data.model,
          dimensions: parseInt(data.dimensions, 10),
          createdAt: parseInt(data.createdAt, 10),
        },
      });
    }
  }

  // Sort by score (descending) and return top K
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

/**
 * Hybrid search combining semantic similarity with lexical matching and filters.
 */
export async function hybridSearch(options: HybridSearchOptions): Promise<Array<{
  memoryId: string;
  score: number;
  semanticScore: number;
  lexicalScore: number;
  memory: any;
}>> {
  const {
    organizationId,
    query,
    topK = 10,
    minScore = 0.0,
    filters,
    lexicalWeight = 0.3,
  } = options;

  // Generate query embedding
  const { embedding: queryEmbedding } = await generateEmbedding(query);

  // Semantic search
  const semanticResults = await semanticSearch(queryEmbedding, organizationId, {
    agentId: options.agentId,
    topK: topK * 3, // Over-fetch for filtering
    minScore: 0.0,
  });

  // Fetch memories and apply filters
  const memoryIds = semanticResults.map(r => r.memoryId);
  const memories = await prisma.agentMemory.findMany({
    where: {
      id: { in: memoryIds },
      ...(filters?.types && { type: { in: filters.types as any } }),
      ...(filters?.tags && { tags: { hasSome: filters.tags } }),
      ...(filters?.minImportance && { importance: { gte: filters.minImportance } }),
      ...(filters?.since && { createdAt: { gte: filters.since } }),
      ...(filters?.until && { createdAt: { lte: filters.until } }),
    },
  });

  const memoryMap = new Map<string, any>(memories.map((m: any) => [m.id, m]));

  // Calculate lexical scores (simple keyword matching)
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  
  const results = semanticResults
    .filter(r => memoryMap.has(r.memoryId))
    .map(r => {
      const memory = memoryMap.get(r.memoryId)!;
      const content = memory.content.toLowerCase();
      
      // Lexical score: fraction of query terms found in content
      const matches = queryTerms.filter(term => content.includes(term)).length;
      const lexicalScore = queryTerms.length > 0 ? matches / queryTerms.length : 0;

      // Combined score
      const semanticWeight = 1 - lexicalWeight;
      const score = (r.score * semanticWeight) + (lexicalScore * lexicalWeight);

      return {
        memoryId: r.memoryId,
        score,
        semanticScore: r.score,
        lexicalScore,
        memory,
      };
    })
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return results;
}

// ─── Auto-Embedding ─────────────────────────────────────────────

/**
 * Automatically generate and store embedding when a memory is created.
 * Call this from memory creation hooks.
 */
export async function autoEmbedMemory(memoryId: string): Promise<void> {
  try {
    const memory = await prisma.agentMemory.findUnique({
      where: { id: memoryId },
      include: { agent: true },
    });

    if (!memory) {
      logger.warn("Auto-embed: memory not found", { memoryId });
      return;
    }

    // Generate embedding from content + tags
    const textToEmbed = `${memory.content} ${memory.tags.join(" ")}`;
    const { embedding, model } = await generateEmbedding(textToEmbed);

    // Store embedding
    await storeEmbedding(
      memoryId,
      memory.agentId,
      memory.agent.organizationId,
      embedding,
      model,
    );

    logger.debug("Memory auto-embedded", { memoryId, model });
  } catch (e) {
    logger.warn("Auto-embed failed", { memoryId, error: e });
  }
}

/**
 * Batch embed multiple memories.
 */
export async function batchEmbedMemories(memoryIds: string[]): Promise<{
  embedded: number;
  failed: number;
}> {
  let embedded = 0;
  let failed = 0;

  // Fetch all memories
  const memories = await prisma.agentMemory.findMany({
    where: { id: { in: memoryIds } },
    include: { agent: true },
  });

  // Prepare texts for batch embedding
  const texts = memories.map((m: any) => `${m.content} ${m.tags.join(" ")}`);

  try {
    // Generate embeddings in batch
    const embeddings = await generateEmbeddings(texts);

    // Store each embedding
    for (let i = 0; i < memories.length; i++) {
      const memory = memories[i];
      const { embedding, model } = embeddings[i];

      await storeEmbedding(
        memory.id,
        memory.agentId,
        memory.agent.organizationId,
        embedding,
        model,
      );
      embedded++;
    }
  } catch (e) {
    logger.warn("Batch embedding failed, falling back to individual", { error: e });
    
    // Fallback to individual embedding
    for (const memoryId of memoryIds) {
      try {
        await autoEmbedMemory(memoryId);
        embedded++;
      } catch {
        failed++;
      }
    }
  }

  return { embedded, failed };
}
