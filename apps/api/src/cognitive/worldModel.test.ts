/**
 * Session 110 — Cognitive / World Model evidence register tests.
 *
 * Runs fully in-memory (FakeKv for Redis, FakePrisma for the Session 69
 * observability rollup). The properties pinned here are the ones the honesty
 * rules actually depend on: organization scoping, deterministic rollup maths,
 * an empty organization reporting nothing, labelled AI output, human-only
 * hypothesis resolution and an idempotent legacy migration.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";
import { FakePrisma } from "../testUtils/fakePrisma.js";

const kv = new FakeKv();
const db = new FakePrisma();
const dispatch = vi.fn(async () => ({}));
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisCommand: (_c: string, fn: () => unknown) => fn() }));
vi.mock("../db/client.js", () => ({ prisma: db.client() }));
vi.mock("../kernel/kernel.service.js", () => ({ KernelService: { dispatch } }));

const { CognitiveWorldModelService: World } = await import("./worldModel.service.js");
const { CognitiveService } = await import("./cognitive.service.js");
const {
  CogEntityCreateSchema,
  CogHypothesisCreateSchema,
  CogHypothesisResolveSchema,
  CogObservationCreateSchema,
} = await import("@windels/shared/cognitive");

const A = "org-cognitive-a";
const B = "org-cognitive-b";

const entityInput = (overrides: Record<string, unknown> = {}) => ({
  name: "Northwind Logistics", kind: "customer" as const, domain: "customers" as const,
  description: "Tier-1 logistics account", tags: ["tier-1"], ...overrides,
});
const observationInput = (overrides: Record<string, unknown> = {}) => ({
  topic: "Renewal risk", claim: "Procurement asked for a 12-month extension.",
  confidence: 0.6, evidence: ["email 2026-08-01"], source: "account call",
  domain: "customers" as const, ...overrides,
});

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
  db.reset();
  dispatch.mockClear();
});

describe("world-model CRUD", () => {
  it("creates entities with CSPRNG ids under org-scoped keys and lists them", async () => {
    const entity = await World.createEntity(A, entityInput(), "user-1");
    expect(entity.id).toMatch(/^cog_ent_[0-9a-f]{8}-/);
    expect(entity).toMatchObject({ name: "Northwind Logistics", kind: "customer", domain: "customers", createdBy: "user-1" });
    expect(entity).not.toHaveProperty("organizationId");
    expect(await World.listEntities(A)).toHaveLength(1);
    expect([...kv.hashes.keys()].some((key) => key === `cog:entity:i:${A}:${entity.id}`)).toBe(true);
  });

  it("records, reads, filters and deletes observations", async () => {
    const entity = await World.createEntity(A, entityInput());
    const observation = await World.recordObservation(A, observationInput({ entityId: entity.id }), "user-1");
    expect(observation.id).toMatch(/^cog_obs_[0-9a-f]{8}-/);
    expect(observation.confidenceKind).toBe("self_reported");
    expect(await World.getObservation(A, observation.id)).toMatchObject({ id: observation.id, entityId: entity.id });
    expect(await World.listObservations(A, { domain: "markets" })).toHaveLength(0);
    expect(await World.listObservations(A, { entityId: entity.id })).toHaveLength(1);
    expect(await World.deleteObservation(A, observation.id)).toBe(true);
    expect(await World.listObservations(A)).toHaveLength(0);
    expect(await World.deleteObservation(A, observation.id)).toBe(false);
  });

  it("updates an entity without moving it in the index and refuses to strand observations", async () => {
    const entity = await World.createEntity(A, entityInput());
    const updated = await World.updateEntity(A, entity.id, { name: "Northwind Group", tags: [] });
    expect(updated).toMatchObject({ id: entity.id, name: "Northwind Group", tags: [], createdAt: entity.createdAt });
    expect(updated!.updatedAt >= entity.updatedAt).toBe(true);

    await World.recordObservation(A, observationInput({ entityId: entity.id }));
    await expect(World.deleteEntity(A, entity.id)).rejects.toThrow(/still has 1 observation/);
    const [observation] = await World.listObservations(A, { entityId: entity.id });
    await World.deleteObservation(A, observation!.id);
    expect(await World.deleteEntity(A, entity.id)).toBe(true);
    expect(await World.getEntity(A, entity.id)).toBeNull();
  });

  it("rejects observations pointing at an entity that does not exist in the organization", async () => {
    const foreign = await World.createEntity(B, entityInput());
    await expect(World.recordObservation(A, observationInput({ entityId: foreign.id }))).rejects.toThrow("Entity not found");
    await expect(World.recordObservation(A, observationInput({ entityId: "cog_ent_missing" }))).rejects.toThrow("Entity not found");
  });
});

describe("tenant isolation", () => {
  it("never exposes another organization's entities, observations or hypotheses", async () => {
    const entity = await World.createEntity(A, entityInput());
    const observation = await World.recordObservation(A, observationInput());
    const hypothesis = await World.createHypothesis(A, { statement: "Renewal closes this quarter", domain: "customers", horizonMonths: 3 });

    expect(await World.listEntities(B)).toHaveLength(0);
    expect(await World.listObservations(B)).toHaveLength(0);
    expect(await World.listHypotheses(B)).toHaveLength(0);
    expect(await World.getEntity(B, entity.id)).toBeNull();
    expect(await World.getObservation(B, observation.id)).toBeNull();
    expect(await World.getHypothesis(B, hypothesis.id)).toBeNull();
    expect(await World.updateEntity(B, entity.id, { name: "hijacked" })).toBeNull();
    expect(await World.deleteEntity(B, entity.id)).toBe(false);
    expect(await World.deleteObservation(B, observation.id)).toBe(false);
    expect(await World.deleteHypothesis(B, hypothesis.id)).toBe(false);
    await expect(World.resolveHypothesis(B, hypothesis.id, "user-b", { resolution: "supported", note: "not mine" }))
      .rejects.toThrow("Hypothesis not found");
    // The A-side records are untouched by every rejected B-side attempt.
    expect(await World.listEntities(A)).toHaveLength(1);
    expect((await World.getHypothesis(A, hypothesis.id))!.status).toBe("open");
  });

  it("keeps a stored record invisible when its organization stamp does not match the key", async () => {
    const planted = { id: "cog_ent_planted", organizationId: B, name: "Planted", kind: "other", domain: "risk", description: null, tags: [], createdBy: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await kv.hset(`cog:entity:i:${A}:${planted.id}`, "_doc", JSON.stringify(planted));
    await kv.zadd(`cog:entity:idx:${A}`, Date.now(), planted.id);
    expect(await World.getEntity(A, planted.id)).toBeNull();
    expect(await World.listEntities(A)).toHaveLength(0);
  });
});

describe("computed rollup", () => {
  it("computes counts, evidence coverage, confidence average and blind spots from real records", async () => {
    const entity = await World.createEntity(A, entityInput());
    await World.createEntity(A, entityInput({ name: "Unwatched Competitor", kind: "competitor", domain: "competitors" }));
    await World.recordObservation(A, observationInput({ entityId: entity.id, confidence: 0.6, evidence: ["email"] }));
    await World.recordObservation(A, observationInput({ entityId: entity.id, confidence: 0.4, evidence: [], topic: "Pricing" }));
    await World.createHypothesis(A, { statement: "Account expands next quarter", domain: "customers", horizonMonths: 3 });

    const rollup = await World.worldModel(A);
    expect(rollup.entityCount).toBe(2);
    expect(rollup.observationCount).toBe(2);
    expect(rollup.hypothesisCount).toBe(1);
    expect(rollup.openHypotheses).toBe(1);
    expect(rollup.resolvedHypotheses).toBe(0);
    // 1 of 2 observations carries evidence; (0.6 + 0.4) / 2 = 50%.
    expect(rollup.observationsWithEvidence).toBe(1);
    expect(rollup.evidenceCoveragePct).toBe(50);
    expect(rollup.avgRecordedConfidencePct).toBe(50);
    expect(rollup.confidenceKind).toBe("self_reported_average");
    // The competitor entity has no observation — reported as a real gap.
    expect(rollup.entitiesWithoutObservations.map((item) => item.name)).toEqual(["Unwatched Competitor"]);
    const customers = rollup.domains.find((domain) => domain.domain === "customers")!;
    expect(customers).toMatchObject({ entities: 1, observations: 2, hypotheses: 1, openHypotheses: 1 });
    expect(rollup.coveredDomains).toBe(2);
    expect(rollup.uncoveredDomains).toContain("regulatory");
    expect(rollup.uncoveredDomains).not.toContain("customers");
  });

  it("returns identical results for repeated reads of an unchanged organization", async () => {
    const entity = await World.createEntity(A, entityInput());
    await World.recordObservation(A, observationInput({ entityId: entity.id }));
    await World.createHypothesis(A, { statement: "Supplier consolidates", domain: "supply_chain", horizonMonths: 12 });

    const first = await World.worldModel(A);
    const second = await World.worldModel(A);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("reports an empty organization as empty instead of inventing numbers", async () => {
    const rollup = await World.worldModel("org-cognitive-empty");
    expect(rollup.entityCount).toBe(0);
    expect(rollup.observationCount).toBe(0);
    expect(rollup.hypothesisCount).toBe(0);
    expect(rollup.evidenceCoveragePct).toBe(0);
    expect(rollup.avgRecordedConfidencePct).toBeNull();
    expect(rollup.confidenceKind).toBe("none");
    expect(rollup.lastObservationAt).toBeNull();
    expect(rollup.coveredDomains).toBe(0);
    expect(rollup.uncoveredDomains).toHaveLength(rollup.domains.length);
    expect(rollup.entitiesWithoutObservations).toEqual([]);
    expect(rollup.domains.every((domain) => domain.observations === 0 && domain.lastObservationAt === null)).toBe(true);
  });
});

describe("AI-assisted output labelling", () => {
  it("stores AI-assisted observations as advisory and counts them separately", async () => {
    await World.recordObservation(A, observationInput({ origin: "human" }));
    await World.recordObservation(A, observationInput({ origin: "integration", topic: "CRM sync" }));
    const assisted = await World.recordObservation(A, observationInput({ origin: "ai_assisted", topic: "Model summary" }));

    expect(assisted.origin).toBe("ai_assisted");
    expect(assisted.aiAssisted).toBe(true);
    expect(assisted.confidenceKind).toBe("self_reported");
    const rollup = await World.worldModel(A);
    expect(rollup.humanObservations).toBe(1);
    expect(rollup.integrationObservations).toBe(1);
    expect(rollup.aiAssistedObservations).toBe(1);
    // AI output is never promoted into a verdict of its own.
    expect(await World.listHypotheses(A)).toHaveLength(0);
    expect(rollup.note).toMatch(/self-reported/i);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "cognitive.observation_recorded" }));
  });
});

describe("hypotheses are resolved only by a human", () => {
  it("opens as open, records the resolver, and refuses a second resolution", async () => {
    const observation = await World.recordObservation(A, observationInput());
    const hypothesis = await World.createHypothesis(A, {
      statement: "Renewal closes above list price", domain: "customers", horizonMonths: 6,
      supportingObservationIds: [observation.id, "cog_obs_not_real"],
    }, "user-1");

    expect(hypothesis.status).toBe("open");
    expect(hypothesis.resolvedBy).toBeNull();
    // Unknown evidence ids are dropped rather than stored as phantom support.
    expect(hypothesis.supportingObservationIds).toEqual([observation.id]);

    const resolved = await World.resolveHypothesis(A, hypothesis.id, "user-2", { resolution: "supported", note: "Signed contract attached." });
    expect(resolved).toMatchObject({ status: "supported", resolvedBy: "user-2", resolutionNote: "Signed contract attached." });
    expect(resolved.resolvedAt).not.toBeNull();
    await expect(World.resolveHypothesis(A, hypothesis.id, "user-2", { resolution: "refuted", note: "changed my mind" }))
      .rejects.toThrow("already been resolved");
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ kind: "cognitive.hypothesis_resolved" }));

    const rollup = await World.worldModel(A);
    expect(rollup.openHypotheses).toBe(0);
    expect(rollup.resolvedHypotheses).toBe(1);
  });

  it("prunes deleted observations from the hypotheses that cited them", async () => {
    const observation = await World.recordObservation(A, observationInput());
    const hypothesis = await World.createHypothesis(A, {
      statement: "Churn risk is contained", domain: "risk", horizonMonths: 3,
      contradictingObservationIds: [observation.id],
    });
    expect((await World.getHypothesis(A, hypothesis.id))!.contradictingObservationIds).toEqual([observation.id]);
    await World.deleteObservation(A, observation.id);
    expect((await World.getHypothesis(A, hypothesis.id))!.contradictingObservationIds).toEqual([]);
  });
});

describe("legacy Session 69 observations", () => {
  it("migrates tenantStore envelopes in place, idempotently, without duplicating rows", async () => {
    const legacy = {
      id: "cog-legacy1", organizationId: A, createdAt: "2026-01-01T00:00:00.000Z", createdBy: "user-legacy",
      data: { topic: "Regulatory", claim: "New reporting rule lands in Q3", confidence: 0.8, evidence: ["gazette"], source: "counsel" },
    };
    await kv.hset(`cog:obs:i:${A}:${legacy.id}`, "_doc", JSON.stringify(legacy));
    await kv.zadd(`cog:obs:idx:${A}`, Date.parse(legacy.createdAt), legacy.id);

    const first = await World.listObservations(A);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      id: legacy.id, topic: "Regulatory", claim: "New reporting rule lands in Q3",
      confidence: 0.8, source: "counsel", origin: "human", aiAssisted: false,
      recordedBy: "user-legacy", domain: "enterprise", entityId: null, confidenceKind: "self_reported",
    });
    // Re-reading migrates nothing further and creates no duplicate record.
    const second = await World.listObservations(A);
    expect(second).toEqual(first);
    expect((await kv.zrange(`cog:obs:idx:${A}`, 0, -1))).toEqual([legacy.id]);
    const stored = JSON.parse((await kv.hget(`cog:obs:i:${A}:${legacy.id}`, "_doc"))!);
    expect(stored.data).toBeUndefined();
    expect(stored.claim).toBe("New reporting rule lands in Q3");
    expect(await World.worldModel(A)).toMatchObject({ observationCount: 1, avgRecordedConfidencePct: 80 });
  });
});

describe("contracts", () => {
  it("rejects invalid entity, observation and hypothesis input", () => {
    expect(CogEntityCreateSchema.safeParse(entityInput()).success).toBe(true);
    expect(CogEntityCreateSchema.safeParse(entityInput({ kind: "spaceship" })).success).toBe(false);
    expect(CogEntityCreateSchema.safeParse(entityInput({ domain: "vibes" })).success).toBe(false);
    expect(CogEntityCreateSchema.safeParse(entityInput({ name: "x" })).success).toBe(false);

    expect(CogObservationCreateSchema.safeParse(observationInput()).success).toBe(true);
    expect(CogObservationCreateSchema.safeParse(observationInput({ confidence: 1.5 })).success).toBe(false);
    expect(CogObservationCreateSchema.safeParse(observationInput({ origin: "psychic" })).success).toBe(false);
    expect(CogObservationCreateSchema.safeParse({ topic: "t", claim: "c" }).success).toBe(false);
    // `domain` and `origin` default rather than being guessed per record.
    const parsed = CogObservationCreateSchema.parse({ topic: "Topic", claim: "Claim", confidence: 0.1, source: "desk" });
    expect(parsed).toMatchObject({ domain: "enterprise", origin: "human", evidence: [] });

    expect(CogHypothesisCreateSchema.safeParse({ statement: "Markets cool", domain: "markets", horizonMonths: 6 }).success).toBe(true);
    expect(CogHypothesisCreateSchema.safeParse({ statement: "Markets cool", domain: "markets", horizonMonths: 0 }).success).toBe(false);
    expect(CogHypothesisResolveSchema.safeParse({ resolution: "supported", note: "evidence attached" }).success).toBe(true);
    // No "open" resolution and no note-less resolution: a human must say why.
    expect(CogHypothesisResolveSchema.safeParse({ resolution: "open", note: "n/a" }).success).toBe(false);
    expect(CogHypothesisResolveSchema.safeParse({ resolution: "supported" }).success).toBe(false);
  });
});

describe("Session 69 observability rollup stays intact", () => {
  it("still reports zeros for an empty organization and exposes the world model delegate", async () => {
    const dashboard = await CognitiveService.dashboard(A);
    expect(dashboard.reasoningAccuracyAvg).toBe(0);
    expect(dashboard.predictionsMade30d).toBe(0);
    expect(dashboard.observatoryHealthyPct).toBe(100);
    expect(dashboard.components).toEqual([]);
    expect(await CognitiveService.worldModel(A)).toEqual(await World.worldModel(A));
  });
});
