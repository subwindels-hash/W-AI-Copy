/**
 * WINDELS AI OS — AI Marketing Intelligence service tests.
 *
 * Verifies the real, org-scoped behavior:
 *   - 28 specialized agents seed and are chat-routable
 *   - campaigns create + ingest real measured metrics (never fabricated)
 *   - copywriting returns honest `demo` when no AI provider is configured
 *   - personas create with real structure
 *   - A/B tests create, record variant metrics, declare a winner
 *   - dashboard aggregates real numbers and is org-scoped
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: { hasRealModelConfigured: () => false, complete: vi.fn(async () => ({ content: "mock", modelSource: "echo-demo" })) },
}));

const { MarketingService, MARKETING_AGENT_KEYS } = await import("./marketing.service.js");

const ORG = "org-mkt";
const OTHER = "org-other";
const USER = "user-1";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

describe("marketing agents", () => {
  it("seeds 28 specialized agents, all chat-routable", async () => {
    const agents = await MarketingService.listAgents(ORG);
    expect(agents.length).toBe(28);
    expect(agents.every((a) => a.routable === true)).toBe(true);
    const keys = agents.map((a) => a.key);
    expect(keys).toContain("copywriter");
    expect(keys).toContain("budget-optimizer");
    expect(keys).toContain("executive-advisor");
    expect(MARKETING_AGENT_KEYS.length).toBe(28);
  });

  it("runs an agent to a real decision", async () => {
    await MarketingService.listAgents(ORG);
    const res = await MarketingService.runAgent(ORG, "budget-optimizer");
    expect(res.verdict).toContain("no campaigns");
    const agent = await MarketingService.getAgent(ORG, "budget-optimizer");
    expect(agent.decisions24h).toBeGreaterThanOrEqual(1);
  });
});

describe("campaigns + metrics", () => {
  it("creates a campaign and ingests real measured metrics", async () => {
    const c = await MarketingService.createCampaign(ORG, USER, { name: "Launch", objective: "Signups", platform: "facebook", budgetMicros: 1_000_000 });
    expect(c.status).toBe("draft");
    const updated = await MarketingService.ingestMetrics(ORG, c.id, { impressions: 1000, clicks: 20, conversions: 3, spendMicros: 50_000_000, revenueMicros: 120_000_000 });
    expect(updated.metrics.impressions).toBe(1000);
    expect(updated.metrics.clicks).toBe(20);
    expect(updated.metrics.conversions).toBe(3);
    expect(updated.metrics.revenueMicros).toBe(120_000_000);
  });

  it("is org-scoped", async () => {
    const c = await MarketingService.createCampaign(ORG, USER, { name: "A", objective: "o", platform: "google_ads" });
    await expect(MarketingService.getCampaign(OTHER, c.id)).resolves.toBeNull();
    expect(await MarketingService.listCampaigns(OTHER)).toEqual([]);
  });
});

describe("copywriting", () => {
  it("returns honest demo copy when no provider is configured", async () => {
    const r = await MarketingService.generateCopy(ORG, { product: "CRM", audience: "founders", goal: "demo", framework: "aida" });
    expect(r.aiSource).toBe("demo");
    expect(r.framework).toBe("aida");
    expect(r.copy).toContain("CRM");
    expect(r.copy).toContain("DEMO");
  });
});

describe("personas", () => {
  it("creates a structured persona", async () => {
    const p = await MarketingService.createPersona(ORG, USER, { name: "Founder Sam", product: "CRM", audience: "founders" });
    expect(p.name).toBe("Founder Sam");
    expect(p.painPoints.length).toBeGreaterThan(0);
    expect(p.buyingTriggers.length).toBeGreaterThan(0);
  });
});

describe("A/B testing", () => {
  it("creates a test, records variant metrics, declares a winner", async () => {
    const c = await MarketingService.createCampaign(ORG, USER, { name: "A/B", objective: "o", platform: "tiktok" });
    const test = await MarketingService.createAbTest(ORG, { campaignId: c.id, name: "Headline test", variants: [{ name: "A", copy: "copy A" }, { name: "B", copy: "copy B" }] });
    expect(test.status).toBe("running");
    await MarketingService.recordAbVariantMetrics(ORG, test.id, test.variants[0]!.id, { impressions: 100, clicks: 5, conversions: 2 });
    await MarketingService.recordAbVariantMetrics(ORG, test.id, test.variants[1]!.id, { impressions: 100, clicks: 4, conversions: 1 });
    const done = await MarketingService.declareWinner(ORG, test.id);
    expect(done.status).toBe("completed");
    expect(done.winnerVariantId).toBe(test.variants[0]!.id);
  });
});

describe("dashboard", () => {
  it("aggregates real numbers and derives KPIs", async () => {
    await MarketingService.createCampaign(ORG, USER, { name: "A", objective: "o", platform: "facebook" });
    const c = await MarketingService.createCampaign(ORG, USER, { name: "B", objective: "o", platform: "youtube" });
    await MarketingService.ingestMetrics(ORG, c.id, { impressions: 1000, clicks: 50, conversions: 5, spendMicros: 100_000_000, revenueMicros: 300_000_000 });
    const d = await MarketingService.dashboard(ORG);
    expect(d.totalCampaigns).toBe(2);
    expect(d.totalImpressions).toBe(1000);
    expect(d.totalCtr).toBe(5);
    expect(d.roas).toBe(3);
    expect(d.cpaMicros).toBe(20_000_000);
    expect(d.byPlatform.youtube?.count).toBe(1);
  });
});
