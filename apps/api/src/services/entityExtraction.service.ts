/**
 * Entity Extraction Service (Module 7 — Gap 1)
 *
 * Automatic Named Entity Recognition (NER) using AI:
 * - Extract entities from text (memories, documents, conversations)
 * - Classify entity types (person, organization, concept, service, etc.)
 * - Extract entity attributes and context
 * - Batch extraction for efficiency
 * - Confidence scoring for extracted entities
 * - Integration with KnowledgeGraphService
 *
 * Uses AI providers to perform NER with structured output.
 */
import { prisma } from "../db/client.js";
import { aiRegistry } from "../ai/registry.js";
import { logger } from "../config/logger.js";
import { KnowledgeGraphService } from "../enterprise/knowledgeGraph/knowledgeGraph.service.js";
import type { EntityKind } from "@windels/shared/dataPlatform";
import { z } from "zod";

// ─── Types ──────────────────────────────────────────────────────

export interface ExtractedEntity {
  name: string;
  kind: EntityKind;
  attributes: Record<string, any>;
  context: string; // Surrounding text where entity was found
  confidence: number; // 0-1
  sourceText: string; // Original text snippet
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  sourceId?: string;
  sourceType?: string;
  processedAt: number;
}

// ─── Schemas ────────────────────────────────────────────────────

const ExtractedEntitySchema = z.object({
  name: z.string().min(1),
  kind: z.enum([
    "person", "organization", "concept", "service", "location",
    "event", "document", "technology", "product", "skill"
  ]),
  attributes: z.record(z.any()).default({}),
  context: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.8),
});

// ─── Entity Extraction ──────────────────────────────────────────

/**
 * Extract entities from text using AI-powered NER.
 */
export async function extractEntities(
  text: string,
  options?: {
    sourceId?: string;
    sourceType?: string;
    entityKinds?: EntityKind[]; // Limit to specific entity types
  },
): Promise<ExtractionResult> {
  if (!text || text.trim().length < 10) {
    return { entities: [], processedAt: Date.now() };
  }

  // Build entity kind filter instruction
  const kindFilter = options?.entityKinds?.length
    ? `Focus on these entity types: ${options.entityKinds.join(", ")}.`
    : "Identify all relevant entity types.";

  const prompt = `Extract named entities from the following text. ${kindFilter}

For each entity, provide:
- name: The entity name (normalized, title case for proper nouns)
- kind: One of: person, organization, concept, service, location, event, document, technology, product, skill
- attributes: Key-value pairs with additional information (e.g., role, version, date)
- context: A short snippet (10-30 words) showing where the entity appears
- confidence: Your confidence in this extraction (0.0-1.0)

TEXT:
${text.slice(0, 4000)}

Return a JSON array of entities. Example:
[
  {
    "name": "OpenAI",
    "kind": "organization",
    "attributes": { "type": "AI company" },
    "context": "OpenAI released GPT-4 in 2023",
    "confidence": 0.95
  }
]

Extracted entities:`;

  try {
    const result = await aiRegistry.complete(
      {
        messages: [
          {
            role: "system",
            content: "You are an expert named entity recognition system. Extract entities accurately and return valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        maxTokens: 2000,
        temperature: 0.1, // Low temperature for consistent extraction
        responseFormat: { type: "json_object" },
      },
      { feature: "entity-extraction" },
    );

    // Parse the response
    let parsed: any;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        logger.warn("Entity extraction: failed to parse JSON", { content: result.content.slice(0, 200) });
        return { entities: [], processedAt: Date.now() };
      }
    }

    // Validate and normalize entities
    const entities: ExtractedEntity[] = [];
    const entityArray = Array.isArray(parsed) ? parsed : (parsed.entities ?? []);

    for (const raw of entityArray) {
      try {
        const validated = ExtractedEntitySchema.parse(raw);
        entities.push({
          ...validated,
          sourceText: text.slice(0, 200),
        });
      } catch (e) {
        logger.warn("Entity extraction: invalid entity", { raw, error: e });
      }
    }

    logger.info("Entities extracted", {
      count: entities.length,
      sourceId: options?.sourceId,
      sourceType: options?.sourceType,
    });

    return {
      entities,
      sourceId: options?.sourceId,
      sourceType: options?.sourceType,
      processedAt: Date.now(),
    };
  } catch (e) {
    logger.error("Entity extraction failed", { error: e, textLength: text.length });
    return { entities: [], processedAt: Date.now() };
  }
}

/**
 * Extract entities from an AgentMemory and add them to the knowledge graph.
 */
export async function extractEntitiesFromMemory(
  memoryId: string,
): Promise<{ entitiesAdded: number; entities: ExtractedEntity[] }> {
  const memory = await prisma.agentMemory.findUnique({
    where: { id: memoryId },
  });

  if (!memory) {
    throw new Error(`Memory not found: ${memoryId}`);
  }

  // Extract entities from memory content
  const result = await extractEntities(memory.content, {
    sourceId: memoryId,
    sourceType: "memory",
  });

  // Add entities to knowledge graph
  let entitiesAdded = 0;
  for (const entity of result.entities) {
    try {
      await KnowledgeGraphService.upsertEntity({
        kind: entity.kind,
        name: entity.name,
        attributes: {
          ...entity.attributes,
          extractedFrom: memoryId,
          confidence: entity.confidence,
          context: entity.context,
        },
        tags: [`source:memory`, `type:${entity.kind}`],
        provenance: {
          source: "entity-extraction",
          sourceId: memoryId,
        },
      });
      entitiesAdded++;
    } catch (e) {
      logger.warn("Failed to add entity to knowledge graph", {
        entity: entity.name,
        error: e,
      });
    }
  }

  logger.info("Entities extracted from memory", {
    memoryId,
    entitiesExtracted: result.entities.length,
    entitiesAdded,
  });

  return { entitiesAdded, entities: result.entities };
}

/**
 * Batch extract entities from multiple memories.
 */
export async function batchExtractFromMemories(
  memoryIds: string[],
): Promise<{
  totalMemories: number;
  totalEntities: number;
  entitiesAdded: number;
}> {
  let totalEntities = 0;
  let entitiesAdded = 0;

  for (const memoryId of memoryIds) {
    try {
      const result = await extractEntitiesFromMemory(memoryId);
      totalEntities += result.entities.length;
      entitiesAdded += result.entitiesAdded;
    } catch (e) {
      logger.warn("Batch extraction: memory failed", { memoryId, error: e });
    }
  }

  logger.info("Batch entity extraction complete", {
    totalMemories: memoryIds.length,
    totalEntities,
    entitiesAdded,
  });

  return {
    totalMemories: memoryIds.length,
    totalEntities,
    entitiesAdded,
  };
}

/**
 * Extract entities from all memories for an agent.
 */
export async function extractEntitiesForAgent(
  agentId: string,
  options?: {
    limit?: number;
    minImportance?: number;
  },
): Promise<{
  memoriesProcessed: number;
  totalEntities: number;
  entitiesAdded: number;
}> {
  const { limit = 100, minImportance = 0.5 } = options ?? {};

  const memories = await prisma.agentMemory.findMany({
    where: {
      agentId,
      importance: { gte: minImportance },
    },
    orderBy: { importance: "desc" },
    take: limit,
  });

  const memoryIds = memories.map(m => m.id);
  const result = await batchExtractFromMemories(memoryIds);

  return {
    memoriesProcessed: result.totalMemories,
    totalEntities: result.totalEntities,
    entitiesAdded: result.entitiesAdded,
  };
}

/**
 * Extract entities from a document (AgentKnowledge).
 */
export async function extractEntitiesFromDocument(
  documentId: string,
): Promise<{ entitiesAdded: number; entities: ExtractedEntity[] }> {
  const document = await prisma.agentKnowledge.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  // Extract entities from document content
  const result = await extractEntities(document.content, {
    sourceId: documentId,
    sourceType: "document",
  });

  // Add entities to knowledge graph
  let entitiesAdded = 0;
  for (const entity of result.entities) {
    try {
      await KnowledgeGraphService.upsertEntity({
        kind: entity.kind,
        name: entity.name,
        attributes: {
          ...entity.attributes,
          extractedFrom: documentId,
          documentTitle: document.title,
          confidence: entity.confidence,
        },
        tags: [`source:document`, `type:${entity.kind}`],
        provenance: {
          source: "entity-extraction",
          sourceId: documentId,
        },
      });
      entitiesAdded++;
    } catch (e) {
      logger.warn("Failed to add entity from document", {
        entity: entity.name,
        error: e,
      });
    }
  }

  return { entitiesAdded, entities: result.entities };
}
