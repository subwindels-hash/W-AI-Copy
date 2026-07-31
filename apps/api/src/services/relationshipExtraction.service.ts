/**
 * Relationship Extraction Service (Module 7 — Gap 2)
 *
 * Automatic relationship extraction from text using AI:
 * - Identify relationships between entities in text
 * - Classify relationship types (uses, depends_on, part_of, etc.)
 * - Extract relationship attributes and context
 * - Link extracted relationships to existing entities in knowledge graph
 * - Confidence scoring for extracted relationships
 *
 * Uses AI providers to perform relationship extraction with structured output.
 */
import { prisma } from "../db/client.js";
import { aiRegistry } from "../ai/registry.js";
import { logger } from "../config/logger.js";
import { KnowledgeGraphService } from "../enterprise/knowledgeGraph/knowledgeGraph.service.js";
import type { RelationKind, KGEntity } from "@windels/shared/dataPlatform";
import { extractEntities } from "./entityExtraction.service.js";
import { z } from "zod";

// ─── Types ──────────────────────────────────────────────────────

export interface ExtractedRelationship {
  fromEntity: string; // Entity name
  toEntity: string; // Entity name
  kind: RelationKind;
  attributes: Record<string, any>;
  context: string; // Surrounding text
  confidence: number; // 0-1
}

export interface RelationshipExtractionResult {
  relationships: ExtractedRelationship[];
  entitiesFound: string[]; // Entity names mentioned
  sourceId?: string;
  sourceType?: string;
  processedAt: number;
}

// ─── Schemas ────────────────────────────────────────────────────

const ExtractedRelationshipSchema = z.object({
  fromEntity: z.string().min(1),
  toEntity: z.string().min(1),
  kind: z.enum([
    "uses", "depends_on", "part_of", "owns", "references",
    "produced_by", "created_by", "located_in", "member_of",
    "related_to", "similar_to", "opposes", "supports"
  ]),
  attributes: z.record(z.any()).default({}),
  context: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.8),
});

// ─── Relationship Extraction ────────────────────────────────────

/**
 * Extract relationships from text using AI.
 */
export async function extractRelationships(
  text: string,
  options?: {
    sourceId?: string;
    sourceType?: string;
    knownEntities?: string[]; // Provide known entity names to focus extraction
    relationKinds?: RelationKind[]; // Limit to specific relationship types
  },
): Promise<RelationshipExtractionResult> {
  if (!text || text.trim().length < 20) {
    return { relationships: [], entitiesFound: [], processedAt: Date.now() };
  }

  // Build context for extraction
  const entityContext = options?.knownEntities?.length
    ? `Known entities in our knowledge graph: ${options.knownEntities.slice(0, 50).join(", ")}.`
    : "";

  const relationFilter = options?.relationKinds?.length
    ? `Focus on these relationship types: ${options.relationKinds.join(", ")}.`
    : "Identify all relevant relationship types.";

  const prompt = `Extract relationships between entities from the following text.
${entityContext}
${relationFilter}

For each relationship, provide:
- fromEntity: The subject entity name
- toEntity: The object entity name
- kind: One of: uses, depends_on, part_of, owns, references, produced_by, created_by, located_in, member_of, related_to, similar_to, opposes, supports
- attributes: Key-value pairs with additional information (e.g., since, version, strength)
- context: A short snippet (10-30 words) showing the relationship
- confidence: Your confidence in this extraction (0.0-1.0)

TEXT:
${text.slice(0, 4000)}

Return a JSON object with:
- relationships: Array of relationship objects
- entitiesFound: Array of all entity names mentioned in the text

Example:
{
  "relationships": [
    {
      "fromEntity": "React",
      "toEntity": "JavaScript",
      "kind": "depends_on",
      "attributes": { "type": "library" },
      "context": "React is a JavaScript library for building UIs",
      "confidence": 0.95
    }
  ],
  "entitiesFound": ["React", "JavaScript", "UI"]
}

Extracted relationships:`;

  try {
    const result = await aiRegistry.complete(
      {
        messages: [
          {
            role: "system",
            content: "You are an expert relationship extraction system. Extract relationships accurately and return valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        maxTokens: 2500,
        temperature: 0.1,
        responseFormat: { type: "json_object" },
      },
      { feature: "relationship-extraction" },
    );

    // Parse the response
    let parsed: any;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      logger.warn("Relationship extraction: failed to parse JSON", { content: result.content.slice(0, 200) });
      return { relationships: [], entitiesFound: [], processedAt: Date.now() };
    }

    // Validate relationships
    const relationships: ExtractedRelationship[] = [];
    const relArray = parsed.relationships ?? [];

    for (const raw of relArray) {
      try {
        const validated = ExtractedRelationshipSchema.parse(raw);
        relationships.push(validated);
      } catch (e) {
        logger.warn("Relationship extraction: invalid relationship", { raw, error: e });
      }
    }

    const entitiesFound = parsed.entitiesFound ?? [];

    logger.info("Relationships extracted", {
      count: relationships.length,
      entitiesFound: entitiesFound.length,
      sourceId: options?.sourceId,
    });

    return {
      relationships,
      entitiesFound,
      sourceId: options?.sourceId,
      sourceType: options?.sourceType,
      processedAt: Date.now(),
    };
  } catch (e) {
    logger.error("Relationship extraction failed", { error: e, textLength: text.length });
    return { relationships: [], entitiesFound: [], processedAt: Date.now() };
  }
}

/**
 * Extract relationships from text and add them to the knowledge graph.
 * Automatically creates entities if they don't exist.
 */
export async function extractAndAddRelationships(
  text: string,
  options?: {
    sourceId?: string;
    sourceType?: string;
    autoCreateEntities?: boolean; // Create entities if not found
  },
): Promise<{
  relationshipsAdded: number;
  entitiesCreated: number;
  relationships: ExtractedRelationship[];
}> {
  const { autoCreateEntities = true } = options ?? {};

  // Extract relationships
  const result = await extractRelationships(text, options);

  if (result.relationships.length === 0) {
    return { relationshipsAdded: 0, entitiesCreated: 0, relationships: [] };
  }

  // Ensure entities exist
  const entityMap = new Map<string, KGEntity>();
  let entitiesCreated = 0;

  const allEntityNames = new Set<string>();
  for (const rel of result.relationships) {
    allEntityNames.add(rel.fromEntity);
    allEntityNames.add(rel.toEntity);
  }

  for (const entityName of allEntityNames) {
    // Search for existing entity
    const existing = KnowledgeGraphService.query({ search: entityName, limit: 5 })
      .find(e => e.name.toLowerCase() === entityName.toLowerCase());

    if (existing) {
      entityMap.set(entityName, existing);
    } else if (autoCreateEntities) {
      // Create new entity
      try {
        const newEntity = await KnowledgeGraphService.upsertEntity({
          kind: "concept", // Default to concept, can be refined later
          name: entityName,
          attributes: { autoCreated: true },
          tags: ["auto-extracted"],
          provenance: {
            source: "relationship-extraction",
            sourceId: options?.sourceId,
          },
        });
        entityMap.set(entityName, newEntity);
        entitiesCreated++;
      } catch (e) {
        logger.warn("Failed to create entity", { entityName, error: e });
      }
    }
  }

  // Add relationships to graph
  let relationshipsAdded = 0;
  for (const rel of result.relationships) {
    const fromEntity = entityMap.get(rel.fromEntity);
    const toEntity = entityMap.get(rel.toEntity);

    if (!fromEntity || !toEntity) {
      logger.warn("Skipping relationship: entity not found", {
        from: rel.fromEntity,
        to: rel.toEntity,
      });
      continue;
    }

    try {
      await KnowledgeGraphService.addRelation({
        from: fromEntity.id,
        to: toEntity.id,
        kind: rel.kind,
        weight: rel.confidence,
        attributes: {
          ...rel.attributes,
          extractedFrom: options?.sourceId,
          context: rel.context,
        },
        provenance: {
          source: "relationship-extraction",
          sourceId: options?.sourceId,
        },
      });
      relationshipsAdded++;
    } catch (e) {
      logger.warn("Failed to add relationship", {
        from: rel.fromEntity,
        to: rel.toEntity,
        error: e,
      });
    }
  }

  logger.info("Relationships added to knowledge graph", {
    relationshipsExtracted: result.relationships.length,
    relationshipsAdded,
    entitiesCreated,
  });

  return {
    relationshipsAdded,
    entitiesCreated,
    relationships: result.relationships,
  };
}

/**
 * Extract relationships from an AgentMemory and add to knowledge graph.
 */
export async function extractRelationshipsFromMemory(
  memoryId: string,
): Promise<{
  relationshipsAdded: number;
  entitiesCreated: number;
  relationships: ExtractedRelationship[];
}> {
  const memory = await prisma.agentMemory.findUnique({
    where: { id: memoryId },
  });

  if (!memory) {
    throw new Error(`Memory not found: ${memoryId}`);
  }

  return extractAndAddRelationships(memory.content, {
    sourceId: memoryId,
    sourceType: "memory",
    autoCreateEntities: true,
  });
}

/**
 * Extract both entities and relationships from text (combined extraction).
 */
export async function extractKnowledgeFromText(
  text: string,
  options?: {
    sourceId?: string;
    sourceType?: string;
  },
): Promise<{
  entitiesAdded: number;
  relationshipsAdded: number;
  entities: any[];
  relationships: ExtractedRelationship[];
}> {
  // Extract entities
  const entityResult = await extractEntities(text, options);

  // Add entities to graph
  let entitiesAdded = 0;
  for (const entity of entityResult.entities) {
    try {
      await KnowledgeGraphService.upsertEntity({
        kind: entity.kind,
        name: entity.name,
        attributes: {
          ...entity.attributes,
          extractedFrom: options?.sourceId,
          confidence: entity.confidence,
        },
        tags: [`source:${options?.sourceType ?? "text"}`, `type:${entity.kind}`],
        provenance: {
          source: "knowledge-extraction",
          sourceId: options?.sourceId,
        },
      });
      entitiesAdded++;
    } catch (e) {
      logger.warn("Failed to add entity", { entity: entity.name, error: e });
    }
  }

  // Extract relationships (using known entities for better accuracy)
  const knownEntities = entityResult.entities.map(e => e.name);
  const relResult = await extractAndAddRelationships(text, {
    ...options,
    autoCreateEntities: false, // Entities already created above
  });

  return {
    entitiesAdded,
    relationshipsAdded: relResult.relationshipsAdded,
    entities: entityResult.entities,
    relationships: relResult.relationships,
  };
}

/**
 * Batch extract knowledge from multiple memories.
 */
export async function batchExtractFromMemories(
  memoryIds: string[],
): Promise<{
  memoriesProcessed: number;
  totalEntities: number;
  totalRelationships: number;
}> {
  let totalEntities = 0;
  let totalRelationships = 0;

  for (const memoryId of memoryIds) {
    try {
      const memory = await prisma.agentMemory.findUnique({
        where: { id: memoryId },
      });

      if (!memory) continue;

      const result = await extractKnowledgeFromText(memory.content, {
        sourceId: memoryId,
        sourceType: "memory",
      });

      totalEntities += result.entitiesAdded;
      totalRelationships += result.relationshipsAdded;
    } catch (e) {
      logger.warn("Batch extraction: memory failed", { memoryId, error: e });
    }
  }

  logger.info("Batch knowledge extraction complete", {
    memoriesProcessed: memoryIds.length,
    totalEntities,
    totalRelationships,
  });

  return {
    memoriesProcessed: memoryIds.length,
    totalEntities,
    totalRelationships,
  };
}
