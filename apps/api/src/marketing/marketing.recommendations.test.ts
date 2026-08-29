/**
 * Session 200 — deeper Marketing Intelligence coverage.
 *
 * The base suite covers agents, one campaign+metrics, copy, personas, one A/B
 * flow and the dashboard. This suite hardens the data-driven engines that were
 * unverified: campaign status/remove, metric accumulation, A/B winner logic
 * (explicit + auto-detect + accumulation) and the recommendations thresholds.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: { hasRealModelConfigured: () => false, complete: vi.fn(async () => ({ content: "mock", modelSource: "echo-demo" })) },
}));

const { MarketingService: M } = await import("./marketing.service.js");

const ORG = "org-mkt2";
const USER = "user-1";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

async function campaign(name = "C") {
  return M.createCampaign(ORG, USER, { name, objective: "o", platform: "facebook", budgetMicros: 1_000_000 });
}

describe("campaign status & lifecycle", () => {
  it("updates campaign status and removes it", async () => {
    const c = await campaign();
    expect(c.status).toBe("draft");
    const active = await M.updateCampaignStatus(ORG, c.id, "active");
    expect(active.status).toBe("active");
    await M.removeCampaign(ORG, c.id);
    expect(await M.getCampaign(ORG, c.id)).toBeNull();
    expect(await M.listCampaigns(ORG)).toEqual([]);
  });

  it("accumulates ingested metrics across multiple calls", async () => {
    const c = await campaign();
    await M.ingestMetrics(ORG, c.id, { impressions: 1000, clicks: 10, conversions: 1, spendMicros: 5_000, revenueMicros: 8_000 });
    const after = await M.ingestMetrics(ORG, c.id, { impressions: 500, clicks: 5, conversions: 2 });
    expect(after.metrics.impressions).toBe(1500);
    expect(after.metrics.clicks).toBe(15);
    expect(after.metrics.conversions).toBe(3);
    expect(after.metrics.revenueMicros).toBe(8_000);
  });

  it("throws when ingesting metrics for an unknown campaign", async () => {
    await expect(M.ingestMetrics(ORG, "nope", { impressions: 1 })).rejects.toMatchObject({ status: 404 });
  });
});

describe("A/B tests", () => {
  it("records variant metrics cumulatively and auto-detects the highest-conversion winner", async () => {
    const c = await campaign();
    const t = await M.createAbTest(ORG, { campaignId: c.id, name: "Headline test", variants: [{ name: "A", copy: "Copy A" }, { name: "B", copy: "Copy B" }] });
    const [vA, vB] = t.variants;
    await M.recordAbVariantMetrics(ORG, t.id, vA.id, { impressions: 1000, clicks: 50, conversions: 5 });
    await M.recordAbVariantMetrics(ORG, t.id, vA.id, { conversions: 1 }); // accumulate -> 6
    const withB = await M.recordAbVariantMetrics(ORG, t.id, vB.id, { impressions: 1000, clicks: 40, conversions: 9 });
    expect(withB.variants.find((v) => v.id === vA.id)?.conversions).toBe(6);

    const done = await M.declareWinner(ORG, t.id); // auto → B (9 > 6)
    expect(done.status).toBe("completed");
    expect(done.winnerVariantId).toBe(vB.id);
  });

  it("honors an explicitly declared winner", async () => {
    const c = await campaign();
    const t = await M.createAbTest(ORG, { campaignId: c.id, name: "T", variants: [{ name: "A", copy: "a" }, { name: "B", copy: "b" }] });
    const done = await M.declareWinner(ORG, t.id, t.variants[0].id);
    expect(done.winnerVariantId).toBe(t.variants[0].id);
  });

  it("errors on unknown test or variant", async () => {
    await expect(M.recordAbVariantMetrics(ORG, "nope", "v", {})).rejects.toMatchObject({ status: 404 });
    const c = await campaign();
    const t = await M.createAbTest(ORG, { campaignId: c.id, name: "T", variants: [{ name: "A", copy: "a" }] });
    await expect(M.recordAbVariantMetrics(ORG, t.id, "no-variant", {})).rejects.toMatchObject({ status: 404 });
  });
});

describe("recommendations engine (data-driven thresholds)", () => {
  it("flags impressions with zero clicks as a creative issue", async () => {
    const c = await campaign("NoClicks");
    await M.ingestMetrics(ORG, c.id, { impressions: 5000, clicks: 0 });
    const recs = await M.generateRecommendations(ORG);
    const r = recs.find((x) => x.campaignId === c.id);
    expect(r?.kind).toBe("creative");
    expect(r?.priority).toBe("high");
  });

  it("flags a low CTR as a copy issue", async () => {
    const c = await campaign("LowCTR");
    await M.ingestMetrics(ORG, c.id, { impressions: 10000, clicks: 20 }); // 0.2% CTR
    const recs = await M.generateRecommendations(ORG);
    expect(recs.find((x) => x.campaignId === c.id)?.kind).toBe("copy");
  });

  it("recommends scaling a healthy campaign", async () => {
    const c = await campaign("Healthy");
    await M.ingestMetrics(ORG, c.id, { impressions: 10000, clicks: 500, conversions: 50 }); // 5% CTR
    const recs = await M.generateRecommendations(ORG);
    expect(recs.some((x) => x.campaignId === c.id && x.kind === "scale")).toBe(true);
  });

  it("flags ROAS below 1 as a budget issue", async () => {
    const c = await campaign("BadRoas");
    await M.ingestMetrics(ORG, c.id, { impressions: 1000, clicks: 100, conversions: 5, spendMicros: 100_000, revenueMicros: 40_000 });
    const recs = await M.generateRecommendations(ORG);
    expect(recs.some((x) => x.campaignId === c.id && x.kind === "budget")).toBe(true);
  });

  it("persists recommendations for later listing and is org-scoped", async () => {
    const c = await campaign("NoClicks");
    await M.ingestMetrics(ORG, c.id, { impressions: 5000, clicks: 0 });
    await M.generateRecommendations(ORG);
    const listed = await M.listRecommendations(ORG);
    expect(listed.length).toBeGreaterThan(0);
    expect(await M.listRecommendations("org-elsewhere")).toEqual([]);
  });

  it("produces no recommendations for a fresh org", async () => {
    expect(await M.generateRecommendations(ORG)).toEqual([]);
  });
});
