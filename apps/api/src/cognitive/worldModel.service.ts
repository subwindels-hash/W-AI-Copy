/**
 * Session 110 — Cognitive / World Model evidence register.
 *
 * The Session 69 cognitive surface only exposed a platform observability
 * rollup plus a flat "observations" blob store. This service completes the
 * module as a real, organization-scoped world model:
 *
 *   - **Entities** — the customers, competitors, markets, suppliers,
 *     regulators, technologies and internal systems an organization models.
 *   - **Observations** — evidence-backed claims about an entity or a domain.
 *     `confidence` is always the recorder's own number and is labelled
 *     `self_reported`; AI-assisted entries are stored with
 *     `origin: "ai_assisted"` and counted separately.
 *   - **Hypotheses** — forward-looking statements that stay `open` until a
 *     *human* resolves them. Nothing in this service decides an outcome,
 *     scores a likelihood or predicts a result.
 *   - **Rollup** — a deterministic projection (counts, shares, coverage,
 *     blind spots) computed from the stored records on every read. An empty
 *     organization reports zeros and nulls, never plausible numbers.
 *
 * Keys (all org-scoped, audited by the Session 89 namespace sweep):
 *   cog:meta:i:<org>:register
 *   cog:entity:i:<org>:<id>      cog:entity:idx:<org>
 *   cog:obs:i:<org>:<id>         cog:obs:idx:<org>
 *   cog:hypothesis:i:<org>:<id>  cog:hypothesis:idx:<org>
 *
 * The observation keys are intentionally the same shape the Session 69
 * `tenantStore({ prefix: "cog:obs" })` used, so historical records are
 * upgraded in place (idempotently) rather than orphaned.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { Logger } from "pino";
import { AppError } from "../utils/result.js";
import {
  WORLD_MODEL_DOMAINS,
  type CogDomainCoverage,
  type CogEntity,
  type CogEntityBlindSpot,
  type CogEntityCreateInput,
  type CogEntityKind,
  type CogEntityQuery,
  type CogEntityUpdateInput,
  type CogHypothesis,
  type CogHypothesisCreateInput,
  type CogHypothesisQuery,
  type CogHypothesisResolveInput,
  type CogObservation,
  type CogObservationCreateInput,
  type CogObservationOrigin,
  type CogObservationQuery,
  type CogWorldModelRollup,
  type WorldModelDomain,
} from "@windels/shared/cognitive";

type Entity = "meta" | "entity" | "obs" | "hypothesis";
type Owned<T> = T & { organizationId: string };
type EntityRecord = Owned<CogEntity>;
type ObservationRecord = Owned<CogObservation>;
type HypothesisRecord = Owned<CogHypothesis>;

const K = {
  item: (entity: Entity, org: string, id: string) => `cog:${entity}:i:${org}:${id}`,
  index: (entity: Entity, org: string) => `cog:${entity}:idx:${org}`,
};

const ROLLUP_NOTE =
  "Counts are computed from stored records only. Confidence is the value each recorder entered (self-reported, never inferred); AI-assisted observations are counted separately and hypotheses are resolved only by a named human.";

const parse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};

/** CSPRNG identifiers — never a counter, a timestamp or Math.random. */
const entityId = () => `cog_ent_${randomUUID()}`;
const observationId = () => `cog_obs_${randomUUID()}`;
const hypothesisId = () => `cog_hyp_${randomUUID()}`;

const strip = <T extends { organizationId: string }>(record: T): Omit<T, "organizationId"> => {
  const { organizationId: _organizationId, ...rest } = record;
  return rest;
};

const clampConfidence = (value: unknown): number => {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, numeric));
};

const isDomain = (value: unknown): value is WorldModelDomain =>
  typeof value === "string" && (WORLD_MODEL_DOMAINS as readonly string[]).includes(value);

async function writeItem<T extends { id: string; createdAt?: string }>(entity: Entity, org: string, value: T): Promise<void> {
  await redis.hset(K.item(entity, org, value.id), "_doc", JSON.stringify({ ...value, organizationId: org }));
  await redis.zadd(K.index(entity, org), Date.parse(value.createdAt ?? "") || Date.now(), value.id);
}

/** Fail-closed read: a record whose stored organization differs is invisible. */
async function readOwned<T extends { organizationId: string }>(entity: Entity, org: string, id: string): Promise<T | null> {
  const value = parse<T>(await redis.hget(K.item(entity, org, id), "_doc"));
  return value && value.organizationId === org ? value : null;
}

async function ids(entity: Entity, org: string): Promise<string[]> {
  return redis.zrange(K.index(entity, org), 0, -1);
}

/**
 * Session 69 stored observations as `tenantStore` envelopes
 * (`{ id, organizationId, createdAt, createdBy, data: { … } }`) with no
 * domain, origin or entity link. Normalize such a record into the Session 110
 * shape. Re-running this on an already-normalized record is a no-op, so the
 * migration is idempotent.
 */
function normalizeObservation(org: string, raw: Record<string, unknown>): { record: ObservationRecord; upgraded: boolean } | null {
  const legacyData = (raw.data && typeof raw.data === "object" ? raw.data : null) as Record<string, unknown> | null;
  const flat = (legacyData ?? raw) as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id : null;
  const claim = typeof flat.claim === "string" ? flat.claim : null;
  if (!id || !claim) return null;
  const origin = (typeof flat.origin === "string" && ["human", "integration", "ai_assisted"].includes(flat.origin)
    ? flat.origin
    : "human") as CogObservationOrigin;
  const record: ObservationRecord = {
    id,
    organizationId: org,
    entityId: typeof flat.entityId === "string" ? flat.entityId : null,
    // A legacy record carries no domain. `enterprise` is the register's
    // default bucket, not an inference about the observation's subject.
    domain: isDomain(flat.domain) ? flat.domain : "enterprise",
    topic: typeof flat.topic === "string" ? flat.topic : "untitled",
    claim,
    confidence: clampConfidence(flat.confidence),
    confidenceKind: "self_reported",
    evidence: Array.isArray(flat.evidence) ? flat.evidence.filter((item): item is string => typeof item === "string") : [],
    source: typeof flat.source === "string" ? flat.source : "unrecorded",
    origin,
    aiAssisted: origin === "ai_assisted",
    recordedBy: typeof raw.createdBy === "string" ? raw.createdBy
      : typeof flat.recordedBy === "string" ? flat.recordedBy : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
  };
  return { record, upgraded: legacyData !== null };
}

async function readObservation(org: string, id: string): Promise<ObservationRecord | null> {
  const raw = parse<Record<string, unknown>>(await redis.hget(K.item("obs", org, id), "_doc"));
  if (!raw) return null;
  if (typeof raw.organizationId === "string" && raw.organizationId !== org) return null;
  const normalized = normalizeObservation(org, raw);
  if (!normalized) return null;
  if (normalized.upgraded) await writeItem("obs", org, normalized.record);
  return normalized.record;
}

async function emitKernel(kind: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const { KernelService } = await import("../kernel/kernel.service.js");
    await KernelService.dispatch({ source: "cognitive", kind, payload });
  } catch { /* best effort — a telemetry failure must not fail the write */ }
}

async function ensureRegister(org: string, logger?: Logger): Promise<void> {
  const key = K.item("meta", org, "register");
  if (!(await redis.exists(key))) {
    await writeItem("meta", org, { id: "register", createdAt: new Date().toISOString() });
    logger?.info?.({ msg: "[cognitive] world-model register initialized", organizationId: org });
  }
}

export const CognitiveWorldModelService = {
  async ensureBootstrapped(logger?: Logger, oid = "org-windels"): Promise<void> {
    await ensureRegister(oid, logger);
  },

  // ── Entities ─────────────────────────────────────────────────────────────

  async createEntity(oid: string, input: CogEntityCreateInput, createdBy?: string): Promise<CogEntity> {
    await ensureRegister(oid);
    const now = new Date().toISOString();
    const record: EntityRecord = {
      id: entityId(),
      organizationId: oid,
      name: input.name,
      kind: input.kind as CogEntityKind,
      domain: input.domain as WorldModelDomain,
      description: input.description ?? null,
      tags: input.tags ?? [],
      createdBy: createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await writeItem("entity", oid, record);
    await emitKernel("cognitive.entity_created", { organizationId: oid, entityId: record.id, kind: record.kind, domain: record.domain });
    return strip(record);
  },

  async listEntities(oid: string, query: Partial<CogEntityQuery> = {}): Promise<CogEntity[]> {
    await ensureRegister(oid);
    const rows: EntityRecord[] = [];
    for (const id of await ids("entity", oid)) {
      const row = await readOwned<EntityRecord>("entity", oid, id);
      if (row) rows.push(row);
    }
    return rows
      .filter((row) => (!query.domain || row.domain === query.domain) && (!query.kind || row.kind === query.kind))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, query.limit ?? 100)
      .map(strip);
  },

  async getEntity(oid: string, id: string): Promise<CogEntity | null> {
    const row = await readOwned<EntityRecord>("entity", oid, id);
    return row ? strip(row) : null;
  },

  async updateEntity(oid: string, id: string, patch: CogEntityUpdateInput): Promise<CogEntity | null> {
    const current = await readOwned<EntityRecord>("entity", oid, id);
    if (!current) return null;
    const next: EntityRecord = {
      ...current,
      ...patch,
      description: patch.description === undefined ? current.description : patch.description,
      tags: patch.tags === undefined ? current.tags : patch.tags,
      organizationId: oid,
      // `createdAt` is the index score; keep it stable so ordering never moves.
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await writeItem("entity", oid, next);
    return strip(next);
  },

  /**
   * Deleting an entity that still carries observations is refused rather than
   * silently detaching evidence — the operator decides what happens to the
   * records, not the platform.
   */
  async deleteEntity(oid: string, id: string): Promise<boolean> {
    const current = await readOwned<EntityRecord>("entity", oid, id);
    if (!current) return false;
    const linked = await this.listObservations(oid, { entityId: id, limit: 500 });
    if (linked.length > 0) {
      throw AppError.conflict(`Entity still has ${linked.length} observation(s); delete or re-link them first`);
    }
    await redis.del(K.item("entity", oid, id));
    await redis.zrem(K.index("entity", oid), id);
    return true;
  },

  // ── Observations ─────────────────────────────────────────────────────────

  async recordObservation(oid: string, input: CogObservationCreateInput, recordedBy?: string): Promise<CogObservation> {
    await ensureRegister(oid);
    if (input.entityId) {
      const entity = await readOwned<EntityRecord>("entity", oid, input.entityId);
      if (!entity) throw AppError.notFound("Entity not found");
    }
    const origin = (input.origin ?? "human") as CogObservationOrigin;
    const record: ObservationRecord = {
      id: observationId(),
      organizationId: oid,
      entityId: input.entityId ?? null,
      domain: (input.domain ?? "enterprise") as WorldModelDomain,
      topic: input.topic,
      claim: input.claim,
      confidence: clampConfidence(input.confidence),
      confidenceKind: "self_reported",
      evidence: input.evidence ?? [],
      source: input.source,
      origin,
      aiAssisted: origin === "ai_assisted",
      recordedBy: recordedBy ?? null,
      createdAt: new Date().toISOString(),
    };
    await writeItem("obs", oid, record);
    await emitKernel("cognitive.observation_recorded", {
      organizationId: oid, observationId: record.id, domain: record.domain,
      origin: record.origin, aiAssisted: record.aiAssisted,
    });
    return strip(record);
  },

  async listObservations(oid: string, query: Partial<CogObservationQuery> = {}): Promise<CogObservation[]> {
    await ensureRegister(oid);
    const rows: ObservationRecord[] = [];
    for (const id of await ids("obs", oid)) {
      const row = await readObservation(oid, id);
      if (row) rows.push(row);
    }
    return rows
      .filter((row) => (!query.domain || row.domain === query.domain)
        && (!query.entityId || row.entityId === query.entityId)
        && (!query.origin || row.origin === query.origin))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, query.limit ?? 200)
      .map(strip);
  },

  async getObservation(oid: string, id: string): Promise<CogObservation | null> {
    const row = await readObservation(oid, id);
    return row ? strip(row) : null;
  },

  /**
   * Deleting an observation also prunes it from every hypothesis that cited
   * it, so no hypothesis keeps a reference to evidence that no longer exists.
   */
  async deleteObservation(oid: string, id: string): Promise<boolean> {
    const current = await readObservation(oid, id);
    if (!current) return false;
    await redis.del(K.item("obs", oid, id));
    await redis.zrem(K.index("obs", oid), id);
    for (const hypothesisKey of await ids("hypothesis", oid)) {
      const hypothesis = await readOwned<HypothesisRecord>("hypothesis", oid, hypothesisKey);
      if (!hypothesis) continue;
      const supporting = hypothesis.supportingObservationIds.filter((item) => item !== id);
      const contradicting = hypothesis.contradictingObservationIds.filter((item) => item !== id);
      if (supporting.length !== hypothesis.supportingObservationIds.length
        || contradicting.length !== hypothesis.contradictingObservationIds.length) {
        await writeItem("hypothesis", oid, { ...hypothesis, supportingObservationIds: supporting, contradictingObservationIds: contradicting });
      }
    }
    return true;
  },

  // ── Hypotheses ───────────────────────────────────────────────────────────

  async createHypothesis(oid: string, input: CogHypothesisCreateInput, createdBy?: string): Promise<CogHypothesis> {
    await ensureRegister(oid);
    const supporting = await this.filterKnownObservations(oid, input.supportingObservationIds ?? []);
    const contradicting = await this.filterKnownObservations(oid, input.contradictingObservationIds ?? []);
    const record: HypothesisRecord = {
      id: hypothesisId(),
      organizationId: oid,
      statement: input.statement,
      domain: input.domain as WorldModelDomain,
      horizonMonths: input.horizonMonths,
      // Always open on creation: the platform never pre-judges a hypothesis.
      status: "open",
      supportingObservationIds: supporting,
      contradictingObservationIds: contradicting,
      createdBy: createdBy ?? null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
    };
    await writeItem("hypothesis", oid, record);
    return strip(record);
  },

  /** Keeps only observation ids that really exist inside this organization. */
  async filterKnownObservations(oid: string, candidates: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const id of candidates) {
      if (out.includes(id)) continue;
      if (await readObservation(oid, id)) out.push(id);
    }
    return out;
  },

  async listHypotheses(oid: string, query: Partial<CogHypothesisQuery> = {}): Promise<CogHypothesis[]> {
    await ensureRegister(oid);
    const rows: HypothesisRecord[] = [];
    for (const id of await ids("hypothesis", oid)) {
      const row = await readOwned<HypothesisRecord>("hypothesis", oid, id);
      if (row) rows.push(row);
    }
    return rows
      .filter((row) => (!query.domain || row.domain === query.domain) && (!query.status || row.status === query.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, query.limit ?? 100)
      .map(strip);
  },

  async getHypothesis(oid: string, id: string): Promise<CogHypothesis | null> {
    const row = await readOwned<HypothesisRecord>("hypothesis", oid, id);
    return row ? strip(row) : null;
  },

  /**
   * A hypothesis is resolved by a named human with a written note. There is no
   * automated path into `supported`/`refuted`/`inconclusive`.
   */
  async resolveHypothesis(oid: string, id: string, resolvedBy: string, input: CogHypothesisResolveInput): Promise<CogHypothesis> {
    const current = await readOwned<HypothesisRecord>("hypothesis", oid, id);
    if (!current) throw AppError.notFound("Hypothesis not found");
    if (current.status !== "open") throw AppError.conflict("Hypothesis has already been resolved");
    if (!resolvedBy) throw AppError.badRequest("A resolving user is required");
    const next: HypothesisRecord = {
      ...current,
      status: input.resolution,
      supportingObservationIds: input.supportingObservationIds
        ? await this.filterKnownObservations(oid, input.supportingObservationIds)
        : current.supportingObservationIds,
      contradictingObservationIds: input.contradictingObservationIds
        ? await this.filterKnownObservations(oid, input.contradictingObservationIds)
        : current.contradictingObservationIds,
      resolvedAt: new Date().toISOString(),
      resolvedBy,
      resolutionNote: input.note,
    };
    await writeItem("hypothesis", oid, next);
    await emitKernel("cognitive.hypothesis_resolved", {
      organizationId: oid, hypothesisId: id, resolution: next.status, resolvedBy,
    });
    return strip(next);
  },

  async deleteHypothesis(oid: string, id: string): Promise<boolean> {
    const current = await readOwned<HypothesisRecord>("hypothesis", oid, id);
    if (!current) return false;
    await redis.del(K.item("hypothesis", oid, id));
    await redis.zrem(K.index("hypothesis", oid), id);
    return true;
  },

  // ── Deterministic rollup ─────────────────────────────────────────────────

  /**
   * Pure projection over the stored register. No `Math.random`, no wall-clock
   * arithmetic and no inferred conclusions, so two consecutive reads of an
   * unchanged organization are byte-identical.
   */
  async worldModel(oid: string): Promise<CogWorldModelRollup> {
    const [entities, observations, hypotheses] = await Promise.all([
      this.listEntities(oid, { limit: 200 }),
      this.listObservations(oid, { limit: 500 }),
      this.listHypotheses(oid, { limit: 200 }),
    ]);

    const domains: CogDomainCoverage[] = WORLD_MODEL_DOMAINS.map((domain) => {
      const domainObservations = observations.filter((observation) => observation.domain === domain);
      const domainHypotheses = hypotheses.filter((hypothesis) => hypothesis.domain === domain);
      const timestamps = domainObservations.map((observation) => observation.createdAt).sort();
      return {
        domain,
        entities: entities.filter((entity) => entity.domain === domain).length,
        observations: domainObservations.length,
        hypotheses: domainHypotheses.length,
        openHypotheses: domainHypotheses.filter((hypothesis) => hypothesis.status === "open").length,
        lastObservationAt: timestamps.at(-1) ?? null,
      } satisfies CogDomainCoverage;
    });

    const withEvidence = observations.filter((observation) => observation.evidence.length > 0).length;
    const confidenceSum = observations.reduce((total, observation) => total + observation.confidence, 0);
    const entitiesWithObservations = new Set(observations.map((observation) => observation.entityId).filter((id): id is string => !!id));
    const blindSpots: CogEntityBlindSpot[] = entities
      .filter((entity) => !entitiesWithObservations.has(entity.id))
      .map((entity) => ({ id: entity.id, name: entity.name, kind: entity.kind, domain: entity.domain }));
    const allTimestamps = observations.map((observation) => observation.createdAt).sort();

    return {
      entityCount: entities.length,
      observationCount: observations.length,
      hypothesisCount: hypotheses.length,
      openHypotheses: hypotheses.filter((hypothesis) => hypothesis.status === "open").length,
      resolvedHypotheses: hypotheses.filter((hypothesis) => hypothesis.status !== "open").length,
      humanObservations: observations.filter((observation) => observation.origin === "human").length,
      integrationObservations: observations.filter((observation) => observation.origin === "integration").length,
      aiAssistedObservations: observations.filter((observation) => observation.origin === "ai_assisted").length,
      observationsWithEvidence: withEvidence,
      evidenceCoveragePct: observations.length ? Math.round((withEvidence / observations.length) * 100) : 0,
      avgRecordedConfidencePct: observations.length ? Math.round((confidenceSum / observations.length) * 100) : null,
      confidenceKind: observations.length ? "self_reported_average" : "none",
      coveredDomains: domains.filter((domain) => domain.entities + domain.observations + domain.hypotheses > 0).length,
      uncoveredDomains: domains.filter((domain) => domain.entities + domain.observations + domain.hypotheses === 0).map((domain) => domain.domain),
      domains,
      entitiesWithoutObservations: blindSpots,
      lastObservationAt: allTimestamps.at(-1) ?? null,
      note: ROLLUP_NOTE,
    } satisfies CogWorldModelRollup;
  },
};
