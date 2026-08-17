/**
 * Session 69 / 110 — Enterprise Cognitive Evolution & World Intelligence.
 *
 * Session 110 adds the `Cog*` world-model contracts: an evidence register of
 * entities, observations and hypotheses that an organization maintains about
 * its world. Everything in this file is deliberately conservative:
 *
 *   - a recorded `confidence` is always the *recorder's* self-reported number,
 *     never a system-computed likelihood (`confidenceKind: "self_reported"`);
 *   - AI-assisted observations are labelled (`origin: "ai_assisted"`,
 *     `aiAssisted: true`) and never silently mixed with human evidence;
 *   - hypotheses are only resolved by a human (`resolvedBy` is required) — the
 *     platform never decides that a statement is supported or refuted;
 *   - the rollup contains counts and shares computed from stored records only.
 */
import { z } from "zod";

export const WORLD_MODEL_DOMAINS = [
  "enterprise","customers","projects","markets","competitors","supply_chain",
  "financial","regulatory","infrastructure","global_events","risk","industry_trends",
] as const;
export type WorldModelDomain = typeof WORLD_MODEL_DOMAINS[number];

export interface SelfEvolutionMetric {
  component: string;
  health: number;        // 0..1
  bottleneck?: string;
  autoFixes: number;
  lastOptimizedAt: string;
  recommendation?: string;
}

export interface DnaProfile {
  companyIdentity: string;
  culture: string[];
  brandPersonality: string[];
  objectives: string[];
  ethics: string[];
  riskAppetite: "conservative"|"moderate"|"aggressive";
  communicationStyle: string;
  vocabulary: string[];
  vision: string;
}

export interface FederationPartner {
  id: string;
  name: string;
  type: "enterprise"|"government"|"academic"|"supplier"|"partner";
  trustTier: "bronze"|"silver"|"gold"|"platinum";
  sharedDatasets: number;
  sharedModels: number;
  federatedJobs30d: number;
  status: "active"|"pending"|"suspended";
}

export interface ObservatoryNode {
  category: "ai_employees"|"workforce"|"memory"|"knowledge_graph"|"gpu"|"infra"|"processes"|"security"|"digihumans"|"workflows"|"services"|"events";
  healthy: boolean;
  count: number;
  alerts: number;
}

export interface ReasoningCapability {
  domain: "logical"|"mathematical"|"scientific"|"financial"|"legal"|"medical"|"engineering"|"strategic"|"executive"|"emotional"|"ethical"|"creative"|"systems"|"spatial"|"probabilistic";
  accuracy: number;
  latencyMs: number;
  calls24h: number;
}

export interface MemoryLayer { layer: string; entries: number; accesses24h: number; sizeGb: number; }
export interface InnovationProposal { id: string; title: string; category: string; projectedValueUsd: number; risk: "low"|"med"|"high"; status: "proposed"|"reviewing"|"approved"|"rejected"|"executing"; }
export interface CivilizationEntity { id: string; kind: "citizen"|"team"|"department"|"org"; name: string; members?: number; lead?: string; }
export interface WorldScenario { id: string; name: string; domain: WorldModelDomain; horizonMonths: number; outcomeP50: string; outcomeP90: string; confidence: number; }

export interface CognitiveDashboard {
  selfEvolutionHealth: number | null;
  autoFixes30d: number | null;
  activeBottlenecks: number;
  dnaCompleteness: number | null;
  marketplaceUnifiedAssets: number | null;
  federationPartners: number | null;
  observatoryHealthyPct: number;
  observabilityNodes: number;
  reasoningAccuracyAvg: number;
  globalMemoryEntries: number;
  innovationProposalsOpen: number | null;
  innovationPipelineValueUsd: number | null;
  civilizationEntities: number | null;
  worldScenariosTracked: number | null;
  predictionsMade30d: number;
  predictionAccuracyPct: number;
  components: SelfEvolutionMetric[];
  partners: FederationPartner[];
  observatory: ObservatoryNode[];
  reasoning: ReasoningCapability[];
  memoryLayers: MemoryLayer[];
  innovations: InnovationProposal[];
  scenarios: WorldScenario[];
  provenance?: CognitiveProvenance;
}

export interface CognitiveProvenance {
  /** Marks which rolls are structural-null vs measured. */
  selfEvolutionHealth: "structural_null";
  autoFixes30d: "structural_null";
  dnaCompleteness: "structural_null";
  marketplaceUnifiedAssets: "structural_null";
  federationPartners: "structural_null";
  innovationProposalsOpen: "structural_null";
  innovationPipelineValueUsd: "structural_null";
  civilizationEntities: "structural_null";
  worldScenariosTracked: "structural_null";
  note: string;
}

// ─── Session 110 — World Model evidence register ───────────────────────────

/** What kind of thing an organization is modelling. */
export const COG_ENTITY_KINDS = [
  "customer", "competitor", "market", "supplier", "regulator",
  "technology", "internal_system", "partner", "other",
] as const;
export type CogEntityKind = (typeof COG_ENTITY_KINDS)[number];

/**
 * Where an observation came from. `ai_assisted` output is advisory: it is
 * stored and counted separately and is never presented as verified evidence.
 */
export const COG_OBSERVATION_ORIGINS = ["human", "integration", "ai_assisted"] as const;
export type CogObservationOrigin = (typeof COG_OBSERVATION_ORIGINS)[number];

/**
 * A hypothesis stays `open` until a human resolves it. There is no automatic
 * transition, no scoring model and no predicted outcome.
 */
export const COG_HYPOTHESIS_STATUSES = ["open", "supported", "refuted", "inconclusive"] as const;
export type CogHypothesisStatus = (typeof COG_HYPOTHESIS_STATUSES)[number];
export const COG_HYPOTHESIS_RESOLUTIONS = ["supported", "refuted", "inconclusive"] as const;
export type CogHypothesisResolution = (typeof COG_HYPOTHESIS_RESOLUTIONS)[number];

export interface CogEntity {
  id: string;
  name: string;
  kind: CogEntityKind;
  domain: WorldModelDomain;
  description: string | null;
  tags: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CogObservation {
  id: string;
  /** Optional link to a modelled entity; `null` for domain-level observations. */
  entityId: string | null;
  domain: WorldModelDomain;
  topic: string;
  claim: string;
  /** 0..1, as reported by whoever recorded the observation. */
  confidence: number;
  /** Always `self_reported` — the platform does not compute this number. */
  confidenceKind: "self_reported";
  evidence: string[];
  source: string;
  origin: CogObservationOrigin;
  /** Mirror of `origin === "ai_assisted"`, kept explicit for UI labelling. */
  aiAssisted: boolean;
  recordedBy: string | null;
  createdAt: string;
}

export interface CogHypothesis {
  id: string;
  statement: string;
  domain: WorldModelDomain;
  horizonMonths: number;
  status: CogHypothesisStatus;
  /** Observation ids a human attached as supporting/contradicting evidence. */
  supportingObservationIds: string[];
  contradictingObservationIds: string[];
  createdBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

export interface CogDomainCoverage {
  domain: WorldModelDomain;
  entities: number;
  observations: number;
  hypotheses: number;
  openHypotheses: number;
  /** ISO timestamp of the most recent observation, or `null` when uncovered. */
  lastObservationAt: string | null;
}

export interface CogEntityBlindSpot {
  id: string;
  name: string;
  kind: CogEntityKind;
  domain: WorldModelDomain;
}

/**
 * Deterministic projection over stored records. Repeated reads of an unchanged
 * organization return an identical object — no timestamps of "now", no random
 * numbers and no inferred intelligence.
 */
export interface CogWorldModelRollup {
  entityCount: number;
  observationCount: number;
  hypothesisCount: number;
  openHypotheses: number;
  resolvedHypotheses: number;
  humanObservations: number;
  integrationObservations: number;
  aiAssistedObservations: number;
  observationsWithEvidence: number;
  /** Integer 0..100 share of observations carrying at least one evidence item. */
  evidenceCoveragePct: number;
  /** Mean of the *recorded* confidences, or `null` when nothing is recorded. */
  avgRecordedConfidencePct: number | null;
  confidenceKind: "self_reported_average" | "none";
  /** Domains that have at least one entity, observation or hypothesis. */
  coveredDomains: number;
  /** Domains with no records at all — an honest gap, not a prediction. */
  uncoveredDomains: WorldModelDomain[];
  domains: CogDomainCoverage[];
  entitiesWithoutObservations: CogEntityBlindSpot[];
  lastObservationAt: string | null;
  /** Human-readable honesty statement rendered next to the numbers. */
  note: string;
}

// ─── Zod contracts ─────────────────────────────────────────────────────────

const domainSchema = z.enum(WORLD_MODEL_DOMAINS);
const idSchema = z.string().trim().min(3).max(96);

export const CogEntityCreateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  kind: z.enum(COG_ENTITY_KINDS),
  domain: domainSchema,
  description: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
});
export type CogEntityCreateInput = z.input<typeof CogEntityCreateSchema>;

export const CogEntityUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  kind: z.enum(COG_ENTITY_KINDS).optional(),
  domain: domainSchema.optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one entity field is required");
export type CogEntityUpdateInput = z.infer<typeof CogEntityUpdateSchema>;

export const CogEntityIdSchema = z.object({ id: idSchema });
export const CogEntityQuerySchema = z.object({
  domain: domainSchema.optional(),
  kind: z.enum(COG_ENTITY_KINDS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type CogEntityQuery = z.infer<typeof CogEntityQuerySchema>;

export const CogObservationCreateSchema = z.object({
  topic: z.string().trim().min(2).max(120),
  claim: z.string().trim().min(2).max(2000),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  source: z.string().trim().min(1).max(120),
  domain: domainSchema.default("enterprise"),
  entityId: idSchema.nullable().optional(),
  origin: z.enum(COG_OBSERVATION_ORIGINS).default("human"),
});
export type CogObservationCreateInput = z.input<typeof CogObservationCreateSchema>;

export const CogObservationIdSchema = z.object({ id: idSchema });
export const CogObservationQuerySchema = z.object({
  domain: domainSchema.optional(),
  entityId: idSchema.optional(),
  origin: z.enum(COG_OBSERVATION_ORIGINS).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type CogObservationQuery = z.infer<typeof CogObservationQuerySchema>;

export const CogHypothesisCreateSchema = z.object({
  statement: z.string().trim().min(4).max(500),
  domain: domainSchema,
  horizonMonths: z.number().int().min(1).max(120),
  supportingObservationIds: z.array(idSchema).max(50).default([]),
  contradictingObservationIds: z.array(idSchema).max(50).default([]),
});
export type CogHypothesisCreateInput = z.input<typeof CogHypothesisCreateSchema>;

export const CogHypothesisIdSchema = z.object({ id: idSchema });
export const CogHypothesisQuerySchema = z.object({
  domain: domainSchema.optional(),
  status: z.enum(COG_HYPOTHESIS_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type CogHypothesisQuery = z.infer<typeof CogHypothesisQuerySchema>;

/** Resolution is a human act: the outcome and a note are both required. */
export const CogHypothesisResolveSchema = z.object({
  resolution: z.enum(COG_HYPOTHESIS_RESOLUTIONS),
  note: z.string().trim().min(2).max(1000),
  supportingObservationIds: z.array(idSchema).max(50).optional(),
  contradictingObservationIds: z.array(idSchema).max(50).optional(),
});
export type CogHypothesisResolveInput = z.infer<typeof CogHypothesisResolveSchema>;
