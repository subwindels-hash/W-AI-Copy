/**
 * AI-decision explanations — org-scoped store + opex rollup.
 *
 * Backs the opex `explanations` field, which used to be a structural zero. Tests
 * pin real behaviour with FakeKv: tenant-scoped records, one-time challenges,
 * and a rollup whose figures (available24h / avgEvidence / avgConfidence /
 * challenged / challengedUpheld) come from stored records.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { ExplanationsRegistryService } = await import("./explanationsRegistry.service.js");

const ORG = "org-xpl";
const OTHER = "org-other";

function base(overrides: Record<string, unknown> = {}) {
  return { decisionId: "d1", decisionSummary: "Approved refund", confidence: 0.8, evidenceCount: 3, knowledgeSources: [], memoryTouches: 0, toolCalls: 0, policyChecks: [], risks: [], ...overrides } as any;
}

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("record + challenge (tenant-scoped)", () => {
  it("records an explanation and lists it within the org only", async () => {
    await ExplanationsRegistryService.record(ORG, base());
    expect(await ExplanationsRegistryService.list(ORG)).toHaveLength(1);
    expect(await ExplanationsRegistryService.list(OTHER)).toHaveLength(0);
  });

  it("challenges an explanation exactly once", async () => {
    const x = await ExplanationsRegistryService.record(ORG, base());
    const challenged = await ExplanationsRegistryService.challenge(ORG, x.id, "upheld", "reviewer-1", "sound");
    expect(challenged.id).toBe(x.id);
    await expect(ExplanationsRegistryService.challenge(ORG, x.id, "overturned", "reviewer-2")).rejects.toMatchObject({ status: 409 });
  });

  it("requires a challenging user and refuses cross-org / unknown targets", async () => {
    const x = await ExplanationsRegistryService.record(ORG, base());
    await expect(ExplanationsRegistryService.challenge(ORG, x.id, "upheld", "")).rejects.toMatchObject({ status: 400 });
    await expect(ExplanationsRegistryService.challenge(OTHER, x.id, "upheld", "r1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("rollup", () => {
  it("computes averages and challenge tallies from stored records", async () => {
    const a = await ExplanationsRegistryService.record(ORG, base({ confidence: 1.0, evidenceCount: 4 }));
    await ExplanationsRegistryService.record(ORG, base({ confidence: 0.5, evidenceCount: 2 }));
    await ExplanationsRegistryService.challenge(ORG, a.id, "upheld", "r1");

    const { summary } = await ExplanationsRegistryService.rollup(ORG);
    expect(summary.available24h).toBe(2);
    expect(summary.avgEvidence).toBe(3); // (4+2)/2
    expect(summary.avgConfidence).toBe(75); // (100+50)/2
    expect(summary.challenged).toBe(1);
    expect(summary.challengedUpheld).toBe(1);
  });

  it("counts an overturned challenge as challenged but not upheld", async () => {
    const a = await ExplanationsRegistryService.record(ORG, base());
    await ExplanationsRegistryService.challenge(ORG, a.id, "overturned", "r1");
    const { summary } = await ExplanationsRegistryService.rollup(ORG);
    expect(summary.challenged).toBe(1);
    expect(summary.challengedUpheld).toBe(0);
  });

  it("excludes records older than 24h from available24h", async () => {
    await ExplanationsRegistryService.record(ORG, base());
    const future = Date.now() + 48 * 3_600_000;
    const { summary } = await ExplanationsRegistryService.rollup(ORG, future);
    expect(summary.available24h).toBe(0);
  });

  it("returns an empty rollup for an org with no explanations", async () => {
    const { summary, recent } = await ExplanationsRegistryService.rollup(ORG);
    expect(summary).toEqual({ available24h: 0, avgEvidence: 0, avgConfidence: 0, challenged: 0, challengedUpheld: 0 });
    expect(recent).toEqual([]);
  });
});
