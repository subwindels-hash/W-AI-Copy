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
  });
});
