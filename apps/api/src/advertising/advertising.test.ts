/**
 * WINDELS AI OS — AI Advertising Platform tests.
 *
 * Pins the honesty and mode-rule properties that keep the platform a SINGLE
 * advertising system rather than four disconnected ones:
 *
 *   - a campaign carries mode + billing + automation and everything else is shared;
 *   - performance mode requires eligibility (config + supported billing mode);
 *   - performance conversions are only payable after fraud checks pass (proof
 *     required, value sanity enforced), and rejected events never become revenue;
 *   - AI generation is only allowed for smart/autonomous modes and is flagged
 *     `aiSource: "demo"` when no real provider is configured (honest labeling);
 *   - the autonomous cycle only acts on an active autonomous campaign, and logs
 *     every action it takes;
 *   - the dashboard surfaces mode, automation, billing, health, attribution and
 *     fraud state from the same record.
 *
 * Redis is substituted with FakeKv (no infrastructure required).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { FakeKv } from "../mediaFactory/publishing/fakeKv.js";

const kv = new FakeKv();
vi.mock("../db/redis.js", () => ({ redis: kv, redisCmd: kv, redisSub: kv }));

// The real AI registry transitively imports @prisma/client (which needs the
// generated client / engine). We only rely on provider-configuration detection
// and complete() here, so substitute it: no real provider → honest "demo" source.
vi.mock("../services/ai/registry.js", () => ({
  aiRegistry: {
    hasRealModelConfigured: () => false,
    complete: vi.fn(async () => ({ content: "mock", modelSource: "echo-demo" })),
  },
}));

const { AdvertisingService } = await import("./advertising.service.js");

const ORG = "org-ads";
const USER = "user-1";

beforeEach(() => {
  kv.strings.clear(); kv.hashes.clear(); kv.zsets.clear(); kv.lists.clear(); kv.sets.clear();
});

const base = {
  name: "Summer launch",
  objective: "Drive qualified signups",
  budgetMicros: 1_000_000_000, // $1000
  currency: "USD",
};

describe("campaign creation across modes", () => {
  it("creates a standard campaign with shared record shape", async () => {
    const c = await AdvertisingService.create(ORG, USER, { ...base, campaignMode: "standard" });
    expect(c.campaignMode).toBe("standard");
    expect(c.billingMode).toBe("standard");
    expect(c.automationLevel).toBe("manual");
    expect(c.status).toBe("draft");
    expect(c.metrics).toEqual({ impressions: 0, clicks: 0, conversions: 0, spendMicros: 0, revenueMicros: 0 });
    expect(c.optimizationHistory).toEqual([]);
    expect(c.auditLog[0]?.action).toBe("campaign.created");
  });

  it("defaults smart → assistant and autonomous → autonomous automation", async () => {
    const smart = await AdvertisingService.create(ORG, USER, { ...base, campaignMode: "smart" });
    const auto = await AdvertisingService.create(ORG, USER, { ...base, campaignMode: "autonomous" });
    expect(smart.automationLevel).toBe("assistant");
    expect(auto.automationLevel).toBe("autonomous");
  });

  it("lists campaigns org-scoped (other orgs invisible)", async () => {
    await AdvertisingService.create(ORG, USER, { ...base, campaignMode: "standard" });
    await AdvertisingService.create("org-other", USER, { ...base, campaignMode: "standard" });
    const list = await AdvertisingService.list(ORG);
    expect(list.length).toBe(1);
  });
});

describe("performance mode", () => {
  it("rejects performance mode without an eligible config", async () => {
    await expect(
      AdvertisingService.create(ORG, USER, { ...base, campaignMode: "performance", billingMode: "standard" }),
    ).rejects.toThrow(/not eligible/);
    await expect(
      AdvertisingService.create(ORG, USER, { ...base, campaignMode: "performance", billingMode: "performance", performanceBilling: { enabled: true, events: [], payoutMicros: 100, payOnlyVerified: true } }),
    ).rejects.toThrow(/At least one conversion event/);
  });

  it("accepts an eligible performance campaign and starts pending approval", async () => {
    const c = await AdvertisingService.create(ORG, USER, {
      ...base, campaignMode: "performance", billingMode: "performance",
      performanceBilling: { enabled: true, events: ["sale"], payoutMicros: 1_000_000, payOnlyVerified: true },
    });
    expect(c.status).toBe("pending_approval");
    expect(c.verification.status).toBe("pending");
  });

  it("requires proof and only credits verified conversions", async () => {
    const c = await AdvertisingService.create(ORG, USER, {
      ...base, campaignMode: "performance", billingMode: "performance",
      performanceBilling: { enabled: true, events: ["sale"], payoutMicros: 1_000_000, payOnlyVerified: true },
    });
    await expect(
      AdvertisingService.reportConversion(ORG, c.id, USER, { eventType: "sale", valueMicros: 50_000_000 }),
    ).rejects.toThrow(/proof/);

    // Zero-value "sale" is flagged by the value-sanity fraud check.
    const bad = await AdvertisingService.reportConversion(ORG, c.id, USER, { eventType: "sale", valueMicros: 0, proof: "order-x" });
    expect(bad.blocked).toBe(true);
    expect(bad.verificationStatus).toBe("rejected");

    // Approve + activate the performance campaign, then a valid, verifiable
    // conversion is credited (metrics + revenue) because it passes fraud checks.
    await AdvertisingService.approve(ORG, c.id, USER);
    const good = await AdvertisingService.reportConversion(ORG, c.id, USER, { eventType: "sale", valueMicros: 50_000_000, proof: "order-123" });
    expect(good.blocked).toBe(false);
    expect(good.verificationStatus).toBe("verified");
    const after = await AdvertisingService.get(ORG, c.id);
    expect(after!.metrics.conversions).toBe(1);
    expect(after!.metrics.revenueMicros).toBe(50_000_000);
    expect(after!.auditLog.some((a) => a.action === "conversion.verified")).toBe(true);
  });
});

describe("AI generation", () => {
  it("only allows smart/autonomous modes and flags demo source", async () => {
    const std = await AdvertisingService.create(ORG, USER, { ...base, campaignMode: "standard" });
    await expect(AdvertisingService.generate(ORG, std.id, "copy")).rejects.toThrow(/only available for smart or autonomous/);

    const smart = await AdvertisingService.create(ORG, USER, { ...base, campaignMode: "smart" });
    const r = await AdvertisingService.generate(ORG, smart.id, "copy");
    expect(r.aiSource).toBe("demo"); // no real provider configured in tests
    expect(r.mode).toBe("smart");
    const after = await AdvertisingService.get(ORG, smart.id);
    expect(after!.optimizationHistory.length).toBe(1);
  });
});

describe("autonomous cycle", () => {
  it("rejects cycles on non-autonomous or non-active campaigns", async () => {
    const auto = await AdvertisingService.create(ORG, USER, { ...base, campaignMode: "autonomous" });
    // A draft campaign is not active → cycle is rejected.
    await expect(AdvertisingService.autonomousCycle(ORG, auto.id, USER)).rejects.toThrow(/active/);
    // Autonomous campaigns require an approval gate before they can be launched.
    await expect(AdvertisingService.launch(ORG, auto.id, USER)).rejects.toThrow(/approved/);
    // Walk the approval flow: submit → approve → launch.
    const submitted = await AdvertisingService.submitForApproval(ORG, auto.id, USER);
    const approved = await AdvertisingService.approve(ORG, submitted.id, USER);
    await AdvertisingService.launch(ORG, approved.id, USER);
    const r = await AdvertisingService.autonomousCycle(ORG, auto.id, USER);
    expect(r.autonomousActions.length).toBe(1);
    expect(r.auditLog.some((a) => a.action.startsWith("autonomous."))).toBe(true);
  });
});

describe("dashboard", () => {
  it("surfaces mode, automation, billing, health and fraud state", async () => {
    const c = await AdvertisingService.create(ORG, USER, {
      ...base, campaignMode: "performance", billingMode: "performance",
      performanceBilling: { enabled: true, events: ["sale"], payoutMicros: 1_000_000, payOnlyVerified: true },
    });
    const d = await AdvertisingService.dashboard(ORG, c.id);
    expect(d.mode).toBe("performance");
    expect(d.billingMode).toBe("performance");
    expect(d.performanceBillingStatus).toBe("pending");
    expect(d.fraudProtection.enabled).toBe(true);
    expect(d.health).toBe("inactive");
    expect(typeof d.revenueAttribution.roas).toBe("object"); // null while no spend
    expect(d.pacing).toBeDefined();
    expect(d.variants).toEqual([]);
  });
});

describe("metrics ingestion", () => {
  it("accumulates real deltas and audits them", async () => {
    const c = await AdvertisingService.create(ORG, USER, { ...base, campaignMode: "standard" });
    const a = await AdvertisingService.ingestMetrics(ORG, c.id, USER, { impressions: 1000, clicks: 20, spendMicros: 50_000_000, source: "meta-ads" });
    expect(a.metrics.impressions).toBe(1000);
    expect(a.metrics.clicks).toBe(20);
    expect(a.metrics.spendMicros).toBe(50_000_000);
    const b = await AdvertisingService.ingestMetrics(ORG, c.id, USER, { impressions: 500, clicks: 5, spendMicros: 10_000_000 });
    expect(b.metrics.impressions).toBe(1500);
    expect(b.metrics.clicks).toBe(25);
    expect(b.metrics.spendMicros).toBe(60_000_000);
    expect(b.auditLog.some((e) => e.action === "metrics.ingested")).toBe(true);
  });
});

describe("A/B creative variants", () => {
  it("adds variants, records per-variant metrics, and promotes a winner", async () => {
    const c = await AdvertisingService.create(ORG, USER, { ...base, campaignMode: "standard" });
    const variants = await AdvertisingService.addVariant(ORG, c.id, USER, { name: "Headline A", headline: "Big sale" });
    await AdvertisingService.addVariant(ORG, c.id, USER, { name: "Headline B", headline: "Save now" });
    expect(variants.length).toBe(1);

    const a = variants[0]!;
    const rec = await AdvertisingService.recordVariantMetrics(ORG, c.id, a.id, { impressions: 100, clicks: 8, conversions: 2, spendMicros: 5_000_000, revenueMicros: 20_000_000 });
    expect(rec.metrics.clicks).toBe(8);

    const chosen = await AdvertisingService.chooseVariant(ORG, c.id, a.id, USER);
    expect(chosen.creatives[0]).toBe("Headline A");
    expect(chosen.auditLog.some((e) => e.action === "variant.chosen")).toBe(true);
  });

  it("404s when promoting an unknown variant", async () => {
    const c = await AdvertisingService.create(ORG, USER, { ...base, campaignMode: "standard" });
    await expect(AdvertisingService.chooseVariant(ORG, c.id, "var-nope", USER)).rejects.toThrow(/not found/i);
  });
});

describe("portfolio analytics", () => {
  it("aggregates real metrics across org campaigns, org-scoped", async () => {
    await AdvertisingService.create(ORG, USER, { ...base, name: "A", campaignMode: "standard" });
    const b = await AdvertisingService.create(ORG, USER, { ...base, name: "B", campaignMode: "smart", budgetMicros: 2_000_000_000 });
    await AdvertisingService.ingestMetrics(ORG, b.id, USER, { impressions: 500, clicks: 10, spendMicros: 30_000_000, revenueMicros: 60_000_000 });
    await AdvertisingService.create("org-other", USER, { ...base, name: "C", campaignMode: "standard" });

    const p = await AdvertisingService.portfolioAnalytics(ORG);
    expect(p.totalCampaigns).toBe(2);
    expect(p.totalSpendMicros).toBe(30_000_000);
    expect(p.totalRevenueMicros).toBe(60_000_000);
    expect(p.totalImpressions).toBe(500);
    expect(p.roas).toBe(2); // 60m / 30m
    expect(p.byMode.standard.count).toBe(1);
    expect(p.byMode.smart.count).toBe(1);
    expect(p.totalBudgetMicros).toBe(3_000_000_000);
    expect(p.topCampaigns[0]?.name).toBe("B");
  });
});

describe("budget pacing", () => {
  it("computes pacing state from real spend numbers", async () => {
    const c = await AdvertisingService.create(ORG, USER, { ...base, campaignMode: "standard", budgetMicros: 100_000_000, dailyBudgetMicros: 10_000_000, endAt: new Date(Date.now() + 2 * 86_400_000).toISOString() });
    const before = await AdvertisingService.dashboard(ORG, c.id);
    expect(before.pacing.pacing).toBe("under");
    await AdvertisingService.ingestMetrics(ORG, c.id, USER, { spendMicros: 100_000_000 });
    const after = await AdvertisingService.dashboard(ORG, c.id);
    expect(after.pacing.pacing).toBe("over");
    expect(after.pacing.remainingMicros).toBe(0);
    expect(after.pacing.daysLeft).toBe(2);
  });
});

describe("audiences & targeting", () => {
  it("creates, lists, attaches, detaches and deletes audiences org-scoped", async () => {
    const a = await AdvertisingService.createAudience(ORG, USER, { name: "Lagos devs", criteria: { locations: ["Lagos"], interests: ["tech", "AI"] } });
    expect(a.sizeEstimate).toBeGreaterThan(0);
    const c = await AdvertisingService.create(ORG, USER, { ...base, campaignMode: "standard" });

    await AdvertisingService.addAudienceToCampaign(ORG, c.id, a.id, USER);
    const d1 = await AdvertisingService.dashboard(ORG, c.id);
    expect(d1.audiences.length).toBe(1);
    expect(d1.audiences[0]!.name).toBe("Lagos devs");

    await AdvertisingService.removeAudienceFromCampaign(ORG, c.id, a.id, USER);
    const d2 = await AdvertisingService.dashboard(ORG, c.id);
    expect(d2.audiences.length).toBe(0);

    // Org scoping: other org cannot see or attach this audience.
    await expect(AdvertisingService.addAudienceToCampaign("org-other", c.id, a.id, USER)).rejects.toThrow(/not found/i);

    await AdvertisingService.deleteAudience(ORG, a.id, USER);
    expect(await AdvertisingService.listAudiences(ORG)).toEqual([]);
  });

  it("estimates reach as 0 when no locations are given (honest unknown)", async () => {
    const a = await AdvertisingService.createAudience(ORG, USER, { name: "Broad", criteria: {} });
    expect(a.sizeEstimate).toBe(0);
  });
});

describe("performance history (time-series)", () => {
  it("records daily snapshots and updates the same day idempotently", async () => {
    const c = await AdvertisingService.create(ORG, USER, { ...base, campaignMode: "standard" });
    await AdvertisingService.ingestMetrics(ORG, c.id, USER, { impressions: 100, spendMicros: 5_000_000 });
    const s1 = await AdvertisingService.snapshotMetrics(ORG, c.id);
    expect(s1.metrics.impressions).toBe(100);
    await AdvertisingService.ingestMetrics(ORG, c.id, USER, { impressions: 50, spendMicros: 2_000_000 });
    const s2 = await AdvertisingService.snapshotMetrics(ORG, c.id);
    const d = await AdvertisingService.dashboard(ORG, c.id);
    // same day → replaced, not duplicated
    expect(d.history.length).toBe(1);
    expect(d.history[0]!.metrics.impressions).toBe(150);
  });
});

describe("duplicate campaign", () => {
  it("clones settings into a fresh draft with zero metrics/history", async () => {
    const c = await AdvertisingService.create(ORG, USER, { ...base, name: "Original", campaignMode: "autonomous", budgetMicros: 9_000_000 });
    await AdvertisingService.ingestMetrics(ORG, c.id, USER, { impressions: 500, spendMicros: 1_000_000 });
    await AdvertisingService.addVariant(ORG, c.id, USER, { name: "Var A" });

    const dup = await AdvertisingService.duplicateCampaign(ORG, c.id, USER, "My copy");
    expect(dup.name).toBe("My copy");
    expect(dup.id).not.toBe(c.id);
    expect(dup.status).toBe("draft");
    expect(dup.campaignMode).toBe("autonomous");
    expect(dup.budgetMicros).toBe(9_000_000);
    expect(dup.metrics.impressions).toBe(0);
    expect(dup.history).toEqual([]);
    expect(dup.variants.length).toBe(1); // variants copied but reset
    expect(dup.variants[0]!.metrics.impressions).toBe(0);
    expect(dup.auditLog.some((e) => e.action === "campaign.duplicated")).toBe(true);
  });
});
