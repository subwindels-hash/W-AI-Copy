/**
 * Session 200 — AI Trust & Explainability tests (first dedicated suite).
 *
 * aiEcosystem shipped with no tests. trustExplainability.scoreResponse is a
 * deterministic trust-scoring engine: it derives a verification status and a
 * recommended action (blocked / requires-human-review / show-with-disclaimer /
 * auto-published) from evidence quality, corroboration, freshness, uncertainty
 * and policy compliance, and enqueues low-confidence responses for review.
 * This suite locks in those decision boundaries.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

const { TrustExplainabilityService: TS } = await import("./trustExplainability.service.js");

beforeEach(() => { kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear(); });

const goodEvidence = (n: number) => Array.from({ length: n }, (_, i) => ({
  source: `src-${i}`, sourceType: "document" as const, sourceQuality: "high" as const,
  dataFreshness: "fresh" as const, supportsClaim: true,
}));

describe("scoreResponse — verification status derivation", () => {
  it("marks strongly-corroborated fresh high-quality evidence as verified & auto-published", async () => {
    const s = await TS.scoreResponse({ responseId: "r1", evidence: goodEvidence(3) as any });
    expect(s.verificationStatus).toBe("verified");
    expect(s.corroboratingEvidencePct).toBe(100);
    expect(s.recommendedAction).toBe("auto-published");
    expect(s.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("marks partially-corroborated evidence as partially-verified with a disclaimer", async () => {
    const s = await TS.scoreResponse({ responseId: "r2", evidence: [
      { source: "a", sourceType: "document", sourceQuality: "medium", dataFreshness: "recent", supportsClaim: true },
      { source: "b", sourceType: "document", sourceQuality: "low", dataFreshness: "stale", supportsClaim: false },
    ] as any });
    expect(s.verificationStatus).toBe("partially-verified"); // 50% corroboration
    expect(["show-with-disclaimer", "requires-human-review"]).toContain(s.recommendedAction);
  });

  it("blocks a response that fails a compliance policy", async () => {
    const s = await TS.scoreResponse({ responseId: "r3", evidence: goodEvidence(3) as any,
      compliance: [{ policyId: "pii", policyName: "PII", passed: false, violations: ["ssn leaked"], riskLevel: "high" }] as any });
    expect(s.policyCompliant).toBe(false);
    expect(s.verificationStatus).toBe("disputed");
    expect(s.recommendedAction).toBe("blocked");
  });

  it("requires human review when there is no evidence at all", async () => {
    const s = await TS.scoreResponse({ responseId: "r4" });
    expect(s.evidenceCount).toBe(0);
    expect(s.recommendedAction).toBe("requires-human-review");
  });

  it("requires human review on a high-severity uncertainty signal and enqueues it", async () => {
    const s = await TS.scoreResponse({ responseId: "r5", evidence: goodEvidence(3) as any,
      uncertainty: [{ type: "conflicting-sources", severity: "high", description: "sources disagree" }] as any });
    expect(s.uncertaintyLevel).toBe("high");
    expect(s.recommendedAction).toBe("requires-human-review");
    const summary = await TS.summary();
    expect(summary.humanReviewQueue).toBeGreaterThanOrEqual(1);
  });

  it("honors an explicit verification/confidence override", async () => {
    const s = await TS.scoreResponse({ responseId: "r6", verification: "verified", overallConfidence: 0.9, evidence: goodEvidence(1) as any });
    expect(s.verificationStatus).toBe("verified");
    expect(s.confidence).toBe(0.9);
  });
});

describe("evidence quality math", () => {
  it("computes corroboration %, freshness and source-quality averages", async () => {
    const s = await TS.scoreResponse({ responseId: "r7", evidence: [
      { source: "a", sourceType: "document", sourceQuality: "high", dataFreshness: "fresh", supportsClaim: true },
      { source: "b", sourceType: "document", sourceQuality: "high", dataFreshness: "stale", supportsClaim: true },
      { source: "c", sourceType: "document", sourceQuality: "low", dataFreshness: "fresh", supportsClaim: false },
    ] as any });
    expect(s.corroboratingEvidencePct).toBe(67); // 2/3 support
    expect(s.freshnessScore).toBeCloseTo(2 / 3, 1); // 2/3 fresh-or-recent
    expect(s.sourceQualityAvg).toBeGreaterThan(0.5);
    expect(s.evidenceCount).toBe(3);
  });
});

describe("human review workflow", () => {
  it("approves a queued score, marks it verified, and dequeues it", async () => {
    const s = await TS.scoreResponse({ responseId: "r8" }); // no evidence -> queued
    const before = await TS.summary();
    expect(before.humanReviewQueue).toBeGreaterThanOrEqual(1);

    const approved = await TS.setHumanReview(s.id, "approved", "reviewer-1");
    expect(approved?.humanReviewOutcome).toBe("approved");
    expect(approved?.verificationStatus).toBe("verified");
    expect(approved?.humanReviewedBy).toBe("reviewer-1");

    const after = await TS.summary();
    expect(after.humanReviewQueue).toBe(before.humanReviewQueue - 1);
  });

  it("rejecting a score disputes it", async () => {
    const s = await TS.scoreResponse({ responseId: "r9" });
    const rejected = await TS.setHumanReview(s.id, "rejected", "reviewer-2");
    expect(rejected?.humanReviewOutcome).toBe("rejected");
    expect(rejected?.verificationStatus).toBe("disputed");
  });

  it("returns null when reviewing an unknown score", async () => {
    expect(await TS.setHumanReview("tr-nope", "approved")).toBeNull();
  });
});

describe("summary", () => {
  it("aggregates verified / blocked / policy-failure counts", async () => {
    await TS.scoreResponse({ responseId: "a", evidence: goodEvidence(3) as any }); // verified
    await TS.scoreResponse({ responseId: "b", evidence: goodEvidence(3) as any,
      compliance: [{ policyId: "p", policyName: "P", passed: false, violations: ["x"], riskLevel: "high" }] as any }); // blocked
    const sum = await TS.summary();
    expect(sum.trustScoredResponses24h).toBe(2);
    expect(sum.verifiedResponses24h).toBeGreaterThanOrEqual(1);
    expect(sum.blockedResponses24h).toBeGreaterThanOrEqual(1);
    expect(sum.policyFailures24h).toBeGreaterThanOrEqual(1);
  });
});
