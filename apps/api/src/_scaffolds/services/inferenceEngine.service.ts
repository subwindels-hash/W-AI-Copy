/**
 * Inference Engine Service (Module 8 — Gap 1)
 *
 * Logical inference over the knowledge graph:
 * - Deductive reasoning: derive new facts from existing knowledge
 * - Transitive inference: if A→B and B→C, then A→C
 * - Pattern matching: find subgraphs matching patterns
 * - Fact derivation: generate new relationships from existing ones
 * - Inference chains: track reasoning steps for explanations
 *
 * Uses the knowledge graph (Module 7) as the knowledge base.
 */
import { logger } from "../../config/logger.js";
import { KnowledgeGraphService } from "../../enterprise/knowledgeGraph/knowledgeGraph.service.js";
import type { KGEntity, KGRelation, RelationKind } from "@windels/shared/dataPlatform";

// ─── Types ──────────────────────────────────────────────────────

export interface InferredFact {
  from: string; // Entity ID
  to: string; // Entity ID
  kind: RelationKind;
  confidence: number; // 0-1
  reasoning: InferenceStep[];
  derivedAt: number;
}

export interface InferenceStep {
  type: "axiom" | "rule" | "transitive" | "pattern";
  description: string;
  sourceFacts?: string[]; // Relation IDs used
  ruleId?: string;
}

export interface InferenceResult {
  facts: InferredFact[];
  steps: number;
  durationMs: number;
}

export interface PatternMatch {
  entities: Map<string, KGEntity>; // Variable name -> entity
  relations: Map<string, KGRelation>; // Variable name -> relation
  score: number; // Match quality 0-1
}

// ─── Transitive Inference ───────────────────────────────────────

/**
 * Infer transitive relationships.
 * Example: if A depends_on B and B depends_on C, then A depends_on C
 */
export async function inferTransitive(
  relationKind: RelationKind,
  maxDepth = 3,
): Promise<InferredFact[]> {
  const startTime = Date.now();
  const inferred: InferredFact[] = [];

  // Get all relations of this kind
  const allRelations = KnowledgeGraphService.listRelations();
  const relations = allRelations.filter(r => r.kind === relationKind);

  // Build adjacency map
  const adjacency = new Map<string, Set<string>>();
  for (const rel of relations) {
    if (!adjacency.has(rel.from)) {
      adjacency.set(rel.from, new Set());
    }
    adjacency.get(rel.from)!.add(rel.to);
  }

  // For each entity, find all transitive targets
  for (const [startEntity, directTargets] of adjacency.entries()) {
    const visited = new Set<string>([startEntity]);
    const queue: Array<{ entity: string; depth: number; path: string[] }> = [];

    // Initialize queue with direct targets
    for (const target of directTargets) {
      queue.push({ entity: target, depth: 1, path: [startEntity, target] });
    }

    while (queue.length > 0) {
      const { entity, depth, path } = queue.shift()!;

      if (depth > maxDepth) continue;
      if (visited.has(entity) && depth > 1) continue;
      visited.add(entity);

      // If this is not a direct target, it's a transitive inference
      if (depth > 1 && !directTargets.has(entity)) {
        const confidence = Math.max(0.5, 1 - (depth - 1) * 0.15); // Decay with depth
        inferred.push({
          from: startEntity,
          to: entity,
          kind: relationKind,
          confidence,
          reasoning: [
            {
              type: "transitive",
              description: `Transitive ${relationKind} through ${depth - 1} intermediate entities: ${path.join(" → ")}`,
              sourceFacts: path.slice(0, -1).map((_, i) => `${path[i]}→${path[i + 1]}`),
            },
          ],
          derivedAt: Date.now(),
        });
      }

      // Add next level to queue
      if (depth < maxDepth) {
        const nextTargets = adjacency.get(entity);
        if (nextTargets) {
          for (const next of nextTargets) {
            if (!visited.has(next)) {
              queue.push({ entity: next, depth: depth + 1, path: [...path, next] });
            }
          }
        }
      }
    }
  }

  logger.info("Transitive inference complete", {
    relationKind,
    inferredCount: inferred.length,
    durationMs: Date.now() - startTime,
  });

  return inferred;
}

/**
 * Infer all transitive relationships for common relation kinds.
 */
export async function inferAllTransitive(): Promise<InferenceResult> {
  const startTime = Date.now();
  const allFacts: InferredFact[] = [];

  // Transitive relation kinds
  const transitiveKinds: RelationKind[] = [
    "depends_on",
    "part_of",
    "member_of",
    "located_in",
  ];

  for (const kind of transitiveKinds) {
    const facts = await inferTransitive(kind);
    allFacts.push(...facts);
  }

  return {
    facts: allFacts,
    steps: allFacts.length,
    durationMs: Date.now() - startTime,
  };
}

// ─── Pattern Matching ───────────────────────────────────────────

/**
 * Find subgraphs matching a pattern.
 * Pattern is a list of triples: [subject_var, predicate, object_var]
 * Variables start with "?"
 */
export async function matchPattern(
  pattern: Array<[string, RelationKind | "*", string]>,
): Promise<PatternMatch[]> {
  const matches: PatternMatch[] = [];
  const allRelations = KnowledgeGraphService.listRelations();

  // Simple backtracking search
  function backtrack(
    patternIndex: number,
    bindings: Map<string, string>, // Variable -> entity ID
    relBindings: Map<string, string>, // Relation variable -> relation ID
  ) {
    if (patternIndex === pattern.length) {
      // Complete match found
      const entities = new Map<string, KGEntity>();
      const relations = new Map<string, KGRelation>();

      for (const [varName, entityId] of bindings.entries()) {
        const entity = KnowledgeGraphService.get(entityId);
        if (entity) entities.set(varName, entity);
      }

      for (const [varName, relId] of relBindings.entries()) {
        const rel = allRelations.find(r => r.id === relId);
        if (rel) relations.set(varName, rel);
      }

      matches.push({
        entities,
        relations,
        score: 1.0,
      });
      return;
    }

    const [subjVar, predicate, objVar] = pattern[patternIndex];

    // Try each relation
    for (const rel of allRelations) {
      // Check predicate match
      if (predicate !== "*" && rel.kind !== predicate) continue;

      // Check subject match
      if (subjVar.startsWith("?")) {
        // Variable - check if already bound
        const bound = bindings.get(subjVar);
        if (bound && bound !== rel.from) continue;
      } else {
        // Constant - must match exactly
        if (rel.from !== subjVar) continue;
      }

      // Check object match
      if (objVar.startsWith("?")) {
        const bound = bindings.get(objVar);
        if (bound && bound !== rel.to) continue;
      } else {
        if (rel.to !== objVar) continue;
      }

      // Bind variables and recurse
      const newBindings = new Map(bindings);
      const newRelBindings = new Map(relBindings);

      if (subjVar.startsWith("?")) newBindings.set(subjVar, rel.from);
      if (objVar.startsWith("?")) newBindings.set(objVar, rel.to);
      newRelBindings.set(`rel_${patternIndex}`, rel.id);

      backtrack(patternIndex + 1, newBindings, newRelBindings);
    }
  }

  backtrack(0, new Map(), new Map());

  logger.info("Pattern matching complete", {
    patternSize: pattern.length,
    matchesFound: matches.length,
  });

  return matches;
}

// ─── Fact Derivation ────────────────────────────────────────────

/**
 * Derive inverse relationships.
 * Example: if A part_of B, then B has_part A
 */
export async function deriveInverseRelations(): Promise<InferredFact[]> {
  const inferred: InferredFact[] = [];
  const allRelations = KnowledgeGraphService.listRelations();

  const inverseMap: Partial<Record<RelationKind, RelationKind>> = {
    part_of: "owns",
    depends_on: "used_by",
    member_of: "contains",
    created_by: "created",
    located_in: "contains_location",
  };

  for (const rel of allRelations) {
    const inverseKind = inverseMap[rel.kind];
    if (inverseKind) {
      inferred.push({
        from: rel.to,
        to: rel.from,
        kind: inverseKind,
        confidence: 1.0,
        reasoning: [
          {
            type: "rule",
            description: `Inverse of ${rel.kind}: if A ${rel.kind} B, then B ${inverseKind} A`,
            sourceFacts: [rel.id],
          },
        ],
        derivedAt: Date.now(),
      });
    }
  }

  logger.info("Inverse relation derivation complete", {
    inferredCount: inferred.length,
  });

  return inferred;
}

/**
 * Derive relationships from entity attributes.
 * Example: if entity has attribute "technology: React", create "uses" relationship to React entity
 */
export async function deriveFromAttributes(): Promise<InferredFact[]> {
  const inferred: InferredFact[] = [];
  const allEntities = KnowledgeGraphService.query({});

  for (const entity of allEntities) {
    const attrs = entity.attributes as Record<string, any>;

    // Look for technology references
    if (attrs.technology || attrs.technologies) {
      const techs = Array.isArray(attrs.technologies)
        ? attrs.technologies
        : attrs.technology
          ? [attrs.technology]
          : [];

      for (const tech of techs) {
        // Find entity with this name
        const techEntity = allEntities.find(
          e => e.name.toLowerCase() === tech.toLowerCase() && e.kind === "technology"
        );

        if (techEntity) {
          inferred.push({
            from: entity.id,
            to: techEntity.id,
            kind: "uses",
            confidence: 0.9,
            reasoning: [
              {
                type: "rule",
                description: `Entity ${entity.name} has attribute technology=${tech}, inferred uses relationship`,
              },
            ],
            derivedAt: Date.now(),
          });
        }
      }
    }
  }

  logger.info("Attribute-based derivation complete", {
    inferredCount: inferred.length,
  });

  return inferred;
}

// ─── Comprehensive Inference ────────────────────────────────────

/**
 * Run all inference rules to derive new facts.
 */
export async function runInference(): Promise<InferenceResult> {
  const startTime = Date.now();
  const allFacts: InferredFact[] = [];

  // 1. Transitive inference
  const transitive = await inferAllTransitive();
  allFacts.push(...transitive.facts);

  // 2. Inverse relations
  const inverse = await deriveInverseRelations();
  allFacts.push(...inverse);

  // 3. Attribute-based derivation
  const attrBased = await deriveFromAttributes();
  allFacts.push(...attrBased);

  // Deduplicate (same from, to, kind)
  const uniqueFacts = Array.from(
    new Map(
      allFacts.map(f => [`${f.from}:${f.to}:${f.kind}`, f])
    ).values()
  );

  const result: InferenceResult = {
    facts: uniqueFacts,
    steps: uniqueFacts.length,
    durationMs: Date.now() - startTime,
  };

  logger.info("Comprehensive inference complete", {
    totalFacts: uniqueFacts.length,
    transitive: transitive.facts.length,
    inverse: inverse.length,
    attrBased: attrBased.length,
    durationMs: result.durationMs,
  });

  return result;
}

/**
 * Add inferred facts to the knowledge graph.
 */
export async function applyInferredFacts(
  facts: InferredFact[],
): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;

  for (const fact of facts) {
    // Check if relation already exists
    const existing = KnowledgeGraphService.listRelations(fact.from)
      .find(r => r.to === fact.to && r.kind === fact.kind);

    if (existing) {
      skipped++;
      continue;
    }

    // Add to graph
    await KnowledgeGraphService.addRelation({
      from: fact.from,
      to: fact.to,
      kind: fact.kind,
      weight: fact.confidence,
      attributes: {
        inferred: true,
        reasoning: fact.reasoning,
        derivedAt: fact.derivedAt,
      },
      provenance: {
        source: "inference-engine",
      },
    });

    added++;
  }

  logger.info("Inferred facts applied to knowledge graph", {
    added,
    skipped,
  });

  return { added, skipped };
}

/**
 * Query inferred facts (relations with inferred=true attribute).
 */
export function queryInferredFacts(): KGRelation[] {
  const allRelations = KnowledgeGraphService.listRelations();
  return allRelations.filter(r => {
    const attrs = r.attributes as Record<string, any>;
    return attrs?.inferred === true;
  });
}
